import http from 'http';
import dns from 'node:dns';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { Agent, setGlobalDispatcher } from 'undici';
import { resolveVidlinkStream } from '../src/lib/streaming/vidlink-direct.ts';
import { SegmentTransfers } from './segment-transfers.mjs';

try { dns.setServers(['8.8.8.8', '1.1.1.1', '9.9.9.9']); } catch {}

// High-performance Undici HTTP connection pool to avoid socket resets on large 4K chunks
const undiciAgent = new Agent({
  keepAliveTimeout: 30000,
  keepAliveMaxTimeout: 60000,
  pipelining: 1,
  connections: 64,
});
setGlobalDispatcher(undiciAgent);

const PORT = Number(process.env.ERASMUS_RELAY_PORT || 8443);
const DEFAULT_REFERER = 'https://cinejoy.to/';
const MAX_CACHE_CHUNKS = 15;
const MAX_CACHE_BYTES = 96 * 1024 * 1024;
const MAX_SEGMENT_BYTES = 32 * 1024 * 1024;
const MAX_PREFETCHES = 4;
const LOOKAHEAD_SEGMENTS = 3;
let cacheBytes = 0;
function storeChunk(url, entry) {
  if (entry.buffer.length > MAX_SEGMENT_BYTES) return;
  const old = chunkCache.get(url);
  if (old) { cacheBytes -= old.buffer.length; chunkCache.delete(url); }
  while (chunkCache.size >= MAX_CACHE_CHUNKS || cacheBytes + entry.buffer.length > MAX_CACHE_BYTES) {
    const first = chunkCache.keys().next().value;
    if (!first) break;
    cacheBytes -= chunkCache.get(first).buffer.length;
    chunkCache.delete(first);
  }
  chunkCache.set(url, entry);
  cacheBytes += entry.buffer.length;
}

// In-memory lookahead pipeline
const segmentGraph = new Map(); // currentSegUrl -> { next: nextSegUrl, referer }
const playlistFamilies = new Map();
const chunkCache = new Map(); // segUrl -> { status, headers, buffer }
let cacheHits = 0;
let cacheMisses = 0;
const serverStartTime = Date.now();
const resolverCache = new Map();
const playlistCache = new Map();
let playlistBytes = 0;
function storePlaylist(key, text) {
  // Only immutable VOD media and master playlists. Live media must refresh.
  if (!text.includes('#EXT-X-ENDLIST') && !text.includes('#EXT-X-STREAM-INF:')) return;
  const bytes = Buffer.byteLength(text);
  if (bytes > 1024 * 1024) return;
  const old = playlistCache.get(key);
  if (old) { playlistBytes -= old.bytes; playlistCache.delete(key); }
  while (playlistCache.size >= 64 || playlistBytes + bytes > 8 * 1024 * 1024) {
    const first = playlistCache.keys().next().value;
    if (!first) break;
    playlistBytes -= playlistCache.get(first).bytes;
    playlistCache.delete(first);
  }
  playlistCache.set(key, { text, bytes, expires: Date.now() + 45_000 });
  playlistBytes += bytes;
}
function cacheResolution(key, result) {
  if (resolverCache.size >= 100) resolverCache.delete(resolverCache.keys().next().value);
  resolverCache.set(key, { result, expires: Date.now() + 90_000 });
}

let resolveVidfastDirectStream = null;
try {
  const vidfastModule = await import('../src/lib/streaming/vidfast-direct.ts');
  resolveVidfastDirectStream = vidfastModule.resolveVidfastDirectStream;
} catch (err) {
  console.warn('[Relay] Direct import of vidfast-direct.ts unavailable:', err.message);
}

function refererFor(requested) {
  if (requested) {
    try {
      const parsed = new URL(requested);
      return { referer: `${parsed.origin}/`, origin: parsed.origin };
    } catch {}
  }
  return { referer: DEFAULT_REFERER, origin: 'https://cinejoy.to' };
}

function proxied(relayBase, absolute, referer, session) {
  const query = new URLSearchParams({ url: absolute });
  if (referer) query.set('referer', referer);
  if (session) query.set('session', session);
  return `${relayBase}?${query.toString()}`;
}

function isSrtText(text) {
  const trimmed = text.trimStart().replace(/^\uFEFF/, '');
  if (trimmed.startsWith('WEBVTT')) return false;
  return /^\d+\s*\r?\n\d{2}:\d{2}:\d{2}[,.]/.test(trimmed);
}

function srtToVtt(text) {
  const body = text
    .replace(/^\uFEFF/, '')
    .replace(/\r/g, '')
    .trim();
  const stamped = body.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  if (stamped.startsWith('WEBVTT')) return stamped;
  return `WEBVTT\n\n${stamped}\n`;
}

function enrichAudioTracks(text) {
  const lines = text.split('\n');
  const audioIndices = [];
  lines.forEach((l, idx) => {
    if (l.trim().startsWith('#EXT-X-MEDIA:') && l.includes('TYPE=AUDIO')) {
      audioIndices.push(idx);
    }
  });

  if (audioIndices.length <= 1) return text;

  let hasExplicitEnglish = false;
  let englishLineIdx = -1;

  audioIndices.forEach((idx) => {
    const l = lines[idx] ?? '';
    if (
      /LANGUAGE="?(en|eng|english)"?/i.test(l) ||
      /NAME="?[^"]*(english|\beng\b)[^"]*"/i.test(l)
    ) {
      hasExplicitEnglish = true;
      englishLineIdx = idx;
    }
  });

  const targetEnglishIdx = hasExplicitEnglish ? englishLineIdx : audioIndices[1];

  audioIndices.forEach((idx) => {
    let l = lines[idx] ?? '';
    if (idx === targetEnglishIdx) {
      l = l.replace(/DEFAULT=(YES|NO)/i, 'DEFAULT=YES');
      l = l.replace(/AUTOSELECT=(YES|NO)/i, 'AUTOSELECT=YES');
      if (!/LANGUAGE="[^"]+"/i.test(l)) {
        l = l.replace(/NAME="([^"]+)"/i, 'NAME="English ($1)",LANGUAGE="en"');
      }
    } else {
      l = l.replace(/DEFAULT=(YES|NO)/i, 'DEFAULT=NO');
    }
    lines[idx] = l;
  });

  return lines.join('\n');
}

function healTopDomain(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return urlStr;
  return urlStr.replace(
    /https?:\/\/(?:[a-z0-9_-]+\.)*(?!stillhaven\b)[a-z0-9_-]+\.top(?::\d+)?/gi,
    'https://sun.stillhaven.top'
  );
}

function rewritePlaylist(text, baseUrl, relayBase, referer, session) {
  const healedText = healTopDomain(text);
  const enriched = enrichAudioTracks(healedText);
  const lines = enriched.split('\n');
  const segmentUrls = [];

  const rewritten = lines
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith('#')) {
        return trimmed.replace(/URI="([^"]+)"/gi, (_, uri) => {
          const absolute = new URL(uri, baseUrl).href;
          const healedAbsolute = healTopDomain(absolute);
          if (trimmed.startsWith('#EXT-X-MEDIA:') && trimmed.includes('TYPE=AUDIO')) {
            playlistFamilies.set(healedAbsolute, `${baseUrl}:audio`);
          }
          return `URI="${proxied(relayBase, healedAbsolute, referer, session)}"`;
        });
      }
      const absolute = new URL(trimmed, baseUrl).href;
      const healedAbsolute = healTopDomain(absolute);
      segmentUrls.push(healedAbsolute);
      if (text.includes('#EXT-X-STREAM-INF:')) playlistFamilies.set(healedAbsolute, `${baseUrl}:video`);
      return proxied(relayBase, healedAbsolute, referer, session);
    })
    .join('\n');

  // Build lookahead graph for prefetching sequential media segments
  // Byte-range playlists must keep their original Range-based request path.
  if (segmentUrls.length > 0 && !text.includes('#EXT-X-STREAM-INF') && !text.includes('#EXT-X-BYTERANGE:')) {
    for (let i = 0; i < segmentUrls.length; i++) {
      const cur = segmentUrls[i];
      const next = segmentUrls[i + 1] || null;
      segmentGraph.set(cur, { next, referer, playlist: baseUrl, family: playlistFamilies.get(baseUrl) || baseUrl, index: i });
    }
  }
  while (playlistFamilies.size > 512) playlistFamilies.delete(playlistFamilies.keys().next().value);
  while (segmentGraph.size > 40_000) segmentGraph.delete(segmentGraph.keys().next().value);

  return rewritten;
}

function triggerPrefetch(currentUrl, session, start = true) {
  const current = segmentGraph.get(currentUrl);
  if (!current) return;
  const nextSegments = [];
  for (let distance = 0; distance < LOOKAHEAD_SEGMENTS; distance++) {
    const node = segmentGraph.get(currentUrl);
    if (!node?.next) break;
    nextSegments.push({ url: node.next, referer: node.referer });
    currentUrl = node.next;
  }

  segmentTransfers.setWindow(`${session}:${current.family}`, nextSegments);
  if (start) for (const segment of nextSegments) {
    if (!chunkCache.has(segment.url)) segmentTransfers.prefetch(segment.url, segment.referer);
  }
}

function mediaHeaders(upstream, url) {
  const contentType = upstream.headers.get('content-type') || '';
  const path = new URL(url).pathname.toLowerCase();
  const ts = segmentGraph.has(url) || contentType.startsWith('image/') || /\.(jpg|png|ts)$/.test(path);
  const headers = {
    'Content-Type': ts ? 'video/mp2t' : (contentType || 'video/mp4'),
    'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=86400',
  };
  if (upstream.headers.get('content-range')) headers['Content-Range'] = upstream.headers.get('content-range');
  if (!upstream.headers.get('content-encoding') && upstream.headers.get('content-length')) {
    headers['Content-Length'] = upstream.headers.get('content-length');
  }
  return headers;
}

async function fetchMedia(url, options, signal) {
  const headerController = new AbortController();
  const timeout = setTimeout(() => headerController.abort(new Error('Upstream headers timed out')), 30000);
  try {
    return await fetch(url, { ...options, signal: AbortSignal.any([signal, headerController.signal]) });
  } finally { clearTimeout(timeout); }
}

const segmentTransfers = new SegmentTransfers({
  maxBytes: MAX_SEGMENT_BYTES, maxPrefetches: MAX_PREFETCHES,
  fetchSegment: (url, requestedReferer, signal) => {
    const { referer, origin } = refererFor(requestedReferer);
    const headers = url.toLowerCase().includes('hakunaymatata')
      ? { 'User-Agent': 'ExoPlayer/1.5.1 (Linux; Android TV)' }
      : { Referer: referer, Origin: origin, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' };
    return fetchMedia(url, { headers, redirect: 'follow' }, signal);
  },
  onComplete: (url, _referer, upstream, buffer) => storeChunk(url, { status: upstream.status, headers: mediaHeaders(upstream, url), buffer }),
});

const server = http.createServer(async (req, res) => {
  // Enable full CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, X-Relay-Cache, X-Relay-Preloaded');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost:8443'}`);
  const targetRaw = reqUrl.searchParams.get('url');

  // Route 1: Health / Status check (only when no url query is present)
  if (reqUrl.pathname === '/health' || reqUrl.pathname === '/status' || (reqUrl.pathname === '/' && !targetRaw)) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      service: 'Erasmus High-Speed Video Relay',
      port: PORT,
      uptimeSeconds: Math.floor((Date.now() - serverStartTime) / 1000),
      cache: {
        activeChunks: chunkCache.size,
        bytes: cacheBytes,
        maxBytes: MAX_CACHE_BYTES,
        cacheHits,
        cacheMisses,
        ratio: (cacheHits + cacheMisses) > 0 ? (cacheHits / (cacheHits + cacheMisses)).toFixed(2) : '0.00',
      },
      prefetchesInFlight: segmentTransfers.speculativeCount,
      cancelledPrefetches: segmentTransfers.cancelled,
      lookaheadSegments: LOOKAHEAD_SEGMENTS,
      delivery: segmentTransfers.status(),
    }));
    return;
  }

  // Route 2: Direct stream resolution (natively uses local residential IP)
  if (reqUrl.pathname === '/api/stream/direct' || reqUrl.pathname === '/resolve-direct') {
    const started = Date.now();
    const type = reqUrl.searchParams.get('type') === 'tv' ? 'tv' : 'movie';
    const tmdbId = reqUrl.searchParams.get('id') || reqUrl.searchParams.get('tmdbId') || '';
    const season = Number(reqUrl.searchParams.get('season') || 1);
    const episode = Number(reqUrl.searchParams.get('episode') || 1);
    const serverId = reqUrl.searchParams.get('server') || 'lisbon';
    const resolutionKey = JSON.stringify([type, tmdbId, season, episode, serverId]);
    const cachedResolution = resolverCache.get(resolutionKey);
    if (cachedResolution && cachedResolution.expires > Date.now()) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(cachedResolution.result));
      return;
    }

    if (resolveVidfastDirectStream && tmdbId) {
      try {
        const vidfastRes = await resolveVidfastDirectStream({ type, tmdbId, season, episode, serverId });
        // Apply the same Lisbon quality floor as the local Next.js resolver.
        // The residential bridge must not return the low-resolution Cobra source
        // before the existing 1080p upgrade has been considered.
        const lowResolution = vidfastRes.hit && !vidfastRes.hit.is4K &&
          ['bravo', 'cobra', 'horizon'].includes(vidfastRes.hit.serverName.toLowerCase());
        if (serverId === 'lisbon' && (!vidfastRes.hit || lowResolution)) {
          const upgrade = await resolveVidlinkStream({ type, tmdbId, season, episode, serverName: 'Lisbon' });
          if (upgrade?.url) {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
            const result = {
              ok: true,
              referer: upgrade.referer,
              captions: upgrade.captions,
              servers: [{ ...upgrade, name: 'Lisbon', ms: Date.now() - started }],
            };
            cacheResolution(resolutionKey, result);
            res.end(JSON.stringify(result));
            return;
          }
        }
        if (vidfastRes.hit?.url) {
          const result = {
            ok: true,
            referer: vidfastRes.hit.referer,
            servers: [{
              name: vidfastRes.hit.serverName,
              url: vidfastRes.hit.url,
              kind: vidfastRes.hit.kind,
              is4K: vidfastRes.hit.is4K,
              hdUrl: vidfastRes.hit.hdUrl,
              fourKUrl: vidfastRes.hit.fourKUrl,
              isDirectCors: false,
              ms: Date.now() - started,
            }]
          };
          cacheResolution(resolutionKey, result);
          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify(result));
          return;
        }
      } catch (err) {
        console.warn('[Relay] Native resolver error:', err);
      }
    }

    // Secondary fallback: proxy to localhost:3000 if Next.js dev server is running
    try {
      const localDirectUrl = `http://localhost:3000/api/stream/direct${reqUrl.search}`;
      const localRes = await fetch(localDirectUrl, { signal: AbortSignal.timeout(12000) });
      const localData = await localRes.text();
      res.writeHead(localRes.status, { 'Content-Type': 'application/json' });
      res.end(localData);
      return;
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Local direct resolver unavailable', details: err.message }));
      return;
    }
  }

  if (!targetRaw) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'missing url' }));
    return;
  }

  const healedTargetRaw = healTopDomain(targetRaw);

  let target;
  try {
    target = new URL(healedTargetRaw);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'invalid url' }));
    return;
  }

  const range = req.headers['range'];
  const requestedSession = reqUrl.searchParams.get('session');
  const session = requestedSession && /^[a-zA-Z0-9_-]{16,64}$/.test(requestedSession) ? requestedSession : randomUUID();
  // Install before fetching headers: seeks can abandon a slow upstream before
  // its first byte. Response close fires for normal completion too.
  const requestController = new AbortController();
  res.once('close', () => {
    if (!res.writableFinished) requestController.abort(new Error('Viewer disconnected'));
  });
  const requestSignal = requestController.signal;
  const cachedChunk = !range && chunkCache.get(target.href);

  if (cachedChunk) {
    cacheHits++;
    const headers = { ...cachedChunk.headers, 'X-Relay-Cache': 'HIT' };
    res.writeHead(cachedChunk.status, headers);
    res.end(req.method === 'HEAD' ? undefined : cachedChunk.buffer);
    if (req.method !== 'HEAD') triggerPrefetch(target.href, session);
    return;
  }
  const isHakuna = target.hostname.toLowerCase().includes('hakunaymatata');
  const { referer, origin } = refererFor(reqUrl.searchParams.get('referer'));
  if (!range && req.method !== 'HEAD' && segmentGraph.has(target.href)) {
    let transfer;
    try {
      transfer = segmentTransfers.acquire(target.href, referer, requestSignal);
      // Withdraw obsolete lookahead immediately; start new speculation after
      // the demanded upstream has obtained its connection and headers.
      triggerPrefetch(target.href, session, false);
      const upstream = await transfer.ready();
      if (transfer.shared) cacheHits++;
      else cacheMisses++;
      res.writeHead(upstream.status, {
        ...mediaHeaders(upstream, target.href),
        'X-Relay-Cache': transfer.shared ? 'SHARED' : 'MISS',
      });
      triggerPrefetch(target.href, session);
      await pipeline(Readable.from(transfer.chunks()), res, { signal: requestSignal });
    } catch (error) {
      if (!res.headersSent && !res.destroyed) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'upstream segment unavailable', details: error.message }));
      } else res.destroy();
    } finally { transfer?.release(); }
    return;
  }
  cacheMisses++;
  const playlistKey = JSON.stringify([target.href, referer]);
  const preparedPlaylist = !range && req.method !== 'HEAD' && playlistCache.get(playlistKey);
  if (preparedPlaylist && preparedPlaylist.expires > Date.now()) {
    // Rewrite for this request's host so local and tunnel URLs never mix.
    const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
    const local = host.includes('localhost') || host.includes('127.0.0.1');
    const proto = req.headers['x-forwarded-proto'] || (local ? 'http' : 'https');
    res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Relay-Playlist-Cache': 'HIT' });
    res.end(rewritePlaylist(preparedPlaylist.text, target.href, `${proto}://${host}`, referer, session));
    return;
  }

  const upstreamHeaders = isHakuna
    ? {
        'User-Agent': 'ExoPlayer/1.5.1 (Linux; Android TV)',
      }
    : {
        Referer: referer,
        Origin: origin,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      };

  if (range) upstreamHeaders['Range'] = range;

  try {
    const upstream = await fetchMedia(target.href, {
      headers: upstreamHeaders,
      redirect: 'follow',
      method: req.method === 'HEAD' ? 'HEAD' : 'GET',
    }, requestSignal);

    if (!upstream.ok && upstream.status !== 206) {
      await upstream.body?.cancel();
      res.writeHead(upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502, {
        'Content-Type': 'application/json',
      });
      res.end(JSON.stringify({ error: `upstream error ${upstream.status}`, statusText: upstream.statusText }));
      return;
    }

    const contentType = upstream.headers.get('content-type') || '';
    const path = target.pathname.toLowerCase();
    const looksPlaylist =
      contentType.includes('mpegurl') ||
      contentType.includes('m3u8') ||
      path.endsWith('.m3u8');
    const looksVtt = contentType.includes('vtt') || path.endsWith('.vtt');

    const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
    const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
    const proto = req.headers['x-forwarded-proto'] || (isLocal ? 'http' : 'https');
    const relayBase = `${proto}://${host}`;

    // 1. Playlists (.m3u8): enrich audio, rewrite child URLs, and build lookahead segment graph
    if (looksPlaylist) {
      const text = await upstream.text();
      if (!text.includes('#EXTM3U')) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'upstream returned invalid non-HLS playlist content' }));
        return;
      }
      const rewritten = rewritePlaylist(text, target.href, relayBase, referer, session);
      storePlaylist(playlistKey, text);
      res.writeHead(200, {
        'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Relay-Playlist-Cache': 'MISS',
      });
      res.end(rewritten);
      return;
    }

    // 2. Subtitles (.vtt / .srt)
    if (looksVtt || path.endsWith('.srt')) {
      const rawSub = await upstream.text();
      const body = isSrtText(rawSub) ? srtToVtt(rawSub) : rawSub;
      res.writeHead(200, {
        'Content-Type': 'text/vtt; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      });
      res.end(body);
      return;
    }

    // 3. Video media segments & MP4 streams
    const isDisguisedTs =
      segmentGraph.has(target.href) ||
      contentType.startsWith('image/') ||
      path.endsWith('.jpg') ||
      path.endsWith('.png') ||
      path.endsWith('.ts');

    const passHeaders = {
      'Content-Type': isDisguisedTs ? 'video/mp2t' : (contentType || 'video/mp4'),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=86400',
      'X-Relay-Cache': 'MISS',
    };
    if (upstream.headers.get('content-range')) passHeaders['Content-Range'] = upstream.headers.get('content-range');
    // fetch decompresses bodies; the upstream length describes the compressed
    // representation and would truncate decoded data through the HTTPS tunnel.
    if (!upstream.headers.get('content-encoding') && upstream.headers.get('content-length')) {
      passHeaders['Content-Length'] = upstream.headers.get('content-length');
    }

    res.writeHead(upstream.status, passHeaders);

    const reader = upstream.body?.getReader();
    if (!reader) {
      if (!res.writableEnded) res.end();
      return;
    }

    let aborted = false;
    res.on('close', () => {
      if (res.writableFinished) return;
      aborted = true;
      void reader.cancel().catch(() => {});
    });

    try {
      while (!aborted) {
        const { done, value } = await reader.read();
        if (done || aborted) break;
        if (!res.writableEnded && !res.destroyed) {
          if (!res.write(value)) await once(res, 'drain', { signal: AbortSignal.any([requestSignal, AbortSignal.timeout(30000)]) });
        }
      }
      if (!aborted && !res.writableEnded) {
        res.end();
      }
    } catch {
      void reader.cancel().catch(() => {});
      try { res.destroy(); } catch {}
    }
  } catch (err) {
    if (!res.headersSent) {
      try {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'upstream error', details: err.message }));
      } catch {}
    } else {
      try { res.destroy(); } catch {}
    }
  }
});

server.on('error', (err) => {
  console.error('[Relay] Server error:', err.message);
});

process.on('uncaughtException', (err) => {
  console.error('[Relay] Uncaught exception:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Relay] Unhandled rejection:', reason);
});

server.listen(PORT, '0.0.0.0', () => {
  console.warn(`[Relay] Server running on port ${PORT} with lookahead buffer caching`);
});

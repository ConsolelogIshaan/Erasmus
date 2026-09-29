import http from 'http';
import dns from 'node:dns';
import { Agent, setGlobalDispatcher } from 'undici';

try { dns.setServers(['8.8.8.8', '1.1.1.1', '9.9.9.9']); } catch {}

// High-performance Undici HTTP connection pool to avoid socket resets on large 4K chunks
const undiciAgent = new Agent({
  keepAliveTimeout: 30000,
  keepAliveMaxTimeout: 60000,
  pipelining: 1,
  connections: 64,
});
setGlobalDispatcher(undiciAgent);

const PORT = 8443;
const DEFAULT_REFERER = 'https://cinejoy.to/';
const MAX_CACHE_CHUNKS = 15; // Hold ~180MB of active high-bitrate video in RAM for instant 0ms lookahead delivery

// In-memory lookahead pipeline
const segmentGraph = new Map(); // currentSegUrl -> { next: nextSegUrl, referer }
const chunkCache = new Map(); // segUrl -> { status, headers, buffer }
const inFlightPrefetches = new Set();
let cacheHits = 0;
let cacheMisses = 0;
const serverStartTime = Date.now();

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

function proxied(relayBase, absolute, referer) {
  const query = new URLSearchParams({ url: absolute });
  if (referer) query.set('referer', referer);
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

function rewritePlaylist(text, baseUrl, relayBase, referer) {
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
          return `URI="${proxied(relayBase, healedAbsolute, referer)}"`;
        });
      }
      const absolute = new URL(trimmed, baseUrl).href;
      const healedAbsolute = healTopDomain(absolute);
      segmentUrls.push(healedAbsolute);
      return proxied(relayBase, healedAbsolute, referer);
    })
    .join('\n');

  // Build lookahead graph for prefetching sequential media segments
  if (segmentUrls.length > 1) {
    for (let i = 0; i < segmentUrls.length; i++) {
      const cur = segmentUrls[i];
      const next = segmentUrls[i + 1] || null;
      if (next) {
        segmentGraph.set(cur, { next, referer });
      }
    }
  }

  return rewritten;
}

const inFlightPromises = new Map();

function triggerPrefetch(currentUrl) {
  const node = segmentGraph.get(currentUrl);
  if (!node || !node.next) return;
  const nextUrl = node.next;
  if (chunkCache.has(nextUrl) || inFlightPromises.has(nextUrl)) return;

  const promise = (async () => {
    try {
      const { referer, origin } = refererFor(node.referer);
      const isHakuna = nextUrl.toLowerCase().includes('hakunaymatata');
      const headers = isHakuna
        ? { 'User-Agent': 'ExoPlayer/1.5.1 (Linux; Android TV)' }
        : {
            Referer: referer,
            Origin: origin,
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          };
      const upstream = await fetch(nextUrl, { headers, redirect: 'follow' });
      if (upstream.ok || upstream.status === 206) {
        const contentType = upstream.headers.get('content-type') || '';
        const parsedPath = new URL(nextUrl).pathname.toLowerCase();
        const isDisguisedTs =
          contentType.startsWith('image/') ||
          parsedPath.endsWith('.jpg') ||
          parsedPath.endsWith('.png') ||
          parsedPath.endsWith('.ts');

        const passHeaders = {
          'Content-Type': isDisguisedTs ? 'video/mp2t' : (contentType || 'video/mp4'),
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=86400',
          'X-Relay-Preloaded': 'true',
        };

        const buf = Buffer.from(await upstream.arrayBuffer());
        if (chunkCache.size >= MAX_CACHE_CHUNKS) {
          const firstKey = chunkCache.keys().next().value;
          if (firstKey) chunkCache.delete(firstKey);
        }
        const entry = { status: upstream.status, headers: passHeaders, buffer: buf };
        chunkCache.set(nextUrl, entry);
        return entry;
      }
    } catch {}
    finally {
      inFlightPromises.delete(nextUrl);
    }
    return null;
  })();

  inFlightPromises.set(nextUrl, promise);
}

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
        cacheHits,
        cacheMisses,
        ratio: (cacheHits + cacheMisses) > 0 ? (cacheHits / (cacheHits + cacheMisses)).toFixed(2) : '0.00',
      },
      prefetchesInFlight: inFlightPrefetches.size,
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

    if (resolveVidfastDirectStream && tmdbId) {
      try {
        const vidfastRes = await resolveVidfastDirectStream({ type, tmdbId, season, episode, serverId });
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
          res.writeHead(200, { 'Content-Type': 'application/json' });
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

  // Check in-memory chunk cache or await in-flight prefetch for instant RAM delivery
  let cachedChunk = chunkCache.get(target.href);
  if (!cachedChunk && inFlightPromises.has(target.href)) {
    cachedChunk = await inFlightPromises.get(target.href);
  }

  if (cachedChunk) {
    cacheHits++;
    const headers = { ...cachedChunk.headers, 'X-Relay-Cache': 'HIT' };
    res.writeHead(cachedChunk.status, headers);
    res.end(cachedChunk.buffer);
    triggerPrefetch(target.href);
    return;
  }
  cacheMisses++;

  const isHakuna = target.hostname.toLowerCase().includes('hakunaymatata');
  const { referer, origin } = refererFor(reqUrl.searchParams.get('referer'));
  const range = req.headers['range'];

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
    const upstream = await fetch(target.href, {
      headers: upstreamHeaders,
      redirect: 'follow',
    });

    if (!upstream.ok && upstream.status !== 206) {
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
      const rewritten = rewritePlaylist(text, target.href, relayBase, referer);
      res.writeHead(200, {
        'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
        'Cache-Control': 'no-cache',
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
    if (upstream.headers.get('content-length')) passHeaders['Content-Length'] = upstream.headers.get('content-length');

    res.writeHead(upstream.status, passHeaders);

    const reader = upstream.body?.getReader();
    if (!reader) {
      if (!res.writableEnded) res.end();
      return;
    }

    let aborted = false;
    req.on('close', () => {
      aborted = true;
      try { reader.cancel(); } catch {}
    });

    const collectedChunks = [];

    try {
      while (!aborted) {
        const { done, value } = await reader.read();
        if (done || aborted) break;
        if (!res.writableEnded && !res.destroyed) {
          res.write(value);
        }
        collectedChunks.push(value);
      }
      if (!aborted && !res.writableEnded) {
        res.end();
      }

      // If segment completed without abort, save to cache and trigger prefetch for next
      if (!aborted && collectedChunks.length > 0) {
        const fullBuf = Buffer.concat(collectedChunks);
        if (chunkCache.size >= MAX_CACHE_CHUNKS) {
          const firstKey = chunkCache.keys().next().value;
          if (firstKey) chunkCache.delete(firstKey);
        }
        chunkCache.set(target.href, { status: upstream.status, headers: passHeaders, buffer: fullBuf });
        triggerPrefetch(target.href);
      }
    } catch {
      try { reader.cancel(); } catch {}
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

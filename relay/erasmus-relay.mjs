import http from 'http';
import dns from 'node:dns';
try { dns.setServers(['8.8.8.8', '1.1.1.1', '9.9.9.9']); } catch {}

const PORT = 8443;
const DEFAULT_REFERER = 'https://cinejoy.to/';

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

function rewritePlaylist(text, baseUrl, relayBase, referer) {
  const enriched = enrichAudioTracks(text);
  return enriched
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith('#')) {
        return trimmed.replace(/URI="([^"]+)"/gi, (_, uri) => {
          const absolute = new URL(uri, baseUrl).href;
          return `URI="${proxied(relayBase, absolute, referer)}"`;
        });
      }
      const absolute = new URL(trimmed, baseUrl).href;
      return proxied(relayBase, absolute, referer);
    })
    .join('\n');
}

const server = http.createServer(async (req, res) => {
  // Enable full CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost:8443'}`);

  const targetRaw = reqUrl.searchParams.get('url');

  // Route 1: Health check (only when no url query is present)
  if (reqUrl.pathname === '/health' || reqUrl.pathname === '/status' || (reqUrl.pathname === '/' && !targetRaw)) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'Erasmus High-Speed Video Relay', port: PORT }));
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
      const localRes = await fetch(localDirectUrl, { signal: AbortSignal.timeout(4000) });
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

  let target;
  try {
    target = new URL(targetRaw);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'invalid url' }));
    return;
  }

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

    const contentType = upstream.headers.get('content-type') || '';
    const path = target.pathname.toLowerCase();
    const looksPlaylist =
      contentType.includes('mpegurl') ||
      contentType.includes('m3u8') ||
      path.endsWith('.m3u8');
    const looksVtt = contentType.includes('vtt') || path.endsWith('.vtt');

    // Retain caller's host: preserves localhost for local playback, or trycloudflare for tunnel playback
    const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
    const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
    const proto = req.headers['x-forwarded-proto'] || (isLocal ? 'http' : 'https');
    const relayBase = `${proto}://${host}`;

    // 1. Playlists (.m3u8): enrich audio and rewrite child URLs to this same relay host
    if (looksPlaylist) {
      const text = await upstream.text();
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
    const isDisguisedTs = contentType.startsWith('image/') || path.endsWith('.jpg') || path.endsWith('.png') || path.endsWith('.ts');
    const passHeaders = {
      'Content-Type': isDisguisedTs ? 'video/mp2t' : (contentType || 'video/mp4'),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=86400',
    };
    if (upstream.headers.get('content-range')) passHeaders['Content-Range'] = upstream.headers.get('content-range');
    if (upstream.headers.get('content-length')) passHeaders['Content-Length'] = upstream.headers.get('content-length');

    res.writeHead(upstream.status, passHeaders);

    const reader = upstream.body.getReader();
    let aborted = false;
    req.on('close', () => {
      aborted = true;
      try { reader.cancel(); } catch {}
    });
    while (!aborted) {
      const { done, value } = await reader.read();
      if (done || aborted) break;
      res.write(value);
    }
    if (!aborted) res.end();
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'upstream error', details: err.message }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.warn(`[Relay] Server running on port ${PORT}`);
});

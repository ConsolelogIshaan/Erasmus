import http from 'http';
import dns from 'node:dns';
try { dns.setServers(['8.8.8.8', '1.1.1.1', '9.9.9.9']); } catch {}

const PORT = 8443;
const DEFAULT_REFERER = 'https://cinejoy.to/';

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
  return `${relayBase}/api/stream/hls?${query.toString()}`;
}

function isDirectCdnSegment(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    const pathname = url.pathname.toLowerCase();

    // Playlists (.m3u8) must always pass through relay to enrich audio and rewrite child paths
    const isPlaylist = pathname.endsWith('.m3u8') || pathname.includes('/playlist');
    if (isPlaylist) return false;

    const isMediaChunk =
      pathname.endsWith('.ts') ||
      pathname.endsWith('.m4s') ||
      pathname.endsWith('.mp4') ||
      pathname.endsWith('.html') ||
      pathname.includes('video_') ||
      pathname.includes('audio_') ||
      pathname.includes('/seg-') ||
      pathname.includes('/init-');

    if (!isMediaChunk) return false;

    // CDNs with verified open CORS (*) and zero referer locks:
    // Browser can download segments directly with 0 relay bandwidth consumption
    if (
      host.includes('solarpanelcleaning') ||
      host.includes('shegu.st') ||
      host.includes('keenanchor.top') ||
      host.includes('rousav.tech') ||
      host.includes('gaiaflix.live') ||
      host.includes('acdn28.com') ||
      host.includes('acdn29.com') ||
      host.includes('bxcnm.com') ||
      host.includes('bxcnv.com') ||
      host.includes('bxncw.com') ||
      host.includes('wnowe.com') ||
      host.includes('cloudflare') ||
      host.includes('cloudfront') ||
      host.includes('fastly') ||
      host.includes('akamai')
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

function rewritePlaylist(text, baseUrl, relayBase, referer) {
  return text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith('#')) {
        return trimmed.replace(/URI="([^"]+)"/gi, (_, uri) => {
          const absolute = new URL(uri, baseUrl).href;
          if (isDirectCdnSegment(absolute)) {
            return `URI="${absolute}"`;
          }
          return `URI="${proxied(relayBase, absolute, referer)}"`;
        });
      }
      const absolute = new URL(trimmed, baseUrl).href;
      if (isDirectCdnSegment(absolute)) {
        return absolute;
      }
      return proxied(relayBase, absolute, referer);
    })
    .join('\n');
}

const server = http.createServer(async (req, res) => {
  // Enable full CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const targetRaw = reqUrl.searchParams.get('url');

  if (!targetRaw) {
    if (reqUrl.pathname === '/' || reqUrl.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'Erasmus High-Speed Video Relay' }));
      return;
    }
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

    const proto = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const relayBase = `${proto}://${host}`;

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

    // Video media segments & MP4 streams
    const passHeaders = {
      'Content-Type': contentType || 'video/mp4',
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

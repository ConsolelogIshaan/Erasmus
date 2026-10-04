import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

test('real relay preserves sessions, shared bytes, abandoned-header cancellation, HEAD and MP4 ranges', { timeout: 15000 }, async (t) => {
  const body = Buffer.alloc(188 * 100, 0x47);
  const requests = [];
  let sawHeld;
  const heldSeen = new Promise((resolve) => { sawHeld = resolve; });
  let heldClosed;
  const heldClose = new Promise((resolve) => { heldClosed = resolve; });
  let endShared;
  const sharedTail = new Promise((resolve) => { endShared = resolve; });
  const upstream = http.createServer(async (req, res) => {
    requests.push([req.url, req.method, req.headers.range]);
    if (req.url === '/master.m3u8') {
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.end('#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME="English",URI="audio.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=1280x720\nvideo.m3u8');
    } else if (req.url === '/video.m3u8' || req.url === '/audio.m3u8') {
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.end('#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nshared.ts\n#EXTINF:6,\nsecond.ts\n#EXTINF:6,\nthird.ts\n#EXTINF:6,\nheld.ts\n#EXT-X-ENDLIST');
    } else if (req.url === '/held.ts') {
      sawHeld();
      res.once('close', heldClosed);
    } else if (req.url === '/shared.ts') {
      res.setHeader('Content-Length', body.length);
      res.write(body.subarray(0, 188));
      await sharedTail;
      if (!res.destroyed) res.end(body.subarray(188));
    } else if (req.url === '/movie.mp4') {
      res.setHeader('Content-Type', 'video/mp4');
      if (req.headers.range) {
        const [, start, end] = req.headers.range.match(/bytes=(\d+)-(\d+)/);
        const first = Number(start), last = Number(end);
        res.writeHead(206, { 'Content-Range': `bytes ${first}-${last}/${body.length}`, 'Content-Length': last - first + 1 });
        res.end(body.subarray(first, last + 1));
      } else {
        res.setHeader('Content-Length', body.length);
        res.end(body);
      }
    } else res.end(body);
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const origin = `http://127.0.0.1:${upstream.address().port}`;
  const portProbe = http.createServer();
  portProbe.listen(0, '127.0.0.1');
  await once(portProbe, 'listening');
  const relayPort = portProbe.address().port;
  await new Promise((resolve) => portProbe.close(resolve));
  const child = spawn(process.execPath, ['relay/erasmus-relay.mjs'], {
    cwd: new URL('..', import.meta.url), env: { ...process.env, ERASMUS_RELAY_PORT: String(relayPort) },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  let logs = '';
  child.stderr.on('data', (chunk) => { logs += chunk; });
  t.after(() => {
    child.kill();
    upstream.closeAllConnections();
    upstream.close();
  });
  const relay = `http://localhost:${relayPort}`;
  let online = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (child.exitCode !== null) throw new Error(`Fixture relay exited: ${logs}`);
    try { online = (await fetch(`${relay}/health`)).ok; } catch {}
    if (online) break;
    await delay(100);
  }
  assert.equal(online, true, logs);
  const wrap = (path, session) => `${relay}?${new URLSearchParams({ url: `${origin}${path}`, ...(session ? { session } : {}) })}`;
  const master = await (await fetch(wrap('/master.m3u8'))).text();
  const variant = master.split('\n').find((line) => line.startsWith('http'));
  const session = new URL(variant).searchParams.get('session');
  assert.match(session, /^[a-z0-9-]{36}$/);
  assert.ok(master.includes(`session=${session}`));
  assert.ok(variant.startsWith(relay), 'loopback requests retain the loopback relay');
  const media = await (await fetch(variant)).text();
  const urls = media.split('\n').filter((line) => line.startsWith('http'));
  assert.equal(new URL(urls[0]).searchParams.get('session'), session);
  const secondViewer = new URL(urls[0]);
  secondViewer.searchParams.set('session', 'second-viewer-session');
  const [a, b] = await Promise.all([fetch(urls[0]), fetch(secondViewer)]);
  endShared();
  assert.deepEqual(Buffer.from(await a.arrayBuffer()), body);
  assert.deepEqual(Buffer.from(await b.arrayBuffer()), body);
  assert.equal(requests.filter(([path]) => path === '/shared.ts').length, 1);
  const cachedHead = await fetch(urls[0], { method: 'HEAD' });
  assert.equal(cachedHead.status, 200);
  assert.equal((await cachedHead.arrayBuffer()).byteLength, 0);
  assert.equal(Number(cachedHead.headers.get('content-length')), body.length);
  const controller = new AbortController();
  const held = fetch(urls[3], { signal: controller.signal });
  // The requested held.ts may already be a shared speculative transfer.
  await heldSeen;
  // Withdraw both viewers' old lookahead so the abort tests real demand cancellation.
  const nearEnd = new URL(urls[3]);
  nearEnd.searchParams.set('session', session);
  // Their windows are already beyond held.ts when it is demanded. The second
  // viewer's window is withdrawn by a demand for the last segment as well.
  const otherController = new AbortController();
  nearEnd.searchParams.set('session', 'second-viewer-session');
  const otherHeld = fetch(nearEnd, { signal: otherController.signal });
  await delay(50);
  controller.abort();
  otherController.abort();
  await Promise.all([assert.rejects(held), assert.rejects(otherHeld)]);
  await heldClose;
  const movieHead = await fetch(wrap('/movie.mp4'), { method: 'HEAD' });
  assert.equal(movieHead.status, 200);
  assert.equal((await movieHead.arrayBuffer()).byteLength, 0);
  for (const [first, last] of [[0, 1023], [4096, 5119]]) {
    const response = await fetch(wrap('/movie.mp4'), { headers: { Range: `bytes=${first}-${last}` } });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('content-range'), `bytes ${first}-${last}/${body.length}`);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), body.subarray(first, last + 1));
  }
  const health = await (await fetch(`${relay}/status`)).json();
  assert.ok(health.delivery.sharedTransfers >= 1);
  assert.ok(health.delivery.cancelledTransfers >= 1);
  assert.ok(requests.some(([path, method]) => path === '/movie.mp4' && method === 'HEAD'));
});

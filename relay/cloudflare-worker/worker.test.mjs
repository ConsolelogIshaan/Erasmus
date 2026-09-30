import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

let sequence = 0;
const secret = fs.readFileSync(new URL('./worker.js', import.meta.url), 'utf8')
  .match(/const SYNC_SECRET = "([^"]+)"/)[1];
const freshWorker = async () => (await import(`./worker.js?test=${sequence++}`)).default;
const request = (pathname, target) => new Request(`https://relay.example${pathname}`, target ? {
  method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ target }),
} : undefined);

test('cached tunnel targets refresh after a restart', async () => {
  const worker = await freshWorker();
  let target = 'https://old.trycloudflare.com';
  const env = { RELAY_CONFIG: { get: async () => target } };
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  try {
    assert.equal((await (await worker.fetch(request('/tunnel-url'), env)).json()).tunnelUrl, target);
    target = 'https://new.trycloudflare.com';
    now += 30_001;
    assert.equal((await (await worker.fetch(request('/tunnel-url'), env)).json()).tunnelUrl, target);
  } finally { Date.now = originalNow; }
});

test('registration of an unchanged target does not consume KV writes', async () => {
  const worker = await freshWorker();
  const target = 'https://active.trycloudflare.com';
  let writes = 0;
  const env = { RELAY_CONFIG: { get: async () => target, put: async () => { writes++; } } };
  assert.equal((await worker.fetch(request('/set-target', target), env)).status, 200);
  assert.equal(writes, 0);
});

test('failed persistence is reported and is not cached as success', async () => {
  const worker = await freshWorker();
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const env = { RELAY_CONFIG: { get: async () => 'https://old.trycloudflare.com', put: async () => { throw new Error('quota'); } } };
    assert.equal((await worker.fetch(request('/set-target', 'https://new.trycloudflare.com'), env)).status, 503);
    assert.equal((await (await worker.fetch(request('/tunnel-url'), env)).json()).tunnelUrl, 'https://old.trycloudflare.com');
  } finally { console.warn = originalWarn; }
});

test('missing registry does not resurrect a hardcoded dead tunnel', async () => {
  const worker = await freshWorker();
  assert.equal((await (await worker.fetch(request('/tunnel-url'), {})).json()).tunnelUrl, null);
  assert.equal((await worker.fetch(request('/set-target', 'https://new.trycloudflare.com'), {})).status, 503);
});

test('a configured but unreachable tunnel is reported offline', async () => {
  const worker = await freshWorker();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('offline'); };
  try {
    const res = await worker.fetch(request('/status'), { TUNNEL_URL: 'https://dead.trycloudflare.com' });
    assert.equal((await res.json()).isTunnelAlive, false);
  } finally { globalThis.fetch = originalFetch; }
});

test('cloud media never reads tunnel configuration and preserves CDN hosts and child routing', async () => {
  const worker = await freshWorker();
  const originalFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url, options) => {
    seen.push([String(url), options.headers.get('Range')]);
    return new Response('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXTINF:6,\nhttps://anime-cdn.top/segment.ts\n#EXT-X-ENDLIST', { headers: { 'Content-Type': 'application/vnd.apple.mpegurl' } });
  };
  try {
    const response = await worker.fetch(new Request('https://relay.example/?mode=cloud&url=https%3A%2F%2Fanime-cdn.top%2Fmain.m3u8'), { RELAY_CONFIG: { get: () => { throw new Error('PC registry accessed'); } } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('X-Relay-Route'), 'cloud-edge');
    const text = await response.text();
    assert.equal(seen[0][0], 'https://anime-cdn.top/main.m3u8');
    assert.equal(seen.length, 1);
    assert.equal((text.match(/mode=cloud/g) || []).length, 2);
    assert.ok(!text.includes('stillhaven'));
    assert.ok(text.includes('key.bin'));
  } finally { globalThis.fetch = originalFetch; }
});

test('cloud mode rejects PC tunnel targets rather than fetching them', async () => {
  const worker = await freshWorker();
  const response = await worker.fetch(new Request('https://relay.example/?mode=cloud&url=https%3A%2F%2Fold.trycloudflare.com%2Fmovie.m3u8'), {});
  assert.equal(response.status, 400);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { SegmentTransfers } from './segment-transfers.mjs';

function gate() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function fixture(t, handler, maxBytes = 1024) {
  const cached = [];
  const signals = [];
  let requests = 0;
  const seen = gate();
  const closed = gate();
  const server = http.createServer((req, res) => {
    requests++;
    seen.resolve();
    res.once('close', () => { if (!res.writableFinished) closed.resolve(); });
    handler(req, res);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}/segment`;
  const pool = new SegmentTransfers({
    maxBytes,
    fetchSegment: (target, _referer, signal) => {
      signals.push(signal);
      return fetch(target, { signal });
    },
    onComplete: (_url, _referer, _response, buffer) => cached.push(buffer),
  });
  t.after(() => {
    for (const entry of pool.entries.values()) entry.controller.abort();
    server.closeAllConnections();
    server.close();
  });
  return { pool, url, cached, signals, seen, closed, get requests() { return requests; } };
}

async function collect(handle) {
  await handle.ready();
  const chunks = [];
  for await (const chunk of handle.chunks()) chunks.push(chunk);
  return Buffer.concat(chunks);
}

test('simultaneous demand shares one progressive upstream and identical complete bytes', { timeout: 5000 }, async (t) => {
  const tail = gate();
  const body = Buffer.from('first-second');
  const f = await fixture(t, async (_req, res) => {
    res.writeHead(200, { 'Content-Length': body.length });
    res.write(body.subarray(0, 5));
    await tail.promise;
    if (!res.destroyed) res.end(body.subarray(5));
  });
  const a = f.pool.acquire(f.url, 'referer-a');
  const b = f.pool.acquire(f.url, 'referer-a');
  await Promise.all([a.ready(), b.ready()]);
  const streamA = a.chunks();
  const streamB = b.chunks();
  const [firstA, firstB] = await Promise.all([streamA.next(), streamB.next()]);
  assert.deepEqual(firstA.value, body.subarray(0, 5));
  assert.deepEqual(firstB.value, firstA.value);
  assert.equal(f.cached.length, 0, 'first bytes arrive before the upstream finishes');
  tail.resolve();
  const remaining = async (stream, first) => {
    const chunks = [first];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
  };
  const [resultA, resultB] = await Promise.all([remaining(streamA, firstA.value), remaining(streamB, firstB.value)]);
  assert.deepEqual(resultA, body);
  assert.deepEqual(resultB, body);
  assert.equal(f.requests, 1);
  assert.deepEqual(f.cached, [body]);
});

test('a viewer abandoning a request before headers aborts upstream immediately', { timeout: 5000 }, async (t) => {
  const f = await fixture(t, () => {});
  const controller = new AbortController();
  const handle = f.pool.acquire(f.url, 'r', controller.signal);
  const ready = handle.ready();
  await f.seen.promise;
  controller.abort(new Error('seek'));
  await assert.rejects(ready, /seek/);
  await f.closed.promise;
  assert.equal(f.signals[0].aborted, true);
  assert.equal(f.pool.entries.size, 0);
  assert.equal(f.cached.length, 0);
});

test('disconnecting one viewer never cancels a segment still feeding another', { timeout: 5000 }, async (t) => {
  const tail = gate();
  const f = await fixture(t, async (_req, res) => {
    res.write('first');
    await tail.promise;
    if (!res.destroyed) res.end('-tail');
  });
  const controller = new AbortController();
  const a = f.pool.acquire(f.url, 'r', controller.signal);
  const b = f.pool.acquire(f.url, 'r');
  await Promise.all([a.ready(), b.ready()]);
  controller.abort();
  assert.equal(f.signals[0].aborted, false);
  tail.resolve();
  assert.equal((await collect(b)).toString(), 'first-tail');
  assert.equal(f.requests, 1);
});

test('seeks and rendition changes withdraw only their session/video lookahead', { timeout: 5000 }, async (t) => {
  const f = await fixture(t, () => {});
  const old = [{ url: f.url, referer: 'r' }];
  f.pool.setWindow('viewer-a:video', old);
  f.pool.setWindow('viewer-b:video', old);
  f.pool.prefetch(f.url, 'r');
  await f.seen.promise;
  f.pool.setWindow('viewer-a:audio', old);
  f.pool.setWindow('viewer-a:video', [{ url: `${f.url}?new-level`, referer: 'r' }]);
  assert.equal(f.signals[0].aborted, false);
  f.pool.setWindow('viewer-b:video', []);
  assert.equal(f.signals[0].aborted, false, 'audio retains its independent interest');
  f.pool.setWindow('viewer-a:audio', []);
  await f.closed.promise;
  assert.equal(f.signals[0].aborted, true);
  assert.equal(f.pool.cancelled, 1);
});

test('a promoted prefetch survives a seek while it has an active demand consumer', { timeout: 5000 }, async (t) => {
  const tail = gate();
  const f = await fixture(t, async (_req, res) => {
    res.write('start');
    await tail.promise;
    if (!res.destroyed) res.end('-end');
  });
  f.pool.setWindow('viewer:video', [{ url: f.url, referer: 'r' }]);
  f.pool.prefetch(f.url, 'r');
  await f.seen.promise;
  const handle = f.pool.acquire(f.url, 'r');
  f.pool.setWindow('viewer:video', []);
  await handle.ready();
  assert.equal(f.signals[0].aborted, false);
  tail.resolve();
  assert.equal((await collect(handle)).toString(), 'start-end');
  assert.equal(f.requests, 1);
});

for (const declared of [true, false]) {
  test(`oversized ${declared ? 'declared' : 'unknown-size'} demanded bodies stream completely without caching`, { timeout: 5000 }, async (t) => {
    const f = await fixture(t, async (_req, res) => {
      if (declared) res.setHeader('Content-Length', 24);
      for (let i = 0; i < 6; i++) {
        res.write('abcd');
        await delay(5);
      }
      res.end();
    }, 8);
    const a = f.pool.acquire(f.url, 'r');
    const b = f.pool.acquire(f.url, 'r');
    const [bodyA, bodyB] = await Promise.all([collect(a), collect(b)]);
    assert.equal(bodyA.toString(), 'abcd'.repeat(6));
    assert.deepEqual(bodyA, bodyB);
    assert.equal(f.requests, 1);
    assert.equal(f.cached.length, 0);
  });
}

test('different referers cannot share one upstream request', { timeout: 5000 }, async (t) => {
  const f = await fixture(t, (_req, res) => res.end('data'));
  await Promise.all([collect(f.pool.acquire(f.url, 'a')), collect(f.pool.acquire(f.url, 'b'))]);
  assert.equal(f.requests, 2);
});

test('a cancelled transfer cannot remove its replacement or fill the cache', { timeout: 5000 }, async () => {
  const oldFinish = gate();
  let calls = 0;
  let newest;
  const cached = [];
  const pool = new SegmentTransfers({
    fetchSegment: async (_url, _referer, signal) => {
      calls++;
      if (calls === 1) {
        await oldFinish.promise;
        signal.throwIfAborted();
      } else newest = signal;
      return new Response(new ReadableStream({ start(controller) { controller.enqueue(Buffer.from('fresh')); } }));
    },
    onComplete: (...args) => cached.push(args),
  });
  const cancelled = new AbortController();
  const a = pool.acquire('url', 'r', cancelled.signal);
  await delay(0);
  cancelled.abort();
  a.release();
  const b = pool.acquire('url', 'r');
  await b.ready();
  oldFinish.resolve();
  await delay(0);
  assert.equal(pool.entries.size, 1);
  assert.equal(newest.aborted, false);
  assert.equal(cached.length, 0);
  b.release();
});

test('truncated bodies are rejected and never enter the cache', { timeout: 5000 }, async (t) => {
  const f = await fixture(t, async (_req, res) => {
    res.writeHead(200, { 'Content-Length': 100 });
    res.write('partial');
    await delay(20);
    res.destroy();
  });
  await assert.rejects(collect(f.pool.acquire(f.url, 'r')));
  assert.equal(f.cached.length, 0);
  assert.equal(f.pool.entries.size, 0);
});

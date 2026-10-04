// One upstream transfer per segment, with independent cancellation for viewers.
// Only the relay uses this; byte ranges and complete movie files bypass it.
export class SegmentTransfers {
  constructor({ fetchSegment, onComplete, maxBytes = 32 * 1024 * 1024, maxPrefetches = 4 }) {
    this.fetchSegment = fetchSegment;
    this.onComplete = onComplete;
    this.maxBytes = maxBytes;
    this.maxPrefetches = maxPrefetches;
    this.entries = new Map();
    this.active = new Set();
    this.windows = new Map();
    this.cancelled = 0;
    this.shared = 0;
  }

  key(url, referer) { return JSON.stringify([url, referer]); }

  wake(entry) {
    for (const resolve of entry.waiters) resolve();
    entry.waiters.clear();
  }

  wait(entry, signal) {
    if (signal?.aborted) return Promise.reject(signal.reason);
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        entry.waiters.delete(changed);
        signal?.removeEventListener('abort', aborted);
      };
      const changed = () => { cleanup(); resolve(); };
      const aborted = () => { cleanup(); reject(signal.reason); };
      entry.waiters.add(changed);
      signal?.addEventListener('abort', aborted, { once: true });
    });
  }

  drop(entry) {
    if (this.entries.get(entry.key) === entry) this.entries.delete(entry.key);
  }

  cancelUnused(entry) {
    if (entry.done || entry.consumers.size || entry.owners.size || entry.controller.signal.aborted) return;
    this.cancelled++;
    entry.controller.abort(new Error('Segment no longer requested'));
    this.drop(entry);
    this.wake(entry);
  }

  // Windows belong to a playback session and audio/video family. A seek or
  // rendition change only withdraws that session's speculative interest.
  setWindow(owner, segments) {
    const now = Date.now();
    for (const [id, window] of this.windows) {
      if (now - window.updated > 60_000) this.windows.delete(id);
    }
    this.windows.delete(owner);
    while (this.windows.size >= 256) this.windows.delete(this.windows.keys().next().value);
    this.windows.set(owner, { keys: new Set(segments.map(({ url, referer }) => this.key(url, referer))), updated: now });
    for (const entry of this.active) {
      entry.owners = this.owners(entry.key);
      this.cancelUnused(entry);
    }
  }

  owners(key) {
    return new Set([...this.windows].filter(([, window]) => window.keys.has(key)).map(([id]) => id));
  }

  get speculativeCount() {
    return [...this.active].filter((entry) => !entry.consumers.size && !entry.controller.signal.aborted).length;
  }

  prefetch(url, referer) {
    const key = this.key(url, referer);
    if (this.entries.has(key) || this.speculativeCount >= this.maxPrefetches || !this.owners(key).size) return;
    this.start(url, referer);
  }

  start(url, referer) {
    const key = this.key(url, referer);
    const entry = {
      key, url, referer, controller: new AbortController(), owners: this.owners(key),
      consumers: new Set(), waiters: new Set(), chunks: [], base: 0,
      retainedBytes: 0, totalBytes: 0, reusable: true, response: null, done: false, error: null,
    };
    this.entries.set(key, entry);
    this.active.add(entry);
    // Attach a demand consumer before even an immediately resolved fetch runs.
    queueMicrotask(() => this.run(entry));
    return entry;
  }

  compact(entry) {
    if (entry.reusable) return;
    const until = entry.consumers.size
      ? Math.min(...[...entry.consumers].map((consumer) => consumer.index))
      : entry.base + entry.chunks.length;
    const remove = until - entry.base;
    for (let i = 0; i < remove; i++) entry.retainedBytes -= entry.chunks[i].length;
    entry.chunks.splice(0, remove);
    entry.base = until;
  }

  async run(entry) {
    // Speculation has a total deadline. A demanded body may legitimately take
    // longer; its viewers' disconnect signals still cancel it immediately.
    const speculativeTimeout = setTimeout(() => {
      if (!entry.consumers.size) {
        entry.controller.abort(new Error('Speculative segment timed out'));
        this.drop(entry);
        this.wake(entry);
      }
    }, 30000);
    speculativeTimeout.unref();
    try {
      const response = await this.fetchSegment(entry.url, entry.referer, entry.controller.signal);
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`upstream error ${response.status}`);
      }
      if (Number(response.headers.get('content-length')) > this.maxBytes) {
        entry.reusable = false;
        this.drop(entry);
        if (!entry.consumers.size) {
          await response.body?.cancel();
          throw new Error('Oversized speculative segment');
        }
      }
      entry.response = response;
      this.wake(entry);
      if (!response.body) throw new Error('Missing segment body');
      for await (const chunk of response.body) {
        if (entry.controller.signal.aborted) throw entry.controller.signal.reason;
        entry.totalBytes += chunk.length;
        if (entry.totalBytes > this.maxBytes && entry.reusable) {
          // Large/unknown-size demanded segments still stream in full. Stop
          // admitting new consumers and release bytes as existing ones read.
          entry.reusable = false;
          this.drop(entry);
        }
        this.compact(entry);
        if (!entry.reusable && !entry.consumers.size) throw new Error('Oversized speculative segment');
        entry.chunks.push(Buffer.from(chunk));
        entry.retainedBytes += chunk.length;
        this.wake(entry);
        while (!entry.reusable && entry.retainedBytes > this.maxBytes) {
          await this.wait(entry, entry.controller.signal);
          this.compact(entry);
        }
      }
      if (entry.reusable && entry.totalBytes > 0 && !entry.controller.signal.aborted) {
        this.onComplete(entry.url, entry.referer, entry.response, Buffer.concat(entry.chunks));
      }
    } catch (error) {
      entry.error = error;
      entry.controller.abort(error);
    } finally {
      clearTimeout(speculativeTimeout);
      entry.done = true;
      this.drop(entry);
      this.active.delete(entry);
      this.wake(entry);
    }
  }

  acquire(url, referer, signal) {
    signal?.throwIfAborted();
    const key = this.key(url, referer);
    const existing = this.entries.get(key);
    const entry = existing || this.start(url, referer);
    if (existing) this.shared++;
    const consumer = { index: 0 };
    entry.consumers.add(consumer);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      signal?.removeEventListener('abort', release);
      entry.consumers.delete(consumer);
      this.compact(entry);
      this.wake(entry);
      this.cancelUnused(entry);
    };
    signal?.addEventListener('abort', release, { once: true });
    const pool = this;
    return {
      shared: Boolean(existing),
      release,
      async ready() {
        while (!entry.response && !entry.done) await pool.wait(entry, signal);
        signal?.throwIfAborted();
        if (entry.error) throw entry.error;
        return entry.response;
      },
      async *chunks() {
        try {
          while (true) {
            signal?.throwIfAborted();
            if (entry.error) throw entry.error;
            if (consumer.index < entry.base + entry.chunks.length) {
              yield entry.chunks[consumer.index - entry.base];
              consumer.index++;
              pool.compact(entry);
              pool.wake(entry);
            } else if (entry.done) break;
            else await pool.wait(entry, signal);
          }
        } finally { release(); }
      },
    };
  }

  status() {
    return {
      activeTransfers: this.active.size,
      prefetchesInFlight: this.speculativeCount,
      sharedTransfers: this.shared,
      cancelledTransfers: this.cancelled,
      playbackWindows: this.windows.size,
      retainedBytes: [...this.active].reduce((bytes, entry) => bytes + entry.retainedBytes, 0),
    };
  }
}

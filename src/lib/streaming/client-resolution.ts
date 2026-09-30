"use client";

import { isEmbedServer } from "./stream-resolver";
import { buildRelayUrl } from "./relay";
import { getPlaybackProgress, shouldResume } from "./playback-progress";

export interface ClientStreamResolution {
  ok?: boolean;
  referer?: string;
  captions?: { url: string; label: string; language: string; isExternal?: boolean; hearingImpaired?: boolean }[];
  servers?: { url: string; kind?: "hls" | "file"; is4K?: boolean; isDirectCors?: boolean; cloudOnly?: boolean; hdUrl?: string; fourKUrl?: string }[];
}

const ready = new Map<string, { expires: number; data: ClientStreamResolution }>();
const pending = new Map<string, Promise<ClientStreamResolution>>();
const TTL = 45_000;
const preparedPlaylists = new Map<string, number>();
let playlistPreparations = 0;

async function preparePlaylists(data: ClientStreamResolution, startAt: number) {
  const hit = data.servers?.[0];
  if (!data.ok || !hit || hit.kind === "file" || playlistPreparations >= 2) return;
  const url = buildRelayUrl(hit.fourKUrl || hit.url, data.referer, hit.cloudOnly);
  if ((preparedPlaylists.get(url) || 0) > Date.now()) return;
  if (preparedPlaylists.size >= 24) preparedPlaylists.delete(preparedPlaylists.keys().next().value!);
  preparedPlaylists.set(url, Date.now() + TTL);
  playlistPreparations++;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error("Playlist preparation failed");
    const text = await response.text();
    if (!text.startsWith("#EXTM3U")) throw new Error("Invalid playlist");
    const lines = text.split(/\r?\n/);
    const variants: { height: number; url: string }[] = [];
    for (let i = 0; i < lines.length; i++) {
      const entry = lines[i];
      if (!entry?.startsWith("#EXT-X-STREAM-INF:")) continue;
      const height = Number(entry.match(/RESOLUTION=\d+x(\d+)/)?.[1]);
      const child = lines.slice(i + 1).find((line) => line.trim() && !line.startsWith("#"));
      if (height && child) variants.push({ height, url: new URL(child.trim(), url).href });
    }
    const startup = variants.find((variant) => variant.height >= 600 && variant.height < 900)
      || variants.find((variant) => variant.height >= 900 && variant.height <= 1200);
    if (startup) {
      const media = await fetch(startup.url, { signal: AbortSignal.timeout(10_000) });
      if (!media.ok) throw new Error("Media playlist preparation failed");
      const playlist = await media.text();
      // Warm the small startup fragment at the saved position. Live playlists
      // and alternate audio remain under the player's own loading logic.
      if (playlist.includes("#EXT-X-ENDLIST")) {
        let position = 0;
        let fragmentDuration = 0;
        for (const line of playlist.split(/\r?\n/)) {
          if (line.startsWith("#EXTINF:")) fragmentDuration = Number.parseFloat(line.slice(8));
          else if (line.trim() && !line.startsWith("#") && fragmentDuration > 0) {
            if (position + fragmentDuration > startAt) {
              const fragment = await fetch(new URL(line.trim(), startup.url).href, { signal: AbortSignal.timeout(10_000) });
              const reader = fragment.body?.getReader();
              if (reader) {
                let bytes = 0;
                try {
                  while (fragment.ok) {
                    const chunk = await reader.read();
                    if (chunk.done) break;
                    bytes += chunk.value.byteLength;
                    if (bytes > 8 * 1024 * 1024) break;
                  }
                } finally { await reader.cancel().catch(() => {}); }
              }
              break;
            }
            position += fragmentDuration;
            fragmentDuration = 0;
          }
        }
      }
    }
  } catch {
    preparedPlaylists.delete(url);
  } finally {
    playlistPreparations--;
  }
}

export function markPlaybackClick() {
  document.documentElement.dataset.erasmusPlayClickAt = String(Date.now());
}

function keyFor(query: URLSearchParams) {
  return JSON.stringify([query.get("type"), query.get("id"), query.get("season") || "1", query.get("episode") || "1", query.get("server")]);
}

export function resolveClientStream(query: URLSearchParams, refresh = false): Promise<ClientStreamResolution> {
  const key = keyFor(query);
  if (refresh) ready.delete(key);
  const cached = ready.get(key);
  if (cached && cached.expires > Date.now()) return Promise.resolve(cached.data);
  const existing = pending.get(key);
  if (existing) return existing;
  const request = fetch(`/api/stream/direct?${query}`, { signal: AbortSignal.timeout(45_000) })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Stream resolution failed (${response.status})`);
      const data = await response.json() as ClientStreamResolution;
      if (data.ok && data.servers?.[0]?.url) {
        if (ready.size >= 24) ready.delete(ready.keys().next().value!);
        const expiresIn = query.get("server") === "lisbon" && !data.servers.some((server) => server.is4K) ? 10_000 : TTL;
        ready.set(key, { data, expires: Date.now() + expiresIn });
      }
      return data;
    })
    .finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

export function prepareClientStream(input: { type: "movie" | "tv"; id: string; title: string; server: string; season?: number; episode?: number }) {
  if (isEmbedServer(input.server) || document.visibilityState !== "visible") return;
  const query = new URLSearchParams({ type: input.type, id: input.id, title: input.title, server: input.server, season: String(input.season || 1), episode: String(input.episode || 1) });
  // Limit speculative lookups; a real Play request is never held by this limit.
  if (pending.size >= 2 && !pending.has(keyFor(query))) return;
  const saved = getPlaybackProgress({ mediaType: input.type, tmdbId: input.id, season: input.season, episode: input.episode });
  const startAt = saved && shouldResume(saved) ? saved.seconds : 0;
  void resolveClientStream(query).then((data) => preparePlaylists(data, startAt)).catch(() => {});
}

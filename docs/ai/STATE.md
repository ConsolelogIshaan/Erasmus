# STATE

Updated: 2026-09-28 4:01 PM IST
Git: `origin/main` (local: modified `relay/cloudflare-worker/worker.js`, `src/features/streaming/components/native-player.tsx`, `src/lib/streaming/cinejoy-stream.ts`, `src/lib/streaming/direct-stream.ts`, `relay/supervisor.ps1`, docs)

## Priority
Seamless Offline Failover & Cloudflare Native HLS Relay Playback:
1. **Cloudflare Edge Worker Dynamic Playlist Rewriter (`relay/cloudflare-worker/worker.js`)**:
   - Added complete in-flight `.m3u8` playlist parser and child segment rewriter in Path 2 (Direct Edge Fetch).
   - All variant manifests (`stream_0.m3u8`, `tiles.m3u8`) and binary video segments (`.ts`, `.png`, subtitles) are rewritten through `erasmus-hls-relay` with full CORS headers.
   - Deployed live to Cloudflare Workers (`https://erasmus-hls-relay.erasmustv.workers.dev`, Version ID: `4f826a68-05be-41ff-a4d2-b890e5cf909c`).
2. **Seamless Offline Fallback Implementation**:
   - `src/lib/streaming/direct-stream.ts`: Skipped Hakuna Matata CDN in edge fallback because it blocks Cloudflare datacenter IPs (HTTP 427). When the residential tunnel is offline, Lisbon immediately cascades directly to Aphelion (`img.rousav.tech` / `media.evion.lol`), returning in 1.4s-2.2s.
   - `src/lib/streaming/cinejoy-stream.ts`: Added Hakuna Matata bypass guard to `cj-nebula`, `cj-lisbon`, `cj-athens`.
   - `src/features/streaming/components/native-player.tsx`: Added auto-failover to Aphelion HD backup if Lisbon encounters repeated fatal errors on network disconnects.
   - Deployed live to Cloudflare Workers (`https://erasmus-web.erasmustv.workers.dev`, Version ID: `6f119583-caad-4d52-aad4-f4a5e993a0dc`).

## Verification Summary
- **Live Direct Resolver Test**:
  - Movie (`Spider-Man: No Way Home`, id=634649): Returned 200 OK with `https://img.rousav.tech/media/4247d4ec8b4c8e900afd/index.m3u8` in 2.2s.
  - TV (`Stranger Things`, id=66732, s1e1): Returned 200 OK with `https://media.evion.lol/tvshows/b97f4af4d846311d13ad/index.m3u8` in 1.4s.
- **Live HLS Relay Test**:
  - Subtitle manifests and media segments tested against `erasmus-hls-relay.erasmustv.workers.dev`: returned 200 OK with rewritten child URLs.
- **Build & Lint**:
  - `npm run lint`: 0 errors.
  - OpenNext production build & deployment: 0 errors.

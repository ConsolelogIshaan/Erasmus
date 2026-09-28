# STATE

Updated: 2026-09-28 4:25 PM IST
Git: `origin/main` (local: modified `relay/cloudflare-worker/worker.js`, `relay/erasmus-relay.mjs`, `src/lib/streaming/direct-stream.ts`)

## Priority
Disguised Image TS Normalization & TV Show Edge Fallback:
1. **Disguised Video Segments Normalized (`worker.js` & `erasmus-relay.mjs`)**:
   - Scrapers & CDNs (Bastion, Bxcnm, Tlnob, Bwcly) disguise MPEG-TS chunks as `.jpg` or `.png` images and serve them with `Content-Type: image/jpeg`.
   - Browser MediaSource engine hangs in perpetual loading when receiving `image/jpeg` inside a video `SourceBuffer`.
   - Both Cloudflare Edge Worker (`Path 1` & `Path 2`) and local relay now normalize all disguised `.jpg`/`.png`/`image/*` video chunks to `Content-Type: video/mp2t`.
2. **TV Show Guard Fix (`direct-stream.ts`)**:
   - Previously, a hard guard `bingrHit.serverId !== "bastion"` discarded Bastion for Lisbon.
   - For TV shows like *Modern Family*, Aphelion (`s40`) has 0 streams (evion 404), so Bingr cascades to Bastion. The old guard caused Lisbon to return `502 no stream` and prevented the transfer.
   - Guard updated to allow Bastion for TV shows (`input.type === "tv"`) where season/episode is unambiguous, and as a Lisbon offline fallback.
3. **Deployments**:
   - `erasmus-hls-relay`: Deployed Version `d0ffe701-f934-4e4f-bb4d-f7e311ed9866`.
   - `erasmus-web`: Deployed Version `8c64166e-ebdf-4912-abfc-69c59725e1d3`.

## Verification Summary
- **Modern Family Test (TMDB 1421, S01E01)**:
  - Stream playlist: 200 OK.
  - Video segment (`0000.jpg`): returned 200 OK, `Content-Type: video/mp2t`, `930,224 bytes`.
- **Lint**: 0 errors.

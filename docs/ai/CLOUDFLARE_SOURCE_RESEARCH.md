# PC-independent streaming source research

Researched 2026-10-02. Scope: discover additional movie/TV providers with genuine 4K potential and no Erasmus laptop dependency. Research and read-only HTTP probes only; no playback/provider integration, deployment, dependencies or push.

## Result

No new provider is verified to meet all requirements: real 4K, broad title coverage, fast starts/seeks, native Erasmus playback, and Cloudflare-only discovery plus media fetching. The candidates below are leads, not certified working servers. Marketing statements and catalog counts are provider claims.

| Candidate | Primary evidence | Cloudflare-only page probe | Assessment |
| --- | --- | --- | --- |
| VidZee | https://vidzee.wtf/ advertises 1080p/4K and movie/TV embed routes | player.vidzee.wtf/embed/movie/550 returned 200 and X-Relay-Route: cloud-edge | Priority feasibility lead; HTML player shell, no manifest. Actual 4K and CDN access unverified. |
| Chillflix | https://www.chillflix.lol/player-api documents prefer4k=1 for its available 4K catalog and movie/TV routes | /embed/movie/550?prefer4k=1 returned 200 and cloud-edge | Priority feasibility lead; HTML shell, no manifest. Public /4k link returned 404 through the web research tool. Quality, coverage and segments unverified. |
| Mapple | https://mappletv.uk/ explicitly advertises genuine 3840x2160/HDR and movie/TV embeds on mapple.fun | mapple.fun/watch/movie/299534 returned upstream 403 | Strong advertised quality; plain Worker fetch blocked in this sample. Remote browser discovery and CDN fetch need separate validation. No proof residential IP is required. |
| Stellar | https://stellar.rip/en/api labels movie 1081003 and TV 83867 S1E1 as 4K demos | /en/watch/embed/movie/1081003 returned upstream 403 | Secondary lead. Its /en/4k-contents page returned an empty catalog with suspicious placeholder-looking titles in the web renderer; not evidence of real coverage. Its footer explicitly says media is third-party hosted. |
| VixSrc | https://vixsrc.to/ claims 45K+ movies/15K+ shows and documents TMDB/IMDb movie/TV routes plus a catalog API | /movie/299534/ returned upstream 403 | Coverage lead only. Reviewed documentation does not establish 4K; not a verified 4K recommendation. |
| VidNest | https://vidnest.fun/ documents nine selectable aggregated sources and claims 115K+ movies/79K+ episodes | /movie/299534 returned 200 and cloud-edge | Aggregator/coverage lead; no actual manifest in response (m3u8 mentions were metadata). No concrete 4K proof in reviewed docs. |

## Exclusions and duplication

- Videasy and Vidking: https://www.videasy.to/ search-indexed primary page announces permanent shutdown on September 15, 2026. Page advertises historical 1K+ 4K movies, but that is not current availability. Live www.videasy.to Cloudflare probe yielded upstream 530 surfaced as relay 502; direct web opens also failed. Do not recommend old Videasy extractors as a working provider.
- VidRock already appears in src/lib/streaming/bingr-stream.ts as Nova (s30); VidFast already supplies Lisbon, and VidLink is already integrated. These are not new independent providers.
- FilmU already appears in the project embed roster. Its advertised 70+ sources/4K do not prove a new independent catalog or a native Cloudflare-only path.
- VidLux documentation says pinned sources silently fail over. Its embed behavior conflicts with strict server selection, and its claims of proxy speed do not demonstrate actual video throughput.
- Paid video hosting products do not provide the requested existing movie/TV catalog and were not proposed as replacements.

## What the Cloudflare probes prove

Requests went from a local research client to the deployed Erasmus Cloudflare relay with mode=cloud, then from the Worker directly to each upstream. The inspected mode=cloud implementation does not read the PC tunnel configuration and rejects tunnel/localhost targets. No source extraction or media proxy ran on the laptop. These were HTML GET probes, not video speed tests. Local client involvement in sending a research request is not a laptop service dependency.

Raw responses and JSON summaries are in ignored scratch/cloud-provider-research. Signed media URLs were not discovered or published. HTTP 200 player pages do not prove source extraction, HLS resolution, media access, successful seeks or real decoded 4K. Upstream 403 alone does not prove a provider needs a residential IP; Browser Run may work, but this session did not establish that.

## Required validation before integration

1. Discover sources inside Cloudflare Workers/Browser Run, with explicit failure and no local/residential fallback.
2. Fetch actual master/variant manifests, init data/keys and complete video segments from Cloudflare-only mode. Check resolution and decoded video, not a source label.
3. Verify movies and TV episodes across new, older and less popular titles; report missing titles and actual 4K coverage separately.
4. Measure first frame, distant seeks, repeated seeks and sustained 4K on the deployed Erasmus native player across representative viewer networks.
5. Check whether different brands resolve to the same CDN/catalog; avoid counting duplicates as independent redundancy.

Target path: viewer -> Erasmus Cloudflare services -> third-party provider/CDN. No laptop. This is PC-independent, but the provider/CDN remains external; it does not mean all video is owned, stored or hosted by Cloudflare.

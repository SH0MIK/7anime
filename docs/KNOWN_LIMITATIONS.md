# 7ANIME_NEW — Known Limitations & Architectural Notes

**Document Version:** 1.4  
**Date:** 18 November 2026  
**Status:** TMDB Transparent Logo Resolver & External ID Resolution Engine Complete

---

## 1. Scope & Execution Boundaries

1. **Live Anime Metadata vs. Mock Fallbacks:**
   * **Complete Mock Removal from Runtime:** Static mock anime catalog dependencies (`CATALOG`, `SPOTLIGHT_ITEMS`, `HOME_FEED`, `LATEST_EPISODES`) have been completely removed from runtime pages. All anime cards, spotlights, browse grids, search previews, episode lists, relations, and recommendations are now powered directly by the public AniList GraphQL API (`https://graphql.anilist.co`).
   * **Resilient Error States:** If the AniList API is unreachable or returns a 429 rate limit, 7Anime displays dedicated `ErrorState` components with interactive retry buttons rather than silently fabricating mock anime content.
   * **Skeleton Loaders:** Fluid `SpotlightSkeleton`, `RailSkeleton`, and `GridSkeleton` components render during network queries to guarantee zero layout shift.

2. **Artwork Resolution & Transparent TMDB Logo Policy:**
   * **Authentic Transparent Logos:** All anime title logos are strictly sourced from TMDB's image endpoint (`/3/{media_type}/{tmdb_id}/images?include_image_language=en,ja,null`) and validated to be genuine transparent PNG wordmarks (`.endsWith('.png')`).
   * **Quality & Language Prioritization:** Selection adheres to strict priority (`English ('en') > Japanese ('ja') > Neutral (null/'xx') > Other`), aspect ratio scoring (horizontal wordmarks between 1.5 and 6.0), resolution filtering (>= 400px width), and community rating weighting.
   * **No Fake or Stretched Logos:** The system strictly rejects using posters or banners as logos. When no valid transparent TMDB logo exists (e.g. obscure OVAs or missing assets), the UI renders an accessible typography-based `<h1>` fallback title.
   * **Trailer Controls:** The floating "Trailer Muted" audio control remains permanently removed, preserving clean, distraction-free hero presentation.

3. **External ID Resolution Engine (AniList, MAL, TMDB, IMDb, OMDb):**
   * **Canonical Identity:** AniList ID is the primary system identity.
   * **Cross-Provider Mapping:** Resolves TMDB ID (with TV/Movie detection and confidence scoring), IMDb ID (via TMDB external IDs endpoint, validated `/^tt\d{7,8}$/`), and OMDb ID (canonically mapped to verified IMDb identifier).
   * **Franchise Separation:** Canonical overrides for major franchises guarantee that sequels (e.g., Naruto vs. Naruto Shippuden, DBZ vs. DB Super) and distinct seasons never mismatch external IDs or artwork.
   * **Zero ID Fabrication:** If an external ID is not present across official endpoints, it is gracefully omitted (`undefined`) rather than fabricated.

4. **Performance, Redis Caching & Resilient Networking:**
   * **Dual-Tier Cache:** Upstash Redis REST API (`anime:ext_ids:{id}`, `anime:logo:{id}`) backed by an in-memory cache layer. If Redis or network calls fail, operations fall back seamlessly without crashing.
   * **Cache TTLs:** Positive mappings and logos cached for 30 days; negative cache for missing logos stored for 7 days (`notFound: true`).
   * **In-Flight Request Deduplication:** Prevents redundant concurrent upstream API queries for identical anime.
   * **DNS Sinkhole Bypass:** Built-in resilient DNS resolution dispatch using Google (`8.8.8.8`) and Cloudflare (`1.1.1.1`) to bypass local ISP DNS sinkholes on `api.themoviedb.org`.

5. **Video Player Architecture & Streaming Streams:**
   * Video streaming playback currently operates in a simulated cinema view with authentic controls (timeline scrubbing, auto-next, auto-skip, theater mode, lights-off overlay, speed selection, volume, and subtitle toggles).
   * Server selection operates through generic abstraction labels (`Server 1 (Primary HD)`, `Server 2 (Fast Edge)`, `Server 3 (English Dub)`, `Server 4 (Backup Low Bandwidth)`).
   * Real video stream extraction / HLS / DASH stream resolvers remain scheduled for a subsequent video streaming integration phase.

4. **Responsive & Mobile Viewport Conformance:**
   * Tested and verified down to 320px viewport width (iPhone SE standard).
   * Touch targets across all critical controls meet or exceed 40px–44px minimum sizing guidelines.
   * Mobile sticky bottom tab bar includes safe-area insets (`env(safe-area-inset-bottom)`) and `<main>` includes bottom padding clearance to prevent any UI clipping.
   * Zero horizontal scroll or overflow issues exist across all routes and tested viewports.

5. **Appearance Customization Engine:**
   * Full matrix of 12 base themes (8 Dark + 4 Light), 14 accents, custom hex colors, 3 density presets (compact, cozy, large), and motion preferences are stored client-side in `localStorage` and immediately synchronized to `<html data-theme="..." data-accent="..." data-density="..." data-motion="...">`.
   * A pre-paint inline script in `index.html` prevents Flash of Unstyled Content (FOUC) on cold loads.

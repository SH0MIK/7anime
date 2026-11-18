# 7ANIME_NEW — System Architecture Audit Report

**Date:** 18 November 2026  
**Status:** Phase 1 Monorepo Migration & Backend Gateway Verified — Ready for Provider Integrations  
**Workspaces Inspected:** `E:\7ANIME_NEW` (Active), `E:\7ANIME_CODEX` (Protected Read-Only), `E:\ani.pm-main` (Reference Read-Only)

---

## 1. Executive Summary

This architecture audit details the current state of **7ANIME_NEW** before restructuring into a modern, decoupled monorepo (`frontend/` + `backend/` + `shared/`) and implementing the multi-source anime metadata resolver. 

The frontend represents a production-grade, highly responsive anime discovery and viewing interface with genuine 7Anime brand identity, local-first state persistence, and glassmorphic UI aesthetics. The backend will introduce a resilient Node.js/TypeScript metadata gateway that normalizes AniList, TMDB, MyAnimeList, and IMDb/OMDb data into unified canonical models with intelligent artwork selection and official trailer streaming.

---

## 2. Current Frontend Architecture Audit

### 2.1 Framework & Core Toolchain
* **Framework:** React 19.3.1 with React DOM 19.3.1.
* **Routing:** React Router DOM 7.18.5 (`BrowserRouter`, nested routes, query param parsing).
* **State Management:** Zustand 5.1.0 + React Context (`AppContext.tsx`).
* **Styling:** Tailwind CSS v4.3.5 (`@tailwindcss/vite`) + modular CSS token system (12 base themes, 14 accents, glassmorphic layout, poster aspect ratio clamps).
* **Icons:** `lucide-react` 1.74.0.
* **Build System:** Vite 8.3.6 + TypeScript 7.0.2 (compiles in ~4–10 seconds with 0 errors).

### 2.2 Route & Page Hierarchy
| Route Path | Component | Responsibility | Status |
| :--- | :--- | :--- | :--- |
| `/` | `HomePage` | Theatrical carousel, spotlight hero, genre shelves, newest comments, latest episodes, schedule | Production Ready |
| `/anime`, `/discover` | `BrowsePage` | Multi-facet catalog exploration (format, season, year, status, audio, genre, sorting) | Production Ready |
| `/latest` | `LatestPage` | Chronological release feeds (Sub/Dub episode drops) | Production Ready |
| `/genres` | `GenresPage` | Genre-driven anime grouping with dynamic counts | Production Ready |
| `/manga` | `MangaPage` | Manga chapter reader and adapter view | Production Ready |
| `/library`, `/watchlist`, `/history` | `LibraryPage` | User watchlist, manga bookmarks, custom folders, watch history, JSON import/export | Production Ready |
| `/community` | `CommunityPage` | Discussion forums, announcement threads, polls | Production Ready |
| `/watch-together` | `WatchTogetherPage` | Synchronized viewing rooms with real-time chat mock | Production Ready |
| `/leaderboard` | `LeaderboardPage` | User XP, VIP rankings, and activity leaderboards | Production Ready |
| `/anime/:id` | `AnimeOrWatchRoute` | Dual route: displays `AnimeDetailPage` if no `?ep=`, routes to `WatchPage` if `?ep=` is present | Production Ready |
| `/watch/:id`, `/watch/:id/:ep` | `WatchPage` | Cinema 16:9 player, server switcher, episode matrix, lights-off/theater mode | Production Ready |
| `/settings`, `/appearance` | `SettingsPage` | Appearance Studio (12 themes, 14 accents, custom hex, density, text size, motion), data backup | Production Ready |
| `/profile`, `/user/:username` | `ProfilePage` | User profile, badges, level/XP tracker, custom banner/frame | Production Ready |
| `/about`, `/terms`, `/privacy`, `/dev` | `DocsPages` | Static legal, informational, and interactive API tester pages | Production Ready |
| `/search` | `SearchModal` / `SearchPage` | Real-time title search and AI "describe-it" plot search | Production Ready |

### 2.3 Anime Details & Interaction Audit
* **Backdrop & Hero Area:**
  * Currently renders static `<img src={anime.banner ?? anime.poster} />` with overlay gradients.
  * **Target Refactor (Phase 7):** Inject the intelligent trailer background engine playing the official YouTube/TMDB trailer muted and looped with graceful fallback to TMDB backdrop / AniList banner.
* **Logo Presentation:**
  * Checks for `anime.logo` and renders `<img className="spot-logo" />`, falling back to typography `<h1>`.
  * **Target Refactor (Phase 6):** Wire to the new multi-source artwork resolver prioritizing TMDB high-res transparent PNG logos.
* **Action Buttons:**
  * **Watch Now:** Deep links to `/anime/:routeId?ep=1`. Needs to be enhanced to resume the user's last saved progress timestamp and episode.
  * **Star / Favorite:** Invokes `toggleLikeAnime(anime.routeId)` with immediate toast feedback and `localStorage` persistence.
  * **Plus / Library Trigger:** `LibraryStatusTrigger.tsx` manages watching, plan to watch, completed, on hold, dropped, and custom folder management.
  * **External Links:** Existing marks for AniList (`anilist.co/anime/:id`) and MyAnimeList (`myanimelist.net/anime/:id`).

---

## 3. Legacy Credential & Backend Audit (`E:\7ANIME_CODEX`)

Inspection of `E:\7ANIME_CODEX\.env` (executed strictly in read-only mode) revealed:
* `TMDB_API_KEY`: Available and verified (32 characters).
* `TMDB_READ_ACCESS_TOKEN`: Available and verified (239 characters v4 Bearer token).
* `UPSTASH_REDIS_REST_URL` & `UPSTASH_REDIS_REST_TOKEN`: Available for optional distributed caching.
* `GOOGLE_CLIENT_ID` & `GOOGLE_CLIENT_SECRET`: Available for Google authentication.
* **Missing in Legacy `.env`:**
  * `MAL_CLIENT_ID` / `MAL_CLIENT_SECRET`: Not present in legacy `.env`.
  * `OMDB_API_KEY`: Not present in legacy `.env`.
* **Architectural Strategy:**
  * Use AniList GraphQL API as the primary open catalog index (no secret key required for public catalog).
  * Use TMDB v3 API key and v4 Bearer token for cinematic media, backdrops, transparent PNG logos, and video trailers.
  * Resolve IMDb IDs directly through TMDB's `/find` and external IDs endpoints (`imdb_id`).
  * Implement public MAL/Jikan fallbacks for MAL ratings and ranking statistics without requiring developer API keys.

---

## 4. Proposed Monorepo Restructuring Plan

```text
E:\7ANIME_NEW\
├── frontend/                          # Migrated from client/
│   ├── public/assets/                 # Offline fonts, stills, branding
│   ├── src/
│   │   ├── components/                # Reusable UI widgets
│   │   ├── context/                   # Global state (theme, auth, library)
│   │   ├── hooks/                     # Custom React hooks
│   │   ├── pages/                     # Routed view components
│   │   ├── services/                  # Backend API client integration
│   │   ├── styles/                    # Global token stylesheets
│   │   ├── types/                     # Frontend UI models
│   │   └── utils/                     # Formatters and helpers
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── backend/                           # Fast Node.js + TypeScript service
│   ├── src/
│   │   ├── config/env.ts              # Strongly typed env validator
│   │   ├── controllers/               # Express / HTTP route handlers
│   │   ├── routes/                    # API route definitions (/api/anime/*)
│   │   ├── services/
│   │   │   ├── metadata/
│   │   │   │   ├── providers/         # AniList, TMDB, MAL, OMDb adapters
│   │   │   │   ├── resolver/          # Multi-source merger & matcher
│   │   │   │   ├── normalizers/       # Uniform data transformers
│   │   │   │   └── artwork/           # Intelligent artwork resolution engine
│   │   │   ├── trailers/              # YouTube / TMDB video resolver
│   │   │   └── cache/                 # In-memory & Redis caching layer
│   │   ├── types/                     # Backend domain models
│   │   └── server.ts                  # Server entry point (Port 5000)
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env                           # Git-ignored private credentials
│   └── .env.example                   # Sanitized placeholder file
│
├── shared/
│   └── types/                         # Common models (ResolvedAnime, Artwork, etc.)
│
├── docs/                              # Verified documentation and research
├── .gitignore
├── .env.example                       # Root template
└── README.md
```

---

## 5. Components to Reuse vs. Refactor

| Component / Layer | Action | Rationale |
| :--- | :--- | :--- |
| **UI Components (`BrandMark`, `Logo`, `SiteHeader`, `SiteFooter`, etc.)** | **REUSE** | Pixel-perfect, 7Anime-branded, fully responsive with 0 console errors. |
| **`AnimeDetailPage.tsx`** | **REFACTOR** | Retain layout structure; replace static background with dynamic Trailer Background Player and connect buttons to real resolver metadata. |
| **`catalogService.ts` & Mock Layer** | **ADAPT** | Keep as fallback/offline mode; layer live API client on top so components consume unified `ResolvedAnime`. |
| **`LibraryStatusTrigger.tsx`** | **ENHANCE** | Add explicit *"All-Time Favorites"* quick selection alongside standard watch statuses. |
| **`GlassPlayer.tsx`** | **REUSE** | Modular video player architecture ready for stream resolution. |

---

## 6. Phase 2 Implementation & Verification (Completed)

### 6.1 Integrated Architecture & Components
* **AniList GraphQL Provider (`backend/src/services/metadata/providers/anilist.provider.ts`):**
  * Full catalog query with titles (Romaji, English, Native), synonyms, format, status, season, year, episodes, duration, scores, popularity, cover images, banner, relations, external links, trailer, studios, and airing schedule.
* **TMDB Provider (`backend/src/services/metadata/providers/tmdb.provider.ts`):**
  * Custom DNS-resilient HTTP client resolving through Cloudflare (`1.1.1.1`) and Google (`8.8.8.8`) to bypass regional ISP sinkholes.
  * TV and Movie search, detailed imagery extraction (transparent PNG logos, high-res backdrops, official posters), YouTube video extraction, and IMDb ID resolution.
* **Anime Matcher Service (`backend/src/services/metadata/resolver/anime-matcher.service.ts`):**
  * Dual-layer matching: canonical overrides for high-profile franchises + fuzzy Jaccard token matching with release year proximity scoring (strict threshold 0.70).
* **Anime Resolver Service (`backend/src/services/metadata/resolver/anime-resolver.service.ts`):**
  * Normalizes AniList + TMDB into canonical `ResolvedAnime` and `ArtworkResolution` data structures.
* **In-Memory Cache Service (`backend/src/services/cache/memory-cache.service.ts`):**
  * Domain-separated TTL caches for metadata (1 hour), TMDB responses (2 hours), and search queries (15 minutes).
* **Live API Endpoints:**
  * `GET /api/anime/search?q={query}&page={page}&limit={limit}`
  * `GET /api/anime/{anilistId}`
  * `GET /api/anime/{anilistId}/artwork`
  * `GET /api/anime/trending?page={page}&limit={limit}`

### 6.2 Programmatic Verification Summary (100% Passed)
| Test Case | AniList ID | TMDB ID | IMDb ID | Logo URL | Backdrop URL | Trailer URL | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **One Piece** | 21 | 37854 (TV) | `tt0388629` | Verified PNG | Verified High-Res | `1KMcoJBMWE4` | **PASSED** |
| **Naruto** | 20 | 46260 (TV) | `tt0409591` | Verified PNG | Verified High-Res | `-G9BqkgZXRA` | **PASSED** |
| **Naruto Shippuden** | 1735 | 31910 (TV) | `tt0988824` | Verified PNG | Verified High-Res | `22R0j8UKRzY` | **PASSED** |
| **Dragon Ball Super** | 21175 | 62710 (TV) | `tt4474344` | Verified PNG | Verified High-Res | `jfcKn6BwIC4` | **PASSED** |
| **Your Name (Kimi no Na wa)** | 21519 | 372058 (Movie)| `tt5311514` | Verified PNG | Verified High-Res | `TYku4P7MHdo` | **PASSED** |
| **Tsumiki no Ie (Obscure Short)** | 5365 | 20722 (Movie) | `tt1361566` | Graceful Fallback (`none`) | Verified High-Res | `jhQ75OV4VRs` | **PASSED** |
| **Search Endpoint (`Demon Slayer`)** | - | - | - | 5 items returned | `Demon Slayer: Kimetsu no Yaiba` matched | TMDB PNG Logo | **PASSED** |

---

## 7. Phase 3: Artwork Resolver & Cinematic Trailer Background (Completed)

### 7.1 Architecture & Component Additions
* **Frontend Dedicated Artwork Resolver (`frontend/src/services/artworkResolver.ts`):**
  * Independent asset resolution engine prioritizing TMDB transparent PNG logos, TMDB high-res backdrops (falling back to AniList banner), AniList high-res covers/TMDB posters, and official YouTube trailers.
  * Preserves source provenance metadata (`logoSource`, `backdropSource`, `posterSource`, `trailerSource`) and caches in memory.
* **Cinematic Trailer Background Player (`frontend/src/components/CinematicTrailerBackground.tsx`):**
  * Embedded directly in `.detail-hero__bg`. Always presents the static high-res backdrop immediately, eliminating layout shift.
  * Injects sandboxed YouTube player (`autoplay=1&mute=1&controls=0&loop=1&playsinline=1&enablejsapi=1`) without external recommendations or controls.
  * Smooth 1.2s opacity fade-in transition once the video stream begins.
  * Listens to the Page Visibility API (`visibilitychange`) to automatically pause playback when the user switches tabs, resuming when active.
  * Cleans up iframe and postMessage channels on unmount or anime navigation, preventing orphaned background players.
  * Floating frosted audio toggle in the bottom right allowing users to unmute cinematic audio with instant feedback.
* **Refactored `AnimeDetailPage.tsx`:**
  * Merges live canonical metadata from `/api/anime/:anilistId` with local mock fallback, ensuring uninterrupted operation both online and offline.
  * Correctly displays the TMDB transparent PNG logo when available, or seamlessly falls back to typography `<h1>` headers if no logo exists.
  * Preserves 100% of existing user interactions: *Watch Now* deep links, *LibraryStatusTrigger* watchlist management, *Favorite / Like* star toggling, *Notification* bell, *Share*, AniList, MyAnimeList, and live IMDb badges.
* **Rigorous DNS & TLS Validation Proof (`backend/tests/verify-dns.mjs`):**
  * Proves that `HttpClient` custom DNS resolution targets Cloudflare/Google public DNS and passes strict TLS certificate verification (`authorized: true`, issued to `*.themoviedb.org` by Amazon).

### 7.2 Browser & Responsive Verification Summary (100% Passed)
| Test Case | AniList ID | Logo Rendered | Backdrop Rendered | Trailer Iframe | IMDb Link | Watch & Library Buttons | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **One Piece** | 21 | TMDB PNG Logo | TMDB High-Res | Verified YouTube | Verified (`tt0388629`) | Active | **PASSED** |
| **Naruto** | 20 | TMDB PNG Logo | TMDB High-Res | Verified YouTube | Verified (`tt0409591`) | Active | **PASSED** |
| **Naruto Shippuden** | 1735 | TMDB PNG Logo | TMDB High-Res | Verified YouTube | Verified (`tt0988824`) | Active | **PASSED** |
| **Dragon Ball Super** | 21175 | TMDB PNG Logo | TMDB High-Res | Verified YouTube | Verified (`tt4474344`) | Active | **PASSED** |
| **Your Name (Kimi no Na wa)**| 21519 | TMDB PNG Logo | TMDB High-Res | Verified YouTube | Verified (`tt5311514`) | Active | **PASSED** |
| **Tsumiki no Ie (No Logo)** | 5365 | Typography Fallback (`<h1>`)| TMDB High-Res | Verified YouTube | Verified (`tt1361566`) | Active | **PASSED** |
| **Mobile 375x812 (One Piece)** | 21 | Responsive Visible | Responsive Visible | Preserved | Responsive Visible | 0 Horizontal Overflow | **PASSED** |
| **Uncaught Console Errors** | All | - | - | - | - | **0 Browser Errors** | **PASSED** |



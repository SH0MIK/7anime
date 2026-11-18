# 7ANIME_NEW — UI Implementation Plan & Sprint Roadmap

**Target Completion Date:** 24 November 2026  
**Current Date:** 17 November 2026  
**Operating Strategy:** Rapid, high-quality, component-driven frontend engineering in `E:\7ANIME_NEW` with mock data abstraction layer ready for future MongoDB/Express integration.

---

## 1. Timeline & Daily Milestones

| Day | Date | Milestone Focus | Key Deliverables |
|---|---|---|---|
| **Day 1** | Nov 17 | Direct ANI.PM Research & Design Direction | Live audit, screenshot capture, token extraction, theme mapping, architecture planning. |
| **Day 2** | Nov 18 | Frontend Initialization & Theme Engine | Vite + React + TS setup, Tailwind configuration, CSS token system, reactive Appearance store, Header / Navbar, Sidebar drawer. |
| **Day 3** | Nov 19 | Homepage & Discovery UI | Theatrical Hero carousel, Trending ribbons, Anime card grids with hover previews, Discovery filtering / sorting drawer. |
| **Day 4** | Nov 20 | Anime Details & Profile View | Comprehensive media detail view (banner, synopsis, episode matrix, voice audio tabs), User Profile (watchlist, history, stats). |
| **Day 5** | Nov 21 | Appearance Settings & Video Player UI | Dedicated Interactive Appearance Studio (Themes, Accents, Densities, Contrast checker), Modular Video Player UI (multi-server switcher, theater mode). |
| **Day 6** | Nov 22 | Responsive Perfection & Micro-Interactions | Mobile drawer navigation, bottom tab bar, touch optimizations, keyboard navigation shortcuts, smooth spring transitions. |
| **Day 7** | Nov 23-24 | QA, Performance Polish & Final Delivery | Cross-browser verification, Lighthouse score tuning (95+), zero TypeScript warnings, build validation, deployment preparation. |

---

## 2. Technical Stack & Dependencies

* **Build Tool:** Vite 6 / React 18 / TypeScript 5.
* **Styling Engine:** Tailwind CSS with dynamic CSS variable integration (`rgb(var(--seven-accent) / <alpha>)`).
* **Icons:** Lucide React (clean, consistent stroke width).
* **State Management:** Zustand (ultra-lightweight store for appearance, user preferences, watch history, and mock catalog).
* **Routing:** React Router v6 or TanStack Router (declarative client-side routing).
* **Mock Service Layer:** Typed TypeScript mock repositories (`animeService`, `historyService`, `settingsService`) with realistic anime metadata.

---

## 3. Directory Layout (`E:\7ANIME_NEW\client\`)

```text
client/
├── public/
│   ├── favicon.ico
│   └── banners/
├── src/
│   ├── app/
│   │   ├── App.tsx
│   │   └── router.tsx
│   ├── assets/
│   ├── components/
│   │   ├── common/         (Buttons, Badges, Modals, Sliders, Dropdowns, Tooltips)
│   │   ├── layout/         (Navbar, Sidebar, Footer, MobileTabBar)
│   │   ├── anime/          (AnimeCard, AnimeGrid, HeroCarousel, EpisodeList)
│   │   ├── player/         (PlayerContainer, ServerSelector, ControlsOverlay)
│   │   └── settings/       (ThemeSelector, AccentPicker, DensityToggle)
│   ├── features/
│   │   ├── appearance/     (appearanceStore, themeEngine, colorContrast)
│   │   ├── discovery/      (searchEngine, filterStore)
│   │   ├── catalog/        (animeData, mockCatalog)
│   │   └── player/         (playerStore, serverConfig)
│   ├── hooks/              (useMediaQuery, useLocalStorage, useKeyboard)
│   ├── styles/
│   │   ├── index.css
│   │   └── themes.css      (CSS variables for all 8 themes & 10 accents)
│   └── types/
│       ├── anime.ts
│       ├── appearance.ts
│       └── user.ts
├── index.html
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
```

---

## 4. Verification & QA Criteria

* **Appearance Reactivity:** Changing theme or accent applies instantaneously without flickering or requiring a reload.
* **Responsive Compliance:** Tested across 320px (iPhone SE), 375px (iPhone 13), 768px (iPad portrait), 1024px (iPad landscape/laptop), and 1440px+ (desktop).
* **Accessibility:** WCAG AA contrast compliance across all themes, keyboard navigable menus, ARIA labels on all icon buttons.
* **Code Hygiene:** Strict TypeScript mode (`noImplicitAny`), zero console warnings.

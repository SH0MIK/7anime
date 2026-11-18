# ANI.PM Design Research & Architectural Audit

**Date:** 17 November 2026  
**Target Site:** [https://ani.pm/](https://ani.pm/)  
**Inspection Mode:** Direct Chrome Headless Inspection & Live Asset Extraction  
**Saved Assets:** `E:\7ANIME_NEW\docs\research-assets\ani-pm\`

---

## 1. Executive Summary & Visual Philosophy

ANI.PM presents an exceptionally refined, modern, dark-first media streaming interface designed specifically for anime enthusiasts. Unlike traditional ad-cluttered anime streaming platforms, ANI.PM embraces minimalist, typography-led, cinematic design with fluid micro-interactions, subtle glassmorphism (`backdrop-blur`), and comprehensive appearance customization.

### Core Visual Pillars:
1. **Cinematic Hero Display:** Expansive edge-to-edge banners with multi-layer radial dark gradients, ensuring text contrast without heavy opaque overlays.
2. **Modular Card Architecture:** Fixed aspect ratio poster cards (approx. `2:3` standard anime poster ratio) with dynamic responsive clamping (`clamp(168px, 14.6vw, 222px)`).
3. **Subtle Elevation & Glassmorphism:** Layered surfaces using RGB alpha variables (`--c-surface`, `--c-surface2`, `--c-plum`), paired with spring-physics transitions (`--sb-spring: linear(...)`).
4. **Non-Intrusive Header (Sitebar):** Semi-transparent navigation bar with adaptive background shade that changes based on page scroll state (`data-over-art="true"`, `data-scrolled="false"`).

---

## 2. Component & Layout Breakdown

### A. Navigation & Header ("Sitebar")
* **Height:** `56px` on desktop, `44px` on compact/theater mode.
* **Layout:**
  * Left: Brand mark (`ANI.PM`) with mask-image icon.
  * Center: Primary navigation (`Home`, `Anime`, `Schedule`, `Manga`, `Discord`).
  * Right: Quick search trigger, notifications bell, sync tracker, user avatar.
* **State Behavior:**
  * When over hero art (`data-over-art="true"`): Transparent background, white text, enhanced contrast shadows.
  * When scrolled: Blurs underlying content (`backdrop-filter: blur(16px)`), solidifies background tint.

### B. Anime Card Grid
* **Card Width:** `clamp(168.75px, 14.625vw, 222.75px)`.
* **Gap:** `clamp(10px, 0.65vw, 13px)`.
* **Poster Elements:**
  * Rounded corners (`8px` to `12px`).
  * Subtle hover lift and scale transition (`transform: scale(1.025)`).
  * Audio badges (Sub / Dub episode counters) positioned top-right or bottom-right with high-contrast pill styling.
  * Title truncated to 2 lines with smooth font rendering (`line-height: 1.35`).

### C. Anime Details Page
* **Hero Backdrop:** Giant panoramic banner with high-resolution responsive webp images.
* **Metadata Grid:**
  * Large poster cover on the left with action buttons (`Watch Now`, `Add to List`, `Favorite`).
  * Right column: Native Japanese title, Romaji title, English title, genre badges, score pill, synopsis with expandable text, release schedule, studio info, and episode selector matrix.

### D. Settings Modal / Page
* **Clean Tabbed / Grouped Panel:**
  * Appearance (Theme, Accent, Card Size, Text Size, Motion, Frosted Blur).
  * Catalog & Titles (Title Language: English vs. Romaji/Native, Adult Content toggle, Discreet Mode).
  * Video Player (Default Server, Quality, Playback Speed, Auto-Skip Intro/Outro, Auto-Next).
  * Account & Connections (Tracker Sync, Connected Accounts).

---

## 3. Captured Screenshots

All high-resolution full-viewport screenshots were captured via headless browser automation and stored in:
`E:\7ANIME_NEW\docs\research-assets\ani-pm\`

| Screenshot File | Resolution | Description |
|---|---|---|
| `homepage.png` | 1440x900 | Hero showcase, carousel ribbons, trending grid, navigation bar |
| `browse.png` | 1440x900 | Catalog filtering, genre selector, sorting dropdown, search bar |
| `details.png` | 1440x900 | Anime banner, metadata, episode grid, watch status actions |
| `settings.png` | 1440x900 | Settings overview panel |
| `settings_appearance_full.png` | 1440x2400 | Complete scrollable appearance customization matrix |

---

## 4. Key Takeaways for 7Anime

1. **Adopt RGB-variable design tokens:** Define all colors as space-separated RGB triplets (`R G B`) to allow arbitrary opacity tweaking (`rgb(var(--c-accent) / 0.15)`).
2. **Implement Theme + Accent separation:** Decouple base dark/light background palettes from the interactive accent colors.
3. **Responsive Clamping:** Use CSS `clamp()` for poster cards, gutters, and typography rather than abrupt media query jumps.
4. **Preserve User Autonomy:** Give users immediate real-time feedback when customizing appearance without requiring page reloads.

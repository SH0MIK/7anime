# 7ANIME_NEW — Original Visual Identity & Design System

**Document Version:** 1.0  
**Design Phase:** Foundation & Appearance Architecture  
**Created:** 17 November 2026

---

## 1. Brand Identity & Vision

**7Anime** is a premier next-generation anime streaming and community platform.
While drawing inspiration from the technical elegance and customizable appearance of ANI.PM, 7Anime establishes its own distinct identity:
* **The "Seven" Aesthetic:** Inspired by clean cinematic minimalism, bold typography, Japanese editorial layouts, and gaming-grade UI precision.
* **Cinematic Storytelling:** Hero sections are designed to feel like theatrical posters, highlighting character art, key release dates, and audio availability without visual noise.
* **Original UI Architecture:** Not a template, not a cloned skin. Built around responsive modular tokens, robust accessibility, and lightning-fast transitions.

---

## 2. Token Architecture (CSS Custom Properties)

To achieve maximum theme adaptability, all color tokens are stored as raw RGB triplets (`R G B`) under the `:root` element. This enables clean dynamic opacity utilities in Tailwind CSS (`rgb(var(--seven-accent) / <alpha>)`).

### A. Core Token Variables

```css
:root {
  /* Dynamic Backgrounds */
  --seven-bg: 14 13 18;           /* Base viewport background */
  --seven-bg-subtle: 22 20 28;    /* Elevated containers, card backs */
  --seven-surface: 30 28 38;      /* Panels, modals, search bars */
  --seven-surface-hover: 42 39 52;/* Hover and active states */
  
  /* Borders & Dividers */
  --seven-border: 45 42 56;
  --seven-border-subtle: 36 33 46;

  /* Typography */
  --seven-text-primary: 245 243 248;   /* 98% contrast */
  --seven-text-secondary: 175 168 188; /* 70% contrast */
  --seven-text-muted: 128 120 142;     /* 50% contrast */

  /* Primary Interactive Accent (Default: Cyber Amber / Gold) */
  --seven-accent: 255 184 77;          /* #FFB84D */
  --seven-accent-bright: 255 204 128;   /* #FFCC80 */
  --seven-accent-glow: rgba(255, 184, 77, 0.25);

  /* Layout Tokens */
  --seven-card-width: clamp(165px, 14vw, 220px);
  --seven-card-gap: clamp(12px, 1vw, 18px);
  --seven-radius-sm: 6px;
  --seven-radius-md: 10px;
  --seven-radius-lg: 16px;
  --seven-radius-full: 9999px;

  /* Header and Navigation */
  --seven-header-height: 64px;
  --seven-sidebar-width: 260px;
}
```

---

## 3. Seven Signature Themes

7Anime introduces 8 curated base themes, spanning modern OLED darks to paper-inspired light modes:

1. **Obsidian (Pure OLED):** Deep `#000000` pitch black designed for OLED displays and battery efficiency.
2. **Eclipse (Default Dark):** Deep charcoal violet (`#0e0d12`) with rich subtle ambient warmth.
3. **Midnight Shinigami:** Deep oceanic navy (`#090d16`) with cool indigo undertones.
4. **Crimson Katana:** Rich dark bordeaux (`#140a0e`) with subtle ruby accents.
5. **Cyberpunk Slate:** Modern steel blue-gray (`#0f1218`) with crisp technical separation.
6. **Bamboo Grove:** Deep forest night (`#0a120e`) with serene natural green depth.
7. **Sakura Light:** Elegant soft blush (`#f9f2f0`) with gentle crimson contrasts.
8. **Kami Paper:** Warm off-white parchment (`#f5ede0`) inspired by classic manga paper.

---

## 4. Accent Color Spectrum (10 Curated Tones + Custom)

* **Solar Gold (7Anime Signature):** `#FFB84D` — Warm, heroic, and energetic.
* **Sakura Pink:** `#FF7597` — Anime spring blossom aesthetic.
* **Electric Cyan:** `#00E5FF` — High-tech cyberpunk aesthetic.
* **Neon Mint:** `#00F5A0` — Crisp, modern, and refreshing.
* **Akira Crimson:** `#FF334B` — Bold, theatrical action red.
* **Phantom Violet:** `#A78BFA` — Deep mystical manga vibe.
* **Sky Azure:** `#38BDF8` — Serene Shonen blue.
* **Sunset Coral:** `#FB7185` — Rich cinematic horizon.
* **Ghost White:** `#FFFFFF` — Minimalist high-fashion monochrome.
* **Custom Hex Mode:** Real-time color picker with auto-computed contrast safety check.

---

## 5. UI Spacing & Typography Hierarchy

* **Primary Font Family:** `Inter`, `Plus Jakarta Sans`, or `system-ui` for extreme UI clarity.
* **Japanese Display Accents:** `Noto Sans JP` for native title rendering.
* **Type Scale:**
  * **Hero Display:** `clamp(2rem, 4.5vw, 3.5rem)` — Bold, tracked tight (`-0.03em`).
  * **Section Headings:** `1.5rem` (`24px`), font-bold (`700`).
  * **Card Titles:** `0.9375rem` (`15px`), font-medium (`500`), line-clamp-2.
  * **Metadata & Badges:** `0.75rem` (`12px`), font-semibold, tracked wide (`0.05em`).
  * **Body:** `0.9375rem` (`15px`), line-height `1.6`.

---

## 6. Micro-Interactions & Motion Strategy

* **Spring Motion:** Avoid robotic linear transitions; use natural cubic-bezier springs (`cubic-bezier(0.16, 1, 0.3, 1)`).
* **Hover State on Cards:** Elevates card upward by `4px`, dims adjacent cards slightly when browsing carousels, and activates glowing accent outline.
* **Accessibility First:** Full support for `prefers-reduced-motion: reduce`, disabling all parallax and 3D transforms while preserving functional opacity fades.

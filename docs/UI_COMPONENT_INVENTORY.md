# 7ANIME_NEW — UI Component Inventory & Architecture

**Document Version:** 1.0  
**Created:** 17 November 2026

---

## 1. Core Component Hierarchy

| Category | Component Name | Description | Key Props / State |
|---|---|---|---|
| **Layout** | `Navbar` | Top navigation bar with dynamic backdrop blur on scroll | `scrolled`, `activeRoute`, `searchOpen` |
| **Layout** | `SidebarDrawer` | Collapsible navigation drawer for desktop and tablet | `collapsed`, `open`, `onToggle` |
| **Layout** | `MobileTabBar` | Bottom sticky navigation bar for mobile viewports (< 768px) | `activeTab`, `unreadCount` |
| **Layout** | `AppShell` | Root layout wrapper handling theme classes and page padding | `theme`, `accent`, `cardSize`, `motion` |
| **Anime** | `AnimeCard` | Responsive poster card with Sub/Dub pills, score, and title | `anime`, `size` (`compact`/`cozy`/`large`), `priority` |
| **Anime** | `AnimeGrid` | Fluid responsive grid container using CSS clamp widths | `items`, `loading`, `emptyMessage` |
| **Anime** | `HeroCarousel` | Cinematic header slider with synopsis, play button, and trailer | `featuredAnime[]`, `autoPlayInterval` |
| **Anime** | `EpisodeGrid` | Interactive episode selector matrix with thumbnail preview | `episodes[]`, `currentEpisode`, `onSelect` |
| **Player** | `PlayerContainer` | Responsive 16:9 video player viewport with theater & fullscreen | `server`, `episode`, `theaterMode` |
| **Player** | `ServerSelector` | Generic server switcher (Server 1, Server 2, Server 3, Server 4) | `servers[]`, `activeServer`, `onSelect` |
| **Player** | `PlayerControls` | Custom control overlay (play/pause, volume, seek, speed, skip) | `playing`, `currentTime`, `duration`, `volume` |
| **Appearance** | `ThemeGrid` | Visual grid selector for the 8 base color palettes | `activeTheme`, `onSelect`, `systemTheme` |
| **Appearance** | `AccentSwatches` | Color swatch row for the 10 curated accents | `activeAccent`, `onSelect` |
| **Appearance** | `CustomColorPicker` | Hex input and interactive color picker with contrast alert | `hexValue`, `onChange`, `onReset` |
| **Appearance** | `DensitySelector` | Layout density switcher (`Compact`, `Cozy`, `Large`) | `density`, `onChange` |
| **Common** | `Button` | Reusable button with variants (`primary`, `secondary`, `ghost`, `danger`) | `variant`, `size`, `icon`, `loading` |
| **Common** | `Badge` | High-contrast label for Sub, Dub, Score, Quality, Status | `label`, `tone` (`accent`, `neutral`, `success`) |
| **Common** | `Modal` | Accessible dialog with backdrop blur and escape dismissal | `isOpen`, `onClose`, `title`, `children` |
| **Common** | `Tabs` | Accessible tab strip with animated indicator | `tabs[]`, `activeTab`, `onChange` |

---

## 2. Shared Common Primitives

* `Input` & `SearchInput`: Search bar with instant debounced callback and clear button.
* `Dropdown`: Accessible popover menu for filters, sorting, and user options.
* `SkeletonLoader`: Shimmering placeholder cards mimicking exact card dimensions during data fetch.
* `Tooltip`: Informative hover tooltip with arrow pointer.

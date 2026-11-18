# ANI.PM Appearance Customization Deep-Dive Audit

**Audited Source Artifacts:** `index-qqzsmb_e.css`, `Settings-BfwLwLFQ.js`, `index-BFdQstQx.js`  
**Inspection Date:** 17 November 2026

---

## 1. Overview of the Appearance System

ANI.PM features one of the most sophisticated appearance customization architectures among modern media streaming web applications. Its architecture decouples:
1. **Base Color Schemes (Themes):** 12 curated themes across dark and light palettes.
2. **Interactive Accents:** 14 distinct accent color presets.
3. **Custom Hex Color Engine:** Custom user-defined background, surface, elevated, and accent colors with automatic luminance/contrast computation.
4. **Layout & Content Density:** Configurable card sizing (`compact`, `cozy`, `large`) and base text size (`small`, `default`, `large`).
5. **Visual Effects & Motion:** Reduced motion toggle and backdrop blur (`frosted glass`) control.

---

## 2. Curated Base Themes (12 Palettes)

ANI.PM organizes themes into Dark (8) and Light (4) presets. Each theme configures:
- `--c-bg`: Base viewport background.
- `--c-bg2`: Secondary background / drawer panels.
- `--c-surface`: Component surface (card backgrounds, search bars).
- `--c-surface2`: Interactive surface hover state.
- `--c-text`, `--c-text2`, `--c-text3`: High, medium, and low contrast typography.
- `--c-line`: Dividers, borders, and card outlines.
- `--bg-grad`: Subtle multi-stop radial gradient for depth.

### Theme Matrix:

| Theme ID | Display Label | Mode | Background (`--c-bg`) | Surface (`--c-surface`) | Distinctive Characteristic |
|---|---|---|---|---|---|
| `dark` | **Graphite** | Dark (Default) | `16 14 17` (`#1a181d`) | `41 38 47` (`#29262e`) | Neutral charcoal with subtle warmth |
| `noir` | **Noir** | Dark | `13 7 11` (`#150b12`) | `35 20 29` (`#2a1722`) | Deep plum/burgundy undertone |
| `midnight` | **Midnight** | Dark | `7 8 13` (`#0b0e16`) | `22 27 41` (`#1c2233`) | Deep indigo/navy night sky |
| `obsidian` | **Obsidian** | Dark | `0 0 0` (`#000000`) | `20 20 20` (`#1c1c21`) | Pure true-black OLED display |
| `slate` | **Slate** | Dark | `10 11 14` (`#111318`) | `30 34 43` (`#262b36`) | Modern cool-slate blue-gray |
| `forest` | **Forest** | Dark | `7 12 10` (`#0c140f`) | `23 35 29` (`#17231d`) | Deep pine / evergreen atmosphere |
| `wine` | **Wine** | Dark | `13 7 9` (`#160c0f`) | `38 21 27` (`#26141b`) | Rich ruby and vintage wine tones |
| `ocean` | **Ocean** | Dark | `5 11 13` (`#08141a`) | `19 34 41` (`#132229`) | Deep abyssal teal / cyan dark |
| `light` | **Blush** | Light | `247 240 236` (`#f7f0ec`) | `255 252 250` (`#faf2ef`) | Soft warm blush rose |
| `paper` | **Paper** | Light | `244 237 222` (`#f4edde`) | `252 247 235` (`#f7f0e0`) | Parchment / warm sepia book tone |
| `mist` | **Mist** | Light | `240 242 246` (`#f0f2f6`) | `252 253 255` (`#f5f7fa`) | Cool silver overcast light |
| `snow` | **Snow** | Light | `250 251 253` (`#fafbfd`) | `255 255 255` (`#ffffff`) | Crisp, high-contrast pure white |

---

## 3. Curated Accent Colors (14 Presets)

Each accent sets two core CSS tokens:
- `--c-accent`: Primary interactive state (buttons, badges, active links, glow highlights).
- `--c-accent-bright`: Enhanced brightness for hover states, focus rings, and high-visibility alerts.

| Accent Name | `--c-accent` (RGB) | `--c-accent-bright` (RGB) | Visual Character |
|---|---|---|---|
| `rose` | `233 138 166` | `243 166 189` | Soft cherry blossom pink |
| `coral` | `244 150 122` | `248 176 152` | Vibrant warm coral |
| `crimson` | `232 96 112` | `244 132 145` | Bold red-scarlet |
| `gold` | `227 179 120` | `240 201 150` | Elegant metallic anime gold |
| `amber` | `240 178 92` | `248 200 134` | Warm golden-orange sunset |
| `emerald` | `132 201 160` | `162 216 186` | Crisp natural emerald |
| `mint` | `128 216 172` | `162 228 196` | Fresh energetic mint green |
| `teal` | `88 200 190` | `130 217 209` | Modern high-tech cyber teal |
| `sky` | `126 178 216` | `158 201 231` | Serene daylight sky blue |
| `cyan` | `96 200 226` | `138 216 236` | Electric anime cyan |
| `indigo` | `140 150 234` | `170 178 242` | Deep anime royal indigo |
| `violet` (Default) | `178 156 224` | `200 182 236` | Signature pastel lavender/violet |
| `fuchsia` | `227 138 197` | `241 169 215` | Electric anime magenta |
| `white` | `255 255 255` | `255 255 255` | Monochrome minimalism (paired with red play button) |

---

## 4. Custom Hex Color Engine & Mathematical Contrast

In addition to presets, the live source reveals an algorithmic custom color generator:
```javascript
// From ANI.PM index-BFdQstQx.js:
function Ju(hex) {
  const [t, n, r] = Dt(hex).map(o => {
    const s = o / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * t + 0.7152 * n + 0.0722 * r; // Relative luminance calculation
}
```
* Users can specify custom `#hex` codes for Background and Primary Accent.
* The system automatically computes luminance and adjusts text colors between light (`#f1f1f1`) and dark (`#111111`) to prevent unreadable contrast traps.

---

## 5. Layout & Typography Customization

* **Card Sizing Options:**
  * `Compact`: `--anime-card-width: clamp(138px, 12vw, 180px)` (shows more cards per row, ideal for high-density catalog browsing).
  * `Cozy` (Default): `--anime-card-width: clamp(168.75px, 14.625vw, 222.75px)` (optimal balance between poster art and screen space).
  * `Large`: `--anime-card-width: clamp(200px, 18vw, 260px)` (showcase mode for large displays).
* **Text Sizing Options:**
  * `Small` (90% base font scale).
  * `Default` (100% standard font scale).
  * `Large` (112% accessibility scale).
* **System Theme Follow:**
  * Auto-selects `Snow` when system is light, `Obsidian` when system is dark.

---

## 6. Persistence Mechanism

* ANI.PM stores appearance configuration in `localStorage` under keys `theme`, `accent`, `themeAuto`, `cardSize`, `textSize`, `interfaceMotion`, `customColors`.
* When loaded, an inline script executes before the first paint to set `data-theme="..."` and `data-accent="..."` on `<html>`, eliminating Flash of Unstyled Content (FOUC).

# Gymify RPG - Harvested Production Assets & Design Vault

All assets in this directory were audited and harvested directly from the live `gymify-phi.vercel.app` production deployment. They are bundled locally into the mobile client package to guarantee zero-latency offline rendering, offline workout support, and design fidelity across iOS, Android, and Web.

---

## Directory Structure

```
apps/mobile/assets/
├── audio/                      # Audio SFX and ambience
├── fonts/                      # Production typography (.woff2 web fonts)
│   ├── cinzel-black-900.woff2
│   ├── cinzel-black.woff2
│   ├── cinzel-bold.woff2
│   ├── cinzel-decorative.woff2
│   ├── cinzel-latin-ext.woff2
│   ├── cinzel-latin.woff2
│   ├── inter-latin-ext.woff2
│   ├── inter-latin.woff2
│   └── inter-variable.woff2
├── images/                     # Production raster graphics and app icons
│   ├── adventurer-portrait.png # Full-body Crimson Oni character hero artwork (1024x1024, 1.78 MB)
│   ├── apple-icon.png          # iOS home screen touch icon (180x180, 2.6 KB)
│   ├── icon-light-32x32.png    # Light mode favicon (32x32, 566 B)
│   └── icon-dark-32x32.png     # Dark mode favicon (32x32, 585 B)
├── sprites/                    # 2D Auto-battler combat sprites & animation sheets
├── styles/                     # Tailwind design tokens and compiled CSS
│   └── v0-design-system.css    # Full v0 stylesheet with design system variables (78.8 KB)
└── svg/                        # Scalable Vector Graphics
    ├── chests/                 # Common, Rare, Epic, Mythic animated loot chests
    ├── hud/                    # Filigree borders, stat radar, stamina timer & gathering rings
    ├── icons/                  # High-density UI action icons (sword, shield, trophy, skull, etc.)
    │   └── icon.svg            # Official Gymify monochrome / dark geometric app icon
    ├── modalities/             # 8 Modality badges (Resistance, Cardio, Calisthenics, Yoga, etc.)
    ├── ranks/                  # 7 Adventurer rank crests (Copper -> Mythic)
    ├── stats/                  # 7 Core stat glyphs (STR, END, AGI, DEX, CON, WIS, SPR)
    └── talents/                # Constellation star map talent tree
```

---

## 1. Typography & Web Fonts

Harvested Next.js production font subsets for the dual-font design system:

| Font Family | Style / Weight | File | Purpose |
|---|---|---|---|
| **Cinzel** | Regular (500) | `cinzel-latin.woff2` | Display serif, section headers, world titles |
| **Cinzel** | Bold (700) | `cinzel-bold.woff2` | Adventurer ranks, primary CTA titles |
| **Cinzel** | Black (900) | `cinzel-black-900.woff2`, `cinzel-black.woff2` | Hero level badges, stat numbers |
| **Cinzel** | Decorative | `cinzel-decorative.woff2` | Ornamental chapter titles |
| **Cinzel** | Latin Extended | `cinzel-latin-ext.woff2` | Extended character glyphs |
| **Inter** | Variable (100–900) | `inter-variable.woff2` | UI body typography, workout telemetry, tabular logs |
| **Inter** | Latin (400–700) | `inter-latin.woff2` | Subtitles, set metadata, tooltips |
| **Inter** | Latin Extended | `inter-latin-ext.woff2` | Diacritics and special characters |

---

## 2. Raster Artwork & Icons

| File | Resolution | Format | Role & Implementation |
|---|---|---|---|
| `adventurer-portrait.png` | 1024×1024 | PNG (RGBA) | Default hero portrait rendered in `CharacterPortraitFrame.tsx` (`DEFAULT_HERO_PORTRAIT`) |
| `apple-icon.png` | 180×180 | PNG (RGBA) | High-DPI iOS application icon asset |
| `icon-light-32x32.png` | 32×32 | PNG (RGBA) | Web/PWA light-theme browser icon |
| `icon-dark-32x32.png` | 32×32 | PNG (RGBA) | Web/PWA dark-theme browser icon |

---

## 3. Core Design Tokens (from `v0-design-system.css`)

Exported in `apps/mobile/src/assets/v0Vault.ts` as `V0_DESIGN_TOKENS` and integrated with `CRIMSON_ONI`:

```ts
export const V0_DESIGN_TOKENS = {
  colors: {
    black: '#000000',
    white: '#FFFFFF',
    crimson: '#5E1924',
    crimsonGlow: '#8B2637',
    gold: '#C69A45',
    goldBright: '#DFB660',
    goldMuted: '#A8743A',
    charcoal: '#1A191C',
    charcoalCard: '#121722',
    ghost: '#E8E6E1',
    border: '#2A0C11',
    borderNavy: '#273248',
  },
  typography: {
    fontDisplay: 'Cinzel',
    fontSans: 'Inter',
  },
};
```

---

## 4. Usage in TypeScript / React Native Components

All assets are exported with TypeScript types from `apps/mobile/src/assets/v0Vault.ts`:

```tsx
import {
  STAT_GLYPH_SVGS,
  RANK_CREST_SVGS,
  LOOT_CHEST_SVGS,
  HUD_SVGS,
  V0_IMAGES,
  V0_DESIGN_TOKENS,
} from '../assets/v0Vault';
import { SvgXml } from 'react-native-svg';

// 1. Render character hero portrait
<Image source={V0_IMAGES.adventurerPortrait} style={{ width: 280, height: 280 }} />

// 2. Render SVG Rank Crest
<SvgXml xml={RANK_CREST_SVGS.COPPER} width={36} height={36} />

// 3. Render Corner Filigree
<SvgXml xml={HUD_SVGS.cornerFiligreeLarge} width={40} height={40} />
```

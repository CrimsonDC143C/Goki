export const COLORS = {
  bgDeep: '#090C12',
  bgCard: '#121722',
  bgElevated: '#1A2232',
  border: '#273248',
  borderHighlight: '#3B4B6B',
  textPrimary: '#F3F6FC',
  textSecondary: '#9BA8C2',
  textMuted: '#64738F',

  gold: '#F5B841',
  goldDim: '#3D2E12',

  strength: '#EF5350',
  strengthDim: '#3B181B',

  endurance: '#26A69A',
  enduranceDim: '#103330',

  agility: '#42A5F5',
  agilityDim: '#132A42',

  mythic: '#AB47BC',
  success: '#4CAF50',
  warning: '#FFA726',
  danger: '#EF5350',
  shieldCyan: '#26C6DA',
} as const;

/**
 * "Crimson Oni" Dark-Fantasy Palette for App Landing Screen & Character Hub
 */
export const CRIMSON_ONI = {
  charcoalBase: '#1A191C',
  charcoalDeep: '#121114',
  charcoalCard: '#232127',
  charcoalElevated: '#2C2A31',
  crimson: '#5E1924',
  crimsonGlow: '#8B2637',
  crimsonDim: '#341016',
  agedGold: '#C69A45',
  agedGoldBright: '#DFB660',
  agedGoldDim: '#352A15',
  ghostWhite: '#E8E6E1',
  ashGray: '#7A787D',
  ashMuted: '#565459',
  border: '#36333B',
  borderGold: 'rgba(198, 154, 69, 0.5)',
  borderCrimson: 'rgba(94, 25, 36, 0.9)',
} as const;

export const RARITY_COLORS: Record<string, string> = {
  COMMON: '#9BA8C2',
  UNCOMMON: '#4CAF50',
  RARE: '#42A5F5',
  EPIC: '#AB47BC',
  LEGENDARY: '#FFA726',
  MYTHIC: '#EF5350',
};

/**
 * Layered Dark-Slate Surface System (Milestone 1)
 * Replaces nested 4-sided borders with subtle luminance elevation and hairline dividers.
 */
export const SURFACES = {
  canvas: '#0B0E14',
  layer1: '#111620',
  layer2: '#171E2B',
  layer3: '#1F2838',
  layerHover: '#263145',
  scrim: 'rgba(6, 8, 13, 0.78)',
  hairline: 'rgba(148, 163, 184, 0.12)',
  hairlineStrong: 'rgba(148, 163, 184, 0.22)',
  goldHairline: 'rgba(245, 184, 65, 0.28)',
  emeraldTint: 'rgba(16, 185, 129, 0.11)',
} as const;

export const TYPOGRAPHY = {
  display: {
    fontSize: 22,
    fontWeight: '800' as const,
    letterSpacing: -0.2,
    color: '#F3F6FC',
  },
  titleLg: {
    fontSize: 17,
    fontWeight: '800' as const,
    letterSpacing: 0.1,
    color: '#F3F6FC',
  },
  titleMd: {
    fontSize: 15,
    fontWeight: '700' as const,
    letterSpacing: 0.1,
    color: '#F3F6FC',
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800' as const,
    letterSpacing: 0.9,
    textTransform: 'uppercase' as const,
    color: '#9BA8C2',
  },
  body: {
    fontSize: 13,
    fontWeight: '500' as const,
    lineHeight: 19,
    color: '#F3F6FC',
  },
  bodySm: {
    fontSize: 12,
    fontWeight: '500' as const,
    lineHeight: 17,
    color: '#9BA8C2',
  },
  caption: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: '#64738F',
  },
  tabular: {
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const RADII = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 999,
} as const;

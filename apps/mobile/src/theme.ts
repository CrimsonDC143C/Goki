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

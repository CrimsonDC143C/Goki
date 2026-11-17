import { CoreStatBlock, normalizeCoreStatBlock } from './types';

// ============================================================================
// A. Cosmetic Races (Zero Stat / Combat Cap Differences)
// ============================================================================

export type CharacterRace = 'HUMAN' | 'ONI' | 'KITSUNE';

export const CHARACTER_RACES: readonly CharacterRace[] = ['HUMAN', 'ONI', 'KITSUNE'] as const;

export type SkinPaletteId =
  | 'porcelain_ivory'
  | 'warm_amber'
  | 'sun_bronze'
  | 'rich_umber'
  | 'deep_obsidian_tan'
  | 'crimson_oni'
  | 'ashen_slate'
  | 'indigo_dusk'
  | 'obsidian_iron'
  | 'ivory_fox'
  | 'golden_inari'
  | 'silver_mist'
  | 'midnight_fox';

export interface RaceDefinition {
  id: CharacterRace;
  name: string;
  tagline: string;
  lore: string;
  cosmeticOnly: true;
  statCapMultiplier: 1;
  supportsOniHorns: boolean;
  supportsKitsuneTails: boolean;
  defaultSkinPaletteId: SkinPaletteId;
  allowedSkinPaletteIds: readonly SkinPaletteId[];
}

export const RACE_DEFINITIONS: Record<CharacterRace, RaceDefinition> = {
  HUMAN: {
    id: 'HUMAN',
    name: 'Human',
    tagline: 'Unbroken Discipline',
    lore: 'Forged through pure training and relentless will, mastering every martial discipline without innate markings.',
    cosmeticOnly: true,
    statCapMultiplier: 1,
    supportsOniHorns: false,
    supportsKitsuneTails: false,
    defaultSkinPaletteId: 'warm_amber',
    allowedSkinPaletteIds: [
      'porcelain_ivory',
      'warm_amber',
      'sun_bronze',
      'rich_umber',
      'deep_obsidian_tan',
    ],
  },
  ONI: {
    id: 'ONI',
    name: 'Oni',
    tagline: 'Horned Vanguard',
    lore: 'Marked by nascent crown horns that awaken alongside wisdom and spirit, channeling raw presence into form.',
    cosmeticOnly: true,
    statCapMultiplier: 1,
    supportsOniHorns: true,
    supportsKitsuneTails: false,
    defaultSkinPaletteId: 'crimson_oni',
    allowedSkinPaletteIds: [
      'crimson_oni',
      'ashen_slate',
      'indigo_dusk',
      'obsidian_iron',
      'warm_amber',
      'sun_bronze',
    ],
  },
  KITSUNE: {
    id: 'KITSUNE',
    name: 'Kitsune',
    tagline: 'Astral Fox',
    lore: 'Guided by ancient spirit, unfolding up to nine luminous tails as wisdom and inner calm deepen.',
    cosmeticOnly: true,
    statCapMultiplier: 1,
    supportsOniHorns: false,
    supportsKitsuneTails: true,
    defaultSkinPaletteId: 'ivory_fox',
    allowedSkinPaletteIds: [
      'ivory_fox',
      'golden_inari',
      'silver_mist',
      'midnight_fox',
      'porcelain_ivory',
      'warm_amber',
    ],
  },
};

// ============================================================================
// B. Level-1 Base Identity Options (All Unlocked at Level 1)
// ============================================================================

export type HairStyleId =
  | 'ronin_topknot'
  | 'windswept_short'
  | 'braided_crest'
  | 'flowing_mane'
  | 'cropped_fade'
  | 'shaved_monk';

export type HairColorId =
  | 'raven_black'
  | 'snow_white'
  | 'crimson_ash'
  | 'burnished_gold'
  | 'midnight_indigo'
  | 'copper_flame'
  | 'silver_frost';

export type FaceStyleId = 'stoic' | 'fierce' | 'serene' | 'battle_grin';

export type EyeStyleId = 'sharp' | 'noble' | 'slit_predator' | 'mystic_glow';

export type EyeColorId =
  | 'amber_gold'
  | 'crimson_ruby'
  | 'jade_emerald'
  | 'astral_violet'
  | 'frost_cyan'
  | 'obsidian_dark';

export type BaseSilhouetteId = 'balanced' | 'lithe' | 'broad_shouldered';

export const HAIR_STYLE_OPTIONS: readonly { id: HairStyleId; label: string }[] = [
  { id: 'ronin_topknot', label: 'Ronin Topknot' },
  { id: 'windswept_short', label: 'Windswept Short' },
  { id: 'braided_crest', label: 'Braided Crest' },
  { id: 'flowing_mane', label: 'Flowing Mane' },
  { id: 'cropped_fade', label: 'Cropped Fade' },
  { id: 'shaved_monk', label: 'Shaved Monk' },
] as const;

export const HAIR_COLOR_OPTIONS: readonly {
  id: HairColorId;
  label: string;
  primaryHex: string;
  highlightHex: string;
}[] = [
  { id: 'raven_black', label: 'Raven Black', primaryHex: '#1A1C24', highlightHex: '#3A3F52' },
  { id: 'snow_white', label: 'Snow White', primaryHex: '#E8ECF4', highlightHex: '#FFFFFF' },
  { id: 'crimson_ash', label: 'Crimson Ash', primaryHex: '#8C232C', highlightHex: '#C9424E' },
  { id: 'burnished_gold', label: 'Burnished Gold', primaryHex: '#C79234', highlightHex: '#F2C76B' },
  { id: 'midnight_indigo', label: 'Midnight Indigo', primaryHex: '#252B52', highlightHex: '#4B5699' },
  { id: 'copper_flame', label: 'Copper Flame', primaryHex: '#B84A24', highlightHex: '#E87442' },
  { id: 'silver_frost', label: 'Silver Frost', primaryHex: '#9BA5B8', highlightHex: '#D2DBE8' },
] as const;

export const FACE_STYLE_OPTIONS: readonly { id: FaceStyleId; label: string }[] = [
  { id: 'stoic', label: 'Stoic' },
  { id: 'fierce', label: 'Fierce' },
  { id: 'serene', label: 'Serene' },
  { id: 'battle_grin', label: 'Battle Grin' },
] as const;

export const EYE_STYLE_OPTIONS: readonly { id: EyeStyleId; label: string }[] = [
  { id: 'sharp', label: 'Sharp' },
  { id: 'noble', label: 'Noble' },
  { id: 'slit_predator', label: 'Slit Predator' },
  { id: 'mystic_glow', label: 'Mystic Glow' },
] as const;

export const EYE_COLOR_OPTIONS: readonly { id: EyeColorId; label: string; hex: string }[] = [
  { id: 'amber_gold', label: 'Amber Gold', hex: '#F59E0B' },
  { id: 'crimson_ruby', label: 'Crimson Ruby', hex: '#EF4444' },
  { id: 'jade_emerald', label: 'Jade Emerald', hex: '#10B981' },
  { id: 'astral_violet', label: 'Astral Violet', hex: '#A855F7' },
  { id: 'frost_cyan', label: 'Frost Cyan', hex: '#22D3EE' },
  { id: 'obsidian_dark', label: 'Obsidian Dark', hex: '#1F2937' },
] as const;

export const SKIN_PALETTE_OPTIONS: readonly {
  id: SkinPaletteId;
  label: string;
  baseHex: string;
  shadowHex: string;
  highlightHex: string;
  earInnerHex: string;
}[] = [
  {
    id: 'porcelain_ivory',
    label: 'Porcelain Ivory',
    baseHex: '#F3DFD3',
    shadowHex: '#D5B8A8',
    highlightHex: '#FFF3EC',
    earInnerHex: '#E0ABA1',
  },
  {
    id: 'warm_amber',
    label: 'Warm Amber',
    baseHex: '#DDA87F',
    shadowHex: '#B68059',
    highlightHex: '#F2C8A6',
    earInnerHex: '#C7826E',
  },
  {
    id: 'sun_bronze',
    label: 'Sun Bronze',
    baseHex: '#B97A50',
    shadowHex: '#8E5734',
    highlightHex: '#D49A71',
    earInnerHex: '#A2604A',
  },
  {
    id: 'rich_umber',
    label: 'Rich Umber',
    baseHex: '#7D4E32',
    shadowHex: '#59341E',
    highlightHex: '#9C6949',
    earInnerHex: '#75463B',
  },
  {
    id: 'deep_obsidian_tan',
    label: 'Deep Obsidian Tan',
    baseHex: '#4C3022',
    shadowHex: '#331E14',
    highlightHex: '#694635',
    earInnerHex: '#52342D',
  },
  {
    id: 'crimson_oni',
    label: 'Crimson Oni',
    baseHex: '#B93838',
    shadowHex: '#852222',
    highlightHex: '#DE5B5B',
    earInnerHex: '#7A2430',
  },
  {
    id: 'ashen_slate',
    label: 'Ashen Slate',
    baseHex: '#7B8494',
    shadowHex: '#565E6D',
    highlightHex: '#A1AAB9',
    earInnerHex: '#6E667A',
  },
  {
    id: 'indigo_dusk',
    label: 'Indigo Dusk',
    baseHex: '#4E5888',
    shadowHex: '#343B61',
    highlightHex: '#707BB0',
    earInnerHex: '#63537D',
  },
  {
    id: 'obsidian_iron',
    label: 'Obsidian Iron',
    baseHex: '#3B3F4A',
    shadowHex: '#23262E',
    highlightHex: '#585E6E',
    earInnerHex: '#4C4352',
  },
  {
    id: 'ivory_fox',
    label: 'Ivory Fox',
    baseHex: '#F5EDE4',
    shadowHex: '#D7C8B9',
    highlightHex: '#FFFFFF',
    earInnerHex: '#E8A59E',
  },
  {
    id: 'golden_inari',
    label: 'Golden Inari',
    baseHex: '#E2AC5B',
    shadowHex: '#B68136',
    highlightHex: '#F6CB84',
    earInnerHex: '#D98F79',
  },
  {
    id: 'silver_mist',
    label: 'Silver Mist',
    baseHex: '#C7D1DE',
    shadowHex: '#9BA6B6',
    highlightHex: '#E8EFF8',
    earInnerHex: '#C9A3B2',
  },
  {
    id: 'midnight_fox',
    label: 'Midnight Fox',
    baseHex: '#383C54',
    shadowHex: '#222538',
    highlightHex: '#555C7D',
    earInnerHex: '#7A5470',
  },
] as const;

export const BASE_SILHOUETTE_OPTIONS: readonly {
  id: BaseSilhouetteId;
  label: string;
  description: string;
}[] = [
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'Proportionate martial frame with neutral shoulder and waist ratios.',
  },
  {
    id: 'lithe',
    label: 'Lithe',
    description: 'Sleeker limbs and tapered waist suited to agile silhouettes.',
  },
  {
    id: 'broad_shouldered',
    label: 'Broad Shouldered',
    description: 'Wider collarbones and upper frame presence from day one.',
  },
] as const;

// ============================================================================
// C. 7-Stat Opt-In Aesthetic Morph Tiers & Threshold Rules
// ============================================================================

export type MuscleMassTier = 0 | 1 | 2 | 3 | 4;
export type FrameStatureTier = 0 | 1 | 2 | 3 | 4;
export type LeanDefinitionTier = 0 | 1 | 2 | 3;
export type CombatStanceId =
  | 'neutral'
  | 'agile_ready'
  | 'iaido_poise'
  | 'acrobat_guard'
  | 'phantom_step';
export type BattleScarsTier = 0 | 1 | 2 | 3;
export type VascularityTier = 0 | 1 | 2;
export type OniHornTier = 0 | 1 | 2 | 3;
export type KitsuneTailCount = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type EnergyAuraTier = 0 | 1 | 2 | 3;
export type AuraPaletteId = 'spirit_crimson' | 'wisdom_astral' | 'solar_gold' | 'jade_wind';

export interface MorphTierDescriptor<TValue> {
  value: TValue;
  label: string;
  description: string;
  requirementText: string;
}

export const AURA_PALETTE_OPTIONS: readonly {
  id: AuraPaletteId;
  label: string;
  primaryHex: string;
  secondaryHex: string;
}[] = [
  {
    id: 'spirit_crimson',
    label: 'Spirit Crimson',
    primaryHex: '#EF4444',
    secondaryHex: '#FCA5A5',
  },
  {
    id: 'wisdom_astral',
    label: 'Wisdom Astral',
    primaryHex: '#8B5CF6',
    secondaryHex: '#C4B5FD',
  },
  {
    id: 'solar_gold',
    label: 'Solar Gold',
    primaryHex: '#F59E0B',
    secondaryHex: '#FDE68A',
  },
  {
    id: 'jade_wind',
    label: 'Jade Wind',
    primaryHex: '#10B981',
    secondaryHex: '#6EE7B7',
  },
] as const;

export const MUSCLE_MASS_TIERS: readonly MorphTierDescriptor<MuscleMassTier>[] = [
  {
    value: 0,
    label: 'Unmuscled Baseline',
    description: 'Natural, unbulked physique with clean starter proportions.',
    requirementText: 'Unlocked at Level 1',
  },
  {
    value: 1,
    label: 'Toned',
    description: 'Subtle arm and chest fullness forged by early resistance work.',
    requirementText: 'Requires STR 5+',
  },
  {
    value: 2,
    label: 'Athletic',
    description: 'Noticeable shoulder, bicep, and quad development.',
    requirementText: 'Requires STR 12+',
  },
  {
    value: 3,
    label: 'Heavy Lifter',
    description: 'Dense chest, broad traps, and powerful limb volume.',
    requirementText: 'Requires STR 22+',
  },
  {
    value: 4,
    label: 'Titan',
    description: 'Peak muscular density across shoulders, torso, and legs.',
    requirementText: 'Requires STR 35+',
  },
] as const;

export const FRAME_STATURE_TIERS: readonly MorphTierDescriptor<FrameStatureTier>[] = [
  {
    value: 0,
    label: 'Starter Frame',
    description: 'Standard height and skeletal breadth.',
    requirementText: 'Unlocked at Level 1',
  },
  {
    value: 1,
    label: 'Grounded',
    description: 'Slightly taller posture with reinforced collarbone width.',
    requirementText: 'Requires CON 5+',
  },
  {
    value: 2,
    label: 'Stalwart',
    description: 'Commanding reach and sturdy torso stature.',
    requirementText: 'Requires CON 12+',
  },
  {
    value: 3,
    label: 'Towering',
    description: 'Imposing vertical scale and broad structural carriage.',
    requirementText: 'Requires CON 22+',
  },
  {
    value: 4,
    label: 'Colossus',
    description: 'Maximum stature scale and fortress-like silhouette.',
    requirementText: 'Requires CON 35+',
  },
] as const;

export const LEAN_DEFINITION_TIERS: readonly MorphTierDescriptor<LeanDefinitionTier>[] = [
  {
    value: 0,
    label: 'Soft Contour',
    description: 'Natural midsection without sharpened V-taper cuts.',
    requirementText: 'Unlocked at Level 1',
  },
  {
    value: 1,
    label: 'Trim',
    description: 'Light waist taper and clearer core lines.',
    requirementText: 'Requires AGI 5+ or DEX 5+',
  },
  {
    value: 2,
    label: 'Carved',
    description: 'Sharp V-taper silhouette and defined limb separation.',
    requirementText: 'Requires AGI 12+ or DEX 12+',
  },
  {
    value: 3,
    label: 'Razor Shredded',
    description: 'Chiseled waist taper with crisp athletic striations.',
    requirementText: 'Requires AGI 22+ or DEX 22+',
  },
] as const;

export const COMBAT_STANCE_OPTIONS: readonly MorphTierDescriptor<CombatStanceId>[] = [
  {
    value: 'neutral',
    label: 'Neutral Ready',
    description: 'Upright, composed starting stance.',
    requirementText: 'Unlocked at Level 1',
  },
  {
    value: 'agile_ready',
    label: 'Agile Ready',
    description: 'Light forward lean on the balls of the feet.',
    requirementText: 'Requires AGI 5+',
  },
  {
    value: 'iaido_poise',
    label: 'Iaido Poise',
    description: 'Measured precision guard with disciplined elbow tuck.',
    requirementText: 'Requires DEX 5+',
  },
  {
    value: 'acrobat_guard',
    label: 'Acrobat Guard',
    description: 'Coiled high-dexterity stance built for rapid pivots.',
    requirementText: 'Requires DEX 14+',
  },
  {
    value: 'phantom_step',
    label: 'Phantom Step',
    description: 'Low, sweeping apex stance blending speed and control.',
    requirementText: 'Requires AGI 14+ and DEX 10+',
  },
] as const;

export const BATTLE_SCARS_TIERS: readonly MorphTierDescriptor<BattleScarsTier>[] = [
  {
    value: 0,
    label: 'Unmarked',
    description: 'Clean skin with zero battle scars.',
    requirementText: 'Unlocked at Level 1',
  },
  {
    value: 1,
    label: 'Skirmish Marks',
    description: 'A faint cheek or brow scar from early trials.',
    requirementText: 'Requires END 5+',
  },
  {
    value: 2,
    label: 'Veteran Etchings',
    description: 'Crossed shoulder and torso marks earned in long bouts.',
    requirementText: 'Requires END 14+',
  },
  {
    value: 3,
    label: 'Ironclad Legend',
    description: 'Storied battle scars across face, chest, and arms.',
    requirementText: 'Requires END 25+',
  },
] as const;

export const VASCULARITY_TIERS: readonly MorphTierDescriptor<VascularityTier>[] = [
  {
    value: 0,
    label: 'Smooth',
    description: 'No visible vascular prominence.',
    requirementText: 'Unlocked at Level 1',
  },
  {
    value: 1,
    label: 'Conditioned',
    description: 'Subtle forearm conditioning veins.',
    requirementText: 'Requires END 8+',
  },
  {
    value: 2,
    label: 'Peak Conditioning',
    description: 'Pronounced forearm and bicep vascularity.',
    requirementText: 'Requires END 18+',
  },
] as const;

export const ONI_HORN_TIERS: readonly MorphTierDescriptor<OniHornTier>[] = [
  {
    value: 0,
    label: 'Starter Buds',
    description: 'Small nascent brow horns (Oni only; none for other races).',
    requirementText: 'Oni Level 1',
  },
  {
    value: 1,
    label: 'Swept Spires',
    description: 'Curved twin horns rising cleanly above the brow.',
    requirementText: 'Oni only — Requires WIS 5+ or SPR 5+',
  },
  {
    value: 2,
    label: 'Warlord Antlers',
    description: 'Thick, ridged twin horns with proud upward sweep.',
    requirementText: 'Oni only — Requires WIS 14+ or SPR 14+',
  },
  {
    value: 3,
    label: 'Sovereign Crown',
    description: 'Monumental etched Oni crown horns.',
    requirementText: 'Oni only — Requires WIS 25+ or SPR 25+',
  },
] as const;

export const KITSUNE_TAIL_TIERS: readonly MorphTierDescriptor<KitsuneTailCount>[] = [
  {
    value: 1,
    label: '1 Tail',
    description: 'Single starter spirit tail.',
    requirementText: 'Kitsune Level 1 (WIS/SPR 1+)',
  },
  {
    value: 2,
    label: '2 Tails',
    description: 'Paired twin tails framing the silhouette.',
    requirementText: 'Kitsune only — Requires WIS 3+ or SPR 3+',
  },
  {
    value: 3,
    label: '3 Tails',
    description: 'Balanced triad fan of fox tails.',
    requirementText: 'Kitsune only — Requires WIS 6+ or SPR 6+',
  },
  {
    value: 4,
    label: '4 Tails',
    description: 'Four-tail arc of awakening spirit.',
    requirementText: 'Kitsune only — Requires WIS 10+ or SPR 10+',
  },
  {
    value: 5,
    label: '5 Tails',
    description: 'Five-tail crest radiating behind the hips.',
    requirementText: 'Kitsune only — Requires WIS 14+ or SPR 14+',
  },
  {
    value: 6,
    label: '6 Tails',
    description: 'Six-tail plume of seasoned discipline.',
    requirementText: 'Kitsune only — Requires WIS 18+ or SPR 18+',
  },
  {
    value: 7,
    label: '7 Tails',
    description: 'Seven-tail halo of high mastery.',
    requirementText: 'Kitsune only — Requires WIS 23+ or SPR 23+',
  },
  {
    value: 8,
    label: '8 Tails',
    description: 'Eight-tail mantle of near-mythic poise.',
    requirementText: 'Kitsune only — Requires WIS 29+ or SPR 29+',
  },
  {
    value: 9,
    label: '9 Tails',
    description: 'Full nine-tail celestial fan.',
    requirementText: 'Kitsune only — Requires WIS 35+ or SPR 35+',
  },
] as const;

export const ENERGY_AURA_TIERS: readonly MorphTierDescriptor<EnergyAuraTier>[] = [
  {
    value: 0,
    label: 'No Aura',
    description: 'Pure physical silhouette with no ambient aura.',
    requirementText: 'Unlocked at Level 1',
  },
  {
    value: 1,
    label: 'Faint Halo',
    description: 'Quiet shimmer hugging the character frame.',
    requirementText: 'Requires WIS 5+ or SPR 5+',
  },
  {
    value: 2,
    label: 'Flowing Ki',
    description: 'Rising aura currents wrapping shoulders and stance.',
    requirementText: 'Requires WIS 14+ or SPR 14+',
  },
  {
    value: 3,
    label: 'Transcendent Flame',
    description: 'Radiant spirit blaze crowning the warrior.',
    requirementText: 'Requires WIS 25+ or SPR 25+',
  },
] as const;

// ============================================================================
// D. Configuration Interfaces & Pure Validation / Normalization Helpers
// ============================================================================

export interface CharacterIdentityConfig {
  hairStyle: HairStyleId;
  hairColor: HairColorId;
  faceStyle: FaceStyleId;
  eyeStyle: EyeStyleId;
  eyeColor: EyeColorId;
  skinPalette: SkinPaletteId;
  baseSilhouette: BaseSilhouetteId;
}

export interface CharacterMorphConfig {
  muscleMassTier: MuscleMassTier;
  frameTier: FrameStatureTier;
  leanDefinitionTier: LeanDefinitionTier;
  combatStance: CombatStanceId;
  scarsTier: BattleScarsTier;
  vascularityTier: VascularityTier;
  oniHornTier: OniHornTier;
  kitsuneTailCount: KitsuneTailCount;
  auraTier: EnergyAuraTier;
  auraPalette: AuraPaletteId;
}

export interface CharacterCustomizationConfig {
  version: 1;
  identity: CharacterIdentityConfig;
  morphs: CharacterMorphConfig;
}

export interface UnlockedCustomizationState {
  maxMuscleMassTier: MuscleMassTier;
  maxFrameTier: FrameStatureTier;
  maxLeanDefinitionTier: LeanDefinitionTier;
  unlockedStances: CombatStanceId[];
  maxScarsTier: BattleScarsTier;
  maxVascularityTier: VascularityTier;
  maxOniHornTier: OniHornTier;
  maxKitsuneTails: KitsuneTailCount;
  maxAuraTier: EnergyAuraTier;
}

const HAIR_STYLE_SET = new Set<string>(HAIR_STYLE_OPTIONS.map((o) => o.id));
const HAIR_COLOR_SET = new Set<string>(HAIR_COLOR_OPTIONS.map((o) => o.id));
const FACE_STYLE_SET = new Set<string>(FACE_STYLE_OPTIONS.map((o) => o.id));
const EYE_STYLE_SET = new Set<string>(EYE_STYLE_OPTIONS.map((o) => o.id));
const EYE_COLOR_SET = new Set<string>(EYE_COLOR_OPTIONS.map((o) => o.id));
const SKIN_PALETTE_SET = new Set<string>(SKIN_PALETTE_OPTIONS.map((o) => o.id));
const BASE_SILHOUETTE_SET = new Set<string>(BASE_SILHOUETTE_OPTIONS.map((o) => o.id));
const COMBAT_STANCE_SET = new Set<string>(COMBAT_STANCE_OPTIONS.map((o) => o.value));
const AURA_PALETTE_SET = new Set<string>(AURA_PALETTE_OPTIONS.map((o) => o.id));

const KITSUNE_TAIL_THRESHOLDS: readonly { count: KitsuneTailCount; minStat: number }[] = [
  { count: 1, minStat: 1 },
  { count: 2, minStat: 3 },
  { count: 3, minStat: 6 },
  { count: 4, minStat: 10 },
  { count: 5, minStat: 14 },
  { count: 6, minStat: 18 },
  { count: 7, minStat: 23 },
  { count: 8, minStat: 29 },
  { count: 9, minStat: 35 },
];

function isCharacterRace(val: unknown): val is CharacterRace {
  return typeof val === 'string' && (CHARACTER_RACES as readonly string[]).includes(val);
}

function isPlainRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function isIntInRange(val: unknown, min: number, max: number): val is number {
  return typeof val === 'number' && Number.isInteger(val) && val >= min && val <= max;
}

export function createDefaultCustomizationConfig(
  race: CharacterRace = 'HUMAN'
): CharacterCustomizationConfig {
  const safeRace: CharacterRace = isCharacterRace(race) ? race : 'HUMAN';
  const raceDef = RACE_DEFINITIONS[safeRace];

  const defaultHairStyle: HairStyleId =
    safeRace === 'ONI'
      ? 'braided_crest'
      : safeRace === 'KITSUNE'
      ? 'flowing_mane'
      : 'ronin_topknot';

  const defaultHairColor: HairColorId =
    safeRace === 'ONI'
      ? 'snow_white'
      : safeRace === 'KITSUNE'
      ? 'silver_frost'
      : 'raven_black';

  const defaultEyeStyle: EyeStyleId =
    safeRace === 'ONI'
      ? 'slit_predator'
      : safeRace === 'KITSUNE'
      ? 'mystic_glow'
      : 'sharp';

  const defaultEyeColor: EyeColorId =
    safeRace === 'ONI'
      ? 'amber_gold'
      : safeRace === 'KITSUNE'
      ? 'frost_cyan'
      : 'amber_gold';

  return {
    version: 1,
    identity: {
      hairStyle: defaultHairStyle,
      hairColor: defaultHairColor,
      faceStyle: 'stoic',
      eyeStyle: defaultEyeStyle,
      eyeColor: defaultEyeColor,
      skinPalette: raceDef.defaultSkinPaletteId,
      baseSilhouette: 'balanced',
    },
    morphs: {
      muscleMassTier: 0,
      frameTier: 0,
      leanDefinitionTier: 0,
      combatStance: 'neutral',
      scarsTier: 0,
      vascularityTier: 0,
      oniHornTier: 0,
      kitsuneTailCount: safeRace === 'KITSUNE' ? 1 : 0,
      auraTier: 0,
      auraPalette: 'spirit_crimson',
    },
  };
}

interface LegacyAppearancePresetSeed {
  race: CharacterRace;
  identity: CharacterIdentityConfig;
  auraPalette?: AuraPaletteId;
}

const LEGACY_APPEARANCE_MAP: Record<string, LegacyAppearancePresetSeed> = {
  oni_warlord: {
    race: 'ONI',
    identity: {
      hairStyle: 'flowing_mane',
      hairColor: 'snow_white',
      faceStyle: 'fierce',
      eyeStyle: 'slit_predator',
      eyeColor: 'amber_gold',
      skinPalette: 'crimson_oni',
      baseSilhouette: 'broad_shouldered',
    },
    auraPalette: 'spirit_crimson',
  },
  dread_knight: {
    race: 'ONI',
    identity: {
      hairStyle: 'cropped_fade',
      hairColor: 'raven_black',
      faceStyle: 'stoic',
      eyeStyle: 'sharp',
      eyeColor: 'crimson_ruby',
      skinPalette: 'obsidian_iron',
      baseSilhouette: 'broad_shouldered',
    },
    auraPalette: 'spirit_crimson',
  },
  northern_reaver: {
    race: 'ONI',
    identity: {
      hairStyle: 'braided_crest',
      hairColor: 'crimson_ash',
      faceStyle: 'battle_grin',
      eyeStyle: 'slit_predator',
      eyeColor: 'frost_cyan',
      skinPalette: 'ashen_slate',
      baseSilhouette: 'balanced',
    },
    auraPalette: 'jade_wind',
  },
  solar_mystic: {
    race: 'KITSUNE',
    identity: {
      hairStyle: 'flowing_mane',
      hairColor: 'burnished_gold',
      faceStyle: 'serene',
      eyeStyle: 'mystic_glow',
      eyeColor: 'amber_gold',
      skinPalette: 'golden_inari',
      baseSilhouette: 'lithe',
    },
    auraPalette: 'solar_gold',
  },
  blade_dancer: {
    race: 'KITSUNE',
    identity: {
      hairStyle: 'windswept_short',
      hairColor: 'silver_frost',
      faceStyle: 'fierce',
      eyeStyle: 'sharp',
      eyeColor: 'jade_emerald',
      skinPalette: 'ivory_fox',
      baseSilhouette: 'lithe',
    },
    auraPalette: 'jade_wind',
  },
  astral_arcanist: {
    race: 'KITSUNE',
    identity: {
      hairStyle: 'braided_crest',
      hairColor: 'midnight_indigo',
      faceStyle: 'serene',
      eyeStyle: 'mystic_glow',
      eyeColor: 'astral_violet',
      skinPalette: 'midnight_fox',
      baseSilhouette: 'balanced',
    },
    auraPalette: 'wisdom_astral',
  },
  oath_sentinel: {
    race: 'HUMAN',
    identity: {
      hairStyle: 'ronin_topknot',
      hairColor: 'raven_black',
      faceStyle: 'stoic',
      eyeStyle: 'noble',
      eyeColor: 'amber_gold',
      skinPalette: 'warm_amber',
      baseSilhouette: 'broad_shouldered',
    },
    auraPalette: 'solar_gold',
  },
  wayfarer: {
    race: 'HUMAN',
    identity: {
      hairStyle: 'windswept_short',
      hairColor: 'copper_flame',
      faceStyle: 'battle_grin',
      eyeStyle: 'sharp',
      eyeColor: 'jade_emerald',
      skinPalette: 'sun_bronze',
      baseSilhouette: 'balanced',
    },
    auraPalette: 'jade_wind',
  },
  dusk_shinobi: {
    race: 'HUMAN',
    identity: {
      hairStyle: 'cropped_fade',
      hairColor: 'midnight_indigo',
      faceStyle: 'fierce',
      eyeStyle: 'sharp',
      eyeColor: 'frost_cyan',
      skinPalette: 'porcelain_ivory',
      baseSilhouette: 'lithe',
    },
    auraPalette: 'wisdom_astral',
  },
  bastion_ironclad: {
    race: 'HUMAN',
    identity: {
      hairStyle: 'shaved_monk',
      hairColor: 'snow_white',
      faceStyle: 'stoic',
      eyeStyle: 'noble',
      eyeColor: 'obsidian_dark',
      skinPalette: 'rich_umber',
      baseSilhouette: 'broad_shouldered',
    },
    auraPalette: 'spirit_crimson',
  },
};

export function deriveCustomizationFromLegacyAppearance(
  appearanceId?: string | null
): { race: CharacterRace; config: CharacterCustomizationConfig } {
  const key = typeof appearanceId === 'string' ? appearanceId.trim().toLowerCase() : '';
  const preset = LEGACY_APPEARANCE_MAP[key];

  if (!preset) {
    return {
      race: 'HUMAN',
      config: createDefaultCustomizationConfig('HUMAN'),
    };
  }

  const base = createDefaultCustomizationConfig(preset.race);
  return {
    race: preset.race,
    config: {
      version: 1,
      identity: { ...preset.identity },
      morphs: {
        ...base.morphs,
        auraPalette: preset.auraPalette ?? base.morphs.auraPalette,
      },
    },
  };
}

export function adaptCustomizationForRaceChange(
  config: CharacterCustomizationConfig,
  nextRace: CharacterRace
): CharacterCustomizationConfig {
  const safeRace: CharacterRace = isCharacterRace(nextRace) ? nextRace : 'HUMAN';
  const raceDef = RACE_DEFINITIONS[safeRace];
  const currentSkin = config.identity.skinPalette;
  const nextSkin = raceDef.allowedSkinPaletteIds.includes(currentSkin)
    ? currentSkin
    : raceDef.defaultSkinPaletteId;

  return {
    version: 1,
    identity: {
      ...config.identity,
      skinPalette: nextSkin,
    },
    morphs: {
      ...config.morphs,
      oniHornTier: safeRace === 'ONI' ? config.morphs.oniHornTier : 0,
      kitsuneTailCount:
        safeRace === 'KITSUNE'
          ? (Math.min(9, Math.max(1, config.morphs.kitsuneTailCount)) as KitsuneTailCount)
          : 0,
    },
  };
}

export function normalizeCustomizationConfig(
  raw: unknown,
  race: CharacterRace,
  fallbackAppearanceId?: string | null
): CharacterCustomizationConfig {
  const safeRace: CharacterRace = isCharacterRace(race) ? race : 'HUMAN';
  const raceDef = RACE_DEFINITIONS[safeRace];

  const baseConfig = fallbackAppearanceId
    ? adaptCustomizationForRaceChange(
        deriveCustomizationFromLegacyAppearance(fallbackAppearanceId).config,
        safeRace
      )
    : createDefaultCustomizationConfig(safeRace);

  if (!isPlainRecord(raw)) {
    return baseConfig;
  }

  const rawIdentity = isPlainRecord(raw.identity) ? raw.identity : {};
  const rawMorphs = isPlainRecord(raw.morphs) ? raw.morphs : {};

  const hairStyle =
    typeof rawIdentity.hairStyle === 'string' && HAIR_STYLE_SET.has(rawIdentity.hairStyle)
      ? (rawIdentity.hairStyle as HairStyleId)
      : baseConfig.identity.hairStyle;

  const hairColor =
    typeof rawIdentity.hairColor === 'string' && HAIR_COLOR_SET.has(rawIdentity.hairColor)
      ? (rawIdentity.hairColor as HairColorId)
      : baseConfig.identity.hairColor;

  const faceStyle =
    typeof rawIdentity.faceStyle === 'string' && FACE_STYLE_SET.has(rawIdentity.faceStyle)
      ? (rawIdentity.faceStyle as FaceStyleId)
      : baseConfig.identity.faceStyle;

  const eyeStyle =
    typeof rawIdentity.eyeStyle === 'string' && EYE_STYLE_SET.has(rawIdentity.eyeStyle)
      ? (rawIdentity.eyeStyle as EyeStyleId)
      : baseConfig.identity.eyeStyle;

  const eyeColor =
    typeof rawIdentity.eyeColor === 'string' && EYE_COLOR_SET.has(rawIdentity.eyeColor)
      ? (rawIdentity.eyeColor as EyeColorId)
      : baseConfig.identity.eyeColor;

  const candidateSkin =
    typeof rawIdentity.skinPalette === 'string' && SKIN_PALETTE_SET.has(rawIdentity.skinPalette)
      ? (rawIdentity.skinPalette as SkinPaletteId)
      : baseConfig.identity.skinPalette;
  const skinPalette = raceDef.allowedSkinPaletteIds.includes(candidateSkin)
    ? candidateSkin
    : raceDef.defaultSkinPaletteId;

  const baseSilhouette =
    typeof rawIdentity.baseSilhouette === 'string' &&
    BASE_SILHOUETTE_SET.has(rawIdentity.baseSilhouette)
      ? (rawIdentity.baseSilhouette as BaseSilhouetteId)
      : baseConfig.identity.baseSilhouette;

  const muscleMassTier = isIntInRange(rawMorphs.muscleMassTier, 0, 4)
    ? (rawMorphs.muscleMassTier as MuscleMassTier)
    : baseConfig.morphs.muscleMassTier;

  const frameTier = isIntInRange(rawMorphs.frameTier, 0, 4)
    ? (rawMorphs.frameTier as FrameStatureTier)
    : baseConfig.morphs.frameTier;

  const leanDefinitionTier = isIntInRange(rawMorphs.leanDefinitionTier, 0, 3)
    ? (rawMorphs.leanDefinitionTier as LeanDefinitionTier)
    : baseConfig.morphs.leanDefinitionTier;

  const combatStance =
    typeof rawMorphs.combatStance === 'string' && COMBAT_STANCE_SET.has(rawMorphs.combatStance)
      ? (rawMorphs.combatStance as CombatStanceId)
      : baseConfig.morphs.combatStance;

  const scarsTier = isIntInRange(rawMorphs.scarsTier, 0, 3)
    ? (rawMorphs.scarsTier as BattleScarsTier)
    : baseConfig.morphs.scarsTier;

  const vascularityTier = isIntInRange(rawMorphs.vascularityTier, 0, 2)
    ? (rawMorphs.vascularityTier as VascularityTier)
    : baseConfig.morphs.vascularityTier;

  const oniHornTier: OniHornTier =
    safeRace === 'ONI'
      ? isIntInRange(rawMorphs.oniHornTier, 0, 3)
        ? (rawMorphs.oniHornTier as OniHornTier)
        : baseConfig.morphs.oniHornTier
      : 0;

  const kitsuneTailCount: KitsuneTailCount =
    safeRace === 'KITSUNE'
      ? isIntInRange(rawMorphs.kitsuneTailCount, 1, 9)
        ? (rawMorphs.kitsuneTailCount as KitsuneTailCount)
        : 1
      : 0;

  const auraTier = isIntInRange(rawMorphs.auraTier, 0, 3)
    ? (rawMorphs.auraTier as EnergyAuraTier)
    : baseConfig.morphs.auraTier;

  const auraPalette =
    typeof rawMorphs.auraPalette === 'string' && AURA_PALETTE_SET.has(rawMorphs.auraPalette)
      ? (rawMorphs.auraPalette as AuraPaletteId)
      : baseConfig.morphs.auraPalette;

  return {
    version: 1,
    identity: {
      hairStyle,
      hairColor,
      faceStyle,
      eyeStyle,
      eyeColor,
      skinPalette,
      baseSilhouette,
    },
    morphs: {
      muscleMassTier,
      frameTier,
      leanDefinitionTier,
      combatStance,
      scarsTier,
      vascularityTier,
      oniHornTier,
      kitsuneTailCount,
      auraTier,
      auraPalette,
    },
  };
}

export function getUnlockedCustomizationState(
  race: CharacterRace,
  stats?: Partial<CoreStatBlock> | null
): UnlockedCustomizationState {
  const safeRace: CharacterRace = isCharacterRace(race) ? race : 'HUMAN';
  const normalized = normalizeCoreStatBlock(stats, 1);

  const str = normalized.strengthLevel;
  const con = normalized.constitutionLevel;
  const agi = normalized.agilityLevel;
  const dex = normalized.dexterityLevel;
  const end = normalized.enduranceLevel;
  const wis = normalized.wisdomLevel;
  const spr = normalized.spiritLevel;

  const maxMuscleMassTier: MuscleMassTier =
    str >= 35 ? 4 : str >= 22 ? 3 : str >= 12 ? 2 : str >= 5 ? 1 : 0;

  const maxFrameTier: FrameStatureTier =
    con >= 35 ? 4 : con >= 22 ? 3 : con >= 12 ? 2 : con >= 5 ? 1 : 0;

  const maxAgiDex = Math.max(agi, dex);
  const maxLeanDefinitionTier: LeanDefinitionTier =
    maxAgiDex >= 22 ? 3 : maxAgiDex >= 12 ? 2 : maxAgiDex >= 5 ? 1 : 0;

  const unlockedStances: CombatStanceId[] = ['neutral'];
  if (agi >= 5) unlockedStances.push('agile_ready');
  if (dex >= 5) unlockedStances.push('iaido_poise');
  if (dex >= 14) unlockedStances.push('acrobat_guard');
  if (agi >= 14 && dex >= 10) unlockedStances.push('phantom_step');

  const maxScarsTier: BattleScarsTier =
    end >= 25 ? 3 : end >= 14 ? 2 : end >= 5 ? 1 : 0;

  const maxVascularityTier: VascularityTier =
    end >= 18 ? 2 : end >= 8 ? 1 : 0;

  const maxWisSpr = Math.max(wis, spr);

  const maxOniHornTier: OniHornTier =
    safeRace === 'ONI'
      ? maxWisSpr >= 25
        ? 3
        : maxWisSpr >= 14
        ? 2
        : maxWisSpr >= 5
        ? 1
        : 0
      : 0;

  let maxKitsuneTails: KitsuneTailCount = 0;
  if (safeRace === 'KITSUNE') {
    maxKitsuneTails = 1;
    for (const threshold of KITSUNE_TAIL_THRESHOLDS) {
      if (maxWisSpr >= threshold.minStat) {
        maxKitsuneTails = threshold.count;
      }
    }
  }

  const maxAuraTier: EnergyAuraTier =
    maxWisSpr >= 25 ? 3 : maxWisSpr >= 14 ? 2 : maxWisSpr >= 5 ? 1 : 0;

  return {
    maxMuscleMassTier,
    maxFrameTier,
    maxLeanDefinitionTier,
    unlockedStances,
    maxScarsTier,
    maxVascularityTier,
    maxOniHornTier,
    maxKitsuneTails,
    maxAuraTier,
  };
}

export function validateCustomizationConfig(params: {
  race: CharacterRace;
  config: unknown;
  stats?: Partial<CoreStatBlock> | null;
}): { valid: boolean; errors: string[]; normalizedConfig?: CharacterCustomizationConfig } {
  const { race, config, stats } = params;
  const errors: string[] = [];

  if (!isCharacterRace(race)) {
    errors.push(`Invalid character race "${String(race)}".`);
    return { valid: false, errors };
  }

  if (!isPlainRecord(config)) {
    errors.push('Customization config must be an object.');
    return { valid: false, errors };
  }

  if (config.version !== 1) {
    errors.push(`Unsupported customization config version "${String(config.version)}". Expected 1.`);
  }

  if (!isPlainRecord(config.identity)) {
    errors.push('Customization config must include an "identity" object.');
  }
  if (!isPlainRecord(config.morphs)) {
    errors.push('Customization config must include a "morphs" object.');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const identity = config.identity as Record<string, unknown>;
  const morphs = config.morphs as Record<string, unknown>;
  const raceDef = RACE_DEFINITIONS[race];
  const unlocked = getUnlockedCustomizationState(race, stats);

  // Identity checks
  if (typeof identity.hairStyle !== 'string' || !HAIR_STYLE_SET.has(identity.hairStyle)) {
    errors.push(`Invalid hairStyle "${String(identity.hairStyle)}".`);
  }
  if (typeof identity.hairColor !== 'string' || !HAIR_COLOR_SET.has(identity.hairColor)) {
    errors.push(`Invalid hairColor "${String(identity.hairColor)}".`);
  }
  if (typeof identity.faceStyle !== 'string' || !FACE_STYLE_SET.has(identity.faceStyle)) {
    errors.push(`Invalid faceStyle "${String(identity.faceStyle)}".`);
  }
  if (typeof identity.eyeStyle !== 'string' || !EYE_STYLE_SET.has(identity.eyeStyle)) {
    errors.push(`Invalid eyeStyle "${String(identity.eyeStyle)}".`);
  }
  if (typeof identity.eyeColor !== 'string' || !EYE_COLOR_SET.has(identity.eyeColor)) {
    errors.push(`Invalid eyeColor "${String(identity.eyeColor)}".`);
  }
  if (typeof identity.skinPalette !== 'string' || !SKIN_PALETTE_SET.has(identity.skinPalette)) {
    errors.push(`Invalid skinPalette "${String(identity.skinPalette)}".`);
  } else if (!raceDef.allowedSkinPaletteIds.includes(identity.skinPalette as SkinPaletteId)) {
    errors.push(
      `Skin palette "${identity.skinPalette}" is not allowed for race ${race}.`
    );
  }
  if (
    typeof identity.baseSilhouette !== 'string' ||
    !BASE_SILHOUETTE_SET.has(identity.baseSilhouette)
  ) {
    errors.push(`Invalid baseSilhouette "${String(identity.baseSilhouette)}".`);
  }

  // Morph type & threshold checks
  if (!isIntInRange(morphs.muscleMassTier, 0, 4)) {
    errors.push(`Invalid muscleMassTier "${String(morphs.muscleMassTier)}". Must be integer 0-4.`);
  } else if (morphs.muscleMassTier > unlocked.maxMuscleMassTier) {
    errors.push(
      `muscleMassTier ${morphs.muscleMassTier} is locked (max unlocked for current STRENGTH is ${unlocked.maxMuscleMassTier}).`
    );
  }

  if (!isIntInRange(morphs.frameTier, 0, 4)) {
    errors.push(`Invalid frameTier "${String(morphs.frameTier)}". Must be integer 0-4.`);
  } else if (morphs.frameTier > unlocked.maxFrameTier) {
    errors.push(
      `frameTier ${morphs.frameTier} is locked (max unlocked for current CONSTITUTION is ${unlocked.maxFrameTier}).`
    );
  }

  if (!isIntInRange(morphs.leanDefinitionTier, 0, 3)) {
    errors.push(
      `Invalid leanDefinitionTier "${String(morphs.leanDefinitionTier)}". Must be integer 0-3.`
    );
  } else if (morphs.leanDefinitionTier > unlocked.maxLeanDefinitionTier) {
    errors.push(
      `leanDefinitionTier ${morphs.leanDefinitionTier} is locked (max unlocked for current AGILITY/DEXTERITY is ${unlocked.maxLeanDefinitionTier}).`
    );
  }

  if (typeof morphs.combatStance !== 'string' || !COMBAT_STANCE_SET.has(morphs.combatStance)) {
    errors.push(`Invalid combatStance "${String(morphs.combatStance)}".`);
  } else if (!unlocked.unlockedStances.includes(morphs.combatStance as CombatStanceId)) {
    errors.push(
      `combatStance "${morphs.combatStance}" is locked for current AGILITY/DEXTERITY.`
    );
  }

  if (!isIntInRange(morphs.scarsTier, 0, 3)) {
    errors.push(`Invalid scarsTier "${String(morphs.scarsTier)}". Must be integer 0-3.`);
  } else if (morphs.scarsTier > unlocked.maxScarsTier) {
    errors.push(
      `scarsTier ${morphs.scarsTier} is locked (max unlocked for current ENDURANCE is ${unlocked.maxScarsTier}).`
    );
  }

  if (!isIntInRange(morphs.vascularityTier, 0, 2)) {
    errors.push(
      `Invalid vascularityTier "${String(morphs.vascularityTier)}". Must be integer 0-2.`
    );
  } else if (morphs.vascularityTier > unlocked.maxVascularityTier) {
    errors.push(
      `vascularityTier ${morphs.vascularityTier} is locked (max unlocked for current ENDURANCE is ${unlocked.maxVascularityTier}).`
    );
  }

  if (!isIntInRange(morphs.oniHornTier, 0, 3)) {
    errors.push(`Invalid oniHornTier "${String(morphs.oniHornTier)}". Must be integer 0-3.`);
  } else if (race !== 'ONI' && morphs.oniHornTier !== 0) {
    errors.push(`oniHornTier must be 0 when race is ${race} (Oni horns are ONI-exclusive).`);
  } else if (race === 'ONI' && morphs.oniHornTier > unlocked.maxOniHornTier) {
    errors.push(
      `oniHornTier ${morphs.oniHornTier} is locked (max unlocked for current WISDOM/SPIRIT is ${unlocked.maxOniHornTier}).`
    );
  }

  if (!isIntInRange(morphs.kitsuneTailCount, 0, 9)) {
    errors.push(
      `Invalid kitsuneTailCount "${String(morphs.kitsuneTailCount)}". Must be integer 0-9.`
    );
  } else if (race !== 'KITSUNE' && morphs.kitsuneTailCount !== 0) {
    errors.push(
      `kitsuneTailCount must be 0 when race is ${race} (Kitsune tails are KITSUNE-exclusive).`
    );
  } else if (race === 'KITSUNE' && morphs.kitsuneTailCount < 1) {
    errors.push('kitsuneTailCount must be at least 1 and at most 9 when race is KITSUNE.');
  } else if (race === 'KITSUNE' && morphs.kitsuneTailCount > unlocked.maxKitsuneTails) {
    errors.push(
      `kitsuneTailCount ${morphs.kitsuneTailCount} is locked (max unlocked for current WISDOM/SPIRIT is ${unlocked.maxKitsuneTails}).`
    );
  }

  if (!isIntInRange(morphs.auraTier, 0, 3)) {
    errors.push(`Invalid auraTier "${String(morphs.auraTier)}". Must be integer 0-3.`);
  } else if (morphs.auraTier > unlocked.maxAuraTier) {
    errors.push(
      `auraTier ${morphs.auraTier} is locked (max unlocked for current WISDOM/SPIRIT is ${unlocked.maxAuraTier}).`
    );
  }

  if (typeof morphs.auraPalette !== 'string' || !AURA_PALETTE_SET.has(morphs.auraPalette)) {
    errors.push(`Invalid auraPalette "${String(morphs.auraPalette)}".`);
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    normalizedConfig: {
      version: 1,
      identity: {
        hairStyle: identity.hairStyle as HairStyleId,
        hairColor: identity.hairColor as HairColorId,
        faceStyle: identity.faceStyle as FaceStyleId,
        eyeStyle: identity.eyeStyle as EyeStyleId,
        eyeColor: identity.eyeColor as EyeColorId,
        skinPalette: identity.skinPalette as SkinPaletteId,
        baseSilhouette: identity.baseSilhouette as BaseSilhouetteId,
      },
      morphs: {
        muscleMassTier: morphs.muscleMassTier as MuscleMassTier,
        frameTier: morphs.frameTier as FrameStatureTier,
        leanDefinitionTier: morphs.leanDefinitionTier as LeanDefinitionTier,
        combatStance: morphs.combatStance as CombatStanceId,
        scarsTier: morphs.scarsTier as BattleScarsTier,
        vascularityTier: morphs.vascularityTier as VascularityTier,
        oniHornTier: morphs.oniHornTier as OniHornTier,
        kitsuneTailCount: morphs.kitsuneTailCount as KitsuneTailCount,
        auraTier: morphs.auraTier as EnergyAuraTier,
        auraPalette: morphs.auraPalette as AuraPaletteId,
      },
    },
  };
}

// ============================================================================
// E. Pure Rig Bone Metrics Solver
// ============================================================================

export interface StancePoseAngles {
  torsoLeanDeg: number;
  headTiltDeg: number;
  frontUpperArmDeg: number;
  frontForearmDeg: number;
  backUpperArmDeg: number;
  backForearmDeg: number;
  frontThighDeg: number;
  frontShinDeg: number;
  backThighDeg: number;
  backShinDeg: number;
}

export interface CharacterRigMetrics {
  groundY: 250;
  statureScale: number;
  hipX: 100;
  hipY: number;
  head: { width: number; height: number; neckLength: number };
  torso: {
    height: number;
    shoulderSpan: number;
    chestWidth: number;
    waistSpan: number;
    muscleBulk: number;
    leanCut: number;
  };
  upperArm: { length: number; width: number; bicepBulk: number };
  forearm: { length: number; width: number };
  thigh: { length: number; width: number; quadBulk: number; hipSpread: number };
  shin: { length: number; width: number };
  horns: { visible: boolean; tier: OniHornTier; length: number; spread: number; thickness: number };
  tails: { count: KitsuneTailCount; length: number; width: number; fanAnglesDeg: number[] };
  aura: {
    visible: boolean;
    tier: EnergyAuraTier;
    radiusX: number;
    radiusY: number;
    primaryHex: string;
    secondaryHex: string;
  };
  stanceAngles: StancePoseAngles;
}

const STANCE_POSE_TABLE: Record<CombatStanceId, StancePoseAngles> = {
  neutral: {
    torsoLeanDeg: 0,
    headTiltDeg: 0,
    frontUpperArmDeg: 10,
    frontForearmDeg: -16,
    backUpperArmDeg: -10,
    backForearmDeg: -14,
    frontThighDeg: 5,
    frontShinDeg: -4,
    backThighDeg: -6,
    backShinDeg: 5,
  },
  agile_ready: {
    torsoLeanDeg: 7,
    headTiltDeg: -4,
    frontUpperArmDeg: 24,
    frontForearmDeg: -44,
    backUpperArmDeg: -18,
    backForearmDeg: -36,
    frontThighDeg: 14,
    frontShinDeg: -12,
    backThighDeg: -15,
    backShinDeg: 11,
  },
  iaido_poise: {
    torsoLeanDeg: 4,
    headTiltDeg: -2,
    frontUpperArmDeg: 16,
    frontForearmDeg: -58,
    backUpperArmDeg: -24,
    backForearmDeg: -48,
    frontThighDeg: 10,
    frontShinDeg: -8,
    backThighDeg: -12,
    backShinDeg: 9,
  },
  acrobat_guard: {
    torsoLeanDeg: 11,
    headTiltDeg: -6,
    frontUpperArmDeg: 34,
    frontForearmDeg: -62,
    backUpperArmDeg: -32,
    backForearmDeg: -46,
    frontThighDeg: 20,
    frontShinDeg: -18,
    backThighDeg: -22,
    backShinDeg: 16,
  },
  phantom_step: {
    torsoLeanDeg: 16,
    headTiltDeg: -9,
    frontUpperArmDeg: 42,
    frontForearmDeg: -52,
    backUpperArmDeg: -40,
    backForearmDeg: -24,
    frontThighDeg: 26,
    frontShinDeg: -22,
    backThighDeg: -28,
    backShinDeg: 20,
  },
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildTailFanAngles(count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [0];

  const totalSpan = Math.min(136, (count - 1) * 18);
  const startAngle = -totalSpan / 2;
  const step = totalSpan / (count - 1);
  const angles: number[] = [];

  for (let i = 0; i < count; i++) {
    angles.push(round2(startAngle + i * step));
  }
  return angles;
}

export function computeCharacterRigMetrics(
  race: CharacterRace,
  config: CharacterCustomizationConfig
): CharacterRigMetrics {
  const safeRace: CharacterRace = isCharacterRace(race) ? race : 'HUMAN';
  const normalized = normalizeCustomizationConfig(config, safeRace);
  const { identity, morphs } = normalized;

  const muscle = morphs.muscleMassTier;
  const frame = morphs.frameTier;
  const lean = morphs.leanDefinitionTier;

  const silhouette = identity.baseSilhouette;
  const shoulderSilhouetteMod =
    silhouette === 'broad_shouldered' ? 4 : silhouette === 'lithe' ? -3 : 0;
  const waistSilhouetteMod =
    silhouette === 'broad_shouldered' ? 1.5 : silhouette === 'lithe' ? -2 : 0;
  const limbWidthSilhouetteMod =
    silhouette === 'broad_shouldered' ? 1.2 : silhouette === 'lithe' ? -1 : 0;

  const statureScale = round2(1.0 + frame * 0.025);
  const lengthScale = 1.0 + frame * 0.032;

  const torsoHeight = round2(58 * lengthScale);
  const shoulderSpan = round2(36 + shoulderSilhouetteMod + frame * 2.4 + muscle * 1.8);
  const chestWidth = round2(30 + shoulderSilhouetteMod * 0.7 + muscle * 3.4 + frame * 1.1);
  const waistSpan = round2(
    Math.max(18, 24 + waistSilhouetteMod + muscle * 1.1 + frame * 0.8 - lean * 1.6)
  );
  const muscleBulk = round2(muscle * 0.25);
  const leanCut = round2(lean / 3);

  const upperArmLength = round2(28 * lengthScale);
  const upperArmWidth = round2(9 + limbWidthSilhouetteMod + muscle * 1.9);
  const bicepBulk = round2(muscle * 0.25);

  const forearmLength = round2(26 * lengthScale);
  const forearmWidth = round2(7.5 + limbWidthSilhouetteMod * 0.7 + muscle * 1.35);

  const thighLength = round2(38 * lengthScale);
  const thighWidth = round2(13 + limbWidthSilhouetteMod + muscle * 2.1);
  const quadBulk = round2(muscle * 0.25);
  const hipSpread = round2(14 + frame * 0.9 + muscle * 0.6);

  const shinLength = round2(37 * lengthScale);
  const shinWidth = round2(9.5 + limbWidthSilhouetteMod * 0.6 + muscle * 1.25);

  const groundY = 250 as const;
  const hipX = 100 as const;
  const hipY = round2(groundY - (thighLength + shinLength));

  const headWidth = round2(23 + frame * 0.45);
  const headHeight = round2(27 + frame * 0.55);
  const neckLength = round2(8 + frame * 0.5);

  // Oni Horns (starter buds at Tier 0 for ONI; hidden for other races)
  const hornTier: OniHornTier = safeRace === 'ONI' ? morphs.oniHornTier : 0;
  const horns =
    safeRace === 'ONI'
      ? {
          visible: true,
          tier: hornTier,
          length: round2(8 + hornTier * 7.5),
          spread: round2(14 + hornTier * 5),
          thickness: round2(4 + hornTier * 1.6),
        }
      : {
          visible: false,
          tier: 0 as OniHornTier,
          length: 0,
          spread: 0,
          thickness: 0,
        };

  // Kitsune Tails (1..9 for KITSUNE; 0 for other races)
  const tailCount: KitsuneTailCount =
    safeRace === 'KITSUNE' ? morphs.kitsuneTailCount : 0;
  const tails =
    safeRace === 'KITSUNE'
      ? {
          count: tailCount,
          length: round2(42 + Math.min(tailCount, 9) * 1.5 + frame * 1.2),
          width: round2(11 + Math.max(0, 3 - Math.floor(tailCount / 3)) * 0.5),
          fanAnglesDeg: buildTailFanAngles(tailCount),
        }
      : {
          count: 0 as KitsuneTailCount,
          length: 0,
          width: 0,
          fanAnglesDeg: [],
        };

  const auraOption =
    AURA_PALETTE_OPTIONS.find((opt) => opt.id === morphs.auraPalette) ?? {
      id: 'spirit_crimson' as AuraPaletteId,
      label: 'Spirit Crimson',
      primaryHex: '#EF4444',
      secondaryHex: '#FCA5A5',
    };
  const auraTier = morphs.auraTier;
  const aura = {
    visible: auraTier > 0,
    tier: auraTier,
    radiusX: auraTier > 0 ? round2((38 + auraTier * 12) * statureScale) : 0,
    radiusY: auraTier > 0 ? round2((68 + auraTier * 16) * statureScale) : 0,
    primaryHex: auraOption.primaryHex,
    secondaryHex: auraOption.secondaryHex,
  };

  return {
    groundY,
    statureScale,
    hipX,
    hipY,
    head: {
      width: headWidth,
      height: headHeight,
      neckLength,
    },
    torso: {
      height: torsoHeight,
      shoulderSpan,
      chestWidth,
      waistSpan,
      muscleBulk,
      leanCut,
    },
    upperArm: {
      length: upperArmLength,
      width: upperArmWidth,
      bicepBulk,
    },
    forearm: {
      length: forearmLength,
      width: forearmWidth,
    },
    thigh: {
      length: thighLength,
      width: thighWidth,
      quadBulk,
      hipSpread,
    },
    shin: {
      length: shinLength,
      width: shinWidth,
    },
    horns,
    tails,
    aura,
    stanceAngles: { ...STANCE_POSE_TABLE[morphs.combatStance] },
  };
}

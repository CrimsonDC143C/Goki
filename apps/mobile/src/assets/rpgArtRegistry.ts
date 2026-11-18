import type { ImageSourcePropType } from 'react-native';
import type { BaseSilhouetteId, CharacterRace } from '@goki/game-engine';
import type { EquipmentVisualVariant } from '../components/character/EquipmentPartSvg';
import type { NpcArchetypeId, NpcExpression } from '../components/npc/NpcPortraitSvg';

// ============================================================================
// 1. HUB ENVIRONMENT BACKDROPS & ILLUSTRATED HEADERS
// ============================================================================

export type HubEnvironmentSlotId =
  | 'hero_sanctum'
  | 'adventure_guild_hall'
  | 'adventure_expedition_map'
  | 'artisan_forge_apothecary'
  | 'artisan_gathering_wilds'
  | 'social_clan_hall'
  | 'social_company_tavern';

export interface HubEnvironmentArtSlot {
  slotId: HubEnvironmentSlotId;
  hub: 'Hero' | 'Adventure' | 'Artisan' | 'Social';
  label: string;
  recommendedBackdropPx: '1080x1920';
  recommendedBannerPx: '1440x480';
  backdropSource: ImageSourcePropType | null;
  headerBannerSource: ImageSourcePropType | null;
  ambientTint: string;
  scrimColors: readonly [string, string];
}

export const HUB_ENVIRONMENT_ART_REGISTRY: Readonly<
  Record<HubEnvironmentSlotId, HubEnvironmentArtSlot>
> = {
  hero_sanctum: {
    slotId: 'hero_sanctum',
    hub: 'Hero',
    label: 'Sanctum & Armory Hall',
    recommendedBackdropPx: '1080x1920',
    recommendedBannerPx: '1440x480',
    backdropSource: null,
    headerBannerSource: null,
    ambientTint: 'rgba(217, 179, 108, 0.06)',
    scrimColors: ['rgba(12, 16, 24, 0.72)', 'rgba(12, 16, 24, 0.94)'],
  },
  adventure_guild_hall: {
    slotId: 'adventure_guild_hall',
    hub: 'Adventure',
    label: "Adventurer's Guild Hall",
    recommendedBackdropPx: '1080x1920',
    recommendedBannerPx: '1440x480',
    backdropSource: null,
    headerBannerSource: null,
    ambientTint: 'rgba(56, 189, 248, 0.06)',
    scrimColors: ['rgba(12, 16, 24, 0.70)', 'rgba(12, 16, 24, 0.94)'],
  },
  adventure_expedition_map: {
    slotId: 'adventure_expedition_map',
    hub: 'Adventure',
    label: 'Frontier Expedition Gate',
    recommendedBackdropPx: '1080x1920',
    recommendedBannerPx: '1440x480',
    backdropSource: null,
    headerBannerSource: null,
    ambientTint: 'rgba(16, 185, 129, 0.05)',
    scrimColors: ['rgba(12, 16, 24, 0.72)', 'rgba(12, 16, 24, 0.94)'],
  },
  artisan_forge_apothecary: {
    slotId: 'artisan_forge_apothecary',
    hub: 'Artisan',
    label: 'Foundry Forge & Apothecary',
    recommendedBackdropPx: '1080x1920',
    recommendedBannerPx: '1440x480',
    backdropSource: null,
    headerBannerSource: null,
    ambientTint: 'rgba(245, 158, 11, 0.06)',
    scrimColors: ['rgba(12, 16, 24, 0.72)', 'rgba(12, 16, 24, 0.94)'],
  },
  artisan_gathering_wilds: {
    slotId: 'artisan_gathering_wilds',
    hub: 'Artisan',
    label: 'Gathering Outcrops & Groves',
    recommendedBackdropPx: '1080x1920',
    recommendedBannerPx: '1440x480',
    backdropSource: null,
    headerBannerSource: null,
    ambientTint: 'rgba(38, 166, 154, 0.06)',
    scrimColors: ['rgba(12, 16, 24, 0.72)', 'rgba(12, 16, 24, 0.94)'],
  },
  social_clan_hall: {
    slotId: 'social_clan_hall',
    hub: 'Social',
    label: 'Gym Clan Sanctum & Raid Hall',
    recommendedBackdropPx: '1080x1920',
    recommendedBannerPx: '1440x480',
    backdropSource: null,
    headerBannerSource: null,
    ambientTint: 'rgba(239, 83, 80, 0.06)',
    scrimColors: ['rgba(12, 16, 24, 0.72)', 'rgba(12, 16, 24, 0.94)'],
  },
  social_company_tavern: {
    slotId: 'social_company_tavern',
    hub: 'Social',
    label: 'Company Tavern & Arena Courtyard',
    recommendedBackdropPx: '1080x1920',
    recommendedBannerPx: '1440x480',
    backdropSource: null,
    headerBannerSource: null,
    ambientTint: 'rgba(168, 85, 247, 0.06)',
    scrimColors: ['rgba(12, 16, 24, 0.72)', 'rgba(12, 16, 24, 0.94)'],
  },
};

export function getHubEnvironmentArt(slotId: HubEnvironmentSlotId): HubEnvironmentArtSlot {
  return HUB_ENVIRONMENT_ART_REGISTRY[slotId];
}

// ============================================================================
// 2. NPC PORTRAIT EXPRESSION VARIANTS (6 NPCs x 4 EXPRESSIONS = 24 SLOTS)
// ============================================================================

export type NpcPortraitExpressionMap = Record<NpcExpression, ImageSourcePropType | null>;

export const NPC_PORTRAIT_ART_REGISTRY: Readonly<
  Record<NpcArchetypeId, NpcPortraitExpressionMap>
> = {
  GUIDE: { neutral: null, happy: null, focused: null, alert: null },
  GUILD_RECEPTIONIST: { neutral: null, happy: null, focused: null, alert: null },
  TRADER: { neutral: null, happy: null, focused: null, alert: null },
  TRAINER: { neutral: null, happy: null, focused: null, alert: null },
  QUARTERMASTER: { neutral: null, happy: null, focused: null, alert: null },
  CLAN_WARDEN: { neutral: null, happy: null, focused: null, alert: null },
};

/**
 * Resolves a drop-in NPC expression portrait (512x512). Falls back to neutral, then null (keeps vector SVG).
 */
export function getNpcPortraitArtSource(
  npcId: NpcArchetypeId,
  expression: NpcExpression = 'neutral'
): ImageSourcePropType | null {
  const variants = NPC_PORTRAIT_ART_REGISTRY[npcId];
  return variants[expression] ?? variants.neutral ?? null;
}

// ============================================================================
// 3. BATTLE ARENA PARALLAX BACKDROP SLOTS (WHITEWOOD + 4 BIOME SLOTS)
// ============================================================================

export type BattleArenaThemeId =
  | 'whitewood_forest'
  | 'crypt_catacombs'
  | 'obsidian_citadel'
  | 'sun_scorched_caldera'
  | 'arena_courtyard';

export interface BattleArenaParallaxSlots {
  themeId: BattleArenaThemeId;
  name: string;
  sky: ImageSourcePropType | null;
  cloudsOrMist: ImageSourcePropType | null;
  mountainsOrWalls: ImageSourcePropType | null;
  hillBackground: ImageSourcePropType | null;
  hillMidground: ImageSourcePropType | null;
  groundForeground: ImageSourcePropType | null;
}

export const BATTLE_ARENA_ART_REGISTRY: Readonly<
  Record<BattleArenaThemeId, BattleArenaParallaxSlots>
> = {
  whitewood_forest: {
    themeId: 'whitewood_forest',
    name: 'Whitewood Forest (Live)',
    sky: null,
    cloudsOrMist: null,
    mountainsOrWalls: null,
    hillBackground: null,
    hillMidground: null,
    groundForeground: null,
  },
  crypt_catacombs: {
    themeId: 'crypt_catacombs',
    name: 'Crypt Catacombs',
    sky: null,
    cloudsOrMist: null,
    mountainsOrWalls: null,
    hillBackground: null,
    hillMidground: null,
    groundForeground: null,
  },
  obsidian_citadel: {
    themeId: 'obsidian_citadel',
    name: 'Obsidian Citadel',
    sky: null,
    cloudsOrMist: null,
    mountainsOrWalls: null,
    hillBackground: null,
    hillMidground: null,
    groundForeground: null,
  },
  sun_scorched_caldera: {
    themeId: 'sun_scorched_caldera',
    name: 'Sun-Scorched Caldera',
    sky: null,
    cloudsOrMist: null,
    mountainsOrWalls: null,
    hillBackground: null,
    hillMidground: null,
    groundForeground: null,
  },
  arena_courtyard: {
    themeId: 'arena_courtyard',
    name: 'Vanguard Arena Courtyard',
    sky: null,
    cloudsOrMist: null,
    mountainsOrWalls: null,
    hillBackground: null,
    hillMidground: null,
    groundForeground: null,
  },
};

export function inferBattleArenaThemeId(questOrThemeSlug?: string | null): BattleArenaThemeId {
  const s = (questOrThemeSlug ?? '').toLowerCase();
  if (s.includes('crypt') || s.includes('catacomb') || s.includes('undead')) {
    return 'crypt_catacombs';
  }
  if (s.includes('obsidian') || s.includes('citadel') || s.includes('fortress')) {
    return 'obsidian_citadel';
  }
  if (s.includes('caldera') || s.includes('ignis') || s.includes('ember') || s.includes('trial')) {
    return 'sun_scorched_caldera';
  }
  if (s.includes('arena') || s.includes('spar') || s.includes('company')) {
    return 'arena_courtyard';
  }
  return 'whitewood_forest';
}

// ============================================================================
// 4. RACE & MODULAR RIG BODY / MORPH ILLUSTRATION SLOTS
// ============================================================================

export interface RaceSilhouetteIllustrationSlot {
  standingSource: ImageSourcePropType | null;
  bustSource: ImageSourcePropType | null;
}

export const RACE_ILLUSTRATION_SLOTS: Readonly<
  Record<CharacterRace, Record<BaseSilhouetteId, RaceSilhouetteIllustrationSlot>>
> = {
  HUMAN: {
    balanced: { standingSource: null, bustSource: null },
    lithe: { standingSource: null, bustSource: null },
    broad_shouldered: { standingSource: null, bustSource: null },
  },
  ONI: {
    balanced: { standingSource: null, bustSource: null },
    lithe: { standingSource: null, bustSource: null },
    broad_shouldered: { standingSource: null, bustSource: null },
  },
  KITSUNE: {
    balanced: { standingSource: null, bustSource: null },
    lithe: { standingSource: null, bustSource: null },
    broad_shouldered: { standingSource: null, bustSource: null },
  },
};

export type RigBodyPartSlotKey =
  | 'head'
  | 'torso'
  | 'upperArm'
  | 'forearm'
  | 'thigh'
  | 'shin';

export type MorphEvolutionOverlaySlotKey =
  | 'oni_horns_t1'
  | 'oni_horns_t2'
  | 'oni_horns_t3'
  | 'kitsune_tails_1'
  | 'kitsune_tails_2'
  | 'kitsune_tails_3'
  | 'kitsune_tails_4'
  | 'kitsune_tails_5'
  | 'kitsune_tails_6'
  | 'kitsune_tails_7'
  | 'kitsune_tails_8'
  | 'kitsune_tails_9'
  | 'energy_aura_t1'
  | 'energy_aura_t2'
  | 'energy_aura_t3';

export const RIG_BODY_PART_ILLUSTRATION_SLOTS: Readonly<
  Record<CharacterRace, Record<RigBodyPartSlotKey, ImageSourcePropType | null>>
> = {
  HUMAN: {
    head: null,
    torso: null,
    upperArm: null,
    forearm: null,
    thigh: null,
    shin: null,
  },
  ONI: {
    head: null,
    torso: null,
    upperArm: null,
    forearm: null,
    thigh: null,
    shin: null,
  },
  KITSUNE: {
    head: null,
    torso: null,
    upperArm: null,
    forearm: null,
    thigh: null,
    shin: null,
  },
};

export const MORPH_EVOLUTION_OVERLAY_SLOTS: Readonly<
  Record<MorphEvolutionOverlaySlotKey, ImageSourcePropType | null>
> = {
  oni_horns_t1: null,
  oni_horns_t2: null,
  oni_horns_t3: null,
  kitsune_tails_1: null,
  kitsune_tails_2: null,
  kitsune_tails_3: null,
  kitsune_tails_4: null,
  kitsune_tails_5: null,
  kitsune_tails_6: null,
  kitsune_tails_7: null,
  kitsune_tails_8: null,
  kitsune_tails_9: null,
  energy_aura_t1: null,
  energy_aura_t2: null,
  energy_aura_t3: null,
};

export function getRaceStandingIllustration(
  race: CharacterRace,
  silhouette: BaseSilhouetteId = 'balanced'
): ImageSourcePropType | null {
  return RACE_ILLUSTRATION_SLOTS[race]?.[silhouette]?.standingSource ?? null;
}

export function getRaceBustIllustration(
  race: CharacterRace,
  silhouette: BaseSilhouetteId = 'balanced'
): ImageSourcePropType | null {
  return RACE_ILLUSTRATION_SLOTS[race]?.[silhouette]?.bustSource ?? null;
}

export function getRigBodyPartIllustration(
  race: CharacterRace,
  part: RigBodyPartSlotKey
): ImageSourcePropType | null {
  return RIG_BODY_PART_ILLUSTRATION_SLOTS[race]?.[part] ?? null;
}

export function getMorphEvolutionOverlay(
  key: MorphEvolutionOverlaySlotKey
): ImageSourcePropType | null {
  return MORPH_EVOLUTION_OVERLAY_SLOTS[key] ?? null;
}

// ============================================================================
// 5. BONE-ANCHORED PAPERDOLL EQUIPMENT RIG OVERLAY SLOTS (ALL 34 VARIANTS)
// ============================================================================

export const EQUIPMENT_RIG_OVERLAY_SLOTS: Readonly<
  Record<EquipmentVisualVariant, ImageSourcePropType | null>
> = {
  // Head
  kabuto_oni: null,
  iron_helm: null,
  hood_mask: null,
  crown_circlet: null,
  // Chest
  cuirass_plate: null,
  chainmail: null,
  brigandine: null,
  vestments: null,
  // Legs
  plate_cuisses: null,
  silk_hakama: null,
  strider_greaves: null,
  // Boots
  sabatons: null,
  tabi_treads: null,
  stompers: null,
  // Two-handed weapons
  greatsword: null,
  kanabo: null,
  greataxe: null,
  halberd: null,
  archstaff: null,
  longbow: null,
  // One-handed weapons
  daggers: null,
  wakizashi: null,
  warhammer: null,
  cleaver: null,
  longsword: null,
  war_fan: null,
  // Offhand
  tower_shield: null,
  buckler: null,
  censer_relic: null,
  grimoire: null,
  // Accessories
  guild_ring: null,
  oni_charm: null,
  malakor_signet: null,
  astral_amulet: null,
};

export function getEquipmentRigOverlaySource(
  variant: EquipmentVisualVariant
): ImageSourcePropType | null {
  return EQUIPMENT_RIG_OVERLAY_SLOTS[variant] ?? null;
}

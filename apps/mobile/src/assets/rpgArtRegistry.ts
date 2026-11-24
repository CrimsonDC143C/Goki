import type { ImageSourcePropType } from 'react-native';
import type { BaseSilhouetteId, CharacterRace } from '@goki/game-engine';
import type { EquipmentVisualVariant } from '../components/character/EquipmentPartSvg';
import type { NpcArchetypeId, NpcExpression } from '../components/npc/NpcPortraitSvg';
import {
  COMPILED_BATTLE_ARENA_ART,
  COMPILED_COMBAT_ENEMY_ART,
  COMPILED_HERO_COMBAT_ART,
  COMPILED_HUB_ENVIRONMENT_ART,
  COMPILED_LOOT_CHEST_ART,
  COMPILED_NPC_PORTRAIT_ART,
  COMPILED_RACE_ILLUSTRATION_ART,
  type CompiledBattleArenaOverrides,
  type CompiledCombatEnemyOverrides,
  type CompiledHubEnvironmentOverrides,
  type CompiledNpcPortraitOverrides,
  type CompiledRaceIllustrationOverrides,
} from './generated/compiledAssets.generated';

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

const BASE_HUB_ENVIRONMENT_ART_REGISTRY: Readonly<
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

function mergeHubEnvironmentArt(
  base: Readonly<Record<HubEnvironmentSlotId, HubEnvironmentArtSlot>>,
  overrides: CompiledHubEnvironmentOverrides
): Readonly<Record<HubEnvironmentSlotId, HubEnvironmentArtSlot>> {
  const merged = {} as Record<HubEnvironmentSlotId, HubEnvironmentArtSlot>;
  for (const slotId of Object.keys(base) as HubEnvironmentSlotId[]) {
    const slot = base[slotId];
    const override = overrides[slotId];
    merged[slotId] = {
      ...slot,
      backdropSource: override?.backdropSource ?? slot.backdropSource,
      headerBannerSource: override?.headerBannerSource ?? slot.headerBannerSource,
    };
  }
  return merged;
}

export const HUB_ENVIRONMENT_ART_REGISTRY: Readonly<
  Record<HubEnvironmentSlotId, HubEnvironmentArtSlot>
> = mergeHubEnvironmentArt(
  BASE_HUB_ENVIRONMENT_ART_REGISTRY,
  COMPILED_HUB_ENVIRONMENT_ART
);

export function getHubEnvironmentArt(slotId: HubEnvironmentSlotId): HubEnvironmentArtSlot {
  return HUB_ENVIRONMENT_ART_REGISTRY[slotId];
}

// ============================================================================
// 2. NPC PORTRAIT EXPRESSION VARIANTS (6 NPCs x 4 EXPRESSIONS = 24 SLOTS)
// ============================================================================

export type NpcPortraitExpressionMap = Record<NpcExpression, ImageSourcePropType | null>;

const BASE_NPC_PORTRAIT_ART_REGISTRY: Readonly<
  Record<NpcArchetypeId, NpcPortraitExpressionMap>
> = {
  GUIDE: { neutral: null, happy: null, focused: null, alert: null },
  GUILD_RECEPTIONIST: { neutral: null, happy: null, focused: null, alert: null },
  TRADER: { neutral: null, happy: null, focused: null, alert: null },
  TRAINER: { neutral: null, happy: null, focused: null, alert: null },
  QUARTERMASTER: { neutral: null, happy: null, focused: null, alert: null },
  CLAN_WARDEN: { neutral: null, happy: null, focused: null, alert: null },
};

function mergeNpcPortraitArt(
  base: Readonly<Record<NpcArchetypeId, NpcPortraitExpressionMap>>,
  overrides: CompiledNpcPortraitOverrides
): Readonly<Record<NpcArchetypeId, NpcPortraitExpressionMap>> {
  const merged = {} as Record<NpcArchetypeId, NpcPortraitExpressionMap>;
  for (const npcId of Object.keys(base) as NpcArchetypeId[]) {
    const baseMap = base[npcId];
    const override = overrides[npcId];
    merged[npcId] = {
      neutral: override?.neutral ?? baseMap.neutral,
      happy: override?.happy ?? baseMap.happy,
      focused: override?.focused ?? baseMap.focused,
      alert: override?.alert ?? baseMap.alert,
    };
  }
  return merged;
}

export const NPC_PORTRAIT_ART_REGISTRY: Readonly<
  Record<NpcArchetypeId, NpcPortraitExpressionMap>
> = mergeNpcPortraitArt(
  BASE_NPC_PORTRAIT_ART_REGISTRY,
  COMPILED_NPC_PORTRAIT_ART
);

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

export type BattleArenaParallaxLayerKey =
  | 'sky'
  | 'cloudsOrMist'
  | 'mountainsOrWalls'
  | 'hillBackground'
  | 'hillMidground'
  | 'groundForeground';

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

const BASE_BATTLE_ARENA_ART_REGISTRY: Readonly<
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

function mergeBattleArenaArt(
  base: Readonly<Record<BattleArenaThemeId, BattleArenaParallaxSlots>>,
  overrides: CompiledBattleArenaOverrides
): Readonly<Record<BattleArenaThemeId, BattleArenaParallaxSlots>> {
  const merged = {} as Record<BattleArenaThemeId, BattleArenaParallaxSlots>;
  for (const themeId of Object.keys(base) as BattleArenaThemeId[]) {
    const slot = base[themeId];
    const override = overrides[themeId];
    merged[themeId] = {
      ...slot,
      sky: override?.sky ?? slot.sky,
      cloudsOrMist: override?.cloudsOrMist ?? slot.cloudsOrMist,
      mountainsOrWalls: override?.mountainsOrWalls ?? slot.mountainsOrWalls,
      hillBackground: override?.hillBackground ?? slot.hillBackground,
      hillMidground: override?.hillMidground ?? slot.hillMidground,
      groundForeground: override?.groundForeground ?? slot.groundForeground,
    };
  }
  return merged;
}

export const BATTLE_ARENA_ART_REGISTRY: Readonly<
  Record<BattleArenaThemeId, BattleArenaParallaxSlots>
> = mergeBattleArenaArt(
  BASE_BATTLE_ARENA_ART_REGISTRY,
  COMPILED_BATTLE_ARENA_ART
);

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

const BASE_RACE_ILLUSTRATION_SLOTS: Readonly<
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

function mergeRaceIllustrationArt(
  base: Readonly<Record<CharacterRace, Record<BaseSilhouetteId, RaceSilhouetteIllustrationSlot>>>,
  overrides: CompiledRaceIllustrationOverrides
): Readonly<Record<CharacterRace, Record<BaseSilhouetteId, RaceSilhouetteIllustrationSlot>>> {
  const merged = {} as Record<
    CharacterRace,
    Record<BaseSilhouetteId, RaceSilhouetteIllustrationSlot>
  >;
  for (const race of Object.keys(base) as CharacterRace[]) {
    const silMap = {} as Record<BaseSilhouetteId, RaceSilhouetteIllustrationSlot>;
    for (const silhouette of Object.keys(base[race]) as BaseSilhouetteId[]) {
      const slot = base[race][silhouette];
      const override = overrides[race]?.[silhouette];
      silMap[silhouette] = {
        standingSource: override?.standingSource ?? slot.standingSource,
        bustSource: override?.bustSource ?? slot.bustSource,
      };
    }
    merged[race] = silMap;
  }
  return merged;
}

export const RACE_ILLUSTRATION_SLOTS: Readonly<
  Record<CharacterRace, Record<BaseSilhouetteId, RaceSilhouetteIllustrationSlot>>
> = mergeRaceIllustrationArt(
  BASE_RACE_ILLUSTRATION_SLOTS,
  COMPILED_RACE_ILLUSTRATION_ART
);

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

// ============================================================================
// 6. STAGE 4: REANIMATED COMBAT ENEMIES, RAID BOSSES, HERO SKINS & LOOT CHESTS
// ============================================================================

export type CombatMobArtId =
  | 'skeleton'
  | 'orc'
  | 'greatsword_skeleton'
  | 'knight'
  | 'swordsman'
  | 'archer';

export type CombatBossArtId =
  | 'ignisrax'
  | 'vaelgor'
  | 'malakor'
  | 'goretooth'
  | 'commander_vane'
  | 'valerius'
  | 'chronos';

export type CombatEnemyArtId = CombatMobArtId | CombatBossArtId;

export type LootChestTierId = 'tier_1' | 'tier_2' | 'tier_3' | 'tier_4' | 'tier_5';

export interface CombatEnemyArtSlot {
  id: CombatEnemyArtId;
  label: string;
  isBoss: boolean;
  spriteSource: ImageSourcePropType | null;
  bustSource: ImageSourcePropType | null;
}

const BASE_COMBAT_ENEMY_ART_REGISTRY: Readonly<Record<CombatEnemyArtId, CombatEnemyArtSlot>> = {
  skeleton: { id: 'skeleton', label: 'Skeleton Grunt', isBoss: false, spriteSource: null, bustSource: null },
  orc: { id: 'orc', label: 'Orc Marauder', isBoss: false, spriteSource: null, bustSource: null },
  greatsword_skeleton: { id: 'greatsword_skeleton', label: 'Dreadsword Skeleton', isBoss: false, spriteSource: null, bustSource: null },
  knight: { id: 'knight', label: 'Corrupted Knight', isBoss: false, spriteSource: null, bustSource: null },
  swordsman: { id: 'swordsman', label: 'Ashblade Duelist', isBoss: false, spriteSource: null, bustSource: null },
  archer: { id: 'archer', label: 'Duskwood Archer', isBoss: false, spriteSource: null, bustSource: null },
  ignisrax: { id: 'ignisrax', label: 'Ignisrax, World-Forge Wyrm', isBoss: true, spriteSource: null, bustSource: null },
  vaelgor: { id: 'vaelgor', label: 'Vaelgor, Guild Dread-Colossus', isBoss: true, spriteSource: null, bustSource: null },
  malakor: { id: 'malakor', label: 'Bone Lord Malakor', isBoss: true, spriteSource: null, bustSource: null },
  goretooth: { id: 'goretooth', label: 'Warchief Goretooth', isBoss: true, spriteSource: null, bustSource: null },
  commander_vane: { id: 'commander_vane', label: 'Fallen Commander Vane', isBoss: true, spriteSource: null, bustSource: null },
  valerius: { id: 'valerius', label: 'Arch-Lich Valerius', isBoss: true, spriteSource: null, bustSource: null },
  chronos: { id: 'chronos', label: 'Chronos, Void Watcher', isBoss: true, spriteSource: null, bustSource: null },
};

function mergeCombatEnemyArt(
  base: Readonly<Record<CombatEnemyArtId, CombatEnemyArtSlot>>,
  overrides: CompiledCombatEnemyOverrides
): Readonly<Record<CombatEnemyArtId, CombatEnemyArtSlot>> {
  const merged = {} as Record<CombatEnemyArtId, CombatEnemyArtSlot>;
  for (const id of Object.keys(base) as CombatEnemyArtId[]) {
    const slot = base[id];
    const ov = overrides[id];
    merged[id] = {
      ...slot,
      spriteSource: ov?.spriteSource ?? slot.spriteSource,
      bustSource: ov?.bustSource ?? slot.bustSource,
    };
  }
  return merged;
}

export const COMBAT_ENEMY_ART_REGISTRY: Readonly<Record<CombatEnemyArtId, CombatEnemyArtSlot>> =
  mergeCombatEnemyArt(BASE_COMBAT_ENEMY_ART_REGISTRY, COMPILED_COMBAT_ENEMY_ART);

export function resolveCombatEnemyArtId(isBoss?: boolean, nameOrId?: string | null): CombatEnemyArtId {
  const s = (nameOrId ?? '').toLowerCase();
  if (isBoss) {
    if (s.includes('ignis') || s.includes('wyrm') || s.includes('arbiter')) return 'ignisrax';
    if (s.includes('vaelgor') || s.includes('defiler') || s.includes('colossus') || s.includes('watch-captain')) return 'vaelgor';
    if (s.includes('malakor') || s.includes('bone lord')) return 'malakor';
    if (s.includes('goretooth') || s.includes('warchief') || s.includes('gnarlfang')) return 'goretooth';
    if (s.includes('vane') || s.includes('commander') || s.includes('korr')) return 'commander_vane';
    if (s.includes('valerius') || s.includes('lich') || s.includes('tidecaller') || s.includes('vess')) return 'valerius';
    if (s.includes('chronos') || s.includes('void') || s.includes('harbinger') || s.includes('xylar')) return 'chronos';
    return 'ignisrax';
  }
  if (s.includes('greatsword') || s.includes('executioner') || s.includes('dread-knight')) return 'greatsword_skeleton';
  if (s.includes('orc') || s.includes('brute') || s.includes('raider') || s.includes('marauder')) return 'orc';
  if (s.includes('knight') || s.includes('paladin') || s.includes('deserter') || s.includes('guardian') || s.includes('warden')) return 'knight';
  if (s.includes('swordsman') || s.includes('duelist') || s.includes('blade') || s.includes('assassin') || s.includes('warrior')) return 'swordsman';
  if (s.includes('archer') || s.includes('ranger') || s.includes('bow') || s.includes('hunter') || s.includes('stalker') || s.includes('scout') || s.includes('ghoul')) return 'archer';
  return 'skeleton';
}

export function getCombatEnemySprite(isBoss?: boolean, nameOrId?: string | null): ImageSourcePropType | null {
  const id = resolveCombatEnemyArtId(isBoss, nameOrId);
  return COMBAT_ENEMY_ART_REGISTRY[id]?.spriteSource ?? null;
}

export function getBossBustArt(nameOrId?: string | null): ImageSourcePropType | null {
  const id = resolveCombatEnemyArtId(true, nameOrId);
  return COMBAT_ENEMY_ART_REGISTRY[id]?.bustSource ?? null;
}

export const HERO_COMBAT_ART_REGISTRY: Readonly<Record<string, ImageSourcePropType>> =
  COMPILED_HERO_COMBAT_ART;

export function getHeroCombatSprite(
  race: CharacterRace = 'HUMAN',
  silhouette: BaseSilhouetteId = 'balanced',
  armored = false
): ImageSourcePropType | null {
  const r = race.toLowerCase();
  if (armored) {
    return HERO_COMBAT_ART_REGISTRY[`${r}_vanguard`] ?? HERO_COMBAT_ART_REGISTRY[`${r}_${silhouette}`] ?? null;
  }
  return HERO_COMBAT_ART_REGISTRY[`${r}_${silhouette}`] ?? HERO_COMBAT_ART_REGISTRY[`${r}_balanced`] ?? null;
}

export const LOOT_CHEST_ART_REGISTRY: Readonly<Record<LootChestTierId, ImageSourcePropType | null>> = {
  tier_1: COMPILED_LOOT_CHEST_ART.tier_1 ?? null,
  tier_2: COMPILED_LOOT_CHEST_ART.tier_2 ?? null,
  tier_3: COMPILED_LOOT_CHEST_ART.tier_3 ?? null,
  tier_4: COMPILED_LOOT_CHEST_ART.tier_4 ?? null,
  tier_5: COMPILED_LOOT_CHEST_ART.tier_5 ?? null,
};

export function getLootChestArt(tier: 1 | 2 | 3 | 4 | 5): ImageSourcePropType | null {
  return LOOT_CHEST_ART_REGISTRY[`tier_${tier}`] ?? null;
}

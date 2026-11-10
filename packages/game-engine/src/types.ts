/**
 * Core Domain Types for @goki/game-engine
 */

export type StatType = 'STRENGTH' | 'ENDURANCE' | 'AGILITY';

export type HolisticStatType =
  | 'STRENGTH'
  | 'ENDURANCE'
  | 'AGILITY'
  | 'DEXTERITY'
  | 'CONSTITUTION'
  | 'WISDOM'
  | 'SPIRIT';

export type HeartRateZone = 1 | 2 | 3 | 4 | 5;

export type ActivityType =
  | 'RESISTANCE'
  | 'CARDIO'
  | 'RUNNING'
  | 'CYCLING'
  | 'OUTDOOR_CYCLING'
  | 'ROWING'
  | 'SWIMMING'
  | 'JUMP_ROPE'
  | 'BADMINTON'
  | 'BOXING'
  | 'SPORT'
  | 'BRISK_WALK'
  | 'RECOVERY_MOBILITY'
  | 'CALISTHENICS'
  | 'ROCK_CLIMBING'
  | 'SLEEP'
  | 'STEPS'
  | 'YOGA'
  | 'PILATES'
  | 'MEDITATION'
  | 'BREATHWORK'
  | 'SAUNA'
  | 'COLD_PLUNGE'
  | 'calisthenics'
  | 'rock_climbing'
  | 'sleep'
  | 'steps'
  | 'yoga'
  | 'pilates'
  | 'meditation'
  | 'breathwork'
  | 'sauna'
  | 'cold_plunge'
  | (string & {});

export type WorkoutModality =
  | 'CALISTHENICS'
  | 'ROCK_CLIMBING'
  | 'SLEEP'
  | 'STEPS'
  | 'YOGA'
  | 'PILATES'
  | 'MEDITATION'
  | 'BREATHWORK'
  | 'SAUNA'
  | 'COLD_PLUNGE'
  | 'calisthenics'
  | 'rock_climbing'
  | 'sleep'
  | 'steps'
  | 'yoga'
  | 'pilates'
  | 'meditation'
  | 'breathwork'
  | 'sauna'
  | 'cold_plunge'
  | (string & {});

export type WorkoutSessionType =
  | 'RESISTANCE'
  | 'CARDIO_LOW_MOD'
  | 'CARDIO_HIGH_INTENSITY'
  | 'HYBRID'
  | 'ACTIVE_RECOVERY';

export type ItemRarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY' | 'MYTHIC';

export interface LootDrop {
  itemSlug: string;
  itemName: string;
  rarity: ItemRarity;
  quantity: number;
  // Optional Procedural Itemization Metadata (Tiers 1-5, Prefix, Suffix, T5 Unique)
  baseSlug?: string;
  tier?: 1 | 2 | 3 | 4 | 5;
  prefixId?: string | null;
  prefixLabel?: string | null;
  prefixSummary?: string | null;
  suffixId?: string | null;
  suffixLabel?: string | null;
  suffixSummary?: string | null;
  baseStatsSummary?: string;
  statBonuses?: EquipmentStatBonuses;
  primaryStatBonuses?: {
    STR?: number;
    END?: number;
    AGI?: number;
    DEX?: number;
    CON?: number;
    WIS?: number;
    SPR?: number;
  };
  uniquePassive?: {
    id?: string;
    uniqueName: string;
    uniqueLore: string;
    passiveId: string;
    passiveName: string;
    passiveDescription: string;
    passiveModifiers?: Record<string, number>;
  } | null;
}

export interface CoreStatBlock {
  strengthLevel: number;
  enduranceLevel: number;
  agilityLevel: number;
  dexLevel?: number;
  conLevel?: number;
  wisLevel?: number;
  sprLevel?: number;
  dexterityLevel?: number;
  constitutionLevel?: number;
  wisdomLevel?: number;
  spiritLevel?: number;
}

export interface NormalizedCoreStatBlock {
  strengthLevel: number;
  enduranceLevel: number;
  agilityLevel: number;
  dexLevel: number;
  conLevel: number;
  wisLevel: number;
  sprLevel: number;
  dexterityLevel: number;
  constitutionLevel: number;
  wisdomLevel: number;
  spiritLevel: number;
  hasHolisticStats: boolean;
}

/**
 * Normalizes a `CoreStatBlock` across both abbreviated (`dexLevel`, `conLevel`, `wisLevel`, `sprLevel`)
 * and full (`dexterityLevel`, `constitutionLevel`, `wisdomLevel`, `spiritLevel`) 7-stat field conventions.
 */
export function normalizeCoreStatBlock(
  block: Partial<CoreStatBlock> | null | undefined,
  defaultHolisticLevel = 1
): NormalizedCoreStatBlock {
  const safeFinite = (val: number | undefined, fallback: number): number =>
    typeof val === 'number' && Number.isFinite(val) ? Math.max(0, val) : fallback;

  const strengthLevel = safeFinite(block?.strengthLevel, 1);
  const enduranceLevel = safeFinite(block?.enduranceLevel, 1);
  const agilityLevel = safeFinite(block?.agilityLevel, 1);

  const rawDex = block?.dexLevel ?? block?.dexterityLevel;
  const rawCon = block?.conLevel ?? block?.constitutionLevel;
  const rawWis = block?.wisLevel ?? block?.wisdomLevel;
  const rawSpr = block?.sprLevel ?? block?.spiritLevel;

  const hasHolisticStats =
    rawDex !== undefined ||
    rawCon !== undefined ||
    rawWis !== undefined ||
    rawSpr !== undefined;

  const dexLevel = safeFinite(rawDex, defaultHolisticLevel);
  const conLevel = safeFinite(rawCon, defaultHolisticLevel);
  const wisLevel = safeFinite(rawWis, defaultHolisticLevel);
  const sprLevel = safeFinite(rawSpr, defaultHolisticLevel);

  return {
    strengthLevel,
    enduranceLevel,
    agilityLevel,
    dexLevel,
    conLevel,
    wisLevel,
    sprLevel,
    dexterityLevel: dexLevel,
    constitutionLevel: conLevel,
    wisdomLevel: wisLevel,
    spiritLevel: sprLevel,
    hasHolisticStats,
  };
}

export interface CharacterStats {
  strengthLevel: number;
  enduranceLevel: number;
  agilityLevel: number;
  dexLevel?: number;
  conLevel?: number;
  wisLevel?: number;
  sprLevel?: number;
  strengthXp?: number;
  enduranceXp?: number;
  agilityXp?: number;
  dexXp?: number;
  conXp?: number;
  wisXp?: number;
  sprXp?: number;
  dexterityLevel?: number;
  constitutionLevel?: number;
  wisdomLevel?: number;
  spiritLevel?: number;
  dexterityXp?: number;
  constitutionXp?: number;
  wisdomXp?: number;
  spiritXp?: number;
}

export interface EquipmentStatBonuses {
  maxHp?: number;
  maxStamina?: number;
  meleePower?: number;
  armorRating?: number;
  attackSpeedPct?: number;
  dodgeRating?: number;
  critChance?: number;
  critMultiplier?: number;
  damageMitigationPct?: number;
  lifeOnHit?: number;
  armorPenetrationPct?: number;
  skillPotencyPct?: number;
  startOfCombatShieldHp?: number;
  hazardResistancePct?: number;
}

export interface SystemicFatigueCombatPenalty {
  stacks: number;
  accuracyMultiplier: number;
  dodgeMultiplier: number;
  statEffectivenessMultiplier: number;
}

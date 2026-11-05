/**
 * Core Domain Types for @gymify/game-engine
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

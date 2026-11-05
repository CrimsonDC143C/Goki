import { DungeonWorkoutBuff } from './auto-battler-sim';
import { getSystemicFatigueCombatPenalties } from './fatigue-manager';
import { LootChestTier, RewardPayload } from './hybrid-reward-protocol';
import { HeartRateSample, SleepStageSample } from './ironman-verifier';
import { DEFAULT_TALENT_TREES, TalentTreeDefinition, aggregateTalentModifiers, CombatModifiers } from './talent-engine';
import { PrimaryStatBonuses } from './item-affix-engine';
import {
  CoreStatBlock,
  EquipmentStatBonuses,
  ItemRarity,
  LootDrop,
  StatType,
  WorkoutSessionType,
} from './types';
import {
  CardioSegmentInput,
  PrRecordBreakType,
  StatLevelProgressionResult,
  calculateOverallLevel,
} from './workout-calculator';
import { SetType, WorkoutCategory } from './workout-presets-rest';

// ============================================================================
// 1. 8-SLOT EQUIPMENT LOADOUT & STAT-GATE VALIDATION
// ============================================================================

export type EquipmentSlot =
  | 'mainHand'
  | 'offHand'
  | 'head'
  | 'chest'
  | 'legs'
  | 'boots'
  | 'accessory1'
  | 'accessory2';

export type EquipItemType =
  | 'WEAPON'
  | 'OFFHAND'
  | 'HEAD'
  | 'CHEST'
  | 'LEGS'
  | 'BOOTS'
  | 'ARMOR'
  | 'ACCESSORY'
  | 'MATERIAL'
  | 'CONSUMABLE';

export type EquipmentLoadoutMap = Record<EquipmentSlot, string | null>;

export interface EquipmentSlotDescriptor {
  slot: EquipmentSlot;
  label: string;
  shortLabel: string;
}

export const EQUIPMENT_SLOTS: readonly EquipmentSlotDescriptor[] = [
  { slot: 'mainHand', label: 'Main Hand', shortLabel: 'Main Hand' },
  { slot: 'offHand', label: 'Off-Hand', shortLabel: 'Off-Hand' },
  { slot: 'head', label: 'Head', shortLabel: 'Helm' },
  { slot: 'chest', label: 'Chest', shortLabel: 'Chest' },
  { slot: 'legs', label: 'Legs', shortLabel: 'Greaves' },
  { slot: 'boots', label: 'Boots', shortLabel: 'Boots' },
  { slot: 'accessory1', label: 'Accessory 1', shortLabel: 'Accessory 1' },
  { slot: 'accessory2', label: 'Accessory 2', shortLabel: 'Accessory 2' },
];

export function createEmptyEquipmentLoadout(): EquipmentLoadoutMap {
  return {
    mainHand: null,
    offHand: null,
    head: null,
    chest: null,
    legs: null,
    boots: null,
    accessory1: null,
    accessory2: null,
  };
}

export function isEquippableItemType(itemType: EquipItemType): boolean {
  return itemType !== 'MATERIAL' && itemType !== 'CONSUMABLE';
}

export function getCompatibleSlotsForItemType(
  itemType: EquipItemType,
  weaponHandedness?: 'ONE_HANDED' | 'TWO_HANDED'
): EquipmentSlot[] {
  switch (itemType) {
    case 'WEAPON':
      return weaponHandedness === 'ONE_HANDED' ? ['mainHand', 'offHand'] : ['mainHand'];
    case 'OFFHAND':
      return ['offHand'];
    case 'HEAD':
      return ['head'];
    case 'CHEST':
    case 'ARMOR':
      return ['chest'];
    case 'LEGS':
      return ['legs'];
    case 'BOOTS':
      return ['boots'];
    case 'ACCESSORY':
      return ['accessory1', 'accessory2'];
    case 'MATERIAL':
    case 'CONSUMABLE':
      return [];
  }
}

export function validateEquipmentRequirements(
  item: {
    itemType: EquipItemType;
    requiredStrength?: number;
    requiredEndurance?: number;
    requiredAgility?: number;
    weaponHandedness?: 'ONE_HANDED' | 'TWO_HANDED';
  },
  coreStats: CoreStatBlock,
  targetSlot?: EquipmentSlot
): { valid: boolean; error?: string; unmetStats: StatType[] } {
  if (!isEquippableItemType(item.itemType)) {
    return {
      valid: false,
      error: 'Consumables and crafting materials cannot be equipped in gear slots.',
      unmetStats: [],
    };
  }

  const compatibleSlots = getCompatibleSlotsForItemType(item.itemType, item.weaponHandedness);
  if (targetSlot && !compatibleSlots.includes(targetSlot)) {
    return {
      valid: false,
      error: `This item cannot be equipped in the ${targetSlot} slot.`,
      unmetStats: [],
    };
  }

  const unmetStats: StatType[] = [];
  const reqStr = item.requiredStrength ?? 0;
  const reqEnd = item.requiredEndurance ?? 0;
  const reqAgi = item.requiredAgility ?? 0;

  if (coreStats.strengthLevel < reqStr) {
    unmetStats.push('STRENGTH');
  }
  if (coreStats.enduranceLevel < reqEnd) {
    unmetStats.push('ENDURANCE');
  }
  if (coreStats.agilityLevel < reqAgi) {
    unmetStats.push('AGILITY');
  }

  if (unmetStats.length > 0) {
    if (unmetStats.includes('STRENGTH')) {
      return {
        valid: false,
        error: `Requires Strength Lv.${reqStr} (currently Lv.${coreStats.strengthLevel}).`,
        unmetStats,
      };
    }
    if (unmetStats.includes('ENDURANCE')) {
      return {
        valid: false,
        error: `Requires Endurance Lv.${reqEnd} (currently Lv.${coreStats.enduranceLevel}).`,
        unmetStats,
      };
    }
    return {
      valid: false,
      error: `Requires Agility Lv.${reqAgi} (currently Lv.${coreStats.agilityLevel}).`,
      unmetStats,
    };
  }

  return { valid: true, unmetStats: [] };
}

// ============================================================================
// 2. OVERALL CHARACTER LEVEL & COMBAT DERIVED ATTRIBUTES
// ============================================================================

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

function roundTo2(val: number): number {
  return Math.round(val * 100) / 100;
}

/**
 * Computes Overall Character Level consistently across the 7-stat progression formula.
 */
export function calculateOverallCharacterLevel(coreStats: CoreStatBlock): number {
  return calculateOverallLevel(coreStats);
}

export interface DerivedCombatAttributes {
  overallLevel: number;
  maxHp: number;
  maxStamina: number;
  meleePower: number;
  armor: number;
  damageMitigationPct: number;
  critChance: number;
  critMultiplier: number;
  dodgeChance: number;
  attackSpeedMultiplier: number;
  attacksPerSecond: number;
  accuracy: number;
  hazardResistancePct: number;
}

/**
 * Calculates total derived combat attributes from base stats + equipped gear + unlocked talents
 * across all 6 multi-class trees + active Systemic Fatigue penalties.
 */
export function calculateDerivedCombatStats(params: {
  coreStats: CoreStatBlock;
  equipmentBonuses?: EquipmentStatBonuses;
  equipmentPrimaryStats?: PrimaryStatBonuses;
  uniqueItemModifiers?: Partial<CombatModifiers>;
  unlockedTalentRanks?: Record<string, number>;
  systemicFatigueStacks?: number;
  talentTrees?: readonly TalentTreeDefinition[];
}): DerivedCombatAttributes {
  const trees = params.talentTrees ?? DEFAULT_TALENT_TREES;
  const talents = aggregateTalentModifiers(params.unlockedTalentRanks ?? {}, trees);
  const gear = params.equipmentBonuses ?? {};
  const gearPrim = params.equipmentPrimaryStats ?? {};
  const uniqueMods = params.uniqueItemModifiers ?? {};
  const fatigue = getSystemicFatigueCombatPenalties(params.systemicFatigueStacks ?? 0);

  // Merge unique passive modifiers into talents
  const mergedTalents = {
    ...talents,
    meleePowerPct: (talents.meleePowerPct ?? 0) + (uniqueMods.meleePowerPct ?? 0),
    armorPct: (talents.armorPct ?? 0) + (uniqueMods.armorPct ?? 0),
    maxHpPct: (talents.maxHpPct ?? 0) + (uniqueMods.maxHpPct ?? 0),
    maxStaminaPct: (talents.maxStaminaPct ?? 0) + (uniqueMods.maxStaminaPct ?? 0),
    damageMitigationPct: (talents.damageMitigationPct ?? 0) + (uniqueMods.damageMitigationPct ?? 0),
    attackSpeedPct: (talents.attackSpeedPct ?? 0) + (uniqueMods.attackSpeedPct ?? 0),
    critChanceBonus: (talents.critChanceBonus ?? 0) + (uniqueMods.critChanceBonus ?? 0),
    critDamageBonus: (talents.critDamageBonus ?? 0) + (uniqueMods.critDamageBonus ?? 0),
    dodgeRatingBonus: (talents.dodgeRatingBonus ?? 0) + (uniqueMods.dodgeRatingBonus ?? 0),
    hazardResistancePct: (talents.hazardResistancePct ?? 0) + (uniqueMods.hazardResistancePct ?? 0),
  };

  const strBonus = gearPrim.STR ?? 0;
  const endBonus = gearPrim.END ?? 0;
  const agiBonus = gearPrim.AGI ?? 0;
  const dexBonus = gearPrim.DEX ?? 0;
  const conBonus = gearPrim.CON ?? 0;
  const wisBonus = gearPrim.WIS ?? 0;
  const sprBonus = gearPrim.SPR ?? 0;

  const effStr = (params.coreStats.strengthLevel + strBonus) * fatigue.statEffectivenessMultiplier;
  const effEnd = (params.coreStats.enduranceLevel + endBonus) * fatigue.statEffectivenessMultiplier;
  const effAgi = (params.coreStats.agilityLevel + agiBonus) * fatigue.statEffectivenessMultiplier;
  const effCon = conBonus * fatigue.statEffectivenessMultiplier;
  const effDex = dexBonus * fatigue.statEffectivenessMultiplier;
  const effWis = wisBonus * fatigue.statEffectivenessMultiplier;
  const effSpr = sprBonus * fatigue.statEffectivenessMultiplier;

  const rawMaxHp = 220 + effEnd * 28 + effStr * 10 + effCon * 15 + (gear.maxHp ?? 0);
  const maxHp = Math.max(100, Math.round(rawMaxHp * (1 + mergedTalents.maxHpPct)));

  const rawMaxStamina = 90 + effEnd * 12 + effAgi * 5 + effWis * 6 + (gear.maxStamina ?? 0);
  const maxStamina = Math.max(40, Math.round(rawMaxStamina * (1 + mergedTalents.maxStaminaPct)));

  const rawMeleePower = 18 + effStr * 4.5 + effAgi * 1.2 + (gear.meleePower ?? 0);
  const meleePower = Math.max(5, Math.round(rawMeleePower * (1 + mergedTalents.meleePowerPct)));

  const rawArmor = 8 + effStr * 2.2 + effEnd * 1.5 + effCon * 2.0 + (gear.armorRating ?? 0);
  const armor = Math.max(0, Math.round(rawArmor * (1 + mergedTalents.armorPct)));

  const damageMitigationPct = roundTo2(
    clamp(
      mergedTalents.damageMitigationPct +
        mergedTalents.partyDamageMitigationPct +
        (gear.damageMitigationPct ?? 0) +
        effSpr * 0.005,
      0,
      0.75
    )
  );

  const attackSpeedMultiplier = roundTo2(
    (1 + effAgi * 0.02 + (gear.attackSpeedPct ?? 0) + mergedTalents.attackSpeedPct) *
      fatigue.statEffectivenessMultiplier
  );
  const attacksPerSecond = roundTo2(clamp(0.75 * attackSpeedMultiplier, 0.35, 3.5));

  const rawDodge = 0.04 + effAgi * 0.006 + (gear.dodgeRating ?? 0) + mergedTalents.dodgeRatingBonus;
  const dodgeChance = roundTo2(clamp(rawDodge * fatigue.dodgeMultiplier, 0, 0.60));

  const critChance = roundTo2(
    clamp(
      0.05 +
        effAgi * 0.007 +
        effDex * 0.006 +
        (gear.critChance ?? 0) +
        mergedTalents.critChanceBonus,
      0,
      0.80
    )
  );

  const critMultiplier = roundTo2(1.65 + (gear.critMultiplier ?? 0) + mergedTalents.critDamageBonus);
  const accuracy = roundTo2(clamp((0.96 + effDex * 0.004) * fatigue.accuracyMultiplier, 0.65, 1.0));
  const hazardResistancePct = roundTo2(
    clamp(
      effEnd * 0.015 + (gear.hazardResistancePct ?? 0) + mergedTalents.hazardResistancePct,
      0,
      0.85
    )
  );

  return {
    overallLevel: calculateOverallCharacterLevel(params.coreStats),
    maxHp,
    maxStamina,
    meleePower,
    armor,
    damageMitigationPct,
    critChance,
    critMultiplier,
    dodgeChance,
    attackSpeedMultiplier,
    attacksPerSecond,
    accuracy,
    hazardResistancePct,
  };
}

// ============================================================================
// 3. OFFLINE WORKOUT PAYLOADS & DEFERRED SPOILS RECEIPT CONSOLIDATION
// ============================================================================

export interface QueuedOfflineSetInput {
  exerciseId: string;
  exerciseName: string;
  reps: number;
  weightKg: number;
  rpe?: number | null;
  isWarmup: boolean;
  setType?: SetType;
  supersetGroupId?: string | null;
}

export interface QueuedOfflineWorkoutPayload {
  queueId: string;
  sessionId: string;
  /** Silent identifier attaching the queued offline workout to the character it was completed on. */
  characterId?: string | null;
  performedAtIso: string;
  durationSeconds: number;
  workoutType: WorkoutSessionType;
  workoutCategory?: WorkoutCategory;
  sourcePresetId?: string | null;
  sessionRpe?: number | null;
  sets: QueuedOfflineSetInput[];
  cardioSegments: CardioSegmentInput[];
  channelToRaidId?: string | null;
  channelToRaidName?: string | null;
  // Biometric & Recovery Telemetry Metadata
  telemetrySamples?: HeartRateSample[];
  osActivityClassification?: string | null;
  sleepStages?: SleepStageSample[];
  stepCount?: number | null;
  isHardwareVerified?: boolean;
  verificationSource?: string;
}

export interface WorkoutSpoilsReceipt {
  receiptId: string;
  sessionId: string;
  /** Silent identifier attaching the spoils receipt to the character it was completed on. */
  characterId?: string | null;
  performedAtIso: string;
  workoutType: WorkoutSessionType;
  durationSeconds: number;
  workingSetCount: number;
  totalTonnageKg: number;
  cardioDurationSeconds: number;
  xpGained: Record<StatType, number>;
  goldAwarded: number;
  effectiveMultiplier: number;
  statProgressions: Record<StatType, StatLevelProgressionResult>;
  prCrits: {
    triggered: boolean;
    prBreakCount: number;
    totalBonusXp: number;
    brokenRecords: Array<{
      exerciseId: string;
      exerciseName: string;
      prTypes: PrRecordBreakType[];
      governingStat: StatType;
    }>;
    guaranteedLootDrop: LootDrop | null;
  };
  chestTier: LootChestTier;
  chestName: string;
  chestDrops: LootDrop[];
  lootDrops: LootDrop[];
  dungeonBuffs: DungeonWorkoutBuff[];
  raidDamage: number;
  raidBossName: string | null;
  resilienceTriggered: boolean;
  resilienceBadgeTitle: string | null;
  syncedWithServer: boolean;
}

export interface ConsolidatedSpoilsSummary {
  sessionCount: number;
  totalTonnageKg: number;
  totalWorkingSets: number;
  totalCardioSeconds: number;
  totalXpGained: Record<StatType, number>;
  totalGoldAwarded: number;
  statLevelUps: Record<
    StatType,
    {
      startLevel: number;
      endLevel: number;
      levelsGained: number;
      talentPointsEarned: number;
    }
  >;
  totalLevelsGained: number;
  totalTalentPointsEarned: number;
  totalPrBreakCount: number;
  prCritsTriggered: boolean;
  allPrRecordsBroken: Array<{
    exerciseId: string;
    exerciseName: string;
    prTypes: PrRecordBreakType[];
    governingStat: StatType;
  }>;
  prCritBonusXp: number;
  prCritDrops: LootDrop[];
  chestDrops: LootDrop[];
  allLootDrops: LootDrop[];
  injectedDungeonBuffs: DungeonWorkoutBuff[];
  totalRaidDamage: number;
  raidTargets: string[];
  resilienceBadges: string[];
}

/**
 * Automatically classifies an Offline Workout session type from its logged sets & cardio entries
 * so gym users never have to configure RPG modalities before lifting.
 */
export function inferOfflineWorkoutType(params: {
  sets: readonly { reps: number; isWarmup?: boolean }[];
  cardioSegments: readonly CardioSegmentInput[];
  exerciseCategoryById?: Record<string, 'RESISTANCE' | 'CARDIO' | 'RECOVERY_MOBILITY'>;
}): WorkoutSessionType {
  const hasSets = params.sets.some((s) => s.reps > 0);
  const validCardio = params.cardioSegments.filter((c) => c.durationSeconds > 0);

  if (hasSets && validCardio.length > 0) {
    return 'HYBRID';
  }
  if (hasSets) {
    return 'RESISTANCE';
  }
  if (validCardio.length === 0) {
    return 'RESISTANCE';
  }

  const allRecovery = validCardio.every((c) => {
    const cat = params.exerciseCategoryById?.[c.exerciseId];
    return cat === 'RECOVERY_MOBILITY' || c.exerciseId.includes('yoga') || c.exerciseId.includes('recovery');
  });
  if (allRecovery) {
    return 'ACTIVE_RECOVERY';
  }

  const maxZone = Math.max(...validCardio.map((c) => c.averageHrZone));
  if (maxZone >= 4) {
    return 'CARDIO_HIGH_INTENSITY';
  }
  return 'CARDIO_LOW_MOD';
}

function mergeLootDrops(drops: readonly LootDrop[]): LootDrop[] {
  const map = new Map<string, LootDrop>();
  for (const d of drops) {
    const existing = map.get(d.itemSlug);
    if (existing) {
      existing.quantity += d.quantity;
    } else {
      map.set(d.itemSlug, {
        itemSlug: d.itemSlug,
        itemName: d.itemName,
        rarity: d.rarity as ItemRarity,
        quantity: d.quantity,
      });
    }
  }
  return Array.from(map.values());
}

/**
 * Builds a structured `WorkoutSpoilsReceipt` from a consolidated `RewardPayload` and side-effect metadata.
 */
export function buildWorkoutSpoilsReceipt(params: {
  receiptId: string;
  characterId?: string | null;
  performedAtIso: string;
  workoutType: WorkoutSessionType;
  rewardPayload: RewardPayload;
  dungeonBuffs: readonly DungeonWorkoutBuff[];
  raidDamage: number;
  raidBossName?: string | null;
  exerciseNameById?: Record<string, string>;
  syncedWithServer: boolean;
}): WorkoutSpoilsReceipt {
  const { rewardPayload } = params;
  const crit = rewardPayload.workoutEvaluation.criticalTrainingBonus;
  const chestDrops = [...rewardPayload.lootChest.drops];
  const combinedDrops = mergeLootDrops([
    ...(crit.guaranteedLootDrop ? [crit.guaranteedLootDrop] : []),
    ...chestDrops,
  ]);

  const cardioDurationSeconds = rewardPayload.workoutEvaluation.updatedPRs
    ? Math.max(0, rewardPayload.durationSeconds)
    : 0;

  return {
    receiptId: params.receiptId,
    sessionId: rewardPayload.sessionId,
    characterId: params.characterId ?? null,
    performedAtIso: params.performedAtIso,
    workoutType: params.workoutType,
    durationSeconds: rewardPayload.durationSeconds,
    workingSetCount: rewardPayload.workingSetCount,
    totalTonnageKg: rewardPayload.totalTonnageKg,
    cardioDurationSeconds,
    xpGained: { ...rewardPayload.finalXpByStat },
    goldAwarded: rewardPayload.totalGoldAwarded,
    effectiveMultiplier: rewardPayload.effectiveTotalMultiplier,
    statProgressions: {
      STRENGTH: { ...rewardPayload.characterProgression.byStat.STRENGTH },
      ENDURANCE: { ...rewardPayload.characterProgression.byStat.ENDURANCE },
      AGILITY: { ...rewardPayload.characterProgression.byStat.AGILITY },
    },
    prCrits: {
      triggered: crit.triggered,
      prBreakCount: crit.prBreakCount,
      totalBonusXp: crit.totalBonusXp,
      brokenRecords: crit.brokenRecords.map((br) => ({
        exerciseId: br.exerciseId,
        exerciseName: params.exerciseNameById?.[br.exerciseId] ?? br.exerciseId,
        prTypes: [...br.prTypes],
        governingStat: br.governingStat,
      })),
      guaranteedLootDrop: crit.guaranteedLootDrop ? { ...crit.guaranteedLootDrop } : null,
    },
    chestTier: rewardPayload.lootChest.tier,
    chestName: rewardPayload.lootChest.chestName,
    chestDrops,
    lootDrops: combinedDrops,
    dungeonBuffs: [...params.dungeonBuffs],
    raidDamage: Math.max(0, Math.round(params.raidDamage)),
    raidBossName: params.raidBossName ?? null,
    resilienceTriggered: rewardPayload.resilienceBonus.triggered,
    resilienceBadgeTitle: rewardPayload.resilienceBonus.badgeTitle,
    syncedWithServer: params.syncedWithServer,
  };
}

/**
 * Consolidates one or more deferred `WorkoutSpoilsReceipt` entries into a single celebratory
 * post-workout spoils summary for `CharacterProfileScreen`.
 */
export function consolidateSpoilsReceipts(
  receipts: readonly WorkoutSpoilsReceipt[]
): ConsolidatedSpoilsSummary | null {
  if (receipts.length === 0) {
    return null;
  }

  const first = receipts[0]!;
  const last = receipts[receipts.length - 1]!;

  const totalXpGained: Record<StatType, number> = {
    STRENGTH: 0,
    ENDURANCE: 0,
    AGILITY: 0,
  };

  const levelsGainedByStat: Record<StatType, number> = {
    STRENGTH: 0,
    ENDURANCE: 0,
    AGILITY: 0,
  };

  const talentPointsByStat: Record<StatType, number> = {
    STRENGTH: 0,
    ENDURANCE: 0,
    AGILITY: 0,
  };

  let totalTonnageKg = 0;
  let totalWorkingSets = 0;
  let totalCardioSeconds = 0;
  let totalGoldAwarded = 0;
  let totalPrBreakCount = 0;
  let prCritBonusXp = 0;
  let totalRaidDamage = 0;

  const prMap = new Map<
    string,
    {
      exerciseId: string;
      exerciseName: string;
      prTypes: Set<PrRecordBreakType>;
      governingStat: StatType;
    }
  >();

  const rawPrCritDrops: LootDrop[] = [];
  const rawChestDrops: LootDrop[] = [];
  const injectedDungeonBuffs: DungeonWorkoutBuff[] = [];
  const raidTargetSet = new Set<string>();
  const resilienceBadgeSet = new Set<string>();

  for (const r of receipts) {
    totalTonnageKg = roundTo2(totalTonnageKg + r.totalTonnageKg);
    totalWorkingSets += r.workingSetCount;
    totalCardioSeconds += r.cardioDurationSeconds;
    totalGoldAwarded += r.goldAwarded;
    totalRaidDamage += r.raidDamage;

    for (const st of ['STRENGTH', 'ENDURANCE', 'AGILITY'] as const) {
      totalXpGained[st] += r.xpGained[st];
      levelsGainedByStat[st] += r.statProgressions[st].levelsGained;
      talentPointsByStat[st] += r.statProgressions[st].talentPointsEarned;
    }

    if (r.prCrits.triggered) {
      totalPrBreakCount += r.prCrits.prBreakCount;
      prCritBonusXp += r.prCrits.totalBonusXp;
      if (r.prCrits.guaranteedLootDrop) {
        rawPrCritDrops.push(r.prCrits.guaranteedLootDrop);
      }
      for (const br of r.prCrits.brokenRecords) {
        const existing = prMap.get(br.exerciseId);
        if (existing) {
          for (const t of br.prTypes) existing.prTypes.add(t);
        } else {
          prMap.set(br.exerciseId, {
            exerciseId: br.exerciseId,
            exerciseName: br.exerciseName,
            prTypes: new Set(br.prTypes),
            governingStat: br.governingStat,
          });
        }
      }
    }

    rawChestDrops.push(...r.chestDrops);
    injectedDungeonBuffs.push(...r.dungeonBuffs);

    if (r.raidDamage > 0 && r.raidBossName) {
      raidTargetSet.add(r.raidBossName);
    }
    if (r.resilienceTriggered && r.resilienceBadgeTitle) {
      resilienceBadgeSet.add(r.resilienceBadgeTitle);
    }
  }

  const statLevelUps: ConsolidatedSpoilsSummary['statLevelUps'] = {
    STRENGTH: {
      startLevel: first.statProgressions.STRENGTH.previousLevel,
      endLevel: last.statProgressions.STRENGTH.newLevel,
      levelsGained: levelsGainedByStat.STRENGTH,
      talentPointsEarned: talentPointsByStat.STRENGTH,
    },
    ENDURANCE: {
      startLevel: first.statProgressions.ENDURANCE.previousLevel,
      endLevel: last.statProgressions.ENDURANCE.newLevel,
      levelsGained: levelsGainedByStat.ENDURANCE,
      talentPointsEarned: talentPointsByStat.ENDURANCE,
    },
    AGILITY: {
      startLevel: first.statProgressions.AGILITY.previousLevel,
      endLevel: last.statProgressions.AGILITY.newLevel,
      levelsGained: levelsGainedByStat.AGILITY,
      talentPointsEarned: talentPointsByStat.AGILITY,
    },
  };

  const prCritDrops = mergeLootDrops(rawPrCritDrops);
  const chestDrops = mergeLootDrops(rawChestDrops);
  const allLootDrops = mergeLootDrops([...rawPrCritDrops, ...rawChestDrops]);

  return {
    sessionCount: receipts.length,
    totalTonnageKg,
    totalWorkingSets,
    totalCardioSeconds,
    totalXpGained,
    totalGoldAwarded,
    statLevelUps,
    totalLevelsGained:
      levelsGainedByStat.STRENGTH + levelsGainedByStat.ENDURANCE + levelsGainedByStat.AGILITY,
    totalTalentPointsEarned:
      talentPointsByStat.STRENGTH + talentPointsByStat.ENDURANCE + talentPointsByStat.AGILITY,
    totalPrBreakCount,
    prCritsTriggered: totalPrBreakCount > 0,
    allPrRecordsBroken: Array.from(prMap.values()).map((entry) => ({
      exerciseId: entry.exerciseId,
      exerciseName: entry.exerciseName,
      prTypes: Array.from(entry.prTypes),
      governingStat: entry.governingStat,
    })),
    prCritBonusXp,
    prCritDrops,
    chestDrops,
    allLootDrops,
    injectedDungeonBuffs,
    totalRaidDamage,
    raidTargets: Array.from(raidTargetSet),
    resilienceBadges: Array.from(resilienceBadgeSet),
  };
}

import { createSeededRng } from './rng';
import { LootDrop } from './types';

// ============================================================================
// CONSTANTS & TIER DEFINITIONS
// ============================================================================

export type RaidAccessMode = 'PUBLIC_WORLD' | 'GUILD_ONLY';

export type RaidContributionTier = 'S' | 'A' | 'B' | 'C' | 'PARTICIPATION';

export type RaidDamageMilestonePool =
  | 'NONE'
  | 'BRONZE_CACHE'
  | 'SILVER_CACHE'
  | 'GOLD_CACHE'
  | 'PLATINUM_CACHE'
  | 'SLAYER_VAULT';

export const RAID_KILL_BONUS_MULTIPLIER = 1.5; // +50% gold, materials & reputation when Boss HP reaches 0
export const GUILD_RAID_COORDINATION_BONUS = 1.15; // Guild-only raids award +15% guild reputation scaling

// ============================================================================
// INTERFACES
// ============================================================================

export interface WeightedRaidLootEntry extends LootDrop {
  weight: number;
  /** If true, this rare/mythic item only drops when the boss is actually slain (`isBossDefeated === true`) */
  requiresBossDefeat?: boolean;
  /** Minimum contribution tier required to roll on this entry */
  minTier?: RaidContributionTier;
}

export interface RaidParticipantInput {
  characterId: string;
  combatDamageDealt: number;
  workoutEnergyDamage: number;
  supportScore?: number;
}

export interface RaidRewardCalculationInput {
  raidInstanceId: string;
  accessType: RaidAccessMode;
  bossMaxHp: number;
  /** Optional explicit flag; if omitted, derived from `totalDamageDealt >= bossMaxHp` */
  isBossDefeated?: boolean;
  baseGoldPool: number;
  baseGuildReputationPool: number;
  baseMaterialQuantity: number;
  craftingMaterialTemplate?: {
    itemSlug: string;
    itemName: string;
  };
  lootTable?: readonly WeightedRaidLootEntry[];
  participants: readonly RaidParticipantInput[];
  seed?: string;
}

export interface ParticipantRaidReward {
  characterId: string;
  effectiveContribution: number;
  contributionPercentage: number; // 0..100
  contributionRatio: number; // 0..1
  individualModifier: number;
  rewardTier: RaidContributionTier;
  goldAwarded: number;
  guildReputationAwarded: number;
  lootDrops: LootDrop[];
}

export interface RaidRewardResolutionResult {
  raidInstanceId: string;
  accessType: RaidAccessMode;
  bossMaxHp: number;
  totalDamageDealt: number;
  totalSupportScore: number;
  totalEffectiveRaidScore: number;
  bossHpRemaining: number;
  damageProgressRatio: number;
  isBossDefeated: boolean;
  killBonusMultiplier: number;
  unlockedMilestonePool: RaidDamageMilestonePool;
  participantRewards: ParticipantRaidReward[];
}

// ============================================================================
// HELPERS — WORKOUT CHANNELING & TIER RANKING
// ============================================================================

const TIER_RANK_ORDER: Record<RaidContributionTier, number> = {
  PARTICIPATION: 1,
  C: 2,
  B: 3,
  A: 4,
  S: 5,
};

const TIER_GEAR_ROLL_COUNT: Record<RaidContributionTier, number> = {
  S: 3,
  A: 2,
  B: 2,
  C: 1,
  PARTICIPATION: 1,
};

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function roundTo2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Converts a player's real-world workout XP earned during an active 7-day Raid into
 * direct Boss Energy Damage channeled against the Raid Boss.
 */
export function calculateWorkoutRaidEnergyDamage(params: {
  strengthXp: number;
  enduranceXp: number;
  agilityXp: number;
  triggeredPrCrit?: boolean;
}): number {
  const baseXpSum =
    Math.max(0, params.strengthXp) +
    Math.max(0, params.enduranceXp) +
    Math.max(0, params.agilityXp);
  const critMultiplier = params.triggeredPrCrit ? 1.25 : 1.0;
  return Math.round(baseXpSum * 12 * critMultiplier);
}

export function determineDamageMilestonePool(
  damageProgressRatio: number,
  isBossDefeated: boolean
): RaidDamageMilestonePool {
  if (isBossDefeated || damageProgressRatio >= 1.0) return 'SLAYER_VAULT';
  if (damageProgressRatio >= 0.75) return 'PLATINUM_CACHE';
  if (damageProgressRatio >= 0.50) return 'GOLD_CACHE';
  if (damageProgressRatio >= 0.25) return 'SILVER_CACHE';
  if (damageProgressRatio > 0) return 'BRONZE_CACHE';
  return 'NONE';
}

/**
 * Classifies an individual's contribution relative to the raid's fair-share average (`1 / N`).
 * For example, in a 10-player raid, fair share is 10% (`relativeShare = 1.0`).
 * Doing >= 1.75x fair share earns S-Tier; >= 1.2x earns A-Tier; >= 0.75x earns B-Tier; etc.
 */
export function classifyContributionTier(
  contributionRatio: number,
  activeParticipantCount: number
): RaidContributionTier {
  if (contributionRatio <= 0 || activeParticipantCount <= 0) {
    return 'PARTICIPATION';
  }
  const fairShare = 1 / activeParticipantCount;
  const relativeToAverage = contributionRatio / fairShare;

  if (relativeToAverage >= 1.75 || contributionRatio >= 0.35) return 'S';
  if (relativeToAverage >= 1.20 || contributionRatio >= 0.20) return 'A';
  if (relativeToAverage >= 0.75) return 'B';
  if (relativeToAverage >= 0.30) return 'C';
  return 'PARTICIPATION';
}

// ============================================================================
// END-OF-WEEK 7-DAY RAID REWARD ENGINE
// ============================================================================

/**
 * Distributes end-of-week 7-day Raid Boss rewards based on:
 * 1. Total Damage Dealt across the raid (`damageProgressRatio` & milestone tier)
 * 2. Kill Bonus Multiplier (`1.5x` + boss-defeat-exclusive loot table unlock if Boss HP reached 0)
 * 3. Individual Contribution Modifier (percentage of total damage/energy/support contributed)
 */
export function calculateRaidRewards(
  input: RaidRewardCalculationInput
): RaidRewardResolutionResult {
  const bossMaxHp = Math.max(1, input.bossMaxHp);
  const rng = createSeededRng(input.seed ?? `raid-${input.raidInstanceId}`);

  const normalizedParticipants = input.participants.map((p) => {
    const combatDmg = Math.max(0, p.combatDamageDealt);
    const workoutDmg = Math.max(0, p.workoutEnergyDamage);
    const support = Math.max(0, p.supportScore ?? 0);
    const totalDamage = combatDmg + workoutDmg;
    const effectiveScore = totalDamage + support;
    return {
      characterId: p.characterId,
      totalDamage,
      support,
      effectiveScore,
    };
  });

  const totalDamageDealt = normalizedParticipants.reduce((sum, p) => sum + p.totalDamage, 0);
  const totalSupportScore = normalizedParticipants.reduce((sum, p) => sum + p.support, 0);
  const totalEffectiveRaidScore = normalizedParticipants.reduce(
    (sum, p) => sum + p.effectiveScore,
    0
  );

  const isBossDefeated =
    input.isBossDefeated !== undefined
      ? Boolean(input.isBossDefeated)
      : totalDamageDealt >= bossMaxHp;

  const bossHpRemaining = isBossDefeated ? 0 : Math.max(0, bossMaxHp - totalDamageDealt);
  const damageProgressRatio = isBossDefeated
    ? 1.0
    : roundTo2(clamp(totalDamageDealt / bossMaxHp, 0, 1));

  // Factor 1: Total Damage Progress Scaling (minimum 0.15 floor if damage > 0, up to 1.0 at full HP)
  const damageScalingFactor =
    totalDamageDealt > 0 ? Math.max(0.15, damageProgressRatio) : 0;

  // Factor 2: Kill Bonus Multiplier
  const killBonusMultiplier = isBossDefeated ? RAID_KILL_BONUS_MULTIPLIER : 1.0;

  const unlockedMilestonePool = determineDamageMilestonePool(
    damageProgressRatio,
    isBossDefeated
  );

  const activeParticipants = normalizedParticipants.filter((p) => p.effectiveScore > 0);
  const activeCount = activeParticipants.length;

  const materialMeta = input.craftingMaterialTemplate ?? {
    itemSlug: 'raid_essence_crystal',
    itemName: 'Raid Boss Essence Crystal',
  };

  const guildModeRepBonus =
    input.accessType === 'GUILD_ONLY' ? GUILD_RAID_COORDINATION_BONUS : 1.0;

  // Effective pool unlocked by the raid's collective effort
  const unlockedGoldPool = input.baseGoldPool * damageScalingFactor * killBonusMultiplier;
  const unlockedRepPool =
    input.baseGuildReputationPool *
    damageScalingFactor *
    killBonusMultiplier *
    guildModeRepBonus;

  const participantRewards: ParticipantRaidReward[] = normalizedParticipants.map((p) => {
    if (p.effectiveScore <= 0 || totalEffectiveRaidScore <= 0) {
      return {
        characterId: p.characterId,
        effectiveContribution: 0,
        contributionPercentage: 0,
        contributionRatio: 0,
        individualModifier: 0,
        rewardTier: 'PARTICIPATION',
        goldAwarded: 0,
        guildReputationAwarded: 0,
        lootDrops: [],
      };
    }

    // Factor 3: Individual Contribution Modifier
    // Blends 20% equal active-raider share + 80% strict contribution share (capped at 0.65 per player
    // so solo/small-group clears scale generously without starving co-op raid teammates).
    const contributionRatio = p.effectiveScore / totalEffectiveRaidScore;
    const equalShareRatio = 1 / activeCount;
    const rawIndividualShare = 0.2 * equalShareRatio + 0.8 * contributionRatio;
    const individualModifier = roundTo2(Math.min(0.65, rawIndividualShare));

    const rewardTier = classifyContributionTier(contributionRatio, activeCount);

    const goldAwarded = Math.max(10, Math.round(unlockedGoldPool * individualModifier));
    const guildReputationAwarded = Math.max(
      5,
      Math.round(unlockedRepPool * individualModifier)
    );

    const lootDrops: LootDrop[] = [];

    // Guaranteed Crafting Materials scaled by raid progress, kill bonus, and individual share
    const matQty = Math.max(
      1,
      Math.round(
        input.baseMaterialQuantity *
          damageScalingFactor *
          killBonusMultiplier *
          (0.5 + contributionRatio * activeCount * 0.5)
      )
    );

    lootDrops.push({
      itemSlug: materialMeta.itemSlug,
      itemName: materialMeta.itemName,
      rarity: isBossDefeated ? 'RARE' : 'UNCOMMON',
      quantity: matQty,
    });

    // Roll Rare / Boss Gear Table based on tier & whether the Boss was defeated
    if (input.lootTable && input.lootTable.length > 0 && damageProgressRatio >= 0.25) {
      const eligibleLoot = input.lootTable.filter((entry) => {
        if (entry.requiresBossDefeat && !isBossDefeated) return false;
        if (
          entry.minTier &&
          TIER_RANK_ORDER[rewardTier] < TIER_RANK_ORDER[entry.minTier]
        ) {
          return false;
        }
        return true;
      });

      if (eligibleLoot.length > 0) {
        const baseRolls = TIER_GEAR_ROLL_COUNT[rewardTier];
        const effectiveRolls = isBossDefeated ? baseRolls : Math.max(1, baseRolls - 1);

        for (let r = 0; r < effectiveRolls; r++) {
          const picked = rng.pickWeighted(eligibleLoot);
          const existing = lootDrops.find((d) => d.itemSlug === picked.itemSlug);
          if (existing) {
            existing.quantity += picked.quantity;
          } else {
            lootDrops.push({
              itemSlug: picked.itemSlug,
              itemName: picked.itemName,
              rarity: picked.rarity,
              quantity: picked.quantity,
            });
          }
        }
      }
    }

    return {
      characterId: p.characterId,
      effectiveContribution: roundTo2(p.effectiveScore),
      contributionPercentage: roundTo2(contributionRatio * 100),
      contributionRatio: roundTo2(contributionRatio),
      individualModifier,
      rewardTier,
      goldAwarded,
      guildReputationAwarded,
      lootDrops,
    };
  });

  return {
    raidInstanceId: input.raidInstanceId,
    accessType: input.accessType,
    bossMaxHp,
    totalDamageDealt: roundTo2(totalDamageDealt),
    totalSupportScore: roundTo2(totalSupportScore),
    totalEffectiveRaidScore: roundTo2(totalEffectiveRaidScore),
    bossHpRemaining: roundTo2(bossHpRemaining),
    damageProgressRatio,
    isBossDefeated,
    killBonusMultiplier,
    unlockedMilestonePool,
    participantRewards,
  };
}

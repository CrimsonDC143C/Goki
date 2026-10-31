import { describe, expect, it } from 'vitest';
import {
  RAID_KILL_BONUS_MULTIPLIER,
  WeightedRaidLootEntry,
  calculateRaidRewards,
  calculateWorkoutRaidEnergyDamage,
} from '../src/raid-rewards';

const RAID_LOOT_POOL: readonly WeightedRaidLootEntry[] = [
  {
    itemSlug: 'drake_scale_plate',
    itemName: 'Drake Scale Chestplate',
    rarity: 'RARE',
    quantity: 1,
    weight: 60,
  },
  {
    itemSlug: 'emberheart_greatsword',
    itemName: 'Emberheart Greatsword',
    rarity: 'LEGENDARY',
    quantity: 1,
    weight: 25,
    requiresBossDefeat: true,
    minTier: 'A',
  },
  {
    itemSlug: 'crown_of_the_wyrm',
    itemName: 'Crown of the World Wyrm',
    rarity: 'MYTHIC',
    quantity: 1,
    weight: 15,
    requiresBossDefeat: true,
    minTier: 'S',
  },
];

describe('raid-rewards', () => {
  it('converts logged workout XP into channeled Raid Boss energy damage with PR crit amplification', () => {
    const normalEnergy = calculateWorkoutRaidEnergyDamage({
      strengthXp: 250,
      enduranceXp: 100,
      agilityXp: 0,
      triggeredPrCrit: false,
    });
    const critEnergy = calculateWorkoutRaidEnergyDamage({
      strengthXp: 250,
      enduranceXp: 100,
      agilityXp: 0,
      triggeredPrCrit: true,
    });

    expect(normalEnergy).toBe(4200);
    expect(critEnergy).toBe(5250);
  });

  it('scales rewards by Total Damage Dealt, Kill Bonus Multiplier, and Individual Contribution %', () => {
    const participants = [
      {
        characterId: 'carry_mvp',
        combatDamageDealt: 320_000,
        workoutEnergyDamage: 180_000,
        supportScore: 20_000,
      },
      {
        characterId: 'steady_raider',
        combatDamageDealt: 200_000,
        workoutEnergyDamage: 110_000,
        supportScore: 40_000,
      },
      {
        characterId: 'casual_member',
        combatDamageDealt: 90_000,
        workoutEnergyDamage: 60_000,
        supportScore: 10_000,
      },
      {
        characterId: 'afk_leech',
        combatDamageDealt: 0,
        workoutEnergyDamage: 0,
        supportScore: 0,
      },
    ];

    // Total damage = (500k + 310k + 150k) = 960k vs 900k HP Boss -> DEFEATED!
    const defeatedRes = calculateRaidRewards({
      raidInstanceId: 'raid_guild_week1',
      accessType: 'GUILD_ONLY',
      bossMaxHp: 900_000,
      baseGoldPool: 10_000,
      baseGuildReputationPool: 2_000,
      baseMaterialQuantity: 10,
      lootTable: RAID_LOOT_POOL,
      participants,
      seed: 'guild-raid-seed-1',
    });

    expect(defeatedRes.isBossDefeated).toBe(true);
    expect(defeatedRes.killBonusMultiplier).toBe(RAID_KILL_BONUS_MULTIPLIER);
    expect(defeatedRes.unlockedMilestonePool).toBe('SLAYER_VAULT');

    const mvp = defeatedRes.participantRewards.find((p) => p.characterId === 'carry_mvp')!;
    const steady = defeatedRes.participantRewards.find((p) => p.characterId === 'steady_raider')!;
    const casual = defeatedRes.participantRewards.find((p) => p.characterId === 'casual_member')!;
    const leech = defeatedRes.participantRewards.find((p) => p.characterId === 'afk_leech')!;

    expect(mvp.rewardTier).toBe('S');
    expect(mvp.goldAwarded).toBeGreaterThan(steady.goldAwarded);
    expect(steady.goldAwarded).toBeGreaterThan(casual.goldAwarded);
    expect(casual.goldAwarded).toBeGreaterThan(0);

    // Zero-contribution participant receives nothing
    expect(leech.goldAwarded).toBe(0);
    expect(leech.lootDrops).toHaveLength(0);
  });

  it('withholds Kill Bonus Multiplier and boss-defeat-exclusive Mythic/Legendary gear when boss survives 7-day window', () => {
    const participants = [
      {
        characterId: 'raider_1',
        combatDamageDealt: 250_000,
        workoutEnergyDamage: 150_000,
      },
      {
        characterId: 'raider_2',
        combatDamageDealt: 100_000,
        workoutEnergyDamage: 100_000,
      },
    ];

    // Total damage = 600k vs 1,000,000 HP Public World Boss (60% progress, undefeated)
    const undefeated = calculateRaidRewards({
      raidInstanceId: 'public_boss_1',
      accessType: 'PUBLIC_WORLD',
      bossMaxHp: 1_000_000,
      baseGoldPool: 10_000,
      baseGuildReputationPool: 2_000,
      baseMaterialQuantity: 10,
      lootTable: RAID_LOOT_POOL,
      participants,
      seed: 'undefeated-seed',
    });

    expect(undefeated.isBossDefeated).toBe(false);
    expect(undefeated.killBonusMultiplier).toBe(1.0);
    expect(undefeated.damageProgressRatio).toBeCloseTo(0.6, 2);
    expect(undefeated.unlockedMilestonePool).toBe('GOLD_CACHE');

    // Verify no kill-exclusive items ('emberheart_greatsword' or 'crown_of_the_wyrm') dropped
    const allDroppedSlugs = undefeated.participantRewards.flatMap((p) =>
      p.lootDrops.map((d) => d.itemSlug)
    );
    expect(allDroppedSlugs).not.toContain('emberheart_greatsword');
    expect(allDroppedSlugs).not.toContain('crown_of_the_wyrm');
  });
});

import { describe, expect, it } from 'vitest';
import {
  EQUIPMENT_SLOTS,
  buildWorkoutSpoilsReceipt,
  calculateDerivedCombatStats,
  calculateOverallCharacterLevel,
  calculateWorkoutRaidEnergyDamage,
  consolidateHybridWorkoutSession,
  consolidateSpoilsReceipts,
  createLiveDungeonWorkoutBuff,
  inferOfflineWorkoutType,
  mergeLootDrops,
  normalizeCoreStatBlock,
  validateEquipmentRequirements,
} from '../src';

describe('character-loadout-spoils engine module', () => {
  it('exposes all 8 explicit equipment slots and enforces stat-gate & slot checks', () => {
    expect(EQUIPMENT_SLOTS.map((s) => s.slot)).toEqual([
      'mainHand',
      'offHand',
      'head',
      'chest',
      'legs',
      'boots',
      'accessory1',
      'accessory2',
    ]);

    const daggers = {
      itemType: 'WEAPON' as const,
      weaponHandedness: 'ONE_HANDED' as const,
      requiredAgility: 6,
    };

    const failStat = validateEquipmentRequirements(
      daggers,
      { strengthLevel: 5, enduranceLevel: 4, agilityLevel: 4 },
      'mainHand'
    );
    expect(failStat.valid).toBe(false);
    expect(failStat.unmetStats).toEqual(['AGILITY']);
    expect(failStat.error).toContain('Requires Agility Lv.6');

    const failSlot = validateEquipmentRequirements(
      daggers,
      { strengthLevel: 5, enduranceLevel: 4, agilityLevel: 6 },
      'boots'
    );
    expect(failSlot.valid).toBe(false);

    const passEquip = validateEquipmentRequirements(
      daggers,
      { strengthLevel: 5, enduranceLevel: 4, agilityLevel: 6 },
      'offHand'
    );
    expect(passEquip.valid).toBe(true);
  });

  it('calculates derived combat attributes across base stats, gear, talents, and fatigue', () => {
    const healthy = calculateDerivedCombatStats({
      coreStats: { strengthLevel: 6, enduranceLevel: 5, agilityLevel: 4 },
      equipmentBonuses: {
        meleePower: 22,
        armorRating: 24,
        maxHp: 90,
        maxStamina: 30,
        critChance: 0.05,
        attackSpeedPct: 0.1,
      },
      unlockedTalentRanks: {
        jug_iron_skin: 2,
        war_deep_lungs: 1,
        ass_shadowstep_reflexes: 1,
      },
      systemicFatigueStacks: 0,
    });

    expect(healthy.overallLevel).toBe(7);
    expect(healthy.meleePower).toBeGreaterThan(60);
    expect(healthy.armor).toBeGreaterThan(45);
    expect(healthy.maxStamina).toBeGreaterThan(180);
    expect(healthy.critChance).toBeGreaterThan(0.1);
    expect(healthy.dodgeChance).toBeGreaterThan(0.06);
    expect(healthy.attackSpeedMultiplier).toBeGreaterThan(1.15);

    const fatigued = calculateDerivedCombatStats({
      coreStats: { strengthLevel: 6, enduranceLevel: 5, agilityLevel: 4 },
      equipmentBonuses: { meleePower: 22 },
      systemicFatigueStacks: 3,
    });

    expect(fatigued.accuracy).toBeLessThan(healthy.accuracy);
    expect(fatigued.dodgeChance).toBeLessThan(healthy.dodgeChance);
  });

  it('infers offline workout modality cleanly from sets and cardio segments', () => {
    expect(
      inferOfflineWorkoutType({
        sets: [{ reps: 8 }],
        cardioSegments: [],
      })
    ).toBe('RESISTANCE');

    expect(
      inferOfflineWorkoutType({
        sets: [{ reps: 5 }],
        cardioSegments: [
          {
            exerciseId: 'zone2_run',
            activityType: 'running',
            durationSeconds: 1200,
            averageHrZone: 2,
          },
        ],
      })
    ).toBe('HYBRID');

    expect(
      inferOfflineWorkoutType({
        sets: [],
        cardioSegments: [
          {
            exerciseId: 'sprint_intervals',
            activityType: 'running',
            durationSeconds: 900,
            averageHrZone: 5,
          },
        ],
      })
    ).toBe('CARDIO_HIGH_INTENSITY');

    expect(
      inferOfflineWorkoutType({
        sets: [],
        cardioSegments: [
          {
            exerciseId: 'mobility_yoga',
            activityType: 'walking',
            durationSeconds: 1500,
            averageHrZone: 1,
          },
        ],
      })
    ).toBe('ACTIVE_RECOVERY');
  });

  it('consolidates multiple deferred offline workout receipts into a single spoils summary', () => {
    const payload1 = consolidateHybridWorkoutSession({
      sessionId: 'off_1',
      workoutType: 'RESISTANCE',
      setLogs: [
        {
          id: 's1',
          setNumber: 1,
          exerciseId: 'bench_press',
          exerciseName: 'Barbell Bench Press',
          reps: 8,
          weightKg: 90,
          rpe: 8.5,
          isWarmup: false,
          calculatedE1RM: 114,
          relativeIntensity: 0.89,
          isLivePersonalRecordPace: true,
          prTypesOnPace: ['E1RM'],
          microXpTick: 0,
          microGoldTick: 0,
          bossHpDamage: 0,
          plannedRestSeconds: 120,
          loggedAtIso: '2026-10-30T10:00:00.000Z',
        },
      ],
      durationSeconds: 1800,
      historicalPRs: {
        bench_press: {
          exerciseId: 'bench_press',
          bestE1RM: 101.33,
          bestSingleSetVolume: 640,
          bestSessionVolume: 640,
          maxRepsByWeight: { '80.0': 8 },
          bestCardioDurationSecByZone: {},
        },
      },
      currentCharacterStats: {
        STRENGTH: { level: 5, xp: 540, pointsAvailable: 2 },
        ENDURANCE: { level: 4, xp: 60, pointsAvailable: 1 },
        AGILITY: { level: 4, xp: 45, pointsAvailable: 1 },
      },
      rngSeed: 'seed_off_1',
    });

    const buffs1 = createLiveDungeonWorkoutBuff({
      workoutId: 'off_1',
      characterId: 'player_hero',
      workoutType: 'RESISTANCE',
      triggeredPrCrit: payload1.workoutEvaluation.criticalTrainingBonus.triggered,
    });
    const raidDmg1 = calculateWorkoutRaidEnergyDamage({
      strengthXp: payload1.finalXpByStat.STRENGTH,
      enduranceXp: payload1.finalXpByStat.ENDURANCE,
      agilityXp: payload1.finalXpByStat.AGILITY,
      triggeredPrCrit: payload1.workoutEvaluation.criticalTrainingBonus.triggered,
    });

    const receipt1 = buildWorkoutSpoilsReceipt({
      receiptId: 'rec_1',
      performedAtIso: '2026-10-30T10:00:00.000Z',
      workoutType: 'RESISTANCE',
      rewardPayload: payload1,
      dungeonBuffs: buffs1,
      raidDamage: raidDmg1,
      raidBossName: 'Ignisrax, World-Forge Wyrm',
      exerciseNameById: { bench_press: 'Barbell Bench Press' },
      syncedWithServer: true,
    });

    const payload2 = consolidateHybridWorkoutSession({
      sessionId: 'off_2',
      workoutType: 'CARDIO_HIGH_INTENSITY',
      setLogs: [],
      cardioSegments: [
        {
          exerciseId: 'sprint_intervals',
          activityType: 'running',
          durationSeconds: 1500,
          averageHrZone: 5,
        },
      ],
      durationSeconds: 1500,
      currentCharacterStats: {
        STRENGTH: {
          level: payload1.characterProgression.byStat.STRENGTH.newLevel,
          xp: payload1.characterProgression.byStat.STRENGTH.remainingXp,
          pointsAvailable:
            payload1.characterProgression.byStat.STRENGTH.totalPointsAvailableAfterSession,
        },
        ENDURANCE: { level: 4, xp: 60, pointsAvailable: 1 },
        AGILITY: { level: 4, xp: 400, pointsAvailable: 1 },
      },
      rngSeed: 'seed_off_2',
    });

    const receipt2 = buildWorkoutSpoilsReceipt({
      receiptId: 'rec_2',
      performedAtIso: '2026-10-31T10:00:00.000Z',
      workoutType: 'CARDIO_HIGH_INTENSITY',
      rewardPayload: payload2,
      dungeonBuffs: [],
      raidDamage: 900,
      raidBossName: 'Ignisrax, World-Forge Wyrm',
      syncedWithServer: false,
    });

    const summary = consolidateSpoilsReceipts([receipt1, receipt2]);
    expect(summary).not.toBeNull();
    expect(summary!.sessionCount).toBe(2);
    // Pure resistance receipt1 has cardioDurationSeconds === 0; cardio receipt2 has 1500s
    expect(receipt1.cardioDurationSeconds).toBe(0);
    expect(receipt2.cardioDurationSeconds).toBe(1500);
    expect(summary!.totalCardioSeconds).toBe(1500);
    expect(receipt1.finalXpByHolisticStat?.STRENGTH).toBe(receipt1.xpGained.STRENGTH);
    expect(summary!.totalXpGained.STRENGTH).toBeGreaterThan(0);
    expect(summary!.totalXpGained.AGILITY).toBeGreaterThan(0);
    expect(summary!.statLevelUps.STRENGTH.levelsGained).toBeGreaterThanOrEqual(1);
    expect(summary!.totalTalentPointsEarned).toBeGreaterThanOrEqual(1);
    expect(summary!.prCritsTriggered).toBe(true);
    expect(summary!.prCritDrops.length).toBeGreaterThan(0);
    expect(summary!.allLootDrops.length).toBeGreaterThan(0);
    expect(summary!.injectedDungeonBuffs.length).toBe(2);
    expect(summary!.totalRaidDamage).toBe(raidDmg1 + 900);
    expect(summary!.raidTargets).toEqual(['Ignisrax, World-Forge Wyrm']);
  });

  it('incorporates 7-stat coreStats (CON, DEX, WIS, SPR) and 7-stat talent modifiers into calculateDerivedCombatStats', () => {
    const base3Stat = calculateDerivedCombatStats({
      coreStats: { strengthLevel: 5, enduranceLevel: 5, agilityLevel: 5 },
    });

    const full7Stat = calculateDerivedCombatStats({
      coreStats: {
        strengthLevel: 5,
        enduranceLevel: 5,
        agilityLevel: 5,
        conLevel: 8,
        dexLevel: 8,
        wisLevel: 8,
        sprLevel: 8,
      },
      equipmentPrimaryStats: {
        CON: 2,
        DEX: 2,
        WIS: 2,
        SPR: 2,
      },
      unlockedTalentRanks: {
        grd_fortress_plating: 2, // defensePct
        cal_bodyweight_mastery: 2, // attackPowerPct + dodgeChancePct
        zen_precision_focus: 2, // critChancePct + critDamagePct
      },
    });

    // CON (10 total) adds +150 rawMaxHp and +20 rawArmor
    expect(full7Stat.maxHp).toBeGreaterThan(base3Stat.maxHp + 140);
    expect(full7Stat.armor).toBeGreaterThan(base3Stat.armor + 18);
    // WIS (10 total) adds +60 rawMaxStamina
    expect(full7Stat.maxStamina).toBeGreaterThan(base3Stat.maxStamina + 55);
    // DEX (10 total) adds +0.06 critChance and +0.04 accuracy
    expect(full7Stat.critChance).toBeGreaterThan(base3Stat.critChance + 0.05);
    expect(full7Stat.accuracy).toBeGreaterThan(base3Stat.accuracy);
    // SPR (10 total) adds +0.05 damageMitigationPct
    expect(full7Stat.damageMitigationPct).toBeGreaterThanOrEqual(0.05);
  });

  it('preserves procedural gear affixes in mergeLootDrops and separates distinct procedural rolls while stacking materials', () => {
    const drops = [
      {
        itemSlug: 'iron_ore_cluster',
        itemName: 'Rich Iron Ore Cluster',
        rarity: 'COMMON' as const,
        quantity: 2,
      },
      {
        itemSlug: 'iron_ore_cluster',
        itemName: 'Rich Iron Ore Cluster',
        rarity: 'COMMON' as const,
        quantity: 3,
      },
      {
        itemSlug: 'ironbound_greatsword',
        itemName: 'Fierce Ironbound Greatsword of Precision [T3]',
        rarity: 'RARE' as const,
        quantity: 1,
        baseSlug: 'ironbound_greatsword',
        tier: 3 as const,
        prefixId: 'fierce',
        suffixId: 'of_precision',
        statBonuses: { meleePower: 35, critChance: 0.04 },
        primaryStatBonuses: { STR: 4, DEX: 2 },
      },
      {
        itemSlug: 'ironbound_greatsword',
        itemName: 'Stalwart Ironbound Greatsword of the Bear [T4]',
        rarity: 'EPIC' as const,
        quantity: 1,
        baseSlug: 'ironbound_greatsword',
        tier: 4 as const,
        prefixId: 'stalwart',
        suffixId: 'of_the_bear',
        statBonuses: { meleePower: 44, maxHp: 80 },
        primaryStatBonuses: { STR: 6, CON: 5 },
      },
    ];

    const merged = mergeLootDrops(drops);
    expect(merged).toHaveLength(3);

    const ore = merged.find((d) => d.itemSlug === 'iron_ore_cluster');
    expect(ore?.quantity).toBe(5);

    const greatswords = merged.filter((d) => d.itemSlug === 'ironbound_greatsword');
    expect(greatswords).toHaveLength(2);
    expect(greatswords[0]?.tier).toBe(3);
    expect(greatswords[0]?.prefixId).toBe('fierce');
    expect(greatswords[0]?.suffixId).toBe('of_precision');
    expect(greatswords[0]?.statBonuses).toEqual({ meleePower: 35, critChance: 0.04 });
    expect(greatswords[0]?.primaryStatBonuses).toEqual({ STR: 4, DEX: 2 });

    expect(greatswords[1]?.tier).toBe(4);
    expect(greatswords[1]?.prefixId).toBe('stalwart');
    expect(greatswords[1]?.suffixId).toBe('of_the_bear');
    expect(greatswords[1]?.statBonuses).toEqual({ meleePower: 44, maxHp: 80 });
    expect(greatswords[1]?.primaryStatBonuses).toEqual({ STR: 6, CON: 5 });
  });

  it('normalizes abbreviated and full 7-stat CoreStatBlock fields via normalizeCoreStatBlock', () => {
    const fromFull = normalizeCoreStatBlock({
      strengthLevel: 6,
      enduranceLevel: 5,
      agilityLevel: 4,
      dexterityLevel: 8,
      constitutionLevel: 9,
      wisdomLevel: 7,
      spiritLevel: 10,
    });
    expect(fromFull.dexLevel).toBe(8);
    expect(fromFull.dexterityLevel).toBe(8);
    expect(fromFull.conLevel).toBe(9);
    expect(fromFull.constitutionLevel).toBe(9);
    expect(fromFull.wisLevel).toBe(7);
    expect(fromFull.wisdomLevel).toBe(7);
    expect(fromFull.sprLevel).toBe(10);
    expect(fromFull.spiritLevel).toBe(10);
    expect(fromFull.hasHolisticStats).toBe(true);

    expect(
      calculateOverallCharacterLevel({
        strengthLevel: 7,
        enduranceLevel: 7,
        agilityLevel: 7,
        dexterityLevel: 7,
        constitutionLevel: 7,
        wisdomLevel: 7,
        spiritLevel: 7,
      })
    ).toBe(7);
  });
});

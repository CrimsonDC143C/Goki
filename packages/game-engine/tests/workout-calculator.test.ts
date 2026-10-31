import { describe, expect, it } from 'vitest';
import {
  PR_CRIT_PRIMARY_BONUS_XP,
  STRENGTH_HEALTHY_XP_THRESHOLD,
  applyDiminishingReturns,
  applyStatXpProgression,
  calculateAgilityCardioXp,
  calculateConstitutionXp,
  calculateDexterityXp,
  calculateE1RM,
  calculateEnduranceCardioXp,
  calculateOverallLevel,
  calculateSpiritXp,
  calculateStrengthSetXp,
  calculateWisdomXp,
  evaluateWorkoutSession,
  xpRequiredForStatLevel,
} from '../src/workout-calculator';

describe('workout-calculator', () => {
  describe('calculateE1RM (Epley formula)', () => {
    it('computes Weight * (1 + Reps / 30) accurately', () => {
      // 100kg * (1 + 10/30) = 133.33kg
      expect(calculateE1RM(100, 10)).toBeCloseTo(133.33, 2);
      // 60kg * (1 + 5/30) = 70kg
      expect(calculateE1RM(60, 5)).toBeCloseTo(70, 2);
    });

    it('returns 0 for zero or negative weight or reps', () => {
      expect(calculateE1RM(0, 10)).toBe(0);
      expect(calculateE1RM(100, 0)).toBe(0);
      expect(calculateE1RM(-50, 8)).toBe(0);
    });
  });

  describe('Relative Effort Strength XP & Novice/Advanced Fairness', () => {
    it('keeps XP progression fair between novices and advanced lifters at identical relative intensity', () => {
      // Novice: 40kg x 10 (e1RM = 53.33kg -> 75% relative intensity)
      const novice = calculateStrengthSetXp({
        weightKg: 40,
        reps: 10,
        referenceE1RM: 53.33,
      });

      // Advanced: 120kg x 10 (e1RM = 160kg -> 75% relative intensity, 3x raw tonnage!)
      const advanced = calculateStrengthSetXp({
        weightKg: 120,
        reps: 10,
        referenceE1RM: 160,
      });

      expect(novice.relativeIntensity).toBeCloseTo(0.75, 2);
      expect(advanced.relativeIntensity).toBeCloseTo(0.75, 2);

      // Advanced gets a modest volume bonus, NOT 3x raw tonnage XP
      const ratio = advanced.rawXp / novice.rawXp;
      expect(ratio).toBeGreaterThan(1.0);
      expect(ratio).toBeLessThan(1.15);
    });

    it('heavily rewards higher Relative Intensity over low-intensity volume', () => {
      const lowIntensity = calculateStrengthSetXp({
        weightKg: 50,
        reps: 10,
        referenceE1RM: 120, // ~41.7% e1RM
      });
      const highIntensity = calculateStrengthSetXp({
        weightKg: 100,
        reps: 10,
        referenceE1RM: 120, // ~83.3% e1RM
      });

      expect(highIntensity.rawXp).toBeGreaterThan(lowIntensity.rawXp * 2.5);
    });

    it('applies diminishing returns above the healthy session threshold', () => {
      const withinHealthy = applyDiminishingReturns(300, STRENGTH_HEALTHY_XP_THRESHOLD, 680);
      expect(withinHealthy).toBe(300);

      const marathonRaw = 900;
      const diminished = applyDiminishingReturns(marathonRaw, STRENGTH_HEALTHY_XP_THRESHOLD, 680);
      expect(diminished).toBeGreaterThan(STRENGTH_HEALTHY_XP_THRESHOLD);
      expect(diminished).toBeLessThan(600);
    });
  });

  describe('HR Zone Cardio XP (Endurance vs. Agility)', () => {
    it('awards peak Endurance XP efficiency in HR Zone 2 across Zones 1-3', () => {
      const z1 = calculateEnduranceCardioXp(45 * 60, 1, 'running');
      const z2 = calculateEnduranceCardioXp(45 * 60, 2, 'running');
      const z3 = calculateEnduranceCardioXp(45 * 60, 3, 'running');

      expect(z2).toBeGreaterThan(z1);
      expect(z2).toBeGreaterThan(z3);
    });

    it('awards Agility XP for high-intensity HR Zones 4-5 with diminishing returns past 35 min', () => {
      const z4 = calculateAgilityCardioXp(25 * 60, 4, 'rowing');
      const z5 = calculateAgilityCardioXp(25 * 60, 5, 'rowing');
      expect(z5).toBeGreaterThan(z4);

      const normal30m = calculateAgilityCardioXp(30 * 60, 5, 'running');
      const extreme90m = calculateAgilityCardioXp(90 * 60, 5, 'running');
      // 3x duration in Zone 5 should yield well under 2x XP due to anaerobic diminishing returns
      expect(extreme90m).toBeLessThan(normal30m * 2);
    });
  });

  describe('Progressive Overload Crits (Critical Training Bonus)', () => {
    it('establishes baseline PRs on first session without triggering a PR crit, then crits when broken', () => {
      // Session 1: Establish Bench Press baseline (80kg x 8)
      const baselineEval = evaluateWorkoutSession({
        workoutType: 'RESISTANCE',
        resistanceSets: [
          { exerciseId: 'bench_press', weightKg: 40, reps: 10, isWarmup: true },
          { exerciseId: 'bench_press', weightKg: 80, reps: 8 },
          { exerciseId: 'bench_press', weightKg: 80, reps: 8 },
        ],
        rngSeed: 'session-1',
      });

      expect(baselineEval.criticalTrainingBonus.triggered).toBe(false);
      expect(baselineEval.criticalTrainingBonus.guaranteedLootDrop).toBeNull();
      expect(baselineEval.updatedPRs['bench_press']?.bestE1RM).toBeCloseTo(101.33, 2);

      // Session 2: Progressive overload! 85kg x 8 breaks e1RM and session volume
      const overloadEval = evaluateWorkoutSession({
        workoutType: 'RESISTANCE',
        resistanceSets: [
          { exerciseId: 'bench_press', weightKg: 85, reps: 8 },
          { exerciseId: 'bench_press', weightKg: 85, reps: 8 },
        ],
        historicalPRs: baselineEval.updatedPRs,
        xpMultiplier: 1.25,
        rngSeed: 'session-2-crit',
      });

      expect(overloadEval.criticalTrainingBonus.triggered).toBe(true);
      expect(overloadEval.criticalTrainingBonus.totalBonusXp).toBe(PR_CRIT_PRIMARY_BONUS_XP);
      expect(overloadEval.criticalTrainingBonus.guaranteedLootDrop).not.toBeNull();
      expect(overloadEval.finalXpAwarded.STRENGTH).toBeGreaterThan(
        overloadEval.diminishedXpBeforeMultiplier.STRENGTH
      );
    });

    it('triggers Cardio Zone Duration PR Crit when beating historical Zone 2 duration', () => {
      const s1 = evaluateWorkoutSession({
        workoutType: 'CARDIO_LOW_MOD',
        cardioSegments: [
          {
            exerciseId: 'outdoor_cycle',
            activityType: 'cycling',
            durationSeconds: 30 * 60,
            averageHrZone: 2,
          },
        ],
      });
      expect(s1.criticalTrainingBonus.triggered).toBe(false);

      const s2 = evaluateWorkoutSession({
        workoutType: 'CARDIO_LOW_MOD',
        cardioSegments: [
          {
            exerciseId: 'outdoor_cycle',
            activityType: 'cycling',
            durationSeconds: 45 * 60,
            averageHrZone: 2,
          },
        ],
        historicalPRs: s1.updatedPRs,
        rngSeed: 'cycle-pr-seed',
      });

      expect(s2.criticalTrainingBonus.triggered).toBe(true);
      expect(s2.criticalTrainingBonus.bonusXpByStat.ENDURANCE).toBe(PR_CRIT_PRIMARY_BONUS_XP);
      expect(s2.criticalTrainingBonus.guaranteedLootDrop).not.toBeNull();
    });

    it('First-Time Exercise PR Guard: never triggers PR Crit or loot drop on initial ramping sets or zeroed stub PR records', () => {
      // Case 1: Ramping sets (60kg -> 80kg -> 100kg) on a brand-new exercise in the same first session
      // plus an empty initialized DB stub record (`bestE1RM: 0`) on a second brand-new exercise
      const initialSession = evaluateWorkoutSession({
        workoutType: 'HYBRID',
        resistanceSets: [
          { exerciseId: 'barbell_squat', weightKg: 60, reps: 10 },
          { exerciseId: 'barbell_squat', weightKg: 80, reps: 8 },
          { exerciseId: 'barbell_squat', weightKg: 100, reps: 5 },
          { exerciseId: 'overhead_press', weightKg: 45, reps: 8 },
        ],
        cardioSegments: [
          {
            exerciseId: 'concept2_rower',
            activityType: 'rowing',
            durationSeconds: 15 * 60,
            averageHrZone: 4,
          },
          {
            exerciseId: 'concept2_rower',
            activityType: 'rowing',
            durationSeconds: 10 * 60,
            averageHrZone: 4,
          },
        ],
        historicalPRs: {
          overhead_press: {
            exerciseId: 'overhead_press',
            bestE1RM: 0,
            bestSingleSetVolume: 0,
            bestSessionVolume: 0,
            maxRepsByWeight: {},
            bestCardioDurationSecByZone: {},
          },
        },
        rngSeed: 'first-time-guard-seed',
      });

      expect(initialSession.criticalTrainingBonus.triggered).toBe(false);
      expect(initialSession.criticalTrainingBonus.prBreakCount).toBe(0);
      expect(initialSession.criticalTrainingBonus.totalBonusXp).toBe(0);
      expect(initialSession.criticalTrainingBonus.guaranteedLootDrop).toBeNull();
      expect(initialSession.evaluatedSets.every((s) => s.isPersonalRecord === false)).toBe(true);

      // Verify baseline e1RM & cardio zone records were still captured for future sessions
      expect(initialSession.updatedPRs['barbell_squat']?.bestE1RM).toBeCloseTo(116.67, 2);
      expect(initialSession.updatedPRs['overhead_press']?.bestE1RM).toBeCloseTo(57.0, 2);
      expect(
        initialSession.updatedPRs['concept2_rower']?.bestCardioDurationSecByZone[4]
      ).toBe(25 * 60);
    });
  });

  describe('Stat Leveling & Stat Talent Points', () => {
    it('advances stat levels and grants 1 matching Talent Point per level gained', () => {
      const reqLvl1 = xpRequiredForStatLevel(1);
      const reqLvl2 = xpRequiredForStatLevel(2);

      const res = applyStatXpProgression(1, 0, reqLvl1 + reqLvl2 + 25);
      expect(res.previousLevel).toBe(1);
      expect(res.newLevel).toBe(3);
      expect(res.levelsGained).toBe(2);
      expect(res.talentPointsEarned).toBe(2);
      expect(res.remainingXp).toBe(25);
    });
  });

  describe('7-Stat System Expansion Calculators', () => {
    describe('calculateDexterityXp (Calisthenics & Rock Climbing)', () => {
      it('factors in duration, volume reps, RPE, and skill level', () => {
        const baseCalisthenics = calculateDexterityXp({
          durationMinutes: 30,
          volumeReps: 50,
          rpe: 7,
          skillLevel: 1,
          modality: 'CALISTHENICS',
        });
        expect(baseCalisthenics).toBeGreaterThan(0);

        // Higher RPE should award more XP
        const highRpe = calculateDexterityXp({
          durationMinutes: 30,
          volumeReps: 50,
          rpe: 9,
          skillLevel: 1,
          modality: 'CALISTHENICS',
        });
        expect(highRpe).toBeGreaterThan(baseCalisthenics);

        // Higher skill level progression should scale XP
        const advancedSkill = calculateDexterityXp({
          durationMinutes: 30,
          volumeReps: 50,
          rpe: 7,
          skillLevel: 3,
          modality: 'CALISTHENICS',
        });
        expect(advancedSkill).toBeGreaterThan(baseCalisthenics);

        // Rock Climbing modality bonus
        const climbing = calculateDexterityXp({
          durationMinutes: 30,
          volumeReps: 50,
          rpe: 7,
          skillLevel: 1,
          modality: 'ROCK_CLIMBING',
        });
        expect(climbing).toBeGreaterThan(baseCalisthenics);

        // Positional overload syntax works identically
        const positional = calculateDexterityXp(30, 7, 1, 50, 'CALISTHENICS');
        expect(positional).toBe(baseCalisthenics);

        // Zero duration and zero reps yields 0 XP
        expect(calculateDexterityXp(0, 8, 2, 0)).toBe(0);
      });
    });

    describe('calculateConstitutionXp (Sleep & Daily Steps)', () => {
      it('calculates XP across sleep duration, quality scores, and steps', () => {
        // Sleep-only calculation
        const poorSleep = calculateConstitutionXp({ sleepHours: 8, qualityScore: 50 });
        const goodSleep = calculateConstitutionXp({ sleepHours: 8, qualityScore: 90 });
        expect(goodSleep).toBeGreaterThan(poorSleep);

        // Step-only calculation
        const stepsXp = calculateConstitutionXp({ steps: 10000 });
        expect(stepsXp).toBe(50); // 10k steps * 5 XP/1k = 50 XP

        // Combined sleep + steps
        const combined = calculateConstitutionXp({
          sleepHours: 8,
          qualityScore: 90,
          steps: 10000,
        });
        expect(combined).toBeCloseTo(goodSleep + stepsXp, 1);

        // Positional syntax
        expect(calculateConstitutionXp(8, 90, 10000)).toBeCloseTo(combined, 1);

        // Zero input yields 0
        expect(calculateConstitutionXp(0, 100, 0)).toBe(0);
      });
    });

    describe('calculateWisdomXp (Yoga & Mobility)', () => {
      it('calculates XP based on duration and modality with diminishing returns', () => {
        const yoga30 = calculateWisdomXp({ durationMinutes: 30, modality: 'YOGA' });
        const yoga60 = calculateWisdomXp({ durationMinutes: 60, modality: 'YOGA' });
        expect(yoga30).toBeGreaterThan(0);
        expect(yoga60).toBeGreaterThan(yoga30);
        // Diminishing returns after 45 minutes: 60 min is less than 2x of 30 min
        expect(yoga60).toBeLessThan(yoga30 * 2);

        // Pilates slight modality bonus
        const pilates30 = calculateWisdomXp({ durationMinutes: 30, modality: 'PILATES' });
        expect(pilates30).toBeGreaterThan(yoga30);

        // Positional syntax
        expect(calculateWisdomXp(30, 'YOGA')).toBe(yoga30);

        // Zero duration yields 0
        expect(calculateWisdomXp(0)).toBe(0);
      });
    });

    describe('calculateSpiritXp (Meditation, Breathwork, Sauna, Cold Plunge)', () => {
      it('calculates XP for restorative mental focus, thermal stress, and cold exposure', () => {
        const meditation20 = calculateSpiritXp({ durationMinutes: 20, modality: 'MEDITATION' });
        const breathwork20 = calculateSpiritXp({ durationMinutes: 20, modality: 'BREATHWORK' });
        const sauna20 = calculateSpiritXp({ durationMinutes: 20, modality: 'SAUNA' });
        const coldPlunge20 = calculateSpiritXp({ durationMinutes: 20, modality: 'COLD_PLUNGE' });

        expect(meditation20).toBeGreaterThan(0);
        expect(breathwork20).toBeGreaterThan(meditation20);
        expect(sauna20).toBeGreaterThan(breathwork20);
        expect(coldPlunge20).toBeGreaterThan(sauna20);

        // Positional syntax
        expect(calculateSpiritXp(20, 'SAUNA')).toBe(sauna20);

        // Zero duration yields 0
        expect(calculateSpiritXp(0)).toBe(0);
      });
    });

    describe('calculateOverallLevel (7-Stat Progression Formula)', () => {
      it('averages all 7 stats when the 7-stat block is provided', () => {
        // Base character with all stats at level 1 -> overallLevel 1
        expect(
          calculateOverallLevel({
            strengthLevel: 1,
            enduranceLevel: 1,
            agilityLevel: 1,
            dexLevel: 1,
            conLevel: 1,
            wisLevel: 1,
            sprLevel: 1,
          })
        ).toBe(1);

        // Character with all stats at level 7 -> overallLevel 7
        expect(
          calculateOverallLevel({
            strengthLevel: 7,
            enduranceLevel: 7,
            agilityLevel: 7,
            dexLevel: 7,
            conLevel: 7,
            wisLevel: 7,
            sprLevel: 7,
          })
        ).toBe(7);

        // Heterogeneous 7-stat profile: sum = 10 + 14 + 12 + 8 + 9 + 11 + 7 = 71; floor(71 / 7) = 10
        expect(
          calculateOverallLevel({
            strengthLevel: 10,
            enduranceLevel: 14,
            agilityLevel: 12,
            dexterityLevel: 8,
            constitutionLevel: 9,
            wisdomLevel: 11,
            spiritLevel: 7,
          })
        ).toBe(10);
      });

      it('falls back to legacy 3-stat calculation when only initial 3 stats are provided', () => {
        // Legacy: floor((6 + 5 + 4) / 2) = floor(7.5) = 7
        expect(
          calculateOverallLevel({
            strengthLevel: 6,
            enduranceLevel: 5,
            agilityLevel: 4,
          })
        ).toBe(7);
      });
    });
  });
});

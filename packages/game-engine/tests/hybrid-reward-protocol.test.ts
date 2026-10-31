import { describe, expect, it } from 'vitest';
import {
  ARRIVAL_BANNER_DURATION_MS,
  ARRIVAL_BOON_MULTIPLIER,
  RegisteredGymLocation,
  createArrivalBoon,
  createInitialHybridMachineState,
  detectRegisteredGymArrival,
  evaluatePostWorkoutLootChest,
  evaluateResilienceBonus,
  getOptimalRestAdvice,
  isCharacterProgressionUnlocked,
  isIntraWorkoutFocusLocked,
  transitionHybridWorkoutState,
} from '../src/hybrid-reward-protocol';
import { evaluateWorkoutSession } from '../src/workout-calculator';

describe('hybrid-reward-protocol (3-Phase Behavioral Neuroscience Loop)', () => {
  describe('Phase 1: Pre-Workout Threshold & Equal 1.25x Arrival Boon', () => {
    const gyms: RegisteredGymLocation[] = [
      {
        id: 'gym_iron_sanctum',
        name: 'Iron Sanctum Barbell Club',
        latitude: 37.7749,
        longitude: -122.4194,
        radiusMeters: 120,
      },
    ];

    it('detects registered gym geofence arrival and grants equal 1.25x Arrival Boon for Gym and Open-World', () => {
      const insideGym = detectRegisteredGymArrival(
        { latitude: 37.775, longitude: -122.4195 },
        gyms
      );
      expect(insideGym?.id).toBe('gym_iron_sanctum');

      const outsideGym = detectRegisteredGymArrival(
        { latitude: 37.79, longitude: -122.44 },
        gyms
      );
      expect(outsideGym).toBeNull();

      const guildBoon = createArrivalBoon({
        trigger: 'GEOFENCE_GYM',
        gymId: insideGym?.id,
        gymName: insideGym?.name,
      });
      expect(guildBoon.headline).toBe("Adventurer's Guild Entered: Iron Sanctum Barbell Club");
      expect(guildBoon.multiplier).toBe(ARRIVAL_BOON_MULTIPLIER);
      expect(guildBoon.bannerDurationMs).toBeLessThan(2000);
      expect(guildBoon.bannerDurationMs).toBe(ARRIVAL_BANNER_DURATION_MS);

      const openWorldBoon = createArrivalBoon({
        trigger: 'MANUAL_OPEN_WORLD',
      });
      expect(openWorldBoon.headline).toBe('Open-World Training Begun.');
      expect(openWorldBoon.multiplier).toBe(ARRIVAL_BOON_MULTIPLIER);
    });
  });

  describe('Phase 2: Intra-Workout Set Micro-Feedback, Optimal Rest Advisor & Focus Lock', () => {
    it('tailors rest duration advice to neural strength vs hypertrophy vs HIIT cardio', () => {
      const heavyStrength = getOptimalRestAdvice({
        workoutType: 'RESISTANCE',
        reps: 3,
        relativeIntensity: 0.9,
        rpe: 9,
      });
      expect(heavyStrength.category).toBe('NEURAL_STRENGTH');
      expect(heavyStrength.recommendedSeconds).toBe(180);

      const hypertrophy = getOptimalRestAdvice({
        workoutType: 'RESISTANCE',
        reps: 10,
        relativeIntensity: 0.74,
        rpe: 8,
      });
      expect(hypertrophy.category).toBe('HYPERTROPHY_COMPOUND');
      expect(hypertrophy.recommendedSeconds).toBe(120);

      const hiit = getOptimalRestAdvice({
        workoutType: 'CARDIO_HIGH_INTENSITY',
      });
      expect(hiit.category).toBe('ANAEROBIC_INTERVAL');
      expect(hiit.recommendedSeconds).toBe(90);
    });

    it('walks cleanly through Idle -> DungeonActive -> Resting -> DungeonActive -> DungeonComplete -> LootReview -> Idle', () => {
      const t0 = 1_760_000_000_000;
      let machine = createInitialHybridMachineState();
      expect(machine.phase).toBe('Idle');
      expect(isIntraWorkoutFocusLocked(machine.phase)).toBe(false);

      // 1. Cross Threshold -> DungeonActive
      machine = transitionHybridWorkoutState(machine, {
        type: 'START_SESSION',
        sessionId: 'sess_1',
        workoutType: 'RESISTANCE',
        trigger: 'GEOFENCE_GYM',
        gymId: 'gym_1',
        gymName: 'Obsidian Ironworks',
        nowMs: t0,
      });
      expect(machine.phase).toBe('DungeonActive');
      expect(isIntraWorkoutFocusLocked(machine.phase)).toBe(true);
      expect(isCharacterProgressionUnlocked(machine.phase)).toBe(false);
      expect(machine.activeSession?.arrivalBoon.headline).toBe(
        "Adventurer's Guild Entered: Obsidian Ironworks"
      );

      // Guard: Cannot finish workout with 0 logged sets
      const prematureFinish = transitionHybridWorkoutState(machine, {
        type: 'FINISH_WORKOUT',
        currentCharacterStats: {
          STRENGTH: { level: 5, xp: 80, pointsAvailable: 2 },
          ENDURANCE: { level: 4, xp: 60, pointsAvailable: 1 },
          AGILITY: { level: 4, xp: 45, pointsAvailable: 1 },
        },
      });
      expect(prematureFinish.phase).toBe('DungeonActive');
      expect(prematureFinish.lastError).toContain('at least one set');

      // 2. Log Set #1 (PR Pace against 101.33kg baseline) -> Auto-Rest (`Resting`)
      machine = transitionHybridWorkoutState(machine, {
        type: 'LOG_SET',
        setId: 'set_1',
        exerciseId: 'bench_press',
        exerciseName: 'Barbell Bench Press',
        weightKg: 85,
        reps: 8,
        rpe: 8.5,
        historicalPR: {
          exerciseId: 'bench_press',
          bestE1RM: 101.33,
          bestSingleSetVolume: 640,
          bestSessionVolume: 1920,
          maxRepsByWeight: { '80.0': 8 },
          bestCardioDurationSecByZone: {},
        },
        nowMs: t0 + 60_000,
      });

      expect(machine.phase).toBe('Resting');
      expect(isIntraWorkoutFocusLocked(machine.phase)).toBe(true);
      expect(machine.lastMicroFeedback?.xpTick).toBeGreaterThan(0);
      expect(machine.lastMicroFeedback?.goldTick).toBeGreaterThan(0);
      expect(machine.lastMicroFeedback?.bossHpDamage).toBeGreaterThan(0);
      expect(machine.lastMicroFeedback?.isLivePrPace).toBe(true);
      expect(machine.activeSession?.restTimer.isActive).toBe(true);
      expect(machine.activeSession?.encounterBoss.currentHp).toBeLessThan(1200);

      // Track cognitive-friction override audit if user insists on checking another tab mid-rest
      machine = transitionHybridWorkoutState(machine, {
        type: 'REQUEST_FOCUS_OVERRIDE',
        targetTab: 'TALENTS',
      });
      expect(machine.activeSession?.pendingFocusOverrideTarget).toBe('TALENTS');
      machine = transitionHybridWorkoutState(machine, { type: 'CONFIRM_FOCUS_OVERRIDE' });
      expect(machine.activeSession?.focusOverrideCount).toBe(1);

      // 3. Rest timer expires -> back to `DungeonActive`
      machine = transitionHybridWorkoutState(machine, {
        type: 'TICK_REST_TIMER',
        nowMs: t0 + 60_000 + 250_000,
      });
      expect(machine.phase).toBe('DungeonActive');
      expect(machine.activeSession?.restTimer.isActive).toBe(false);

      // 4. Finish Workout -> `DungeonComplete`
      machine = transitionHybridWorkoutState(machine, {
        type: 'FINISH_WORKOUT',
        nowMs: t0 + 35 * 60_000,
        fatigueAndRestMultiplier: 1.15,
        lastWorkoutAt: new Date(t0 - 96 * 3600 * 1000), // 96h gap triggers Resilience Bonus!
        consistencyStreakSessions: 3,
        historicalPRs: {
          bench_press: {
            exerciseId: 'bench_press',
            bestE1RM: 101.33,
            bestSingleSetVolume: 640,
            bestSessionVolume: 600,
            maxRepsByWeight: { '80.0': 8 },
            bestCardioDurationSecByZone: {},
          },
        },
        currentCharacterStats: {
          STRENGTH: { level: 5, xp: 80, pointsAvailable: 2 },
          ENDURANCE: { level: 4, xp: 60, pointsAvailable: 1 },
          AGILITY: { level: 4, xp: 45, pointsAvailable: 1 },
        },
        rngSeed: 'deterministic-hybrid-test',
      });

      expect(machine.phase).toBe('DungeonComplete');
      const payload = machine.activeSession?.rewardPayload;
      expect(payload).toBeDefined();
      expect(payload?.totalTonnageKg).toBe(680);
      expect(payload?.resilienceBonus.triggered).toBe(true);
      expect(payload?.resilienceBonus.reason).toBe('MISSED_SESSION_COMEBACK');
      expect(payload?.lootChest.tier).toBe('EPIC');
      expect(payload?.lootChest.opened).toBe(false);

      // 5. Proceed to `LootReview` -> Open Chest -> Complete Review -> `Idle`
      machine = transitionHybridWorkoutState(machine, { type: 'PROCEED_TO_LOOT' });
      expect(machine.phase).toBe('LootReview');
      expect(isCharacterProgressionUnlocked(machine.phase)).toBe(true);

      machine = transitionHybridWorkoutState(machine, { type: 'OPEN_LOOT_CHEST' });
      expect(machine.activeSession?.rewardPayload?.lootChest.opened).toBe(true);
      expect(machine.activeSession?.rewardPayload?.lootChest.drops.length).toBeGreaterThan(0);

      machine = transitionHybridWorkoutState(machine, { type: 'COMPLETE_REVIEW' });
      expect(machine.phase).toBe('Idle');
      expect(machine.activeSession).toBeNull();
    });
  });

  describe('Phase 3: Anti-Streak Collapse & Effort-Over-Volume Chest Rarity', () => {
    it('awards Resilience Bonus on low-energy days even without a 72h missed gap', () => {
      const now = new Date('2026-10-29T16:00:00Z');
      const yesterday = new Date('2026-10-28T16:00:00Z');

      const res = evaluateResilienceBonus({
        lastWorkoutAt: yesterday,
        performedAt: now,
        lowEnergyMode: true,
        workingSetCount: 2,
        cardioDurationSeconds: 0,
      });

      expect(res.triggered).toBe(true);
      expect(res.reason).toBe('LOW_ENERGY_GRIT');
      expect(res.flatBonusXp).toBeGreaterThan(0);
    });

    it('rewards high relative effort & consistency over low-intensity junk-volume spam', () => {
      // Athlete A: 16 junk-volume sets at 35% e1RM (RPE 5), streak 1, no PR
      const junkEval = evaluateWorkoutSession({
        workoutType: 'RESISTANCE',
        resistanceSets: Array.from({ length: 16 }, () => ({
          exerciseId: 'bench_press',
          weightKg: 35,
          reps: 10,
        })),
        historicalPRs: {
          bench_press: {
            exerciseId: 'bench_press',
            bestE1RM: 110,
            bestSingleSetVolume: 900,
            bestSessionVolume: 9000,
            maxRepsByWeight: { '85.0': 8 },
            bestCardioDurationSecByZone: {},
          },
        },
      });

      const junkChest = evaluatePostWorkoutLootChest({
        evaluatedSets: junkEval.evaluatedSets,
        averageRpe: 5.0,
        triggeredPrCrit: false,
        prBreakCount: 0,
        consistencyStreakSessions: 1,
        resilienceTriggered: false,
        rngSeed: 'junk-seed',
      });

      // Athlete B (Novice): Only 3 focused working sets at 82% e1RM (RPE 8.5), 4-session streak
      const focusedNoviceEval = evaluateWorkoutSession({
        workoutType: 'RESISTANCE',
        resistanceSets: Array.from({ length: 3 }, () => ({
          exerciseId: 'goblet_squat',
          weightKg: 24,
          reps: 8,
        })),
        historicalPRs: {
          goblet_squat: {
            exerciseId: 'goblet_squat',
            bestE1RM: 31, // ~77-82% relative intensity, tiny raw tonnage (576kg vs 5,600kg!)
            bestSingleSetVolume: 200,
            bestSessionVolume: 700,
            maxRepsByWeight: { '24.0': 8 },
            bestCardioDurationSecByZone: {},
          },
        },
      });

      const focusedChest = evaluatePostWorkoutLootChest({
        evaluatedSets: focusedNoviceEval.evaluatedSets,
        averageRpe: 8.5,
        triggeredPrCrit: false,
        prBreakCount: 0,
        consistencyStreakSessions: 4,
        resilienceTriggered: true,
        rngSeed: 'focused-seed',
      });

      expect(junkChest.tier).toBe('COMMON');
      expect(focusedChest.effortQualityScore).toBeGreaterThan(junkChest.effortQualityScore);
      expect(['RARE', 'EPIC']).toContain(focusedChest.tier);
    });
  });
});

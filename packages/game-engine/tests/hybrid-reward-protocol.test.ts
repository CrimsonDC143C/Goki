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

    it('dynamically preserves elapsed rest time anchored to startedAtMs when switching presets or stepping delta', () => {
      const t0 = 1_760_000_000_000;
      let machine = createInitialHybridMachineState();
      machine = transitionHybridWorkoutState(machine, {
        type: 'START_SESSION',
        sessionId: 'sess_rest_test',
        workoutType: 'RESISTANCE',
        nowMs: t0,
      });

      // Log a set to trigger rest timer
      machine = transitionHybridWorkoutState(machine, {
        type: 'LOG_SET',
        setId: 'set_1',
        exerciseId: 'bench_press',
        exerciseName: 'Barbell Bench Press',
        weightKg: 80,
        reps: 10,
        nowMs: t0,
      });

      // Initialize configured rest to 90s for test baseline
      machine = transitionHybridWorkoutState(machine, {
        type: 'ADJUST_REST_TIMER',
        newDurationSeconds: 90,
        nowMs: t0,
      });

      expect(machine.phase).toBe('Resting');
      expect(machine.activeSession?.restTimer.configuredSeconds).toBe(90);
      expect(machine.activeSession?.restTimer.remainingSeconds).toBe(90);
      expect(machine.activeSession?.restTimer.startedAtMs).toBe(t0);
      expect(machine.activeSession?.restTimer.endsAtMs).toBe(t0 + 90_000);

      // 1. Advance 40s (t0 + 40_000), then select 120s (2m)
      machine = transitionHybridWorkoutState(machine, {
        type: 'ADJUST_REST_TIMER',
        newDurationSeconds: 120,
        nowMs: t0 + 40_000,
      });
      expect(machine.phase).toBe('Resting');
      expect(machine.activeSession?.restTimer.configuredSeconds).toBe(120);
      expect(machine.activeSession?.restTimer.remainingSeconds).toBe(80);
      expect(machine.activeSession?.restTimer.startedAtMs).toBe(t0);
      expect(machine.activeSession?.restTimer.endsAtMs).toBe(t0 + 120_000);

      // 2. Advance 2s more to t0 + 42_000 (42s elapsed), select 60s (1m) -> remaining is 18s
      machine = transitionHybridWorkoutState(machine, {
        type: 'ADJUST_REST_TIMER',
        newDurationSeconds: 60,
        nowMs: t0 + 42_000,
      });
      expect(machine.phase).toBe('Resting');
      expect(machine.activeSession?.restTimer.configuredSeconds).toBe(60);
      expect(machine.activeSession?.restTimer.remainingSeconds).toBe(18);
      expect(machine.activeSession?.restTimer.startedAtMs).toBe(t0);

      // Switch back to 90s at t0 + 42_000 -> remaining is 48s (lossless, reversible)
      machine = transitionHybridWorkoutState(machine, {
        type: 'ADJUST_REST_TIMER',
        newDurationSeconds: 90,
        nowMs: t0 + 42_000,
      });
      expect(machine.phase).toBe('Resting');
      expect(machine.activeSession?.restTimer.configuredSeconds).toBe(90);
      expect(machine.activeSession?.restTimer.remainingSeconds).toBe(48);
      expect(machine.activeSession?.restTimer.startedAtMs).toBe(t0);

      // 3. Advance to t0 + 65_000 (65s elapsed), select 60s -> elapsed exceeds 60s -> completes rest
      const completedMachine = transitionHybridWorkoutState(machine, {
        type: 'ADJUST_REST_TIMER',
        newDurationSeconds: 60,
        nowMs: t0 + 65_000,
      });
      expect(completedMachine.phase).toBe('DungeonActive');
      expect(completedMachine.activeSession?.restTimer.isActive).toBe(false);
      expect(completedMachine.activeSession?.restTimer.remainingSeconds).toBe(0);
      expect(completedMachine.activeSession?.restTimer.configuredSeconds).toBe(60);
      expect(completedMachine.activeSession?.restTimer.startedAtMs).toBeNull();
      expect(completedMachine.activeSession?.restTimer.endsAtMs).toBeNull();

      // 4. Stepping delta: start at t0 with 90s, at t0 + 40_000 remaining is 50s; step +15s -> 65s remaining
      let deltaMachine = transitionHybridWorkoutState(machine, {
        type: 'ADJUST_REST_TIMER',
        newDurationSeconds: 90,
        nowMs: t0,
      });
      deltaMachine = transitionHybridWorkoutState(deltaMachine, {
        type: 'ADJUST_REST_TIMER',
        deltaSeconds: 15,
        nowMs: t0 + 40_000,
      });
      expect(deltaMachine.phase).toBe('Resting');
      expect(deltaMachine.activeSession?.restTimer.remainingSeconds).toBe(65);
      expect(deltaMachine.activeSession?.restTimer.configuredSeconds).toBe(105);
      expect(deltaMachine.activeSession?.restTimer.startedAtMs).toBe(t0);

      // Stepping -15s when only 10s remain -> immediately completes rest to DungeonActive
      deltaMachine = transitionHybridWorkoutState(deltaMachine, {
        type: 'ADJUST_REST_TIMER',
        deltaSeconds: -15,
        nowMs: t0 + 95_000,
      });
      expect(deltaMachine.phase).toBe('DungeonActive');
      expect(deltaMachine.activeSession?.restTimer.isActive).toBe(false);
      expect(deltaMachine.activeSession?.restTimer.remainingSeconds).toBe(0);
      expect(deltaMachine.activeSession?.restTimer.startedAtMs).toBeNull();
      expect(deltaMachine.activeSession?.restTimer.endsAtMs).toBeNull();
    });

    it('guards TICK_REST_TIMER and ADJUST_REST_TIMER against future startedAtMs clock skew', () => {
      const t0 = 1_760_000_000_000;
      let machine = createInitialHybridMachineState();
      machine = transitionHybridWorkoutState(machine, {
        type: 'START_SESSION',
        sessionId: 'sess_skew_test',
        workoutType: 'RESISTANCE',
        trigger: 'MANUAL_OPEN_WORLD',
        nowMs: t0 + 30_000, // Started with future clock skew (+30s ahead)
      });

      machine = transitionHybridWorkoutState(machine, {
        type: 'LOG_SET',
        setId: 'set_skew_1',
        exerciseId: 'bench_press',
        exerciseName: 'Barbell Bench Press',
        weightKg: 80,
        reps: 8,
        customRestSeconds: 90,
        nowMs: t0 + 30_000, // startedAtMs = t0 + 30_000, endsAtMs = t0 + 120_000
      });

      // Now system clock corrects back to t0 (so startedAtMs is 30s in the future relative to nowMs = t0)
      const ticked = transitionHybridWorkoutState(machine, {
        type: 'TICK_REST_TIMER',
        nowMs: t0,
      });
      // Remaining seconds must never exceed configuredSeconds (90s)
      expect(ticked.activeSession?.restTimer.remainingSeconds).toBeLessThanOrEqual(90);
      expect(ticked.activeSession?.restTimer.remainingSeconds).toBe(90);

      // Adjusting +30s with future startedAtMs anchors to nowMs so configuredSeconds & remainingSeconds become 120s cleanly
      const adjusted = transitionHybridWorkoutState(machine, {
        type: 'ADJUST_REST_TIMER',
        deltaSeconds: 30,
        nowMs: t0,
      });
      expect(adjusted.activeSession?.restTimer.startedAtMs).toBe(t0);
      expect(adjusted.activeSession?.restTimer.configuredSeconds).toBe(120);
      expect(adjusted.activeSession?.restTimer.remainingSeconds).toBe(120);
    });

    it('deduplicates duplicate LOG_SET setIds, rolls back UNLOG_SET, and recalculates UPDATE_SET deltas in-place', () => {
      const t0 = 1_760_000_000_000;
      let machine = createInitialHybridMachineState();
      machine = transitionHybridWorkoutState(machine, {
        type: 'START_SESSION',
        sessionId: 'sess_sync_test',
        workoutType: 'RESISTANCE',
        trigger: 'MANUAL_OPEN_WORLD',
        nowMs: t0,
      });

      const initialBossHp = machine.activeSession!.encounterBoss.currentHp;

      // 1. Log Set 1
      machine = transitionHybridWorkoutState(machine, {
        type: 'LOG_SET',
        setId: 'set_row_1',
        exerciseId: 'bench_press',
        exerciseName: 'Barbell Bench Press',
        weightKg: 80,
        reps: 8,
        rpe: 8,
        nowMs: t0 + 10_000,
      });

      expect(machine.activeSession?.setLogs).toHaveLength(1);
      const set1Initial = machine.activeSession!.setLogs[0];
      expect(set1Initial.id).toBe('set_row_1');
      expect(set1Initial.setNumber).toBe(1);
      const xpAfterSet1 = machine.activeSession!.accumulatedMicroXp;
      const goldAfterSet1 = machine.activeSession!.accumulatedMicroGold;
      const bossHpAfterSet1 = machine.activeSession!.encounterBoss.currentHp;
      expect(bossHpAfterSet1).toBe(initialBossHp - set1Initial.bossHpDamage);

      // 2. Log Set 1 again with same setId ('set_row_1') but heavier weight (100kg x 8) -> replaces in-place without duplicating!
      machine = transitionHybridWorkoutState(machine, {
        type: 'LOG_SET',
        setId: 'set_row_1',
        exerciseId: 'bench_press',
        exerciseName: 'Barbell Bench Press',
        weightKg: 100,
        reps: 8,
        rpe: 9,
        nowMs: t0 + 20_000,
      });

      expect(machine.activeSession?.setLogs).toHaveLength(1);
      const set1Replaced = machine.activeSession!.setLogs[0];
      expect(set1Replaced.id).toBe('set_row_1');
      expect(set1Replaced.setNumber).toBe(1);
      expect(set1Replaced.weightKg).toBe(100);
      expect(machine.activeSession?.accumulatedMicroXp).toBe(set1Replaced.microXpTick);
      expect(machine.activeSession?.accumulatedMicroGold).toBe(set1Replaced.microGoldTick);
      expect(machine.activeSession?.encounterBoss.currentHp).toBe(
        initialBossHp - set1Replaced.bossHpDamage
      );

      // 3. Log Set 2 ('set_row_2')
      machine = transitionHybridWorkoutState(machine, {
        type: 'LOG_SET',
        setId: 'set_row_2',
        exerciseId: 'bench_press',
        exerciseName: 'Barbell Bench Press',
        weightKg: 100,
        reps: 8,
        rpe: 9,
        nowMs: t0 + 80_000,
      });
      expect(machine.activeSession?.setLogs).toHaveLength(2);
      expect(machine.activeSession?.setLogs[1].setNumber).toBe(2);

      // 4. UPDATE_SET on 'set_row_2' to warmup (reduces XP, gold, and boss damage in-place)
      machine = transitionHybridWorkoutState(machine, {
        type: 'UPDATE_SET',
        setId: 'set_row_2',
        weightKg: 60,
        reps: 5,
        isWarmup: true,
        setType: 'WARMUP',
      });
      expect(machine.activeSession?.setLogs).toHaveLength(2);
      const set2Updated = machine.activeSession!.setLogs[1];
      expect(set2Updated.isWarmup).toBe(true);
      expect(set2Updated.microXpTick).toBe(2);
      expect(set2Updated.bossHpDamage).toBe(25);
      expect(machine.activeSession?.accumulatedMicroXp).toBe(
        set1Replaced.microXpTick + set2Updated.microXpTick
      );
      expect(machine.activeSession?.encounterBoss.currentHp).toBe(
        initialBossHp - set1Replaced.bossHpDamage - set2Updated.bossHpDamage
      );

      // 5. UNLOG_SET on 'set_row_1' -> removes set 1, renumbers set_row_2 to setNumber 1, restores boss HP & subtracts XP/gold
      machine = transitionHybridWorkoutState(machine, {
        type: 'UNLOG_SET',
        setId: 'set_row_1',
      });
      expect(machine.activeSession?.setLogs).toHaveLength(1);
      expect(machine.activeSession?.setLogs[0].id).toBe('set_row_2');
      expect(machine.activeSession?.setLogs[0].setNumber).toBe(1);
      expect(machine.activeSession?.accumulatedMicroXp).toBe(set2Updated.microXpTick);
      expect(machine.activeSession?.accumulatedMicroGold).toBe(set2Updated.microGoldTick);
      expect(machine.activeSession?.encounterBoss.currentHp).toBe(
        initialBossHp - set2Updated.bossHpDamage
      );
      expect(machine.lastMicroFeedback).toBeNull();
      expect(xpAfterSet1).toBeGreaterThan(0);
      expect(goldAfterSet1).toBeGreaterThan(0);
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

import { describe, expect, it } from 'vitest';
import {
  BASE_TICK_INTERVAL_MS,
  MIN_TICK_INTERVAL_MS,
  calculateElapsedGatheringTicks,
  calculateGatheringTick,
  calculateProjectedYield,
  calculateRequiredTimeForYield,
  formatDurationSummary,
  formatTickInterval,
} from '../src/gathering-calculator';

describe('Gathering Calculator — Deterministic Game Engine Math', () => {
  const baseStats = {
    strengthLevel: 1,
    enduranceLevel: 1,
    agilityLevel: 1,
  };

  it('calculates baseline gathering efficiency at level 1 stats', () => {
    const tick = calculateGatheringTick(baseStats, 1, 1, 'MINING');

    expect(tick.tickIntervalMs).toBe(BASE_TICK_INTERVAL_MS); // 300,000ms = 5m 00s
    expect(tick.tickIntervalSeconds).toBe(300);
    expect(tick.yieldPerTick).toBe(1);
    expect(tick.xpPerTick).toBeGreaterThanOrEqual(10);
    expect(tick.speedStat).toBe('ENDURANCE');
    expect(tick.yieldStat).toBe('STRENGTH');
    expect(tick.speedReductionPct).toBe(0);
    expect(tick.formattedInterval).toBe('5m 00s');
  });

  it('scales down tick interval based on relevant speed stat (Agility reduces Foraging, Endurance reduces Mining)', () => {
    // Foraging: Speed stat is Agility.
    // 5 Agility with Difficulty 1 = 4 effective diff -> 4 * 2.5% = 10% reduction.
    // 300s * 0.9 = 270s = 4m 30s!
    const foragingStats = {
      strengthLevel: 1,
      enduranceLevel: 1,
      agilityLevel: 5,
    };
    const forageTick = calculateGatheringTick(foragingStats, 1, 1, 'FORAGING');

    expect(forageTick.speedStat).toBe('AGILITY');
    expect(forageTick.speedReductionPct).toBe(10);
    expect(forageTick.tickIntervalSeconds).toBe(270);
    expect(forageTick.tickIntervalMs).toBe(270000);
    expect(forageTick.formattedInterval).toBe('4m 30s');

    // High stat respects maximum 60% reduction cap and MIN_TICK_INTERVAL_MS
    const godSpeedStats = {
      strengthLevel: 1,
      enduranceLevel: 50,
      agilityLevel: 50,
    };
    const maxReductionTick = calculateGatheringTick(godSpeedStats, 1, 1, 'FORAGING');
    expect(maxReductionTick.speedReductionPct).toBe(60);
    expect(maxReductionTick.tickIntervalMs).toBe(120000); // 300s * 0.4 = 120s
    expect(maxReductionTick.formattedInterval).toBe('2m 00s');
    expect(maxReductionTick.tickIntervalMs).toBeGreaterThanOrEqual(MIN_TICK_INTERVAL_MS);
  });

  it('scales up yield per tick based on relevant stat and profession level', () => {
    // Mining: Yield stat is Strength.
    // Strength 5 (diff 1): (5 - 1) / 4 = +1 item
    // Profession Level 4: (4 - 1) / 3 = +1 item
    // Base 1 + 1 + 1 = 3 items per tick
    const boostedStats = {
      strengthLevel: 5,
      enduranceLevel: 1,
      agilityLevel: 1,
    };
    const boostedMining = calculateGatheringTick(boostedStats, 4, 1, 'MINING');

    expect(boostedMining.yieldStat).toBe('STRENGTH');
    expect(boostedMining.yieldPerTick).toBe(3);
    expect(boostedMining.xpPerTick).toBeGreaterThan(15);
  });

  it('calculateProjectedYield computes exact ticks and item yield over time blocks', () => {
    const tickInterval = 270000; // 4m 30s (4.5 minutes)
    const yieldPerTick = 2;

    // 45 minutes = 2,700,000 ms -> exactly 10 ticks
    const duration45m = 45 * 60 * 1000;
    const proj45 = calculateProjectedYield(tickInterval, yieldPerTick, duration45m);

    expect(proj45.totalTicks).toBe(10);
    expect(proj45.totalSteps).toBe(10);
    expect(proj45.totalYield).toBe(20);
    expect(proj45.remainderMs).toBe(0);

    // 120 minutes (max cap) = 7,200,000 ms -> 26 ticks (26 * 270,000 = 7,020,000 ms, remainder 180,000 ms)
    const duration120m = 120 * 60 * 1000;
    const proj120 = calculateProjectedYield(tickInterval, yieldPerTick, duration120m);

    expect(proj120.totalTicks).toBe(26);
    expect(proj120.totalYield).toBe(52);
    expect(proj120.remainderMs).toBe(180000);

    // Edge cases: 0 duration
    const projZero = calculateProjectedYield(tickInterval, yieldPerTick, 0);
    expect(projZero.totalTicks).toBe(0);
    expect(projZero.totalYield).toBe(0);
  });

  it('calculateRequiredTimeForYield calculates exact milliseconds needed for target amounts', () => {
    const tickInterval = 270000; // 4m 30s
    const yieldPerTick = 2;

    // 20 items at 2 per tick = 10 ticks = 2,700,000 ms (45 minutes)
    const timeFor20 = calculateRequiredTimeForYield(tickInterval, yieldPerTick, 20);
    expect(timeFor20).toBe(2700000);

    // Odd target: 21 items at 2 per tick = 11 ticks (ceil(21/2) = 11) = 2,970,000 ms
    const timeFor21 = calculateRequiredTimeForYield(tickInterval, yieldPerTick, 21);
    expect(timeFor21).toBe(11 * tickInterval);

    // 0 target returns 0
    expect(calculateRequiredTimeForYield(tickInterval, yieldPerTick, 0)).toBe(0);
  });

  it('calculateElapsedGatheringTicks distributes ticks retroactively without double-dipping', () => {
    const startMs = 1000000;
    const intervalMs = 300000; // 5 min
    const durationMs = 3600000; // 1 hour (12 ticks max)
    const yieldPerTick = 2;

    // Simulation Step 1: User opens app 12 minutes in (2 completed ticks: at 5m and 10m)
    const check1Ms = startMs + 12 * 60 * 1000; // 720,000ms after start
    const step1 = calculateElapsedGatheringTicks({
      startedAtMs: startMs,
      lastTickProcessedAtMs: startMs,
      currentTimeMs: check1Ms,
      targetDurationMs: durationMs,
      tickIntervalMs: intervalMs,
      yieldPerTick,
    });

    expect(step1.elapsedTicks).toBe(2);
    expect(step1.newYieldAmount).toBe(4);
    expect(step1.newLastTickProcessedAtMs).toBe(startMs + 600000); // 10 minutes in
    expect(step1.isCompleted).toBe(false);

    // Simulation Step 2: User opens app 1 minute later (13 minutes in).
    // Should yield 0 new ticks, preventing double-dipping!
    const check2Ms = startMs + 13 * 60 * 1000;
    const step2 = calculateElapsedGatheringTicks({
      startedAtMs: startMs,
      lastTickProcessedAtMs: step1.newLastTickProcessedAtMs,
      currentTimeMs: check2Ms,
      targetDurationMs: durationMs,
      tickIntervalMs: intervalMs,
      yieldPerTick,
    });

    expect(step2.elapsedTicks).toBe(0);
    expect(step2.newYieldAmount).toBe(0);
    expect(step2.newLastTickProcessedAtMs).toBe(step1.newLastTickProcessedAtMs);
    expect(step2.isCompleted).toBe(false);

    // Simulation Step 3: User opens app 2 hours later (well past completion of 1h task).
    // Total ticks capped at 12 ticks total. Prior processed = 2 ticks. Elapsed should be 10 ticks!
    const check3Ms = startMs + 120 * 60 * 1000;
    const step3 = calculateElapsedGatheringTicks({
      startedAtMs: startMs,
      lastTickProcessedAtMs: step2.newLastTickProcessedAtMs,
      currentTimeMs: check3Ms,
      targetDurationMs: durationMs,
      tickIntervalMs: intervalMs,
      yieldPerTick,
    });

    expect(step3.elapsedTicks).toBe(10);
    expect(step3.totalCompletedTicks).toBe(12);
    expect(step3.newYieldAmount).toBe(20);
    expect(step3.isCompleted).toBe(true);
  });

  it('formats tick intervals and duration summaries cleanly', () => {
    expect(formatTickInterval(270000)).toBe('4m 30s');
    expect(formatTickInterval(300000)).toBe('5m 00s');
    expect(formatTickInterval(45000)).toBe('45s');

    expect(formatDurationSummary(15 * 60 * 1000)).toBe('15 minutes');
    expect(formatDurationSummary(60 * 60 * 1000)).toBe('1 hour');
    expect(formatDurationSummary(90 * 60 * 1000)).toBe('1h 30m');
  });
});

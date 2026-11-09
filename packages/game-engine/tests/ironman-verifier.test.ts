import { describe, expect, it } from 'vitest';
import {
  HeartRateSample,
  SleepStageSample,
  calculateHeartRateZone,
  verifyMindBodyTelemetry,
  verifyRecoveryTelemetry,
  verifyTelemetry,
} from '../src/ironman-verifier';

describe('Ironman Mode Telemetry Verifier (@goki/game-engine)', () => {
  it('correctly maps heart rates to zones based on estimated max HR', () => {
    // With 190 Max HR:
    expect(calculateHeartRateZone(95, 190)).toBe(1); // 50%
    expect(calculateHeartRateZone(120, 190)).toBe(2); // ~63%
    expect(calculateHeartRateZone(140, 190)).toBe(3); // ~74%
    expect(calculateHeartRateZone(160, 190)).toBe(4); // ~84%
    expect(calculateHeartRateZone(180, 190)).toBe(5); // ~95%
  });

  it('rejects a claimed Zone 4 HIIT session if actual heart rate averages 85 BPM (User Prompt Case)', () => {
    // 30 minute session (1800s) with 30 samples averaging 85 BPM
    const samples: HeartRateSample[] = Array.from({ length: 30 }, (_, i) => ({
      bpm: 82 + (i % 6), // 82 to 87 BPM, average ~84.5
      timestamp: 1000000 + i * 60000,
    }));

    const result = verifyTelemetry(samples, 1800, {
      workoutType: 'CARDIO_HIGH_INTENSITY',
      targetHrZone: 4,
    });

    expect(result.verified).toBe(false);
    expect(result.effectiveZone).toBe(1);
    expect(result.averageBpm).toBe(85);
    expect(result.confidenceScore).toBeLessThan(50);
    expect(result.reasons.some((r) => r.includes('Biometric mismatch'))).toBe(true);
  });

  it('successfully verifies a genuine Zone 4 HIIT session with elevated heart rates', () => {
    // 30 minute session (1800s) with high intensity intervals (155 - 175 BPM)
    const samples: HeartRateSample[] = Array.from({ length: 30 }, (_, i) => ({
      bpm: 155 + (i % 20), // 155 to 174 BPM, average ~164.5
      timestamp: 1000000 + i * 60000,
    }));

    const result = verifyTelemetry(samples, 1800, {
      workoutType: 'CARDIO_HIGH_INTENSITY',
      targetHrZone: 4,
    });

    expect(result.verified).toBe(true);
    expect(result.effectiveZone).toBe(4);
    expect(result.averageBpm).toBeGreaterThanOrEqual(155);
    expect(result.confidenceScore).toBeGreaterThanOrEqual(80);
    expect(result.reasons).toHaveLength(0);
  });

  it('verifies Zone 2 aerobic base cardio (120-135 BPM)', () => {
    const samples: HeartRateSample[] = Array.from({ length: 45 }, (_, i) => ({
      bpm: 122 + (i % 12),
      timestamp: 1000000 + i * 60000,
    }));

    const result = verifyTelemetry(samples, 2700, {
      workoutType: 'CARDIO_LOW_MOD',
      targetHrZone: 2,
    });

    expect(result.verified).toBe(true);
    expect(result.effectiveZone).toBe(2);
    expect(result.confidenceScore).toBeGreaterThanOrEqual(80);
  });

  it('verifies resistance training sessions with work spikes and rest periods', () => {
    // Simulating 5 lifting sets with spikes to 145-155 BPM and rests down to 105-115 BPM
    const samples: HeartRateSample[] = [];
    for (let set = 0; set < 6; set++) {
      samples.push({ bpm: 110, timestamp: set * 180000 });
      samples.push({ bpm: 148, timestamp: set * 180000 + 45000 });
      samples.push({ bpm: 152, timestamp: set * 180000 + 75000 });
      samples.push({ bpm: 120, timestamp: set * 180000 + 120000 });
    }

    const result = verifyTelemetry(samples, 1080, 'RESISTANCE');
    expect(result.verified).toBe(true);
    expect(result.peakBpm).toBe(152);
    expect(result.confidenceScore).toBeGreaterThanOrEqual(70);
  });

  it('detects and flags artificial flatline spoofing', () => {
    // Samples with exactly the same BPM (stdDev = 0)
    const samples: HeartRateSample[] = Array.from({ length: 20 }, (_, i) => ({
      bpm: 160,
      timestamp: 1000000 + i * 30000,
    }));

    const result = verifyTelemetry(samples, 600, { targetHrZone: 4 });
    expect(result.reasons.some((r) => r.includes('flatline'))).toBe(true);
  });

  it('gracefully handles empty or sparse telemetry', () => {
    const result = verifyTelemetry([], 1800, 4);
    expect(result.verified).toBe(false);
    expect(result.confidenceScore).toBe(0);
    expect(result.sampleCount).toBe(0);
  });

  describe('verifyMindBodyTelemetry (Low-Intensity Mind & Body)', () => {
    it('authenticates genuine Yoga/Meditation with OS classification and stable, calm heart rate', () => {
      // 30 min (1800s) calm yoga session, BPM between 68 and 82, average ~75
      const samples: HeartRateSample[] = Array.from({ length: 25 }, (_, i) => ({
        bpm: 72 + (i % 8),
        timestamp: 1000000 + i * 60000,
      }));

      const result = verifyMindBodyTelemetry({
        samples,
        durationSeconds: 1800,
        expectedModality: 'YOGA',
        osActivityClassification: 'HKWorkoutActivityTypeYoga',
        userMaxHr: 190,
      });

      expect(result.verified).toBe(true);
      expect(result.osClassificationVerified).toBe(true);
      expect(result.heartRateStabilityVerified).toBe(true);
      expect(result.confidenceScore).toBeGreaterThanOrEqual(85);
      expect(result.effectiveZone).toBe(1);
      expect(result.reasons).toHaveLength(0);
    });

    it('rejects mind-body sessions exhibiting Zone 4 BPM spikes', () => {
      // User claimed Yoga, but spiked to 162 BPM (Zone 4 > 152 BPM threshold)
      const samples: HeartRateSample[] = Array.from({ length: 20 }, (_, i) => ({
        bpm: i === 10 ? 162 : 75 + (i % 6),
        timestamp: 1000000 + i * 60000,
      }));

      const result = verifyMindBodyTelemetry({
        samples,
        durationSeconds: 1200,
        expectedModality: 'YOGA',
        osActivityClassification: 'HKWorkoutActivityTypeYoga',
      });

      expect(result.verified).toBe(false);
      expect(result.heartRateStabilityVerified).toBe(false);
      expect(result.reasons.some((r) => r.includes('Zone 4 heart rate spike detected'))).toBe(true);
    });

    it('rejects mind-body telemetry without positive OS activity classification', () => {
      const samples: HeartRateSample[] = Array.from({ length: 20 }, (_, i) => ({
        bpm: 72 + (i % 6),
        timestamp: 1000000 + i * 60000,
      }));

      const unclassifiedResult = verifyMindBodyTelemetry({
        samples,
        durationSeconds: 1200,
        expectedModality: 'MEDITATION',
        osActivityClassification: null,
      });

      expect(unclassifiedResult.verified).toBe(false);
      expect(unclassifiedResult.osClassificationVerified).toBe(false);
      expect(unclassifiedResult.reasons.some((r) => r.includes('Missing cryptographic OS activity classification'))).toBe(true);

      const incompatibleResult = verifyMindBodyTelemetry({
        samples,
        durationSeconds: 1200,
        expectedModality: 'YOGA',
        osActivityClassification: 'HKWorkoutActivityTypeRunning',
      });

      expect(incompatibleResult.verified).toBe(false);
      expect(incompatibleResult.osClassificationVerified).toBe(false);
      expect(incompatibleResult.reasons.some((r) => r.includes('does not match recognized mind-body modalities'))).toBe(true);
    });

    it('rejects artificial flatline or erratic volatile BPM during mind-body practice', () => {
      // Flatline (stdDev = 0)
      const flatSamples: HeartRateSample[] = Array.from({ length: 20 }, (_, i) => ({
        bpm: 70,
        timestamp: 1000000 + i * 60000,
      }));

      const flatResult = verifyMindBodyTelemetry({
        samples: flatSamples,
        durationSeconds: 1200,
        osActivityClassification: 'HKWorkoutActivityTypeMindAndBody',
      });

      expect(flatResult.verified).toBe(false);
      expect(flatResult.reasons.some((r) => r.includes('flatline'))).toBe(true);

      // Volatile erratic swing (e.g. fluctuating wildly between 60 and 130 BPM)
      const volatileSamples: HeartRateSample[] = Array.from({ length: 20 }, (_, i) => ({
        bpm: i % 2 === 0 ? 60 : 130,
        timestamp: 1000000 + i * 60000,
      }));

      const volatileResult = verifyMindBodyTelemetry({
        samples: volatileSamples,
        durationSeconds: 1200,
        osActivityClassification: 'HKWorkoutActivityTypeMindAndBody',
      });

      expect(volatileResult.verified).toBe(false);
      expect(volatileResult.reasons.some((r) => r.includes('Excessive heart rate volatility'))).toBe(true);
    });
  });

  describe('verifyRecoveryTelemetry (Sleep & Pedometer)', () => {
    it('authenticates valid sleep architecture and realistic step counts', () => {
      const validStages: SleepStageSample[] = [
        { stage: 'AWAKE', startTime: 0, endTime: 1800000 }, // 30m awake
        { stage: 'CORE', startTime: 1800000, endTime: 12600000 }, // 180m core
        { stage: 'DEEP', startTime: 12600000, endTime: 18000000 }, // 90m deep
        { stage: 'REM', startTime: 18000000, endTime: 25200000 }, // 120m rem
        { stage: 'CORE', startTime: 25200000, endTime: 28800000 }, // 60m core
      ];

      const result = verifyRecoveryTelemetry({
        sleepStages: validStages,
        stepCount: 9240,
      });

      expect(result.verified).toBe(true);
      expect(result.sleepVerified).toBe(true);
      expect(result.stepsVerified).toBe(true);
      expect(result.deepSleepMinutes).toBe(90);
      expect(result.remSleepMinutes).toBe(120);
      expect(result.confidenceScore).toBeGreaterThanOrEqual(90);
      expect(result.reasons).toHaveLength(0);
    });

    it('confidently rejects spoofed sleep with zero deep sleep stages over an extended duration (User Prompt Case)', () => {
      // 10 hours (600 min) with zero deep sleep stages
      const spoofed10hStages: SleepStageSample[] = [
        { stage: 'CORE', startTime: 0, endTime: 10 * 3600 * 1000 },
      ];

      const result = verifyRecoveryTelemetry({
        sleepStages: spoofed10hStages,
      });

      expect(result.verified).toBe(false);
      expect(result.sleepVerified).toBe(false);
      expect(result.deepSleepMinutes).toBe(0);
      expect(result.reasons.some((r) => r.includes('zero deep sleep stages'))).toBe(true);
    });

    it('rejects a flat 8-hour block of Awake time', () => {
      const flatAwakeStages: SleepStageSample[] = [
        { stage: 'AWAKE', startTime: 0, endTime: 8 * 3600 * 1000 },
      ];

      const result = verifyRecoveryTelemetry({
        sleepStages: flatAwakeStages,
      });

      expect(result.verified).toBe(false);
      expect(result.sleepVerified).toBe(false);
      expect(result.reasons.some((r) => r.includes('flat block of Awake'))).toBe(true);
    });

    it('validates pedometer step counts and flags negative or implausible values', () => {
      // Valid step-only payload
      const validSteps = verifyRecoveryTelemetry({ stepCount: 10500 });
      expect(validSteps.verified).toBe(true);
      expect(validSteps.stepsVerified).toBe(true);

      // Negative steps
      const negativeSteps = verifyRecoveryTelemetry({ stepCount: -200 });
      expect(negativeSteps.verified).toBe(false);
      expect(negativeSteps.reasons.some((r) => r.includes('Negative step count'))).toBe(true);

      // Implausibly high steps
      const superHumanSteps = verifyRecoveryTelemetry({ stepCount: 150000 });
      expect(superHumanSteps.verified).toBe(false);
      expect(superHumanSteps.reasons.some((r) => r.includes('exceeds daily human physiological limits'))).toBe(true);
    });
  });
});

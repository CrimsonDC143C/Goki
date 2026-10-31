import { HeartRateZone } from './types';

export interface HeartRateSample {
  bpm: number;
  timestamp: number | string;
}

export type SleepStageType = 'CORE' | 'DEEP' | 'REM' | 'AWAKE' | 'ASLEEP';

export interface SleepStageSample {
  stage: SleepStageType;
  startTime: number | string;
  endTime: number | string;
  durationSeconds?: number;
}

export interface TelemetryVerificationOptions {
  workoutDurationSeconds?: number;
  workoutType?: string;
  targetHrZone?: HeartRateZone;
  userMaxHr?: number;
  userRestingHr?: number;
}

export interface TelemetryVerificationResult {
  verified: boolean;
  confidenceScore: number; // 0 - 100
  effectiveZone: HeartRateZone;
  averageBpm: number;
  peakBpm: number;
  minBpm: number;
  sampleCount: number;
  coverageRatio: number;
  reasons: string[];
}

/**
 * Calculates heart rate zone (1-5) based on percentage of estimated Max HR.
 */
export function calculateHeartRateZone(bpm: number, maxHr = 190): HeartRateZone {
  const pct = bpm / maxHr;
  if (pct >= 0.9) return 5;
  if (pct >= 0.8) return 4;
  if (pct >= 0.7) return 3;
  if (pct >= 0.6) return 2;
  return 1;
}

/**
 * Pure engine verification function for Ironman Mode biometric telemetry.
 * Computes an integrity confidence score (0-100%) by comparing real-time
 * wearable heart rate samples against claimed workout intensity and duration.
 */
export function verifyTelemetry(
  samples: HeartRateSample[],
  workoutDurationSeconds: number,
  intensityTarget?: HeartRateZone | string | TelemetryVerificationOptions
): TelemetryVerificationResult {
  const options: TelemetryVerificationOptions =
    typeof intensityTarget === 'number'
      ? { targetHrZone: intensityTarget, workoutDurationSeconds }
      : typeof intensityTarget === 'string'
      ? { workoutType: intensityTarget, workoutDurationSeconds }
      : { workoutDurationSeconds, ...(intensityTarget ?? {}) };

  const durationSec = options.workoutDurationSeconds ?? workoutDurationSeconds ?? 0;
  const maxHr = options.userMaxHr ?? 190;
  const reasons: string[] = [];

  // 1. Sanitize & Filter physiological boundaries (35 - 240 BPM)
  const validSamples = (samples || []).filter(
    (s) =>
      typeof s.bpm === 'number' &&
      Number.isFinite(s.bpm) &&
      s.bpm >= 35 &&
      s.bpm <= 240
  );

  if (validSamples.length < 3 || durationSec <= 0) {
    return {
      verified: false,
      confidenceScore: 0,
      effectiveZone: 1,
      averageBpm: validSamples[0]?.bpm ?? 0,
      peakBpm: validSamples[0]?.bpm ?? 0,
      minBpm: validSamples[0]?.bpm ?? 0,
      sampleCount: validSamples.length,
      coverageRatio: 0,
      reasons: ['Insufficient heart rate telemetry samples captured during session'],
    };
  }

  // 2. Statistical aggregates
  const bpms = validSamples.map((s) => s.bpm);
  const sumBpm = bpms.reduce((acc, v) => acc + v, 0);
  const averageBpm = Math.round(sumBpm / bpms.length);
  const peakBpm = Math.max(...bpms);
  const minBpm = Math.min(...bpms);

  const variance =
    bpms.reduce((acc, v) => acc + Math.pow(v - averageBpm, 2), 0) / bpms.length;
  const stdDev = Math.sqrt(variance);

  // Time span coverage
  const times = validSamples.map((s) =>
    typeof s.timestamp === 'number' ? s.timestamp : new Date(s.timestamp).getTime()
  );
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const sampleSpanSec = Math.max(0, (maxTime - minTime) / 1000);
  const coverageRatio = Math.min(1.0, durationSec > 0 ? sampleSpanSec / durationSec : 1.0);

  // 3. Determine observed biometric zone
  const effectiveZone = calculateHeartRateZone(averageBpm, maxHr);

  // 4. Determine expected target zone from workout type or explicit zone
  let expectedZone: HeartRateZone = 2;
  if (options.targetHrZone) {
    expectedZone = options.targetHrZone;
  } else if (options.workoutType === 'CARDIO_HIGH_INTENSITY') {
    expectedZone = 4;
  } else if (options.workoutType === 'CARDIO_LOW_MOD') {
    expectedZone = 2;
  } else if (options.workoutType === 'ACTIVE_RECOVERY') {
    expectedZone = 1;
  } else if (options.workoutType === 'RESISTANCE') {
    // Resistance training is dynamic; average is usually zone 2/3 with spikes into 3/4
    expectedZone = 2;
  }

  const zoneDelta = Math.abs(effectiveZone - expectedZone);

  // 5. Compute Component Scores (Total: 100)
  // A. Zone Alignment (Max: 50 points)
  let zoneScore = 0;
  if (zoneDelta === 0) {
    zoneScore = 50;
  } else if (zoneDelta === 1) {
    zoneScore = 35; // Acceptable boundary variance
  } else if (zoneDelta === 2) {
    zoneScore = 15;
    reasons.push(
      `Average heart rate (${averageBpm} BPM, Zone ${effectiveZone}) deviated significantly from target Zone ${expectedZone}`
    );
  } else {
    zoneScore = 0;
    reasons.push(
      `Biometric mismatch: session logged at target Zone ${expectedZone}, but observed heart rate was ${averageBpm} BPM (Zone ${effectiveZone})`
    );
  }

  // B. Sample Coverage & Density (Max: 30 points)
  let coverageScore = 0;
  if (validSamples.length >= 10 && coverageRatio >= 0.5) {
    coverageScore = 30;
  } else if (validSamples.length >= 5 && coverageRatio >= 0.2) {
    coverageScore = 20;
  } else {
    coverageScore = Math.max(5, Math.round(coverageRatio * 20));
    reasons.push('Heart rate sample density was sparse relative to session duration');
  }

  // C. Physiological Plausibility & Heart Rate Variability (Max: 20 points)
  let plausibilityScore = 0;
  if (stdDev < 1.0 && validSamples.length > 5) {
    // Artificial flatline detection (likely spoofed/frozen data)
    plausibilityScore = 0;
    reasons.push('Artificial flatline detected: heart rate showed zero physiological variation');
  } else if (stdDev >= 4.0) {
    plausibilityScore = 20;
  } else {
    plausibilityScore = 10;
  }

  // Final Confidence Score
  const confidenceScore = Math.min(100, Math.max(0, zoneScore + coverageScore + plausibilityScore));

  // Threshold: Confidence >= 70 AND zoneDelta <= 1 required for Ironman Verification
  const verified = confidenceScore >= 70 && zoneDelta <= 1;
  if (!verified && reasons.length === 0) {
    reasons.push(`Verification confidence score (${confidenceScore}%) below 70% threshold`);
  }

  return {
    verified,
    confidenceScore,
    effectiveZone,
    averageBpm,
    peakBpm,
    minBpm,
    sampleCount: validSamples.length,
    coverageRatio: Math.round(coverageRatio * 100) / 100,
    reasons,
  };
}

// ============================================================================
// LOW-INTENSITY & RECOVERY VERIFIERS (WISDOM, SPIRIT, CONSTITUTION)
// ============================================================================

export interface MindBodyTelemetryPayload {
  samples?: HeartRateSample[];
  durationSeconds?: number;
  expectedModality?: 'YOGA' | 'PILATES' | 'MEDITATION' | 'BREATHWORK' | string;
  osActivityClassification?: string | null;
  userMaxHr?: number;
  userRestingHr?: number;
}

export interface MindBodyVerificationResult {
  verified: boolean;
  confidenceScore: number; // 0 - 100
  effectiveZone: HeartRateZone;
  averageBpm: number;
  peakBpm: number;
  minBpm: number;
  bpmVariance: number;
  bpmStdDev: number;
  sampleCount: number;
  osClassificationVerified: boolean;
  heartRateStabilityVerified: boolean;
  reasons: string[];
}

/**
 * Biometric verifier for Mind-Body practices (Yoga, Pilates, Meditation, Breathwork).
 * Verifies:
 * 1. Positive OS Activity Classification from Apple HealthKit / Google Health Connect.
 * 2. Low and stable heart rate variance, rejecting Zone 4 BPM spikes and artificial flatlines.
 */
export function verifyMindBodyTelemetry(
  payload: MindBodyTelemetryPayload
): MindBodyVerificationResult {
  const samples = payload.samples ?? [];
  const durationSec = payload.durationSeconds ?? 0;
  const maxHr = payload.userMaxHr ?? 190;
  const reasons: string[] = [];

  const validSamples = samples.filter(
    (s) =>
      typeof s.bpm === 'number' &&
      Number.isFinite(s.bpm) &&
      s.bpm >= 35 &&
      s.bpm <= 240
  );

  if (validSamples.length < 3) {
    return {
      verified: false,
      confidenceScore: 0,
      effectiveZone: 1,
      averageBpm: validSamples[0]?.bpm ?? 0,
      peakBpm: validSamples[0]?.bpm ?? 0,
      minBpm: validSamples[0]?.bpm ?? 0,
      bpmVariance: 0,
      bpmStdDev: 0,
      sampleCount: validSamples.length,
      osClassificationVerified: false,
      heartRateStabilityVerified: false,
      reasons: ['Insufficient heart rate telemetry samples for mind-body verification'],
    };
  }

  // 1. Statistical Aggregates
  const bpms = validSamples.map((s) => s.bpm);
  const sumBpm = bpms.reduce((a, b) => a + b, 0);
  const averageBpm = Math.round(sumBpm / bpms.length);
  const peakBpm = Math.max(...bpms);
  const minBpm = Math.min(...bpms);

  const bpmVariance =
    bpms.reduce((acc, v) => acc + Math.pow(v - averageBpm, 2), 0) / bpms.length;
  const bpmStdDev = Math.round(Math.sqrt(bpmVariance) * 100) / 100;
  const effectiveZone = calculateHeartRateZone(averageBpm, maxHr);

  // 2. OS Activity Classification Verification
  const rawOsTag = (payload.osActivityClassification ?? '').trim().toLowerCase();
  const validMindBodyTags = [
    'yoga',
    'pilates',
    'meditation',
    'mindandbody',
    'mind_and_body',
    'breathwork',
    'flexibility',
    'cooldown',
    'hkworkoutactivitytypeyoga',
    'hkworkoutactivitytypemindandbody',
    'hkworkoutactivitytypepilates',
    'hkworkoutactivitytypeflexibility',
  ];

  let osClassificationVerified = false;
  if (rawOsTag.length > 0) {
    osClassificationVerified = validMindBodyTags.some((tag) => rawOsTag.includes(tag));
  }

  if (!osClassificationVerified) {
    reasons.push(
      rawOsTag.length > 0
        ? `OS activity classification "${payload.osActivityClassification}" does not match recognized mind-body modalities`
        : 'Missing cryptographic OS activity classification from HealthKit / Health Connect'
    );
  }

  // 3. Heart Rate Stability & Low Variance Verification
  let heartRateStabilityVerified = true;

  // A. Reject Zone 4 / Zone 5 spikes (Zone 4 begins at 80% Max HR)
  const zone4BpmCeiling = Math.round(maxHr * 0.8);
  if (peakBpm >= zone4BpmCeiling) {
    heartRateStabilityVerified = false;
    reasons.push(
      `Zone 4 heart rate spike detected (${peakBpm} BPM >= ${zone4BpmCeiling} BPM); session incompatible with low-intensity mind-body restorative state`
    );
  }

  // B. Average BPM should remain calm (Zone 1 or mild Zone 2, <= 72% Max HR)
  const calmBpmCeiling = Math.round(maxHr * 0.72);
  if (averageBpm > calmBpmCeiling) {
    heartRateStabilityVerified = false;
    reasons.push(
      `Average heart rate (${averageBpm} BPM) exceeds calm restorative ceiling (${calmBpmCeiling} BPM)`
    );
  }

  // C. Reject artificial flatline (spoofed/synthetic data with zero physiological jitter)
  if (bpmStdDev < 0.5 && validSamples.length >= 5) {
    heartRateStabilityVerified = false;
    reasons.push('Artificial flatline detected: zero physiological heart rate variance');
  }

  // D. Reject excessive variance/volatility (e.g., HIIT/sprints mistakenly logged as Yoga)
  if (bpmStdDev > 16.0) {
    heartRateStabilityVerified = false;
    reasons.push(
      `Excessive heart rate volatility (stdDev ${bpmStdDev} BPM); indicates strenuous or erratic exertion incompatible with stable mind-body focus`
    );
  }

  // 4. Scoring
  let confidenceScore = 0;
  if (osClassificationVerified) confidenceScore += 50;
  if (heartRateStabilityVerified) confidenceScore += 35;
  if (validSamples.length >= 10) confidenceScore += 15;
  else if (validSamples.length >= 5) confidenceScore += 10;
  else confidenceScore += 5;

  const verified = osClassificationVerified && heartRateStabilityVerified && confidenceScore >= 70;

  return {
    verified,
    confidenceScore: Math.min(100, confidenceScore),
    effectiveZone,
    averageBpm,
    peakBpm,
    minBpm,
    bpmVariance: Math.round(bpmVariance * 100) / 100,
    bpmStdDev,
    sampleCount: validSamples.length,
    osClassificationVerified,
    heartRateStabilityVerified,
    reasons,
  };
}

export interface RecoveryTelemetryPayload {
  sleepStages?: SleepStageSample[];
  totalSleepHours?: number;
  stepCount?: number;
  stepTrackingDurationSeconds?: number;
}

export interface RecoveryVerificationResult {
  verified: boolean;
  confidenceScore: number; // 0 - 100
  sleepVerified: boolean;
  stepsVerified: boolean;
  sleepStagesCount: number;
  deepSleepMinutes: number;
  remSleepMinutes: number;
  coreSleepMinutes: number;
  awakeMinutes: number;
  totalSleepMinutes: number;
  stepCount: number;
  reasons: string[];
}

/**
 * Biometric verifier for Constitution (Sleep stages & Pedometer step counts).
 * Verifies:
 * 1. Sleep payload contains realistic OS-generated sleep stages (Deep, Core, REM, Awake)
 *    and rejects flat blocks of Awake time or extended sleep with zero deep sleep stages.
 * 2. Step count payload adheres to realistic physiological cadence and non-negative counts.
 */
export function verifyRecoveryTelemetry(
  payload: RecoveryTelemetryPayload
): RecoveryVerificationResult {
  const reasons: string[] = [];
  const sleepStages = payload.sleepStages ?? [];
  const stepCount = payload.stepCount ?? 0;

  let sleepVerified = false;
  let stepsVerified = false;
  let deepSleepMinutes = 0;
  let remSleepMinutes = 0;
  let coreSleepMinutes = 0;
  let awakeMinutes = 0;

  const hasSleepPayload = payload.sleepStages !== undefined || (payload.totalSleepHours ?? 0) > 0;
  const hasStepPayload = payload.stepCount !== undefined && payload.stepCount !== null;

  if (!hasSleepPayload && !hasStepPayload) {
    return {
      verified: false,
      confidenceScore: 0,
      sleepVerified: false,
      stepsVerified: false,
      sleepStagesCount: 0,
      deepSleepMinutes: 0,
      remSleepMinutes: 0,
      coreSleepMinutes: 0,
      awakeMinutes: 0,
      totalSleepMinutes: 0,
      stepCount: 0,
      reasons: ['Neither sleep stage telemetry nor pedometer step count provided for recovery verification'],
    };
  }

  // 1. Sleep Stages Verification
  if (hasSleepPayload) {
    if (sleepStages.length === 0) {
      reasons.push('Sleep claimed without any OS-generated physiological sleep stage telemetry');
    } else {
      for (const stageSample of sleepStages) {
        let durationMin = 0;
        if (stageSample.durationSeconds && stageSample.durationSeconds > 0) {
          durationMin = stageSample.durationSeconds / 60;
        } else {
          const startMs = typeof stageSample.startTime === 'number' ? stageSample.startTime : new Date(stageSample.startTime).getTime();
          const endMs = typeof stageSample.endTime === 'number' ? stageSample.endTime : new Date(stageSample.endTime).getTime();
          durationMin = Math.max(0, (endMs - startMs) / 60000);
        }

        switch (stageSample.stage) {
          case 'DEEP':
            deepSleepMinutes += durationMin;
            break;
          case 'REM':
            remSleepMinutes += durationMin;
            break;
          case 'CORE':
          case 'ASLEEP':
            coreSleepMinutes += durationMin;
            break;
          case 'AWAKE':
            awakeMinutes += durationMin;
            break;
        }
      }

      const totalSleepMinutes = deepSleepMinutes + remSleepMinutes + coreSleepMinutes + awakeMinutes;
      const restorativeSleepMinutes = deepSleepMinutes + remSleepMinutes + coreSleepMinutes;

      // Check: Flat block of "Awake" or zero restorative sleep
      if (restorativeSleepMinutes <= 0) {
        reasons.push('Spoofed sleep payload: flat block of Awake or unclassified time with zero restorative sleep');
      } else if (totalSleepMinutes >= 180 && deepSleepMinutes <= 0) {
        // Extended sleep (>= 3 hours) with zero deep sleep is physiologically impossible
        reasons.push(
          `Physiologically impossible sleep architecture: claimed extended sleep (${Math.round(totalSleepMinutes / 60)} hours) with zero deep sleep stages`
        );
      } else if (totalSleepMinutes > 0 && awakeMinutes / totalSleepMinutes > 0.7) {
        reasons.push(
          `Excessive awake ratio (${Math.round((awakeMinutes / totalSleepMinutes) * 100)}%) during claimed sleep window`
        );
      } else {
        sleepVerified = true;
      }
    }
  }

  // 2. Step Count Verification
  if (hasStepPayload) {
    if (stepCount < 0) {
      reasons.push('Negative step count is physiologically impossible');
    } else if (stepCount > 100000) {
      reasons.push(`Implausibly high step count (${stepCount}) exceeds daily human physiological limits`);
    } else if (payload.stepTrackingDurationSeconds && payload.stepTrackingDurationSeconds > 0) {
      const durationMin = payload.stepTrackingDurationSeconds / 60;
      const cadence = stepCount / durationMin;
      if (cadence > 280) {
        reasons.push(`Step cadence (${Math.round(cadence)} steps/min) exceeds plausible sustained movement speed`);
      } else {
        stepsVerified = true;
      }
    } else {
      stepsVerified = true;
    }
  }

  const totalSleepMinutes = deepSleepMinutes + remSleepMinutes + coreSleepMinutes + awakeMinutes;

  // 3. Overall Recovery Verification & Confidence Score
  let confidenceScore = 0;
  if (hasSleepPayload && hasStepPayload) {
    if (sleepVerified && stepsVerified) confidenceScore = 95;
    else if (sleepVerified || stepsVerified) confidenceScore = 50;
    else confidenceScore = 20;
  } else if (hasSleepPayload) {
    confidenceScore = sleepVerified ? 90 : 25;
  } else if (hasStepPayload) {
    confidenceScore = stepsVerified ? 85 : 20;
  }

  const verified = confidenceScore >= 70 && reasons.length === 0;

  return {
    verified,
    confidenceScore,
    sleepVerified,
    stepsVerified,
    sleepStagesCount: sleepStages.length,
    deepSleepMinutes: Math.round(deepSleepMinutes * 10) / 10,
    remSleepMinutes: Math.round(remSleepMinutes * 10) / 10,
    coreSleepMinutes: Math.round(coreSleepMinutes * 10) / 10,
    awakeMinutes: Math.round(awakeMinutes * 10) / 10,
    totalSleepMinutes: Math.round(totalSleepMinutes * 10) / 10,
    stepCount,
    reasons,
  };
}

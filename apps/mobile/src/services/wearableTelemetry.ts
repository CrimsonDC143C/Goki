import { HeartRateSample, SleepStageSample, SleepStageType } from '@gymify/game-engine';
import { Platform } from 'react-native';

export type WearableTelemetrySource =
  | 'APPLE_HEALTHKIT'
  | 'GOOGLE_HEALTH_CONNECT'
  | 'WEARABLE_TELEMETRY';

export interface WearableService {
  isAvailable(): Promise<boolean>;
  requestPermissions(): Promise<boolean>;
  startLiveSession(onUpdate?: (sample: HeartRateSample) => void): Promise<void>;
  stopLiveSession(): Promise<void>;
  getHeartRateSamples(
    startTime: Date | number,
    endTime: Date | number
  ): Promise<HeartRateSample[]>;
  getLatestBpm(): number;
  getPlatformSource(): WearableTelemetrySource;
  isLiveSessionActive(): boolean;
  getOsActivityClassification(
    startTime: Date | number,
    endTime: Date | number
  ): Promise<string | null>;
  fetchSleepData(
    startTime: Date | number,
    endTime: Date | number
  ): Promise<SleepStageSample[]>;
  fetchStepCount(
    startTime: Date | number,
    endTime: Date | number
  ): Promise<number>;
}

// Dynamic native imports with safe fallback for Expo Web & Simulators
let NativeHealthKit: any = null;
if (Platform.OS === 'ios') {
  try {
    NativeHealthKit = require('react-native-health').default ?? require('react-native-health');
  } catch {
    NativeHealthKit = null;
  }
}

let NativeHealthConnect: any = null;
if (Platform.OS === 'android') {
  try {
    NativeHealthConnect = require('react-native-health-connect');
  } catch {
    NativeHealthConnect = null;
  }
}

class UnifiedWearableService implements WearableService {
  private active = false;
  private latestBpm = 72;
  private recordedSamples: HeartRateSample[] = [];
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private liveUpdateCallback: ((sample: HeartRateSample) => void) | null = null;
  private baseBpmTarget = 142; // Dynamic target simulating training intensity
  private simulatedOsActivityClassification: string | null = 'HKWorkoutActivityTypeYoga';
  private simulatedSleepData: SleepStageSample[] | null = null;
  private simulatedStepCount = 8420;

  public async isAvailable(): Promise<boolean> {
    if (Platform.OS === 'ios') {
      return Boolean(NativeHealthKit?.isAvailable);
    }
    if (Platform.OS === 'android') {
      return Boolean(NativeHealthConnect?.getSdkStatus);
    }
    // Web / dev telemetry simulator
    return true;
  }

  public getPlatformSource(): WearableTelemetrySource {
    if (Platform.OS === 'ios') return 'APPLE_HEALTHKIT';
    if (Platform.OS === 'android') return 'GOOGLE_HEALTH_CONNECT';
    return 'WEARABLE_TELEMETRY';
  }

  public isLiveSessionActive(): boolean {
    return this.active;
  }

  public getLatestBpm(): number {
    return this.latestBpm;
  }

  public async requestPermissions(): Promise<boolean> {
    if (Platform.OS === 'ios' && NativeHealthKit) {
      return new Promise<boolean>((resolve) => {
        const permissions = {
          permissions: {
            read: [
              NativeHealthKit.Constants?.Permissions?.HeartRate ?? 'HeartRate',
              NativeHealthKit.Constants?.Permissions?.StepCount ?? 'StepCount',
              NativeHealthKit.Constants?.Permissions?.SleepAnalysis ?? 'SleepAnalysis',
              NativeHealthKit.Constants?.Permissions?.Workout ?? 'Workout',
            ],
            write: [],
          },
        };
        NativeHealthKit.initHealthKit(permissions, (err: unknown) => {
          if (err) {
            resolve(false);
          } else {
            resolve(true);
          }
        });
      });
    }

    if (Platform.OS === 'android' && NativeHealthConnect) {
      try {
        await NativeHealthConnect.initialize();
        const granted = await NativeHealthConnect.requestPermission([
          { accessType: 'read', recordType: 'HeartRate' },
          { accessType: 'read', recordType: 'Steps' },
          { accessType: 'read', recordType: 'SleepSession' },
          { accessType: 'read', recordType: 'ExerciseSession' },
        ]);
        return Boolean(granted);
      } catch {
        return false;
      }
    }

    // Web / Simulator fallback always permits simulated telemetry
    return true;
  }

  public async startLiveSession(onUpdate?: (sample: HeartRateSample) => void): Promise<void> {
    this.active = true;
    this.recordedSamples = [];
    this.liveUpdateCallback = onUpdate ?? null;

    // Start with resting/warmup baseline
    this.latestBpm = 95;

    this.stopPolling();
    this.pollTimer = setInterval(() => {
      this.pollNextSample();
    }, 1500);

    // Initial immediate sample
    this.pollNextSample();
  }

  public async stopLiveSession(): Promise<void> {
    this.active = false;
    this.stopPolling();
    this.liveUpdateCallback = null;
  }

  public async getHeartRateSamples(
    startTime: Date | number,
    endTime: Date | number
  ): Promise<HeartRateSample[]> {
    const startMs = typeof startTime === 'number' ? startTime : startTime.getTime();
    const endMs = typeof endTime === 'number' ? endTime : endTime.getTime();

    // 1. Query Native iOS HealthKit if available
    if (Platform.OS === 'ios' && NativeHealthKit) {
      const nativeSamples = await new Promise<HeartRateSample[]>((resolve) => {
        NativeHealthKit.getHeartRateSamples(
          {
            startDate: new Date(startMs).toISOString(),
            endDate: new Date(endMs).toISOString(),
          },
          (err: unknown, results: Array<{ value: number; startDate: string }>) => {
            if (err || !results) {
              resolve([]);
            } else {
              resolve(
                results.map((r) => ({
                  bpm: Math.round(r.value),
                  timestamp: new Date(r.startDate).getTime(),
                }))
              );
            }
          }
        );
      });

      if (nativeSamples.length > 0) {
        return nativeSamples;
      }
    }

    // 2. Query Native Android Health Connect if available
    if (Platform.OS === 'android' && NativeHealthConnect) {
      try {
        const records = await NativeHealthConnect.readRecords('HeartRate', {
          timeRangeFilter: {
            operator: 'between',
            startTime: new Date(startMs).toISOString(),
            endTime: new Date(endMs).toISOString(),
          },
        });
        if (records?.records?.length) {
          const parsed: HeartRateSample[] = [];
          for (const rec of records.records) {
            for (const sample of rec.samples ?? []) {
              parsed.push({
                bpm: Math.round(sample.beatsPerMinute),
                timestamp: new Date(sample.time).getTime(),
              });
            }
          }
          if (parsed.length > 0) return parsed;
        }
      } catch {
        // Fall back to recorded session samples
      }
    }

    // 3. Fallback to session-captured samples
    return this.recordedSamples.filter((s) => {
      const ts = typeof s.timestamp === 'number' ? s.timestamp : new Date(s.timestamp).getTime();
      return ts >= startMs && ts <= endMs;
    });
  }

  public setSimulatedTargetBpm(bpm: number): void {
    this.baseBpmTarget = Math.max(70, Math.min(195, bpm));
  }

  public setSimulatedOsActivityClassification(type: string | null): void {
    this.simulatedOsActivityClassification = type;
  }

  public setSimulatedSleepData(stages: SleepStageSample[] | null): void {
    this.simulatedSleepData = stages;
  }

  public setSimulatedStepCount(steps: number): void {
    this.simulatedStepCount = steps;
  }

  public async getOsActivityClassification(
    startTime: Date | number,
    endTime: Date | number
  ): Promise<string | null> {
    const startMs = typeof startTime === 'number' ? startTime : startTime.getTime();
    const endMs = typeof endTime === 'number' ? endTime : endTime.getTime();

    if (Platform.OS === 'ios' && NativeHealthKit) {
      const classification = await new Promise<string | null>((resolve) => {
        if (typeof NativeHealthKit.getSamples === 'function') {
          NativeHealthKit.getSamples(
            {
              startDate: new Date(startMs).toISOString(),
              endDate: new Date(endMs).toISOString(),
              type: 'Workout',
            },
            (err: unknown, results: Array<{ activityType?: string; activityName?: string }>) => {
              if (err || !results || results.length === 0) {
                resolve(null);
              } else {
                resolve(results[0]?.activityType ?? results[0]?.activityName ?? null);
              }
            }
          );
        } else {
          resolve(null);
        }
      });
      if (classification) return classification;
    }

    if (Platform.OS === 'android' && NativeHealthConnect) {
      try {
        const records = await NativeHealthConnect.readRecords('ExerciseSession', {
          timeRangeFilter: {
            operator: 'between',
            startTime: new Date(startMs).toISOString(),
            endTime: new Date(endMs).toISOString(),
          },
        });
        if (records?.records?.length) {
          const exType = records.records[0]?.exerciseType;
          if (exType) return String(exType);
        }
      } catch {
        // Fallback
      }
    }

    // Web / Simulator fallback
    return this.simulatedOsActivityClassification;
  }

  public async fetchSleepData(
    startTime: Date | number,
    endTime: Date | number
  ): Promise<SleepStageSample[]> {
    const startMs = typeof startTime === 'number' ? startTime : startTime.getTime();
    const endMs = typeof endTime === 'number' ? endTime : endTime.getTime();

    if (Platform.OS === 'ios' && NativeHealthKit) {
      const stages = await new Promise<SleepStageSample[]>((resolve) => {
        if (typeof NativeHealthKit.getSleepSamples === 'function') {
          NativeHealthKit.getSleepSamples(
            {
              startDate: new Date(startMs).toISOString(),
              endDate: new Date(endMs).toISOString(),
            },
            (err: unknown, results: Array<{ value: string | number; startDate: string; endDate: string }>) => {
              if (err || !results || results.length === 0) {
                resolve([]);
              } else {
                resolve(
                  results.map((r) => {
                    const val = String(r.value).toUpperCase();
                    let stage: SleepStageType = 'CORE';
                    if (val.includes('DEEP')) stage = 'DEEP';
                    else if (val.includes('REM')) stage = 'REM';
                    else if (val.includes('AWAKE')) stage = 'AWAKE';
                    else if (val.includes('ASLEEP')) stage = 'ASLEEP';
                    return {
                      stage,
                      startTime: new Date(r.startDate).getTime(),
                      endTime: new Date(r.endDate).getTime(),
                    };
                  })
                );
              }
            }
          );
        } else {
          resolve([]);
        }
      });
      if (stages.length > 0) return stages;
    }

    if (Platform.OS === 'android' && NativeHealthConnect) {
      try {
        const records = await NativeHealthConnect.readRecords('SleepSession', {
          timeRangeFilter: {
            operator: 'between',
            startTime: new Date(startMs).toISOString(),
            endTime: new Date(endMs).toISOString(),
          },
        });
        if (records?.records?.length) {
          const stages: SleepStageSample[] = [];
          for (const rec of records.records) {
            for (const stg of rec.stages ?? []) {
              let stage: SleepStageType = 'CORE';
              const stageVal = String(stg.stage).toUpperCase();
              if (stageVal.includes('DEEP')) stage = 'DEEP';
              else if (stageVal.includes('REM')) stage = 'REM';
              else if (stageVal.includes('AWAKE')) stage = 'AWAKE';
              stages.push({
                stage,
                startTime: new Date(stg.startTime).getTime(),
                endTime: new Date(stg.endTime).getTime(),
              });
            }
          }
          if (stages.length > 0) return stages;
        }
      } catch {
        // Fallback
      }
    }

    // Web / Simulator fallback
    if (this.simulatedSleepData) {
      return this.simulatedSleepData;
    }

    const durationMs = Math.max(3600000, endMs - startMs);
    return [
      { stage: 'AWAKE', startTime: startMs, endTime: startMs + durationMs * 0.05 },
      { stage: 'CORE', startTime: startMs + durationMs * 0.05, endTime: startMs + durationMs * 0.35 },
      { stage: 'DEEP', startTime: startMs + durationMs * 0.35, endTime: startMs + durationMs * 0.55 },
      { stage: 'REM', startTime: startMs + durationMs * 0.55, endTime: startMs + durationMs * 0.75 },
      { stage: 'CORE', startTime: startMs + durationMs * 0.75, endTime: startMs + durationMs * 0.95 },
      { stage: 'AWAKE', startTime: startMs + durationMs * 0.95, endTime: endMs },
    ];
  }

  public async fetchStepCount(
    startTime: Date | number,
    endTime: Date | number
  ): Promise<number> {
    const startMs = typeof startTime === 'number' ? startTime : startTime.getTime();
    const endMs = typeof endTime === 'number' ? endTime : endTime.getTime();

    if (Platform.OS === 'ios' && NativeHealthKit) {
      const steps = await new Promise<number>((resolve) => {
        if (typeof NativeHealthKit.getStepCount === 'function') {
          NativeHealthKit.getStepCount(
            {
              startDate: new Date(startMs).toISOString(),
              endDate: new Date(endMs).toISOString(),
            },
            (err: unknown, results: { value: number }) => {
              if (err || !results) resolve(0);
              else resolve(Math.round(results.value || 0));
            }
          );
        } else {
          resolve(0);
        }
      });
      if (steps > 0) return steps;
    }

    if (Platform.OS === 'android' && NativeHealthConnect) {
      try {
        const records = await NativeHealthConnect.readRecords('Steps', {
          timeRangeFilter: {
            operator: 'between',
            startTime: new Date(startMs).toISOString(),
            endTime: new Date(endMs).toISOString(),
          },
        });
        if (records?.records?.length) {
          const sum = records.records.reduce((acc: number, r: { count?: number }) => acc + (r.count ?? 0), 0);
          if (sum > 0) return sum;
        }
      } catch {
        // Fallback
      }
    }

    // Web / Simulator fallback
    return this.simulatedStepCount;
  }

  private pollNextSample(): void {
    if (!this.active) return;

    // Physiological drift toward workout intensity with realistic micro-variability
    const jitter = Math.floor(Math.random() * 7) - 3;
    const diff = this.baseBpmTarget - this.latestBpm;
    const step = Math.sign(diff) * Math.min(Math.abs(diff), 4);

    this.latestBpm = Math.max(65, Math.min(195, this.latestBpm + step + jitter));

    const sample: HeartRateSample = {
      bpm: this.latestBpm,
      timestamp: Date.now(),
    };

    this.recordedSamples.push(sample);
    if (this.liveUpdateCallback) {
      try {
        this.liveUpdateCallback(sample);
      } catch {
        // Protect polling loop
      }
    }
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
}

export const wearableService: WearableService & {
  setSimulatedTargetBpm: (bpm: number) => void;
  setSimulatedOsActivityClassification: (type: string | null) => void;
  setSimulatedSleepData: (stages: SleepStageSample[] | null) => void;
  setSimulatedStepCount: (steps: number) => void;
} = new UnifiedWearableService();

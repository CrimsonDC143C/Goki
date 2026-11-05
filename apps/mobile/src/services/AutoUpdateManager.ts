import { AppState, AppStateStatus, Platform } from 'react-native';
import Constants from 'expo-constants';
import {
  compareSemver,
  isForceUpdateRequired,
  isUpdateAvailable,
} from '@gymify/game-engine';
import { API_BASE_URL } from '../api/apiClient';
import { diagnosticLogger } from './DiagnosticLogger';

export type UpdateStatus =
  | 'IDLE'
  | 'CHECKING'
  | 'DOWNLOADING_OTA'
  | 'READY_TO_INSTALL'
  | 'WAITING_FOR_WORKOUT'
  | 'BINARY_UPDATE_AVAILABLE'
  | 'FORCE_BINARY_UPDATE'
  | 'UP_TO_DATE'
  | 'ERROR';

export interface VersionManifest {
  latestVersion: string;
  minRequiredVersion: string;
  androidApkDownloadUrl: string | null;
  releaseNotes: string;
  serverTimestamp: string;
}

export interface AutoUpdateState {
  status: UpdateStatus;
  currentVersion: string;
  manifest: VersionManifest | null;
  errorMessage: string | null;
  lastCheckedAt: number | null;
  isStagedForWorkoutEnd: boolean;
}

type StateListener = (state: AutoUpdateState) => void;
type WorkoutActivePredicate = () => boolean;
type DraftSaveHandler = () => Promise<void>;

// Safely attempt dynamic load of expo-updates to avoid breaking web / dev client / Expo Go
let ExpoUpdates: typeof import('expo-updates') | null = null;
try {
  ExpoUpdates = require('expo-updates');
} catch {
  ExpoUpdates = null;
}

const POLL_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

class AutoUpdateManagerService {
  private state: AutoUpdateState = {
    status: 'IDLE',
    currentVersion: Constants?.expoConfig?.version || '0.1.0',
    manifest: null,
    errorMessage: null,
    lastCheckedAt: null,
    isStagedForWorkoutEnd: false,
  };

  private listeners = new Set<StateListener>();
  private isWorkoutActiveCheck: WorkoutActivePredicate | null = null;
  private emergencyDraftSaveHandler: DraftSaveHandler | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private appStateSubscription: { remove: () => void } | null = null;
  private isInitialized = false;

  constructor() {}

  public getState(): AutoUpdateState {
    return { ...this.state };
  }

  public subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const currentState = this.getState();
    this.listeners.forEach((listener) => {
      try {
        listener(currentState);
      } catch (err) {
        console.error('[AutoUpdateManager] Error in state listener:', err);
      }
    });
  }

  private updateState(partial: Partial<AutoUpdateState>): void {
    this.state = { ...this.state, ...partial };
    this.notify();
  }

  /**
   * Register workout guards to guarantee zero interrupted sets.
   */
  public registerWorkoutGuards(
    isWorkoutActive: WorkoutActivePredicate,
    emergencySaveDraft?: DraftSaveHandler
  ): void {
    this.isWorkoutActiveCheck = isWorkoutActive;
    if (emergencySaveDraft) {
      this.emergencyDraftSaveHandler = emergencySaveDraft;
    }
  }

  /**
   * Lifecycle trigger when a workout finishes, is cancelled, or reviews loot.
   * If an update was staged while the user was lifting, apply it cleanly now.
   */
  public async onWorkoutCompleted(): Promise<void> {
    if (this.state.isStagedForWorkoutEnd) {
      diagnosticLogger.logInfo(
        'AUTO_UPDATE',
        'Workout ended; auto-applying staged update now.'
      );
      await this.applyUpdate();
    }
  }

  /**
   * Initial bootstrap: sets up foreground listeners and 15-minute background polling.
   */
  public init(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;

    // Trigger 1: Cold start check
    this.checkForUpdates(false).catch(() => {});

    // Trigger 2: Foreground resume
    this.appStateSubscription = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        if (nextState === 'active') {
          this.checkForUpdates(false).catch(() => {});
        }
      }
    );

    // Trigger 3: Periodic polling interval (every 15 min while app is alive)
    if (typeof setInterval !== 'undefined') {
      this.pollTimer = setInterval(() => {
        if (AppState.currentState === 'active') {
          this.checkForUpdates(false).catch(() => {});
        }
      }, POLL_INTERVAL_MS);
    }
  }

  public destroy(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
    this.isInitialized = false;
  }

  /**
   * Checks for updates across both OTA bundles and backend binary manifest.
   * @param isManual True if triggered by the user tapping "Check for Updates"
   */
  public async checkForUpdates(isManual = false): Promise<AutoUpdateState> {
    if (!isManual && this.state.isStagedForWorkoutEnd) {
      return this.getState();
    }

    if (
      this.state.status === 'DOWNLOADING_OTA' ||
      this.state.status === 'CHECKING'
    ) {
      return this.getState();
    }

    this.updateState({
      status: 'CHECKING',
      errorMessage: null,
      lastCheckedAt: Date.now(),
    });

    diagnosticLogger.logInfo('AUTO_UPDATE', 'Checking for updates...', {
      isManual,
      currentVersion: this.state.currentVersion,
      platform: Platform.OS,
    });

    try {
      // 1. Fetch Backend Version Manifest
      let manifest: VersionManifest | null = null;
      try {
        const resp = await fetch(`${API_BASE_URL}/api/version`, {
          headers: { Accept: 'application/json' },
        });
        if (resp.ok) {
          manifest = (await resp.json()) as VersionManifest;
          this.updateState({ manifest });
        }
      } catch (manifestErr) {
        diagnosticLogger.logWarn(
          'AUTO_UPDATE',
          'Failed to query version manifest from server',
          { error: String(manifestErr) }
        );
      }

      // Check binary upgrade rules if manifest is available
      if (manifest) {
        if (
          isForceUpdateRequired(
            this.state.currentVersion,
            manifest.minRequiredVersion
          )
        ) {
          diagnosticLogger.logWarn(
            'AUTO_UPDATE',
            'Force binary upgrade required by server manifest',
            {
              currentVersion: this.state.currentVersion,
              minRequired: manifest.minRequiredVersion,
            }
          );
          this.updateState({ status: 'FORCE_BINARY_UPDATE' });
          return this.getState();
        }

        if (
          isUpdateAvailable(
            this.state.currentVersion,
            manifest.latestVersion
          )
        ) {
          diagnosticLogger.logInfo(
            'AUTO_UPDATE',
            'Newer binary / APK version available on server manifest',
            {
              currentVersion: this.state.currentVersion,
              latestVersion: manifest.latestVersion,
            }
          );
          this.updateState({ status: 'BINARY_UPDATE_AVAILABLE' });
          return this.getState();
        }
      }

      // 2. Native OTA Update Check (Expo Updates)
      const updates = ExpoUpdates;
      if (updates && updates.isEnabled && !__DEV__ && Platform.OS !== 'web') {
        const updateCheck = await updates.checkForUpdateAsync();
        if (updateCheck.isAvailable) {
          diagnosticLogger.logInfo(
            'AUTO_UPDATE',
            'New OTA update bundle discovered. Starting background download...'
          );
          this.updateState({ status: 'DOWNLOADING_OTA' });

          const fetchResult = await updates.fetchUpdateAsync();
          if (fetchResult.isNew) {
            diagnosticLogger.logInfo(
              'AUTO_UPDATE',
              'OTA bundle downloaded successfully.'
            );

            // Zero Lost Sets Guarantee: Check if user is in an active workout
            const inWorkout = this.isWorkoutActiveCheck
              ? this.isWorkoutActiveCheck()
              : false;

            if (inWorkout) {
              diagnosticLogger.logInfo(
                'AUTO_UPDATE',
                'User is currently in active workout. Deferring reload until workout ends.'
              );
              this.updateState({
                status: 'WAITING_FOR_WORKOUT',
                isStagedForWorkoutEnd: true,
              });
            } else {
              this.updateState({
                status: 'READY_TO_INSTALL',
                isStagedForWorkoutEnd: false,
              });
            }
            return this.getState();
          }
        }
      }

      // If we reached here without returning, check if an update is already staged
      if (this.state.isStagedForWorkoutEnd) {
        this.updateState({
          status: 'WAITING_FOR_WORKOUT',
          isStagedForWorkoutEnd: true,
        });
      } else {
        this.updateState({
          status: isManual ? 'UP_TO_DATE' : 'IDLE',
          isStagedForWorkoutEnd: false,
        });
      }
      return this.getState();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      diagnosticLogger.logError('AUTO_UPDATE', 'Error checking for updates', {
        error: msg,
      });
      this.updateState({
        status: 'ERROR',
        errorMessage: msg,
      });
      return this.getState();
    }
  }

  /**
   * Applies the downloaded update immediately.
   * If saveDraftFirst is true, saves active workout draft before reloading.
   */
  public async applyUpdate(saveDraftFirst = false): Promise<void> {
    try {
      if (saveDraftFirst && this.emergencyDraftSaveHandler) {
        diagnosticLogger.logInfo(
          'AUTO_UPDATE',
          'Executing emergency draft save before update reload...'
        );
        await this.emergencyDraftSaveHandler();
      }

      diagnosticLogger.logInfo(
        'AUTO_UPDATE',
        'Applying update and restarting runtime...'
      );

      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') {
          window.location.reload();
        }
        return;
      }

      const updates = ExpoUpdates;
      if (updates && updates.isEnabled) {
        await updates.reloadAsync();
        return;
      }

      // In local dev/fallback, reset to idle
      this.updateState({
        status: 'IDLE',
        isStagedForWorkoutEnd: false,
      });
    } catch (err) {
      diagnosticLogger.logError('AUTO_UPDATE', 'Failed to apply update', {
        error: String(err),
      });
      this.updateState({
        status: 'ERROR',
        errorMessage: String(err),
      });
    }
  }

  /**
   * Dismiss temporary banners / toasts.
   */
  public dismissBanner(): void {
    if (
      this.state.status === 'UP_TO_DATE' ||
      this.state.status === 'ERROR' ||
      this.state.status === 'BINARY_UPDATE_AVAILABLE'
    ) {
      this.updateState({ status: 'IDLE' });
    }
  }
}

export const autoUpdateManager = new AutoUpdateManagerService();

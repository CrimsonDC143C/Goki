import Constants from 'expo-constants';
import { Platform } from 'react-native';
import {
  Breadcrumb,
  BreadcrumbLevel,
  BreadcrumbRingBuffer,
  sanitizeDiagnosticData,
} from '@gymify/game-engine';
import { apiFetch } from '../api/apiClient';
import { AsyncStorage } from '../utils/asyncStorage';

export { Breadcrumb, BreadcrumbLevel, sanitizeDiagnosticData, BreadcrumbRingBuffer };

export interface BugReportSubmissionPayload {
  severity?: 'INFO' | 'WARNING' | 'ERROR' | 'FATAL';
  category?: 'UI_UX' | 'WORKOUT_SYNC' | 'WEARABLE_TELEMETRY' | 'COMBAT_DUNGEON' | 'CRASH_EXCEPTION' | 'OTHER';
  title: string;
  userDescription?: string | null;
  errorMessage?: string | null;
  stackTrace?: string | null;
  componentStack?: string | null;
  breadcrumbs?: Breadcrumb[];
  stateSnapshot?: Record<string, unknown>;
  deviceMetadata?: Record<string, unknown>;
  characterId?: string | null;
  userId?: string | null;
}

export interface CrashReportPayload {
  timestamp: number;
  errorMessage: string;
  stackTrace?: string;
  componentStack?: string;
  breadcrumbs: Breadcrumb[];
  stateSnapshot: Record<string, unknown>;
  deviceMetadata: Record<string, unknown>;
  source?: string;
}

export const CRASH_REPORT_STORAGE_KEY = '@gymify_pending_crash_report';
export const BUG_REPORT_OUTBOX_STORAGE_KEY = '@gymify_bug_report_outbox';

class DiagnosticLoggerService {
  private ringBuffer = new BreadcrumbRingBuffer(100);
  private stateProvider: (() => Record<string, unknown>) | null = null;
  private isCapturingConsole = false;
  private isGlobalHandlerAttached = false;
  private isFlushing = false;

  constructor() {
    this.attachConsoleInterceptors();
    this.attachGlobalExceptionCatchers();
  }

  /**
   * Register a state provider hook from GameContext/App so crash snapshots include
   * active screen, hybrid FSM phase, workout progress, and queue sizes.
   */
  public setStateProvider(provider: () => Record<string, unknown>): void {
    this.stateProvider = provider;
  }

  /**
   * Adds an item to the rolling ring buffer, capping at 100 entries.
   */
  public addBreadcrumb(
    level: BreadcrumbLevel,
    category: string,
    message: string,
    data?: Record<string, unknown>
  ): void {
    this.ringBuffer.addBreadcrumb(level, category, message, data);
  }

  public logAction(category: string, message: string, data?: Record<string, unknown>): void {
    this.addBreadcrumb('action', category, message, data);
  }

  public logInfo(category: string, message: string, data?: Record<string, unknown>): void {
    this.addBreadcrumb('info', category, message, data);
  }

  public logWarn(category: string, message: string, data?: Record<string, unknown>): void {
    this.addBreadcrumb('warn', category, message, data);
  }

  public logError(category: string, message: string, data?: Record<string, unknown>): void {
    this.addBreadcrumb('error', category, message, data);
  }

  public getBreadcrumbs(): Breadcrumb[] {
    return this.ringBuffer.getAll();
  }

  public clearBreadcrumbs(): void {
    this.ringBuffer.clear();
  }

  public getStateSnapshot(): Record<string, unknown> {
    try {
      if (this.stateProvider) {
        return sanitizeDiagnosticData(this.stateProvider()) as Record<string, unknown>;
      }
    } catch {
      // Fallback
    }
    return {
      timestamp: Date.now(),
      platform: Platform.OS,
    };
  }

  public getDeviceMetadata(): Record<string, unknown> {
    return {
      platform: Platform.OS,
      osVersion: String(Platform.Version),
      isWeb: Platform.OS === 'web',
      appVersion: Constants.expoConfig?.version ?? '0.1.0',
      sessionId: Constants.sessionId ?? 'session_unknown',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'native',
    };
  }

  /**
   * Intercepts console.warn and console.error with a recursion safeguard
   * so warnings & errors are tracked in the ring-buffer automatically.
   */
  private attachConsoleInterceptors(): void {
    const originalWarn = console.warn;
    const originalError = console.error;

    console.warn = (...args: unknown[]) => {
      try {
        if (!this.isCapturingConsole) {
          this.isCapturingConsole = true;
          const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
          this.logWarn('console.warn', msg.slice(0, 500));
        }
      } catch {
        // Prevent interceptor exceptions
      } finally {
        this.isCapturingConsole = false;
      }
      originalWarn.apply(console, args);
    };

    console.error = (...args: unknown[]) => {
      try {
        if (!this.isCapturingConsole) {
          this.isCapturingConsole = true;
          const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
          this.logError('console.error', msg.slice(0, 500));
        }
      } catch {
        // Prevent interceptor exceptions
      } finally {
        this.isCapturingConsole = false;
      }
      originalError.apply(console, args);
    };
  }

  /**
   * Hooks into React Native's ErrorUtils and Web window error/unhandledrejection handlers.
   */
  public attachGlobalExceptionCatchers(): void {
    if (this.isGlobalHandlerAttached) return;
    this.isGlobalHandlerAttached = true;

    // React Native ErrorUtils
    const globalObj = globalThis as unknown as {
      ErrorUtils?: {
        getGlobalHandler?: () => (error: Error, isFatal?: boolean) => void;
        setGlobalHandler?: (handler: (error: Error, isFatal?: boolean) => void) => void;
      };
    };

    if (globalObj.ErrorUtils?.setGlobalHandler) {
      const prevHandler = globalObj.ErrorUtils.getGlobalHandler?.();
      globalObj.ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
        void this.persistCrashReportImmediately({
          timestamp: Date.now(),
          errorMessage: error?.message || 'Unknown Native Exception',
          stackTrace: error?.stack,
          breadcrumbs: this.getBreadcrumbs(),
          stateSnapshot: this.getStateSnapshot(),
          deviceMetadata: this.getDeviceMetadata(),
          source: isFatal ? 'ErrorUtils.fatal' : 'ErrorUtils.nonFatal',
        });
        if (prevHandler) {
          prevHandler(error, isFatal);
        }
      });
    }

    // Web window error and unhandled rejection listeners
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('error', (event) => {
        const error = event.error as Error | undefined;
        void this.persistCrashReportImmediately({
          timestamp: Date.now(),
          errorMessage: error?.message || event.message || 'Window Global Error',
          stackTrace: error?.stack,
          breadcrumbs: this.getBreadcrumbs(),
          stateSnapshot: this.getStateSnapshot(),
          deviceMetadata: this.getDeviceMetadata(),
          source: 'window.onerror',
        });
      });

      window.addEventListener('unhandledrejection', (event) => {
        const reason = event.reason;
        const msg =
          reason instanceof Error
            ? reason.message
            : typeof reason === 'string'
            ? reason
            : 'Unhandled Promise Rejection';
        const stack = reason instanceof Error ? reason.stack : undefined;
        void this.persistCrashReportImmediately({
          timestamp: Date.now(),
          errorMessage: msg,
          stackTrace: stack,
          breadcrumbs: this.getBreadcrumbs(),
          stateSnapshot: this.getStateSnapshot(),
          deviceMetadata: this.getDeviceMetadata(),
          source: 'window.unhandledrejection',
        });
      });
    }
  }

  /**
   * Persists a crash payload immediately to storage so it survives application termination.
   */
  public async persistCrashReportImmediately(payload: CrashReportPayload): Promise<void> {
    try {
      await AsyncStorage.setItem(CRASH_REPORT_STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
      console.warn('Failed to persist crash report immediately:', err);
    }
  }

  /**
   * Retrieves any pending crash report stored from a prior fatal crash.
   */
  public async getPendingCrashReport(): Promise<CrashReportPayload | null> {
    try {
      const raw = await AsyncStorage.getItem(CRASH_REPORT_STORAGE_KEY);
      if (raw) {
        return JSON.parse(raw) as CrashReportPayload;
      }
    } catch {
      // Ignore parse errors
    }
    return null;
  }

  /**
   * Clears any pending crash report after transmission or user dismissal.
   */
  public async clearPendingCrashReport(): Promise<void> {
    try {
      await AsyncStorage.removeItem(CRASH_REPORT_STORAGE_KEY);
    } catch {
      // Ignore
    }
  }

  /**
   * Submits a diagnostic bug report. If offline or the network call fails,
   * it queues the report into AsyncStorage (@gymify_bug_report_outbox)
   * to be flushed automatically when connectivity is restored.
   */
  public async submitDiagnosticReport(
    payload: BugReportSubmissionPayload
  ): Promise<{ ok: boolean; queuedLocally?: boolean; id?: string; error?: string }> {
    const fullPayload: BugReportSubmissionPayload = {
      severity: payload.severity ?? 'ERROR',
      category: payload.category ?? 'OTHER',
      title: payload.title,
      userDescription: payload.userDescription ?? null,
      errorMessage: payload.errorMessage ?? null,
      stackTrace: payload.stackTrace ?? null,
      componentStack: payload.componentStack ?? null,
      breadcrumbs: payload.breadcrumbs ?? this.getBreadcrumbs(),
      stateSnapshot: payload.stateSnapshot ?? this.getStateSnapshot(),
      deviceMetadata: payload.deviceMetadata ?? this.getDeviceMetadata(),
      characterId: payload.characterId ?? null,
      userId: payload.userId ?? null,
    };

    try {
      const response = await apiFetch('/api/diagnostics/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fullPayload),
      }, 4000);

      if (response.ok) {
        const json = await response.json();
        return { ok: true, id: json.id };
      }

      // 4xx client errors (validation failures) shouldn't loop indefinitely in outbox
      if (response.status >= 400 && response.status < 500) {
        const errJson = await response.json().catch(() => ({}));
        return { ok: false, error: errJson.error || 'Diagnostic report validation failed' };
      }
    } catch {
      // Network drop, timeout, or server unavailable -> Enqueue locally
    }

    // Queue in local outbox
    await this.enqueueOutboxReport(fullPayload);
    return { ok: true, queuedLocally: true };
  }

  private async enqueueOutboxReport(payload: BugReportSubmissionPayload): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(BUG_REPORT_OUTBOX_STORAGE_KEY);
      const queue: BugReportSubmissionPayload[] = raw ? JSON.parse(raw) : [];
      queue.push(payload);
      // Cap outbox queue at 50 to avoid unbounded storage bloat
      if (queue.length > 50) {
        queue.shift();
      }
      await AsyncStorage.setItem(BUG_REPORT_OUTBOX_STORAGE_KEY, JSON.stringify(queue));
    } catch (err) {
      console.warn('Failed to enqueue bug report to offline outbox:', err);
    }
  }

  /**
   * Flushes any queued offline bug reports when connectivity is active.
   */
  public async flushBugReportOutbox(): Promise<{ flushed: number; remaining: number }> {
    if (this.isFlushing) {
      return { flushed: 0, remaining: 0 };
    }
    this.isFlushing = true;

    try {
      const raw = await AsyncStorage.getItem(BUG_REPORT_OUTBOX_STORAGE_KEY);
      if (!raw) {
        this.isFlushing = false;
        return { flushed: 0, remaining: 0 };
      }

      const queue: BugReportSubmissionPayload[] = JSON.parse(raw);
      if (!Array.isArray(queue) || queue.length === 0) {
        this.isFlushing = false;
        return { flushed: 0, remaining: 0 };
      }

      const remaining: BugReportSubmissionPayload[] = [];
      let flushedCount = 0;

      for (const item of queue) {
        try {
          const res = await apiFetch('/api/diagnostics/report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item),
          }, 4000);

          if (res.ok) {
            flushedCount++;
          } else if (res.status >= 400 && res.status < 500) {
            // Drop invalid requests to prevent blocking the queue
          } else {
            remaining.push(item);
          }
        } catch {
          // Still offline or timeout
          remaining.push(item);
        }
      }

      if (remaining.length > 0) {
        await AsyncStorage.setItem(BUG_REPORT_OUTBOX_STORAGE_KEY, JSON.stringify(remaining));
      } else {
        await AsyncStorage.removeItem(BUG_REPORT_OUTBOX_STORAGE_KEY);
      }

      this.isFlushing = false;
      return { flushed: flushedCount, remaining: remaining.length };
    } catch {
      this.isFlushing = false;
      return { flushed: 0, remaining: 0 };
    }
  }
}

export const diagnosticLogger = new DiagnosticLoggerService();
export default diagnosticLogger;

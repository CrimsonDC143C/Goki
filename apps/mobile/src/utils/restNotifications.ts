import {
  ensureRestNotificationPermission,
  scheduleStaminaRechargedNotification,
  cancelStaminaRechargedNotification,
  STAMINA_REST_NOTIFICATION_ID,
} from './restNotificationScheduler';

let lastScheduledTargetEndMs: number | null = null;

export async function requestNotificationPermissions(): Promise<boolean> {
  const perm = await ensureRestNotificationPermission();
  return perm === 'granted';
}

/**
 * Universal rest timer notification scheduler.
 * Atomically schedules (or replaces) the rest timer notification using a fixed OS identifier,
 * preventing any duplicate or overlapping notifications when adjusting time or switching sets.
 */
export async function scheduleRestTimerNotification(
  secondsRemaining: number,
  title: string,
  body: string,
  targetEndTimeMs?: number
): Promise<string | null> {
  const exactSec =
    targetEndTimeMs !== undefined
      ? Math.max(1, Math.round((targetEndTimeMs - Date.now()) / 1000))
      : secondsRemaining;

  if (exactSec <= 0 || (targetEndTimeMs !== undefined && targetEndTimeMs <= Date.now())) {
    lastScheduledTargetEndMs = null;
    await cancelStaminaRechargedNotification();
    return null;
  }

  if (
    targetEndTimeMs !== undefined &&
    lastScheduledTargetEndMs !== null &&
    Math.abs(lastScheduledTargetEndMs - targetEndTimeMs) < 250
  ) {
    return STAMINA_REST_NOTIFICATION_ID;
  }

  const endsAtMs =
    targetEndTimeMs !== undefined
      ? targetEndTimeMs
      : Date.now() + Math.max(1, Math.round(exactSec)) * 1000;

  const scheduled = await scheduleStaminaRechargedNotification({
    endsAtMs,
    title,
    body,
  });

  if (scheduled) {
    lastScheduledTargetEndMs = endsAtMs;
    return STAMINA_REST_NOTIFICATION_ID;
  }
  return null;
}

/**
 * Cancels the pending rest timer notification from the OS notification manager.
 */
export async function cancelRestTimerNotification(): Promise<void> {
  lastScheduledTargetEndMs = null;
  await cancelStaminaRechargedNotification();
}

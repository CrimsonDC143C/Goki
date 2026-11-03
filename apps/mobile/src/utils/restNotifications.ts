import {
  ensureRestNotificationPermission,
  scheduleStaminaRechargedNotification,
  cancelStaminaRechargedNotification,
  STAMINA_REST_NOTIFICATION_ID,
} from './restNotificationScheduler';

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
  body: string
): Promise<string | null> {
  if (secondsRemaining <= 0) {
    await cancelStaminaRechargedNotification();
    return null;
  }

  const endsAtMs = Date.now() + Math.max(1, Math.round(secondsRemaining)) * 1000;
  const scheduled = await scheduleStaminaRechargedNotification({
    endsAtMs,
    title,
    body,
  });

  return scheduled ? STAMINA_REST_NOTIFICATION_ID : null;
}

/**
 * Cancels the pending rest timer notification from the OS notification manager.
 */
export async function cancelRestTimerNotification(): Promise<void> {
  await cancelStaminaRechargedNotification();
}

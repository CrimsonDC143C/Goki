import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { requestNotificationPermissions } from './restNotifications';

let activeGatheringNotificationId: string | null = null;

/**
 * Schedules a local push notification for when a custom Gathering / Crafting task completes.
 */
export async function scheduleGatheringTargetNotification(params: {
  secondsRemaining: number;
  nodeName: string;
  targetYieldAmount?: number;
  itemName?: string;
}): Promise<string | null> {
  const { secondsRemaining, nodeName, targetYieldAmount, itemName } = params;

  await cancelGatheringTargetNotification();
  if (secondsRemaining <= 0) return null;

  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return null;

  const title = `⛏️ Goal Reached: ${nodeName}`;
  const body = targetYieldAmount && itemName
    ? `Completed gathering target of ${targetYieldAmount}x ${itemName}! Your adventurer is ready.`
    : `Gathering assignment at ${nodeName} is complete! All resources safely deposited.`;

  if (Platform.OS === 'web') {
    try {
      const g = globalThis as unknown as {
        Notification?: new (title: string, options?: { body: string }) => unknown;
        setTimeout: (fn: () => void, ms: number) => number;
      };
      if (
        g.Notification &&
        (globalThis as unknown as { Notification?: { permission: string } }).Notification?.permission === 'granted'
      ) {
        const timeoutId = g.setTimeout(() => {
          try {
            new g.Notification!(title, { body });
          } catch {
            // Ignore web notification failure
          }
        }, secondsRemaining * 1000);
        activeGatheringNotificationId = `web_gather_${timeoutId}`;
        return activeGatheringNotificationId;
      }
    } catch {
      // Safe fallback
    }
    return null;
  }

  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: Math.max(1, Math.round(secondsRemaining)),
      },
    });
    activeGatheringNotificationId = id;
    return id;
  } catch {
    return null;
  }
}

/**
 * Cancels any pending gathering completion notification.
 */
export async function cancelGatheringTargetNotification(): Promise<void> {
  if (!activeGatheringNotificationId) return;

  if (Platform.OS === 'web') {
    if (activeGatheringNotificationId.startsWith('web_gather_')) {
      const timerId = parseInt(activeGatheringNotificationId.replace('web_gather_', ''), 10);
      if (!isNaN(timerId)) {
        clearTimeout(timerId);
      }
    }
    activeGatheringNotificationId = null;
    return;
  }

  try {
    await Notifications.cancelScheduledNotificationAsync(activeGatheringNotificationId);
  } catch {
    // Ignore cancellation error
  }
  activeGatheringNotificationId = null;
}

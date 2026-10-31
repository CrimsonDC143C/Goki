import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

// Configure notification behavior for when app is in foreground
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
      priority: Notifications.AndroidNotificationPriority.HIGH,
    }),
  });
} catch {
  // Safe fallback if notifications are unavailable
}

let activeNotificationId: string | null = null;

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') {
    try {
      const g = globalThis as unknown as {
        Notification?: {
          permission: string;
          requestPermission: () => Promise<string>;
        };
      };
      if (g.Notification && g.Notification.permission !== 'granted') {
        const status = await g.Notification.requestPermission();
        return status === 'granted';
      }
      return g.Notification?.permission === 'granted';
    } catch {
      return false;
    }
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    return finalStatus === 'granted';
  } catch {
    return false;
  }
}

export async function scheduleRestTimerNotification(
  secondsRemaining: number,
  title: string,
  body: string
): Promise<string | null> {
  await cancelRestTimerNotification();
  if (secondsRemaining <= 0) return null;

  if (Platform.OS === 'web') {
    // Web desktop notification scheduled via window timeout
    try {
      const g = globalThis as unknown as {
        Notification?: new (title: string, options?: { body: string; icon?: string }) => unknown;
        setTimeout: (fn: () => void, ms: number) => number;
      };
      if (g.Notification && (globalThis as unknown as { Notification?: { permission: string } }).Notification?.permission === 'granted') {
        const timeoutId = g.setTimeout(() => {
          try {
            new g.Notification!(title, { body });
          } catch {
            // Ignore web notification failure
          }
        }, secondsRemaining * 1000);
        activeNotificationId = `web_timer_${timeoutId}`;
        return activeNotificationId;
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
    activeNotificationId = id;
    return id;
  } catch {
    return null;
  }
}

export async function cancelRestTimerNotification(): Promise<void> {
  if (!activeNotificationId) return;

  if (activeNotificationId.startsWith('web_timer_')) {
    try {
      const timerId = parseInt(activeNotificationId.replace('web_timer_', ''), 10);
      if (!isNaN(timerId)) {
        clearTimeout(timerId);
      }
    } catch {
      // Ignore
    }
    activeNotificationId = null;
    return;
  }

  try {
    await Notifications.cancelScheduledNotificationAsync(activeNotificationId);
  } catch {
    // Ignore error
  } finally {
    activeNotificationId = null;
  }
}

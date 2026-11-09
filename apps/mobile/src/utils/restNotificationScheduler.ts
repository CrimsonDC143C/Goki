import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';
import { NextSetPreview } from '@goki/game-engine';

export const STAMINA_REST_CHANNEL_ID = 'stamina-rest-channel';
export const STAMINA_REST_NOTIFICATION_ID = 'goki-stamina-recharged';

export type RestNotificationPermissionState =
  | 'granted'
  | 'denied'
  | 'undetermined'
  | 'unsupported';

let handlerInitialized = false;
let webFallbackTimeout: ReturnType<typeof setTimeout> | null = null;

interface WebNotificationGlobal {
  document?: {
    visibilityState?: string;
  };
  Notification?: {
    permission: 'granted' | 'denied' | 'default';
    requestPermission?: () => Promise<'granted' | 'denied' | 'default'>;
    new (title: string, options?: { body?: string; tag?: string; silent?: boolean }): unknown;
  };
}

/**
 * Configures the OS notification presentation policy and Android high-priority channel.
 * - Suppresses duplicate OS drop-down banners while the app is actively open in the foreground
 *   (where the SVG Stamina Ring + haptic pulse already fire inline).
 * - Delivers full lockscreen/background banner, sound, and vibration when backgrounded or locked.
 */
export async function initializeRestNotifications(): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }

  if (!handlerInitialized) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        priority: Notifications.AndroidNotificationPriority.MAX,
      }),
    });
    handlerInitialized = true;
  }

  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync(STAMINA_REST_CHANNEL_ID, {
        name: 'Stamina Rest Timer',
        description:
          'Fires the Stamina Recharged cue when intra-workout rest finishes in the background.',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 80, 100, 80, 100, 120],
        enableVibrate: true,
        enableLights: true,
        lightColor: '#26A69A',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: false,
        showBadge: false,
        sound: 'default',
      });
    } catch {
      // Gracefully ignore in unsupported simulator environments
    }
  }
}

/**
 * Queries or requests local notification permission when crossing the workout threshold
 * (never on cold boot, preserving pre-workout low-friction UX).
 */
export async function ensureRestNotificationPermission(): Promise<RestNotificationPermissionState> {
  if (Platform.OS === 'web') {
    const g = globalThis as unknown as WebNotificationGlobal;
    if (!g.Notification) return 'unsupported';
    if (g.Notification.permission === 'granted') return 'granted';
    if (g.Notification.permission === 'denied') return 'denied';
    try {
      const res = await g.Notification.requestPermission?.();
      return res === 'granted' ? 'granted' : res === 'denied' ? 'denied' : 'undetermined';
    } catch {
      return 'undetermined';
    }
  }

  try {
    await initializeRestNotifications();
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) {
      return 'granted';
    }
    if (!existing.canAskAgain) {
      return 'denied';
    }
    const requested = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowSound: true,
        allowBadge: false,
      },
    });
    return requested.granted ? 'granted' : 'denied';
  } catch {
    return 'unsupported';
  }
}

function clearWebFallbackTimer(): void {
  if (webFallbackTimeout !== null) {
    clearTimeout(webFallbackTimeout);
    webFallbackTimeout = null;
  }
}

/**
 * Schedules (or atomically replaces) the local Stamina Recharged notification for `endsAtMs`.
 * Uses a fixed notification identifier (`goki-stamina-recharged`) so rapid +15s/-15s/preset
 * adjustments overwrite cleanly without stacking duplicate alarms.
 */
export async function scheduleStaminaRechargedNotification(params: {
  endsAtMs: number;
  nextSetPreview?: NextSetPreview | null;
  title?: string;
  body?: string;
}): Promise<boolean> {
  clearWebFallbackTimer();

  const delayMs = params.endsAtMs - Date.now();
  if (delayMs <= 500) {
    await cancelStaminaRechargedNotification();
    return false;
  }

  const title = params.title ?? '⚡ Stamina Recharged — Next Set Ready!';
  const body =
    params.body ??
    (params.nextSetPreview
      ? `Set #${params.nextSetPreview.setNumber}: ${params.nextSetPreview.exerciseName} (${params.nextSetPreview.suggestedWeightKg}kg × ${params.nextSetPreview.suggestedReps}) — Return to Dungeon Focus.`
      : 'Your stamina ring is 100% restored. Return to Dungeon Focus for your next set!');

  if (Platform.OS === 'web') {
    const g = globalThis as unknown as WebNotificationGlobal;
    if (!g.Notification || g.Notification.permission !== 'granted') {
      return false;
    }
    const Ctor = g.Notification;
    webFallbackTimeout = setTimeout(() => {
      webFallbackTimeout = null;
      if (g.document?.visibilityState === 'hidden') {
        try {
          new Ctor(title, {
            body,
            tag: STAMINA_REST_NOTIFICATION_ID,
          });
        } catch {
          // Ignore browser notification errors
        }
      }
    }, delayMs);
    return true;
  }

  try {
    const perm = await ensureRestNotificationPermission();
    if (perm !== 'granted') {
      return false;
    }

    const triggerDate = new Date(Math.max(Date.now() + 1000, params.endsAtMs));

    await Notifications.scheduleNotificationAsync({
      identifier: STAMINA_REST_NOTIFICATION_ID,
      content: {
        title,
        body,
        sound: 'default',
        color: '#26A69A',
        autoDismiss: true,
        interruptionLevel: 'timeSensitive',
        data: {
          type: 'STAMINA_RECHARGED',
          endsAtMs: params.endsAtMs,
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
        channelId: STAMINA_REST_CHANNEL_ID,
      },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Cancels any pending scheduled Stamina Recharged local notification (e.g., on Skip Rest,
 * Finish Workout, or Abandon Session).
 */
export async function cancelStaminaRechargedNotification(): Promise<void> {
  clearWebFallbackTimer();
  if (Platform.OS === 'web') {
    return;
  }
  try {
    await Notifications.cancelScheduledNotificationAsync(STAMINA_REST_NOTIFICATION_ID);
  } catch {
    // Safe no-op if not currently scheduled
  }
}

/**
 * Dismisses any already-delivered Stamina Recharged banner from the OS notification tray
 * when the user unlocks their phone and returns to the active workout screen.
 */
export async function dismissDeliveredStaminaNotifications(): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }
  try {
    await Notifications.dismissNotificationAsync(STAMINA_REST_NOTIFICATION_ID);
  } catch {
    // Safe no-op if already dismissed
  }
}

/**
 * Subscribes to user taps on the lockscreen/background Stamina Recharged notification.
 */
export function subscribeToStaminaNotificationTap(onTap: () => void): () => void {
  if (Platform.OS === 'web') {
    return () => {};
  }
  try {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as
        | { type?: string }
        | undefined;
      if (
        response.notification.request.identifier === STAMINA_REST_NOTIFICATION_ID ||
        data?.type === 'STAMINA_RECHARGED'
      ) {
        onTap();
      }
    });
    return () => sub.remove();
  } catch {
    return () => {};
  }
}

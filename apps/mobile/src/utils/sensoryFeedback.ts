import { Platform, Vibration } from 'react-native';
import * as Haptics from 'expo-haptics';
import { SensoryCueType } from '@gymify/game-engine';
import { audioManager, SoundEffectKey } from '../services/AudioManager';

export type ExtendedSensoryCue =
  | SensoryCueType
  | 'REST_TIMER_EXPIRED'
  | 'SUPERSET_TRANSITION_TICK'
  | 'DROP_SET_IMMEDIATE_TICK'
  | 'WORKOUT_PRESET_LOADED';

const CUE_TO_SFX_MAP: Record<ExtendedSensoryCue, SoundEffectKey> = {
  GUILD_THRESHOLD_PULSE: 'stamina-full',
  OPEN_WORLD_THRESHOLD_PULSE: 'micro-tick',
  SET_MICRO_REWARD_TICK: 'micro-tick',
  STAMINA_RECHARGED_PULSE: 'stamina-full',
  DUNGEON_CLEARED_FANFARE: 'level-up',
  CHEST_OPEN_REVEAL: 'chest-open',
  REST_TIMER_EXPIRED: 'timer-bell',
  SUPERSET_TRANSITION_TICK: 'hero-attack',
  DROP_SET_IMMEDIATE_TICK: 'critical-hit',
  WORKOUT_PRESET_LOADED: 'anvil-strike',
};

/**
 * Low-latency (<15ms) cross-platform haptic & audio feedback adapter.
 * - Native (iOS/Android): Crisp somatic `Haptics` and `Vibration` pulses combined with `AudioManager` SFX.
 * - Web (Expo Web): Pure harmonic synthesized audio via `AudioManager` respecting gym silence preferences.
 */
export function triggerSensoryCue(cue: ExtendedSensoryCue): void {
  // 1. Somatic Haptic Feedback
  if (Platform.OS !== 'web') {
    try {
      switch (cue) {
        case 'GUILD_THRESHOLD_PULSE':
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          Vibration.vibrate([0, 30, 50, 45]);
          break;
        case 'OPEN_WORLD_THRESHOLD_PULSE':
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          Vibration.vibrate([0, 35]);
          break;
        case 'SET_MICRO_REWARD_TICK':
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          Vibration.vibrate(22);
          break;
        case 'STAMINA_RECHARGED_PULSE':
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          Vibration.vibrate([0, 35, 65, 35]);
          break;
        case 'DUNGEON_CLEARED_FANFARE':
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          Vibration.vibrate([0, 40, 55, 50, 55, 70]);
          break;
        case 'CHEST_OPEN_REVEAL':
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          Vibration.vibrate([0, 30, 45, 65]);
          break;
        case 'REST_TIMER_EXPIRED':
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          Vibration.vibrate([0, 80, 100, 80, 100, 120]);
          break;
        case 'SUPERSET_TRANSITION_TICK':
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          Vibration.vibrate([0, 30, 40, 30]);
          break;
        case 'DROP_SET_IMMEDIATE_TICK':
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
          Vibration.vibrate([0, 45, 30, 45]);
          break;
        case 'WORKOUT_PRESET_LOADED':
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          Vibration.vibrate(25);
          break;
      }
    } catch {
      // Safe fallback on hardware without vibrators
    }
  }

  // 2. Coordinated Audio SFX Playback via AudioManager
  const sfxKey = CUE_TO_SFX_MAP[cue];
  if (sfxKey) {
    void audioManager.playSound(sfxKey);
  }
}

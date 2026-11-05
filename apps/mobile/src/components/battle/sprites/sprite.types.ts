import type { ImageSourcePropType, StyleProp, ViewStyle } from 'react-native';

export type AnimationState = 'idle' | 'walk' | 'attack' | 'hurt' | 'death';
export type SpriteAnimState = AnimationState;

export interface SpriteAnimationClip {
  source: ImageSourcePropType;
  frameCount: number;
  frameDurationMs: number;
  loop: boolean;
}

export interface SpriteSheetConfig {
  id: string;
  displayName: string;
  frameWidth: 100;
  frameHeight: 100;
  /** Opaque boot contact row within the 100x100 cell (e.g. 57..59 in Zerie's Tiny RPG Pack). */
  footRow: number;
  /** 0-indexed frame where weapon slash or projectile release connects */
  attackImpactFrame?: number;
  clips: Record<AnimationState, SpriteAnimationClip>;
}

export type SpriteRigConfig = SpriteSheetConfig;

export interface SpriteAnimatorProps {
  config?: SpriteRigConfig;
  rig?: string;
  state: SpriteAnimState;
  actionTriggerKey?: number;
  scale?: number;
  size?: number;
  flipHorizontal?: boolean;
  flipX?: boolean;
  playbackRate?: number;
  hitFlash?: boolean;
  tintColor?: string;
  paused?: boolean;
  onAnimationComplete?: (completedState: SpriteAnimState, completedActionKey?: number) => void;
  style?: StyleProp<ViewStyle>;
}

import type { ImageSourcePropType, StyleProp, ViewStyle } from 'react-native';

export type AnimationState = 'idle' | 'walk' | 'attack' | 'hurt' | 'death';
export type SpriteAnimState = AnimationState;

export interface SpriteAnimationClip {
  source: ImageSourcePropType;
  frameCount: number;
  frameDurationMs: number;
  loop: boolean;
}

export interface SpritePortraitCrop {
  /** Multiplier applied on top of size/frameWidth when rendering in portrait avatar mode (default ~2.15) */
  zoom: number;
  /** Horizontal shift in 100x100 source pixels (positive shifts sprite right) */
  offsetX?: number;
  /** Vertical shift in 100x100 source pixels (positive shifts sprite down so head/torso is centered) */
  offsetY?: number;
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
  /** Optional focal crop for compact portrait frames (48x48 / 56x56) */
  portraitCrop?: SpritePortraitCrop;
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

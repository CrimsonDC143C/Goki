import type { ImageSourcePropType } from 'react-native';

export type ScrollMode = 'marching' | 'combat' | 'paused';

export interface ParallaxLayerConfig {
  id: string;
  source: ImageSourcePropType;
  nativeWidth: number;
  nativeHeight: number;
  speedMultiplier: number;
  /** Multiplier applied to baseSpeed during 'combat' atmospheric micro-drift (defaults to 0 for ground, subtle >0 for sky/clouds). */
  combatDriftMultiplier?: number;
  layerHeight?: number;
  verticalOffset?: number;
  zIndex?: number;
  opacity?: number;
  /** Whether adjacent tiles should overlap by 1px to prevent GPU bilinear sub-pixel seams on opaque horizon layers. */
  seamlessOverlapPx?: number;
}

export interface ParallaxArenaConfig {
  id: string;
  name: string;
  worldWidth: number;
  worldHeight: number;
  groundBaselineBottom: number;
  baseSpeed: number;
  scrollMode: ScrollMode;
  playbackRate?: number;
  layers: readonly ParallaxLayerConfig[];
}

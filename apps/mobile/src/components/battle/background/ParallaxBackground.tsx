import React from 'react';
import type { ParallaxArenaConfig, ParallaxLayerConfig, ScrollMode } from './parallax.types';
import { ParallaxLayer } from './ParallaxLayer';

import skyImg from '../../../../assets/battle/backgrounds/whitewood/sky.png';
import cloudImg from '../../../../assets/battle/backgrounds/whitewood/cloud.png';
import mountainsImg from '../../../../assets/battle/backgrounds/whitewood/mountains.png';
import hillBgImg from '../../../../assets/battle/backgrounds/whitewood/hill_background.png';
import hillMidImg from '../../../../assets/battle/backgrounds/whitewood/hill_midground.png';
import groundWithFoliageImg from '../../../../assets/battle/backgrounds/whitewood/ground_with_foliage.png';

export const WORLD_SINK_PX = -96;
export const WHITEWOOD_WORLD_SCALE = 0.28;
export const WHITEWOOD_GROUND_BASELINE_BOTTOM = 42;

export const WHITEWOOD_ARENA_PRESET: ParallaxArenaConfig = {
  id: 'whitewood_forest',
  name: 'Whitewood Forest',
  worldWidth: 2560,
  worldHeight: 1440,
  groundBaselineBottom: WHITEWOOD_GROUND_BASELINE_BOTTOM,
  baseSpeed: 82,
  scrollMode: 'marching',
  layers: [
    {
      id: 'sky',
      source: skyImg,
      nativeWidth: 2560,
      nativeHeight: 1440,
      speedMultiplier: 0.05,
      combatDriftMultiplier: 0.015,
      verticalOffset: WORLD_SINK_PX,
      zIndex: 0,
      seamlessOverlapPx: 1,
    },
    {
      id: 'clouds',
      source: cloudImg,
      nativeWidth: 1612,
      nativeHeight: 671,
      speedMultiplier: 0.12,
      combatDriftMultiplier: 0.045,
      verticalOffset: 148,
      zIndex: 0,
      opacity: 0.92,
      seamlessOverlapPx: 0,
    },
    {
      id: 'mountains',
      source: mountainsImg,
      nativeWidth: 2560,
      nativeHeight: 1281,
      speedMultiplier: 0.2,
      combatDriftMultiplier: 0.008,
      verticalOffset: WORLD_SINK_PX,
      zIndex: 0,
      seamlessOverlapPx: 1,
    },
    {
      id: 'hill_background',
      source: hillBgImg,
      nativeWidth: 2560,
      nativeHeight: 888,
      speedMultiplier: 0.38,
      combatDriftMultiplier: 0.004,
      verticalOffset: WORLD_SINK_PX,
      zIndex: 0,
      seamlessOverlapPx: 1,
    },
    {
      id: 'hill_midground',
      source: hillMidImg,
      nativeWidth: 2560,
      nativeHeight: 642,
      speedMultiplier: 0.58,
      combatDriftMultiplier: 0,
      verticalOffset: WORLD_SINK_PX,
      zIndex: 0,
      seamlessOverlapPx: 1,
    },
    {
      id: 'ground',
      source: groundWithFoliageImg,
      nativeWidth: 2560,
      nativeHeight: 619,
      speedMultiplier: 1.0,
      combatDriftMultiplier: 0,
      verticalOffset: WORLD_SINK_PX,
      zIndex: 5,
      seamlessOverlapPx: 1,
    },
  ],
};

export interface ParallaxBackgroundProps {
  arenaConfig?: ParallaxArenaConfig;
  viewportWidth: number;
  worldScale?: number;
  scrollMode: ScrollMode;
  playbackRate?: number;
}

/**
 * ParallaxBackground renders all parallax layers as a React Fragment so
 * Z-0 distant sky/mountain layers, Z-5 ground layers, Z-10 characters, and Z-20 HUD
 * stack correctly in the parent arena stage context without being trapped in an isolated stacking context.
 */
export const ParallaxBackground: React.FC<ParallaxBackgroundProps> = ({
  arenaConfig = WHITEWOOD_ARENA_PRESET,
  viewportWidth,
  worldScale = WHITEWOOD_WORLD_SCALE,
  scrollMode,
  playbackRate = 1,
}) => {
  return (
    <>
      {arenaConfig.layers.map((layer: ParallaxLayerConfig) => (
        <ParallaxLayer
          key={layer.id}
          layer={layer}
          viewportWidth={viewportWidth}
          worldScale={worldScale}
          baseSpeed={arenaConfig.baseSpeed}
          scrollMode={scrollMode}
          playbackRate={playbackRate}
        />
      ))}
    </>
  );
};

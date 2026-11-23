import React from 'react';
import {
  BATTLE_ARENA_ART_REGISTRY,
  inferBattleArenaThemeId,
  type BattleArenaParallaxSlots,
} from '../../../assets/rpgArtRegistry';
import type { ParallaxArenaConfig, ParallaxLayerConfig, ScrollMode } from './parallax.types';
import { ParallaxLayer } from './ParallaxLayer';

export const WHITEWOOD_WORLD_SCALE = 0.28;
export const WHITEWOOD_GROUND_BASELINE_BOTTOM = 42;
export const COMPILED_ARENA_WIDTH = 2560;
export const COMPILED_ARENA_HEIGHT = 1080;

function isCompleteArenaSlot(slot?: BattleArenaParallaxSlots | null): slot is BattleArenaParallaxSlots & {
  sky: NonNullable<BattleArenaParallaxSlots['sky']>;
  cloudsOrMist: NonNullable<BattleArenaParallaxSlots['cloudsOrMist']>;
  mountainsOrWalls: NonNullable<BattleArenaParallaxSlots['mountainsOrWalls']>;
  hillBackground: NonNullable<BattleArenaParallaxSlots['hillBackground']>;
  hillMidground: NonNullable<BattleArenaParallaxSlots['hillMidground']>;
  groundForeground: NonNullable<BattleArenaParallaxSlots['groundForeground']>;
} {
  return Boolean(
    slot &&
      slot.sky &&
      slot.cloudsOrMist &&
      slot.mountainsOrWalls &&
      slot.hillBackground &&
      slot.hillMidground &&
      slot.groundForeground
  );
}

function buildCompiledArenaPreset(slot: BattleArenaParallaxSlots): ParallaxArenaConfig {
  if (!isCompleteArenaSlot(slot)) {
    return {
      id: slot.themeId,
      name: slot.name,
      worldWidth: COMPILED_ARENA_WIDTH,
      worldHeight: COMPILED_ARENA_HEIGHT,
      groundBaselineBottom: WHITEWOOD_GROUND_BASELINE_BOTTOM,
      baseSpeed: 82,
      scrollMode: 'marching',
      layers: [],
    };
  }

  return {
    id: slot.themeId,
    name: slot.name,
    worldWidth: COMPILED_ARENA_WIDTH,
    worldHeight: COMPILED_ARENA_HEIGHT,
    groundBaselineBottom: WHITEWOOD_GROUND_BASELINE_BOTTOM,
    baseSpeed: 82,
    scrollMode: 'marching',
    layers: [
      {
        id: 'sky',
        source: slot.sky,
        nativeWidth: COMPILED_ARENA_WIDTH,
        nativeHeight: COMPILED_ARENA_HEIGHT,
        speedMultiplier: 0.05,
        combatDriftMultiplier: 0.015,
        verticalOffset: 0,
        zIndex: 0,
        opacity: 1,
        seamlessOverlapPx: 1,
      },
      {
        id: 'clouds',
        source: slot.cloudsOrMist,
        nativeWidth: COMPILED_ARENA_WIDTH,
        nativeHeight: COMPILED_ARENA_HEIGHT,
        speedMultiplier: 0.12,
        combatDriftMultiplier: 0.045,
        verticalOffset: 0,
        zIndex: 0,
        opacity: 1,
        seamlessOverlapPx: 1,
      },
      {
        id: 'mountains',
        source: slot.mountainsOrWalls,
        nativeWidth: COMPILED_ARENA_WIDTH,
        nativeHeight: COMPILED_ARENA_HEIGHT,
        speedMultiplier: 0.22,
        combatDriftMultiplier: 0.008,
        verticalOffset: 0,
        zIndex: 0,
        opacity: 1,
        seamlessOverlapPx: 1,
      },
      {
        id: 'hill_background',
        source: slot.hillBackground,
        nativeWidth: COMPILED_ARENA_WIDTH,
        nativeHeight: COMPILED_ARENA_HEIGHT,
        speedMultiplier: 0.38,
        combatDriftMultiplier: 0.004,
        verticalOffset: 0,
        zIndex: 0,
        opacity: 1,
        seamlessOverlapPx: 1,
      },
      {
        id: 'hill_midground',
        source: slot.hillMidground,
        nativeWidth: COMPILED_ARENA_WIDTH,
        nativeHeight: COMPILED_ARENA_HEIGHT,
        speedMultiplier: 0.58,
        combatDriftMultiplier: 0,
        verticalOffset: 0,
        zIndex: 0,
        opacity: 1,
        seamlessOverlapPx: 1,
      },
      {
        id: 'ground',
        source: slot.groundForeground,
        nativeWidth: COMPILED_ARENA_WIDTH,
        nativeHeight: COMPILED_ARENA_HEIGHT,
        speedMultiplier: 1.0,
        combatDriftMultiplier: 0,
        verticalOffset: 0,
        zIndex: 5,
        opacity: 1,
        seamlessOverlapPx: 1,
      },
    ],
  };
}

export const WHITEWOOD_ARENA_PRESET: ParallaxArenaConfig = buildCompiledArenaPreset(
  BATTLE_ARENA_ART_REGISTRY.whitewood_forest
);

/**
 * Resolves a quest/biome arena preset from BATTLE_ARENA_ART_REGISTRY using the 6 compiled
 * 2560x1080 full-frame WebP layers; falls back cleanly to WHITEWOOD_ARENA_PRESET.
 */
export function resolveBattleArenaPreset(questOrThemeSlug?: string | null): ParallaxArenaConfig {
  const themeId = inferBattleArenaThemeId(questOrThemeSlug);
  const slot = BATTLE_ARENA_ART_REGISTRY[themeId];
  if (!isCompleteArenaSlot(slot)) {
    return WHITEWOOD_ARENA_PRESET;
  }
  return buildCompiledArenaPreset(slot);
}

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

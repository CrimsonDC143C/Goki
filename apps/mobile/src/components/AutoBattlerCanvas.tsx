import React from 'react';
import type { DungeonCombatReplayResult, DungeonDefinition } from '@gymify/game-engine';
import { AutoBattlerArena } from '../screens/Battle/AutoBattlerArena';

export interface AutoBattlerCanvasProps {
  replay: DungeonCombatReplayResult;
  dungeon: DungeonDefinition;
}

/**
 * AutoBattlerCanvas delegates directly to AutoBattlerArena for backward compatibility.
 */
export const AutoBattlerCanvas: React.FC<AutoBattlerCanvasProps> = ({
  replay,
  dungeon,
}) => {
  return <AutoBattlerArena dungeon={dungeon} replay={replay} />;
};

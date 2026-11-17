import React from 'react';
import Svg, { Circle, G, Line, Path, Polygon, Rect } from 'react-native-svg';
import type { HolisticStatType, StatType } from '@goki/game-engine';
import { COLORS } from '../../theme';

export type RpgIconName =
  // World Tabs & Locations
  | 'hero'
  | 'adventure'
  | 'artisan'
  | 'social'
  | 'train'
  | 'tavern'
  | 'dungeon'
  | 'raid'
  | 'hub'
  | 'compass'
  | 'anvil'
  | 'banners'
  // 7 Holistic Stats
  | 'stat-str'
  | 'stat-end'
  | 'stat-agi'
  | 'stat-dex'
  | 'stat-con'
  | 'stat-wis'
  | 'stat-spr'
  // 8 Equipment Slots & 4 Professions
  | 'slot-head'
  | 'slot-chest'
  | 'slot-legs'
  | 'slot-boots'
  | 'slot-weapon'
  | 'slot-offhand'
  | 'slot-ring'
  | 'slot-amulet'
  | 'prof-mining'
  | 'prof-foraging'
  | 'prof-smelting'
  | 'prof-alchemy'
  // Actions, Statuses & Controls
  | 'combat'
  | 'shield'
  | 'lock'
  | 'coin'
  | 'bug'
  | 'history'
  | 'sparkles'
  | 'trophy'
  | 'bolt'
  | 'pin'
  | 'plates'
  | 'flame'
  | 'cog'
  | 'swap'
  | 'link'
  | 'trash'
  | 'check'
  | 'close'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-up'
  | 'chevron-down'
  | 'more-horizontal'
  | 'grip'
  | 'volume-on'
  | 'volume-off'
  | 'refresh'
  | 'backpack'
  | 'palette'
  | 'scroll'
  | 'watch'
  | 'chat'
  | 'plus';

export interface RpgIconProps {
  name: RpgIconName;
  size?: number;
  color?: string;
  accentColor?: string;
  strokeWidth?: number;
}

const STAT_TO_ICON_MAP: Record<HolisticStatType, RpgIconName> = {
  STRENGTH: 'stat-str',
  ENDURANCE: 'stat-end',
  AGILITY: 'stat-agi',
  DEXTERITY: 'stat-dex',
  CONSTITUTION: 'stat-con',
  WISDOM: 'stat-wis',
  SPIRIT: 'stat-spr',
};

/**
 * Maps a holistic or core stat identifier to its custom SVG icon name.
 */
export function getHolisticStatIconName(stat: HolisticStatType | StatType): RpgIconName {
  return STAT_TO_ICON_MAP[stat] ?? 'stat-str';
}

function renderIconGeometry(
  name: RpgIconName,
  color: string,
  accent: string,
  sw: number
): React.ReactNode {
  switch (name) {
    // ------------------------------------------------------------------
    // WORLD TABS & LOCATIONS
    // ------------------------------------------------------------------
    case 'hero':
    case 'slot-head':
      // Crest / Visored Helm silhouette
      return (
        <G stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Path d="M12 3L5.5 6.5V12.5C5.5 16.8 8.3 20.1 12 21.5C15.7 20.1 18.5 16.8 18.5 12.5V6.5L12 3Z" />
          <Path d="M8.5 11.5H15.5" stroke={accent} />
          <Path d="M12 6.5V15.5" />
        </G>
      );

    case 'adventure':
    case 'compass':
      // Compass rose / Quest star
      return (
        <G stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Circle cx="12" cy="12" r="9" />
          <Polygon points="15.5,8.5 13.4,13.4 8.5,15.5 10.6,10.6" stroke={accent} fill={accent} fillOpacity={0.22} />
        </G>
      );

    case 'artisan':
    case 'anvil':
      // Forging anvil
      return (
        <G stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Path d="M4 9H17L21 7.5C19.8 10.5 17.5 12 15.5 12H14V15.5H17.5V19H6.5V15.5H10V12H6.5C5 12 4 10.6 4 9Z" />
          <Line x1="8" y1="5.5" x2="13.5" y2="5.5" stroke={accent} />
        </G>
      );

    case 'social':
    case 'banners':
      // Twin guild / clan banners
      return (
        <G stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Path d="M5 4H12V16L8.5 13.5L5 16V4Z" />
          <Path d="M12 7H19V19L15.5 16.5L12 19V7Z" stroke={accent} />
        </G>
      );

    case 'train':
    case 'plates':
      // Barbell & heavy plates
      return (
        <G stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Line x1="2.5" y1="12" x2="21.5" y2="12" />
          <Rect x="4.5" y="7.5" width="2.5" height="9" rx="1" fill={accent} fillOpacity={0.25} />
          <Rect x="7.5" y="5.5" width="2.5" height="13" rx="1" />
          <Rect x="14" y="5.5" width="2.5" height="13" rx="1" />
          <Rect x="17" y="7.5" width="2.5" height="9" rx="1" fill={accent} fillOpacity={0.25} />
        </G>
      );

    case 'tavern':
      // Hearth mug / lantern
      return (
        <G stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Path d="M5 8H15V18C15 19.1 14.1 20 13 20H7C5.9 20 5 19.1 5 18V8Z" />
          <Path d="M15 10H17.5C18.6 10 19.5 10.9 19.5 12V14.5C19.5 15.6 18.6 16.5 17.5 16.5H15" />
          <Path d="M7.5 5C7.5 3.8 9 3.5 10 4.5C11 3.5 12.5 3.8 12.5 5" stroke={accent} />
        </G>
      );

    case 'dungeon':
      // Fortified citadel gate
      return (
        <G stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Path d="M4 20V8H7V5H10V8H14V5H17V8H20V20H4Z" />
          <Path d="M9.5 20V14.5C9.5 13.1 10.6 12 12 12C13.4 12 14.5 13.1 14.5 14.5V20" stroke={accent} />
        </G>
      );

    case 'raid':
      // Horned dragon crest / raid boss mark
      return (
        <G stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Path d="M4 6C4.5 9.5 6.8 11.5 9 12L7.5 16L12 20.5L16.5 16L15 12C17.2 11.5 19.5 9.5 20 6C17.2 7.5 14.8 7.5 12 6C9.2 7.5 6.8 7.5 4 6Z" />
          <Circle cx="10" cy="12" r="1" fill={accent} stroke="none" />
          <Circle cx="14" cy="12" r="1" fill={accent} stroke="none" />
        </G>
      );

    case 'hub':
      // Torii / Sanctuary arch
      return (
        <G stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Path d="M3 6C7.5 7.2 16.5 7.2 21 6" stroke={accent} />
          <Line x1="5" y1="10" x2="19" y2="10" />
          <Line x1="7.5" y1="6.8" x2="7.5" y2="20" />
          <Line x1="16.5" y1="6.8" x2="16.5" y2="20" />
        </G>
      );

    // ------------------------------------------------------------------
    // 7 HOLISTIC STATS
    // ------------------------------------------------------------------
    case 'stat-str':
    case 'combat':
      // Crossed broadswords
      return (
        <G stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Path d="M5 19L10.5 13.5M14.5 9.5L19.5 4.5L19.5 8L16.5 11" />
          <Path d="M19 19L4.5 4.5V8L16 19.5" />
          <Line x1="4.5" y1="15.5" x2="8.5" y2="19.5" stroke={accent} />
          <Line x1="19.5" y1="15.5" x2="15.5" y2="19.5" stroke={accent} />
        </G>
      );

    case 'stat-end':
      // Stamina pulse / stride
      return (
        <G stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Path d="M3 12H6.5L9 6.5L12.5 17.5L15.5 10L17.5 12H21" stroke={accent} />
          <Circle cx="12" cy="12" r="9.5" strokeOpacity={0.35} />
        </G>
      );

    case 'stat-agi':
    case 'bolt':
      // Swift lightning / wind dash
      return (
        <G stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Polygon points="13.5,2.5 5.5,13.5 11.5,13.5 10.5,21.5 18.5,10.5 12.5,10.5" fill={accent} fillOpacity={0.22} />
        </G>
      );

    case 'stat-dex':
      // Precision crosshair / twin daggers
      return (
        <G stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Circle cx="12" cy="12" r="6.5" />
          <Circle cx="12" cy="12" r="2" fill={accent} stroke="none" />
          <Line x1="12" y1="2.5" x2="12" y2="6.5" />
          <Line x1="12" y1="17.5" x2="12" y2="21.5" />
          <Line x1="2.5" y1="12" x2="6.5" y2="12" />
          <Line x1="17.5" y1="12" x2="21.5" y2="12" />
        </G>
      );

    case 'stat-con':
    case 'shield':
      // Kite shield
      return (
        <G stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Path d="M12 3L4.5 6V11.5C4.5 16.5 7.7 19.9 12 21.5C16.3 19.9 19.5 16.5 19.5 11.5V6L12 3Z" />
          <Path d="M12 7.5V16.5M8.5 11H15.5" stroke={accent} />
        </G>
      );

    case 'stat-wis':
      // Arcane eye / tome insight
      return (
        <G stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Path d="M2.5 12C4.8 7.8 8.2 6 12 6C15.8 6 19.2 7.8 21.5 12C19.2 16.2 15.8 18 12 18C8.2 18 4.8 16.2 2.5 12Z" />
          <Circle cx="12" cy="12" r="3" stroke={accent} />
        </G>
      );

    case 'stat-spr':
    case 'sparkles':
      // Four-point spirit star
      return (
        <G stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Path d="M12 3L14.2 9.8L21 12L14.2 14.2L12 21L9.8 14.2L3 12L9.8 9.8L12 3Z" fill={accent} fillOpacity={0.18} />
          <Circle cx="18.5" cy="5.5" r="1" fill={accent} stroke="none" />
        </G>
      );

    // ------------------------------------------------------------------
    // 8 EQUIPMENT SLOTS & 4 PROFESSIONS
    // ------------------------------------------------------------------
    case 'slot-chest':
      // Cuirass / breastplate
      return (
        <G stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Path d="M8 4L4 7L6 11L7.5 10V20H16.5V10L18 11L20 7L16 4C15 5.8 13.6 6.5 12 6.5C10.4 6.5 9 5.8 8 4Z" />
          <Line x1="12" y1="8.5" x2="12" y2="17" stroke={accent} />
        </G>
      );

    case 'slot-legs':
      // Armored greaves
      return (
        <G stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Path d="M6.5 4H17.5L18.5 20H14L12 11.5L10 20H5.5L6.5 4Z" />
          <Line x1="7" y1="8" x2="17" y2="8" stroke={accent} />
        </G>
      );

    case 'slot-boots':
      // Sabaton / war boot
      return (
        <G stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Path d="M7 4H13V13L18.5 15.5C19.4 15.9 20 16.8 20 17.8V19.5H6.5V4H7Z" />
          <Line x1="7" y1="9" x2="13" y2="9" stroke={accent} />
        </G>
      );

    case 'slot-weapon':
      // Broadsword
      return (
        <G stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Path d="M18.5 3.5L14 4.5L7.5 11L13 16.5L19.5 10L20.5 5.5L18.5 3.5Z" />
          <Line x1="5.5" y1="13" x2="11" y2="18.5" stroke={accent} />
          <Line x1="3.5" y1="20.5" x2="8.2" y2="15.8" />
        </G>
      );

    case 'slot-offhand':
      // Tower buckler / shield
      return (
        <G stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Circle cx="12" cy="12" r="8" />
          <Circle cx="12" cy="12" r="3" stroke={accent} />
        </G>
      );

    case 'slot-ring':
      // Signet ring
      return (
        <G stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Circle cx="12" cy="13.5" r="6" />
          <Polygon points="12,3.5 15,6.5 12,8.5 9,6.5" stroke={accent} fill={accent} fillOpacity={0.25} />
        </G>
      );

    case 'slot-amulet':
      // Pendant necklace
      return (
        <G stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Path d="M6 4.5C6 8.5 8.5 11 12 11C15.5 11 18 8.5 18 4.5" />
          <Polygon points="12,11 16,15.5 12,20.5 8,15.5" stroke={accent} fill={accent} fillOpacity={0.22} />
        </G>
      );

    case 'prof-mining':
      // Pickaxe
      return (
        <G stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Path d="M5 7C8.5 3.8 14 4 19 8" stroke={accent} />
          <Line x1="14.5" y1="6.5" x2="5" y2="19" />
        </G>
      );

    case 'prof-foraging':
      // Botanical leaf
      return (
        <G stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Path d="M5 19C5 11.5 10.5 5 19 5C19 13.5 12.5 19 5 19Z" />
          <Path d="M5 19L14 10" stroke={accent} />
        </G>
      );

    case 'prof-smelting':
    case 'flame':
      // Forge flame
      return (
        <G stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Path d="M12 3C14.5 6.2 18 8.5 18 13.2C18 16.9 15.3 20 12 20C8.7 20 6 16.9 6 13.2C6 10.2 7.6 8.1 9.4 6.6C9.5 8.6 10.7 9.8 12 10.2C11.4 7.7 11.5 5.2 12 3Z" />
          <Path d="M12 13.5C13.3 14.6 13.8 16.4 12.6 17.8" stroke={accent} />
        </G>
      );

    case 'prof-alchemy':
      // Alchemical flask
      return (
        <G stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Path d="M9.5 4H14.5M10.5 4V8.5L5.5 17.2C4.9 18.2 5.6 19.5 6.8 19.5H17.2C18.4 19.5 19.1 18.2 18.5 17.2L13.5 8.5V4" />
          <Line x1="7.5" y1="15" x2="16.5" y2="15" stroke={accent} />
        </G>
      );

    // ------------------------------------------------------------------
    // ACTIONS, STATUSES & CONTROLS
    // ------------------------------------------------------------------
    case 'lock':
      return (
        <G stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Rect x="5.5" y="11" width="13" height="9" rx="2" />
          <Path d="M8.5 11V7.5C8.5 5.6 10.1 4 12 4C13.9 4 15.5 5.6 15.5 7.5V11" stroke={accent} />
        </G>
      );

    case 'coin':
      return (
        <G stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Circle cx="12" cy="12" r="8.5" fill={accent} fillOpacity={0.18} />
          <Polygon points="12,7.5 15,12 12,16.5 9,12" stroke={accent} />
        </G>
      );

    case 'bug':
      return (
        <G stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Rect x="8" y="8" width="8" height="10" rx="4" />
          <Path d="M9.5 8V6.5C9.5 5.1 10.6 4 12 4C13.4 4 14.5 5.1 14.5 6.5V8" />
          <Line x1="5" y1="10" x2="8" y2="11" />
          <Line x1="19" y1="10" x2="16" y2="11" />
          <Line x1="4.5" y1="14" x2="8" y2="14" />
          <Line x1="19.5" y1="14" x2="16" y2="14" />
          <Line x1="12" y1="10.5" x2="12" y2="16" stroke={accent} />
        </G>
      );

    case 'history':
      // Chart bars / trend line
      return (
        <G stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Line x1="4" y1="19.5" x2="20" y2="19.5" />
          <Rect x="5.5" y="12.5" width="3" height="7" rx="0.8" />
          <Rect x="10.5" y="8.5" width="3" height="11" rx="0.8" stroke={accent} />
          <Rect x="15.5" y="5" width="3" height="14.5" rx="0.8" />
        </G>
      );

    case 'trophy':
      return (
        <G stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Path d="M7 4.5H17V10C17 12.8 14.8 15 12 15C9.2 15 7 12.8 7 10V4.5Z" />
          <Path d="M7 6.5H4.5V9C4.5 10.4 5.6 11.5 7 11.5" />
          <Path d="M17 6.5H19.5V9C19.5 10.4 18.4 11.5 17 11.5" />
          <Line x1="12" y1="15" x2="12" y2="19" />
          <Line x1="8.5" y1="19.5" x2="15.5" y2="19.5" stroke={accent} />
        </G>
      );

    case 'pin':
      return (
        <G stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Path d="M9 4.5H15L14 10L17 13H7L10 10L9 4.5Z" />
          <Line x1="12" y1="13" x2="12" y2="20" stroke={accent} />
        </G>
      );

    case 'cog':
      return (
        <G stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Circle cx="12" cy="12" r="3" stroke={accent} />
          <Path d="M12 3.5V5.5M12 18.5V20.5M3.5 12H5.5M18.5 12H20.5M6 6L7.4 7.4M16.6 16.6L18 18M18 6L16.6 7.4M7.4 16.6L6 18" />
          <Circle cx="12" cy="12" r="6.5" />
        </G>
      );

    case 'swap':
      return (
        <G stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Path d="M4.5 8.5H18.5L15 5" />
          <Path d="M19.5 15.5H5.5L9 19" stroke={accent} />
        </G>
      );

    case 'link':
      return (
        <G stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Path d="M9.5 14.5L14.5 9.5" stroke={accent} />
          <Path d="M8.5 10.5L6.2 12.8C4.8 14.2 4.8 16.4 6.2 17.8C7.6 19.2 9.8 19.2 11.2 17.8L13.5 15.5" />
          <Path d="M10.5 8.5L12.8 6.2C14.2 4.8 16.4 4.8 17.8 6.2C19.2 7.6 19.2 9.8 17.8 11.2L15.5 13.5" />
        </G>
      );

    case 'trash':
      return (
        <G stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Path d="M4.5 7H19.5" />
          <Path d="M9 4.5H15V7H9V4.5Z" />
          <Path d="M6.5 7L7.5 19.5H16.5L17.5 7" />
          <Line x1="10.2" y1="10.5" x2="10.2" y2="16" stroke={accent} />
          <Line x1="13.8" y1="10.5" x2="13.8" y2="16" stroke={accent} />
        </G>
      );

    case 'check':
      return (
        <Path
          d="M5 12.5L9.5 17L19 7.5"
          stroke={color}
          strokeWidth={sw + 0.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      );

    case 'close':
      return (
        <G stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Line x1="6" y1="6" x2="18" y2="18" />
          <Line x1="18" y1="6" x2="6" y2="18" />
        </G>
      );

    case 'chevron-left':
      return (
        <Path
          d="M14.5 5.5L8 12L14.5 18.5"
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      );

    case 'chevron-right':
      return (
        <Path
          d="M9.5 5.5L16 12L9.5 18.5"
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      );

    case 'chevron-up':
      return (
        <Path
          d="M5.5 14.5L12 8L18.5 14.5"
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      );

    case 'chevron-down':
      return (
        <Path
          d="M5.5 9.5L12 16L18.5 9.5"
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      );

    case 'more-horizontal':
      return (
        <G fill={color}>
          <Circle cx="6" cy="12" r="1.6" />
          <Circle cx="12" cy="12" r="1.6" />
          <Circle cx="18" cy="12" r="1.6" />
        </G>
      );

    case 'grip':
      return (
        <G fill={color}>
          <Circle cx="9" cy="6.5" r="1.4" />
          <Circle cx="15" cy="6.5" r="1.4" />
          <Circle cx="9" cy="12" r="1.4" />
          <Circle cx="15" cy="12" r="1.4" />
          <Circle cx="9" cy="17.5" r="1.4" />
          <Circle cx="15" cy="17.5" r="1.4" />
        </G>
      );

    case 'volume-on':
      return (
        <G stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Polygon points="4.5,9.5 8.5,9.5 13,5.5 13,18.5 8.5,14.5 4.5,14.5" />
          <Path d="M16 9C17.2 10.6 17.2 13.4 16 15" stroke={accent} />
          <Path d="M18.5 6.8C20.8 9.8 20.8 14.2 18.5 17.2" stroke={accent} />
        </G>
      );

    case 'volume-off':
      return (
        <G stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Polygon points="4.5,9.5 8.5,9.5 13,5.5 13,18.5 8.5,14.5 4.5,14.5" />
          <Line x1="16" y1="9.5" x2="20" y2="14.5" stroke={accent} />
          <Line x1="20" y1="9.5" x2="16" y2="14.5" stroke={accent} />
        </G>
      );

    case 'refresh':
      return (
        <G stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Path d="M19.5 10.5A7.5 7.5 0 0 0 6.8 6.8L4.5 9" />
          <Path d="M4.5 5V9H8.5" />
          <Path d="M4.5 13.5A7.5 7.5 0 0 0 17.2 17.2L19.5 15" stroke={accent} />
          <Path d="M19.5 19V15H15.5" stroke={accent} />
        </G>
      );

    case 'backpack':
      return (
        <G stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Path d="M9.5 5.5V4C9.5 3.2 10.2 2.5 11 2.5H13C13.8 2.5 14.5 3.2 14.5 4V5.5" />
          <Rect x="5.5" y="5.5" width="13" height="15" rx="3" />
          <Path d="M8.5 13.5H15.5V17.5H8.5V13.5Z" stroke={accent} />
        </G>
      );

    case 'palette':
      return (
        <G stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Path d="M12 3.5C7 3.5 3.5 7.2 3.5 12C3.5 16.5 6.8 20 11 20C12.3 20 13 19.1 13 18.1C13 17.5 12.7 17.1 12.4 16.7C12.1 16.3 12 15.8 12.4 15.3C12.8 14.9 13.6 14.8 14.5 14.8H16.2C18.6 14.8 20.5 12.9 20.5 10.5C20.5 6.4 16.7 3.5 12 3.5Z" />
          <Circle cx="8" cy="10.5" r="1" fill={accent} stroke="none" />
          <Circle cx="11.5" cy="7.5" r="1" fill={accent} stroke="none" />
          <Circle cx="15.5" cy="9" r="1" fill={accent} stroke="none" />
        </G>
      );

    case 'scroll':
      return (
        <G stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Path d="M7 4.5H17.5C18.9 4.5 20 5.6 20 7C20 8.4 18.9 9.5 17.5 9.5H16.5V17.5C16.5 18.9 15.4 20 14 20H5.5C4.4 20 3.5 19.1 3.5 18C3.5 16.9 4.4 16 5.5 16H7V4.5Z" />
          <Line x1="9.5" y1="9" x2="14" y2="9" stroke={accent} />
          <Line x1="9.5" y1="12.5" x2="14" y2="12.5" stroke={accent} />
        </G>
      );

    case 'watch':
      return (
        <G stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Path d="M9 3.5H15L15.6 6.5H8.4L9 3.5Z" />
          <Path d="M8.4 17.5H15.6L15 20.5H9L8.4 17.5Z" />
          <Rect x="6.5" y="6.5" width="11" height="11" rx="2.5" />
          <Path d="M12 9.5V12L13.8 13.2" stroke={accent} />
        </G>
      );

    case 'chat':
      return (
        <G stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Path d="M4.5 6.5C4.5 5.4 5.4 4.5 6.5 4.5H17.5C18.6 4.5 19.5 5.4 19.5 6.5V14.5C19.5 15.6 18.6 16.5 17.5 16.5H9.5L5.5 19.8V16.5H6.5C5.4 16.5 4.5 15.6 4.5 14.5V6.5Z" />
          <Line x1="8.5" y1="9.5" x2="15.5" y2="9.5" stroke={accent} />
          <Line x1="8.5" y1="12.5" x2="13" y2="12.5" stroke={accent} />
        </G>
      );

    case 'plus':
      return (
        <G stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Line x1="12" y1="5" x2="12" y2="19" />
          <Line x1="5" y1="12" x2="19" y2="12" />
        </G>
      );
  }
}

export const RpgIcon: React.FC<RpgIconProps> = ({
  name,
  size = 18,
  color = COLORS.textPrimary,
  accentColor,
  strokeWidth = 1.85,
}) => {
  const accent = accentColor ?? color;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {renderIconGeometry(name, color, accent, strokeWidth)}
    </Svg>
  );
};

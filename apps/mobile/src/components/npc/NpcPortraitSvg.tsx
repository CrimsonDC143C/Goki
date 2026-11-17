import React from 'react';
import Svg, { Circle, Defs, G, LinearGradient, Path, Polygon, Rect, Stop } from 'react-native-svg';
import { COLORS } from '../../theme';

export type NpcArchetypeId =
  | 'GUIDE'
  | 'GUILD_RECEPTIONIST'
  | 'TRADER'
  | 'TRAINER'
  | 'QUARTERMASTER'
  | 'CLAN_WARDEN';

export interface NpcArchetypeMeta {
  name: string;
  title: string;
  faction: string;
  accentColor: string;
}

export const NPC_ARCHETYPE_META: Record<NpcArchetypeId, NpcArchetypeMeta> = {
  GUIDE: {
    name: 'Auren the Wayfinder',
    title: 'Sanctum Guide',
    faction: 'Order of the Hearth',
    accentColor: COLORS.gold,
  },
  GUILD_RECEPTIONIST: {
    name: 'Lyra Vance',
    title: 'Guild Receptionist',
    faction: "Adventurer's Guild",
    accentColor: '#38BDF8',
  },
  TRADER: {
    name: 'Bramwell',
    title: 'Artisan Quartermaster & Trader',
    faction: 'Foundry Guild',
    accentColor: '#F59E0B',
  },
  TRAINER: {
    name: 'Master Kaelen',
    title: 'Master Strength Coach',
    faction: 'Iron Sanctum',
    accentColor: '#EF5350',
  },
  QUARTERMASTER: {
    name: 'Commander Veyra',
    title: 'Company Quartermaster',
    faction: 'Vanguard Companies',
    accentColor: '#A855F7',
  },
  CLAN_WARDEN: {
    name: 'Warden Torin',
    title: 'Gym Clan Warden',
    faction: 'Sanctioned Venues',
    accentColor: '#26A69A',
  },
};

export interface NpcPortraitSvgProps {
  npcId?: NpcArchetypeId;
  size?: number;
}

export const NpcPortraitSvg: React.FC<NpcPortraitSvgProps> = ({
  npcId = 'GUIDE',
  size = 72,
}) => {
  const meta = NPC_ARCHETYPE_META[npcId];
  const accent = meta.accentColor;

  return (
    <Svg width={size} height={size} viewBox="0 0 80 80">
      <Defs>
        <LinearGradient id={`npcBg_${npcId}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#1B2333" />
          <Stop offset="100%" stopColor="#0E131D" />
        </LinearGradient>
        <LinearGradient id={`npcCloak_${npcId}`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor="#283449" />
          <Stop offset="100%" stopColor="#151C28" />
        </LinearGradient>
      </Defs>

      {/* Framed Slate Backdrop */}
      <Rect x="1" y="1" width="78" height="78" rx="14" fill={`url(#npcBg_${npcId})`} />
      <Circle cx="40" cy="34" r="26" fill={accent} fillOpacity={0.09} />

      {/* Shoulders & Bust Silhouette */}
      <Path
        d="M12 78C14 61 25 53 40 53C55 53 66 61 68 78Z"
        fill={`url(#npcCloak_${npcId})`}
        stroke="#36445C"
        strokeWidth="1.5"
      />

      {/* Collar & Archetype Trim */}
      <Path
        d="M27 56L40 67L53 56"
        fill="none"
        stroke={accent}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Neck */}
      <Rect x="34" y="45" width="12" height="10" rx="4" fill="#2A3342" />

      {/* Archetype Headgear / Silhouette */}
      {npcId === 'GUIDE' && (
        <G>
          {/* Traveler hood */}
          <Path
            d="M22 44C21 24 29 14 40 14C51 14 59 24 58 44L51 50H29L22 44Z"
            fill="#1D2636"
            stroke={accent}
            strokeWidth="1.5"
          />
          <Circle cx="40" cy="34" r="11" fill="#2B3548" />
          <Path d="M29 29L40 21L51 29" fill="#171E2C" />
          <Circle cx="36" cy="35" r="1.5" fill={accent} />
          <Circle cx="44" cy="35" r="1.5" fill={accent} />
          <Polygon points="40,59 44,64 40,69 36,64" fill={accent} />
        </G>
      )}

      {npcId === 'GUILD_RECEPTIONIST' && (
        <G>
          {/* Circlet & swept hair */}
          <Path
            d="M24 39C24 23 30 16 40 16C50 16 56 23 56 39L53 48H27L24 39Z"
            fill="#232D42"
          />
          <Circle cx="40" cy="34" r="11.5" fill="#323D54" stroke="#475569" strokeWidth="1" />
          <Path d="M29 27L40 23L51 27" fill="none" stroke={accent} strokeWidth="2" />
          <Polygon points="40,19 42.5,23 40,26 37.5,23" fill={accent} />
          <Circle cx="36" cy="35" r="1.4" fill="#E2E8F0" />
          <Circle cx="44" cy="35" r="1.4" fill="#E2E8F0" />
        </G>
      )}

      {npcId === 'TRADER' && (
        <G>
          {/* Merchant beret & monocle */}
          <Path
            d="M23 26C25 18 33 15 43 16C52 17 57 22 56 27L23 26Z"
            fill="#293548"
            stroke={accent}
            strokeWidth="1.5"
          />
          <Circle cx="40" cy="35" r="11.5" fill="#323C4E" />
          <Circle cx="44.5" cy="34.5" r="4" fill="none" stroke={accent} strokeWidth="1.5" />
          <Circle cx="35.5" cy="34.5" r="1.4" fill="#E2E8F0" />
          <Path d="M32 42C35 46 45 46 48 42" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" />
        </G>
      )}

      {npcId === 'TRAINER' && (
        <G>
          {/* Steel headband & stoic visor */}
          <Circle cx="40" cy="34" r="12" fill="#2F384A" stroke="#475569" strokeWidth="1.2" />
          <Rect x="27" y="25" width="26" height="5" rx="2" fill="#18202E" stroke={accent} strokeWidth="1.4" />
          <Path d="M33 34H38M42 34H47" stroke={accent} strokeWidth="2" strokeLinecap="round" />
          <Path d="M30 43L40 49L50 43" fill="#1C2434" />
        </G>
      )}

      {npcId === 'QUARTERMASTER' && (
        <G>
          {/* Crested Officer Helm */}
          <Path
            d="M27 36C27 23 32 16 40 16C48 16 53 23 53 36V44L40 48L27 44V36Z"
            fill="#242E42"
            stroke={accent}
            strokeWidth="1.5"
          />
          <Path d="M40 12V28" stroke={accent} strokeWidth="2.5" strokeLinecap="round" />
          <Path d="M32 34L38 36M48 34L42 36" stroke="#E2E8F0" strokeWidth="1.8" strokeLinecap="round" />
        </G>
      )}

      {npcId === 'CLAN_WARDEN' && (
        <G>
          {/* Horned Greathelm */}
          <Path d="M27 26C21 23 19 17 21 13C24 17 26 20 30 22" fill="none" stroke={accent} strokeWidth="2.2" strokeLinecap="round" />
          <Path d="M53 26C59 23 61 17 59 13C56 17 54 20 50 22" fill="none" stroke={accent} strokeWidth="2.2" strokeLinecap="round" />
          <Path
            d="M28 32C28 22 33 18 40 18C47 18 52 22 52 32V43L40 47L28 43V32Z"
            fill="#212B3D"
            stroke="#475569"
            strokeWidth="1.4"
          />
          <Path d="M33 33H47" stroke={accent} strokeWidth="2" strokeLinecap="round" />
        </G>
      )}

      {/* Subtle Corner Accent Border */}
      <Rect
        x="1"
        y="1"
        width="78"
        height="78"
        rx="14"
        fill="none"
        stroke={accent}
        strokeOpacity={0.38}
        strokeWidth="1.4"
      />
    </Svg>
  );
};

import React from 'react';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  Polygon,
  Rect,
  Stop,
} from 'react-native-svg';
import { COLORS } from '../../theme';

export type NpcArchetypeId =
  | 'GUIDE'
  | 'GUILD_RECEPTIONIST'
  | 'TRADER'
  | 'TRAINER'
  | 'QUARTERMASTER'
  | 'CLAN_WARDEN';

export type NpcExpression = 'neutral' | 'happy' | 'focused' | 'alert';

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
  expression?: NpcExpression;
}

function renderExpressiveEyes(
  expression: NpcExpression,
  eyeColor: string,
  browColor: string,
  eyeY = 34.5,
  leftX = 35.5,
  rightX = 44.5
): React.ReactNode {
  if (expression === 'happy') {
    return (
      <G>
        <Path
          d={`M${leftX - 2.6} ${eyeY - 3.6}Q${leftX} ${eyeY - 5.2} ${leftX + 2.6} ${eyeY - 3.6}`}
          fill="none"
          stroke={browColor}
          strokeWidth="1.3"
          strokeLinecap="round"
        />
        <Path
          d={`M${rightX - 2.6} ${eyeY - 3.6}Q${rightX} ${eyeY - 5.2} ${rightX + 2.6} ${eyeY - 3.6}`}
          fill="none"
          stroke={browColor}
          strokeWidth="1.3"
          strokeLinecap="round"
        />
        <Path
          d={`M${leftX - 2.2} ${eyeY + 0.3}Q${leftX} ${eyeY - 1.8} ${leftX + 2.2} ${eyeY + 0.3}`}
          fill="none"
          stroke={eyeColor}
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <Path
          d={`M${rightX - 2.2} ${eyeY + 0.3}Q${rightX} ${eyeY - 1.8} ${rightX + 2.2} ${eyeY + 0.3}`}
          fill="none"
          stroke={eyeColor}
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </G>
    );
  }

  if (expression === 'focused') {
    return (
      <G>
        <Path
          d={`M${leftX - 2.8} ${eyeY - 3.6}L${leftX + 2.5} ${eyeY - 2.1}`}
          stroke={browColor}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <Path
          d={`M${rightX + 2.8} ${eyeY - 3.6}L${rightX - 2.5} ${eyeY - 2.1}`}
          stroke={browColor}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <Rect x={leftX - 2.2} y={eyeY - 0.8} width="4.4" height="1.8" rx="0.9" fill={eyeColor} />
        <Rect x={rightX - 2.2} y={eyeY - 0.8} width="4.4" height="1.8" rx="0.9" fill={eyeColor} />
      </G>
    );
  }

  if (expression === 'alert') {
    return (
      <G>
        <Path
          d={`M${leftX - 2.6} ${eyeY - 4.4}L${leftX + 2.4} ${eyeY - 3.5}`}
          stroke={browColor}
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        <Path
          d={`M${rightX + 2.6} ${eyeY - 4.4}L${rightX - 2.4} ${eyeY - 3.5}`}
          stroke={browColor}
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        <Circle cx={leftX} cy={eyeY} r="2.2" fill={eyeColor} fillOpacity={0.28} />
        <Circle cx={rightX} cy={eyeY} r="2.2" fill={eyeColor} fillOpacity={0.28} />
        <Circle cx={leftX} cy={eyeY} r="1.5" fill={eyeColor} />
        <Circle cx={rightX} cy={eyeY} r="1.5" fill={eyeColor} />
      </G>
    );
  }

  return (
    <G>
      <Path
        d={`M${leftX - 2.3} ${eyeY - 3.2}H${leftX + 2.1}`}
        stroke={browColor}
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <Path
        d={`M${rightX - 2.1} ${eyeY - 3.2}H${rightX + 2.3}`}
        stroke={browColor}
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <Circle cx={leftX} cy={eyeY} r="1.5" fill={eyeColor} />
      <Circle cx={rightX} cy={eyeY} r="1.5" fill={eyeColor} />
    </G>
  );
}

function renderMouth(expression: NpcExpression, strokeColor: string, y = 41.5): React.ReactNode {
  if (expression === 'happy') {
    return (
      <Path
        d={`M36.5 ${y - 0.5}Q40 ${y + 2.6} 43.5 ${y - 0.5}`}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    );
  }
  if (expression === 'alert') {
    return (
      <Ellipse
        cx="40"
        cy={y + 0.5}
        rx="2.1"
        ry="1.2"
        fill="#0F141E"
        stroke={strokeColor}
        strokeWidth="1.1"
      />
    );
  }
  if (expression === 'focused') {
    return (
      <Path
        d={`M37 ${y + 0.4}L43 ${y - 0.2}`}
        stroke={strokeColor}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    );
  }
  return (
    <Path
      d={`M37.2 ${y}Q40 ${y + 1.1} 42.8 ${y}`}
      fill="none"
      stroke={strokeColor}
      strokeWidth="1.3"
      strokeLinecap="round"
    />
  );
}

export const NpcPortraitSvg: React.FC<NpcPortraitSvgProps> = ({
  npcId = 'GUIDE',
  size = 72,
  expression = 'neutral',
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
        <LinearGradient id={`npcFace_${npcId}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#3B475F" />
          <Stop offset="100%" stopColor="#263042" />
        </LinearGradient>
      </Defs>

      {/* Framed Slate Backdrop */}
      <Rect x="1" y="1" width="78" height="78" rx="14" fill={`url(#npcBg_${npcId})`} />
      <Circle cx="40" cy="34" r="27" fill={accent} fillOpacity={expression === 'alert' ? 0.16 : 0.1} />
      <Circle
        cx="40"
        cy="34"
        r="21"
        fill="none"
        stroke={accent}
        strokeOpacity={0.18}
        strokeWidth="1"
      />

      {/* Shoulders & Bust Silhouette */}
      <Path
        d="M11 78C14 60 25 52 40 52C55 52 66 60 69 78Z"
        fill={`url(#npcCloak_${npcId})`}
        stroke="#36445C"
        strokeWidth="1.5"
      />
      {/* Subtle shoulder trim */}
      <Path
        d="M17 65C22 57 30 54 40 54C50 54 58 57 63 65"
        fill="none"
        stroke="#475569"
        strokeOpacity={0.45}
        strokeWidth="1"
      />

      {/* Collar & Archetype Trim */}
      <Path
        d="M27 55L40 67L53 55"
        fill="none"
        stroke={accent}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Neck & Chin Shadow */}
      <Rect x="34" y="45" width="12" height="10" rx="4" fill="#232C3B" />

      {/* Archetype Headgear / Features */}
      {npcId === 'GUIDE' && (
        <G>
          {/* Outer Wayfinder Hood */}
          <Path
            d="M21 45C20 23 28 12 40 12C52 12 60 23 59 45L52 51H28L21 45Z"
            fill="#1D2636"
            stroke={accent}
            strokeWidth="1.5"
          />
          {/* Inner Hood Shadow */}
          <Path
            d="M26 42C26 26 31 19 40 19C49 19 54 26 54 42L48 47H32L26 42Z"
            fill="#121824"
          />
          <Circle cx="40" cy="34.5" r="11" fill={`url(#npcFace_${npcId})`} />
          <Path d="M29 29L40 20L51 29" fill="#171E2C" />
          {/* Wayfinder brow circlet */}
          <Polygon points="40,23 42.2,26.5 40,29.5 37.8,26.5" fill={accent} fillOpacity={0.85} />
          {renderExpressiveEyes(expression, accent, '#CBD5E1', 35, 35.5, 44.5)}
          {renderMouth(expression, '#94A3B8', 41.5)}
          {/* Hearth Diamond Clasp */}
          <Polygon points="40,59 44.5,64.5 40,70 35.5,64.5" fill={accent} />
          <Polygon points="40,61.5 42.2,64.5 40,67.5 37.8,64.5" fill="#111620" />
        </G>
      )}

      {npcId === 'GUILD_RECEPTIONIST' && (
        <G>
          {/* Swept Hair & Guild Cape */}
          <Path
            d="M23 41C23 23 30 15 40 15C50 15 57 23 57 41L53 49H27L23 41Z"
            fill="#232D42"
          />
          <Circle cx="40" cy="34.5" r="11.5" fill={`url(#npcFace_${npcId})`} stroke="#475569" strokeWidth="1" />
          {/* Side hair locks */}
          <Path d="M28 29C27 36 28 42 31 46" fill="none" stroke="#1E293B" strokeWidth="2.5" strokeLinecap="round" />
          <Path d="M52 29C53 36 52 42 49 46" fill="none" stroke="#1E293B" strokeWidth="2.5" strokeLinecap="round" />
          {/* Guild Circlet */}
          <Path d="M29 26.5L40 22.5L51 26.5" fill="none" stroke={accent} strokeWidth="2" />
          <Polygon points="40,18.5 42.8,22.5 40,26 37.2,22.5" fill={accent} />
          {renderExpressiveEyes(expression, '#E2E8F0', '#94A3B8', 35, 35.5, 44.5)}
          {renderMouth(expression, '#CBD5E1', 41.5)}
          {/* Guild Crest Pin */}
          <Circle cx="40" cy="64" r="3.2" fill="#171E2B" stroke={accent} strokeWidth="1.4" />
        </G>
      )}

      {npcId === 'TRADER' && (
        <G>
          {/* Merchant Beret */}
          <Path
            d="M22 26C24 17 33 14 44 15C53 16 58 21 56 27L22 26Z"
            fill="#293548"
            stroke={accent}
            strokeWidth="1.5"
          />
          <Polygon points="48,18.5 51,21 48,23.5 45,21" fill={accent} />
          <Circle cx="40" cy="35" r="11.5" fill={`url(#npcFace_${npcId})`} />
          {/* Mustache & Beard Trim */}
          <Path
            d="M32 42.5C35 46.5 45 46.5 48 42.5"
            fill="none"
            stroke="#94A3B8"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <Path
            d="M34 40C37 38.5 40 39.5 40 39.5C40 39.5 43 38.5 46 40"
            fill="none"
            stroke="#CBD5E1"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          {renderExpressiveEyes(expression, '#E2E8F0', '#94A3B8', 34.5, 35.5, 44.5)}
          {/* Golden Monocle + Chain */}
          <Circle cx="44.5" cy="34.5" r="4.2" fill={accent} fillOpacity={0.1} stroke={accent} strokeWidth="1.5" />
          <Path d="M48.5 36.5L51 45" stroke={accent} strokeOpacity={0.65} strokeWidth="1" />
          {renderMouth(expression, '#CBD5E1', 42)}
          {/* Gold Coin Clasp */}
          <Circle cx="40" cy="64" r="3.5" fill={accent} />
        </G>
      )}

      {npcId === 'TRAINER' && (
        <G>
          {/* Chiseled Head & Jaw */}
          <Circle cx="40" cy="34.5" r="12" fill={`url(#npcFace_${npcId})`} stroke="#475569" strokeWidth="1.2" />
          {/* Iron Sanctum Headband */}
          <Rect x="27" y="24.5" width="26" height="5.2" rx="2" fill="#18202E" stroke={accent} strokeWidth="1.4" />
          <Polygon points="40,25.2 42,27.1 40,29 38,27.1" fill={accent} />
          {/* Cheek Battle Scar */}
          <Path d="M31.5 37L34 40.5" stroke="#94A3B8" strokeOpacity={0.65} strokeWidth="1.1" strokeLinecap="round" />
          {renderExpressiveEyes(
            expression === 'neutral' ? 'focused' : expression,
            accent,
            '#CBD5E1',
            34.5,
            35.5,
            44.5
          )}
          {/* Chin Beard */}
          <Path d="M31 43L40 49.5L49 43" fill="#1C2434" />
          {renderMouth(expression, '#CBD5E1', 41.5)}
          {/* Iron Emblem */}
          <Rect x="37" y="61" width="6" height="6" rx="1.2" fill={accent} />
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
          <Path d="M40 11.5V28" stroke={accent} strokeWidth="2.6" strokeLinecap="round" />
          <Path d="M31 30.5H49" stroke="#334155" strokeWidth="1.5" />
          {renderExpressiveEyes(
            expression === 'neutral' ? 'focused' : expression,
            '#E2E8F0',
            accent,
            35,
            35.5,
            44.5
          )}
          <Path d="M35 42L40 44L45 42" fill="none" stroke={accent} strokeWidth="1.2" />
          <Polygon points="40,59 44,64 40,68 36,64" fill={accent} />
        </G>
      )}

      {npcId === 'CLAN_WARDEN' && (
        <G>
          {/* Horned Greathelm */}
          <Path
            d="M27 26C21 23 19 17 21 13C24 17 26 20 30 22"
            fill="none"
            stroke={accent}
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <Path
            d="M53 26C59 23 61 17 59 13C56 17 54 20 50 22"
            fill="none"
            stroke={accent}
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <Path
            d="M28 32C28 22 33 18 40 18C47 18 52 22 52 32V43L40 47L28 43V32Z"
            fill="#212B3D"
            stroke="#475569"
            strokeWidth="1.4"
          />
          {/* Visor Slit & Glowing Eyes */}
          <Rect x="32" y="31.5" width="16" height="4" rx="1.5" fill="#10151F" />
          {renderExpressiveEyes(
            expression === 'happy' ? 'happy' : 'alert',
            accent,
            accent,
            33.5,
            36,
            44
          )}
          {/* Breath Grill */}
          <Path d="M36 39V43M40 39V44M44 39V43" stroke="#475569" strokeWidth="1.3" strokeLinecap="round" />
          <Circle cx="40" cy="64" r="3" fill={accent} />
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
        strokeOpacity={0.4}
        strokeWidth="1.4"
      />
    </Svg>
  );
};

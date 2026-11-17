import React, { useId } from 'react';
import { View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  Polygon,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import {
  EYE_COLOR_OPTIONS,
  HAIR_COLOR_OPTIONS,
  SKIN_PALETTE_OPTIONS,
  type CharacterIdentityConfig,
  type CharacterMorphConfig,
  type CharacterRace,
  type CharacterRigMetrics,
  type EyeColorId,
  type HairColorId,
  type SkinPaletteId,
} from '@goki/game-engine';

export const INK_STROKE = '#0E1118';

export interface ResolvedSkinPalette {
  id: SkinPaletteId;
  baseHex: string;
  shadowHex: string;
  highlightHex: string;
  earInnerHex: string;
}

export interface ResolvedHairColor {
  id: HairColorId;
  primaryHex: string;
  highlightHex: string;
}

const DEFAULT_SKIN: ResolvedSkinPalette = {
  id: 'warm_amber',
  baseHex: '#DDA87F',
  shadowHex: '#B68059',
  highlightHex: '#F2C8A6',
  earInnerHex: '#C7826E',
};

const DEFAULT_HAIR: ResolvedHairColor = {
  id: 'raven_black',
  primaryHex: '#1A1C24',
  highlightHex: '#3A3F52',
};

export function resolveSkinPalette(id: SkinPaletteId): ResolvedSkinPalette {
  return SKIN_PALETTE_OPTIONS.find((opt) => opt.id === id) ?? DEFAULT_SKIN;
}

export function resolveHairColor(id: HairColorId): ResolvedHairColor {
  return HAIR_COLOR_OPTIONS.find((opt) => opt.id === id) ?? DEFAULT_HAIR;
}

export function resolveEyeColorHex(id: EyeColorId): string {
  return EYE_COLOR_OPTIONS.find((opt) => opt.id === id)?.hex ?? '#F59E0B';
}

// ============================================================================
// 1. Aura Backdrop
// ============================================================================

export interface AuraBackdropSvgProps {
  metrics: CharacterRigMetrics;
}

export const AuraBackdropSvg: React.FC<AuraBackdropSvgProps> = ({ metrics }) => {
  const uid = useId().replace(/:/g, '');
  if (!metrics.aura.visible || metrics.aura.tier <= 0) {
    return null;
  }

  const { tier, radiusX, radiusY, primaryHex, secondaryHex } = metrics.aura;
  const svgW = Math.ceil(radiusX * 2.8);
  const svgH = Math.ceil(radiusY * 2.7);
  const minX = -svgW / 2;
  const minY = -svgH / 2;
  const gradId = `auraRad_${uid}`;

  return (
    <Svg
      width={svgW}
      height={svgH}
      viewBox={`${minX} ${minY} ${svgW} ${svgH}`}
      style={{ position: 'absolute', left: minX, top: minY }}
    >
      <Defs>
        <RadialGradient id={gradId} cx="50%" cy="54%" r="50%">
          <Stop offset="0%" stopColor={secondaryHex} stopOpacity={0.42} />
          <Stop offset="55%" stopColor={primaryHex} stopOpacity={0.22} />
          <Stop offset="100%" stopColor={primaryHex} stopOpacity={0} />
        </RadialGradient>
      </Defs>

      {/* Base radial glow */}
      <Ellipse cx={0} cy={0} rx={radiusX * 1.15} ry={radiusY * 1.1} fill={`url(#${gradId})`} />

      {/* Tier 1+: Inner shimmer ring */}
      <Ellipse
        cx={0}
        cy={2}
        rx={radiusX * 0.84}
        ry={radiusY * 0.88}
        fill="none"
        stroke={primaryHex}
        strokeWidth={tier >= 2 ? 2 : 1.4}
        strokeOpacity={tier === 1 ? 0.45 : 0.65}
      />

      {/* Tier 2+: Rising ki currents flanking body */}
      {tier >= 2 && (
        <G>
          <Ellipse
            cx={0}
            cy={0}
            rx={radiusX * 1.02}
            ry={radiusY * 0.98}
            fill="none"
            stroke={secondaryHex}
            strokeWidth={1.3}
            strokeDasharray="10 6"
            strokeOpacity={0.55}
          />
          <Path
            d={`M ${-radiusX * 0.68} ${radiusY * 0.62} Q ${-radiusX * 0.98} ${radiusY * 0.05} ${-radiusX * 0.56} ${-radiusY * 0.65} Q ${-radiusX * 0.72} ${-radiusY * 0.1} ${-radiusX * 0.48} ${radiusY * 0.55} Z`}
            fill={primaryHex}
            fillOpacity={0.26}
          />
          <Path
            d={`M ${radiusX * 0.68} ${radiusY * 0.62} Q ${radiusX * 0.98} ${radiusY * 0.05} ${radiusX * 0.56} ${-radiusY * 0.65} Q ${radiusX * 0.72} ${-radiusY * 0.1} ${radiusX * 0.48} ${radiusY * 0.55} Z`}
            fill={primaryHex}
            fillOpacity={0.26}
          />
        </G>
      )}

      {/* Tier 3: Transcendent flame crown & spirit sparks */}
      {tier >= 3 && (
        <G>
          <Path
            d={`M ${-radiusX * 0.46} ${radiusY * 0.45} C ${-radiusX * 0.96} ${-radiusY * 0.05}, ${-radiusX * 0.65} ${-radiusY * 0.78}, 0 ${-radiusY * 1.08} C ${radiusX * 0.65} ${-radiusY * 0.78}, ${radiusX * 0.96} ${-radiusY * 0.05}, ${radiusX * 0.46} ${radiusY * 0.45} C ${radiusX * 0.64} ${-radiusY * 0.18}, ${radiusX * 0.32} ${-radiusY * 0.64}, 0 ${-radiusY * 0.88} C ${-radiusX * 0.32} ${-radiusY * 0.64}, ${-radiusX * 0.64} ${-radiusY * 0.18}, ${-radiusX * 0.46} ${radiusY * 0.45} Z`}
            fill={secondaryHex}
            fillOpacity={0.34}
            stroke={primaryHex}
            strokeWidth={1.1}
            strokeOpacity={0.6}
          />
          <Circle cx={-radiusX * 0.54} cy={-radiusY * 0.42} r={2.4} fill={secondaryHex} fillOpacity={0.85} />
          <Circle cx={radiusX * 0.58} cy={-radiusY * 0.34} r={2} fill={secondaryHex} fillOpacity={0.85} />
          <Circle cx={0} cy={-radiusY * 0.95} r={2.8} fill="#FFFFFF" fillOpacity={0.82} />
        </G>
      )}
    </Svg>
  );
};

// ============================================================================
// 2. Kitsune Tails
// ============================================================================

export interface KitsuneTailSvgProps {
  metrics: CharacterRigMetrics;
  skinPalette: ResolvedSkinPalette;
  hairColor: ResolvedHairColor;
}

export const KitsuneTailSvg: React.FC<KitsuneTailSvgProps> = ({
  metrics,
  skinPalette,
  hairColor,
}) => {
  const len = Math.max(24, metrics.tails.length);
  const w = Math.max(7, metrics.tails.width);
  const svgW = Math.ceil(w * 3.4);
  const svgH = Math.ceil(len + 16);
  const minX = -svgW / 2;
  const minY = -(len + 8);

  const furBase = skinPalette.baseHex;
  const furShade = skinPalette.shadowHex;
  const tipHex = hairColor.id === 'raven_black' ? '#F8E7C9' : '#FFF7E8';

  return (
    <Svg
      width={svgW}
      height={svgH}
      viewBox={`${minX} ${minY} ${svgW} ${svgH}`}
      style={{ position: 'absolute', left: minX, top: minY }}
    >
      {/* Main plush fox tail silhouette */}
      <Path
        d={`M 0 0 C ${-w * 0.85} ${-len * 0.25}, ${-w * 1.15} ${-len * 0.62}, ${-w * 0.18} ${-len * 0.98} C ${w * 0.12} ${-len * 1.04}, ${w * 0.52} ${-len * 0.88}, ${w * 0.48} ${-len * 0.64} C ${w * 0.92} ${-len * 0.38}, ${w * 0.56} ${-len * 0.14}, ${w * 0.18} 0 Z`}
        fill={furBase}
        stroke={INK_STROKE}
        strokeWidth={1.35}
        strokeLinejoin="round"
      />
      {/* Shadow underside */}
      <Path
        d={`M ${w * 0.1} -2 C ${w * 0.52} ${-len * 0.2}, ${w * 0.68} ${-len * 0.42}, ${w * 0.35} ${-len * 0.65} C ${w * 0.15} ${-len * 0.45}, ${w * 0.14} ${-len * 0.2}, 0 0 Z`}
        fill={furShade}
        fillOpacity={0.55}
      />
      {/* Luminous ivory/gold tail brush tip */}
      <Path
        d={`M ${-w * 0.45} ${-len * 0.66} C ${-w * 0.42} ${-len * 0.86}, ${-w * 0.08} ${-len * 0.99}, ${w * 0.15} ${-len * 0.98} C ${w * 0.44} ${-len * 0.91}, ${w * 0.45} ${-len * 0.72}, ${w * 0.22} ${-len * 0.61} L ${0} ${-len * 0.7} Z`}
        fill={tipHex}
        fillOpacity={0.94}
      />
    </Svg>
  );
};

export interface KitsuneTailsGroupProps {
  metrics: CharacterRigMetrics;
  identity: CharacterIdentityConfig;
}

export const KitsuneTailsGroup: React.FC<KitsuneTailsGroupProps> = ({
  metrics,
  identity,
}) => {
  if (metrics.tails.count <= 0) {
    return null;
  }
  const skin = resolveSkinPalette(identity.skinPalette);
  const hair = resolveHairColor(identity.hairColor);

  return (
    <>
      {metrics.tails.fanAnglesDeg.map((angleDeg, idx) => (
        <View
          key={idx}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: 0,
            height: 0,
            overflow: 'visible',
            transform: [{ rotate: `${-52 + angleDeg}deg` }],
          }}
        >
          <KitsuneTailSvg metrics={metrics} skinPalette={skin} hairColor={hair} />
        </View>
      ))}
    </>
  );
};

// ============================================================================
// 3. Torso + Neck + Muscle / Lean / Scar Morphs
// ============================================================================

export interface TorsoPartSvgProps {
  metrics: CharacterRigMetrics;
  identity: CharacterIdentityConfig;
  morphs: CharacterMorphConfig;
  hasChestArmor: boolean;
  hasLegsArmor: boolean;
}

export const TorsoPartSvg: React.FC<TorsoPartSvgProps> = ({
  metrics,
  identity,
  morphs,
  hasChestArmor,
  hasLegsArmor,
}) => {
  const skin = resolveSkinPalette(identity.skinPalette);
  const { height: h, shoulderSpan, chestWidth, waistSpan } = metrics.torso;
  const neckLen = metrics.head.neckLength;
  const muscle = morphs.muscleMassTier;
  const lean = morphs.leanDefinitionTier;
  const scars = morphs.scarsTier;

  const halfShoulder = shoulderSpan / 2;
  const halfChest = chestWidth / 2;
  const halfWaist = waistSpan / 2;
  const neckHalf = 4.6 + muscle * 0.45;

  const svgW = Math.ceil(Math.max(shoulderSpan, chestWidth) + 26);
  const svgH = Math.ceil(h + neckLen + 22);
  const minX = -svgW / 2;
  const minY = -(h + neckLen + 10);

  // Subtle trapezius rise only when muscle >= 2
  const trapLift = muscle >= 2 ? (muscle - 1) * 1.4 : 0;

  return (
    <Svg
      width={svgW}
      height={svgH}
      viewBox={`${minX} ${minY} ${svgW} ${svgH}`}
      style={{ position: 'absolute', left: minX, top: minY }}
    >
      {/* Neck column extending slightly above head joint so rotation never shows a seam */}
      <Path
        d={`M ${-neckHalf} ${-h + 2} L ${-neckHalf * 0.88} ${-(h + neckLen + 5)} L ${neckHalf * 0.88} ${-(h + neckLen + 5)} L ${neckHalf} ${-h + 2} Z`}
        fill={skin.baseHex}
        stroke={INK_STROKE}
        strokeWidth={1.3}
      />
      {/* Under-chin neck shadow */}
      <Path
        d={`M ${-neckHalf * 0.85} ${-(h + neckLen + 4)} L ${neckHalf * 0.85} ${-(h + neckLen + 4)} L ${neckHalf * 0.72} ${-(h + neckLen - 2)} L ${-neckHalf * 0.72} ${-(h + neckLen - 2)} Z`}
        fill={skin.shadowHex}
        fillOpacity={0.75}
      />

      {/* Base anatomical torso */}
      <Path
        d={`M ${-halfWaist} 2
            L ${-halfChest} ${-h * 0.56}
            Q ${-halfShoulder - 1} ${-h * 0.88} ${-halfShoulder * 0.88} ${-h + 2}
            Q ${-neckHalf * 1.4} ${-h - trapLift} ${-neckHalf} ${-h + 1}
            L ${neckHalf} ${-h + 1}
            Q ${neckHalf * 1.4} ${-h - trapLift} ${halfShoulder * 0.88} ${-h + 2}
            Q ${halfShoulder + 1} ${-h * 0.88} ${halfChest} ${-h * 0.56}
            L ${halfWaist} 2
            Q 0 7 ${-halfWaist} 2 Z`}
        fill={skin.baseHex}
        stroke={INK_STROKE}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />

      {/* Cel shadow along left/back flank */}
      <Path
        d={`M ${-halfWaist + 1} 1
            L ${-halfChest + 1} ${-h * 0.56}
            Q ${-halfShoulder} ${-h * 0.86} ${-halfShoulder * 0.82} ${-h + 3}
            L ${-halfShoulder * 0.45} ${-h + 4}
            L ${-halfChest * 0.48} ${-h * 0.54}
            L ${-halfWaist * 0.5} 2 Z`}
        fill={skin.shadowHex}
        fillOpacity={0.5}
      />

      {/* Clothed Novice Martial Undershirt / Gi-Wrap (when no chest armor is equipped) */}
      {!hasChestArmor && (
        <G>
          {/* Open-collar sleeveless martial tunic covering midsection & ribs while leaving upper chest/shoulders readable */}
          <Path
            d={`M ${-halfWaist - 0.8} 3
                L ${-halfChest * 0.98} ${-h * 0.56}
                L ${-halfShoulder * 0.72} ${-h + 2}
                L ${-neckHalf * 1.15} ${-h + 2}
                L ${1} ${-h * 0.62}
                L ${neckHalf * 1.15} ${-h + 2}
                L ${halfShoulder * 0.72} ${-h + 2}
                L ${halfChest * 0.98} ${-h * 0.56}
                L ${halfWaist + 0.8} 3
                Q 0 8 ${-halfWaist - 0.8} 3 Z`}
            fill="#1E2433"
            stroke={INK_STROKE}
            strokeWidth={1.3}
            strokeLinejoin="round"
          />
          {/* Crimson martial trim along collar */}
          <Path
            d={`M ${-neckHalf * 1.15} ${-h + 2} L ${1} ${-h * 0.62} L ${neckHalf * 1.15} ${-h + 2}`}
            fill="none"
            stroke="#8B2635"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Subtle fabric fold shading */}
          <Path
            d={`M ${-halfWaist * 0.65} 1 L ${-halfChest * 0.5} ${-h * 0.48}`}
            stroke="#111521"
            strokeWidth={1.2}
            strokeOpacity={0.75}
          />
        </G>
      )}

      {/* Progressive Muscle Sculpt Lines (ONLY when muscleMassTier >= 1) */}
      {muscle >= 1 && !hasChestArmor && (
        <G>
          {/* Upper chest / pectoral definition */}
          <Path
            d={`M ${-halfChest * 0.58} ${-h * 0.72} Q ${-halfChest * 0.25} ${-h * 0.65} ${-1.5} ${-h * 0.7}`}
            fill="none"
            stroke={skin.shadowHex}
            strokeWidth={1 + muscle * 0.25}
            strokeLinecap="round"
            strokeOpacity={0.85}
          />
          <Path
            d={`M ${halfChest * 0.62} ${-h * 0.72} Q ${halfChest * 0.28} ${-h * 0.65} ${2.2} ${-h * 0.7}`}
            fill="none"
            stroke={skin.shadowHex}
            strokeWidth={1 + muscle * 0.25}
            strokeLinecap="round"
            strokeOpacity={0.85}
          />
          {muscle >= 2 && (
            <Path
              d={`M ${-halfChest * 0.5} ${-h * 0.84} Q 0 ${-h * 0.8} ${halfChest * 0.5} ${-h * 0.84}`}
              fill="none"
              stroke={skin.highlightHex}
              strokeWidth={1.1}
              strokeOpacity={0.5}
              strokeLinecap="round"
            />
          )}
          {muscle >= 3 && (
            <G>
              {/* Abdominal ridges embossed on fitted wrap */}
              <Path
                d={`M ${-halfWaist * 0.28} ${-h * 0.44} L ${halfWaist * 0.34} ${-h * 0.44} M ${-halfWaist * 0.25} ${-h * 0.3} L ${halfWaist * 0.32} ${-h * 0.3}`}
                stroke="#333C52"
                strokeWidth={1.15}
                strokeLinecap="round"
              />
              <Path
                d={`M 1 ${-h * 0.54} L 1 ${-h * 0.16}`}
                stroke="#111521"
                strokeWidth={1.2}
                strokeLinecap="round"
              />
            </G>
          )}
        </G>
      )}

      {/* Lean V-Taper Definition Cuts (leanDefinitionTier >= 1) */}
      {lean >= 1 && !hasChestArmor && (
        <G>
          <Path
            d={`M ${-halfChest * 0.72} ${-h * 0.48} L ${-halfWaist * 0.54} ${-h * 0.12}`}
            stroke={lean >= 2 ? '#3B445E' : '#2C3347'}
            strokeWidth={0.9 + lean * 0.25}
            strokeLinecap="round"
          />
          <Path
            d={`M ${halfChest * 0.74} ${-h * 0.48} L ${halfWaist * 0.56} ${-h * 0.12}`}
            stroke={lean >= 2 ? '#3B445E' : '#2C3347'}
            strokeWidth={0.9 + lean * 0.25}
            strokeLinecap="round"
          />
        </G>
      )}

      {/* Torso Battle Slash Scars (scarsTier >= 2) */}
      {scars >= 2 && !hasChestArmor && (
        <G>
          <Path
            d={`M ${-halfChest * 0.48} ${-h * 0.86} L ${halfChest * 0.44} ${-h * 0.52}`}
            stroke="#9B3B48"
            strokeWidth={scars >= 3 ? 2 : 1.4}
            strokeLinecap="round"
          />
          {scars >= 3 && (
            <Path
              d={`M ${halfChest * 0.48} ${-h * 0.82} L ${-halfChest * 0.26} ${-h * 0.44}`}
              stroke="#B85360"
              strokeWidth={1.5}
              strokeLinecap="round"
            />
          )}
        </G>
      )}

      {/* Waist Martial Sash / Belt when no chest or leg armor covers the hip seam */}
      {!hasChestArmor && !hasLegsArmor && (
        <G>
          <Rect
            x={-halfWaist - 1.5}
            y={-5}
            width={waistSpan + 3}
            height={7.5}
            rx={2}
            fill="#6E1D2A"
            stroke={INK_STROKE}
            strokeWidth={1.2}
          />
          <Rect
            x={-3.2}
            y={-5.5}
            width={7.4}
            height={8.5}
            rx={1.5}
            fill="#9C7A3C"
            stroke={INK_STROKE}
            strokeWidth={1.1}
          />
        </G>
      )}
    </Svg>
  );
};

// ============================================================================
// 4. Oni Horns + Head / Hair / Ears / Eyes / Face / Scar
// ============================================================================

export interface OniHornsSvgProps {
  metrics: CharacterRigMetrics;
}

export const OniHornsSvg: React.FC<OniHornsSvgProps> = ({ metrics }) => {
  if (!metrics.horns.visible) {
    return null;
  }

  const { tier, length: len, spread, thickness: thick } = metrics.horns;
  const headW = metrics.head.width;
  const headH = metrics.head.height;
  const browY = -headH * 0.82;
  const lx = -headW * 0.26;
  const rx = headW * 0.28;

  const hornFill = tier >= 3 ? '#F4D58D' : tier === 2 ? '#D9C39E' : '#CFC7B8';
  const hornShade = tier >= 3 ? '#B4822C' : '#8A7B66';

  if (tier === 0) {
    // Nascent starter horn buds
    return (
      <G>
        <Path
          d={`M ${lx - thick * 0.45} ${browY} Q ${lx - spread * 0.2} ${browY - len * 0.9} ${lx - spread * 0.12} ${browY - len} Q ${lx + thick * 0.3} ${browY - len * 0.4} ${lx + thick * 0.45} ${browY} Z`}
          fill={hornFill}
          stroke={INK_STROKE}
          strokeWidth={1.1}
        />
        <Path
          d={`M ${rx - thick * 0.45} ${browY} Q ${rx - thick * 0.1} ${browY - len * 0.5} ${rx + spread * 0.22} ${browY - len} Q ${rx + spread * 0.32} ${browY - len * 0.5} ${rx + thick * 0.45} ${browY} Z`}
          fill={hornFill}
          stroke={INK_STROKE}
          strokeWidth={1.1}
        />
      </G>
    );
  }

  return (
    <G>
      {/* Left swept horn */}
      <Path
        d={`M ${lx - thick * 0.55} ${browY + 1} C ${lx - spread * 0.65} ${browY - len * 0.35}, ${lx - spread * 0.9} ${browY - len * 0.85}, ${lx - spread * 0.42} ${browY - len * 1.15} C ${lx - spread * 0.5} ${browY - len * 0.65}, ${lx - thick * 0.15} ${browY - len * 0.35}, ${lx + thick * 0.42} ${browY} Z`}
        fill={hornFill}
        stroke={INK_STROKE}
        strokeWidth={1.25}
        strokeLinejoin="round"
      />
      <Path
        d={`M ${lx - thick * 0.2} ${browY} C ${lx - spread * 0.45} ${browY - len * 0.4}, ${lx - spread * 0.52} ${browY - len * 0.72}, ${lx - spread * 0.42} ${browY - len * 1.05}`}
        fill="none"
        stroke={hornShade}
        strokeWidth={1.1}
      />

      {/* Right swept horn */}
      <Path
        d={`M ${rx - thick * 0.42} ${browY} C ${rx + thick * 0.18} ${browY - len * 0.35}, ${rx + spread * 0.52} ${browY - len * 0.65}, ${rx + spread * 0.55} ${browY - len * 1.18} C ${rx + spread * 0.95} ${browY - len * 0.85}, ${rx + spread * 0.7} ${browY - len * 0.35}, ${rx + thick * 0.55} ${browY + 1} Z`}
        fill={hornFill}
        stroke={INK_STROKE}
        strokeWidth={1.25}
        strokeLinejoin="round"
      />

      {/* Tier 2-3 ridge bands & crown crest */}
      {tier >= 2 && (
        <G>
          <Path
            d={`M ${lx - spread * 0.34} ${browY - len * 0.36} L ${lx - spread * 0.18} ${browY - len * 0.46} M ${rx + spread * 0.26} ${browY - len * 0.36} L ${rx + spread * 0.44} ${browY - len * 0.48}`}
            stroke={hornShade}
            strokeWidth={1.3}
            strokeLinecap="round"
          />
          <Path
            d={`M ${lx - spread * 0.52} ${browY - len * 0.66} L ${lx - spread * 0.34} ${browY - len * 0.76} M ${rx + spread * 0.42} ${browY - len * 0.66} L ${rx + spread * 0.6} ${browY - len * 0.78}`}
            stroke={hornShade}
            strokeWidth={1.2}
            strokeLinecap="round"
          />
        </G>
      )}

      {tier >= 3 && (
        <Path
          d={`M ${-3} ${browY + 1} L 0 ${browY - len * 0.52} L ${3.5} ${browY + 1} Z`}
          fill="#F59E0B"
          stroke={INK_STROKE}
          strokeWidth={1.1}
        />
      )}
    </G>
  );
};

export const OniHornsLayerSvg: React.FC<OniHornsSvgProps> = ({ metrics }) => {
  if (!metrics.horns.visible) {
    return null;
  }
  const w = metrics.head.width;
  const h = metrics.head.height;
  const svgW = Math.ceil(w * 3.1);
  const svgH = Math.ceil(h * 2.55);
  const minX = -svgW / 2;
  const minY = -h * 2.15;

  return (
    <Svg
      width={svgW}
      height={svgH}
      viewBox={`${minX} ${minY} ${svgW} ${svgH}`}
      style={{ position: 'absolute', left: minX, top: minY }}
    >
      <OniHornsSvg metrics={metrics} />
    </Svg>
  );
};

export interface HeadPartSvgProps {
  race: CharacterRace;
  metrics: CharacterRigMetrics;
  identity: CharacterIdentityConfig;
  morphs: CharacterMorphConfig;
  hideHairTop?: boolean;
  showHorns?: boolean;
}

export const HeadPartSvg: React.FC<HeadPartSvgProps> = ({
  race,
  metrics,
  identity,
  morphs,
  hideHairTop = false,
  showHorns = true,
}) => {
  const skin = resolveSkinPalette(identity.skinPalette);
  const hair = resolveHairColor(identity.hairColor);
  const eyeHex = resolveEyeColorHex(identity.eyeColor);

  const w = metrics.head.width;
  const h = metrics.head.height;
  const halfW = w / 2;

  const svgW = Math.ceil(w * 3.1);
  const svgH = Math.ceil(h * 2.55);
  const minX = -svgW / 2;
  const minY = -h * 2.15;

  const eyeY = -h * 0.47;
  const leftEyeX = -halfW * 0.22;
  const rightEyeX = halfW * 0.48;
  const mouthY = -h * 0.16;

  return (
    <Svg
      width={svgW}
      height={svgH}
      viewBox={`${minX} ${minY} ${svgW} ${svgH}`}
      style={{ position: 'absolute', left: minX, top: minY }}
    >
      {/* 1. Back Hair Layer */}
      {!hideHairTop && identity.hairStyle === 'flowing_mane' && (
        <Path
          d={`M ${-halfW * 1.15} ${-h * 0.72} C ${-halfW * 1.75} ${-h * 0.25}, ${-halfW * 1.85} ${h * 0.35}, ${-halfW * 1.15} ${h * 0.65} L ${-halfW * 0.45} ${h * 0.2} L ${halfW * 0.3} ${-h * 0.5} Z`}
          fill={hair.primaryHex}
          stroke={INK_STROKE}
          strokeWidth={1.3}
          strokeLinejoin="round"
        />
      )}
      {!hideHairTop && identity.hairStyle === 'braided_crest' && (
        <Path
          d={`M ${-halfW * 0.85} ${-h * 0.78} C ${-halfW * 1.45} ${-h * 0.4}, ${-halfW * 1.38} ${h * 0.15}, ${-halfW * 1.05} ${h * 0.45} L ${-halfW * 0.75} ${h * 0.32} C ${-halfW * 0.95} 0, ${-halfW * 0.88} ${-h * 0.42}, ${-halfW * 0.5} ${-h * 0.65} Z`}
          fill={hair.primaryHex}
          stroke={INK_STROKE}
          strokeWidth={1.2}
        />
      )}
      {!hideHairTop && identity.hairStyle === 'ronin_topknot' && (
        <G>
          <Path
            d={`M ${-halfW * 0.55} ${-h * 0.95} C ${-halfW * 1.25} ${-h * 1.25}, ${-halfW * 1.45} ${-h * 0.8}, ${-halfW * 1.12} ${-h * 0.48} C ${-halfW * 0.9} ${-h * 0.65}, ${-halfW * 0.68} ${-h * 0.78}, ${-halfW * 0.42} ${-h * 0.82} Z`}
            fill={hair.primaryHex}
            stroke={INK_STROKE}
            strokeWidth={1.25}
          />
          <Rect
            x={-halfW * 0.74}
            y={-h * 1.02}
            width={4}
            height={5}
            rx={1.5}
            fill="#B91C1C"
            stroke={INK_STROKE}
            strokeWidth={0.9}
          />
        </G>
      )}

      {/* 2. Kitsune Upright Fox Ears (behind front hair, on crown) */}
      {race === 'KITSUNE' && (
        <G>
          <Path
            d={`M ${-halfW * 0.78} ${-h * 0.75} L ${-halfW * 1.08} ${-h * 1.52} L ${-halfW * 0.22} ${-h * 0.94} Z`}
            fill={skin.baseHex}
            stroke={INK_STROKE}
            strokeWidth={1.3}
            strokeLinejoin="round"
          />
          <Path
            d={`M ${-halfW * 0.7} ${-h * 0.82} L ${-halfW * 0.94} ${-h * 1.32} L ${-halfW * 0.36} ${-h * 0.94} Z`}
            fill={skin.earInnerHex}
          />
          <Path
            d={`M ${halfW * 0.12} ${-h * 0.92} L ${halfW * 0.68} ${-h * 1.52} L ${halfW * 0.72} ${-h * 0.76} Z`}
            fill={skin.baseHex}
            stroke={INK_STROKE}
            strokeWidth={1.3}
            strokeLinejoin="round"
          />
          <Path
            d={`M ${halfW * 0.24} ${-h * 0.92} L ${halfW * 0.6} ${-h * 1.32} L ${halfW * 0.6} ${-h * 0.82} Z`}
            fill={skin.earInnerHex}
          />
        </G>
      )}

      {/* 3. Head / Jaw Cranium */}
      <Path
        d={`M ${-halfW * 0.86} ${-h * 0.68}
            C ${-halfW * 0.94} ${-h * 1.05}, ${halfW * 0.86} ${-h * 1.05}, ${halfW * 0.88} ${-h * 0.6}
            L ${halfW * 0.92} ${-h * 0.24}
            Q ${halfW * 0.7} 2 ${halfW * 0.14} 3
            Q ${-halfW * 0.54} 2 ${-halfW * 0.84} ${-h * 0.24} Z`}
        fill={skin.baseHex}
        stroke={INK_STROKE}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />

      {/* Jawline & back-cheek cel shadow */}
      <Path
        d={`M ${-halfW * 0.82} ${-h * 0.62} L ${-halfW * 0.8} ${-h * 0.25} Q ${-halfW * 0.48} 1 ${halfW * 0.14} 2 Q ${-halfW * 0.26} -2 ${-halfW * 0.44} ${-h * 0.26} L ${-halfW * 0.56} ${-h * 0.68} Z`}
        fill={skin.shadowHex}
        fillOpacity={0.55}
      />

      {/* Side Ears for Human / Oni */}
      {race === 'HUMAN' && (
        <Path
          d={`M ${-halfW * 0.82} ${-h * 0.5} C ${-halfW * 1.15} ${-h * 0.52}, ${-halfW * 1.15} ${-h * 0.22}, ${-halfW * 0.8} ${-h * 0.24}`}
          fill={skin.baseHex}
          stroke={INK_STROKE}
          strokeWidth={1.2}
        />
      )}
      {race === 'ONI' && (
        <G>
          <Path
            d={`M ${-halfW * 0.82} ${-h * 0.52} L ${-halfW * 1.38} ${-h * 0.64} L ${-halfW * 0.8} ${-h * 0.22} Z`}
            fill={skin.baseHex}
            stroke={INK_STROKE}
            strokeWidth={1.25}
            strokeLinejoin="round"
          />
          <Path
            d={`M ${-halfW * 0.86} ${-h * 0.46} L ${-halfW * 1.18} ${-h * 0.54} L ${-halfW * 0.84} ${-h * 0.3} Z`}
            fill={skin.earInnerHex}
          />
        </G>
      )}

      {/* 4. Cheek / Brow Battle Scar (scarsTier >= 1) */}
      {morphs.scarsTier >= 1 && (
        <G>
          <Path
            d={`M ${rightEyeX - 2.6} ${eyeY - 4.2} L ${rightEyeX + 1.8} ${eyeY + 4.4}`}
            stroke="#8F2D3A"
            strokeWidth={morphs.scarsTier >= 3 ? 1.65 : 1.15}
            strokeLinecap="round"
          />
          {morphs.scarsTier >= 3 && (
            <Path
              d={`M ${-halfW * 0.38} ${-h * 0.28} L ${-halfW * 0.06} ${-h * 0.14}`}
              stroke="#8F2D3A"
              strokeWidth={1.3}
              strokeLinecap="round"
            />
          )}
        </G>
      )}

      {/* 5. Eyes & Brows */}
      <G>
        {/* Mystic aura glow behind eyes */}
        {identity.eyeStyle === 'mystic_glow' && (
          <G>
            <Circle cx={leftEyeX} cy={eyeY} r={4.2} fill={eyeHex} fillOpacity={0.38} />
            <Circle cx={rightEyeX} cy={eyeY} r={4.2} fill={eyeHex} fillOpacity={0.38} />
          </G>
        )}

        {/* Sclera */}
        <Ellipse
          cx={leftEyeX}
          cy={eyeY}
          rx={identity.eyeStyle === 'noble' ? 2.5 : 2.7}
          ry={identity.eyeStyle === 'sharp' || identity.eyeStyle === 'slit_predator' ? 1.6 : 2}
          fill={identity.eyeStyle === 'mystic_glow' ? eyeHex : '#F8FAFC'}
          stroke={INK_STROKE}
          strokeWidth={0.95}
        />
        <Ellipse
          cx={rightEyeX}
          cy={eyeY}
          rx={identity.eyeStyle === 'noble' ? 2.3 : 2.5}
          ry={identity.eyeStyle === 'sharp' || identity.eyeStyle === 'slit_predator' ? 1.55 : 1.9}
          fill={identity.eyeStyle === 'mystic_glow' ? eyeHex : '#F8FAFC'}
          stroke={INK_STROKE}
          strokeWidth={0.95}
        />

        {/* Iris */}
        <Circle cx={leftEyeX + 0.6} cy={eyeY} r={1.35} fill={eyeHex} />
        <Circle cx={rightEyeX + 0.5} cy={eyeY} r={1.25} fill={eyeHex} />

        {/* Pupil */}
        {identity.eyeStyle === 'slit_predator' ? (
          <G>
            <Rect x={leftEyeX + 0.2} y={eyeY - 1.3} width={0.9} height={2.6} rx={0.4} fill={INK_STROKE} />
            <Rect x={rightEyeX + 0.1} y={eyeY - 1.2} width={0.85} height={2.4} rx={0.4} fill={INK_STROKE} />
          </G>
        ) : (
          <G>
            <Circle cx={leftEyeX + 0.7} cy={eyeY} r={0.65} fill={INK_STROKE} />
            <Circle cx={rightEyeX + 0.6} cy={eyeY} r={0.6} fill={INK_STROKE} />
          </G>
        )}

        {/* Eyebrows reflecting faceStyle */}
        {identity.faceStyle === 'fierce' || identity.faceStyle === 'battle_grin' ? (
          <G>
            <Path
              d={`M ${leftEyeX - 3.2} ${eyeY - 3.4} L ${leftEyeX + 2.6} ${eyeY - 2.1}`}
              stroke={hair.primaryHex}
              strokeWidth={1.65}
              strokeLinecap="round"
            />
            <Path
              d={`M ${rightEyeX - 2} ${eyeY - 2.1} L ${rightEyeX + 3} ${eyeY - 3.4}`}
              stroke={hair.primaryHex}
              strokeWidth={1.65}
              strokeLinecap="round"
            />
          </G>
        ) : identity.faceStyle === 'serene' ? (
          <G>
            <Path
              d={`M ${leftEyeX - 2.8} ${eyeY - 3.2} Q ${leftEyeX} ${eyeY - 4.2} ${leftEyeX + 2.4} ${eyeY - 3.2}`}
              fill="none"
              stroke={hair.primaryHex}
              strokeWidth={1.3}
              strokeLinecap="round"
            />
            <Path
              d={`M ${rightEyeX - 2.2} ${eyeY - 3.2} Q ${rightEyeX} ${eyeY - 4.2} ${rightEyeX + 2.6} ${eyeY - 3.1}`}
              fill="none"
              stroke={hair.primaryHex}
              strokeWidth={1.3}
              strokeLinecap="round"
            />
          </G>
        ) : (
          <G>
            <Path
              d={`M ${leftEyeX - 2.9} ${eyeY - 3} L ${leftEyeX + 2.5} ${eyeY - 2.7}`}
              stroke={hair.primaryHex}
              strokeWidth={1.5}
              strokeLinecap="round"
            />
            <Path
              d={`M ${rightEyeX - 2.1} ${eyeY - 2.7} L ${rightEyeX + 2.8} ${eyeY - 3}`}
              stroke={hair.primaryHex}
              strokeWidth={1.5}
              strokeLinecap="round"
            />
          </G>
        )}
      </G>

      {/* Nose bridge */}
      <Path
        d={`M ${halfW * 0.18} ${eyeY + 0.5} L ${halfW * 0.34} ${eyeY + 4.4} L ${halfW * 0.14} ${eyeY + 5}`}
        fill="none"
        stroke={skin.shadowHex}
        strokeWidth={1.15}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* 6. Mouth & Oni Fangs */}
      <G>
        {identity.faceStyle === 'battle_grin' ? (
          <G>
            <Path
              d={`M ${-halfW * 0.08} ${mouthY} Q ${halfW * 0.26} ${mouthY + 2.8} ${halfW * 0.58} ${mouthY - 0.8} Q ${halfW * 0.25} ${mouthY + 1.1} ${-halfW * 0.08} ${mouthY} Z`}
              fill="#F8FAFC"
              stroke={INK_STROKE}
              strokeWidth={0.95}
            />
            {race === 'ONI' && (
              <G>
                <Polygon
                  points={`${halfW * 0.02},${mouthY + 0.5} ${halfW * 0.09},${mouthY - 1.8} ${halfW * 0.16},${mouthY + 0.8}`}
                  fill="#FFFBEB"
                />
                <Polygon
                  points={`${halfW * 0.42},${mouthY + 0.4} ${halfW * 0.49},${mouthY - 1.9} ${halfW * 0.55},${mouthY + 0.2}`}
                  fill="#FFFBEB"
                />
              </G>
            )}
          </G>
        ) : identity.faceStyle === 'serene' ? (
          <Path
            d={`M ${-halfW * 0.02} ${mouthY} Q ${halfW * 0.24} ${mouthY + 1.4} ${halfW * 0.46} ${mouthY - 0.3}`}
            fill="none"
            stroke={INK_STROKE}
            strokeWidth={1.1}
            strokeLinecap="round"
          />
        ) : identity.faceStyle === 'fierce' ? (
          <G>
            <Path
              d={`M ${-halfW * 0.06} ${mouthY + 0.5} Q ${halfW * 0.22} ${mouthY - 1.1} ${halfW * 0.5} ${mouthY + 0.6}`}
              fill="none"
              stroke={INK_STROKE}
              strokeWidth={1.3}
              strokeLinecap="round"
            />
            {race === 'ONI' && (
              <Polygon
                points={`${halfW * 0.34},${mouthY + 0.2} ${halfW * 0.41},${mouthY - 2.1} ${halfW * 0.47},${mouthY + 0.4}`}
                fill="#FFFBEB"
                stroke={INK_STROKE}
                strokeWidth={0.6}
              />
            )}
          </G>
        ) : (
          <Path
            d={`M ${-halfW * 0.04} ${mouthY} L ${halfW * 0.46} ${mouthY}`}
            stroke={INK_STROKE}
            strokeWidth={1.25}
            strokeLinecap="round"
          />
        )}
      </G>

      {/* 7. Oni Horns (rendered on brow/crown) */}
      {showHorns && <OniHornsSvg metrics={metrics} />}

      {/* 8. Front Hair Styles */}
      {!hideHairTop && identity.hairStyle === 'ronin_topknot' && (
        <G>
          <Path
            d={`M ${-halfW * 0.92} ${-h * 0.6} C ${-halfW * 0.95} ${-h * 1.06}, ${halfW * 0.85} ${-h * 1.08}, ${halfW * 0.88} ${-h * 0.65} Q ${halfW * 0.35} ${-h * 0.78} ${-halfW * 0.25} ${-h * 0.68} L ${-halfW * 0.62} ${-h * 0.44} Z`}
            fill={hair.primaryHex}
            stroke={INK_STROKE}
            strokeWidth={1.3}
            strokeLinejoin="round"
          />
          <Path
            d={`M ${-halfW * 0.35} ${-h * 0.9} Q ${halfW * 0.25} ${-h * 0.95} ${halfW * 0.62} ${-h * 0.76}`}
            fill="none"
            stroke={hair.highlightHex}
            strokeWidth={1.4}
            strokeLinecap="round"
          />
        </G>
      )}

      {!hideHairTop && identity.hairStyle === 'windswept_short' && (
        <G>
          <Path
            d={`M ${-halfW * 0.95} ${-h * 0.52} C ${-halfW * 1.15} ${-h * 0.98}, ${-halfW * 0.2} ${-h * 1.24}, ${halfW * 0.68} ${-h * 0.98} L ${halfW * 1.08} ${-h * 0.72} L ${halfW * 0.64} ${-h * 0.68} L ${halfW * 0.88} ${-h * 0.54} L ${halfW * 0.36} ${-h * 0.66} L ${halfW * 0.02} ${-h * 0.55} L ${-halfW * 0.35} ${-h * 0.68} L ${-halfW * 0.68} ${-h * 0.42} Z`}
            fill={hair.primaryHex}
            stroke={INK_STROKE}
            strokeWidth={1.3}
            strokeLinejoin="round"
          />
          <Path
            d={`M ${-halfW * 0.35} ${-h * 0.96} L ${halfW * 0.52} ${-h * 0.88}`}
            stroke={hair.highlightHex}
            strokeWidth={1.35}
            strokeLinecap="round"
          />
        </G>
      )}

      {!hideHairTop && identity.hairStyle === 'braided_crest' && (
        <G>
          <Path
            d={`M ${-halfW * 0.9} ${-h * 0.64} C ${-halfW * 0.85} ${-h * 1.12}, ${halfW * 0.7} ${-h * 1.15}, ${halfW * 0.86} ${-h * 0.68} Q ${halfW * 0.25} ${-h * 0.8} ${-halfW * 0.65} ${-h * 0.6} Z`}
            fill={hair.primaryHex}
            stroke={INK_STROKE}
            strokeWidth={1.25}
          />
          <Path
            d={`M ${-halfW * 0.45} ${-h * 0.98} Q ${halfW * 0.1} ${-h * 1.1} ${halfW * 0.52} ${-h * 0.86}`}
            fill="none"
            stroke={hair.highlightHex}
            strokeWidth={2}
            strokeDasharray="3 2"
            strokeLinecap="round"
          />
        </G>
      )}

      {!hideHairTop && identity.hairStyle === 'flowing_mane' && (
        <G>
          <Path
            d={`M ${-halfW * 0.95} ${-h * 0.56} C ${-halfW * 0.9} ${-h * 1.12}, ${halfW * 0.78} ${-h * 1.14}, ${halfW * 0.92} ${-h * 0.64} L ${halfW * 0.62} ${-h * 0.58} L ${halfW * 0.34} ${-h * 0.72} L ${0} ${-h * 0.56} L ${-halfW * 0.48} ${-h * 0.68} Z`}
            fill={hair.primaryHex}
            stroke={INK_STROKE}
            strokeWidth={1.3}
            strokeLinejoin="round"
          />
          <Path
            d={`M ${-halfW * 0.4} ${-h * 0.92} Q ${halfW * 0.15} ${-h * 0.98} ${halfW * 0.66} ${-h * 0.78}`}
            fill="none"
            stroke={hair.highlightHex}
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        </G>
      )}

      {!hideHairTop && identity.hairStyle === 'cropped_fade' && (
        <Path
          d={`M ${-halfW * 0.86} ${-h * 0.66} C ${-halfW * 0.84} ${-h * 1.06}, ${halfW * 0.82} ${-h * 1.08}, ${halfW * 0.86} ${-h * 0.68} Q ${halfW * 0.28} ${-h * 0.78} ${-halfW * 0.52} ${-h * 0.7} L ${-halfW * 0.78} ${-h * 0.52} Z`}
          fill={hair.primaryHex}
          stroke={INK_STROKE}
          strokeWidth={1.2}
        />
      )}

      {!hideHairTop && identity.hairStyle === 'shaved_monk' && (
        <Path
          d={`M ${-halfW * 0.42} ${-h * 0.92} Q 0 ${-h * 1.0} ${halfW * 0.45} ${-h * 0.86}`}
          fill="none"
          stroke={skin.highlightHex}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeOpacity={0.65}
        />
      )}
    </Svg>
  );
};

// ============================================================================
// 5. Upper Arm & Forearm
// ============================================================================

export interface UpperArmPartSvgProps {
  metrics: CharacterRigMetrics;
  identity: CharacterIdentityConfig;
  morphs: CharacterMorphConfig;
  isFront?: boolean;
}

export const UpperArmPartSvg: React.FC<UpperArmPartSvgProps> = ({
  metrics,
  identity,
  morphs,
  isFront = true,
}) => {
  const skin = resolveSkinPalette(identity.skinPalette);
  const { length: len, width: w, bicepBulk } = metrics.upperArm;
  const halfW = w / 2;
  const bicepBulge = halfW + bicepBulk * 2.2;

  const svgW = Math.ceil(w * 2.4 + 12);
  const svgH = Math.ceil(len + 18);
  const minX = -svgW / 2;
  const minY = -9;

  return (
    <Svg
      width={svgW}
      height={svgH}
      viewBox={`${minX} ${minY} ${svgW} ${svgH}`}
      style={{ position: 'absolute', left: minX, top: minY }}
    >
      <Path
        d={`M ${-halfW * 0.95} 0
            C ${-halfW * 1.08} ${-halfW * 0.85}, ${halfW * 1.08} ${-halfW * 0.85}, ${halfW * 0.95} 0
            C ${bicepBulge * 1.06} ${len * 0.42}, ${halfW * 0.92} ${len * 0.82}, ${halfW * 0.72} ${len}
            Q 0 ${len + 3.5} ${-halfW * 0.72} ${len}
            C ${-halfW * 0.94} ${len * 0.74}, ${-halfW * 1.02} ${len * 0.36}, ${-halfW * 0.95} 0 Z`}
        fill={isFront ? skin.baseHex : skin.shadowHex}
        stroke={INK_STROKE}
        strokeWidth={1.4}
        strokeLinejoin="round"
      />

      {/* Highlight along deltoid / front bicep */}
      <Path
        d={`M ${halfW * 0.35} ${len * 0.14} Q ${bicepBulge * 0.72} ${len * 0.46} ${halfW * 0.42} ${len * 0.8}`}
        fill="none"
        stroke={isFront ? skin.highlightHex : skin.baseHex}
        strokeWidth={1.2}
        strokeOpacity={0.55}
        strokeLinecap="round"
      />

      {/* Shoulder/Bicep Battle Scar at scarsTier >= 3 */}
      {isFront && morphs.scarsTier >= 3 && (
        <Path
          d={`M ${-halfW * 0.48} ${len * 0.18} L ${halfW * 0.6} ${len * 0.46}`}
          stroke="#9B3B48"
          strokeWidth={1.55}
          strokeLinecap="round"
        />
      )}

      {/* Bicep Vascularity Vein at vascularityTier >= 2 */}
      {isFront && morphs.vascularityTier >= 2 && (
        <Path
          d={`M ${halfW * 0.18} ${len * 0.28} Q ${halfW * 0.46} ${len * 0.52} ${halfW * 0.14} ${len * 0.78}`}
          fill="none"
          stroke={skin.shadowHex}
          strokeWidth={1.05}
          strokeOpacity={0.78}
          strokeLinecap="round"
        />
      )}
    </Svg>
  );
};

export interface ForearmPartSvgProps {
  metrics: CharacterRigMetrics;
  identity: CharacterIdentityConfig;
  morphs: CharacterMorphConfig;
  isFront?: boolean;
}

export const ForearmPartSvg: React.FC<ForearmPartSvgProps> = ({
  metrics,
  identity,
  morphs,
  isFront = true,
}) => {
  const skin = resolveSkinPalette(identity.skinPalette);
  const { length: len, width: w } = metrics.forearm;
  const halfW = w / 2;
  const wristHalf = halfW * 0.72;
  const fistR = Math.max(4.4, wristHalf * 1.18);

  const svgW = Math.ceil(w * 2.5 + 14);
  const svgH = Math.ceil(len + fistR * 2 + 12);
  const minX = -svgW / 2;
  const minY = -8;

  return (
    <Svg
      width={svgW}
      height={svgH}
      viewBox={`${minX} ${minY} ${svgW} ${svgH}`}
      style={{ position: 'absolute', left: minX, top: minY }}
    >
      {/* Forearm body */}
      <Path
        d={`M ${-halfW * 0.85} 0
            Q 0 ${-halfW * 0.65} ${halfW * 0.85} 0
            C ${halfW * 1.05} ${len * 0.3}, ${wristHalf * 1.15} ${len * 0.72}, ${wristHalf} ${len - 2}
            L ${-wristHalf} ${len - 2}
            C ${-halfW * 0.92} ${len * 0.68}, ${-halfW * 1.05} ${len * 0.3}, ${-halfW * 0.85} 0 Z`}
        fill={isFront ? skin.baseHex : skin.shadowHex}
        stroke={INK_STROKE}
        strokeWidth={1.35}
        strokeLinejoin="round"
      />

      {/* Forearm conditioning vascularity (END tier >= 1, stronger at 2) */}
      {isFront && morphs.vascularityTier >= 1 && (
        <G>
          <Path
            d={`M ${halfW * 0.25} ${len * 0.2} Q ${halfW * 0.45} ${len * 0.48} ${wristHalf * 0.2} ${len * 0.72}`}
            fill="none"
            stroke={skin.shadowHex}
            strokeWidth={morphs.vascularityTier >= 2 ? 1.2 : 0.85}
            strokeOpacity={morphs.vascularityTier >= 2 ? 0.85 : 0.6}
            strokeLinecap="round"
          />
          {morphs.vascularityTier >= 2 && (
            <Path
              d={`M ${-halfW * 0.15} ${len * 0.32} Q ${halfW * 0.18} ${len * 0.56} ${-wristHalf * 0.18} ${len * 0.76}`}
              fill="none"
              stroke={skin.shadowHex}
              strokeWidth={1}
              strokeOpacity={0.72}
              strokeLinecap="round"
            />
          )}
        </G>
      )}

      {/* Martial Cloth Wrist Wrap */}
      <Rect
        x={-wristHalf - 0.8}
        y={len - 7.5}
        width={wristHalf * 2 + 1.6}
        height={6}
        rx={1.5}
        fill="#272D3D"
        stroke={INK_STROKE}
        strokeWidth={1}
      />

      {/* Clenched Fist centered at hand grip (0, len) */}
      <Circle
        cx={0}
        cy={len}
        r={fistR}
        fill={isFront ? skin.baseHex : skin.shadowHex}
        stroke={INK_STROKE}
        strokeWidth={1.35}
      />
      <Path
        d={`M ${-fistR * 0.45} ${len - 0.6} L ${fistR * 0.55} ${len - 0.6}`}
        stroke={skin.shadowHex}
        strokeWidth={1}
        strokeLinecap="round"
      />
    </Svg>
  );
};

// ============================================================================
// 6. Thigh & Shin
// ============================================================================

export interface ThighPartSvgProps {
  metrics: CharacterRigMetrics;
  identity: CharacterIdentityConfig;
  hasLegsArmor: boolean;
  isFront?: boolean;
}

export const ThighPartSvg: React.FC<ThighPartSvgProps> = ({
  metrics,
  identity,
  hasLegsArmor,
  isFront = true,
}) => {
  const skin = resolveSkinPalette(identity.skinPalette);
  const { length: len, width: w, quadBulk } = metrics.thigh;
  const halfW = w / 2;
  const quadBulge = halfW + quadBulk * 2.4;

  const svgW = Math.ceil(w * 2.4 + 14);
  const svgH = Math.ceil(len + 18);
  const minX = -svgW / 2;
  const minY = -10;

  const fillHex = hasLegsArmor
    ? isFront
      ? skin.baseHex
      : skin.shadowHex
    : isFront
    ? '#222838'
    : '#171B26';

  return (
    <Svg
      width={svgW}
      height={svgH}
      viewBox={`${minX} ${minY} ${svgW} ${svgH}`}
      style={{ position: 'absolute', left: minX, top: minY }}
    >
      <Path
        d={`M ${-halfW * 0.96} 0
            Q 0 ${-halfW * 0.72} ${halfW * 0.96} 0
            C ${quadBulge * 1.05} ${len * 0.36}, ${halfW * 0.92} ${len * 0.76}, ${halfW * 0.68} ${len}
            Q 0 ${len + 3.5} ${-halfW * 0.68} ${len}
            C ${-halfW * 0.92} ${len * 0.72}, ${-halfW * 1.02} ${len * 0.32}, ${-halfW * 0.96} 0 Z`}
        fill={fillHex}
        stroke={INK_STROKE}
        strokeWidth={1.45}
        strokeLinejoin="round"
      />

      {!hasLegsArmor && (
        <Path
          d={`M ${halfW * 0.3} ${len * 0.22} Q ${quadBulge * 0.5} ${len * 0.55} ${halfW * 0.28} ${len * 0.85}`}
          fill="none"
          stroke={isFront ? '#353F57' : '#242B3B'}
          strokeWidth={1.3}
          strokeLinecap="round"
        />
      )}
    </Svg>
  );
};

export interface ShinPartSvgProps {
  metrics: CharacterRigMetrics;
  identity: CharacterIdentityConfig;
  hasBootsArmor: boolean;
  isFront?: boolean;
}

export const ShinPartSvg: React.FC<ShinPartSvgProps> = ({
  metrics,
  identity,
  hasBootsArmor,
  isFront = true,
}) => {
  const skin = resolveSkinPalette(identity.skinPalette);
  const { length: len, width: w } = metrics.shin;
  const halfW = w / 2;
  const ankleHalf = halfW * 0.62;

  const svgW = Math.ceil(w * 2.8 + 20);
  const svgH = Math.ceil(len + 18);
  const minX = -svgW * 0.42;
  const minY = -9;

  const legFill = hasBootsArmor
    ? isFront
      ? skin.baseHex
      : skin.shadowHex
    : isFront
    ? '#222838'
    : '#171B26';

  return (
    <Svg
      width={svgW}
      height={svgH}
      viewBox={`${minX} ${minY} ${svgW} ${svgH}`}
      style={{ position: 'absolute', left: minX, top: minY }}
    >
      {/* Shin / Calf */}
      <Path
        d={`M ${-halfW * 0.82} 0
            Q 0 ${-halfW * 0.65} ${halfW * 0.82} 0
            C ${halfW * 0.95} ${len * 0.28}, ${ankleHalf * 1.15} ${len * 0.72}, ${ankleHalf} ${len - 5}
            L ${-ankleHalf} ${len - 5}
            C ${-halfW * 1.15} ${len * 0.42}, ${-halfW * 1.05} ${len * 0.18}, ${-halfW * 0.82} 0 Z`}
        fill={legFill}
        stroke={INK_STROKE}
        strokeWidth={1.4}
        strokeLinejoin="round"
      />

      {/* Novice Cloth Shin Wraps & Martial Sandal when no boots are equipped */}
      {!hasBootsArmor && (
        <G>
          {/* Shin bandaged wraps */}
          <Path
            d={`M ${-ankleHalf * 1.25} ${len * 0.56} L ${ankleHalf * 1.25} ${len * 0.52} L ${ankleHalf * 1.1} ${len * 0.84} L ${-ankleHalf * 1.1} ${len * 0.88} Z`}
            fill={isFront ? '#3A4256' : '#262C3A'}
            stroke={INK_STROKE}
            strokeWidth={1.1}
          />
          <Path
            d={`M ${-ankleHalf * 1.18} ${len * 0.67} L ${ankleHalf * 1.18} ${len * 0.63} M ${-ankleHalf * 1.14} ${len * 0.78} L ${ankleHalf * 1.14} ${len * 0.74}`}
            stroke={INK_STROKE}
            strokeWidth={0.95}
          />
          {/* Foot / Martial Sandal resting at y = len */}
          <Path
            d={`M ${-ankleHalf * 1.15} ${len - 5} L ${ankleHalf * 0.9} ${len - 5} L ${ankleHalf * 2.55} ${len - 1.5} Q ${ankleHalf * 2.7} ${len + 1} ${ankleHalf * 2.2} ${len + 1} L ${-ankleHalf * 1.2} ${len + 1} Z`}
            fill={isFront ? '#1C202B' : '#12151C'}
            stroke={INK_STROKE}
            strokeWidth={1.3}
            strokeLinejoin="round"
          />
        </G>
      )}
    </Svg>
  );
};

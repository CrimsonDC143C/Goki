import React from 'react';
import { Image, ImageSourcePropType, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Polygon, Rect, Stop, SvgXml } from 'react-native-svg';
import { HUD_SVGS } from '../assets/v0Vault';
import { CRIMSON_ONI } from '../theme';

export interface CharacterPortraitFrameProps {
  /**
   * Drop-in Layer.ai 2D character illustration / sprite source (URI string or bundled asset).
   * Renders atmospheric Crimson Oni warrior silhouette artwork when omitted.
   */
  imageSource?: ImageSourcePropType | string | null;
  variant?: 'hero' | 'avatar' | 'circle';
  height?: number;
  isCircle?: boolean;
  isActive?: boolean;
  children?: React.ReactNode;
}

export const CharacterPortraitFrame: React.FC<CharacterPortraitFrameProps> = ({
  imageSource,
  variant = 'hero',
  height,
  isCircle,
  isActive,
  children,
}) => {
  const resolvedSource: ImageSourcePropType | null =
    typeof imageSource === 'string' && imageSource.trim().length > 0
      ? { uri: imageSource }
      : imageSource && typeof imageSource !== 'string'
        ? imageSource
        : null;

  if (variant === 'circle' || (variant === 'avatar' && isCircle)) {
    const size = height ?? 58;
    return (
      <View
        style={[
          styles.circleOuter,
          { width: size, height: size, borderRadius: size / 2 },
          isActive && styles.circleOuterActive,
        ]}
      >
        {resolvedSource ? (
          <Image source={resolvedSource} style={styles.circleImage} resizeMode="cover" />
        ) : (
          <Svg width={size - 4} height={size - 4} viewBox="0 0 100 100">
            <Defs>
              <LinearGradient id="oniCircleBg" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#351118" />
                <Stop offset="1" stopColor="#141316" />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100" height="100" fill="url(#oniCircleBg)" />
            <Circle
              cx="50"
              cy="44"
              r="30"
              fill={CRIMSON_ONI.crimson}
              fillOpacity={0.45}
              stroke={CRIMSON_ONI.agedGold}
              strokeWidth="1.2"
              strokeOpacity={0.55}
            />
            {/* Horned Vanguard Helm Silhouette */}
            <Path
              d="M28 42 L18 18 L36 32 Q50 24 64 32 L82 18 L72 42 Z"
              fill={CRIMSON_ONI.agedGold}
              fillOpacity={0.85}
            />
            <Path
              d="M32 38 Q50 26 68 38 L66 64 Q50 74 34 64 Z"
              fill="#2B2930"
              stroke={CRIMSON_ONI.agedGold}
              strokeWidth="1.6"
            />
            {/* Glowing Crimson Visor */}
            <Polygon points="38,48 48,51 39,54" fill="#EF5350" />
            <Polygon points="62,48 52,51 61,54" fill="#EF5350" />
            {/* Shoulders */}
            <Path
              d="M16 96 Q22 70 50 70 Q78 70 84 96 Z"
              fill={CRIMSON_ONI.crimson}
              stroke={CRIMSON_ONI.agedGold}
              strokeWidth="1.5"
            />
          </Svg>
        )}
        {children}
      </View>
    );
  }

  if (variant === 'avatar') {
    const size = height ?? 76;
    return (
      <View style={[styles.avatarOuter, { width: size, height: size }]}>
        {resolvedSource ? (
          <Image source={resolvedSource} style={styles.avatarImage} resizeMode="cover" />
        ) : (
          <Svg width={size - 4} height={size - 4} viewBox="0 0 100 100">
            <Defs>
              <LinearGradient id="oniAvatarBg" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#351118" />
                <Stop offset="1" stopColor="#141316" />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100" height="100" fill="url(#oniAvatarBg)" />
            <Circle
              cx="50"
              cy="44"
              r="30"
              fill={CRIMSON_ONI.crimson}
              fillOpacity={0.45}
              stroke={CRIMSON_ONI.agedGold}
              strokeWidth="1.2"
              strokeOpacity={0.55}
            />
            {/* Horned Vanguard Helm Silhouette */}
            <Path
              d="M28 42 L18 18 L36 32 Q50 24 64 32 L82 18 L72 42 Z"
              fill={CRIMSON_ONI.agedGold}
              fillOpacity={0.85}
            />
            <Path
              d="M32 38 Q50 26 68 38 L66 64 Q50 74 34 64 Z"
              fill="#2B2930"
              stroke={CRIMSON_ONI.agedGold}
              strokeWidth="1.6"
            />
            {/* Glowing Crimson Visor */}
            <Polygon points="38,48 48,51 39,54" fill="#EF5350" />
            <Polygon points="62,48 52,51 61,54" fill="#EF5350" />
            {/* Shoulders */}
            <Path
              d="M16 96 Q22 70 50 70 Q78 70 84 96 Z"
              fill={CRIMSON_ONI.crimson}
              stroke={CRIMSON_ONI.agedGold}
              strokeWidth="1.5"
            />
          </Svg>
        )}
      </View>
    );
  }

  const frameHeight = height ?? 290;

  return (
    <View style={[styles.heroFrame, { height: frameHeight }]}>
      {/* Ornate Crimson Oni Corner Filigree Accents (v0 Vault) */}
      <View style={[styles.cornerFiligree, styles.cornerTL]} pointerEvents="none">
        <SvgXml xml={HUD_SVGS.cornerFiligreeLarge} width={32} height={32} />
      </View>
      <View style={[styles.cornerFiligree, styles.cornerTR]} pointerEvents="none">
        <SvgXml xml={HUD_SVGS.cornerFiligreeLarge} width={32} height={32} />
      </View>
      <View style={[styles.cornerFiligree, styles.cornerBL]} pointerEvents="none">
        <SvgXml xml={HUD_SVGS.cornerFiligreeLarge} width={32} height={32} />
      </View>
      <View style={[styles.cornerFiligree, styles.cornerBR]} pointerEvents="none">
        <SvgXml xml={HUD_SVGS.cornerFiligreeLarge} width={32} height={32} />
      </View>

      {resolvedSource ? (
        <Image source={resolvedSource} style={styles.heroImage} resizeMode="contain" />
      ) : (
        <View style={styles.svgBackdropWrap}>
          <Svg width="100%" height="100%" viewBox="0 0 320 300" preserveAspectRatio="xMidYMid meet">
            <Defs>
              <LinearGradient id="oniStageGrad" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#2A1117" />
                <Stop offset="0.55" stopColor="#1A191C" />
                <Stop offset="1" stopColor="#111013" />
              </LinearGradient>
              <LinearGradient id="crimsonSunGrad" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#8B2637" stopOpacity="0.65" />
                <Stop offset="1" stopColor="#5E1924" stopOpacity="0.18" />
              </LinearGradient>
              <LinearGradient id="bladeSteelGrad" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#E8E6E1" />
                <Stop offset="1" stopColor="#7A787D" />
              </LinearGradient>
            </Defs>

            <Rect x="0" y="0" width="320" height="300" fill="url(#oniStageGrad)" />

            {/* Crimson Oni Moon Halo & Runic Ring */}
            <Circle cx="160" cy="118" r="82" fill="url(#crimsonSunGrad)" />
            <Circle
              cx="160"
              cy="118"
              r="92"
              fill="none"
              stroke={CRIMSON_ONI.agedGold}
              strokeWidth="1.2"
              strokeDasharray="6 5"
              strokeOpacity="0.45"
            />
            <Circle
              cx="160"
              cy="118"
              r="72"
              fill="none"
              stroke={CRIMSON_ONI.agedGold}
              strokeWidth="0.9"
              strokeOpacity="0.3"
            />

            {/* Full-Body Ironbound Crimson Vanguard Silhouette */}
            {/* Flowing Crimson Cloak */}
            <Path
              d="M118 96 L82 238 L138 228 L160 242 L182 228 L238 238 L202 96 Z"
              fill={CRIMSON_ONI.crimson}
              fillOpacity="0.88"
              stroke="#3B1018"
              strokeWidth="1.5"
            />

            {/* Greatsword Behind Back */}
            <Polygon
              points="214,32 224,36 132,232 122,226"
              fill="url(#bladeSteelGrad)"
              stroke={CRIMSON_ONI.agedGold}
              strokeWidth="1"
            />
            <Polygon
              points="194,62 232,80 228,87 190,69"
              fill={CRIMSON_ONI.agedGold}
            />

            {/* Armored Legs & Sabatons */}
            <Path
              d="M138 176 L130 246 L148 246 L156 184 Z"
              fill="#2B2930"
              stroke={CRIMSON_ONI.agedGold}
              strokeWidth="1.2"
            />
            <Path
              d="M182 176 L190 246 L172 246 L164 184 Z"
              fill="#2B2930"
              stroke={CRIMSON_ONI.agedGold}
              strokeWidth="1.2"
            />

            {/* Torso Hauberk & Pauldrons */}
            <Path
              d="M124 96 Q160 84 196 96 L186 178 Q160 188 134 178 Z"
              fill="#25232A"
              stroke={CRIMSON_ONI.agedGold}
              strokeWidth="1.6"
            />
            {/* Pauldrons */}
            <Path
              d="M102 104 Q118 82 138 96 L130 124 Q110 120 102 104 Z"
              fill={CRIMSON_ONI.crimson}
              stroke={CRIMSON_ONI.agedGold}
              strokeWidth="1.5"
            />
            <Path
              d="M218 104 Q202 82 182 96 L190 124 Q210 120 218 104 Z"
              fill={CRIMSON_ONI.crimson}
              stroke={CRIMSON_ONI.agedGold}
              strokeWidth="1.5"
            />
            {/* Chest Crest */}
            <Polygon
              points="160,110 172,128 160,148 148,128"
              fill={CRIMSON_ONI.crimson}
              stroke={CRIMSON_ONI.agedGold}
              strokeWidth="1.3"
            />

            {/* Horned Oni Vanguard Greathelm */}
            <Path
              d="M140 62 L124 34 L148 52 Q160 46 172 52 L196 34 L180 62 Z"
              fill={CRIMSON_ONI.agedGold}
            />
            <Path
              d="M143 58 Q160 48 177 58 L175 88 Q160 96 145 88 Z"
              fill="#2C2A31"
              stroke={CRIMSON_ONI.agedGold}
              strokeWidth="1.5"
            />
            {/* Glowing Visor Eyes */}
            <Polygon points="148,70 157,73 149,75" fill="#FF5C5C" />
            <Polygon points="172,70 163,73 171,75" fill="#FF5C5C" />
          </Svg>
        </View>
      )}

      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  heroFrame: {
    width: '100%',
    backgroundColor: CRIMSON_ONI.charcoalDeep,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: CRIMSON_ONI.agedGold,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'flex-end',
  },
  svgBackdropWrap: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  heroImage: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  cornerFiligree: {
    position: 'absolute',
    width: 32,
    height: 32,
    zIndex: 5,
  },
  cornerTL: {
    top: 2,
    left: 2,
  },
  cornerTR: {
    top: 2,
    right: 2,
    transform: [{ rotate: '90deg' }],
  },
  cornerBR: {
    bottom: 2,
    right: 2,
    transform: [{ rotate: '180deg' }],
  },
  cornerBL: {
    bottom: 2,
    left: 2,
    transform: [{ rotate: '270deg' }],
  },
  avatarOuter: {
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: CRIMSON_ONI.agedGold,
    backgroundColor: CRIMSON_ONI.charcoalDeep,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  circleOuter: {
    borderWidth: 2,
    borderColor: CRIMSON_ONI.agedGold,
    backgroundColor: CRIMSON_ONI.charcoalDeep,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: CRIMSON_ONI.crimson,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.55,
    shadowRadius: 5,
    elevation: 6,
  },
  circleOuterActive: {
    borderColor: '#DFB660',
    borderWidth: 2.5,
    shadowColor: '#DFB660',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 9,
    elevation: 9,
  },
  circleImage: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
  },
});

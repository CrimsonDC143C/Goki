import React from 'react';
import { ImageSourcePropType, StyleSheet, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, Polygon, RadialGradient, Rect, Stop, SvgXml } from 'react-native-svg';
import { getCharacterBustSource, getCharacterStandingSource } from '../assets/characterArtRegistry';
import { HUD_SVGS } from '../assets/v0Vault';
import { CRIMSON_ONI } from '../theme';

export const DEFAULT_HERO_PORTRAIT = require('../../assets/images/adventurer-portrait.png');

export interface CharacterPortraitFrameProps {
  /**
   * Drop-in Layer.ai 2D character illustration / sprite source (URI string or bundled asset).
   */
  imageSource?: ImageSourcePropType | string | null;
  /**
   * Preset appearance ID (e.g. 'oni_warlord', 'blade_dancer', etc.)
   */
  appearanceId?: string | null;
  /**
   * Explicit pose override. Defaults to 'standing' for 'hero' variant and 'bust' for 'circle'/'avatar'.
   */
  pose?: 'bust' | 'standing';
  variant?: 'hero' | 'avatar' | 'circle';
  height?: number;
  bottomClearance?: number;
  isCircle?: boolean;
  isActive?: boolean;
  children?: React.ReactNode;
}

export const CharacterPortraitFrame: React.FC<CharacterPortraitFrameProps> = ({
  imageSource,
  appearanceId,
  pose,
  variant = 'hero',
  height,
  bottomClearance,
  isCircle,
  isActive,
  children,
}) => {
  const effectivePose: 'bust' | 'standing' =
    pose ?? (variant === 'hero' ? 'standing' : 'bust');

  let resolvedSource: ImageSourcePropType | null = null;

  if (imageSource === 'silhouette') {
    resolvedSource = null;
  } else if (appearanceId) {
    resolvedSource =
      effectivePose === 'bust'
        ? getCharacterBustSource(appearanceId)
        : getCharacterStandingSource(appearanceId);
  } else if (imageSource && typeof imageSource !== 'string') {
    resolvedSource = imageSource;
  } else if (typeof imageSource === 'string' && imageSource.trim().length > 0) {
    const isUri =
      imageSource.startsWith('http://') ||
      imageSource.startsWith('https://') ||
      imageSource.startsWith('file://');
    if (isUri) {
      resolvedSource = { uri: imageSource };
    } else {
      resolvedSource =
        effectivePose === 'bust'
          ? getCharacterBustSource(imageSource)
          : getCharacterStandingSource(imageSource);
    }
  } else {
    resolvedSource =
      effectivePose === 'bust'
        ? getCharacterBustSource(null)
        : getCharacterStandingSource(null);
  }

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
          <ExpoImage
            source={resolvedSource as any}
            style={styles.circleImage}
            contentFit="cover"
            contentPosition="top center"
          />
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
          <ExpoImage
            source={resolvedSource as any}
            style={styles.avatarImage}
            contentFit="cover"
            contentPosition="top center"
          />
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
        <>
          {/* Layer 1: Atmospheric Blurred Backdrop (Fills Wide Frame, Soft Dark-Fantasy Lighting) */}
          <ExpoImage
            source={resolvedSource as any}
            style={styles.heroBackdropBlur}
            contentFit="cover"
            contentPosition="top center"
            blurRadius={22}
          />
          <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
            <Defs>
              <LinearGradient id="heroVignette" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#090C12" stopOpacity="0.15" />
                <Stop offset="0.55" stopColor="#090C12" stopOpacity="0.35" />
                <Stop offset="1" stopColor="#090C12" stopOpacity="0.88" />
              </LinearGradient>
              <RadialGradient id="heroRadial" cx="50%" cy="50%" r="50%">
                <Stop offset="60%" stopColor="#090C12" stopOpacity="0" />
                <Stop offset="100%" stopColor="#090C12" stopOpacity="0.75" />
              </RadialGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#heroRadial)" />
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#heroVignette)" />
          </Svg>

          {/* Main Standing Hero Artwork (Edge-to-Edge 2:3 Cover) */}
          <ExpoImage
            source={resolvedSource as any}
            style={[
              styles.heroImageCover,
              bottomClearance !== undefined ? { bottom: bottomClearance } : null,
            ]}
            contentFit="cover"
            contentPosition="top center"
          />
        </>
      ) : (
        <View style={styles.svgBackdropWrap}>
          <Svg width="100%" height="100%" viewBox="0 0 120 220" preserveAspectRatio="xMidYMid meet">
            <Defs>
              <LinearGradient id="silhouetteGrad" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#273248" stopOpacity="0.9" />
                <Stop offset="1" stopColor="#121722" stopOpacity="0.3" />
              </LinearGradient>
              <RadialGradient id="oniHaloGrad" cx="50%" cy="40%" r="50%">
                <Stop offset="0" stopColor="#8B2637" stopOpacity="0.45" />
                <Stop offset="1" stopColor="#090C12" stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Rect x="0" y="0" width="120" height="220" fill="#0D0F14" />
            <Circle cx="60" cy="85" r="55" fill="url(#oniHaloGrad)" />
            <Ellipse cx="60" cy="212" rx="44" ry="5" fill="#8B2637" opacity="0.35" />
            <Path
              fill="url(#silhouetteGrad)"
              stroke="#273248"
              strokeWidth="1"
              d="M60 8c10 0 17 8 17 18s-7 19-17 19-17-9-17-19S50 8 60 8zM38 50h44c10 0 17 6 19 15l9 52c1 5-6 7-8 2l-11-40-2 44 5 82c0 7-11 7-12 0l-10-72h-4l-10 72c-1 7-12 7-12 0l5-82-2-44-11 40c-2 5-9 3-8-2l9-52c2-9 9-15 19-15z"
            />
          </Svg>
        </View>
      )}

      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  heroFrame: {
    aspectRatio: 2 / 3,
    alignSelf: 'center',
    backgroundColor: '#0D0F14',
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
  heroBackdropBlur: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: '100%',
    height: '100%',
    opacity: 0.32,
  },
  heroImageCover: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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

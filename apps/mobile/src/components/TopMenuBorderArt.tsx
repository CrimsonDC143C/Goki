import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  Path,
  Polygon,
  Rect,
  Stop,
} from 'react-native-svg';
import { CRIMSON_ONI } from '../theme';

export interface TopMenuBorderArtProps {
  height?: number;
}

/**
 * TopMenuBorderArt
 * Ornate dark fantasy Japanese Oni architectural trim.
 * Provides a tasteful ornamental header offset separating the interactive HUD
 * and notification toasts from the screen edge, device camera notches, and bezels.
 */
export const TopMenuBorderArt: React.FC<TopMenuBorderArtProps> = ({
  height = 20,
}) => {
  return (
    <View style={[styles.container, { height }]} pointerEvents="none">
      <Svg
        width="100%"
        height={height}
        viewBox="0 0 400 20"
        preserveAspectRatio="none"
      >
        <Defs>
          {/* Gold Beam Gradient running toward center */}
          <LinearGradient id="goldBeamLeft" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={CRIMSON_ONI.charcoalElevated} stopOpacity="0.2" />
            <Stop offset="0.6" stopColor={CRIMSON_ONI.agedGold} stopOpacity="0.75" />
            <Stop offset="1" stopColor={CRIMSON_ONI.agedGoldBright} stopOpacity="1" />
          </LinearGradient>
          <LinearGradient id="goldBeamRight" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={CRIMSON_ONI.agedGoldBright} stopOpacity="1" />
            <Stop offset="0.4" stopColor={CRIMSON_ONI.agedGold} stopOpacity="0.75" />
            <Stop offset="1" stopColor={CRIMSON_ONI.charcoalElevated} stopOpacity="0.2" />
          </LinearGradient>

          {/* Crimson Core Jewel Gradient */}
          <LinearGradient id="crimsonJewel" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FF4D6D" />
            <Stop offset="0.5" stopColor={CRIMSON_ONI.crimson} />
            <Stop offset="1" stopColor="#351118" />
          </LinearGradient>
        </Defs>

        {/* Outer decorative base line */}
        <Path
          d="M 10 18 L 175 18"
          stroke="url(#goldBeamLeft)"
          strokeWidth="1.2"
          fill="none"
        />
        <Path
          d="M 225 18 L 390 18"
          stroke="url(#goldBeamRight)"
          strokeWidth="1.2"
          fill="none"
        />

        {/* Secondary fine upper filigree trace */}
        <Path
          d="M 30 14 L 170 14"
          stroke={CRIMSON_ONI.agedGold}
          strokeOpacity="0.45"
          strokeWidth="0.8"
          fill="none"
        />
        <Path
          d="M 230 14 L 370 14"
          stroke={CRIMSON_ONI.agedGold}
          strokeOpacity="0.45"
          strokeWidth="0.8"
          fill="none"
        />

        {/* Left Corner Scroll Accent */}
        <Path
          d="M 12 18 Q 6 18 6 12 Q 6 6 14 6 L 22 6"
          stroke={CRIMSON_ONI.agedGold}
          strokeWidth="1.2"
          fill="none"
        />
        <Polygon points="22,4 26,6 22,8" fill={CRIMSON_ONI.agedGold} />

        {/* Right Corner Scroll Accent */}
        <Path
          d="M 388 18 Q 394 18 394 12 Q 394 6 386 6 L 378 6"
          stroke={CRIMSON_ONI.agedGold}
          strokeWidth="1.2"
          fill="none"
        />
        <Polygon points="378,4 374,6 378,8" fill={CRIMSON_ONI.agedGold} />

        {/* Intermediate diamond pips along the beam */}
        <Polygon points="80,18 83,15 86,18 83,21" fill={CRIMSON_ONI.agedGoldBright} />
        <Polygon points="130,18 133,16 136,18 133,20" fill={CRIMSON_ONI.agedGold} />
        <Polygon points="270,18 267,16 264,18 267,20" fill={CRIMSON_ONI.agedGold} />
        <Polygon points="320,18 317,15 314,18 317,21" fill={CRIMSON_ONI.agedGoldBright} />

        {/* Center Japanese Oni / Torii Arch Crest directly crowning the portrait */}
        {/* Left wing bracket */}
        <Path
          d="M 175 18 L 186 11 L 194 11"
          stroke={CRIMSON_ONI.agedGoldBright}
          strokeWidth="1.5"
          fill="none"
        />
        {/* Right wing bracket */}
        <Path
          d="M 225 18 L 214 11 L 206 11"
          stroke={CRIMSON_ONI.agedGoldBright}
          strokeWidth="1.5"
          fill="none"
        />

        {/* Central Gold Diamond Emblem Frame */}
        <Polygon
          points="200,2 211,11 200,20 189,11"
          fill={CRIMSON_ONI.charcoalDeep}
          stroke={CRIMSON_ONI.agedGoldBright}
          strokeWidth="1.5"
        />
        {/* Inner Crimson Gem Jewel */}
        <Polygon
          points="200,5 208,11 200,17 192,11"
          fill="url(#crimsonJewel)"
          stroke="#FF4D6D"
          strokeWidth="0.8"
        />
        {/* Center Sparkle Core */}
        <Rect
          x="199"
          y="10"
          width="2"
          height="2"
          fill="#FFF"
          transform="rotate(45 200 11)"
        />
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
});

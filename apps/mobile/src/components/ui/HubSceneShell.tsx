import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import {
  HubEnvironmentSlotId,
  getHubEnvironmentArt,
} from '../../assets/rpgArtRegistry';

export interface HubSceneBackdropProps {
  slotId: HubEnvironmentSlotId;
  testID?: string;
}

/**
 * Full-bleed non-interactive backdrop hook for Hub screens.
 * Renders drop-in 1080x1920 environment art + readability scrim when populated,
 * or a zero-reflow ambient tint layer while art slots remain null.
 */
export const HubSceneBackdrop: React.FC<HubSceneBackdropProps> = ({
  slotId,
  testID,
}) => {
  const art = getHubEnvironmentArt(slotId);
  return (
    <View
      pointerEvents="none"
      style={styles.backdropRoot}
      testID={testID ?? `hub-backdrop-${slotId}`}
    >
      {art.backdropSource ? (
        <>
          <ExpoImage
            source={art.backdropSource as any}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            contentPosition="top center"
          />
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: art.scrimColors[1], opacity: 0.58 },
            ]}
          />
        </>
      ) : (
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: art.ambientTint },
          ]}
        />
      )}
    </View>
  );
};

export interface HubSceneHeaderSlotProps {
  slotId: HubEnvironmentSlotId;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  testID?: string;
}

/**
 * Wraps an existing Hub top bar with a drop-in 1440x480 illustrated header slot
 * rendered behind the foreground controls via absolute positioning (zero layout shift).
 */
export const HubSceneHeaderSlot: React.FC<HubSceneHeaderSlotProps> = ({
  slotId,
  style,
  children,
  testID,
}) => {
  const art = getHubEnvironmentArt(slotId);
  return (
    <View
      style={[styles.headerSlotRoot, style]}
      testID={testID ?? `hub-header-slot-${slotId}`}
    >
      <View pointerEvents="none" style={styles.headerBannerLayer}>
        {art.headerBannerSource ? (
          <>
            <ExpoImage
              source={art.headerBannerSource as any}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              contentPosition="center"
            />
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: art.scrimColors[0], opacity: 0.58 },
              ]}
            />
          </>
        ) : (
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: art.ambientTint },
            ]}
          />
        )}
      </View>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  backdropRoot: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 0,
  },
  headerSlotRoot: {
    position: 'relative',
    overflow: 'hidden',
    zIndex: 1,
  },
  headerBannerLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 0,
  },
});

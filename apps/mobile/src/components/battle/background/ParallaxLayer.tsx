import React, { useEffect, useMemo, useRef } from 'react';
import {
  View,
  Image,
  StyleSheet,
  Animated as RNAnimated,
  Easing as RNEasing,
} from 'react-native';
import type { ParallaxLayerConfig, ScrollMode } from './parallax.types';
import {
  IS_REANIMATED_AVAILABLE,
  getReanimatedRuntime,
} from '../reanimatedRuntime';

export interface ParallaxLayerProps {
  layer: ParallaxLayerConfig;
  viewportWidth: number;
  worldScale: number;
  baseSpeed: number;
  scrollMode: ScrollMode;
  playbackRate?: number;
}

interface CommonParallaxGeometry {
  renderedHeight: number;
  singleTileWidth: number;
  repeatsPerHalf: number;
  halfWidth: number;
  overlap: number;
  effectiveSpeed: number;
  tileIndices: number[];
}

function useParallaxGeometry(props: ParallaxLayerProps): CommonParallaxGeometry {
  const { layer, viewportWidth, worldScale, baseSpeed, scrollMode, playbackRate = 1 } = props;

  const renderedHeight = Math.max(1, Math.round(layer.layerHeight ?? layer.nativeHeight * worldScale));
  const singleTileWidth = Math.max(1, Math.round((layer.nativeWidth / layer.nativeHeight) * renderedHeight));
  const repeatsPerHalf = Math.max(1, Math.ceil(Math.max(viewportWidth, 320) / singleTileWidth));
  const halfWidth = repeatsPerHalf * singleTileWidth;
  const overlap = layer.seamlessOverlapPx ?? 0;

  const effectiveSpeed = useMemo(() => {
    const rate = Math.max(0.1, playbackRate);
    if (scrollMode === 'paused') {
      return 0;
    }
    if (scrollMode === 'marching') {
      return baseSpeed * layer.speedMultiplier * rate;
    }
    return baseSpeed * (layer.combatDriftMultiplier ?? 0) * rate;
  }, [scrollMode, baseSpeed, layer.speedMultiplier, layer.combatDriftMultiplier, playbackRate]);

  const tileIndices = useMemo(
    () => Array.from({ length: repeatsPerHalf }, (_, i) => i),
    [repeatsPerHalf]
  );

  return {
    renderedHeight,
    singleTileWidth,
    repeatsPerHalf,
    halfWidth,
    overlap,
    effectiveSpeed,
    tileIndices,
  };
}

const ReanimatedParallaxStrip: React.FC<ParallaxLayerProps> = (props) => {
  const Reanimated = getReanimatedRuntime()!;
  const { layer } = props;
  const {
    renderedHeight,
    singleTileWidth,
    halfWidth,
    overlap,
    effectiveSpeed,
    tileIndices,
  } = useParallaxGeometry(props);

  const translateX = Reanimated.useSharedValue(0);

  useEffect(() => {
    if (effectiveSpeed <= 0.05) {
      Reanimated.cancelAnimation(translateX);
      return;
    }

    let currentOffset = translateX.value % halfWidth;
    if (currentOffset > 0) {
      currentOffset -= halfWidth;
    }
    const remainingDistance = halfWidth + currentOffset;
    const safeRemaining = remainingDistance <= 0 ? halfWidth : remainingDistance;

    const firstLegDuration = Math.max(16, Math.round((safeRemaining / effectiveSpeed) * 1000));
    const fullCycleDuration = Math.max(16, Math.round((halfWidth / effectiveSpeed) * 1000));

    translateX.value = Reanimated.withSequence(
      Reanimated.withTiming(-halfWidth, {
        duration: firstLegDuration,
        easing: Reanimated.Easing.linear,
      }),
      Reanimated.withTiming(0, { duration: 0 }),
      Reanimated.withRepeat(
        Reanimated.withTiming(-halfWidth, {
          duration: fullCycleDuration,
          easing: Reanimated.Easing.linear,
        }),
        -1,
        false
      )
    );

    return () => {
      Reanimated.cancelAnimation(translateX);
    };
  }, [effectiveSpeed, halfWidth, translateX, Reanimated]);

  const animatedStyle = Reanimated.useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View
      pointerEvents="none"
      style={[
        styles.layerContainer,
        {
          bottom: layer.verticalOffset ?? 0,
          height: renderedHeight,
          zIndex: layer.zIndex ?? 0,
          opacity: layer.opacity ?? 1,
        },
      ]}
    >
      <Reanimated.default.View style={[styles.stripContainer, { width: halfWidth * 2 }, animatedStyle]}>
        <View style={[styles.halfStrip, { width: halfWidth }]}>
          {tileIndices.map((idx) => (
            <Image
              key={`h1-${idx}`}
              source={layer.source}
              resizeMode="stretch"
              style={{
                width: singleTileWidth + overlap,
                height: renderedHeight,
                marginRight: -overlap,
              }}
            />
          ))}
        </View>
        <View style={[styles.halfStrip, { width: halfWidth }]}>
          {tileIndices.map((idx) => (
            <Image
              key={`h2-${idx}`}
              source={layer.source}
              resizeMode="stretch"
              style={{
                width: singleTileWidth + overlap,
                height: renderedHeight,
                marginRight: -overlap,
              }}
            />
          ))}
        </View>
      </Reanimated.default.View>
    </View>
  );
};

const NativeDriverParallaxStrip: React.FC<ParallaxLayerProps> = (props) => {
  const { layer } = props;
  const {
    renderedHeight,
    singleTileWidth,
    halfWidth,
    overlap,
    effectiveSpeed,
    tileIndices,
  } = useParallaxGeometry(props);

  const translateX = useRef(new RNAnimated.Value(0)).current;
  const currentOffsetRef = useRef(0);

  useEffect(() => {
    const subId = translateX.addListener(({ value }) => {
      currentOffsetRef.current = value;
    });

    if (effectiveSpeed <= 0.05) {
      translateX.stopAnimation();
      return () => {
        translateX.removeListener(subId);
      };
    }

    let currentOffset = currentOffsetRef.current % halfWidth;
    if (currentOffset > 0) {
      currentOffset -= halfWidth;
    }
    const remainingDistance = halfWidth + currentOffset;
    const safeRemaining = remainingDistance <= 0 ? halfWidth : remainingDistance;

    const firstLegDuration = Math.max(16, Math.round((safeRemaining / effectiveSpeed) * 1000));
    const fullCycleDuration = Math.max(16, Math.round((halfWidth / effectiveSpeed) * 1000));

    let isActive = true;

    const firstLegAnim = RNAnimated.timing(translateX, {
      toValue: -halfWidth,
      duration: firstLegDuration,
      easing: RNEasing.linear,
      useNativeDriver: true,
    });

    const loopAnim = RNAnimated.loop(
      RNAnimated.timing(translateX, {
        toValue: -halfWidth,
        duration: fullCycleDuration,
        easing: RNEasing.linear,
        useNativeDriver: true,
      }),
      { iterations: -1, resetBeforeIteration: true }
    );

    firstLegAnim.start(({ finished }) => {
      if (finished && isActive) {
        translateX.setValue(0);
        loopAnim.start();
      }
    });

    return () => {
      isActive = false;
      firstLegAnim.stop();
      loopAnim.stop();
      translateX.stopAnimation();
      translateX.removeListener(subId);
    };
  }, [effectiveSpeed, halfWidth, translateX]);

  return (
    <View
      pointerEvents="none"
      style={[
        styles.layerContainer,
        {
          bottom: layer.verticalOffset ?? 0,
          height: renderedHeight,
          zIndex: layer.zIndex ?? 0,
          opacity: layer.opacity ?? 1,
        },
      ]}
    >
      <RNAnimated.View
        style={[
          styles.stripContainer,
          {
            width: halfWidth * 2,
            transform: [{ translateX }],
          },
        ]}
      >
        <View style={[styles.halfStrip, { width: halfWidth }]}>
          {tileIndices.map((idx) => (
            <Image
              key={`h1-${idx}`}
              source={layer.source}
              resizeMode="stretch"
              style={{
                width: singleTileWidth + overlap,
                height: renderedHeight,
                marginRight: -overlap,
              }}
            />
          ))}
        </View>
        <View style={[styles.halfStrip, { width: halfWidth }]}>
          {tileIndices.map((idx) => (
            <Image
              key={`h2-${idx}`}
              source={layer.source}
              resizeMode="stretch"
              style={{
                width: singleTileWidth + overlap,
                height: renderedHeight,
                marginRight: -overlap,
              }}
            />
          ))}
        </View>
      </RNAnimated.View>
    </View>
  );
};

export const ParallaxLayer: React.FC<ParallaxLayerProps> = (props) => {
  if (IS_REANIMATED_AVAILABLE) {
    return <ReanimatedParallaxStrip {...props} />;
  }
  return <NativeDriverParallaxStrip {...props} />;
};

const styles = StyleSheet.create({
  layerContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    overflow: 'hidden',
  },
  stripContainer: {
    flexDirection: 'row',
    height: '100%',
  },
  halfStrip: {
    flexDirection: 'row',
    height: '100%',
  },
});

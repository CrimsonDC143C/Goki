import React, { useRef, useMemo, useCallback } from 'react';
import {
  Platform,
  TurboModuleRegistry,
  Animated as RNAnimated,
  Easing as RNEasing,
  type ViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

export type ReanimatedModuleType = typeof import('react-native-reanimated');

let cachedRuntime: ReanimatedModuleType | null | undefined;

export function getReanimatedRuntime(): ReanimatedModuleType | null {
  if (cachedRuntime !== undefined) {
    return cachedRuntime;
  }

  if (Platform.OS !== 'web') {
    const globalRecord = globalThis as Record<string, unknown>;
    const hasWorkletsGlobal = globalRecord['__workletsModuleProxy'] !== undefined;
    const hasReanimatedGlobal = globalRecord['__reanimatedModuleProxy'] !== undefined;

    const workletsTurbo = TurboModuleRegistry ? TurboModuleRegistry.get('WorkletsModule') : null;
    const reanimatedTurbo = TurboModuleRegistry ? TurboModuleRegistry.get('ReanimatedModule') : null;

    const isWorkletsReady = hasWorkletsGlobal || Boolean(workletsTurbo);
    const isReanimatedReady = hasReanimatedGlobal || Boolean(reanimatedTurbo);

    if (!isWorkletsReady || !isReanimatedReady) {
      cachedRuntime = null;
      return null;
    }
  }

  try {
    cachedRuntime = require('react-native-reanimated') as ReanimatedModuleType;
  } catch {
    cachedRuntime = null;
  }

  return cachedRuntime;
}

export const IS_REANIMATED_AVAILABLE: boolean = getReanimatedRuntime() !== null;

export type ArenaMotionStyle = StyleProp<ViewStyle | Record<string, unknown>>;

export interface ArenaAnimatedViewProps extends ViewProps {
  style?: ArenaMotionStyle;
  pointerEvents?: 'box-none' | 'none' | 'box-only' | 'auto';
  children?: React.ReactNode;
}

export const ArenaAnimatedView: React.FC<ArenaAnimatedViewProps> = (props) => {
  const { style, children, pointerEvents, ...rest } = props;
  if (IS_REANIMATED_AVAILABLE) {
    const Reanimated = getReanimatedRuntime()!;
    return React.createElement(
      Reanimated.default.View,
      {
        style: style as unknown as StyleProp<ViewStyle>,
        pointerEvents,
        ...rest,
      },
      children
    );
  }
  return React.createElement(
    RNAnimated.View,
    {
      style: style as unknown as StyleProp<ViewStyle>,
      pointerEvents,
      ...rest,
    },
    children
  );
};

export interface ArenaMotionDriver {
  heroTransformStyle: ArenaMotionStyle;
  enemyLungeStyle: ArenaMotionStyle;
  enemyApproachStyle: ArenaMotionStyle;
  enemyTransformStyle: ArenaMotionStyle;
  heroFloatStyle: ArenaMotionStyle;
  enemyFloatStyle: ArenaMotionStyle;
  triggerHeroLunge: (duration1: number, duration2: number) => void;
  triggerEnemyLunge: (duration1: number, duration2: number) => void;
  triggerEnemyApproach: (fromX: number, duration: number, onComplete?: () => void) => void;
  triggerHeroFloat: (toY: number, duration: number) => void;
  triggerEnemyFloat: (toY: number, duration: number) => void;
}

function useReanimatedArenaMotion(): ArenaMotionDriver {
  const Reanimated = getReanimatedRuntime()!;
  const heroLungeX = Reanimated.useSharedValue(0);
  const enemyLungeX = Reanimated.useSharedValue(0);
  const enemyApproachX = Reanimated.useSharedValue(0);
  const heroFloatingY = Reanimated.useSharedValue(0);
  const heroFloatingOpacity = Reanimated.useSharedValue(0);
  const enemyFloatingY = Reanimated.useSharedValue(0);
  const enemyFloatingOpacity = Reanimated.useSharedValue(0);

  const heroTransformStyle = Reanimated.useAnimatedStyle(() => ({
    transform: [{ translateX: heroLungeX.value }],
  }));

  const enemyLungeStyle = Reanimated.useAnimatedStyle(() => ({
    transform: [{ translateX: enemyLungeX.value }],
  }));

  const enemyApproachStyle = Reanimated.useAnimatedStyle(() => ({
    transform: [{ translateX: enemyApproachX.value }],
  }));

  const enemyTransformStyle = Reanimated.useAnimatedStyle(() => ({
    transform: [{ translateX: enemyLungeX.value + enemyApproachX.value }],
  }));

  const heroFloatStyle = Reanimated.useAnimatedStyle(() => ({
    transform: [{ translateY: heroFloatingY.value }],
    opacity: heroFloatingOpacity.value,
  }));

  const enemyFloatStyle = Reanimated.useAnimatedStyle(() => ({
    transform: [{ translateY: enemyFloatingY.value }],
    opacity: enemyFloatingOpacity.value,
  }));

  const triggerHeroLunge = useCallback((duration1: number, duration2: number) => {
    heroLungeX.value = 0;
    heroLungeX.value = Reanimated.withSequence(
      Reanimated.withTiming(36, {
        duration: duration1,
        easing: Reanimated.Easing.out(Reanimated.Easing.quad),
      }),
      Reanimated.withTiming(0, {
        duration: duration2,
        easing: Reanimated.Easing.in(Reanimated.Easing.quad),
      })
    );
  }, [Reanimated, heroLungeX]);

  const triggerEnemyLunge = useCallback((duration1: number, duration2: number) => {
    enemyLungeX.value = 0;
    enemyLungeX.value = Reanimated.withSequence(
      Reanimated.withTiming(-36, {
        duration: duration1,
        easing: Reanimated.Easing.out(Reanimated.Easing.quad),
      }),
      Reanimated.withTiming(0, {
        duration: duration2,
        easing: Reanimated.Easing.in(Reanimated.Easing.quad),
      })
    );
  }, [Reanimated, enemyLungeX]);

  const triggerEnemyApproach = useCallback((fromX: number, duration: number, onComplete?: () => void) => {
    enemyApproachX.value = fromX;
    enemyApproachX.value = Reanimated.withTiming(
      0,
      {
        duration,
        easing: Reanimated.Easing.out(Reanimated.Easing.quad),
      },
      (finished) => {
        if (finished && onComplete) {
          Reanimated.runOnJS(onComplete)();
        }
      }
    );
  }, [Reanimated, enemyApproachX]);

  const triggerHeroFloat = useCallback((toY: number, duration: number) => {
    const holdMs = Math.round(duration * 0.65);
    const fadeMs = Math.max(40, duration - holdMs);
    heroFloatingY.value = 0;
    heroFloatingOpacity.value = 1;
    heroFloatingY.value = Reanimated.withTiming(toY, {
      duration,
      easing: Reanimated.Easing.out(Reanimated.Easing.quad),
    });
    heroFloatingOpacity.value = Reanimated.withDelay(
      holdMs,
      Reanimated.withTiming(0, { duration: fadeMs })
    );
  }, [Reanimated, heroFloatingY, heroFloatingOpacity]);

  const triggerEnemyFloat = useCallback((toY: number, duration: number) => {
    const holdMs = Math.round(duration * 0.65);
    const fadeMs = Math.max(40, duration - holdMs);
    enemyFloatingY.value = 0;
    enemyFloatingOpacity.value = 1;
    enemyFloatingY.value = Reanimated.withTiming(toY, {
      duration,
      easing: Reanimated.Easing.out(Reanimated.Easing.quad),
    });
    enemyFloatingOpacity.value = Reanimated.withDelay(
      holdMs,
      Reanimated.withTiming(0, { duration: fadeMs })
    );
  }, [Reanimated, enemyFloatingY, enemyFloatingOpacity]);

  return {
    heroTransformStyle: heroTransformStyle as ArenaMotionStyle,
    enemyLungeStyle: enemyLungeStyle as ArenaMotionStyle,
    enemyApproachStyle: enemyApproachStyle as ArenaMotionStyle,
    enemyTransformStyle: enemyTransformStyle as ArenaMotionStyle,
    heroFloatStyle: heroFloatStyle as ArenaMotionStyle,
    enemyFloatStyle: enemyFloatStyle as ArenaMotionStyle,
    triggerHeroLunge,
    triggerEnemyLunge,
    triggerEnemyApproach,
    triggerHeroFloat,
    triggerEnemyFloat,
  };
}

function useNativeDriverArenaMotion(): ArenaMotionDriver {
  const heroLungeX = useRef(new RNAnimated.Value(0)).current;
  const enemyLungeX = useRef(new RNAnimated.Value(0)).current;
  const enemyApproachX = useRef(new RNAnimated.Value(0)).current;
  const heroFloatingY = useRef(new RNAnimated.Value(0)).current;
  const heroFloatingOpacity = useRef(new RNAnimated.Value(0)).current;
  const enemyFloatingY = useRef(new RNAnimated.Value(0)).current;
  const enemyFloatingOpacity = useRef(new RNAnimated.Value(0)).current;

  const enemyCombinedX = useMemo(
    () => RNAnimated.add(enemyLungeX, enemyApproachX),
    [enemyLungeX, enemyApproachX]
  );

  const heroTransformStyle = useMemo(
    () => ({ transform: [{ translateX: heroLungeX }] }),
    [heroLungeX]
  );

  const enemyLungeStyle = useMemo(
    () => ({ transform: [{ translateX: enemyLungeX }] }),
    [enemyLungeX]
  );

  const enemyApproachStyle = useMemo(
    () => ({ transform: [{ translateX: enemyApproachX }] }),
    [enemyApproachX]
  );

  const enemyTransformStyle = useMemo(
    () => ({ transform: [{ translateX: enemyCombinedX }] }),
    [enemyCombinedX]
  );

  const heroFloatStyle = useMemo(
    () => ({ transform: [{ translateY: heroFloatingY }], opacity: heroFloatingOpacity }),
    [heroFloatingY, heroFloatingOpacity]
  );

  const enemyFloatStyle = useMemo(
    () => ({ transform: [{ translateY: enemyFloatingY }], opacity: enemyFloatingOpacity }),
    [enemyFloatingY, enemyFloatingOpacity]
  );

  const triggerHeroLunge = useCallback((duration1: number, duration2: number) => {
    heroLungeX.stopAnimation();
    heroLungeX.setValue(0);
    RNAnimated.sequence([
      RNAnimated.timing(heroLungeX, {
        toValue: 36,
        duration: duration1,
        easing: RNEasing.out(RNEasing.quad),
        useNativeDriver: true,
      }),
      RNAnimated.timing(heroLungeX, {
        toValue: 0,
        duration: duration2,
        easing: RNEasing.in(RNEasing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [heroLungeX]);

  const triggerEnemyLunge = useCallback((duration1: number, duration2: number) => {
    enemyLungeX.stopAnimation();
    enemyLungeX.setValue(0);
    RNAnimated.sequence([
      RNAnimated.timing(enemyLungeX, {
        toValue: -36,
        duration: duration1,
        easing: RNEasing.out(RNEasing.quad),
        useNativeDriver: true,
      }),
      RNAnimated.timing(enemyLungeX, {
        toValue: 0,
        duration: duration2,
        easing: RNEasing.in(RNEasing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [enemyLungeX]);

  const triggerEnemyApproach = useCallback((fromX: number, duration: number, onComplete?: () => void) => {
    enemyApproachX.stopAnimation();
    enemyApproachX.setValue(fromX);
    RNAnimated.timing(enemyApproachX, {
      toValue: 0,
      duration,
      easing: RNEasing.out(RNEasing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && onComplete) {
        onComplete();
      }
    });
  }, [enemyApproachX]);

  const triggerHeroFloat = useCallback((toY: number, duration: number) => {
    heroFloatingY.stopAnimation();
    heroFloatingOpacity.stopAnimation();
    heroFloatingY.setValue(0);
    heroFloatingOpacity.setValue(1);
    const holdMs = Math.round(duration * 0.65);
    const fadeMs = Math.max(40, duration - holdMs);
    RNAnimated.parallel([
      RNAnimated.timing(heroFloatingY, {
        toValue: toY,
        duration,
        easing: RNEasing.out(RNEasing.quad),
        useNativeDriver: true,
      }),
      RNAnimated.sequence([
        RNAnimated.delay(holdMs),
        RNAnimated.timing(heroFloatingOpacity, {
          toValue: 0,
          duration: fadeMs,
          easing: RNEasing.linear,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [heroFloatingY, heroFloatingOpacity]);

  const triggerEnemyFloat = useCallback((toY: number, duration: number) => {
    enemyFloatingY.stopAnimation();
    enemyFloatingOpacity.stopAnimation();
    enemyFloatingY.setValue(0);
    enemyFloatingOpacity.setValue(1);
    const holdMs = Math.round(duration * 0.65);
    const fadeMs = Math.max(40, duration - holdMs);
    RNAnimated.parallel([
      RNAnimated.timing(enemyFloatingY, {
        toValue: toY,
        duration,
        easing: RNEasing.out(RNEasing.quad),
        useNativeDriver: true,
      }),
      RNAnimated.sequence([
        RNAnimated.delay(holdMs),
        RNAnimated.timing(enemyFloatingOpacity, {
          toValue: 0,
          duration: fadeMs,
          easing: RNEasing.linear,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [enemyFloatingY, enemyFloatingOpacity]);

  return {
    heroTransformStyle: heroTransformStyle as ArenaMotionStyle,
    enemyLungeStyle: enemyLungeStyle as ArenaMotionStyle,
    enemyApproachStyle: enemyApproachStyle as ArenaMotionStyle,
    enemyTransformStyle: enemyTransformStyle as ArenaMotionStyle,
    heroFloatStyle: heroFloatStyle as ArenaMotionStyle,
    enemyFloatStyle: enemyFloatStyle as ArenaMotionStyle,
    triggerHeroLunge,
    triggerEnemyLunge,
    triggerEnemyApproach,
    triggerHeroFloat,
    triggerEnemyFloat,
  };
}

export function useArenaMotionDriver(): ArenaMotionDriver {
  if (IS_REANIMATED_AVAILABLE) {
    return useReanimatedArenaMotion();
  }
  return useNativeDriverArenaMotion();
}

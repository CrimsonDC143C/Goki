import React, { useEffect, useRef } from 'react';
import {
  Animated as RNAnimated,
  Easing as RNEasing,
  Platform,
  StyleSheet,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import Svg, { Path } from 'react-native-svg';
import {
  ArenaAnimatedView,
  IS_REANIMATED_AVAILABLE,
  getReanimatedRuntime,
  type ArenaMotionStyle,
} from './reanimatedRuntime';

export type CombatantAnimState =
  | 'idle'
  | 'walk'
  | 'attack'
  | 'guard'
  | 'hurt'
  | 'victory'
  | 'death';

export type SlashVfxTheme = 'crimson' | 'azure' | 'astral' | 'gold';

const SLASH_PALETTES: Record<
  SlashVfxTheme,
  { outer: string; mid: string; core: string }
> = {
  crimson: { outer: '#DC2626', mid: '#F97316', core: '#FFF4D6' },
  azure: { outer: '#2563EB', mid: '#38BDF8', core: '#F0F9FF' },
  astral: { outer: '#7C3AED', mid: '#C084FC', core: '#FAF5FF' },
  gold: { outer: '#D97706', mid: '#FBBF24', core: '#FFFBEB' },
};

export function resolveWeaponSlashTheme(weaponSlugOrName?: string | null): SlashVfxTheme {
  const s = (weaponSlugOrName ?? '').toLowerCase();
  if (
    s.includes('katana') ||
    s.includes('windrunner') ||
    s.includes('dagger') ||
    s.includes('fan') ||
    s.includes('longbow')
  ) {
    return 'azure';
  }
  if (s.includes('astral') || s.includes('warstaff') || s.includes('void') || s.includes('lantern')) {
    return 'astral';
  }
  if (s.includes('reliquary') || s.includes('mace') || s.includes('broadsword') || s.includes('solar')) {
    return 'gold';
  }
  return 'crimson';
}

export interface ReanimatedCombatantSpriteProps {
  source: ImageSourcePropType;
  state: CombatantAnimState;
  facing: 'right' | 'left';
  width: number;
  height: number;
  actionTriggerKey?: number;
  playbackRate?: number;
  hitFlash?: boolean;
  telegraphGlow?: boolean;
  slashTheme?: SlashVfxTheme;
  paused?: boolean;
  onAnimationComplete?: (completedState: CombatantAnimState, actionKey?: number) => void;
  testID?: string;
}

interface CombatantMotionStyles {
  bodyStyle: ArenaMotionStyle;
  slashStyle: ArenaMotionStyle;
  guardStyle: ArenaMotionStyle;
  telegraphStyle: ArenaMotionStyle;
}

function useReanimatedCombatantMotion(
  state: CombatantAnimState,
  facing: 'right' | 'left',
  actionTriggerKey: number,
  playbackRate: number,
  telegraphGlow: boolean,
  paused: boolean,
  onCompleteRef: React.MutableRefObject<
    ((completedState: CombatantAnimState, actionKey?: number) => void) | undefined
  >
): CombatantMotionStyles {
  const Reanimated = getReanimatedRuntime()!;
  const dir = facing === 'right' ? 1 : -1;

  const tx = Reanimated.useSharedValue(0);
  const ty = Reanimated.useSharedValue(0);
  const sx = Reanimated.useSharedValue(1);
  const sy = Reanimated.useSharedValue(1);
  const rotDeg = Reanimated.useSharedValue(0);
  const bodyOpacity = Reanimated.useSharedValue(1);
  const slashOpacity = Reanimated.useSharedValue(0);
  const slashScale = Reanimated.useSharedValue(0.75);
  const guardOpacity = Reanimated.useSharedValue(0);
  const teleOpacity = Reanimated.useSharedValue(0);

  useEffect(() => {
    const rate = Math.max(0.25, playbackRate);
    const scaleDur = (ms: number) => Math.max(40, Math.round(ms / rate));

    Reanimated.cancelAnimation(tx);
    Reanimated.cancelAnimation(ty);
    Reanimated.cancelAnimation(sx);
    Reanimated.cancelAnimation(sy);
    Reanimated.cancelAnimation(rotDeg);
    Reanimated.cancelAnimation(bodyOpacity);
    Reanimated.cancelAnimation(slashOpacity);
    Reanimated.cancelAnimation(slashScale);
    Reanimated.cancelAnimation(guardOpacity);

    if (paused) {
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    const easeInOut = Reanimated.Easing.inOut(Reanimated.Easing.quad);
    const easeOut = Reanimated.Easing.out(Reanimated.Easing.cubic);

    if (state === 'idle') {
      tx.value = 0;
      ty.value = 0;
      rotDeg.value = 0;
      bodyOpacity.value = 1;
      slashOpacity.value = 0;
      guardOpacity.value = 0;
      const half = scaleDur(780);
      sy.value = Reanimated.withRepeat(
        Reanimated.withSequence(
          Reanimated.withTiming(1.024, { duration: half, easing: easeInOut }),
          Reanimated.withTiming(1.0, { duration: half, easing: easeInOut })
        ),
        -1,
        false
      );
      sx.value = Reanimated.withRepeat(
        Reanimated.withSequence(
          Reanimated.withTiming(0.988, { duration: half, easing: easeInOut }),
          Reanimated.withTiming(1.0, { duration: half, easing: easeInOut })
        ),
        -1,
        false
      );
    } else if (state === 'walk') {
      tx.value = 0;
      bodyOpacity.value = 1;
      slashOpacity.value = 0;
      guardOpacity.value = 0;
      const step = scaleDur(170);
      ty.value = Reanimated.withRepeat(
        Reanimated.withSequence(
          Reanimated.withTiming(-6, { duration: step, easing: easeOut }),
          Reanimated.withTiming(0, { duration: step, easing: easeInOut })
        ),
        -1,
        false
      );
      rotDeg.value = Reanimated.withRepeat(
        Reanimated.withSequence(
          Reanimated.withTiming(5 * dir, { duration: step }),
          Reanimated.withTiming(2 * dir, { duration: step })
        ),
        -1,
        false
      );
      sy.value = 1;
      sx.value = 1;
    } else if (state === 'attack') {
      bodyOpacity.value = 1;
      guardOpacity.value = 0;
      const dCoil = scaleDur(110);
      const dLunge = scaleDur(95);
      const dHold = scaleDur(65);
      const dRec = scaleDur(210);

      tx.value = Reanimated.withSequence(
        Reanimated.withTiming(-9 * dir, { duration: dCoil, easing: easeInOut }),
        Reanimated.withTiming(26 * dir, { duration: dLunge, easing: easeOut }),
        Reanimated.withTiming(26 * dir, { duration: dHold }),
        Reanimated.withTiming(0, { duration: dRec, easing: easeInOut })
      );
      ty.value = Reanimated.withSequence(
        Reanimated.withTiming(2, { duration: dCoil }),
        Reanimated.withTiming(-5, { duration: dLunge }),
        Reanimated.withTiming(0, { duration: dHold + dRec })
      );
      rotDeg.value = Reanimated.withSequence(
        Reanimated.withTiming(-6 * dir, { duration: dCoil }),
        Reanimated.withTiming(9 * dir, { duration: dLunge }),
        Reanimated.withTiming(9 * dir, { duration: dHold }),
        Reanimated.withTiming(0, { duration: dRec })
      );
      sx.value = Reanimated.withSequence(
        Reanimated.withTiming(0.95, { duration: dCoil }),
        Reanimated.withTiming(1.06, { duration: dLunge }),
        Reanimated.withTiming(1.0, { duration: dHold + dRec })
      );
      sy.value = Reanimated.withSequence(
        Reanimated.withTiming(1.04, { duration: dCoil }),
        Reanimated.withTiming(0.95, { duration: dLunge }),
        Reanimated.withTiming(1.0, { duration: dHold + dRec })
      );
      slashOpacity.value = Reanimated.withSequence(
        Reanimated.withTiming(0, { duration: dCoil + Math.round(dLunge * 0.45) }),
        Reanimated.withTiming(0.96, { duration: Math.max(30, Math.round(dLunge * 0.55)) }),
        Reanimated.withTiming(0.85, { duration: dHold }),
        Reanimated.withTiming(0, { duration: Math.round(dRec * 0.75) })
      );
      slashScale.value = Reanimated.withSequence(
        Reanimated.withTiming(0.72, { duration: dCoil + Math.round(dLunge * 0.45) }),
        Reanimated.withTiming(1.08, { duration: dHold + Math.round(dLunge * 0.55), easing: easeOut }),
        Reanimated.withTiming(1.16, { duration: Math.round(dRec * 0.75) })
      );

      timer = setTimeout(() => {
        onCompleteRef.current?.('attack', actionTriggerKey);
      }, dCoil + dLunge + dHold + dRec + 16);
    } else if (state === 'guard') {
      tx.value = -5 * dir;
      ty.value = 3;
      sx.value = 1.03;
      sy.value = 0.95;
      rotDeg.value = -4 * dir;
      bodyOpacity.value = 1;
      slashOpacity.value = 0;
      const half = scaleDur(520);
      guardOpacity.value = Reanimated.withRepeat(
        Reanimated.withSequence(
          Reanimated.withTiming(0.88, { duration: half, easing: easeInOut }),
          Reanimated.withTiming(0.48, { duration: half, easing: easeInOut })
        ),
        -1,
        false
      );
    } else if (state === 'hurt') {
      bodyOpacity.value = 1;
      slashOpacity.value = 0;
      guardOpacity.value = 0;
      const dHit = scaleDur(90);
      const dRec = scaleDur(260);
      tx.value = Reanimated.withSequence(
        Reanimated.withTiming(-14 * dir, { duration: dHit, easing: easeOut }),
        Reanimated.withTiming(0, { duration: dRec, easing: easeInOut })
      );
      rotDeg.value = Reanimated.withSequence(
        Reanimated.withTiming(-10 * dir, { duration: dHit }),
        Reanimated.withTiming(0, { duration: dRec })
      );
      sx.value = 1;
      sy.value = 1;
      timer = setTimeout(() => {
        onCompleteRef.current?.('hurt', actionTriggerKey);
      }, dHit + dRec + 16);
    } else if (state === 'victory') {
      tx.value = 0;
      rotDeg.value = 0;
      bodyOpacity.value = 1;
      slashOpacity.value = 0;
      guardOpacity.value = 0;
      const half = scaleDur(360);
      ty.value = Reanimated.withRepeat(
        Reanimated.withSequence(
          Reanimated.withTiming(-9, { duration: half, easing: easeOut }),
          Reanimated.withTiming(0, { duration: half, easing: easeInOut })
        ),
        -1,
        false
      );
      sy.value = Reanimated.withRepeat(
        Reanimated.withSequence(
          Reanimated.withTiming(1.04, { duration: half }),
          Reanimated.withTiming(0.98, { duration: half })
        ),
        -1,
        false
      );
      sx.value = 1;
    } else if (state === 'death') {
      slashOpacity.value = 0;
      guardOpacity.value = 0;
      const dFall = scaleDur(460);
      tx.value = Reanimated.withTiming(-8 * dir, { duration: dFall });
      ty.value = Reanimated.withTiming(10, { duration: dFall });
      rotDeg.value = Reanimated.withTiming(-28 * dir, { duration: dFall, easing: easeOut });
      bodyOpacity.value = Reanimated.withTiming(0.35, { duration: dFall });
      timer = setTimeout(() => {
        onCompleteRef.current?.('death', actionTriggerKey);
      }, dFall + 16);
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [state, dir, actionTriggerKey, playbackRate, paused]);

  useEffect(() => {
    Reanimated.cancelAnimation(teleOpacity);
    if (telegraphGlow && !paused && state !== 'death') {
      teleOpacity.value = Reanimated.withRepeat(
        Reanimated.withSequence(
          Reanimated.withTiming(0.85, { duration: 480 }),
          Reanimated.withTiming(0.25, { duration: 480 })
        ),
        -1,
        false
      );
    } else {
      teleOpacity.value = 0;
    }
  }, [telegraphGlow, paused, state]);

  const bodyStyle = Reanimated.useAnimatedStyle(() => ({
    opacity: bodyOpacity.value,
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { rotate: `${rotDeg.value}deg` },
      { scaleX: sx.value },
      { scaleY: sy.value },
    ],
  }));

  const slashStyle = Reanimated.useAnimatedStyle(() => ({
    opacity: slashOpacity.value,
    transform: [{ scale: slashScale.value }],
  }));

  const guardStyle = Reanimated.useAnimatedStyle(() => ({
    opacity: guardOpacity.value,
  }));

  const telegraphStyle = Reanimated.useAnimatedStyle(() => ({
    opacity: teleOpacity.value,
  }));

  return {
    bodyStyle: bodyStyle as unknown as ArenaMotionStyle,
    slashStyle: slashStyle as unknown as ArenaMotionStyle,
    guardStyle: guardStyle as unknown as ArenaMotionStyle,
    telegraphStyle: telegraphStyle as unknown as ArenaMotionStyle,
  };
}

function useFallbackCombatantMotion(
  state: CombatantAnimState,
  facing: 'right' | 'left',
  actionTriggerKey: number,
  playbackRate: number,
  telegraphGlow: boolean,
  paused: boolean,
  onCompleteRef: React.MutableRefObject<
    ((completedState: CombatantAnimState, actionKey?: number) => void) | undefined
  >
): CombatantMotionStyles {
  const dir = facing === 'right' ? 1 : -1;
  const nativeDriver = Platform.OS !== 'web';
  const tx = useRef(new RNAnimated.Value(0)).current;
  const ty = useRef(new RNAnimated.Value(0)).current;
  const sy = useRef(new RNAnimated.Value(1)).current;
  const rot = useRef(new RNAnimated.Value(0)).current;
  const bodyOpacity = useRef(new RNAnimated.Value(1)).current;
  const slashOpacity = useRef(new RNAnimated.Value(0)).current;
  const guardOpacity = useRef(new RNAnimated.Value(0)).current;
  const teleOpacity = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    const rate = Math.max(0.25, playbackRate);
    const scaleDur = (ms: number) => Math.max(40, Math.round(ms / rate));

    tx.stopAnimation();
    ty.stopAnimation();
    sy.stopAnimation();
    rot.stopAnimation();
    bodyOpacity.stopAnimation();
    slashOpacity.stopAnimation();
    guardOpacity.stopAnimation();

    if (paused) return;

    let anim: RNAnimated.CompositeAnimation | null = null;
    if (state === 'idle') {
      tx.setValue(0);
      ty.setValue(0);
      rot.setValue(0);
      bodyOpacity.setValue(1);
      slashOpacity.setValue(0);
      guardOpacity.setValue(0);
      const half = scaleDur(780);
      anim = RNAnimated.loop(
        RNAnimated.sequence([
          RNAnimated.timing(sy, { toValue: 1.024, duration: half, easing: RNEasing.inOut(RNEasing.quad), useNativeDriver: nativeDriver }),
          RNAnimated.timing(sy, { toValue: 1.0, duration: half, easing: RNEasing.inOut(RNEasing.quad), useNativeDriver: nativeDriver }),
        ])
      );
      anim.start();
    } else if (state === 'walk') {
      tx.setValue(0);
      bodyOpacity.setValue(1);
      slashOpacity.setValue(0);
      guardOpacity.setValue(0);
      rot.setValue(4 * dir);
      const step = scaleDur(170);
      anim = RNAnimated.loop(
        RNAnimated.sequence([
          RNAnimated.timing(ty, { toValue: -6, duration: step, useNativeDriver: nativeDriver }),
          RNAnimated.timing(ty, { toValue: 0, duration: step, useNativeDriver: nativeDriver }),
        ])
      );
      anim.start();
    } else if (state === 'attack') {
      bodyOpacity.setValue(1);
      guardOpacity.setValue(0);
      const dCoil = scaleDur(110);
      const dLunge = scaleDur(95);
      const dHold = scaleDur(65);
      const dRec = scaleDur(210);
      anim = RNAnimated.parallel([
        RNAnimated.sequence([
          RNAnimated.timing(tx, { toValue: -9 * dir, duration: dCoil, useNativeDriver: nativeDriver }),
          RNAnimated.timing(tx, { toValue: 26 * dir, duration: dLunge, useNativeDriver: nativeDriver }),
          RNAnimated.timing(tx, { toValue: 26 * dir, duration: dHold, useNativeDriver: nativeDriver }),
          RNAnimated.timing(tx, { toValue: 0, duration: dRec, useNativeDriver: nativeDriver }),
        ]),
        RNAnimated.sequence([
          RNAnimated.timing(rot, { toValue: -6 * dir, duration: dCoil, useNativeDriver: nativeDriver }),
          RNAnimated.timing(rot, { toValue: 9 * dir, duration: dLunge, useNativeDriver: nativeDriver }),
          RNAnimated.timing(rot, { toValue: 9 * dir, duration: dHold, useNativeDriver: nativeDriver }),
          RNAnimated.timing(rot, { toValue: 0, duration: dRec, useNativeDriver: nativeDriver }),
        ]),
        RNAnimated.sequence([
          RNAnimated.timing(slashOpacity, { toValue: 0, duration: dCoil + Math.round(dLunge * 0.4), useNativeDriver: nativeDriver }),
          RNAnimated.timing(slashOpacity, { toValue: 0.95, duration: Math.round(dLunge * 0.6), useNativeDriver: nativeDriver }),
          RNAnimated.timing(slashOpacity, { toValue: 0.85, duration: dHold, useNativeDriver: nativeDriver }),
          RNAnimated.timing(slashOpacity, { toValue: 0, duration: Math.round(dRec * 0.75), useNativeDriver: nativeDriver }),
        ]),
      ]);
      anim.start(({ finished }) => {
        if (finished) onCompleteRef.current?.('attack', actionTriggerKey);
      });
    } else if (state === 'guard') {
      tx.setValue(-5 * dir);
      ty.setValue(3);
      sy.setValue(0.95);
      rot.setValue(-4 * dir);
      bodyOpacity.setValue(1);
      slashOpacity.setValue(0);
      guardOpacity.setValue(0.75);
    } else if (state === 'hurt') {
      const dHit = scaleDur(90);
      const dRec = scaleDur(260);
      anim = RNAnimated.sequence([
        RNAnimated.timing(tx, { toValue: -14 * dir, duration: dHit, useNativeDriver: nativeDriver }),
        RNAnimated.timing(tx, { toValue: 0, duration: dRec, useNativeDriver: nativeDriver }),
      ]);
      anim.start(({ finished }) => {
        if (finished) onCompleteRef.current?.('hurt', actionTriggerKey);
      });
    } else if (state === 'victory') {
      tx.setValue(0);
      rot.setValue(0);
      bodyOpacity.setValue(1);
      const half = scaleDur(360);
      anim = RNAnimated.loop(
        RNAnimated.sequence([
          RNAnimated.timing(ty, { toValue: -9, duration: half, useNativeDriver: nativeDriver }),
          RNAnimated.timing(ty, { toValue: 0, duration: half, useNativeDriver: nativeDriver }),
        ])
      );
      anim.start();
    } else if (state === 'death') {
      const dFall = scaleDur(460);
      anim = RNAnimated.parallel([
        RNAnimated.timing(rot, { toValue: -28 * dir, duration: dFall, useNativeDriver: nativeDriver }),
        RNAnimated.timing(bodyOpacity, { toValue: 0.35, duration: dFall, useNativeDriver: nativeDriver }),
      ]);
      anim.start(({ finished }) => {
        if (finished) onCompleteRef.current?.('death', actionTriggerKey);
      });
    }

    return () => {
      anim?.stop();
    };
  }, [state, dir, actionTriggerKey, playbackRate, paused, nativeDriver]);

  useEffect(() => {
    teleOpacity.stopAnimation();
    if (telegraphGlow && !paused && state !== 'death') {
      const loop = RNAnimated.loop(
        RNAnimated.sequence([
          RNAnimated.timing(teleOpacity, { toValue: 0.85, duration: 480, useNativeDriver: nativeDriver }),
          RNAnimated.timing(teleOpacity, { toValue: 0.25, duration: 480, useNativeDriver: nativeDriver }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
    teleOpacity.setValue(0);
  }, [telegraphGlow, paused, state, nativeDriver]);

  const rotateStr = rot.interpolate({
    inputRange: [-45, 45],
    outputRange: ['-45deg', '45deg'],
  });

  return {
    bodyStyle: {
      opacity: bodyOpacity,
      transform: [{ translateX: tx }, { translateY: ty }, { rotate: rotateStr }, { scaleY: sy }],
    },
    slashStyle: { opacity: slashOpacity },
    guardStyle: { opacity: guardOpacity },
    telegraphStyle: { opacity: teleOpacity },
  };
}

const useCombatantMotion = IS_REANIMATED_AVAILABLE
  ? useReanimatedCombatantMotion
  : useFallbackCombatantMotion;

export const ReanimatedCombatantSprite: React.FC<ReanimatedCombatantSpriteProps> = React.memo(
  ({
    source,
    state,
    facing,
    width,
    height,
    actionTriggerKey = 0,
    playbackRate = 1,
    hitFlash = false,
    telegraphGlow = false,
    slashTheme = 'crimson',
    paused = false,
    onAnimationComplete,
    testID,
  }) => {
    const onCompleteRef = useRef(onAnimationComplete);
    onCompleteRef.current = onAnimationComplete;

    const motion = useCombatantMotion(
      state,
      facing,
      actionTriggerKey,
      playbackRate,
      telegraphGlow,
      paused,
      onCompleteRef
    );

    const palette = SLASH_PALETTES[slashTheme];
    const slashSize = Math.round(Math.max(width, height) * 0.92);

    return (
      <View
        testID={testID}
        style={[styles.container, { width, height }]}
        pointerEvents="none"
      >
        {/* Ground Contact Shadow */}
        <View
          style={[
            styles.shadow,
            {
              width: Math.round(width * 0.62),
              height: Math.max(7, Math.round(height * 0.085)),
              borderRadius: Math.round(width * 0.31),
            },
          ]}
        />

        {/* Boss / Enemy Heavy-Attack Telegraph Glow */}
        {telegraphGlow ? (
          <ArenaAnimatedView
            style={[
              styles.telegraphRing,
              {
                width: Math.round(width * 0.88),
                height: Math.round(height * 0.88),
                borderRadius: Math.round(width * 0.44),
              },
              motion.telegraphStyle,
            ]}
          />
        ) : null}

        {/* Full-Body Illustrated Anime Cutout */}
        <ArenaAnimatedView style={[styles.spriteWrap, { width, height }, motion.bodyStyle]}>
          <ExpoImage
            source={source as any}
            style={styles.image}
            contentFit="contain"
            contentPosition="bottom center"
          />
          {hitFlash ? <View style={styles.hitFlashTint} /> : null}
        </ArenaAnimatedView>

        {/* Guard Spirit Aegis Barrier */}
        <ArenaAnimatedView
          style={[
            styles.guardArcWrap,
            facing === 'right' ? styles.overlayRight : styles.overlayLeft,
            motion.guardStyle,
          ]}
        >
          <Svg width={Math.round(width * 0.45)} height={Math.round(height * 0.72)} viewBox="0 0 50 90">
            <Path
              d={facing === 'right' ? 'M 8 8 Q 42 45 8 82' : 'M 42 8 Q 8 45 42 82'}
              fill="none"
              stroke="#FBBF24"
              strokeWidth="4.5"
              strokeLinecap="round"
            />
            <Path
              d={facing === 'right' ? 'M 14 16 Q 36 45 14 74' : 'M 36 16 Q 14 45 36 74'}
              fill="none"
              stroke="#FEF3C7"
              strokeWidth="2"
              strokeLinecap="round"
              opacity={0.85}
            />
          </Svg>
        </ArenaAnimatedView>

        {/* Code-Driven Reanimated 4 Glowing Anime Crescent Slash VFX */}
        <ArenaAnimatedView
          style={[
            styles.slashWrap,
            {
              width: slashSize,
              height: slashSize,
              left: facing === 'right' ? Math.round(width * 0.34) : -Math.round(slashSize * 0.38),
              top: Math.round((height - slashSize) * 0.38),
            },
            motion.slashStyle,
          ]}
        >
          <Svg width={slashSize} height={slashSize} viewBox="0 0 120 120">
            <Path
              d={
                facing === 'right'
                  ? 'M 32 14 A 56 56 0 0 1 94 104'
                  : 'M 88 14 A 56 56 0 0 0 26 104'
              }
              fill="none"
              stroke={palette.outer}
              strokeWidth="13"
              strokeLinecap="round"
              opacity={0.72}
            />
            <Path
              d={
                facing === 'right'
                  ? 'M 36 18 A 54 54 0 0 1 94 100'
                  : 'M 84 18 A 54 54 0 0 0 26 100'
              }
              fill="none"
              stroke={palette.mid}
              strokeWidth="7"
              strokeLinecap="round"
            />
            <Path
              d={
                facing === 'right'
                  ? 'M 42 24 A 52 52 0 0 1 92 96'
                  : 'M 78 24 A 52 52 0 0 0 28 96'
              }
              fill="none"
              stroke={palette.core}
              strokeWidth="2.8"
              strokeLinecap="round"
            />
          </Svg>
        </ArenaAnimatedView>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'visible',
  },
  shadow: {
    position: 'absolute',
    bottom: -2,
    backgroundColor: 'rgba(6, 9, 15, 0.52)',
  },
  telegraphRing: {
    position: 'absolute',
    bottom: 4,
    backgroundColor: 'rgba(239, 68, 68, 0.16)',
    borderWidth: 1.5,
    borderColor: 'rgba(248, 113, 113, 0.7)',
  },
  spriteWrap: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  hitFlashTint: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.42)',
  },
  guardArcWrap: {
    position: 'absolute',
    top: '14%',
  },
  overlayRight: {
    right: -6,
  },
  overlayLeft: {
    left: -6,
  },
  slashWrap: {
    position: 'absolute',
  },
});

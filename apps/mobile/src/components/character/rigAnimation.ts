import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated as RNAnimated,
  Easing as RNEasing,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import type { StancePoseAngles } from '@goki/game-engine';
import {
  IS_REANIMATED_AVAILABLE,
  getReanimatedRuntime,
} from '../battle/reanimatedRuntime';

export type RigAnimationState =
  | 'idle'
  | 'walk'
  | 'attack'
  | 'guard'
  | 'hurt'
  | 'victory'
  | 'death';

export interface BonePoseTransforms {
  root: { translateX: number; translateY: number };
  pelvis: { translateY: number; rotateDeg: number };
  torso: { rotateDeg: number };
  head: { rotateDeg: number };
  frontUpperArm: { rotateDeg: number };
  frontForearm: { rotateDeg: number };
  backUpperArm: { rotateDeg: number };
  backForearm: { rotateDeg: number };
  frontThigh: { rotateDeg: number };
  frontShin: { rotateDeg: number };
  backThigh: { rotateDeg: number };
  backShin: { rotateDeg: number };
  tailsWaveDeg: number;
  auraScale: number;
  auraOpacity: number;
  guardShieldOpacity: number;
}

export type RigMotionStyle = StyleProp<ViewStyle | Record<string, unknown>>;

export interface RigAnimatedViewProps extends ViewProps {
  style?: RigMotionStyle;
  pointerEvents?: 'box-none' | 'none' | 'box-only' | 'auto';
  children?: React.ReactNode;
}

export const RigAnimatedView: React.FC<RigAnimatedViewProps> = (props) => {
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

export interface UseCharacterRigAnimationParams {
  state: RigAnimationState;
  actionTriggerKey?: number;
  stanceAngles: StancePoseAngles;
  playbackRate?: number;
  paused?: boolean;
  onAnimationComplete?: (completedState: RigAnimationState, actionKey?: number) => void;
}

export interface CharacterRigAnimationDriver {
  rootStyle: RigMotionStyle;
  pelvisStyle: RigMotionStyle;
  torsoStyle: RigMotionStyle;
  headStyle: RigMotionStyle;
  frontUpperArmStyle: RigMotionStyle;
  frontForearmStyle: RigMotionStyle;
  backUpperArmStyle: RigMotionStyle;
  backForearmStyle: RigMotionStyle;
  frontThighStyle: RigMotionStyle;
  frontShinStyle: RigMotionStyle;
  backThighStyle: RigMotionStyle;
  backShinStyle: RigMotionStyle;
  tailWaveStyle: RigMotionStyle;
  tailCounterWaveStyle: RigMotionStyle;
  auraStyle: RigMotionStyle;
  guardShieldStyle: RigMotionStyle;
}

interface KeyframeTrackSet {
  inputRange: number[];
  rootX: number[];
  rootY: number[];
  pelvisY: number[];
  pelvisDeg: number[];
  torsoDeg: number[];
  headDeg: number[];
  frontUpperArmDeg: number[];
  frontForearmDeg: number[];
  backUpperArmDeg: number[];
  backForearmDeg: number[];
  frontThighDeg: number[];
  frontShinDeg: number[];
  backThighDeg: number[];
  backShinDeg: number[];
  tailsWaveDeg: number[];
  tailCounterWaveDeg: number[];
  auraScale: number[];
  auraOpacity: number[];
  guardShieldOpacity: number[];
}

interface ClipTimingSpec {
  loop: boolean;
  durationMs: number;
  clampFinal?: boolean;
}

const CLIP_TIMING_BY_STATE: Record<RigAnimationState, ClipTimingSpec> = {
  idle: { loop: true, durationMs: 1600 },
  walk: { loop: true, durationMs: 680 },
  attack: { loop: false, durationMs: 520 },
  guard: { loop: true, durationMs: 1100 },
  hurt: { loop: false, durationMs: 420 },
  victory: { loop: true, durationMs: 1400 },
  death: { loop: false, durationMs: 600, clampFinal: true },
};

function buildKeyframeTracks(
  state: RigAnimationState,
  stance: StancePoseAngles
): KeyframeTrackSet {
  switch (state) {
    case 'idle': {
      const i = [0, 0.25, 0.5, 0.75, 1];
      return {
        inputRange: i,
        rootX: [0, 0, 0, 0, 0],
        rootY: [0, 0, 0, 0, 0],
        pelvisY: [0, -1, -2.2, -1, 0],
        pelvisDeg: [0, 0.5, 0, -0.5, 0],
        torsoDeg: [
          stance.torsoLeanDeg,
          stance.torsoLeanDeg - 1.1,
          stance.torsoLeanDeg - 2,
          stance.torsoLeanDeg - 1.1,
          stance.torsoLeanDeg,
        ],
        headDeg: [
          stance.headTiltDeg,
          stance.headTiltDeg + 1,
          stance.headTiltDeg + 1.8,
          stance.headTiltDeg + 1,
          stance.headTiltDeg,
        ],
        frontUpperArmDeg: [
          stance.frontUpperArmDeg,
          stance.frontUpperArmDeg + 2.2,
          stance.frontUpperArmDeg + 4,
          stance.frontUpperArmDeg + 2.2,
          stance.frontUpperArmDeg,
        ],
        frontForearmDeg: [
          stance.frontForearmDeg,
          stance.frontForearmDeg - 2.5,
          stance.frontForearmDeg - 4.5,
          stance.frontForearmDeg - 2.5,
          stance.frontForearmDeg,
        ],
        backUpperArmDeg: [
          stance.backUpperArmDeg,
          stance.backUpperArmDeg - 2,
          stance.backUpperArmDeg - 3.5,
          stance.backUpperArmDeg - 2,
          stance.backUpperArmDeg,
        ],
        backForearmDeg: [
          stance.backForearmDeg,
          stance.backForearmDeg - 2,
          stance.backForearmDeg - 3.8,
          stance.backForearmDeg - 2,
          stance.backForearmDeg,
        ],
        frontThighDeg: [
          stance.frontThighDeg,
          stance.frontThighDeg - 0.5,
          stance.frontThighDeg - 1,
          stance.frontThighDeg - 0.5,
          stance.frontThighDeg,
        ],
        frontShinDeg: [
          stance.frontShinDeg,
          stance.frontShinDeg + 0.5,
          stance.frontShinDeg + 1,
          stance.frontShinDeg + 0.5,
          stance.frontShinDeg,
        ],
        backThighDeg: [
          stance.backThighDeg,
          stance.backThighDeg + 0.5,
          stance.backThighDeg + 1,
          stance.backThighDeg + 0.5,
          stance.backThighDeg,
        ],
        backShinDeg: [
          stance.backShinDeg,
          stance.backShinDeg - 0.5,
          stance.backShinDeg - 1,
          stance.backShinDeg - 0.5,
          stance.backShinDeg,
        ],
        tailsWaveDeg: [0, 5.5, 0, -5.5, 0],
        tailCounterWaveDeg: [0, -4.5, 0, 4.5, 0],
        auraScale: [0.97, 1.01, 1.05, 1.01, 0.97],
        auraOpacity: [0.76, 0.88, 0.98, 0.88, 0.76],
        guardShieldOpacity: [0, 0, 0, 0, 0],
      };
    }

    case 'walk': {
      const i = [0, 0.25, 0.5, 0.75, 1];
      return {
        inputRange: i,
        rootX: [0, 1.5, 0, 1.5, 0],
        rootY: [0, 0, 0, 0, 0],
        pelvisY: [0, -4, 0, -4, 0],
        pelvisDeg: [-2, 1.5, 2, -1.5, -2],
        torsoDeg: [8, 10, 8, 10, 8],
        headDeg: [-4, -5, -4, -5, -4],
        frontUpperArmDeg: [-24, 0, 24, 0, -24],
        frontForearmDeg: [-32, -22, -16, -24, -32],
        backUpperArmDeg: [24, 0, -24, 0, 24],
        backForearmDeg: [-16, -24, -34, -22, -16],
        frontThighDeg: [24, 2, -24, -6, 24],
        frontShinDeg: [-14, -24, -6, -18, -14],
        backThighDeg: [-24, -6, 24, 2, -24],
        backShinDeg: [-6, -18, -14, -24, -6],
        tailsWaveDeg: [-6, 4, 8, -2, -6],
        tailCounterWaveDeg: [6, -4, -8, 2, 6],
        auraScale: [0.98, 1.03, 0.99, 1.03, 0.98],
        auraOpacity: [0.8, 0.92, 0.82, 0.92, 0.8],
        guardShieldOpacity: [0, 0, 0, 0, 0],
      };
    }

    case 'attack': {
      const i = [0, 0.32, 0.56, 0.78, 1];
      return {
        inputRange: i,
        rootX: [0, -5, 18, 10, 0],
        rootY: [0, 0, 0, 0, 0],
        pelvisY: [0, 2, -2, 1, 0],
        pelvisDeg: [0, -5, 7, 3, 0],
        torsoDeg: [stance.torsoLeanDeg, -12, 22, 10, stance.torsoLeanDeg],
        headDeg: [stance.headTiltDeg, 6, -12, -5, stance.headTiltDeg],
        frontUpperArmDeg: [stance.frontUpperArmDeg, -110, -18, 4, stance.frontUpperArmDeg],
        frontForearmDeg: [stance.frontForearmDeg, -36, -10, -18, stance.frontForearmDeg],
        backUpperArmDeg: [stance.backUpperArmDeg, 26, -34, -18, stance.backUpperArmDeg],
        backForearmDeg: [stance.backForearmDeg, -22, -48, -28, stance.backForearmDeg],
        frontThighDeg: [stance.frontThighDeg, 16, 22, 12, stance.frontThighDeg],
        frontShinDeg: [stance.frontShinDeg, -16, -18, -10, stance.frontShinDeg],
        backThighDeg: [stance.backThighDeg, -14, -28, -16, stance.backThighDeg],
        backShinDeg: [stance.backShinDeg, 12, 22, 12, stance.backShinDeg],
        tailsWaveDeg: [0, -12, 14, 6, 0],
        tailCounterWaveDeg: [0, 10, -12, -5, 0],
        auraScale: [1, 1.04, 1.18, 1.08, 1],
        auraOpacity: [0.8, 0.9, 1, 0.9, 0.8],
        guardShieldOpacity: [0, 0, 0, 0, 0],
      };
    }

    case 'guard': {
      const i = [0, 0.25, 0.5, 0.75, 1];
      return {
        inputRange: i,
        rootX: [-2, -2, -2, -2, -2],
        rootY: [0, 0, 0, 0, 0],
        pelvisY: [4, 4.8, 5.5, 4.8, 4],
        pelvisDeg: [-2, -2.5, -2, -1.5, -2],
        torsoDeg: [9, 10.2, 11, 10.2, 9],
        headDeg: [-7, -7.5, -8, -7.5, -7],
        frontUpperArmDeg: [18, 19.5, 21, 19.5, 18],
        frontForearmDeg: [-74, -76, -78, -76, -74],
        backUpperArmDeg: [-44, -46, -48, -46, -44],
        backForearmDeg: [-66, -68, -70, -68, -66],
        frontThighDeg: [18, 19, 20, 19, 18],
        frontShinDeg: [-16, -17, -18, -17, -16],
        backThighDeg: [-20, -21, -22, -21, -20],
        backShinDeg: [16, 17, 18, 17, 16],
        tailsWaveDeg: [-3, 2, 4, -1, -3],
        tailCounterWaveDeg: [3, -2, -4, 1, 3],
        auraScale: [0.98, 1.02, 1.06, 1.02, 0.98],
        auraOpacity: [0.82, 0.9, 0.96, 0.9, 0.82],
        guardShieldOpacity: [0.58, 0.76, 0.92, 0.76, 0.58],
      };
    }

    case 'hurt': {
      const i = [0, 0.26, 0.55, 1];
      return {
        inputRange: i,
        rootX: [0, -7, -4, 0],
        rootY: [0, 1, 0.5, 0],
        pelvisY: [0, 3, 1.5, 0],
        pelvisDeg: [0, -6, -3, 0],
        torsoDeg: [stance.torsoLeanDeg, -16, -9, stance.torsoLeanDeg],
        headDeg: [stance.headTiltDeg, -14, -7, stance.headTiltDeg],
        frontUpperArmDeg: [stance.frontUpperArmDeg, 36, 20, stance.frontUpperArmDeg],
        frontForearmDeg: [stance.frontForearmDeg, -24, -20, stance.frontForearmDeg],
        backUpperArmDeg: [stance.backUpperArmDeg, 22, 8, stance.backUpperArmDeg],
        backForearmDeg: [stance.backForearmDeg, -18, -16, stance.backForearmDeg],
        frontThighDeg: [stance.frontThighDeg, 12, 8, stance.frontThighDeg],
        frontShinDeg: [stance.frontShinDeg, -10, -7, stance.frontShinDeg],
        backThighDeg: [stance.backThighDeg, -12, -9, stance.backThighDeg],
        backShinDeg: [stance.backShinDeg, 10, 7, stance.backShinDeg],
        tailsWaveDeg: [0, -14, -6, 0],
        tailCounterWaveDeg: [0, 12, 5, 0],
        auraScale: [1, 0.92, 0.96, 1],
        auraOpacity: [0.8, 0.55, 0.72, 0.8],
        guardShieldOpacity: [0, 0, 0, 0],
      };
    }

    case 'victory': {
      const i = [0, 0.25, 0.5, 0.75, 1];
      return {
        inputRange: i,
        rootX: [0, 0, 0, 0, 0],
        rootY: [0, -3, -5, -3, 0],
        pelvisY: [-2, -4, -5.5, -4, -2],
        pelvisDeg: [0, 1.5, 0, -1.5, 0],
        torsoDeg: [-3, -5, -6, -5, -3],
        headDeg: [-4, -6, -7, -6, -4],
        frontUpperArmDeg: [-104, -110, -116, -110, -104],
        frontForearmDeg: [-8, -12, -14, -12, -8],
        backUpperArmDeg: [22, 26, 28, 26, 22],
        backForearmDeg: [-18, -22, -24, -22, -18],
        frontThighDeg: [6, 5, 4, 5, 6],
        frontShinDeg: [-5, -4, -3, -4, -5],
        backThighDeg: [-8, -7, -6, -7, -8],
        backShinDeg: [7, 6, 5, 6, 7],
        tailsWaveDeg: [0, 10, 0, -10, 0],
        tailCounterWaveDeg: [0, -9, 0, 9, 0],
        auraScale: [1.02, 1.09, 1.15, 1.09, 1.02],
        auraOpacity: [0.86, 0.95, 1, 0.95, 0.86],
        guardShieldOpacity: [0, 0, 0, 0, 0],
      };
    }

    case 'death': {
      const i = [0, 0.45, 1];
      return {
        inputRange: i,
        rootX: [0, 4, 9],
        rootY: [0, 0, 0],
        pelvisY: [0, 9, 18],
        pelvisDeg: [0, 12, 22],
        torsoDeg: [stance.torsoLeanDeg, 28, 48],
        headDeg: [stance.headTiltDeg, 18, 32],
        frontUpperArmDeg: [stance.frontUpperArmDeg, 18, 36],
        frontForearmDeg: [stance.frontForearmDeg, -14, -8],
        backUpperArmDeg: [stance.backUpperArmDeg, 14, 28],
        backForearmDeg: [stance.backForearmDeg, -10, -4],
        frontThighDeg: [stance.frontThighDeg, 26, 48],
        frontShinDeg: [stance.frontShinDeg, -42, -74],
        backThighDeg: [stance.backThighDeg, 14, 34],
        backShinDeg: [stance.backShinDeg, -34, -66],
        tailsWaveDeg: [0, -10, -18],
        tailCounterWaveDeg: [0, -8, -14],
        auraScale: [1, 0.72, 0.45],
        auraOpacity: [0.8, 0.35, 0],
        guardShieldOpacity: [0, 0, 0],
      };
    }
  }
}

function sampleLinearTrack(
  progress: number,
  inputRange: readonly number[],
  outputRange: readonly number[]
): number {
  const len = inputRange.length;
  if (len === 0) return 0;
  const firstIn = inputRange[0] ?? 0;
  const firstOut = outputRange[0] ?? 0;
  if (progress <= firstIn || len === 1) {
    return firstOut;
  }
  const lastIdx = len - 1;
  const lastIn = inputRange[lastIdx] ?? 1;
  const lastOut = outputRange[lastIdx] ?? firstOut;
  if (progress >= lastIn) {
    return lastOut;
  }
  for (let i = 0; i < lastIdx; i++) {
    const a = inputRange[i] ?? 0;
    const b = inputRange[i + 1] ?? 1;
    if (progress >= a && progress <= b) {
      const span = b - a;
      const t = span > 0 ? (progress - a) / span : 0;
      const outA = outputRange[i] ?? 0;
      const outB = outputRange[i + 1] ?? outA;
      return outA + (outB - outA) * t;
    }
  }
  return lastOut;
}

export function sampleRigPoseAtProgress(
  state: RigAnimationState,
  progress: number,
  stanceAngles: StancePoseAngles
): BonePoseTransforms {
  const tracks = buildKeyframeTracks(state, stanceAngles);
  const clamped = Math.max(0, Math.min(1, progress));
  return {
    root: {
      translateX: sampleLinearTrack(clamped, tracks.inputRange, tracks.rootX),
      translateY: sampleLinearTrack(clamped, tracks.inputRange, tracks.rootY),
    },
    pelvis: {
      translateY: sampleLinearTrack(clamped, tracks.inputRange, tracks.pelvisY),
      rotateDeg: sampleLinearTrack(clamped, tracks.inputRange, tracks.pelvisDeg),
    },
    torso: {
      rotateDeg: sampleLinearTrack(clamped, tracks.inputRange, tracks.torsoDeg),
    },
    head: {
      rotateDeg: sampleLinearTrack(clamped, tracks.inputRange, tracks.headDeg),
    },
    frontUpperArm: {
      rotateDeg: sampleLinearTrack(clamped, tracks.inputRange, tracks.frontUpperArmDeg),
    },
    frontForearm: {
      rotateDeg: sampleLinearTrack(clamped, tracks.inputRange, tracks.frontForearmDeg),
    },
    backUpperArm: {
      rotateDeg: sampleLinearTrack(clamped, tracks.inputRange, tracks.backUpperArmDeg),
    },
    backForearm: {
      rotateDeg: sampleLinearTrack(clamped, tracks.inputRange, tracks.backForearmDeg),
    },
    frontThigh: {
      rotateDeg: sampleLinearTrack(clamped, tracks.inputRange, tracks.frontThighDeg),
    },
    frontShin: {
      rotateDeg: sampleLinearTrack(clamped, tracks.inputRange, tracks.frontShinDeg),
    },
    backThigh: {
      rotateDeg: sampleLinearTrack(clamped, tracks.inputRange, tracks.backThighDeg),
    },
    backShin: {
      rotateDeg: sampleLinearTrack(clamped, tracks.inputRange, tracks.backShinDeg),
    },
    tailsWaveDeg: sampleLinearTrack(clamped, tracks.inputRange, tracks.tailsWaveDeg),
    auraScale: sampleLinearTrack(clamped, tracks.inputRange, tracks.auraScale),
    auraOpacity: sampleLinearTrack(clamped, tracks.inputRange, tracks.auraOpacity),
    guardShieldOpacity: sampleLinearTrack(
      clamped,
      tracks.inputRange,
      tracks.guardShieldOpacity
    ),
  };
}

function useReanimatedRigAnimation({
  state,
  actionTriggerKey = 0,
  stanceAngles,
  playbackRate = 1,
  paused = false,
  onAnimationComplete,
}: UseCharacterRigAnimationParams): CharacterRigAnimationDriver {
  const Reanimated = getReanimatedRuntime()!;
  const progress = Reanimated.useSharedValue(0);

  const onCompleteRef = useRef(onAnimationComplete);
  onCompleteRef.current = onAnimationComplete;

  const completedDeathKeyRef = useRef<number | null>(null);
  const effectivePaused = paused && state !== 'death';

  const tracks = useMemo(
    () => buildKeyframeTracks(state, stanceAngles),
    [state, stanceAngles]
  );

  useEffect(() => {
    if (state !== 'death') {
      completedDeathKeyRef.current = null;
    }

    if (effectivePaused) {
      Reanimated.cancelAnimation(progress);
      return;
    }

    if (state === 'death' && completedDeathKeyRef.current === actionTriggerKey) {
      progress.value = 1;
      return;
    }

    const clip = CLIP_TIMING_BY_STATE[state];
    const rate = Math.max(0.1, playbackRate);
    const totalMs = Math.max(80, Math.round(clip.durationMs / rate));
    const capturedKey = actionTriggerKey;

    progress.value = 0;

    if (clip.loop) {
      progress.value = Reanimated.withRepeat(
        Reanimated.withTiming(1, {
          duration: totalMs,
          easing: Reanimated.Easing.linear,
        }),
        -1,
        false
      );
      return () => {
        Reanimated.cancelAnimation(progress);
      };
    }

    const emitComplete = (finished?: boolean) => {
      if (!finished) return;
      if (state === 'death') {
        completedDeathKeyRef.current = capturedKey;
      }
      if (onCompleteRef.current) {
        onCompleteRef.current(state, capturedKey);
      }
    };

    if (state === 'attack') {
      const windupMs = Math.max(40, Math.round(totalMs * 0.32));
      const strikeMs = Math.max(40, Math.round(totalMs * 0.24));
      const settleMs = Math.max(40, totalMs - windupMs - strikeMs);
      progress.value = Reanimated.withSequence(
        Reanimated.withTiming(0.32, {
          duration: windupMs,
          easing: Reanimated.Easing.out(Reanimated.Easing.quad),
        }),
        Reanimated.withTiming(0.56, {
          duration: strikeMs,
          easing: Reanimated.Easing.inOut(Reanimated.Easing.cubic),
        }),
        Reanimated.withTiming(
          1,
          {
            duration: settleMs,
            easing: Reanimated.Easing.out(Reanimated.Easing.quad),
          },
          (finished) => {
            if (finished) {
              Reanimated.runOnJS(emitComplete)(true);
            }
          }
        )
      );
    } else if (state === 'hurt') {
      const flinchMs = Math.max(40, Math.round(totalMs * 0.26));
      const recoverMs = Math.max(40, totalMs - flinchMs);
      progress.value = Reanimated.withSequence(
        Reanimated.withTiming(0.26, {
          duration: flinchMs,
          easing: Reanimated.Easing.out(Reanimated.Easing.quad),
        }),
        Reanimated.withTiming(
          1,
          {
            duration: recoverMs,
            easing: Reanimated.Easing.inOut(Reanimated.Easing.quad),
          },
          (finished) => {
            if (finished) {
              Reanimated.runOnJS(emitComplete)(true);
            }
          }
        )
      );
    } else {
      progress.value = Reanimated.withTiming(
        1,
        {
          duration: totalMs,
          easing: Reanimated.Easing.out(Reanimated.Easing.quad),
        },
        (finished) => {
          if (finished) {
            Reanimated.runOnJS(emitComplete)(true);
          }
        }
      );
    }

    return () => {
      if (state !== 'death' || completedDeathKeyRef.current !== capturedKey) {
        Reanimated.cancelAnimation(progress);
      }
    };
  }, [state, actionTriggerKey, effectivePaused, playbackRate, progress, Reanimated]);

  useEffect(
    () => () => {
      Reanimated.cancelAnimation(progress);
    },
    [Reanimated, progress]
  );

  const rootStyle = Reanimated.useAnimatedStyle(() => {
    const x = Reanimated.interpolate(
      progress.value,
      tracks.inputRange,
      tracks.rootX,
      Reanimated.Extrapolation.CLAMP
    );
    const y = Reanimated.interpolate(
      progress.value,
      tracks.inputRange,
      tracks.rootY,
      Reanimated.Extrapolation.CLAMP
    );
    return { transform: [{ translateX: x }, { translateY: y }] };
  }, [tracks]);

  const pelvisStyle = Reanimated.useAnimatedStyle(() => {
    const y = Reanimated.interpolate(
      progress.value,
      tracks.inputRange,
      tracks.pelvisY,
      Reanimated.Extrapolation.CLAMP
    );
    const deg = Reanimated.interpolate(
      progress.value,
      tracks.inputRange,
      tracks.pelvisDeg,
      Reanimated.Extrapolation.CLAMP
    );
    return { transform: [{ translateY: y }, { rotate: `${deg}deg` }] };
  }, [tracks]);

  const torsoStyle = Reanimated.useAnimatedStyle(() => {
    const deg = Reanimated.interpolate(
      progress.value,
      tracks.inputRange,
      tracks.torsoDeg,
      Reanimated.Extrapolation.CLAMP
    );
    return { transform: [{ rotate: `${deg}deg` }] };
  }, [tracks]);

  const headStyle = Reanimated.useAnimatedStyle(() => {
    const deg = Reanimated.interpolate(
      progress.value,
      tracks.inputRange,
      tracks.headDeg,
      Reanimated.Extrapolation.CLAMP
    );
    return { transform: [{ rotate: `${deg}deg` }] };
  }, [tracks]);

  const frontUpperArmStyle = Reanimated.useAnimatedStyle(() => {
    const deg = Reanimated.interpolate(
      progress.value,
      tracks.inputRange,
      tracks.frontUpperArmDeg,
      Reanimated.Extrapolation.CLAMP
    );
    return { transform: [{ rotate: `${deg}deg` }] };
  }, [tracks]);

  const frontForearmStyle = Reanimated.useAnimatedStyle(() => {
    const deg = Reanimated.interpolate(
      progress.value,
      tracks.inputRange,
      tracks.frontForearmDeg,
      Reanimated.Extrapolation.CLAMP
    );
    return { transform: [{ rotate: `${deg}deg` }] };
  }, [tracks]);

  const backUpperArmStyle = Reanimated.useAnimatedStyle(() => {
    const deg = Reanimated.interpolate(
      progress.value,
      tracks.inputRange,
      tracks.backUpperArmDeg,
      Reanimated.Extrapolation.CLAMP
    );
    return { transform: [{ rotate: `${deg}deg` }] };
  }, [tracks]);

  const backForearmStyle = Reanimated.useAnimatedStyle(() => {
    const deg = Reanimated.interpolate(
      progress.value,
      tracks.inputRange,
      tracks.backForearmDeg,
      Reanimated.Extrapolation.CLAMP
    );
    return { transform: [{ rotate: `${deg}deg` }] };
  }, [tracks]);

  const frontThighStyle = Reanimated.useAnimatedStyle(() => {
    const deg = Reanimated.interpolate(
      progress.value,
      tracks.inputRange,
      tracks.frontThighDeg,
      Reanimated.Extrapolation.CLAMP
    );
    return { transform: [{ rotate: `${deg}deg` }] };
  }, [tracks]);

  const frontShinStyle = Reanimated.useAnimatedStyle(() => {
    const deg = Reanimated.interpolate(
      progress.value,
      tracks.inputRange,
      tracks.frontShinDeg,
      Reanimated.Extrapolation.CLAMP
    );
    return { transform: [{ rotate: `${deg}deg` }] };
  }, [tracks]);

  const backThighStyle = Reanimated.useAnimatedStyle(() => {
    const deg = Reanimated.interpolate(
      progress.value,
      tracks.inputRange,
      tracks.backThighDeg,
      Reanimated.Extrapolation.CLAMP
    );
    return { transform: [{ rotate: `${deg}deg` }] };
  }, [tracks]);

  const backShinStyle = Reanimated.useAnimatedStyle(() => {
    const deg = Reanimated.interpolate(
      progress.value,
      tracks.inputRange,
      tracks.backShinDeg,
      Reanimated.Extrapolation.CLAMP
    );
    return { transform: [{ rotate: `${deg}deg` }] };
  }, [tracks]);

  const tailWaveStyle = Reanimated.useAnimatedStyle(() => {
    const deg = Reanimated.interpolate(
      progress.value,
      tracks.inputRange,
      tracks.tailsWaveDeg,
      Reanimated.Extrapolation.CLAMP
    );
    return { transform: [{ rotate: `${deg}deg` }] };
  }, [tracks]);

  const tailCounterWaveStyle = Reanimated.useAnimatedStyle(() => {
    const deg = Reanimated.interpolate(
      progress.value,
      tracks.inputRange,
      tracks.tailCounterWaveDeg,
      Reanimated.Extrapolation.CLAMP
    );
    return { transform: [{ rotate: `${deg}deg` }] };
  }, [tracks]);

  const auraStyle = Reanimated.useAnimatedStyle(() => {
    const scale = Reanimated.interpolate(
      progress.value,
      tracks.inputRange,
      tracks.auraScale,
      Reanimated.Extrapolation.CLAMP
    );
    const opacity = Reanimated.interpolate(
      progress.value,
      tracks.inputRange,
      tracks.auraOpacity,
      Reanimated.Extrapolation.CLAMP
    );
    return { transform: [{ scale }], opacity };
  }, [tracks]);

  const guardShieldStyle = Reanimated.useAnimatedStyle(() => {
    const opacity = Reanimated.interpolate(
      progress.value,
      tracks.inputRange,
      tracks.guardShieldOpacity,
      Reanimated.Extrapolation.CLAMP
    );
    return { opacity };
  }, [tracks]);

  return {
    rootStyle: rootStyle as RigMotionStyle,
    pelvisStyle: pelvisStyle as RigMotionStyle,
    torsoStyle: torsoStyle as RigMotionStyle,
    headStyle: headStyle as RigMotionStyle,
    frontUpperArmStyle: frontUpperArmStyle as RigMotionStyle,
    frontForearmStyle: frontForearmStyle as RigMotionStyle,
    backUpperArmStyle: backUpperArmStyle as RigMotionStyle,
    backForearmStyle: backForearmStyle as RigMotionStyle,
    frontThighStyle: frontThighStyle as RigMotionStyle,
    frontShinStyle: frontShinStyle as RigMotionStyle,
    backThighStyle: backThighStyle as RigMotionStyle,
    backShinStyle: backShinStyle as RigMotionStyle,
    tailWaveStyle: tailWaveStyle as RigMotionStyle,
    tailCounterWaveStyle: tailCounterWaveStyle as RigMotionStyle,
    auraStyle: auraStyle as RigMotionStyle,
    guardShieldStyle: guardShieldStyle as RigMotionStyle,
  };
}

function useNativeDriverRigAnimation({
  state,
  actionTriggerKey = 0,
  stanceAngles,
  playbackRate = 1,
  paused = false,
  onAnimationComplete,
}: UseCharacterRigAnimationParams): CharacterRigAnimationDriver {
  const progress = useRef(new RNAnimated.Value(0)).current;
  const onCompleteRef = useRef(onAnimationComplete);
  onCompleteRef.current = onAnimationComplete;

  const completedDeathKeyRef = useRef<number | null>(null);
  const effectivePaused = paused && state !== 'death';

  const tracks = useMemo(
    () => buildKeyframeTracks(state, stanceAngles),
    [state, stanceAngles]
  );

  useEffect(() => {
    if (state !== 'death') {
      completedDeathKeyRef.current = null;
    }

    if (effectivePaused) {
      progress.stopAnimation();
      return;
    }

    if (state === 'death' && completedDeathKeyRef.current === actionTriggerKey) {
      progress.setValue(1);
      return;
    }

    const clip = CLIP_TIMING_BY_STATE[state];
    const rate = Math.max(0.1, playbackRate);
    const totalMs = Math.max(80, Math.round(clip.durationMs / rate));
    const capturedKey = actionTriggerKey;

    progress.stopAnimation();
    progress.setValue(0);

    if (clip.loop) {
      const loopAnim = RNAnimated.loop(
        RNAnimated.timing(progress, {
          toValue: 1,
          duration: totalMs,
          easing: RNEasing.linear,
          useNativeDriver: true,
        }),
        { iterations: -1, resetBeforeIteration: true }
      );
      loopAnim.start();
      return () => {
        loopAnim.stop();
        progress.stopAnimation();
      };
    }

    const oneShotAnim =
      state === 'attack'
        ? RNAnimated.sequence([
            RNAnimated.timing(progress, {
              toValue: 0.32,
              duration: Math.max(40, Math.round(totalMs * 0.32)),
              easing: RNEasing.out(RNEasing.quad),
              useNativeDriver: true,
            }),
            RNAnimated.timing(progress, {
              toValue: 0.56,
              duration: Math.max(40, Math.round(totalMs * 0.24)),
              easing: RNEasing.inOut(RNEasing.cubic),
              useNativeDriver: true,
            }),
            RNAnimated.timing(progress, {
              toValue: 1,
              duration: Math.max(
                40,
                totalMs -
                  Math.max(40, Math.round(totalMs * 0.32)) -
                  Math.max(40, Math.round(totalMs * 0.24))
              ),
              easing: RNEasing.out(RNEasing.quad),
              useNativeDriver: true,
            }),
          ])
        : state === 'hurt'
        ? RNAnimated.sequence([
            RNAnimated.timing(progress, {
              toValue: 0.26,
              duration: Math.max(40, Math.round(totalMs * 0.26)),
              easing: RNEasing.out(RNEasing.quad),
              useNativeDriver: true,
            }),
            RNAnimated.timing(progress, {
              toValue: 1,
              duration: Math.max(40, totalMs - Math.max(40, Math.round(totalMs * 0.26))),
              easing: RNEasing.inOut(RNEasing.quad),
              useNativeDriver: true,
            }),
          ])
        : RNAnimated.timing(progress, {
            toValue: 1,
            duration: totalMs,
            easing: RNEasing.out(RNEasing.quad),
            useNativeDriver: true,
          });

    oneShotAnim.start(({ finished }) => {
      if (finished) {
        if (state === 'death') {
          completedDeathKeyRef.current = capturedKey;
        }
        if (onCompleteRef.current) {
          onCompleteRef.current(state, capturedKey);
        }
      }
    });

    return () => {
      if (state !== 'death' || completedDeathKeyRef.current !== capturedKey) {
        oneShotAnim.stop();
        progress.stopAnimation();
      }
    };
  }, [state, actionTriggerKey, effectivePaused, playbackRate, progress]);

  useEffect(
    () => () => {
      progress.stopAnimation();
    },
    [progress]
  );

  return useMemo(() => {
    const degInterp = (out: number[]) =>
      progress.interpolate({
        inputRange: tracks.inputRange,
        outputRange: out.map((deg) => `${deg}deg`),
        extrapolate: 'clamp',
      });
    const numInterp = (out: number[]) =>
      progress.interpolate({
        inputRange: tracks.inputRange,
        outputRange: out,
        extrapolate: 'clamp',
      });

    return {
      rootStyle: {
        transform: [
          { translateX: numInterp(tracks.rootX) },
          { translateY: numInterp(tracks.rootY) },
        ],
      } as RigMotionStyle,
      pelvisStyle: {
        transform: [
          { translateY: numInterp(tracks.pelvisY) },
          { rotate: degInterp(tracks.pelvisDeg) },
        ],
      } as RigMotionStyle,
      torsoStyle: {
        transform: [{ rotate: degInterp(tracks.torsoDeg) }],
      } as RigMotionStyle,
      headStyle: {
        transform: [{ rotate: degInterp(tracks.headDeg) }],
      } as RigMotionStyle,
      frontUpperArmStyle: {
        transform: [{ rotate: degInterp(tracks.frontUpperArmDeg) }],
      } as RigMotionStyle,
      frontForearmStyle: {
        transform: [{ rotate: degInterp(tracks.frontForearmDeg) }],
      } as RigMotionStyle,
      backUpperArmStyle: {
        transform: [{ rotate: degInterp(tracks.backUpperArmDeg) }],
      } as RigMotionStyle,
      backForearmStyle: {
        transform: [{ rotate: degInterp(tracks.backForearmDeg) }],
      } as RigMotionStyle,
      frontThighStyle: {
        transform: [{ rotate: degInterp(tracks.frontThighDeg) }],
      } as RigMotionStyle,
      frontShinStyle: {
        transform: [{ rotate: degInterp(tracks.frontShinDeg) }],
      } as RigMotionStyle,
      backThighStyle: {
        transform: [{ rotate: degInterp(tracks.backThighDeg) }],
      } as RigMotionStyle,
      backShinStyle: {
        transform: [{ rotate: degInterp(tracks.backShinDeg) }],
      } as RigMotionStyle,
      tailWaveStyle: {
        transform: [{ rotate: degInterp(tracks.tailsWaveDeg) }],
      } as RigMotionStyle,
      tailCounterWaveStyle: {
        transform: [{ rotate: degInterp(tracks.tailCounterWaveDeg) }],
      } as RigMotionStyle,
      auraStyle: {
        transform: [{ scale: numInterp(tracks.auraScale) }],
        opacity: numInterp(tracks.auraOpacity),
      } as RigMotionStyle,
      guardShieldStyle: {
        opacity: numInterp(tracks.guardShieldOpacity),
      } as RigMotionStyle,
    };
  }, [progress, tracks]);
}

export function useCharacterRigAnimation(
  params: UseCharacterRigAnimationParams
): CharacterRigAnimationDriver {
  if (IS_REANIMATED_AVAILABLE) {
    return useReanimatedRigAnimation(params);
  }
  return useNativeDriverRigAnimation(params);
}

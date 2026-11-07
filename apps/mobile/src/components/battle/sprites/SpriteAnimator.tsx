import React, { useEffect, useMemo, useRef } from 'react';
import {
  View,
  Image,
  StyleSheet,
  Platform,
  type ImageStyle,
  Animated as RNAnimated,
  Easing as RNEasing,
} from 'react-native';
import type { AnimationState, SpriteAnimatorProps, SpriteSheetConfig } from './sprite.types';
import { ALL_SPRITE_CONFIGS, DEMON_BOSS_SPRITE_CONFIG } from './spriteManifest';
import {
  IS_REANIMATED_AVAILABLE,
  getReanimatedRuntime,
} from '../reanimatedRuntime';

interface WebImageStyle extends ImageStyle {
  imageRendering?: 'auto' | 'crisp-edges' | 'pixelated';
}

const webPixelatedStyle: WebImageStyle = {
  imageRendering: 'pixelated',
};

const imagePixelatedStyle = Platform.OS === 'web' ? webPixelatedStyle : undefined;

const ALL_STATES: readonly AnimationState[] = ['idle', 'walk', 'attack', 'hurt', 'death'];

interface ResolvedSpriteAnimatorProps extends SpriteAnimatorProps {
  config: SpriteSheetConfig;
  scale: number;
  flipHorizontal: boolean;
}

const ReanimatedSpriteAnimator: React.FC<ResolvedSpriteAnimatorProps> = ({
  config,
  state,
  actionTriggerKey = 0,
  scale = 1,
  flipHorizontal = false,
  playbackRate = 1,
  hitFlash = false,
  tintColor,
  paused = false,
  onAnimationComplete,
  style,
}) => {
  const Reanimated = getReanimatedRuntime()!;
  const cellWidth = Math.max(1, Math.round(config.frameWidth * scale));
  const cellHeight = Math.max(1, Math.round(config.frameHeight * scale));

  const frameProgress = Reanimated.useSharedValue(0);
  const activeClip = config.clips[state];
  const effectivePaused = paused && state !== 'death';

  const onCompleteRef = useRef(onAnimationComplete);
  onCompleteRef.current = onAnimationComplete;

  const completedOneShotStateRef = useRef<AnimationState | null>(null);

  useEffect(() => {
    if (completedOneShotStateRef.current && completedOneShotStateRef.current !== state) {
      completedOneShotStateRef.current = null;
    }

    if (effectivePaused) {
      Reanimated.cancelAnimation(frameProgress);
      return;
    }

    if (state === 'death' && completedOneShotStateRef.current === 'death') {
      frameProgress.value = activeClip.frameCount - 0.001;
      return;
    }

    const capturedKey = actionTriggerKey;
    const effectiveRate = Math.max(0.1, playbackRate);
    frameProgress.value = 0;

    if (activeClip.loop) {
      const totalDuration = Math.max(
        80,
        Math.round((activeClip.frameCount * activeClip.frameDurationMs) / effectiveRate)
      );
      frameProgress.value = Reanimated.withRepeat(
        Reanimated.withTiming(activeClip.frameCount, {
          duration: totalDuration,
          easing: Reanimated.Easing.linear,
        }),
        -1,
        false
      );
    } else {
      const targetVal = activeClip.frameCount - 0.001;
      const duration = Math.max(
        60,
        Math.round((activeClip.frameCount * activeClip.frameDurationMs) / effectiveRate)
      );
      frameProgress.value = Reanimated.withTiming(
        targetVal,
        {
          duration,
          easing: Reanimated.Easing.linear,
        },
        (finished) => {
          if (finished) {
            completedOneShotStateRef.current = state;
            if (onCompleteRef.current) {
              Reanimated.runOnJS(onCompleteRef.current)(state, capturedKey);
            }
          }
        }
      );
    }

    return () => {
      if (state !== 'death' || completedOneShotStateRef.current !== 'death') {
        Reanimated.cancelAnimation(frameProgress);
      }
    };
  }, [state, actionTriggerKey, effectivePaused, playbackRate, activeClip, frameProgress, Reanimated]);

  const animatedTranslateStyle = Reanimated.useAnimatedStyle(() => {
    const frameIdx = Math.min(activeClip.frameCount - 1, Math.max(0, Math.floor(frameProgress.value)));
    return {
      transform: [{ translateX: -frameIdx * cellWidth }],
    };
  }, [activeClip.frameCount, cellWidth]);

  return (
    <View
      style={[
        styles.cellContainer,
        {
          width: cellWidth,
          height: cellHeight,
          minWidth: cellWidth,
          maxWidth: cellWidth,
          transform: [{ scaleX: flipHorizontal ? -1 : 1 }],
        },
        style,
      ]}
    >
      {ALL_STATES.map((s) => {
        const clip = config.clips[s];
        const isCurrent = s === state;
        const stripWidth = clip.frameCount * cellWidth;

        return (
          <Reanimated.default.View
            key={s}
            pointerEvents="none"
            style={[
              styles.stripWrapper,
              {
                width: stripWidth,
                height: cellHeight,
                minWidth: stripWidth,
                maxWidth: stripWidth,
                opacity: isCurrent ? 1 : 0,
              },
              isCurrent ? animatedTranslateStyle : undefined,
            ]}
          >
            <Image
              source={clip.source}
              resizeMode="stretch"
              style={[
                {
                  width: stripWidth,
                  height: cellHeight,
                  minWidth: stripWidth,
                  maxWidth: stripWidth,
                  flexShrink: 0,
                },
                tintColor ? { tintColor } : undefined,
                imagePixelatedStyle,
              ]}
            />
          </Reanimated.default.View>
        );
      })}
    </View>
  );
};

const NativeDriverSpriteAnimator: React.FC<ResolvedSpriteAnimatorProps> = ({
  config,
  state,
  actionTriggerKey = 0,
  scale = 1,
  flipHorizontal = false,
  playbackRate = 1,
  hitFlash = false,
  tintColor,
  paused = false,
  onAnimationComplete,
  style,
}) => {
  const cellWidth = Math.max(1, Math.round(config.frameWidth * scale));
  const cellHeight = Math.max(1, Math.round(config.frameHeight * scale));

  const progressByState = useRef<Record<AnimationState, RNAnimated.Value>>({
    idle: new RNAnimated.Value(0),
    walk: new RNAnimated.Value(0),
    attack: new RNAnimated.Value(0),
    hurt: new RNAnimated.Value(0),
    death: new RNAnimated.Value(0),
  }).current;

  const activeClip = config.clips[state];
  const effectivePaused = paused && state !== 'death';

  const onCompleteRef = useRef(onAnimationComplete);
  onCompleteRef.current = onAnimationComplete;

  const completedOneShotStateRef = useRef<AnimationState | null>(null);

  const translateXByState = useMemo<Record<AnimationState, RNAnimated.AnimatedInterpolation<number>>>(() => {
    const result = {} as Record<AnimationState, RNAnimated.AnimatedInterpolation<number>>;
    for (const s of ALL_STATES) {
      const clip = config.clips[s];
      const N = clip.frameCount;
      const inRange: number[] = [];
      const outRange: number[] = [];
      if (N <= 1) {
        inRange.push(0, 1);
        outRange.push(0, 0);
      } else {
        for (let i = 0; i < N; i++) {
          inRange.push(i);
          outRange.push(-i * cellWidth);
          if (i < N - 1) {
            inRange.push(i + 0.9999);
            outRange.push(-i * cellWidth);
          } else {
            inRange.push(N);
            outRange.push(-i * cellWidth);
          }
        }
      }
      result[s] = progressByState[s].interpolate({
        inputRange: inRange,
        outputRange: outRange,
        extrapolate: 'clamp',
      });
    }
    return result;
  }, [config, cellWidth, progressByState]);

  useEffect(() => {
    if (completedOneShotStateRef.current && completedOneShotStateRef.current !== state) {
      completedOneShotStateRef.current = null;
    }

    const currentProgress = progressByState[state];

    if (effectivePaused) {
      currentProgress.stopAnimation();
      return;
    }

    const N = activeClip.frameCount;

    if (state === 'death' && completedOneShotStateRef.current === 'death') {
      currentProgress.setValue(N);
      return;
    }

    const capturedKey = actionTriggerKey;
    const effectiveRate = Math.max(0.1, playbackRate);

    if (activeClip.loop) {
      const totalDuration = Math.max(
        80,
        Math.round((N * activeClip.frameDurationMs) / effectiveRate)
      );
      currentProgress.setValue(0);
      const loopAnim = RNAnimated.loop(
        RNAnimated.timing(currentProgress, {
          toValue: N,
          duration: totalDuration,
          easing: RNEasing.linear,
          useNativeDriver: true,
        }),
        { iterations: -1, resetBeforeIteration: true }
      );
      loopAnim.start();
      return () => {
        loopAnim.stop();
        currentProgress.stopAnimation();
      };
    } else {
      const duration = Math.max(
        60,
        Math.round((N * activeClip.frameDurationMs) / effectiveRate)
      );
      currentProgress.setValue(0);
      const oneShotAnim = RNAnimated.timing(currentProgress, {
        toValue: N,
        duration,
        easing: RNEasing.linear,
        useNativeDriver: true,
      });

      oneShotAnim.start(({ finished }) => {
        if (finished) {
          completedOneShotStateRef.current = state;
          if (onCompleteRef.current) {
            onCompleteRef.current(state, capturedKey);
          }
        }
      });

      return () => {
        if (state !== 'death' || completedOneShotStateRef.current !== 'death') {
          oneShotAnim.stop();
          currentProgress.stopAnimation();
        }
      };
    }
  }, [state, actionTriggerKey, effectivePaused, playbackRate, activeClip, progressByState]);

  return (
    <View
      style={[
        styles.cellContainer,
        {
          width: cellWidth,
          height: cellHeight,
          minWidth: cellWidth,
          maxWidth: cellWidth,
          transform: [{ scaleX: flipHorizontal ? -1 : 1 }],
        },
        style,
      ]}
    >
      {ALL_STATES.map((s) => {
        const clip = config.clips[s];
        const isCurrent = s === state;
        const stripWidth = clip.frameCount * cellWidth;

        return (
          <RNAnimated.View
            key={s}
            pointerEvents="none"
            style={[
              styles.stripWrapper,
              {
                width: stripWidth,
                height: cellHeight,
                minWidth: stripWidth,
                maxWidth: stripWidth,
                opacity: isCurrent ? 1 : 0,
                transform: [{ translateX: translateXByState[s] }],
              },
            ]}
          >
            <Image
              source={clip.source}
              resizeMode="stretch"
              style={[
                {
                  width: stripWidth,
                  height: cellHeight,
                  minWidth: stripWidth,
                  maxWidth: stripWidth,
                  flexShrink: 0,
                },
                tintColor ? { tintColor } : undefined,
                imagePixelatedStyle,
              ]}
            />
          </RNAnimated.View>
        );
      })}
    </View>
  );
};

const SpriteAnimatorComponent: React.FC<SpriteAnimatorProps> = (props) => {
  const resolvedConfig: SpriteSheetConfig =
    props.config ??
    (props.rig ? ALL_SPRITE_CONFIGS[props.rig] : undefined) ??
    DEMON_BOSS_SPRITE_CONFIG;
  const isPortraitMode = typeof props.size === 'number' && props.size > 0;
  const portraitCrop = resolvedConfig.portraitCrop ?? {
    zoom: 2.15,
    offsetX: 0,
    offsetY: 5,
  };
  const basePortraitRatio = isPortraitMode
    ? props.size! / Math.max(resolvedConfig.frameWidth, resolvedConfig.frameHeight)
    : 1;
  const effectiveScale = isPortraitMode
    ? (props.scale ?? basePortraitRatio * portraitCrop.zoom)
    : (props.scale ?? 1);
  const effectiveFlip = props.flipX ?? props.flipHorizontal ?? false;

  const normalizedProps: ResolvedSpriteAnimatorProps = {
    ...props,
    config: resolvedConfig,
    scale: effectiveScale,
    flipHorizontal: effectiveFlip,
    style: isPortraitMode ? undefined : props.style,
  };

  const animator = IS_REANIMATED_AVAILABLE ? (
    <ReanimatedSpriteAnimator {...normalizedProps} />
  ) : (
    <NativeDriverSpriteAnimator {...normalizedProps} />
  );

  if (isPortraitMode) {
    const portraitSize = props.size!;
    const cellWidth = Math.max(1, Math.round(resolvedConfig.frameWidth * effectiveScale));
    const cellHeight = Math.max(1, Math.round(resolvedConfig.frameHeight * effectiveScale));
    const translateX = Math.round((portraitCrop.offsetX ?? 0) * effectiveScale);
    const translateY = Math.round((portraitCrop.offsetY ?? 0) * effectiveScale);

    return (
      <View
        style={[
          {
            width: portraitSize,
            height: portraitSize,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
          },
          props.style,
        ]}
      >
        <View
          style={{
            width: cellWidth,
            height: cellHeight,
            flexShrink: 0,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            transform: [{ translateX }, { translateY }],
          }}
        >
          {animator}
        </View>
      </View>
    );
  }

  return animator;
};

export const SpriteAnimator = React.memo(SpriteAnimatorComponent);

const styles = StyleSheet.create({
  cellContainer: {
    overflow: 'hidden',
    position: 'relative',
    flexShrink: 0,
  },
  stripWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    flexDirection: 'row',
    flexShrink: 0,
  },
});

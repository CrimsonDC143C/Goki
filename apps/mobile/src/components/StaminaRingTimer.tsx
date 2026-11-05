import React, { useState, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { RestTimerState, RestAdviceProfile } from '@gymify/game-engine';
import { COLORS } from '../theme';
import { triggerSensoryCue } from '../utils/sensoryFeedback';

export interface RestPeriodAdvice {
  headline: string;
  physiologicalRationale: string;
  recommendedSeconds?: number;
  minRecommendedSeconds?: number;
  maxRecommendedSeconds?: number;
}

export interface StaminaRingTimerProps {
  remainingSeconds?: number;
  configuredSeconds?: number;
  advice?: RestPeriodAdvice | RestAdviceProfile;
  onAdjustSeconds?: (deltaSeconds: number) => void;
  onSkipRest: () => void;
  onSelectPreset?: (seconds: number) => void;
  variant?: 'overlay' | 'floating' | 'inline';
  onMinimize?: () => void;
  onExpand?: () => void;
  scrollOffsetY?: number;

  // Backward compatibility with legacy WorkoutLoggerScreen
  restTimer?: RestTimerState;
  lockscreenAlertArmed?: boolean;
  onAdjustDelta?: (deltaSeconds: number) => void;
}

export const PRESETS = [60, 90, 120, 180, 240] as const;

export function formatPresetLabel(sec: number, recSec?: number): string {
  const m = sec / 60;
  const label = m === Math.floor(m) ? `${m}m` : `${m.toFixed(1)}m`;
  return recSec === sec ? `${label} ★` : label;
}

export function formatMMSS(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function clampProgress(remaining: number, total: number): number {
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - remaining / total));
}

export const StaminaRingTimer: React.FC<StaminaRingTimerProps> = ({
  remainingSeconds,
  configuredSeconds,
  advice,
  onAdjustSeconds,
  onSkipRest,
  onSelectPreset,
  variant = 'inline',
  onMinimize,
  onExpand,
  scrollOffsetY,
  restTimer,
  lockscreenAlertArmed = false,
  onAdjustDelta,
}) => {
  const [showRationale, setShowRationale] = useState<boolean>(false);

  // Normalize resolved values between new and legacy props
  const resolvedRemaining = restTimer ? restTimer.remainingSeconds : (remainingSeconds ?? 0);
  const resolvedConfigured = restTimer ? restTimer.configuredSeconds : (configuredSeconds ?? 60);
  const resolvedAdvice: RestPeriodAdvice = restTimer?.advice ?? advice ?? {
    headline: 'Optimal Energy Recovery',
    physiologicalRationale: 'Allows cellular ATP and phosphocreatine reserves to regenerate.',
    recommendedSeconds: resolvedConfigured,
  };

  const isComplete = resolvedRemaining <= 0;

  // Sensory cue trigger on transition from > 0 to <= 0
  const prevRemainingRef = useRef<number>(resolvedRemaining);
  useEffect(() => {
    if (prevRemainingRef.current > 0 && resolvedRemaining <= 0) {
      triggerSensoryCue('REST_TIMER_EXPIRED');
    }
    prevRemainingRef.current = resolvedRemaining;
  }, [resolvedRemaining]);

  const handleAdjust = (delta: number) => {
    if (onAdjustSeconds) {
      onAdjustSeconds(delta);
    } else if (onAdjustDelta) {
      onAdjustDelta(delta);
    }
  };

  const handlePreset = (sec: number) => {
    if (onSelectPreset) {
      onSelectPreset(sec);
    } else {
      const delta = sec - resolvedConfigured;
      handleAdjust(delta);
    }
  };

  const total = Math.max(1, resolvedConfigured);
  const rechargedRatio = clampProgress(resolvedRemaining, total);
  const rechargedPct = Math.round(rechargedRatio * 100);

  const parallaxTranslateY = Math.min(8, Math.max(-4, (scrollOffsetY ?? 0) * 0.04));

  // =========================================================================
  // STAGE 2: PINNED FLOATING HUD PILL / RING (Floating Variant)
  // =========================================================================
  if (variant === 'floating') {
    if (isComplete) {
      return (
        <TouchableOpacity
          style={[
            styles.floatingHudPillComplete,
            { transform: [{ translateY: parallaxTranslateY }] },
          ]}
          onPress={onSkipRest}
          activeOpacity={0.85}
          testID="stamina-ring-floating-complete"
          accessibilityRole="button"
          accessibilityLabel="Stamina full, tap to begin next set"
        >
          <Text style={styles.hudCompleteText}>⚡ STAMINA FULL — TAP TO BEGIN NEXT SET</Text>
        </TouchableOpacity>
      );
    }

    const miniSize = 34;
    const miniStroke = 3.5;
    const miniRadius = (miniSize - miniStroke) / 2;
    const miniCircumference = 2 * Math.PI * miniRadius;
    const miniOffset = miniCircumference * (1 - rechargedRatio);

    return (
      <View
        style={[
          styles.floatingHudPill,
          { transform: [{ translateY: parallaxTranslateY }] },
        ]}
      >
        {/* Left: Mini Stamina Progress Ring */}
        <TouchableOpacity
          style={styles.miniRingWrapper}
          onPress={onExpand}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Expand rest timer"
        >
          <Svg width={miniSize} height={miniSize}>
            <Circle
              cx={miniSize / 2}
              cy={miniSize / 2}
              r={miniRadius}
              stroke={COLORS.bgDeep}
              strokeWidth={miniStroke}
              fill="none"
            />
            <Circle
              cx={miniSize / 2}
              cy={miniSize / 2}
              r={miniRadius}
              stroke={rechargedPct >= 85 ? COLORS.gold : COLORS.endurance}
              strokeWidth={miniStroke}
              strokeDasharray={`${miniCircumference} ${miniCircumference}`}
              strokeDashoffset={miniOffset}
              strokeLinecap="round"
              rotation="-90"
              origin={`${miniSize / 2}, ${miniSize / 2}`}
              fill="none"
            />
          </Svg>
          <View style={styles.miniRingCenter}>
            <Text style={styles.miniRingIcon}>⚡</Text>
          </View>
        </TouchableOpacity>

        {/* Center: Countdown Timer + Headline */}
        <TouchableOpacity
          style={styles.hudCenterInfo}
          onPress={onExpand}
          activeOpacity={0.7}
        >
          <View style={styles.hudTimeRow}>
            <Text style={styles.hudTimerDisplay}>{formatMMSS(resolvedRemaining)}</Text>
            <View style={styles.hudPctBadge}>
              <Text style={styles.hudPctText}>{rechargedPct}%</Text>
            </View>
          </View>
          <Text style={styles.hudHeadlineText} numberOfLines={1}>
            {resolvedAdvice.headline}
          </Text>
        </TouchableOpacity>

        {/* Right: Quick Controls & Expand Action */}
        <View style={styles.hudControlsRow}>
          <TouchableOpacity
            style={styles.hudAdjustBtn}
            onPress={() => handleAdjust(-15)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Subtract 15 seconds"
          >
            <Text style={styles.hudAdjustBtnText}>-15s</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.hudAdjustBtn}
            onPress={() => handleAdjust(15)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Add 15 seconds"
          >
            <Text style={styles.hudAdjustBtnText}>+15s</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.hudSkipBtn}
            onPress={onSkipRest}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Skip rest"
          >
            <Text style={styles.hudSkipBtnText}>Skip</Text>
          </TouchableOpacity>
          {onExpand ? (
            <TouchableOpacity
              style={styles.hudExpandBtn}
              onPress={onExpand}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Maximize rest timer"
            >
              <Text style={styles.hudExpandBtnText}>⤢</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  }

  // =========================================================================
  // STAGE 1 / INLINE / OVERLAY: FULL STAMINA RING TIMER
  // =========================================================================
  const size = 184;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - rechargedRatio);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.staminaTitle}>
          {isComplete ? '⚡ STAMINA FULL' : '⚡ STAMINA RECHARGING'}
        </Text>
        <View style={styles.headerRight}>
          {lockscreenAlertArmed && (
            <View style={styles.lockscreenBadge}>
              <Text style={styles.lockscreenBadgeText}>🔔 Armed</Text>
            </View>
          )}
          <Text style={[styles.pctBadge, isComplete && styles.pctBadgeComplete]}>
            {isComplete ? '100% Ready' : `${rechargedPct}% Ready`}
          </Text>
          {onMinimize ? (
            <TouchableOpacity
              style={styles.minimizeHeaderBtn}
              onPress={onMinimize}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Minimize timer"
            >
              <Text style={styles.minimizeHeaderBtnText}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Circular SVG Stamina Ring + Center Display */}
      <View style={styles.ringControlRow}>
        <View style={styles.ringWrapper}>
          <Svg width={size} height={size}>
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={COLORS.bgDeep}
              strokeWidth={strokeWidth}
              fill="none"
            />
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={isComplete ? '#10B981' : rechargedPct >= 85 ? COLORS.gold : COLORS.endurance}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={strokeDashoffset}
              rotation="-90"
              origin={`${size / 2}, ${size / 2}`}
              fill="none"
            />
          </Svg>
          <View style={styles.ringCenterOverlay}>
            <Text style={[styles.countdownDigits, isComplete && styles.countdownDigitsComplete]}>
              {isComplete ? '⚡ READY' : formatMMSS(resolvedRemaining)}
            </Text>
            <Text style={styles.countdownSub}>
              {isComplete ? 'Target Reached' : `Target ${formatMMSS(resolvedConfigured)}`}
            </Text>
          </View>
        </View>
      </View>

      {/* Quick Adjust Buttons Row (-15s, +15s, +30s) */}
      <View style={styles.adjustRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Subtract 15 seconds rest"
          style={styles.deltaBtn}
          onPress={() => handleAdjust(-15)}
        >
          <Text style={styles.deltaBtnText}>−15s</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add 15 seconds rest"
          style={styles.deltaBtn}
          onPress={() => handleAdjust(15)}
        >
          <Text style={styles.deltaBtnText}>+15s</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add 30 seconds rest"
          style={styles.deltaBtn}
          onPress={() => handleAdjust(30)}
        >
          <Text style={styles.deltaBtnText}>+30s</Text>
        </Pressable>
      </View>

      {/* Evidence-Based Optimal Rest Advisory with Compact (i) Tooltip */}
      <View style={styles.adviceBox}>
        <View style={styles.adviceHeaderRow}>
          <Text style={styles.adviceHeadline}>🧬 {resolvedAdvice.headline}</Text>
          {resolvedAdvice.physiologicalRationale ? (
            <TouchableOpacity
              style={[styles.rationaleToggleBtn, showRationale && styles.rationaleToggleBtnActive]}
              onPress={() => setShowRationale((prev) => !prev)}
              testID="stamina-ring-rationale-toggle"
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Toggle physiological rationale explanation"
            >
              <Text style={styles.rationaleToggleIcon}>ⓘ</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {showRationale && resolvedAdvice.physiologicalRationale ? (
          <Text style={styles.adviceBody}>{resolvedAdvice.physiologicalRationale}</Text>
        ) : null}
      </View>

      {/* Configurable 1-Tap Rest Duration Presets */}
      <View style={styles.presetRow}>
        {PRESETS.map((sec) => {
          const isSelected = resolvedConfigured === sec;
          const isRecommended = resolvedAdvice.recommendedSeconds === sec;
          return (
            <Pressable
              key={sec}
              style={[
                styles.presetChip,
                isSelected && styles.presetChipActive,
                isRecommended && !isSelected && styles.presetChipRecommended,
              ]}
              onPress={() => handlePreset(sec)}
            >
              <Text
                style={[
                  styles.presetChipText,
                  isSelected && styles.presetChipTextActive,
                  isRecommended && !isSelected && styles.presetChipTextRecommended,
                ]}
              >
                {formatPresetLabel(sec, resolvedAdvice.recommendedSeconds)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Primary & Secondary Action Buttons: State-dependent */}
      {isComplete ? (
        <Pressable
          style={styles.skipReadyBtnComplete}
          onPress={onSkipRest}
          testID="stamina-ring-ready-btn"
        >
          <Text style={styles.skipReadyBtnTextComplete}>⚡ STAMINA FULL — BEGIN NEXT SET</Text>
        </Pressable>
      ) : (
        <View style={styles.actionButtonGroup}>
          {onMinimize ? (
            <TouchableOpacity
              style={styles.minimizeActionBtn}
              onPress={onMinimize}
              testID="stamina-ring-minimize-btn"
              activeOpacity={0.8}
            >
              <Text style={styles.minimizeActionBtnText}>View Workout / Minimize Timer</Text>
            </TouchableOpacity>
          ) : null}

          <Pressable
            style={styles.skipMutedBtn}
            onPress={onSkipRest}
            testID="stamina-ring-skip-btn"
          >
            <Text style={styles.skipMutedBtnText}>Skip Rest & Begin Next Set</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.endurance,
    padding: 16,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  lockscreenBadge: {
    backgroundColor: COLORS.enduranceDim,
    borderWidth: 1,
    borderColor: COLORS.endurance,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  lockscreenBadgeText: {
    color: COLORS.endurance,
    fontSize: 10,
    fontWeight: '800',
  },
  staminaTitle: {
    color: COLORS.endurance,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  pctBadge: {
    color: COLORS.gold,
    fontSize: 12,
    fontWeight: '800',
  },
  pctBadgeComplete: {
    color: '#10B981',
  },
  minimizeHeaderBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: COLORS.bgElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  minimizeHeaderBtnText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  ringControlRow: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },
  ringWrapper: {
    width: 184,
    height: 184,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenterOverlay: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownDigits: {
    color: COLORS.textPrimary,
    fontSize: 34,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  countdownDigitsComplete: {
    color: '#10B981',
    fontSize: 26,
  },
  countdownSub: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  adjustRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    marginBottom: 10,
  },
  deltaBtn: {
    flex: 1,
    minHeight: 44,
    backgroundColor: COLORS.bgElevated,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.borderHighlight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deltaBtnText: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  adviceBox: {
    backgroundColor: COLORS.enduranceDim,
    borderRadius: 10,
    padding: 10,
    marginTop: 4,
    borderWidth: 1,
    borderColor: COLORS.endurance,
  },
  adviceHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  adviceHeadline: {
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '800',
    flex: 1,
  },
  rationaleToggleBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#1E293B',
    borderColor: COLORS.endurance,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  rationaleToggleBtnActive: {
    backgroundColor: COLORS.endurance,
  },
  rationaleToggleIcon: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.textPrimary,
  },
  adviceBody: {
    color: COLORS.textSecondary,
    fontSize: 11,
    marginTop: 6,
    lineHeight: 16,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
  },
  presetChip: {
    flex: 1,
    minHeight: 42,
    backgroundColor: COLORS.bgElevated,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetChipRecommended: {
    borderColor: COLORS.endurance,
  },
  presetChipActive: {
    backgroundColor: COLORS.goldDim,
    borderColor: COLORS.gold,
  },
  presetChipText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '800',
  },
  presetChipTextRecommended: {
    color: COLORS.gold,
  },
  presetChipTextActive: {
    color: COLORS.gold,
    fontWeight: '900',
  },
  actionButtonGroup: {
    marginTop: 12,
    gap: 8,
  },
  minimizeActionBtn: {
    minHeight: 48,
    backgroundColor: '#1A1826',
    borderColor: COLORS.gold,
    borderWidth: 1.5,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  minimizeActionBtnText: {
    color: COLORS.gold,
    fontSize: 13,
    fontWeight: '800',
  },
  skipMutedBtn: {
    minHeight: 44,
    backgroundColor: 'transparent',
    borderColor: COLORS.borderHighlight,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipMutedBtnText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  skipReadyBtnComplete: {
    minHeight: 54,
    backgroundColor: '#10B981',
    borderColor: '#059669',
    borderWidth: 1.5,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  skipReadyBtnTextComplete: {
    color: '#062B1D',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.4,
  },

  // Floating HUD Pill Styles (Stage 2)
  floatingHudPill: {
    backgroundColor: '#1E1D22',
    borderColor: '#3D3840',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 7,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 8,
    gap: 8,
  },
  floatingHudPillComplete: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(6, 78, 59, 0.95)',
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 11,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  hudCompleteText: {
    color: '#ECFDF5',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  miniRingWrapper: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniRingCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniRingIcon: {
    fontSize: 12,
  },
  hudCenterInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  hudTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  hudTimerDisplay: {
    fontSize: 18,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    color: COLORS.textPrimary,
    letterSpacing: 0.5,
  },
  hudPctBadge: {
    backgroundColor: COLORS.enduranceDim,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  hudPctText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.endurance,
  },
  hudHeadlineText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  hudControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  hudAdjustBtn: {
    backgroundColor: COLORS.bgElevated,
    borderColor: COLORS.border,
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  hudAdjustBtnText: {
    color: COLORS.textPrimary,
    fontSize: 11,
    fontWeight: '700',
  },
  hudSkipBtn: {
    backgroundColor: '#4C1D24',
    borderColor: '#782635',
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 7,
    borderRadius: 6,
  },
  hudSkipBtnText: {
    color: '#FEE2E2',
    fontSize: 11,
    fontWeight: '800',
  },
  hudExpandBtn: {
    backgroundColor: COLORS.bgElevated,
    borderColor: COLORS.gold,
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 7,
    borderRadius: 6,
    marginLeft: 2,
  },
  hudExpandBtnText: {
    color: COLORS.gold,
    fontSize: 12,
    fontWeight: '900',
  },
});

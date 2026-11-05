import React, { useEffect, useState, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, AppState } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { DynamicRestMode } from '@gymify/game-engine';
import { triggerSensoryCue } from '../utils/sensoryFeedback';
import { scheduleRestTimerNotification, cancelRestTimerNotification } from '../utils/restNotifications';

export interface DynamicRestTimerProps {
  targetEndTimeMs: number | null;
  totalDurationSeconds: number;
  mode?: DynamicRestMode;
  headline?: string;
  subtext?: string;
  onAdjustDelta: (deltaSeconds: number) => void;
  onSkip: () => void;
  onComplete?: () => void;
  variant?: 'banner' | 'hero';
  onMinimize?: () => void;
  onTapToFocus?: () => void;
  onSelectPreset?: (seconds: number) => void;
  recommendedSeconds?: number;
  scrollOffsetY?: number;
}

export const REST_PRESETS = [60, 90, 120, 180, 240] as const;

export const formatPresetLabel = (sec: number, recSec?: number): string => {
  const m = sec / 60;
  const label = m === Math.floor(m) ? `${m}m` : `${m.toFixed(1)}m`;
  return recSec === sec ? `${label} ★` : label;
};

export const DynamicRestTimer: React.FC<DynamicRestTimerProps> = ({
  targetEndTimeMs,
  totalDurationSeconds,
  mode = 'WORKING_REST',
  headline,
  subtext,
  onAdjustDelta,
  onSkip,
  onComplete,
  variant = 'banner',
  onMinimize,
  onTapToFocus,
  onSelectPreset,
  recommendedSeconds,
  scrollOffsetY,
}) => {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(() =>
    targetEndTimeMs ? Math.max(0, Math.ceil((targetEndTimeMs - Date.now()) / 1000)) : 0
  );
  const [showRationale, setShowRationale] = useState<boolean>(false);
  const completedRef = useRef<boolean>(false);

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const headlineRef = useRef(headline);
  headlineRef.current = headline;

  // Wall-clock recovery when returning to foreground after locking phone
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && targetEndTimeMs && !completedRef.current) {
        const now = Date.now();
        if (now >= targetEndTimeMs) {
          completedRef.current = true;
          setSecondsRemaining(0);
          triggerSensoryCue('REST_TIMER_EXPIRED');
          cancelRestTimerNotification().catch(() => {});
          onCompleteRef.current?.();
        } else {
          setSecondsRemaining(Math.max(0, Math.ceil((targetEndTimeMs - now) / 1000)));
        }
      }
    });
    return () => sub.remove();
  }, [targetEndTimeMs]);

  useEffect(() => {
    if (!targetEndTimeMs) {
      setSecondsRemaining(0);
      completedRef.current = false;
      cancelRestTimerNotification().catch(() => {});
      return;
    }

    const initialDiff = Math.ceil((targetEndTimeMs - Date.now()) / 1000);
    if (initialDiff <= 0) {
      setSecondsRemaining(0);
      cancelRestTimerNotification().catch(() => {});
      if (!completedRef.current) {
        completedRef.current = true;
        triggerSensoryCue('REST_TIMER_EXPIRED');
        onCompleteRef.current?.();
      }
      return;
    }

    completedRef.current = false;
    setSecondsRemaining(initialDiff);

    // Schedule local push notification for background wakeups with high-importance channel
    const notifTitle =
      mode === 'SUPERSET_TRANSITION'
        ? '⚡ Superset Transition Ready!'
        : mode === 'DROP_SET_TRANSITION'
        ? '🔥 Drop-Set Ready — Strip Weight!'
        : '⏱️ Rest Over — Next Set Ready!';
    const notifBody = headlineRef.current
      ? `${headlineRef.current} • Let's crush this set.`
      : 'Step up and begin your next set.';
    scheduleRestTimerNotification(initialDiff, notifTitle, notifBody).catch(() => {});

    const interval = setInterval(() => {
      const now = Date.now();
      const diff = Math.max(0, Math.ceil((targetEndTimeMs - now) / 1000));
      setSecondsRemaining(diff);

      if (diff <= 0) {
        clearInterval(interval);
        if (!completedRef.current) {
          completedRef.current = true;
          triggerSensoryCue('REST_TIMER_EXPIRED');
          cancelRestTimerNotification().catch(() => {});
          onCompleteRef.current?.();
        }
      }
    }, 250);

    return () => {
      clearInterval(interval);
    };
  }, [targetEndTimeMs, mode]);

  const modeBadge = useMemo(() => {
    switch (mode) {
      case 'DROP_SET_TRANSITION':
        return { label: '🔥 DROP-SET STRIP', color: '#EF4444', border: '#7F1D1D' };
      case 'SUPERSET_TRANSITION':
        return { label: '⚡ SUPERSET TRANSITION', color: '#C69A45', border: '#785A1D' };
      case 'WARMUP_REST':
        return { label: '🛡️ WARMUP REST', color: '#38BDF8', border: '#0369A1' };
      case 'WORKING_REST':
      default:
        return { label: '⏱️ REST PERIOD', color: '#4ADE80', border: '#15803D' };
    }
  }, [mode]);

  if (!targetEndTimeMs) {
    return null;
  }

  const isComplete = secondsRemaining <= 0;
  const mm = Math.floor(secondsRemaining / 60);
  const ss = secondsRemaining % 60;
  const timeFormatted = `${mm}:${ss < 10 ? '0' : ''}${ss}`;

  const progressFraction = Math.max(
    0,
    Math.min(1, totalDurationSeconds > 0 ? (totalDurationSeconds - secondsRemaining) / totalDurationSeconds : 1)
  );

  const handleAdjust = (delta: number) => {
    onAdjustDelta(delta);
    triggerSensoryCue('SET_MICRO_REWARD_TICK');
  };

  const handleSkip = () => {
    cancelRestTimerNotification().catch(() => {});
    triggerSensoryCue('SET_MICRO_REWARD_TICK');
    onSkip();
  };

  // Parallax floating offset calculation
  const parallaxTranslateY = Math.min(8, Math.max(-4, (scrollOffsetY ?? 0) * 0.04));

  // =========================================================================
  // STAGE 2: PINNED PARALLAX FLOATING HUD PILL / RING (Minimised / Banner)
  // =========================================================================
  if (variant === 'banner') {
    if (isComplete) {
      return (
        <TouchableOpacity
          style={[
            styles.floatingHudPillComplete,
            { transform: [{ translateY: parallaxTranslateY }] },
          ]}
          onPress={handleSkip}
          activeOpacity={0.85}
          testID="rest-timer-banner-complete"
          accessibilityRole="button"
          accessibilityLabel="Stamina full, tap to begin next set"
        >
          <View style={styles.hudCompleteContent}>
            <Text style={styles.hudCompleteText}>⚡ STAMINA FULL — TAP TO BEGIN NEXT SET</Text>
          </View>
        </TouchableOpacity>
      );
    }

    const miniSize = 34;
    const miniStroke = 3.5;
    const miniRadius = (miniSize - miniStroke) / 2;
    const miniCircumference = 2 * Math.PI * miniRadius;
    const miniOffset = miniCircumference * (1 - progressFraction);

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
          onPress={onTapToFocus}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Open rest timer focus view"
        >
          <Svg width={miniSize} height={miniSize}>
            <Circle
              cx={miniSize / 2}
              cy={miniSize / 2}
              r={miniRadius}
              stroke="#2B2833"
              strokeWidth={miniStroke}
              fill="none"
            />
            <Circle
              cx={miniSize / 2}
              cy={miniSize / 2}
              r={miniRadius}
              stroke={modeBadge.color}
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
          onPress={onTapToFocus}
          activeOpacity={0.7}
        >
          <View style={styles.hudTimeRow}>
            <Text style={styles.hudTimerDisplay}>{timeFormatted}</Text>
            <View style={[styles.badge, { borderColor: modeBadge.border, paddingVertical: 1, paddingHorizontal: 6 }]}>
              <Text style={[styles.badgeText, { color: modeBadge.color, fontSize: 9 }]}>
                {modeBadge.label}
              </Text>
            </View>
          </View>
          {headline ? (
            <Text style={styles.hudHeadlineText} numberOfLines={1}>
              {headline}
            </Text>
          ) : null}
        </TouchableOpacity>

        {/* Right: Quick Controls & Focus action */}
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
            onPress={handleSkip}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Skip rest"
          >
            <Text style={styles.hudSkipBtnText}>Skip</Text>
          </TouchableOpacity>
          {onTapToFocus ? (
            <TouchableOpacity
              style={styles.hudFocusBtn}
              onPress={onTapToFocus}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Maximize rest timer"
            >
              <Text style={styles.hudFocusBtnText}>⤢</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  }

  // =========================================================================
  // STAGE 1: HERO CENTER-SCREEN FOCUS OVERLAY
  // =========================================================================
  const heroSize = 168;
  const heroStrokeWidth = 11;
  const heroRadius = (heroSize - heroStrokeWidth) / 2;
  const heroCircumference = 2 * Math.PI * heroRadius;
  const heroOffset = heroCircumference * (1 - progressFraction);

  return (
    <View style={styles.heroContainer}>
      {/* Top bar in modal: Mode Badge + Top Right Close / Minimize */}
      <View style={styles.heroHeaderRow}>
        <View style={[styles.badge, { borderColor: modeBadge.border }]}>
          <Text style={[styles.badgeText, { color: modeBadge.color }]}>{modeBadge.label}</Text>
        </View>
        {onMinimize ? (
          <TouchableOpacity
            style={styles.heroClosePill}
            onPress={onMinimize}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Minimize rest timer"
          >
            <Text style={styles.heroClosePillText}>✕ Close</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Circular SVG Stamina Ring with Center Countdown Overlay */}
      <View style={styles.heroRingCenterBox}>
        <Svg width={heroSize} height={heroSize}>
          <Circle
            cx={heroSize / 2}
            cy={heroSize / 2}
            r={heroRadius}
            stroke="#1C1A22"
            strokeWidth={heroStrokeWidth}
            fill="none"
          />
          <Circle
            cx={heroSize / 2}
            cy={heroSize / 2}
            r={heroRadius}
            stroke={isComplete ? '#10B981' : modeBadge.color}
            strokeWidth={heroStrokeWidth}
            strokeDasharray={`${heroCircumference} ${heroCircumference}`}
            strokeDashoffset={heroOffset}
            strokeLinecap="round"
            rotation="-90"
            origin={`${heroSize / 2}, ${heroSize / 2}`}
            fill="none"
          />
        </Svg>
        <View style={styles.heroRingInnerOverlay}>
          <Text style={[styles.heroTimerDisplay, isComplete && styles.heroTimerDisplayComplete]}>
            {isComplete ? '⚡ READY' : timeFormatted}
          </Text>
          <Text style={[styles.heroRemainingLabel, isComplete && styles.heroRemainingLabelComplete]}>
            {isComplete ? 'STAMINA FULL' : 'REMAINING REST'}
          </Text>
        </View>
      </View>

      {/* Guidance Headline with Compact (i) Rationale Tooltip Toggle */}
      <View style={styles.heroHeadlineWrapper}>
        <View style={styles.heroHeadlineRow}>
          <Text style={styles.heroHeadlineText}>
            {headline || (isComplete ? 'Ready For Next Set!' : 'Intra-Set Recovery')}
          </Text>
          {subtext ? (
            <TouchableOpacity
              style={[styles.rationaleToggleBtn, showRationale && styles.rationaleToggleBtnActive]}
              onPress={() => setShowRationale((prev) => !prev)}
              testID="rest-timer-rationale-toggle"
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Toggle physiological rationale explanation"
            >
              <Text style={styles.rationaleToggleIcon}>ⓘ</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {showRationale && subtext ? (
          <View style={styles.heroRationaleBox}>
            <Text style={styles.heroSubtextText}>{subtext}</Text>
          </View>
        ) : null}
      </View>

      {/* Rest Duration Presets Selector Strip */}
      {onSelectPreset ? (
        <View style={styles.heroPresetsRow}>
          {REST_PRESETS.map((sec) => {
            const isSelected = totalDurationSeconds === sec;
            const isRec = recommendedSeconds === sec;
            return (
              <TouchableOpacity
                key={sec}
                style={[
                  styles.heroPresetChip,
                  isSelected && styles.heroPresetChipActive,
                  isRec && !isSelected && styles.heroPresetChipRecommended,
                ]}
                onPress={() => {
                  triggerSensoryCue('SET_MICRO_REWARD_TICK');
                  onSelectPreset(sec);
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.heroPresetChipText,
                    isSelected && styles.heroPresetChipTextActive,
                    isRec && !isSelected && styles.heroPresetChipTextRecommended,
                  ]}
                >
                  {formatPresetLabel(sec, recommendedSeconds)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      {/* Elapsed-Time-Preserving Adjustment Buttons (-15s, +15s, +30s) */}
      <View style={styles.heroControlsRow}>
        <TouchableOpacity
          style={styles.heroAdjustBtn}
          onPress={() => handleAdjust(-15)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Subtract 15 seconds"
        >
          <Text style={styles.heroAdjustBtnText}>-15s</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.heroAdjustBtn}
          onPress={() => handleAdjust(15)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Add 15 seconds"
        >
          <Text style={styles.heroAdjustBtnText}>+15s</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.heroAdjustBtn}
          onPress={() => handleAdjust(30)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Add 30 seconds"
        >
          <Text style={styles.heroAdjustBtnText}>+30s</Text>
        </TouchableOpacity>
      </View>

      {/* Action Buttons: State-dependent for isComplete vs remainingMs > 0 */}
      {isComplete ? (
        <TouchableOpacity
          style={styles.heroReadyBtn}
          onPress={handleSkip}
          testID="rest-timer-ready-btn"
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Stamina full, begin next set"
        >
          <Text style={styles.heroReadyBtnText}>⚡ STAMINA FULL — BEGIN NEXT SET</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.heroActionGroup}>
          {onMinimize ? (
            <TouchableOpacity
              style={styles.heroMinimizeBtn}
              onPress={onMinimize}
              testID="rest-timer-minimize-btn"
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="View workout and minimize timer"
            >
              <Text style={styles.heroMinimizeBtnText}>View Workout / Minimize Timer</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={styles.heroSkipBtnMuted}
            onPress={handleSkip}
            testID="rest-timer-skip-btn"
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Skip rest and begin next set"
          >
            <Text style={styles.heroSkipBtnMutedText}>Skip Rest & Begin Next Set</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  // Pinned Parallax Floating HUD Pill/Ring Styles (Stage 2)
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
  hudCompleteContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
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
    color: '#FDE68A',
    letterSpacing: 0.5,
  },
  hudHeadlineText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#D1D5DB',
    marginTop: 1,
  },
  hudControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  hudAdjustBtn: {
    backgroundColor: '#2A2830',
    borderColor: '#423E4C',
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  hudAdjustBtnText: {
    color: '#D1D5DB',
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
  hudFocusBtn: {
    backgroundColor: '#262330',
    borderColor: '#C69A45',
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 7,
    borderRadius: 6,
    marginLeft: 2,
  },
  hudFocusBtnText: {
    color: '#FDE68A',
    fontSize: 12,
    fontWeight: '900',
  },

  // Hero Center Modal Layout Styles (Stage 1)
  heroContainer: {
    backgroundColor: '#19181E',
    borderColor: '#C69A45',
    borderWidth: 1.5,
    borderRadius: 18,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.65,
    shadowRadius: 18,
    elevation: 14,
  },
  heroHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  heroClosePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#2B2833',
    borderColor: '#474352',
    borderWidth: 1,
  },
  heroClosePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#D1D5DB',
  },
  heroRingCenterBox: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
  },
  heroRingInnerOverlay: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTimerDisplay: {
    fontSize: 40,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    color: '#FDE68A',
    letterSpacing: 1,
  },
  heroTimerDisplayComplete: {
    color: '#10B981',
    fontSize: 28,
  },
  heroRemainingLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#9CA3AF',
    letterSpacing: 1.2,
    marginTop: 2,
  },
  heroRemainingLabelComplete: {
    color: '#6EE7B7',
  },
  heroHeadlineWrapper: {
    marginVertical: 6,
    alignItems: 'center',
  },
  heroHeadlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroHeadlineText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  rationaleToggleBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#282532',
    borderColor: '#4A4556',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  rationaleToggleBtnActive: {
    backgroundColor: '#4A3B18',
    borderColor: '#C69A45',
  },
  rationaleToggleIcon: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FDE68A',
  },
  heroRationaleBox: {
    backgroundColor: 'rgba(15, 14, 20, 0.75)',
    borderColor: '#383344',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginTop: 6,
    width: '100%',
  },
  heroSubtextText: {
    fontSize: 12,
    color: '#D1D5DB',
    textAlign: 'center',
    lineHeight: 17,
  },
  heroPresetsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
    marginVertical: 10,
  },
  heroPresetChip: {
    flex: 1,
    backgroundColor: '#24212C',
    borderColor: '#423D4F',
    borderWidth: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  heroPresetChipActive: {
    backgroundColor: '#6B1C28',
    borderColor: '#DFB660',
  },
  heroPresetChipRecommended: {
    borderColor: '#C69A45',
  },
  heroPresetChipText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '700',
  },
  heroPresetChipTextActive: {
    color: '#FEE2E2',
    fontWeight: '900',
  },
  heroPresetChipTextRecommended: {
    color: '#FDE68A',
  },
  heroControlsRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 6,
  },
  heroAdjustBtn: {
    flex: 1,
    backgroundColor: '#282531',
    borderColor: '#484355',
    borderWidth: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  heroAdjustBtnText: {
    color: '#F3F4F6',
    fontSize: 13,
    fontWeight: '800',
  },
  heroActionGroup: {
    marginTop: 6,
    gap: 6,
  },
  heroMinimizeBtn: {
    backgroundColor: '#1E1B2E',
    borderColor: '#C69A45',
    borderWidth: 1.5,
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: 'center',
  },
  heroMinimizeBtnText: {
    color: '#FDE68A',
    fontSize: 13,
    fontWeight: '800',
  },
  heroSkipBtnMuted: {
    backgroundColor: 'transparent',
    borderColor: '#3D3847',
    borderWidth: 1,
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
  },
  heroSkipBtnMutedText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '700',
  },
  heroReadyBtn: {
    backgroundColor: '#10B981',
    borderColor: '#059669',
    borderWidth: 1.5,
    paddingVertical: 13,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 6,
  },
  heroReadyBtnText: {
    color: '#062B1D',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});

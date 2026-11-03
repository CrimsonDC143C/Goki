import React, { useEffect, useState, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, AppState } from 'react-native';
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
}

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
}) => {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(0);
  const completedRef = useRef<boolean>(false);

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const onSkipRef = useRef(onSkip);
  onSkipRef.current = onSkip;
  const onAdjustDeltaRef = useRef(onAdjustDelta);
  onAdjustDeltaRef.current = onAdjustDelta;
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
    if (!targetEndTimeMs || targetEndTimeMs <= Date.now()) {
      setSecondsRemaining(0);
      cancelRestTimerNotification().catch(() => {});
      return;
    }

    completedRef.current = false;
    const initialSeconds = Math.max(0, Math.ceil((targetEndTimeMs - Date.now()) / 1000));
    setSecondsRemaining(initialSeconds);

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
    scheduleRestTimerNotification(initialSeconds, notifTitle, notifBody).catch(() => {});

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

  if (!targetEndTimeMs || secondsRemaining <= 0) {
    return null;
  }

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

  if (variant === 'hero') {
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
            >
              <Text style={styles.heroClosePillText}>✕ Close</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Big Digital Clock Display */}
        <View style={styles.heroClockBox}>
          <Text style={styles.heroTimerDisplay}>{timeFormatted}</Text>
          <Text style={styles.heroRemainingLabel}>REMAINING REST</Text>
        </View>

        {/* Hero Progress Bar */}
        <View style={styles.heroProgressBarTrack}>
          <View
            style={[
              styles.heroProgressBarFill,
              {
                width: `${Math.round(progressFraction * 100)}%`,
                backgroundColor: modeBadge.color,
              },
            ]}
          />
        </View>

        {/* Guidance Headline & Subtext */}
        {headline ? <Text style={styles.heroHeadlineText}>{headline}</Text> : null}
        {subtext ? <Text style={styles.heroSubtextText}>{subtext}</Text> : null}

        {/* Hero Controls Row */}
        <View style={styles.heroControlsRow}>
          <TouchableOpacity
            style={styles.heroAdjustBtn}
            onPress={() => handleAdjust(-15)}
            activeOpacity={0.7}
          >
            <Text style={styles.heroAdjustBtnText}>-15s</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.heroAdjustBtn}
            onPress={() => handleAdjust(15)}
            activeOpacity={0.7}
          >
            <Text style={styles.heroAdjustBtnText}>+15s</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.heroAdjustBtn}
            onPress={() => handleAdjust(30)}
            activeOpacity={0.7}
          >
            <Text style={styles.heroAdjustBtnText}>+30s</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.heroSkipBtn}
            onPress={handleSkip}
            activeOpacity={0.7}
          >
            <Text style={styles.heroSkipBtnText}>Skip Rest</Text>
          </TouchableOpacity>
        </View>

        {/* Minimize Action Button */}
        {onMinimize ? (
          <TouchableOpacity
            style={styles.heroViewWorkoutBtn}
            onPress={onMinimize}
            activeOpacity={0.7}
          >
            <Text style={styles.heroViewWorkoutBtnText}>👀 View Workout (Pin Timer to Top)</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Mode Tag & Status Banner */}
      <View style={styles.headerRow}>
        <View style={[styles.badge, { borderColor: modeBadge.border }]}>
          <Text style={[styles.badgeText, { color: modeBadge.color }]}>{modeBadge.label}</Text>
        </View>
        <View style={styles.bannerClockGroup}>
          <Text style={styles.timerDisplay}>{timeFormatted}</Text>
          {onTapToFocus ? (
            <TouchableOpacity
              style={styles.focusPillBtn}
              onPress={onTapToFocus}
              activeOpacity={0.7}
            >
              <Text style={styles.focusPillText}>⛶ Center</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressBarTrack}>
        <View
          style={[
            styles.progressBarFill,
            {
              width: `${Math.round(progressFraction * 100)}%`,
              backgroundColor: modeBadge.color,
            },
          ]}
        />
      </View>

      {/* Headline / Guidance */}
      {headline ? <Text style={styles.headlineText} numberOfLines={1}>{headline}</Text> : null}
      {subtext ? <Text style={styles.subtextText} numberOfLines={1}>{subtext}</Text> : null}

      {/* Quick Controls */}
      <View style={styles.controlsRow}>
        <TouchableOpacity
          style={styles.adjustBtn}
          onPress={() => handleAdjust(-15)}
          activeOpacity={0.7}
        >
          <Text style={styles.adjustBtnText}>-15s</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.adjustBtn}
          onPress={() => handleAdjust(15)}
          activeOpacity={0.7}
        >
          <Text style={styles.adjustBtnText}>+15s</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.adjustBtn}
          onPress={() => handleAdjust(30)}
          activeOpacity={0.7}
        >
          <Text style={styles.adjustBtnText}>+30s</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.skipBtn}
          onPress={handleSkip}
          activeOpacity={0.7}
        >
          <Text style={styles.skipBtnText}>Skip Rest</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1E1D22',
    borderColor: '#3D3840',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 5,
  },
  headerRow: {
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
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  bannerClockGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  focusPillBtn: {
    backgroundColor: '#282531',
    borderColor: '#484355',
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  focusPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#D1D5DB',
  },
  timerDisplay: {
    fontSize: 24,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    color: '#E8E6E1',
    letterSpacing: 1,
  },
  progressBarTrack: {
    height: 5,
    backgroundColor: '#111013',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  headlineText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#E8E6E1',
    marginBottom: 2,
  },
  subtextText: {
    fontSize: 11,
    color: '#9CA3AF',
    marginBottom: 10,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 6,
  },
  adjustBtn: {
    flex: 1,
    backgroundColor: '#2A282E',
    borderColor: '#4A4650',
    borderWidth: 1,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
  },
  adjustBtnText: {
    color: '#D1D5DB',
    fontSize: 12,
    fontWeight: '700',
  },
  skipBtn: {
    flex: 1.4,
    backgroundColor: '#5E1924',
    borderColor: '#8A2535',
    borderWidth: 1,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
  },
  skipBtnText: {
    color: '#FEE2E2',
    fontSize: 12,
    fontWeight: '800',
  },
  // Hero Center Modal Layout Styles
  heroContainer: {
    backgroundColor: '#19181E',
    borderColor: '#C69A45',
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 12,
  },
  heroHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
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
  heroClockBox: {
    alignItems: 'center',
    marginVertical: 4,
  },
  heroTimerDisplay: {
    fontSize: 48,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    color: '#FDE68A',
    letterSpacing: 1.5,
  },
  heroRemainingLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#9CA3AF',
    letterSpacing: 1.2,
    marginTop: 2,
  },
  heroProgressBarTrack: {
    height: 8,
    backgroundColor: '#111014',
    borderRadius: 4,
    overflow: 'hidden',
    marginVertical: 12,
  },
  heroProgressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  heroHeadlineText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 4,
  },
  heroSubtextText: {
    fontSize: 12,
    color: '#D1D5DB',
    textAlign: 'center',
    marginBottom: 14,
  },
  heroControlsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
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
  heroSkipBtn: {
    flex: 1.4,
    backgroundColor: '#6B1C28',
    borderColor: '#9E2A3C',
    borderWidth: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  heroSkipBtnText: {
    color: '#FEE2E2',
    fontSize: 13,
    fontWeight: '900',
  },
  heroViewWorkoutBtn: {
    backgroundColor: '#26232F',
    borderColor: '#C69A45',
    borderWidth: 1,
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  heroViewWorkoutBtnText: {
    color: '#FDE68A',
    fontSize: 12,
    fontWeight: '800',
  },
});

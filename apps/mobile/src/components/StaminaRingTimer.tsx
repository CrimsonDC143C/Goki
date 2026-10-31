import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { RestTimerState } from '@gymify/game-engine';
import { COLORS } from '../theme';

interface StaminaRingTimerProps {
  restTimer: RestTimerState;
  lockscreenAlertArmed?: boolean;
  onAdjustDelta: (deltaSeconds: number) => void;
  onSelectPreset: (seconds: number) => void;
  onSkipRest: () => void;
}

const PRESETS = [60, 90, 120, 180, 240] as const;

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export const StaminaRingTimer: React.FC<StaminaRingTimerProps> = ({
  restTimer,
  lockscreenAlertArmed = false,
  onAdjustDelta,
  onSelectPreset,
  onSkipRest,
}) => {
  const size = 184;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const total = Math.max(1, restTimer.configuredSeconds);
  // Stamina recharges from 0% -> 100% as countdown approaches 0:00
  const rechargedRatio = Math.min(1, Math.max(0, 1 - restTimer.remainingSeconds / total));
  const strokeDashoffset = circumference * (1 - rechargedRatio);
  const rechargedPct = Math.round(rechargedRatio * 100);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.staminaTitle}>⚡ STAMINA RECHARGING</Text>
        <View style={styles.headerRight}>
          {lockscreenAlertArmed && (
            <View style={styles.lockscreenBadge}>
              <Text style={styles.lockscreenBadgeText}>🔔 Lockscreen Cue Armed</Text>
            </View>
          )}
          <Text style={styles.pctBadge}>{rechargedPct}% Ready</Text>
        </View>
      </View>

      {/* Circular SVG Stamina Ring + Flanking 56dp Sweaty-Hand +/-15s Controls */}
      <View style={styles.ringControlRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Subtract 15 seconds rest"
          style={styles.deltaBtn}
          onPress={() => onAdjustDelta(-15)}
        >
          <Text style={styles.deltaBtnText}>−15s</Text>
        </Pressable>

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
              stroke={rechargedPct >= 85 ? COLORS.gold : COLORS.endurance}
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
            <Text style={styles.countdownDigits}>{formatClock(restTimer.remainingSeconds)}</Text>
            <Text style={styles.countdownSub}>Target {formatClock(restTimer.configuredSeconds)}</Text>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add 15 seconds rest"
          style={styles.deltaBtn}
          onPress={() => onAdjustDelta(15)}
        >
          <Text style={styles.deltaBtnText}>+15s</Text>
        </Pressable>
      </View>

      {/* Evidence-Based Optimal Rest Advisory */}
      <View style={styles.adviceBox}>
        <Text style={styles.adviceHeadline}>🧬 {restTimer.advice.headline}</Text>
        <Text style={styles.adviceBody}>{restTimer.advice.physiologicalRationale}</Text>
      </View>

      {/* Configurable 1-Tap Rest Duration Presets (48dp height) */}
      <View style={styles.presetRow}>
        {PRESETS.map((sec) => {
          const isSelected = restTimer.configuredSeconds === sec;
          const isRecommended = restTimer.advice.recommendedSeconds === sec;
          return (
            <Pressable
              key={sec}
              style={[
                styles.presetChip,
                isSelected && styles.presetChipActive,
                isRecommended && !isSelected && styles.presetChipRecommended,
              ]}
              onPress={() => onSelectPreset(sec)}
            >
              <Text
                style={[
                  styles.presetChipText,
                  isSelected && styles.presetChipTextActive,
                ]}
              >
                {sec >= 60 ? `${sec / 60}m` : `${sec}s`}
                {isRecommended ? ' ★' : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* High-Target Skip / Ready Early Action (58dp height) */}
      <Pressable style={styles.skipReadyBtn} onPress={onSkipRest}>
        <Text style={styles.skipReadyBtnText}>⚔️ STAMINA READY — BEGIN NEXT SET</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.endurance,
    padding: 16,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
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
  ringControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 6,
  },
  deltaBtn: {
    minWidth: 64,
    minHeight: 58,
    backgroundColor: COLORS.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderHighlight,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  deltaBtnText: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '800',
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
    fontSize: 36,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  countdownSub: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  adviceBox: {
    backgroundColor: COLORS.enduranceDim,
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: COLORS.endurance,
  },
  adviceHeadline: {
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '800',
  },
  adviceBody: {
    color: COLORS.textSecondary,
    fontSize: 11,
    marginTop: 3,
    lineHeight: 16,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
  },
  presetChip: {
    flex: 1,
    minHeight: 46,
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
  presetChipTextActive: {
    color: COLORS.gold,
  },
  skipReadyBtn: {
    minHeight: 58,
    backgroundColor: COLORS.endurance,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  skipReadyBtnText: {
    color: COLORS.bgDeep,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
});

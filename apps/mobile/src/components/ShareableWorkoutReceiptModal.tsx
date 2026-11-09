import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  CompletedSetEntry,
  CompletedWorkoutRecord,
  PostWorkoutEncouragementSummary,
  WeightUnit,
  calculateE1RM,
  convertKgToDisplayWeight,
  formatCleanWeightNumber,
  isWarmupSetType,
} from '@goki/game-engine';
import { triggerSensoryCue } from '../utils/sensoryFeedback';

export interface ShareableReceiptRpgContext {
  bossName?: string | null;
  gameMode?: 'IRONMAN_VERIFIED' | 'MANUAL_HONESTY' | string | null;
  finalXpByStat?: Record<string, number> | null;
  totalGoldAwarded?: number | null;
  lootChestTier?: string | null;
  lootChestName?: string | null;
  raidEnergy?: number | null;
  critTriggered?: boolean;
}

export interface ShareableWorkoutReceiptModalProps {
  visible: boolean;
  workout: CompletedWorkoutRecord | null;
  summary?: PostWorkoutEncouragementSummary | null;
  rpgContext?: ShareableReceiptRpgContext | null;
  initialUnit?: WeightUnit;
  streakFallback?: number;
  onClose: () => void;
}

const STAT_SHORT_META: Record<string, { icon: string; code: string; color: string }> = {
  STRENGTH: { icon: '💪', code: 'STR', color: '#F87171' },
  CONSTITUTION: { icon: '🛡️', code: 'CON', color: '#FB923C' },
  ENDURANCE: { icon: '🫁', code: 'END', color: '#38BDF8' },
  AGILITY: { icon: '⚡', code: 'AGI', color: '#34D399' },
  DEXTERITY: { icon: '🎯', code: 'DEX', color: '#A78BFA' },
  SPIRIT: { icon: '🔥', code: 'SPI', color: '#FBBF24' },
  WISDOM: { icon: '📜', code: 'WIS', color: '#818CF8' },
};

function formatDurationCompact(seconds: number): string {
  const safe = Math.max(60, Math.round(seconds || 0));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.max(1, Math.round((safe % 3600) / 60));
  if (hrs > 0) {
    return `${hrs}h ${mins}m`;
  }
  return `${Math.round(safe / 60)}m`;
}

function formatReceiptDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Today';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function pickTopWorkingSet(sets: readonly CompletedSetEntry[]): CompletedSetEntry | null {
  const working = sets.filter((s) => s.reps > 0 && !isWarmupSetType(s.setType, s.isWarmup));
  const pool = working.length > 0 ? working : sets.filter((s) => s.reps > 0);
  if (pool.length === 0) return null;

  let best = pool[0]!;
  let bestScore =
    best.weightKg > 0 ? calculateE1RM(best.weightKg, best.reps) : best.reps;

  for (let i = 1; i < pool.length; i++) {
    const candidate = pool[i]!;
    const score =
      candidate.weightKg > 0
        ? calculateE1RM(candidate.weightKg, candidate.reps)
        : candidate.reps;
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

export const ShareableWorkoutReceiptModal: React.FC<ShareableWorkoutReceiptModalProps> = ({
  visible,
  workout,
  summary,
  rpgContext,
  initialUnit = 'KG',
  streakFallback = 1,
  onClose,
}) => {
  const [unit, setUnit] = useState<WeightUnit>(initialUnit);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  useEffect(() => {
    setUnit(initialUnit);
    setShareFeedback(null);
  }, [initialUnit, visible, workout?.id]);

  const receiptData = useMemo(() => {
    if (!workout) return null;
    const unitSuffix = unit === 'LBS' ? 'lb' : 'kg';

    let workingSetsTotal = 0;
    let tonnageKg = 0;
    let rpeSum = 0;
    let rpeCount = 0;

    const improvementMap = new Map(
      (summary?.improvements ?? []).map((imp) => [imp.exerciseId, imp])
    );

    const liftRows = workout.exercises
      .map((ex) => {
        const working = ex.sets.filter(
          (s) => s.reps > 0 && !isWarmupSetType(s.setType, s.isWarmup)
        );
        const countedSets = working.length > 0 ? working : ex.sets.filter((s) => s.reps > 0);
        workingSetsTotal += countedSets.length;

        for (const s of countedSets) {
          tonnageKg += Math.max(0, s.weightKg) * Math.max(0, s.reps);
          if (typeof s.rpe === 'number' && s.rpe > 0) {
            rpeSum += s.rpe;
            rpeCount += 1;
          }
        }

        const top = pickTopWorkingSet(ex.sets);
        const topDispWeight =
          top && top.weightKg > 0
            ? `${formatCleanWeightNumber(convertKgToDisplayWeight(top.weightKg, unit))}${unitSuffix}`
            : 'BW';
        const topSetText = top
          ? `${topDispWeight} × ${top.reps}${top.rpe ? ` @${top.rpe}` : ''}`
          : 'Logged';
        const e1rmDisp =
          top && top.weightKg > 0
            ? Math.round(
                convertKgToDisplayWeight(calculateE1RM(top.weightKg, top.reps), unit)
              )
            : 0;

        const imp = improvementMap.get(ex.exerciseId);
        return {
          exerciseId: ex.exerciseId,
          exerciseName: ex.exerciseName || ex.exerciseId,
          workingSetCount: countedSets.length,
          topSetText,
          e1rmDisp,
          badgeText: imp?.improvementBadge ?? null,
          isAllTimePr: Boolean(imp?.isAllTimePr),
        };
      })
      .filter((r) => r.workingSetCount > 0);

    const displayTonnage = Math.round(convertKgToDisplayWeight(tonnageKg, unit));
    const prCount = (summary?.improvements ?? []).filter((i) => i.isAllTimePr).length;
    const improvementsCount = summary?.improvements.length ?? 0;

    const rawCardio = workout.cardioEntries ?? [];
    let totalCardioSeconds = 0;
    let zoneSum = 0;
    let zoneCount = 0;

    const cardioRows = rawCardio
      .filter((c) => c.durationSeconds > 0)
      .map((c, idx) => {
        totalCardioSeconds += c.durationSeconds;
        if (typeof c.rpe === 'number' && c.rpe > 0) {
          rpeSum += c.rpe;
          rpeCount += 1;
        }
        if (typeof c.averageHrZone === 'number' && c.averageHrZone > 0) {
          zoneSum += c.averageHrZone;
          zoneCount += 1;
        }
        const mins = Math.max(1, Math.round(c.durationSeconds / 60));
        const lowerName = (c.exerciseName || c.activityType || '').toLowerCase();
        const isSport =
          c.workoutCategory === 'SPORT' ||
          lowerName.includes('boxing') ||
          lowerName.includes('badminton') ||
          lowerName.includes('basketball') ||
          lowerName.includes('soccer') ||
          lowerName.includes('tennis') ||
          lowerName.includes('martial') ||
          lowerName.includes('sparring') ||
          lowerName.includes('sport');
        const isRecovery =
          c.workoutCategory === 'RECOVERY' ||
          lowerName.includes('yoga') ||
          lowerName.includes('mobility') ||
          lowerName.includes('stretch') ||
          lowerName.includes('recovery') ||
          lowerName.includes('foam');
        const icon = isSport ? '🥊' : isRecovery ? '🧘' : '🏃';
        const tagLabel = isSport ? 'SPORT' : isRecovery ? 'RECOVERY' : 'CARDIO';
        const detailText = `${mins}m${c.averageHrZone ? ` • Z${c.averageHrZone}` : ''}${
          c.rpe ? ` @${c.rpe}` : ''
        }`;
        return {
          key: `${c.exerciseId}_${idx}`,
          icon,
          tagLabel,
          exerciseName: c.exerciseName || c.exerciseId,
          mins,
          detailText,
        };
      });

    const effectiveDurationSeconds = Math.max(
      workout.durationSeconds || 0,
      totalCardioSeconds
    );
    const totalCardioMinutes = Math.round(totalCardioSeconds / 60);
    const avgHrZone = zoneCount > 0 ? Math.round((zoneSum / zoneCount) * 10) / 10 : null;
    const meanRpe = rpeCount > 0 ? Math.round((rpeSum / rpeCount) * 10) / 10 : null;
    const streak = summary?.streakCount ?? streakFallback;
    const title =
      workout.presetName?.trim() ||
      (workout.workoutCategory === 'CARDIO'
        ? 'Cardio Endurance Raid'
        : workout.workoutCategory === 'SPORT'
          ? 'Sport Combat Session'
          : workout.workoutCategory === 'RECOVERY'
            ? 'Sanctuary Mobility Ritual'
            : liftRows.length === 0 && cardioRows.length > 0
              ? cardioRows[0]?.tagLabel === 'SPORT'
                ? 'Sport Combat Session'
                : 'Conditioning Raid'
              : 'Iron Guild Training Raid');

    const gymLabel =
      workout.gymName?.trim() ||
      (workout.source === 'ONLINE' ? 'Iron Sanctum' : 'Local Sanctum');

    const statPills = Object.entries(rpgContext?.finalXpByStat ?? {})
      .filter(([, xp]) => (xp ?? 0) > 0)
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
      .slice(0, 4)
      .map(([stat, xp]) => {
        const meta = STAT_SHORT_META[stat] ?? { icon: '✨', code: stat.slice(0, 3), color: '#E5E7EB' };
        return {
          key: stat,
          label: `${meta.icon} +${xp} ${meta.code}`,
          color: meta.color,
        };
      });

    return {
      title,
      dateLabel: formatReceiptDate(workout.performedAtIso),
      durationLabel: formatDurationCompact(effectiveDurationSeconds),
      gymLabel,
      unitSuffix,
      displayTonnage,
      workingSetsTotal,
      prCount,
      improvementsCount,
      meanRpe,
      avgHrZone,
      totalCardioMinutes,
      streak,
      liftRows,
      cardioRows,
      statPills,
    };
  }, [workout, summary, rpgContext, streakFallback, unit]);

  if (!visible || !workout || !receiptData) return null;

  const isConditioningOnly =
    receiptData.liftRows.length === 0 && receiptData.cardioRows.length > 0;

  const buildSharePlainText = (): string => {
    const lines: string[] = [
      `⚔️ GOKI • RAID RECEIPT`,
      `${receiptData.title} (${receiptData.dateLabel})`,
      `📍 ${receiptData.gymLabel} • ⏱️ ${receiptData.durationLabel} • 🔥 ${receiptData.streak}-Session Streak`,
    ];

    if (receiptData.liftRows.length > 0) {
      lines.push(
        `🏋️ Volume: ${receiptData.displayTonnage.toLocaleString()} ${receiptData.unitSuffix} (${receiptData.workingSetsTotal} hard sets)`
      );
    }
    if (receiptData.cardioRows.length > 0) {
      lines.push(
        `🫁 Conditioning: ${receiptData.totalCardioMinutes}m (${receiptData.cardioRows.length} segment${
          receiptData.cardioRows.length === 1 ? '' : 's'
        })`
      );
    }

    if (receiptData.prCount > 0) {
      lines.push(`🏆 Personal Records Broken: ${receiptData.prCount}`);
    }

    if (receiptData.liftRows.length > 0) {
      lines.push('');
      lines.push('TOP LIFTS:');
      for (const row of receiptData.liftRows.slice(0, 5)) {
        const prTag = row.badgeText ? ` [${row.badgeText}]` : '';
        lines.push(`• ${row.workingSetCount}× ${row.exerciseName}: ${row.topSetText}${prTag}`);
      }
    }

    if (receiptData.cardioRows.length > 0) {
      lines.push('');
      lines.push('CONDITIONING & SPORT:');
      for (const crow of receiptData.cardioRows) {
        lines.push(`• ${crow.icon} ${crow.exerciseName}: ${crow.detailText}`);
      }
    }

    if (rpgContext?.bossName || receiptData.statPills.length > 0) {
      lines.push('');
      if (rpgContext?.bossName) {
        lines.push(`🐉 Boss Raid: ${rpgContext.bossName}`);
      }
      if (receiptData.statPills.length > 0) {
        const xpLine = receiptData.statPills.map((p) => p.label).join(' • ');
        const goldPart = rpgContext?.totalGoldAwarded ? ` • 🪙 +${rpgContext.totalGoldAwarded}g` : '';
        lines.push(`${xpLine}${goldPart}`);
      }
    }

    lines.push('');
    lines.push('Forged in Goki 🛡️');
    return lines.join('\n');
  };

  const handleShareReceipt = async () => {
    triggerSensoryCue('SET_MICRO_REWARD_TICK');
    const textPayload = buildSharePlainText();

    try {
      if (Platform.OS === 'web') {
        const nav = (globalThis as unknown as { navigator?: { share?: (d: { title?: string; text?: string }) => Promise<void>; clipboard?: { writeText: (t: string) => Promise<void> } } }).navigator;
        if (nav?.share) {
          await nav.share({ title: receiptData.title, text: textPayload });
          setShareFeedback('✓ Shared Receipt!');
          return;
        }
        if (nav?.clipboard?.writeText) {
          await nav.clipboard.writeText(textPayload);
          setShareFeedback('✓ Receipt Copied to Clipboard!');
          return;
        }
      }

      const result = await Share.share({
        title: `Goki: Fitness RPG — ${receiptData.title}`,
        message: textPayload,
      });
      if (result.action === Share.sharedAction) {
        setShareFeedback('✓ Receipt Shared!');
      }
    } catch {
      setShareFeedback('Receipt ready — screenshot 9:16 card to share!');
    }
  };

  const extraLiftCount = Math.max(0, receiptData.liftRows.length - 5);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.modalShell} onPress={(e) => e.stopPropagation()}>
          {/* Top Utility Controls (Outside the 9:16 Capture Frame) */}
          <View style={styles.utilityBar}>
            <TouchableOpacity
              style={styles.unitSwitchBtn}
              onPress={() => {
                triggerSensoryCue('SET_MICRO_REWARD_TICK');
                setUnit((prev) => (prev === 'KG' ? 'LBS' : 'KG'));
              }}
              activeOpacity={0.75}
            >
              <Text style={styles.unitSwitchText}>⚖️ Unit: {unit}</Text>
            </TouchableOpacity>

            <Text style={styles.storyHintText}>9:16 Story / Raid Card</Text>

            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* 9:16SHAREABLE GUILD RAID RECEIPT CARD */}
          <View style={styles.receiptFrame} testID="shareable-9x16-receipt-card">
            {/* Decorative Top Gold Accent */}
            <View style={styles.goldCrestBar} />

            {/* 1. Crest & Sanctum Header */}
            <View style={styles.crestHeader}>
              <View style={styles.eyebrowRow}>
                <Text style={styles.crestEyebrow}>⚔️ GOKI • RAID RECEIPT</Text>
                <Text style={styles.dateStamp}>{receiptData.dateLabel}</Text>
              </View>

              <Text style={styles.workoutTitle} numberOfLines={1}>
                {receiptData.title}
              </Text>

              <View style={styles.locationBadgeRow}>
                <View style={styles.gymPill}>
                  <Text style={styles.gymPillText} numberOfLines={1}>
                    📍 {receiptData.gymLabel}
                  </Text>
                </View>

                {rpgContext?.gameMode === 'IRONMAN_VERIFIED' ? (
                  <View style={styles.verifiedPill}>
                    <Text style={styles.verifiedPillText}>🛡️ Ironman Verified</Text>
                  </View>
                ) : (
                  <View style={styles.streakPill}>
                    <Text style={styles.streakPillText}>
                      🔥 {receiptData.streak}-Session Streak
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* 2. Hero Telemetry Strip */}
            <View style={styles.telemetryStrip}>
              <View style={styles.telemetryCell}>
                <Text style={styles.telemetryValue}>{receiptData.durationLabel}</Text>
                <Text style={styles.telemetryLabel}>DURATION</Text>
              </View>
              <View style={styles.telemetryDivider} />
              <View style={styles.telemetryCell}>
                <Text style={styles.telemetryValue}>
                  {isConditioningOnly
                    ? `${receiptData.totalCardioMinutes}m`
                    : receiptData.displayTonnage > 0
                      ? `${receiptData.displayTonnage.toLocaleString()}${receiptData.unitSuffix}`
                      : 'BW'}
                </Text>
                <Text style={styles.telemetryLabel}>
                  {isConditioningOnly ? 'CONDITIONING' : 'TONNAGE'}
                </Text>
              </View>
              <View style={styles.telemetryDivider} />
              <View style={styles.telemetryCell}>
                <Text style={styles.telemetryValue}>
                  {isConditioningOnly
                    ? receiptData.cardioRows.length
                    : receiptData.workingSetsTotal}
                </Text>
                <Text style={styles.telemetryLabel}>
                  {isConditioningOnly ? 'SEGMENTS' : 'HARD SETS'}
                </Text>
              </View>
              <View style={styles.telemetryDivider} />
              <View style={styles.telemetryCell}>
                <Text
                  style={[
                    styles.telemetryValue,
                    receiptData.prCount > 0 && { color: '#FDE68A' },
                  ]}
                >
                  {receiptData.prCount > 0
                    ? `🏆 ${receiptData.prCount}`
                    : isConditioningOnly && receiptData.avgHrZone
                      ? `Z${receiptData.avgHrZone}`
                      : receiptData.meanRpe
                        ? `@${receiptData.meanRpe}`
                        : '✓'}
                </Text>
                <Text style={styles.telemetryLabel}>
                  {receiptData.prCount > 0
                    ? 'NEW PRS'
                    : isConditioningOnly && receiptData.avgHrZone
                      ? 'AVG HR ZONE'
                      : 'MEAN RPE'}
                </Text>
              </View>
            </View>

            {/* 3. Top Lifts & Conditioning Ledger */}
            <View style={styles.liftsSection}>
              <View style={styles.liftsHeaderRow}>
                <Text style={styles.liftsSectionTitle}>
                  {isConditioningOnly
                    ? 'CONDITIONING & SPORT LEDGER'
                    : receiptData.cardioRows.length > 0
                      ? 'HYBRID LEDGER • LIFTS & CONDITIONING'
                      : 'IRON LEDGER • TOP WORKING SETS'}
                </Text>
                {rpgContext?.critTriggered ? (
                  <Text style={styles.critMiniTag}>💥 PR CRIT</Text>
                ) : null}
              </View>

              <ScrollView
                style={styles.liftsScroll}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
              >
                {receiptData.liftRows.length === 0 && receiptData.cardioRows.length === 0 ? (
                  <View style={styles.cardioOnlyBox}>
                    <Text style={styles.cardioOnlyText}>
                      🫁 Conditioning &amp; Recovery Session Logged
                    </Text>
                  </View>
                ) : (
                  <>
                    {receiptData.liftRows.slice(0, 5).map((row) => (
                      <View key={row.exerciseId} style={styles.liftRow}>
                        <View style={styles.liftLeftCol}>
                          <Text style={styles.liftNameText} numberOfLines={1}>
                            <Text style={styles.liftSetCountPrefix}>{row.workingSetCount}× </Text>
                            {row.exerciseName}
                          </Text>
                          {row.e1rmDisp > 0 ? (
                            <Text style={styles.liftE1rmHint}>
                              Est. 1RM: {row.e1rmDisp}
                              {receiptData.unitSuffix}
                            </Text>
                          ) : null}
                        </View>

                        <View style={styles.liftRightCol}>
                          <Text style={styles.liftTopSetText}>{row.topSetText}</Text>
                          {row.badgeText ? (
                            <View
                              style={[
                                styles.liftDeltaBadge,
                                row.isAllTimePr && styles.liftPrBadge,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.liftDeltaBadgeText,
                                  row.isAllTimePr && styles.liftPrBadgeText,
                                ]}
                              >
                                {row.badgeText}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    ))}

                    {receiptData.cardioRows.map((crow) => (
                      <View key={crow.key} style={styles.liftRow}>
                        <View style={styles.liftLeftCol}>
                          <Text style={styles.liftNameText} numberOfLines={1}>
                            <Text style={styles.liftSetCountPrefix}>{crow.icon} </Text>
                            {crow.exerciseName}
                          </Text>
                          <Text style={styles.liftE1rmHint}>{crow.tagLabel} SEGMENT</Text>
                        </View>

                        <View style={styles.liftRightCol}>
                          <Text style={styles.liftTopSetText}>{crow.detailText}</Text>
                        </View>
                      </View>
                    ))}
                  </>
                )}

                {extraLiftCount > 0 ? (
                  <Text style={styles.moreLiftsText}>
                    + {extraLiftCount} more exercise{extraLiftCount > 1 ? 's' : ''} completed
                  </Text>
                ) : null}
              </ScrollView>
            </View>

            {/* 4. RPG Spoils & Watermark Footer */}
            <View style={styles.spoilsFooter}>
              {rpgContext?.bossName ? (
                <Text style={styles.bossSlainLine} numberOfLines={1}>
                  🐉 Raid Target: {rpgContext.bossName}
                  {rpgContext.lootChestTier ? ` • 🎁 [${rpgContext.lootChestTier}] Spoils` : ''}
                </Text>
              ) : null}

              {receiptData.statPills.length > 0 ? (
                <View style={styles.xpRow}>
                  {receiptData.statPills.map((pill) => (
                    <View key={pill.key} style={styles.xpChip}>
                      <Text style={[styles.xpChipText, { color: pill.color }]}>
                        {pill.label}
                      </Text>
                    </View>
                  ))}
                  {rpgContext?.totalGoldAwarded ? (
                    <View style={styles.xpChip}>
                      <Text style={[styles.xpChipText, { color: '#FCD34D' }]}>
                        🪙 +{rpgContext.totalGoldAwarded}g
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : (
                <View style={styles.offlineGuildStampRow}>
                  <Text style={styles.offlineGuildStampText}>
                    🛡️ Verified Sanctum Ledger • {receiptData.improvementsCount > 0
                      ? `${receiptData.improvementsCount} Lift Progression${receiptData.improvementsCount > 1 ? 's' : ''}`
                      : 'Discipline Banked'}
                  </Text>
                </View>
              )}

              <View style={styles.watermarkRow}>
                <Text style={styles.watermarkLeft}>GOKI</Text>
                <Text style={styles.watermarkRight}>EVERY REP FORGES YOUR LEGEND</Text>
              </View>
            </View>
          </View>

          {/* Bottom Share Action Bar */}
          {shareFeedback ? (
            <Text style={styles.shareFeedbackText}>{shareFeedback}</Text>
          ) : null}

          <View style={styles.bottomActionsRow}>
            <TouchableOpacity
              style={styles.sharePrimaryBtn}
              onPress={handleShareReceipt}
              activeOpacity={0.8}
              testID="share-receipt-export-btn"
            >
              <Text style={styles.sharePrimaryBtnText}>📤 Share / Copy Raid Receipt</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(8, 8, 12, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  modalShell: {
    width: '100%',
    maxWidth: 356,
    alignItems: 'center',
  },
  utilityBar: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  unitSwitchBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#23202E',
    borderWidth: 1,
    borderColor: '#C69A45',
  },
  unitSwitchText: {
    color: '#FDE68A',
    fontSize: 11,
    fontWeight: '800',
  },
  storyHintText: {
    color: '#9CA3AF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#252330',
    borderWidth: 1,
    borderColor: '#3E3A4E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: '#E5E7EB',
    fontSize: 13,
    fontWeight: '800',
  },

  // 9:16 Social Story Aspect Ratio Receipt Frame
  receiptFrame: {
    width: '100%',
    aspectRatio: 9 / 16,
    maxHeight: 590,
    backgroundColor: '#131119',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#C69A45',
    overflow: 'hidden',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 18,
    elevation: 12,
  },
  goldCrestBar: {
    height: 4,
    width: '100%',
    backgroundColor: '#C69A45',
  },
  crestHeader: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: '#1A1723',
    borderBottomWidth: 1,
    borderBottomColor: '#2C273A',
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  crestEyebrow: {
    color: '#C69A45',
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  dateStamp: {
    color: '#9CA3AF',
    fontSize: 9.5,
    fontWeight: '700',
  },
  workoutTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 7,
  },
  locationBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  gymPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    backgroundColor: '#1D2533',
    borderWidth: 1,
    borderColor: '#38BDF8',
    maxWidth: '58%',
  },
  gymPillText: {
    color: '#BAE6FD',
    fontSize: 9.5,
    fontWeight: '800',
  },
  verifiedPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    backgroundColor: '#33121C',
    borderWidth: 1,
    borderColor: '#F43F5E',
  },
  verifiedPillText: {
    color: '#FDA4AF',
    fontSize: 9.5,
    fontWeight: '800',
  },
  streakPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    backgroundColor: '#2E2112',
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  streakPillText: {
    color: '#FDE68A',
    fontSize: 9.5,
    fontWeight: '800',
  },

  telemetryStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: '#171520',
    borderBottomWidth: 1,
    borderBottomColor: '#292536',
  },
  telemetryCell: {
    flex: 1,
    alignItems: 'center',
  },
  telemetryDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#2D293B',
  },
  telemetryValue: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  telemetryLabel: {
    color: '#8E8A9D',
    fontSize: 8,
    fontWeight: '800',
    marginTop: 2,
    letterSpacing: 0.4,
  },

  liftsSection: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  liftsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  liftsSectionTitle: {
    color: '#9CA3AF',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  critMiniTag: {
    color: '#FDE68A',
    fontSize: 9,
    fontWeight: '900',
  },
  liftsScroll: {
    flex: 1,
  },
  liftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#221F2D',
    gap: 8,
  },
  liftLeftCol: {
    flex: 1,
  },
  liftSetCountPrefix: {
    color: '#C69A45',
    fontWeight: '900',
  },
  liftNameText: {
    color: '#F3F4F6',
    fontSize: 11.5,
    fontWeight: '800',
  },
  liftE1rmHint: {
    color: '#6B7280',
    fontSize: 9,
    fontWeight: '700',
    marginTop: 1,
  },
  liftRightCol: {
    alignItems: 'flex-end',
  },
  liftTopSetText: {
    color: '#FDE68A',
    fontSize: 11.5,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  liftDeltaBadge: {
    marginTop: 2,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.16)',
    borderWidth: 1,
    borderColor: '#10B981',
  },
  liftPrBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.22)',
    borderColor: '#F59E0B',
  },
  liftDeltaBadgeText: {
    color: '#6EE7B7',
    fontSize: 8.5,
    fontWeight: '900',
  },
  liftPrBadgeText: {
    color: '#FDE68A',
  },
  moreLiftsText: {
    color: '#9CA3AF',
    fontSize: 9.5,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 6,
  },
  cardioOnlyBox: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  cardioOnlyText: {
    color: '#BAE6FD',
    fontSize: 12,
    fontWeight: '800',
  },

  spoilsFooter: {
    paddingHorizontal: 14,
    paddingTop: 9,
    paddingBottom: 10,
    backgroundColor: '#191623',
    borderTopWidth: 1,
    borderTopColor: '#2D283C',
  },
  bossSlainLine: {
    color: '#E5E7EB',
    fontSize: 10,
    fontWeight: '800',
    marginBottom: 6,
  },
  xpRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginBottom: 8,
  },
  xpChip: {
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 5,
    backgroundColor: '#242031',
    borderWidth: 1,
    borderColor: '#373149',
  },
  xpChipText: {
    fontSize: 9.5,
    fontWeight: '900',
  },
  offlineGuildStampRow: {
    marginBottom: 7,
  },
  offlineGuildStampText: {
    color: '#D1D5DB',
    fontSize: 10,
    fontWeight: '700',
  },
  watermarkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#272334',
  },
  watermarkLeft: {
    color: '#C69A45',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },
  watermarkRight: {
    color: '#6B7280',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  shareFeedbackText: {
    marginTop: 7,
    color: '#6EE7B7',
    fontSize: 11,
    fontWeight: '800',
  },
  bottomActionsRow: {
    width: '100%',
    marginTop: 8,
  },
  sharePrimaryBtn: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#C69A45',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sharePrimaryBtnText: {
    color: '#121114',
    fontSize: 13,
    fontWeight: '900',
  },
});

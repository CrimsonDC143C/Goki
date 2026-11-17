import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  DEFAULT_TALENT_TREES,
  MULTI_WEEK_WORKOUT_PROGRAMS,
  STARTER_WORKOUT_PRESETS,
  TalentGoverningStat,
  TrainerCoachingReport,
  WorkoutPresetDefinition,
  calculateTalentRespecCost,
  filterWorkoutsForCharacter,
  generateTrainerCoachingReport,
  recommendTalentBuildForStats,
  resolveProgramSessionPreset,
} from '@goki/game-engine';
import { fetchTrainerCoachingApi } from '../../api/apiClient';
import { useGame } from '../../state/GameContext';
import { COLORS, RADII, SPACING, SURFACES, TYPOGRAPHY } from '../../theme';
import { RpgIcon } from '../icons/RpgIcon';
import {
  HairlineDivider,
  SegmentedControl,
  SegmentedOption,
} from '../ui/SurfacePrimitives';
import { NpcPortraitSvg } from './NpcPortraitSvg';

export type TrainerModalTab = 'COACHING' | 'PROGRAMS' | 'RESPEC';

export interface TrainerCoachingModalProps {
  visible: boolean;
  onClose: () => void;
  initialTab?: TrainerModalTab;
  onSelectPresetToLog?: (preset: WorkoutPresetDefinition) => void;
}

const TAB_OPTIONS: ReadonlyArray<SegmentedOption<TrainerModalTab>> = [
  { key: 'COACHING', label: 'Coaching', icon: 'combat', testID: 'trainer-tab-coaching' },
  { key: 'PROGRAMS', label: 'Programs', icon: 'scroll', testID: 'trainer-tab-programs' },
  { key: 'RESPEC', label: 'Respec', icon: 'refresh', testID: 'trainer-tab-respec' },
];

const SEVERITY_STYLE: Record<
  TrainerCoachingReport['deloadAlert']['severity'],
  { accent: string; bg: string }
> = {
  NONE: { accent: COLORS.success, bg: SURFACES.emeraldTint },
  WATCH: { accent: COLORS.warning, bg: '#2B2214' },
  RECOMMENDED: { accent: '#F59E0B', bg: '#332312' },
  URGENT: { accent: COLORS.danger, bg: COLORS.strengthDim },
};

const OVERLOAD_BADGE_COLORS: Record<string, string> = {
  ADD_WEIGHT: COLORS.success,
  ADD_REPS: COLORS.agility,
  CONSOLIDATE_LOAD: COLORS.gold,
  DELOAD_BACKOFF: COLORS.warning,
};

export const TrainerCoachingModal: React.FC<TrainerCoachingModalProps> = ({
  visible,
  onClose,
  initialTab = 'COACHING',
  onSelectPresetToLog,
}) => {
  const insets = useSafeAreaInsets();
  const {
    activeCharacterId,
    gold,
    stats,
    fatigueState,
    workoutHistory,
    unlockedTalentRanks,
    activeProgramEnrollment,
    enrollInWorkoutProgram,
    respecCharacterTalentTrees,
    serverOnline,
    isAuthenticated,
  } = useGame();

  const [activeTab, setActiveTab] = useState<TrainerModalTab>(initialTab);
  const [selectedProgramId, setSelectedProgramId] = useState<string>(
    activeProgramEnrollment?.programId ?? MULTI_WEEK_WORKOUT_PROGRAMS[0]!.id
  );
  const [selectedWeek, setSelectedWeek] = useState<number>(
    activeProgramEnrollment?.currentWeek ?? 1
  );
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(
    activeProgramEnrollment?.currentDayIndex ?? 0
  );
  const [serverReport, setServerReport] = useState<TrainerCoachingReport | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [respecBusy, setRespecBusy] = useState(false);

  const characterWorkouts = useMemo(
    () =>
      activeCharacterId
        ? filterWorkoutsForCharacter(workoutHistory, activeCharacterId)
        : workoutHistory,
    [workoutHistory, activeCharacterId]
  );

  const localReport = useMemo(
    () =>
      generateTrainerCoachingReport({
        workoutHistory: characterWorkouts,
        fatigueState,
      }),
    [characterWorkouts, fatigueState]
  );

  const report = serverReport ?? localReport;

  useEffect(() => {
    if (!visible) return;
    setActiveTab(initialTab);
    setFeedback(null);
    setServerReport(null);
    if (activeProgramEnrollment) {
      setSelectedProgramId(activeProgramEnrollment.programId);
      setSelectedWeek(activeProgramEnrollment.currentWeek);
      setSelectedDayIndex(activeProgramEnrollment.currentDayIndex);
    }

    if (
      serverOnline &&
      isAuthenticated &&
      activeCharacterId &&
      !activeCharacterId.startsWith('local_')
    ) {
      let active = true;
      void fetchTrainerCoachingApi({
        characterId: activeCharacterId,
        workoutHistory: characterWorkouts,
      }).then((res) => {
        if (active && res.ok && res.data?.report) {
          setServerReport(res.data.report as TrainerCoachingReport);
        }
      });
      return () => {
        active = false;
      };
    }
  }, [
    visible,
    initialTab,
    serverOnline,
    isAuthenticated,
    activeCharacterId,
    activeProgramEnrollment,
    characterWorkouts,
  ]);

  const matchedSplitPreset = useMemo(() => {
    const rec = report.splitRecommendation;
    if (!rec.suggestedPresetId && !rec.suggestedPresetSlug) return null;
    return (
      STARTER_WORKOUT_PRESETS.find(
        (p) =>
          (rec.suggestedPresetId && p.id === rec.suggestedPresetId) ||
          (rec.suggestedPresetSlug && p.slug === rec.suggestedPresetSlug)
      ) ?? null
    );
  }, [report.splitRecommendation]);

  const selectedProgram = useMemo(
    () =>
      MULTI_WEEK_WORKOUT_PROGRAMS.find((p) => p.id === selectedProgramId) ??
      MULTI_WEEK_WORKOUT_PROGRAMS[0]!,
    [selectedProgramId]
  );

  const safeDayIndex = Math.min(
    selectedDayIndex,
    Math.max(0, selectedProgram.days.length - 1)
  );
  const selectedWeekInfo =
    selectedProgram.weeks.find((w) => w.weekNumber === selectedWeek) ??
    selectedProgram.weeks[0]!;
  const resolvedProgramPreset = useMemo(
    () =>
      resolveProgramSessionPreset(
        selectedProgram.id,
        selectedWeek,
        safeDayIndex
      ),
    [selectedProgram.id, selectedWeek, safeDayIndex]
  );

  const recommendedBuild = useMemo(
    () =>
      recommendTalentBuildForStats({
        strengthLevel: stats.STRENGTH?.level ?? 1,
        enduranceLevel: stats.ENDURANCE?.level ?? 1,
        agilityLevel: stats.AGILITY?.level ?? 1,
        dexLevel: stats.DEXTERITY?.level ?? 1,
        conLevel: stats.CONSTITUTION?.level ?? 1,
        wisLevel: stats.WISDOM?.level ?? 1,
        sprLevel: stats.SPIRIT?.level ?? 1,
      }),
    [stats]
  );

  const respecQuote = useMemo(
    () => calculateTalentRespecCost(unlockedTalentRanks),
    [unlockedTalentRanks]
  );

  const treeNameBySlug = useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of DEFAULT_TALENT_TREES) {
      map[t.slug] = t.name;
    }
    return map;
  }, []);

  const nodeTitleById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of DEFAULT_TALENT_TREES) {
      for (const n of t.nodes) {
        map[n.id] = n.name;
      }
    }
    return map;
  }, []);

  const handleConfirmRespec = async () => {
    setRespecBusy(true);
    const res = await respecCharacterTalentTrees();
    setRespecBusy(false);
    if (res.ok) {
      setFeedback({
        ok: true,
        text: `Refunded ${res.totalPointsRefunded ?? 0} talent points for ${res.goldCost ?? 0}g.`,
      });
    } else {
      setFeedback({
        ok: false,
        text: res.error ?? 'Could not respec talents.',
      });
    }
  };

  const sevStyle = SEVERITY_STYLE[report.deloadAlert.severity];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root} testID="trainer-coaching-modal">
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View
          style={[
            styles.sheet,
            {
              marginTop: Math.max(insets.top + 16, 28),
              marginBottom: Math.max(insets.bottom + 12, 20),
            },
          ]}
        >
          {/* Master Kaelen Header */}
          <View style={styles.headerRow}>
            <NpcPortraitSvg
              npcId="TRAINER"
              size={64}
              expression={report.deloadAlert.shouldDeload ? 'alert' : 'focused'}
            />
            <View style={styles.headerCol}>
              <Text style={styles.eyebrow}>IRON SANCTUM MASTER COACH</Text>
              <Text style={styles.title}>Master Kaelen</Text>
              <View style={styles.metaRow}>
                <View style={styles.metaPill}>
                  <RpgIcon name="coin" size={12} color={COLORS.gold} />
                  <Text style={styles.metaPillText}>{gold.toLocaleString()}g</Text>
                </View>
                <View style={styles.metaPill}>
                  <RpgIcon name="bolt" size={12} color={COLORS.shieldCyan} />
                  <Text style={styles.metaPillText}>
                    Next XP {report.nextWorkoutXpMultiplier}x
                  </Text>
                </View>
              </View>
            </View>
            <Pressable
              style={styles.closeBtn}
              onPress={onClose}
              testID="trainer-close-btn"
              hitSlop={8}
            >
              <RpgIcon name="close" size={16} color={COLORS.textSecondary} />
            </Pressable>
          </View>

          <SegmentedControl
            options={TAB_OPTIONS}
            value={activeTab}
            onChange={(next) => {
              setActiveTab(next);
              setFeedback(null);
            }}
          />

          {feedback ? (
            <View
              style={[
                styles.feedbackBanner,
                feedback.ok ? styles.feedbackSuccess : styles.feedbackError,
              ]}
            >
              <RpgIcon
                name={feedback.ok ? 'check' : 'lock'}
                size={14}
                color={feedback.ok ? COLORS.success : COLORS.danger}
              />
              <Text style={styles.feedbackText}>{feedback.text}</Text>
            </View>
          ) : null}

          <HairlineDivider spacing={SPACING.xs} />

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {activeTab === 'COACHING' && (
              <>
                {/* Deload Alert Banner */}
                <View
                  style={[
                    styles.card,
                    { backgroundColor: sevStyle.bg, borderColor: sevStyle.accent },
                  ]}
                >
                  <View style={styles.cardHeaderRow}>
                    <Text style={[styles.badgeText, { color: sevStyle.accent }]}>
                      DELOAD STATUS • {report.deloadAlert.severity}
                    </Text>
                    <Text style={styles.tabularChip}>
                      RPE Cap {report.deloadAlert.prescribedRpeCap} • Vol -
                      {report.deloadAlert.prescribedVolumeReductionPct}%
                    </Text>
                  </View>
                  <Text style={styles.cardTitle}>{report.deloadAlert.headline}</Text>
                  <Text style={styles.cardBody}>{report.deloadAlert.explanation}</Text>
                </View>

                {/* Recommended Next Split */}
                <View style={styles.card}>
                  <Text style={[styles.badgeText, { color: COLORS.gold }]}>
                    RECOMMENDED NEXT SPLIT
                  </Text>
                  <Text style={styles.cardTitle}>{report.splitRecommendation.title}</Text>
                  <Text style={styles.cardBody}>{report.splitRecommendation.rationale}</Text>
                  {report.splitRecommendation.priorityMuscles.length > 0 ? (
                    <View style={styles.chipWrap}>
                      {report.splitRecommendation.priorityMuscles.map((m) => (
                        <View key={m} style={styles.muscleChip}>
                          <Text style={styles.muscleChipText}>{m}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                  {matchedSplitPreset && onSelectPresetToLog ? (
                    <TouchableOpacity
                      style={styles.primaryBtn}
                      onPress={() => onSelectPresetToLog(matchedSplitPreset)}
                      activeOpacity={0.8}
                      testID="trainer-load-split-btn"
                    >
                      <RpgIcon name="train" size={14} color={SURFACES.canvas} />
                      <Text style={styles.primaryBtnText}>Load Split into Logger</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                {/* Progressive Overload Cues */}
                <View style={styles.card}>
                  <Text style={[styles.badgeText, { color: COLORS.shieldCyan }]}>
                    PROGRESSIVE OVERLOAD CUES
                  </Text>
                  {report.overloadCues.length === 0 ? (
                    <Text style={styles.cardBody}>
                      Log resistance sets in Train to receive weight, rep, and RPE overload targets for each lift.
                    </Text>
                  ) : (
                    report.overloadCues.map((cue) => {
                      const badgeColor =
                        OVERLOAD_BADGE_COLORS[cue.action] ?? COLORS.textSecondary;
                      return (
                        <View key={cue.exerciseId} style={styles.cueRow}>
                          <View style={styles.cueTopRow}>
                            <Text style={styles.cueExName}>{cue.exerciseName}</Text>
                            <View
                              style={[styles.actionBadge, { borderColor: badgeColor }]}
                            >
                              <Text style={[styles.actionBadgeText, { color: badgeColor }]}>
                                {cue.action}
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.cuePrev}>
                            Last: {cue.previousWeightKg} kg × {cue.previousReps}
                            {cue.previousRpe ? ` @ RPE ${cue.previousRpe}` : ''}
                          </Text>
                          <Text style={styles.cueText}>{cue.cueText}</Text>
                        </View>
                      );
                    })
                  )}
                </View>
              </>
            )}

            {activeTab === 'PROGRAMS' && (
              <>
                <Text style={styles.sectionLabel}>Select a 4-Week Training Block</Text>
                {MULTI_WEEK_WORKOUT_PROGRAMS.map((prog) => {
                  const isSelected = prog.id === selectedProgram.id;
                  const isEnrolled = activeProgramEnrollment?.programId === prog.id;
                  return (
                    <TouchableOpacity
                      key={prog.id}
                      style={[
                        styles.card,
                        isSelected && styles.cardSelected,
                      ]}
                      onPress={() => {
                        setSelectedProgramId(prog.id);
                        setSelectedDayIndex(0);
                      }}
                      activeOpacity={0.8}
                      testID={`trainer-program-${prog.id}`}
                    >
                      <View style={styles.cardHeaderRow}>
                        <Text style={styles.badgeText}>
                          {prog.daysPerWeek} DAYS/WK • {prog.weeksCount} WEEKS
                        </Text>
                        {isEnrolled ? (
                          <View style={styles.enrolledPill}>
                            <Text style={styles.enrolledPillText}>ENROLLED</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.cardTitle}>{prog.name}</Text>
                      <Text style={styles.cardBody}>{prog.subtitle}</Text>
                    </TouchableOpacity>
                  );
                })}

                {/* Week & Day Pickers */}
                <View style={styles.card}>
                  <Text style={styles.sectionLabel}>Week Progression</Text>
                  <View style={styles.chipWrap}>
                    {selectedProgram.weeks.map((wk) => {
                      const active = wk.weekNumber === selectedWeek;
                      return (
                        <TouchableOpacity
                          key={wk.weekNumber}
                          style={[
                            styles.pickerChip,
                            active && styles.pickerChipActive,
                            wk.isDeloadWeek && styles.deloadChip,
                          ]}
                          onPress={() => setSelectedWeek(wk.weekNumber)}
                          activeOpacity={0.8}
                        >
                          <Text
                            style={[
                              styles.pickerChipText,
                              active && { color: COLORS.gold },
                            ]}
                          >
                            W{wk.weekNumber}
                            {wk.isDeloadWeek ? ' (Deload)' : ''}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text style={styles.cardBody}>{selectedWeekInfo.coachNote}</Text>

                  <HairlineDivider spacing={SPACING.xs} />

                  <Text style={styles.sectionLabel}>Session Day</Text>
                  <View style={styles.chipWrap}>
                    {selectedProgram.days.map((day) => {
                      const active = day.dayIndex === safeDayIndex;
                      return (
                        <TouchableOpacity
                          key={day.dayIndex}
                          style={[styles.pickerChip, active && styles.pickerChipActive]}
                          onPress={() => setSelectedDayIndex(day.dayIndex)}
                          activeOpacity={0.8}
                        >
                          <Text
                            style={[
                              styles.pickerChipText,
                              active && { color: COLORS.gold },
                            ]}
                          >
                            {day.dayLabel}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {resolvedProgramPreset ? (
                    <View style={styles.previewBox}>
                      <Text style={styles.previewTitle}>{resolvedProgramPreset.name}</Text>
                      <Text style={styles.previewMeta}>
                        Target RPE {resolvedProgramPreset.blocks.sessionRpeTarget ?? 8} •{' '}
                        {resolvedProgramPreset.blocks.exerciseBlocks.length} lift blocks
                        {resolvedProgramPreset.blocks.cardioSegments.length > 0
                          ? ` • ${resolvedProgramPreset.blocks.cardioSegments.length} cardio`
                          : ''}
                      </Text>
                      {resolvedProgramPreset.blocks.exerciseBlocks.map((blk) => (
                        <Text key={blk.blockId} style={styles.previewLine}>
                          • {blk.exerciseName}: {blk.sets.length} sets (
                          {blk.sets[blk.sets.length - 1]?.targetWeightKg ?? 0} kg ×{' '}
                          {blk.sets[blk.sets.length - 1]?.targetReps ?? 0})
                        </Text>
                      ))}
                      {resolvedProgramPreset.blocks.cardioSegments.map((seg) => (
                        <Text key={seg.segmentId} style={styles.previewLine}>
                          • {seg.exerciseName}: {seg.targetDurationMinutes} min (Zone{' '}
                          {seg.targetHrZone})
                        </Text>
                      ))}
                    </View>
                  ) : null}

                  <View style={styles.btnRow}>
                    <TouchableOpacity
                      style={styles.secondaryBtn}
                      onPress={() => {
                        enrollInWorkoutProgram(
                          selectedProgram.id,
                          selectedWeek,
                          safeDayIndex
                        );
                        setFeedback({
                          ok: true,
                          text: `Enrolled in ${selectedProgram.name} (W${selectedWeek}, Day ${safeDayIndex + 1}).`,
                        });
                      }}
                      activeOpacity={0.8}
                      testID="trainer-enroll-program-btn"
                    >
                      <Text style={styles.secondaryBtnText}>Enroll</Text>
                    </TouchableOpacity>

                    {resolvedProgramPreset && onSelectPresetToLog ? (
                      <TouchableOpacity
                        style={[styles.primaryBtn, { flex: 1.5 }]}
                        onPress={() => {
                          enrollInWorkoutProgram(
                            selectedProgram.id,
                            selectedWeek,
                            safeDayIndex
                          );
                          onSelectPresetToLog(resolvedProgramPreset);
                        }}
                        activeOpacity={0.8}
                        testID="trainer-start-program-session-btn"
                      >
                        <RpgIcon name="train" size={14} color={SURFACES.canvas} />
                        <Text style={styles.primaryBtnText}>Start Session in Logger</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              </>
            )}

            {activeTab === 'RESPEC' && (
              <>
                {/* Build Archetype Recommendation */}
                <View style={styles.card}>
                  <Text style={[styles.badgeText, { color: COLORS.gold }]}>
                    RECOMMENDED BUILD ARCHETYPE
                  </Text>
                  <Text style={styles.cardTitle}>{recommendedBuild.title}</Text>
                  <Text style={styles.cardBody}>{recommendedBuild.summary}</Text>
                  <Text style={styles.previewMeta}>
                    Primary: {recommendedBuild.primaryStat} • Secondary:{' '}
                    {recommendedBuild.secondaryStat}
                  </Text>
                  <View style={styles.chipWrap}>
                    {recommendedBuild.recommendedTreeSlugs.map((slug) => (
                      <View key={slug} style={styles.muscleChip}>
                        <Text style={styles.muscleChipText}>
                          {treeNameBySlug[slug] ?? slug}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <Text style={styles.sectionLabel}>Priority Nodes</Text>
                  {recommendedBuild.priorityNodeIds.map((id) => (
                    <Text key={id} style={styles.previewLine}>
                      • {nodeTitleById[id] ?? id}
                    </Text>
                  ))}
                  <Text style={[styles.cardBody, { marginTop: 4 }]}>
                    Tip: {recommendedBuild.trainingFocusTip}
                  </Text>
                </View>

                {/* Talent Respec Cost & Confirm */}
                <View style={styles.card}>
                  <Text style={[styles.badgeText, { color: COLORS.strength }]}>
                    FULL TALENT RESPEC
                  </Text>
                  <Text style={styles.cardTitle}>
                    {respecQuote.totalPointsSpent} Allocated Talent Point
                    {respecQuote.totalPointsSpent === 1 ? '' : 's'}
                  </Text>
                  <Text style={styles.cardBody}>
                    Refunding all talent nodes returns spent points back to each governing stat pool (20g base + 15g per point).
                  </Text>

                  {respecQuote.canRespec ? (
                    <View style={styles.chipWrap}>
                      {(Object.keys(respecQuote.refundedByStat) as TalentGoverningStat[])
                        .filter((stat) => respecQuote.refundedByStat[stat] > 0)
                        .map((stat) => (
                          <View key={stat} style={styles.muscleChip}>
                            <Text style={styles.muscleChipText}>
                              {stat}: +{respecQuote.refundedByStat[stat]} pt
                            </Text>
                          </View>
                        ))}
                    </View>
                  ) : null}

                  <TouchableOpacity
                    style={[
                      styles.primaryBtn,
                      (!respecQuote.canRespec ||
                        gold < respecQuote.goldCost ||
                        respecBusy) &&
                        styles.btnDisabled,
                    ]}
                    onPress={() => void handleConfirmRespec()}
                    disabled={
                      !respecQuote.canRespec ||
                      gold < respecQuote.goldCost ||
                      respecBusy
                    }
                    activeOpacity={0.8}
                    testID="trainer-confirm-respec-btn"
                  >
                    <RpgIcon name="refresh" size={14} color={SURFACES.canvas} />
                    <Text style={styles.primaryBtnText}>
                      {respecBusy
                        ? 'Respecing...'
                        : respecQuote.canRespec
                          ? `Respec All Talents (${respecQuote.goldCost}g)`
                          : 'No Talents Allocated'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACING.md,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: SURFACES.scrim,
  },
  sheet: {
    backgroundColor: SURFACES.layer1,
    borderRadius: RADII.xl,
    padding: SPACING.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SURFACES.hairlineStrong,
    maxWidth: 580,
    width: '100%',
    maxHeight: '90%',
    alignSelf: 'center',
    gap: SPACING.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  headerCol: {
    flex: 1,
    gap: 3,
  },
  eyebrow: {
    ...TYPOGRAPHY.eyebrow,
    color: COLORS.strength,
  },
  title: {
    ...TYPOGRAPHY.titleLg,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  metaPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textPrimary,
    ...TYPOGRAPHY.tabular,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: RADII.md,
    backgroundColor: SURFACES.layer2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADII.md,
  },
  feedbackSuccess: {
    backgroundColor: SURFACES.emeraldTint,
  },
  feedbackError: {
    backgroundColor: COLORS.strengthDim,
  },
  feedbackText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  scroll: {
    flexShrink: 1,
  },
  scrollContent: {
    gap: SPACING.sm,
    paddingBottom: SPACING.md,
  },
  card: {
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.lg,
    padding: SPACING.md,
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SURFACES.hairline,
  },
  cardSelected: {
    borderColor: COLORS.gold,
    backgroundColor: SURFACES.layer3,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
    color: COLORS.textSecondary,
  },
  tabularChip: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textPrimary,
    ...TYPOGRAPHY.tabular,
  },
  cardTitle: {
    ...TYPOGRAPHY.titleMd,
    fontSize: 14,
  },
  cardBody: {
    ...TYPOGRAPHY.bodySm,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  muscleChip: {
    backgroundColor: SURFACES.layer3,
    borderRadius: RADII.pill,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  muscleChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  cueRow: {
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SURFACES.hairline,
    gap: 2,
  },
  cueTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cueExName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  actionBadge: {
    borderWidth: 1,
    borderRadius: RADII.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  actionBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  cuePrev: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  cueText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 2,
  },
  enrolledPill: {
    backgroundColor: SURFACES.emeraldTint,
    borderRadius: RADII.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  enrolledPillText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.success,
  },
  pickerChip: {
    backgroundColor: SURFACES.layer3,
    borderRadius: RADII.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SURFACES.hairline,
  },
  pickerChipActive: {
    borderColor: COLORS.gold,
    backgroundColor: COLORS.goldDim,
  },
  deloadChip: {
    borderColor: COLORS.warning,
  },
  pickerChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  previewBox: {
    backgroundColor: SURFACES.layer1,
    borderRadius: RADII.md,
    padding: SPACING.sm,
    gap: 3,
    marginTop: 4,
  },
  previewTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.gold,
  },
  previewMeta: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.shieldCyan,
  },
  previewLine: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  btnRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: 4,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.gold,
    borderRadius: RADII.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  primaryBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: SURFACES.canvas,
  },
  secondaryBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SURFACES.layer3,
    borderRadius: RADII.md,
    paddingVertical: 10,
    marginTop: 4,
  },
  secondaryBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  btnDisabled: {
    opacity: 0.45,
  },
});

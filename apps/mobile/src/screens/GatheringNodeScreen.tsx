import React, { useEffect, useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import {
  calculateGatheringTick,
  calculateProjectedYield,
  calculateRequiredTimeForYield,
  formatDurationSummary,
  formatTickInterval,
  MAX_GATHERING_DURATION_MS,
  MIN_GATHERING_DURATION_MS,
} from '@gymify/game-engine';
import { GatheringNodeItem, useGame } from '../state/GameContext';
import { COLORS, CRIMSON_ONI, RARITY_COLORS } from '../theme';

export type GoalMode = 'TIME' | 'RESOURCE';

const TIME_PRESET_MINUTES = [15, 30, 45, 60, 90, 120] as const;
const RESOURCE_PRESETS = [5, 10, 20, 30, 40, 50] as const;

interface GatheringNodeScreenProps {
  initialNodeSlug?: string;
  onBack?: () => void;
}

function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export const GatheringNodeScreen: React.FC<GatheringNodeScreenProps> = ({
  initialNodeSlug,
  onBack,
}) => {
  const {
    gatheringNodes,
    activeGathering,
    lastGatheringDrop,
    inventory,
    stats,
    overallLevel,
    startGatheringTask,
    completeGatheringNow,
  } = useGame();

  const [selectedNodeSlug, setSelectedNodeSlug] = useState<string>(
    activeGathering?.node.slug ?? initialNodeSlug ?? gatheringNodes[0]?.slug ?? 'iron_crag_mining'
  );

  const selectedNode: GatheringNodeItem = useMemo(() => {
    return (
      gatheringNodes.find((n) => n.slug === selectedNodeSlug) ??
      gatheringNodes[0] ?? {
        slug: 'iron_crag_mining',
        name: 'Iron Crag Mining',
        professionType: 'MINING',
        description: 'Excavate rich ore veins.',
        durationSeconds: 7200,
        requiredStatType: 'STRENGTH',
        requiredStatLevel: 1,
        inputMaterials: [],
        lootTable: [
          {
            itemSlug: 'iron_ore_cluster',
            itemName: 'Rich Iron Ore Cluster',
            rarity: 'COMMON',
            quantity: 2,
            weight: 100,
          },
        ],
      }
    );
  }, [gatheringNodes, selectedNodeSlug]);

  // Mode: TIME vs RESOURCE
  const [goalMode, setGoalMode] = useState<GoalMode>('TIME');
  const [targetMinutes, setTargetMinutes] = useState<number>(45);
  const [targetResourceCount, setTargetResourceCount] = useState<number>(20);
  const [notifyOnCompletion, setNotifyOnCompletion] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Live timer tick for active UI
  const [nowMs, setNowMs] = useState<number>(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Compute character's gathering efficiency for selected node
  const tickCalc = useMemo(() => {
    return calculateGatheringTick(
      {
        strengthLevel: stats.STRENGTH.level,
        enduranceLevel: stats.ENDURANCE.level,
        agilityLevel: stats.AGILITY.level,
      },
      overallLevel,
      selectedNode.requiredStatLevel,
      selectedNode.professionType
    );
  }, [overallLevel, selectedNode, stats]);

  // Dual-input synchronization: Changing one automatically updates the other
  const handleTimeChange = (newMinutes: number) => {
    const clamped = Math.max(1, Math.min(120, Math.round(newMinutes)));
    setTargetMinutes(clamped);
    const durationMs = clamped * 60 * 1000;
    const proj = calculateProjectedYield(tickCalc.tickIntervalMs, tickCalc.yieldPerTick, durationMs);
    setTargetResourceCount(Math.max(1, proj.totalYield));
  };

  const handleResourceChange = (newCount: number) => {
    const clamped = Math.max(1, Math.round(newCount));
    setTargetResourceCount(clamped);
    const requiredMs = calculateRequiredTimeForYield(
      tickCalc.tickIntervalMs,
      tickCalc.yieldPerTick,
      clamped
    );
    const calculatedMinutes = Math.min(120, Math.max(1, Math.ceil(requiredMs / (60 * 1000))));
    setTargetMinutes(calculatedMinutes);
  };

  // Re-calculate projection based on current targetMinutes
  const effectiveDurationMs = targetMinutes * 60 * 1000;
  const projection = useMemo(() => {
    return calculateProjectedYield(
      tickCalc.tickIntervalMs,
      tickCalc.yieldPerTick,
      effectiveDurationMs
    );
  }, [effectiveDurationMs, tickCalc]);

  const primaryDropItem = selectedNode.lootTable[0];
  const primaryItemName = primaryDropItem?.itemName ?? 'Resource';

  // Check if character meets stat requirements
  const requiredStatLevel = selectedNode.requiredStatLevel;
  const currentStatLevel = stats[selectedNode.requiredStatType].level;
  const meetsRequirements = currentStatLevel >= requiredStatLevel;

  // Active state calculations
  const isThisNodeActive = activeGathering?.node.slug === selectedNode.slug;
  const isAnyNodeActive = Boolean(activeGathering);

  // Master countdown & progress
  const totalTaskMs = activeGathering
    ? Math.max(1, activeGathering.completesAtMs - activeGathering.startedAtMs)
    : 1;
  const remainingTaskMs = activeGathering
    ? Math.max(0, activeGathering.completesAtMs - nowMs)
    : 0;
  const masterProgressPct = activeGathering
    ? Math.min(100, Math.max(0, ((totalTaskMs - remainingTaskMs) / totalTaskMs) * 100))
    : 0;

  // Tick ring progress (looping circular progress for the current tick)
  const currentTickIntervalMs = tickCalc.tickIntervalMs;
  const elapsedSinceStart = activeGathering ? Math.max(0, nowMs - activeGathering.startedAtMs) : 0;
  const currentTickRemainderMs = elapsedSinceStart % currentTickIntervalMs;
  const currentTickRemainingSeconds = Math.max(
    0,
    Math.ceil((currentTickIntervalMs - currentTickRemainderMs) / 1000)
  );
  const currentTickRatio = Math.min(1, Math.max(0, currentTickRemainderMs / currentTickIntervalMs));

  // Circular SVG dimensions
  const ringSize = 160;
  const strokeWidth = 10;
  const ringRadius = (ringSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * ringRadius;
  const strokeDashoffset = circumference * (1 - currentTickRatio);

  const handleStartTask = () => {
    setErrorMsg(null);
    const res = startGatheringTask(selectedNode.slug, {
      targetDurationMs: effectiveDurationMs,
      targetYieldAmount: goalMode === 'RESOURCE' ? targetResourceCount : undefined,
      notifyOnCompletion,
    });
    if (!res.ok) {
      setErrorMsg(res.error ?? 'Failed to start gathering task.');
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* Top Crimson Header & Node Switcher */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          {onBack && (
            <Pressable style={styles.backBtn} onPress={onBack}>
              <Text style={styles.backBtnText}>‹ Back</Text>
            </Pressable>
          )}
          <View>
            <Text style={styles.eyebrow}>CRIMSON FORGE • PROFESSION SYSTEM</Text>
            <Text style={styles.title}>{selectedNode.name}</Text>
          </View>
        </View>

        {/* Node selector pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.nodePillsScroll}>
          {gatheringNodes.map((node) => {
            const isSelected = node.slug === selectedNode.slug;
            const isActive = activeGathering?.node.slug === node.slug;
            return (
              <Pressable
                key={node.slug}
                style={[
                  styles.nodePill,
                  isSelected && styles.nodePillSelected,
                  isActive && styles.nodePillActive,
                ]}
                onPress={() => {
                  setSelectedNodeSlug(node.slug);
                  setErrorMsg(null);
                }}
              >
                <Text
                  style={[
                    styles.nodePillText,
                    isSelected && styles.nodePillTextSelected,
                    isActive && styles.nodePillTextActive,
                  ]}
                >
                  {isActive ? '⏳ ' : ''}
                  {node.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Error Notice */}
      {errorMsg && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>⚠️ {errorMsg}</Text>
        </View>
      )}

      {/* ACTIVE STATE UI: Looping Circular Ring + Master Progress */}
      {activeGathering && isThisNodeActive ? (
        <View style={styles.activeCard}>
          <View style={styles.activeBanner}>
            <Text style={styles.activeBadge}>🔥 ACTIVE EXPEDITION IN PROGRESS</Text>
            {activeGathering.notifyOnCompletion && (
              <Text style={styles.notifyBadge}>🔔 Push Cue Armed</Text>
            )}
          </View>

          <Text style={styles.activeNodeSubtitle}>
            {activeGathering.node.professionType} • Yield Target: {activeGathering.targetYieldAmount ?? projection.totalYield}x
          </Text>

          {/* Looping Circular Progress Ring for Current Tick */}
          <View style={styles.ringCenterContainer}>
            <View style={styles.ringWrapper}>
              <Svg width={ringSize} height={ringSize}>
                <Circle
                  cx={ringSize / 2}
                  cy={ringSize / 2}
                  r={ringRadius}
                  stroke={CRIMSON_ONI.charcoalElevated}
                  strokeWidth={strokeWidth}
                  fill="none"
                />
                <Circle
                  cx={ringSize / 2}
                  cy={ringSize / 2}
                  r={ringRadius}
                  stroke={CRIMSON_ONI.agedGoldBright}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  strokeDasharray={`${circumference} ${circumference}`}
                  strokeDashoffset={strokeDashoffset}
                  rotation="-90"
                  origin={`${ringSize / 2}, ${ringSize / 2}`}
                  fill="none"
                />
              </Svg>
              <View style={styles.ringCenterText}>
                <Text style={styles.ringTimeLabel}>NEXT TICK IN</Text>
                <Text style={styles.ringCountdown}>{formatClock(currentTickRemainingSeconds)}</Text>
                <Text style={styles.ringStepCounter}>
                  Tick {activeGathering.accumulatedTicks + 1} of {Math.max(1, Math.floor(activeGathering.targetDurationMs / tickCalc.tickIntervalMs))}
                </Text>
              </View>
            </View>
          </View>

          {/* Master Progress Bar for Target Duration */}
          <View style={styles.masterProgressSection}>
            <View style={styles.masterLabels}>
              <Text style={styles.masterLabelTitle}>Expedition Progress</Text>
              <Text style={styles.masterCountdown}>{formatClock(remainingTaskMs / 1000)} remaining</Text>
            </View>
            <View style={styles.progressBarTrack}>
              <View style={[styles.progressBarFill, { width: `${masterProgressPct}%` }]} />
            </View>
            <View style={styles.accruedRow}>
              <Text style={styles.accruedLabel}>Accrued Yield So Far:</Text>
              <Text style={styles.accruedValue}>
                +{activeGathering.accumulatedTicks * tickCalc.yieldPerTick}x {primaryItemName}
              </Text>
            </View>
          </View>

          {/* Fast-forward dev preview button */}
          <Pressable style={styles.claimNowBtn} onPress={completeGatheringNow}>
            <Text style={styles.claimNowBtnText}>⚡ Fast-Forward &amp; Claim Spoils</Text>
          </Pressable>
        </View>
      ) : (
        /* CONFIGURATION PANEL & PROJECTIONS DISPLAY */
        <View style={styles.configContainer}>
          {/* Projections Display Card */}
          <View style={styles.projectionCard}>
            <Text style={styles.sectionHeader}>HERO EFFICIENCY PROJECTIONS</Text>

            <View style={styles.metricGrid}>
              <View style={styles.metricCell}>
                <Text style={styles.metricLabel}>TICK INTERVAL</Text>
                <Text style={styles.metricPrimaryValue}>{tickCalc.formattedInterval}</Text>
                <Text style={styles.metricSub}>
                  {tickCalc.speedReductionPct > 0
                    ? `⚡ -${tickCalc.speedReductionPct}% via ${tickCalc.speedStat}`
                    : `Base 5m 00s (${tickCalc.speedStat})`}
                </Text>
              </View>

              <View style={styles.metricCell}>
                <Text style={styles.metricLabel}>YIELD PER STEP</Text>
                <Text style={styles.metricPrimaryValue}>
                  {tickCalc.yieldPerTick}x {primaryItemName.split(' ')[0]}
                </Text>
                <Text style={styles.metricSub}>+{tickCalc.xpPerTick} XP per step</Text>
              </View>
            </View>

            {/* Summary Text Callout */}
            <View style={styles.summaryCallout}>
              <Text style={styles.summaryText}>
                🗡️ You will complete <Text style={styles.summaryHighlight}>{projection.totalSteps} steps</Text> over{' '}
                <Text style={styles.summaryHighlight}>{formatDurationSummary(effectiveDurationMs)}</Text>.
              </Text>
              <Text style={styles.summaryYieldSub}>
                Projected Gain: ~{projection.totalYield}x {primaryItemName} • {projection.totalSteps * tickCalc.xpPerTick} XP
              </Text>
            </View>
          </View>

          {/* Dual-Input Configuration Panel */}
          <View style={styles.setupCard}>
            <View style={styles.goalModeToggleRow}>
              <Text style={styles.sectionHeader}>SET EXPEDITION GOAL</Text>
              <View style={styles.toggleSegment}>
                <Pressable
                  style={[styles.segmentBtn, goalMode === 'TIME' && styles.segmentBtnActive]}
                  onPress={() => setGoalMode('TIME')}
                >
                  <Text style={[styles.segmentBtnText, goalMode === 'TIME' && styles.segmentBtnTextActive]}>
                    ⏱️ Time Goal
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.segmentBtn, goalMode === 'RESOURCE' && styles.segmentBtnActive]}
                  onPress={() => setGoalMode('RESOURCE')}
                >
                  <Text style={[styles.segmentBtnText, goalMode === 'RESOURCE' && styles.segmentBtnTextActive]}>
                    📦 Resource Goal
                  </Text>
                </Pressable>
              </View>
            </View>

            {goalMode === 'TIME' ? (
              /* TIME GOAL INPUT */
              <View style={styles.inputGroup}>
                <View style={styles.stepperHeader}>
                  <Text style={styles.inputLabel}>Target Time Duration (Cap: 120m):</Text>
                  <Text style={styles.stepperCurrentVal}>{targetMinutes} mins</Text>
                </View>

                {/* Quick Presets */}
                <View style={styles.presetsRow}>
                  {TIME_PRESET_MINUTES.map((m) => (
                    <Pressable
                      key={m}
                      style={[styles.presetChip, targetMinutes === m && styles.presetChipActive]}
                      onPress={() => handleTimeChange(m)}
                    >
                      <Text style={[styles.presetChipText, targetMinutes === m && styles.presetChipTextActive]}>
                        {m}m
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {/* Fine Adjustment Controls */}
                <View style={styles.adjustmentRow}>
                  <Pressable style={styles.adjustBtn} onPress={() => handleTimeChange(targetMinutes - 15)}>
                    <Text style={styles.adjustBtnText}>−15m</Text>
                  </Pressable>
                  <Pressable style={styles.adjustBtn} onPress={() => handleTimeChange(targetMinutes - 5)}>
                    <Text style={styles.adjustBtnText}>−5m</Text>
                  </Pressable>
                  <Pressable style={styles.adjustBtn} onPress={() => handleTimeChange(targetMinutes + 5)}>
                    <Text style={styles.adjustBtnText}>+5m</Text>
                  </Pressable>
                  <Pressable style={styles.adjustBtn} onPress={() => handleTimeChange(targetMinutes + 15)}>
                    <Text style={styles.adjustBtnText}>+15m</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              /* RESOURCE GOAL INPUT */
              <View style={styles.inputGroup}>
                <View style={styles.stepperHeader}>
                  <Text style={styles.inputLabel}>Desired Resource Amount:</Text>
                  <Text style={styles.stepperCurrentVal}>{targetResourceCount} items</Text>
                </View>

                {/* Quick Presets */}
                <View style={styles.presetsRow}>
                  {RESOURCE_PRESETS.map((cnt) => (
                    <Pressable
                      key={cnt}
                      style={[styles.presetChip, targetResourceCount === cnt && styles.presetChipActive]}
                      onPress={() => handleResourceChange(cnt)}
                    >
                      <Text style={[styles.presetChipText, targetResourceCount === cnt && styles.presetChipTextActive]}>
                        {cnt}x
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {/* Fine Adjustment Controls */}
                <View style={styles.adjustmentRow}>
                  <Pressable style={styles.adjustBtn} onPress={() => handleResourceChange(targetResourceCount - 5)}>
                    <Text style={styles.adjustBtnText}>−5</Text>
                  </Pressable>
                  <Pressable style={styles.adjustBtn} onPress={() => handleResourceChange(targetResourceCount - 1)}>
                    <Text style={styles.adjustBtnText}>−1</Text>
                  </Pressable>
                  <Pressable style={styles.adjustBtn} onPress={() => handleResourceChange(targetResourceCount + 1)}>
                    <Text style={styles.adjustBtnText}>+1</Text>
                  </Pressable>
                  <Pressable style={styles.adjustBtn} onPress={() => handleResourceChange(targetResourceCount + 5)}>
                    <Text style={styles.adjustBtnText}>+5</Text>
                  </Pressable>
                </View>

                <Text style={styles.syncHint}>
                  Auto-calculated duration: <Text style={styles.syncHintBold}>{targetMinutes} minutes</Text> (capped at 120m)
                </Text>
              </View>
            )}

            {/* Push Notification Toggle Checkbox */}
            <View style={styles.notificationRow}>
              <View style={styles.notificationTextCol}>
                <Text style={styles.notificationLabel}>Notify when target is reached</Text>
                <Text style={styles.notificationSub}>
                  Schedules a local push notification the moment your timer expires.
                </Text>
              </View>
              <Switch
                value={notifyOnCompletion}
                onValueChange={setNotifyOnCompletion}
                trackColor={{ false: CRIMSON_ONI.charcoalElevated, true: CRIMSON_ONI.crimsonGlow }}
                thumbColor={notifyOnCompletion ? CRIMSON_ONI.agedGoldBright : CRIMSON_ONI.ashGray}
              />
            </View>

            {/* Requirement Verification */}
            {!meetsRequirements && (
              <View style={styles.reqWarning}>
                <Text style={styles.reqWarningText}>
                  🔒 Requires {selectedNode.requiredStatType} Lv.{requiredStatLevel} (Current: {currentStatLevel})
                </Text>
              </View>
            )}

            {/* Start Button */}
            <Pressable
              style={[
                styles.startExpeditionBtn,
                (!meetsRequirements || isAnyNodeActive) && styles.startExpeditionBtnDisabled,
              ]}
              disabled={!meetsRequirements || isAnyNodeActive}
              onPress={handleStartTask}
            >
              <Text style={styles.startExpeditionBtnText}>
                {isAnyNodeActive
                  ? 'Character Busy on Active Task'
                  : `⚔️ Begin ${targetMinutes}m Gathering Expedition`}
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Last Gathering Loot Receipt */}
      {lastGatheringDrop && (
        <View style={styles.recentSpoilsCard}>
          <Text style={styles.recentSpoilsTitle}>🏆 RECENT EXPEDITION SPOILS</Text>
          {lastGatheringDrop.map((d) => (
            <Text
              key={d.itemSlug}
              style={[styles.recentSpoilsItem, { color: RARITY_COLORS[d.rarity] ?? CRIMSON_ONI.agedGoldBright }]}
            >
              +{d.quantity}x {d.itemName} [{d.rarity}]
            </Text>
          ))}
        </View>
      )}

      {/* Inventory Satchel Quick View */}
      <View style={styles.satchelCard}>
        <Text style={styles.sectionHeader}>RESOURCES SATCHEL</Text>
        {inventory.filter((i) => i.itemType === 'MATERIAL' || i.itemType === 'CONSUMABLE').length === 0 ? (
          <Text style={styles.emptySatchelText}>No gathering materials collected yet.</Text>
        ) : (
          inventory
            .filter((i) => i.itemType === 'MATERIAL' || i.itemType === 'CONSUMABLE')
            .map((item) => (
              <View key={item.slug} style={styles.satchelRow}>
                <Text style={[styles.satchelName, { color: RARITY_COLORS[item.rarity] ?? CRIMSON_ONI.ghostWhite }]}>
                  {item.name}
                </Text>
                <Text style={styles.satchelQty}>x{item.quantity}</Text>
              </View>
            ))
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: CRIMSON_ONI.charcoalDeep,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 16,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  backBtn: {
    marginRight: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: CRIMSON_ONI.charcoalCard,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.border,
  },
  backBtnText: {
    color: CRIMSON_ONI.ghostWhite,
    fontSize: 13,
    fontWeight: '700',
  },
  eyebrow: {
    color: CRIMSON_ONI.agedGold,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  title: {
    color: CRIMSON_ONI.ghostWhite,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  nodePillsScroll: {
    flexDirection: 'row',
    marginTop: 4,
  },
  nodePill: {
    backgroundColor: CRIMSON_ONI.charcoalCard,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
  },
  nodePillSelected: {
    borderColor: CRIMSON_ONI.agedGold,
    backgroundColor: CRIMSON_ONI.agedGoldDim,
  },
  nodePillActive: {
    borderColor: CRIMSON_ONI.crimsonGlow,
    backgroundColor: CRIMSON_ONI.crimsonDim,
  },
  nodePillText: {
    color: CRIMSON_ONI.ashGray,
    fontSize: 12,
    fontWeight: '700',
  },
  nodePillTextSelected: {
    color: CRIMSON_ONI.agedGoldBright,
  },
  nodePillTextActive: {
    color: '#FF8A80',
  },
  errorBox: {
    backgroundColor: CRIMSON_ONI.crimsonDim,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.crimson,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  errorText: {
    color: '#FFB4AB',
    fontSize: 12,
    fontWeight: '700',
  },
  activeCard: {
    backgroundColor: CRIMSON_ONI.charcoalCard,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: CRIMSON_ONI.crimsonGlow,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  activeBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 6,
  },
  activeBadge: {
    color: '#FF8A80',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  notifyBadge: {
    color: CRIMSON_ONI.agedGoldBright,
    fontSize: 11,
    fontWeight: '800',
  },
  activeNodeSubtitle: {
    color: CRIMSON_ONI.ashGray,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 16,
  },
  ringCenterContainer: {
    marginVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenterText: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringTimeLabel: {
    color: CRIMSON_ONI.ashGray,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  ringCountdown: {
    color: CRIMSON_ONI.ghostWhite,
    fontSize: 26,
    fontWeight: '900',
    marginVertical: 2,
  },
  ringStepCounter: {
    color: CRIMSON_ONI.agedGold,
    fontSize: 11,
    fontWeight: '800',
  },
  masterProgressSection: {
    width: '100%',
    marginTop: 14,
  },
  masterLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  masterLabelTitle: {
    color: CRIMSON_ONI.ashGray,
    fontSize: 11,
    fontWeight: '700',
  },
  masterCountdown: {
    color: CRIMSON_ONI.agedGoldBright,
    fontSize: 12,
    fontWeight: '800',
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: CRIMSON_ONI.charcoalDeep,
    borderRadius: 999,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: CRIMSON_ONI.border,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: CRIMSON_ONI.crimsonGlow,
  },
  accruedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: CRIMSON_ONI.border,
  },
  accruedLabel: {
    color: CRIMSON_ONI.ashGray,
    fontSize: 12,
    fontWeight: '600',
  },
  accruedValue: {
    color: CRIMSON_ONI.agedGoldBright,
    fontSize: 13,
    fontWeight: '800',
  },
  claimNowBtn: {
    marginTop: 14,
    backgroundColor: CRIMSON_ONI.agedGoldDim,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.agedGold,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    width: '100%',
    alignItems: 'center',
  },
  claimNowBtnText: {
    color: CRIMSON_ONI.agedGoldBright,
    fontSize: 12,
    fontWeight: '800',
  },
  configContainer: {
    gap: 14,
  },
  projectionCard: {
    backgroundColor: CRIMSON_ONI.charcoalCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.borderGold,
    padding: 14,
  },
  sectionHeader: {
    color: CRIMSON_ONI.agedGold,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 10,
  },
  metricGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  metricCell: {
    flex: 1,
    backgroundColor: CRIMSON_ONI.charcoalElevated,
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.border,
  },
  metricLabel: {
    color: CRIMSON_ONI.ashGray,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  metricPrimaryValue: {
    color: CRIMSON_ONI.ghostWhite,
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 2,
  },
  metricSub: {
    color: CRIMSON_ONI.agedGoldBright,
    fontSize: 10,
    fontWeight: '700',
  },
  summaryCallout: {
    backgroundColor: CRIMSON_ONI.crimsonDim,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.borderCrimson,
    padding: 10,
  },
  summaryText: {
    color: CRIMSON_ONI.ghostWhite,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  summaryHighlight: {
    color: CRIMSON_ONI.agedGoldBright,
    fontWeight: '900',
  },
  summaryYieldSub: {
    color: '#FFB4AB',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
  },
  setupCard: {
    backgroundColor: CRIMSON_ONI.charcoalCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.border,
    padding: 14,
  },
  goalModeToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  toggleSegment: {
    flexDirection: 'row',
    backgroundColor: CRIMSON_ONI.charcoalDeep,
    borderRadius: 8,
    padding: 2,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.border,
  },
  segmentBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  segmentBtnActive: {
    backgroundColor: CRIMSON_ONI.crimson,
  },
  segmentBtnText: {
    color: CRIMSON_ONI.ashGray,
    fontSize: 11,
    fontWeight: '700',
  },
  segmentBtnTextActive: {
    color: CRIMSON_ONI.ghostWhite,
    fontWeight: '800',
  },
  inputGroup: {
    marginBottom: 14,
  },
  stepperHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  inputLabel: {
    color: CRIMSON_ONI.ashGray,
    fontSize: 12,
    fontWeight: '700',
  },
  stepperCurrentVal: {
    color: CRIMSON_ONI.agedGoldBright,
    fontSize: 16,
    fontWeight: '900',
  },
  presetsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  presetChip: {
    flex: 1,
    backgroundColor: CRIMSON_ONI.charcoalElevated,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.border,
    paddingVertical: 6,
    marginHorizontal: 2,
    alignItems: 'center',
  },
  presetChipActive: {
    borderColor: CRIMSON_ONI.agedGold,
    backgroundColor: CRIMSON_ONI.agedGoldDim,
  },
  presetChipText: {
    color: CRIMSON_ONI.ashGray,
    fontSize: 11,
    fontWeight: '700',
  },
  presetChipTextActive: {
    color: CRIMSON_ONI.agedGoldBright,
    fontWeight: '900',
  },
  adjustmentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  adjustBtn: {
    flex: 1,
    backgroundColor: CRIMSON_ONI.charcoalDeep,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.border,
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
  },
  adjustBtnText: {
    color: CRIMSON_ONI.ghostWhite,
    fontSize: 12,
    fontWeight: '800',
  },
  syncHint: {
    color: CRIMSON_ONI.ashMuted,
    fontSize: 11,
    marginTop: 8,
  },
  syncHintBold: {
    color: CRIMSON_ONI.agedGold,
    fontWeight: '800',
  },
  notificationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: CRIMSON_ONI.charcoalElevated,
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.border,
    marginBottom: 14,
  },
  notificationTextCol: {
    flex: 1,
    marginRight: 10,
  },
  notificationLabel: {
    color: CRIMSON_ONI.ghostWhite,
    fontSize: 12,
    fontWeight: '800',
  },
  notificationSub: {
    color: CRIMSON_ONI.ashMuted,
    fontSize: 10,
    marginTop: 2,
  },
  reqWarning: {
    backgroundColor: CRIMSON_ONI.crimsonDim,
    borderRadius: 6,
    padding: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.crimson,
  },
  reqWarningText: {
    color: '#FFB4AB',
    fontSize: 11,
    fontWeight: '700',
  },
  startExpeditionBtn: {
    backgroundColor: CRIMSON_ONI.crimson,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.crimsonGlow,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  startExpeditionBtnDisabled: {
    backgroundColor: CRIMSON_ONI.charcoalElevated,
    borderColor: CRIMSON_ONI.border,
    opacity: 0.5,
  },
  startExpeditionBtnText: {
    color: CRIMSON_ONI.ghostWhite,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  recentSpoilsCard: {
    backgroundColor: CRIMSON_ONI.charcoalCard,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.agedGold,
    padding: 12,
    marginBottom: 14,
  },
  recentSpoilsTitle: {
    color: CRIMSON_ONI.agedGold,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  recentSpoilsItem: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2,
  },
  satchelCard: {
    backgroundColor: CRIMSON_ONI.charcoalCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.border,
    padding: 14,
  },
  emptySatchelText: {
    color: CRIMSON_ONI.ashMuted,
    fontSize: 12,
    fontStyle: 'italic',
  },
  satchelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: CRIMSON_ONI.border,
  },
  satchelName: {
    fontSize: 12,
    fontWeight: '700',
  },
  satchelQty: {
    color: CRIMSON_ONI.ghostWhite,
    fontSize: 12,
    fontWeight: '900',
  },
});

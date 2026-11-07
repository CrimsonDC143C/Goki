import React, { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Path, SvgXml } from 'react-native-svg';
import {
  DEFAULT_TALENT_TREES,
  HolisticStatType,
  StatType,
  TalentNodeDefinition,
  TalentTreeDefinition,
  getPointsSpentInTree,
  isCharacterProgressionUnlocked,
  validateTalentAllocation,
  xpRequiredForStatLevel,
} from '@gymify/game-engine';
import { useGame } from '../state/GameContext';
import {
  HUD_SVGS,
  STAT_GLYPH_SVGS,
} from '../assets/v0Vault';
import { COLORS, CRIMSON_ONI } from '../theme';

export interface TalentBuilderScreenProps {
  initialStat?: HolisticStatType | StatType;
  onOpenProfileGear?: () => void;
}

const HOLISTIC_STAT_LIST: readonly HolisticStatType[] = [
  'STRENGTH',
  'ENDURANCE',
  'AGILITY',
  'DEXTERITY',
  'CONSTITUTION',
  'WISDOM',
  'SPIRIT',
];

const STAT_SHORT_CODES: Record<HolisticStatType, keyof typeof STAT_GLYPH_SVGS> = {
  STRENGTH: 'STR',
  ENDURANCE: 'END',
  AGILITY: 'AGI',
  DEXTERITY: 'DEX',
  CONSTITUTION: 'CON',
  WISDOM: 'WIS',
  SPIRIT: 'SPR',
};

const STAT_COLORS: Record<HolisticStatType, string> = {
  STRENGTH: '#EF5350',
  ENDURANCE: '#26A69A',
  AGILITY: '#42A5F5',
  DEXTERITY: '#26C6DA',
  CONSTITUTION: '#66BB6A',
  WISDOM: '#AB47BC',
  SPIRIT: '#EC407A',
};

function getNodeCoordinates(
  node: TalentNodeDefinition,
  allNodes: readonly TalentNodeDefinition[]
): { x: number; y: number } {
  const nodesAtTier = allNodes.filter((n) => n.tier === node.tier);
  const indexAtTier = nodesAtTier.findIndex((n) => n.id === node.id);
  const count = nodesAtTier.length;

  let y = 474;
  if (node.tier === 1) {
    y = 474;
  } else if (node.tier === 2) {
    y = 370;
  } else if (node.tier === 3) {
    y = 266;
  } else if (node.tier === 4) {
    y = 162;
  } else if (node.tier === 5) {
    y = 58;
  }

  let x = 180;
  if (count === 1) {
    x = 180;
  } else if (count === 2) {
    x = indexAtTier === 0 ? 104 : 256;
  } else if (count === 3) {
    x = indexAtTier === 0 ? 64 : indexAtTier === 1 ? 180 : 296;
  } else {
    const margin = 50;
    const span = 360 - 2 * margin;
    x = margin + (indexAtTier / Math.max(1, count - 1)) * span;
  }

  return { x, y };
}

function getNodeIcon(node: TalentNodeDefinition): string {
  if (node.nodeType === 'KEYSTONE') return '👑';
  if (node.nodeType === 'ACTIVE_SKILL') return '⚡';
  if (node.passivePerRank) {
    if (node.passivePerRank.meleePowerPct) return '⚔️';
    if (node.passivePerRank.armorPct || node.passivePerRank.damageMitigationPct)
      return '🛡️';
    if (node.passivePerRank.attackSpeedPct) return '⚡';
    if (node.passivePerRank.dodgeRatingBonus) return '💨';
    if (node.passivePerRank.critChanceBonus) return '🎯';
    if (node.passivePerRank.maxHpPct || node.passivePerRank.maxStaminaPct) return '❤️';
    if (node.passivePerRank.healingPowerPct) return '✨';
  }
  return '🛡️';
}

export const TalentBuilderScreen: React.FC<TalentBuilderScreenProps> = ({
  initialStat,
  onOpenProfileGear,
}) => {
  const {
    stats,
    unlockedTalentRanks,
    aggregatedTalents,
    workoutMachine,
    unlockTalentNode,
  } = useGame();

  const progressionUnlocked = isCharacterProgressionUnlocked(workoutMachine.phase);

  const [selectedStat, setSelectedStat] = useState<HolisticStatType>(
    (initialStat as HolisticStatType) ?? 'STRENGTH'
  );
  const [activeTreeSlug, setActiveTreeSlug] = useState<string>('juggernaut');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [showCombatSummary, setShowCombatSummary] = useState<boolean>(false);

  // Sync initialStat changes
  useEffect(() => {
    if (initialStat && HOLISTIC_STAT_LIST.includes(initialStat as HolisticStatType)) {
      setSelectedStat(initialStat as HolisticStatType);
    }
  }, [initialStat]);

  // Trees for currently selected stat
  const visibleTrees = useMemo(() => {
    return DEFAULT_TALENT_TREES.filter((t) => t.governingStat === selectedStat);
  }, [selectedStat]);

  // Automatically update activeTreeSlug when selectedStat changes
  useEffect(() => {
    if (visibleTrees.length > 0 && visibleTrees[0]) {
      const match = visibleTrees.find((t) => t.slug === activeTreeSlug);
      if (!match) {
        setActiveTreeSlug(visibleTrees[0].slug);
        setSelectedNodeId(visibleTrees[0].nodes[0]?.id ?? null);
      }
    }
  }, [visibleTrees, activeTreeSlug]);

  const activeTree: TalentTreeDefinition = useMemo(() => {
    const fallback = DEFAULT_TALENT_TREES[0] as TalentTreeDefinition;
    return (
      visibleTrees.find((t) => t.slug === activeTreeSlug) ??
      visibleTrees[0] ??
      fallback
    );
  }, [visibleTrees, activeTreeSlug]);

  // Ensure a node is selected in activeTree
  const activeSelectedNode: TalentNodeDefinition | null = useMemo(() => {
    if (!activeTree || activeTree.nodes.length === 0) return null;
    return (
      activeTree.nodes.find((n) => n.id === selectedNodeId) ??
      activeTree.nodes[0] ??
      null
    );
  }, [activeTree, selectedNodeId]);

  const statColor = (s: HolisticStatType | StatType) =>
    STAT_COLORS[s as HolisticStatType] ?? COLORS.textPrimary;

  const currentStatObj = stats[selectedStat];
  const nextReq = xpRequiredForStatLevel(currentStatObj.level);
  const statPct = Math.min(100, Math.round((currentStatObj.xp / nextReq) * 100));

  const pointsAvailableState = {
    availablePoints: {
      STRENGTH: stats.STRENGTH.pointsAvailable,
      ENDURANCE: stats.ENDURANCE.pointsAvailable,
      AGILITY: stats.AGILITY.pointsAvailable,
      DEXTERITY: stats.DEXTERITY.pointsAvailable,
      CONSTITUTION: stats.CONSTITUTION.pointsAvailable,
      WISDOM: stats.WISDOM.pointsAvailable,
      SPIRIT: stats.SPIRIT.pointsAvailable,
    },
    unlockedNodeRanks: unlockedTalentRanks,
  };

  const handleSpendPoint = (nodeId: string) => {
    if (!progressionUnlocked) {
      setErrorBanner(
        'Finish your active workout session to allocate Talent Points during LootReview.'
      );
      return;
    }
    const res = unlockTalentNode(nodeId);
    if (!res.ok) {
      setErrorBanner(res.error ?? 'Failed to unlock talent node.');
    } else {
      setErrorBanner(null);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      {/* 1. Sticky 7-Stat Horizontal Icon Selector Bar */}
      <View style={styles.stickyStatBarContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.statTabsScroll}
        >
          {HOLISTIC_STAT_LIST.map((st) => {
            const s = stats[st];
            const shortCode = STAT_SHORT_CODES[st];
            const isSelected = selectedStat === st;
            const col = STAT_COLORS[st];
            const hasPoints = s.pointsAvailable > 0;

            return (
              <Pressable
                key={st}
                style={[
                  styles.statTab,
                  isSelected && [styles.statTabActive, { borderColor: col }],
                ]}
                onPress={() => {
                  setSelectedStat(st);
                  setErrorBanner(null);
                }}
                testID={`talent-stat-tab-${st}`}
              >
                <View style={styles.statTabGlyphWrap}>
                  <SvgXml xml={STAT_GLYPH_SVGS[shortCode]} width={26} height={26} />
                  {hasPoints && (
                    <View style={styles.statTabUnspentBadge}>
                      <Text style={styles.statTabUnspentText}>{s.pointsAvailable}</Text>
                    </View>
                  )}
                </View>
                <Text
                  style={[
                    styles.statTabLabel,
                    isSelected && { color: col, fontWeight: '900' },
                  ]}
                >
                  {shortCode}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Compact Single-Row Summary for Selected Stat */}
      <View style={styles.selectedStatSummaryCard}>
        <View style={styles.selectedStatSummaryRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.selectedStatSummaryTitle} numberOfLines={1}>
              <Text style={{ color: statColor(selectedStat), fontWeight: '900' }}>
                {selectedStat}
              </Text>{' '}
              Lv.{currentStatObj.level} — {currentStatObj.xp}/{nextReq} XP —{' '}
              <Text style={{ color: COLORS.gold, fontWeight: '900' }}>
                {currentStatObj.pointsAvailable} Talent Pt
                {currentStatObj.pointsAvailable === 1 ? '' : 's'} Available
              </Text>
            </Text>
            <View style={styles.selectedStatXpTrack}>
              <View
                style={[
                  styles.selectedStatXpFill,
                  { width: `${statPct}%`, backgroundColor: statColor(selectedStat) },
                ]}
              />
            </View>
          </View>

          <Pressable
            style={styles.resetTalentsBtn}
            onPress={() => setShowCombatSummary((prev) => !prev)}
            testID="talent-toggle-bonuses-btn"
          >
            <Text style={styles.resetTalentsBtnText}>
              📊 Bonuses {showCombatSummary ? '▴' : '▾'}
            </Text>
          </Pressable>

          <Pressable
            style={styles.resetTalentsBtn}
            onPress={() => {
              setErrorBanner(
                'Talent Respec: Visit the Tavern Keeper in a major settlement to respec talent points.'
              );
            }}
            testID="talent-reset-btn"
          >
            <Text style={styles.resetTalentsBtnText}>🔄 Reset</Text>
          </Pressable>
        </View>

        {showCombatSummary && (
          <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#273248' }}>
            <Text style={styles.modLine}>
              • Melee: +{Math.round(aggregatedTalents.meleePowerPct * 100)}% | Armor: +
              {Math.round(aggregatedTalents.armorPct * 100)}% | Mitigation: +
              {Math.round(aggregatedTalents.damageMitigationPct * 100)}%
            </Text>
            <Text style={styles.modLine}>
              • Speed: +{Math.round(aggregatedTalents.attackSpeedPct * 100)}% | Dodge: +
              {Math.round(aggregatedTalents.dodgeRatingBonus * 100)}% | Crit: +
              {Math.round(aggregatedTalents.critChanceBonus * 100)}%
            </Text>
            <Text style={styles.modLine}>
              • Skills:{' '}
              {aggregatedTalents.unlockedSkills.length > 0
                ? aggregatedTalents.unlockedSkills.map((s) => s.name).join(', ')
                : 'None yet'}
            </Text>
          </View>
        )}
      </View>

      {/* Focus Protocol or Error Banner */}
      {!progressionUnlocked && (
        <View style={styles.focusActiveBox}>
          <Text style={styles.focusActiveText}>
            🔒 Intra-Workout Focus Active ({workoutMachine.phase}): Stat allocation &amp;
            upgrades unlock automatically during post-workout LootReview!
          </Text>
        </View>
      )}

      {errorBanner && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{errorBanner}</Text>
          <Pressable onPress={() => setErrorBanner(null)}>
            <Text style={styles.errorDismiss}>✕</Text>
          </Pressable>
        </View>
      )}

      {/* 2. Archetype Sub-Tabs & Active Tree Header */}
      <View style={styles.treeSectionHeader}>
        <View style={styles.archetypeTabsRow}>
          {visibleTrees.map((tree) => {
            const isActive = activeTree.slug === tree.slug;
            const spent = getPointsSpentInTree(
              tree.slug,
              unlockedTalentRanks,
              DEFAULT_TALENT_TREES
            );
            return (
              <Pressable
                key={tree.slug}
                style={[
                  styles.archetypeTab,
                  isActive && [
                    styles.archetypeTabActive,
                    { borderColor: statColor(selectedStat) },
                  ],
                ]}
                onPress={() => {
                  setActiveTreeSlug(tree.slug);
                  setSelectedNodeId(tree.nodes[0]?.id ?? null);
                  setErrorBanner(null);
                }}
                testID={`archetype-tab-${tree.slug}`}
              >
                <Text
                  style={[
                    styles.archetypeTabText,
                    isActive && styles.archetypeTabTextActive,
                  ]}
                >
                  {tree.name}
                </Text>
                <View
                  style={[
                    styles.archetypeSpentBadge,
                    isActive && styles.archetypeSpentBadgeActive,
                  ]}
                >
                  <Text style={styles.archetypeSpentBadgeText}>{spent}/55 pts</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.archetypeInfoBox}>
          <Text style={[styles.archetypeRoleText, { color: statColor(selectedStat) }]}>
            {activeTree.archetypeRole}
          </Text>
          <Text style={styles.archetypeDescText}>{activeTree.description}</Text>
        </View>
      </View>

      {/* 3. Interactive RPG Talent Tree Node Graph (Constellation Canvas + SVG Lines) */}
      <View style={styles.canvasContainer}>
        {/* Subtle Constellation Backdrop */}
        <SvgXml
          xml={HUD_SVGS.talentTreeConstellation}
          width="100%"
          height="100%"
          style={StyleSheet.absoluteFill}
        />

        {/* SVG Dependency Lines */}
        <Svg
          width="100%"
          height={540}
          viewBox="0 0 360 540"
          preserveAspectRatio="none"
          style={styles.svgCanvas}
          pointerEvents="none"
        >
          {activeTree.nodes.map((node) => {
            const childRank = unlockedTalentRanks[node.id] ?? 0;
            const cPos = getNodeCoordinates(node, activeTree.nodes);

            let primaryEdge: React.ReactNode = null;
            if (node.prerequisiteNodeId) {
              const parent = activeTree.nodes.find((n) => n.id === node.prerequisiteNodeId);
              if (parent) {
                const pPos = getNodeCoordinates(parent, activeTree.nodes);
                const prereqRank = unlockedTalentRanks[node.prerequisiteNodeId] ?? 0;
                const validation = validateTalentAllocation(
                  pointsAvailableState,
                  node.id,
                  DEFAULT_TALENT_TREES
                );

                let strokeColor = '#273248';
                let strokeWidth = 1.5;
                let isDashed = false;

                if (prereqRank > 0 && childRank > 0) {
                  strokeColor = '#DFB660';
                  strokeWidth = 3;
                } else if (validation.valid || prereqRank > 0) {
                  strokeColor = '#10B981';
                  strokeWidth = 2.5;
                  isDashed = true;
                }

                primaryEdge = (
                  <Path
                    key={`line-${parent.id}-${node.id}`}
                    d={`M ${pPos.x} ${pPos.y - 26} C ${pPos.x} ${(pPos.y + cPos.y) / 2}, ${
                      cPos.x
                    } ${(pPos.y + cPos.y) / 2}, ${cPos.x} ${cPos.y + 26}`}
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    strokeDasharray={isDashed ? '6 4' : undefined}
                    fill="none"
                  />
                );
              }
            }

            // Converging edges for apex Tier 5 keystone from Tier 4 siblings
            const extraEdges: React.ReactNode[] = [];
            if (node.tier === 5) {
              const tier4Nodes = activeTree.nodes.filter(
                (n) => n.tier === 4 && n.id !== node.prerequisiteNodeId
              );
              for (const t4 of tier4Nodes) {
                const sPos = getNodeCoordinates(t4, activeTree.nodes);
                const sRank = unlockedTalentRanks[t4.id] ?? 0;
                let sStrokeColor = '#273248';
                let sStrokeWidth = 1.5;
                let sIsDashed = false;

                if (sRank > 0 && childRank > 0) {
                  sStrokeColor = '#DFB660';
                  sStrokeWidth = 3;
                } else if (sRank > 0) {
                  sStrokeColor = '#10B981';
                  sStrokeWidth = 2.5;
                  sIsDashed = true;
                }

                extraEdges.push(
                  <Path
                    key={`line-${t4.id}-${node.id}`}
                    d={`M ${sPos.x} ${sPos.y - 26} C ${sPos.x} ${(sPos.y + cPos.y) / 2}, ${
                      cPos.x
                    } ${(sPos.y + cPos.y) / 2}, ${cPos.x} ${cPos.y + 26}`}
                    stroke={sStrokeColor}
                    strokeWidth={sStrokeWidth}
                    strokeDasharray={sIsDashed ? '6 4' : undefined}
                    fill="none"
                  />
                );
              }
            }

            return (
              <React.Fragment key={`edges-${node.id}`}>
                {primaryEdge}
                {extraEdges}
              </React.Fragment>
            );
          })}
        </Svg>

        {/* Subtle Left-Edge Tier Watermarks */}
        <View style={styles.tierWatermarksColumn} pointerEvents="none">
          {[
            { tier: 'T5', pts: '40p', y: 58 },
            { tier: 'T4', pts: '30p', y: 162 },
            { tier: 'T3', pts: '15p', y: 266 },
            { tier: 'T2', pts: '5p', y: 370 },
            { tier: 'T1', pts: '0p', y: 474 },
          ].map((tw) => (
            <View key={tw.tier} style={[styles.tierWatermarkPill, { top: tw.y - 12 }]}>
              <Text style={styles.tierWatermarkText}>{tw.tier}</Text>
              <Text style={styles.tierWatermarkSubtext}>{tw.pts}</Text>
            </View>
          ))}
        </View>

        {/* Interactive Talent Nodes */}
        {activeTree.nodes.map((node) => {
          const pos = getNodeCoordinates(node, activeTree.nodes);
          const currentRank = unlockedTalentRanks[node.id] ?? 0;
          const isMaxed = currentRank >= node.maxRank;
          const isSelected = activeSelectedNode?.id === node.id;

          const validation = validateTalentAllocation(
            pointsAvailableState,
            node.id,
            DEFAULT_TALENT_TREES
          );

          const isAvailable = validation.valid && progressionUnlocked && !isMaxed;
          const isKeystone = node.nodeType === 'KEYSTONE';

          let borderCol = '#2F3646';
          if (isSelected) {
            borderCol = '#FFFFFF';
          } else if (isMaxed || currentRank > 0) {
            borderCol = '#DFB660';
          } else if (isAvailable) {
            borderCol = '#10B981';
          }

          return (
            <View
              key={node.id}
              style={[
                styles.nodePositioner,
                {
                  left: `${(pos.x / 360) * 100}%`,
                  top: pos.y,
                },
              ]}
            >
              <View style={styles.nodeIconWrapper}>
                <Pressable
                  style={[
                    styles.nodeShape,
                    isKeystone ? styles.nodeKeystone : styles.nodeCircle,
                    { borderColor: borderCol },
                    isSelected && styles.nodeSelectedRing,
                    (isMaxed || currentRank > 0) && styles.nodeInvestedBg,
                    isAvailable && styles.nodeAvailableBg,
                  ]}
                  onPress={() => {
                    setSelectedNodeId(node.id);
                    setErrorBanner(null);
                  }}
                  testID={`talent-node-${node.id}`}
                >
                  <Text style={styles.nodeGlyphIcon}>{getNodeIcon(node)}</Text>
                </Pressable>

                <View
                  style={[
                    styles.nodeRankBadge,
                    { borderColor: borderCol },
                    (isMaxed || currentRank > 0) && styles.nodeRankBadgeInvested,
                  ]}
                  pointerEvents="none"
                >
                  <Text style={styles.nodeRankBadgeText}>
                    {currentRank}/{node.maxRank}
                  </Text>
                </View>
              </View>

              <Text style={styles.nodeTitleLabel} numberOfLines={2}>
                {node.name}
              </Text>
            </View>
          );
        })}
      </View>

      {/* 4. Bottom Node Inspection Card */}
      {activeSelectedNode && (
        <View style={styles.inspectorCard}>
          {(() => {
            const currentRank = unlockedTalentRanks[activeSelectedNode.id] ?? 0;
            const isMaxed = currentRank >= activeSelectedNode.maxRank;
            const validation = validateTalentAllocation(
              pointsAvailableState,
              activeSelectedNode.id,
              DEFAULT_TALENT_TREES
            );

            return (
              <>
                <View style={styles.inspectorHeaderRow}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.inspectorTitleCluster}>
                      <Text style={styles.inspectorNodeIcon}>
                        {getNodeIcon(activeSelectedNode)}
                      </Text>
                      <Text style={styles.inspectorNodeName}>
                        {activeSelectedNode.name}
                      </Text>
                    </View>
                    <View style={styles.inspectorTagRow}>
                      <View style={styles.inspectorTagPill}>
                        <Text style={styles.inspectorTagPillText}>
                          TIER {activeSelectedNode.tier} •{' '}
                          {activeSelectedNode.nodeType.replace('_', ' ')}
                        </Text>
                      </View>
                      <View style={styles.inspectorRankPill}>
                        <Text style={styles.inspectorRankPillText}>
                          Rank {currentRank}/{activeSelectedNode.maxRank}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>

                {/* Lore / Mechanical Description */}
                <Text style={styles.inspectorDescription}>
                  {activeSelectedNode.description}
                </Text>

                {/* Active Skill Telemetry */}
                {activeSelectedNode.activeSkill && (
                  <View style={styles.inspectorSkillBox}>
                    <Text style={styles.inspectorSkillHeader}>
                      ⚡ Active Combat Skill Telemetry:
                    </Text>
                    <Text style={styles.inspectorSkillStats}>
                      Cooldown: {activeSelectedNode.activeSkill.cooldownSeconds}s • Stamina
                      Cost: {activeSelectedNode.activeSkill.staminaCost} • Target:{' '}
                      {activeSelectedNode.activeSkill.targetType}
                    </Text>
                    {activeSelectedNode.activeSkill.damageMultiplier > 0 && (
                      <Text style={styles.inspectorSkillStats}>
                        Damage:{' '}
                        {Math.round(
                          activeSelectedNode.activeSkill.damageMultiplier * 100
                        )}
                        % Melee Power
                        {activeSelectedNode.activeSkill.hitCount
                          ? ` (${activeSelectedNode.activeSkill.hitCount} Hits)`
                          : ''}
                      </Text>
                    )}
                    {Boolean(activeSelectedNode.activeSkill.selfShieldMaxHpPct) && (
                      <Text style={styles.inspectorSkillStats}>
                        Barrier: +
                        {Math.round(
                          (activeSelectedNode.activeSkill.selfShieldMaxHpPct ?? 0) * 100
                        )}
                        % Max HP Shield
                      </Text>
                    )}
                    {Boolean(activeSelectedNode.activeSkill.healMaxHpPct) && (
                      <Text style={styles.inspectorSkillStats}>
                        Restoration: +
                        {Math.round(
                          (activeSelectedNode.activeSkill.healMaxHpPct ?? 0) * 100
                        )}
                        % Max HP Party Heal
                      </Text>
                    )}
                  </View>
                )}

                {/* Prerequisite & Spend Section */}
                <View style={styles.inspectorFooterRow}>
                  <View style={{ flex: 1 }}>
                    {isMaxed ? (
                      <Text style={styles.prereqMetText}>★ MAX RANK UNLOCKED</Text>
                    ) : validation.valid ? (
                      <Text style={styles.prereqReadyText}>
                        ✓ Prerequisite Met — Ready to Allocate
                      </Text>
                    ) : (
                      <Text style={styles.prereqLockedText}>
                        🔒 {validation.error ?? 'Prerequisites not met'}
                      </Text>
                    )}
                  </View>

                  <Pressable
                    style={[
                      styles.spendPointBtn,
                      (!validation.valid || !progressionUnlocked || isMaxed) &&
                        styles.spendPointBtnDisabled,
                      isMaxed && styles.spendPointBtnMaxed,
                    ]}
                    onPress={() => handleSpendPoint(activeSelectedNode.id)}
                    disabled={!validation.valid || !progressionUnlocked || isMaxed}
                    testID="talent-spend-point-btn"
                  >
                    <Text
                      style={[
                        styles.spendPointBtnText,
                        isMaxed && styles.spendPointBtnTextMaxed,
                      ]}
                    >
                      {!progressionUnlocked
                        ? '🔒 Workout Focus'
                        : isMaxed
                        ? '★ MAXED'
                        : `✨ Spend ${activeSelectedNode.pointCostPerRank} Pt (+1)`}
                    </Text>
                  </Pressable>
                </View>
              </>
            );
          })()}
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    padding: 14,
    paddingBottom: 36,
  },
  /* Sticky 7-Stat Horizontal Selector Bar */
  stickyStatBarContainer: {
    backgroundColor: CRIMSON_ONI.charcoalCard,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.borderGold,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 6,
    marginBottom: 8,
  },
  statTabsScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
  },
  statTab: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'transparent',
    minWidth: 46,
  },
  statTabActive: {
    backgroundColor: CRIMSON_ONI.charcoalElevated,
    borderWidth: 1.5,
  },
  statTabGlyphWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
  },
  statTabUnspentBadge: {
    position: 'absolute',
    top: -3,
    right: -4,
    backgroundColor: CRIMSON_ONI.agedGoldBright,
    borderRadius: 7,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.charcoalDeep,
  },
  statTabUnspentText: {
    color: CRIMSON_ONI.charcoalDeep,
    fontSize: 9,
    fontWeight: '900',
  },
  statTabLabel: {
    color: CRIMSON_ONI.ashGray,
    fontSize: 10,
    fontWeight: '800',
    marginTop: 3,
  },
  /* Compact Single-Row Summary */
  selectedStatSummaryCard: {
    backgroundColor: CRIMSON_ONI.charcoalElevated,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 10,
  },
  selectedStatSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  selectedStatSummaryTitle: {
    color: CRIMSON_ONI.ghostWhite,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  selectedStatXpTrack: {
    height: 4,
    backgroundColor: COLORS.bgDeep,
    borderRadius: 2,
    overflow: 'hidden',
  },
  selectedStatXpFill: {
    height: '100%',
  },
  resetTalentsBtn: {
    backgroundColor: '#26242E',
    borderWidth: 1,
    borderColor: '#4B5563',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  resetTalentsBtnText: {
    color: '#D1D5DB',
    fontSize: 10,
    fontWeight: '800',
  },
  focusActiveBox: {
    backgroundColor: COLORS.strengthDim,
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.strength,
  },
  focusActiveText: {
    color: '#FF8A80',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
  },
  errorBox: {
    backgroundColor: '#3B181B',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.danger,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  errorText: {
    color: '#FF8A80',
    fontSize: 11,
    fontWeight: '700',
    flex: 1,
  },
  errorDismiss: {
    color: CRIMSON_ONI.ashGray,
    fontSize: 12,
    fontWeight: '800',
    paddingLeft: 8,
  },
  /* Archetype Sub-Tabs */
  treeSectionHeader: {
    marginBottom: 10,
  },
  archetypeTabsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  archetypeTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: CRIMSON_ONI.charcoalCard,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  archetypeTabActive: {
    backgroundColor: CRIMSON_ONI.charcoalElevated,
    borderWidth: 1.5,
  },
  archetypeTabText: {
    color: CRIMSON_ONI.ashGray,
    fontSize: 12,
    fontWeight: '800',
  },
  archetypeTabTextActive: {
    color: CRIMSON_ONI.ghostWhite,
    fontWeight: '900',
  },
  archetypeSpentBadge: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  archetypeSpentBadgeActive: {
    backgroundColor: CRIMSON_ONI.agedGoldDim,
  },
  archetypeSpentBadgeText: {
    color: CRIMSON_ONI.agedGoldBright,
    fontSize: 10,
    fontWeight: '800',
  },
  archetypeInfoBox: {
    paddingHorizontal: 2,
    marginTop: 2,
  },
  archetypeRoleText: {
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 2,
  },
  archetypeDescText: {
    color: CRIMSON_ONI.ashGray,
    fontSize: 10,
    lineHeight: 14,
  },
  /* Constellation Canvas */
  canvasContainer: {
    width: '100%',
    height: 540,
    backgroundColor: '#090B10',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: CRIMSON_ONI.borderGold,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 12,
  },
  tierWatermarksColumn: {
    position: 'absolute',
    left: 8,
    top: 0,
    bottom: 0,
    width: 32,
    zIndex: 1,
  },
  tierWatermarkPill: {
    position: 'absolute',
    left: 0,
    backgroundColor: 'rgba(18, 23, 34, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(223, 182, 96, 0.25)',
    borderRadius: 5,
    paddingHorizontal: 4,
    paddingVertical: 2,
    alignItems: 'center',
  },
  tierWatermarkText: {
    color: CRIMSON_ONI.agedGoldBright,
    fontSize: 9,
    fontWeight: '900',
  },
  tierWatermarkSubtext: {
    color: CRIMSON_ONI.ashGray,
    fontSize: 7,
    fontWeight: '700',
  },
  svgCanvas: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  nodePositioner: {
    position: 'absolute',
    alignItems: 'center',
    width: 124,
    marginLeft: -62,
    marginTop: -26,
  },
  nodeIconWrapper: {
    position: 'relative',
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeShape: {
    width: 52,
    height: 52,
    backgroundColor: CRIMSON_ONI.charcoalDeep,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeCircle: {
    borderRadius: 26,
  },
  nodeKeystone: {
    width: 54,
    height: 54,
    borderRadius: 13,
  },
  nodeInvestedBg: {
    backgroundColor: '#1C1812',
  },
  nodeAvailableBg: {
    backgroundColor: '#0E1F1A',
  },
  nodeSelectedRing: {
    shadowColor: '#DFB660',
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  nodeGlyphIcon: {
    fontSize: 20,
  },
  nodeRankBadge: {
    position: 'absolute',
    bottom: -4,
    right: -8,
    backgroundColor: '#121722',
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 4,
    paddingVertical: 1,
    zIndex: 2,
  },
  nodeRankBadgeInvested: {
    backgroundColor: CRIMSON_ONI.agedGoldDim,
  },
  nodeRankBadgeText: {
    color: CRIMSON_ONI.ghostWhite,
    fontSize: 8,
    fontWeight: '900',
  },
  nodeTitleLabel: {
    color: CRIMSON_ONI.ghostWhite,
    width: 124,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
    marginTop: 6,
    textAlign: 'center',
  },
  /* Node Inspector Card */
  inspectorCard: {
    backgroundColor: CRIMSON_ONI.charcoalCard,
    borderWidth: 1.5,
    borderColor: CRIMSON_ONI.borderGold,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  inspectorHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  inspectorTitleCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inspectorNodeIcon: {
    fontSize: 18,
  },
  inspectorNodeName: {
    color: CRIMSON_ONI.ghostWhite,
    fontSize: 14,
    fontWeight: '900',
  },
  inspectorTagRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  inspectorTagPill: {
    backgroundColor: CRIMSON_ONI.charcoalElevated,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.border,
  },
  inspectorTagPillText: {
    color: CRIMSON_ONI.agedGoldBright,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  inspectorRankPill: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  inspectorRankPillText: {
    color: CRIMSON_ONI.ashGray,
    fontSize: 9,
    fontWeight: '800',
  },
  inspectorDescription: {
    color: CRIMSON_ONI.ghostWhite,
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 8,
  },
  inspectorSkillBox: {
    backgroundColor: CRIMSON_ONI.charcoalDeep,
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.border,
    marginBottom: 8,
  },
  inspectorSkillHeader: {
    color: CRIMSON_ONI.agedGoldBright,
    fontSize: 10,
    fontWeight: '900',
    marginBottom: 3,
  },
  inspectorSkillStats: {
    color: CRIMSON_ONI.ashGray,
    fontSize: 10,
    lineHeight: 14,
  },
  inspectorFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: CRIMSON_ONI.border,
    paddingTop: 8,
  },
  prereqMetText: {
    color: CRIMSON_ONI.agedGoldBright,
    fontSize: 11,
    fontWeight: '900',
  },
  prereqReadyText: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '800',
  },
  prereqLockedText: {
    color: '#FF8A80',
    fontSize: 10,
    fontWeight: '700',
  },
  spendPointBtn: {
    backgroundColor: CRIMSON_ONI.agedGold,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 110,
    alignItems: 'center',
  },
  spendPointBtnDisabled: {
    backgroundColor: COLORS.bgElevated,
    opacity: 0.6,
  },
  spendPointBtnMaxed: {
    backgroundColor: '#1E3A2B',
    borderColor: '#10B981',
    borderWidth: 1,
    opacity: 1,
  },
  spendPointBtnText: {
    color: CRIMSON_ONI.charcoalDeep,
    fontSize: 11,
    fontWeight: '900',
  },
  spendPointBtnTextMaxed: {
    color: '#6EE7B7',
  },
  /* Aggregated Modifiers & Profile Link */
  summaryCard: {
    backgroundColor: CRIMSON_ONI.charcoalElevated,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.borderGold,
    marginBottom: 12,
  },
  cardTitle: {
    color: CRIMSON_ONI.agedGoldBright,
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 6,
  },
  modLine: {
    color: CRIMSON_ONI.ghostWhite,
    fontSize: 11,
    marginBottom: 4,
  },
  profileGearLinkCard: {
    backgroundColor: CRIMSON_ONI.charcoalCard,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.borderGold,
    padding: 12,
    alignItems: 'center',
  },
  profileGearLinkText: {
    color: CRIMSON_ONI.agedGoldBright,
    fontSize: 12,
    fontWeight: '800',
  },
});

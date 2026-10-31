import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  DEFAULT_TALENT_TREES,
  HolisticStatType,
  StatType,
  getPointsSpentInTree,
  isCharacterProgressionUnlocked,
  validateTalentAllocation,
  xpRequiredForStatLevel,
} from '@gymify/game-engine';
import { useGame } from '../state/GameContext';
import { COLORS } from '../theme';

export interface TalentBuilderScreenProps {
  initialStat?: HolisticStatType | StatType;
  onOpenProfileGear?: () => void;
}

const STAT_COLORS: Record<HolisticStatType, string> = {
  STRENGTH: COLORS.strength,
  ENDURANCE: COLORS.endurance,
  AGILITY: COLORS.agility,
  DEXTERITY: '#26C6DA',
  CONSTITUTION: '#66BB6A',
  WISDOM: '#AB47BC',
  SPIRIT: '#EC407A',
};

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

  const [selectedStat, setSelectedStat] = useState<HolisticStatType>(initialStat ?? 'STRENGTH');
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  useEffect(() => {
    if (initialStat) {
      setSelectedStat(initialStat as HolisticStatType);
    }
  }, [initialStat]);

  const statColor = (s: HolisticStatType | StatType) =>
    STAT_COLORS[s as HolisticStatType] ?? COLORS.textPrimary;

  const visibleTrees = DEFAULT_TALENT_TREES.filter((t) => t.governingStat === selectedStat);

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      {!progressionUnlocked && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>
            🔒 Intra-Workout Focus Protocol Active ({workoutMachine.phase}): Stat allocation &amp;
            equipment upgrades unlock automatically during post-workout LootReview!
          </Text>
        </View>
      )}

      {/* Core Stats & XP Bars */}
      <Text style={styles.sectionTitle}>Core Attributes & Stat Talent Pools</Text>
      <View style={styles.statsGrid}>
        {(
          [
            'STRENGTH',
            'ENDURANCE',
            'AGILITY',
            'DEXTERITY',
            'CONSTITUTION',
            'WISDOM',
            'SPIRIT',
          ] as const
        ).map((st) => {
          const s = stats[st];
          const nextReq = xpRequiredForStatLevel(s.level);
          const pct = Math.min(100, Math.round((s.xp / nextReq) * 100));
          const col = statColor(st);
          const isSelected = selectedStat === st;

          return (
            <Pressable
              key={st}
              style={[
                styles.statCard,
                isSelected && { borderColor: col, backgroundColor: COLORS.bgElevated },
              ]}
              onPress={() => {
                setSelectedStat(st);
                setErrorBanner(null);
              }}
            >
              <View style={styles.statHeader}>
                <Text style={[styles.statLabel, { color: col }]}>{st}</Text>
                <Text style={styles.statLevel}>Lv.{s.level}</Text>
              </View>
              <View style={styles.xpTrack}>
                <View style={[styles.xpFill, { width: `${pct}%`, backgroundColor: col }]} />
              </View>
              <Text style={styles.xpCaption}>
                {s.xp}/{nextReq} XP •{' '}
                <Text style={{ color: COLORS.gold, fontWeight: '800' }}>
                  {s.pointsAvailable} Talent Pt(s)
                </Text>
              </Text>
            </Pressable>
          );
        })}
      </View>

      {errorBanner && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{errorBanner}</Text>
        </View>
      )}

      {/* Multi-Class Specialization Trees */}
      <Text style={styles.sectionTitle}>
        {selectedStat} Multi-Class Talent Trees ({stats[selectedStat].pointsAvailable} pts available)
      </Text>

      {visibleTrees.map((tree) => {
        const spent = getPointsSpentInTree(tree.slug, unlockedTalentRanks, DEFAULT_TALENT_TREES);
        const col = statColor(tree.governingStat);

        return (
          <View key={tree.slug} style={styles.treeCard}>
            <View style={styles.treeHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.treeName, { color: col }]}>{tree.name}</Text>
                <Text style={styles.treeRole}>{tree.archetypeRole}</Text>
              </View>
              <Text style={styles.treeSpentBadge}>{spent} pts invested</Text>
            </View>
            <Text style={styles.treeDesc}>{tree.description}</Text>

            {tree.nodes.map((node) => {
              const currentRank = unlockedTalentRanks[node.id] ?? 0;
              const check = validateTalentAllocation(
                {
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
                },
                node.id,
                DEFAULT_TALENT_TREES
              );

              return (
                <View
                  key={node.id}
                  style={[
                    styles.nodeRow,
                    currentRank > 0 && { borderColor: col },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.nodeTitle}>
                      [T{node.tier}] {node.name}{' '}
                      <Text style={styles.nodeRank}>
                        ({currentRank}/{node.maxRank})
                      </Text>
                    </Text>
                    <Text style={styles.nodeDesc}>{node.description}</Text>
                    {node.requiredTreePointsSpent > 0 && (
                      <Text style={styles.nodeReq}>
                        Requires {node.requiredTreePointsSpent} pts in {tree.name} • Cost:{' '}
                        {node.pointCostPerRank} pt
                      </Text>
                    )}
                  </View>

                  <Pressable
                    style={[
                      styles.unlockBtn,
                      (!check.valid || !progressionUnlocked) && styles.unlockBtnDisabled,
                      currentRank >= node.maxRank && styles.unlockBtnMaxed,
                    ]}
                    onPress={() => {
                      if (!progressionUnlocked) {
                        setErrorBanner(
                          'Finish your active workout session to allocate Talent Points during LootReview.'
                        );
                        return;
                      }
                      const res = unlockTalentNode(node.id);
                      if (!res.ok) setErrorBanner(res.error ?? null);
                      else setErrorBanner(null);
                    }}
                  >
                    <Text style={styles.unlockBtnText}>
                      {!progressionUnlocked
                        ? '🔒 LOCKED'
                        : currentRank >= node.maxRank
                          ? 'MAXED'
                          : `+1 (${node.pointCostPerRank}p)`}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        );
      })}

      {/* Aggregated Omni-Class Modifiers */}
      <View style={styles.summaryCard}>
        <Text style={styles.cardTitle}>Aggregated Omni-Class Combat Profile</Text>
        <Text style={styles.modLine}>
          • Melee Power: +{Math.round(aggregatedTalents.meleePowerPct * 100)}% | Armor: +
          {Math.round(aggregatedTalents.armorPct * 100)}% | Mitigation: +
          {Math.round(aggregatedTalents.damageMitigationPct * 100)}%
        </Text>
        <Text style={styles.modLine}>
          • Attack Speed: +{Math.round(aggregatedTalents.attackSpeedPct * 100)}% | Dodge: +
          {Math.round(aggregatedTalents.dodgeRatingBonus * 100)}% | Crit: +
          {Math.round(aggregatedTalents.critChanceBonus * 100)}%
        </Text>
        <Text style={styles.modLine}>
          • Active Skills Unlocked:{' '}
          {aggregatedTalents.unlockedSkills.length > 0
            ? aggregatedTalents.unlockedSkills.map((s) => s.name).join(', ')
            : 'None yet'}
        </Text>
      </View>

      {onOpenProfileGear && (
        <Pressable style={styles.profileGearLinkCard} onPress={onOpenProfileGear}>
          <Text style={styles.profileGearLinkText}>
            🛡️ Manage 8-Slot Equipped Gear Loadout &amp; Bag in Character Profile →
          </Text>
        </Pressable>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    padding: 16,
    paddingBottom: 36,
  },
  sectionTitle: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 10,
    marginTop: 6,
  },
  statsGrid: {
    gap: 8,
    marginBottom: 14,
  },
  statCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
  },
  statHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  statLabel: {
    fontSize: 13,
    fontWeight: '900',
  },
  statLevel: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  xpTrack: {
    height: 6,
    backgroundColor: COLORS.bgDeep,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 6,
  },
  xpFill: {
    height: '100%',
  },
  xpCaption: {
    color: COLORS.textSecondary,
    fontSize: 11,
  },
  errorBox: {
    backgroundColor: COLORS.strengthDim,
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.strength,
  },
  errorText: {
    color: COLORS.strength,
    fontSize: 12,
    fontWeight: '700',
  },
  treeCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 12,
  },
  treeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  treeName: {
    fontSize: 16,
    fontWeight: '900',
  },
  treeRole: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  treeSpentBadge: {
    color: COLORS.gold,
    fontSize: 12,
    fontWeight: '700',
  },
  treeDesc: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginVertical: 8,
  },
  nodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgDeep,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 10,
    marginTop: 8,
    gap: 10,
  },
  nodeTitle: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  nodeRank: {
    color: COLORS.gold,
  },
  nodeDesc: {
    color: COLORS.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  nodeReq: {
    color: COLORS.textMuted,
    fontSize: 10,
    marginTop: 3,
  },
  unlockBtn: {
    backgroundColor: COLORS.gold,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 7,
  },
  unlockBtnDisabled: {
    backgroundColor: COLORS.bgElevated,
    opacity: 0.5,
  },
  unlockBtnMaxed: {
    backgroundColor: COLORS.enduranceDim,
    opacity: 1,
  },
  unlockBtnText: {
    color: COLORS.bgDeep,
    fontSize: 11,
    fontWeight: '800',
  },
  summaryCard: {
    backgroundColor: COLORS.bgElevated,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.borderHighlight,
    marginBottom: 12,
  },
  cardTitle: {
    color: COLORS.gold,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 6,
  },
  modLine: {
    color: COLORS.textPrimary,
    fontSize: 12,
    marginBottom: 4,
  },
  profileGearLinkCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.borderHighlight,
    padding: 12,
    alignItems: 'center',
  },
  profileGearLinkText: {
    color: COLORS.gold,
    fontSize: 12,
    fontWeight: '800',
  },
});

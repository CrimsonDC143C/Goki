import React from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getCurrentSeasonKey } from '@goki/game-engine';
import type {
  SocialLeaderboardCategory,
  SocialLeaderboardEntryDto,
} from '../../api/apiClient';
import { COLORS, RADII, SPACING, SURFACES, TYPOGRAPHY } from '../../theme';
import { RpgIcon } from '../icons/RpgIcon';
import { SlateSection } from '../ui';

const CATEGORY_OPTIONS: ReadonlyArray<{
  key: SocialLeaderboardCategory;
  label: string;
}> = [
  { key: 'GYM_CLANS', label: 'Gym Clans' },
  { key: 'COMPANIES', label: 'Companies' },
  { key: 'HEROES', label: 'Heroes' },
  { key: 'ARENA', label: 'Arena' },
];

export interface SocialLeaderboardsViewProps {
  category: SocialLeaderboardCategory;
  seasonKey?: string;
  entries: SocialLeaderboardEntryDto[];
  loading: boolean;
  onSelectCategory: (category: SocialLeaderboardCategory) => void;
  onOpenWardenBriefing: () => void;
}

export const SocialLeaderboardsView: React.FC<SocialLeaderboardsViewProps> = ({
  category,
  seasonKey,
  entries,
  loading,
  onSelectCategory,
  onOpenWardenBriefing,
}) => {
  const activeSeasonKey = seasonKey || getCurrentSeasonKey();

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <SlateSection
        level={1}
        eyebrow={`MONTHLY SEASON • ${activeSeasonKey}`}
        title="Seasonal Standings & Rankings"
        subtitle="Points accrue from workouts, 7-day raid damage, and Async Arena sparring."
        rightAction={
          <TouchableOpacity
            style={styles.briefBtn}
            onPress={onOpenWardenBriefing}
            activeOpacity={0.75}
          >
            <RpgIcon name="banners" size={13} color={COLORS.gold} />
            <Text style={styles.briefBtnText}>Rules</Text>
          </TouchableOpacity>
        }
      >
        <View style={styles.chipRow}>
          {CATEGORY_OPTIONS.map((opt) => {
            const active = opt.key === category;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => onSelectCategory(opt.key)}
                activeOpacity={0.8}
                testID={`leaderboard-cat-${opt.key}`}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="small" color={COLORS.gold} />
            <Text style={styles.loadingText}>Loading {activeSeasonKey} standings...</Text>
          </View>
        ) : entries.length === 0 ? (
          <Text style={styles.emptyText}>No seasonal standings recorded yet for this category.</Text>
        ) : (
          <View style={styles.entriesCol}>
            {entries.map((entry) => {
              const isTopThree = entry.rank <= 3;
              return (
                <View
                  key={`${category}-${entry.id}`}
                  style={[styles.entryCard, isTopThree && styles.entryCardTop]}
                >
                  <View style={styles.entryHeaderRow}>
                    <View style={[styles.rankBadge, isTopThree && styles.rankBadgeTop]}>
                      <Text style={[styles.rankText, isTopThree && styles.rankTextTop]}>
                        #{entry.rank}
                      </Text>
                    </View>
                    <View style={styles.entryTitleCol}>
                      <Text style={styles.entryName}>
                        {entry.name}
                        {entry.tag ? ` [${entry.tag}]` : ''}
                      </Text>
                      {entry.subtitle ? (
                        <Text style={styles.entrySubtitle}>{entry.subtitle}</Text>
                      ) : null}
                    </View>
                    <View style={styles.totalCol}>
                      <Text style={styles.totalValue}>
                        {entry.totalPoints.toLocaleString()}
                      </Text>
                      <Text style={styles.totalLabel}>TOTAL</Text>
                    </View>
                  </View>

                  <View style={styles.breakdownRow}>
                    <View style={styles.breakdownPill}>
                      <Text style={styles.breakdownLabel}>Workout</Text>
                      <Text style={styles.breakdownVal}>
                        {entry.workoutPoints.toLocaleString()}
                      </Text>
                    </View>
                    <View style={styles.breakdownPill}>
                      <Text style={styles.breakdownLabel}>Raid</Text>
                      <Text style={styles.breakdownVal}>
                        {entry.raidPoints.toLocaleString()}
                      </Text>
                    </View>
                    <View style={styles.breakdownPill}>
                      <Text style={styles.breakdownLabel}>Arena</Text>
                      <Text style={styles.breakdownVal}>
                        {entry.arenaPoints.toLocaleString()}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </SlateSection>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xxl,
    gap: SPACING.md,
  },
  briefBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.sm,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  briefBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.gold,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginBottom: SPACING.md,
  },
  chip: {
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: SURFACES.hairlineStrong,
  },
  chipActive: {
    backgroundColor: COLORS.goldDim,
    borderColor: COLORS.gold,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  chipTextActive: {
    color: COLORS.gold,
  },
  loadingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
  },
  loadingText: {
    ...TYPOGRAPHY.bodySm,
  },
  emptyText: {
    ...TYPOGRAPHY.bodySm,
    fontStyle: 'italic',
  },
  entriesCol: {
    gap: SPACING.sm,
  },
  entryCard: {
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.md,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  entryCardTop: {
    borderWidth: 1,
    borderColor: SURFACES.goldHairline,
  },
  entryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  rankBadge: {
    minWidth: 34,
    height: 28,
    borderRadius: RADII.sm,
    backgroundColor: SURFACES.layer3,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  rankBadgeTop: {
    backgroundColor: COLORS.goldDim,
  },
  rankText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textSecondary,
    ...TYPOGRAPHY.tabular,
  },
  rankTextTop: {
    color: COLORS.gold,
  },
  entryTitleCol: {
    flex: 1,
    gap: 2,
  },
  entryName: {
    ...TYPOGRAPHY.titleMd,
    fontSize: 13,
  },
  entrySubtitle: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
  },
  totalCol: {
    alignItems: 'flex-end',
  },
  totalValue: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.gold,
    ...TYPOGRAPHY.tabular,
  },
  totalLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 0.6,
  },
  breakdownRow: {
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  breakdownPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: SURFACES.layer3,
    borderRadius: RADII.sm,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  breakdownLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  breakdownVal: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textPrimary,
    ...TYPOGRAPHY.tabular,
  },
});

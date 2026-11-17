import React from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { ArenaMatchSummaryDto, ArenaOpponentDto } from '../../api/apiClient';
import { COLORS, RADII, SPACING, SURFACES, TYPOGRAPHY } from '../../theme';
import { RpgIcon } from '../icons/RpgIcon';
import { HairlineDivider, SlateSection } from '../ui';

export interface AsyncArenaViewProps {
  arenaRating: number;
  arenaWins: number;
  arenaLosses: number;
  includeSquad: boolean;
  hasActiveSquad: boolean;
  opponents: ArenaOpponentDto[];
  lastMatch: ArenaMatchSummaryDto | null;
  matchHistory: ArenaMatchSummaryDto[];
  sparringOpponentId: string | null;
  onToggleIncludeSquad: () => void;
  onSparOpponent: (opponent: ArenaOpponentDto) => void;
  onOpenQuartermasterBriefing: () => void;
}

export const AsyncArenaView: React.FC<AsyncArenaViewProps> = ({
  arenaRating,
  arenaWins,
  arenaLosses,
  includeSquad,
  hasActiveSquad,
  opponents,
  lastMatch,
  matchHistory,
  sparringOpponentId,
  onToggleIncludeSquad,
  onSparOpponent,
  onOpenQuartermasterBriefing,
}) => {
  const isVictory = lastMatch?.outcome === 'CHALLENGER_VICTORY';

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      {/* Hero Arena Rating Card */}
      <SlateSection
        level={1}
        eyebrow="ASYNC ARENA"
        title="Deterministic AI Sparring & Elo Rating"
        subtitle="Challenge Gym Clan rivals or friends' snapshots using the turn-based combat engine."
        rightAction={
          <TouchableOpacity
            style={styles.briefBtn}
            onPress={onOpenQuartermasterBriefing}
            activeOpacity={0.75}
          >
            <RpgIcon name="trophy" size={13} color={COLORS.gold} />
            <Text style={styles.briefBtnText}>Veyra</Text>
          </TouchableOpacity>
        }
      >
        <View style={styles.ratingCard}>
          <View style={styles.ratingStatCol}>
            <Text style={styles.ratingEyebrow}>ARENA RATING</Text>
            <Text style={styles.ratingValue}>{arenaRating.toLocaleString()}</Text>
          </View>
          <View style={styles.ratingDivider} />
          <View style={styles.ratingStatCol}>
            <Text style={styles.ratingEyebrow}>RECORD (W / L)</Text>
            <Text style={styles.recordValue}>
              {arenaWins}W / {arenaLosses}L
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.squadToggleBtn, includeSquad && styles.squadToggleBtnActive]}
            onPress={onToggleIncludeSquad}
            activeOpacity={0.8}
            testID="arena-squad-toggle"
          >
            <RpgIcon
              name={includeSquad ? 'check' : 'social'}
              size={13}
              color={includeSquad ? SURFACES.canvas : COLORS.textSecondary}
            />
            <Text style={[styles.squadToggleText, includeSquad && styles.squadToggleTextActive]}>
              {includeSquad
                ? hasActiveSquad
                  ? 'Active Squad: ON'
                  : 'Squad Assist: ON'
                : 'Include Active Squad'}
            </Text>
          </TouchableOpacity>
        </View>
      </SlateSection>

      {/* Latest Match Result Card */}
      {lastMatch ? (
        <SlateSection
          level={1}
          eyebrow="SPARRING REPORT"
          title={`vs ${lastMatch.defenderName}`}
          testID="arena-match-result-card"
        >
          <View
            style={[
              styles.resultHeader,
              isVictory ? styles.resultHeaderWin : styles.resultHeaderLoss,
            ]}
          >
            <View style={styles.resultBadgeRow}>
              <RpgIcon
                name={isVictory ? 'trophy' : 'shield'}
                size={16}
                color={isVictory ? COLORS.gold : COLORS.danger}
              />
              <Text style={[styles.resultOutcomeText, !isVictory && styles.resultLossText]}>
                {isVictory ? 'VICTORY' : 'DEFEAT'}
              </Text>
            </View>
            <Text style={styles.resultMetaText}>
              {lastMatch.totalTurns} Turns • {lastMatch.challengerRatingDelta >= 0 ? '+' : ''}
              {lastMatch.challengerRatingDelta} Elo ({lastMatch.nextChallengerRating})
            </Text>
          </View>

          <View style={styles.metricsRow}>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Damage Dealt</Text>
              <Text style={styles.metricVal}>
                {lastMatch.challengerDamageDealt.toLocaleString()}
              </Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Damage Taken</Text>
              <Text style={styles.metricVal}>
                {lastMatch.defenderDamageDealt.toLocaleString()}
              </Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Rewards</Text>
              <Text style={[styles.metricVal, { color: COLORS.gold }]}>
                +{lastMatch.goldAwarded}g • +{lastMatch.seasonPointsAwarded} pts
              </Text>
            </View>
          </View>

          {lastMatch.combatLog.length > 0 ? (
            <>
              <HairlineDivider spacing={SPACING.sm} />
              <Text style={styles.logHeading}>Combat Log</Text>
              <View style={styles.logBox}>
                {lastMatch.combatLog.slice(0, 10).map((evt, idx) => (
                  <Text key={`${evt.seq}-${idx}`} style={styles.logLine}>
                    [T{evt.turnNumber}] {evt.message}
                  </Text>
                ))}
                {lastMatch.combatLog.length > 10 ? (
                  <Text style={styles.logMoreText}>
                    +{lastMatch.combatLog.length - 10} more combat turns recorded
                  </Text>
                ) : null}
              </View>
            </>
          ) : null}
        </SlateSection>
      ) : null}

      {/* Opponents List */}
      <SlateSection
        level={1}
        eyebrow="CHALLENGERS & RIVALS"
        title="Arena Opponents"
        subtitle="Friendly asynchronous matches — no permanent gear loss."
      >
        <View style={styles.opponentsCol}>
          {opponents.map((opponent) => {
            const isSparring = sparringOpponentId === opponent.characterId;
            return (
              <View key={opponent.characterId} style={styles.opponentRow}>
                <View style={styles.opponentInfoCol}>
                  <View style={styles.opponentNameRow}>
                    <Text style={styles.opponentName}>{opponent.name}</Text>
                    {opponent.isNpcRival ? (
                      <View style={styles.rivalTag}>
                        <Text style={styles.rivalTagText}>RIVAL</Text>
                      </View>
                    ) : opponent.isFriend ? (
                      <View style={styles.friendTag}>
                        <Text style={styles.friendTagText}>FRIEND</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.opponentMeta}>
                    Lv.{opponent.overallLevel} • Rating {opponent.arenaRating}
                    {opponent.gymClanName ? ` • ${opponent.gymClanName}` : ''}
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.sparBtn}
                  onPress={() => onSparOpponent(opponent)}
                  disabled={Boolean(sparringOpponentId)}
                  activeOpacity={0.8}
                  testID={`arena-spar-btn-${opponent.characterId}`}
                >
                  {isSparring ? (
                    <ActivityIndicator size="small" color={SURFACES.canvas} />
                  ) : (
                    <>
                      <RpgIcon name="combat" size={13} color={SURFACES.canvas} />
                      <Text style={styles.sparBtnText}>Spar</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      </SlateSection>

      {/* Recent Match History */}
      {matchHistory.length > 0 ? (
        <SlateSection level={1} eyebrow="RECENT MATCHES" title="Arena Match History">
          <View style={styles.historyCol}>
            {matchHistory.slice(0, 6).map((m) => {
              const win = m.outcome === 'CHALLENGER_VICTORY';
              return (
                <View key={m.matchId} style={styles.historyRow}>
                  <Text style={[styles.historyOutcome, win ? styles.historyWin : styles.historyLoss]}>
                    {win ? 'WIN' : 'LOSS'}
                  </Text>
                  <Text style={styles.historyOpponent} numberOfLines={1}>
                    vs {m.defenderName}
                  </Text>
                  <Text style={styles.historyMeta}>
                    {m.totalTurns}T • {m.challengerRatingDelta >= 0 ? '+' : ''}
                    {m.challengerRatingDelta} Elo
                  </Text>
                </View>
              );
            })}
          </View>
        </SlateSection>
      ) : null}
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
  ratingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: SPACING.md,
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.md,
    padding: SPACING.md,
  },
  ratingStatCol: {
    gap: 2,
  },
  ratingEyebrow: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 0.7,
  },
  ratingValue: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.gold,
    ...TYPOGRAPHY.tabular,
  },
  recordValue: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textPrimary,
    ...TYPOGRAPHY.tabular,
  },
  ratingDivider: {
    width: 1,
    height: 30,
    backgroundColor: SURFACES.hairlineStrong,
  },
  squadToggleBtn: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: SURFACES.layer3,
    borderRadius: RADII.pill,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: SURFACES.hairlineStrong,
  },
  squadToggleBtnActive: {
    backgroundColor: COLORS.gold,
    borderColor: COLORS.gold,
  },
  squadToggleText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  squadToggleTextActive: {
    color: SURFACES.canvas,
    fontWeight: '800',
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: RADII.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  resultHeaderWin: {
    backgroundColor: COLORS.goldDim,
    borderWidth: 1,
    borderColor: SURFACES.goldHairline,
  },
  resultHeaderLoss: {
    backgroundColor: COLORS.strengthDim,
    borderWidth: 1,
    borderColor: COLORS.strength,
  },
  resultBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  resultOutcomeText: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.gold,
    letterSpacing: 0.5,
  },
  resultLossText: {
    color: COLORS.danger,
  },
  resultMetaText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textPrimary,
    ...TYPOGRAPHY.tabular,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  metricBox: {
    flex: 1,
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.sm,
    padding: SPACING.sm,
    gap: 2,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  metricVal: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textPrimary,
    ...TYPOGRAPHY.tabular,
  },
  logHeading: {
    ...TYPOGRAPHY.eyebrow,
    marginBottom: SPACING.xs,
  },
  logBox: {
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.md,
    padding: SPACING.sm,
    gap: 4,
  },
  logLine: {
    fontSize: 11,
    lineHeight: 16,
    color: COLORS.textSecondary,
  },
  logMoreText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginTop: 2,
  },
  opponentsCol: {
    gap: SPACING.sm,
  },
  opponentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.md,
    padding: SPACING.md,
  },
  opponentInfoCol: {
    flex: 1,
    gap: 3,
  },
  opponentNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  opponentName: {
    ...TYPOGRAPHY.titleMd,
    fontSize: 13,
  },
  rivalTag: {
    backgroundColor: COLORS.goldDim,
    borderRadius: RADII.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  rivalTagText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.gold,
  },
  friendTag: {
    backgroundColor: COLORS.enduranceDim,
    borderRadius: RADII.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  friendTagText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#26A69A',
  },
  opponentMeta: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
  },
  sparBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: COLORS.gold,
    borderRadius: RADII.md,
    paddingHorizontal: 14,
    paddingVertical: 9,
    minWidth: 74,
  },
  sparBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: SURFACES.canvas,
  },
  historyCol: {
    gap: SPACING.xs,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  historyOutcome: {
    fontSize: 10,
    fontWeight: '800',
    width: 34,
  },
  historyWin: {
    color: COLORS.success,
  },
  historyLoss: {
    color: COLORS.danger,
  },
  historyOpponent: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  historyMeta: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
    ...TYPOGRAPHY.tabular,
  },
});

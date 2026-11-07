import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useWebSocket } from '../hooks/useWebSocket';
import { useGame } from '../state/GameContext';
import {
  DEMON_BOSS_SPRITE_CONFIG,
  GREATSWORD_SKELETON_SPRITE_CONFIG,
} from '../components/battle/sprites/spriteManifest';
import { SpriteAnimator } from '../components/battle/sprites/SpriteAnimator';
import { COLORS, RARITY_COLORS } from '../theme';

const RANK_LADDER = [
  'COPPER',
  'IRON',
  'BRONZE',
  'SILVER',
  'GOLD',
  'PLATINUM',
  'MYTHIC',
] as const;

export const GuildHallScreen: React.FC = () => {
  const {
    characterName,
    stats,
    adventurerRank,
    adventurerReputation,
    guildName,
    guildReputation,
    workoutsLoggedCount,
    lastGatheringDrop,
    bounties,
    raids,
    isLiveSyncConnected,
    completeGuildBounty,
    lockDailyRaidStrike,
    resolveWeeklyRaidRewards,
  } = useGame();

  const [notice, setNotice] = useState<string | null>(null);

  const combinedStatLevel =
    (stats?.STRENGTH?.level ?? 1) +
    (stats?.ENDURANCE?.level ?? 1) +
    (stats?.AGILITY?.level ?? 1);

  const getBountyProgress = (slug: string, completed: boolean) => {
    if (completed) {
      return {
        isReady: false,
        progressPct: 100,
        pills: ['✓ Completed'],
        buttonLabel: '✓ Claimed',
      };
    }

    if (slug === 'trial_of_iron') {
      const doneWorkouts = Math.min(3, workoutsLoggedCount);
      const isReady = workoutsLoggedCount >= 3;
      const pct = Math.round((doneWorkouts / 3) * 100);
      return {
        isReady,
        progressPct: pct,
        pills: [`🏋️ ${doneWorkouts}/3 Workouts`],
        buttonLabel: isReady ? '✨ Claim' : `🔒 ${doneWorkouts}/3`,
      };
    }

    if (slug === 'trial_of_bronze') {
      const hasIron = adventurerRank !== 'COPPER';
      const statClamped = Math.min(15, combinedStatLevel);
      const isReady = hasIron && combinedStatLevel >= 15;
      const pct = Math.round((((hasIron ? 1 : 0) + statClamped / 15) / 2) * 100);
      return {
        isReady,
        progressPct: pct,
        pills: [
          `${hasIron ? '✓' : '🔒'} IRON Rank`,
          `⚡ ${statClamped}/15 Core Stats`,
        ],
        buttonLabel: isReady ? '✨ Claim' : `🔒 ${statClamped}/15`,
      };
    }

    // Standard bounty (e.g., weekly_zone2_patrol)
    const activityCount = workoutsLoggedCount + (lastGatheringDrop ? 1 : 0);
    const done = Math.min(1, activityCount);
    const isReady = done >= 1;
    return {
      isReady,
      progressPct: isReady ? 100 : 0,
      pills: [`🏃 ${done}/1 Workout or Gathering`],
      buttonLabel: isReady ? '✨ Claim' : '🔒 0/1',
    };
  };

  // Subscribe to real-time WebSocket rooms for all active weekly raid bosses
  const raidRooms = useMemo(() => raids.map((r) => `raid:${r.id}`), [raids]);
  const { isConnected: isWsConnected } = useWebSocket({ room: raidRooms });

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      {/* Adventurer Rank Ladder */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Adventurers&apos; Guild Rank Progression</Text>
        <Text style={styles.subText}>
          Current Rank: <Text style={styles.goldBold}>{adventurerRank}</Text> • Reputation:{' '}
          {adventurerReputation} • Workouts Logged: {workoutsLoggedCount}
        </Text>
        <View style={styles.rankRow}>
          {RANK_LADDER.map((rk) => {
            const active = rk === adventurerRank;
            return (
              <View
                key={rk}
                style={[styles.rankPill, active && styles.rankPillActive]}
              >
                <Text style={[styles.rankPillText, active && styles.rankPillTextActive]}>
                  {rk}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {notice && (
        <View style={styles.noticeBox}>
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      )}

      {/* Guild Bounties & Rank-Up Trials */}
      <Text style={styles.sectionTitle}>Guild Bounties & Rank-Up Trials</Text>
      {bounties.map((b) => {
        const prog = getBountyProgress(b.slug, b.completed);
        return (
          <View
            key={b.slug}
            style={[
              styles.bountyCard,
              prog.isReady && !b.completed && styles.bountyCardReady,
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.bountyTitle}>
                {b.isRankUpTrial ? '🏅 ' : '📜 '}
                {b.title}
              </Text>
              <Text style={styles.bountyDesc}>{b.description}</Text>

              {/* Inline Progress Bar & Requirement Pills */}
              <View style={styles.bountyProgressRow}>
                {prog.pills.map((pill) => (
                  <View
                    key={pill}
                    style={[
                      styles.bountyProgressPill,
                      (b.completed || prog.isReady) && styles.bountyProgressPillReady,
                    ]}
                  >
                    <Text
                      style={[
                        styles.bountyProgressPillText,
                        (b.completed || prog.isReady) && styles.bountyProgressPillTextReady,
                      ]}
                    >
                      {pill}
                    </Text>
                  </View>
                ))}
              </View>
              <View style={styles.bountyProgressTrack}>
                <View
                  style={[
                    styles.bountyProgressFill,
                    { width: `${prog.progressPct}%` },
                    b.completed && styles.bountyProgressFillDone,
                  ]}
                />
              </View>

              <Text style={styles.rewardMeta}>
                +{b.goldReward} Gold • +{b.reputationReward} Guild Reputation
              </Text>
            </View>
            <Pressable
              style={[
                styles.claimBtn,
                !prog.isReady && !b.completed && styles.claimBtnLocked,
                b.completed && styles.claimBtnDone,
              ]}
              disabled={b.completed || !prog.isReady}
              onPress={() => {
                const res = completeGuildBounty(b.slug);
                if (!res.ok) setNotice(res.error ?? null);
                else setNotice(`Completed '${b.title}'!`);
              }}
            >
              <Text
                style={[
                  styles.claimBtnText,
                  !prog.isReady && !b.completed && styles.claimBtnTextLocked,
                  b.completed && styles.claimBtnTextDone,
                ]}
              >
                {prog.buttonLabel}
              </Text>
            </Pressable>
          </View>
        );
      })}

      {/* Social Guild Banner */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>Social Guild & 7-Day Boss Raids</Text>
        <View
          style={[
            styles.liveSyncBadge,
            (isLiveSyncConnected || isWsConnected) && styles.liveSyncBadgeActive,
          ]}
        >
          <Text style={styles.liveSyncDot}>
            {isLiveSyncConnected || isWsConnected ? '🟢' : '⚪'}
          </Text>
          <Text style={styles.liveSyncText}>
            {isLiveSyncConnected || isWsConnected ? 'Live Sync' : 'Offline'}
          </Text>
        </View>
      </View>
      <View style={styles.guildHeaderCard}>
        <Text style={styles.guildNameText}>🛡️ {guildName}</Text>
        <Text style={styles.subText}>
          Guild Reputation: {guildReputation.toLocaleString()} • Unlocks Private Guild-Only 7-Day
          Boss Raids
        </Text>
      </View>

      {/* Public World Boss & Guild-Only Boss Raids */}
      {raids.map((raid) => {
        const hpPct = Math.max(0, Math.min(100, (raid.currentHp / raid.maxHp) * 100));
        const isSlain = raid.currentHp <= 0;
        const isVaelgor =
          raid.id.toLowerCase().includes('vaelgor') ||
          raid.bossName.toLowerCase().includes('vaelgor');
        const bossSpriteConfig = isVaelgor
          ? GREATSWORD_SKELETON_SPRITE_CONFIG
          : DEMON_BOSS_SPRITE_CONFIG;

        return (
          <View key={raid.id} style={styles.raidCard}>
            <View style={styles.bossHeaderRow}>
              {/* 56x56 Boss Sprite Avatar Frame */}
              <View style={styles.bossAvatarFrame}>
                <SpriteAnimator
                  rig={isVaelgor ? 'greatsword_skeleton' : 'demon_boss'}
                  config={bossSpriteConfig}
                  state="idle"
                  size={56}
                />
              </View>

              <View style={styles.bossHeaderInfo}>
                <View style={styles.raidTopRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.raidName}>
                      {raid.accessType === 'GUILD_ONLY' ? '🛡️ GUILD RAID: ' : '🌍 PUBLIC RAID: '}
                      {raid.bossName}
                    </Text>
                    <Text style={styles.subText}>
                      7-Day Window • Kill Bonus: 1.5x Spoils &amp; Mythic Loot Table
                    </Text>
                  </View>
                  <Text style={styles.hpPctLabel}>{hpPct.toFixed(1)}% HP</Text>
                </View>

                <View style={styles.bossHpTrack}>
                  <View style={[styles.bossHpFill, { width: `${hpPct}%` }]} />
                </View>
                <Text style={styles.hpCaption}>
                  {raid.currentHp.toLocaleString()} / {raid.maxHp.toLocaleString()} HP{' '}
                  {isSlain ? '— 💀 BOSS DEFEATED!' : ''}
                </Text>
              </View>
            </View>

            {/* Participant Contribution Leaderboard */}
            <View style={styles.contribBox}>
              {raid.participants.map((p) => {
                const total =
                  p.combatDamageDealt + p.workoutEnergyDamage + p.supportScore;
                const isPlayerHero = p.characterId === 'player_hero';
                const displayName = isPlayerHero
                  ? `${characterName || 'Hero'} (You)`
                  : p.name;
                return (
                  <View key={p.characterId} style={styles.contribRow}>
                    <Text
                      style={[
                        styles.contribName,
                        isPlayerHero && styles.contribNameYou,
                      ]}
                    >
                      {displayName}
                    </Text>
                    <Text style={styles.contribVal}>
                      {total.toLocaleString()} pts (⚡ {p.workoutEnergyDamage.toLocaleString()}{' '}
                      workout)
                    </Text>
                  </View>
                );
              })}
            </View>

            <View style={styles.raidActionsRow}>
              <Pressable
                style={[
                  styles.strikeBtn,
                  raid.dailyAttackUsedToday && styles.strikeBtnDone,
                ]}
                disabled={raid.dailyAttackUsedToday}
                onPress={() => {
                  const res = lockDailyRaidStrike(raid.id);
                  if (!res.ok) setNotice(res.error ?? null);
                  else
                    setNotice(
                      `Locked in Daily Raid Strike for ${res.damage?.toLocaleString()} damage!`
                    );
                }}
              >
                <Text
                  style={[
                    styles.strikeBtnText,
                    raid.dailyAttackUsedToday && styles.strikeBtnTextDone,
                  ]}
                >
                  {raid.dailyAttackUsedToday
                    ? '✓ Daily Strike Locked'
                    : '⚔️ Lock Daily Combat Strike'}
                </Text>
              </Pressable>

              <Pressable
                style={styles.rolloverBtn}
                onPress={() => resolveWeeklyRaidRewards(raid.id)}
              >
                <Text style={styles.rolloverBtnText}>
                  🎁 Preview/Claim 7d Rollover
                </Text>
              </Pressable>
            </View>

            {raid.lastResolution && (
              <View style={styles.resolutionBox}>
                <Text style={styles.resolutionTitle}>
                  Weekly Rollover: Pool [{raid.lastResolution.unlockedMilestonePool}] • Kill
                  Multiplier {raid.lastResolution.killBonusMultiplier}x
                </Text>
                {raid.lastResolution.participantRewards
                  .filter((r) => r.characterId === 'player_hero')
                  .map((my) => (
                    <View key={my.characterId}>
                      <Text style={styles.myRewardLine}>
                        Your Tier: [{my.rewardTier}] ({my.contributionPercentage}% contribution) → +
                        {my.goldAwarded} Gold, +{my.guildReputationAwarded} Guild Rep
                      </Text>
                      {my.lootDrops.map((d) => (
                        <Text
                          key={d.itemSlug}
                          style={{
                            color: RARITY_COLORS[d.rarity] ?? COLORS.gold,
                            fontSize: 12,
                            fontWeight: '700',
                            marginTop: 2,
                          }}
                        >
                          • Looted {d.quantity}x {d.itemName} [{d.rarity}]
                        </Text>
                      ))}
                    </View>
                  ))}
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    padding: 16,
    paddingBottom: 36,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 8,
  },
  liveSyncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgElevated,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  liveSyncBadgeActive: {
    borderColor: COLORS.agility,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
  },
  liveSyncDot: {
    fontSize: 9,
    marginRight: 4,
  },
  liveSyncText: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionTitle: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    marginTop: 8,
    marginBottom: 8,
  },
  card: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 10,
  },
  cardTitle: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  subText: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  goldBold: {
    color: COLORS.gold,
    fontWeight: '900',
  },
  rankRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  rankPill: {
    backgroundColor: COLORS.bgDeep,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  rankPillActive: {
    borderColor: COLORS.gold,
    backgroundColor: COLORS.goldDim,
  },
  rankPillText: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '800',
  },
  rankPillTextActive: {
    color: COLORS.gold,
  },
  noticeBox: {
    backgroundColor: COLORS.bgElevated,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.gold,
    padding: 10,
    marginBottom: 10,
  },
  noticeText: {
    color: COLORS.gold,
    fontSize: 12,
    fontWeight: '700',
  },
  bountyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgCard,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  bountyCardReady: {
    borderColor: COLORS.gold,
    backgroundColor: 'rgba(253, 230, 138, 0.05)',
  },
  bountyTitle: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  bountyDesc: {
    color: COLORS.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  bountyProgressRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  bountyProgressPill: {
    backgroundColor: COLORS.bgDeep,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  bountyProgressPillReady: {
    borderColor: COLORS.gold,
    backgroundColor: COLORS.goldDim,
  },
  bountyProgressPillText: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: '700',
  },
  bountyProgressPillTextReady: {
    color: COLORS.gold,
  },
  bountyProgressTrack: {
    height: 5,
    backgroundColor: COLORS.bgDeep,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 6,
  },
  bountyProgressFill: {
    height: '100%',
    backgroundColor: COLORS.gold,
    borderRadius: 4,
  },
  bountyProgressFillDone: {
    backgroundColor: COLORS.success,
  },
  rewardMeta: {
    color: COLORS.gold,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 5,
  },
  claimBtn: {
    backgroundColor: COLORS.gold,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 7,
    minWidth: 78,
    alignItems: 'center',
  },
  claimBtnLocked: {
    backgroundColor: '#18181B',
    borderColor: '#3F3F46',
    borderWidth: 1,
  },
  claimBtnDone: {
    backgroundColor: '#1E293B',
    borderColor: '#334155',
    borderWidth: 1,
    opacity: 1,
  },
  claimBtnTextLocked: {
    color: '#A1A1AA',
    fontWeight: '700',
  },
  claimBtnTextDone: {
    color: '#A1A1AA',
    fontWeight: '700',
  },
  claimBtnText: {
    color: COLORS.bgDeep,
    fontSize: 11,
    fontWeight: '800',
  },
  contribNameYou: {
    color: COLORS.gold,
    fontWeight: '800',
  },
  guildHeaderCard: {
    backgroundColor: COLORS.bgElevated,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.borderHighlight,
    marginBottom: 10,
  },
  guildNameText: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 2,
  },
  raidCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 12,
  },
  bossHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  bossAvatarFrame: {
    width: 56,
    height: 56,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#DC2626',
    backgroundColor: '#1E1218',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bossHeaderInfo: {
    flex: 1,
  },
  raidTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  raidName: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  hpPctLabel: {
    color: COLORS.strength,
    fontSize: 13,
    fontWeight: '900',
  },
  bossHpTrack: {
    height: 10,
    backgroundColor: COLORS.bgDeep,
    borderRadius: 6,
    overflow: 'hidden',
  },
  bossHpFill: {
    height: '100%',
    backgroundColor: COLORS.strength,
  },
  hpCaption: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 4,
    marginBottom: 10,
  },
  contribBox: {
    backgroundColor: COLORS.bgDeep,
    borderRadius: 8,
    padding: 8,
    marginBottom: 10,
  },
  contribRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  contribName: {
    color: COLORS.textPrimary,
    fontSize: 11,
    fontWeight: '600',
  },
  contribVal: {
    color: COLORS.textSecondary,
    fontSize: 11,
  },
  raidActionsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  strikeBtn: {
    flex: 1,
    minWidth: 150,
    backgroundColor: COLORS.strength,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  strikeBtnDone: {
    backgroundColor: '#1E293B',
    borderColor: '#334155',
    borderWidth: 1,
    opacity: 1,
  },
  strikeBtnText: {
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '800',
  },
  strikeBtnTextDone: {
    color: '#A1A1AA',
    fontWeight: '700',
  },
  rolloverBtn: {
    backgroundColor: COLORS.bgElevated,
    borderWidth: 1,
    borderColor: COLORS.gold,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  rolloverBtnText: {
    color: COLORS.gold,
    fontSize: 12,
    fontWeight: '700',
  },
  resolutionBox: {
    marginTop: 10,
    backgroundColor: COLORS.goldDim,
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.gold,
  },
  resolutionTitle: {
    color: COLORS.gold,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 4,
  },
  myRewardLine: {
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
});

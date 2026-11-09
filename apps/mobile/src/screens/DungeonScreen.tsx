import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { isAdventurerRankSufficient, type DungeonDefinition } from '@goki/game-engine';
import { AutoBattlerArena } from './Battle/AutoBattlerArena';
import { useWebSocket } from '../hooks/useWebSocket';
import { useGame } from '../state/GameContext';
import { COLORS } from '../theme';

export const DungeonScreen: React.FC = () => {
  const {
    dungeons,
    starterDungeon,
    adventurerRank,
    companionRoster,
    activeDungeonRun,
    isLiveSyncConnected,
    startDungeonExpedition,
    resolveActiveDungeonNow,
    dismissCompletedDungeonReplay,
  } = useGame();

  const dungeonCatalog = dungeons && dungeons.length > 0 ? dungeons : [starterDungeon];
  const [selectedDungeonSlug, setSelectedDungeonSlug] = useState<string>(
    activeDungeonRun?.dungeon.dungeonSlug ?? dungeonCatalog[0]?.dungeonSlug ?? 'obsidian_catacombs'
  );

  const selectedDungeon =
    dungeonCatalog.find((d) => d.dungeonSlug === selectedDungeonSlug) ??
    dungeonCatalog[0] ??
    starterDungeon;

  const isSelectedUnlocked = isAdventurerRankSufficient(
    adventurerRank,
    selectedDungeon.requiredRank ?? 'COPPER'
  );

  const [selectedAllies, setSelectedAllies] = useState<string[]>([
    'ally_lyra',
    'ally_kaelen',
  ]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Subscribe to real-time dungeon expedition room
  const dungeonRoom = `dungeon:${activeDungeonRun?.dungeon.dungeonSlug ?? selectedDungeon.dungeonSlug}`;
  const { isConnected: isWsConnected } = useWebSocket({ room: dungeonRoom });

  const toggleAlly = (id: string) => {
    setSelectedAllies((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(0, 4)
    );
  };

  const getDungeonEncountersSummary = (d: DungeonDefinition) => {
    const mobs = d.rooms.filter((r) => r.roomType === 'MOB_ENCOUNTER').length;
    const hazards = d.rooms.filter((r) => r.roomType === 'HAZARD_EVENT').length;
    const chests = d.rooms.filter((r) => r.roomType === 'LOOT_CHEST').length;
    const bossRoom = d.rooms.find((r) => r.roomType === 'BOSS');
    const bossName = bossRoom?.enemies?.[0]?.name ?? 'Boss';
    return `${d.rooms.length} Encounters: ${mobs} Combat Wave${mobs > 1 ? 's' : ''} • ${hazards} Hazard${hazards > 1 ? 's' : ''} → ${bossName} → ${chests} Reliquary Cache${chests > 1 ? 's' : ''}`;
  };

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>24-Hour Dungeons</Text>
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

      {/* Horizontal Expedition Tier Selector */}
      <View style={styles.tierSelectorHeaderRow}>
        <Text style={styles.tierSelectorTitle}>EXPEDITION CAMPAIGNS (RANK-GATED)</Text>
        <Text style={styles.rankBadge}>Rank: {adventurerRank}</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tierSelectorScroll}
      >
        {dungeonCatalog.map((d) => {
          const unlocked = isAdventurerRankSufficient(adventurerRank, d.requiredRank ?? 'COPPER');
          const isSelected = selectedDungeon.dungeonSlug === d.dungeonSlug;

          return (
            <Pressable
              key={d.dungeonSlug}
              style={[
                styles.tierCard,
                isSelected && styles.tierCardSelected,
                !unlocked && styles.tierCardLocked,
              ]}
              onPress={() => {
                setSelectedDungeonSlug(d.dungeonSlug);
                setErrorMsg(null);
              }}
              testID={`dungeon-tier-card-${d.dungeonSlug}`}
            >
              <View style={styles.tierTopRow}>
                <View
                  style={[
                    styles.rankPill,
                    d.requiredRank === 'GOLD'
                      ? styles.rankPillGold
                      : d.requiredRank === 'SILVER'
                        ? styles.rankPillSilver
                        : d.requiredRank === 'BRONZE'
                          ? styles.rankPillBronze
                          : styles.rankPillCopper,
                  ]}
                >
                  <Text style={styles.rankPillText}>{d.requiredRank ?? 'COPPER'}</Text>
                </View>
                <View style={styles.rewardMultiplierPill}>
                  <Text style={styles.rewardMultiplierText}>
                    {d.rewardMultiplierLabel ?? '1.0x'}
                  </Text>
                </View>
              </View>

              <Text style={styles.tierName} numberOfLines={1}>
                {d.dungeonName}
              </Text>

              <Text style={styles.tierThemeText} numberOfLines={1}>
                {d.themeLabel ?? 'Expedition'}
              </Text>

              <View style={styles.tierMetaRow}>
                <Text style={styles.tierRoomCount}>{d.rooms.length} Rooms</Text>
                <Text style={styles.tierPowerText}>⚡ {d.recommendedPower ?? 100}</Text>
              </View>

              {!unlocked && (
                <View style={styles.tierLockOverlay}>
                  <Text style={styles.tierLockText}>🔒 Req. {d.requiredRank}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Party Lobby Builder */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>{selectedDungeon.dungeonName}</Text>
          <View style={styles.cardRankBadge}>
            <Text style={styles.cardRankBadgeText}>{selectedDungeon.requiredRank ?? 'COPPER'}</Text>
          </View>
        </View>

        <Text style={styles.roomListText}>
          {getDungeonEncountersSummary(selectedDungeon)}
        </Text>

        <Text style={styles.subHeader}>
          Assemble Co-op Party (1–5 Players • Currently {1 + selectedAllies.length}/5):
        </Text>
        <View style={styles.allyList}>
          {companionRoster.map((ally) => {
            const active = selectedAllies.includes(ally.characterId);
            return (
              <Pressable
                key={ally.characterId}
                style={[styles.allyChip, active && styles.allyChipActive]}
                onPress={() => toggleAlly(ally.characterId)}
              >
                <Text style={[styles.allyText, active && styles.allyTextActive]}>
                  {active ? '✓ ' : '+ '}
                  {ally.name} (STR {ally.coreStats.strengthLevel} / END{' '}
                  {ally.coreStats.enduranceLevel} / AGI {ally.coreStats.agilityLevel})
                </Text>
              </Pressable>
            );
          })}
        </View>

        {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

        <Pressable
          style={[
            styles.launchBtn,
            (activeDungeonRun?.status === 'ACTIVE_WINDOW' || !isSelectedUnlocked) &&
              styles.btnDisabled,
          ]}
          disabled={activeDungeonRun?.status === 'ACTIVE_WINDOW' || !isSelectedUnlocked}
          onPress={() => {
            const res = startDungeonExpedition(selectedAllies, selectedDungeon.dungeonSlug);
            if (!res.ok) setErrorMsg(res.error ?? null);
            else setErrorMsg(null);
          }}
          testID="dungeon-launch-expedition-btn"
        >
          <Text
            style={[
              styles.launchBtnText,
              (activeDungeonRun?.status === 'ACTIVE_WINDOW' || !isSelectedUnlocked) &&
                styles.btnDisabledText,
            ]}
          >
            {activeDungeonRun?.status === 'ACTIVE_WINDOW'
              ? '⏳ 24-Hour Expedition Window Active'
              : !isSelectedUnlocked
                ? `🔒 Locked — Requires ${selectedDungeon.requiredRank} Adventurer Rank`
                : `🏰 Lock In 24-Hour Run (${1 + selectedAllies.length} Player${
                    selectedAllies.length > 0 ? 's' : ' Solo'
                  })`}
          </Text>
        </Pressable>
      </View>

      {/* 2D Deterministic Auto-Battler Visual Replay Viewer / Live Expedition Patrol */}
      {activeDungeonRun && (
        <AutoBattlerArena
          dungeon={activeDungeonRun.dungeon}
          replay={activeDungeonRun.replay}
          activeWorkoutBuffs={activeDungeonRun.activeWorkoutBuffs}
          party={activeDungeonRun.party}
          onDismiss={dismissCompletedDungeonReplay}
        />
      )}

      {activeDungeonRun?.status === 'ACTIVE_WINDOW' && (
        <Pressable style={styles.resolveBtn} onPress={resolveActiveDungeonNow}>
          <Text style={styles.resolveBtnText}>
            ⚔️ Complete 24h Window &amp; Simulate Auto-Battler Replay
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
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
    marginBottom: 6,
  },
  subtitle: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
  },
  tierSelectorHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  tierSelectorTitle: {
    color: COLORS.gold,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  rankBadge: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  tierSelectorScroll: {
    paddingBottom: 12,
    gap: 10,
  },
  tierCard: {
    width: 154,
    backgroundColor: COLORS.bgCard,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    padding: 10,
    position: 'relative',
    overflow: 'hidden',
  },
  tierCardSelected: {
    borderColor: COLORS.gold,
    backgroundColor: '#191E2C',
  },
  tierCardLocked: {
    opacity: 0.75,
  },
  tierTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  rankPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    backgroundColor: COLORS.bgElevated,
  },
  rankPillCopper: {
    backgroundColor: 'rgba(180, 83, 9, 0.25)',
  },
  rankPillBronze: {
    backgroundColor: 'rgba(217, 119, 6, 0.28)',
  },
  rankPillSilver: {
    backgroundColor: 'rgba(148, 163, 184, 0.28)',
  },
  rankPillGold: {
    backgroundColor: 'rgba(234, 179, 8, 0.28)',
  },
  rankPillText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  rewardMultiplierPill: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: 'rgba(34, 197, 94, 0.18)',
  },
  rewardMultiplierText: {
    color: '#4ADE80',
    fontSize: 9,
    fontWeight: '800',
  },
  tierName: {
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 2,
  },
  tierThemeText: {
    color: COLORS.textMuted,
    fontSize: 10,
    marginBottom: 6,
  },
  tierMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  tierRoomCount: {
    color: COLORS.gold,
    fontSize: 10,
    fontWeight: '700',
  },
  tierPowerText: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: '600',
  },
  tierLockOverlay: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(239, 68, 68, 0.85)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tierLockText: {
    color: '#ffffff',
    fontSize: 8.5,
    fontWeight: '800',
  },
  card: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardTitle: {
    color: COLORS.gold,
    fontSize: 15,
    fontWeight: '800',
    flex: 1,
  },
  cardRankBadge: {
    backgroundColor: COLORS.bgElevated,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardRankBadgeText: {
    color: COLORS.gold,
    fontSize: 9.5,
    fontWeight: '800',
  },
  roomListText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 12,
  },
  subHeader: {
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  allyList: {
    gap: 6,
    marginBottom: 12,
  },
  allyChip: {
    backgroundColor: COLORS.bgDeep,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  allyChipActive: {
    borderColor: COLORS.agility,
    backgroundColor: COLORS.agilityDim,
  },
  allyText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  allyTextActive: {
    color: COLORS.agility,
    fontWeight: '700',
  },
  errorText: {
    color: COLORS.strength,
    fontSize: 12,
    marginBottom: 8,
  },
  launchBtn: {
    backgroundColor: COLORS.gold,
    paddingVertical: 12,
    borderRadius: 9,
    alignItems: 'center',
  },
  btnDisabled: {
    backgroundColor: '#1E293B',
    borderColor: '#334155',
    borderWidth: 1,
    opacity: 1,
  },
  btnDisabledText: {
    color: '#94A3B8',
  },
  launchBtnText: {
    color: COLORS.bgDeep,
    fontSize: 13,
    fontWeight: '900',
  },
  resolveBtn: {
    marginTop: 12,
    backgroundColor: COLORS.shieldCyan,
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: 'center',
  },
  resolveBtnText: {
    color: COLORS.bgDeep,
    fontSize: 13,
    fontWeight: '900',
  },
});

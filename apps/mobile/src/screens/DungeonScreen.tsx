import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AutoBattlerCanvas } from '../components/AutoBattlerCanvas';
import { useWebSocket } from '../hooks/useWebSocket';
import { useGame } from '../state/GameContext';
import { COLORS } from '../theme';

export const DungeonScreen: React.FC = () => {
  const {
    starterDungeon,
    companionRoster,
    activeDungeonRun,
    isLiveSyncConnected,
    startDungeonExpedition,
    resolveActiveDungeonNow,
  } = useGame();

  const [selectedAllies, setSelectedAllies] = useState<string[]>([
    'ally_lyra',
    'ally_kaelen',
  ]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Subscribe to real-time dungeon expedition room
  const dungeonRoom = `dungeon:${activeDungeonRun?.dungeon.dungeonSlug ?? starterDungeon.dungeonSlug}`;
  const { isConnected: isWsConnected } = useWebSocket({ room: dungeonRoom });

  const toggleAlly = (id: string) => {
    setSelectedAllies((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(0, 4)
    );
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
      <Text style={styles.subtitle}>
        Lock in a 1–5 player expedition for a 24-hour real-time window. Any real-world workout
        logged during the active window injects a Live Expedition Buff (e.g. Titanic Force Boss
        Shield or Tailwind Haste) before deterministic room-by-room combat resolves!
      </Text>

      {/* Party Lobby Builder */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{starterDungeon.dungeonName}</Text>
        <Text style={styles.roomListText}>
          4 Encounters: Crypt Gatehouse (Mobs) → Pendulum Blades (Trap Hazard) → Reliquary Chest →
          Bone Lord Malakor (Boss)
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
            activeDungeonRun?.status === 'ACTIVE_WINDOW' && styles.btnDisabled,
          ]}
          disabled={activeDungeonRun?.status === 'ACTIVE_WINDOW'}
          onPress={() => {
            const res = startDungeonExpedition(selectedAllies);
            if (!res.ok) setErrorMsg(res.error ?? null);
            else setErrorMsg(null);
          }}
        >
          <Text style={styles.launchBtnText}>
            {activeDungeonRun?.status === 'ACTIVE_WINDOW'
              ? '⏳ 24-Hour Expedition Window Active'
              : `🏰 Lock In 24-Hour Dungeon Run (${1 + selectedAllies.length} Player${
                  selectedAllies.length > 0 ? 's' : ' Solo'
                })`}
          </Text>
        </Pressable>
      </View>

      {/* Active 24-Hour Window & Live Workout Injection Buffs */}
      {activeDungeonRun && (
        <View style={styles.windowCard}>
          <View style={styles.windowHeader}>
            <Text style={styles.windowTitle}>
              {activeDungeonRun.status === 'ACTIVE_WINDOW'
                ? '🔥 24-Hour Expedition Window Open'
                : '📜 Expedition Resolved — Replay Ready'}
            </Text>
            <Text style={styles.partyBadge}>
              {activeDungeonRun.party.length} Adventurer(s)
            </Text>
          </View>

          <Text style={styles.buffLabel}>
            Live Workout Injection Buffs ({activeDungeonRun.activeWorkoutBuffs.length}):
          </Text>
          {activeDungeonRun.activeWorkoutBuffs.length === 0 ? (
            <Text style={styles.emptyBuffText}>
              None yet — switch to the Workout tab and log a lifting or cardio session right now to
              inject Titanic Force or Tailwind Haste mid-expedition!
            </Text>
          ) : (
            <View style={styles.buffWrap}>
              {activeDungeonRun.activeWorkoutBuffs.map((b) => (
                <View key={b.buffId} style={styles.buffPill}>
                  <Text style={styles.buffPillText}>⚡ {b.buffName}</Text>
                </View>
              ))}
            </View>
          )}

          {activeDungeonRun.status === 'ACTIVE_WINDOW' && (
            <Pressable style={styles.resolveBtn} onPress={resolveActiveDungeonNow}>
              <Text style={styles.resolveBtnText}>
                ⚔️ Complete 24h Window & Simulate Auto-Battler Replay
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {/* 2D Deterministic Auto-Battler Visual Replay Viewer */}
      {activeDungeonRun?.replay && (
        <AutoBattlerCanvas
          replay={activeDungeonRun.replay}
          dungeon={activeDungeonRun.dungeon}
        />
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
  card: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
  },
  cardTitle: {
    color: COLORS.gold,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  roomListText: {
    color: COLORS.textSecondary,
    fontSize: 12,
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
    backgroundColor: COLORS.bgElevated,
    opacity: 0.6,
  },
  launchBtnText: {
    color: COLORS.bgDeep,
    fontSize: 13,
    fontWeight: '900',
  },
  windowCard: {
    marginTop: 12,
    backgroundColor: COLORS.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.shieldCyan,
    padding: 14,
  },
  windowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  windowTitle: {
    color: COLORS.shieldCyan,
    fontSize: 14,
    fontWeight: '800',
  },
  partyBadge: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  buffLabel: {
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptyBuffText: {
    color: COLORS.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  buffWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  buffPill: {
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.gold,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  buffPillText: {
    color: COLORS.gold,
    fontSize: 11,
    fontWeight: '800',
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

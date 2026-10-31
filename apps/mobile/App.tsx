import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { HolisticStatType, StatType, isIntraWorkoutFocusLocked } from '@gymify/game-engine';
import { CharacterProfileScreen } from './src/screens/CharacterProfileScreen';
import { DungeonScreen } from './src/screens/DungeonScreen';
import { GatheringScreen } from './src/screens/GatheringScreen';
import { GuildHallScreen } from './src/screens/GuildHallScreen';
import { LandingScreen } from './src/screens/LandingScreen';
import { OfflineWorkoutScreen } from './src/screens/OfflineWorkoutScreen';
import { TalentBuilderScreen } from './src/screens/TalentBuilderScreen';
import { WorkoutLoggerScreen } from './src/screens/WorkoutLoggerScreen';
import { GameLocation, GameProvider, useGame } from './src/state/GameContext';
import { COLORS, CRIMSON_ONI } from './src/theme';

export type AppMode = 'LANDING' | 'OFFLINE_WORKOUT' | 'WORLD';

export type ActiveTab =
  | 'PROFILE'
  | 'WORKOUT'
  | 'TALENTS'
  | 'GATHERING'
  | 'DUNGEON'
  | 'GUILD';

/**
 * Default destination tab when clicking "Enter World" on LandingScreen.
 * Designed as a clean constant so future updates can swap to a World Map screen effortlessly.
 */
export const DEFAULT_WORLD_ENTRY_TAB: ActiveTab = 'PROFILE';

const LOCATIONS: Array<{ key: GameLocation; label: string }> = [
  { key: 'TAVERN', label: '🍺 Tavern' },
  { key: 'GUILD_HALL', label: '🛡️ Guild Hall' },
  { key: 'GATHERING_NODE', label: '⛏️ Nodes' },
  { key: 'DUNGEON', label: '🏰 Dungeon' },
  { key: 'RAID_SANCTUM', label: '🐉 Raid' },
];

const TAB_ITEMS: ReadonlyArray<{ key: ActiveTab; icon: string; label: string }> = [
  { key: 'PROFILE', icon: '🛡️', label: 'Profile' },
  { key: 'WORKOUT', icon: '🏋️', label: 'Workout' },
  { key: 'TALENTS', icon: '🌳', label: 'Talents' },
  { key: 'GATHERING', icon: '⛏️', label: '2h Idle' },
  { key: 'DUNGEON', icon: '🏰', label: '24h Replay' },
  { key: 'GUILD', icon: '🐉', label: 'Guild & Raid' },
];

interface MainShellProps {
  tab: ActiveTab;
  onChangeTab: (next: ActiveTab) => void;
  onReturnToLanding: () => void;
}

const MainShell: React.FC<MainShellProps> = ({
  tab,
  onChangeTab,
  onReturnToLanding,
}) => {
  const {
    serverOnline,
    characterName,
    overallLevel,
    adventurerRank,
    gold,
    location,
    stats,
    workoutMachine,
    unclaimedSpoilsCount,
    travelTo,
    requestFocusOverride,
    cancelFocusOverride,
    confirmFocusOverride,
  } = useGame();

  const [talentFocusStat, setTalentFocusStat] = useState<HolisticStatType | StatType | undefined>(
    undefined
  );

  const focusLocked = isIntraWorkoutFocusLocked(workoutMachine.phase);
  const pendingTargetTab = workoutMachine.activeSession?.pendingFocusOverrideTarget as
    | ActiveTab
    | null
    | undefined;

  const handleTabPress = (nextTab: ActiveTab) => {
    if (nextTab === 'WORKOUT') {
      onChangeTab('WORKOUT');
      return;
    }
    // Phase 2 Zero-Cognitive-Drag Gate: Require explicit cognitive-friction confirmation mid-workout
    if (focusLocked && tab === 'WORKOUT') {
      requestFocusOverride(nextTab);
      return;
    }
    onChangeTab(nextTab);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
      <StatusBar style="light" />
      <View style={styles.appFrame}>
        {/* Top RPG Character HUD */}
        <View style={styles.hudContainer}>
          <View style={styles.hudTopRow}>
            <View style={styles.hudLeftCluster}>
              <Pressable
                style={styles.landingHubBtn}
                onPress={onReturnToLanding}
                accessibilityLabel="Return to Landing Screen"
              >
                <Text style={styles.landingHubBtnText}>⛩️ Hub</Text>
              </Pressable>

              <View style={{ flexShrink: 1 }}>
                <Text style={styles.heroName} numberOfLines={1}>
                  {characterName}{' '}
                  <Text style={styles.rankBadge}>
                    Lv.{overallLevel} [{adventurerRank}]
                  </Text>
                </Text>
                <Text style={styles.statMiniLine}>
                  STR {stats.STRENGTH.level} • END {stats.ENDURANCE.level} • AGI{' '}
                  {stats.AGILITY.level} • Phase: {workoutMachine.phase}
                </Text>
              </View>
            </View>

            <View style={styles.hudRight}>
              <Text style={styles.goldText}>🪙 {gold}g</Text>
              <Text
                style={[
                  styles.connBadge,
                  { color: serverOnline ? COLORS.success : COLORS.textMuted },
                ]}
              >
                {serverOnline ? '● API Live' : '● Engine Live'}
              </Text>
            </View>
          </View>

          {/* Phase 2 Focus Lock replaces Instant Travel Strip during DungeonActive / Resting */}
          {focusLocked ? (
            <View style={styles.focusLockBanner}>
              <Text style={styles.focusLockText}>
                🔒 FOCUS LOCK ({workoutMachine.phase.toUpperCase()}) • 1.25x Arrival Boon Active
              </Text>
              {tab !== 'WORKOUT' && (
                <Pressable
                  style={styles.returnFocusBtn}
                  onPress={() => onChangeTab('WORKOUT')}
                >
                  <Text style={styles.returnFocusBtnText}>↩ Return to Set</Text>
                </Pressable>
              )}
            </View>
          ) : (
            <View style={styles.travelStrip}>
              <Text style={styles.travelLabel}>Instant Travel:</Text>
              {LOCATIONS.map((loc) => (
                <Pressable
                  key={loc.key}
                  style={[
                    styles.locChip,
                    location === loc.key && styles.locChipActive,
                  ]}
                  onPress={() => travelTo(loc.key)}
                >
                  <Text
                    style={[
                      styles.locChipText,
                      location === loc.key && styles.locChipTextActive,
                    ]}
                  >
                    {loc.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* Active Screen Viewport */}
        <View style={styles.screenBody}>
          {tab === 'PROFILE' && (
            <CharacterProfileScreen
              onJumpToTalents={(stat) => {
                if (stat) setTalentFocusStat(stat);
                handleTabPress('TALENTS');
              }}
            />
          )}
          {tab === 'WORKOUT' && <WorkoutLoggerScreen />}
          {tab === 'TALENTS' && (
            <TalentBuilderScreen
              initialStat={talentFocusStat}
              onOpenProfileGear={() => handleTabPress('PROFILE')}
            />
          )}
          {tab === 'GATHERING' && <GatheringScreen />}
          {tab === 'DUNGEON' && <DungeonScreen />}
          {tab === 'GUILD' && <GuildHallScreen />}
        </View>

        {/* Bottom RPG Navigation Bar with Intra-Workout Lock Indicators */}
        <View style={styles.tabBar}>
          {TAB_ITEMS.map((item) => {
            const active = tab === item.key;
            const locked = focusLocked && item.key !== 'WORKOUT';
            const showSpoilsDot = item.key === 'PROFILE' && unclaimedSpoilsCount > 0;

            return (
              <Pressable
                key={item.key}
                style={[styles.tabItem, active && styles.tabItemActive]}
                onPress={() => handleTabPress(item.key)}
              >
                <View style={styles.tabIconWrap}>
                  <Text style={styles.tabIcon}>
                    {locked ? '🔒' : item.icon}
                  </Text>
                  {showSpoilsDot && <View style={styles.spoilsDot} />}
                </View>
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Cognitive-Friction Confirmation Dialog (Only shown if user explicitly taps a locked tab mid-workout) */}
        <Modal
          visible={Boolean(pendingTargetTab)}
          transparent
          animationType="fade"
          onRequestClose={cancelFocusOverride}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.frictionDialog}>
              <Text style={styles.frictionTitle}>🛡️ Break Dungeon Focus?</Text>
              <Text style={styles.frictionBody}>
                Your Stamina &amp; neural drive peak when you stay locked into your sets. Stat
                allocation, inventory sorting, and Guild menus unlock automatically at Finish
                Workout.
              </Text>

              <Pressable
                style={styles.stayFocusedBtn}
                onPress={cancelFocusOverride}
              >
                <Text style={styles.stayFocusedBtnText}>
                  ⚔️ Stay Focused on Workout (Recommended)
                </Text>
              </Pressable>

              <Pressable
                style={styles.overrideFocusBtn}
                onPress={() => {
                  const dest = pendingTargetTab;
                  confirmFocusOverride();
                  if (dest) onChangeTab(dest);
                }}
              >
                <Text style={styles.overrideFocusBtnText}>
                  Break Focus &amp; Open {pendingTargetTab} Anyway
                </Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
};

const AppRouter: React.FC = () => {
  const { notificationTapTick, syncOfflineWorkouts } = useGame();
  const [appMode, setAppMode] = useState<AppMode>('LANDING');
  const [worldTab, setWorldTab] = useState<ActiveTab>(DEFAULT_WORLD_ENTRY_TAB);

  useEffect(() => {
    if (notificationTapTick > 0) {
      setWorldTab('WORKOUT');
      setAppMode('WORLD');
    }
  }, [notificationTapTick]);

  if (appMode === 'LANDING') {
    return (
      <SafeAreaView
        style={styles.landingSafeArea}
        edges={['top', 'bottom', 'left', 'right']}
      >
        <StatusBar style="light" />
        <LandingScreen
          onSelectOfflineWorkout={() => setAppMode('OFFLINE_WORKOUT')}
          onSelectOnlineWorkout={() => {
            setWorldTab('WORKOUT');
            setAppMode('WORLD');
          }}
          onEnterWorld={() => {
            void syncOfflineWorkouts({ evaluateLocallyIfOffline: true });
            setWorldTab(DEFAULT_WORLD_ENTRY_TAB);
            setAppMode('WORLD');
          }}
        />
      </SafeAreaView>
    );
  }

  if (appMode === 'OFFLINE_WORKOUT') {
    return (
      <SafeAreaView
        style={styles.offlineSafeArea}
        edges={['top', 'bottom', 'left', 'right']}
      >
        <StatusBar style="light" />
        <OfflineWorkoutScreen
          onFinishAndReturn={() => setAppMode('LANDING')}
          onBackToLanding={() => setAppMode('LANDING')}
        />
      </SafeAreaView>
    );
  }

  return (
    <MainShell
      tab={worldTab}
      onChangeTab={setWorldTab}
      onReturnToLanding={() => setAppMode('LANDING')}
    />
  );
};

export default function App() {
  return (
    <SafeAreaProvider>
      <GameProvider>
        <AppRouter />
      </GameProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  landingSafeArea: {
    flex: 1,
    backgroundColor: CRIMSON_ONI.charcoalBase,
  },
  offlineSafeArea: {
    flex: 1,
    backgroundColor: CRIMSON_ONI.charcoalDeep,
  },
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.bgDeep,
  },
  appFrame: {
    flex: 1,
    width: '100%',
    maxWidth: 960,
    alignSelf: 'center',
    backgroundColor: COLORS.bgDeep,
  },
  hudContainer: {
    backgroundColor: COLORS.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  hudTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  hudLeftCluster: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  landingHubBtn: {
    backgroundColor: CRIMSON_ONI.crimsonDim,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.agedGold,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  landingHubBtnText: {
    color: CRIMSON_ONI.agedGoldBright,
    fontSize: 11,
    fontWeight: '900',
  },
  heroName: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '900',
  },
  rankBadge: {
    color: COLORS.gold,
    fontSize: 12,
  },
  statMiniLine: {
    color: COLORS.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  hudRight: {
    alignItems: 'flex-end',
  },
  goldText: {
    color: COLORS.gold,
    fontSize: 14,
    fontWeight: '800',
  },
  connBadge: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  focusLockBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.goldDim,
    borderWidth: 1,
    borderColor: COLORS.gold,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 8,
  },
  focusLockText: {
    color: COLORS.gold,
    fontSize: 11,
    fontWeight: '800',
    flex: 1,
  },
  returnFocusBtn: {
    backgroundColor: COLORS.gold,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 8,
  },
  returnFocusBtnText: {
    color: COLORS.bgDeep,
    fontSize: 11,
    fontWeight: '900',
  },
  travelStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  travelLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  locChip: {
    backgroundColor: COLORS.bgElevated,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  locChipActive: {
    borderColor: COLORS.gold,
    backgroundColor: COLORS.goldDim,
  },
  locChipText: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: '700',
  },
  locChipTextActive: {
    color: COLORS.gold,
  },
  screenBody: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.bgCard,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 8,
  },
  tabItemActive: {
    backgroundColor: COLORS.bgElevated,
  },
  tabIconWrap: {
    position: 'relative',
  },
  tabIcon: {
    fontSize: 16,
  },
  spoilsDot: {
    position: 'absolute',
    top: -2,
    right: -6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: CRIMSON_ONI.agedGoldBright,
    borderWidth: 1,
    borderColor: COLORS.bgCard,
  },
  tabLabel: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  tabLabelActive: {
    color: COLORS.gold,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(9, 12, 18, 0.84)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  frictionDialog: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: COLORS.bgCard,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: COLORS.gold,
    padding: 20,
  },
  frictionTitle: {
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 8,
  },
  frictionBody: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 16,
  },
  stayFocusedBtn: {
    minHeight: 54,
    backgroundColor: COLORS.gold,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    paddingHorizontal: 12,
  },
  stayFocusedBtnText: {
    color: COLORS.bgDeep,
    fontSize: 13,
    fontWeight: '900',
  },
  overrideFocusBtn: {
    minHeight: 46,
    backgroundColor: COLORS.bgElevated,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  overrideFocusBtnText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
});

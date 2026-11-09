import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { HolisticStatType, StatType, isIntraWorkoutFocusLocked } from '@goki/game-engine';
import { BugReportModal } from './src/components/BugReportModal';
import { CharacterPortraitFrame } from './src/components/CharacterPortraitFrame';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { TopMenuBorderArt } from './src/components/TopMenuBorderArt';
import { UpdateBanner } from './src/components/UpdateBanner';
import { autoUpdateManager } from './src/services/AutoUpdateManager';
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

export interface LocationOption {
  key: GameLocation;
  label: string;
  name: string;
  icon: string;
  desc: string;
}

const LOCATIONS: Array<LocationOption> = [
  { key: 'TAVERN', label: '🍺 Tavern', name: 'Tavern', icon: '🍺', desc: 'Rest & Recover' },
  { key: 'GUILD_HALL', label: '🛡️ Guild Hall', name: 'Guild Hall', icon: '🛡️', desc: 'Bounties & Roster' },
  { key: 'GATHERING_NODE', label: '⛏️ Nodes', name: 'Gathering Nodes', icon: '⛏️', desc: 'Resource Harvesting' },
  { key: 'DUNGEON', label: '🏰 Dungeon', name: 'Dungeon', icon: '🏰', desc: 'Delves & Spoils' },
  { key: 'RAID_SANCTUM', label: '🐉 Raid', name: 'Raid Sanctum', icon: '🐉', desc: 'Epic Boss Battles' },
];

const TAB_ITEMS: ReadonlyArray<{ key: ActiveTab; icon: string; label: string }> = [
  { key: 'WORKOUT', icon: '🏋️', label: 'Workout' },
  { key: 'TALENTS', icon: '🌳', label: 'Talents' },
  { key: 'GATHERING', icon: '⛏️', label: 'Artisan' },
  { key: 'DUNGEON', icon: '🏰', label: 'Expeditions' },
  { key: 'GUILD', icon: '🐉', label: 'Guild' },
];

interface MainShellProps {
  tab: ActiveTab;
  onChangeTab: (next: ActiveTab) => void;
  onReturnToLanding: () => void;
  onOpenOfflineLogger?: () => void;
}

const MainShell: React.FC<MainShellProps> = ({
  tab,
  onChangeTab,
  onReturnToLanding,
  onOpenOfflineLogger,
}) => {
  const {
    serverOnline,
    characterName,
    characterArtUri,
    appearanceId,
    overallLevel,
    gold,
    location,
    workoutMachine,
    unclaimedSpoilsCount,
    travelTo,
    requestFocusOverride,
    cancelFocusOverride,
    confirmFocusOverride,
    activeCharacterId,
    currentUser,
  } = useGame();

  const insets = useSafeAreaInsets();
  const [talentFocusStat, setTalentFocusStat] = useState<HolisticStatType | StatType | undefined>(
    undefined
  );
  const [bugReportVisible, setBugReportVisible] = useState(false);

  const focusLocked = isIntraWorkoutFocusLocked(workoutMachine.phase);
  const pendingTargetTab = workoutMachine.activeSession?.pendingFocusOverrideTarget as
    | ActiveTab
    | null
    | undefined;

  const resolvedLocationKey: GameLocation =
    tab === 'WORKOUT'
      ? 'RAID_SANCTUM'
      : tab === 'GATHERING'
        ? 'GATHERING_NODE'
        : tab === 'DUNGEON'
          ? 'DUNGEON'
          : tab === 'GUILD'
            ? 'GUILD_HALL'
            : location || 'TAVERN';

  const currentLocation = LOCATIONS.find((l) => l.key === resolvedLocationKey) ?? LOCATIONS[0]!;

  const handleTabPress = (nextTab: ActiveTab) => {
    const nextLoc: GameLocation =
      nextTab === 'WORKOUT'
        ? 'RAID_SANCTUM'
        : nextTab === 'GATHERING'
          ? 'GATHERING_NODE'
          : nextTab === 'DUNGEON'
            ? 'DUNGEON'
            : nextTab === 'GUILD'
              ? 'GUILD_HALL'
              : 'TAVERN';

    if (nextTab === 'WORKOUT') {
      travelTo(nextLoc);
      onChangeTab('WORKOUT');
      return;
    }
    // Phase 2 Zero-Cognitive-Drag Gate: Require explicit cognitive-friction confirmation mid-workout
    if (focusLocked && tab === 'WORKOUT') {
      requestFocusOverride(nextTab);
      return;
    }
    travelTo(nextLoc);
    onChangeTab(nextTab);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
      <StatusBar style="light" />
      <View style={styles.appFrame}>
        {/* Top RPG Character HUD */}
        <View style={styles.hudContainer}>
          {/* Top Border Art: Tastefully offsets HUD from top screen edge and frames the center portrait */}
          <TopMenuBorderArt height={18} />

          <View style={styles.hudTopRow}>
            {/* Left Cluster: Return to Hub + Bug Report Button + Connection Dot */}
            <View style={styles.hudLeftCluster}>
              <Pressable
                style={styles.landingHubBtn}
                onPress={onReturnToLanding}
                accessibilityRole="button"
                accessibilityLabel="Return to Landing Screen"
              >
                <Text style={styles.landingHubBtnText}>⛩️ Hub</Text>
              </Pressable>

              <Pressable
                style={styles.hudBugBtn}
                onPress={() => setBugReportVisible(true)}
                accessibilityRole="button"
                accessibilityLabel="Report Bug or Feature Suggestion"
              >
                <Text style={styles.hudBugBtnText}>🐛</Text>
              </Pressable>

              <View
                style={[
                  styles.connDot,
                  { backgroundColor: serverOnline ? COLORS.success : '#9CA3AF' },
                ]}
                accessibilityLabel={serverOnline ? 'Server Online' : 'Engine Live'}
              />
            </View>

            {/* Center: Character Portrait Circle (slightly larger than bar, tapping opens Profile) */}
            <View style={styles.hudCenterPortraitWrap}>
              <Pressable
                style={[
                  styles.hudPortraitPressable,
                  tab === 'PROFILE' && styles.hudPortraitPressableActive,
                ]}
                onPress={() => handleTabPress('PROFILE')}
                accessibilityRole="button"
                accessibilityLabel={`Character ${characterName}, Level ${overallLevel}. Tap to view Character Profile.`}
              >
                <CharacterPortraitFrame
                  variant="circle"
                  height={56}
                  isCircle
                  isActive={tab === 'PROFILE'}
                  appearanceId={appearanceId}
                  imageSource={characterArtUri}
                />
                {/* Mini Level badge */}
                <View style={styles.hudPortraitLevelPill}>
                  <Text style={styles.hudPortraitLevelText}>Lv.{overallLevel}</Text>
                </View>
                {/* Unclaimed spoils notification badge */}
                {unclaimedSpoilsCount > 0 && (
                  <View style={styles.hudPortraitSpoilsBadge}>
                    <Text style={styles.hudPortraitSpoilsText}>!</Text>
                  </View>
                )}
              </Pressable>
            </View>

            {/* Right Cluster: Gold + Cosmetic Location Identifier */}
            <View style={styles.hudRightCluster}>
              <View style={styles.hudGoldPill}>
                <Text style={styles.goldText}>🪙 {gold}g</Text>
              </View>

              <View
                style={styles.hudLocationBtn}
                accessibilityLabel={`Current location: ${currentLocation.name}`}
              >
                <Text style={styles.hudLocationBtnText} numberOfLines={1}>
                  {currentLocation.icon} {currentLocation.name}
                </Text>
              </View>
            </View>
          </View>

          {/* Phase 2 Focus Lock replaces Instant Travel Strip during DungeonActive / Resting */}
          {focusLocked && (
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
          {tab === 'WORKOUT' && (
            <WorkoutLoggerScreen
              onOpenOfflineLogger={onOpenOfflineLogger}
              onNavigateToTalents={() => handleTabPress('TALENTS')}
              onNavigateToPaperdoll={() => handleTabPress('PROFILE')}
            />
          )}
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
          <View
            style={[
              styles.modalBackdrop,
              {
                paddingTop: Math.max(insets.top + 16, 44),
                paddingBottom: Math.max(insets.bottom + 16, 24),
              },
            ]}
          >
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

        {/* Global Bug & Diagnostics Reporting Modal */}
        <BugReportModal
          visible={bugReportVisible}
          onClose={() => setBugReportVisible(false)}
          characterId={activeCharacterId}
          userId={currentUser?.id ?? null}
        />
      </View>
    </SafeAreaView>
  );
};

const AppRouter: React.FC = () => {
  const {
    notificationTapTick,
    syncOfflineWorkouts,
    workoutMachine,
    offlineDraft,
    activeCharacterId,
    characters,
  } = useGame();
  const [appMode, setAppMode] = useState<AppMode>('LANDING');
  const [worldTab, setWorldTab] = useState<ActiveTab>(DEFAULT_WORLD_ENTRY_TAB);

  const hasActiveHero = Boolean(activeCharacterId && characters.some((c) => c.id === activeCharacterId));

  // Gate the game world: if no active hero is created/selected, automatically return from WORLD to LANDING
  useEffect(() => {
    if (appMode === 'WORLD' && !hasActiveHero) {
      setAppMode('LANDING');
    }
  }, [appMode, hasActiveHero]);

  // Initialize dual-layer Auto-Update subsystem
  useEffect(() => {
    autoUpdateManager.init();
    return () => {
      autoUpdateManager.destroy();
    };
  }, []);

  // Register Zero-Lost-Sets guards reactively when workout state updates
  useEffect(() => {
    autoUpdateManager.registerWorkoutGuards(
      () => {
        const isLocked = isIntraWorkoutFocusLocked(workoutMachine.phase);
        const hasCompletedSets = offlineDraft.exerciseBlocks.some((b) =>
          b.sets.some((s) => s.completed)
        );
        return isLocked || hasCompletedSets;
      },
      async () => {
        try {
          await syncOfflineWorkouts({ evaluateLocallyIfOffline: true });
        } catch {
          // Non-blocking emergency sync
        }
      }
    );
  }, [workoutMachine.phase, offlineDraft, syncOfflineWorkouts]);

  // When active workout completes, auto-apply any staged background update
  useEffect(() => {
    const isLocked = isIntraWorkoutFocusLocked(workoutMachine.phase);
    if (!isLocked && workoutMachine.phase === 'Idle') {
      void autoUpdateManager.onWorkoutCompleted();
    }
  }, [workoutMachine.phase]);

  useEffect(() => {
    if (notificationTapTick > 0 && hasActiveHero) {
      setWorldTab('WORKOUT');
      setAppMode('WORLD');
    }
  }, [notificationTapTick, hasActiveHero]);

  const renderContent = () => {
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
              if (!hasActiveHero) return;
              setWorldTab('WORKOUT');
              setAppMode('WORLD');
            }}
            onEnterWorld={() => {
              if (!hasActiveHero) return;
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
        onOpenOfflineLogger={() => setAppMode('OFFLINE_WORKOUT')}
      />
    );
  };

  return (
    <>
      {renderContent()}
      <UpdateBanner />
    </>
  );
};

export default function App() {
  useEffect(() => {
    if (Platform.OS === 'web') {
      const doc = (globalThis as unknown as {
        document?: {
          title: string;
          head?: { appendChild: (el: unknown) => void };
          querySelector?: (sel: string) => { setAttribute: (k: string, v: string) => void } | null;
          createElement?: (tag: string) => { setAttribute: (k: string, v: string) => void };
        };
      }).document;
      if (doc) {
        doc.title = 'Goki: Fitness RPG';
        const upsertMeta = (attr: 'name' | 'property', key: string, content: string) => {
          const existing = doc.querySelector?.(`meta[${attr}="${key}"]`);
          if (existing) {
            existing.setAttribute('content', content);
          } else if (doc.createElement && doc.head) {
            const meta = doc.createElement('meta');
            meta.setAttribute(attr, key);
            meta.setAttribute('content', content);
            doc.head.appendChild(meta);
          }
        };
        upsertMeta(
          'name',
          'description',
          'Goki: Fitness RPG — Turn real-world workouts into holistic 7-stat character progression, boss raids, and hardware-verified Ironman rewards.'
        );
        upsertMeta('property', 'og:title', 'Goki: Fitness RPG');
        upsertMeta('property', 'og:site_name', 'Goki');
      }
    }
  }, []);

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <GameProvider>
          <AppRouter />
        </GameProvider>
      </ErrorBoundary>
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
    borderBottomWidth: 1.5,
    borderBottomColor: CRIMSON_ONI.charcoalElevated,
    paddingHorizontal: 12,
    paddingTop: 2,
    paddingBottom: 8,
    position: 'relative',
    zIndex: 100,
  },
  hudTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  hudLeftCluster: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'flex-start',
  },
  landingHubBtn: {
    backgroundColor: CRIMSON_ONI.crimsonDim,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.agedGold,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  landingHubBtnText: {
    color: CRIMSON_ONI.agedGoldBright,
    fontSize: 11,
    fontWeight: '900',
  },
  hudBugBtn: {
    paddingHorizontal: 6,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#26222B',
    borderWidth: 1,
    borderColor: CRIMSON_ONI.charcoalElevated,
  },
  hudBugBtnText: {
    fontSize: 12,
  },
  connDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginLeft: 2,
  },
  hudCenterPortraitWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 110,
  },
  hudPortraitPressable: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
    marginTop: -4,
    marginBottom: -4,
  },
  hudPortraitPressableActive: {
    transform: [{ scale: 1.04 }],
  },
  hudPortraitLevelPill: {
    position: 'absolute',
    bottom: -5,
    backgroundColor: CRIMSON_ONI.charcoalBase,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.agedGold,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
    zIndex: 10,
  },
  hudPortraitLevelText: {
    color: COLORS.gold,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  hudPortraitSpoilsBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 17,
    height: 17,
    borderRadius: 8.5,
    backgroundColor: CRIMSON_ONI.agedGoldBright,
    borderWidth: 1.5,
    borderColor: CRIMSON_ONI.charcoalDeep,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 12,
  },
  hudPortraitSpoilsText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '900',
  },
  hudRightCluster: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'flex-end',
  },
  hudGoldPill: {
    backgroundColor: CRIMSON_ONI.charcoalBase,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.agedGold,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  goldText: {
    color: COLORS.gold,
    fontSize: 13,
    fontWeight: '800',
  },
  hudLocationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CRIMSON_ONI.charcoalElevated,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.agedGold,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    gap: 4,
  },
  hudLocationBtnActive: {
    borderColor: COLORS.gold,
    backgroundColor: CRIMSON_ONI.crimsonDim,
  },
  hudLocationBtnText: {
    color: CRIMSON_ONI.agedGoldBright,
    fontSize: 11,
    fontWeight: '700',
  },
  hudLocationChevron: {
    color: CRIMSON_ONI.agedGold,
    fontSize: 8,
    marginLeft: 2,
  },
  dropdownBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 72,
    paddingRight: 12,
  },
  dropdownCard: {
    width: 250,
    backgroundColor: CRIMSON_ONI.charcoalCard,
    borderWidth: 1.5,
    borderColor: CRIMSON_ONI.agedGold,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.75,
    shadowRadius: 12,
    elevation: 14,
  },
  dropdownHeader: {
    paddingBottom: 8,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: CRIMSON_ONI.charcoalElevated,
  },
  dropdownHeaderTitle: {
    color: CRIMSON_ONI.agedGoldBright,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  dropdownHeaderSub: {
    color: COLORS.textMuted,
    fontSize: 10,
    marginTop: 1,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
    gap: 8,
    marginBottom: 3,
  },
  dropdownItemActive: {
    backgroundColor: CRIMSON_ONI.crimsonDim,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.agedGold,
  },
  dropdownItemPressed: {
    opacity: 0.75,
  },
  dropdownItemIcon: {
    fontSize: 16,
  },
  dropdownItemCol: {
    flex: 1,
  },
  dropdownItemName: {
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  dropdownItemNameActive: {
    color: COLORS.gold,
    fontWeight: '900',
  },
  dropdownItemDesc: {
    color: COLORS.textSecondary,
    fontSize: 10,
    marginTop: 1,
  },
  dropdownActiveBadge: {
    backgroundColor: COLORS.gold,
    borderRadius: 10,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownActiveCheck: {
    color: '#000',
    fontSize: 11,
    fontWeight: '900',
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

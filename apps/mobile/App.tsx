import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { Image, ImageSourcePropType, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { HolisticStatType, StatType, isIntraWorkoutFocusLocked } from '@goki/game-engine';
import { BugReportModal } from './src/components/BugReportModal';
import { CharacterManagerModal } from './src/components/CharacterManagerModal';
import { CharacterPortraitFrame } from './src/components/CharacterPortraitFrame';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { RpgIcon, RpgIconName } from './src/components/icons/RpgIcon';
import { TopMenuBorderArt } from './src/components/TopMenuBorderArt';
import { UpdateBanner } from './src/components/UpdateBanner';
import { autoUpdateManager } from './src/services/AutoUpdateManager';
import { AdventureHubScreen } from './src/screens/AdventureHubScreen';
import { ArtisanHubScreen } from './src/screens/ArtisanHubScreen';
import { HeroHubScreen, HeroSubView } from './src/screens/HeroHubScreen';
import { LandingScreen } from './src/screens/LandingScreen';
import { OfflineWorkoutScreen } from './src/screens/OfflineWorkoutScreen';
import { SocialHubScreen } from './src/screens/SocialHubScreen';
import { TrainHubScreen } from './src/screens/TrainHubScreen';
import { GameLocation, GameProvider, useGame } from './src/state/GameContext';
import { COLORS, CRIMSON_ONI, SURFACES } from './src/theme';

export type AppMode = 'LANDING' | 'OFFLINE_WORKOUT' | 'WORLD';

export type ActiveTab =
  | 'HERO'
  | 'ADVENTURE'
  | 'ARTISAN'
  | 'SOCIAL'
  | 'TRAIN';

/**
 * Default destination tab when clicking "Enter World" on LandingScreen.
 * Designed as a clean constant so future updates can swap effortlessly.
 */
export const DEFAULT_WORLD_ENTRY_TAB: ActiveTab = 'HERO';

const GOKI_EMBLEM_SOURCE: ImageSourcePropType = require('./assets/favicon.png');

export interface LocationOption {
  key: GameLocation;
  label: string;
  name: string;
  iconName: RpgIconName;
  desc: string;
}

const LOCATIONS: Array<LocationOption> = [
  { key: 'TAVERN', label: 'Tavern', name: 'Sanctum', iconName: 'tavern', desc: 'Hero & Talents' },
  { key: 'GUILD_HALL', label: 'Social Hub', name: 'Clan Hall', iconName: 'social', desc: 'Clans & Raids' },
  { key: 'GATHERING_NODE', label: 'Artisan', name: 'Forge & Nodes', iconName: 'artisan', desc: 'Gather & Craft' },
  { key: 'DUNGEON', label: 'Adventure', name: 'Guild & Delve', iconName: 'adventure', desc: 'Quests & Expeditions' },
  { key: 'RAID_SANCTUM', label: 'Train', name: 'Iron Sanctum', iconName: 'train', desc: 'Workouts & History' },
];

const TAB_ITEMS: ReadonlyArray<{
  key: ActiveTab;
  iconName: RpgIconName;
  label: string;
  testID: string;
}> = [
  { key: 'HERO', iconName: 'hero', label: 'Hero', testID: 'world-tab-hero' },
  { key: 'ADVENTURE', iconName: 'adventure', label: 'Adventure', testID: 'world-tab-adventure' },
  { key: 'ARTISAN', iconName: 'artisan', label: 'Artisan', testID: 'world-tab-artisan' },
  { key: 'SOCIAL', iconName: 'social', label: 'Social', testID: 'world-tab-social' },
  { key: 'TRAIN', iconName: 'train', label: 'Train', testID: 'world-tab-train' },
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
    race,
    customizationConfig,
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
  const [heroSubView, setHeroSubView] = useState<HeroSubView>('OVERVIEW');
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
    tab === 'TRAIN'
      ? 'RAID_SANCTUM'
      : tab === 'ARTISAN'
        ? 'GATHERING_NODE'
        : tab === 'ADVENTURE'
          ? 'DUNGEON'
          : tab === 'SOCIAL'
            ? 'GUILD_HALL'
            : location || 'TAVERN';

  const currentLocation = LOCATIONS.find((l) => l.key === resolvedLocationKey) ?? LOCATIONS[0]!;

  const handleTabPress = (nextTab: ActiveTab) => {
    const nextLoc: GameLocation =
      nextTab === 'TRAIN'
        ? 'RAID_SANCTUM'
        : nextTab === 'ARTISAN'
          ? 'GATHERING_NODE'
          : nextTab === 'ADVENTURE'
            ? 'DUNGEON'
            : nextTab === 'SOCIAL'
              ? 'GUILD_HALL'
              : 'TAVERN';

    if (nextTab === 'TRAIN') {
      travelTo(nextLoc);
      onChangeTab('TRAIN');
      return;
    }
    // Phase 2 Zero-Cognitive-Drag Gate: Require explicit cognitive-friction confirmation mid-workout
    if (focusLocked && tab === 'TRAIN') {
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
                <Image
                  source={GOKI_EMBLEM_SOURCE}
                  style={styles.landingHubEmblem}
                  resizeMode="contain"
                />
                <Text style={styles.landingHubBtnText}>Hub</Text>
              </Pressable>

              <Pressable
                style={styles.hudBugBtn}
                onPress={() => setBugReportVisible(true)}
                accessibilityRole="button"
                accessibilityLabel="Report Bug or Feature Suggestion"
              >
                <RpgIcon name="bug" size={14} color={COLORS.textSecondary} accentColor={COLORS.gold} />
              </Pressable>

              <View
                style={[
                  styles.connDot,
                  { backgroundColor: serverOnline ? COLORS.success : '#9CA3AF' },
                ]}
                accessibilityLabel={serverOnline ? 'Server Online' : 'Engine Live'}
              />
            </View>

            {/* Center: Character Portrait Circle (slightly larger than bar, tapping opens Hero Overview) */}
            <View style={styles.hudCenterPortraitWrap}>
              <Pressable
                style={[
                  styles.hudPortraitPressable,
                  tab === 'HERO' && styles.hudPortraitPressableActive,
                ]}
                onPress={() => {
                  setHeroSubView('OVERVIEW');
                  handleTabPress('HERO');
                }}
                accessibilityRole="button"
                accessibilityLabel={`Character ${characterName}, Level ${overallLevel}. Tap to view Hero Overview.`}
              >
                <CharacterPortraitFrame
                  variant="circle"
                  height={56}
                  isCircle
                  isActive={tab === 'HERO'}
                  appearanceId={appearanceId}
                  race={race}
                  customizationConfig={customizationConfig}
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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <RpgIcon name="coin" size={13} color={COLORS.gold} />
                  <Text style={styles.goldText}>{gold}g</Text>
                </View>
              </View>

              <View
                style={styles.hudLocationBtn}
                accessibilityLabel={`Current location: ${currentLocation.name}`}
              >
                <RpgIcon
                  name={currentLocation.iconName}
                  size={12}
                  color={CRIMSON_ONI.agedGoldBright}
                />
                <Text style={styles.hudLocationBtnText} numberOfLines={1}>
                  {currentLocation.name}
                </Text>
              </View>
            </View>
          </View>

          {/* Phase 2 Focus Lock replaces Instant Travel Strip during DungeonActive / Resting */}
          {focusLocked && (
            <View style={styles.focusLockBanner}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                <RpgIcon name="lock" size={13} color={COLORS.gold} />
                <Text style={styles.focusLockText} numberOfLines={1}>
                  FOCUS LOCK ({workoutMachine.phase.toUpperCase()}) • 1.25x Arrival Boon Active
                </Text>
              </View>
              {tab !== 'TRAIN' && (
                <Pressable
                  style={styles.returnFocusBtn}
                  onPress={() => onChangeTab('TRAIN')}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <RpgIcon name="chevron-left" size={12} color={COLORS.bgDeep} />
                    <Text style={styles.returnFocusBtnText}>Return to Set</Text>
                  </View>
                </Pressable>
              )}
            </View>
          )}
        </View>

        {/* Active Screen Viewport */}
        <View style={styles.screenBody}>
          {tab === 'HERO' && (
            <HeroHubScreen
              activeSubView={heroSubView}
              onChangeSubView={setHeroSubView}
              initialTalentStat={talentFocusStat}
              onNavigateToTrain={() => handleTabPress('TRAIN')}
              onNavigateToAdventure={() => handleTabPress('ADVENTURE')}
              onNavigateToArtisan={() => handleTabPress('ARTISAN')}
              onNavigateToSocial={() => handleTabPress('SOCIAL')}
            />
          )}
          {tab === 'ADVENTURE' && <AdventureHubScreen />}
          {tab === 'ARTISAN' && <ArtisanHubScreen />}
          {tab === 'SOCIAL' && <SocialHubScreen />}
          {tab === 'TRAIN' && (
            <TrainHubScreen
              onOpenOfflineLogger={onOpenOfflineLogger}
              onReturnToLanding={onReturnToLanding}
              onNavigateToTalents={() => {
                setHeroSubView('TALENTS');
                handleTabPress('HERO');
              }}
              onNavigateToPaperdoll={() => {
                setHeroSubView('OVERVIEW');
                handleTabPress('HERO');
              }}
            />
          )}
        </View>

        {/* Bottom RPG Navigation Bar with Intra-Workout Lock Indicators */}
        <View style={styles.tabBar}>
          {TAB_ITEMS.map((item) => {
            const active = tab === item.key;
            const locked = focusLocked && item.key !== 'TRAIN';

            return (
              <Pressable
                key={item.key}
                style={[styles.tabItem, active && styles.tabItemActive]}
                onPress={() => handleTabPress(item.key)}
                testID={item.testID}
              >
                <View style={styles.tabIconWrap}>
                  <RpgIcon
                    name={locked ? 'lock' : item.iconName}
                    size={18}
                    color={
                      locked
                        ? COLORS.textMuted
                        : active
                        ? COLORS.gold
                        : COLORS.textSecondary
                    }
                    accentColor={
                      locked
                        ? COLORS.textMuted
                        : active
                        ? COLORS.gold
                        : COLORS.textMuted
                    }
                  />
                  {item.key === 'HERO' && unclaimedSpoilsCount > 0 ? (
                    <View style={styles.spoilsDot} />
                  ) : null}
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
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <RpgIcon name="shield" size={20} color={COLORS.gold} />
                <Text style={[styles.frictionTitle, { marginBottom: 0 }]}>
                  Break Dungeon Focus?
                </Text>
              </View>
              <Text style={styles.frictionBody}>
                Your Stamina &amp; neural drive peak when you stay locked into your sets. Stat
                allocation, inventory sorting, and Guild menus unlock automatically at Finish
                Workout.
              </Text>

              <Pressable
                style={styles.stayFocusedBtn}
                onPress={cancelFocusOverride}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <RpgIcon name="combat" size={15} color={COLORS.bgDeep} />
                  <Text style={styles.stayFocusedBtnText}>
                    Stay Focused on Workout (Recommended)
                  </Text>
                </View>
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
    isAuthenticated,
  } = useGame();
  const [appMode, setAppMode] = useState<AppMode>('LANDING');
  const [worldTab, setWorldTab] = useState<ActiveTab>(DEFAULT_WORLD_ENTRY_TAB);
  const [showPostDeleteCreatorModal, setShowPostDeleteCreatorModal] = useState(false);

  const hasActiveHero = Boolean(activeCharacterId && characters.some((c) => c.id === activeCharacterId));

  // Gate the game world: if no active hero is created/selected, automatically return from WORLD to LANDING
  useEffect(() => {
    if (appMode === 'WORLD' && !hasActiveHero) {
      setAppMode('LANDING');
      if (isAuthenticated) {
        setShowPostDeleteCreatorModal(true);
      }
    }
  }, [appMode, hasActiveHero, isAuthenticated]);

  useEffect(() => {
    if (hasActiveHero) {
      setShowPostDeleteCreatorModal(false);
    }
  }, [hasActiveHero]);

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
      setWorldTab('TRAIN');
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
              setWorldTab('TRAIN');
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
      <CharacterManagerModal
        visible={showPostDeleteCreatorModal}
        initialView="CREATE"
        onClose={() => setShowPostDeleteCreatorModal(false)}
        onCharacterActivated={() => setShowPostDeleteCreatorModal(false)}
      />
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

        const resolvedIconUri =
          typeof GOKI_EMBLEM_SOURCE === 'string'
            ? GOKI_EMBLEM_SOURCE
            : (GOKI_EMBLEM_SOURCE as { uri?: string })?.uri ??
              Image.resolveAssetSource?.(GOKI_EMBLEM_SOURCE)?.uri;

        if (resolvedIconUri) {
          const upsertLink = (rel: string, type?: string) => {
            const existing = doc.querySelector?.(`link[rel="${rel}"]`);
            if (existing) {
              existing.setAttribute('href', resolvedIconUri);
              if (type) existing.setAttribute('type', type);
            } else if (doc.createElement && doc.head) {
              const link = doc.createElement('link');
              link.setAttribute('rel', rel);
              link.setAttribute('href', resolvedIconUri);
              if (type) link.setAttribute('type', type);
              doc.head.appendChild(link);
            }
          };
          upsertLink('icon', 'image/png');
          upsertLink('apple-touch-icon', 'image/png');
          upsertMeta('property', 'og:image', resolvedIconUri);
        }
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
    backgroundColor: SURFACES.canvas,
  },
  appFrame: {
    flex: 1,
    width: '100%',
    maxWidth: 960,
    alignSelf: 'center',
    backgroundColor: SURFACES.canvas,
  },
  hudContainer: {
    backgroundColor: SURFACES.layer1,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SURFACES.hairline,
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: CRIMSON_ONI.crimsonDim,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.agedGold,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  landingHubEmblem: {
    width: 16,
    height: 16,
    borderRadius: 8,
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
    backgroundColor: SURFACES.layer1,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SURFACES.hairline,
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 10,
  },
  tabItemActive: {
    backgroundColor: SURFACES.layer3,
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

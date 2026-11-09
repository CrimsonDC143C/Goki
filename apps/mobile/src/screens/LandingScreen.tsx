import React, { useEffect, useState } from 'react';
import {
  ImageSourcePropType,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SvgXml } from 'react-native-svg';
import { CharacterPortraitFrame } from '../components/CharacterPortraitFrame';
import { AuthModal } from '../components/AuthModal';
import { CharacterManagerModal } from '../components/CharacterManagerModal';
import { useGame } from '../state/GameContext';
import { LOOT_CHEST_SVGS, RANK_CREST_SVGS } from '../assets/v0Vault';
import { CRIMSON_ONI } from '../theme';

export interface LandingScreenProps {
  onSelectOfflineWorkout: () => void;
  onSelectOnlineWorkout: () => void;
  onEnterWorld: () => void;
  /**
   * Optional Layer.ai 2D full-body character illustration / sprite override.
   * Falls back to `characterArtUri` from `GameContext` or the Crimson Oni warrior frame.
   */
  characterImageSource?: ImageSourcePropType | string | null;
}

export const LandingScreen: React.FC<LandingScreenProps> = ({
  onSelectOfflineWorkout,
  onSelectOnlineWorkout,
  onEnterWorld,
  characterImageSource,
}) => {
  const {
    characterName,
    characterArtUri,
    appearanceId,
    overallLevel,
    adventurerRank,
    location,
    offlineDraft,
    queuedOfflineWorkouts,
    pendingWorkoutReceipts,
    unclaimedSpoilsCount,
    landingToastMessage,
    dismissLandingToast,
    workoutMachine,
    currentUser,
    gameMode,
    activeCharacterId,
    characters,
    deletedCharacters,
  } = useGame();

  const [authModalVisible, setAuthModalVisible] = useState(false);
  const [charManagerVisible, setCharManagerVisible] = useState(false);
  const [charManagerInitialView, setCharManagerInitialView] = useState<'ROSTER' | 'CREATE'>('ROSTER');

  const hasActiveHero = Boolean(activeCharacterId && characters.some((c) => c.id === activeCharacterId));

  const openHeroCreation = () => {
    setCharManagerInitialView('CREATE');
    setCharManagerVisible(true);
  };

  const openHallOfHeroes = () => {
    setCharManagerInitialView('ROSTER');
    setCharManagerVisible(true);
  };

  useEffect(() => {
    if (!landingToastMessage) return;
    const timer = setTimeout(() => {
      dismissLandingToast();
    }, 6500);
    return () => clearTimeout(timer);
  }, [landingToastMessage, dismissLandingToast]);

  const draftCompletedItems =
    offlineDraft.exerciseBlocks.reduce(
      (sum, blk) => sum + blk.sets.filter((s) => s.completed).length,
      0
    ) + offlineDraft.cardioEntries.length;

  const hasActiveOnlineSession = workoutMachine.phase !== 'Idle';

  const spoilsBadgeLabel = (() => {
    if (unclaimedSpoilsCount <= 0) return null;
    if (queuedOfflineWorkouts.length > 0 && pendingWorkoutReceipts.length === 0) {
      return `Pending Sync (${queuedOfflineWorkouts.length}) • Unclaimed Spoils Ready!`;
    }
    if (queuedOfflineWorkouts.length > 0) {
      return `Unclaimed Spoils Ready! • Pending Sync (${queuedOfflineWorkouts.length})`;
    }
    return pendingWorkoutReceipts.length > 1
      ? `Unclaimed Spoils Ready! (${pendingWorkoutReceipts.length})`
      : 'Unclaimed Spoils Ready!';
  })();

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Top App Emblem Header */}
        <View style={styles.brandHeader}>
          <View style={styles.brandBadgeRow}>
            <View style={styles.brandAccentLine} />
            <Text style={styles.brandEyebrow}>GOKI</Text>
            <View style={styles.brandAccentLine} />
          </View>
          <Text style={styles.brandTitle}>WORLD OF VERETHOR</Text>
          <Text style={styles.brandSubtitle}>Physical Effort Forged Into Legend</Text>

          <Pressable
            style={styles.authPillBtn}
            onPress={() => setAuthModalVisible(true)}
            testID="auth-open-btn"
          >
            <Text style={styles.authPillBtnText}>
              {currentUser ? `🛡️ ${currentUser.username}` : '🔐 Register / Sign In'}
            </Text>
          </Pressable>
        </View>

        {/* Non-Intrusive Offline Save Confirmation Toast */}
        {landingToastMessage && (
          <Pressable
            style={styles.toastBanner}
            onPress={dismissLandingToast}
            accessibilityRole="alert"
          >
            <View style={styles.toastDot} />
            <Text style={styles.toastText}>{landingToastMessage}</Text>
            <Text style={styles.toastDismiss}>✕</Text>
          </Pressable>
        )}

        {/* Hero Full-Body Character Art Frame OR No-Hero Creation Prompt */}
        <View style={styles.heroSection}>
          {hasActiveHero ? (
            <CharacterPortraitFrame
              variant="hero"
              height={360}
              appearanceId={appearanceId}
              imageSource={characterImageSource ?? characterArtUri}
            >
              <View style={styles.nameplateBanner}>
                <View style={styles.nameplateTopRow}>
                  <Text style={styles.characterNameText} numberOfLines={1}>
                    {characterName}
                  </Text>
                  <View style={styles.levelBadge}>
                    <Text style={styles.levelBadgeText}>Lv. {overallLevel}</Text>
                  </View>
                </View>

                <View style={styles.nameplateMetaRow}>
                  <View style={styles.guildRankPill}>
                    {RANK_CREST_SVGS[adventurerRank.toUpperCase() as keyof typeof RANK_CREST_SVGS] ? (
                      <SvgXml
                        xml={RANK_CREST_SVGS[adventurerRank.toUpperCase() as keyof typeof RANK_CREST_SVGS]}
                        width={16}
                        height={16}
                      />
                    ) : null}
                    <Text style={styles.guildRankText}>{adventurerRank} RANK</Text>
                  </View>
                  <View style={styles.locationPill}>
                    <Text style={styles.locationPillText}>📍 {location}</Text>
                  </View>
                </View>
              </View>
            </CharacterPortraitFrame>
          ) : (
            <View style={styles.emptyHeroFrame} testID="landing-no-hero-box">
              <View style={styles.emptyHeroEmblemBadge}>
                <Text style={styles.emptyHeroEmblemIcon}>⚔️</Text>
              </View>
              <Text style={styles.emptyHeroEyebrow}>HALL OF HEROES</Text>
              <Text style={styles.emptyHeroTitle}>No Active Hero Selected</Text>
              <Text style={styles.emptyHeroDesc}>
                You must forge or select an active hero before entering the World of Verethor.
                Choose your cosmetic appearance, name your champion, and begin turning physical
                effort into legend.
              </Text>
              <Pressable
                style={({ pressed }) => [
                  styles.emptyHeroCreateBtn,
                  pressed && styles.actionCardPressed,
                ]}
                onPress={openHeroCreation}
                testID="landing-create-hero-cta-btn"
              >
                <Text style={styles.emptyHeroCreateBtnText}>⚡ Forge Your Hero</Text>
              </Pressable>

              {(characters.length > 0 || deletedCharacters.length > 0) && (
                <Pressable
                  style={styles.emptyHeroSecondaryBtn}
                  onPress={openHallOfHeroes}
                  testID="landing-restore-or-select-hero-btn"
                >
                  <Text style={styles.emptyHeroSecondaryBtnText}>
                    {characters.length > 0
                      ? `Select Existing Hero (${characters.length})`
                      : `View Fallen Heroes Archive (${deletedCharacters.length})`}
                  </Text>
                </Pressable>
              )}
            </View>
          )}

          {/* Quick Roster Switcher / Forger Pill */}
          <Pressable
            style={styles.heroManageBtn}
            onPress={openHallOfHeroes}
            testID="landing-manage-heroes-btn"
          >
            <Text style={styles.heroManageBtnText}>
              {hasActiveHero
                ? `${gameMode === 'IRONMAN_VERIFIED' ? '🛡️ Ironman Verified' : '⚔️ Standard Honesty'} • Hall of Heroes (Switch / Forge)`
                : '⚔️ Open Hall of Heroes (Manage / Restore Roster)'}
            </Text>
          </Pressable>
        </View>

        {/* Three Primary Quick-Action Entry Points */}
        <View style={styles.actionsStack}>
          {/* Button 1: Offline Workout */}
          <Pressable
            style={({ pressed }) => [
              styles.actionCard,
              styles.offlineActionCard,
              pressed && styles.actionCardPressed,
            ]}
            onPress={onSelectOfflineWorkout}
            testID="action-offline-workout"
          >
            <View style={styles.actionHeaderRow}>
              <View style={styles.actionTitleCluster}>
                <Text style={styles.actionIcon}>📓</Text>
                <Text style={styles.actionTitle}>Quick Offline Workout</Text>
              </View>
              {draftCompletedItems > 0 ? (
                <View style={styles.subtleStatusPill}>
                  <Text style={styles.subtleStatusPillText}>
                    Draft ({draftCompletedItems} logged)
                  </Text>
                </View>
              ) : (
                <Text style={styles.chevron}>→</Text>
              )}
            </View>
            <Text style={styles.actionSubtitle}>
              Minimalist zero-HUD spreadsheet logger — fast set &amp; cardio tracking that syncs RPG spoils later.
            </Text>
          </Pressable>

          {/* Button 2: Online Workout */}
          <Pressable
            style={({ pressed }) => [
              styles.actionCard,
              styles.onlineActionCard,
              !hasActiveHero && styles.actionCardLocked,
              pressed && styles.actionCardPressed,
            ]}
            onPress={() => {
              if (!hasActiveHero) {
                openHeroCreation();
                return;
              }
              onSelectOnlineWorkout();
            }}
            testID="action-online-workout"
          >
            <View style={styles.actionHeaderRow}>
              <View style={styles.actionTitleCluster}>
                <Text style={styles.actionIcon}>{hasActiveHero ? '⚔️' : '🔒'}</Text>
                <Text
                  style={[
                    styles.actionTitle,
                    styles.onlineTitle,
                    !hasActiveHero && styles.actionTitleLocked,
                  ]}
                >
                  Enter Dungeon (Live Hybrid)
                </Text>
              </View>
              {!hasActiveHero ? (
                <View style={styles.lockedActionPill}>
                  <Text style={styles.lockedActionPillText}>Hero Required</Text>
                </View>
              ) : hasActiveOnlineSession ? (
                <View style={styles.crimsonActivePill}>
                  <Text style={styles.crimsonActivePillText}>
                    {workoutMachine.phase} Active
                  </Text>
                </View>
              ) : (
                <Text style={styles.chevronGold}>→</Text>
              )}
            </View>
            <Text style={styles.actionSubtitle}>
              {hasActiveHero
                ? 'Recommended: Full RPG boss encounter + 6-column workout logger (survives signal drops).'
                : 'Forge or select an active hero first to unlock the full RPG boss encounter & workout logger.'}
            </Text>
          </Pressable>

          {/* Button 3: Enter World */}
          <Pressable
            style={({ pressed }) => [
              styles.actionCard,
              styles.enterWorldCard,
              hasActiveHero && unclaimedSpoilsCount > 0 && styles.enterWorldCardGlowing,
              !hasActiveHero && styles.actionCardLocked,
              pressed && styles.actionCardPressed,
            ]}
            onPress={() => {
              if (!hasActiveHero) {
                openHeroCreation();
                return;
              }
              onEnterWorld();
            }}
            testID="action-enter-world"
          >
            {hasActiveHero && spoilsBadgeLabel && (
              <View style={styles.spoilsReadyBadge}>
                <SvgXml
                  xml={LOOT_CHEST_SVGS.MYTHIC}
                  width={18}
                  height={15}
                />
                <Text style={styles.spoilsReadyBadgeText}>{spoilsBadgeLabel}</Text>
              </View>
            )}
            <View style={styles.actionHeaderRow}>
              <View style={styles.actionTitleCluster}>
                <Text style={styles.actionIcon}>{hasActiveHero ? '🏰' : '🔒'}</Text>
                <Text style={[styles.actionTitle, !hasActiveHero && styles.actionTitleLocked]}>
                  Enter World
                </Text>
              </View>
              {!hasActiveHero ? (
                <View style={styles.lockedActionPill}>
                  <Text style={styles.lockedActionPillText}>Hero Required</Text>
                </View>
              ) : (
                <Text style={styles.chevronCrimson}>→</Text>
              )}
            </View>
            <Text style={styles.actionSubtitle}>
              {hasActiveHero
                ? 'Manage character, gear, dungeons, and guild halls.'
                : 'Forge or select an active hero to enter the World of Verethor.'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      <AuthModal
        visible={authModalVisible}
        onClose={() => setAuthModalVisible(false)}
        onSuccess={() => {
          if (hasActiveHero) {
            onEnterWorld();
          }
        }}
      />

      <CharacterManagerModal
        visible={charManagerVisible}
        onClose={() => setCharManagerVisible(false)}
        initialView={charManagerInitialView}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: CRIMSON_ONI.charcoalBase,
  },
  scrollContent: {
    width: '100%',
    maxWidth: 540,
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 32,
  },
  brandHeader: {
    alignItems: 'center',
    marginBottom: 14,
  },
  brandBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  brandAccentLine: {
    width: 26,
    height: 1,
    backgroundColor: CRIMSON_ONI.agedGold,
    opacity: 0.65,
  },
  brandEyebrow: {
    color: CRIMSON_ONI.agedGold,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.8,
  },
  brandTitle: {
    color: CRIMSON_ONI.ghostWhite,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  brandSubtitle: {
    color: CRIMSON_ONI.ashGray,
    fontSize: 12,
    marginTop: 2,
  },
  toastBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CRIMSON_ONI.agedGoldDim,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.agedGold,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    gap: 8,
  },
  toastDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: CRIMSON_ONI.agedGoldBright,
  },
  toastText: {
    flex: 1,
    color: CRIMSON_ONI.ghostWhite,
    fontSize: 12,
    fontWeight: '700',
  },
  toastDismiss: {
    color: CRIMSON_ONI.ashGray,
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: 4,
  },
  heroSection: {
    marginBottom: 16,
    alignItems: 'center',
  },
  emptyHeroFrame: {
    width: '100%',
    minHeight: 300,
    backgroundColor: CRIMSON_ONI.charcoalCard,
    borderWidth: 1.5,
    borderColor: CRIMSON_ONI.agedGold,
    borderRadius: 16,
    paddingHorizontal: 22,
    paddingVertical: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyHeroEmblemBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(139, 17, 36, 0.25)',
    borderWidth: 1.5,
    borderColor: CRIMSON_ONI.agedGold,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyHeroEmblemIcon: {
    fontSize: 26,
  },
  emptyHeroEyebrow: {
    color: CRIMSON_ONI.agedGold,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.8,
    marginBottom: 4,
  },
  emptyHeroTitle: {
    color: CRIMSON_ONI.ghostWhite,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.4,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyHeroDesc: {
    color: CRIMSON_ONI.ashGray,
    fontSize: 12.5,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 18,
    maxWidth: 420,
  },
  emptyHeroCreateBtn: {
    backgroundColor: CRIMSON_ONI.agedGold,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.agedGoldBright,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  emptyHeroCreateBtnText: {
    color: CRIMSON_ONI.charcoalDeep,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  emptyHeroSecondaryBtn: {
    marginTop: 10,
    backgroundColor: 'rgba(30, 29, 35, 0.85)',
    borderWidth: 1,
    borderColor: CRIMSON_ONI.borderGold,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    width: '100%',
  },
  emptyHeroSecondaryBtnText: {
    color: CRIMSON_ONI.agedGoldBright,
    fontSize: 11.5,
    fontWeight: '800',
  },
  heroManageRow: {
    marginTop: 8,
    alignItems: 'center',
  },
  heroManageBtn: {
    backgroundColor: CRIMSON_ONI.charcoalCard,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.borderGold,
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 14,
    marginTop: 8,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  heroManageBtnText: {
    color: CRIMSON_ONI.agedGoldBright,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  nameplateBanner: {
    backgroundColor: 'rgba(18, 17, 20, 0.90)',
    borderTopWidth: 1,
    borderTopColor: CRIMSON_ONI.borderGold,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  nameplateTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  characterNameText: {
    flex: 1,
    color: CRIMSON_ONI.ghostWhite,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  levelBadge: {
    backgroundColor: CRIMSON_ONI.crimson,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.agedGold,
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  levelBadgeText: {
    color: CRIMSON_ONI.ghostWhite,
    fontSize: 12,
    fontWeight: '900',
  },
  nameplateMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 7,
  },
  guildRankPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: CRIMSON_ONI.agedGoldDim,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.borderGold,
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  rankCrestIcon: {
    width: 15,
    height: 15,
  },
  guildRankText: {
    color: CRIMSON_ONI.agedGoldBright,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  locationPill: {
    backgroundColor: CRIMSON_ONI.charcoalElevated,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.border,
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  locationPillText: {
    color: CRIMSON_ONI.ghostWhite,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  actionsStack: {
    gap: 12,
  },
  actionCard: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1.5,
  },
  actionCardPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.992 }],
  },
  offlineActionCard: {
    backgroundColor: CRIMSON_ONI.charcoalCard,
    borderColor: CRIMSON_ONI.border,
  },
  onlineActionCard: {
    backgroundColor: CRIMSON_ONI.charcoalElevated,
    borderColor: CRIMSON_ONI.agedGold,
  },
  onlineTitle: {
    color: CRIMSON_ONI.agedGoldBright,
  },
  enterWorldCard: {
    backgroundColor: CRIMSON_ONI.crimsonDim,
    borderColor: CRIMSON_ONI.crimsonGlow,
  },
  enterWorldCardGlowing: {
    backgroundColor: '#351118',
    borderColor: CRIMSON_ONI.crimson,
    shadowColor: CRIMSON_ONI.crimsonGlow,
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  spoilsReadyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: CRIMSON_ONI.agedGold,
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 3,
    marginBottom: 8,
  },
  miniChestIcon: {
    width: 18,
    height: 15,
  },
  spoilsReadyBadgeText: {
    color: CRIMSON_ONI.charcoalDeep,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  actionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  actionTitleCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionIcon: {
    fontSize: 17,
  },
  actionTitle: {
    color: CRIMSON_ONI.ghostWhite,
    fontSize: 16,
    fontWeight: '900',
  },
  enterWorldTitle: {
    color: CRIMSON_ONI.agedGoldBright,
  },
  actionCardLocked: {
    opacity: 0.65,
    borderColor: CRIMSON_ONI.border,
  },
  actionTitleLocked: {
    color: CRIMSON_ONI.ashGray,
  },
  lockedActionPill: {
    backgroundColor: CRIMSON_ONI.charcoalDeep,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.borderGold,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  lockedActionPillText: {
    color: CRIMSON_ONI.agedGold,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  actionSubtitle: {
    color: CRIMSON_ONI.ashGray,
    fontSize: 12,
    lineHeight: 17,
  },
  chevron: {
    color: CRIMSON_ONI.ashGray,
    fontSize: 18,
    fontWeight: '800',
  },
  chevronCrimson: {
    color: '#E57373',
    fontSize: 18,
    fontWeight: '800',
  },
  chevronGold: {
    color: CRIMSON_ONI.agedGoldBright,
    fontSize: 18,
    fontWeight: '900',
  },
  subtleStatusPill: {
    backgroundColor: CRIMSON_ONI.charcoalDeep,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  subtleStatusPillText: {
    color: CRIMSON_ONI.ghostWhite,
    fontSize: 10,
    fontWeight: '700',
  },
  crimsonActivePill: {
    backgroundColor: CRIMSON_ONI.crimson,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.agedGold,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  crimsonActivePillText: {
    color: CRIMSON_ONI.ghostWhite,
    fontSize: 10,
    fontWeight: '800',
  },
  authPillBtn: {
    marginTop: 10,
    backgroundColor: 'rgba(30, 29, 35, 0.9)',
    borderWidth: 1,
    borderColor: CRIMSON_ONI.agedGold,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    alignSelf: 'center',
  },
  authPillBtnText: {
    color: CRIMSON_ONI.agedGoldBright,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});

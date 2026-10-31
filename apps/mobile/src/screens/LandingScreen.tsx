import React, { useEffect, useState } from 'react';
import {
  ImageSourcePropType,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CharacterPortraitFrame } from '../components/CharacterPortraitFrame';
import { AuthModal } from '../components/AuthModal';
import { useGame } from '../state/GameContext';
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
  } = useGame();

  const [authModalVisible, setAuthModalVisible] = useState(false);

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
            <Text style={styles.brandEyebrow}>CRIMSON ONI CHRONICLES</Text>
            <View style={styles.brandAccentLine} />
          </View>
          <Text style={styles.brandTitle}>IRONBOUND REALMS</Text>
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

        {/* Hero Full-Body Character Art Frame + Overlaid Bottom Nameplate */}
        <View style={styles.heroSection}>
          <CharacterPortraitFrame
            variant="hero"
            height={286}
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
                  <Text style={styles.guildRankText}>🛡️ {adventurerRank} RANK</Text>
                </View>
                <View style={styles.locationPill}>
                  <Text style={styles.locationPillText}>📍 {location}</Text>
                </View>
              </View>
            </View>
          </CharacterPortraitFrame>
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
                <Text style={styles.actionTitle}>Offline Workout</Text>
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
              Quick-log sets &amp; cardio with zero RPG distractions.
            </Text>
          </Pressable>

          {/* Button 2: Online Workout */}
          <Pressable
            style={({ pressed }) => [
              styles.actionCard,
              styles.onlineActionCard,
              pressed && styles.actionCardPressed,
            ]}
            onPress={onSelectOnlineWorkout}
          >
            <View style={styles.actionHeaderRow}>
              <View style={styles.actionTitleCluster}>
                <Text style={styles.actionIcon}>⚔️</Text>
                <Text style={styles.actionTitle}>Online Workout</Text>
              </View>
              {hasActiveOnlineSession ? (
                <View style={styles.crimsonActivePill}>
                  <Text style={styles.crimsonActivePillText}>
                    {workoutMachine.phase} Active
                  </Text>
                </View>
              ) : (
                <Text style={styles.chevronCrimson}>→</Text>
              )}
            </View>
            <Text style={styles.actionSubtitle}>
              Full intra-workout RPG telemetry, PR Crits, &amp; live raid channeling.
            </Text>
          </Pressable>

          {/* Button 3: Enter World */}
          <Pressable
            style={({ pressed }) => [
              styles.actionCard,
              styles.enterWorldCard,
              unclaimedSpoilsCount > 0 && styles.enterWorldCardGlowing,
              pressed && styles.actionCardPressed,
            ]}
            onPress={onEnterWorld}
            testID="action-enter-world"
          >
            {spoilsBadgeLabel && (
              <View style={styles.spoilsReadyBadge}>
                <Text style={styles.spoilsReadyBadgeText}>✨ {spoilsBadgeLabel}</Text>
              </View>
            )}
            <View style={styles.actionHeaderRow}>
              <View style={styles.actionTitleCluster}>
                <Text style={styles.actionIcon}>🏰</Text>
                <Text style={[styles.actionTitle, styles.enterWorldTitle]}>
                  Enter World
                </Text>
              </View>
              <Text style={styles.chevronGold}>→</Text>
            </View>
            <Text style={styles.actionSubtitle}>
              Manage character, gear, dungeons, and guild halls.
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      <AuthModal
        visible={authModalVisible}
        onClose={() => setAuthModalVisible(false)}
        onSuccess={onEnterWorld}
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
    backgroundColor: CRIMSON_ONI.agedGoldDim,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.borderGold,
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
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
    backgroundColor: CRIMSON_ONI.crimsonDim,
    borderColor: CRIMSON_ONI.crimsonGlow,
  },
  enterWorldCard: {
    backgroundColor: CRIMSON_ONI.charcoalElevated,
    borderColor: CRIMSON_ONI.agedGold,
  },
  enterWorldCardGlowing: {
    backgroundColor: '#2B2318',
    borderColor: CRIMSON_ONI.agedGoldBright,
    shadowColor: CRIMSON_ONI.agedGold,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  spoilsReadyBadge: {
    alignSelf: 'flex-start',
    backgroundColor: CRIMSON_ONI.agedGold,
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 3,
    marginBottom: 8,
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

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AutoUpdateState,
  autoUpdateManager,
} from '../services/AutoUpdateManager';
import { COLORS, CRIMSON_ONI } from '../theme';

export const UpdateBanner: React.FC = () => {
  const insets = useSafeAreaInsets();
  const [updateState, setUpdateState] = useState<AutoUpdateState>(() =>
    autoUpdateManager.getState()
  );
  const [isApplying, setIsApplying] = useState(false);

  // Compute tasteful offset from top safe area ensuring clearance from notch, camera, and screen bevel
  const topOffset = Math.max(insets.top + 16, Platform.OS === 'ios' ? 56 : 48);

  useEffect(() => {
    const unsubscribe = autoUpdateManager.subscribe((state) => {
      setUpdateState(state);
    });
    return unsubscribe;
  }, []);

  // Auto-dismiss "UP_TO_DATE" toast after 3.5 seconds
  useEffect(() => {
    if (updateState.status === 'UP_TO_DATE') {
      const timer = setTimeout(() => {
        autoUpdateManager.dismissBanner();
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [updateState.status]);

  const handleApplyNow = async (saveDraftFirst = false) => {
    setIsApplying(true);
    try {
      await autoUpdateManager.applyUpdate(saveDraftFirst);
    } finally {
      setIsApplying(false);
    }
  };

  const handleDownloadApk = async () => {
    const url =
      updateState.manifest?.androidApkDownloadUrl ||
      'https://expo.dev/accounts/crimsondc143c/projects/gymify-rpg/builds';
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      }
    } catch (err) {
      console.error('[UpdateBanner] Failed to open APK download URL:', err);
    }
  };

  const isForceBinary = updateState.status === 'FORCE_BINARY_UPDATE';
  const isBinaryAvailable = updateState.status === 'BINARY_UPDATE_AVAILABLE';
  const isBinaryModalVisible = isForceBinary || isBinaryAvailable;

  return (
    <>
      {/* 1. Downloading OTA Toast */}
      {updateState.status === 'DOWNLOADING_OTA' && (
        <View style={[styles.toastContainer, { top: topOffset }]}>
          <ActivityIndicator size="small" color={COLORS.gold} />
          <Text style={styles.toastText}>📥 Downloading Realm Patch...</Text>
        </View>
      )}

      {/* 2. Ready to Install (Outside Workout) Toast */}
      {updateState.status === 'READY_TO_INSTALL' && (
        <View style={[styles.toastContainer, { top: topOffset }, styles.toastReady]}>
          <Text style={styles.toastText}>⚡ Realm Patch Downloaded!</Text>
          <Pressable
            style={({ pressed }) => [
              styles.actionButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={() => handleApplyNow(false)}
            disabled={isApplying}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Restart app now to install update"
          >
            {isApplying ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Text style={styles.actionButtonText}>Restart Now</Text>
            )}
          </Pressable>
        </View>
      )}

      {/* 3. Deferred Workout Pill (Zero Interrupted Sets Guarantee) */}
      {updateState.status === 'WAITING_FOR_WORKOUT' && (
        <View style={[styles.toastContainer, { top: topOffset }, styles.toastDeferred]}>
          <View style={styles.deferredContent}>
            <Text style={styles.deferredTitle}>
              ✨ Update Downloaded — Will install after workout
            </Text>
            <Text style={styles.deferredSubtitle}>
              Lifting in progress. Your sets and fatigue progress are safely guarded.
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.actionButtonSecondary,
              pressed && styles.buttonPressed,
            ]}
            onPress={() => handleApplyNow(true)}
            disabled={isApplying}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Reload app now with workout draft saved"
          >
            {isApplying ? (
              <ActivityIndicator size="small" color={COLORS.textPrimary} />
            ) : (
              <Text style={styles.actionButtonSecondaryText}>
                Reload Now (Draft Saved)
              </Text>
            )}
          </Pressable>
        </View>
      )}

      {/* 4. Up-To-Date Confirmation Toast (Manual Check Feedback) */}
      {updateState.status === 'UP_TO_DATE' && (
        <Pressable
          style={[styles.toastContainer, { top: topOffset }, styles.toastUpToDate]}
          onPress={() => autoUpdateManager.dismissBanner()}
        >
          <Text style={styles.toastText}>
            ✅ Realm is fully up to date (v{updateState.currentVersion})
          </Text>
        </Pressable>
      )}

      {/* 5. Binary Upgrade Modal (APK / Native App Update) */}
      <Modal
        visible={isBinaryModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!isForceBinary) {
            autoUpdateManager.dismissBanner();
          }
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalIcon}>
                {isForceBinary ? '🚨' : '🚀'}
              </Text>
              <Text style={styles.modalTitle}>
                {isForceBinary
                  ? 'Critical Realm Upgrade Required'
                  : 'New Realm Version Available'}
              </Text>
            </View>

            <View style={styles.versionBadgesRow}>
              <View style={styles.versionBadge}>
                <Text style={styles.versionBadgeLabel}>Current</Text>
                <Text style={styles.versionBadgeValue}>
                  v{updateState.currentVersion}
                </Text>
              </View>
              <Text style={styles.versionArrow}>➔</Text>
              <View style={[styles.versionBadge, styles.versionBadgeNew]}>
                <Text style={styles.versionBadgeLabel}>Latest</Text>
                <Text style={styles.versionBadgeValueNew}>
                  v{updateState.manifest?.latestVersion || 'New'}
                </Text>
              </View>
            </View>

            <Text style={styles.modalBody}>
              {isForceBinary
                ? 'A major engine upgrade or database protocol change is active. You must update your client to continue your journey and sync your workout spoils.'
                : 'A new native build with updated game mechanics and optimizations is ready for download.'}
            </Text>

            {Boolean(updateState.manifest?.releaseNotes) && (
              <View style={styles.releaseNotesBox}>
                <Text style={styles.releaseNotesHeader}>Release Notes:</Text>
                <ScrollView style={{ maxHeight: 120 }}>
                  <Text style={styles.releaseNotesContent}>
                    {updateState.manifest?.releaseNotes}
                  </Text>
                </ScrollView>
              </View>
            )}

            <View style={styles.modalActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.downloadButton,
                  pressed && styles.buttonPressed,
                ]}
                onPress={handleDownloadApk}
              >
                <Text style={styles.downloadButtonText}>
                  📲 Download & Install Latest APK
                </Text>
              </Pressable>

              {!isForceBinary && (
                <Pressable
                  style={({ pressed }) => [
                    styles.laterButton,
                    pressed && styles.buttonPressed,
                  ]}
                  onPress={() => autoUpdateManager.dismissBanner()}
                >
                  <Text style={styles.laterButtonText}>Later</Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    maxWidth: 520,
    alignSelf: 'center',
    zIndex: 99999,
    backgroundColor: CRIMSON_ONI.charcoalCard,
    borderWidth: 1.5,
    borderColor: CRIMSON_ONI.agedGold,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.65,
    shadowRadius: 10,
    elevation: 10,
  },
  toastReady: {
    borderColor: COLORS.success,
    backgroundColor: '#0F2617',
  },
  toastDeferred: {
    borderColor: CRIMSON_ONI.agedGoldBright,
    backgroundColor: '#1E1B15',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 8,
  },
  toastUpToDate: {
    borderColor: COLORS.shieldCyan,
    backgroundColor: '#0D2229',
    justifyContent: 'center',
  },
  toastText: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
    flex: 1,
    marginRight: 10,
  },
  deferredContent: {
    flexDirection: 'column',
    gap: 2,
  },
  deferredTitle: {
    color: CRIMSON_ONI.agedGoldBright,
    fontSize: 14,
    fontWeight: '700',
  },
  deferredSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  actionButton: {
    backgroundColor: COLORS.gold,
    minHeight: 44,
    minWidth: 106,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.gold,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 4,
  },
  actionButtonText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  actionButtonSecondary: {
    backgroundColor: CRIMSON_ONI.charcoalElevated,
    borderWidth: 1.5,
    borderColor: CRIMSON_ONI.agedGold,
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonSecondaryText: {
    color: CRIMSON_ONI.agedGoldBright,
    fontSize: 13,
    fontWeight: '700',
  },
  buttonPressed: {
    opacity: 0.75,
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 10000,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: CRIMSON_ONI.charcoalCard,
    borderWidth: 1.5,
    borderColor: CRIMSON_ONI.crimsonGlow,
    borderRadius: 16,
    padding: 20,
    shadowColor: CRIMSON_ONI.crimson,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  modalIcon: {
    fontSize: 26,
  },
  modalTitle: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  versionBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    marginBottom: 16,
    backgroundColor: CRIMSON_ONI.charcoalBase,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.charcoalElevated,
  },
  versionBadge: {
    alignItems: 'center',
  },
  versionBadgeNew: {},
  versionBadgeLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  versionBadgeValue: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  versionBadgeValueNew: {
    color: COLORS.gold,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 2,
  },
  versionArrow: {
    color: CRIMSON_ONI.agedGold,
    fontSize: 16,
    fontWeight: '700',
  },
  modalBody: {
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  releaseNotesBox: {
    backgroundColor: CRIMSON_ONI.charcoalBase,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.charcoalElevated,
    marginBottom: 18,
  },
  releaseNotesHeader: {
    color: CRIMSON_ONI.agedGold,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  releaseNotesContent: {
    color: COLORS.textPrimary,
    fontSize: 13,
    lineHeight: 18,
  },
  modalActions: {
    flexDirection: 'column',
    gap: 10,
  },
  downloadButton: {
    backgroundColor: CRIMSON_ONI.crimson,
    borderColor: CRIMSON_ONI.crimsonGlow,
    borderWidth: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  downloadButtonText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  laterButton: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  laterButtonText: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
});

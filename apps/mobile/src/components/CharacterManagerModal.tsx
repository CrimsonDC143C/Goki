import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import {
  CHARACTER_APPEARANCES,
  CharacterAppearancePreset,
  getCharacterAppearance,
  getCharacterBustSource,
  getCharacterStandingSource,
} from '../assets/characterArtRegistry';
import { PersistedCharacterProfile } from '../utils/offlineStorage';
import { useGame } from '../state/GameContext';
import { COLORS, CRIMSON_ONI } from '../theme';
import { triggerSensoryCue } from '../utils/sensoryFeedback';

export interface CharacterManagerModalProps {
  visible: boolean;
  onClose: () => void;
  initialCustomizeCharacterId?: string | null;
}

type ModalView = 'ROSTER' | 'CREATE' | 'CUSTOMIZE' | 'CONFIRM_DELETE';

export const CharacterManagerModal: React.FC<CharacterManagerModalProps> = ({
  visible,
  onClose,
  initialCustomizeCharacterId,
}) => {
  const {
    characters,
    deletedCharacters,
    activeCharacterId,
    switchCharacter,
    createCharacter,
    updateCharacterAppearance,
    deleteCharacter,
    restoreCharacter,
  } = useGame();

  const [currentView, setCurrentView] = useState<ModalView>('ROSTER');
  const [creatingMode, setCreatingMode] = useState<'STANDARD' | 'IRONMAN_VERIFIED' | null>(null);
  const [customizingCharacter, setCustomizingCharacter] = useState<PersistedCharacterProfile | null>(null);
  const [characterToDelete, setCharacterToDelete] = useState<PersistedCharacterProfile | null>(null);

  const [newHeroName, setNewHeroName] = useState('');
  const [selectedAppearanceId, setSelectedAppearanceId] = useState<string>('oni_warlord');
  const [previewPose, setPreviewPose] = useState<'standing' | 'bust'>('standing');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [archiveExpanded, setArchiveExpanded] = useState(true);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      setErrorMsg(null);
      setDeleteConfirmText('');
      setLoading(false);
      if (initialCustomizeCharacterId) {
        const char = characters.find((c) => c.id === initialCustomizeCharacterId);
        if (char) {
          setCustomizingCharacter(char);
          setSelectedAppearanceId(char.appearanceId || char.avatarSpriteId || 'oni_warlord');
          setPreviewPose('standing');
          setCurrentView('CUSTOMIZE');
          return;
        }
      }
      setCurrentView('ROSTER');
    }
  }, [visible, initialCustomizeCharacterId, characters]);

  const standardCharacter = characters.find((c) => c.gameMode === 'STANDARD');
  const ironmanCharacter = characters.find((c) => c.gameMode === 'IRONMAN_VERIFIED');
  const activeCount = (standardCharacter ? 1 : 0) + (ironmanCharacter ? 1 : 0);

  const selectedPreset: CharacterAppearancePreset = getCharacterAppearance(selectedAppearanceId);

  const handleSwitch = async (charId: string) => {
    setErrorMsg(null);
    setLoading(true);
    try {
      await switchCharacter(charId);
      triggerSensoryCue('DUNGEON_CLEARED_FANFARE');
      setLoading(false);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to switch hero');
      setLoading(false);
    }
  };

  const handleStartCreate = (mode: 'STANDARD' | 'IRONMAN_VERIFIED') => {
    setErrorMsg(null);
    setNewHeroName('');
    setSelectedAppearanceId(mode === 'IRONMAN_VERIFIED' ? 'oath_sentinel' : 'oni_warlord');
    setPreviewPose('standing');
    setCreatingMode(mode);
    setCurrentView('CREATE');
  };

  const handleStartCustomize = (char: PersistedCharacterProfile) => {
    setErrorMsg(null);
    setCustomizingCharacter(char);
    setSelectedAppearanceId(char.appearanceId || char.avatarSpriteId || 'oni_warlord');
    setPreviewPose('standing');
    setCurrentView('CUSTOMIZE');
  };

  const handleStartDelete = (char: PersistedCharacterProfile) => {
    setErrorMsg(null);
    setCharacterToDelete(char);
    setDeleteConfirmText('');
    setCurrentView('CONFIRM_DELETE');
  };

  const handleSaveAppearance = async () => {
    if (!customizingCharacter) return;
    setErrorMsg(null);
    setLoading(true);
    try {
      const res = await updateCharacterAppearance(selectedAppearanceId, customizingCharacter.id);
      if (!res.ok) {
        setErrorMsg(res.error || 'Failed to update hero appearance.');
        setLoading(false);
        return;
      }
      triggerSensoryCue('CHEST_OPEN_REVEAL');
      setLoading(false);
      setCustomizingCharacter(null);
      setCurrentView('ROSTER');
    } catch (err: any) {
      setErrorMsg(err.message || 'Error saving appearance.');
      setLoading(false);
    }
  };

  const handleForgeHero = async () => {
    if (!creatingMode) return;
    setErrorMsg(null);

    const trimmed = newHeroName.trim();
    if (trimmed.length < 2 || trimmed.length > 32) {
      setErrorMsg('Hero name must be between 2 and 32 characters.');
      return;
    }

    setLoading(true);
    try {
      const res = await createCharacter(trimmed, creatingMode, selectedAppearanceId);
      if (!res.ok) {
        setErrorMsg(res.error || 'Failed to forge hero.');
        setLoading(false);
        return;
      }

      triggerSensoryCue('DUNGEON_CLEARED_FANFARE');
      setLoading(false);
      setCreatingMode(null);
      setCurrentView('ROSTER');
    } catch (err: any) {
      setErrorMsg(err.message || 'Error creating hero.');
      setLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!characterToDelete) return;
    setErrorMsg(null);
    setLoading(true);

    const charToDelete = characterToDelete;
    const isOnlyActiveChar = characters.length <= 1;

    try {
      const res = await deleteCharacter(charToDelete.id);
      if (!res.ok) {
        setErrorMsg(res.error || 'Failed to banish hero.');
        setLoading(false);
        return;
      }

      triggerSensoryCue('SET_MICRO_REWARD_TICK');
      setLoading(false);
      setCharacterToDelete(null);

      // If the deleted hero was the user's only active character, automatically switch into creation view
      if (isOnlyActiveChar) {
        setCreatingMode(charToDelete.gameMode);
        setNewHeroName('');
        setSelectedAppearanceId('oni_warlord');
        setPreviewPose('standing');
        setCurrentView('CREATE');
      } else {
        setCurrentView('ROSTER');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error banishing hero.');
      setLoading(false);
    }
  };

  const handleRestore = async (charId: string) => {
    setErrorMsg(null);
    setLoading(true);
    try {
      const res = await restoreCharacter(charId);
      if (!res.ok) {
        setErrorMsg(res.error || 'Failed to restore fallen hero.');
        setLoading(false);
        return;
      }
      triggerSensoryCue('DUNGEON_CLEARED_FANFARE');
      setLoading(false);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error restoring hero.');
      setLoading(false);
    }
  };

  const handlePermanentErase = async (charId: string) => {
    setErrorMsg(null);
    setLoading(true);
    try {
      const res = await deleteCharacter(charId, true);
      if (!res.ok) {
        setErrorMsg(res.error || 'Failed to permanently erase hero.');
        setLoading(false);
        return;
      }
      triggerSensoryCue('SET_MICRO_REWARD_TICK');
      setLoading(false);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error erasing hero.');
      setLoading(false);
    }
  };

  const renderAppearanceCustomizer = (isEditingExisting: boolean) => (
    <View style={styles.customizerContainer}>
      {/* Large Paired Art Preview Box */}
      <View style={[styles.previewFrame, { borderColor: selectedPreset.accentColor }]}>
        <View style={styles.previewImageWrap}>
          {previewPose === 'standing' ? (
            <ExpoImage
              source={getCharacterStandingSource(selectedAppearanceId) as any}
              style={styles.previewStandingImage}
              contentFit="contain"
            />
          ) : (
            <ExpoImage
              source={getCharacterBustSource(selectedAppearanceId) as any}
              style={[
                styles.previewBustImage,
                { borderColor: selectedPreset.accentColor },
              ]}
              contentFit="cover"
              contentPosition="top center"
            />
          )}
        </View>

        {/* Pose Toggle Controls */}
        <View style={styles.poseToggleRow}>
          <Pressable
            style={[styles.poseToggleBtn, previewPose === 'standing' && styles.poseToggleBtnActive]}
            onPress={() => setPreviewPose('standing')}
          >
            <Text
              style={[
                styles.poseToggleText,
                previewPose === 'standing' && styles.poseToggleTextActive,
              ]}
            >
              🧍 Full Stance
            </Text>
          </Pressable>
          <Pressable
            style={[styles.poseToggleBtn, previewPose === 'bust' && styles.poseToggleBtnActive]}
            onPress={() => setPreviewPose('bust')}
          >
            <Text
              style={[
                styles.poseToggleText,
                previewPose === 'bust' && styles.poseToggleTextActive,
              ]}
            >
              👤 Portrait Medallion
            </Text>
          </Pressable>
        </View>

        {/* Preset Info Banner */}
        <View style={styles.presetMetaBanner}>
          <Text style={[styles.presetTitle, { color: selectedPreset.accentColor }]}>
            {selectedPreset.title}
          </Text>
          <Text style={styles.presetSubtitle}>{selectedPreset.subtitle}</Text>
        </View>
      </View>

      {/* Preset Carousel / Grid */}
      <Text style={styles.gridSectionHeader}>Choose Appearance (10 Looks)</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.presetScrollContent}
      >
        {CHARACTER_APPEARANCES.map((preset) => {
          const isSelected = selectedAppearanceId === preset.id;
          return (
            <Pressable
              key={preset.id}
              style={[
                styles.presetThumbnailCard,
                isSelected && { borderColor: preset.accentColor, borderWidth: 2.5 },
              ]}
              onPress={() => {
                setErrorMsg(null);
                setSelectedAppearanceId(preset.id);
              }}
            >
              <ExpoImage
                source={preset.bustSource as any}
                style={styles.presetThumbImage}
                contentFit="cover"
                contentPosition="top center"
              />
              <Text
                style={[
                  styles.presetThumbLabel,
                  isSelected && { color: preset.accentColor, fontWeight: '900' },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {preset.shortTitle}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Pure Cosmetic Decoupling Note */}
      <View style={styles.cosmeticNoteBox}>
        <Text style={styles.cosmeticNoteText}>
          💡 <Text style={{ fontWeight: '800', color: COLORS.gold }}>Appearance is purely cosmetic.</Text>{' '}
          Your combat archetypes and talent trees are shaped organically by your real-world training.
        </Text>
      </View>

      {/* If Creating: Name Input */}
      {!isEditingExisting && (
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Hero Display Name</Text>
          <TextInput
            style={styles.textInput}
            value={newHeroName}
            onChangeText={setNewHeroName}
            placeholder="e.g., Kaelen Shadowstep"
            placeholderTextColor="#6B7280"
            maxLength={32}
            autoCapitalize="words"
            testID="create-char-name-input"
          />
        </View>
      )}

      {/* Action Buttons */}
      <View style={styles.formActionsRow}>
        <Pressable
          style={styles.cancelBtn}
          onPress={() => {
            setErrorMsg(null);
            setCurrentView('ROSTER');
          }}
          disabled={loading}
        >
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </Pressable>

        {isEditingExisting ? (
          <Pressable
            style={[styles.saveAppearanceBtn, loading && styles.btnDisabled]}
            onPress={handleSaveAppearance}
            disabled={loading}
            testID="save-appearance-btn"
          >
            {loading ? (
              <ActivityIndicator color={COLORS.bgDeep} />
            ) : (
              <Text style={styles.saveAppearanceBtnText}>✨ Save Appearance</Text>
            )}
          </Pressable>
        ) : (
          <Pressable
            style={[styles.forgeSubmitBtn, loading && styles.btnDisabled]}
            onPress={handleForgeHero}
            disabled={loading}
            testID="forge-hero-submit-btn"
          >
            {loading ? (
              <ActivityIndicator color={COLORS.bgDeep} />
            ) : (
              <Text style={styles.forgeSubmitBtnText}>⚡ Forge Hero</Text>
            )}
          </Pressable>
        )}
      </View>
    </View>
  );

  const renderDeleteConfirmation = () => {
    if (!characterToDelete) return null;
    const canConfirm =
      deleteConfirmText.trim().toUpperCase() === 'DELETE' ||
      deleteConfirmText.trim().toLowerCase() === characterToDelete.name.trim().toLowerCase();

    return (
      <View style={styles.deleteDialogWrap}>
        <View style={styles.deleteWarningHeader}>
          <Text style={styles.deleteWarningIcon}>⚠️</Text>
          <Text style={styles.deleteWarningTitle}>Banish Hero to Fallen Archive</Text>
        </View>

        <Text style={styles.deleteWarningBody}>
          Are you sure you want to banish{' '}
          <Text style={{ fontWeight: '900', color: COLORS.textPrimary }}>
            {characterToDelete.name}
          </Text>{' '}
          (Lv.{characterToDelete.overallLevel})? This hero will be moved to the{' '}
          <Text style={{ color: COLORS.gold, fontWeight: '800' }}>Fallen Heroes Archive</Text> for{' '}
          <Text style={{ color: '#EF4444', fontWeight: '800' }}>30 days</Text>, where they can be
          restored before being permanently erased.
        </Text>

        <Text style={styles.deleteInstruction}>
          Type <Text style={{ color: '#EF4444', fontWeight: '900' }}>DELETE</Text> below to confirm:
        </Text>

        <TextInput
          style={styles.deleteInput}
          value={deleteConfirmText}
          onChangeText={setDeleteConfirmText}
          placeholder="Type DELETE"
          placeholderTextColor="#6B7280"
          autoCapitalize="characters"
          testID="delete-confirm-input"
        />

        <View style={styles.formActionsRow}>
          <Pressable
            style={styles.cancelBtn}
            onPress={() => {
              setCharacterToDelete(null);
              setDeleteConfirmText('');
              setCurrentView('ROSTER');
            }}
            disabled={loading}
          >
            <Text style={styles.cancelBtnText}>Keep Hero</Text>
          </Pressable>

          <Pressable
            style={[styles.banishSubmitBtn, (!canConfirm || loading) && styles.btnDisabled]}
            onPress={handleConfirmDelete}
            disabled={!canConfirm || loading}
            testID="confirm-delete-hero-btn"
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.banishSubmitBtnText}>🔥 Banish to Fallen Archive</Text>
            )}
          </Pressable>
        </View>
      </View>
    );
  };

  const renderActiveHeroCard = (
    char: PersistedCharacterProfile | undefined,
    mode: 'STANDARD' | 'IRONMAN_VERIFIED'
  ) => {
    const isIronman = mode === 'IRONMAN_VERIFIED';
    const isActive = char && activeCharacterId === char.id;

    return (
      <View style={[styles.slotCard, isIronman && styles.slotCardIronman]}>
        <View style={styles.slotHeaderRow}>
          <View style={isIronman ? styles.slotTagIronman : styles.slotTagStandard}>
            <Text style={isIronman ? styles.slotTagIronmanText : styles.slotTagStandardText}>
              {isIronman ? '🛡️ IRONMAN (WEARABLE)' : '⚔️ STANDARD (HONESTY)'}
            </Text>
          </View>
          {isActive && (
            <View style={isIronman ? styles.activePillIronman : styles.activePill}>
              <Text style={isIronman ? styles.activePillIronmanText : styles.activePillText}>
                ACTIVE HERO
              </Text>
            </View>
          )}
        </View>

        {char ? (
          <View>
            <View style={styles.charInfoRow}>
              <ExpoImage
                source={getCharacterBustSource(char.appearanceId || char.avatarSpriteId) as any}
                style={styles.charSprite}
                contentFit="cover"
                contentPosition="top center"
              />
              <View style={styles.charMetaCol}>
                <Text style={[styles.charNameText, isIronman && { color: '#93C5FD' }]}>
                  {char.name}
                </Text>
                <Text style={styles.charStatsText}>
                  Lv. {char.overallLevel} • {char.adventurerRank} Rank • 🪙 {char.gold}g
                </Text>
              </View>

              {!isActive && (
                <Pressable
                  style={[styles.switchBtn, isIronman && styles.switchBtnIronman]}
                  onPress={() => handleSwitch(char.id)}
                  disabled={loading}
                  testID={`switch-to-${mode.toLowerCase()}-btn`}
                >
                  <Text style={styles.switchBtnText}>Select</Text>
                </Pressable>
              )}
            </View>

            {/* Action Bar: Customize Appearance & Delete Hero */}
            <View style={styles.heroCardActionsRow}>
              <Pressable
                style={styles.customizeHeroBtn}
                onPress={() => handleStartCustomize(char)}
                testID={`customize-appearance-btn-${mode}`}
              >
                <Text style={styles.customizeHeroBtnText}>🎨 Customize Appearance</Text>
              </Pressable>

              <Pressable
                style={styles.deleteHeroBtn}
                onPress={() => handleStartDelete(char)}
                testID={`delete-hero-btn-${mode}`}
              >
                <Text style={styles.deleteHeroBtnText}>🗑️ Delete Hero</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.emptySlotContent}>
            <Text style={styles.emptySlotTitle}>
              {isIronman ? 'Empty Ironman Slot' : 'Empty Standard Slot'}
            </Text>
            <Text style={styles.emptySlotDesc}>
              {isIronman
                ? 'Progress locked to real-time biometric telemetry (Apple Watch, WearOS, Garmin).'
                : '100% Honesty System: Log strength & cardio workouts manually with custom presets.'}
            </Text>
            <Pressable
              style={[styles.createSlotBtn, isIronman && styles.createSlotBtnIronman]}
              onPress={() => handleStartCreate(mode)}
              testID={`forge-${mode === 'STANDARD' ? 'standard' : 'ironman'}-slot-btn`}
            >
              <Text
                style={[
                  styles.createSlotBtnText,
                  isIronman && styles.createSlotBtnIronmanText,
                ]}
              >
                + Forge {isIronman ? 'Ironman' : 'Standard'} Hero
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.dialogCard}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.titleText}>⚔️ Hall of Heroes</Text>
              <Text style={styles.capacitySubtext}>
                Roster Capacity:{' '}
                <Text style={styles.capacityCount}>{activeCount} / 2 Active Heroes</Text>
              </Text>
            </View>
            <Pressable style={styles.closeBtn} onPress={onClose} testID="char-manager-close-btn">
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          {errorMsg && (
            <View style={styles.errorBox} testID="char-manager-error">
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          )}

          <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
            {currentView === 'CREATE' && renderAppearanceCustomizer(false)}
            {currentView === 'CUSTOMIZE' && renderAppearanceCustomizer(true)}
            {currentView === 'CONFIRM_DELETE' && renderDeleteConfirmation()}
            {currentView === 'ROSTER' && (
              <View style={styles.rosterContainer}>
                {/* Account Policy Banner */}
                <View style={styles.policyBanner}>
                  <Text style={styles.policyText}>
                    Each account is permitted{' '}
                    <Text style={{ fontWeight: '800', color: COLORS.gold }}>up to 2 active heroes</Text>:
                    one for <Text style={{ color: COLORS.textPrimary }}>Standard Mode</Text> (manual
                    honesty) and one for <Text style={{ color: '#60A5FA' }}>Ironman Mode</Text>{' '}
                    (wearable verified).
                  </Text>
                </View>

                {/* SLOT 1: Standard Mode */}
                {renderActiveHeroCard(standardCharacter, 'STANDARD')}

                {/* SLOT 2: Ironman Verified */}
                {renderActiveHeroCard(ironmanCharacter, 'IRONMAN_VERIFIED')}

                {/* FALLEN HEROES ARCHIVE SECTION (30-Day Restoration) */}
                {deletedCharacters.length > 0 && (
                  <View style={styles.archiveSection}>
                    <Pressable
                      style={styles.archiveToggleHeader}
                      onPress={() => setArchiveExpanded((prev) => !prev)}
                      testID="fallen-heroes-archive-toggle"
                    >
                      <View style={styles.archiveToggleLeft}>
                        <Text style={styles.archiveIcon}>⏳</Text>
                        <Text style={styles.archiveTitle}>
                          Fallen Heroes Archive ({deletedCharacters.length})
                        </Text>
                      </View>
                      <Text style={styles.archiveToggleArrow}>
                        {archiveExpanded ? '▲ Hide' : '▼ View'}
                      </Text>
                    </Pressable>

                    {archiveExpanded && (
                      <View style={styles.archiveList}>
                        <Text style={styles.archiveExplainer}>
                          Fallen heroes remain in purgatory for 30 days before permanent erasure.
                          Restoring a hero requires a free slot in that game mode.
                        </Text>
                        {deletedCharacters.map((char) => (
                          <View key={char.id} style={styles.archiveCard}>
                            <View style={styles.archiveCardTop}>
                              <ExpoImage
                                source={
                                  getCharacterBustSource(
                                    char.appearanceId || char.avatarSpriteId
                                  ) as any
                                }
                                style={styles.archiveSprite}
                                contentFit="cover"
                                contentPosition="top center"
                              />
                              <View style={styles.archiveMetaCol}>
                                <View style={styles.archiveNameRow}>
                                  <Text style={styles.archiveName}>{char.name}</Text>
                                  <View style={styles.daysPill}>
                                    <Text style={styles.daysPillText}>
                                      {char.daysRemaining ?? 30}d left
                                    </Text>
                                  </View>
                                </View>
                                <Text style={styles.archiveDetails}>
                                  Lv. {char.overallLevel} •{' '}
                                  {char.gameMode === 'STANDARD' ? '⚔️ Standard' : '🛡️ Ironman'} • 🪙{' '}
                                  {char.gold}g
                                </Text>
                              </View>
                            </View>

                            <View style={styles.archiveActionsRow}>
                              <Pressable
                                style={styles.restoreBtn}
                                onPress={() => handleRestore(char.id)}
                                disabled={loading}
                                testID={`restore-hero-btn-${char.id}`}
                              >
                                <Text style={styles.restoreBtnText}>✨ Restore Hero</Text>
                              </Pressable>

                              <Pressable
                                style={styles.eraseBtn}
                                onPress={() => handlePermanentErase(char.id)}
                                disabled={loading}
                                testID={`permanent-delete-btn-${char.id}`}
                              >
                                <Text style={styles.eraseBtnText}>Permanently Erase</Text>
                              </Pressable>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                )}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(9, 12, 18, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '92%',
    backgroundColor: COLORS.bgCard,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: COLORS.gold,
    padding: 18,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  titleText: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.textPrimary,
  },
  capacitySubtext: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  capacityCount: {
    color: COLORS.gold,
    fontWeight: '800',
  },
  closeBtn: {
    padding: 6,
  },
  closeBtnText: {
    color: COLORS.textSecondary,
    fontSize: 16,
    fontWeight: '800',
  },
  policyBanner: {
    backgroundColor: 'rgba(30, 27, 24, 0.85)',
    borderLeftWidth: 3,
    borderLeftColor: COLORS.gold,
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  policyText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    lineHeight: 16,
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: '#EF4444',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  errorText: {
    color: '#F87171',
    fontSize: 12,
    fontWeight: '600',
  },
  scrollArea: {
    maxHeight: 520,
  },
  rosterContainer: {
    gap: 12,
  },
  slotCard: {
    backgroundColor: COLORS.bgDeep,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#374151',
    padding: 14,
  },
  slotCardIronman: {
    borderColor: '#1E3A8A',
  },
  slotHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  slotTagStandard: {
    backgroundColor: 'rgba(217, 119, 6, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  slotTagStandardText: {
    color: '#F59E0B',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  slotTagIronman: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  slotTagIronmanText: {
    color: '#60A5FA',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  activePill: {
    backgroundColor: COLORS.gold,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  activePillText: {
    color: COLORS.bgDeep,
    fontSize: 9,
    fontWeight: '900',
  },
  activePillIronman: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  activePillIronmanText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
  },
  charInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  charSprite: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: COLORS.gold,
    backgroundColor: '#1E1E24',
  },
  charMetaCol: {
    flex: 1,
  },
  charNameText: {
    fontSize: 15,
    fontWeight: '900',
    color: COLORS.textPrimary,
  },
  charStatsText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  switchBtn: {
    backgroundColor: COLORS.gold,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  switchBtnIronman: {
    backgroundColor: '#2563EB',
  },
  switchBtnText: {
    color: COLORS.bgDeep,
    fontSize: 11,
    fontWeight: '900',
  },
  heroCardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#262626',
    gap: 8,
  },
  customizeHeroBtn: {
    flex: 1,
    backgroundColor: 'rgba(217, 119, 6, 0.12)',
    borderWidth: 1,
    borderColor: CRIMSON_ONI.agedGold,
    borderRadius: 8,
    paddingVertical: 6,
    alignItems: 'center',
  },
  customizeHeroBtnText: {
    color: CRIMSON_ONI.agedGoldBright,
    fontSize: 11,
    fontWeight: '800',
  },
  deleteHeroBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
    alignItems: 'center',
  },
  deleteHeroBtnText: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: '700',
  },
  emptySlotContent: {
    paddingVertical: 8,
  },
  emptySlotTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textSecondary,
  },
  emptySlotDesc: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 3,
    marginBottom: 10,
    lineHeight: 16,
  },
  createSlotBtn: {
    backgroundColor: 'rgba(217, 119, 6, 0.15)',
    borderWidth: 1,
    borderColor: COLORS.gold,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  createSlotBtnText: {
    color: COLORS.gold,
    fontSize: 12,
    fontWeight: '800',
  },
  createSlotBtnIronman: {
    backgroundColor: 'rgba(37, 99, 235, 0.15)',
    borderColor: '#3B82F6',
  },
  createSlotBtnIronmanText: {
    color: '#60A5FA',
    fontSize: 12,
    fontWeight: '800',
  },

  /* Appearance Customizer Styles */
  customizerContainer: {
    gap: 12,
  },
  previewFrame: {
    backgroundColor: '#0F1218',
    borderRadius: 14,
    borderWidth: 1.5,
    overflow: 'hidden',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  previewImageWrap: {
    width: '100%',
    height: 180,
    marginVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewStandingImage: {
    width: '100%',
    height: 176,
  },
  previewBustImage: {
    width: 152,
    height: 152,
    borderRadius: 76,
    borderWidth: 2.5,
    borderColor: CRIMSON_ONI.agedGold,
  },
  poseToggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    marginBottom: 8,
  },
  poseToggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: '#1E2330',
    borderWidth: 1,
    borderColor: '#374151',
  },
  poseToggleBtnActive: {
    backgroundColor: CRIMSON_ONI.agedGoldDim,
    borderColor: CRIMSON_ONI.agedGoldBright,
  },
  poseToggleText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  poseToggleTextActive: {
    color: CRIMSON_ONI.agedGoldBright,
    fontWeight: '900',
  },
  presetMetaBanner: {
    alignItems: 'center',
    marginTop: 4,
    paddingHorizontal: 8,
  },
  presetTitle: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  presetSubtitle: {
    fontSize: 11,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 2,
  },
  gridSectionHeader: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  presetScrollContent: {
    gap: 10,
    paddingVertical: 4,
  },
  presetThumbnailCard: {
    width: 84,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#374151',
    backgroundColor: '#181C26',
    padding: 6,
  },
  presetThumbImage: {
    width: 54,
    height: 54,
    borderRadius: 27,
  },
  presetThumbLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
    fontWeight: '700',
    marginTop: 4,
    textAlign: 'center',
    width: '100%',
  },
  cosmeticNoteBox: {
    backgroundColor: 'rgba(217, 119, 6, 0.08)',
    borderLeftWidth: 3,
    borderLeftColor: COLORS.gold,
    borderRadius: 6,
    padding: 8,
  },
  cosmeticNoteText: {
    fontSize: 10.5,
    color: '#D1D5DB',
    lineHeight: 15,
  },
  fieldGroup: {
    marginTop: 4,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textSecondary,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  textInput: {
    backgroundColor: '#1E2330',
    borderWidth: 1.5,
    borderColor: '#374151',
    borderRadius: 8,
    color: COLORS.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    fontWeight: '600',
  },
  formActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#262626',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '800',
  },
  saveAppearanceBtn: {
    flex: 2,
    backgroundColor: CRIMSON_ONI.agedGold,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  saveAppearanceBtnText: {
    color: CRIMSON_ONI.charcoalDeep,
    fontSize: 12,
    fontWeight: '900',
  },
  forgeSubmitBtn: {
    flex: 2,
    backgroundColor: COLORS.gold,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  forgeSubmitBtnText: {
    color: COLORS.bgDeep,
    fontSize: 12,
    fontWeight: '900',
  },
  btnDisabled: {
    opacity: 0.45,
  },

  /* Delete Confirmation Styles */
  deleteDialogWrap: {
    backgroundColor: 'rgba(30, 15, 18, 0.95)',
    borderWidth: 1.5,
    borderColor: '#EF4444',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  deleteWarningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deleteWarningIcon: {
    fontSize: 20,
  },
  deleteWarningTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#EF4444',
  },
  deleteWarningBody: {
    fontSize: 12,
    color: '#E5E7EB',
    lineHeight: 18,
  },
  deleteInstruction: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 4,
  },
  deleteInput: {
    backgroundColor: '#1C1518',
    borderWidth: 1.5,
    borderColor: '#EF4444',
    borderRadius: 8,
    color: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 2,
  },
  banishSubmitBtn: {
    flex: 2,
    backgroundColor: '#DC2626',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  banishSubmitBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },

  /* Fallen Heroes Archive Styles */
  archiveSection: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#27272A',
    paddingTop: 12,
  },
  archiveToggleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 20, 25, 0.65)',
    borderWidth: 1,
    borderColor: '#4A2830',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  archiveToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  archiveIcon: {
    fontSize: 14,
  },
  archiveTitle: {
    color: '#F472B6',
    fontSize: 12,
    fontWeight: '800',
  },
  archiveToggleArrow: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '700',
  },
  archiveList: {
    marginTop: 8,
    gap: 8,
  },
  archiveExplainer: {
    fontSize: 10.5,
    color: '#9CA3AF',
    lineHeight: 15,
    fontStyle: 'italic',
  },
  archiveCard: {
    backgroundColor: '#16141A',
    borderWidth: 1,
    borderColor: '#3F2C35',
    borderRadius: 10,
    padding: 10,
  },
  archiveCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  archiveSprite: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#9CA3AF',
    opacity: 0.8,
  },
  archiveMetaCol: {
    flex: 1,
  },
  archiveNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  archiveName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#D1D5DB',
  },
  daysPill: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  daysPillText: {
    color: '#F87171',
    fontSize: 9.5,
    fontWeight: '800',
  },
  archiveDetails: {
    fontSize: 10.5,
    color: '#6B7280',
    marginTop: 2,
  },
  archiveActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#27272A',
  },
  restoreBtn: {
    backgroundColor: CRIMSON_ONI.agedGold,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  restoreBtnText: {
    color: CRIMSON_ONI.charcoalDeep,
    fontSize: 10.5,
    fontWeight: '900',
  },
  eraseBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  eraseBtnText: {
    color: '#EF4444',
    fontSize: 10.5,
    fontWeight: '700',
  },
});

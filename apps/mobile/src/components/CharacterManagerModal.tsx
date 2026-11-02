import React, { useState } from 'react';
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
import { useGame } from '../state/GameContext';
import { COLORS, CRIMSON_ONI } from '../theme';
import { triggerSensoryCue } from '../utils/sensoryFeedback';
import { HERO_SPRITES } from '../../assets/sprites';
import { Image } from 'expo-image';

export interface CharacterManagerModalProps {
  visible: boolean;
  onClose: () => void;
}

const ARCHETYPES = [
  { id: 'warrior', name: 'Juggernaut', role: 'Heavy Defense & Power', spriteKey: 'warrior' },
  { id: 'berserker', name: 'Berserker', role: 'Pure Melee Aggression', spriteKey: 'berserker' },
  { id: 'vanguard', name: 'Vanguard', role: 'Radiant Holy Guardian', spriteKey: 'vanguard' },
  { id: 'warden', name: 'Warden', role: 'Endurance & Nature Sustain', spriteKey: 'warden' },
  { id: 'outrider', name: 'Outrider', role: 'Cardio Haste & Evasion', spriteKey: 'outrider' },
  { id: 'assassin', name: 'Assassin', role: 'Critical Strikes & Lethality', spriteKey: 'assassin' },
];

export const CharacterManagerModal: React.FC<CharacterManagerModalProps> = ({
  visible,
  onClose,
}) => {
  const {
    characters,
    activeCharacterId,
    characterName,
    gameMode,
    switchCharacter,
    createCharacter,
    isAuthenticated,
  } = useGame();

  const [creatingMode, setCreatingMode] = useState<'STANDARD' | 'IRONMAN_VERIFIED' | null>(null);
  const [newHeroName, setNewHeroName] = useState('');
  const [selectedSprite, setSelectedSprite] = useState('warrior');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const standardCharacter = characters.find((c) => c.gameMode === 'STANDARD');
  const ironmanCharacter = characters.find((c) => c.gameMode === 'IRONMAN_VERIFIED');
  const characterCount = (standardCharacter ? 1 : 0) + (ironmanCharacter ? 1 : 0);

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
    setSelectedSprite(mode === 'IRONMAN_VERIFIED' ? 'vanguard' : 'warrior');
    setCreatingMode(mode);
  };

  const handleCancelCreate = () => {
    setCreatingMode(null);
    setErrorMsg(null);
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
      const res = await createCharacter(trimmed, creatingMode, selectedSprite);
      if (!res.ok) {
        setErrorMsg(res.error || 'Failed to forge hero.');
        setLoading(false);
        return;
      }

      triggerSensoryCue('DUNGEON_CLEARED_FANFARE');
      setLoading(false);
      setCreatingMode(null);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error creating hero.');
      setLoading(false);
    }
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
                Roster Capacity: <Text style={styles.capacityCount}>{characterCount} / 2 Heroes</Text>
              </Text>
            </View>
            <Pressable style={styles.closeBtn} onPress={onClose} testID="char-manager-close-btn">
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          {/* Account Policy Banner */}
          <View style={styles.policyBanner}>
            <Text style={styles.policyText}>
              Each account is permitted <Text style={{ fontWeight: '800', color: COLORS.gold }}>up to 2 heroes</Text>:
              one for <Text style={{ color: COLORS.textPrimary }}>Standard Mode</Text> (manual honesty) and one for{' '}
              <Text style={{ color: '#60A5FA' }}>Ironman Mode</Text> (wearable verified).
            </Text>
          </View>

          {errorMsg && (
            <View style={styles.errorBox} testID="char-manager-error">
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          )}

          <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
            {creatingMode ? (
              /* Character Creation Sub-form */
              <View style={styles.createFormContainer}>
                <View style={styles.formModeHeader}>
                  <Text style={styles.formModeTitle}>
                    Forging {creatingMode === 'STANDARD' ? 'Standard Honesty Hero' : 'Ironman Verified Hero'}
                  </Text>
                  <Text style={styles.formModeDesc}>
                    {creatingMode === 'STANDARD'
                      ? '100% Honesty System: Log strength & cardio workouts manually with custom presets and instant travel.'
                      : 'Hardware Verified Realm: Progress is verified via Apple HealthKit / Google Health Connect biometrics.'}
                  </Text>
                </View>

                {/* Hero Name Input */}
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

                {/* Archetype / Avatar Picker */}
                <Text style={styles.fieldLabel}>Select Hero Archetype</Text>
                <View style={styles.archetypeGrid}>
                  {ARCHETYPES.map((arch) => {
                    const isSelected = selectedSprite === arch.id;
                    const spriteUri = HERO_SPRITES[arch.spriteKey] || HERO_SPRITES.default;
                    return (
                      <Pressable
                        key={arch.id}
                        style={[styles.archetypeCard, isSelected && styles.archetypeCardSelected]}
                        onPress={() => setSelectedSprite(arch.id)}
                      >
                        <Image source={{ uri: spriteUri }} style={styles.archetypeSprite} contentFit="contain" />
                        <Text style={[styles.archetypeName, isSelected && styles.archetypeNameSelected]}>
                          {arch.name}
                        </Text>
                        <Text style={styles.archetypeRole} numberOfLines={1}>
                          {arch.role}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Actions */}
                <View style={styles.formActionsRow}>
                  <Pressable style={styles.cancelBtn} onPress={handleCancelCreate} disabled={loading}>
                    <Text style={styles.cancelBtnText}>Back</Text>
                  </Pressable>

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
                </View>
              </View>
            ) : (
              /* Hero Roster Slots */
              <View style={styles.rosterContainer}>
                {/* SLOT 1: Standard Mode Hero */}
                <View style={styles.slotCard}>
                  <View style={styles.slotHeaderRow}>
                    <View style={styles.slotTagStandard}>
                      <Text style={styles.slotTagStandardText}>⚔️ STANDARD (HONESTY)</Text>
                    </View>
                    {standardCharacter && activeCharacterId === standardCharacter.id && (
                      <View style={styles.activePill}>
                        <Text style={styles.activePillText}>ACTIVE HERO</Text>
                      </View>
                    )}
                  </View>

                  {standardCharacter ? (
                    <View style={styles.charInfoRow}>
                      <Image
                        source={{ uri: HERO_SPRITES[standardCharacter.avatarSpriteId || 'warrior'] || HERO_SPRITES.default }}
                        style={styles.charSprite}
                        contentFit="contain"
                      />
                      <View style={styles.charMetaCol}>
                        <Text style={styles.charNameText}>{standardCharacter.name}</Text>
                        <Text style={styles.charStatsText}>
                          Lv. {standardCharacter.overallLevel} • {standardCharacter.adventurerRank} Rank • 🪙{' '}
                          {standardCharacter.gold}g
                        </Text>
                      </View>

                      {activeCharacterId !== standardCharacter.id && (
                        <Pressable
                          style={styles.switchBtn}
                          onPress={() => handleSwitch(standardCharacter.id)}
                          disabled={loading}
                          testID="switch-to-standard-btn"
                        >
                          <Text style={styles.switchBtnText}>Select</Text>
                        </Pressable>
                      )}
                    </View>
                  ) : (
                    <View style={styles.emptySlotContent}>
                      <Text style={styles.emptySlotTitle}>Empty Standard Slot</Text>
                      <Text style={styles.emptySlotDesc}>
                        No manual honesty hero forged yet. Log workouts via custom presets and gym equipment.
                      </Text>
                      <Pressable
                        style={styles.createSlotBtn}
                        onPress={() => handleStartCreate('STANDARD')}
                        testID="forge-standard-slot-btn"
                      >
                        <Text style={styles.createSlotBtnText}>+ Forge Standard Hero</Text>
                      </Pressable>
                    </View>
                  )}
                </View>

                {/* SLOT 2: Ironman Verified Hero */}
                <View style={[styles.slotCard, styles.slotCardIronman]}>
                  <View style={styles.slotHeaderRow}>
                    <View style={styles.slotTagIronman}>
                      <Text style={styles.slotTagIronmanText}>🛡️ IRONMAN (WEARABLE)</Text>
                    </View>
                    {ironmanCharacter && activeCharacterId === ironmanCharacter.id && (
                      <View style={styles.activePillIronman}>
                        <Text style={styles.activePillIronmanText}>ACTIVE HERO</Text>
                      </View>
                    )}
                  </View>

                  {ironmanCharacter ? (
                    <View style={styles.charInfoRow}>
                      <Image
                        source={{ uri: HERO_SPRITES[ironmanCharacter.avatarSpriteId || 'vanguard'] || HERO_SPRITES.default }}
                        style={styles.charSprite}
                        contentFit="contain"
                      />
                      <View style={styles.charMetaCol}>
                        <Text style={[styles.charNameText, { color: '#93C5FD' }]}>{ironmanCharacter.name}</Text>
                        <Text style={styles.charStatsText}>
                          Lv. {ironmanCharacter.overallLevel} • {ironmanCharacter.adventurerRank} Rank • 🪙{' '}
                          {ironmanCharacter.gold}g
                        </Text>
                      </View>

                      {activeCharacterId !== ironmanCharacter.id && (
                        <Pressable
                          style={[styles.switchBtn, styles.switchBtnIronman]}
                          onPress={() => handleSwitch(ironmanCharacter.id)}
                          disabled={loading}
                          testID="switch-to-ironman-btn"
                        >
                          <Text style={styles.switchBtnText}>Select</Text>
                        </Pressable>
                      )}
                    </View>
                  ) : (
                    <View style={styles.emptySlotContent}>
                      <Text style={styles.emptySlotTitle}>Empty Ironman Slot</Text>
                      <Text style={styles.emptySlotDesc}>
                        Progress locked to real-time biometric telemetry (Apple Watch, WearOS, Garmin).
                      </Text>
                      <Pressable
                        style={[styles.createSlotBtn, styles.createSlotBtnIronman]}
                        onPress={() => handleStartCreate('IRONMAN_VERIFIED')}
                        testID="forge-ironman-slot-btn"
                      >
                        <Text style={styles.createSlotBtnIronmanText}>+ Forge Ironman Hero</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
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
    maxWidth: 460,
    maxHeight: '90%',
    backgroundColor: COLORS.bgCard,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: COLORS.gold,
    padding: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  titleText: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.textPrimary,
  },
  capacitySubtext: {
    fontSize: 11,
    color: COLORS.textMuted,
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
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textMuted,
  },
  policyBanner: {
    backgroundColor: COLORS.bgElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
  },
  policyText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    lineHeight: 16,
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  errorText: {
    color: '#F87171',
    fontSize: 12,
    fontWeight: '600',
  },
  scrollArea: {
    flexGrow: 0,
  },
  rosterContainer: {
    gap: 12,
  },
  slotCard: {
    backgroundColor: COLORS.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
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
    backgroundColor: 'rgba(245, 184, 65, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(245, 184, 65, 0.3)',
  },
  slotTagStandardText: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.gold,
    letterSpacing: 0.5,
  },
  slotTagIronman: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  slotTagIronmanText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#60A5FA',
    letterSpacing: 0.5,
  },
  activePill: {
    backgroundColor: COLORS.gold,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  activePillText: {
    color: COLORS.bgDeep,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  activePillIronman: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  activePillIronmanText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  charInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  charSprite: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.bgDeep,
  },
  charMetaCol: {
    flex: 1,
  },
  charNameText: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  charStatsText: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  switchBtn: {
    backgroundColor: COLORS.gold,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
  },
  switchBtnIronman: {
    backgroundColor: '#2563EB',
  },
  switchBtnText: {
    color: COLORS.bgDeep,
    fontSize: 12,
    fontWeight: '800',
  },
  emptySlotContent: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  emptySlotTitle: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptySlotDesc: {
    color: COLORS.textMuted,
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 12,
    paddingHorizontal: 12,
    lineHeight: 16,
  },
  createSlotBtn: {
    backgroundColor: 'rgba(245, 184, 65, 0.15)',
    borderWidth: 1,
    borderColor: COLORS.gold,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  createSlotBtnText: {
    color: COLORS.gold,
    fontSize: 12,
    fontWeight: '800',
  },
  createSlotBtnIronman: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderColor: '#3B82F6',
  },
  createSlotBtnIronmanText: {
    color: '#60A5FA',
    fontSize: 12,
    fontWeight: '800',
  },
  createFormContainer: {
    paddingVertical: 4,
  },
  formModeHeader: {
    backgroundColor: COLORS.bgDeep,
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  formModeTitle: {
    color: COLORS.gold,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 4,
  },
  formModeDesc: {
    color: COLORS.textSecondary,
    fontSize: 11,
    lineHeight: 15,
  },
  fieldGroup: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textSecondary,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  textInput: {
    backgroundColor: COLORS.bgDeep,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.textPrimary,
    fontSize: 14,
  },
  archetypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  archetypeCard: {
    width: '48%',
    backgroundColor: COLORS.bgElevated,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 10,
    alignItems: 'center',
  },
  archetypeCardSelected: {
    borderColor: COLORS.gold,
    backgroundColor: 'rgba(245, 184, 65, 0.1)',
  },
  archetypeSprite: {
    width: 40,
    height: 40,
    marginBottom: 6,
  },
  archetypeName: {
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 2,
  },
  archetypeNameSelected: {
    color: COLORS.gold,
  },
  archetypeRole: {
    color: COLORS.textMuted,
    fontSize: 9,
    textAlign: 'center',
  },
  formActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: COLORS.bgElevated,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  forgeSubmitBtn: {
    flex: 2,
    backgroundColor: COLORS.gold,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  forgeSubmitBtnText: {
    color: COLORS.bgDeep,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  btnDisabled: {
    opacity: 0.6,
  },
});

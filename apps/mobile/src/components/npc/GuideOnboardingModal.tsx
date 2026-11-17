import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CHARACTER_RACES,
  CharacterRace,
  RACE_DEFINITIONS,
  adaptCustomizationForRaceChange,
} from '@goki/game-engine';
import { useGame } from '../../state/GameContext';
import { COLORS, RADII, SPACING, SURFACES, TYPOGRAPHY } from '../../theme';
import { RpgIcon } from '../icons/RpgIcon';
import { HairlineDivider } from '../ui/SurfacePrimitives';
import { NpcPortraitSvg } from './NpcPortraitSvg';

export interface GuideOnboardingModalProps {
  visible: boolean;
  onClose: () => void;
  onNavigateToTrain?: () => void;
  onNavigateToAdventure?: () => void;
  onNavigateToArtisan?: () => void;
  onNavigateToSocial?: () => void;
}

const TOTAL_STEPS = 4;

export const GuideOnboardingModal: React.FC<GuideOnboardingModalProps> = ({
  visible,
  onClose,
  onNavigateToTrain,
  onNavigateToAdventure,
  onNavigateToArtisan,
  onNavigateToSocial,
}) => {
  const insets = useSafeAreaInsets();
  const {
    characterName,
    race,
    customizationConfig,
    guideOnboardingCompleted,
    updateCharacterCustomization,
    completeGuideOnboarding,
  } = useGame();

  const [step, setStep] = useState(0);
  const [raceSaving, setRaceSaving] = useState(false);
  const [completing, setCompleting] = useState(false);

  useEffect(() => {
    if (visible) {
      setStep(0);
    }
  }, [visible]);

  const handleSelectRace = async (targetRace: CharacterRace) => {
    if (race === targetRace || raceSaving) return;
    setRaceSaving(true);
    const adapted = adaptCustomizationForRaceChange(customizationConfig, targetRace);
    await updateCharacterCustomization({
      race: targetRace,
      customizationConfig: adapted,
    });
    setRaceSaving(false);
  };

  const handleFinish = async () => {
    setCompleting(true);
    await completeGuideOnboarding();
    setCompleting(false);
    onClose();
  };

  const handleQuickNavigate = (fn?: () => void) => {
    onClose();
    fn?.();
  };

  const stepMeta = [
    { eyebrow: 'STEP 1 OF 4 • LINEAGE', title: 'Choose Your Lineage (Purely Cosmetic)' },
    { eyebrow: 'STEP 2 OF 4 • TRAINING LOOP', title: 'Log Workouts & 7 Holistic Stats' },
    { eyebrow: 'STEP 3 OF 4 • WORLD LOOP', title: "Adventurer's Guild & Artisan Foundry" },
    { eyebrow: 'STEP 4 OF 4 • FELLOWSHIP', title: 'Home Clan, Gym Clans & Weekly Raids' },
  ][step]!;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root} testID="guide-onboarding-modal">
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View
          style={[
            styles.sheet,
            {
              marginTop: Math.max(insets.top + 16, 28),
              marginBottom: Math.max(insets.bottom + 12, 20),
            },
          ]}
        >
          {/* Auren Header */}
          <View style={styles.headerRow}>
            <NpcPortraitSvg
              npcId="GUIDE"
              size={64}
              expression={step === 3 ? 'happy' : 'neutral'}
            />
            <View style={styles.headerCol}>
              <Text style={styles.eyebrow}>{stepMeta.eyebrow}</Text>
              <Text style={styles.title}>{stepMeta.title}</Text>
              <Text style={styles.subTitle}>
                Auren the Wayfinder • Welcome, {characterName || 'Adventurer'}
              </Text>
            </View>
            <Pressable
              style={styles.closeBtn}
              onPress={onClose}
              testID="guide-ftue-close-btn"
              hitSlop={8}
            >
              <RpgIcon name="close" size={16} color={COLORS.textSecondary} />
            </Pressable>
          </View>

          {/* Step Dots */}
          <View style={styles.dotsRow}>
            {Array.from({ length: TOTAL_STEPS }).map((_, idx) => (
              <Pressable
                key={idx}
                style={[styles.dot, idx === step && styles.dotActive, idx < step && styles.dotDone]}
                onPress={() => setStep(idx)}
              />
            ))}
          </View>

          <HairlineDivider spacing={SPACING.xs} />

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {step === 0 && (
              <>
                <Text style={styles.body}>
                  Select how your hero walks the Iron Sanctum. Human, Oni, and Kitsune share identical combat and stat caps — every lineage choice is 100% cosmetic and can be changed anytime in Appearance.
                </Text>

                <View style={styles.raceList}>
                  {CHARACTER_RACES.map((r) => {
                    const def = RACE_DEFINITIONS[r];
                    const selected = race === r;
                    return (
                      <TouchableOpacity
                        key={r}
                        style={[styles.raceCard, selected && styles.raceCardSelected]}
                        onPress={() => void handleSelectRace(r)}
                        disabled={raceSaving}
                        activeOpacity={0.8}
                        testID={`ftue-race-${r.toLowerCase()}`}
                      >
                        <View style={styles.raceCardTop}>
                          <Text style={[styles.raceName, selected && { color: COLORS.gold }]}>
                            {def.name}
                          </Text>
                          <View style={styles.raceBadge}>
                            <Text style={styles.raceBadgeText}>
                              {selected ? 'SELECTED' : 'EQUAL CAPS'}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.raceTagline}>{def.tagline}</Text>
                        <Text style={styles.raceLore}>{def.lore}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {step === 1 && (
              <>
                <Text style={styles.body}>
                  Every real-world workout you log in Train converts effort into 7 holistic stats (Strength, Endurance, Agility, Dexterity, Constitution, Wisdom, and Spirit) and unlocks Talent Points.
                </Text>
                <View style={styles.infoCard}>
                  <Text style={styles.infoTitle}>Opt-In Physique & Aura Morphs</Text>
                  <Text style={styles.infoBody}>
                    Raising stats unlocks muscular definition tiers, vascularity, battle scars, and elemental auras under Hero → Appearance. You always choose what to equip.
                  </Text>
                </View>
                <View style={styles.infoCard}>
                  <Text style={styles.infoTitle}>Master Kaelen's Coaching</Text>
                  <Text style={styles.infoBody}>
                    In Train, tap Coach to inspect weekly MEV/MAV/MRV muscle landmarks, progressive overload targets, and structured 4-week workout programs.
                  </Text>
                </View>
                {onNavigateToTrain ? (
                  <TouchableOpacity
                    style={styles.quickChip}
                    onPress={() => handleQuickNavigate(onNavigateToTrain)}
                    activeOpacity={0.8}
                    testID="ftue-go-train-btn"
                  >
                    <RpgIcon name="train" size={14} color={SURFACES.canvas} />
                    <Text style={styles.quickChipText}>Go to Train</Text>
                  </TouchableOpacity>
                ) : null}
              </>
            )}

            {step === 2 && (
              <>
                <Text style={styles.body}>
                  Take your trained hero into unlimited Turn-Based Quests at the Adventurer's Guild, and keep your 2-hour Gathering & Crafting loop humming at the Artisan Foundry.
                </Text>
                <View style={styles.infoCard}>
                  <Text style={styles.infoTitle}>Adventurer's Guild & Dungeons</Text>
                  <Text style={styles.infoBody}>
                    Fight tactical turn-based encounters with AI companions, rank up from Copper to Mythic, and earn Gold, gear drops, and reputation.
                  </Text>
                </View>
                <View style={styles.infoCard}>
                  <Text style={styles.infoTitle}>Artisan Foundry & Bramwell</Text>
                  <Text style={styles.infoBody}>
                    Mine ore, forage astral herbs, smelt ingots, brew belt potions, reforge gear affixes, and trade daily stock with Bramwell.
                  </Text>
                </View>
                <View style={styles.chipRow}>
                  {onNavigateToAdventure ? (
                    <TouchableOpacity
                      style={styles.quickChipSubtle}
                      onPress={() => handleQuickNavigate(onNavigateToAdventure)}
                      activeOpacity={0.8}
                      testID="ftue-go-adventure-btn"
                    >
                      <RpgIcon name="adventure" size={14} color={COLORS.gold} />
                      <Text style={styles.quickChipSubtleText}>Adventure</Text>
                    </TouchableOpacity>
                  ) : null}
                  {onNavigateToArtisan ? (
                    <TouchableOpacity
                      style={styles.quickChipSubtle}
                      onPress={() => handleQuickNavigate(onNavigateToArtisan)}
                      activeOpacity={0.8}
                      testID="ftue-go-artisan-btn"
                    >
                      <RpgIcon name="artisan" size={14} color={COLORS.gold} />
                      <Text style={styles.quickChipSubtleText}>Artisan</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </>
            )}

            {step === 3 && (
              <>
                <Text style={styles.body}>
                  No hero walks alone. You automatically belong to your open-world Home Clan — and you can join 1 sanctioned real-world Gym Clan to coordinate weekly Raid Boss strikes.
                </Text>
                <View style={styles.infoCard}>
                  <Text style={styles.infoTitle}>Weekly Public & Guild Raids</Text>
                  <Text style={styles.infoBody}>
                    Channel strenuous workout energy and daily combat strikes against World-Forge Raid Bosses for Titanite Embers and Raid Essence Crystals.
                  </Text>
                </View>
                <View style={[styles.infoCard, styles.giftCard]}>
                  <View style={styles.giftRow}>
                    <RpgIcon name="prof-alchemy" size={18} color={COLORS.success} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.infoTitle}>Auren's Welcome Provision</Text>
                      <Text style={styles.infoBody}>
                        {guideOnboardingCompleted
                          ? 'Welcome draught already claimed! Ready for adventure.'
                          : 'Claim 1× Sunleaf Healing Draught to stock your combat belt.'}
                      </Text>
                    </View>
                  </View>
                </View>
                {onNavigateToSocial ? (
                  <TouchableOpacity
                    style={styles.quickChipSubtle}
                    onPress={() => handleQuickNavigate(onNavigateToSocial)}
                    activeOpacity={0.8}
                    testID="ftue-go-social-btn"
                  >
                    <RpgIcon name="social" size={14} color={COLORS.gold} />
                    <Text style={styles.quickChipSubtleText}>Visit Social & Clans</Text>
                  </TouchableOpacity>
                ) : null}
              </>
            )}
          </ScrollView>

          <HairlineDivider spacing={SPACING.xs} />

          {/* Navigation Footer */}
          <View style={styles.footerRow}>
            {step > 0 ? (
              <TouchableOpacity
                style={styles.backBtn}
                onPress={() => setStep((s) => Math.max(0, s - 1))}
                activeOpacity={0.8}
              >
                <RpgIcon name="chevron-left" size={15} color={COLORS.textSecondary} />
                <Text style={styles.backBtnText}>Back</Text>
              </TouchableOpacity>
            ) : (
              <View />
            )}

            {step < TOTAL_STEPS - 1 ? (
              <TouchableOpacity
                style={styles.nextBtn}
                onPress={() => setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1))}
                activeOpacity={0.8}
                testID="guide-ftue-next-btn"
              >
                <Text style={styles.nextBtnText}>Next</Text>
                <RpgIcon name="chevron-right" size={15} color={SURFACES.canvas} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.nextBtn, completing && { opacity: 0.6 }]}
                onPress={() => void handleFinish()}
                disabled={completing}
                activeOpacity={0.8}
                testID="guide-complete-ftue-btn"
              >
                <RpgIcon name="check" size={15} color={SURFACES.canvas} />
                <Text style={styles.nextBtnText}>
                  {completing
                    ? 'Claiming...'
                    : guideOnboardingCompleted
                      ? 'Finish Walkthrough'
                      : 'Claim Welcome Draught & Finish'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACING.md,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: SURFACES.scrim,
  },
  sheet: {
    backgroundColor: SURFACES.layer1,
    borderRadius: RADII.xl,
    padding: SPACING.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SURFACES.goldHairline,
    maxWidth: 560,
    width: '100%',
    maxHeight: '88%',
    alignSelf: 'center',
    gap: SPACING.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  headerCol: {
    flex: 1,
    gap: 2,
  },
  eyebrow: {
    ...TYPOGRAPHY.eyebrow,
    color: COLORS.gold,
  },
  title: {
    ...TYPOGRAPHY.titleLg,
    fontSize: 16,
  },
  subTitle: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: RADII.md,
    backgroundColor: SURFACES.layer2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    flex: 1,
    height: 4,
    borderRadius: RADII.pill,
    backgroundColor: SURFACES.layer3,
  },
  dotActive: {
    backgroundColor: COLORS.gold,
  },
  dotDone: {
    backgroundColor: COLORS.success,
  },
  scroll: {
    flexShrink: 1,
  },
  scrollContent: {
    gap: SPACING.sm,
    paddingBottom: SPACING.sm,
  },
  body: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
  },
  raceList: {
    gap: SPACING.sm,
  },
  raceCard: {
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.lg,
    padding: SPACING.md,
    gap: 4,
    borderWidth: 1,
    borderColor: SURFACES.hairline,
  },
  raceCardSelected: {
    borderColor: COLORS.gold,
    backgroundColor: SURFACES.layer3,
  },
  raceCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  raceName: {
    ...TYPOGRAPHY.titleMd,
  },
  raceBadge: {
    backgroundColor: SURFACES.layer1,
    borderRadius: RADII.sm,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  raceBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.gold,
    letterSpacing: 0.6,
  },
  raceTagline: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.shieldCyan,
  },
  raceLore: {
    ...TYPOGRAPHY.bodySm,
  },
  infoCard: {
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.lg,
    padding: SPACING.md,
    gap: 4,
  },
  giftCard: {
    backgroundColor: SURFACES.emeraldTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.success,
  },
  giftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  infoTitle: {
    ...TYPOGRAPHY.titleMd,
    fontSize: 13,
  },
  infoBody: {
    ...TYPOGRAPHY.bodySm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: COLORS.gold,
    borderRadius: RADII.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  quickChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: SURFACES.canvas,
  },
  quickChipSubtle: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SURFACES.goldHairline,
  },
  quickChipSubtleText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.gold,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: RADII.md,
    backgroundColor: SURFACES.layer2,
  },
  backBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: RADII.md,
    backgroundColor: COLORS.gold,
  },
  nextBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: SURFACES.canvas,
  },
});

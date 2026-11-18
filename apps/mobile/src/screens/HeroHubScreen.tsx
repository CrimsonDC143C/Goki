import React, { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  AURA_PALETTE_OPTIONS,
  BASE_SILHOUETTE_OPTIONS,
  BATTLE_SCARS_TIERS,
  CHARACTER_RACES,
  COMBAT_STANCE_OPTIONS,
  ENERGY_AURA_TIERS,
  EYE_COLOR_OPTIONS,
  EYE_STYLE_OPTIONS,
  FACE_STYLE_OPTIONS,
  FRAME_STATURE_TIERS,
  HAIR_COLOR_OPTIONS,
  HAIR_STYLE_OPTIONS,
  KITSUNE_TAIL_TIERS,
  LEAN_DEFINITION_TIERS,
  MUSCLE_MASS_TIERS,
  ONI_HORN_TIERS,
  RACE_DEFINITIONS,
  SKIN_PALETTE_OPTIONS,
  VASCULARITY_TIERS,
  adaptCustomizationForRaceChange,
  deriveCustomizationFromLegacyAppearance,
  getUnlockedCustomizationState,
  type CharacterCustomizationConfig,
  type CharacterMorphConfig,
  type CharacterRace,
  type CoreStatBlock,
  type HolisticStatType,
  type MorphTierDescriptor,
  type StatType,
} from '@goki/game-engine';
import { CHARACTER_APPEARANCES } from '../assets/characterArtRegistry';
import { CharacterManagerModal } from '../components/CharacterManagerModal';
import { CharacterRigRenderer, type RigAnimationState } from '../components/character';
import { RpgIcon } from '../components/icons/RpgIcon';
import {
  GuideOnboardingModal,
  NpcDialogueOverlay,
  NpcPortraitSvg,
} from '../components/npc';
import {
  HairlineDivider,
  HubSceneBackdrop,
  HubSceneHeaderSlot,
  SegmentedControl,
  SegmentedOption,
  SlateSection,
} from '../components/ui';
import { useGame } from '../state/GameContext';
import { COLORS, RADII, SPACING, SURFACES, TYPOGRAPHY } from '../theme';
import { CharacterProfileScreen } from './CharacterProfileScreen';
import { TalentBuilderScreen } from './TalentBuilderScreen';

export type HeroSubView = 'OVERVIEW' | 'APPEARANCE' | 'TALENTS';

export interface HeroHubScreenProps {
  activeSubView?: HeroSubView;
  onChangeSubView?: (view: HeroSubView) => void;
  initialTalentStat?: HolisticStatType | StatType;
  onNavigateToTrain?: () => void;
  onNavigateToAdventure?: () => void;
  onNavigateToArtisan?: () => void;
  onNavigateToSocial?: () => void;
}

const PREVIEW_ANIMS: ReadonlyArray<{ id: RigAnimationState; label: string }> = [
  { id: 'idle', label: 'Idle' },
  { id: 'walk', label: 'Walk' },
  { id: 'attack', label: 'Attack' },
  { id: 'guard', label: 'Guard' },
  { id: 'hurt', label: 'Hurt' },
  { id: 'victory', label: 'Victory' },
];

function clampMorphsToUnlocked(
  targetRace: CharacterRace,
  morphs: CharacterMorphConfig,
  coreStats: CoreStatBlock
): CharacterMorphConfig {
  const unlocked = getUnlockedCustomizationState(targetRace, coreStats);
  return {
    ...morphs,
    muscleMassTier: Math.min(morphs.muscleMassTier, unlocked.maxMuscleMassTier) as CharacterMorphConfig['muscleMassTier'],
    frameTier: Math.min(morphs.frameTier, unlocked.maxFrameTier) as CharacterMorphConfig['frameTier'],
    leanDefinitionTier: Math.min(morphs.leanDefinitionTier, unlocked.maxLeanDefinitionTier) as CharacterMorphConfig['leanDefinitionTier'],
    combatStance: unlocked.unlockedStances.includes(morphs.combatStance) ? morphs.combatStance : 'neutral',
    scarsTier: Math.min(morphs.scarsTier, unlocked.maxScarsTier) as CharacterMorphConfig['scarsTier'],
    vascularityTier: Math.min(morphs.vascularityTier, unlocked.maxVascularityTier) as CharacterMorphConfig['vascularityTier'],
    oniHornTier: (targetRace === 'ONI' ? Math.min(morphs.oniHornTier, unlocked.maxOniHornTier) : 0) as CharacterMorphConfig['oniHornTier'],
    kitsuneTailCount: (targetRace === 'KITSUNE'
      ? Math.max(1, Math.min(morphs.kitsuneTailCount || 1, unlocked.maxKitsuneTails))
      : 0) as CharacterMorphConfig['kitsuneTailCount'],
    auraTier: Math.min(morphs.auraTier, unlocked.maxAuraTier) as CharacterMorphConfig['auraTier'],
  };
}

interface MorphTierSelectorProps<TValue extends string | number> {
  statBadge: string;
  statColor: string;
  title: string;
  subtitle: string;
  options: readonly MorphTierDescriptor<TValue>[];
  currentValue: TValue;
  isOptionUnlocked: (opt: MorphTierDescriptor<TValue>) => boolean;
  onSelect: (val: TValue) => void;
}

function MorphTierSelector<TValue extends string | number>({
  statBadge,
  statColor,
  title,
  subtitle,
  options,
  currentValue,
  isOptionUnlocked,
  onSelect,
}: MorphTierSelectorProps<TValue>) {
  return (
    <View style={styles.morphBlock}>
      <View style={styles.morphHeaderRow}>
        <View style={[styles.unlockStatPill, { borderColor: statColor }]}>
          <Text style={[styles.unlockStatText, { color: statColor }]}>{statBadge}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.unlockTitle}>{title}</Text>
          <Text style={styles.unlockSub}>{subtitle}</Text>
        </View>
      </View>
      <View style={styles.morphOptionsRow}>
        {options.map((opt) => {
          const unlocked = isOptionUnlocked(opt);
          const selected = currentValue === opt.value;
          return (
            <TouchableOpacity
              key={String(opt.value)}
              style={[
                styles.morphTierBtn,
                selected && styles.morphTierBtnSelected,
                !unlocked && styles.morphTierBtnLocked,
              ]}
              onPress={() => onSelect(opt.value)}
              disabled={!unlocked}
              activeOpacity={0.75}
            >
              <View style={styles.morphTierTopRow}>
                <Text
                  style={[
                    styles.morphTierLabel,
                    selected && { color: COLORS.gold },
                    !unlocked && { color: COLORS.textMuted },
                  ]}
                  numberOfLines={1}
                >
                  {opt.label}
                </Text>
                {!unlocked ? (
                  <RpgIcon name="lock" size={12} color={COLORS.textMuted} />
                ) : selected ? (
                  <RpgIcon name="check" size={12} color={COLORS.gold} />
                ) : null}
              </View>
              <Text style={styles.morphTierReq} numberOfLines={1}>
                {opt.requirementText}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export const HeroHubScreen: React.FC<HeroHubScreenProps> = ({
  activeSubView,
  onChangeSubView,
  initialTalentStat,
  onNavigateToTrain,
  onNavigateToAdventure,
  onNavigateToArtisan,
  onNavigateToSocial,
}) => {
  const {
    race,
    customizationConfig,
    equipmentLoadout,
    characterName,
    appearanceId,
    overallLevel,
    stats,
    activeCharacterId,
    guideOnboardingCompleted,
    dismissGuideOnboarding,
    updateCharacterCustomization,
    updateCharacterAppearance,
  } = useGame();

  const [internalSubView, setInternalSubView] = useState<HeroSubView>('OVERVIEW');
  const subView = activeSubView ?? internalSubView;

  const setSubView = (next: HeroSubView) => {
    setInternalSubView(next);
    onChangeSubView?.(next);
  };

  const [talentFocusStat, setTalentFocusStat] = useState<
    HolisticStatType | StatType | undefined
  >(initialTalentStat);
  const [guideOpen, setGuideOpen] = useState(false);
  const [ftueOpen, setFtueOpen] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [savingAppearanceId, setSavingAppearanceId] = useState<string | null>(null);
  const [savingCustomization, setSavingCustomization] = useState(false);
  const [appearanceFeedback, setAppearanceFeedback] = useState<string | null>(null);

  const [draftRace, setDraftRace] = useState<CharacterRace>(race);
  const [draftConfig, setDraftConfig] = useState<CharacterCustomizationConfig>(customizationConfig);
  const [previewAnim, setPreviewAnim] = useState<RigAnimationState>('idle');
  const [actionKey, setActionKey] = useState(0);

  useEffect(() => {
    setDraftRace(race);
    setDraftConfig(customizationConfig);
  }, [activeCharacterId, race, customizationConfig]);

  useEffect(() => {
    if (initialTalentStat) {
      setTalentFocusStat(initialTalentStat);
    }
  }, [initialTalentStat]);

  const heroCoreStats = useMemo<CoreStatBlock>(
    () => ({
      strengthLevel: stats.STRENGTH?.level ?? 1,
      enduranceLevel: stats.ENDURANCE?.level ?? 1,
      agilityLevel: stats.AGILITY?.level ?? 1,
      dexLevel: stats.DEXTERITY?.level ?? 1,
      conLevel: stats.CONSTITUTION?.level ?? 1,
      wisLevel: stats.WISDOM?.level ?? 1,
      sprLevel: stats.SPIRIT?.level ?? 1,
    }),
    [stats]
  );

  const unlocked = useMemo(
    () => getUnlockedCustomizationState(draftRace, heroCoreStats),
    [draftRace, heroCoreStats]
  );

  const hasPendingChanges = useMemo(
    () =>
      draftRace !== race ||
      JSON.stringify(draftConfig) !== JSON.stringify(customizationConfig),
    [draftRace, race, draftConfig, customizationConfig]
  );

  const allowedSkins = useMemo(() => {
    const def = RACE_DEFINITIONS[draftRace];
    return def.allowedSkinPaletteIds
      .map((id) => SKIN_PALETTE_OPTIONS.find((o) => o.id === id))
      .filter((o): o is (typeof SKIN_PALETTE_OPTIONS)[number] => Boolean(o));
  }, [draftRace]);

  const totalUnspentTalentPoints = useMemo(() => {
    return (
      (stats.STRENGTH?.pointsAvailable ?? 0) +
      (stats.ENDURANCE?.pointsAvailable ?? 0) +
      (stats.AGILITY?.pointsAvailable ?? 0) +
      (stats.DEXTERITY?.pointsAvailable ?? 0) +
      (stats.CONSTITUTION?.pointsAvailable ?? 0) +
      (stats.WISDOM?.pointsAvailable ?? 0) +
      (stats.SPIRIT?.pointsAvailable ?? 0)
    );
  }, [stats]);

  const subViewOptions: ReadonlyArray<SegmentedOption<HeroSubView>> = useMemo(
    () => [
      { key: 'OVERVIEW', label: 'Overview', icon: 'hero', testID: 'hero-subtab-overview' },
      { key: 'APPEARANCE', label: 'Appearance', icon: 'palette', testID: 'hero-subtab-appearance' },
      {
        key: 'TALENTS',
        label: 'Talents',
        icon: 'sparkles',
        badge: totalUnspentTalentPoints > 0 ? totalUnspentTalentPoints : undefined,
        testID: 'hero-subtab-talents',
      },
    ],
    [totalUnspentTalentPoints]
  );

  const handleSelectRace = (nextRace: CharacterRace) => {
    setAppearanceFeedback(null);
    setDraftRace(nextRace);
    setDraftConfig((prev) => {
      const adapted = adaptCustomizationForRaceChange(prev, nextRace);
      return {
        ...adapted,
        morphs: clampMorphsToUnlocked(nextRace, adapted.morphs, heroCoreStats),
      };
    });
  };

  const handleApplyCustomization = async () => {
    setSavingCustomization(true);
    setAppearanceFeedback(null);
    const res = await updateCharacterCustomization({
      race: draftRace,
      customizationConfig: draftConfig,
    });
    setSavingCustomization(false);
    if (res.ok) {
      setAppearanceFeedback('Saved hero appearance and physique customization.');
    } else {
      setAppearanceFeedback(res.error ?? 'Could not save customization.');
    }
  };

  const handleResetDraft = () => {
    setAppearanceFeedback(null);
    setDraftRace(race);
    setDraftConfig(customizationConfig);
  };

  const handleSelectAppearance = async (presetId: string, title: string) => {
    setSavingAppearanceId(presetId);
    setAppearanceFeedback(null);
    const derived = deriveCustomizationFromLegacyAppearance(presetId);
    const adapted = adaptCustomizationForRaceChange(
      {
        version: 1,
        identity: derived.config.identity,
        morphs: draftConfig.morphs,
      },
      derived.race
    );
    const mergedConfig: CharacterCustomizationConfig = {
      ...adapted,
      morphs: clampMorphsToUnlocked(derived.race, adapted.morphs, heroCoreStats),
    };
    setDraftRace(derived.race);
    setDraftConfig(mergedConfig);
    const res = await updateCharacterCustomization(
      {
        race: derived.race,
        customizationConfig: mergedConfig,
        appearanceId: presetId,
      },
      activeCharacterId ?? undefined
    );
    setSavingAppearanceId(null);
    if (res.ok) {
      setAppearanceFeedback(`Equipped ${title} visual archetype.`);
    } else {
      void updateCharacterAppearance(presetId, activeCharacterId ?? undefined);
      setAppearanceFeedback(res.error ?? 'Could not update appearance.');
    }
  };

  return (
    <View style={styles.root}>
      <HubSceneBackdrop slotId="hero_sanctum" />
      {/* Top Sub-View Bar + Guide NPC */}
      <HubSceneHeaderSlot slotId="hero_sanctum" style={styles.topControlBar}>
        <View style={styles.segmentedWrap}>
          <SegmentedControl
            options={subViewOptions}
            value={subView}
            onChange={setSubView}
          />
        </View>
        <TouchableOpacity
          style={styles.npcTriggerBtn}
          onPress={() => setGuideOpen(true)}
          activeOpacity={0.75}
          testID="hero-npc-guide-btn"
        >
          <RpgIcon name="chat" size={14} color={COLORS.gold} />
          <Text style={styles.npcTriggerText}>Guide</Text>
        </TouchableOpacity>
      </HubSceneHeaderSlot>

      {/* Active Sub-View */}
      <View style={styles.body}>
        {subView === 'OVERVIEW' && (
          <View style={styles.overviewWrap}>
            {overallLevel <= 1 && !guideOnboardingCompleted && (
              <View style={styles.ftueBanner} testID="hero-ftue-banner">
                <NpcPortraitSvg npcId="GUIDE" size={44} expression="happy" />
                <View style={styles.ftueTextCol}>
                  <Text style={styles.ftueEyebrow}>SANCTUM ORIENTATION</Text>
                  <Text style={styles.ftueTitle}>
                    Meet Auren to pick your lineage & claim a welcome potion.
                  </Text>
                  <View style={styles.ftueBtnRow}>
                    <TouchableOpacity
                      style={styles.ftueStartBtn}
                      onPress={() => setFtueOpen(true)}
                      activeOpacity={0.8}
                      testID="hero-start-ftue-btn"
                    >
                      <RpgIcon name="sparkles" size={12} color={SURFACES.canvas} />
                      <Text style={styles.ftueStartBtnText}>
                        Begin Level-1 Walkthrough
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.ftueDismissBtn}
                      onPress={dismissGuideOnboarding}
                      activeOpacity={0.75}
                      testID="hero-dismiss-ftue-btn"
                    >
                      <Text style={styles.ftueDismissBtnText}>Dismiss</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}
            <CharacterProfileScreen
              onJumpToTalents={(stat) => {
                if (stat) setTalentFocusStat(stat);
                setSubView('TALENTS');
              }}
              onOpenAppearance={() => setSubView('APPEARANCE')}
            />
          </View>
        )}

        {subView === 'APPEARANCE' && (
          <ScrollView contentContainerStyle={styles.wardrobeScroll}>
            {/* Live Rig Preview Stage */}
            <SlateSection
              level={1}
              eyebrow={`LEVEL ${overallLevel} HERO WARDROBE`}
              title={characterName || 'Adventurer'}
              subtitle={`${RACE_DEFINITIONS[draftRace].name} • All cosmetics and morphs are purely visual.`}
              rightAction={
                <Pressable
                  style={styles.rosterBtn}
                  onPress={() => setRosterOpen(true)}
                  testID="wardrobe-open-roster-btn"
                >
                  <RpgIcon name="hero" size={13} color={COLORS.gold} />
                  <Text style={styles.rosterBtnText}>Hall of Heroes</Text>
                </Pressable>
              }
            >
              <View style={styles.previewCenter}>
                <View style={styles.rigStageBox}>
                  <CharacterRigRenderer
                    testID="hero-rig-preview"
                    race={draftRace}
                    customizationConfig={draftConfig}
                    equippedLoadout={equipmentLoadout}
                    animationState={previewAnim}
                    actionTriggerKey={actionKey}
                    width={190}
                    height={245}
                  />
                </View>
              </View>

              {/* Animation Preview Controls */}
              <View style={styles.animPillsRow}>
                {PREVIEW_ANIMS.map((anim) => {
                  const active = previewAnim === anim.id;
                  return (
                    <TouchableOpacity
                      key={anim.id}
                      style={[styles.animPill, active && styles.animPillActive]}
                      onPress={() => {
                        setPreviewAnim(anim.id);
                        setActionKey((k) => k + 1);
                      }}
                      activeOpacity={0.75}
                    >
                      <Text
                        style={[
                          styles.animPillText,
                          active && { color: COLORS.gold, fontWeight: '800' },
                        ]}
                      >
                        {anim.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Save / Reset Bar */}
              <View style={styles.applyBar}>
                <TouchableOpacity
                  style={[styles.resetDraftBtn, !hasPendingChanges && styles.btnDisabled]}
                  onPress={handleResetDraft}
                  disabled={!hasPendingChanges || savingCustomization}
                  activeOpacity={0.75}
                >
                  <Text style={styles.resetDraftBtnText}>Reset</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.applyDraftBtn,
                    (!hasPendingChanges || savingCustomization) && styles.btnDisabled,
                  ]}
                  onPress={() => void handleApplyCustomization()}
                  disabled={!hasPendingChanges || savingCustomization}
                  activeOpacity={0.75}
                  testID="wardrobe-apply-changes-btn"
                >
                  <Text style={styles.applyDraftBtnText}>
                    {savingCustomization
                      ? 'Saving...'
                      : hasPendingChanges
                      ? 'Apply Changes'
                      : 'All Changes Saved'}
                  </Text>
                </TouchableOpacity>
              </View>

              {appearanceFeedback ? (
                <Text style={styles.feedbackText}>{appearanceFeedback}</Text>
              ) : null}
            </SlateSection>

            {/* Race & Level-1 Base Identity */}
            <SlateSection
              level={1}
              eyebrow="LEVEL-1 BASE IDENTITY"
              title="Race, Features & Silhouette"
              subtitle="Human, Oni, and Kitsune share identical combat caps. All base identity options are unlocked."
            >
              <Text style={styles.subFieldLabel}>Origin Race</Text>
              <View style={styles.raceChipsRow}>
                {CHARACTER_RACES.map((r) => {
                  const def = RACE_DEFINITIONS[r];
                  const selected = draftRace === r;
                  return (
                    <TouchableOpacity
                      key={r}
                      style={[styles.raceChip, selected && styles.raceChipSelected]}
                      onPress={() => handleSelectRace(r)}
                      activeOpacity={0.75}
                      testID={`wardrobe-race-${r.toLowerCase()}`}
                    >
                      <RpgIcon
                        name="sparkles"
                        size={12}
                        color={selected ? COLORS.gold : COLORS.textMuted}
                      />
                      <Text
                        style={[
                          styles.raceChipText,
                          selected && { color: COLORS.gold },
                        ]}
                      >
                        {def.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <HairlineDivider spacing={SPACING.sm} />

              <Text style={styles.subFieldLabel}>Skin / Fur Palette</Text>
              <View style={styles.swatchWrapRow}>
                {allowedSkins.map((swatch) => {
                  const selected = draftConfig.identity.skinPalette === swatch.id;
                  return (
                    <TouchableOpacity
                      key={swatch.id}
                      style={[styles.swatchChip, selected && styles.swatchChipSelected]}
                      onPress={() =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          identity: { ...prev.identity, skinPalette: swatch.id },
                        }))
                      }
                      activeOpacity={0.75}
                    >
                      <View style={[styles.swatchDot, { backgroundColor: swatch.baseHex }]} />
                      <Text
                        style={[
                          styles.swatchLabel,
                          selected && { color: COLORS.gold },
                        ]}
                      >
                        {swatch.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <HairlineDivider spacing={SPACING.sm} />

              <Text style={styles.subFieldLabel}>Hair Style & Color</Text>
              <View style={styles.pillWrapRow}>
                {HAIR_STYLE_OPTIONS.map((opt) => {
                  const selected = draftConfig.identity.hairStyle === opt.id;
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      style={[styles.identityPill, selected && styles.identityPillSelected]}
                      onPress={() =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          identity: { ...prev.identity, hairStyle: opt.id },
                        }))
                      }
                      activeOpacity={0.75}
                    >
                      <Text
                        style={[
                          styles.identityPillText,
                          selected && { color: COLORS.gold },
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={[styles.swatchWrapRow, { marginTop: SPACING.xs }]}>
                {HAIR_COLOR_OPTIONS.map((swatch) => {
                  const selected = draftConfig.identity.hairColor === swatch.id;
                  return (
                    <TouchableOpacity
                      key={swatch.id}
                      style={[styles.swatchChip, selected && styles.swatchChipSelected]}
                      onPress={() =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          identity: { ...prev.identity, hairColor: swatch.id },
                        }))
                      }
                      activeOpacity={0.75}
                    >
                      <View style={[styles.swatchDot, { backgroundColor: swatch.primaryHex }]} />
                      <Text
                        style={[
                          styles.swatchLabel,
                          selected && { color: COLORS.gold },
                        ]}
                      >
                        {swatch.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <HairlineDivider spacing={SPACING.sm} />

              <Text style={styles.subFieldLabel}>Face & Eyes</Text>
              <View style={styles.pillWrapRow}>
                {FACE_STYLE_OPTIONS.map((opt) => {
                  const selected = draftConfig.identity.faceStyle === opt.id;
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      style={[styles.identityPill, selected && styles.identityPillSelected]}
                      onPress={() =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          identity: { ...prev.identity, faceStyle: opt.id },
                        }))
                      }
                      activeOpacity={0.75}
                    >
                      <Text
                        style={[
                          styles.identityPillText,
                          selected && { color: COLORS.gold },
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={[styles.pillWrapRow, { marginTop: SPACING.xs }]}>
                {EYE_STYLE_OPTIONS.map((opt) => {
                  const selected = draftConfig.identity.eyeStyle === opt.id;
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      style={[styles.identityPill, selected && styles.identityPillSelected]}
                      onPress={() =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          identity: { ...prev.identity, eyeStyle: opt.id },
                        }))
                      }
                      activeOpacity={0.75}
                    >
                      <Text
                        style={[
                          styles.identityPillText,
                          selected && { color: COLORS.gold },
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={[styles.swatchWrapRow, { marginTop: SPACING.xs }]}>
                {EYE_COLOR_OPTIONS.map((swatch) => {
                  const selected = draftConfig.identity.eyeColor === swatch.id;
                  return (
                    <TouchableOpacity
                      key={swatch.id}
                      style={[styles.swatchChip, selected && styles.swatchChipSelected]}
                      onPress={() =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          identity: { ...prev.identity, eyeColor: swatch.id },
                        }))
                      }
                      activeOpacity={0.75}
                    >
                      <View style={[styles.swatchDot, { backgroundColor: swatch.hex }]} />
                      <Text
                        style={[
                          styles.swatchLabel,
                          selected && { color: COLORS.gold },
                        ]}
                      >
                        {swatch.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <HairlineDivider spacing={SPACING.sm} />

              <Text style={styles.subFieldLabel}>Base Silhouette</Text>
              <View style={styles.pillWrapRow}>
                {BASE_SILHOUETTE_OPTIONS.map((opt) => {
                  const selected = draftConfig.identity.baseSilhouette === opt.id;
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      style={[styles.identityPill, selected && styles.identityPillSelected]}
                      onPress={() =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          identity: { ...prev.identity, baseSilhouette: opt.id },
                        }))
                      }
                      activeOpacity={0.75}
                    >
                      <Text
                        style={[
                          styles.identityPillText,
                          selected && { color: COLORS.gold },
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </SlateSection>

            {/* 7-Stat Opt-In Physique & Evolutions */}
            <SlateSection
              level={1}
              eyebrow="7-STAT OPT-IN MORPHS"
              title="Physique & Mythic Evolutions"
              subtitle="Earn stat milestones through training. Toggle any unlocked tier up or back down to Tier 0 anytime."
            >
              <MorphTierSelector
                statBadge="STR"
                statColor={COLORS.strength}
                title="Muscle Mass Tiers"
                subtitle="Arms, chest, shoulders, and quad hypertrophy"
                options={MUSCLE_MASS_TIERS}
                currentValue={draftConfig.morphs.muscleMassTier}
                isOptionUnlocked={(opt) => opt.value <= unlocked.maxMuscleMassTier}
                onSelect={(val) =>
                  setDraftConfig((prev) => ({
                    ...prev,
                    morphs: { ...prev.morphs, muscleMassTier: val },
                  }))
                }
              />

              <HairlineDivider spacing={SPACING.sm} />

              <MorphTierSelector
                statBadge="CON"
                statColor="#66BB6A"
                title="Frame Width & Stature"
                subtitle="Broadened collarbones, reach, and towering presence"
                options={FRAME_STATURE_TIERS}
                currentValue={draftConfig.morphs.frameTier}
                isOptionUnlocked={(opt) => opt.value <= unlocked.maxFrameTier}
                onSelect={(val) =>
                  setDraftConfig((prev) => ({
                    ...prev,
                    morphs: { ...prev.morphs, frameTier: val },
                  }))
                }
              />

              <HairlineDivider spacing={SPACING.sm} />

              <MorphTierSelector
                statBadge="AGI / DEX"
                statColor={COLORS.agility}
                title="Lean Definition"
                subtitle="Athletic waist taper and limb separation"
                options={LEAN_DEFINITION_TIERS}
                currentValue={draftConfig.morphs.leanDefinitionTier}
                isOptionUnlocked={(opt) => opt.value <= unlocked.maxLeanDefinitionTier}
                onSelect={(val) =>
                  setDraftConfig((prev) => ({
                    ...prev,
                    morphs: { ...prev.morphs, leanDefinitionTier: val },
                  }))
                }
              />

              <View style={{ marginTop: SPACING.sm }}>
                <MorphTierSelector
                  statBadge="AGI / DEX"
                  statColor={COLORS.agility}
                  title="Combat Stances"
                  subtitle="Animated battle posture and guard angles"
                  options={COMBAT_STANCE_OPTIONS}
                  currentValue={draftConfig.morphs.combatStance}
                  isOptionUnlocked={(opt) => unlocked.unlockedStances.includes(opt.value)}
                  onSelect={(val) =>
                    setDraftConfig((prev) => ({
                      ...prev,
                      morphs: { ...prev.morphs, combatStance: val },
                    }))
                  }
                />
              </View>

              <HairlineDivider spacing={SPACING.sm} />

              <MorphTierSelector
                statBadge="END"
                statColor={COLORS.endurance}
                title="Battle Scars"
                subtitle="Veteran markings earned via cardio endurance"
                options={BATTLE_SCARS_TIERS}
                currentValue={draftConfig.morphs.scarsTier}
                isOptionUnlocked={(opt) => opt.value <= unlocked.maxScarsTier}
                onSelect={(val) =>
                  setDraftConfig((prev) => ({
                    ...prev,
                    morphs: { ...prev.morphs, scarsTier: val },
                  }))
                }
              />

              <View style={{ marginTop: SPACING.sm }}>
                <MorphTierSelector
                  statBadge="END"
                  statColor={COLORS.endurance}
                  title="Vascularity"
                  subtitle="Forearm and bicep conditioning detail"
                  options={VASCULARITY_TIERS}
                  currentValue={draftConfig.morphs.vascularityTier}
                  isOptionUnlocked={(opt) => opt.value <= unlocked.maxVascularityTier}
                  onSelect={(val) =>
                    setDraftConfig((prev) => ({
                      ...prev,
                      morphs: { ...prev.morphs, vascularityTier: val },
                    }))
                  }
                />
              </View>

              <HairlineDivider spacing={SPACING.sm} />

              {draftRace === 'ONI' && (
                <View style={{ marginBottom: SPACING.sm }}>
                  <MorphTierSelector
                    statBadge="WIS / SPR"
                    statColor={COLORS.mythic}
                    title="Oni Horn Tiers"
                    subtitle="Crown horn evolution exclusive to Oni heroes"
                    options={ONI_HORN_TIERS}
                    currentValue={draftConfig.morphs.oniHornTier}
                    isOptionUnlocked={(opt) => opt.value <= unlocked.maxOniHornTier}
                    onSelect={(val) =>
                      setDraftConfig((prev) => ({
                        ...prev,
                        morphs: { ...prev.morphs, oniHornTier: val },
                      }))
                    }
                  />
                </View>
              )}

              {draftRace === 'KITSUNE' && (
                <View style={{ marginBottom: SPACING.sm }}>
                  <MorphTierSelector
                    statBadge="WIS / SPR"
                    statColor={COLORS.mythic}
                    title="Kitsune Spirit Tails (1–9)"
                    subtitle="Radiant fan of tails unlocked via Wisdom or Spirit"
                    options={KITSUNE_TAIL_TIERS}
                    currentValue={draftConfig.morphs.kitsuneTailCount}
                    isOptionUnlocked={(opt) => opt.value <= unlocked.maxKitsuneTails}
                    onSelect={(val) =>
                      setDraftConfig((prev) => ({
                        ...prev,
                        morphs: { ...prev.morphs, kitsuneTailCount: val },
                      }))
                    }
                  />
                </View>
              )}

              <MorphTierSelector
                statBadge="WIS / SPR"
                statColor={COLORS.mythic}
                title="Energy Auras"
                subtitle="Radiant ki backdrop shared across all races"
                options={ENERGY_AURA_TIERS}
                currentValue={draftConfig.morphs.auraTier}
                isOptionUnlocked={(opt) => opt.value <= unlocked.maxAuraTier}
                onSelect={(val) =>
                  setDraftConfig((prev) => ({
                    ...prev,
                    morphs: { ...prev.morphs, auraTier: val },
                  }))
                }
              />

              <Text style={[styles.subFieldLabel, { marginTop: SPACING.sm }]}>Aura Palette</Text>
              <View style={styles.swatchWrapRow}>
                {AURA_PALETTE_OPTIONS.map((swatch) => {
                  const selected = draftConfig.morphs.auraPalette === swatch.id;
                  return (
                    <TouchableOpacity
                      key={swatch.id}
                      style={[styles.swatchChip, selected && styles.swatchChipSelected]}
                      onPress={() =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          morphs: { ...prev.morphs, auraPalette: swatch.id },
                        }))
                      }
                      activeOpacity={0.75}
                    >
                      <View style={[styles.swatchDot, { backgroundColor: swatch.primaryHex }]} />
                      <Text
                        style={[
                          styles.swatchLabel,
                          selected && { color: COLORS.gold },
                        ]}
                      >
                        {swatch.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </SlateSection>

            {/* Quick Identity Presets */}
            <SlateSection
              level={1}
              eyebrow="VISUAL ARCHETYPES"
              title="Appearance Presets"
              subtitle="Quick-equip classic looks while keeping your unlocked morphs."
            >
              <View style={styles.presetGrid}>
                {CHARACTER_APPEARANCES.map((preset) => {
                  const selected = preset.id === appearanceId;
                  const busy = savingAppearanceId === preset.id;
                  return (
                    <TouchableOpacity
                      key={preset.id}
                      style={[
                        styles.presetTile,
                        selected && styles.presetTileSelected,
                      ]}
                      onPress={() => void handleSelectAppearance(preset.id, preset.title)}
                      activeOpacity={0.75}
                      disabled={busy}
                      testID={`appearance-preset-${preset.id}`}
                    >
                      <View
                        style={[
                          styles.presetRigThumb,
                          selected && { borderColor: COLORS.gold },
                        ]}
                      >
                        <CharacterRigRenderer
                          mode="bust"
                          appearanceId={preset.id}
                          width={46}
                          height={46}
                        />
                      </View>
                      <View style={styles.presetInfo}>
                        <Text
                          style={[
                            styles.presetName,
                            selected && { color: COLORS.gold },
                          ]}
                          numberOfLines={1}
                        >
                          {preset.title}
                        </Text>
                        <Text style={styles.presetStatus}>
                          {busy ? 'Saving...' : selected ? 'Equipped' : 'Tap to equip'}
                        </Text>
                      </View>
                      {selected ? (
                        <RpgIcon name="check" size={14} color={COLORS.gold} />
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </SlateSection>
          </ScrollView>
        )}

        {subView === 'TALENTS' && (
          <TalentBuilderScreen
            initialStat={talentFocusStat}
            onOpenProfileGear={() => setSubView('OVERVIEW')}
          />
        )}
      </View>

      {/* Guide NPC Dialogue */}
      <NpcDialogueOverlay
        visible={guideOpen}
        onClose={() => setGuideOpen(false)}
        npcId="GUIDE"
        sceneSlotId="hero_sanctum"
        pageExpressions={['happy', 'focused']}
        dialoguePages={[
          `Welcome back, ${characterName || 'Adventurer'}. Your Hero hub unites gear loadouts, cosmetic appearances, and all 10 stat-bound talent trees in one place.`,
          'Every real-world workout grants holistic stat XP and talent points. Allocate points under Talents or head to Train whenever you are ready to log sets.',
        ]}
        actionChips={[
          {
            id: 'chip-ftue-walkthrough',
            label: 'Level-1 Walkthrough',
            icon: 'compass',
            variant: 'primary',
            testID: 'chip-ftue-walkthrough',
            onPress: () => {
              setGuideOpen(false);
              setFtueOpen(true);
            },
          },
          {
            id: 'chip-appearance',
            label: 'Appearance',
            icon: 'palette',
            onPress: () => {
              setGuideOpen(false);
              setSubView('APPEARANCE');
            },
          },
          {
            id: 'chip-talents',
            label: 'Talent Trees',
            icon: 'sparkles',
            onPress: () => {
              setGuideOpen(false);
              setSubView('TALENTS');
            },
          },
          ...(onNavigateToTrain
            ? [
                {
                  id: 'chip-train',
                  label: 'Start Training',
                  icon: 'train' as const,
                  onPress: () => {
                    setGuideOpen(false);
                    onNavigateToTrain();
                  },
                },
              ]
            : []),
        ]}
      />

      <GuideOnboardingModal
        visible={ftueOpen}
        onClose={() => setFtueOpen(false)}
        onNavigateToTrain={onNavigateToTrain}
        onNavigateToAdventure={onNavigateToAdventure}
        onNavigateToArtisan={onNavigateToArtisan}
        onNavigateToSocial={onNavigateToSocial}
      />

      <CharacterManagerModal
        visible={rosterOpen}
        onClose={() => setRosterOpen(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: SURFACES.canvas,
  },
  topControlBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: SURFACES.canvas,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SURFACES.hairline,
  },
  segmentedWrap: {
    flex: 1,
  },
  npcTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 38,
  },
  npcTriggerText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.gold,
  },
  body: {
    flex: 1,
  },
  wardrobeScroll: {
    padding: SPACING.md,
    gap: SPACING.md,
    paddingBottom: 40,
  },
  rosterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  rosterBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.gold,
  },
  previewCenter: {
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  rigStageBox: {
    width: 210,
    height: 256,
    borderRadius: RADII.lg,
    backgroundColor: SURFACES.layer2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SURFACES.goldHairline,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  animPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginTop: SPACING.xs,
  },
  animPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADII.pill,
    backgroundColor: SURFACES.layer2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SURFACES.hairline,
  },
  animPillActive: {
    backgroundColor: SURFACES.layer3,
    borderColor: SURFACES.goldHairline,
  },
  animPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  applyBar: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  resetDraftBtn: {
    flex: 1,
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.md,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SURFACES.hairline,
  },
  resetDraftBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  applyDraftBtn: {
    flex: 2,
    backgroundColor: COLORS.gold,
    borderRadius: RADII.md,
    paddingVertical: 10,
    alignItems: 'center',
  },
  applyDraftBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.bgDeep,
  },
  btnDisabled: {
    opacity: 0.45,
  },
  subFieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  swatchWrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  swatchChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: SURFACES.layer2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SURFACES.hairline,
    borderRadius: RADII.pill,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  swatchChipSelected: {
    backgroundColor: SURFACES.layer3,
    borderColor: SURFACES.goldHairline,
  },
  swatchDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  swatchLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  pillWrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  identityPill: {
    backgroundColor: SURFACES.layer2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SURFACES.hairline,
    borderRadius: RADII.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  identityPillSelected: {
    backgroundColor: SURFACES.layer3,
    borderColor: SURFACES.goldHairline,
  },
  identityPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  morphBlock: {
    gap: SPACING.xs,
  },
  morphHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  morphOptionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  morphTierBtn: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.md,
    padding: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SURFACES.hairline,
    gap: 2,
  },
  morphTierBtnSelected: {
    backgroundColor: SURFACES.layer3,
    borderColor: SURFACES.goldHairline,
  },
  morphTierBtnLocked: {
    opacity: 0.55,
  },
  morphTierTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  morphTierLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textPrimary,
    flex: 1,
  },
  morphTierReq: {
    fontSize: 10,
    color: COLORS.textMuted,
  },
  presetRigThumb: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1.5,
    borderColor: SURFACES.hairline,
    backgroundColor: SURFACES.canvas,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedbackText: {
    textAlign: 'center',
    color: COLORS.gold,
    fontSize: 12,
    fontWeight: '700',
    marginTop: SPACING.xs,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  presetTile: {
    width: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.md,
    padding: SPACING.sm,
  },
  presetTileSelected: {
    backgroundColor: SURFACES.layer3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SURFACES.goldHairline,
  },
  presetInfo: {
    flex: 1,
    minWidth: 0,
  },
  presetName: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  presetStatus: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  raceChipsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  raceChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: SURFACES.layer2,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: RADII.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SURFACES.hairline,
  },
  raceChipSelected: {
    backgroundColor: SURFACES.layer3,
    borderColor: SURFACES.goldHairline,
  },
  raceChipText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  unlockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  unlockStatPill: {
    width: 66,
    paddingVertical: 4,
    borderRadius: RADII.sm,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: SURFACES.layer2,
    alignItems: 'center',
  },
  unlockStatText: {
    fontSize: 10,
    fontWeight: '800',
  },
  unlockTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  unlockSub: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  overviewWrap: {
    flex: 1,
  },
  ftueBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: SURFACES.layer1,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADII.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SURFACES.goldHairline,
  },
  ftueTextCol: {
    flex: 1,
    gap: 4,
  },
  ftueEyebrow: {
    ...TYPOGRAPHY.eyebrow,
    color: COLORS.gold,
  },
  ftueTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textPrimary,
    lineHeight: 16,
  },
  ftueBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: 2,
  },
  ftueStartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.gold,
    borderRadius: RADII.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  ftueStartBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: SURFACES.canvas,
  },
  ftueDismissBtn: {
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  ftueDismissBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
});

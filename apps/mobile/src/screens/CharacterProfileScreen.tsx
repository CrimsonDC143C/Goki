import React, { useEffect, useMemo, useState } from 'react';
import {
  ImageSourcePropType,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  EQUIPMENT_SLOTS,
  EquipmentSlot,
  EquipmentStatBonuses,
  HolisticStatType,
  StatType,
  getCompatibleSlotsForItemType,
  isCharacterProgressionUnlocked,
  validateEquipmentRequirements,
  xpRequiredForStatLevel,
} from '@gymify/game-engine';
import { CharacterPortraitFrame } from '../components/CharacterPortraitFrame';
import { BugReportModal } from '../components/BugReportModal';
import { DeveloperTriageModal } from '../components/DeveloperTriageModal';
import { autoUpdateManager, AutoUpdateState } from '../services/AutoUpdateManager';
import { audioManager } from '../services/AudioManager';
import {
  InventoryEntry,
  isEquippableInventoryEntry,
  useGame,
} from '../state/GameContext';
import { COLORS, CRIMSON_ONI, RARITY_COLORS } from '../theme';

export interface CharacterProfileScreenProps {
  onJumpToTalents?: (stat?: HolisticStatType | StatType) => void;
  characterImageSource?: ImageSourcePropType | string | null;
}

export const HOLISTIC_STATS: readonly {
  key: HolisticStatType;
  name: string;
  abbrev: string;
  emoji: string;
  color: string;
  modalityHint: string;
}[] = [
  {
    key: 'STRENGTH',
    name: 'Strength',
    abbrev: 'STR',
    emoji: '⚔️',
    color: '#EF5350',
    modalityHint: 'Resistance / Barbell / Pepin DB',
  },
  {
    key: 'ENDURANCE',
    name: 'Endurance',
    abbrev: 'END',
    emoji: '🏃',
    color: '#26A69A',
    modalityHint: 'Zone 1-3 Cardio / Cycling',
  },
  {
    key: 'AGILITY',
    name: 'Agility',
    abbrev: 'AGI',
    emoji: '⚡',
    color: '#42A5F5',
    modalityHint: 'Zone 4-5 Cardio / Boxing',
  },
  {
    key: 'DEXTERITY',
    name: 'Dexterity',
    abbrev: 'DEX',
    emoji: '🤸',
    color: '#26C6DA',
    modalityHint: 'Calisthenics & Climbing',
  },
  {
    key: 'CONSTITUTION',
    name: 'Constitution',
    abbrev: 'CON',
    emoji: '🛡️',
    color: '#66BB6A',
    modalityHint: 'Sleep Quality & Daily Steps',
  },
  {
    key: 'WISDOM',
    name: 'Wisdom',
    abbrev: 'WIS',
    emoji: '🧘‍♀️',
    color: '#AB47BC',
    modalityHint: 'Yoga, Mobility & Pilates',
  },
  {
    key: 'SPIRIT',
    name: 'Spirit',
    abbrev: 'SPR',
    emoji: '🔮',
    color: '#EC407A',
    modalityHint: 'Meditation, Breathwork & Sauna',
  },
];

type BagFilter = 'ALL' | 'EQUIPMENT' | 'CONSUMABLES' | 'MATERIALS';

const SLOT_ICONS: Record<EquipmentSlot, string> = {
  mainHand: '⚔️',
  offHand: '🛡️',
  head: '🪖',
  chest: '🥋',
  legs: '👖',
  boots: '🥾',
  accessory1: '💍',
  accessory2: '📿',
};

function formatEquipmentBonuses(bonuses?: EquipmentStatBonuses): string {
  if (!bonuses) return 'Utility / Crafting Item';
  const parts: string[] = [];
  if (bonuses.meleePower) parts.push(`+${bonuses.meleePower} Melee`);
  if (bonuses.armorRating) parts.push(`+${bonuses.armorRating} Armor`);
  if (bonuses.maxHp) parts.push(`+${bonuses.maxHp} HP`);
  if (bonuses.maxStamina) parts.push(`+${bonuses.maxStamina} Stamina`);
  if (bonuses.critChance) parts.push(`+${Math.round(bonuses.critChance * 100)}% Crit`);
  if (bonuses.critMultiplier) {
    parts.push(`+${Math.round(bonuses.critMultiplier * 100)}% Crit Dmg`);
  }
  if (bonuses.dodgeRating) parts.push(`+${Math.round(bonuses.dodgeRating * 100)}% Dodge`);
  if (bonuses.attackSpeedPct) {
    parts.push(`+${Math.round(bonuses.attackSpeedPct * 100)}% Atk Spd`);
  }
  return parts.length > 0 ? parts.join(' • ') : 'Standard Gear';
}

export const CharacterProfileScreen: React.FC<CharacterProfileScreenProps> = ({
  onJumpToTalents,
  characterImageSource,
}) => {
  const {
    characterName,
    characterArtUri,
    overallLevel,
    adventurerRank,
    guildName,
    gold,
    location,
    stats,
    fatigueState,
    nextWorkoutMultiplier,
    combatPenalties,
    equipmentLoadout,
    derivedCombatStats,
    inventory,
    workoutMachine,
    queuedOfflineWorkouts,
    pendingWorkoutReceipts,
    consolidatedSpoils,
    syncOfflineWorkouts,
    claimPendingSpoils,
    equipItemToSlot,
    unequipSlot,
    toggleEquipItem,
  } = useGame();

  const progressionUnlocked = isCharacterProgressionUnlocked(workoutMachine.phase);

  const [selectedSlot, setSelectedSlot] = useState<EquipmentSlot | null>('mainHand');
  const [bagFilter, setBagFilter] = useState<BagFilter>('ALL');
  const [gearFeedback, setGearFeedback] = useState<{
    tone: 'error' | 'info';
    text: string;
  } | null>(null);
  const [showFatigueDetails, setShowFatigueDetails] = useState<boolean>(false);
  const [spoilsModalOpen, setSpoilsModalOpen] = useState<boolean>(false);
  const [bugReportModalVisible, setBugReportModalVisible] = useState<boolean>(false);
  const [devTriageModalVisible, setDevTriageModalVisible] = useState<boolean>(false);
  const [updateState, setUpdateState] = useState<AutoUpdateState>(() =>
    autoUpdateManager.getState()
  );
  const [isMuted, setIsMuted] = useState<boolean>(audioManager.isMuted());

  useEffect(() => {
    return autoUpdateManager.subscribe(setUpdateState);
  }, []);

  useEffect(() => {
    return audioManager.subscribe(setIsMuted);
  }, []);

  // Ensure any queued offline workouts evaluate into pending receipts upon opening Profile
  useEffect(() => {
    if (queuedOfflineWorkouts.length > 0) {
      void syncOfflineWorkouts({ evaluateLocallyIfOffline: true });
    }
  }, [queuedOfflineWorkouts.length, syncOfflineWorkouts]);

  const inventoryBySlug = useMemo(() => {
    const map = new Map<string, InventoryEntry>();
    for (const item of inventory) {
      map.set(item.slug, item);
    }
    return map;
  }, [inventory]);

  const coreStatsBlock = useMemo(
    () => ({
      strengthLevel: stats.STRENGTH.level,
      enduranceLevel: stats.ENDURANCE.level,
      agilityLevel: stats.AGILITY.level,
      dexLevel: stats.DEXTERITY.level,
      conLevel: stats.CONSTITUTION.level,
      wisLevel: stats.WISDOM.level,
      sprLevel: stats.SPIRIT.level,
    }),
    [stats]
  );

  const filteredBagItems = useMemo(() => {
    switch (bagFilter) {
      case 'EQUIPMENT':
        return inventory.filter(isEquippableInventoryEntry);
      case 'CONSUMABLES':
        return inventory.filter((i) => i.itemType === 'CONSUMABLE');
      case 'MATERIALS':
        return inventory.filter((i) => i.itemType === 'MATERIAL');
      case 'ALL':
        return inventory;
    }
  }, [bagFilter, inventory]);

  const selectedSlotItem = selectedSlot
    ? (() => {
        const slug = equipmentLoadout[selectedSlot];
        return slug ? inventoryBySlug.get(slug) ?? null : null;
      })()
    : null;

  const compatibleSwapItems = useMemo(() => {
    if (!selectedSlot) return [];
    return inventory.filter((item) => {
      if (!isEquippableInventoryEntry(item)) return false;
      const slots = getCompatibleSlotsForItemType(item.itemType, item.weaponHandedness);
      return slots.includes(selectedSlot) && equipmentLoadout[selectedSlot] !== item.slug;
    });
  }, [equipmentLoadout, inventory, selectedSlot]);

  const statColor = (st: string) => {
    const found = HOLISTIC_STATS.find((h) => h.key === st);
    return found ? found.color : COLORS.textPrimary;
  };

  const handleEquipToSelectedSlot = (slug: string, slot: EquipmentSlot) => {
    if (!progressionUnlocked) {
      setGearFeedback({
        tone: 'error',
        text: 'Finish your active workout session before swapping equipped gear.',
      });
      return;
    }
    const res = equipItemToSlot(slug, slot);
    if (!res.ok) {
      setGearFeedback({ tone: 'error', text: res.error ?? 'Unable to equip item.' });
    } else {
      const item = inventoryBySlug.get(slug);
      setGearFeedback({
        tone: 'info',
        text: `Equipped ${item?.name ?? slug} in ${slot}.`,
      });
    }
  };

  const handleBagEquipToggle = (item: InventoryEntry) => {
    if (!progressionUnlocked) {
      setGearFeedback({
        tone: 'error',
        text: 'Finish your active workout session before modifying equipment.',
      });
      return;
    }
    const res = toggleEquipItem(item.slug);
    if (!res.ok) {
      setGearFeedback({ tone: 'error', text: res.error ?? 'Stat requirement not met.' });
    } else {
      setGearFeedback(null);
    }
  };

  const handleClaimAndCloseReceipt = () => {
    setSpoilsModalOpen(false);
    claimPendingSpoils();
  };

  // Fatigue & Rest Status Pill Calculation
  const restPillConfig = (() => {
    if (combatPenalties.stacks > 0) {
      const accLossPct = Math.round((1 - combatPenalties.accuracyMultiplier) * 100);
      const dodgeLossPct = Math.round((1 - combatPenalties.dodgeMultiplier) * 100);
      const statLossPct = Math.round(
        (1 - combatPenalties.statEffectivenessMultiplier) * 100
      );
      return {
        label: `⚠️ Systemic Fatigue (${combatPenalties.stacks} Stack${
          combatPenalties.stacks === 1 ? '' : 's'
        })`,
        bg: '#3B181B',
        border: COLORS.danger,
        text: '#FF8A80',
        summary: `Overtraining penalty active: -${accLossPct}% Combat Accuracy, -${dodgeLossPct}% Dodge, -${statLossPct}% Stat Effectiveness. Log an Active Recovery / Mobility session or rest 24h+ in the Tavern to clear stacks.`,
      };
    }

    if (fatigueState.activeRecoveryBuffActive && fatigueState.wellRestedMultiplier > 1) {
      return {
        label: `🌿 +25% Recovery + ${fatigueState.wellRestedMultiplier.toFixed(
          2
        )}x Well-Rested`,
        bg: COLORS.enduranceDim,
        border: COLORS.endurance,
        text: '#80CBC4',
        summary: `Peak readiness! Tavern Well-Rested (${fatigueState.wellRestedMultiplier.toFixed(
          2
        )}x) and Active Recovery (+25%) combine for ${nextWorkoutMultiplier.toFixed(
          2
        )}x XP on your next strenuous workout. Zero combat fatigue penalties.`,
      };
    }

    if (fatigueState.activeRecoveryBuffActive) {
      return {
        label: '🌿 +25% Active Recovery Buff',
        bg: COLORS.enduranceDim,
        border: COLORS.endurance,
        text: '#80CBC4',
        summary: `Active Recovery primed: your next strenuous workout earns +25% bonus XP (${nextWorkoutMultiplier.toFixed(
          2
        )}x total). Zero Systemic Fatigue penalties.`,
      };
    }

    if (fatigueState.isRestingInTavern && fatigueState.wellRestedMultiplier > 1) {
      return {
        label: `🍺 Well-Rested (${fatigueState.wellRestedMultiplier.toFixed(2)}x Tavern)`,
        bg: CRIMSON_ONI.agedGoldDim,
        border: CRIMSON_ONI.agedGold,
        text: CRIMSON_ONI.agedGoldBright,
        summary: `Resting in the Tavern grants ${fatigueState.wellRestedMultiplier.toFixed(
          2
        )}x XP (scales 1.10x–1.30x across 24h–72h rest). Combat Accuracy ${(
          derivedCombatStats.accuracy * 100
        ).toFixed(0)}%, zero fatigue debuffs.`,
      };
    }

    return {
      label: `⚔️ Battle-Ready (${nextWorkoutMultiplier.toFixed(2)}x XP)`,
      bg: CRIMSON_ONI.charcoalElevated,
      border: CRIMSON_ONI.border,
      text: CRIMSON_ONI.ghostWhite,
      summary: `Fresh & combat-ready (Fatigue Score ${Math.round(
        fatigueState.fatigueScore
      )}/100). Rest 24h+ for Well-Rested (1.10x–1.30x) or log Mobility/Zone 1 for +25% Active Recovery.`,
    };
  })();

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      {/* 1. Conditional Unclaimed Training Spoils Chest Banner */}
      {pendingWorkoutReceipts.length > 0 && consolidatedSpoils && (
        <View style={styles.spoilsChestCard}>
          <View style={styles.spoilsHeaderRow}>
            <Text style={styles.spoilsChestIcon}>🎁</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.spoilsEyebrow}>DEFERRED OFFLINE REWARDS READY</Text>
              <Text style={styles.spoilsTitle}>Unclaimed Training Spoils Chest</Text>
              <Text style={styles.spoilsSubtext}>
                {consolidatedSpoils.sessionCount} Offline Workout
                {consolidatedSpoils.sessionCount === 1 ? '' : 's'} • +
                {Object.values(consolidatedSpoils.totalXpGained).reduce((a, b) => a + (b ?? 0), 0)}{' '}
                Total XP • {consolidatedSpoils.allLootDrops.length} Loot Drop
                {consolidatedSpoils.allLootDrops.length === 1 ? '' : 's'}
              </Text>
            </View>
          </View>

          <Pressable
            style={styles.claimSpoilsBtn}
            onPress={() => setSpoilsModalOpen(true)}
            testID="claim-spoils-banner-btn"
          >
            <Text style={styles.claimSpoilsBtnText}>
              ✨ Claim Spoils &amp; View Receipt
            </Text>
          </Pressable>
        </View>
      )}

      {/* 2. Character Header & Status Summary */}
      <View style={styles.characterHeaderCard}>
        <View style={styles.headerTopRow}>
          <CharacterPortraitFrame
            variant="avatar"
            height={78}
            imageSource={characterImageSource ?? characterArtUri}
          />

          <View style={styles.identityCol}>
            <View style={styles.nameLevelRow}>
              <Text style={styles.heroName} numberOfLines={1}>
                {characterName}
              </Text>
              <View style={styles.overallLevelPill}>
                <Text style={styles.overallLevelText}>Lv.{overallLevel}</Text>
              </View>
            </View>

            <Text style={styles.guildSubtitle}>
              🛡️ {adventurerRank} Adventurer • {guildName}
            </Text>

            <View style={styles.badgeStrip}>
              <View style={styles.goldBadge}>
                <Text style={styles.goldBadgeText}>🪙 {gold}g</Text>
              </View>
              <View style={styles.locationBadge}>
                <Text style={styles.locationBadgeText}>📍 {location}</Text>
              </View>
              <Pressable
                style={[styles.audioMuteBtn, isMuted && styles.audioMuteBtnActive]}
                onPress={() => void audioManager.toggleMute()}
              >
                <Text style={[styles.audioMuteBtnText, isMuted && styles.audioMuteBtnTextActive]}>
                  {isMuted ? '🔇 Muted' : '🔊 SFX'}
                </Text>
              </Pressable>
              <Pressable
                style={styles.bugReportBtn}
                onPress={() => setBugReportModalVisible(true)}
              >
                <Text style={styles.bugReportBtnText}>🐛 Report Bug</Text>
              </Pressable>
              <Pressable
                style={styles.devTriageBtn}
                onPress={() => setDevTriageModalVisible(true)}
              >
                <Text style={styles.devTriageBtnText}>🛠️ Dev Triage</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.updateCheckBtn,
                  (updateState.status === 'CHECKING' ||
                    updateState.status === 'DOWNLOADING_OTA') &&
                    styles.updateCheckBtnDisabled,
                ]}
                onPress={() => void autoUpdateManager.checkForUpdates(true)}
                disabled={
                  updateState.status === 'CHECKING' ||
                  updateState.status === 'DOWNLOADING_OTA'
                }
              >
                <Text style={styles.updateCheckBtnText}>
                  {updateState.status === 'CHECKING'
                    ? '⏳ Checking...'
                    : updateState.status === 'DOWNLOADING_OTA'
                    ? '📥 Fetching...'
                    : '🔄 Updates'}
                </Text>
                <View style={styles.versionBadgeInline}>
                  <Text style={styles.versionBadgeInlineText}>
                    v{updateState.currentVersion}
                  </Text>
                </View>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Fatigue & Rest Status Pill + Summary */}
        <Pressable
          style={[
            styles.fatiguePillRow,
            {
              backgroundColor: restPillConfig.bg,
              borderColor: restPillConfig.border,
            },
          ]}
          onPress={() => setShowFatigueDetails((prev) => !prev)}
        >
          <Text style={[styles.fatiguePillText, { color: restPillConfig.text }]}>
            {restPillConfig.label}
          </Text>
          <Text style={[styles.fatigueToggleHint, { color: restPillConfig.text }]}>
            {showFatigueDetails ? 'Hide ▲' : 'Details ▼'}
          </Text>
        </Pressable>

        {(showFatigueDetails || combatPenalties.stacks > 0) && (
          <View style={styles.fatigueTooltipBox}>
            <Text style={styles.fatigueTooltipText}>{restPillConfig.summary}</Text>
          </View>
        )}
      </View>

      {/* 3. 7-Stat Holistic Progression System Breakdown */}
      <View style={styles.statsSectionHeaderRow}>
        <Text style={styles.sectionTitle}>7-Stat Holistic Progression System</Text>
        <View style={styles.statsOverallBadge}>
          <Text style={styles.statsOverallBadgeText}>Overall Lv.{overallLevel}</Text>
        </View>
      </View>
      <View style={styles.statsStack}>
        {HOLISTIC_STATS.map((meta) => {
          const s = stats[meta.key];
          const nextReq = xpRequiredForStatLevel(s.level);
          const pct = Math.min(100, Math.round((s.xp / nextReq) * 100));

          return (
            <View key={meta.key} style={styles.statCard}>
              <View style={styles.statCardTop}>
                <View style={styles.statTitleCluster}>
                  <Text style={styles.statEmoji}>{meta.emoji}</Text>
                  <View>
                    <Text style={[styles.statLabel, { color: meta.color }]}>
                      {meta.name.toUpperCase()} ({meta.abbrev})
                    </Text>
                    <Text style={styles.statHintText}>{meta.modalityHint}</Text>
                  </View>
                </View>

                <View style={styles.statRightCluster}>
                  <Text style={styles.statLevel}>Lv.{s.level}</Text>
                  {s.pointsAvailable > 0 ? (
                    <Pressable
                      style={styles.talentPtActionBadge}
                      onPress={() => onJumpToTalents?.(meta.key)}
                    >
                      <Text style={styles.talentPtActionText}>
                        ✨ {s.pointsAvailable} Pt{s.pointsAvailable === 1 ? '' : 's'} →
                      </Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.zeroTalentText}>0 Pts</Text>
                  )}
                </View>
              </View>

              <View style={styles.xpBarTrack}>
                <View
                  style={[
                    styles.xpBarFill,
                    { width: `${pct}%`, backgroundColor: meta.color },
                  ]}
                />
              </View>

              <View style={styles.xpCaptionRow}>
                <Text style={styles.xpCaptionText}>
                  {s.xp} / {nextReq} XP ({pct}%)
                </Text>
                <Text style={styles.xpCaptionMuted}>
                  {nextReq - s.xp} XP to Lv.{s.level + 1}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      {/* Combat Derived Attributes Summary */}
      <View style={styles.derivedCard}>
        <View style={styles.derivedHeaderRow}>
          <Text style={styles.derivedTitle}>Combat Derived Attributes</Text>
          <Text style={styles.derivedSubtitle}>Base + 8-Slot Gear + 10 Talent Trees</Text>
        </View>

        <View style={styles.derivedGrid}>
          <View style={styles.derivedCell}>
            <Text style={styles.derivedCellLabel}>Melee Power</Text>
            <Text style={styles.derivedCellValue}>{derivedCombatStats.meleePower}</Text>
          </View>

          <View style={styles.derivedCell}>
            <Text style={styles.derivedCellLabel}>Armor / Mitig.</Text>
            <Text style={styles.derivedCellValue}>
              {derivedCombatStats.armor}{' '}
              <Text style={styles.derivedCellSub}>
                ({Math.round(derivedCombatStats.damageMitigationPct * 100)}%)
              </Text>
            </Text>
          </View>

          <View style={styles.derivedCell}>
            <Text style={styles.derivedCellLabel}>Max Stamina</Text>
            <Text style={styles.derivedCellValue}>
              {derivedCombatStats.maxStamina}{' '}
              <Text style={styles.derivedCellSub}>(HP {derivedCombatStats.maxHp})</Text>
            </Text>
          </View>

          <View style={styles.derivedCell}>
            <Text style={styles.derivedCellLabel}>Crit Chance</Text>
            <Text style={styles.derivedCellValue}>
              {Math.round(derivedCombatStats.critChance * 100)}%{' '}
              <Text style={styles.derivedCellSub}>
                ({derivedCombatStats.critMultiplier.toFixed(2)}x)
              </Text>
            </Text>
          </View>

          <View style={styles.derivedCell}>
            <Text style={styles.derivedCellLabel}>Dodge %</Text>
            <Text style={styles.derivedCellValue}>
              {Math.round(derivedCombatStats.dodgeChance * 100)}%
            </Text>
          </View>

          <View style={styles.derivedCell}>
            <Text style={styles.derivedCellLabel}>Attack Speed</Text>
            <Text style={styles.derivedCellValue}>
              {derivedCombatStats.attackSpeedMultiplier.toFixed(2)}x{' '}
              <Text style={styles.derivedCellSub}>
                ({derivedCombatStats.attacksPerSecond.toFixed(2)}/s)
              </Text>
            </Text>
          </View>
        </View>
      </View>

      {/* Feedback Banner for Gear / Stat-Gate Actions */}
      {gearFeedback && (
        <View
          style={[
            styles.feedbackBanner,
            gearFeedback.tone === 'error'
              ? styles.feedbackBannerError
              : styles.feedbackBannerInfo,
          ]}
        >
          <Text
            style={[
              styles.feedbackBannerText,
              gearFeedback.tone === 'error'
                ? styles.feedbackTextError
                : styles.feedbackTextInfo,
            ]}
          >
            {gearFeedback.text}
          </Text>
          <Pressable onPress={() => setGearFeedback(null)}>
            <Text style={styles.feedbackDismiss}>✕</Text>
          </Pressable>
        </View>
      )}

      {/* 4. 8-Slot Equipped Gear Loadout (2x4 Grid) */}
      <View style={styles.sectionHeaderInline}>
        <Text style={styles.sectionTitle}>8-Slot Equipped Gear Loadout</Text>
        <Text style={styles.sectionHint}>Tap a slot to inspect or swap</Text>
      </View>

      <View style={styles.loadoutGrid}>
        {EQUIPMENT_SLOTS.map((descriptor) => {
          const equippedSlug = equipmentLoadout[descriptor.slot];
          const item = equippedSlug ? inventoryBySlug.get(equippedSlug) ?? null : null;
          const isSelected = selectedSlot === descriptor.slot;
          const rarityBorder = item
            ? RARITY_COLORS[item.rarity] ?? COLORS.borderHighlight
            : CRIMSON_ONI.border;

          return (
            <Pressable
              key={descriptor.slot}
              style={[
                styles.slotTile,
                { borderColor: rarityBorder },
                isSelected && styles.slotTileSelected,
              ]}
              onPress={() =>
                setSelectedSlot((prev) =>
                  prev === descriptor.slot ? null : descriptor.slot
                )
              }
            >
              <View style={styles.slotTopRow}>
                <Text style={styles.slotIcon}>{SLOT_ICONS[descriptor.slot]}</Text>
                <Text style={styles.slotLabel} numberOfLines={1}>
                  {descriptor.shortLabel}
                </Text>
              </View>

              {item ? (
                <>
                  <Text
                    style={[
                      styles.slotItemName,
                      { color: RARITY_COLORS[item.rarity] ?? CRIMSON_ONI.ghostWhite },
                    ]}
                    numberOfLines={2}
                  >
                    {item.name}
                  </Text>
                  <Text style={styles.slotItemRarity}>
                    {item.rarity}
                    {item.weaponHandedness === 'TWO_HANDED' ? ' • 2H' : ''}
                  </Text>
                </>
              ) : (
                <Text style={styles.slotEmptyText}>Empty Slot</Text>
              )}
            </Pressable>
          );
        })}
      </View>

      {/* Selected Slot Inspector & Swap Drawer */}
      {selectedSlot && (
        <View style={styles.slotInspectorCard}>
          <View style={styles.inspectorHeaderRow}>
            <Text style={styles.inspectorTitle}>
              {SLOT_ICONS[selectedSlot]}{' '}
              {EQUIPMENT_SLOTS.find((s) => s.slot === selectedSlot)?.label} Slot
            </Text>
            {selectedSlotItem && (
              <Pressable
                style={[
                  styles.unequipBtn,
                  !progressionUnlocked && styles.btnDisabled,
                ]}
                onPress={() => {
                  if (!progressionUnlocked) {
                    setGearFeedback({
                      tone: 'error',
                      text: 'Finish your active workout session before unequipping gear.',
                    });
                    return;
                  }
                  unequipSlot(selectedSlot);
                  setGearFeedback(null);
                }}
              >
                <Text style={styles.unequipBtnText}>Unequip</Text>
              </Pressable>
            )}
          </View>

          {selectedSlotItem ? (
            <View style={styles.equippedDetailBox}>
              <Text
                style={[
                  styles.equippedDetailName,
                  {
                    color:
                      RARITY_COLORS[selectedSlotItem.rarity] ?? CRIMSON_ONI.ghostWhite,
                  },
                ]}
              >
                {selectedSlotItem.name} [{selectedSlotItem.rarity}]
              </Text>
              <Text style={styles.equippedDetailStats}>
                {formatEquipmentBonuses(selectedSlotItem.statBonuses)}
              </Text>
              <Text style={styles.equippedDetailReq}>
                Req: STR {selectedSlotItem.requiredStrength ?? 0} • END{' '}
                {selectedSlotItem.requiredEndurance ?? 0} • AGI{' '}
                {selectedSlotItem.requiredAgility ?? 0}
              </Text>
            </View>
          ) : (
            <Text style={styles.emptyInspectorNote}>
              No gear currently equipped in this slot.
              {selectedSlot === 'offHand' &&
              equipmentLoadout.mainHand &&
              inventoryBySlug.get(equipmentLoadout.mainHand)?.weaponHandedness ===
                'TWO_HANDED'
                ? ' (Main Hand currently holds a Two-Handed weapon; equipping Off-Hand will unequip it.)'
                : ''}
            </Text>
          )}

          {compatibleSwapItems.length > 0 && (
            <View style={styles.swapSection}>
              <Text style={styles.swapHeading}>Swap / Equip From Bag:</Text>
              {compatibleSwapItems.map((candidate) => {
                const check = validateEquipmentRequirements(
                  candidate,
                  coreStatsBlock,
                  selectedSlot
                );
                return (
                  <View key={candidate.slug} style={styles.swapRow}>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.swapItemName,
                          {
                            color:
                              RARITY_COLORS[candidate.rarity] ?? CRIMSON_ONI.ghostWhite,
                          },
                        ]}
                      >
                        {candidate.name}
                      </Text>
                      <Text style={styles.swapItemStats}>
                        {formatEquipmentBonuses(candidate.statBonuses)}
                      </Text>
                      {!check.valid && check.error && (
                        <Text style={styles.unmetReqText}>🔒 {check.error}</Text>
                      )}
                    </View>

                    <Pressable
                      style={[
                        styles.swapActionBtn,
                        (!check.valid || !progressionUnlocked) &&
                          styles.swapActionBtnLocked,
                      ]}
                      onPress={() => handleEquipToSelectedSlot(candidate.slug, selectedSlot)}
                    >
                      <Text style={styles.swapActionBtnText}>
                        {selectedSlotItem ? 'Swap' : 'Equip'}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      )}

      {/* 5. Inventory Contents & Bag Management */}
      <Text style={[styles.sectionTitle, { marginTop: 18 }]}>
        Inventory &amp; Bag ({inventory.length} Stack{inventory.length === 1 ? '' : 's'})
      </Text>

      <View style={styles.filterTabsRow}>
        {(
          [
            { key: 'ALL', label: 'All' },
            { key: 'EQUIPMENT', label: 'Equipment' },
            { key: 'CONSUMABLES', label: 'Consumables' },
            { key: 'MATERIALS', label: 'Materials' },
          ] as const
        ).map((tab) => {
          const active = bagFilter === tab.key;
          return (
            <Pressable
              key={tab.key}
              style={[styles.filterPill, active && styles.filterPillActive]}
              onPress={() => setBagFilter(tab.key)}
            >
              <Text
                style={[styles.filterPillText, active && styles.filterPillTextActive]}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.bagCard}>
        {filteredBagItems.length === 0 ? (
          <Text style={styles.emptyBagText}>No items in this category yet.</Text>
        ) : (
          filteredBagItems.map((item) => {
            const equippable = isEquippableInventoryEntry(item);
            const rarityCol = RARITY_COLORS[item.rarity] ?? CRIMSON_ONI.ghostWhite;
            const reqCheck = equippable
              ? validateEquipmentRequirements(item, coreStatsBlock)
              : { valid: true, unmetStats: [] as StatType[] };

            const reqStr = item.requiredStrength ?? 0;
            const reqEnd = item.requiredEndurance ?? 0;
            const reqAgi = item.requiredAgility ?? 0;

            return (
              <View
                key={item.slug}
                style={[
                  styles.bagItemRow,
                  item.equipped && styles.bagItemRowEquipped,
                ]}
              >
                <View
                  style={[styles.rarityStripe, { backgroundColor: rarityCol }]}
                />

                <View style={{ flex: 1 }}>
                  <View style={styles.bagItemTitleRow}>
                    <Text style={[styles.bagItemName, { color: rarityCol }]}>
                      {item.name}
                    </Text>
                    <View style={styles.qtyBadge}>
                      <Text style={styles.qtyBadgeText}>x{item.quantity}</Text>
                    </View>
                  </View>

                  <Text style={styles.bagItemMeta}>
                    [{item.rarity}] • {item.itemType}
                    {item.equipped && item.equippedSlot
                      ? ` • Equipped (${item.equippedSlot})`
                      : ''}
                  </Text>

                  <Text style={styles.bagItemBonuses}>
                    {item.description && !equippable
                      ? item.description
                      : formatEquipmentBonuses(item.statBonuses)}
                  </Text>

                  {equippable && (
                    <Text style={styles.bagReqRow}>
                      Req:{' '}
                      <Text
                        style={
                          reqCheck.unmetStats.includes('STRENGTH')
                            ? styles.reqUnmetInline
                            : styles.reqMetInline
                        }
                      >
                        STR {reqStr}
                      </Text>{' '}
                      •{' '}
                      <Text
                        style={
                          reqCheck.unmetStats.includes('ENDURANCE')
                            ? styles.reqUnmetInline
                            : styles.reqMetInline
                        }
                      >
                        END {reqEnd}
                      </Text>{' '}
                      •{' '}
                      <Text
                        style={
                          reqCheck.unmetStats.includes('AGILITY')
                            ? styles.reqUnmetInline
                            : styles.reqMetInline
                        }
                      >
                        AGI {reqAgi}
                      </Text>
                    </Text>
                  )}
                </View>

                {equippable && (
                  <Pressable
                    style={[
                      styles.bagEquipBtn,
                      item.equipped && styles.bagUnequipBtn,
                      !reqCheck.valid && !item.equipped && styles.bagEquipBtnStatLocked,
                    ]}
                    onPress={() => handleBagEquipToggle(item)}
                  >
                    <Text
                      style={[
                        styles.bagEquipBtnText,
                        item.equipped && styles.bagUnequipBtnText,
                      ]}
                    >
                      {!progressionUnlocked
                        ? '🔒'
                        : item.equipped
                          ? 'Unequip'
                          : !reqCheck.valid
                            ? 'Stat Gate'
                            : 'Equip'}
                    </Text>
                  </Pressable>
                )}
              </View>
            );
          })
        )}
      </View>

      {/* Celebratory Unclaimed Training Spoils Receipt Modal */}
      <Modal
        visible={spoilsModalOpen && Boolean(consolidatedSpoils)}
        transparent
        animationType="fade"
        onRequestClose={handleClaimAndCloseReceipt}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.receiptModalCard}>
            <ScrollView
              contentContainerStyle={styles.receiptModalScroll}
              showsVerticalScrollIndicator={false}
            >
              {consolidatedSpoils && (
                <>
                  <Text style={styles.receiptEyebrow}>
                    CONSOLIDATED POST-WORKOUT SPOILS RECEIPT
                  </Text>
                  <Text style={styles.receiptMainTitle}>
                    🏆 Training Spoils Unsealed!
                  </Text>
                  <Text style={styles.receiptSubSummary}>
                    {consolidatedSpoils.sessionCount} Offline Session
                    {consolidatedSpoils.sessionCount === 1 ? '' : 's'} •{' '}
                    {consolidatedSpoils.totalWorkingSets} Working Sets •{' '}
                    {Math.round(consolidatedSpoils.totalTonnageKg)} kg Volume • +
                    {consolidatedSpoils.totalGoldAwarded}g Gold
                  </Text>

                  {/* XP & Stat Level-Ups */}
                  <View style={styles.receiptSectionBox}>
                    <Text style={styles.receiptSectionHeader}>
                      ⚡ Attribute XP &amp; Stat Level-Ups
                    </Text>
                    {HOLISTIC_STATS.map((meta) => {
                      const xp =
                        (consolidatedSpoils.totalXpGained as Record<string, number>)[meta.key] ?? 0;
                      const lu = (consolidatedSpoils.statLevelUps as Record<string, any>)[meta.key];
                      if (xp === 0 && (!lu || lu.levelsGained === 0)) return null;
                      return (
                        <View key={meta.key} style={styles.receiptStatLine}>
                          <Text style={[styles.receiptStatName, { color: meta.color }]}>
                            {meta.emoji} {meta.name} ({meta.abbrev})
                          </Text>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={styles.receiptXpGain}>+{xp} XP</Text>
                            {lu && lu.levelsGained > 0 && (
                              <Text style={styles.receiptLevelUpBadge}>
                                🆙 Lv.{lu.startLevel} → Lv.{lu.endLevel} (+
                                {lu.talentPointsEarned} Talent Pt
                                {lu.talentPointsEarned === 1 ? '' : 's'})
                              </Text>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>

                  {/* PR Crit Bonuses & Guaranteed Drops */}
                  <View style={styles.receiptSectionBox}>
                    <Text style={styles.receiptSectionHeader}>
                      💥 PR Crit Bonuses &amp; Guaranteed Drops
                    </Text>
                    {consolidatedSpoils.prCritsTriggered ? (
                      <>
                        <Text style={styles.receiptHighlightGold}>
                          {consolidatedSpoils.totalPrBreakCount} Personal Record Crit
                          {consolidatedSpoils.totalPrBreakCount === 1 ? '' : 's'}{' '}
                          (+{consolidatedSpoils.prCritBonusXp} Bonus Crit XP)
                        </Text>
                        {consolidatedSpoils.allPrRecordsBroken.map((rec) => (
                          <Text key={rec.exerciseId} style={styles.receiptBullet}>
                            • {rec.exerciseName}: {rec.prTypes.join(', ')}
                          </Text>
                        ))}
                        {consolidatedSpoils.prCritDrops.map((drop) => (
                          <Text
                            key={`crit_${drop.itemSlug}`}
                            style={[
                              styles.receiptDropLine,
                              {
                                color:
                                  RARITY_COLORS[drop.rarity] ?? CRIMSON_ONI.agedGoldBright,
                              },
                            ]}
                          >
                            ★ Guaranteed PR Crit Loot: {drop.quantity}x {drop.itemName} [
                            {drop.rarity}]
                          </Text>
                        ))}
                      </>
                    ) : (
                      <Text style={styles.receiptMutedNote}>
                        No historical PR thresholds broken in these sessions — steady
                        volume banked!
                      </Text>
                    )}
                  </View>

                  {/* Effort Chest Loot Drops */}
                  <View style={styles.receiptSectionBox}>
                    <Text style={styles.receiptSectionHeader}>
                      🎁 Reliquary &amp; Effort Chest Loot
                    </Text>
                    {consolidatedSpoils.chestDrops.length > 0 ? (
                      consolidatedSpoils.chestDrops.map((drop) => (
                        <Text
                          key={`chest_${drop.itemSlug}`}
                          style={[
                            styles.receiptDropLine,
                            {
                              color:
                                RARITY_COLORS[drop.rarity] ?? CRIMSON_ONI.ghostWhite,
                            },
                          ]}
                        >
                          • {drop.quantity}x {drop.itemName} [{drop.rarity}]
                        </Text>
                      ))
                    ) : (
                      <Text style={styles.receiptMutedNote}>
                        All drops consolidated above.
                      </Text>
                    )}
                  </View>

                  {/* 24h Dungeon Buffs & 7d Raid Boss Damage */}
                  <View style={styles.receiptSectionBox}>
                    <Text style={styles.receiptSectionHeader}>
                      🏰 World Resonance (24h Dungeon &amp; 7d Raid)
                    </Text>
                    {consolidatedSpoils.injectedDungeonBuffs.length > 0 ? (
                      consolidatedSpoils.injectedDungeonBuffs.map((buff) => (
                        <Text key={buff.buffId} style={styles.receiptBullet}>
                          • 24h Dungeon Buff Injected: {buff.buffName} [{buff.buffType}]
                        </Text>
                      ))
                    ) : (
                      <Text style={styles.receiptMutedNote}>
                        • No active 24h Dungeon expedition window was open during training.
                      </Text>
                    )}

                    {consolidatedSpoils.totalRaidDamage > 0 ? (
                      <Text style={styles.receiptHighlightCrimson}>
                        🐉 Channeled {consolidatedSpoils.totalRaidDamage} Workout Energy
                        Damage
                        {consolidatedSpoils.raidTargets.length > 0
                          ? ` into ${consolidatedSpoils.raidTargets.join(', ')}`
                          : ' into Weekly Raid Boss'}
                        !
                      </Text>
                    ) : (
                      <Text style={styles.receiptMutedNote}>
                        • 0 Raid Energy channeled.
                      </Text>
                    )}

                    {consolidatedSpoils.resilienceBadges.map((badge) => (
                      <Text key={badge} style={styles.receiptHighlightGold}>
                        🛡️ Resilience Comeback Awarded: {badge}
                      </Text>
                    ))}
                  </View>

                  <Pressable
                    style={styles.sealReceiptBtn}
                    onPress={handleClaimAndCloseReceipt}
                  >
                    <Text style={styles.sealReceiptBtnText}>
                      Claim All Spoils &amp; Continue
                    </Text>
                  </Pressable>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <BugReportModal
        visible={bugReportModalVisible}
        onClose={() => setBugReportModalVisible(false)}
      />

      <DeveloperTriageModal
        visible={devTriageModalVisible}
        onClose={() => setDevTriageModalVisible(false)}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  spoilsChestCard: {
    backgroundColor: '#2B2214',
    borderWidth: 1.5,
    borderColor: CRIMSON_ONI.agedGoldBright,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  spoilsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  spoilsChestIcon: {
    fontSize: 32,
  },
  spoilsEyebrow: {
    color: CRIMSON_ONI.agedGoldBright,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  spoilsTitle: {
    color: CRIMSON_ONI.ghostWhite,
    fontSize: 16,
    fontWeight: '900',
    marginTop: 1,
  },
  spoilsSubtext: {
    color: '#D5C7A9',
    fontSize: 12,
    marginTop: 2,
  },
  claimSpoilsBtn: {
    backgroundColor: CRIMSON_ONI.agedGold,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  claimSpoilsBtnText: {
    color: CRIMSON_ONI.charcoalDeep,
    fontSize: 13,
    fontWeight: '900',
  },
  characterHeaderCard: {
    backgroundColor: CRIMSON_ONI.charcoalCard,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.borderGold,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  identityCol: {
    flex: 1,
  },
  nameLevelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  heroName: {
    flex: 1,
    color: CRIMSON_ONI.ghostWhite,
    fontSize: 17,
    fontWeight: '900',
  },
  overallLevelPill: {
    backgroundColor: CRIMSON_ONI.crimson,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.agedGold,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  overallLevelText: {
    color: CRIMSON_ONI.ghostWhite,
    fontSize: 11,
    fontWeight: '900',
  },
  guildSubtitle: {
    color: CRIMSON_ONI.agedGoldBright,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  badgeStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  goldBadge: {
    backgroundColor: CRIMSON_ONI.agedGoldDim,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.borderGold,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  goldBadgeText: {
    color: COLORS.gold,
    fontSize: 11,
    fontWeight: '800',
  },
  locationBadge: {
    backgroundColor: CRIMSON_ONI.charcoalElevated,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  locationBadgeText: {
    color: CRIMSON_ONI.ghostWhite,
    fontSize: 11,
    fontWeight: '700',
  },
  fatiguePillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  fatiguePillText: {
    fontSize: 12,
    fontWeight: '800',
  },
  fatigueToggleHint: {
    fontSize: 10,
    fontWeight: '800',
  },
  fatigueTooltipBox: {
    marginTop: 8,
    backgroundColor: CRIMSON_ONI.charcoalDeep,
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.border,
  },
  fatigueTooltipText: {
    color: CRIMSON_ONI.ghostWhite,
    fontSize: 11,
    lineHeight: 16,
  },
  sectionTitle: {
    color: CRIMSON_ONI.ghostWhite,
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 8,
  },
  sectionHeaderInline: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  sectionHint: {
    color: CRIMSON_ONI.ashGray,
    fontSize: 11,
  },
  statsSectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statsOverallBadge: {
    backgroundColor: CRIMSON_ONI.charcoalElevated,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.borderGold,
  },
  statsOverallBadgeText: {
    color: CRIMSON_ONI.agedGoldBright,
    fontSize: 12,
    fontWeight: '900',
  },
  statsStack: {
    gap: 8,
    marginBottom: 12,
  },
  statEmoji: {
    fontSize: 22,
    marginRight: 2,
  },
  statHintText: {
    color: COLORS.textMuted,
    fontSize: 10,
    marginTop: 1,
  },
  statRightCluster: {
    alignItems: 'flex-end',
    gap: 4,
  },
  statCard: {
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 11,
    padding: 12,
  },
  statCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 7,
  },
  statTitleCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '900',
  },
  statLevel: {
    color: CRIMSON_ONI.ghostWhite,
    fontSize: 14,
    fontWeight: '900',
  },
  talentPtActionBadge: {
    backgroundColor: CRIMSON_ONI.agedGoldDim,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.agedGold,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  talentPtActionText: {
    color: CRIMSON_ONI.agedGoldBright,
    fontSize: 11,
    fontWeight: '800',
  },
  zeroTalentText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  xpBarTrack: {
    height: 7,
    backgroundColor: COLORS.bgDeep,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 6,
  },
  xpBarFill: {
    height: '100%',
  },
  xpCaptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  xpCaptionText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  xpCaptionMuted: {
    color: COLORS.textMuted,
    fontSize: 11,
  },
  derivedCard: {
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.borderHighlight,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  derivedHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  derivedTitle: {
    color: CRIMSON_ONI.agedGoldBright,
    fontSize: 13,
    fontWeight: '900',
  },
  derivedSubtitle: {
    color: COLORS.textMuted,
    fontSize: 10,
  },
  derivedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  derivedCell: {
    width: '31%',
    flexGrow: 1,
    backgroundColor: COLORS.bgDeep,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 8,
    paddingHorizontal: 9,
  },
  derivedCellLabel: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  derivedCellValue: {
    color: CRIMSON_ONI.ghostWhite,
    fontSize: 13,
    fontWeight: '900',
    marginTop: 2,
  },
  derivedCellSub: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: '600',
  },
  feedbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 12,
  },
  feedbackBannerError: {
    backgroundColor: COLORS.strengthDim,
    borderColor: COLORS.strength,
  },
  feedbackBannerInfo: {
    backgroundColor: CRIMSON_ONI.agedGoldDim,
    borderColor: CRIMSON_ONI.agedGold,
  },
  feedbackBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  feedbackTextError: {
    color: '#FF8A80',
  },
  feedbackTextInfo: {
    color: CRIMSON_ONI.agedGoldBright,
  },
  feedbackDismiss: {
    color: CRIMSON_ONI.ashGray,
    fontSize: 12,
    fontWeight: '800',
    paddingLeft: 8,
  },
  loadoutGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  slotTile: {
    width: '23%',
    minWidth: 76,
    flexGrow: 1,
    minHeight: 84,
    backgroundColor: CRIMSON_ONI.charcoalCard,
    borderWidth: 1.5,
    borderRadius: 10,
    padding: 9,
    justifyContent: 'space-between',
  },
  slotTileSelected: {
    backgroundColor: CRIMSON_ONI.charcoalElevated,
    borderWidth: 2,
  },
  slotTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  slotIcon: {
    fontSize: 13,
  },
  slotLabel: {
    flex: 1,
    color: CRIMSON_ONI.ashGray,
    fontSize: 10,
    fontWeight: '800',
  },
  slotItemName: {
    fontSize: 11,
    fontWeight: '800',
    marginTop: 5,
  },
  slotItemRarity: {
    color: CRIMSON_ONI.ashGray,
    fontSize: 9,
    fontWeight: '700',
    marginTop: 3,
  },
  slotEmptyText: {
    color: CRIMSON_ONI.ashMuted,
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 10,
  },
  slotInspectorCard: {
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.borderHighlight,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  inspectorHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  inspectorTitle: {
    color: CRIMSON_ONI.ghostWhite,
    fontSize: 13,
    fontWeight: '900',
  },
  unequipBtn: {
    backgroundColor: CRIMSON_ONI.crimson,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.agedGold,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  unequipBtnText: {
    color: CRIMSON_ONI.ghostWhite,
    fontSize: 11,
    fontWeight: '800',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  equippedDetailBox: {
    backgroundColor: COLORS.bgDeep,
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  equippedDetailName: {
    fontSize: 13,
    fontWeight: '900',
  },
  equippedDetailStats: {
    color: CRIMSON_ONI.ghostWhite,
    fontSize: 11,
    marginTop: 3,
  },
  equippedDetailReq: {
    color: COLORS.textMuted,
    fontSize: 10,
    marginTop: 4,
  },
  emptyInspectorNote: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  swapSection: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 8,
    gap: 7,
  },
  swapHeading: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '800',
  },
  swapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.bgDeep,
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  swapItemName: {
    fontSize: 12,
    fontWeight: '800',
  },
  swapItemStats: {
    color: COLORS.textSecondary,
    fontSize: 10,
    marginTop: 2,
  },
  unmetReqText: {
    color: COLORS.danger,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  swapActionBtn: {
    backgroundColor: CRIMSON_ONI.agedGold,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  swapActionBtnLocked: {
    backgroundColor: COLORS.bgElevated,
    opacity: 0.65,
  },
  swapActionBtnText: {
    color: CRIMSON_ONI.charcoalDeep,
    fontSize: 11,
    fontWeight: '900',
  },
  filterTabsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  filterPill: {
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  filterPillActive: {
    backgroundColor: CRIMSON_ONI.agedGoldDim,
    borderColor: CRIMSON_ONI.agedGold,
  },
  filterPillText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  filterPillTextActive: {
    color: CRIMSON_ONI.agedGoldBright,
    fontWeight: '900',
  },
  bagCard: {
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 10,
    gap: 8,
  },
  emptyBagText: {
    color: COLORS.textMuted,
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 14,
  },
  bagItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgDeep,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 9,
    paddingRight: 10,
    overflow: 'hidden',
    gap: 10,
  },
  bagItemRowEquipped: {
    borderColor: CRIMSON_ONI.agedGold,
  },
  rarityStripe: {
    width: 4,
    alignSelf: 'stretch',
  },
  bagItemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bagItemName: {
    fontSize: 13,
    fontWeight: '800',
    flexShrink: 1,
  },
  qtyBadge: {
    backgroundColor: COLORS.bgElevated,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  qtyBadgeText: {
    color: CRIMSON_ONI.ghostWhite,
    fontSize: 10,
    fontWeight: '800',
  },
  bagItemMeta: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  bagItemBonuses: {
    color: COLORS.textSecondary,
    fontSize: 11,
    marginTop: 3,
  },
  bagReqRow: {
    color: COLORS.textMuted,
    fontSize: 10,
    marginTop: 3,
  },
  reqMetInline: {
    color: COLORS.textSecondary,
    fontWeight: '700',
  },
  reqUnmetInline: {
    color: COLORS.danger,
    fontWeight: '900',
  },
  bagEquipBtn: {
    backgroundColor: CRIMSON_ONI.agedGold,
    borderRadius: 7,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  bagUnequipBtn: {
    backgroundColor: COLORS.bgElevated,
    borderWidth: 1,
    borderColor: COLORS.borderHighlight,
  },
  bagEquipBtnStatLocked: {
    backgroundColor: COLORS.strengthDim,
    borderWidth: 1,
    borderColor: COLORS.strength,
  },
  bagEquipBtnText: {
    color: CRIMSON_ONI.charcoalDeep,
    fontSize: 11,
    fontWeight: '900',
  },
  bagUnequipBtnText: {
    color: CRIMSON_ONI.ghostWhite,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 10, 14, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  receiptModalCard: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '88%',
    backgroundColor: CRIMSON_ONI.charcoalBase,
    borderWidth: 1.5,
    borderColor: CRIMSON_ONI.agedGoldBright,
    borderRadius: 16,
    overflow: 'hidden',
  },
  receiptModalScroll: {
    padding: 18,
  },
  receiptEyebrow: {
    color: CRIMSON_ONI.agedGold,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.3,
  },
  receiptMainTitle: {
    color: CRIMSON_ONI.ghostWhite,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 3,
  },
  receiptSubSummary: {
    color: CRIMSON_ONI.ashGray,
    fontSize: 12,
    marginTop: 4,
    marginBottom: 14,
  },
  receiptSectionBox: {
    backgroundColor: CRIMSON_ONI.charcoalCard,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  receiptSectionHeader: {
    color: CRIMSON_ONI.agedGoldBright,
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 8,
  },
  receiptStatLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  receiptStatName: {
    fontSize: 13,
    fontWeight: '900',
  },
  receiptXpGain: {
    color: CRIMSON_ONI.ghostWhite,
    fontSize: 13,
    fontWeight: '800',
  },
  receiptLevelUpBadge: {
    color: CRIMSON_ONI.agedGoldBright,
    fontSize: 11,
    fontWeight: '800',
    marginTop: 1,
  },
  receiptHighlightGold: {
    color: CRIMSON_ONI.agedGoldBright,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 4,
  },
  receiptHighlightCrimson: {
    color: '#FF8A80',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 4,
  },
  receiptBullet: {
    color: CRIMSON_ONI.ghostWhite,
    fontSize: 12,
    marginBottom: 3,
  },
  receiptDropLine: {
    fontSize: 12,
    fontWeight: '800',
    marginTop: 3,
  },
  receiptMutedNote: {
    color: CRIMSON_ONI.ashGray,
    fontSize: 11,
  },
  sealReceiptBtn: {
    marginTop: 8,
    backgroundColor: CRIMSON_ONI.agedGold,
    borderRadius: 10,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sealReceiptBtnText: {
    color: CRIMSON_ONI.charcoalDeep,
    fontSize: 14,
    fontWeight: '900',
  },
  audioMuteBtn: {
    backgroundColor: '#26242E',
    borderWidth: 1,
    borderColor: '#4B5563',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    justifyContent: 'center',
  },
  audioMuteBtnActive: {
    backgroundColor: '#37181F',
    borderColor: '#F43F5E',
  },
  audioMuteBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#E5E7EB',
  },
  audioMuteBtnTextActive: {
    color: '#FB7185',
  },
  bugReportBtn: {
    backgroundColor: '#26242E',
    borderWidth: 1,
    borderColor: '#4B5563',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bugReportBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#E5E7EB',
  },
  devTriageBtn: {
    backgroundColor: '#352A15',
    borderWidth: 1,
    borderColor: '#C69A45',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  devTriageBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#DFB660',
  },
  updateCheckBtn: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#38BDF8',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  updateCheckBtnDisabled: {
    opacity: 0.6,
  },
  updateCheckBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#38BDF8',
  },
  versionBadgeInline: {
    backgroundColor: '#0F172A',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  versionBadgeInlineText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#94A3B8',
  },
});

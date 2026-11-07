import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  ImageSourcePropType,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Polygon, SvgXml } from 'react-native-svg';
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
  ITEM_TIER_CONFIG,
  ItemTier,
} from '@gymify/game-engine';
import { CharacterPortraitFrame } from '../components/CharacterPortraitFrame';
import { AttributeRadarChart } from '../components/AttributeRadarChart';
import { BugReportModal } from '../components/BugReportModal';
import { CharacterManagerModal } from '../components/CharacterManagerModal';
import { DeveloperTriageModal } from '../components/DeveloperTriageModal';
import { Image as ExpoImage } from 'expo-image';
import { autoUpdateManager, AutoUpdateState } from '../services/AutoUpdateManager';
import { audioManager } from '../services/AudioManager';
import { triggerSensoryCue } from '../utils/sensoryFeedback';
import {
  InventoryEntry,
  isEquippableInventoryEntry,
  useGame,
} from '../state/GameContext';
import {
  CHARACTER_SILHOUETTE_SVG,
  LOOT_CHEST_SVGS,
  RANK_CREST_SVGS,
  STAT_GLYPH_SVGS,
} from '../assets/v0Vault';
import { getItemIconSource } from '../assets/itemArtRegistry';
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

const TOP_HEX_KEYS: HolisticStatType[] = ['AGILITY', 'DEXTERITY'];
const MID_HEX_KEYS: HolisticStatType[] = ['STRENGTH', 'CONSTITUTION', 'ENDURANCE'];
const BOT_HEX_KEYS: HolisticStatType[] = ['SPIRIT', 'WISDOM'];
const STAT_BY_KEY = Object.fromEntries(HOLISTIC_STATS.map((m) => [m.key, m]));
const HEX_PERIMETER = 298;

type SatchelFilter =
  | 'ALL'
  | 'WEAPONS'
  | 'ARMOR'
  | 'ACCESSORIES'
  | 'CONSUMABLES'
  | 'MATERIALS';

type InventorySort = 'RARITY' | 'TYPE' | 'QUANTITY';

const RARITY_WEIGHT: Record<string, number> = {
  LEGENDARY: 5,
  EPIC: 4,
  RARE: 3,
  UNCOMMON: 2,
  COMMON: 1,
};

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

const LEFT_PAPERDOLL_SLOTS: { slot: EquipmentSlot; label: string; icon: string }[] = [
  { slot: 'head', label: 'Helm', icon: '🪖' },
  { slot: 'chest', label: 'Chest', icon: '🥋' },
  { slot: 'legs', label: 'Greaves', icon: '👖' },
  { slot: 'boots', label: 'Boots', icon: '🥾' },
];

const RIGHT_PAPERDOLL_SLOTS: { slot: EquipmentSlot; label: string; icon: string }[] = [
  { slot: 'mainHand', label: 'Main', icon: '⚔️' },
  { slot: 'offHand', label: 'Off', icon: '🛡️' },
  { slot: 'accessory1', label: 'Ring', icon: '💍' },
  { slot: 'accessory2', label: 'Amulet', icon: '📿' },
];

function getItemArtworkGlyph(
  item?: InventoryEntry | null,
  slotFallback?: EquipmentSlot
): string {
  if (!item) {
    if (slotFallback) return SLOT_ICONS[slotFallback] ?? '🛡️';
    return '📦';
  }
  const type = (item.itemType as string) ?? '';
  if (type === 'WEAPON') {
    if (item.weaponHandedness === 'TWO_HANDED') return '🗡️';
    return '⚔️';
  }
  if (type === 'OFFHAND') return '🛡️';
  if (type === 'HEAD') return '🪖';
  if (type === 'CHEST') return '🥋';
  if (type === 'LEGS') return '👖';
  if (type === 'BOOTS') return '🥾';
  if (type === 'ACCESSORY') {
    const n = item.name.toLowerCase();
    if (n.includes('ring') || n.includes('band')) return '💍';
    if (n.includes('amulet') || n.includes('pendant') || n.includes('necklace')) return '📿';
    return '✨';
  }
  if (type === 'CONSUMABLE') {
    const n = item.name.toLowerCase();
    if (n.includes('elixir') || n.includes('potion')) return '🧪';
    if (n.includes('meat') || n.includes('food') || n.includes('ration')) return '🍖';
    return '🍶';
  }
  if (type === 'CRAFTING_MATERIAL' || type === 'MATERIAL') {
    const n = item.name.toLowerCase();
    if (n.includes('ore') || n.includes('ingot') || n.includes('metal')) return '⛏️';
    if (n.includes('herb') || n.includes('flower') || n.includes('leaf')) return '🌿';
    if (n.includes('gem') || n.includes('crystal') || n.includes('shard')) return '💎';
    return '🪵';
  }
  return '📦';
}

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

function getCompactItemBadge(item: InventoryEntry): string {
  const parts: string[] = [];
  const b = item.statBonuses;
  if (b) {
    if (b.meleePower) parts.push(`+${b.meleePower} ATK`);
    if (b.armorRating) parts.push(`+${b.armorRating} DEF`);
    if (b.maxHp) parts.push(`+${b.maxHp} HP`);
    if (b.maxStamina) parts.push(`+${b.maxStamina} STA`);
    if (b.critChance) parts.push(`+${Math.round(b.critChance * 100)}% CRT`);
    if (b.dodgeRating) parts.push(`+${Math.round(b.dodgeRating * 100)}% DDG`);
    if (b.attackSpeedPct) parts.push(`+${Math.round(b.attackSpeedPct * 100)}% SPD`);
  }

  if (item.requiredStrength) parts.push(`${item.requiredStrength} STR`);
  if (item.requiredEndurance) parts.push(`${item.requiredEndurance} CON`);
  if (item.requiredAgility) parts.push(`${item.requiredAgility} AGI`);

  if (parts.length > 0) {
    const main = parts.slice(0, 2).join(' | ');
    return item.weaponHandedness === 'TWO_HANDED' ? `${main} | 2H` : main;
  }
  return item.weaponHandedness === 'TWO_HANDED' ? `${item.rarity} | 2H` : item.rarity;
}

export const CharacterProfileScreen: React.FC<CharacterProfileScreenProps> = ({
  onJumpToTalents,
  characterImageSource,
}) => {
  const {
    characterName,
    characterArtUri,
    appearanceId,
    overallLevel,
    adventurerRank,
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
    gameMode,
    activeCharacterId,
    currentUser,
  } = useGame();

  const progressionUnlocked = isCharacterProgressionUnlocked(workoutMachine.phase);

  const [charManagerModalVisible, setCharManagerModalVisible] = useState(false);
  const [charManagerInitialCustomizeId, setCharManagerInitialCustomizeId] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<EquipmentSlot | null>(null);
  const [isSatchelOpen, setIsSatchelOpen] = useState(true);
  const [satchelFilter, setSatchelFilter] = useState<SatchelFilter>('ALL');
  const [inventorySort, setInventorySort] = useState<InventorySort>('RARITY');
  const [inspectedItem, setInspectedItem] = useState<InventoryEntry | null>(null);
  const [showCompare, setShowCompare] = useState<boolean>(false);
  const [gearFeedback, setGearFeedback] = useState<{
    tone: 'error' | 'info';
    text: string;
  } | null>(null);
  const [showFatigueDetails, setShowFatigueDetails] = useState<boolean>(false);
  const [spoilsModalOpen, setSpoilsModalOpen] = useState<boolean>(false);
  const [bugReportModalVisible, setBugReportModalVisible] = useState<boolean>(false);
  const [devTriageModalVisible, setDevTriageModalVisible] = useState<boolean>(false);
  const [devSanctumUnlocked, setDevSanctumUnlocked] = useState<boolean>(false);
  const [devSanctumUnlockToast, setDevSanctumUnlockToast] = useState<string | null>(null);
  const versionTapCountRef = useRef<number>(0);
  const versionTapResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [updateState, setUpdateState] = useState<AutoUpdateState>(() =>
    autoUpdateManager.getState()
  );
  const [isMuted, setIsMuted] = useState<boolean>(audioManager.isMuted());

  const isAdminUser = useMemo(() => {
    const email = currentUser?.email?.trim().toLowerCase() ?? '';
    if (!email) return false;
    const rawAdmins = (process.env.EXPO_PUBLIC_ADMIN_EMAILS ?? '').trim();
    const configuredAdmins = rawAdmins
      ? rawAdmins
          .split(',')
          .map((e: string) => e.trim().toLowerCase())
          .filter(Boolean)
      : [];
    return (
      configuredAdmins.includes(email) ||
      email === 'admin@gymify.rpg' ||
      email === 'dev@gymify.rpg' ||
      email.endsWith('@gymify.rpg')
    );
  }, [currentUser?.email]);

  const isDevToolsEnabled =
    process.env.EXPO_PUBLIC_ENABLE_DEV_TOOLS === 'true' ||
    isAdminUser ||
    devSanctumUnlocked;

  const handleVersionBadgePress = () => {
    if (versionTapResetTimerRef.current) {
      clearTimeout(versionTapResetTimerRef.current);
    }
    const nextCount = versionTapCountRef.current + 1;
    versionTapCountRef.current = nextCount;

    if (nextCount >= 5) {
      versionTapCountRef.current = 0;
      if (!devSanctumUnlocked) {
        setDevSanctumUnlocked(true);
      }
      triggerSensoryCue('CHEST_OPEN_REVEAL');
      setDevSanctumUnlockToast('🛠️ Developer Sanctum Unlocked');
      setTimeout(() => {
        setDevSanctumUnlockToast(null);
      }, 4000);
      return;
    }

    versionTapResetTimerRef.current = setTimeout(() => {
      versionTapCountRef.current = 0;
    }, 2500);
  };

  const scrollY = useRef(new Animated.Value(0)).current;
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const itemTappedRef = useRef(false);

  const tooltipParallaxY = scrollY.interpolate({
    inputRange: [-50, 0, 50, 100],
    outputRange: [4, 0, -2, -4],
    extrapolate: 'clamp',
  });

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

  const unboundItems = useMemo(() => {
    return inventory.filter((item) => !item.equipped);
  }, [inventory]);

  const filteredSatchelItems = useMemo(() => {
    const items = unboundItems.filter((i) => {
      const type = (i.itemType as string) ?? '';
      switch (satchelFilter) {
        case 'WEAPONS':
          return type === 'WEAPON';
        case 'ARMOR':
          return ['HEAD', 'CHEST', 'LEGS', 'BOOTS', 'OFFHAND'].includes(type);
        case 'ACCESSORIES':
          return type === 'ACCESSORY';
        case 'CONSUMABLES':
          return type === 'CONSUMABLE';
        case 'MATERIALS':
          return type === 'CRAFTING_MATERIAL' || type === 'MATERIAL';
        case 'ALL':
        default:
          return true;
      }
    });

    return [...items].sort((a, b) => {
      if (inventorySort === 'RARITY') {
        const diff = (RARITY_WEIGHT[b.rarity] ?? 0) - (RARITY_WEIGHT[a.rarity] ?? 0);
        if (diff !== 0) return diff;
        return a.name.localeCompare(b.name);
      }
      if (inventorySort === 'TYPE') {
        const typeComp = ((a.itemType as string) ?? '').localeCompare((b.itemType as string) ?? '');
        if (typeComp !== 0) return typeComp;
        return a.name.localeCompare(b.name);
      }
      if (inventorySort === 'QUANTITY') {
        const qDiff = (b.quantity ?? 1) - (a.quantity ?? 1);
        if (qDiff !== 0) return qDiff;
        return a.name.localeCompare(b.name);
      }
      return 0;
    });
  }, [satchelFilter, inventorySort, unboundItems]);

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

  // Compute total equipped item power
  const totalItemPower = useMemo(() => {
    let power = 0;
    for (const slotKey of Object.keys(equipmentLoadout) as EquipmentSlot[]) {
      const slug = equipmentLoadout[slotKey];
      if (slug) {
        const item = inventoryBySlug.get(slug);
        if (item?.statBonuses) {
          power += (item.statBonuses.meleePower ?? 0) * 2;
          power += (item.statBonuses.armorRating ?? 0) * 1.5;
          power += (item.statBonuses.maxHp ?? 0) * 0.5;
          power += (item.statBonuses.maxStamina ?? 0) * 0.5;
          power += Math.round((item.statBonuses.critChance ?? 0) * 100);
          power += Math.round((item.statBonuses.dodgeRating ?? 0) * 100);
        } else {
          power += 15;
        }
      }
    }
    return Math.round(power);
  }, [equipmentLoadout, inventoryBySlug]);

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

  const renderHexStat = (key: HolisticStatType) => {
    const meta = STAT_BY_KEY[key];
    if (!meta) return null;
    const s = stats[meta.key];
    const nextReq = xpRequiredForStatLevel(s.level);
    const pct = Math.min(100, Math.round((s.xp / nextReq) * 100));

    return (
      <Pressable
        key={meta.key}
        style={styles.hexPressable}
        onPress={() => onJumpToTalents?.(meta.key)}
        testID={`profile-stat-tile-${meta.key}`}
      >
        <Svg width={96} height={108} viewBox="0 0 96 108" style={styles.hexSvg}>
          <Polygon
            points="48,4 91,28 91,80 48,104 5,80 5,28"
            fill="#141722"
            stroke="#2A2F3D"
            strokeWidth={2}
          />
          {pct > 0 && (
            <>
              <Polygon
                points="48,4 91,28 91,80 48,104 5,80 5,28"
                fill="none"
                stroke="#C084FC"
                strokeWidth={5}
                strokeOpacity={0.35}
                strokeDasharray={`${HEX_PERIMETER} ${HEX_PERIMETER}`}
                strokeDashoffset={HEX_PERIMETER * (1 - pct / 100)}
                strokeLinecap="round"
              />
              <Polygon
                points="48,4 91,28 91,80 48,104 5,80 5,28"
                fill="none"
                stroke="#A855F7"
                strokeWidth={2.5}
                strokeDasharray={`${HEX_PERIMETER} ${HEX_PERIMETER}`}
                strokeDashoffset={HEX_PERIMETER * (1 - pct / 100)}
                strokeLinecap="round"
              />
            </>
          )}
        </Svg>
        <View style={styles.hexContent}>
          {STAT_GLYPH_SVGS[meta.abbrev as keyof typeof STAT_GLYPH_SVGS] ? (
            <SvgXml
              xml={STAT_GLYPH_SVGS[meta.abbrev as keyof typeof STAT_GLYPH_SVGS]}
              width={18}
              height={18}
            />
          ) : (
            <Text style={{ fontSize: 14 }}>{meta.emoji}</Text>
          )}
          <Text style={[styles.hexStatCode, { color: meta.color }]}>{meta.abbrev}</Text>
          <Text style={styles.hexLevelText}>Lv.{s.level}</Text>
          {s.pointsAvailable > 0 ? (
            <View style={styles.hexTalentBadge}>
              <Text style={styles.hexTalentBadgeText}>+{s.pointsAvailable}</Text>
            </View>
          ) : (
            <Text style={styles.hexXpPct}>{pct}%</Text>
          )}
        </View>
      </Pressable>
    );
  };

  const renderPaperdollSlot = (slot: EquipmentSlot, label: string, icon: string) => {
    const equippedSlug = equipmentLoadout[slot];
    const item = equippedSlug ? inventoryBySlug.get(equippedSlug) ?? null : null;
    const isSelected = inspectedItem?.slug === item?.slug && item !== null;
    const rarityBorder = item
      ? RARITY_COLORS[item.rarity] ?? COLORS.borderHighlight
      : '#2A2F3D';
    const itemIconSrc = item ? getItemIconSource(item) : null;

    return (
      <Pressable
        key={slot}
        style={[
          styles.paperdollSlotTile,
          { borderColor: rarityBorder },
          isSelected && styles.paperdollSlotTileSelected,
        ]}
        onPress={() => {
          if (item) {
            itemTappedRef.current = true;
            setTimeout(() => {
              itemTappedRef.current = false;
            }, 60);
            setInspectedItem((prev) => (prev?.slug === item.slug ? null : item));
            setShowCompare(false);
          } else {
            setSelectedSlot(slot);
            setIsSatchelOpen(true);
            if (slot === 'mainHand') setSatchelFilter('WEAPONS');
            else if (['head', 'chest', 'legs', 'boots', 'offHand'].includes(slot))
              setSatchelFilter('ARMOR');
            else if (['accessory1', 'accessory2'].includes(slot))
              setSatchelFilter('ACCESSORIES');
          }
        }}
        accessibilityRole="button"
        accessibilityLabel={`${label} slot: ${item ? item.name : 'Empty'}`}
        testID={`paperdoll-slot-${slot}`}
      >
        {itemIconSrc ? (
          <ExpoImage
            source={itemIconSrc as any}
            style={styles.paperdollItemImage}
            contentFit="cover"
          />
        ) : (
          <>
            <Text style={styles.paperdollSlotIcon}>{getItemArtworkGlyph(item, slot)}</Text>
            <Text style={styles.paperdollSlotLabel} numberOfLines={1}>
              {label.toUpperCase()}
            </Text>
          </>
        )}

        {item ? (
          <View
            style={[
              styles.paperdollTierBadge,
              { backgroundColor: rarityBorder },
            ]}
          >
            <Text style={styles.paperdollTierBadgeText}>
              {item.tier ? `T${item.tier}` : item.weaponHandedness === 'TWO_HANDED' ? '2H' : '•'}
            </Text>
          </View>
        ) : null}
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, position: 'relative' }}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: inspectedItem ? 420 : 40 },
        ]}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
        onTouchStart={(e) => {
          touchStartPos.current = {
            x: e.nativeEvent.pageX,
            y: e.nativeEvent.pageY,
          };
        }}
        onTouchEnd={(e) => {
          if (itemTappedRef.current) return;
          if (!touchStartPos.current) return;
          const dx = e.nativeEvent.pageX - touchStartPos.current.x;
          const dy = e.nativeEvent.pageY - touchStartPos.current.y;
          if (Math.hypot(dx, dy) < 6) {
            setInspectedItem(null);
          }
        }}
      >
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

      {/* 2. Deduplicated Sleek Utility Header Bar */}
      <View style={styles.utilityHeaderCard}>
        <View style={styles.utilityTopRow}>
          <View style={styles.utilityIdentityCluster}>
            {RANK_CREST_SVGS[adventurerRank.toUpperCase() as keyof typeof RANK_CREST_SVGS] ? (
              <SvgXml
                xml={RANK_CREST_SVGS[adventurerRank.toUpperCase() as keyof typeof RANK_CREST_SVGS]}
                width={26}
                height={26}
              />
            ) : null}
            <Text style={styles.utilityHeroName} numberOfLines={1}>
              {characterName}
            </Text>
          </View>
          <Pressable
            style={styles.heroRosterPill}
            onPress={() => setCharManagerModalVisible(true)}
            testID="profile-open-roster-btn"
          >
            <Text style={styles.heroRosterPillText}>
              {gameMode === 'IRONMAN_VERIFIED' ? '🛡️ Ironman' : '⚔️ Standard'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.utilityBottomRow}>
          <Pressable
            style={[styles.utilityBtn, isMuted && styles.utilityBtnActive]}
            onPress={() => void audioManager.toggleMute()}
            testID="profile-audio-mute-btn"
          >
            <Text style={[styles.utilityBtnText, isMuted && styles.utilityBtnTextActive]}>
              {isMuted ? '🔇 Muted' : '🔊 SFX'}
            </Text>
          </Pressable>

          {isDevToolsEnabled && (
            <Pressable
              style={[styles.utilityBtn, styles.utilityBtnGold]}
              onPress={() => setDevTriageModalVisible(true)}
              testID="profile-open-triage-btn"
            >
              <Text style={[styles.utilityBtnText, styles.utilityBtnTextGold]}>🛠️ Dev Triage</Text>
            </Pressable>
          )}

          <Pressable
            style={[
              styles.utilityBtn,
              (updateState.status === 'CHECKING' ||
                updateState.status === 'DOWNLOADING_OTA') &&
                styles.utilityBtnDisabled,
            ]}
            onPress={() => void autoUpdateManager.checkForUpdates(true)}
            disabled={
              updateState.status === 'CHECKING' ||
              updateState.status === 'DOWNLOADING_OTA'
            }
            testID="profile-check-updates-btn"
          >
            <Text style={styles.utilityBtnText}>
              {updateState.status === 'CHECKING'
                ? '⏳'
                : updateState.status === 'DOWNLOADING_OTA'
                ? '📥'
                : '🔄'}
            </Text>
            <Pressable
              style={styles.versionBadgeInline}
              onPress={(e) => {
                e.stopPropagation?.();
                handleVersionBadgePress();
              }}
              hitSlop={6}
              testID="profile-version-badge-btn"
            >
              <Text style={styles.versionBadgeInlineText}>v{updateState.currentVersion}</Text>
            </Pressable>
          </Pressable>
        </View>

        {devSanctumUnlockToast && (
          <Pressable
            style={[styles.feedbackBanner, styles.feedbackBannerInfo, { marginTop: 8, marginBottom: 4 }]}
            onPress={() => setDevSanctumUnlockToast(null)}
            testID="dev-sanctum-unlock-toast"
          >
            <Text style={[styles.feedbackBannerText, styles.feedbackTextInfo]}>
              {devSanctumUnlockToast}
            </Text>
            <Text style={styles.feedbackDismiss}>✕</Text>
          </Pressable>
        )}

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

      {/* 3. Attribute Radar Synergy (Clean, Tight Card) */}
      <View style={styles.radarCard}>
        <View style={styles.radarImageContainer}>
          <AttributeRadarChart stats={stats} height={210} />
        </View>
      </View>

      {/* 2–3–2 Pointy-Top Hexagonal Stat Honeycomb Grid */}
      <View style={styles.statHoneycombGrid} testID="stat-honeycomb-grid">
        <View style={styles.hexRow}>
          {TOP_HEX_KEYS.map((k) => renderHexStat(k))}
        </View>
        <View style={[styles.hexRow, styles.hexMidRow]}>
          {MID_HEX_KEYS.map((k) => renderHexStat(k))}
        </View>
        <View style={[styles.hexRow, styles.hexBotRow]}>
          {BOT_HEX_KEYS.map((k) => renderHexStat(k))}
        </View>
      </View>

      {/* Combat Derived Attributes Summary */}
      <View style={styles.derivedCard}>
        <View style={styles.derivedHeaderRow}>
          <Text style={styles.derivedTitle}>Combat Derived Attributes</Text>
          <Text style={styles.derivedSubtitle}>Base + 8-Slot Gear + Talent Trees</Text>
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

      {/* 4. Visual RPG Paperdoll Equipment Layout */}
      <View style={styles.sectionHeaderInline}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>Equipped Armaments Paperdoll</Text>
          <Text style={styles.sectionHint}>Tap any slot to inspect or equip from satchel</Text>
        </View>
        <View style={styles.sectionHeaderRightActions}>
          <Pressable
            style={styles.appearanceHeaderBtn}
            onPress={() => {
              setCharManagerInitialCustomizeId(activeCharacterId ?? null);
              setCharManagerModalVisible(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Customize Character Appearance"
            testID="profile-customize-appearance-btn"
          >
            <Text style={styles.appearanceHeaderBtnText}>🎨 Appearance</Text>
          </Pressable>
          <View style={styles.itemPowerHeaderBadge}>
            <Text style={styles.itemPowerHeaderBadgeText}>⚡ Power {totalItemPower}</Text>
          </View>
        </View>
      </View>

      <View style={styles.paperdollLayoutContainer}>
        {/* Left Column (4 Slots: Helm, Chest, Greaves, Boots) */}
        <View style={styles.paperdollSideColumn}>
          {LEFT_PAPERDOLL_SLOTS.map((s) => renderPaperdollSlot(s.slot, s.label, s.icon))}
        </View>

        {/* Center Paperdoll Frame */}
        <Pressable
          style={styles.paperdollCenterFrame}
          onPress={() => {
            setCharManagerInitialCustomizeId(activeCharacterId ?? null);
            setCharManagerModalVisible(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="Customize Character Appearance"
        >
          <CharacterPortraitFrame
            variant="hero"
            height={330}
            bottomClearance={30}
            appearanceId={appearanceId}
            imageSource={characterImageSource ?? characterArtUri}
          />
          <View style={styles.paperdollCenterBaseBadge}>
            {RANK_CREST_SVGS[adventurerRank.toUpperCase() as keyof typeof RANK_CREST_SVGS] ? (
              <SvgXml
                xml={RANK_CREST_SVGS[adventurerRank.toUpperCase() as keyof typeof RANK_CREST_SVGS]}
                width={18}
                height={18}
              />
            ) : null}
            <Text style={styles.paperdollCenterBaseText} numberOfLines={1}>
              {adventurerRank} • Power {totalItemPower}
            </Text>
          </View>
        </Pressable>

        {/* Right Column (4 Slots: Main Hand, Off-Hand, Ring 1, Amulet 2) */}
        <View style={styles.paperdollSideColumn}>
          {RIGHT_PAPERDOLL_SLOTS.map((s) => renderPaperdollSlot(s.slot, s.label, s.icon))}
        </View>
      </View>

      {/* 5. Collapsible Satchel Drawer */}
      <Pressable
        style={styles.satchelToggleHeader}
        onPress={() => setIsSatchelOpen((prev) => !prev)}
        testID="profile-satchel-toggle-btn"
      >
        <View style={styles.satchelToggleTitleCluster}>
          <Text style={styles.satchelIcon}>🎒</Text>
          <View>
            <Text style={styles.satchelHeading}>
              {isSatchelOpen ? 'Close Satchel Drawer' : 'Open Satchel Drawer'}
            </Text>
            <Text style={styles.satchelSubtitle}>
              {unboundItems.length} Unbound Item{unboundItems.length === 1 ? '' : 's'}, Consumables &amp; Materials
            </Text>
          </View>
        </View>
        <View style={styles.satchelChevronPill}>
          <Text style={styles.satchelChevronText}>{isSatchelOpen ? '▲ Hide' : '▼ Open'}</Text>
        </View>
      </Pressable>

      {isSatchelOpen && (
        <View style={styles.satchelDrawerBody}>
          {/* Satchel Category Filter Tabs */}
          <View style={styles.filterTabsRow}>
            {(
              [
                { key: 'ALL', label: `All (${unboundItems.length})` },
                {
                  key: 'WEAPONS',
                  label: `Weapons (${unboundItems.filter((i) => i.itemType === 'WEAPON').length})`,
                },
                {
                  key: 'ARMOR',
                  label: `Armor (${unboundItems.filter((i) => ['HEAD', 'CHEST', 'LEGS', 'BOOTS', 'OFFHAND'].includes(i.itemType)).length})`,
                },
                {
                  key: 'ACCESSORIES',
                  label: `Accessories (${unboundItems.filter((i) => i.itemType === 'ACCESSORY').length})`,
                },
                {
                  key: 'CONSUMABLES',
                  label: `Consumables (${unboundItems.filter((i) => i.itemType === 'CONSUMABLE').length})`,
                },
                {
                  key: 'MATERIALS',
                  label: `Materials (${unboundItems.filter((i) => ['MATERIAL', 'CRAFTING_MATERIAL'].includes(i.itemType)).length})`,
                },
              ] as const
            ).map((tab) => {
              const active = satchelFilter === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  style={[styles.filterPill, active && styles.filterPillActive]}
                  onPress={() => setSatchelFilter(tab.key)}
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

          {/* Sort By Controls Bar */}
          <View style={styles.sortBarRow}>
            <Text style={styles.sortBarLabel}>Sort By:</Text>
            {(['RARITY', 'TYPE', 'QUANTITY'] as const).map((mode) => (
              <Pressable
                key={mode}
                style={[styles.sortChip, inventorySort === mode && styles.sortChipActive]}
                onPress={() => setInventorySort(mode)}
              >
                <Text
                  style={[
                    styles.sortChipText,
                    inventorySort === mode && styles.sortChipTextActive,
                  ]}
                >
                  {mode === 'RARITY' ? '💎 Rarity' : mode === 'TYPE' ? '🏷️ Type' : '📦 Quantity'}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.bagCard}>
            {filteredSatchelItems.length === 0 ? (
              <Text style={styles.emptyBagText}>No unbound items in this category.</Text>
            ) : (
              filteredSatchelItems.map((item) => {
                const equippable = isEquippableInventoryEntry(item);
                const rarityCol = RARITY_COLORS[item.rarity] ?? CRIMSON_ONI.ghostWhite;
                const reqCheck = equippable
                  ? validateEquipmentRequirements(item, coreStatsBlock)
                  : { valid: true, unmetStats: [] as StatType[] };
                const isInspecting = inspectedItem?.slug === item.slug;

                return (
                  <Pressable
                    key={item.slug}
                    style={[styles.bagItemRow, isInspecting && styles.bagItemRowInspecting]}
                    onPress={() => {
                      itemTappedRef.current = true;
                      setTimeout(() => {
                        itemTappedRef.current = false;
                      }, 60);
                      setInspectedItem((prev) => (prev?.slug === item.slug ? null : item));
                      setShowCompare(false);
                    }}
                    testID={`inventory-item-${item.slug}`}
                  >
                    <View style={[styles.itemIconBox44, { borderColor: rarityCol }]}>
                      {getItemIconSource(item) ? (
                        <ExpoImage
                          source={getItemIconSource(item) as any}
                          style={styles.itemIconImage44}
                          contentFit="cover"
                        />
                      ) : (
                        <Text style={styles.itemIconGlyph}>{getItemArtworkGlyph(item)}</Text>
                      )}
                      {item.tier ? (
                        <View style={[styles.itemTierBadgeCorner, { backgroundColor: rarityCol }]}>
                          <Text style={styles.itemTierBadgeText}>T{item.tier}</Text>
                        </View>
                      ) : null}
                    </View>

                    <View style={styles.bagItemCenterInfo}>
                      <Text style={[styles.bagItemName, { color: rarityCol }]} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.bagItemMeta} numberOfLines={1}>
                        [{item.rarity}]{item.tier ? ` • Tier ${item.tier}` : ''} • {item.itemType}
                        {item.weaponHandedness === 'TWO_HANDED' ? ' • 2H' : ''}
                        {item.uniquePassive ? ' • ★ Unique' : ''}
                      </Text>
                    </View>

                    {item.quantity > 1 ? (
                      <View style={styles.satchelQtyBadge}>
                        <Text style={styles.satchelQtyText}>x{item.quantity}</Text>
                      </View>
                    ) : isInspecting ? (
                      <View style={styles.satchelInspectingPill}>
                        <Text style={styles.satchelInspectingText}>Inspecting</Text>
                      </View>
                    ) : !reqCheck.valid ? (
                      <View style={styles.satchelGatePill}>
                        <Text style={styles.satchelGateText}>🔒 Stat Gate</Text>
                      </View>
                    ) : (
                      <Text style={styles.satchelChevron}>›</Text>
                    )}
                  </Pressable>
                );
              })
            )}
          </View>
        </View>
      )}
    </ScrollView>

    {/* Pinned Bottom Item Tooltip (Non-blocking, scroll-through sibling) */}
    {inspectedItem && (
      <Animated.View
        style={[
          styles.pinnedTooltipOverlay,
          { transform: [{ translateY: tooltipParallaxY }] },
        ]}
        pointerEvents="box-none"
      >
        <View style={styles.bottomTooltipCard} pointerEvents="auto">
          {(() => {
              const item = inspectedItem;
              const equippable = isEquippableInventoryEntry(item);
              const rarityCol = RARITY_COLORS[item.rarity] ?? CRIMSON_ONI.ghostWhite;
              const reqCheck = equippable
                ? validateEquipmentRequirements(item, coreStatsBlock)
                : { valid: true, unmetStats: [] as StatType[] };

              const matchingSlots = equippable
                ? getCompatibleSlotsForItemType(item.itemType, item.weaponHandedness)
                : [];
              const primarySlot = matchingSlots[0];
              const equippedSlug = primarySlot ? equipmentLoadout[primarySlot] : null;
              const equippedItem = equippedSlug ? inventoryBySlug.get(equippedSlug) ?? null : null;
              const isCurrentlyEquipped = item.equipped;

              return (
                <View style={styles.tooltipInner}>
                  {/* Tooltip Header */}
                  <View style={styles.tooltipHeaderRow}>
                    <View style={[styles.itemIconBox56, { borderColor: rarityCol }]}>
                      {getItemIconSource(item) ? (
                        <ExpoImage
                          source={getItemIconSource(item) as any}
                          style={styles.itemIconImage56}
                          contentFit="cover"
                        />
                      ) : (
                        <Text style={styles.itemIconGlyphLg}>{getItemArtworkGlyph(item)}</Text>
                      )}
                      {item.tier ? (
                        <View style={[styles.itemTierBadgeCorner, { backgroundColor: rarityCol }]}>
                          <Text style={styles.itemTierBadgeText}>T{item.tier}</Text>
                        </View>
                      ) : null}
                      {item.quantity > 1 && (
                        <View style={styles.iconBoxQtyBadge}>
                          <Text style={styles.iconBoxQtyText}>x{item.quantity}</Text>
                        </View>
                      )}
                    </View>

                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={[styles.tooltipItemName, { color: rarityCol }]} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <View style={styles.tooltipMetaRow}>
                        <View style={[styles.tooltipBadgePill, { borderColor: rarityCol }]}>
                          <Text style={[styles.tooltipBadgePillText, { color: rarityCol }]}>
                            {item.rarity}
                          </Text>
                        </View>
                        {item.tier ? (
                          <View style={[styles.tooltipTierPill, { borderColor: rarityCol }]}>
                            <Text style={[styles.tooltipTierPillText, { color: rarityCol }]}>
                              Tier {ITEM_TIER_CONFIG[item.tier]?.romanNumeral ?? item.tier}
                            </Text>
                          </View>
                        ) : null}
                        <View style={styles.tooltipTypePill}>
                          <Text style={styles.tooltipTypePillText}>{item.itemType}</Text>
                        </View>
                        {item.weaponHandedness === 'TWO_HANDED' && (
                          <View style={styles.tooltip2HPill}>
                            <Text style={styles.tooltip2HPillText}>2-HANDED</Text>
                          </View>
                        )}
                        {isCurrentlyEquipped && (
                          <View style={styles.tooltipEquippedPill}>
                            <Text style={styles.tooltipEquippedPillText}>EQUIPPED</Text>
                          </View>
                        )}
                      </View>
                    </View>

                    <Pressable
                      style={styles.tooltipCloseBtn}
                      onPress={() => setInspectedItem(null)}
                      accessibilityRole="button"
                      accessibilityLabel="Close item inspection"
                    >
                      <Text style={styles.tooltipCloseBtnText}>✕</Text>
                    </Pressable>
                  </View>

                  {/* Stat Requirements Bar */}
                  {equippable && (item.requiredStrength || item.requiredEndurance || item.requiredAgility) ? (
                    <View style={styles.tooltipReqRow}>
                      <Text style={styles.tooltipReqLabel}>Requirements:</Text>
                      {item.requiredStrength ? (
                        <Text
                          style={
                            reqCheck.unmetStats.includes('STRENGTH')
                              ? styles.tooltipReqUnmet
                              : styles.tooltipReqMet
                          }
                        >
                          STR {item.requiredStrength}{' '}
                          {reqCheck.unmetStats.includes('STRENGTH') ? '✗' : '✓'}
                        </Text>
                      ) : null}
                      {item.requiredEndurance ? (
                        <Text
                          style={
                            reqCheck.unmetStats.includes('ENDURANCE')
                              ? styles.tooltipReqUnmet
                              : styles.tooltipReqMet
                          }
                        >
                          END {item.requiredEndurance}{' '}
                          {reqCheck.unmetStats.includes('ENDURANCE') ? '✗' : '✓'}
                        </Text>
                      ) : null}
                      {item.requiredAgility ? (
                        <Text
                          style={
                            reqCheck.unmetStats.includes('AGILITY')
                              ? styles.tooltipReqUnmet
                              : styles.tooltipReqMet
                          }
                        >
                          AGI {item.requiredAgility}{' '}
                          {reqCheck.unmetStats.includes('AGILITY') ? '✗' : '✓'}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}

                  {/* Base Armament Stats Box */}
                  {item.baseStatsSummary ? (
                    <View style={styles.tooltipBaseArmamentBox}>
                      <Text style={styles.tooltipBaseArmamentTitle}>
                        ⚔️ Base Armament:
                      </Text>
                      <Text style={styles.tooltipBaseArmamentText}>
                        {item.baseStatsSummary}
                      </Text>
                    </View>
                  ) : null}

                  {/* Prefix & Suffix Affixes */}
                  {(item.prefixSummary || item.suffixSummary) ? (
                    <View style={styles.tooltipAffixBox}>
                      {item.prefixSummary ? (
                        <View style={styles.tooltipAffixLine}>
                          <Text style={styles.tooltipPrefixLabel}>
                            🔹 Prefix ({item.prefixLabel ?? 'Prefix'}):
                          </Text>
                          <Text style={styles.tooltipPrefixSummary}>
                            {item.prefixSummary}
                          </Text>
                        </View>
                      ) : null}
                      {item.suffixSummary ? (
                        <View style={styles.tooltipAffixLine}>
                          <Text style={styles.tooltipSuffixLabel}>
                            🔸 Suffix ({item.suffixLabel ?? 'Suffix'}):
                          </Text>
                          <Text style={styles.tooltipSuffixSummary}>
                            {item.suffixSummary}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  ) : null}

                  {/* Tier 5 Mythic Unique Passive Box */}
                  {item.tier === 5 && item.uniquePassive ? (
                    <View style={styles.tooltipUniquePassiveBox}>
                      <Text style={styles.tooltipUniquePassiveHeader}>
                        👑 Unique Passive — {item.uniquePassive.passiveName}
                      </Text>
                      <Text style={styles.tooltipUniquePassiveDesc}>
                        {item.uniquePassive.passiveDescription}
                      </Text>
                      {item.uniquePassive.uniqueLore ? (
                        <Text style={styles.tooltipUniqueLore}>
                          "{item.uniquePassive.uniqueLore}"
                        </Text>
                      ) : null}
                    </View>
                  ) : null}

                  {/* Stat Bonuses Pills (Fallback or Consolidated) */}
                  {item.statBonuses && !item.baseStatsSummary && (
                    <View style={styles.tooltipBonusesWrap}>
                      {item.statBonuses.meleePower ? (
                        <View style={styles.statBonusPill}>
                          <Text style={styles.statBonusPillText}>
                            ⚔️ +{item.statBonuses.meleePower} Melee Power
                          </Text>
                        </View>
                      ) : null}
                      {item.statBonuses.armorRating ? (
                        <View style={styles.statBonusPill}>
                          <Text style={styles.statBonusPillText}>
                            🛡️ +{item.statBonuses.armorRating} Armor
                          </Text>
                        </View>
                      ) : null}
                      {item.statBonuses.maxHp ? (
                        <View style={styles.statBonusPill}>
                          <Text style={styles.statBonusPillText}>
                            ❤️ +{item.statBonuses.maxHp} Max HP
                          </Text>
                        </View>
                      ) : null}
                      {item.statBonuses.maxStamina ? (
                        <View style={styles.statBonusPill}>
                          <Text style={styles.statBonusPillText}>
                            ⚡ +{item.statBonuses.maxStamina} Max Stamina
                          </Text>
                        </View>
                      ) : null}
                      {item.statBonuses.critChance ? (
                        <View style={styles.statBonusPill}>
                          <Text style={styles.statBonusPillText}>
                            🎯 +{Math.round(item.statBonuses.critChance * 100)}% Crit Chance
                          </Text>
                        </View>
                      ) : null}
                      {item.statBonuses.dodgeRating ? (
                        <View style={styles.statBonusPill}>
                          <Text style={styles.statBonusPillText}>
                            💨 +{Math.round(item.statBonuses.dodgeRating * 100)}% Dodge
                          </Text>
                        </View>
                      ) : null}
                      {item.statBonuses.attackSpeedPct ? (
                        <View style={styles.statBonusPill}>
                          <Text style={styles.statBonusPillText}>
                            ⚡ +{Math.round(item.statBonuses.attackSpeedPct * 100)}% Atk Speed
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  )}

                  {/* Lore / Description */}
                  {item.description && !item.uniquePassive?.uniqueLore ? (
                    <Text style={styles.tooltipDescription}>{item.description}</Text>
                  ) : null}

                  {/* Compare Delta Section if active */}
                  {showCompare && equippedItem && (
                    <View style={styles.tooltipCompareBox}>
                      <Text style={styles.tooltipCompareHeader}>
                        Comparison vs Equipped ({equippedItem.name}):
                      </Text>
                      <View style={styles.compareDeltaRow}>
                        <Text style={styles.compareDeltaText}>
                          ATK: {((item.statBonuses?.meleePower ?? 0) - (equippedItem.statBonuses?.meleePower ?? 0)) >= 0 ? '+' : ''}
                          {(item.statBonuses?.meleePower ?? 0) - (equippedItem.statBonuses?.meleePower ?? 0)} •{' '}
                          ARM: {((item.statBonuses?.armorRating ?? 0) - (equippedItem.statBonuses?.armorRating ?? 0)) >= 0 ? '+' : ''}
                          {(item.statBonuses?.armorRating ?? 0) - (equippedItem.statBonuses?.armorRating ?? 0)} •{' '}
                          HP: {((item.statBonuses?.maxHp ?? 0) - (equippedItem.statBonuses?.maxHp ?? 0)) >= 0 ? '+' : ''}
                          {(item.statBonuses?.maxHp ?? 0) - (equippedItem.statBonuses?.maxHp ?? 0)}
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* Action Buttons */}
                  <View style={styles.tooltipActionsRow}>
                    {isCurrentlyEquipped ? (
                      <Pressable
                        style={[
                          styles.tooltipActionBtn,
                          styles.tooltipUnequipBtn,
                          !progressionUnlocked && styles.btnDisabled,
                        ]}
                        onPress={() => {
                          if (!progressionUnlocked) {
                            setGearFeedback({
                              tone: 'error',
                              text: 'Finish your workout session before unequipping gear.',
                            });
                            return;
                          }
                          const slot = Object.keys(equipmentLoadout).find(
                            (k) => equipmentLoadout[k as EquipmentSlot] === item.slug
                          ) as EquipmentSlot | undefined;
                          if (slot) {
                            unequipSlot(slot);
                            setGearFeedback({
                              tone: 'info',
                              text: `Unequipped ${item.name}.`,
                            });
                            setInspectedItem(null);
                          }
                        }}
                      >
                        <Text style={styles.tooltipUnequipBtnText}>Unequip Item</Text>
                      </Pressable>
                    ) : equippable ? (
                      <>
                        {equippedItem && (
                          <Pressable
                            style={[styles.tooltipActionBtn, styles.tooltipCompareBtn]}
                            onPress={() => setShowCompare((p) => !p)}
                          >
                            <Text style={styles.tooltipCompareBtnText}>
                              {showCompare ? 'Hide Compare' : '⚖️ Compare'}
                            </Text>
                          </Pressable>
                        )}
                        <Pressable
                          style={[
                            styles.tooltipActionBtn,
                            styles.tooltipEquipBtn,
                            (!reqCheck.valid || !progressionUnlocked) &&
                              styles.bagEquipBtnStatLocked,
                          ]}
                          onPress={() => {
                            handleBagEquipToggle(item);
                            setInspectedItem(null);
                          }}
                        >
                          <Text style={styles.tooltipEquipBtnText}>
                            {!progressionUnlocked
                              ? '🔒 Workout Active'
                              : !reqCheck.valid
                              ? '🔒 Stat Gate'
                              : '⚔️ Equip Item'}
                          </Text>
                        </Pressable>
                      </>
                    ) : item.itemType === 'CONSUMABLE' ? (
                      <Pressable
                        style={[styles.tooltipActionBtn, styles.tooltipConsumableBtn]}
                        onPress={() => {
                          setGearFeedback({
                            tone: 'info',
                            text: `Consumed ${item.name}! Vitality replenished.`,
                          });
                          setInspectedItem(null);
                        }}
                      >
                        <Text style={styles.tooltipConsumableBtnText}>🧪 Use Consumable</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              );
            })()}
        </View>
      </Animated.View>
    )}

      {/* Interactive Slot Inspector Modal */}
      <Modal
        visible={selectedSlot !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedSlot(null)}
      >
        <Pressable
          style={styles.inspectorModalBackdrop}
          onPress={() => setSelectedSlot(null)}
        >
          <Pressable
            style={styles.inspectorModalCard}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.inspectorModalHeader}>
              <View style={styles.inspectorTitleRow}>
                <Text style={styles.inspectorSlotIcon}>
                  {selectedSlot ? SLOT_ICONS[selectedSlot] : '🛡️'}
                </Text>
                <Text style={styles.inspectorTitle}>
                  {selectedSlot
                    ? EQUIPMENT_SLOTS.find((s) => s.slot === selectedSlot)?.label ??
                      selectedSlot
                    : ''}{' '}
                  Slot Inspector
                </Text>
              </View>
              <Pressable
                style={styles.inspectorCloseBtn}
                onPress={() => setSelectedSlot(null)}
              >
                <Text style={styles.inspectorCloseBtnText}>✕</Text>
              </Pressable>
            </View>

            <ScrollView
              style={styles.inspectorModalScroll}
              showsVerticalScrollIndicator={false}
            >
              {/* Currently Equipped Item */}
              <Text style={styles.inspectorSubheading}>Currently Equipped:</Text>
              {selectedSlotItem && selectedSlot ? (
                <View
                  style={[
                    styles.inspectorEquippedBox,
                    {
                      borderColor:
                        RARITY_COLORS[selectedSlotItem.rarity] ?? CRIMSON_ONI.borderGold,
                    },
                  ]}
                >
                  <View style={styles.inspectorEquippedTop}>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.inspectorItemName,
                          {
                            color:
                              RARITY_COLORS[selectedSlotItem.rarity] ??
                              CRIMSON_ONI.ghostWhite,
                          },
                        ]}
                      >
                        {selectedSlotItem.name}
                      </Text>
                      <Text style={styles.inspectorItemRarity}>
                        [{selectedSlotItem.rarity}]
                        {selectedSlotItem.weaponHandedness === 'TWO_HANDED'
                          ? ' • 2H Weapon'
                          : ''}
                      </Text>
                    </View>
                    <Pressable
                      style={[
                        styles.inspectorUnequipBtn,
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
                        setGearFeedback({
                          tone: 'info',
                          text: `Unequipped ${selectedSlotItem.name}.`,
                        });
                      }}
                    >
                      <Text style={styles.inspectorUnequipBtnText}>Unequip</Text>
                    </Pressable>
                  </View>

                  <Text style={styles.inspectorItemStats}>
                    {formatEquipmentBonuses(selectedSlotItem.statBonuses)}
                  </Text>
                  <Text style={styles.inspectorItemReq}>
                    Req: STR {selectedSlotItem.requiredStrength ?? 0} • END{' '}
                    {selectedSlotItem.requiredEndurance ?? 0} • AGI{' '}
                    {selectedSlotItem.requiredAgility ?? 0}
                  </Text>
                </View>
              ) : (
                <View style={styles.inspectorEmptyBox}>
                  <Text style={styles.inspectorEmptyNote}>
                    No gear currently equipped in this slot.
                    {selectedSlot === 'offHand' &&
                    equipmentLoadout.mainHand &&
                    inventoryBySlug.get(equipmentLoadout.mainHand)?.weaponHandedness ===
                      'TWO_HANDED'
                      ? ' (Main Hand holds a 2-Handed weapon; equipping an Off-Hand item will unequip it.)'
                      : ''}
                  </Text>
                </View>
              )}

              {/* Compatible Swap Items from Bag */}
              <Text style={styles.inspectorSubheading}>
                Compatible Gear in Satchel ({compatibleSwapItems.length}):
              </Text>
              {compatibleSwapItems.length === 0 ? (
                <Text style={styles.inspectorEmptyCandidatesNote}>
                  No compatible unbound items in your satchel for this slot. Complete workouts or explore dungeons to obtain loot!
                </Text>
              ) : (
                compatibleSwapItems.map((candidate) => {
                  if (!selectedSlot) return null;
                  const check = validateEquipmentRequirements(
                    candidate,
                    coreStatsBlock,
                    selectedSlot
                  );
                  return (
                    <View
                      key={candidate.slug}
                      style={[
                        styles.inspectorSwapRow,
                        {
                          borderLeftColor:
                            RARITY_COLORS[candidate.rarity] ?? CRIMSON_ONI.ghostWhite,
                        },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.inspectorSwapName,
                            {
                              color:
                                RARITY_COLORS[candidate.rarity] ??
                                CRIMSON_ONI.ghostWhite,
                            },
                          ]}
                        >
                          {candidate.name}
                        </Text>
                        <Text style={styles.inspectorSwapMeta}>
                          [{candidate.rarity}] •{' '}
                          {formatEquipmentBonuses(candidate.statBonuses)}
                        </Text>
                        {!check.valid && check.error && (
                          <Text style={styles.unmetReqText}>🔒 {check.error}</Text>
                        )}
                      </View>

                      <Pressable
                        style={[
                          styles.inspectorSwapActionBtn,
                          (!check.valid || !progressionUnlocked) &&
                            styles.swapActionBtnLocked,
                        ]}
                        onPress={() =>
                          handleEquipToSelectedSlot(candidate.slug, selectedSlot)
                        }
                      >
                        <Text style={styles.inspectorSwapActionText}>
                          {selectedSlotItem ? 'Swap' : 'Equip'}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

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
                  <View style={styles.receiptChestContainer}>
                    <SvgXml
                      xml={LOOT_CHEST_SVGS.EPIC}
                      width={96}
                      height={80}
                    />
                  </View>
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
                        (consolidatedSpoils.totalXpGained as Record<string, number>)[
                          meta.key
                        ] ?? 0;
                      const lu = (
                        consolidatedSpoils.statLevelUps as Record<string, any>
                      )[meta.key];
                      if (xp === 0 && (!lu || lu.levelsGained === 0)) return null;
                      return (
                        <View key={meta.key} style={styles.receiptStatLine}>
                          <View style={styles.receiptStatLeft}>
                            {STAT_GLYPH_SVGS[
                              meta.abbrev as keyof typeof STAT_GLYPH_SVGS
                            ] ? (
                              <SvgXml
                                xml={
                                  STAT_GLYPH_SVGS[
                                    meta.abbrev as keyof typeof STAT_GLYPH_SVGS
                                  ]
                                }
                                width={22}
                                height={22}
                              />
                            ) : null}
                            <Text
                              style={[styles.receiptStatName, { color: meta.color }]}
                            >
                              {meta.name} ({meta.abbrev})
                            </Text>
                          </View>
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
                        {consolidatedSpoils.prCritDrops.map((drop) => {
                          const iconSrc = getItemIconSource(drop.itemSlug);
                          return (
                            <View key={`crit_${drop.itemSlug}`} style={styles.receiptDropItemRow}>
                              {iconSrc && (
                                <ExpoImage
                                  source={iconSrc as any}
                                  style={styles.receiptDropIcon36}
                                  contentFit="cover"
                                />
                              )}
                              <Text
                                style={[
                                  styles.receiptDropLine,
                                  {
                                    color:
                                      RARITY_COLORS[drop.rarity] ??
                                      CRIMSON_ONI.agedGoldBright,
                                    flex: 1,
                                  },
                                ]}
                              >
                                ★ Guaranteed PR Crit Loot: {drop.quantity}x {drop.itemName}{' '}
                                [{drop.rarity}]
                              </Text>
                            </View>
                          );
                        })}
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
                      consolidatedSpoils.chestDrops.map((drop) => {
                        const iconSrc = getItemIconSource(drop.itemSlug);
                        return (
                          <View key={`chest_${drop.itemSlug}`} style={styles.receiptDropItemRow}>
                            {iconSrc && (
                              <ExpoImage
                                source={iconSrc as any}
                                style={styles.receiptDropIcon36}
                                contentFit="cover"
                              />
                            )}
                            <Text
                              style={[
                                styles.receiptDropLine,
                                {
                                  color:
                                    RARITY_COLORS[drop.rarity] ?? CRIMSON_ONI.ghostWhite,
                                  flex: 1,
                                },
                              ]}
                            >
                              • {drop.quantity}x {drop.itemName} [{drop.rarity}]
                            </Text>
                          </View>
                        );
                      })
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
                        • No active 24h Dungeon expedition window was open during
                        training.
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
        characterId={activeCharacterId}
        userId={currentUser?.id ?? null}
      />

      <DeveloperTriageModal
        visible={devTriageModalVisible}
        onClose={() => setDevTriageModalVisible(false)}
      />

      <CharacterManagerModal
        visible={charManagerModalVisible}
        onClose={() => {
          setCharManagerModalVisible(false);
          setCharManagerInitialCustomizeId(null);
        }}
        initialCustomizeCharacterId={charManagerInitialCustomizeId}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    padding: 14,
    paddingBottom: 40,
  },
  spoilsChestCard: {
    backgroundColor: '#2B2214',
    borderWidth: 1.5,
    borderColor: CRIMSON_ONI.agedGoldBright,
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
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
  utilityHeaderCard: {
    backgroundColor: CRIMSON_ONI.charcoalCard,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.borderGold,
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  utilityHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  utilityTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  utilityIdentityCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flex: 1,
    minWidth: 0,
  },
  utilityHeroName: {
    color: CRIMSON_ONI.ghostWhite,
    fontSize: 15,
    fontWeight: '900',
    flex: 1,
  },
  utilityBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(51, 65, 85, 0.45)',
  },
  heroRosterPill: {
    backgroundColor: 'rgba(245, 184, 65, 0.15)',
    borderWidth: 1,
    borderColor: CRIMSON_ONI.agedGold,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  heroRosterPillText: {
    color: CRIMSON_ONI.agedGoldBright,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  utilityActionCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  utilityBtn: {
    backgroundColor: '#26242E',
    borderWidth: 1,
    borderColor: '#4B5563',
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  utilityBtnActive: {
    backgroundColor: '#37181F',
    borderColor: '#F43F5E',
  },
  utilityBtnGold: {
    backgroundColor: '#352A15',
    borderColor: '#C69A45',
  },
  utilityBtnDisabled: {
    opacity: 0.6,
  },
  utilityBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#E5E7EB',
  },
  utilityBtnTextActive: {
    color: '#FB7185',
  },
  utilityBtnTextGold: {
    color: '#DFB660',
  },
  versionBadgeInline: {
    backgroundColor: '#0F172A',
    borderRadius: 4,
    paddingHorizontal: 3,
    paddingVertical: 1,
  },
  versionBadgeInlineText: {
    fontSize: 8,
    fontWeight: '700',
    color: '#94A3B8',
  },
  fatiguePillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  fatiguePillText: {
    fontSize: 11,
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
  },
  sectionHint: {
    color: CRIMSON_ONI.ashGray,
    fontSize: 11,
    marginTop: 2,
  },
  sectionHeaderInline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 10,
  },
  sectionHeaderRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  appearanceHeaderBtn: {
    backgroundColor: 'rgba(28, 27, 34, 0.92)',
    borderWidth: 1,
    borderColor: CRIMSON_ONI.agedGold,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  appearanceHeaderBtnText: {
    color: CRIMSON_ONI.agedGoldBright,
    fontSize: 11,
    fontWeight: '800',
  },
  itemPowerHeaderBadge: {
    backgroundColor: CRIMSON_ONI.agedGoldDim,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.agedGold,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  itemPowerHeaderBadgeText: {
    color: CRIMSON_ONI.agedGoldBright,
    fontSize: 12,
    fontWeight: '900',
  },
  radarCard: {
    backgroundColor: CRIMSON_ONI.charcoalCard,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.borderGold,
    borderRadius: 14,
    padding: 10,
    marginBottom: 12,
  },
  radarImageContainer: {
    width: '100%',
    height: 210,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statHoneycombGrid: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  hexRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  hexMidRow: {
    marginTop: -16,
  },
  hexBotRow: {
    marginTop: -16,
  },
  hexPressable: {
    width: 96,
    height: 108,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  hexSvg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  hexContent: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  hexStatCode: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginTop: 1,
  },
  hexLevelText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    marginTop: 1,
  },
  hexTalentBadge: {
    backgroundColor: '#D97706',
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginTop: 2,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  hexTalentBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
  },
  hexXpPct: {
    color: '#9CA3AF',
    fontSize: 9.5,
    fontWeight: '600',
    marginTop: 1,
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
    paddingVertical: 7,
    paddingHorizontal: 8,
  },
  derivedCellLabel: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  derivedCellValue: {
    color: CRIMSON_ONI.ghostWhite,
    fontSize: 12,
    fontWeight: '900',
    marginTop: 2,
  },
  derivedCellSub: {
    color: COLORS.textSecondary,
    fontSize: 9,
    fontWeight: '600',
  },
  feedbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
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
    fontSize: 11,
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
  /* Paperdoll Layout */
  paperdollLayoutContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    height: 336,
    gap: 10,
  },
  paperdollSideColumn: {
    width: 58,
    height: 336,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paperdollSlotTile: {
    width: 58,
    height: 58,
    backgroundColor: CRIMSON_ONI.charcoalCard,
    borderWidth: 1.5,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  paperdollItemImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  paperdollSlotTileSelected: {
    backgroundColor: CRIMSON_ONI.charcoalElevated,
    borderWidth: 2,
    borderColor: CRIMSON_ONI.agedGoldBright,
    shadowColor: CRIMSON_ONI.agedGoldBright,
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  paperdollSlotIcon: {
    fontSize: 22,
    textAlign: 'center',
  },
  paperdollSlotLabel: {
    position: 'absolute',
    bottom: 2,
    alignSelf: 'center',
    color: CRIMSON_ONI.ashGray,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  paperdoll2HBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: CRIMSON_ONI.agedGold,
    borderRadius: 3,
    paddingHorizontal: 3,
    paddingVertical: 1,
    zIndex: 2,
  },
  paperdoll2HBadgeText: {
    color: CRIMSON_ONI.charcoalDeep,
    fontSize: 7,
    fontWeight: '900',
  },
  paperdollTierBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
    zIndex: 2,
  },
  paperdollTierBadgeText: {
    color: '#FFFFFF',
    fontSize: 7.5,
    fontWeight: '900',
  },
  paperdollRarityDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 6,
    height: 6,
    borderRadius: 3,
    zIndex: 2,
  },
  paperdollCenterFrame: {
    height: 330,
    aspectRatio: 2 / 3,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
  },
  paperdollSilhouetteOverlay: {
    position: 'absolute',
    top: 55,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paperdollCustomizePill: {
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    backgroundColor: 'rgba(28, 27, 34, 0.92)',
    borderWidth: 1,
    borderColor: CRIMSON_ONI.agedGold,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    zIndex: 6,
  },
  paperdollCustomizePillText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: CRIMSON_ONI.agedGoldBright,
    letterSpacing: 0.5,
  },
  paperdollCenterBaseBadge: {
    position: 'absolute',
    bottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(10, 10, 15, 0.88)',
    borderWidth: 1,
    borderColor: CRIMSON_ONI.agedGold,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    zIndex: 6,
  },
  paperdollCenterBaseText: {
    color: CRIMSON_ONI.agedGoldBright,
    fontSize: 10,
    fontWeight: '900',
  },
  /* Collapsible Satchel Drawer */
  satchelToggleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: CRIMSON_ONI.charcoalCard,
    borderWidth: 1.5,
    borderColor: CRIMSON_ONI.borderGold,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  satchelToggleTitleCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  satchelIcon: {
    fontSize: 22,
  },
  satchelHeading: {
    color: CRIMSON_ONI.agedGoldBright,
    fontSize: 13,
    fontWeight: '900',
  },
  satchelSubtitle: {
    color: CRIMSON_ONI.ashGray,
    fontSize: 10,
    marginTop: 1,
  },
  satchelChevronPill: {
    backgroundColor: CRIMSON_ONI.agedGoldDim,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.agedGold,
  },
  satchelChevronText: {
    color: CRIMSON_ONI.agedGoldBright,
    fontSize: 10,
    fontWeight: '800',
  },
  satchelDrawerBody: {
    marginBottom: 14,
  },
  filterTabsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  filterPill: {
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  filterPillActive: {
    backgroundColor: CRIMSON_ONI.agedGoldDim,
    borderColor: CRIMSON_ONI.agedGold,
  },
  filterPillText: {
    color: COLORS.textSecondary,
    fontSize: 11,
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
    padding: 8,
    gap: 7,
  },
  emptyBagText: {
    color: COLORS.textMuted,
    fontSize: 11,
    textAlign: 'center',
    paddingVertical: 14,
  },
  bagItemRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgDeep,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 6,
    paddingHorizontal: 8,
    overflow: 'hidden',
    gap: 8,
  },
  bagItemRowInspecting: {
    borderColor: CRIMSON_ONI.agedGoldBright,
    backgroundColor: '#1E1B24',
  },
  bagItemCenterInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  satchelQtyBadge: {
    backgroundColor: COLORS.bgElevated,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  satchelQtyText: {
    color: CRIMSON_ONI.ghostWhite,
    fontSize: 10,
    fontWeight: '800',
  },
  satchelInspectingPill: {
    backgroundColor: 'rgba(217, 180, 74, 0.22)',
    borderWidth: 1,
    borderColor: CRIMSON_ONI.agedGold,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  satchelInspectingText: {
    color: CRIMSON_ONI.agedGoldBright,
    fontSize: 10,
    fontWeight: '800',
  },
  satchelGatePill: {
    backgroundColor: 'rgba(239, 83, 80, 0.18)',
    borderWidth: 1,
    borderColor: '#EF5350',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  satchelGateText: {
    color: '#EF5350',
    fontSize: 9.5,
    fontWeight: '800',
  },
  satchelChevron: {
    color: COLORS.textMuted,
    fontSize: 18,
    fontWeight: '700',
    paddingHorizontal: 4,
  },
  rarityStripe: {
    width: 3.5,
    alignSelf: 'stretch',
  },
  bagItemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bagItemName: {
    fontSize: 12,
    fontWeight: '800',
    flexShrink: 1,
  },
  qtyBadge: {
    backgroundColor: COLORS.bgElevated,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  qtyBadgeText: {
    color: CRIMSON_ONI.ghostWhite,
    fontSize: 9,
    fontWeight: '800',
  },
  bagItemMeta: {
    color: COLORS.textMuted,
    fontSize: 9,
    fontWeight: '700',
    marginTop: 2,
  },
  bagItemBonuses: {
    color: COLORS.textSecondary,
    fontSize: 10,
    marginTop: 2,
  },
  bagReqRow: {
    color: COLORS.textMuted,
    fontSize: 9,
    marginTop: 2,
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
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  bagEquipBtnStatLocked: {
    backgroundColor: COLORS.strengthDim,
    borderWidth: 1,
    borderColor: COLORS.strength,
  },
  bagEquipBtnText: {
    color: CRIMSON_ONI.charcoalDeep,
    fontSize: 10,
    fontWeight: '900',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  /* Satchel Sort Bar */
  sortBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  sortBarLabel: {
    color: CRIMSON_ONI.ashGray,
    fontSize: 11,
    fontWeight: '700',
  },
  sortChip: {
    backgroundColor: CRIMSON_ONI.charcoalCard,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  sortChipActive: {
    backgroundColor: CRIMSON_ONI.agedGoldDim,
    borderColor: CRIMSON_ONI.agedGold,
  },
  sortChipText: {
    color: CRIMSON_ONI.ashGray,
    fontSize: 10,
    fontWeight: '700',
  },
  sortChipTextActive: {
    color: CRIMSON_ONI.agedGoldBright,
    fontWeight: '900',
  },
  /* 44x44, 48x48, & 56x56 Framed Icon Boxes */
  itemIconBox44: {
    width: 44,
    height: 44,
    borderRadius: 8,
    borderWidth: 1.5,
    backgroundColor: '#121722',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginLeft: 4,
    overflow: 'hidden',
  },
  itemIconImage44: {
    width: '100%',
    height: '100%',
    borderRadius: 6,
  },
  itemIconGlyph: {
    fontSize: 20,
    textAlign: 'center',
  },
  itemIconBox48: {
    width: 48,
    height: 48,
    borderRadius: 10,
    borderWidth: 2,
    backgroundColor: '#121722',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  itemIconBox56: {
    width: 56,
    height: 56,
    borderRadius: 10,
    borderWidth: 2,
    backgroundColor: '#121722',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  itemIconImage56: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  itemIconGlyphLg: {
    fontSize: 24,
    textAlign: 'center',
  },
  iconBoxQtyBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderRadius: 4,
    paddingHorizontal: 3,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.borderGold,
  },
  iconBoxQtyText: {
    color: CRIMSON_ONI.ghostWhite,
    fontSize: 8,
    fontWeight: '900',
  },
  itemTierBadgeCorner: {
    position: 'absolute',
    top: -2,
    right: -2,
    borderRadius: 3,
    paddingHorizontal: 3,
    paddingVertical: 0.5,
    zIndex: 2,
  },
  itemTierBadgeText: {
    color: '#FFFFFF',
    fontSize: 7.5,
    fontWeight: '900',
  },
  satchelAffixPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
    marginBottom: 2,
    flexWrap: 'wrap',
  },
  satchelAffixPillUnique: {
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
    borderColor: '#EF4444',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  satchelAffixPillUniqueText: {
    color: '#F87171',
    fontSize: 8.5,
    fontWeight: '900',
  },
  satchelAffixPillPrefix: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderColor: 'rgba(56, 189, 248, 0.4)',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  satchelAffixPillPrefixText: {
    color: '#38BDF8',
    fontSize: 8.5,
    fontWeight: '700',
  },
  satchelAffixPillSuffix: {
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    borderColor: 'rgba(251, 191, 36, 0.4)',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  satchelAffixPillSuffixText: {
    color: '#FBBF24',
    fontSize: 8.5,
    fontWeight: '700',
  },
  /* Pinned Bottom Item Tooltip */
  pinnedTooltipOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
    elevation: 50,
  },
  bottomTooltipCard: {
    backgroundColor: '#12151D',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1.5,
    borderColor: CRIMSON_ONI.borderGold,
    padding: 16,
    paddingBottom: 32,
    shadowColor: '#000000',
    shadowOpacity: 0.6,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
  },
  tooltipInner: {
    gap: 12,
  },
  tooltipHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tooltipItemName: {
    fontSize: 15,
    fontWeight: '900',
  },
  tooltipMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  tooltipBadgePill: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  tooltipBadgePillText: {
    fontSize: 9.5,
    fontWeight: '900',
  },
  tooltipTierPill: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  tooltipTierPillText: {
    fontSize: 9.5,
    fontWeight: '900',
  },
  tooltipTypePill: {
    backgroundColor: CRIMSON_ONI.charcoalElevated,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tooltipTypePillText: {
    color: CRIMSON_ONI.ashGray,
    fontSize: 9.5,
    fontWeight: '700',
  },
  tooltip2HPill: {
    backgroundColor: CRIMSON_ONI.agedGoldDim,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tooltip2HPillText: {
    color: CRIMSON_ONI.agedGoldBright,
    fontSize: 9.5,
    fontWeight: '900',
  },
  tooltipEquippedPill: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderColor: '#10B981',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tooltipEquippedPillText: {
    color: '#10B981',
    fontSize: 9.5,
    fontWeight: '900',
  },
  tooltipCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: CRIMSON_ONI.charcoalElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tooltipCloseBtnText: {
    color: CRIMSON_ONI.ashGray,
    fontSize: 12,
    fontWeight: '900',
  },
  tooltipReqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: CRIMSON_ONI.charcoalCard,
    borderRadius: 8,
    padding: 8,
  },
  tooltipReqLabel: {
    color: CRIMSON_ONI.ashGray,
    fontSize: 10,
    fontWeight: '700',
  },
  tooltipReqMet: {
    color: '#10B981',
    fontSize: 10,
    fontWeight: '800',
  },
  tooltipReqUnmet: {
    color: COLORS.danger,
    fontSize: 10,
    fontWeight: '900',
  },
  tooltipBaseArmamentBox: {
    backgroundColor: 'rgba(30, 36, 49, 0.7)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 10,
    gap: 4,
  },
  tooltipBaseArmamentTitle: {
    color: CRIMSON_ONI.agedGoldBright,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  tooltipBaseArmamentText: {
    color: CRIMSON_ONI.ghostWhite,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
  },
  tooltipAffixBox: {
    backgroundColor: 'rgba(18, 22, 32, 0.85)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
    padding: 10,
    gap: 6,
  },
  tooltipAffixLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  tooltipPrefixLabel: {
    color: '#38BDF8',
    fontSize: 10.5,
    fontWeight: '800',
  },
  tooltipPrefixSummary: {
    color: '#BAE6FD',
    fontSize: 10.5,
    fontWeight: '600',
  },
  tooltipSuffixLabel: {
    color: '#FBBF24',
    fontSize: 10.5,
    fontWeight: '800',
  },
  tooltipSuffixSummary: {
    color: '#FDE68A',
    fontSize: 10.5,
    fontWeight: '600',
  },
  tooltipUniquePassiveBox: {
    backgroundColor: 'rgba(45, 12, 18, 0.85)',
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#DC2626',
    padding: 10,
    gap: 4,
  },
  tooltipUniquePassiveHeader: {
    color: '#F87171',
    fontSize: 11.5,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  tooltipUniquePassiveDesc: {
    color: '#FECACA',
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 16,
  },
  tooltipUniqueLore: {
    color: CRIMSON_ONI.agedGoldBright,
    fontSize: 10,
    fontStyle: 'italic',
    marginTop: 4,
    lineHeight: 14,
  },
  tooltipBonusesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  statBonusPill: {
    backgroundColor: '#1A1E29',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2D3548',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statBonusPillText: {
    color: CRIMSON_ONI.ghostWhite,
    fontSize: 11,
    fontWeight: '700',
  },
  tooltipDescription: {
    color: CRIMSON_ONI.ashGray,
    fontSize: 11,
    lineHeight: 16,
    fontStyle: 'italic',
  },
  tooltipCompareBox: {
    backgroundColor: '#171B26',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A3348',
    padding: 10,
  },
  tooltipCompareHeader: {
    color: CRIMSON_ONI.agedGoldBright,
    fontSize: 10,
    fontWeight: '800',
    marginBottom: 4,
  },
  compareDeltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  compareDeltaText: {
    color: CRIMSON_ONI.ghostWhite,
    fontSize: 11,
    fontWeight: '800',
  },
  tooltipActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  tooltipActionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tooltipUnequipBtn: {
    backgroundColor: '#26242E',
    borderWidth: 1,
    borderColor: '#4B5563',
  },
  tooltipUnequipBtnText: {
    color: '#E5E7EB',
    fontSize: 12,
    fontWeight: '800',
  },
  tooltipEquipBtn: {
    backgroundColor: CRIMSON_ONI.agedGold,
  },
  tooltipEquipBtnText: {
    color: CRIMSON_ONI.charcoalDeep,
    fontSize: 12,
    fontWeight: '900',
  },
  tooltipCompareBtn: {
    backgroundColor: CRIMSON_ONI.charcoalElevated,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.borderGold,
  },
  tooltipCompareBtnText: {
    color: CRIMSON_ONI.agedGoldBright,
    fontSize: 11,
    fontWeight: '800',
  },
  tooltipConsumableBtn: {
    backgroundColor: '#059669',
  },
  tooltipConsumableBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  /* Inspector Modal */
  inspectorModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 5, 10, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  inspectorModalCard: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '84%',
    backgroundColor: CRIMSON_ONI.charcoalBase,
    borderWidth: 1.5,
    borderColor: CRIMSON_ONI.agedGoldBright,
    borderRadius: 14,
    overflow: 'hidden',
  },
  inspectorModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: CRIMSON_ONI.borderGold,
    backgroundColor: CRIMSON_ONI.charcoalElevated,
  },
  inspectorTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inspectorSlotIcon: {
    fontSize: 16,
  },
  inspectorTitle: {
    color: CRIMSON_ONI.ghostWhite,
    fontSize: 14,
    fontWeight: '900',
  },
  inspectorCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: CRIMSON_ONI.charcoalCard,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: CRIMSON_ONI.border,
  },
  inspectorCloseBtnText: {
    color: CRIMSON_ONI.ashGray,
    fontSize: 12,
    fontWeight: '900',
  },
  inspectorModalScroll: {
    padding: 14,
  },
  inspectorSubheading: {
    color: CRIMSON_ONI.agedGoldBright,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.4,
    marginBottom: 8,
    marginTop: 6,
  },
  inspectorEquippedBox: {
    backgroundColor: CRIMSON_ONI.charcoalCard,
    borderRadius: 10,
    borderWidth: 1.5,
    padding: 12,
    marginBottom: 12,
  },
  inspectorEquippedTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  inspectorItemName: {
    fontSize: 13,
    fontWeight: '900',
  },
  inspectorItemRarity: {
    color: CRIMSON_ONI.ashGray,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  inspectorItemStats: {
    color: CRIMSON_ONI.ghostWhite,
    fontSize: 11,
    marginTop: 2,
  },
  inspectorItemReq: {
    color: COLORS.textMuted,
    fontSize: 10,
    marginTop: 4,
  },
  inspectorUnequipBtn: {
    backgroundColor: CRIMSON_ONI.crimson,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.agedGold,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  inspectorUnequipBtnText: {
    color: CRIMSON_ONI.ghostWhite,
    fontSize: 10,
    fontWeight: '800',
  },
  inspectorEmptyBox: {
    backgroundColor: CRIMSON_ONI.charcoalCard,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: CRIMSON_ONI.border,
    padding: 12,
    marginBottom: 12,
  },
  inspectorEmptyNote: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontStyle: 'italic',
  },
  inspectorEmptyCandidatesNote: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontStyle: 'italic',
    paddingVertical: 8,
  },
  inspectorSwapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.bgDeep,
    borderRadius: 8,
    padding: 9,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderLeftWidth: 3.5,
    marginBottom: 6,
  },
  inspectorSwapName: {
    fontSize: 12,
    fontWeight: '800',
  },
  inspectorSwapMeta: {
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
  inspectorSwapActionBtn: {
    backgroundColor: CRIMSON_ONI.agedGold,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  swapActionBtnLocked: {
    backgroundColor: COLORS.bgElevated,
    opacity: 0.6,
  },
  inspectorSwapActionText: {
    color: CRIMSON_ONI.charcoalDeep,
    fontSize: 10,
    fontWeight: '900',
  },
  /* Spoils Receipt Modal */
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
  receiptChestContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
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
  receiptStatLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  receiptDropItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  receiptDropIcon36: {
    width: 36,
    height: 36,
    borderRadius: 6,
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#2A2F3D',
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
});

import React, { useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  ActiveTalentSkillDefinition,
  COMBAT_CONSUMABLE_BY_SLUG,
  COMBAT_CONSUMABLE_CATALOG,
  DEFAULT_TALENT_TREES,
  getSkillResourceCost,
} from '@goki/game-engine';
import { useGame } from '../../state/GameContext';
import { COLORS, RADII, RARITY_COLORS, SPACING, SURFACES, TYPOGRAPHY } from '../../theme';
import { RpgIcon } from '../icons/RpgIcon';
import {
  DisclosureBottomSheet,
  HairlineDivider,
  SlateSection,
} from '../ui';

export interface CombatLoadoutSelectorProps {
  compact?: boolean;
  defaultCollapsed?: boolean;
  onJumpToTalents?: () => void;
}

interface SkillCatalogItem {
  skill: ActiveTalentSkillDefinition;
  nodeId: string;
  nodeName: string;
  nodeDescription: string;
  treeName: string;
  governingStat: string;
  tier: number;
  unlocked: boolean;
  resourceType: 'STAMINA' | 'MANA';
  cost: number;
  cooldownTurns: number;
}

export const CombatLoadoutSelector: React.FC<CombatLoadoutSelectorProps> = ({
  compact = false,
  defaultCollapsed = false,
  onJumpToTalents,
}) => {
  const {
    activeSkillLoadout,
    beltLoadout,
    unlockedTalentRanks,
    aggregatedTalents,
    inventory,
    equipActiveSkillSlot,
    equipBeltConsumableSlot,
  } = useGame();

  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [pickingSkillSlot, setPickingSkillSlot] = useState<number | null>(null);
  const [pickingBeltSlot, setPickingBeltSlot] = useState<number | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const allActiveSkills = useMemo<SkillCatalogItem[]>(() => {
    const items: SkillCatalogItem[] = [];
    const costReduction = aggregatedTalents.staminaCostReductionPct ?? 0;
    for (const tree of DEFAULT_TALENT_TREES) {
      for (const node of tree.nodes) {
        if (!node.activeSkill) continue;
        const unlocked = (unlockedTalentRanks[node.id] ?? 0) > 0;
        const costInfo = getSkillResourceCost(
          node.activeSkill,
          costReduction,
          DEFAULT_TALENT_TREES
        );
        items.push({
          skill: node.activeSkill,
          nodeId: node.id,
          nodeName: node.name,
          nodeDescription: node.description,
          treeName: tree.name,
          governingStat: tree.governingStat,
          tier: node.tier,
          unlocked,
          resourceType: costInfo.resourceType,
          cost: costInfo.cost,
          cooldownTurns: costInfo.cooldownTurns,
        });
      }
    }
    return items;
  }, [unlockedTalentRanks, aggregatedTalents.staminaCostReductionPct]);

  const skillById = useMemo(() => {
    const map = new Map<string, SkillCatalogItem>();
    for (const entry of allActiveSkills) {
      map.set(entry.skill.skillId, entry);
    }
    return map;
  }, [allActiveSkills]);

  const ownedQuantityBySlug = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of inventory) {
      map[item.slug] = (map[item.slug] ?? 0) + item.quantity;
    }
    return map;
  }, [inventory]);

  const handleSelectSkill = async (skillId: string | null) => {
    if (pickingSkillSlot === null) return;
    const res = await equipActiveSkillSlot(pickingSkillSlot, skillId);
    if (!res.ok) {
      setStatusError(res.error ?? 'Could not equip skill.');
    } else {
      setStatusError(null);
      setPickingSkillSlot(null);
    }
  };

  const handleSelectBelt = async (itemSlug: string | null) => {
    if (pickingBeltSlot === null) return;
    const res = await equipBeltConsumableSlot(pickingBeltSlot, itemSlug);
    if (!res.ok) {
      setStatusError(res.error ?? 'Could not equip belt consumable.');
    } else {
      setStatusError(null);
      setPickingBeltSlot(null);
    }
  };

  const equippedSkillCount = activeSkillLoadout.length;
  const equippedBeltCount = beltLoadout.filter((s) => s !== null).length;

  return (
    <SlateSection
      level={1}
      eyebrow="TACTICAL COMBAT LOADOUT"
      title={compact ? 'Combat Loadout' : 'Turn-Based Skills & Belt'}
      subtitle={
        compact
          ? `${equippedSkillCount}/4 Active Skills • ${equippedBeltCount}/4 Belt Slots`
          : 'Configure up to 4 unlocked Talent Active Skills and 4 Belt Consumables for Guild Quests.'
      }
      rightAction={
        compact ? (
          <TouchableOpacity
            style={styles.collapseToggleBtn}
            onPress={() => setCollapsed((prev) => !prev)}
            activeOpacity={0.78}
            testID="combat-loadout-collapse-toggle"
          >
            <Text style={styles.collapseToggleText}>
              {collapsed ? 'Configure' : 'Hide'}
            </Text>
            <RpgIcon
              name={collapsed ? 'chevron-down' : 'chevron-up'}
              size={12}
              color={COLORS.gold}
            />
          </TouchableOpacity>
        ) : undefined
      }
      style={compact ? styles.compactSection : undefined}
    >
      {!collapsed ? (
        <>
          {statusError ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{statusError}</Text>
          <Pressable onPress={() => setStatusError(null)} hitSlop={8}>
            <RpgIcon name="close" size={14} color={COLORS.danger} />
          </Pressable>
        </View>
      ) : null}

      {/* Active Skill Slots (4) */}
      <View style={styles.groupHeaderRow}>
        <Text style={styles.groupLabel}>ACTIVE SKILL SLOTS ({equippedSkillCount}/4)</Text>
        {onJumpToTalents ? (
          <Pressable onPress={onJumpToTalents} hitSlop={6}>
            <Text style={styles.jumpLinkText}>Unlock Skills in Talents →</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.slotsGrid}>
        {[0, 1, 2, 3].map((slotIdx) => {
          const skillId = activeSkillLoadout[slotIdx] ?? null;
          const entry = skillId ? skillById.get(skillId) : undefined;
          const isMana = entry?.resourceType === 'MANA';
          return (
            <TouchableOpacity
              key={`skill-slot-${slotIdx}`}
              style={[styles.slotCard, entry && styles.slotCardFilled]}
              onPress={() => {
                setStatusError(null);
                setPickingSkillSlot(slotIdx);
              }}
              activeOpacity={0.78}
              testID={`loadout-skill-slot-${slotIdx}`}
            >
              <View style={styles.slotTopRow}>
                <Text style={styles.slotIndexText}>S{slotIdx + 1}</Text>
                {entry ? (
                  <View style={[styles.costPill, isMana ? styles.manaPill : styles.stamPill]}>
                    <Text style={[styles.costPillText, isMana ? styles.manaText : styles.stamText]}>
                      {entry.cost} {isMana ? 'MANA' : 'STAM'}
                    </Text>
                  </View>
                ) : (
                  <RpgIcon name="plus" size={12} color={COLORS.textMuted} />
                )}
              </View>
              <Text
                style={[styles.slotTitle, !entry && styles.slotTitleEmpty]}
                numberOfLines={2}
              >
                {entry ? entry.skill.name : 'Empty Slot'}
              </Text>
              <Text style={styles.slotMeta} numberOfLines={1}>
                {entry ? `CD ${entry.cooldownTurns}T` : 'Tap to equip'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <HairlineDivider spacing={SPACING.md} />

      {/* Belt Consumable Slots (4) */}
      <View style={styles.groupHeaderRow}>
        <Text style={styles.groupLabel}>BELT CONSUMABLES ({equippedBeltCount}/4)</Text>
        <Text style={styles.groupHint}>Max 3 charges/slot per quest</Text>
      </View>

      <View style={styles.slotsGrid}>
        {[0, 1, 2, 3].map((slotIdx) => {
          const itemSlug = beltLoadout[slotIdx] ?? null;
          const def = itemSlug ? COMBAT_CONSUMABLE_BY_SLUG[itemSlug] : undefined;
          const ownedQty = itemSlug ? (ownedQuantityBySlug[itemSlug] ?? 0) : 0;
          return (
            <TouchableOpacity
              key={`belt-slot-${slotIdx}`}
              style={[styles.slotCard, def && styles.slotCardBelt]}
              onPress={() => {
                setStatusError(null);
                setPickingBeltSlot(slotIdx);
              }}
              activeOpacity={0.78}
              testID={`loadout-belt-slot-${slotIdx}`}
            >
              <View style={styles.slotTopRow}>
                <Text style={styles.slotIndexText}>B{slotIdx + 1}</Text>
                {def ? (
                  <View style={styles.qtyPill}>
                    <Text style={styles.qtyPillText}>x{ownedQty}</Text>
                  </View>
                ) : (
                  <RpgIcon name="plus" size={12} color={COLORS.textMuted} />
                )}
              </View>
              <Text
                style={[styles.slotTitle, !def && styles.slotTitleEmpty]}
                numberOfLines={2}
              >
                {def ? def.name : 'Empty Belt'}
              </Text>
              <Text style={styles.slotMeta} numberOfLines={1}>
                {def ? (ownedQty > 0 ? `${Math.min(3, ownedQty)} charges ready` : 'Out of stock') : 'Tap to slot'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
        </>
      ) : null}

      {/* Active Skill Picker Bottom Sheet */}
      <DisclosureBottomSheet
        visible={pickingSkillSlot !== null}
        onClose={() => setPickingSkillSlot(null)}
        title={`Select Active Skill (Slot ${(pickingSkillSlot ?? 0) + 1})`}
        subtitle="Only unlocked talent active skills can be equipped into your 4-skill combat deck."
        testID="loadout-skill-picker-sheet"
      >
        <TouchableOpacity
          style={styles.clearSlotRow}
          onPress={() => void handleSelectSkill(null)}
          activeOpacity={0.75}
          testID="loadout-clear-skill-slot"
        >
          <RpgIcon name="trash" size={15} color={COLORS.danger} />
          <Text style={styles.clearSlotText}>Clear Slot</Text>
        </TouchableOpacity>

        {allActiveSkills.map((item) => {
          const isEquipped = activeSkillLoadout.includes(item.skill.skillId);
          const isMana = item.resourceType === 'MANA';
          return (
            <View
              key={item.skill.skillId}
              style={[styles.pickerRow, !item.unlocked && styles.pickerRowLocked]}
            >
              <TouchableOpacity
                style={styles.pickerMainBtn}
                disabled={!item.unlocked}
                onPress={() => void handleSelectSkill(item.skill.skillId)}
                activeOpacity={0.78}
                testID={`loadout-pick-skill-${item.skill.skillId}`}
              >
                <View style={styles.pickerTitleRow}>
                  <Text style={[styles.pickerTitle, !item.unlocked && styles.pickerTitleLocked]}>
                    {item.skill.name}
                  </Text>
                  {isEquipped ? (
                    <View style={styles.equippedTag}>
                      <Text style={styles.equippedTagText}>EQUIPPED</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.pickerDesc}>{item.nodeDescription}</Text>
                <View style={styles.pickerMetaRow}>
                  <View style={[styles.costPill, isMana ? styles.manaPill : styles.stamPill]}>
                    <Text style={[styles.costPillText, isMana ? styles.manaText : styles.stamText]}>
                      {item.cost} {isMana ? 'MANA' : 'STAM'}
                    </Text>
                  </View>
                  <Text style={styles.pickerMetaText}>CD {item.cooldownTurns}T</Text>
                  <Text style={styles.pickerMetaText}>
                    {item.treeName} • Tier {item.tier}
                  </Text>
                </View>
              </TouchableOpacity>

              {!item.unlocked ? (
                <View style={styles.lockedFooter}>
                  <View style={styles.lockedBadge}>
                    <RpgIcon name="lock" size={11} color={COLORS.textMuted} />
                    <Text style={styles.lockedText}>
                      Requires {item.governingStat} Tree Tier {item.tier}
                    </Text>
                  </View>
                  {onJumpToTalents ? (
                    <TouchableOpacity
                      onPress={() => {
                        setPickingSkillSlot(null);
                        onJumpToTalents();
                      }}
                      hitSlop={6}
                    >
                      <Text style={styles.goToTalentsLink}>Go to Talents</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}
      </DisclosureBottomSheet>

      {/* Belt Consumable Picker Bottom Sheet */}
      <DisclosureBottomSheet
        visible={pickingBeltSlot !== null}
        onClose={() => setPickingBeltSlot(null)}
        title={`Select Belt Consumable (Belt ${(pickingBeltSlot ?? 0) + 1})`}
        subtitle="Belt items are consumed on use during turn-based Guild Quests."
        testID="loadout-belt-picker-sheet"
      >
        <TouchableOpacity
          style={styles.clearSlotRow}
          onPress={() => void handleSelectBelt(null)}
          activeOpacity={0.75}
          testID="loadout-clear-belt-slot"
        >
          <RpgIcon name="trash" size={15} color={COLORS.danger} />
          <Text style={styles.clearSlotText}>Clear Slot</Text>
        </TouchableOpacity>

        {COMBAT_CONSUMABLE_CATALOG.map((c) => {
          const ownedQty = ownedQuantityBySlug[c.itemSlug] ?? 0;
          const rarityColor = RARITY_COLORS[c.rarity] ?? COLORS.textSecondary;
          return (
            <TouchableOpacity
              key={c.itemSlug}
              style={styles.pickerRow}
              onPress={() => void handleSelectBelt(c.itemSlug)}
              activeOpacity={0.78}
              testID={`loadout-pick-belt-${c.itemSlug}`}
            >
              <View style={styles.pickerTitleRow}>
                <Text style={[styles.pickerTitle, { color: rarityColor }]}>{c.name}</Text>
                <View style={styles.qtyPill}>
                  <Text style={styles.qtyPillText}>x{ownedQty}</Text>
                </View>
              </View>
              <Text style={styles.pickerDesc}>{c.description}</Text>
              <Text style={styles.pickerMetaText}>
                {ownedQty > 0
                  ? `${Math.min(3, ownedQty)} charge(s) brought into combat`
                  : '0 owned — claim Guild Field Rations or loot quests'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </DisclosureBottomSheet>
    </SlateSection>
  );
};

const styles = StyleSheet.create({
  compactSection: {
    marginBottom: SPACING.md,
  },
  collapseToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADII.pill,
    backgroundColor: SURFACES.layer2,
    borderWidth: 1,
    borderColor: SURFACES.goldHairline,
  },
  collapseToggleText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.gold,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.strengthDim,
    borderRadius: RADII.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  errorText: {
    fontSize: 12,
    color: COLORS.danger,
    flex: 1,
    marginRight: SPACING.sm,
  },
  groupHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  groupLabel: {
    ...TYPOGRAPHY.eyebrow,
    color: COLORS.textSecondary,
  },
  groupHint: {
    ...TYPOGRAPHY.caption,
  },
  jumpLinkText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.gold,
  },
  slotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  slotCard: {
    width: '48%',
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.md,
    padding: SPACING.sm,
    borderWidth: 1,
    borderColor: SURFACES.hairline,
    minHeight: 74,
    justifyContent: 'space-between',
  },
  slotCardFilled: {
    borderColor: SURFACES.goldHairline,
    backgroundColor: SURFACES.layer3,
  },
  slotCardBelt: {
    borderColor: 'rgba(38, 166, 154, 0.35)',
    backgroundColor: SURFACES.layer3,
  },
  slotTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  slotIndexText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textMuted,
  },
  slotTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  slotTitleEmpty: {
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  slotMeta: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  costPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADII.sm,
  },
  stamPill: {
    backgroundColor: 'rgba(245, 184, 65, 0.16)',
  },
  manaPill: {
    backgroundColor: 'rgba(66, 165, 245, 0.18)',
  },
  costPillText: {
    fontSize: 9,
    fontWeight: '800',
  },
  stamText: {
    color: COLORS.gold,
  },
  manaText: {
    color: '#60A5FA',
  },
  qtyPill: {
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: SURFACES.hairlineStrong,
  },
  qtyPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  clearSlotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: 'rgba(239, 83, 80, 0.12)',
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  clearSlotText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.danger,
  },
  pickerRow: {
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: SURFACES.hairline,
  },
  pickerRowLocked: {
    opacity: 0.72,
  },
  pickerMainBtn: {
    gap: 4,
  },
  pickerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  pickerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textPrimary,
    flex: 1,
  },
  pickerTitleLocked: {
    color: COLORS.textSecondary,
  },
  equippedTag: {
    backgroundColor: COLORS.goldDim,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADII.sm,
  },
  equippedTagText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.gold,
  },
  pickerDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 17,
  },
  pickerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: 4,
  },
  pickerMetaText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  lockedFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.sm,
    paddingTop: SPACING.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SURFACES.hairline,
  },
  lockedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  lockedText: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  goToTalentsLink: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.gold,
  },
});

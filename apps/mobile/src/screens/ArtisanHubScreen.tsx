import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  AffixReforgeMode,
  CRAFTING_MATERIAL_CATALOG,
  CRAFTING_RECIPES,
  CraftingRecipeDefinition,
  ItemTier,
  getAffixReforgeCost,
  getGearUpgradeCost,
} from '@goki/game-engine';
import { RpgIcon } from '../components/icons/RpgIcon';
import { TraderShopModal } from '../components/npc';
import {
  HairlineDivider,
  HubSceneBackdrop,
  HubSceneHeaderSlot,
  SegmentedControl,
  SegmentedOption,
  SlateSection,
} from '../components/ui';
import { isEquippableInventoryEntry, useGame } from '../state/GameContext';
import {
  COLORS,
  RADII,
  RARITY_COLORS,
  SPACING,
  SURFACES,
  TYPOGRAPHY,
} from '../theme';
import { GatheringNodeScreen } from './GatheringNodeScreen';

export type ArtisanSubView = 'GATHER' | 'CRAFT';
type WorkbenchTab = 'POTIONS' | 'FORGE' | 'REFORGE';

const SUB_OPTIONS: ReadonlyArray<SegmentedOption<ArtisanSubView>> = [
  {
    key: 'GATHER',
    label: 'Gather',
    icon: 'prof-mining',
    testID: 'artisan-subtab-gather',
  },
  {
    key: 'CRAFT',
    label: 'Craft & Reforge',
    icon: 'artisan',
    testID: 'artisan-subtab-craft',
  },
];

const WORKBENCH_TABS: ReadonlyArray<SegmentedOption<WorkbenchTab>> = [
  {
    key: 'POTIONS',
    label: 'Potions',
    icon: 'prof-alchemy',
    testID: 'artisan-wb-potions',
  },
  {
    key: 'FORGE',
    label: 'Forge Gear',
    icon: 'anvil',
    testID: 'artisan-wb-forge',
  },
  {
    key: 'REFORGE',
    label: 'Upgrade',
    icon: 'sparkles',
    testID: 'artisan-wb-reforge',
  },
];

export const ArtisanHubScreen: React.FC = () => {
  const {
    gold,
    stats,
    inventory,
    craftItemRecipe,
    upgradeInventoryGear,
    reforgeInventoryGear,
  } = useGame();

  const [subView, setSubView] = useState<ArtisanSubView>('GATHER');
  const [workbenchTab, setWorkbenchTab] = useState<WorkbenchTab>('POTIONS');
  const [traderOpen, setTraderOpen] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const itemCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const entry of inventory) {
      counts[entry.slug] = (counts[entry.slug] ?? 0) + entry.quantity;
    }
    return counts;
  }, [inventory]);

  const equippableGear = useMemo(
    () => inventory.filter((item) => isEquippableInventoryEntry(item)),
    [inventory]
  );

  const visibleRecipes = useMemo<CraftingRecipeDefinition[]>(() => {
    if (workbenchTab === 'POTIONS') {
      return CRAFTING_RECIPES.filter(
        (r) => r.category === 'CONSUMABLE' || r.category === 'SMELTING_REFINERY'
      );
    }
    if (workbenchTab === 'FORGE') {
      return CRAFTING_RECIPES.filter((r) => r.category === 'GEAR_FORGE');
    }
    return [];
  }, [workbenchTab]);

  const statLevelLookup = (stat?: CraftingRecipeDefinition['requiredStat']): number => {
    if (!stat) return 999;
    return stats[stat]?.level ?? 1;
  };

  const handleCraft = async (recipe: CraftingRecipeDefinition) => {
    setBusyKey(recipe.recipeSlug);
    const res = await craftItemRecipe(recipe.recipeSlug, 1);
    setBusyKey(null);
    if (res.ok) {
      setFeedback({ ok: true, text: res.message ?? `Crafted ${recipe.outputItemName}!` });
    } else {
      setFeedback({ ok: false, text: res.error ?? 'Crafting failed.' });
    }
  };

  const handleUpgrade = async (itemKey: string) => {
    setBusyKey(`upg:${itemKey}`);
    const res = await upgradeInventoryGear(itemKey);
    setBusyKey(null);
    if (res.ok) {
      setFeedback({ ok: true, text: res.message ?? 'Gear upgraded!' });
    } else {
      setFeedback({ ok: false, text: res.error ?? 'Upgrade failed.' });
    }
  };

  const handleReforge = async (itemKey: string, mode: AffixReforgeMode) => {
    setBusyKey(`ref:${itemKey}:${mode}`);
    const res = await reforgeInventoryGear(itemKey, mode);
    setBusyKey(null);
    if (res.ok) {
      setFeedback({ ok: true, text: res.message ?? 'Gear reforged!' });
    } else {
      setFeedback({ ok: false, text: res.error ?? 'Reforge failed.' });
    }
  };

  const artisanSlotId =
    subView === 'CRAFT' ? 'artisan_forge_apothecary' : 'artisan_gathering_wilds';

  return (
    <View style={styles.root}>
      <HubSceneBackdrop slotId={artisanSlotId} />
      <HubSceneHeaderSlot slotId={artisanSlotId} style={styles.topBar}>
        <View style={styles.segmentedWrap}>
          <SegmentedControl
            options={SUB_OPTIONS}
            value={subView}
            onChange={setSubView}
          />
        </View>
        <TouchableOpacity
          style={styles.npcBtn}
          onPress={() => setTraderOpen(true)}
          activeOpacity={0.75}
          testID="artisan-npc-btn"
        >
          <RpgIcon name="coin" size={14} color="#F59E0B" />
          <Text style={styles.npcBtnText}>Trader</Text>
        </TouchableOpacity>
      </HubSceneHeaderSlot>

      <View style={styles.body}>
        {subView === 'GATHER' ? (
          <GatheringNodeScreen />
        ) : (
          <View style={{ flex: 1 }}>
            {feedback ? (
              <View style={styles.stickyFeedbackWrap}>
                <View
                  style={[
                    styles.feedbackBanner,
                    feedback.ok ? styles.feedbackSuccess : styles.feedbackError,
                    { marginTop: 0 },
                  ]}
                >
                  <RpgIcon
                    name={feedback.ok ? 'check' : 'lock'}
                    size={14}
                    color={feedback.ok ? COLORS.success : COLORS.danger}
                  />
                  <Text style={styles.feedbackText}>{feedback.text}</Text>
                  <TouchableOpacity onPress={() => setFeedback(null)} hitSlop={8}>
                    <RpgIcon name="close" size={14} color={COLORS.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            <ScrollView contentContainerStyle={styles.craftScroll}>
            <SlateSection
              level={1}
              eyebrow="FORGE & APOTHECARY"
              title="Crafting, Reforging & Potion Brewing"
              subtitle="Turn gathered ores, herbs, and raid essences into potions, ingots, and upgraded gear."
              rightAction={
                <View style={styles.goldPill}>
                  <RpgIcon name="coin" size={13} color={COLORS.gold} />
                  <Text style={styles.goldPillText}>{gold.toLocaleString()}g</Text>
                </View>
              }
            >
              {/* Material Satchel Chips (wrapped so all materials stay visible without edge clipping) */}
              <Text style={styles.satchelLabel}>Material Satchel</Text>
              <View style={styles.satchelWrapGrid}>
                {CRAFTING_MATERIAL_CATALOG.map((mat) => {
                  const owned = itemCounts[mat.slug] ?? 0;
                  const rarityColor = RARITY_COLORS[mat.rarity] ?? COLORS.textSecondary;
                  return (
                    <View key={mat.slug} style={styles.satchelChip}>
                      <View style={[styles.satchelDot, { backgroundColor: rarityColor }]} />
                      <Text style={styles.satchelName} numberOfLines={1}>
                        {mat.name.replace('Rich ', '').replace(' Bundle', '').replace(' Cluster', '')}
                      </Text>
                      <Text
                        style={[
                          styles.satchelCount,
                          owned === 0 && { color: COLORS.textSecondary },
                        ]}
                      >
                        {owned}
                      </Text>
                    </View>
                  );
                })}
              </View>

              <HairlineDivider spacing={SPACING.sm} />

              <SegmentedControl
                options={WORKBENCH_TABS}
                value={workbenchTab}
                onChange={(next) => {
                  setWorkbenchTab(next);
                  setFeedback(null);
                }}
              />
            </SlateSection>

            {/* Recipe List (Potions & Refining | Forge Gear) */}
            {(workbenchTab === 'POTIONS' || workbenchTab === 'FORGE') &&
              visibleRecipes.map((recipe) => {
                const rarityColor = RARITY_COLORS[recipe.outputRarity] ?? COLORS.textSecondary;
                const meetsGold = gold >= recipe.goldCost;
                const meetsStat =
                  !recipe.requiredStat ||
                  !recipe.requiredStatLevel ||
                  statLevelLookup(recipe.requiredStat) >= recipe.requiredStatLevel;
                const meetsIngredients = recipe.ingredients.every(
                  (ing) => (itemCounts[ing.itemSlug] ?? 0) >= ing.quantity
                );
                const canCraft = meetsGold && meetsStat && meetsIngredients;
                const isBusy = busyKey === recipe.recipeSlug;

                return (
                  <SlateSection key={recipe.recipeSlug} level={1}>
                    <View style={styles.recipeHeader}>
                      <View style={{ flex: 1, gap: 3 }}>
                        <View style={styles.badgeRow}>
                          <View style={[styles.rarityBadge, { borderColor: rarityColor }]}>
                            <Text style={[styles.rarityText, { color: rarityColor }]}>
                              {recipe.outputRarity}
                            </Text>
                          </View>
                          <Text style={styles.profTag}>{recipe.profession}</Text>
                          {recipe.requiredStat && recipe.requiredStatLevel ? (
                            <Text
                              style={[
                                styles.reqTag,
                                !meetsStat && { color: COLORS.danger },
                              ]}
                            >
                              Req {recipe.requiredStat} Lv {recipe.requiredStatLevel}
                            </Text>
                          ) : null}
                        </View>
                        <Text style={styles.recipeName}>
                          {recipe.name}
                          {recipe.outputQuantity > 1 ? ` (×${recipe.outputQuantity})` : ''}
                        </Text>
                        <Text style={styles.recipeDesc}>{recipe.description}</Text>
                      </View>

                      <TouchableOpacity
                        style={[
                          styles.craftBtn,
                          (!canCraft || isBusy) && styles.btnDisabled,
                        ]}
                        onPress={() => void handleCraft(recipe)}
                        disabled={!canCraft || isBusy}
                        activeOpacity={0.8}
                        testID={`artisan-craft-${recipe.recipeSlug}`}
                      >
                        <RpgIcon
                          name={workbenchTab === 'FORGE' ? 'anvil' : 'prof-alchemy'}
                          size={13}
                          color={canCraft ? SURFACES.canvas : COLORS.textSecondary}
                        />
                        <Text
                          style={[
                            styles.craftBtnText,
                            !canCraft && { color: COLORS.textSecondary },
                          ]}
                        >
                          {isBusy ? '...' : 'Craft'}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.reqListRow}>
                      {recipe.ingredients.map((ing) => {
                        const owned = itemCounts[ing.itemSlug] ?? 0;
                        const enough = owned >= ing.quantity;
                        return (
                          <View key={ing.itemSlug} style={styles.ingChip}>
                            <Text style={styles.ingName}>{ing.itemName}</Text>
                            <Text
                              style={[
                                styles.ingQty,
                                { color: enough ? COLORS.success : COLORS.danger },
                              ]}
                            >
                              {owned}/{ing.quantity}
                            </Text>
                          </View>
                        );
                      })}
                      <View style={styles.ingChip}>
                        <RpgIcon name="coin" size={11} color={COLORS.gold} />
                        <Text
                          style={[
                            styles.ingQty,
                            { color: meetsGold ? COLORS.gold : COLORS.danger },
                          ]}
                        >
                          {recipe.goldCost}g
                        </Text>
                      </View>
                    </View>
                  </SlateSection>
                );
              })}

            {/* Upgrade & Reforge Workbench */}
            {workbenchTab === 'REFORGE' &&
              (equippableGear.length === 0 ? (
                <SlateSection level={1}>
                  <View style={styles.emptyBox}>
                    <RpgIcon name="anvil" size={28} color={COLORS.textMuted} />
                    <Text style={styles.emptyTitle}>No Equippable Gear in Bag</Text>
                    <Text style={styles.emptySub}>
                      Forge an armament under Forge Gear, buy gear from Bramwell, or earn drops from Guild Quests.
                    </Text>
                    <TouchableOpacity
                      style={styles.switchCta}
                      onPress={() => setWorkbenchTab('FORGE')}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.switchCtaText}>Go to Forge Gear</Text>
                    </TouchableOpacity>
                  </View>
                </SlateSection>
              ) : (
                equippableGear.map((item) => {
                  const itemKey = item.inventoryItemId ?? item.slug;
                  const tier = (item.tier ?? 1) as ItemTier;
                  const rarityColor = RARITY_COLORS[item.rarity] ?? COLORS.textSecondary;
                  const upgradeCost = getGearUpgradeCost(tier);
                  const reforgeBothCost = getAffixReforgeCost(tier, 'BOTH');
                  const lockPrefixCost =
                    tier >= 2 && item.prefixId
                      ? getAffixReforgeCost(tier, 'LOCK_PREFIX')
                      : null;
                  const lockSuffixCost =
                    tier >= 2 && item.suffixId
                      ? getAffixReforgeCost(tier, 'LOCK_SUFFIX')
                      : null;

                  const canUpgrade =
                    Boolean(upgradeCost) &&
                    gold >= (upgradeCost?.goldCost ?? Infinity) &&
                    Boolean(
                      upgradeCost?.ingredients.every(
                        (ing) => (itemCounts[ing.itemSlug] ?? 0) >= ing.quantity
                      )
                    );

                  const canReforgeBoth =
                    gold >= reforgeBothCost.goldCost &&
                    reforgeBothCost.ingredients.every(
                      (ing) => (itemCounts[ing.itemSlug] ?? 0) >= ing.quantity
                    );

                  const canLockPrefix =
                    Boolean(lockPrefixCost) &&
                    gold >= (lockPrefixCost?.goldCost ?? Infinity) &&
                    Boolean(
                      lockPrefixCost?.ingredients.every(
                        (ing) => (itemCounts[ing.itemSlug] ?? 0) >= ing.quantity
                      )
                    );

                  const canLockSuffix =
                    Boolean(lockSuffixCost) &&
                    gold >= (lockSuffixCost?.goldCost ?? Infinity) &&
                    Boolean(
                      lockSuffixCost?.ingredients.every(
                        (ing) => (itemCounts[ing.itemSlug] ?? 0) >= ing.quantity
                      )
                    );

                  return (
                    <SlateSection key={itemKey} level={1}>
                      <View style={styles.badgeRow}>
                        <View style={[styles.rarityBadge, { borderColor: rarityColor }]}>
                          <Text style={[styles.rarityText, { color: rarityColor }]}>
                            {item.rarity}
                          </Text>
                        </View>
                        <View style={styles.tierBadge}>
                          <Text style={styles.tierBadgeText}>TIER {tier}</Text>
                        </View>
                        {item.equipped ? (
                          <View style={styles.equippedPill}>
                            <Text style={styles.equippedPillText}>EQUIPPED</Text>
                          </View>
                        ) : null}
                      </View>

                      <Text style={styles.recipeName}>{item.name}</Text>
                      {item.baseStatsSummary ? (
                        <Text style={styles.statsLine}>{item.baseStatsSummary}</Text>
                      ) : null}
                      {item.prefixLabel || item.suffixLabel ? (
                        <View style={styles.affixList}>
                          {item.prefixLabel ? (
                            <Text style={styles.affixLine}>
                              Prefix: {item.prefixLabel}
                              {item.prefixSummary ? ` (${item.prefixSummary})` : ''}
                            </Text>
                          ) : null}
                          {item.suffixLabel ? (
                            <Text style={styles.affixLine}>
                              Suffix: {item.suffixLabel}
                              {item.suffixSummary ? ` (${item.suffixSummary})` : ''}
                            </Text>
                          ) : null}
                        </View>
                      ) : null}

                      <HairlineDivider spacing={SPACING.xs} />

                      {/* Upgrade Action */}
                      {upgradeCost ? (
                        <View style={styles.actionBlock}>
                          <View style={styles.reqListRow}>
                            {upgradeCost.ingredients.map((ing) => {
                              const owned = itemCounts[ing.itemSlug] ?? 0;
                              return (
                                <View key={ing.itemSlug} style={styles.ingChip}>
                                  <Text style={styles.ingName}>{ing.itemName}</Text>
                                  <Text
                                    style={[
                                      styles.ingQty,
                                      {
                                        color:
                                          owned >= ing.quantity ? COLORS.success : COLORS.danger,
                                      },
                                    ]}
                                  >
                                    {owned}/{ing.quantity}
                                  </Text>
                                </View>
                              );
                            })}
                            <View style={styles.ingChip}>
                              <RpgIcon name="coin" size={11} color={COLORS.gold} />
                              <Text
                                style={[
                                  styles.ingQty,
                                  {
                                    color:
                                      gold >= upgradeCost.goldCost
                                        ? COLORS.gold
                                        : COLORS.danger,
                                  },
                                ]}
                              >
                                {upgradeCost.goldCost}g
                              </Text>
                            </View>
                          </View>

                          <TouchableOpacity
                            style={[
                              styles.upgradeBtn,
                              (!canUpgrade || busyKey === `upg:${itemKey}`) &&
                                styles.btnDisabled,
                            ]}
                            onPress={() => void handleUpgrade(itemKey)}
                            disabled={!canUpgrade || busyKey === `upg:${itemKey}`}
                            activeOpacity={0.8}
                            testID={`artisan-upgrade-${itemKey}`}
                          >
                            <RpgIcon
                              name="sparkles"
                              size={13}
                              color={canUpgrade ? SURFACES.canvas : COLORS.textMuted}
                            />
                            <Text
                              style={[
                                styles.upgradeBtnText,
                                !canUpgrade && { color: COLORS.textMuted },
                              ]}
                            >
                              Upgrade to Tier {upgradeCost.toTier}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <Text style={styles.maxTierLabel}>Maximum Tier V Reached</Text>
                      )}

                      {/* Reforge Actions */}
                      <View style={styles.reforgeRow}>
                        <TouchableOpacity
                          style={[
                            styles.reforgeBtn,
                            (!canReforgeBoth || busyKey === `ref:${itemKey}:BOTH`) &&
                              styles.btnDisabled,
                          ]}
                          onPress={() => void handleReforge(itemKey, 'BOTH')}
                          disabled={!canReforgeBoth || busyKey === `ref:${itemKey}:BOTH`}
                          activeOpacity={0.8}
                          testID={`artisan-reforge-both-${itemKey}`}
                        >
                          <Text style={styles.reforgeBtnText}>
                            Reforge All ({reforgeBothCost.goldCost}g)
                          </Text>
                          <Text style={styles.reforgeCostSub}>
                            {reforgeBothCost.ingredients
                              .map((i) => `${i.quantity}× ${i.itemName.split(' ')[0]}`)
                              .join(' + ')}
                          </Text>
                        </TouchableOpacity>

                        {lockPrefixCost ? (
                          <TouchableOpacity
                            style={[
                              styles.reforgeBtn,
                              (!canLockPrefix ||
                                busyKey === `ref:${itemKey}:LOCK_PREFIX`) &&
                                styles.btnDisabled,
                            ]}
                            onPress={() => void handleReforge(itemKey, 'LOCK_PREFIX')}
                            disabled={
                              !canLockPrefix || busyKey === `ref:${itemKey}:LOCK_PREFIX`
                            }
                            activeOpacity={0.8}
                            testID={`artisan-reforge-lock-prefix-${itemKey}`}
                          >
                            <Text style={styles.reforgeBtnText}>
                              Lock Prefix ({lockPrefixCost.goldCost}g)
                            </Text>
                            <Text style={styles.reforgeCostSub}>
                              {lockPrefixCost.ingredients
                                .map((i) => `${i.quantity}× ${i.itemName.split(' ')[0]}`)
                                .join(' + ')}
                            </Text>
                          </TouchableOpacity>
                        ) : null}

                        {lockSuffixCost ? (
                          <TouchableOpacity
                            style={[
                              styles.reforgeBtn,
                              (!canLockSuffix ||
                                busyKey === `ref:${itemKey}:LOCK_SUFFIX`) &&
                                styles.btnDisabled,
                            ]}
                            onPress={() => void handleReforge(itemKey, 'LOCK_SUFFIX')}
                            disabled={
                              !canLockSuffix || busyKey === `ref:${itemKey}:LOCK_SUFFIX`
                            }
                            activeOpacity={0.8}
                            testID={`artisan-reforge-lock-suffix-${itemKey}`}
                          >
                            <Text style={styles.reforgeBtnText}>
                              Lock Suffix ({lockSuffixCost.goldCost}g)
                            </Text>
                            <Text style={styles.reforgeCostSub}>
                              {lockSuffixCost.ingredients
                                .map((i) => `${i.quantity}× ${i.itemName.split(' ')[0]}`)
                                .join(' + ')}
                            </Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </SlateSection>
                  );
                })
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      <TraderShopModal
        visible={traderOpen}
        onClose={() => setTraderOpen(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: SURFACES.canvas,
  },
  topBar: {
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
  npcBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 38,
  },
  npcBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F59E0B',
  },
  body: {
    flex: 1,
  },
  craftScroll: {
    padding: SPACING.md,
    gap: SPACING.md,
    paddingBottom: 36,
  },
  goldPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  goldPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.gold,
    ...TYPOGRAPHY.tabular,
  },
  satchelLabel: {
    ...TYPOGRAPHY.eyebrow,
    marginBottom: 6,
  },
  stickyFeedbackWrap: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    backgroundColor: SURFACES.canvas,
    zIndex: 10,
  },
  satchelWrapGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingVertical: 2,
  },
  satchelStrip: {
    gap: 6,
    paddingVertical: 2,
  },
  satchelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  satchelDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  satchelName: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
    maxWidth: 110,
  },
  satchelCount: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textPrimary,
    ...TYPOGRAPHY.tabular,
  },
  feedbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADII.md,
    marginTop: SPACING.sm,
  },
  feedbackSuccess: {
    backgroundColor: SURFACES.emeraldTint,
  },
  feedbackError: {
    backgroundColor: COLORS.strengthDim,
  },
  feedbackText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  recipeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  rarityBadge: {
    borderWidth: 1,
    borderRadius: RADII.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  rarityText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  profTag: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  reqTag: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.shieldCyan,
  },
  tierBadge: {
    backgroundColor: SURFACES.layer3,
    borderRadius: RADII.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tierBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.gold,
  },
  equippedPill: {
    backgroundColor: SURFACES.emeraldTint,
    borderRadius: RADII.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  equippedPillText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.success,
  },
  recipeName: {
    ...TYPOGRAPHY.titleMd,
    fontSize: 14,
  },
  recipeDesc: {
    ...TYPOGRAPHY.bodySm,
  },
  craftBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.gold,
    borderRadius: RADII.md,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  craftBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: SURFACES.canvas,
  },
  reqListRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  ingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.md,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  ingName: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  ingQty: {
    fontSize: 11,
    fontWeight: '800',
    ...TYPOGRAPHY.tabular,
  },
  statsLine: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.shieldCyan,
    marginTop: 2,
  },
  affixList: {
    marginTop: 4,
    gap: 2,
  },
  affixLine: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.gold,
  },
  actionBlock: {
    gap: SPACING.sm,
  },
  upgradeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.gold,
    borderRadius: RADII.md,
    paddingVertical: 10,
  },
  upgradeBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: SURFACES.canvas,
  },
  maxTierLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.success,
    marginBottom: 4,
  },
  reforgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  reforgeBtn: {
    flex: 1,
    minWidth: 110,
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.md,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 2,
  },
  reforgeBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  reforgeCostSub: {
    fontSize: 10,
    color: COLORS.textMuted,
  },
  btnDisabled: {
    backgroundColor: SURFACES.layer3,
    borderWidth: 1,
    borderColor: SURFACES.hairlineStrong,
    opacity: 0.85,
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
    gap: 8,
  },
  emptyTitle: {
    ...TYPOGRAPHY.titleMd,
  },
  emptySub: {
    ...TYPOGRAPHY.bodySm,
    textAlign: 'center',
  },
  switchCta: {
    backgroundColor: COLORS.gold,
    borderRadius: RADII.md,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginTop: 4,
  },
  switchCtaText: {
    fontSize: 12,
    fontWeight: '800',
    color: SURFACES.canvas,
  },
});

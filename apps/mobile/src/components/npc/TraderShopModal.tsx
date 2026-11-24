import React, { useEffect, useMemo, useState } from 'react';
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
  TraderShopOffer,
  calculateTraderSellValue,
  generateTraderRotatingStock,
  toUtcDayKey,
} from '@goki/game-engine';
import { fetchTraderStockApi } from '../../api/apiClient';
import { useGame } from '../../state/GameContext';
import {
  COLORS,
  RADII,
  RARITY_COLORS,
  SPACING,
  SURFACES,
  TYPOGRAPHY,
} from '../../theme';
import { RpgIcon } from '../icons/RpgIcon';
import {
  HairlineDivider,
  SegmentedControl,
  SegmentedOption,
} from '../ui/SurfacePrimitives';
import { NpcPortraitSvg } from './NpcPortraitSvg';

export type TraderShopTab = 'BUY' | 'SELL';

export interface TraderShopModalProps {
  visible: boolean;
  onClose: () => void;
  initialTab?: TraderShopTab;
}

const TAB_OPTIONS: ReadonlyArray<SegmentedOption<TraderShopTab>> = [
  { key: 'BUY', label: 'Buy Stock', icon: 'coin', testID: 'trader-tab-buy' },
  { key: 'SELL', label: 'Sell Loot', icon: 'backpack', testID: 'trader-tab-sell' },
];

function summarizeOfferStats(offer: TraderShopOffer): string | null {
  const drop = offer.lootDrop;
  const parts: string[] = [];
  if (drop.tier) parts.push(`Tier ${drop.tier}`);
  if (drop.baseStatsSummary) parts.push(drop.baseStatsSummary);
  if (drop.prefixSummary) parts.push(drop.prefixSummary);
  if (drop.suffixSummary) parts.push(drop.suffixSummary);
  if (parts.length > 0) return parts.join(' • ');
  if (drop.statBonuses) {
    const bonuses: string[] = [];
    if (drop.statBonuses.meleePower) bonuses.push(`+${drop.statBonuses.meleePower} PWR`);
    if (drop.statBonuses.armorRating) bonuses.push(`+${drop.statBonuses.armorRating} ARM`);
    if (drop.statBonuses.maxHp) bonuses.push(`+${drop.statBonuses.maxHp} HP`);
    if (drop.statBonuses.maxStamina) bonuses.push(`+${drop.statBonuses.maxStamina} STA`);
    if (bonuses.length > 0) return bonuses.join(' • ');
  }
  return null;
}

export const TraderShopModal: React.FC<TraderShopModalProps> = ({
  visible,
  onClose,
  initialTab = 'BUY',
}) => {
  const insets = useSafeAreaInsets();
  const {
    gold,
    inventory,
    serverOnline,
    buyTraderOffer,
    sellInventoryItemToTrader,
  } = useGame();

  const [activeTab, setActiveTab] = useState<TraderShopTab>(initialTab);
  const [rotationDateKey, setRotationDateKey] = useState<string>(() =>
    toUtcDayKey(new Date())
  );
  const [stockOffers, setStockOffers] = useState<TraderShopOffer[]>(() =>
    generateTraderRotatingStock(toUtcDayKey(new Date()))
  );
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!visible) return;
    setActiveTab(initialTab);
    setFeedback(null);
    const todayKey = toUtcDayKey(new Date());
    setRotationDateKey(todayKey);
    setStockOffers(generateTraderRotatingStock(todayKey));

    if (serverOnline) {
      let active = true;
      void fetchTraderStockApi(todayKey).then((res) => {
        if (!active || !res.ok || !res.data) return;
        if (Array.isArray(res.data.offers) && res.data.offers.length > 0) {
          setStockOffers(res.data.offers);
          if (typeof res.data.rotationDateKey === 'string') {
            setRotationDateKey(res.data.rotationDateKey);
          }
        }
      });
      return () => {
        active = false;
      };
    }
  }, [visible, initialTab, serverOnline]);

  const sellableItems = useMemo(
    () => inventory.filter((item) => !item.isLocked && !item.equipped && item.quantity > 0),
    [inventory]
  );

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => {
      setFeedback(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [feedback]);

  const handleBuy = async (offer: TraderShopOffer) => {
    setBusyKey(offer.offerId);
    const res = await buyTraderOffer(offer.offerId, 1, rotationDateKey);
    setBusyKey(null);
    if (res.ok) {
      const msg =
        res.message && res.message !== 'Purchase complete!'
          ? res.message
          : `Bought ${offer.itemName} for ${offer.buyPriceGold}g!`;
      setFeedback({ ok: true, text: msg });
    } else {
      setFeedback({ ok: false, text: res.error ?? 'Could not complete purchase.' });
    }
  };

  const handleSell = async (itemKey: string, qty: number) => {
    setBusyKey(itemKey);
    const res = await sellInventoryItemToTrader(itemKey, qty);
    setBusyKey(null);
    if (res.ok) {
      setFeedback({ ok: true, text: res.message ?? 'Sold item.' });
    } else {
      setFeedback({ ok: false, text: res.error ?? 'Could not sell item.' });
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root} testID="trader-shop-modal">
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
          {/* Bramwell Header */}
          <View style={styles.headerRow}>
            <NpcPortraitSvg
              npcId="TRADER"
              size={64}
              expression={feedback?.ok ? 'happy' : feedback ? 'alert' : 'neutral'}
            />
            <View style={styles.headerCol}>
              <Text style={styles.eyebrow}>FOUNDRY QUARTERMASTER • {rotationDateKey}</Text>
              <Text style={styles.title}>Bramwell's Trading Post</Text>
              <View style={styles.goldBadge}>
                <RpgIcon name="coin" size={13} color={COLORS.gold} />
                <Text style={styles.goldBadgeText}>{gold.toLocaleString()}g</Text>
              </View>
            </View>
            <Pressable
              style={styles.closeBtn}
              onPress={onClose}
              testID="trader-close-btn"
              hitSlop={8}
            >
              <RpgIcon name="close" size={16} color={COLORS.textSecondary} />
            </Pressable>
          </View>

          <Text style={styles.greeting}>
            "Fresh ingots, potions, and forged armaments rotate daily at UTC midnight. Bring me surplus loot for fair coin."
          </Text>

          <SegmentedControl
            options={TAB_OPTIONS}
            value={activeTab}
            onChange={(next) => {
              setActiveTab(next);
              setFeedback(null);
            }}
          />

          {feedback ? (
            <View
              style={[
                styles.feedbackBanner,
                feedback.ok ? styles.feedbackSuccess : styles.feedbackError,
              ]}
            >
              <RpgIcon
                name={feedback.ok ? 'check' : 'lock'}
                size={14}
                color={feedback.ok ? COLORS.success : COLORS.danger}
              />
              <Text style={styles.feedbackText}>{feedback.text}</Text>
            </View>
          ) : null}

          <HairlineDivider spacing={SPACING.sm} />

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {activeTab === 'BUY' ? (
              stockOffers.map((offer) => {
                const rarityColor = RARITY_COLORS[offer.rarity] ?? COLORS.textSecondary;
                const statSummary = summarizeOfferStats(offer);
                const canAfford = gold >= offer.buyPriceGold;
                const isBusy = busyKey === offer.offerId;

                return (
                  <View key={offer.offerId} style={styles.offerCard}>
                    <View style={styles.offerTop}>
                      <View style={{ flex: 1, gap: 3 }}>
                        <View style={styles.badgeRow}>
                          <View style={[styles.rarityBadge, { borderColor: rarityColor }]}>
                            <Text style={[styles.rarityText, { color: rarityColor }]}>
                              {offer.rarity}
                            </Text>
                          </View>
                          <Text style={styles.categoryTag}>
                            {offer.category === 'PROCEDURAL_GEAR'
                              ? 'GEAR'
                              : offer.category}
                          </Text>
                        </View>
                        <Text style={styles.itemName}>{offer.itemName}</Text>
                      </View>

                      <TouchableOpacity
                        style={[
                          styles.buyBtn,
                          (!canAfford || isBusy) && styles.btnDisabled,
                        ]}
                        onPress={() => void handleBuy(offer)}
                        disabled={!canAfford || isBusy}
                        activeOpacity={0.8}
                        testID={`trader-buy-${offer.offerId}`}
                      >
                        <RpgIcon
                          name="coin"
                          size={12}
                          color={canAfford ? SURFACES.canvas : COLORS.textSecondary}
                        />
                        <Text
                          style={[
                            styles.buyBtnText,
                            !canAfford && { color: COLORS.textSecondary },
                          ]}
                        >
                          {isBusy ? '...' : `Buy ${offer.buyPriceGold}g`}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {statSummary ? (
                      <Text style={styles.statSummary}>{statSummary}</Text>
                    ) : null}
                    <Text style={styles.itemDesc}>{offer.description}</Text>
                  </View>
                );
              })
            ) : sellableItems.length === 0 ? (
              <View style={styles.emptyBox}>
                <RpgIcon name="backpack" size={26} color={COLORS.textMuted} />
                <Text style={styles.emptyTitle}>No Sellable Loot</Text>
                <Text style={styles.emptySub}>
                  Equipped or locked items are protected from sale. Unequip gear or gather materials to trade with Bramwell.
                </Text>
              </View>
            ) : (
              sellableItems.map((item) => {
                const itemKey = item.inventoryItemId ?? item.slug;
                const rarityColor = RARITY_COLORS[item.rarity] ?? COLORS.textSecondary;
                const unitPrice = calculateTraderSellValue({
                  baseGoldValue: item.goldValue,
                  itemSlug: item.baseSlug ?? item.slug,
                  tier: item.tier,
                  rarity: item.rarity,
                  quantity: 1,
                }).unitSellGold;
                const totalPrice = unitPrice * item.quantity;
                const isBusy = busyKey === itemKey;

                return (
                  <View key={itemKey} style={styles.offerCard}>
                    <View style={styles.offerTop}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <View style={styles.badgeRow}>
                          <View style={[styles.rarityBadge, { borderColor: rarityColor }]}>
                            <Text style={[styles.rarityText, { color: rarityColor }]}>
                              {item.rarity}
                            </Text>
                          </View>
                          {item.tier ? (
                            <Text style={styles.categoryTag}>TIER {item.tier}</Text>
                          ) : null}
                          <Text style={styles.qtyTag}>x{item.quantity}</Text>
                        </View>
                        <Text style={styles.itemName}>{item.name}</Text>
                        {item.baseStatsSummary ? (
                          <Text style={styles.statSummary}>{item.baseStatsSummary}</Text>
                        ) : null}
                      </View>
                    </View>

                    <View style={styles.sellActionsRow}>
                      <TouchableOpacity
                        style={[styles.sellBtn, isBusy && styles.btnDisabled]}
                        onPress={() => void handleSell(itemKey, 1)}
                        disabled={isBusy}
                        activeOpacity={0.8}
                        testID={`trader-sell-one-${itemKey}`}
                      >
                        <Text style={styles.sellBtnText}>Sell 1 (+{unitPrice}g)</Text>
                      </TouchableOpacity>
                      {item.quantity > 1 ? (
                        <TouchableOpacity
                          style={[styles.sellAllBtn, isBusy && styles.btnDisabled]}
                          onPress={() => void handleSell(itemKey, item.quantity)}
                          disabled={isBusy}
                          activeOpacity={0.8}
                          testID={`trader-sell-all-${itemKey}`}
                        >
                          <Text style={styles.sellAllBtnText}>
                            Sell All (+{totalPrice}g)
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
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
    borderColor: SURFACES.hairlineStrong,
    maxWidth: 560,
    width: '100%',
    height: '82%',
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
    gap: 3,
  },
  eyebrow: {
    ...TYPOGRAPHY.eyebrow,
    color: '#F59E0B',
  },
  title: {
    ...TYPOGRAPHY.titleLg,
  },
  goldBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: 2,
  },
  goldBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.gold,
    ...TYPOGRAPHY.tabular,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: RADII.md,
    backgroundColor: SURFACES.layer2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  greeting: {
    ...TYPOGRAPHY.bodySm,
    fontStyle: 'italic',
  },
  feedbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADII.md,
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
  scroll: {
    flexShrink: 1,
  },
  scrollContent: {
    gap: SPACING.sm,
    paddingBottom: SPACING.md,
  },
  offerCard: {
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.lg,
    padding: SPACING.md,
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SURFACES.hairline,
  },
  offerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
  categoryTag: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  qtyTag: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.gold,
  },
  itemName: {
    ...TYPOGRAPHY.titleMd,
    fontSize: 14,
  },
  statSummary: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.shieldCyan,
  },
  itemDesc: {
    ...TYPOGRAPHY.bodySm,
    fontSize: 11,
  },
  buyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.gold,
    borderRadius: RADII.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  buyBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: SURFACES.canvas,
    ...TYPOGRAPHY.tabular,
  },
  sellActionsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: 4,
  },
  sellBtn: {
    flex: 1,
    backgroundColor: SURFACES.layer3,
    borderRadius: RADII.md,
    paddingVertical: 8,
    alignItems: 'center',
  },
  sellBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.gold,
  },
  sellAllBtn: {
    flex: 1,
    backgroundColor: COLORS.gold,
    borderRadius: RADII.md,
    paddingVertical: 8,
    alignItems: 'center',
  },
  sellAllBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: SURFACES.canvas,
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
    paddingHorizontal: SPACING.md,
    gap: 6,
  },
  emptyTitle: {
    ...TYPOGRAPHY.titleMd,
  },
  emptySub: {
    ...TYPOGRAPHY.bodySm,
    textAlign: 'center',
  },
});

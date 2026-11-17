import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { RpgIcon } from '../components/icons/RpgIcon';
import { NpcDialogueOverlay } from '../components/npc';
import {
  HairlineDivider,
  SegmentedControl,
  SegmentedOption,
  SlateSection,
} from '../components/ui';
import { useGame } from '../state/GameContext';
import { COLORS, RADII, SPACING, SURFACES, TYPOGRAPHY } from '../theme';
import { GatheringNodeScreen } from './GatheringNodeScreen';

export type ArtisanSubView = 'GATHER' | 'CRAFT';

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

export const ArtisanHubScreen: React.FC = () => {
  const { gold } = useGame();
  const [subView, setSubView] = useState<ArtisanSubView>('GATHER');
  const [traderOpen, setTraderOpen] = useState(false);

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
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
      </View>

      <View style={styles.body}>
        {subView === 'GATHER' ? (
          <GatheringNodeScreen />
        ) : (
          <ScrollView contentContainerStyle={styles.placeholderScroll}>
            <SlateSection
              level={1}
              eyebrow="FORGE & APOTHECARY"
              title="Crafting, Reforging & Potion Brewing"
              subtitle="Turn Mining, Foraging, Smelting, and Alchemy outputs into combat gear and belt potions in Milestone 4."
            >
              <View style={styles.featureRow}>
                <View style={styles.featureIcon}>
                  <RpgIcon name="artisan" size={16} color={COLORS.gold} />
                </View>
                <View style={styles.featureTextCol}>
                  <Text style={styles.featureTitle}>Affix Reforging & Tier Upgrades</Text>
                  <Text style={styles.featureSub}>
                    Spend ingots and essences to reroll gear prefixes, suffixes, and upgrade tiers.
                  </Text>
                </View>
              </View>
              <HairlineDivider />
              <View style={styles.featureRow}>
                <View style={styles.featureIcon}>
                  <RpgIcon name="prof-alchemy" size={16} color="#26A69A" />
                </View>
                <View style={styles.featureTextCol}>
                  <Text style={styles.featureTitle}>Combat Belt Consumables</Text>
                  <Text style={styles.featureSub}>
                    Brew vitality elixirs and stamina draughts for live turn-based boss encounters.
                  </Text>
                </View>
              </View>
              <HairlineDivider />
              <View style={styles.featureRow}>
                <View style={styles.featureIcon}>
                  <RpgIcon name="coin" size={16} color="#F59E0B" />
                </View>
                <View style={styles.featureTextCol}>
                  <Text style={styles.featureTitle}>Rotating Trader Stock</Text>
                  <Text style={styles.featureSub}>
                    Current Gold: {gold.toLocaleString()}g. Buy blueprints or sell surplus drops.
                  </Text>
                </View>
              </View>

              <View style={styles.ctaRow}>
                <TouchableOpacity
                  style={styles.primaryCta}
                  onPress={() => setTraderOpen(true)}
                  activeOpacity={0.8}
                >
                  <RpgIcon name="chat" size={14} color={SURFACES.canvas} />
                  <Text style={styles.primaryCtaText}>Talk to Bramwell</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.secondaryCta}
                  onPress={() => setSubView('GATHER')}
                  activeOpacity={0.8}
                >
                  <RpgIcon name="prof-mining" size={14} color={COLORS.textPrimary} />
                  <Text style={styles.secondaryCtaText}>Gather Nodes</Text>
                </TouchableOpacity>
              </View>
            </SlateSection>
          </ScrollView>
        )}
      </View>

      <NpcDialogueOverlay
        visible={traderOpen}
        onClose={() => setTraderOpen(false)}
        npcId="TRADER"
        dialoguePages={[
          `Good timing! Keep your Mining, Foraging, Smelting, and Alchemy nodes running — every ingot and herb feeds the Foundry.`,
          'In Milestone 4, my shop counter will rotate rare crafting blueprints, belt potions, and affix reforging kits.',
        ]}
        actionChips={[
          {
            id: 'go-gather',
            label: 'Inspect Gathering Nodes',
            icon: 'prof-mining',
            variant: 'primary',
            onPress: () => {
              setTraderOpen(false);
              setSubView('GATHER');
            },
          },
        ]}
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
  placeholderScroll: {
    padding: SPACING.md,
    gap: SPACING.md,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
  },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: RADII.md,
    backgroundColor: SURFACES.layer2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTextCol: {
    flex: 1,
    gap: 2,
  },
  featureTitle: {
    ...TYPOGRAPHY.titleMd,
    fontSize: 14,
  },
  featureSub: {
    ...TYPOGRAPHY.bodySm,
  },
  ctaRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  primaryCta: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.gold,
    borderRadius: RADII.md,
    paddingVertical: 11,
  },
  primaryCtaText: {
    fontSize: 12,
    fontWeight: '800',
    color: SURFACES.canvas,
  },
  secondaryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.md,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  secondaryCtaText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
});

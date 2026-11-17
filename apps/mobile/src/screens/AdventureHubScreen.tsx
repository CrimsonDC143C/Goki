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
import { DungeonScreen } from './DungeonScreen';

export type AdventureSubView = 'EXPEDITIONS' | 'GUILD_QUESTS';

const SUB_OPTIONS: ReadonlyArray<SegmentedOption<AdventureSubView>> = [
  {
    key: 'EXPEDITIONS',
    label: 'Expeditions (24h)',
    icon: 'dungeon',
    testID: 'adventure-subtab-expeditions',
  },
  {
    key: 'GUILD_QUESTS',
    label: 'Guild Quests',
    icon: 'adventure',
    testID: 'adventure-subtab-quests',
  },
];

export const AdventureHubScreen: React.FC = () => {
  const { adventurerRank, characterName } = useGame();
  const [subView, setSubView] = useState<AdventureSubView>('EXPEDITIONS');
  const [receptionistOpen, setReceptionistOpen] = useState(false);

  return (
    <View style={styles.root}>
      {/* Sub-View Bar + Guild Receptionist NPC */}
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
          onPress={() => setReceptionistOpen(true)}
          activeOpacity={0.75}
          testID="adventure-npc-btn"
        >
          <RpgIcon name="chat" size={14} color="#38BDF8" />
          <Text style={styles.npcBtnText}>Guild Desk</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        {subView === 'EXPEDITIONS' ? (
          <DungeonScreen />
        ) : (
          <ScrollView contentContainerStyle={styles.placeholderScroll}>
            <SlateSection
              level={1}
              eyebrow={`ADVENTURER'S GUILD • RANK ${adventurerRank}`}
              title="Live Turn-Based Quests & Trials"
              subtitle="Interactive tactical dungeons arrive in Milestone 3 alongside 24-hour Expeditions."
            >
              <View style={styles.featureRow}>
                <View style={styles.featureIcon}>
                  <RpgIcon name="combat" size={16} color={COLORS.gold} />
                </View>
                <View style={styles.featureTextCol}>
                  <Text style={styles.featureTitle}>AGI-Ordered Turn Combat</Text>
                  <Text style={styles.featureSub}>
                    Basic Attack, Guard/Parry, Belt Consumables, and up to 4 equipped Talent Active Skills.
                  </Text>
                </View>
              </View>
              <HairlineDivider />
              <View style={styles.featureRow}>
                <View style={styles.featureIcon}>
                  <RpgIcon name="banners" size={16} color="#38BDF8" />
                </View>
                <View style={styles.featureTextCol}>
                  <Text style={styles.featureTitle}>Unlimited Live Quests + Rank Trials</Text>
                  <Text style={styles.featureSub}>
                    Zero stamina gate: real-world workouts grow your stats, gear, and rank eligibility.
                  </Text>
                </View>
              </View>
              <HairlineDivider />
              <View style={styles.featureRow}>
                <View style={styles.featureIcon}>
                  <RpgIcon name="shield" size={16} color="#A855F7" />
                </View>
                <View style={styles.featureTextCol}>
                  <Text style={styles.featureTitle}>Solo or Company Squadmates</Text>
                  <Text style={styles.featureSub}>
                    Bring AI-controlled Adventurer Company allies now, with real-time co-op ready later.
                  </Text>
                </View>
              </View>

              <View style={styles.ctaRow}>
                <TouchableOpacity
                  style={styles.primaryCta}
                  onPress={() => setReceptionistOpen(true)}
                  activeOpacity={0.8}
                >
                  <RpgIcon name="chat" size={14} color={SURFACES.canvas} />
                  <Text style={styles.primaryCtaText}>Speak with Lyra Vance</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.secondaryCta}
                  onPress={() => setSubView('EXPEDITIONS')}
                  activeOpacity={0.8}
                >
                  <RpgIcon name="dungeon" size={14} color={COLORS.textPrimary} />
                  <Text style={styles.secondaryCtaText}>24h Expeditions</Text>
                </TouchableOpacity>
              </View>
            </SlateSection>
          </ScrollView>
        )}
      </View>

      <NpcDialogueOverlay
        visible={receptionistOpen}
        onClose={() => setReceptionistOpen(false)}
        npcId="GUILD_RECEPTIONIST"
        dialoguePages={[
          `Welcome to the Adventurer's Guild, ${characterName || 'Adventurer'}. Your current standing is ${adventurerRank} Rank.`,
          'Passive 24-hour Expeditions are ready on the Expeditions tab right now. Live turn-based Guild Contracts will open from this desk in Milestone 3.',
        ]}
        actionChips={[
          {
            id: 'go-expeditions',
            label: 'Launch 24h Expedition',
            icon: 'dungeon',
            variant: 'primary',
            onPress: () => {
              setReceptionistOpen(false);
              setSubView('EXPEDITIONS');
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
    color: '#38BDF8',
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

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
import { GuildHallScreen } from './GuildHallScreen';

export type SocialSubView = 'CLAN_RAID' | 'COMPANY' | 'ARENA';

const SUB_OPTIONS: ReadonlyArray<SegmentedOption<SocialSubView>> = [
  {
    key: 'CLAN_RAID',
    label: 'Clan & Raid',
    icon: 'raid',
    testID: 'social-subtab-clan',
  },
  {
    key: 'COMPANY',
    label: 'Company',
    icon: 'social',
    testID: 'social-subtab-company',
  },
  {
    key: 'ARENA',
    label: 'Arena',
    icon: 'trophy',
    testID: 'social-subtab-arena',
  },
];

export const SocialHubScreen: React.FC = () => {
  const { guildName } = useGame();
  const [subView, setSubView] = useState<SocialSubView>('CLAN_RAID');
  const [quartermasterOpen, setQuartermasterOpen] = useState(false);

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
          onPress={() => setQuartermasterOpen(true)}
          activeOpacity={0.75}
          testID="social-npc-btn"
        >
          <RpgIcon name="banners" size={14} color="#A855F7" />
          <Text style={styles.npcBtnText}>Warden</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        {subView === 'CLAN_RAID' ? (
          <GuildHallScreen />
        ) : subView === 'COMPANY' ? (
          <ScrollView contentContainerStyle={styles.placeholderScroll}>
            <SlateSection
              level={1}
              eyebrow="ADVENTURER COMPANIES"
              title="Cross-Gym 30-Member Roster & 4-Player Squad"
              subtitle="Create or join a cross-gym Company in Milestone 5 for shared quests and AI/live squad combat."
            >
              <View style={styles.featureRow}>
                <View style={styles.featureIcon}>
                  <RpgIcon name="social" size={16} color="#A855F7" />
                </View>
                <View style={styles.featureTextCol}>
                  <Text style={styles.featureTitle}>Up to 30 Roster Members</Text>
                  <Text style={styles.featureSub}>
                    Train with friends across any real-world gym or home setup without location locks.
                  </Text>
                </View>
              </View>
              <HairlineDivider />
              <View style={styles.featureRow}>
                <View style={styles.featureIcon}>
                  <RpgIcon name="combat" size={16} color={COLORS.gold} />
                </View>
                <View style={styles.featureTextCol}>
                  <Text style={styles.featureTitle}>4-Player Active Squad</Text>
                  <Text style={styles.featureSub}>
                    Designate 4 squadmates to join your turn-based dungeon runs and boss strikes.
                  </Text>
                </View>
              </View>
              <View style={styles.ctaRow}>
                <TouchableOpacity
                  style={styles.primaryCta}
                  onPress={() => setQuartermasterOpen(true)}
                  activeOpacity={0.8}
                >
                  <RpgIcon name="chat" size={14} color={SURFACES.canvas} />
                  <Text style={styles.primaryCtaText}>Brief with Commander Veyra</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.secondaryCta}
                  onPress={() => setSubView('CLAN_RAID')}
                  activeOpacity={0.8}
                >
                  <RpgIcon name="raid" size={14} color={COLORS.textPrimary} />
                  <Text style={styles.secondaryCtaText}>Weekly Raids</Text>
                </TouchableOpacity>
              </View>
            </SlateSection>
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={styles.placeholderScroll}>
            <SlateSection
              level={1}
              eyebrow="GYM CLANS & ASYNC ARENA"
              title="Venue Clans, Leaderboards & Sparring"
              subtitle="Location-deduped Real-World Gym Clans, Friends, and Async Arena sparring arrive in Milestone 5."
            >
              <View style={styles.featureRow}>
                <View style={styles.featureIcon}>
                  <RpgIcon name="shield" size={16} color="#26A69A" />
                </View>
                <View style={styles.featureTextCol}>
                  <Text style={styles.featureTitle}>Dual Clan Membership</Text>
                  <Text style={styles.featureSub}>
                    Belong to 1 real-world Gym Clan plus the Home / Open-World Clan ({guildName}) for weekly Raids.
                  </Text>
                </View>
              </View>
              <HairlineDivider />
              <View style={styles.featureRow}>
                <View style={styles.featureIcon}>
                  <RpgIcon name="trophy" size={16} color={COLORS.gold} />
                </View>
                <View style={styles.featureTextCol}>
                  <Text style={styles.featureTitle}>Seasonal Standings & Arena Sparring</Text>
                  <Text style={styles.featureSub}>
                    Friendly asynchronous AI combat sparring and monthly Gym Clan seasonal rankings.
                  </Text>
                </View>
              </View>
              <View style={styles.ctaRow}>
                <TouchableOpacity
                  style={styles.primaryCta}
                  onPress={() => setSubView('CLAN_RAID')}
                  activeOpacity={0.8}
                >
                  <RpgIcon name="raid" size={14} color={SURFACES.canvas} />
                  <Text style={styles.primaryCtaText}>View Active Raids & Bounties</Text>
                </TouchableOpacity>
              </View>
            </SlateSection>
          </ScrollView>
        )}
      </View>

      <NpcDialogueOverlay
        visible={quartermasterOpen}
        onClose={() => setQuartermasterOpen(false)}
        npcId="QUARTERMASTER"
        dialoguePages={[
          `Your current affiliation is ${guildName}. Bounties, Rank-Up Trials, and 7-Day Weekly Raid Bosses are live in Clan & Raid.`,
          'In Milestone 5, I will manage Adventurer Company rosters (up to 30 members, 4 active squadmates) alongside real-world Gym Clans and Async Arena sparring.',
        ]}
        actionChips={[
          {
            id: 'go-clan-raid',
            label: 'Open Weekly Raids',
            icon: 'raid',
            variant: 'primary',
            onPress: () => {
              setQuartermasterOpen(false);
              setSubView('CLAN_RAID');
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
    color: '#A855F7',
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

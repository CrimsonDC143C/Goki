import React, { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { DiscoveredGymVenueDto, SocialGymClanDto } from '../../api/apiClient';
import { GuildHallScreen } from '../../screens/GuildHallScreen';
import { COLORS, RADII, SPACING, SURFACES, TYPOGRAPHY } from '../../theme';
import { RpgIcon } from '../icons/RpgIcon';
import { HairlineDivider, SlateSection } from '../ui';

export interface ClanAndRaidViewProps {
  homeClanName: string;
  homeClanSeasonPoints: number;
  activeGymClan: SocialGymClanDto | null;
  discoveredVenues: DiscoveredGymVenueDto[];
  searchingGyms: boolean;
  busyAction: boolean;
  statusMessage: string | null;
  onSearchGyms: (query: string) => void;
  onJoinVenue: (venue: DiscoveredGymVenueDto) => void;
  onSubmitCustomVenue: (input: {
    name: string;
    city: string;
    latitude: number;
    longitude: number;
  }) => void;
  onLeaveGymClan: () => void;
  onOpenWardenBriefing: () => void;
}

export const ClanAndRaidView: React.FC<ClanAndRaidViewProps> = ({
  homeClanName,
  homeClanSeasonPoints,
  activeGymClan,
  discoveredVenues,
  searchingGyms,
  busyAction,
  statusMessage,
  onSearchGyms,
  onJoinVenue,
  onSubmitCustomVenue,
  onLeaveGymClan,
  onOpenWardenBriefing,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [submitName, setSubmitName] = useState('');
  const [submitCity, setSubmitCity] = useState('');
  const [submitLat, setSubmitLat] = useState('37.7749');
  const [submitLon, setSubmitLon] = useState('-122.4194');
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmitVenue = () => {
    const trimmedName = submitName.trim();
    if (trimmedName.length < 2) {
      setFormError('Enter a gym name (at least 2 characters).');
      return;
    }
    const parsedLat = Number(submitLat);
    const parsedLon = Number(submitLon);
    if (!Number.isFinite(parsedLat) || parsedLat < -90 || parsedLat > 90) {
      setFormError('Latitude must be between -90 and 90.');
      return;
    }
    if (!Number.isFinite(parsedLon) || parsedLon < -180 || parsedLon > 180) {
      setFormError('Longitude must be between -180 and 180.');
      return;
    }
    setFormError(null);
    onSubmitCustomVenue({
      name: trimmedName,
      city: submitCity.trim() || 'Local District',
      latitude: parsedLat,
      longitude: parsedLon,
    });
    setSubmitName('');
  };

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      nestedScrollEnabled
      keyboardShouldPersistTaps="handled"
    >
      {statusMessage ? (
        <View style={styles.statusBanner}>
          <RpgIcon name="check" size={14} color={COLORS.gold} />
          <Text style={styles.statusText}>{statusMessage}</Text>
        </View>
      ) : null}

      {/* Dual Clan Membership Banner */}
      <SlateSection
        level={1}
        eyebrow="DUAL CLAN MEMBERSHIP"
        title="Home Sanctum & Real-World Gym Clan"
        subtitle="Stay enrolled in the Open-World Sanctum while claiming 1 coordinate-deduped gym venue."
        rightAction={
          <TouchableOpacity
            style={styles.briefBtn}
            onPress={onOpenWardenBriefing}
            activeOpacity={0.75}
          >
            <RpgIcon name="shield" size={13} color="#26A69A" />
            <Text style={styles.briefBtnText}>Torin</Text>
          </TouchableOpacity>
        }
      >
        {/* 1. Default Home Clan */}
        <View style={styles.membershipCard}>
          <View style={styles.membershipHeaderRow}>
            <View style={styles.iconCircleHome}>
              <RpgIcon name="hub" size={16} color={COLORS.gold} />
            </View>
            <View style={styles.membershipInfoCol}>
              <Text style={styles.membershipTitle}>{homeClanName}</Text>
              <Text style={styles.membershipSub}>
                Season Contribution: {homeClanSeasonPoints.toLocaleString()} pts
              </Text>
            </View>
            <View style={styles.homeBadge}>
              <Text style={styles.homeBadgeText}>Always Enrolled • Public Weekly Raid</Text>
            </View>
          </View>
        </View>

        <HairlineDivider spacing={SPACING.sm} />

        {/* 2. Real-World Gym Clan */}
        {activeGymClan ? (
          <View style={styles.membershipCard} testID="active-gym-clan-card">
            <View style={styles.membershipHeaderRow}>
              <View style={styles.iconCircleGym}>
                <RpgIcon name="pin" size={16} color="#26A69A" />
              </View>
              <View style={styles.membershipInfoCol}>
                <Text style={styles.membershipTitle}>
                  {activeGymClan.name} [{activeGymClan.tag}]
                </Text>
                <Text style={styles.membershipSub}>
                  {activeGymClan.city || 'Sanctioned Venue'} •{' '}
                  {(activeGymClan.seasonPoints ?? 0).toLocaleString()} season pts •{' '}
                  {activeGymClan.memberCount ?? 1} member
                  {(activeGymClan.memberCount ?? 1) === 1 ? '' : 's'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.leaveBtn}
                onPress={onLeaveGymClan}
                disabled={busyAction}
                activeOpacity={0.8}
                testID="gym-leave-btn"
              >
                <Text style={styles.leaveBtnText}>Leave Gym Clan</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.emptyGymBox}>
            <RpgIcon name="compass" size={16} color={COLORS.textSecondary} />
            <Text style={styles.emptyGymText}>
              No Real-World Gym Clan claimed yet. Search nearby gyms or submit your training venue
              below.
            </Text>
          </View>
        )}
      </SlateSection>

      {/* Gym Discovery & Submission */}
      <SlateSection
        level={1}
        eyebrow="VENUE DISCOVERY & SUBMISSION"
        title="Claim or Join a Real-World Gym"
        subtitle="Venues within 150m automatically deduplicate to prevent duplicate clans."
        style={styles.sectionGap}
      >
        <View style={styles.searchRow}>
          <TextInput
            style={styles.inputFlex}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search gym name or city..."
            placeholderTextColor={COLORS.textMuted}
            returnKeyType="search"
            onSubmitEditing={() => onSearchGyms(searchQuery)}
            testID="gym-search-input"
          />
          <TouchableOpacity
            style={styles.searchBtn}
            onPress={() => onSearchGyms(searchQuery)}
            disabled={searchingGyms}
            activeOpacity={0.8}
            testID="gym-search-btn"
          >
            {searchingGyms ? (
              <ActivityIndicator size="small" color={SURFACES.canvas} />
            ) : (
              <>
                <RpgIcon name="compass" size={14} color={SURFACES.canvas} />
                <Text style={styles.searchBtnText}>Search</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.venueList}>
          {discoveredVenues.map((venue, index) => {
            const isJoined =
              activeGymClan?.venueKey === venue.venueKey ||
              (activeGymClan?.id &&
                (activeGymClan.id === venue.clanId || activeGymClan.id === venue.id));
            return (
              <View key={venue.venueKey || `${venue.name}-${index}`} style={styles.venueRow}>
                <View style={styles.venueInfoCol}>
                  <Text style={styles.venueName}>
                    {venue.name}
                    {venue.tag ? ` [${venue.tag}]` : ''}
                  </Text>
                  <Text style={styles.venueMeta}>
                    {venue.city || venue.address || 'Sanctioned Venue'} •{' '}
                    {venue.venueSource === 'OSM_OVERPASS' || venue.venueSource === 'OPENSTREETMAP'
                      ? 'OSM Verified'
                      : 'Community'}
                    {typeof venue.distanceMeters === 'number'
                      ? ` • ${Math.round(venue.distanceMeters)}m`
                      : ''}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.joinBtn, isJoined && styles.joinBtnJoined]}
                  onPress={() => onJoinVenue(venue)}
                  disabled={busyAction || Boolean(isJoined)}
                  activeOpacity={0.8}
                  testID={`gym-join-btn-${index}`}
                >
                  <View
                    style={styles.joinBtnInner}
                    testID={index === 0 ? 'gym-join-venue-btn' : undefined}
                  >
                    <Text style={[styles.joinBtnText, isJoined && styles.joinBtnTextJoined]}>
                      {isJoined ? 'Joined' : 'Join Clan'}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            );
          })}
          {discoveredVenues.length === 0 ? (
            <Text style={styles.noVenuesText}>
              No matching venues found. Submit your gym coordinates below to claim it.
            </Text>
          ) : null}
        </View>

        <HairlineDivider spacing={SPACING.md} />

        <Text style={styles.subFormHeading}>Submit New Gym Venue</Text>
        <View style={styles.formGrid}>
          <View style={styles.formRow}>
            <TextInput
              style={styles.inputFlex}
              value={submitName}
              onChangeText={setSubmitName}
              placeholder="Gym name (e.g. Iron Forge Gym)"
              placeholderTextColor={COLORS.textMuted}
              testID="gym-submit-name-input"
            />
            <TextInput
              style={styles.inputCity}
              value={submitCity}
              onChangeText={setSubmitCity}
              placeholder="City"
              placeholderTextColor={COLORS.textMuted}
              testID="gym-submit-city-input"
            />
          </View>
          <View style={styles.formRow}>
            <TextInput
              style={styles.inputFlex}
              value={submitLat}
              onChangeText={setSubmitLat}
              placeholder="Latitude"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="numeric"
              testID="gym-submit-lat-input"
            />
            <TextInput
              style={styles.inputFlex}
              value={submitLon}
              onChangeText={setSubmitLon}
              placeholder="Longitude"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="numeric"
              testID="gym-submit-lon-input"
            />
          </View>
          {formError ? <Text style={styles.errorText}>{formError}</Text> : null}
          <TouchableOpacity
            style={styles.submitBtn}
            onPress={handleSubmitVenue}
            disabled={busyAction}
            activeOpacity={0.8}
            testID="gym-submit-btn"
          >
            <RpgIcon name="plus" size={14} color={SURFACES.canvas} />
            <Text style={styles.submitBtnText}>Submit &amp; Claim Gym Clan</Text>
          </TouchableOpacity>
        </View>
      </SlateSection>

      {/* Embedded Guild Hall (Bounties & 7-Day Weekly Boss Raids) */}
      <View style={styles.raidEmbedWrap}>
        <GuildHallScreen embedded />
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xxl,
    gap: SPACING.md,
  },
  sectionGap: {
    marginTop: 0,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderWidth: 1,
    borderColor: SURFACES.goldHairline,
  },
  statusText: {
    ...TYPOGRAPHY.bodySm,
    color: COLORS.gold,
    flex: 1,
  },
  briefBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.sm,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  briefBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#26A69A',
  },
  membershipCard: {
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.md,
    padding: SPACING.md,
  },
  membershipHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flexWrap: 'wrap',
  },
  iconCircleHome: {
    width: 34,
    height: 34,
    borderRadius: RADII.md,
    backgroundColor: COLORS.goldDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleGym: {
    width: 34,
    height: 34,
    borderRadius: RADII.md,
    backgroundColor: COLORS.enduranceDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  membershipInfoCol: {
    flex: 1,
    minWidth: 160,
    gap: 2,
  },
  membershipTitle: {
    ...TYPOGRAPHY.titleMd,
    fontSize: 14,
  },
  membershipSub: {
    ...TYPOGRAPHY.bodySm,
  },
  homeBadge: {
    backgroundColor: SURFACES.layer3,
    borderRadius: RADII.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: SURFACES.goldHairline,
  },
  homeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.gold,
  },
  leaveBtn: {
    backgroundColor: COLORS.strengthDim,
    borderRadius: RADII.sm,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: COLORS.strength,
  },
  leaveBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.strength,
  },
  emptyGymBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.md,
    padding: SPACING.md,
  },
  emptyGymText: {
    ...TYPOGRAPHY.bodySm,
    flex: 1,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  inputFlex: {
    flex: 1,
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    color: COLORS.textPrimary,
    fontSize: 13,
    borderWidth: 1,
    borderColor: SURFACES.hairlineStrong,
  },
  inputCity: {
    width: 115,
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    color: COLORS.textPrimary,
    fontSize: 13,
    borderWidth: 1,
    borderColor: SURFACES.hairlineStrong,
  },
  searchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.gold,
    borderRadius: RADII.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 40,
  },
  searchBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: SURFACES.canvas,
  },
  venueList: {
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },
  venueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.md,
    padding: SPACING.md,
  },
  venueInfoCol: {
    flex: 1,
    gap: 2,
  },
  venueName: {
    ...TYPOGRAPHY.titleMd,
    fontSize: 13,
  },
  venueMeta: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
  },
  joinBtn: {
    backgroundColor: '#26A69A',
    borderRadius: RADII.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  joinBtnJoined: {
    backgroundColor: SURFACES.layer3,
    borderWidth: 1,
    borderColor: SURFACES.hairlineStrong,
  },
  joinBtnInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: SURFACES.canvas,
  },
  joinBtnTextJoined: {
    color: COLORS.textSecondary,
  },
  noVenuesText: {
    ...TYPOGRAPHY.bodySm,
    fontStyle: 'italic',
  },
  subFormHeading: {
    ...TYPOGRAPHY.eyebrow,
    marginBottom: SPACING.sm,
  },
  formGrid: {
    gap: SPACING.sm,
  },
  formRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.danger,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.gold,
    borderRadius: RADII.md,
    paddingVertical: 11,
  },
  submitBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: SURFACES.canvas,
  },
  raidEmbedWrap: {
    marginHorizontal: -SPACING.md,
  },
});

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  ArenaFighterSnapshot,
  DEFAULT_ARENA_RIVAL_PRESETS,
  OPEN_WORLD_HOME_CLAN_NAME,
  OPEN_WORLD_HOME_CLAN_TAG,
  TurnBasedPartyMemberInput,
  buildCanonicalVenueKey,
  findDeduplicatedVenueMatch,
  getCurrentSeasonKey,
  simulateAsyncArenaMatch,
  validateCompanySquadAssignment,
} from '@goki/game-engine';
import {
  ArenaMatchSummaryDto,
  ArenaOpponentDto,
  DiscoveredGymVenueDto,
  SocialCompanyDto,
  SocialFriendItemDto,
  SocialFriendsOverviewDto,
  SocialGymClanDto,
  SocialLeaderboardCategory,
  SocialLeaderboardEntryDto,
  claimOrJoinGymClanApi,
  createCompanyApi,
  discoverGymsApi,
  fetchArenaOpponentsApi,
  fetchCompaniesApi,
  fetchCompanyDetailApi,
  fetchFriendsApi,
  fetchSocialLeaderboardsApi,
  fetchSocialOverviewApi,
  joinCompanyApi,
  leaveCompanyApi,
  leaveGymClanApi,
  removeFriendApi,
  respondFriendRequestApi,
  sendFriendRequestApi,
  sparArenaApi,
  updateCompanySquadApi,
} from '../api/apiClient';
import { RpgIcon, RpgIconName } from '../components/icons/RpgIcon';
import { NpcDialogueOverlay } from '../components/npc';
import { AdventurerCompanyView } from '../components/social/AdventurerCompanyView';
import { AsyncArenaView } from '../components/social/AsyncArenaView';
import { ClanAndRaidView } from '../components/social/ClanAndRaidView';
import { FriendsView } from '../components/social/FriendsView';
import { SocialLeaderboardsView } from '../components/social/SocialLeaderboardsView';
import { useGame } from '../state/GameContext';
import { COLORS, RADII, SPACING, SURFACES } from '../theme';

export type SocialSubView = 'CLAN_RAID' | 'COMPANY' | 'FRIENDS' | 'LEADERBOARDS' | 'ARENA';

const SUB_OPTIONS: ReadonlyArray<{
  key: SocialSubView;
  label: string;
  icon: RpgIconName;
  testID: string;
}> = [
  {
    key: 'CLAN_RAID',
    label: 'My Clan & Raid',
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
    key: 'FRIENDS',
    label: 'Friends',
    icon: 'chat',
    testID: 'social-subtab-friends',
  },
  {
    key: 'LEADERBOARDS',
    label: 'Leaderboards',
    icon: 'banners',
    testID: 'social-subtab-leaderboards',
  },
  {
    key: 'ARENA',
    label: 'Arena',
    icon: 'trophy',
    testID: 'social-subtab-arena',
  },
];

const SEEDED_DISCOVERED_VENUES: DiscoveredGymVenueDto[] = [
  {
    id: 'venue_iron_temple_barbell',
    clanId: 'clan_iron_temple_barbell',
    venueKey: 'osm:node:900101',
    name: 'Iron Temple Barbell',
    tag: 'ITB',
    city: 'San Francisco',
    address: '412 Foundry Ave',
    latitude: 37.7749,
    longitude: -122.4194,
    venueSource: 'OSM_OVERPASS',
    osmElementType: 'node',
    osmElementId: '900101',
    distanceMeters: 180,
    memberCount: 18,
    seasonPoints: 4250,
  },
  {
    id: 'venue_summit_strength_lab',
    clanId: 'clan_summit_strength_lab',
    venueKey: 'osm:node:900102',
    name: 'Summit Strength Lab',
    tag: 'SSL',
    city: 'San Francisco',
    address: '890 Ridge St',
    latitude: 37.7812,
    longitude: -122.4098,
    venueSource: 'OSM_OVERPASS',
    osmElementType: 'node',
    osmElementId: '900102',
    distanceMeters: 640,
    memberCount: 14,
    seasonPoints: 3680,
  },
  {
    id: 'venue_vanguard_athletic',
    clanId: 'clan_vanguard_athletic',
    venueKey: 'osm:way:900103',
    name: 'Vanguard Athletic Club',
    tag: 'VAC',
    city: 'Oakland',
    address: '205 Harbor Blvd',
    latitude: 37.8044,
    longitude: -122.2712,
    venueSource: 'OSM_OVERPASS',
    osmElementType: 'way',
    osmElementId: '900103',
    distanceMeters: 1420,
    memberCount: 11,
    seasonPoints: 2940,
  },
];

const SEEDED_COMPANIES: SocialCompanyDto[] = [
  {
    id: 'company_silver_shield',
    name: 'Order of the Silver Shield',
    tag: 'OSSH',
    motto: 'Steady reps, unbroken line.',
    commanderCharacterId: 'npc_commander_kael',
    companyLevel: 4,
    companyReputation: 2850,
    maxRosterSize: 30,
    maxActiveSquadSize: 4,
    memberCount: 3,
    members: [
      {
        characterId: 'npc_commander_kael',
        characterName: 'Kael Ironhand',
        overallLevel: 8,
        race: 'HUMAN',
        role: 'COMMANDER',
        activeSquadSlot: 1,
        contributedReputation: 1200,
      },
      {
        characterId: 'npc_alyx_swift',
        characterName: 'Alyx Swiftstride',
        overallLevel: 7,
        race: 'KITSUNE',
        role: 'OFFICER',
        activeSquadSlot: 2,
        contributedReputation: 940,
      },
      {
        characterId: 'npc_borin_oak',
        characterName: 'Borin Oakshield',
        overallLevel: 6,
        race: 'ONI',
        role: 'MEMBER',
        activeSquadSlot: 3,
        contributedReputation: 710,
      },
    ],
  },
  {
    id: 'company_crimson_dawn',
    name: 'Crimson Dawn Vanguard',
    tag: 'CDVN',
    motto: 'PRs at sunrise, raids by dusk.',
    commanderCharacterId: 'npc_commander_sera',
    companyLevel: 3,
    companyReputation: 1920,
    maxRosterSize: 30,
    maxActiveSquadSize: 4,
    memberCount: 2,
    members: [
      {
        characterId: 'npc_commander_sera',
        characterName: 'Sera Embercrest',
        overallLevel: 7,
        race: 'KITSUNE',
        role: 'COMMANDER',
        activeSquadSlot: 1,
        contributedReputation: 1100,
      },
      {
        characterId: 'npc_toren_wall',
        characterName: 'Toren Stonewall',
        overallLevel: 5,
        race: 'ONI',
        role: 'MEMBER',
        activeSquadSlot: 2,
        contributedReputation: 820,
      },
    ],
  },
];

const SEEDED_FRIENDS: SocialFriendsOverviewDto = {
  accepted: [
    {
      friendshipId: 'friend_demo_lyra',
      userId: 'user_demo_lyra',
      username: 'lyra_lifts',
      characterId: 'friend_char_lyra',
      characterName: 'Lyra Vanguard',
      overallLevel: 6,
      gymClanTag: 'ITB',
      arenaRating: 1085,
      status: 'ACCEPTED',
    },
  ],
  incoming: [
    {
      friendshipId: 'friend_req_torin',
      userId: 'user_demo_marcus',
      username: 'marcus_iron',
      characterId: 'friend_char_marcus',
      characterName: 'Marcus Ironhide',
      overallLevel: 5,
      gymClanTag: 'SSL',
      arenaRating: 1030,
      status: 'PENDING',
      direction: 'INCOMING',
    },
  ],
  outgoing: [],
};

function buildVenueTag(name: string): string {
  const letters = name
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  return (letters || name.replace(/[^a-zA-Z]/g, '').toUpperCase() || 'GYM').slice(0, 4);
}

export const SocialHubScreen: React.FC = () => {
  const {
    serverOnline,
    isAuthenticated,
    currentUser,
    activeCharacterId,
    characterName,
    overallLevel,
    race,
    appearanceId,
    customizationConfig,
    stats,
    equipmentBonuses,
    unlockedTalentRanks,
    activeSkillLoadout,
    beltLoadout,
    guildName,
    setGuildName,
    guildReputation,
    workoutsLoggedCount,
    companionRoster,
  } = useGame();

  const resolvedHeroId = activeCharacterId || 'player_hero';
  const resolvedHeroName = characterName || 'Adventurer';
  const isOnlineSocialReady = Boolean(
    serverOnline &&
      isAuthenticated &&
      activeCharacterId &&
      !activeCharacterId.startsWith('local_')
  );

  const [subView, setSubView] = useState<SocialSubView>('CLAN_RAID');
  const [wardenOpen, setWardenOpen] = useState(false);
  const [quartermasterOpen, setQuartermasterOpen] = useState(false);

  // Clan & Gym discovery state
  const [activeGymClan, setActiveGymClan] = useState<SocialGymClanDto | null>(null);
  const [knownVenues, setKnownVenues] = useState<DiscoveredGymVenueDto[]>(SEEDED_DISCOVERED_VENUES);
  const [discoveredVenues, setDiscoveredVenues] =
    useState<DiscoveredGymVenueDto[]>(SEEDED_DISCOVERED_VENUES);
  const [searchingGyms, setSearchingGyms] = useState(false);
  const [clanStatusMsg, setClanStatusMsg] = useState<string | null>(null);

  // Company state
  const [activeCompany, setActiveCompany] = useState<SocialCompanyDto | null>(null);
  const [availableCompanies, setAvailableCompanies] = useState<SocialCompanyDto[]>(SEEDED_COMPANIES);
  const [companyStatusMsg, setCompanyStatusMsg] = useState<string | null>(null);

  // Friends state
  const [friends, setFriends] = useState<SocialFriendsOverviewDto>(SEEDED_FRIENDS);
  const [friendsStatusMsg, setFriendsStatusMsg] = useState<string | null>(null);

  // Leaderboards state
  const [leaderboardCategory, setLeaderboardCategory] =
    useState<SocialLeaderboardCategory>('GYM_CLANS');
  const [leaderboardSeasonKey, setLeaderboardSeasonKey] = useState<string>(getCurrentSeasonKey());
  const [leaderboardEntries, setLeaderboardEntries] = useState<SocialLeaderboardEntryDto[]>([]);
  const [loadingLeaderboards, setLoadingLeaderboards] = useState(false);

  // Async Arena state
  const [arenaRating, setArenaRating] = useState(1000);
  const [arenaWins, setArenaWins] = useState(0);
  const [arenaLosses, setArenaLosses] = useState(0);
  const [includeSquad, setIncludeSquad] = useState(true);
  const [serverOpponents, setServerOpponents] = useState<ArenaOpponentDto[]>([]);
  const [lastArenaMatch, setLastArenaMatch] = useState<ArenaMatchSummaryDto | null>(null);
  const [arenaMatchHistory, setArenaMatchHistory] = useState<ArenaMatchSummaryDto[]>([]);
  const [sparringOpponentId, setSparringOpponentId] = useState<string | null>(null);

  const [busyAction, setBusyAction] = useState(false);

  const homeClanLabel = `${OPEN_WORLD_HOME_CLAN_NAME} [${OPEN_WORLD_HOME_CLAN_TAG}]`;
  const homeSeasonPoints = Math.max(
    150,
    workoutsLoggedCount * 50 + Math.round(guildReputation / 5) + arenaWins * 35
  );

  const buildLocalLeaderboards = useCallback(
    (category: SocialLeaderboardCategory): SocialLeaderboardEntryDto[] => {
      if (category === 'GYM_CLANS') {
        const rows: SocialLeaderboardEntryDto[] = [
          {
            rank: 1,
            id: 'open_world_home',
            name: OPEN_WORLD_HOME_CLAN_NAME,
            tag: OPEN_WORLD_HOME_CLAN_TAG,
            subtitle: 'Default Open-World Clan',
            workoutPoints: 4200,
            raidPoints: 1850,
            arenaPoints: 740,
            totalPoints: 6790 + homeSeasonPoints,
          },
          ...knownVenues.map((v, idx) => ({
            rank: idx + 2,
            id: v.clanId || v.venueKey,
            name: v.name,
            tag: v.tag || buildVenueTag(v.name),
            subtitle: v.city || 'Sanctioned Gym Venue',
            workoutPoints: Math.round((v.seasonPoints ?? 2400) * 0.65),
            raidPoints: Math.round((v.seasonPoints ?? 2400) * 0.25),
            arenaPoints: Math.round((v.seasonPoints ?? 2400) * 0.1),
            totalPoints: v.seasonPoints ?? 2400,
          })),
        ];
        if (
          activeGymClan &&
          !rows.some((r) => r.id === activeGymClan.id || r.name === activeGymClan.name)
        ) {
          rows.push({
            rank: rows.length + 1,
            id: activeGymClan.id,
            name: activeGymClan.name,
            tag: activeGymClan.tag,
            subtitle: activeGymClan.city || 'Your Gym Clan',
            workoutPoints: Math.max(150, workoutsLoggedCount * 50),
            raidPoints: Math.round(guildReputation / 4),
            arenaPoints: arenaWins * 35,
            totalPoints: activeGymClan.seasonPoints ?? 450,
          });
        }
        return rows
          .sort((a, b) => b.totalPoints - a.totalPoints)
          .map((entry, idx) => ({ ...entry, rank: idx + 1 }));
      }

      if (category === 'COMPANIES') {
        const pool = activeCompany
          ? [activeCompany, ...availableCompanies.filter((c) => c.id !== activeCompany.id)]
          : availableCompanies;
        return pool
          .map((c, idx) => ({
            rank: idx + 1,
            id: c.id,
            name: c.name,
            tag: c.tag,
            subtitle: `${c.memberCount}/${c.maxRosterSize} Members`,
            workoutPoints: Math.round(c.companyReputation * 0.55),
            raidPoints: Math.round(c.companyReputation * 0.3),
            arenaPoints: Math.round(c.companyReputation * 0.15),
            totalPoints: c.companyReputation,
          }))
          .sort((a, b) => b.totalPoints - a.totalPoints)
          .map((entry, idx) => ({ ...entry, rank: idx + 1 }));
      }

      if (category === 'ARENA') {
        const rows: SocialLeaderboardEntryDto[] = [
          {
            rank: 1,
            id: resolvedHeroId,
            name: resolvedHeroName,
            tag: activeGymClan?.tag || OPEN_WORLD_HOME_CLAN_TAG,
            subtitle: `${arenaWins}W - ${arenaLosses}L`,
            workoutPoints: workoutsLoggedCount * 50,
            raidPoints: 0,
            arenaPoints: arenaRating,
            totalPoints: arenaRating,
            wins: arenaWins,
            losses: arenaLosses,
          },
          ...DEFAULT_ARENA_RIVAL_PRESETS.map((r, idx) => ({
            rank: idx + 2,
            id: r.characterId,
            name: r.name,
            tag: 'RIVAL',
            subtitle: r.gymClanName,
            workoutPoints: 0,
            raidPoints: 0,
            arenaPoints: r.arenaRating ?? 1000,
            totalPoints: r.arenaRating ?? 1000,
          })),
        ];
        return rows
          .sort((a, b) => b.totalPoints - a.totalPoints)
          .map((entry, idx) => ({ ...entry, rank: idx + 1 }));
      }

      // HEROES
      return [
        {
          rank: 1,
          id: resolvedHeroId,
          name: resolvedHeroName,
          tag: activeGymClan?.tag || OPEN_WORLD_HOME_CLAN_TAG,
          subtitle: `Lv.${overallLevel} Adventurer`,
          workoutPoints: Math.max(100, workoutsLoggedCount * 50),
          raidPoints: Math.round(guildReputation / 5),
          arenaPoints: arenaWins * 35 + arenaLosses * 10,
          totalPoints:
            Math.max(100, workoutsLoggedCount * 50) +
            Math.round(guildReputation / 5) +
            arenaWins * 35 +
            arenaLosses * 10,
        },
        ...friends.accepted.map((f, idx) => ({
          rank: idx + 2,
          id: f.characterId || f.friendshipId,
          name: f.characterName || f.username,
          tag: f.gymClanTag || 'ALLY',
          subtitle: `Lv.${f.overallLevel ?? 5} Friend`,
          workoutPoints: 450,
          raidPoints: 220,
          arenaPoints: 180,
          totalPoints: 850,
        })),
      ]
        .sort((a, b) => b.totalPoints - a.totalPoints)
        .map((entry, idx) => ({ ...entry, rank: idx + 1 }));
    },
    [
      activeCompany,
      activeGymClan,
      arenaLosses,
      arenaRating,
      arenaWins,
      availableCompanies,
      friends.accepted,
      guildReputation,
      homeSeasonPoints,
      knownVenues,
      overallLevel,
      resolvedHeroId,
      resolvedHeroName,
      workoutsLoggedCount,
    ]
  );

  // Sync overview & lists when online/authenticated
  useEffect(() => {
    if (!isOnlineSocialReady || !activeCharacterId) return;
    let cancelled = false;

    const loadAll = async () => {
      const [overviewRes, companiesRes, friendsRes, opponentsRes] = await Promise.all([
        fetchSocialOverviewApi(activeCharacterId),
        fetchCompaniesApi(),
        fetchFriendsApi(currentUser?.id),
        fetchArenaOpponentsApi(activeCharacterId),
      ]);

      if (cancelled) return;

      if (overviewRes.ok && overviewRes.data) {
        setActiveGymClan(overviewRes.data.gymClan);
        if (overviewRes.data.gymClan) {
          setGuildName(`${overviewRes.data.gymClan.name} [${overviewRes.data.gymClan.tag}]`);
        }
        if (overviewRes.data.company) {
          const detailRes = await fetchCompanyDetailApi(overviewRes.data.company.id);
          if (!cancelled) {
            setActiveCompany(
              detailRes.ok && detailRes.data ? detailRes.data.company : overviewRes.data.company
            );
          }
        } else {
          setActiveCompany(null);
        }
        setArenaRating(overviewRes.data.arenaRating);
        setArenaWins(overviewRes.data.arenaWins);
        setArenaLosses(overviewRes.data.arenaLosses);
      }

      if (companiesRes.ok && companiesRes.data?.companies) {
        setAvailableCompanies(companiesRes.data.companies);
      }
      if (friendsRes.ok && friendsRes.data) {
        setFriends(friendsRes.data);
      }
      if (opponentsRes.ok && opponentsRes.data?.opponents) {
        setServerOpponents(opponentsRes.data.opponents);
      }
    };

    loadAll();
    return () => {
      cancelled = true;
    };
  }, [activeCharacterId, currentUser?.id, isOnlineSocialReady, setGuildName]);

  // Load leaderboards when category changes or subView opens
  useEffect(() => {
    if (subView !== 'LEADERBOARDS') return;
    let cancelled = false;

    const loadBoard = async () => {
      if (isOnlineSocialReady) {
        setLoadingLeaderboards(true);
        const res = await fetchSocialLeaderboardsApi(leaderboardCategory);
        if (!cancelled) {
          setLoadingLeaderboards(false);
          if (res.ok && res.data) {
            setLeaderboardSeasonKey(res.data.seasonKey);
            setLeaderboardEntries(res.data.entries);
            return;
          }
        }
      }
      if (!cancelled) {
        setLeaderboardSeasonKey(getCurrentSeasonKey());
        setLeaderboardEntries(buildLocalLeaderboards(leaderboardCategory));
      }
    };

    loadBoard();
    return () => {
      cancelled = true;
    };
  }, [buildLocalLeaderboards, isOnlineSocialReady, leaderboardCategory, subView]);

  // Combine server opponents + accepted friends + DEFAULT_ARENA_RIVAL_PRESETS
  const arenaOpponents = useMemo<ArenaOpponentDto[]>(() => {
    const map = new Map<string, ArenaOpponentDto>();

    for (const opp of serverOpponents) {
      map.set(opp.characterId, opp);
    }

    for (const friend of friends.accepted) {
      const charId = friend.characterId || `friend_${friend.friendshipId}`;
      if (!map.has(charId)) {
        map.set(charId, {
          characterId: charId,
          name: friend.characterName || friend.username,
          overallLevel: friend.overallLevel ?? 5,
          gymClanName: friend.gymClanTag ? `Clan [${friend.gymClanTag}]` : null,
          arenaRating: friend.arenaRating ?? 1020,
          isNpcRival: false,
          isFriend: true,
        });
      }
    }

    for (const rival of DEFAULT_ARENA_RIVAL_PRESETS) {
      if (!map.has(rival.characterId)) {
        map.set(rival.characterId, {
          characterId: rival.characterId,
          name: rival.name,
          title: rival.title,
          overallLevel: rival.overallLevel,
          race: rival.race,
          gymClanName: rival.gymClanName,
          arenaRating: rival.arenaRating ?? 1000,
          isNpcRival: true,
        });
      }
    }

    return Array.from(map.values());
  }, [friends.accepted, serverOpponents]);

  // ============================================================================
  // CLAN & VENUE HANDLERS
  // ============================================================================

  const handleSearchGyms = async (query: string) => {
    setSearchingGyms(true);
    setClanStatusMsg(null);
    const trimmed = query.trim().toLowerCase();

    if (isOnlineSocialReady) {
      const res = await discoverGymsApi({
        lat: 37.7749,
        lon: -122.4194,
        radiusMeters: 5000,
        q: query.trim() || undefined,
      });
      setSearchingGyms(false);
      if (res.ok && res.data?.venues) {
        setDiscoveredVenues(res.data.venues);
        return;
      }
    } else {
      setSearchingGyms(false);
    }

    const filtered = !trimmed
      ? knownVenues
      : knownVenues.filter(
          (v) =>
            v.name.toLowerCase().includes(trimmed) ||
            (v.city ?? '').toLowerCase().includes(trimmed) ||
            (v.tag ?? '').toLowerCase().includes(trimmed)
        );
    setDiscoveredVenues(filtered);
  };

  const handleJoinVenue = async (venue: DiscoveredGymVenueDto) => {
    setBusyAction(true);
    setClanStatusMsg(null);

    if (isOnlineSocialReady && activeCharacterId) {
      const res = await claimOrJoinGymClanApi({
        characterId: activeCharacterId,
        clanId: venue.claimedClanId || venue.clanId || undefined,
        venue: {
          name: venue.name,
          tag: venue.tag,
          latitude: venue.latitude,
          longitude: venue.longitude,
          city: venue.city ?? undefined,
          address: venue.address ?? undefined,
          venueSource: venue.venueSource,
          osmElementType: venue.osmElementType,
          osmElementId: venue.osmElementId,
        },
      });
      setBusyAction(false);
      if (res.ok && res.data?.clan) {
        setActiveGymClan(res.data.clan);
        setGuildName(`${res.data.clan.name} [${res.data.clan.tag}]`);
        setClanStatusMsg(
          res.data.deduplicated
            ? `Matched existing gym clan ${res.data.clan.name} [${res.data.clan.tag}] within 150m.`
            : `Joined ${res.data.clan.name} [${res.data.clan.tag}]!`
        );
        return;
      }
      if (res.statusCode && res.statusCode >= 400 && res.statusCode < 500) {
        setClanStatusMsg(res.error || 'Unable to join gym clan.');
        return;
      }
    } else {
      setBusyAction(false);
    }

    const tag = venue.tag || buildVenueTag(venue.name);
    const localClan: SocialGymClanDto = {
      id: venue.clanId || `clan_${venue.venueKey}`,
      slug: venue.venueKey,
      venueKey: venue.venueKey,
      name: venue.name,
      tag,
      kind: 'GYM_VENUE',
      venueSource: venue.venueSource,
      city: venue.city ?? 'Local District',
      address: venue.address ?? null,
      latitude: venue.latitude,
      longitude: venue.longitude,
      clanReputation: 350,
      memberCount: (venue.memberCount ?? 1) + 1,
      seasonPoints: (venue.seasonPoints ?? 250) + 150,
      role: 'MEMBER',
    };
    setActiveGymClan(localClan);
    setGuildName(`${localClan.name} [${localClan.tag}]`);
    setClanStatusMsg(`Joined ${localClan.name} [${localClan.tag}]!`);
  };

  const handleSubmitCustomVenue = async (input: {
    name: string;
    city: string;
    latitude: number;
    longitude: number;
  }) => {
    setBusyAction(true);
    setClanStatusMsg(null);
    const tag = buildVenueTag(input.name);

    if (isOnlineSocialReady && activeCharacterId) {
      const res = await claimOrJoinGymClanApi({
        characterId: activeCharacterId,
        venue: {
          name: input.name,
          tag,
          city: input.city,
          latitude: input.latitude,
          longitude: input.longitude,
          venueSource: 'USER_SUBMITTED',
        },
      });
      setBusyAction(false);
      if (res.ok && res.data?.clan) {
        setActiveGymClan(res.data.clan);
        setGuildName(`${res.data.clan.name} [${res.data.clan.tag}]`);
        setClanStatusMsg(
          res.data.deduplicated
            ? `Deduplicated within 150m to existing clan: ${res.data.clan.name} [${res.data.clan.tag}].`
            : `Claimed & joined ${res.data.clan.name} [${res.data.clan.tag}]!`
        );
        return;
      }
      if (res.statusCode && res.statusCode >= 400 && res.statusCode < 500) {
        setClanStatusMsg(res.error || 'Could not submit venue.');
        return;
      }
    } else {
      setBusyAction(false);
    }

    // Offline coordinate deduplication via @goki/game-engine
    const venueKey = buildCanonicalVenueKey({
      name: input.name,
      latitude: input.latitude,
      longitude: input.longitude,
    });
    const deduped = findDeduplicatedVenueMatch(
      {
        venueKey,
        name: input.name,
        latitude: input.latitude,
        longitude: input.longitude,
      },
      knownVenues
    );

    if (deduped) {
      await handleJoinVenue(deduped);
      setClanStatusMsg(
        `Deduplicated within 150m to existing venue: ${deduped.name} [${deduped.tag || buildVenueTag(deduped.name)}].`
      );
      return;
    }

    const newVenue: DiscoveredGymVenueDto = {
      id: `venue_${Date.now()}`,
      clanId: `clan_${Date.now()}`,
      venueKey,
      name: input.name,
      tag,
      city: input.city,
      latitude: input.latitude,
      longitude: input.longitude,
      venueSource: 'USER_SUBMITTED',
      memberCount: 1,
      seasonPoints: 150,
    };
    setKnownVenues((prev) => [newVenue, ...prev]);
    setDiscoveredVenues((prev) => [newVenue, ...prev]);

    const localClan: SocialGymClanDto = {
      id: newVenue.clanId!,
      slug: venueKey,
      venueKey,
      name: input.name,
      tag,
      kind: 'GYM_VENUE',
      venueSource: 'USER_SUBMITTED',
      city: input.city,
      latitude: input.latitude,
      longitude: input.longitude,
      clanReputation: 150,
      memberCount: 1,
      seasonPoints: 150,
      role: 'WARDEN',
    };
    setActiveGymClan(localClan);
    setGuildName(`${localClan.name} [${localClan.tag}]`);
    setClanStatusMsg(`Claimed new Gym Clan: ${localClan.name} [${localClan.tag}]!`);
  };

  const handleLeaveGymClan = async () => {
    setBusyAction(true);
    setClanStatusMsg(null);
    if (isOnlineSocialReady && activeCharacterId) {
      const res = await leaveGymClanApi(activeCharacterId);
      setBusyAction(false);
      if (!res.ok && res.statusCode && res.statusCode >= 400) {
        setClanStatusMsg(res.error || 'Failed to leave gym clan.');
        return;
      }
    } else {
      setBusyAction(false);
    }
    setActiveGymClan(null);
    setGuildName(homeClanLabel);
    setClanStatusMsg(`Left Gym Clan. Enrolled in ${homeClanLabel}.`);
  };

  // ============================================================================
  // COMPANY HANDLERS
  // ============================================================================

  const handleCreateCompany = async (payload: {
    name: string;
    tag: string;
    motto?: string;
  }) => {
    setBusyAction(true);
    setCompanyStatusMsg(null);

    if (isOnlineSocialReady && activeCharacterId) {
      const res = await createCompanyApi({
        characterId: activeCharacterId,
        name: payload.name,
        tag: payload.tag,
        motto: payload.motto,
      });
      setBusyAction(false);
      if (res.ok && res.data?.company) {
        setActiveCompany(res.data.company);
        setCompanyStatusMsg(`Founded ${res.data.company.name} [${res.data.company.tag}]!`);
        return;
      }
      if (res.statusCode && res.statusCode >= 400 && res.statusCode < 500) {
        setCompanyStatusMsg(res.error || 'Failed to create company.');
        return;
      }
    } else {
      setBusyAction(false);
    }

    const newCompany: SocialCompanyDto = {
      id: `company_${Date.now()}`,
      name: payload.name,
      tag: payload.tag,
      motto: payload.motto ?? null,
      commanderCharacterId: resolvedHeroId,
      companyLevel: 1,
      companyReputation: 250,
      maxRosterSize: 30,
      maxActiveSquadSize: 4,
      memberCount: 1,
      members: [
        {
          characterId: resolvedHeroId,
          characterName: resolvedHeroName,
          overallLevel,
          race,
          role: 'COMMANDER',
          activeSquadSlot: 1,
          contributedReputation: 250,
        },
      ],
    };
    setActiveCompany(newCompany);
    setAvailableCompanies((prev) => [newCompany, ...prev]);
    setCompanyStatusMsg(`Founded ${newCompany.name} [${newCompany.tag}]!`);
  };

  const handleJoinCompany = async (companyId: string) => {
    setBusyAction(true);
    setCompanyStatusMsg(null);

    if (isOnlineSocialReady && activeCharacterId) {
      const res = await joinCompanyApi(companyId, activeCharacterId);
      setBusyAction(false);
      if (res.ok && res.data?.company) {
        setActiveCompany(res.data.company);
        setCompanyStatusMsg(`Joined ${res.data.company.name} [${res.data.company.tag}]!`);
        return;
      }
      if (res.statusCode && res.statusCode >= 400 && res.statusCode < 500) {
        setCompanyStatusMsg(res.error || 'Failed to join company.');
        return;
      }
    } else {
      setBusyAction(false);
    }

    const target = availableCompanies.find((c) => c.id === companyId);
    if (!target) return;
    const existingMembers = target.members ?? [];
    const alreadyIn = existingMembers.some((m) => m.characterId === resolvedHeroId);
    const nextMembers = alreadyIn
      ? existingMembers
      : [
          ...existingMembers,
          {
            characterId: resolvedHeroId,
            characterName: resolvedHeroName,
            overallLevel,
            race,
            role: 'MEMBER' as const,
            activeSquadSlot: existingMembers.length < 4 ? existingMembers.length + 1 : null,
            contributedReputation: 100,
          },
        ];
    const joined: SocialCompanyDto = {
      ...target,
      memberCount: nextMembers.length,
      members: nextMembers,
    };
    setActiveCompany(joined);
    setCompanyStatusMsg(`Joined ${joined.name} [${joined.tag}]!`);
  };

  const handleLeaveCompany = async () => {
    if (!activeCompany) return;
    setBusyAction(true);
    setCompanyStatusMsg(null);

    if (isOnlineSocialReady && activeCharacterId) {
      const res = await leaveCompanyApi(activeCompany.id, activeCharacterId);
      setBusyAction(false);
      if (!res.ok && res.statusCode && res.statusCode >= 400 && res.statusCode < 500) {
        setCompanyStatusMsg(res.error || 'Failed to leave company.');
        return;
      }
    } else {
      setBusyAction(false);
    }

    setActiveCompany(null);
    setCompanyStatusMsg('Left Adventurer Company.');
  };

  const handleSaveActiveSquad = async (
    assignments: Array<{ characterId: string; squadSlot: number }>
  ) => {
    if (!activeCompany) return;
    const members = activeCompany.members ?? [];
    const validation = validateCompanySquadAssignment({
      rosterCharacterIds: members.map((m) => m.characterId),
      assignments,
    });
    if (!validation.valid) {
      setCompanyStatusMsg(validation.error || 'Invalid squad assignment.');
      return;
    }

    setBusyAction(true);
    setCompanyStatusMsg(null);

    if (isOnlineSocialReady && activeCharacterId) {
      const res = await updateCompanySquadApi(activeCompany.id, {
        actorCharacterId: activeCharacterId,
        assignments,
      });
      setBusyAction(false);
      if (res.ok && res.data?.company) {
        setActiveCompany(res.data.company);
        setCompanyStatusMsg('Saved 4-Player Active Squad!');
        return;
      }
      if (res.statusCode && res.statusCode >= 400 && res.statusCode < 500) {
        setCompanyStatusMsg(res.error || 'Failed to save active squad.');
        return;
      }
    } else {
      setBusyAction(false);
    }

    const slotMap = new Map(assignments.map((a) => [a.characterId, a.squadSlot]));
    const updatedMembers = members.map((m) => ({
      ...m,
      activeSquadSlot: slotMap.get(m.characterId) ?? null,
    }));
    setActiveCompany({
      ...activeCompany,
      members: updatedMembers,
    });
    setCompanyStatusMsg('Saved 4-Player Active Squad!');
  };

  // ============================================================================
  // FRIENDS HANDLERS
  // ============================================================================

  const handleSendFriendRequest = async (targetInput: string) => {
    setBusyAction(true);
    setFriendsStatusMsg(null);

    if (isOnlineSocialReady) {
      const res = await sendFriendRequestApi({
        targetUsername: targetInput,
        targetCharacterName: targetInput,
      });
      setBusyAction(false);
      if (res.ok && res.data?.friendship) {
        const added = res.data.friendship;
        setFriends((prev) => ({
          ...prev,
          outgoing: [added, ...prev.outgoing],
        }));
        setFriendsStatusMsg(`Friend request sent to ${targetInput}.`);
        return;
      }
      if (res.statusCode && res.statusCode >= 400 && res.statusCode < 500) {
        setFriendsStatusMsg(res.error || 'Could not send friend request.');
        return;
      }
    } else {
      setBusyAction(false);
    }

    const localReq: SocialFriendItemDto = {
      friendshipId: `friend_out_${Date.now()}`,
      userId: `user_${Date.now()}`,
      username: targetInput.toLowerCase().replace(/\s+/g, '_'),
      characterId: `char_${Date.now()}`,
      characterName: targetInput,
      overallLevel: 5,
      arenaRating: 1015,
      status: 'PENDING',
      direction: 'OUTGOING',
    };
    setFriends((prev) => ({
      ...prev,
      outgoing: [localReq, ...prev.outgoing],
    }));
    setFriendsStatusMsg(`Friend request sent to ${targetInput}.`);
  };

  const handleRespondFriendRequest = async (
    friendshipId: string,
    action: 'ACCEPT' | 'DECLINE'
  ) => {
    setBusyAction(true);
    setFriendsStatusMsg(null);

    if (isOnlineSocialReady) {
      const res = await respondFriendRequestApi(friendshipId, action);
      setBusyAction(false);
      if (!res.ok && res.statusCode && res.statusCode >= 400 && res.statusCode < 500) {
        setFriendsStatusMsg(res.error || 'Failed to update friend request.');
        return;
      }
    } else {
      setBusyAction(false);
    }

    setFriends((prev) => {
      const target = prev.incoming.find((r) => r.friendshipId === friendshipId);
      const nextIncoming = prev.incoming.filter((r) => r.friendshipId !== friendshipId);
      if (action === 'ACCEPT' && target) {
        return {
          ...prev,
          incoming: nextIncoming,
          accepted: [{ ...target, status: 'ACCEPTED' }, ...prev.accepted],
        };
      }
      return {
        ...prev,
        incoming: nextIncoming,
      };
    });
    setFriendsStatusMsg(action === 'ACCEPT' ? 'Friend request accepted!' : 'Request declined.');
  };

  const handleRemoveFriend = async (friendshipId: string) => {
    setBusyAction(true);
    setFriendsStatusMsg(null);

    if (isOnlineSocialReady) {
      const res = await removeFriendApi(friendshipId);
      setBusyAction(false);
      if (!res.ok && res.statusCode && res.statusCode >= 400 && res.statusCode < 500) {
        setFriendsStatusMsg(res.error || 'Failed to remove friend.');
        return;
      }
    } else {
      setBusyAction(false);
    }

    setFriends((prev) => ({
      accepted: prev.accepted.filter((f) => f.friendshipId !== friendshipId),
      incoming: prev.incoming.filter((f) => f.friendshipId !== friendshipId),
      outgoing: prev.outgoing.filter((f) => f.friendshipId !== friendshipId),
    }));
    setFriendsStatusMsg('Friend connection removed.');
  };

  // ============================================================================
  // ASYNC ARENA HANDLERS
  // ============================================================================

  const handleSparOpponent = async (opponent: ArenaOpponentDto) => {
    setSparringOpponentId(opponent.characterId);

    if (isOnlineSocialReady && activeCharacterId) {
      const res = await sparArenaApi({
        challengerCharacterId: activeCharacterId,
        defenderCharacterId: opponent.characterId,
        includeSquad,
      });
      setSparringOpponentId(null);
      if (res.ok && res.data?.match) {
        const match = res.data.match;
        setLastArenaMatch(match);
        setArenaMatchHistory((prev) => [match, ...prev]);
        setArenaRating(match.nextChallengerRating);
        if (match.outcome === 'CHALLENGER_VICTORY') {
          setArenaWins((w) => w + 1);
        } else {
          setArenaLosses((l) => l + 1);
        }
        return;
      }
    } else {
      setSparringOpponentId(null);
    }

    // Deterministic offline simulation via @goki/game-engine
    const challengerSnapshot: ArenaFighterSnapshot = {
      characterId: resolvedHeroId,
      name: resolvedHeroName,
      overallLevel,
      race,
      appearanceId,
      customizationConfig,
      coreStats: {
        strengthLevel: stats.STRENGTH.level,
        enduranceLevel: stats.ENDURANCE.level,
        agilityLevel: stats.AGILITY.level,
        dexLevel: stats.DEXTERITY.level,
        conLevel: stats.CONSTITUTION.level,
        wisLevel: stats.WISDOM.level,
        sprLevel: stats.SPIRIT.level,
      },
      equipmentBonuses,
      unlockedTalentRanks,
      activeSkillIds: activeSkillLoadout,
      beltSlots: beltLoadout.map((itemSlug) => ({ itemSlug, charges: itemSlug ? 1 : 0 })),
      arenaRating,
    };

    const presetMatch = DEFAULT_ARENA_RIVAL_PRESETS.find(
      (r) => r.characterId === opponent.characterId
    );
    const defenderSnapshot: ArenaFighterSnapshot = presetMatch ?? {
      characterId: opponent.characterId,
      name: opponent.name,
      overallLevel: opponent.overallLevel,
      race: opponent.race ?? 'HUMAN',
      coreStats: {
        strengthLevel: Math.max(3, opponent.overallLevel + 1),
        enduranceLevel: Math.max(3, opponent.overallLevel),
        agilityLevel: Math.max(3, opponent.overallLevel),
        dexLevel: Math.max(2, opponent.overallLevel - 1),
        conLevel: Math.max(3, opponent.overallLevel),
        wisLevel: Math.max(2, Math.floor(opponent.overallLevel * 0.7)),
        sprLevel: Math.max(2, Math.floor(opponent.overallLevel * 0.7)),
      },
      equipmentBonuses: {
        maxHp: opponent.overallLevel * 12,
        meleePower: opponent.overallLevel * 3,
        armorRating: opponent.overallLevel * 2,
      },
      arenaRating: opponent.arenaRating,
    };

    const squadCompanions: TurnBasedPartyMemberInput[] = [];
    if (includeSquad) {
      const companySlotted = (activeCompany?.members ?? []).filter(
        (m) => m.activeSquadSlot !== null && m.characterId !== resolvedHeroId
      );
      if (companySlotted.length > 0) {
        for (const mate of companySlotted.slice(0, 3)) {
          squadCompanions.push({
            characterId: mate.characterId,
            name: mate.characterName,
            controller: 'AI_COMPANION',
            race: mate.race,
            coreStats: {
              strengthLevel: Math.max(3, mate.overallLevel),
              enduranceLevel: Math.max(3, mate.overallLevel),
              agilityLevel: Math.max(3, mate.overallLevel),
              dexLevel: Math.max(2, mate.overallLevel - 1),
              conLevel: Math.max(3, mate.overallLevel),
              wisLevel: 2,
              sprLevel: 2,
            },
          });
        }
      } else {
        for (const ally of companionRoster.slice(0, 2)) {
          squadCompanions.push({
            characterId: ally.characterId,
            name: ally.name,
            controller: 'AI_COMPANION',
            coreStats: ally.coreStats,
            equipmentBonuses: ally.equipmentBonuses,
            unlockedTalentRanks: ally.unlockedTalentRanks,
          });
        }
      }
    }

    const matchId = `arena_${Date.now()}`;
    const sim = simulateAsyncArenaMatch({
      matchId,
      challenger: challengerSnapshot,
      defender: defenderSnapshot,
      challengerCompanions: squadCompanions,
      seed: `${resolvedHeroId}_${opponent.characterId}_${Date.now()}`,
    });

    const summary: ArenaMatchSummaryDto = {
      matchId: sim.matchId,
      outcome: sim.outcome,
      winnerCharacterId: sim.winnerCharacterId,
      loserCharacterId: sim.loserCharacterId,
      defenderName: opponent.name,
      totalTurns: sim.totalTurns,
      challengerRemainingHp: sim.challengerRemainingHp,
      defenderRemainingHp: sim.defenderRemainingHp,
      challengerDamageDealt: sim.challengerDamageDealt,
      defenderDamageDealt: sim.defenderDamageDealt,
      challengerRatingDelta: sim.challengerRatingDelta,
      nextChallengerRating: sim.nextChallengerRating,
      goldAwarded: sim.goldAwarded,
      seasonPointsAwarded: sim.seasonPointsAwarded,
      combatLog: sim.combatLog,
      createdAt: new Date().toISOString(),
    };

    setLastArenaMatch(summary);
    setArenaMatchHistory((prev) => [summary, ...prev]);
    setArenaRating(summary.nextChallengerRating);
    if (summary.outcome === 'CHALLENGER_VICTORY') {
      setArenaWins((w) => w + 1);
    } else {
      setArenaLosses((l) => l + 1);
    }
  };

  const handleSparFriend = (friend: SocialFriendItemDto) => {
    setSubView('ARENA');
    const opp: ArenaOpponentDto = {
      characterId: friend.characterId || `friend_${friend.friendshipId}`,
      name: friend.characterName || friend.username,
      overallLevel: friend.overallLevel ?? 5,
      gymClanName: friend.gymClanTag ? `Clan [${friend.gymClanTag}]` : null,
      arenaRating: friend.arenaRating ?? 1020,
      isNpcRival: false,
      isFriend: true,
    };
    handleSparOpponent(opp);
  };

  const hasActiveSquad = Boolean(
    activeCompany?.members?.some((m) => m.activeSquadSlot !== null && m.activeSquadSlot !== undefined)
  );

  return (
    <View style={styles.root}>
      {/* Compact Social Header with NPC Guides */}
      <View style={styles.npcHeaderBar}>
        <View style={styles.affiliationSummary}>
          <RpgIcon name="shield" size={14} color={COLORS.gold} />
          <Text style={styles.affiliationText} numberOfLines={1}>
            {activeGymClan ? `${activeGymClan.name} [${activeGymClan.tag}]` : guildName}
          </Text>
        </View>
        <View style={styles.npcButtonsRow}>
          <TouchableOpacity
            style={styles.wardenBtn}
            onPress={() => setWardenOpen(true)}
            activeOpacity={0.75}
            testID="social-npc-warden-btn"
          >
            <RpgIcon name="banners" size={13} color="#26A69A" />
            <Text style={styles.wardenBtnText}>Warden Torin</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quartermasterBtn}
            onPress={() => setQuartermasterOpen(true)}
            activeOpacity={0.75}
            testID="social-npc-quartermaster-btn"
          >
            <RpgIcon name="social" size={13} color="#A855F7" />
            <Text style={styles.quartermasterBtnText}>Commander Veyra</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Scrollable 5-Subtab Bar (fits 480px portrait cleanly) */}
      <View style={styles.subTabBarWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.subTabScrollContent}
        >
          {SUB_OPTIONS.map((opt) => {
            const active = opt.key === subView;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[styles.subTabPill, active && styles.subTabPillActive]}
                onPress={() => setSubView(opt.key)}
                activeOpacity={0.8}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                testID={opt.testID}
              >
                <RpgIcon
                  name={opt.icon}
                  size={13}
                  color={active ? COLORS.gold : COLORS.textSecondary}
                />
                <Text
                  style={[styles.subTabLabel, active && styles.subTabLabelActive]}
                  numberOfLines={1}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.body}>
        {subView === 'CLAN_RAID' ? (
          <ClanAndRaidView
            homeClanName={homeClanLabel}
            homeClanSeasonPoints={homeSeasonPoints}
            activeGymClan={activeGymClan}
            discoveredVenues={discoveredVenues}
            searchingGyms={searchingGyms}
            busyAction={busyAction}
            statusMessage={clanStatusMsg}
            onSearchGyms={handleSearchGyms}
            onJoinVenue={handleJoinVenue}
            onSubmitCustomVenue={handleSubmitCustomVenue}
            onLeaveGymClan={handleLeaveGymClan}
            onOpenWardenBriefing={() => setWardenOpen(true)}
          />
        ) : subView === 'COMPANY' ? (
          <AdventurerCompanyView
            activeCompany={activeCompany}
            availableCompanies={availableCompanies}
            activeCharacterId={resolvedHeroId}
            busyAction={busyAction}
            statusMessage={companyStatusMsg}
            onCreateCompany={handleCreateCompany}
            onJoinCompany={handleJoinCompany}
            onLeaveCompany={handleLeaveCompany}
            onSaveActiveSquad={handleSaveActiveSquad}
            onOpenQuartermasterBriefing={() => setQuartermasterOpen(true)}
          />
        ) : subView === 'FRIENDS' ? (
          <FriendsView
            friends={friends}
            busyAction={busyAction}
            statusMessage={friendsStatusMsg}
            onSendFriendRequest={handleSendFriendRequest}
            onRespondFriendRequest={handleRespondFriendRequest}
            onRemoveFriend={handleRemoveFriend}
            onSparFriend={handleSparFriend}
          />
        ) : subView === 'LEADERBOARDS' ? (
          <SocialLeaderboardsView
            category={leaderboardCategory}
            seasonKey={leaderboardSeasonKey}
            entries={leaderboardEntries}
            loading={loadingLeaderboards}
            onSelectCategory={setLeaderboardCategory}
            onOpenWardenBriefing={() => setWardenOpen(true)}
          />
        ) : (
          <AsyncArenaView
            arenaRating={arenaRating}
            arenaWins={arenaWins}
            arenaLosses={arenaLosses}
            includeSquad={includeSquad}
            hasActiveSquad={hasActiveSquad}
            opponents={arenaOpponents}
            lastMatch={lastArenaMatch}
            matchHistory={arenaMatchHistory}
            sparringOpponentId={sparringOpponentId}
            onToggleIncludeSquad={() => setIncludeSquad((prev) => !prev)}
            onSparOpponent={handleSparOpponent}
            onOpenQuartermasterBriefing={() => setQuartermasterOpen(true)}
          />
        )}
      </View>

      {/* Warden Torin Dialogue */}
      <NpcDialogueOverlay
        visible={wardenOpen}
        onClose={() => setWardenOpen(false)}
        npcId="CLAN_WARDEN"
        testID="clan-warden-dialogue"
        dialoguePages={[
          `Every hero belongs to ${homeClanLabel} plus 1 coordinate-deduped Real-World Gym Clan. Submitting a venue within 150m merges cleanly into the existing clan.`,
          'Your workouts, 7-Day Weekly Raid Boss strikes, and Async Arena sparring earn monthly seasonal points for both your Gym Clan and personal standings.',
        ]}
        actionChips={[
          {
            id: 'discover-venues',
            label: 'Discover Gym Venues',
            icon: 'compass',
            variant: 'primary',
            onPress: () => {
              setWardenOpen(false);
              setSubView('CLAN_RAID');
            },
          },
          {
            id: 'view-standings',
            label: 'View Clan Standings',
            icon: 'banners',
            variant: 'subtle',
            onPress: () => {
              setWardenOpen(false);
              setSubView('LEADERBOARDS');
            },
          },
        ]}
      />

      {/* Commander Veyra Dialogue */}
      <NpcDialogueOverlay
        visible={quartermasterOpen}
        onClose={() => setQuartermasterOpen(false)}
        npcId="QUARTERMASTER"
        testID="company-quartermaster-dialogue"
        dialoguePages={[
          'Adventurer Companies unite up to 30 cross-gym roster members. Designate a 4-Player Active Squad to join your expeditions and Arena matches.',
          'Step into the Async Arena to spar rivals or friends using deterministic turn-based combat—raise your Elo rating and earn Gold plus Clan Season points.',
        ]}
        actionChips={[
          {
            id: 'manage-company',
            label: 'Manage Company Roster',
            icon: 'social',
            variant: 'primary',
            onPress: () => {
              setQuartermasterOpen(false);
              setSubView('COMPANY');
            },
          },
          {
            id: 'enter-arena',
            label: 'Enter Arena',
            icon: 'trophy',
            variant: 'subtle',
            onPress: () => {
              setQuartermasterOpen(false);
              setSubView('ARENA');
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
  npcHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
    backgroundColor: SURFACES.canvas,
  },
  affiliationSummary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 100,
  },
  affiliationText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
    flex: 1,
  },
  npcButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  wardenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.md,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(38, 166, 154, 0.35)',
  },
  wardenBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#26A69A',
  },
  quartermasterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.md,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.35)',
  },
  quartermasterBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#A855F7',
  },
  subTabBarWrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SURFACES.hairline,
    backgroundColor: SURFACES.canvas,
    paddingBottom: SPACING.sm,
  },
  subTabScrollContent: {
    paddingHorizontal: SPACING.md,
    gap: 6,
    alignItems: 'center',
  },
  subTabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: SURFACES.layer1,
    borderRadius: RADII.md,
    paddingHorizontal: 11,
    paddingVertical: 8,
    minHeight: 36,
    borderWidth: 1,
    borderColor: SURFACES.hairline,
  },
  subTabPillActive: {
    backgroundColor: SURFACES.layer3,
    borderColor: SURFACES.goldHairline,
  },
  subTabLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  subTabLabelActive: {
    color: COLORS.gold,
  },
  body: {
    flex: 1,
  },
});

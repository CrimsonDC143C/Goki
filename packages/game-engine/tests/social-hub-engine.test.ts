import { describe, expect, it } from 'vitest';
import {
  ADVENTURER_COMPANY_AI_PRESETS,
  ArenaFighterSnapshot,
  CanonicalGymVenueCandidate,
  DEFAULT_ARENA_RIVAL_PRESETS,
  GUILD_RAID_COORDINATION_BONUS,
  GYM_VENUE_DEDUPE_RADIUS_METERS,
  GYM_VENUE_EXACT_PROXIMITY_METERS,
  MAX_COMPANY_ACTIVE_SQUAD_SIZE,
  MAX_COMPANY_ROSTER_SIZE,
  OPEN_WORLD_HOME_CLAN_NAME,
  OPEN_WORLD_HOME_CLAN_SLUG,
  OPEN_WORLD_HOME_CLAN_TAG,
  OPEN_WORLD_HOME_CLAN_VENUE_KEY,
  buildCanonicalVenueKey,
  calculateArenaRatingDelta,
  calculateGymClanSeasonPoints,
  calculateRaidRewards,
  findDeduplicatedVenueMatch,
  getCurrentSeasonKey,
  getSeasonWindowBounds,
  normalizeGymVenueName,
  simulateAsyncArenaMatch,
  validateCompanySquadAssignment,
  validateDualClanMembership,
} from '../src';

describe('social-hub-engine & CLAN_ONLY raid rewards', () => {
  it('awards GUILD_RAID_COORDINATION_BONUS equally to CLAN_ONLY and GUILD_ONLY raids', () => {
    const baseInput = {
      raidInstanceId: 'raid-clan-test',
      bossMaxHp: 1000,
      baseGoldPool: 1000,
      baseGuildReputationPool: 1000,
      baseMaterialQuantity: 10,
      seed: 'clan-raid-seed',
      participants: [
        { characterId: 'char-1', combatDamageDealt: 600, workoutEnergyDamage: 400 },
      ],
    };

    const publicResult = calculateRaidRewards({
      ...baseInput,
      accessType: 'PUBLIC_WORLD',
    });
    const guildResult = calculateRaidRewards({
      ...baseInput,
      accessType: 'GUILD_ONLY',
    });
    const clanResult = calculateRaidRewards({
      ...baseInput,
      accessType: 'CLAN_ONLY',
    });

    const publicRep = publicResult.participantRewards[0]!.guildReputationAwarded;
    const guildRep = guildResult.participantRewards[0]!.guildReputationAwarded;
    const clanRep = clanResult.participantRewards[0]!.guildReputationAwarded;

    expect(clanResult.accessType).toBe('CLAN_ONLY');
    expect(clanRep).toBe(guildRep);
    expect(clanRep).toBeGreaterThan(publicRep);
    expect(clanRep).toBe(Math.round(publicRep * GUILD_RAID_COORDINATION_BONUS));
  });

  it('exposes canonical Open-World Home and Company constants', () => {
    expect(OPEN_WORLD_HOME_CLAN_SLUG).toBe('open_world_home');
    expect(OPEN_WORLD_HOME_CLAN_VENUE_KEY).toBe('system:open_world_home');
    expect(OPEN_WORLD_HOME_CLAN_NAME).toBe('Hearthstone Open-World Sanctum');
    expect(OPEN_WORLD_HOME_CLAN_TAG).toBe('HOME');
    expect(GYM_VENUE_DEDUPE_RADIUS_METERS).toBe(150);
    expect(GYM_VENUE_EXACT_PROXIMITY_METERS).toBe(60);
    expect(MAX_COMPANY_ROSTER_SIZE).toBe(30);
    expect(MAX_COMPANY_ACTIVE_SQUAD_SIZE).toBe(4);
  });

  describe('normalizeGymVenueName & buildCanonicalVenueKey', () => {
    it('normalizes gym venue names consistently', () => {
      expect(normalizeGymVenueName("  Gold's Gym — Downtown!!  ")).toBe('golds gym downtown');
      expect(normalizeGymVenueName("O’Brien's   24-Hour  Fitness")).toBe('obriens 24 hour fitness');
    });

    it('builds canonical keys across home, osm, external provider, and geo modes', () => {
      expect(buildCanonicalVenueKey({ isOpenWorldHome: true, name: 'Ignored' })).toBe(
        OPEN_WORLD_HOME_CLAN_VENUE_KEY
      );

      expect(
        buildCanonicalVenueKey({
          osmElementType: 'WAY',
          osmElementId: 987654,
        })
      ).toBe('osm:way:987654');

      expect(
        buildCanonicalVenueKey({
          externalProvider: 'Google Places',
          externalPlaceId: 'ChIJ12345',
        })
      ).toBe('ext:google places:ChIJ12345');

      expect(
        buildCanonicalVenueKey({
          latitude: 37.774929,
          longitude: -122.419416,
          name: "Iron Temple's Barbell Club & Annex",
        })
      ).toBe('geo:37.775:-122.419:iron_temples_barbell_club_annex');
    });

    it('throws descriptive errors for missing or invalid coordinates in geo fallback', () => {
      expect(() =>
        buildCanonicalVenueKey({ latitude: Number.NaN, longitude: -122.4, name: 'Bad Lat' })
      ).toThrow(/latitude/i);
      expect(() =>
        buildCanonicalVenueKey({ latitude: 95, longitude: -122.4, name: 'Out of Range Lat' })
      ).toThrow(/latitude/i);
      expect(() =>
        buildCanonicalVenueKey({ latitude: 37.7, longitude: 185, name: 'Out of Range Lon' })
      ).toThrow(/longitude/i);
      expect(() => buildCanonicalVenueKey({ name: 'Missing Coords' })).toThrow(/latitude/i);
    });
  });

  describe('findDeduplicatedVenueMatch', () => {
    const existing: CanonicalGymVenueCandidate[] = [
      {
        id: 'home-1',
        venueKey: OPEN_WORLD_HOME_CLAN_VENUE_KEY,
        name: OPEN_WORLD_HOME_CLAN_NAME,
        latitude: null,
        longitude: null,
        kind: 'OPEN_WORLD_HOME',
      },
      {
        id: 'gym-1',
        venueKey: 'osm:node:1001',
        name: "Gold's Gym Downtown",
        latitude: 37.7749,
        longitude: -122.4194,
        kind: 'GYM_VENUE',
      },
      {
        id: 'gym-2',
        venueKey: 'osm:node:1002',
        name: 'Equinox Union Street',
        latitude: 37.7758, // ~100m north
        longitude: -122.4194,
        kind: 'GYM_VENUE',
      },
    ];

    it('matches by exact venueKey and ignores OPEN_WORLD_HOME entries', () => {
      const match = findDeduplicatedVenueMatch(
        {
          venueKey: 'osm:node:1001',
          name: 'Different Name',
          latitude: 37.79,
          longitude: -122.42,
        },
        existing
      );
      expect(match?.id).toBe('gym-1');

      const homeKeyMatch = findDeduplicatedVenueMatch(
        {
          venueKey: OPEN_WORLD_HOME_CLAN_VENUE_KEY,
          name: 'Some Gym',
          latitude: 38.0,
          longitude: -122.0,
        },
        existing
      );
      expect(homeKeyMatch).toBeNull();
    });

    it('matches within 60m exact proximity even if names differ', () => {
      const match = findDeduplicatedVenueMatch(
        {
          name: 'Completely Unrelated Barbell',
          latitude: 37.7751, // ~22m north of gym-1
          longitude: -122.4194,
        },
        existing
      );
      expect(match?.id).toBe('gym-1');
    });

    it('matches within 150m only when normalized names match with length >= 3', () => {
      // ~100m north of gym-1, ~0m from gym-2, wait: let's test ~100m east of gym-1
      const nameMatch = findDeduplicatedVenueMatch(
        {
          name: 'Golds Gym',
          latitude: 37.7749,
          longitude: -122.4182, // ~105m east of gym-1
        },
        existing
      );
      expect(nameMatch?.id).toBe('gym-1');

      const mismatch = findDeduplicatedVenueMatch(
        {
          name: 'Planet Fitness',
          latitude: 37.7749,
          longitude: -122.4182, // ~105m east of gym-1, > 60m
        },
        existing
      );
      expect(mismatch).toBeNull();

      const shortName = findDeduplicatedVenueMatch(
        {
          name: 'GY',
          latitude: 37.7749,
          longitude: -122.4182,
        },
        existing
      );
      expect(shortName).toBeNull();
    });

    it('does not match beyond radiusMeters and picks the closest qualifying venue', () => {
      const farMatch = findDeduplicatedVenueMatch(
        {
          name: "Gold's Gym Downtown",
          latitude: 37.777, // >230m north
          longitude: -122.4194,
        },
        existing
      );
      expect(farMatch).toBeNull();

      const closerMatch = findDeduplicatedVenueMatch(
        {
          name: 'Equinox',
          latitude: 37.7756, // ~78m from gym-1 (name mismatch), ~22m from gym-2 (exact proximity + name match)
          longitude: -122.4194,
        },
        existing
      );
      expect(closerMatch?.id).toBe('gym-2');
    });
  });

  describe('validateDualClanMembership & validateCompanySquadAssignment', () => {
    it('validates dual-clan membership limits', () => {
      expect(validateDualClanMembership([])).toEqual({
        valid: true,
        hasHomeClan: false,
        gymVenueClanId: null,
      });

      expect(
        validateDualClanMembership([
          { gymClanId: 'home-1', clanKind: 'OPEN_WORLD_HOME' },
          { gymClanId: 'gym-9', clanKind: 'GYM_VENUE' },
        ])
      ).toEqual({
        valid: true,
        hasHomeClan: true,
        gymVenueClanId: 'gym-9',
      });

      const dupHome = validateDualClanMembership([
        { gymClanId: 'home-1', clanKind: 'OPEN_WORLD_HOME' },
        { gymClanId: 'home-2', clanKind: 'OPEN_WORLD_HOME' },
      ]);
      expect(dupHome.valid).toBe(false);
      expect(dupHome.error).toMatch(/OPEN_WORLD_HOME/);

      const dupGym = validateDualClanMembership([
        { gymClanId: 'gym-1', clanKind: 'GYM_VENUE' },
        { gymClanId: 'gym-2', clanKind: 'GYM_VENUE' },
      ]);
      expect(dupGym.valid).toBe(false);
      expect(dupGym.error).toMatch(/GYM_VENUE/);
    });

    it('validates company roster and 4-slot active squad assignments', () => {
      const validRoster = ['c1', 'c2', 'c3', 'c4', 'c5'];
      expect(
        validateCompanySquadAssignment({
          rosterCharacterIds: validRoster,
          assignments: [
            { characterId: 'c1', squadSlot: 1 },
            { characterId: 'c3', squadSlot: 4 },
          ],
        })
      ).toEqual({ valid: true });

      const oversizedRoster = Array.from({ length: 31 }, (_, i) => `c${i}`);
      expect(
        validateCompanySquadAssignment({
          rosterCharacterIds: oversizedRoster,
          assignments: [],
        }).valid
      ).toBe(false);

      expect(
        validateCompanySquadAssignment({
          rosterCharacterIds: validRoster,
          assignments: [
            { characterId: 'c1', squadSlot: 1 },
            { characterId: 'c2', squadSlot: 2 },
            { characterId: 'c3', squadSlot: 3 },
            { characterId: 'c4', squadSlot: 4 },
            { characterId: 'c5', squadSlot: 1 },
          ],
        }).valid
      ).toBe(false);

      expect(
        validateCompanySquadAssignment({
          rosterCharacterIds: validRoster,
          assignments: [{ characterId: 'c1', squadSlot: 5 }],
        }).valid
      ).toBe(false);

      expect(
        validateCompanySquadAssignment({
          rosterCharacterIds: validRoster,
          assignments: [{ characterId: 'c1', squadSlot: 1.5 }],
        }).valid
      ).toBe(false);

      expect(
        validateCompanySquadAssignment({
          rosterCharacterIds: validRoster,
          assignments: [
            { characterId: 'c1', squadSlot: 1 },
            { characterId: 'c2', squadSlot: 1 },
          ],
        }).valid
      ).toBe(false);

      expect(
        validateCompanySquadAssignment({
          rosterCharacterIds: validRoster,
          assignments: [
            { characterId: 'c1', squadSlot: 1 },
            { characterId: 'c1', squadSlot: 2 },
          ],
        }).valid
      ).toBe(false);

      expect(
        validateCompanySquadAssignment({
          rosterCharacterIds: validRoster,
          assignments: [{ characterId: 'outsider', squadSlot: 2 }],
        }).valid
      ).toBe(false);
    });
  });

  describe('Seasonal Scoring & Window Bounds', () => {
    it('computes UTC season keys and month boundaries including December rollover', () => {
      const sampleDate = new Date('2026-12-20T23:59:59.000Z');
      expect(getCurrentSeasonKey(sampleDate)).toBe('2026-12');

      const decBounds = getSeasonWindowBounds('2026-12');
      expect(decBounds.startsAt.toISOString()).toBe('2026-12-01T00:00:00.000Z');
      expect(decBounds.endsAt.toISOString()).toBe('2027-01-01T00:00:00.000Z');

      expect(() => getSeasonWindowBounds('2026-13')).toThrow(/seasonKey/i);
    });

    it('calculates workout, raid, and arena season points accurately', () => {
      const points = calculateGymClanSeasonPoints({
        workoutsCount: 4,
        workoutVolumeScore: 12550,
        raidDamageScore: 18999,
        arenaVictories: 3,
        arenaMatchesPlayed: 5,
      });

      // workoutPoints = round(4 * 50 + 125.5) = 326
      // raidPoints = floor(18999 / 1000) = 18
      // arenaPoints = 3 * 35 + 2 * 10 = 125
      expect(points).toEqual({
        workoutPoints: 326,
        raidPoints: 18,
        arenaPoints: 125,
        totalSeasonPoints: 469,
      });
    });
  });

  describe('Async Arena AI Sparring Engine', () => {
    it('provides 3 default rival presets across levels 3, 7, and 12', () => {
      expect(DEFAULT_ARENA_RIVAL_PRESETS.map((r) => r.slug)).toEqual([
        'arena_rival_iron_ronin',
        'arena_rival_frost_oni',
        'arena_rival_nine_flare',
      ]);
      expect(DEFAULT_ARENA_RIVAL_PRESETS.map((r) => r.overallLevel)).toEqual([3, 7, 12]);
    });

    it('computes K=28 Elo deltas with floor 800 clamping', () => {
      const evenWin = calculateArenaRatingDelta(1000, 1000, true);
      expect(evenWin).toEqual({
        challengerDelta: 14,
        defenderDelta: -14,
        nextChallengerRating: 1014,
        nextDefenderRating: 986,
      });

      const floorLoss = calculateArenaRatingDelta(805, 1000, false);
      expect(floorLoss.nextChallengerRating).toBe(800);
      expect(floorLoss.challengerDelta).toBe(-5);
      expect(floorLoss.nextDefenderRating).toBeGreaterThan(1000);
    });

    it('simulates deterministic arena matches powered by stepTurnBasedCombat', () => {
      const strongChallenger: ArenaFighterSnapshot = {
        characterId: 'hero-1',
        name: 'Valkyrie Prime',
        overallLevel: 10,
        race: 'HUMAN',
        coreStats: {
          strengthLevel: 12,
          enduranceLevel: 10,
          agilityLevel: 9,
          dexLevel: 8,
          conLevel: 8,
          wisLevel: 5,
          sprLevel: 5,
        },
        equipmentBonuses: { maxHp: 120, meleePower: 28, armorRating: 18 },
        unlockedTalentRanks: {
          van_heavy_handed: 3,
          van_sundering_strikes: 2,
          van_colossus_cleave: 1,
        },
        activeSkillIds: ['van_colossus_cleave'],
        arenaRating: 1100,
      };

      const ironRonin = DEFAULT_ARENA_RIVAL_PRESETS[0]!;

      const runA = simulateAsyncArenaMatch({
        matchId: 'arena-match-1',
        challenger: strongChallenger,
        defender: ironRonin,
        seed: 'arena-seed-1',
      });
      const runB = simulateAsyncArenaMatch({
        matchId: 'arena-match-1',
        challenger: strongChallenger,
        defender: ironRonin,
        seed: 'arena-seed-1',
      });

      expect(runA.outcome).toBe('CHALLENGER_VICTORY');
      expect(runA.winnerCharacterId).toBe('hero-1');
      expect(runA.loserCharacterId).toBe('arena_rival_iron_ronin');
      expect(runA.goldAwarded).toBe(45);
      expect(runA.seasonPointsAwarded).toBe(45);
      expect(runA.challengerRemainingHp).toBeGreaterThan(0);
      expect(runA.defenderRemainingHp).toBe(0);
      expect(runA.challengerDamageDealt).toBeGreaterThan(0);
      expect(runA.totalTurns).toBeGreaterThan(0);
      expect(runA.combatLog.length).toBeGreaterThan(2);
      expect(runA.nextChallengerRating).toBe(1100 + runA.challengerRatingDelta);

      // Determinism verification
      expect(runB.outcome).toBe(runA.outcome);
      expect(runB.totalTurns).toBe(runA.totalTurns);
      expect(runB.challengerDamageDealt).toBe(runA.challengerDamageDealt);
      expect(runB.defenderDamageDealt).toBe(runA.defenderDamageDealt);
      expect(runB.combatLog).toEqual(runA.combatLog);
    });

    it('handles defender victory and AI companion squads cleanly', () => {
      const noviceChallenger: ArenaFighterSnapshot = {
        characterId: 'novice-1',
        name: 'Apprentice',
        overallLevel: 1,
        coreStats: {
          strengthLevel: 2,
          enduranceLevel: 2,
          agilityLevel: 2,
        },
        arenaRating: 950,
      };

      const nineFlare = DEFAULT_ARENA_RIVAL_PRESETS[2]!;
      const lossResult = simulateAsyncArenaMatch({
        matchId: 'arena-match-loss',
        challenger: noviceChallenger,
        defender: nineFlare,
        seed: 'arena-loss-seed',
      });

      expect(lossResult.outcome).toBe('DEFENDER_VICTORY');
      expect(lossResult.winnerCharacterId).toBe(nineFlare.characterId);
      expect(lossResult.loserCharacterId).toBe('novice-1');
      expect(lossResult.goldAwarded).toBe(15);
      expect(lossResult.seasonPointsAwarded).toBe(10);
      expect(lossResult.defenderDamageDealt).toBeGreaterThan(0);

      // With strong AI companion squad + maxTurns boundary check
      const squadResult = simulateAsyncArenaMatch({
        matchId: 'arena-match-squad',
        challenger: DEFAULT_ARENA_RIVAL_PRESETS[1]!,
        defender: DEFAULT_ARENA_RIVAL_PRESETS[2]!,
        challengerCompanions: [ADVENTURER_COMPANY_AI_PRESETS[0]!, ADVENTURER_COMPANY_AI_PRESETS[2]!],
        seed: 'arena-squad-seed',
        maxTurns: 40,
      });

      expect(squadResult.finalState.units.filter((u) => u.side === 'PARTY').length).toBe(3);
      expect(squadResult.challengerDamageDealt).toBeGreaterThan(0);
    });
  });
});

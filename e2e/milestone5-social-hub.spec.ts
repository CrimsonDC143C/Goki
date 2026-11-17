import { expect, test } from '@playwright/test';

test.describe('Milestone 5: Social Hub, Gym Clans, Companies, Friends, Leaderboards & Async Arena', () => {
  test('navigates all 5 Social sub-views, NPC dialogues, dual clan discovery/submission, 30-member company squad, friends, leaderboards, and Async Arena sparring', async ({
    page,
  }) => {
    const characterId = 'char_e2e_m5_1';
    const userId = 'usr_e2e_m5_1';

    let activeGymClan: Record<string, any> | null = null;
    let activeCompany: Record<string, any> | null = null;

    let incomingRequests: Array<Record<string, any>> = [
      {
        id: 'friend_in_1',
        requesterId: 'usr_friend_lyra',
        addresseeId: userId,
        status: 'PENDING',
        requester: {
          id: 'usr_friend_lyra',
          username: 'lyra_lifts',
          characters: [
            {
              id: 'char_friend_lyra',
              name: 'Lyra Vanguard',
              overallLevel: 6,
              arenaRating: 1085,
            },
          ],
        },
        addressee: {
          id: userId,
          username: 'SocialHero',
          characters: [{ id: characterId, name: 'Kurogane', overallLevel: 5, arenaRating: 1000 }],
        },
      },
    ];
    let acceptedFriends: Array<Record<string, any>> = [];
    let outgoingRequests: Array<Record<string, any>> = [];

    let arenaRating = 1000;
    let arenaWins = 0;
    let arenaLosses = 0;

    const homeClan = {
      id: 'clan_open_world_home',
      slug: 'open_world_home',
      venueKey: 'system:open_world_home',
      name: 'Hearthstone Open-World Sanctum',
      tag: 'HOME',
      kind: 'OPEN_WORLD_HOME',
      venueSource: 'SYSTEM_SEED',
      clanLevel: 5,
      clanReputation: 12450,
      _count: { members: 42 },
      seasons: [{ totalSeasonPoints: 6250 }],
    };

    const characterSheet = {
      id: characterId,
      userId,
      name: 'Kurogane',
      gameMode: 'STANDARD',
      race: 'ONI',
      appearanceId: 'oni_warlord',
      avatarSpriteId: 'oni_warlord',
      deletedAt: null,
      adventurerRank: 'IRON',
      adventurerReputation: 250,
      overallLevel: 5,
      dexLevel: 4,
      conLevel: 5,
      wisLevel: 3,
      sprLevel: 3,
      gold: 400,
      arenaRating,
      arenaWins,
      arenaLosses,
      onboardingCompletedAt: new Date().toISOString(),
      stats: {
        strengthLevel: 7,
        enduranceLevel: 6,
        agilityLevel: 5,
      },
      fatigueState: {
        isRestingInTavern: true,
        fatigueScore: 0,
        wellRestedMultiplier: 1.15,
      },
      talentUnlocks: [],
      activeSkillLoadout: [],
      beltLoadout: [null, null, null, null],
      equipmentLoadout: {},
      inventoryItems: [],
      _count: { workoutLogs: 4 },
    };

    await page.route('**/health', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok' }),
      });
    });

    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: userId,
            email: 'm5_hero@gokirpg.local',
            username: 'SocialHero',
            timezone: 'UTC',
          },
          character: characterSheet,
          characters: [characterSheet],
          deletedCharacters: [],
        }),
      });
    });

    await page.route(`**/api/characters/${characterId}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ character: characterSheet }),
      });
    });

    await page.route('**/api/raids', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          raids: [
            {
              id: 'raid_home_wyrm',
              bossSlug: 'ignisrax_world_wyrm',
              bossName: 'Ignisrax, the World-Forge Wyrm',
              accessType: 'PUBLIC_WORLD',
              gymClanId: homeClan.id,
              maxHp: 2500000,
              currentHp: 1850000,
              endsAt: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
              contributions: [],
            },
          ],
        }),
      });
    });

    await page.route('**/api/social/overview*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          homeClan,
          gymClan: activeGymClan,
          memberships: [],
          company: activeCompany,
          raids: [],
          friendsCount: acceptedFriends.length,
          pendingFriendRequestsCount: incomingRequests.length,
          pendingIncomingFriendsCount: incomingRequests.length,
          arenaRating,
          arenaWins,
          arenaLosses,
          seasonKey: '2026-11',
        }),
      });
    });

    await page.route('**/api/social/gyms/discover*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          venues: [
            {
              venueKey: 'osm:node:900101',
              name: 'Iron Temple Barbell',
              source: 'OSM_OVERPASS',
              latitude: 37.7749,
              longitude: -122.4194,
              address: '412 Foundry Ave',
              city: 'San Francisco',
              countryCode: 'US',
              externalPlaceId: 'node:900101',
              osmElementType: 'node',
              osmElementId: '900101',
              distanceMeters: 180,
              existingClanId: 'clan_iron_temple',
              existingClanTag: 'ITB',
              existingClanLevel: 3,
              memberCount: 18,
            },
          ],
          sourcesUsed: ['OSM_OVERPASS', 'LOCAL_CLAN_DB'],
          overpassFallbackUsed: false,
        }),
      });
    });

    await page.route('**/api/social/clans/claim-or-join', async (route) => {
      const body = JSON.parse(route.request().postData() || '{}');
      const venueName = body.venue?.name || 'Iron Temple Barbell';
      activeGymClan = {
        id: body.clanId || 'clan_user_submitted_1',
        slug: 'user_gym_1',
        venueKey: `geo:${Number(body.venue?.latitude ?? 37.77).toFixed(3)}:${Number(body.venue?.longitude ?? -122.42).toFixed(3)}:gym`,
        name: venueName,
        tag: body.venue?.tag || 'GYM',
        kind: 'GYM_VENUE',
        venueSource: body.venue?.venueSource || 'USER_SUBMITTED',
        city: body.venue?.city || 'Denver',
        latitude: body.venue?.latitude ?? 39.7392,
        longitude: body.venue?.longitude ?? -104.9903,
        clanLevel: 1,
        clanReputation: 150,
        _count: { members: 1 },
        seasons: [{ totalSeasonPoints: 150 }],
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          clan: activeGymClan,
          membership: { id: 'mem_gym_1', gymClanId: activeGymClan.id, role: 'WARDEN' },
          deduplicated: false,
        }),
      });
    });

    await page.route('**/api/social/companies', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            companies: activeCompany ? [activeCompany] : [],
          }),
        });
        return;
      }

      const body = JSON.parse(route.request().postData() || '{}');
      activeCompany = {
        id: 'company_vg30',
        name: body.name || 'Vanguard Thirty',
        tag: body.tag || 'VG30',
        motto: body.motto || '30 strong, 4 in the vanguard.',
        commanderCharacterId: characterId,
        companyLevel: 1,
        companyReputation: 250,
        maxRosterSize: 30,
        maxActiveSquadSize: 4,
        _count: { members: 1 },
        members: [
          {
            id: 'cmem_1',
            characterId,
            role: 'COMMANDER',
            activeSquadSlot: 1,
            contributedReputation: 250,
            character: { name: 'Kurogane', overallLevel: 5, race: 'ONI' },
          },
        ],
      };
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ company: activeCompany }),
      });
    });

    await page.route('**/api/social/companies/company_vg30', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ company: activeCompany }),
      });
    });

    await page.route('**/api/social/companies/company_vg30/squad', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          companyId: 'company_vg30',
          activeSquad: activeCompany?.members ?? [],
          members: activeCompany?.members ?? [],
        }),
      });
    });

    await page.route('**/api/social/friends', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          friends: acceptedFriends,
          incomingRequests,
          outgoingRequests,
        }),
      });
    });

    await page.route('**/api/social/friends/friend_in_1/respond', async (route) => {
      const target = incomingRequests.find((r) => r.id === 'friend_in_1');
      incomingRequests = [];
      if (target) {
        acceptedFriends = [{ ...target, status: 'ACCEPTED' }];
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ friendship: acceptedFriends[0] ?? null }),
      });
    });

    await page.route('**/api/social/friends/request', async (route) => {
      const body = JSON.parse(route.request().postData() || '{}');
      const created = {
        id: 'friend_out_1',
        requesterId: userId,
        addresseeId: 'usr_target_1',
        status: 'PENDING',
        addressee: {
          id: 'usr_target_1',
          username: body.targetUsername || 'valkyrie_sera',
          characters: [
            {
              id: 'char_target_1',
              name: 'Valkyrie Sera',
              overallLevel: 8,
              arenaRating: 1120,
            },
          ],
        },
      };
      outgoingRequests = [created, ...outgoingRequests];
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ friendship: created }),
      });
    });

    await page.route('**/api/social/leaderboards*', async (route) => {
      const url = new URL(route.request().url());
      const category = url.searchParams.get('category') || 'GYM_CLANS';
      let entries: Array<Record<string, any>> = [];
      if (category === 'GYM_CLANS') {
        entries = [
          {
            id: 'season_1',
            gymClanId: homeClan.id,
            workoutPoints: 4200,
            raidPoints: 1500,
            arenaPoints: 550,
            totalSeasonPoints: 6250,
            gymClan: homeClan,
          },
        ];
      } else if (category === 'COMPANIES') {
        entries = [
          {
            id: 'company_vg30',
            name: activeCompany?.name || 'Vanguard Thirty',
            tag: activeCompany?.tag || 'VG30',
            companyLevel: 1,
            companyReputation: 250,
            _count: { members: 1 },
          },
        ];
      } else if (category === 'ARENA') {
        entries = [
          {
            id: characterId,
            name: 'Kurogane',
            overallLevel: 5,
            arenaRating,
            arenaWins,
            arenaLosses,
          },
        ];
      } else {
        entries = [
          {
            id: characterId,
            name: 'Kurogane',
            overallLevel: 5,
            adventurerRank: 'IRON',
            adventurerReputation: 250,
            arenaRating,
          },
        ];
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ category, seasonKey: '2026-11', entries }),
      });
    });

    await page.route('**/api/social/arena/opponents*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          opponents: [],
          rivalPresets: [
            {
              slug: 'arena_rival_iron_ronin',
              characterId: 'arena_rival_iron_ronin',
              name: 'Kenji, Iron Ronin',
              title: 'Iron Ronin',
              gymClanName: 'Ironclad Dojo',
              overallLevel: 3,
              race: 'HUMAN',
              arenaRating: 1000,
            },
          ],
          recentMatches: [],
        }),
      });
    });

    await page.route('**/api/social/arena/spar', async (route) => {
      arenaRating = 1014;
      arenaWins += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          match: {
            id: 'arena_match_e2e_1',
            defenderName: 'Kenji, Iron Ronin',
            outcome: 'CHALLENGER_VICTORY',
            totalTurns: 5,
            challengerDamageDealt: 198,
            defenderDamageDealt: 76,
            challengerRatingBefore: 1000,
            challengerRatingAfter: 1014,
            goldAwarded: 45,
            seasonPointsAwarded: 45,
            createdAt: new Date().toISOString(),
          },
          simulation: {
            outcome: 'CHALLENGER_VICTORY',
            winnerCharacterId: characterId,
            loserCharacterId: 'arena_rival_iron_ronin',
            totalTurns: 5,
            challengerRemainingHp: 142,
            defenderRemainingHp: 0,
            challengerDamageDealt: 198,
            defenderDamageDealt: 76,
            challengerRatingDelta: 14,
            nextChallengerRating: 1014,
            goldAwarded: 45,
            seasonPointsAwarded: 45,
            combatLog: [
              { seq: 1, turnNumber: 1, type: 'DAMAGE', message: 'Kurogane strikes Kenji for 42 dmg!' },
              { seq: 2, turnNumber: 5, type: 'UNIT_DEFEATED', message: 'Kenji, Iron Ronin defeated!' },
            ],
          },
        }),
      });
    });

    await page.addInitScript(() => {
      window.localStorage.setItem(
        'goki_auth_jwt_token_v1',
        'e2e_mock_jwt_token_header.payload.signature'
      );
    });

    await page.goto('/');
    await expect(page.getByText('Kurogane').first()).toBeVisible({ timeout: 10000 });
    await page.getByTestId('action-enter-world').click();

    await expect(page.getByTestId('world-tab-social')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('world-tab-social').click();

    // 1. Verify Clan Warden & Company Quartermaster NPC Dialogues
    await page.getByTestId('social-npc-warden-btn').click();
    const wardenDialogue = page.getByTestId('clan-warden-dialogue');
    await expect(wardenDialogue).toBeVisible();
    await expect(wardenDialogue.getByText('Warden Torin').first()).toBeVisible();
    await wardenDialogue.getByTestId('npc-dialogue-close-btn').click();
    await expect(wardenDialogue).not.toBeVisible();

    await page.getByTestId('social-npc-quartermaster-btn').click();
    const quartermasterDialogue = page.getByTestId('company-quartermaster-dialogue');
    await expect(quartermasterDialogue).toBeVisible();
    await expect(quartermasterDialogue.getByText('Commander Veyra').first()).toBeVisible();
    await quartermasterDialogue.getByTestId('npc-dialogue-close-btn').click();
    await expect(quartermasterDialogue).not.toBeVisible();

    // 2. My Clan & Raid: Verify HOME clan + Gym Discovery + Submit Custom Venue
    await expect(page.getByText('Hearthstone Open-World Sanctum [HOME]').first()).toBeVisible();
    await page.getByTestId('gym-search-input').fill('Iron Temple');
    await page.getByTestId('gym-search-btn').click();
    await expect(page.getByText('Iron Temple Barbell').first()).toBeVisible();

    await page.getByTestId('gym-submit-name-input').fill('Mile High Iron Club');
    await page.getByTestId('gym-submit-city-input').fill('Denver');
    await page.getByTestId('gym-submit-lat-input').fill('39.7392');
    await page.getByTestId('gym-submit-lon-input').fill('-104.9903');
    await page.getByTestId('gym-submit-btn').click();
    await expect(page.getByTestId('active-gym-clan-card')).toContainText('Mile High Iron Club');
    await expect(page.getByText('Home Sanctum & Gym Clan 7-Day Raids').first()).toBeVisible();

    // 3. Company: Create 30-member roster Company & verify 4-Player Active Squad
    await page.getByTestId('social-subtab-company').click();
    await expect(
      page.getByText('Cross-Gym 30-Member Roster & 4-Player Squad').first()
    ).toBeVisible();
    await page.getByTestId('company-name-input').fill('Vanguard Thirty');
    await page.getByTestId('company-tag-input').fill('VG30');
    await page.getByTestId('company-motto-input').fill('30 strong, 4 in the vanguard.');
    await page.getByTestId('company-create-btn').click();

    await expect(page.getByText('Vanguard Thirty [VG30]').first()).toBeVisible();
    await expect(page.getByText('1 / 30 Members').first()).toBeVisible();
    await expect(page.getByTestId('company-squad-section')).toBeVisible();
    await page.getByTestId('company-save-squad-btn').click();

    // 4. Friends: Accept incoming request & send new request
    await page.getByTestId('social-subtab-friends').click();
    await expect(page.getByText('Lyra Vanguard').first()).toBeVisible();
    await page.getByTestId('friend-accept-btn-friend_in_1').click();
    await expect(page.getByText('Training Allies (1)').first()).toBeVisible();

    await page.getByTestId('friend-request-input').fill('valkyrie_sera');
    await page.getByTestId('friend-request-send-btn').click();
    await expect(page.getByText('Outgoing Requests (1)').first()).toBeVisible();
    await expect(page.getByText('Valkyrie Sera').first()).toBeVisible();

    // 5. Leaderboards: Cycle categories
    await page.getByTestId('social-subtab-leaderboards').click();
    await expect(page.getByText('Hearthstone Open-World Sanctum [HOME]').first()).toBeVisible();
    await page.getByTestId('leaderboard-cat-COMPANIES').click();
    await expect(page.getByText('Vanguard Thirty [VG30]').first()).toBeVisible();
    await page.getByTestId('leaderboard-cat-HEROES').click();
    await expect(page.getByText('Kurogane').first()).toBeVisible();
    await page.getByTestId('leaderboard-cat-ARENA').click();
    await expect(page.getByText('Kurogane').first()).toBeVisible();

    // 6. Arena: Toggle Squad & Spar against Iron Ronin
    await page.getByTestId('social-subtab-arena').click();
    await page.getByTestId('arena-squad-toggle').click();
    await page.getByTestId('arena-spar-btn-arena_rival_iron_ronin').click();

    const resultCard = page.getByTestId('arena-match-result-card');
    await expect(resultCard).toBeVisible();
    await expect(resultCard).toContainText('VICTORY');
    await expect(resultCard).toContainText('5 Turns');
    await expect(resultCard).toContainText('+14 Elo');
    await expect(resultCard).toContainText('Kurogane strikes Kenji for 42 dmg!');
  });
});

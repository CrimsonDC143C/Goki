import crypto from 'crypto';
import { expect, test, type Page } from '@playwright/test';

const TEST_JWT_SECRET =
  process.env.JWT_SECRET || 'goki_jwt_super_secret_dev_secret_key_2026';

function signTestJwt(payload: {
  userId: string;
  email: string;
  username: string;
}): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
    'base64url'
  );
  const body = Buffer.from(
    JSON.stringify({
      ...payload,
      iat: Math.floor(Date.now() / 1000),
    })
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', TEST_JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${sig}`;
}

async function setupMockCharacterPage(params: {
  page: Page;
  token: string;
  user: { id: string; email: string; username: string };
  character: Record<string, any>;
  activeCompany?: Record<string, any> | null;
}) {
  const { page, token, user, character, activeCompany = null } = params;

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
        user: { ...user, timezone: 'UTC' },
        character,
        characters: [character],
        deletedCharacters: [],
      }),
    });
  });

  await page.route(`**/api/characters/${character.id}`, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ character }),
      });
    } else {
      await route.continue();
    }
  });

  await page.route('**/api/adventurers-guild/quests', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        quests: [],
        liveQuests: [],
        rankUpTrials: [],
      }),
    });
  });

  await page.route('**/api/social/overview**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        homeClan: {
          id: 'clan_open_world_home',
          slug: 'open_world_home',
          venueKey: 'system:open_world_home',
          name: 'Hearthstone Open-World Sanctum',
          tag: 'HOME',
          kind: 'OPEN_WORLD_HOME',
          venueSource: 'SYSTEM_SEED',
          clanLevel: 4,
          clanReputation: 8200,
          _count: { members: 18 },
          seasons: [{ totalSeasonPoints: 3400 }],
        },
        gymClan: null,
        company: activeCompany,
        arenaRating: 1000,
        arenaWins: 0,
        arenaLosses: 0,
      }),
    });
  });

  if (activeCompany) {
    await page.route(`**/api/social/companies/${activeCompany.id}**`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ company: activeCompany }),
      });
    });
  }

  await page.route('**/api/social/companies', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ companies: activeCompany ? [activeCompany] : [] }),
    });
  });

  await page.route('**/api/social/friends**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ incoming: [], outgoing: [], accepted: [] }),
    });
  });

  await page.route('**/api/social/arena/opponents**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ opponents: [] }),
    });
  });

  await page.addInitScript((jwt: string) => {
    window.localStorage.setItem('goki_auth_jwt_token_v1', jwt);
    window.localStorage.setItem('goki_ws_base_url', 'ws://localhost:4000');
  }, token);
}

test.describe('Milestone 6: Art-Registry Layout Hooks & Real-Time WebSocket Co-op', () => {
  test('renders drop-in environment backdrop/header slots across Hero, Adventure, Artisan, Social, and NPC expression variants', async ({
    page,
  }) => {
    const token = signTestJwt({
      userId: 'usr_m6_hooks',
      email: 'm6_hooks@gokirpg.local',
      username: 'ArtTester',
    });

    const character = {
      id: 'char_m6_hooks',
      userId: 'usr_m6_hooks',
      name: 'Kurogane',
      gameMode: 'STANDARD',
      race: 'ONI',
      appearanceId: 'oni_warlord',
      avatarSpriteId: 'oni_warlord',
      deletedAt: null,
      adventurerRank: 'COPPER',
      adventurerReputation: 0,
      overallLevel: 3,
      dexLevel: 3,
      conLevel: 3,
      wisLevel: 2,
      sprLevel: 2,
      gold: 300,
      onboardingCompletedAt: new Date().toISOString(),
      stats: {
        strengthLevel: 5,
        enduranceLevel: 5,
        agilityLevel: 5,
      },
      fatigueState: {
        isRestingInTavern: true,
        fatigueScore: 0,
        wellRestedMultiplier: 1.15,
      },
      equipmentLoadout: {},
      inventoryItems: [],
      _count: { workoutLogs: 2 },
    };

    const activeCompany = {
      id: 'comp_m6_1',
      name: 'Vanguard Four',
      tag: 'VG4',
      motto: 'Four blades, one rhythm.',
      commanderCharacterId: character.id,
      companyLevel: 2,
      companyReputation: 450,
      maxRosterSize: 30,
      maxActiveSquadSize: 4,
      memberCount: 1,
      members: [
        {
          id: 'cm_1',
          companyId: 'comp_m6_1',
          characterId: character.id,
          characterName: character.name,
          overallLevel: 3,
          role: 'COMMANDER',
          activeSquadSlot: 1,
          contributedReputation: 450,
        },
      ],
    };

    await setupMockCharacterPage({
      page,
      token,
      user: { id: 'usr_m6_hooks', email: 'm6_hooks@gokirpg.local', username: 'ArtTester' },
      character,
      activeCompany,
    });

    await page.goto('/');
    await expect(page.getByText('Kurogane').first()).toBeVisible({ timeout: 10000 });
    await page.getByTestId('action-enter-world').click();
    await expect(page.getByTestId('world-tab-hero')).toBeVisible({ timeout: 10000 });

    // 1. Hero scene backdrop & header slot + NPC expression variant transitions
    await expect(page.getByTestId('hub-backdrop-hero_sanctum')).toBeAttached();
    await expect(page.getByTestId('hub-header-slot-hero_sanctum')).toBeVisible();

    await page.getByTestId('hero-npc-guide-btn').click();
    await expect(page.getByTestId('npc-dialogue-overlay')).toBeVisible();
    await expect(page.getByTestId('npc-dialogue-scene-slot')).toBeAttached();
    await expect(page.getByTestId('npc-portrait-guide-happy')).toBeVisible();
    await page.getByTestId('npc-dialogue-next-btn').click();
    await expect(page.getByTestId('npc-portrait-guide-focused')).toBeVisible();
    await page.getByTestId('npc-dialogue-close-btn').click();

    // 2. Adventure scene slots
    await page.getByTestId('world-tab-adventure').click();
    await expect(page.getByTestId('hub-header-slot-adventure_expedition_map')).toBeVisible();
    await page.getByTestId('adventure-subtab-quests').click();
    await expect(page.getByTestId('hub-header-slot-adventure_guild_hall')).toBeVisible();
    await expect(page.getByTestId('coop-quest-panel')).toBeVisible();

    // 3. Artisan scene slots
    await page.getByTestId('world-tab-artisan').click();
    await expect(page.getByTestId('hub-header-slot-artisan_gathering_wilds')).toBeVisible();
    await page.getByTestId('artisan-subtab-craft').click();
    await expect(page.getByTestId('hub-header-slot-artisan_forge_apothecary')).toBeVisible();

    // 4. Social scene slots + Company Co-op squad sync banner
    await page.getByTestId('world-tab-social').click();
    await expect(page.getByTestId('hub-header-slot-social_clan_hall')).toBeVisible();
    await page.getByTestId('social-subtab-company').click();
    await expect(page.getByTestId('hub-header-slot-social_company_tavern')).toBeVisible();
    await expect(page.getByTestId('company-coop-ready-strip')).toBeVisible();
  });

  test('runs live 2-squadmate WebSocket co-op combat in company-quest:{runId} with lobby readiness, turn timer, and AI takeover on disconnect', async ({
    browser,
  }) => {
    const runId = `e2e_coop_${Date.now()}`;

    const tokenA = signTestJwt({
      userId: 'usr_coop_a',
      email: 'coop_a@gokirpg.local',
      username: 'VanguardA',
    });
    const tokenB = signTestJwt({
      userId: 'usr_coop_b',
      email: 'coop_b@gokirpg.local',
      username: 'SentinelB',
    });

    const charA = {
      id: 'char_coop_a',
      userId: 'usr_coop_a',
      name: 'VanguardA',
      gameMode: 'STANDARD',
      race: 'ONI',
      appearanceId: 'oni_warlord',
      avatarSpriteId: 'oni_warlord',
      deletedAt: null,
      adventurerRank: 'COPPER',
      adventurerReputation: 0,
      overallLevel: 6,
      dexLevel: 8,
      conLevel: 6,
      wisLevel: 4,
      sprLevel: 4,
      gold: 300,
      onboardingCompletedAt: new Date().toISOString(),
      stats: {
        strengthLevel: 8,
        enduranceLevel: 6,
        agilityLevel: 26,
      },
      fatigueState: {
        isRestingInTavern: true,
        fatigueScore: 0,
        wellRestedMultiplier: 1.15,
      },
      equipmentLoadout: {},
      inventoryItems: [],
      _count: { workoutLogs: 2 },
    };

    const charB = {
      id: 'char_coop_b',
      userId: 'usr_coop_b',
      name: 'SentinelB',
      gameMode: 'STANDARD',
      race: 'KITSUNE',
      appearanceId: 'blade_dancer',
      avatarSpriteId: 'blade_dancer',
      deletedAt: null,
      adventurerRank: 'COPPER',
      adventurerReputation: 0,
      overallLevel: 5,
      dexLevel: 4,
      conLevel: 6,
      wisLevel: 5,
      sprLevel: 5,
      gold: 280,
      onboardingCompletedAt: new Date().toISOString(),
      stats: {
        strengthLevel: 6,
        enduranceLevel: 6,
        agilityLevel: 6,
      },
      fatigueState: {
        isRestingInTavern: true,
        fatigueScore: 0,
        wellRestedMultiplier: 1.15,
      },
      equipmentLoadout: {},
      inventoryItems: [],
      _count: { workoutLogs: 2 },
    };

    const ctxA = await browser.newContext({ viewport: { width: 480, height: 860 } });
    const ctxB = await browser.newContext({ viewport: { width: 480, height: 860 } });
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    try {
      await setupMockCharacterPage({
        page: pageA,
        token: tokenA,
        user: { id: 'usr_coop_a', email: 'coop_a@gokirpg.local', username: 'VanguardA' },
        character: charA,
      });
      await setupMockCharacterPage({
        page: pageB,
        token: tokenB,
        user: { id: 'usr_coop_b', email: 'coop_b@gokirpg.local', username: 'SentinelB' },
        character: charB,
      });

      await Promise.all([pageA.goto('/'), pageB.goto('/')]);
      await expect(pageA.getByText('VanguardA').first()).toBeVisible({ timeout: 10000 });
      await expect(pageB.getByText('SentinelB').first()).toBeVisible({ timeout: 10000 });

      await pageA.getByTestId('action-enter-world').click();
      await pageB.getByTestId('action-enter-world').click();

      await expect(pageA.getByTestId('world-tab-adventure')).toBeVisible({ timeout: 10000 });
      await expect(pageB.getByTestId('world-tab-adventure')).toBeVisible({ timeout: 10000 });

      await pageA.getByTestId('world-tab-adventure').click();
      await pageB.getByTestId('world-tab-adventure').click();
      await pageA.getByTestId('adventure-subtab-quests').click();
      await pageB.getByTestId('adventure-subtab-quests').click();

      // Both join the exact same company-quest:{runId} room
      const inputA = pageA.getByTestId('coop-run-id-input');
      const inputB = pageB.getByTestId('coop-run-id-input');
      await inputA.scrollIntoViewIfNeeded();
      await inputA.fill(runId);
      await pageA.getByTestId('coop-join-room-btn').click();

      await inputB.scrollIntoViewIfNeeded();
      await inputB.fill(runId);
      await pageB.getByTestId('coop-join-room-btn').click();

      await expect(pageA.getByTestId('coop-lobby-card')).toBeVisible({ timeout: 10000 });
      await expect(pageB.getByTestId('coop-lobby-card')).toBeVisible({ timeout: 10000 });
      await expect(pageA.getByTestId('coop-slot-1')).toContainText('VanguardA', { timeout: 10000 });
      await expect(pageA.getByTestId('coop-slot-2')).toContainText('SentinelB', { timeout: 10000 });

      // Start button stays disabled until all connected squadmates ready up
      const startBtnA = pageA.getByTestId('coop-start-btn');
      await expect(startBtnA).toHaveAttribute('aria-disabled', 'true');

      await pageA.getByTestId('coop-ready-btn').click();
      await expect(pageA.getByTestId('coop-slot-1')).toContainText('Ready', { timeout: 5000 });
      await expect(startBtnA).toHaveAttribute('aria-disabled', 'true');

      await pageB.getByTestId('coop-ready-btn').click();
      await expect(startBtnA).not.toHaveAttribute('aria-disabled', 'true', { timeout: 10000 });

      // Launch live authoritative co-op combat
      await startBtnA.click();

      await expect(pageA.getByTestId('turn-based-arena-screen')).toBeVisible({ timeout: 10000 });
      await expect(pageB.getByTestId('turn-based-arena-screen')).toBeVisible({ timeout: 10000 });
      await expect(pageA.getByTestId('arena-turn-timer-pill')).toBeVisible();
      await expect(pageB.getByTestId('arena-turn-timer-pill')).toBeVisible();

      // VanguardA acts first -> pageA has command deck, pageB shows waiting banner
      await expect(pageA.getByTestId('arena-action-guard')).toBeVisible({ timeout: 8000 });
      await expect(pageB.getByTestId('arena-waiting-turn-banner')).toBeVisible({ timeout: 8000 });

      await pageA.getByTestId('arena-action-guard').click();

      // Disconnect Squadmate B -> Server automatically switches SentinelB to AI Takeover
      await ctxB.close();
      await expect(pageA.getByTestId('arena-unit-ai-badge-char_coop_b')).toBeVisible({
        timeout: 10000,
      });
    } finally {
      await ctxA.close().catch(() => {});
      await ctxB.close().catch(() => {});
    }
  });
});

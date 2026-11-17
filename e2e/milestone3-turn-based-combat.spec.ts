import { test, expect } from '@playwright/test';

test.describe('Milestone 3: Active Loadout, Adventurer Guild, & Turn-Based Combat', () => {
  test('equips active skills and belt rations, briefs with Guild Receptionist, completes turn-based combat with bone-rigged hero, and syncs offline run', async ({
    page,
  }) => {
    let guildOffline = false;
    let savedLoadoutPayload: { activeSkillIds?: string[]; beltConsumables?: Array<string | null> } | null =
      null;
    let syncedOfflinePayload: { characterId?: string; completedRuns?: Array<Record<string, any>> } | null =
      null;

    const characterSheet = {
      id: 'char_e2e_m3_1',
      userId: 'usr_e2e_m3_1',
      name: 'Kurogane',
      gameMode: 'STANDARD',
      race: 'ONI',
      appearanceId: 'oni_warlord',
      avatarSpriteId: 'oni_warlord',
      deletedAt: null,
      adventurerRank: 'COPPER',
      adventurerReputation: 0,
      overallLevel: 4,
      dexLevel: 3,
      conLevel: 4,
      wisLevel: 4,
      sprLevel: 3,
      gold: 250,
      stats: {
        strengthLevel: 5,
        enduranceLevel: 5,
        agilityLevel: 6,
      },
      fatigueState: {
        isRestingInTavern: true,
        fatigueScore: 0,
        wellRestedMultiplier: 1.15,
      },
      talentUnlocks: [
        {
          currentRank: 1,
          talentNode: { slug: 'jug_shield_slam' },
        },
        {
          currentRank: 1,
          talentNode: { slug: 'cle_divine_intervention' },
        },
      ],
      activeSkillLoadout: [],
      beltLoadout: [null, null, null, null],
      equipmentLoadout: {},
      inventoryItems: [],
      _count: { workoutLogs: 2 },
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
            id: 'usr_e2e_m3_1',
            email: 'm3_hero@gokirpg.local',
            username: 'GuildHero',
            timezone: 'UTC',
          },
          character: characterSheet,
          characters: [characterSheet],
          deletedCharacters: [],
        }),
      });
    });

    await page.route('**/api/characters/char_e2e_m3_1', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ character: characterSheet }),
        });
      } else {
        await route.continue();
      }
    });

    await page.route('**/api/characters/char_e2e_m3_1/combat-loadout', async (route) => {
      if (route.request().method() === 'PUT') {
        const body = JSON.parse(route.request().postData() || '{}');
        savedLoadoutPayload = body;
        characterSheet.activeSkillLoadout = body.activeSkillIds ?? [];
        characterSheet.beltLoadout = body.beltConsumables ?? [null, null, null, null];
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            character: characterSheet,
            activeSkillLoadout: characterSheet.activeSkillLoadout,
            beltLoadout: characterSheet.beltLoadout,
          }),
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

    await page.route('**/api/adventurers-guild/quests/*/start', async (route) => {
      if (guildOffline) {
        await route.abort('internetdisconnected');
        return;
      }
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          run: { id: 'srv_run_e2e_1', status: 'IN_PROGRESS' },
        }),
      });
    });

    await page.route('**/api/adventurers-guild/runs/*/complete', async (route) => {
      if (guildOffline) {
        await route.abort('internetdisconnected');
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ outcome: 'VICTORY' }),
      });
    });

    await page.route('**/api/adventurers-guild/sync-offline', async (route) => {
      if (guildOffline) {
        await route.abort('internetdisconnected');
        return;
      }
      const body = JSON.parse(route.request().postData() || '{}');
      syncedOfflinePayload = body;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          syncedRuns: (body.completedRuns ?? []).map((r: { clientRunId: string }) => ({
            clientRunId: r.clientRunId,
            status: 'VICTORY',
            synced: true,
          })),
          character: characterSheet,
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

    // 1. Enter World and configure Active Skill Loadout under Hero
    await page.getByTestId('action-enter-world').click();
    await expect(page.getByTestId('world-tab-hero')).toBeVisible({ timeout: 10000 });

    const skillSlot0 = page.getByTestId('loadout-skill-slot-0');
    await skillSlot0.scrollIntoViewIfNeeded();
    await expect(skillSlot0).toBeVisible();
    await skillSlot0.click();

    await expect(page.getByTestId('loadout-skill-picker-sheet')).toBeVisible();
    await page.getByTestId('loadout-pick-skill-jug_shield_slam').click();
    await expect(page.getByTestId('loadout-skill-picker-sheet')).not.toBeVisible();
    await expect(skillSlot0).toContainText('Shield Slam');
    expect(savedLoadoutPayload?.activeSkillIds).toEqual(['jug_shield_slam']);

    // 2. Navigate to Adventure -> Guild Quests (separate from 24h Expeditions)
    await page.getByTestId('world-tab-adventure').click();
    await expect(page.getByTestId('adventure-subtab-expeditions')).toBeVisible();
    await page.getByTestId('adventure-subtab-quests').click();

    await expect(page.getByText('Live Turn-Based Quests & Trials').first()).toBeVisible();
    await expect(page.getByText('RANK-UP TRIALS').first()).toBeVisible();
    await expect(page.getByText('Crypt Gate Patrol').first()).toBeVisible();

    // 3. Open Guild Receptionist (Lyra Vance) desk & claim Field Rations
    await page.getByTestId('adventure-npc-btn').click();
    await expect(page.getByTestId('npc-dialogue-overlay')).toBeVisible();
    await expect(page.getByText('Lyra Vance').first()).toBeVisible();

    await page.getByTestId('npc-chip-claim-rations').click();
    await expect(page.getByTestId('npc-dialogue-text')).toContainText('Field Ration');
    await page.getByTestId('npc-dialogue-close-btn').click();
    await expect(page.getByTestId('npc-dialogue-overlay')).not.toBeVisible();

    // Verify belt slot 0 was auto-slotted with Sunleaf Healing Draught
    await expect(page.getByTestId('loadout-belt-slot-0')).toContainText('Sunleaf');

    // 4. Brief Crypt Gate Patrol via Guild Receptionist and launch Turn-Based Arena
    const briefBtn = page.getByTestId('guild-quest-brief-guild_contract_crypt_patrol');
    await briefBtn.scrollIntoViewIfNeeded();
    await briefBtn.click();
    await expect(page.getByTestId('npc-dialogue-overlay')).toBeVisible();
    await page.getByTestId('npc-chip-enter-arena').click();

    // 5. Verify Turn-Based Arena renders Turn-Order Timeline, Enemy Intent Telegraphs, and Bone-Rigged Hero
    await expect(page.getByTestId('turn-based-arena-screen')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('arena-turn-order-bar')).toBeVisible();
    await expect(page.getByTestId('arena-enemy-intent-0')).toBeVisible();

    // Toggle 2x speed for fast AI turns
    await page.getByTestId('arena-speed-btn').click();

    // Verify SVG parts of Milestone 2 bone-rigged hero render inside the arena stage
    await expect(page.getByTestId('turn-based-arena-screen').locator('svg').first()).toBeVisible();

    // 6. Execute interactive Turn-Based Combat (Guard/Parry, Active Skill, Belt Consumable, Basic Attack)
    const claimVictoryBtn = page.getByTestId('arena-claim-victory-btn');
    const attackBtn = page.getByTestId('arena-action-attack');
    const guardBtn = page.getByTestId('arena-action-guard');
    const skillBtn0 = page.getByTestId('arena-skill-btn-0');
    const beltBtn0 = page.getByTestId('arena-belt-btn-0');

    let playerActionsTaken = 0;
    let usedGuard = false;
    let usedSkill = false;
    let usedBelt = false;

    for (let step = 0; step < 30; step++) {
      if (await claimVictoryBtn.isVisible().catch(() => false)) {
        break;
      }

      const isPlayerReady = await attackBtn.isVisible().catch(() => false);
      if (!isPlayerReady) {
        await page.waitForTimeout(180);
        continue;
      }

      if (!usedGuard && (await guardBtn.isVisible().catch(() => false))) {
        await guardBtn.click();
        usedGuard = true;
      } else if (
        !usedSkill &&
        (await skillBtn0.isEnabled().catch(() => false))
      ) {
        await skillBtn0.click();
        usedSkill = true;
      } else if (
        !usedBelt &&
        (await beltBtn0.isEnabled().catch(() => false))
      ) {
        await beltBtn0.click();
        usedBelt = true;
      } else {
        await attackBtn.click();
      }

      playerActionsTaken += 1;
      await page.waitForTimeout(120);
    }

    expect(playerActionsTaken).toBeGreaterThanOrEqual(2);
    expect(usedGuard).toBe(true);
    await expect(claimVictoryBtn).toBeVisible({ timeout: 12000 });

    // 7. Simulate offline at victory claim to verify offline queueing & deferred server sync
    guildOffline = true;
    await claimVictoryBtn.click();

    // Guild Receptionist Victory Debrief appears automatically
    await expect(page.getByTestId('npc-dialogue-overlay')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('npc-dialogue-next-btn').click();
    await expect(page.getByTestId('npc-dialogue-text')).toContainText('+95 Gold');
    await expect(page.getByTestId('npc-dialogue-text')).toContainText('Saved offline');
    await page.getByText('Return to Guild Board').click();
    await expect(page.getByTestId('npc-dialogue-overlay')).not.toBeVisible();

    // Verify offline queue badge & trigger sync after network restores
    const syncBadge = page.getByTestId('guild-offline-sync-badge');
    await expect(syncBadge).toContainText('1 offline quest run queued');

    guildOffline = false;
    await page.getByTestId('guild-offline-sync-now-btn').click();

    await expect(syncBadge).toContainText('Guild Ledger Synced', { timeout: 8000 });
    expect(syncedOfflinePayload?.characterId).toBe('char_e2e_m3_1');
    expect(syncedOfflinePayload?.completedRuns?.length).toBe(1);
    expect(syncedOfflinePayload?.completedRuns?.[0]?.questSlug).toBe(
      'guild_contract_crypt_patrol'
    );
    expect(syncedOfflinePayload?.completedRuns?.[0]?.actions?.length).toBeGreaterThanOrEqual(2);
  });
});

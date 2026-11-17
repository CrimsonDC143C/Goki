import { test, expect } from '@playwright/test';

test.describe('Milestone 1 World Shell, Sub-Views, & NPC Dialogue', () => {
  test('navigates 5 World tabs, Hero sub-views, NPC dialogue overlay, and Train History', async ({
    page,
  }) => {
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
            id: 'usr_e2e_shell_1',
            email: 'shell_hero@gokirpg.local',
            username: 'ShellHero',
            timezone: 'UTC',
          },
          character: {
            id: 'char_e2e_shell_1',
            userId: 'usr_e2e_shell_1',
            name: 'Kurogane',
            gameMode: 'STANDARD',
            appearanceId: 'oni_warlord',
            avatarSpriteId: 'oni_warlord',
            deletedAt: null,
            adventurerRank: 'COPPER',
            adventurerReputation: 0,
            overallLevel: 1,
            dexLevel: 1,
            conLevel: 1,
            wisLevel: 1,
            sprLevel: 1,
            gold: 250,
            stats: {
              strengthLevel: 1,
              enduranceLevel: 1,
              agilityLevel: 1,
            },
            fatigueState: {
              isRestingInTavern: true,
              fatigueScore: 0,
              wellRestedMultiplier: 1.15,
            },
            equipmentLoadout: {},
            inventoryItems: [],
          },
          characters: [
            {
              id: 'char_e2e_shell_1',
              userId: 'usr_e2e_shell_1',
              name: 'Kurogane',
              gameMode: 'STANDARD',
              appearanceId: 'oni_warlord',
              avatarSpriteId: 'oni_warlord',
              deletedAt: null,
              adventurerRank: 'COPPER',
              adventurerReputation: 0,
              overallLevel: 1,
              gold: 250,
              stats: {
                strengthLevel: 1,
                enduranceLevel: 1,
                agilityLevel: 1,
              },
            },
          ],
          deletedCharacters: [],
        }),
      });
    });

    await page.route('**/api/characters/char_e2e_shell_1', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            character: {
              id: 'char_e2e_shell_1',
              userId: 'usr_e2e_shell_1',
              name: 'Kurogane',
              gameMode: 'STANDARD',
              appearanceId: 'oni_warlord',
              avatarSpriteId: 'oni_warlord',
              deletedAt: null,
              adventurerRank: 'COPPER',
              adventurerReputation: 0,
              overallLevel: 1,
              gold: 250,
              stats: {
                strengthLevel: 1,
                enduranceLevel: 1,
                agilityLevel: 1,
              },
              fatigueState: {
                isRestingInTavern: true,
                fatigueScore: 0,
                wellRestedMultiplier: 1.15,
              },
              equipmentLoadout: {},
              inventoryItems: [],
            },
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.addInitScript(() => {
      window.localStorage.setItem(
        'goki_auth_jwt_token_v1',
        'e2e_mock_jwt_token_header.payload.signature'
      );
    });

    await page.goto('/');
    await expect(page.getByText('Kurogane').first()).toBeVisible({ timeout: 10000 });

    // Enter World into the 5-tab shell
    const enterWorldBtn = page.getByTestId('action-enter-world');
    await expect(enterWorldBtn).toBeVisible();
    await enterWorldBtn.click();

    // 1. Assert all 5 World tabs exist
    await expect(page.getByTestId('world-tab-hero')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('world-tab-adventure')).toBeVisible();
    await expect(page.getByTestId('world-tab-artisan')).toBeVisible();
    await expect(page.getByTestId('world-tab-social')).toBeVisible();
    await expect(page.getByTestId('world-tab-train')).toBeVisible();

    // 2. Hero sub-views: Overview -> Appearance -> Talents
    await expect(page.getByText('Combat Derived Attributes').first()).toBeVisible();

    await page.getByTestId('hero-subtab-appearance').click();
    await expect(page.getByText('Appearance Presets').first()).toBeVisible();

    await page.getByTestId('hero-subtab-talents').click();
    await expect(page.getByTestId('talent-stat-tab-STRENGTH')).toBeVisible();

    // 3. Open and advance/close NPC Dialogue Overlay
    await page.getByTestId('hero-npc-guide-btn').click();
    await expect(page.getByTestId('npc-dialogue-overlay')).toBeVisible();
    await expect(page.getByTestId('npc-dialogue-text')).toBeVisible();
    await page.getByTestId('npc-dialogue-next-btn').click();
    await page.getByTestId('npc-dialogue-next-btn').click();
    await expect(page.getByTestId('npc-dialogue-overlay')).not.toBeVisible();

    // 4. Adventure, Artisan, Social tab navigation & sub-view placeholders
    await page.getByTestId('world-tab-adventure').click();
    await page.getByTestId('adventure-subtab-quests').click();
    await expect(page.getByText('Live Turn-Based Quests & Trials').first()).toBeVisible();

    await page.getByTestId('world-tab-artisan').click();
    await page.getByTestId('artisan-subtab-craft').click();
    await expect(page.getByText('Crafting, Reforging & Potion Brewing').first()).toBeVisible();

    await page.getByTestId('world-tab-social').click();
    await page.getByTestId('social-subtab-company').click();
    await expect(
      page.getByText('Cross-Gym 30-Member Roster & 4-Player Squad').first()
    ).toBeVisible();

    // 5. Train tab -> Workout set logging + History sub-view
    await page.getByTestId('world-tab-train').click();
    const gymCategoryCard = page.getByText('Gym / Resistance Training').first();
    if (await gymCategoryCard.isVisible({ timeout: 3000 }).catch(() => false)) {
      await gymCategoryCard.click();
    }

    const setCheckBtn = page.getByTestId('set-complete-btn').first();
    await expect(setCheckBtn).toBeVisible();
    await setCheckBtn.click();

    const skipRestBtn = page.getByText(/Skip Rest|Minimize/i).first();
    if (await skipRestBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await skipRestBtn.click();
    }

    await page.getByTestId('train-subtab-history').click();
    await expect(page.getByText('TRAINING HISTORY').first()).toBeVisible({ timeout: 5000 });
  });
});

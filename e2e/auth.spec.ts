import { test, expect } from '@playwright/test';

test.describe('E2E Authentication & Hub Navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept auth registration route to ensure deterministic responses in all environments
    await page.route('**/api/auth/register', async (route) => {
      if (route.request().method() === 'POST') {
        const body = JSON.parse(route.request().postData() || '{}');
        const token = 'e2e_mock_jwt_token_header.payload.signature';
        const character = {
          id: 'char_e2e_123',
          userId: 'usr_e2e_123',
          name: body.characterName || 'Kurogane',
          gameMode: body.gameMode || 'STANDARD',
          appearanceId: body.appearanceId || 'oni_warlord',
          avatarSpriteId: body.avatarSpriteId || 'oni_warlord',
          deletedAt: null,
          adventurerRank: 'COPPER',
          adventurerReputation: 0,
          overallLevel: 1,
          dexLevel: 1,
          dexXp: 0,
          conLevel: 1,
          conXp: 0,
          wisLevel: 1,
          wisXp: 0,
          sprLevel: 1,
          sprXp: 0,
          gold: 200,
          stats: {
            strengthLevel: 1,
            strengthXp: 0,
            strengthTalentPointsAvailable: 0,
            enduranceLevel: 1,
            enduranceXp: 0,
            enduranceTalentPointsAvailable: 0,
            agilityLevel: 1,
            agilityXp: 0,
            agilityTalentPointsAvailable: 0,
          },
          fatigueState: {
            isRestingInTavern: true,
            fatigueScore: 0,
            wellRestedMultiplier: 1.15,
          },
          equipmentLoadout: {},
          inventoryItems: [],
        };
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            token,
            user: {
              id: 'usr_e2e_123',
              email: body.email || 'e2e_hero@gokirpg.local',
              username: body.username || 'CrimsonE2E',
              timezone: body.timezone || 'UTC',
            },
            character,
            characters: [character],
            activeCharacters: [character],
            deletedCharacters: [],
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.route('**/api/characters/char_e2e_123', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            character: {
              id: 'char_e2e_123',
              userId: 'usr_e2e_123',
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
              gold: 200,
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
  });

  test('registers a new adventurer and navigates to World Hub / Character Profile', async ({
    page,
  }) => {
    await page.goto('/');

    // 1. Verify Landing Screen loads with zero-demo bootstrap state
    await expect(page.getByText('WORLD OF VERETHOR', { exact: true }).first()).toBeVisible();

    // 2. Open Auth Modal
    const authBtn = page.getByTestId('auth-open-btn');
    await expect(authBtn).toBeVisible();
    await authBtn.click();

    // 3. Fill in registration form with unique hero name
    const timestamp = Date.now();
    const testUsername = `Hero_${timestamp.toString().slice(-4)}`;
    const testEmail = `hero_${timestamp}@gokirpg.local`;
    const testHeroName = `Kurogane_${timestamp.toString().slice(-4)}`;

    await page.getByTestId('auth-username-input').fill(testUsername);
    await page.getByTestId('auth-email-input').fill(testEmail);
    await page.getByTestId('auth-password-input').fill('IronWill2026!');
    await page.getByTestId('auth-char-input').fill(testHeroName);

    // 4. Submit registration
    await page.getByTestId('auth-submit-btn').click();

    // 5. Enter World if still on Landing Screen after initial hero creation
    const enterWorldBtn = page.getByTestId('action-enter-world');
    if (await enterWorldBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await enterWorldBtn.click();
    }

    // 6. Assert user navigates to World Hub / Character Profile
    await expect(page.getByText(new RegExp(`${testHeroName}|Combat Derived Attributes`, 'i')).first()).toBeVisible({
      timeout: 10000,
    });

    // 7. Assert token is persisted in storage
    const tokenInStorage = await page.evaluate(() => {
      return (
        window.localStorage.getItem('goki_auth_jwt_token_v1') ||
        window.localStorage.getItem('goki_jwt_auth_token_v1') ||
        window.localStorage.getItem('goki_jwt_token')
      );
    });

    expect(tokenInStorage).toBeTruthy();
  });

  test('opens Hall of Heroes from Landing Screen and displays dual-hero roster capacity', async ({
    page,
  }) => {
    await page.goto('/');

    // 1. Verify Landing Screen loads
    await expect(page.getByText('WORLD OF VERETHOR', { exact: true }).first()).toBeVisible();

    // 2. Open Hall of Heroes Modal
    const manageBtn = page.getByTestId('landing-manage-heroes-btn');
    await expect(manageBtn).toBeVisible();
    await manageBtn.click();

    // 3. Verify Hall of Heroes dialog and 2-hero capacity rule
    await expect(page.getByText(/Hall of Heroes/i).first()).toBeVisible();
    await expect(page.getByText(/2 Active Heroes/i).first()).toBeVisible();
    await expect(page.getByText(/up to 2 active heroes/i).first()).toBeVisible();

    // 4. Close dialog
    await page.getByTestId('char-manager-close-btn').click();
    await expect(page.getByTestId('char-manager-close-btn')).not.toBeVisible();
  });
});

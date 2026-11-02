import { test, expect } from '@playwright/test';

test.describe('E2E Authentication & Hub Navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept auth registration route to ensure deterministic responses in all environments
    await page.route('**/api/auth/register', async (route) => {
      if (route.request().method() === 'POST') {
        const body = JSON.parse(route.request().postData() || '{}');
        const token = 'e2e_mock_jwt_token_header.payload.signature';
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            token,
            user: {
              id: 'usr_e2e_123',
              email: body.email || 'e2e_hero@gymify.local',
              username: body.username || 'CrimsonE2E',
            },
            character: {
              id: 'char_e2e_123',
              userId: 'usr_e2e_123',
              name: body.characterName || 'Kurogane',
              level: 1,
              strengthLevel: 1,
              enduranceLevel: 1,
              agilityLevel: 1,
              gold: 200,
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

    // 1. Verify Landing Screen loads
    await expect(page.getByText(/WORLD OF VERETHOR|IRONBOUND REALMS/i)).toBeVisible();

    // 2. Open Auth Modal
    const authBtn = page.getByTestId('auth-open-btn');
    await expect(authBtn).toBeVisible();
    await authBtn.click();

    // 3. Fill in registration form
    const timestamp = Date.now();
    const testUsername = `Hero_${timestamp.toString().slice(-4)}`;
    const testEmail = `hero_${timestamp}@gymify.local`;

    await page.getByTestId('auth-username-input').fill(testUsername);
    await page.getByTestId('auth-email-input').fill(testEmail);
    await page.getByTestId('auth-password-input').fill('IronWill2026!');
    await page.getByTestId('auth-char-input').fill('Kurogane');

    // 4. Submit registration
    await page.getByTestId('auth-submit-btn').click();

    // 5. Assert user navigates to World Hub / Character Profile
    await expect(page.getByText('Adventurer')).toBeVisible({ timeout: 10000 });

    // 6. Assert token is persisted in storage
    const tokenInStorage = await page.evaluate(() => {
      return (
        window.localStorage.getItem('gymify_jwt_auth_token_v1') ||
        window.localStorage.getItem('gymify_jwt_token')
      );
    });

    expect(tokenInStorage).toBeTruthy();
  });
});

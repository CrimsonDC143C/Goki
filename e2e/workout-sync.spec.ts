import { test, expect } from '@playwright/test';

test.describe('Offline-to-Online Workout Loop & Background Sync Queue', () => {
  test('executes offline workout, triggers rest timer, queues spoils, and flushes to server on network restore', async ({
    page,
  }) => {
    // 1. Simulate Offline State: All workout submissions fail or abort
    let networkBlocked = true;
    let serverReceivedWorkout = false;

    await page.route('**/api/**/workouts', async (route) => {
      if (networkBlocked) {
        await route.abort('failed');
      } else {
        serverReceivedWorkout = true;
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            data: {
              workoutSession: { id: 'sess_e2e_synced_1' },
              rewardPayload: {
                totalXpAwarded: 160,
                totalGoldAwarded: 45,
                lootChest: {
                  tier: 'RARE',
                  chestName: 'Ironbound Chest',
                  effortQualityScore: 82,
                },
              },
            },
          }),
        });
      }
    });

    await page.goto('/');

    // Ensure an active hero is forged if starting from a clean unbootstrapped state
    const createHeroCta = page.getByTestId('landing-create-hero-cta-btn');
    if (await createHeroCta.isVisible({ timeout: 3000 }).catch(() => false)) {
      await createHeroCta.click();
      await page.getByTestId('create-char-name-input').fill('Kurogane');
      await page.getByTestId('forge-hero-submit-btn').click();
    }

    // 2. Start Quick Offline Workout
    const offlineBtn = page.getByTestId('action-offline-workout');
    await expect(offlineBtn).toBeVisible();
    await offlineBtn.click();

    // 3. Verify Offline Workout Screen loaded with zero distraction
    await expect(page.getByText('Saved locally')).toBeVisible();

    // 4. Log a completed set and verify Dynamic Rest Timer triggers
    const setCheckBtn = page.getByTestId('set-complete-btn').first();
    await expect(setCheckBtn).toBeVisible();
    await setCheckBtn.click();

    // Verify Rest Timer or advice appears
    await expect(page.getByText(/REST|WORKING_REST|Recovery/i)).toBeVisible();

    // 5. Finish Workout
    const finishBtn = page.getByTestId('finish-offline-workout-btn');
    await expect(finishBtn).toBeVisible();
    await finishBtn.click();

    // 5b. Verify Post-Workout Encouragement Summary Modal & Continue
    const continueBtn = page.getByTestId('post-workout-continue-btn');
    if (await continueBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(continueBtn).toBeVisible();
      await continueBtn.click();
    }

    // 6. Assert return to Landing Screen with deferred offline spoils ready
    await expect(page.getByText(/Unclaimed Spoils Ready!|Pending Sync/i)).toBeVisible({
      timeout: 8000,
    });

    // 7. RESTORE NETWORK: Background sync queue should now synchronize payload to server
    networkBlocked = false;

    // 8. Enter World Hub / Character Profile
    const enterWorldBtn = page.getByTestId('action-enter-world');
    await expect(enterWorldBtn).toBeVisible();
    await enterWorldBtn.click();

    // 9. Assert Character Profile displays Unclaimed Training Spoils Chest banner
    const claimBannerBtn = page.getByTestId('claim-spoils-banner-btn');
    await expect(claimBannerBtn).toBeVisible({ timeout: 10000 });

    // 10. Open Spoils Receipt & verify effort metrics and loot drops
    await claimBannerBtn.click();
    await expect(page.getByText('Training Spoils Receipt')).toBeVisible();
    await expect(page.getByText(/Total XP|Gold/i)).toBeVisible();

    // Verify server received synchronization
    expect(serverReceivedWorkout).toBe(true);
  });
});

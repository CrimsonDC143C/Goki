import { test, expect } from '@playwright/test';

test.describe('Offline-to-Online Workout Loop & Background Sync Queue', () => {
  test('executes offline workout, triggers rest timer, queues spoils, and flushes to server on network restore', async ({
    page,
  }) => {
    // 1. Simulate Offline State for workout submissions while keeping auth & character bootstrap deterministic
    let networkBlocked = true;
    let serverReceivedWorkout = false;
    let capturedAuthHeader: string | undefined;

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
            id: 'usr_e2e_sync_1',
            email: 'sync_hero@gokirpg.local',
            username: 'SyncHero',
            timezone: 'UTC',
          },
          character: {
            id: 'char_e2e_sync_1',
            userId: 'usr_e2e_sync_1',
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
          characters: [
            {
              id: 'char_e2e_sync_1',
              userId: 'usr_e2e_sync_1',
              name: 'Kurogane',
              gameMode: 'STANDARD',
              appearanceId: 'oni_warlord',
              avatarSpriteId: 'oni_warlord',
              deletedAt: null,
              adventurerRank: 'COPPER',
              adventurerReputation: 0,
              overallLevel: 1,
              gold: 200,
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

    await page.route('**/api/characters/char_e2e_sync_1', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            character: {
              id: 'char_e2e_sync_1',
              userId: 'usr_e2e_sync_1',
              name: 'Kurogane',
              gameMode: 'STANDARD',
              appearanceId: 'oni_warlord',
              avatarSpriteId: 'oni_warlord',
              deletedAt: null,
              adventurerRank: 'COPPER',
              adventurerReputation: 0,
              overallLevel: 1,
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

    await page.route('**/api/characters/**/workouts', async (route) => {
      if (networkBlocked) {
        await route.abort('failed');
      } else {
        serverReceivedWorkout = true;
        capturedAuthHeader = route.request().headers()['authorization'];
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            rewardPayload: {
              sessionId: 'sess_e2e_synced_1',
              workoutType: 'RESISTANCE',
              totalTonnageKg: 600,
              totalReps: 10,
              workingSetCount: 1,
              averageRpe: 8.5,
              arrivalBoonMultiplier: 1.25,
              fatigueAndRestMultiplier: 1.15,
              resilienceBonus: {
                triggered: false,
                reason: 'NONE',
                flatBonusXp: 0,
                flatBonusGold: 0,
                badgeAwarded: null,
              },
              effectiveTotalMultiplier: 1.44,
              finalXpByStat: {
                STRENGTH: 160,
                ENDURANCE: 0,
                AGILITY: 0,
              },
              finalXpByHolisticStat: {
                STRENGTH: 160,
                ENDURANCE: 0,
                AGILITY: 0,
                DEXTERITY: 0,
                CONSTITUTION: 0,
                WISDOM: 0,
                SPIRIT: 0,
              },
              totalGoldAwarded: 45,
              lootChest: {
                tier: 'RARE',
                chestName: 'Ironbound Chest',
                effortQualityScore: 82,
                drops: [
                  {
                    itemSlug: 'iron_ore_cluster',
                    itemName: 'Rich Iron Ore Cluster',
                    rarity: 'COMMON',
                    quantity: 2,
                  },
                ],
              },
              workoutEvaluation: {
                updatedPRs: {},
                newPRsBroken: [],
                criticalTrainingBonus: {
                  triggered: false,
                  bonusXpAwarded: 0,
                  guaranteedLootDrop: null,
                },
              },
              characterProgression: {
                previousOverallLevel: 1,
                newOverallLevel: 1,
                byStat: {
                  STRENGTH: {
                    stat: 'STRENGTH',
                    previousLevel: 1,
                    newLevel: 1,
                    levelsGained: 0,
                    xpAdded: 160,
                    remainingXp: 160,
                    xpForNextLevel: 500,
                    talentPointsEarned: 0,
                    totalPointsAvailableAfterSession: 0,
                  },
                  ENDURANCE: {
                    stat: 'ENDURANCE',
                    previousLevel: 1,
                    newLevel: 1,
                    levelsGained: 0,
                    xpAdded: 0,
                    remainingXp: 0,
                    xpForNextLevel: 500,
                    talentPointsEarned: 0,
                    totalPointsAvailableAfterSession: 0,
                  },
                  AGILITY: {
                    stat: 'AGILITY',
                    previousLevel: 1,
                    newLevel: 1,
                    levelsGained: 0,
                    xpAdded: 0,
                    remainingXp: 0,
                    xpForNextLevel: 500,
                    talentPointsEarned: 0,
                    totalPointsAvailableAfterSession: 0,
                  },
                },
              },
            },
            statProgressions: {},
            injectedDungeonBuffs: [],
            raidEnergyDamageDealt: 160,
          }),
        });
      }
    });

    await page.addInitScript(() => {
      window.localStorage.setItem(
        'goki_auth_jwt_token_v1',
        'e2e_mock_jwt_token_header.payload.signature'
      );
    });

    await page.goto('/');

    // Wait for session bootstrap (/api/auth/me) to hydrate active hero Kurogane on Landing Screen
    await expect(page.getByText('Kurogane').first()).toBeVisible({ timeout: 10000 });

    // 2. Start Quick Offline Workout
    const offlineBtn = page.getByTestId('action-offline-workout');
    await expect(offlineBtn).toBeVisible();
    await offlineBtn.click();

    // 3. Verify Offline Workout Screen loaded with zero distraction
    await expect(page.getByText(/Saved locally/i).first()).toBeVisible();

    // 3b. Select Gym / Resistance Training discipline from the Gateway portal if displayed
    const gymCategoryCard = page.getByText('Gym / Resistance Training').first();
    if (await gymCategoryCard.isVisible({ timeout: 3000 }).catch(() => false)) {
      await gymCategoryCard.click();
    }

    // 4. Log a completed set and verify Dynamic Rest Timer triggers
    const setCheckBtn = page.getByTestId('set-complete-btn').first();
    await expect(setCheckBtn).toBeVisible();
    await setCheckBtn.click();

    // Verify Rest Timer or advice appears
    await expect(page.getByText(/REST|WORKING_REST|Recovery/i).first()).toBeVisible();

    // Dismiss center rest modal if open before clicking Finish Workout
    const skipRestBtn = page.getByText(/Skip Rest|Minimize/i).first();
    if (await skipRestBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await skipRestBtn.click();
    }

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
    await expect(page.getByText(/Unclaimed Spoils Ready!|Pending Sync/i).first()).toBeVisible({
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
    await expect(
      page.getByText(/Training Spoils Unsealed!|CONSOLIDATED POST-WORKOUT SPOILS RECEIPT/i).first()
    ).toBeVisible();
    await expect(page.getByText(/Attribute XP|Gold/i).first()).toBeVisible();

    // Verify server received authenticated workout synchronization
    expect(serverReceivedWorkout).toBe(true);
    expect(capturedAuthHeader).toContain('Bearer ');
  });
});

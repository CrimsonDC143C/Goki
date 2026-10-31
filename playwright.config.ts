import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration for Gymify RPG full-stack testing.
 * Automatically orchestrates the Fastify API Server and Expo Web bundler.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  timeout: 45000,
  expect: {
    timeout: 10000,
  },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  globalSetup: require.resolve('./e2e/global-setup'),
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:8081',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 480, height: 860 }, // Mobile portrait viewport for Expo Web
      },
    },
  ],
  webServer: [
    {
      command: 'npm run dev --workspace=@gymify/server',
      port: 4000,
      reuseExistingServer: !process.env.CI,
      timeout: 45000,
    },
    {
      command: 'npm run web --workspace=@gymify/mobile',
      port: 8081,
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
  ],
});

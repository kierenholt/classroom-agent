import { defineConfig, devices } from '@playwright/test';

const isProduction = process.env.TEST_ENV === 'prod' || process.env.TEST_ENV === 'production';
const baseURL = isProduction
  ? 'https://classroom-agent-511917.web.app'
  : 'http://localhost:5173';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: isProduction ? 60000 : 30000,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    isProduction,
  } as any,
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

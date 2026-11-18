import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 8_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://127.0.0.1:8787',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    serviceWorkers: 'block',
    launchOptions: { executablePath: process.env.CHROME_PATH || undefined },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'node tests/e2e/mock-google.mjs',
      url: 'http://127.0.0.1:8790/health',
      reuseExistingServer: false,
    },
    {
      command: 'npm run e2e:db && npx wrangler dev -c wrangler.e2e.jsonc --port 8787 --ip 127.0.0.1 --persist-to .wrangler/e2e',
      url: 'http://127.0.0.1:8787/',
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});

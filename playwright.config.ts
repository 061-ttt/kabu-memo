import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 8_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  projects: [
    // Cloudflare版（Worker＋D1、模擬Google・模擬J-Quants・模擬AI）
    { name: 'full', testDir: 'tests/e2e', use: { baseURL: 'http://127.0.0.1:8787' } },
    // 端末保存版（設定不要。GitHub Pages と同じサブパス配信）
    { name: 'local', testDir: 'tests/e2e-local', use: { baseURL: 'http://127.0.0.1:4317/kabu-memo/' } },
  ],
  use: {
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
      command: 'node tests/e2e-local/serve.mjs',
      url: 'http://127.0.0.1:4317/health',
      reuseExistingServer: false,
    },
    {
      command: 'node tests/e2e/mock-google.mjs',
      url: 'http://127.0.0.1:8790/health',
      reuseExistingServer: false,
    },
    {
      command: 'node tests/e2e/mock-jquants.mjs',
      url: 'http://127.0.0.1:8791/health',
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

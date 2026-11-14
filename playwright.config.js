import { defineConfig } from '@playwright/test';

// Allow running tests against different environments
const baseURL = process.env.BASE_URL || 'http://localhost:4173';
const shouldRunWebServer = !process.env.BASE_URL; // Only run local server if testing local code

export default defineConfig({
  testDir: '.',
  testMatch: 'e2e.test.js',
  timeout: 15000,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    browserName: 'chromium',
    headless: true,
    // Service workers would bypass context.route() mocks; the offline-app
    // test opts back in with its own context.
    serviceWorkers: 'block',
  },
  ...(shouldRunWebServer && {
    webServer: {
      // Test the built site (dist/), which includes the generated language pages.
      command: 'npm run build && npx serve dist -l 4173 --no-clipboard',
      port: 4173,
      reuseExistingServer: !process.env.CI,
    },
  }),
});

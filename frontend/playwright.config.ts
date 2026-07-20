import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// E2E for the browser-contract behavior unit tests can't model — chiefly the
// Android/Chromium system-back (ADR-0090): a real history traversal exercises the
// Navigation-API interceptor + the back-guard for real, which jsdom cannot.
// Hermetic: the frontend dev server runs with the boot API route-mocked in-test
// (e2e/boot.ts), so no backend/DB is needed.
//
// Browser resolution: some sandboxes ship a pinned Chromium at /opt/pw-browsers
// that may not match this @playwright/test version — point `executablePath` at it
// when present (avoids a download); everywhere else (CI, a dev machine) fall back
// to Playwright's own installed browser (`playwright install chromium`).
const PINNED_CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const executablePath = existsSync(PINNED_CHROMIUM) ? PINNED_CHROMIUM : undefined;
const PORT = 5175; // off the default 5173 so a running `pnpm dev` doesn't clash

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: executablePath ? { executablePath } : {},
      },
    },
  ],
  webServer: {
    command: `pnpm dev --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

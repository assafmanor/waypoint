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

// **`E2E_PREVIEW=1` runs the suite against the PRODUCTION BUNDLE**, and it exists because the
// difference between the two servers hid field report #35's Phase-2 blank map for a full session
// (ADR-0186 amendment 269i).
//
// MapLibre locates its tile-parsing Web Worker by rewriting its own `import.meta.url` to a sibling
// filename. Under `pnpm dev` that resolves inside `node_modules/maplibre-gl/dist/`, where the worker
// really is a sibling — and `vite.config.ts`'s `optimizeDeps.exclude: ['maplibre-gl']` guarantees dev
// serves exactly that file. Bundled, the same expression resolves to `/assets/maplibre-gl-worker.mjs`,
// which the build never emits; the SPA fallback answers it with `index.html` at 200, and a module
// worker started from HTML dies on parse with no error anywhere. So the map drew perfectly in every
// e2e run and drew nothing at all on a phone.
//
// The lesson generalises past this bug: **an asset path, a chunk boundary and a worker URL are all
// build-time facts, and a dev-server suite asserts none of them.** Anything in that class needs this
// mode rather than another unit test.
const preview = process.env.E2E_PREVIEW === '1';

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
    command: preview
      ? `pnpm build && pnpm preview --port ${PORT} --strictPort`
      : `pnpm dev --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    // Never reuse under preview: a server already up is a server serving an OLDER bundle, which
    // is precisely the thing this mode exists to check.
    reuseExistingServer: !process.env.CI && !preview,
    // A build sits in front of the server here, so the dev-server bound is not enough.
    timeout: preview ? 300_000 : 120_000,
  },
});

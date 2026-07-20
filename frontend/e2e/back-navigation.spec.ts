// Browser-contract e2e for the in-app back model (ADR-0090). These assert what
// jsdom unit tests structurally cannot: that a REAL history traversal (the
// Android/Chromium system back) keeps the user in-app — the back-guard gives the
// OS back an in-app entry to traverse into, and the Navigation-API interceptor
// resolves it to the computed action instead of letting the app exit. That exit
// was the shipped regression. Boot is hermetic (e2e/boot.ts route-mocks the API).
import { test, expect, type Page } from '@playwright/test';
import { bootIntoTrip } from './boot';

// Fire the platform system-back the way the OS does — a history traversal —
// rather than page.goBack(), whose navigation-commit wait fights the
// interceptor's preventDefault(); the assertions then poll the resulting state.
async function systemBack(page: Page) {
  await page.evaluate(() => window.history.back());
}

test.beforeEach(async ({ page }) => {
  await bootIntoTrip(page);
  await page.goto('/');
  await expect(page.locator('nav.nav')).toBeVisible(); // inside the trip shell
});

test('cold launch pushes a back-guard entry so the OS back has an in-app target', async ({
  page,
}) => {
  // Without the guard a cold launch sits at history index 0, where the OS back
  // leaves the app uncatchably. The guard lifts us to index >= 1 with a
  // same-URL entry behind us — so a system back traverses in-app, not off it.
  await expect
    .poll(() => page.evaluate(() => window.navigation?.currentEntry?.index ?? 0))
    .toBeGreaterThanOrEqual(1);
  await expect.poll(() => page.evaluate(() => window.history.length)).toBeGreaterThanOrEqual(2);
});

test('system back from a non-Home tab returns to Home, not out of the app', async ({ page }) => {
  await page.locator('nav.nav button').last().click(); // days (last of home/map/index/days)
  await expect(page).toHaveURL(/[?&]tab=days/);

  await systemBack(page);
  // Back on Home: the URL sheds ?tab= and the Home tab is current again — we did
  // not traverse out of the trip.
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('nav.nav button[aria-current="true"]')).toHaveCount(1);
  await expect(page.locator('nav.nav button').first()).toHaveAttribute('aria-current', 'true');
});

test('two system-backs at the Home base leave the trip to the all-trips home', async ({ page }) => {
  // First back at Home arms the two-tap leave confirm — it must NOT exit the app
  // or jump straight to /trips; we stay on Home.
  await systemBack(page);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('nav.nav')).toBeVisible();

  // A second back within the window actually leaves to the all-trips home.
  await systemBack(page);
  await expect(page).toHaveURL(/\/trips$/);
});

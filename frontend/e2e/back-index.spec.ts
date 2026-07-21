// Browser-contract e2e for the Index sub-screen back behaviour (ADR-0098/0102),
// driving REAL system-back traversals — the layer the jsdom unit tests can't
// reach. These lock the baseline for the ADR-0103 overhaul (session 65):
//   - the clean Documents subview peel (correct today),
//   - the category-filter peel on the FIRST back (correct today),
//   - and the DIVERGENCE on the SECOND back (broken today): once the filter has
//     reset, `runBack('close-overlay')` has already pop()'d the still-mounted
//     bookings screen off the stack, so the next system-back leaks past it into
//     the tab -> Home rule and SKIPS the Index landing.
// The broken case is written as the DESIRED behaviour under test.fail(): it
// fails today (documenting the bug) and flips to a plain pass once ADR-0103's
// non-destructive layer registry keeps a repeatable layer registered. Remove the
// test.fail() annotation in the fix PR.
import { test, expect, type Page } from '@playwright/test';
import { bootIntoTrip, TWO_TYPE_BOOKINGS } from './boot';

// Fire the platform system-back the way the OS does — a history traversal —
// rather than page.goBack(), whose navigation-commit wait fights the
// interceptor's preventDefault(); assertions then poll the resulting state.
async function systemBack(page: Page) {
  await page.evaluate(() => window.history.back());
}

async function openBookingsScreen(page: Page) {
  await page.locator('nav.nav button', { hasText: 'אינדקס' }).click(); // Index tab
  await expect(page).toHaveURL(/[?&]tab=index/);
  await page.locator('.wp-idx-tile').first().click(); // bookings tile (landing peer 1)
  await expect(page.locator('.idx-screen')).toBeVisible(); // dedicated bookings screen
}

test.beforeEach(async ({ page }) => {
  await bootIntoTrip(page, { bookings: TWO_TYPE_BOOKINGS });
  await page.goto('/');
  await expect(page.locator('nav.nav')).toBeVisible(); // inside the trip shell
});

test('Documents subview: one system back returns to the Index landing', async ({ page }) => {
  await page.locator('nav.nav button', { hasText: 'אינדקס' }).click();
  await page.locator('.wp-idx-tile').nth(1).click(); // documents tile (landing peer 2)
  await expect(page.locator('.idx-screen')).toBeVisible();

  await systemBack(page);
  // Back on the landing (its offline badge is landing-only), still on the Index
  // tab — not fallen through to Home.
  await expect(page.locator('.index-status')).toBeVisible();
  await expect(page).toHaveURL(/[?&]tab=index/);
});

test('bookings filter: the first system back resets the category, staying on the screen', async ({
  page,
}) => {
  await openBookingsScreen(page);
  await page.getByRole('radio', { name: 'טיסה' }).click(); // pick the flight category
  await expect(page.getByRole('radio', { name: 'טיסה' })).toBeChecked();

  await systemBack(page);
  // Correct today: the filter peels back to "all" and the bookings screen stays
  // put — it is not ready to leave, it is ready to show everything again.
  await expect(page.getByRole('radio', { name: 'הכל' })).toBeChecked();
  await expect(page.locator('.idx-screen')).toBeVisible();
  await expect(page).toHaveURL(/[?&]tab=index/);
});

test.fail(
  'bookings filter: after the reset, the next system back returns to the landing, not Home (ADR-0103)',
  async ({ page }) => {
    // BROKEN TODAY. The first back pops the bookings screen off the overlay
    // stack while only resetting the filter (it stays mounted, unregistered), so
    // this second back finds no overlay and resolves tab=index -> Home, skipping
    // the landing entirely. Under the ADR-0103 non-destructive layer registry a
    // repeatable filter layer stays registered, so this becomes a plain pass —
    // drop the test.fail() then.
    await openBookingsScreen(page);
    await page.getByRole('radio', { name: 'טיסה' }).click();
    await expect(page.getByRole('radio', { name: 'טיסה' })).toBeChecked();

    await systemBack(page); // resets the filter (screen stays)
    await expect(page.getByRole('radio', { name: 'הכל' })).toBeChecked();

    await systemBack(page); // DESIRED: back to the Index landing
    await expect(page.locator('.index-status')).toBeVisible();
    await expect(page).toHaveURL(/[?&]tab=index/);
  },
);

// Browser-contract e2e for the Index sub-screen back behaviour (ADR-0098/0102/
// 0103), driving REAL system-back traversals — the layer the jsdom unit tests
// can't reach:
//   - the clean Documents subview peel,
//   - the category-filter peel on the FIRST back (resets, screen stays),
//   - and the SECOND back returning to the Index landing, not Home. That last
//     case regressed before ADR-0103: `runBack('close-overlay')` pop()'d the
//     still-mounted bookings screen off the stack while only resetting the
//     filter, so the next system-back leaked past it into the tab -> Home rule
//     and skipped the landing. ADR-0103's non-destructive layer registry keeps a
//     repeatable layer registered after it handles a back, closing that gap.
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

test('nested overlays: consecutive system-backs peel the modal, then the subview, then land (ADR-0103)', async ({
  page,
}) => {
  // History-backed overlays (ADR-0103): each overlay owns a same-URL history entry,
  // so a system-back RIDES the traversal to close it rather than cancelling the
  // back. This is the multi-layer case that force-exited the app on device (the OS
  // won't let a page cancel several consecutive backs). Here two layers (the
  // add-booking sheet over the bookings subview) close one-per-back, no overshoot.
  await openBookingsScreen(page);
  await page.locator('.addbtn').click(); // open the add-booking sheet (a modal on top)
  await expect(page.getByRole('dialog')).toBeVisible();

  await systemBack(page); // closes the modal, back to the bookings subview
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.idx-screen')).toBeVisible();

  await systemBack(page); // closes the subview, back to the Index landing
  await expect(page.locator('.index-status')).toBeVisible();
  await expect(page).toHaveURL(/[?&]tab=index/);
});

test('search overlay: system back closes search, staying on the bookings screen (ADR-0103)', async ({
  page,
}) => {
  await openBookingsScreen(page);
  await page.locator('.search-icon-btn').click();
  await expect(page.locator('.search-overlay')).toBeVisible();
  await page.locator('.search-overlay-field input').fill('flight');

  await systemBack(page); // closes the full-screen search overlay, not the screen under it
  await expect(page.locator('.search-overlay')).toHaveCount(0);
  await expect(page.locator('.idx-screen')).toBeVisible();
  await expect(page).toHaveURL(/[?&]tab=index/);
});

test('bookings filter: after the reset, the next system back returns to the landing, not Home (ADR-0103)', async ({
  page,
}) => {
  // Fixed by ADR-0103's non-destructive back-layer registry. Previously the
  // first back pop()'d the bookings screen off the overlay stack while only
  // resetting the filter (it stayed mounted, unregistered), so this second back
  // found no overlay and resolved tab=index -> Home, skipping the landing. Now
  // the repeatable filter layer stays registered after the reset, so this back
  // peels to the Index landing as expected.
  await openBookingsScreen(page);
  await page.getByRole('radio', { name: 'טיסה' }).click();
  await expect(page.getByRole('radio', { name: 'טיסה' })).toBeChecked();

  await systemBack(page); // resets the filter (screen stays)
  await expect(page.getByRole('radio', { name: 'הכל' })).toBeChecked();

  await systemBack(page); // back to the Index landing, not Home
  await expect(page.locator('.index-status')).toBeVisible();
  await expect(page).toHaveURL(/[?&]tab=index/);
});

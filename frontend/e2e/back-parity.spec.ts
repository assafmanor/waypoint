// **A SYSTEM BACK DOES WHAT THE VISIBLE CONTROL DOES** (owner, 2026-07-29: _"when there's a
// back button on a form or a search or whatever, a system back should do the same as if the
// button was clicked… system backs shouldn't do anything different when there's a back button
// (or cancel, exit)"_).
//
// One rule, asserted the same way every time: **drive the surface into a state that shows a
// back / cancel / close control, press the platform back, and assert the state the control
// itself would have produced.** Not "back does something reasonable" — the same thing.
//
// Why these are e2e and not unit tests: the divergences are between a DOM handler and a
// history traversal, and a jsdom fixture that mocks either one asserts nothing. Session 174
// paid four shipped-but-broken fixes to learn that.
import { test, expect, type Page } from '@playwright/test';
import { bootIntoTrip, overlappingSoftEvents, shortLiveTripDates } from './boot';

// Fire the platform system-back the way the OS does — a history traversal — rather than
// page.goBack(), whose navigation-commit wait fights the interceptor's preventDefault();
// assertions then poll the resulting state. Same helper as the other back specs.
async function systemBack(page: Page) {
  await page.evaluate(() => window.history.back());
}

const PLAN_MODE = '✏️ תכנון';
const FILTER_OPEN = 'סינון';
const FILTER_CLOSE = 'סגירת סינון';
const RESOLVE = 'הזז';
const RESOLVE_STEP1 = '.resolve-mover'; // step 1's mover buttons — the step, as a selector
const RESOLVE_BACK = '.resolve-backbtn';

test.describe('the Map tab’s filter panel', () => {
  test.beforeEach(async ({ page }) => {
    await bootIntoTrip(page, { dates: shortLiveTripDates() });
    await page.goto('/');
    await page.locator('nav.nav button', { hasText: 'מפה' }).click();
    await expect(page.locator('.map-screen')).toBeVisible();
  });

  // The panel's own ✕ closes it and leaves you on the tab. The field beside it already
  // behaves (ADR-0132 §5 registered a layer for it) — the filter never got one, so back
  // walked straight past an open panel and off the tab.
  test('one system back closes it, exactly as its ✕ does', async ({ page }) => {
    await page.getByRole('button', { name: FILTER_OPEN }).click();
    await expect(page.getByRole('button', { name: FILTER_CLOSE })).toBeVisible();

    await systemBack(page);
    await expect(page.getByRole('button', { name: FILTER_CLOSE })).toBeHidden();
    await expect(page).toHaveURL(/[?&]tab=map/);
    await expect(page.locator('.map-screen')).toBeVisible();
  });

  // …and the press after that is the one that leaves, so nothing is swallowed.
  test('the next system back then leaves the tab', async ({ page }) => {
    await page.getByRole('button', { name: FILTER_OPEN }).click();
    await systemBack(page);
    await expect(page.getByRole('button', { name: FILTER_CLOSE })).toBeHidden();

    await systemBack(page);
    await expect(page).toHaveURL(/^[^?]*\/$/);
  });
});

test.describe('Plan mode’s overlap resolve sheet', () => {
  test.beforeEach(async ({ page }) => {
    await bootIntoTrip(page, { events: overlappingSoftEvents(), dates: shortLiveTripDates() });
    await page.goto('/');
    await page.getByText(PLAN_MODE).first().click();
    await page.locator('nav.nav button', { hasText: 'יום-יום' }).click();
    await expect(page).toHaveURL(/[?&]tab=days/);
  });

  // A two-STEP sheet: pick which soft event moves, then pick where. Step 2 renders its own
  // `אירוע אחר` back button — so a system back owes the same step back, not the whole sheet.
  test('a system back steps back to the mover picker, as its own back button does', async ({
    page,
  }) => {
    await page
      .getByRole('button', { name: new RegExp(RESOLVE) })
      .first()
      .click();
    await expect(page.locator(RESOLVE_STEP1).first()).toBeVisible();
    await page.locator('.resolve-mover').first().click();
    // Step 2 — its in-sheet back control is visible, so back must mean what it means.
    await expect(page.locator(RESOLVE_BACK)).toBeVisible();

    await systemBack(page);
    // Back on step 1, with the sheet still open — not dismissed out from under you.
    await expect(page.locator(RESOLVE_STEP1).first()).toBeVisible();
    await expect(page.locator(RESOLVE_BACK)).toBeHidden();
  });

  // Only THEN does the sheet close. Two controls, two presses, in the order they are shown.
  test('the next system back closes the sheet', async ({ page }) => {
    await page
      .getByRole('button', { name: new RegExp(RESOLVE) })
      .first()
      .click();
    await page.locator('.resolve-mover').first().click();
    await systemBack(page);
    await expect(page.locator(RESOLVE_STEP1).first()).toBeVisible();

    await systemBack(page);
    await expect(page.locator(RESOLVE_STEP1).first()).toBeHidden();
    await expect(page).toHaveURL(/[?&]tab=days/);
  });
});

test.describe('the all-trips screen', () => {
  // Its back arrow renders only when there IS a live trip to go back into, and returns you
  // to it. A system back there used to fall through the root guard and exit the app — the
  // one place in the app where back does something the visible control never offers.
  test('a system back returns to the live trip, as its back arrow does', async ({ page }) => {
    await bootIntoTrip(page, { dates: shortLiveTripDates() });
    await page.goto('/trips');
    await expect(page.locator('button.back')).toBeVisible();

    await systemBack(page);
    await expect(page).toHaveURL(/^[^?]*\/$/);
    await expect(page.locator('nav.nav')).toBeVisible(); // inside the trip shell
  });
});

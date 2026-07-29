// **THE MAP TAB UNDER A REAL SYSTEM BACK** (owner, 2026-07-29: _"closing (swipe back) the map
// search entered from the map should return you back to the map and not home"_, and _"some
// backs aren't working as expected intuitively, it sometimes exits to the main screen"_).
//
// This is an e2e and not a unit test on purpose. `screens/Map.back.test.tsx` drives the real
// `MapView` through the same four presses in jsdom and every one of them is correct — so
// either the report is a browser-level fact the fixture cannot hold, or it is one of the
// audit's identified-but-unfixed findings (`planning/2026-07-28-session-170-…`). Session 174
// spent four fixes learning which way that question resolves: when a jsdom suite says a
// reported bug does not exist, the next step is a real browser, not another reading.
//
// The Map is the one tab with layers of its own (ADR-0132 §5's chrome reclaim, ADR-0134 §1's
// errand) and it was the only one with no browser-contract coverage.
import { test, expect, type Page } from '@playwright/test';
import { bootIntoTrip, ERRAND_FIXTURE, shortLiveTripDates } from './boot';

// Fire the platform system-back the way the OS does — a history traversal — rather than
// page.goBack(), whose navigation-commit wait fights the interceptor's preventDefault();
// assertions then poll the resulting state. Same helper as the other two back specs.
async function systemBack(page: Page) {
  await page.evaluate(() => window.history.back());
}

const SEARCH_BUTTON = 'חיפוש מקומות';
const SEARCH_PLACEHOLDER = 'שם או כתובת';
const SEARCH_CLOSE = 'סגירת חיפוש';
const ADD_LOCATION = 'הוספת מקום';

const field = (page: Page) => page.getByPlaceholder(SEARCH_PLACEHOLDER);

async function openMapTab(page: Page) {
  await page.locator('nav.nav button', { hasText: 'מפה' }).click();
  await expect(page).toHaveURL(/[?&]tab=map/);
  await expect(page.locator('.map-screen')).toBeVisible();
}

async function openSearch(page: Page) {
  await page.getByRole('button', { name: SEARCH_BUTTON }).click();
  await expect(field(page)).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await bootIntoTrip(page, {
    bookings: ERRAND_FIXTURE.bookings,
    places: ERRAND_FIXTURE.places,
    events: ERRAND_FIXTURE.events,
    dates: shortLiveTripDates(),
  });
  await page.goto('/');
  await expect(page.locator('nav.nav')).toBeVisible();
});

// THE REPORT, in one press. The field takes the header and the tab bar off screen
// (ADR-0132 §5), so it changed "where am I" and back owes closing it before it owes
// leaving the tab.
test('search opened on the map: one system back closes it and stays on the tab', async ({
  page,
}) => {
  await openMapTab(page);
  await openSearch(page);

  await systemBack(page);
  await expect(field(page)).toBeHidden();
  await expect(page).toHaveURL(/[?&]tab=map/);
  await expect(page.locator('.map-screen')).toBeVisible();
});

// …and only THEN does back leave. Two presses, two outcomes — the other half of "return
// you back to the map and not home".
test('the next system back is the one that leaves the tab', async ({ page }) => {
  await openMapTab(page);
  await openSearch(page);

  await systemBack(page);
  await expect(field(page)).toBeHidden();

  await systemBack(page);
  await expect(page).toHaveURL(/^[^?]*\/$/);
});

// Typing is what turns the open field into a live query, which changes the sheet, the pins
// and the list — so it is worth pressing back from that state and not only from an empty
// field.
test('a live query closes the same way, without leaving the tab', async ({ page }) => {
  await openMapTab(page);
  await openSearch(page);
  await field(page).fill('Mori');

  await systemBack(page);
  await expect(field(page)).toBeHidden();
  await expect(page).toHaveURL(/[?&]tab=map/);
});

// Opened, closed by its own ✕, opened again — the sequence that leaves a spent history
// marker behind (ADR-0103's push-only bookkeeping, and the audit's finding #3). jsdom says
// it does not eat a back; this is the browser saying so.
test('an open / close / re-open cycle still costs exactly one back', async ({ page }) => {
  await openMapTab(page);
  await openSearch(page);
  await page.getByRole('button', { name: SEARCH_CLOSE }).click();
  await expect(field(page)).toBeHidden();
  await openSearch(page);

  await systemBack(page);
  await expect(field(page)).toBeHidden();
  await expect(page).toHaveURL(/[?&]tab=map/);
});

// **AN ERRAND'S TWO BACKS, EACH DOING WHAT ITS OWN CONTROL DOES.** Arriving on an errand
// auto-opens the query field (ADR-0134 §1), so two layers are live: the field, then the
// errand. Back #1 is the field's `✕`; back #2 is the banner's `ביטול`, which cancels the
// errand AND HANDS THE FORM BACK (§2) rather than dumping you on the tab it came from.
//
// This is the case that found the cross-URL marker defect (session 175). Both Index overlays
// unmounted as the errand navigated here, leaving a marker count of 2 that made the Map's own
// two layers look already-markered — so back #1 rode a stale `?tab=index` entry and left the
// tab with the errand still live. Depth is per-URL now, and each press peels one layer.
test('an errand: the first back closes the auto-opened field, the second returns the form', async ({
  page,
}) => {
  await page.locator('nav.nav button', { hasText: 'אינדקס' }).click();
  await page.locator('.wp-idx-tile').first().click();
  await page.locator('.wp-listrow', { hasText: 'Shinjuku hotel' }).first().click();
  await page.getByText(ADD_LOCATION).first().click();
  await expect(page).toHaveURL(/[?&]tab=map/);
  // The field opened itself, because you were sent here to FIND a place.
  await expect(field(page)).toBeVisible();

  await systemBack(page);
  await expect(field(page)).toBeHidden();
  await expect(page).toHaveURL(/[?&]tab=map/);

  // The second press cancels the errand — and cancelling still owes the form back
  // (ADR-0134 §2), so this lands on the booking's own sheet, not on the bookings list.
  await systemBack(page);
  await expect(page).toHaveURL(/[?&]tab=index/);
  await expect(page.getByRole('dialog')).toBeVisible();
});

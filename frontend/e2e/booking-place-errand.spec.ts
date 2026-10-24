// **THE PLACE ERRAND'S ROUND TRIP** (ADR-0134 §1/§2), end to end in a real browser.
//
// This one is here because four unit-tested attempts at it shipped and none of them worked
// on a device. The reason is structural rather than careless: the round trip spans a
// navigation, a screen UNMOUNTING while the errand is in flight, another screen mounting on
// the far side, and a hand-over channel that lives above both. Every jsdom test of it mocks
// away at least one of those, so each fix looked right and the app still lost the form.
//
// So the assertion is the owner's sentence, not an implementation detail: **you come back to
// the form you left, with the place you picked in it, and nothing saved yet.**
import { test, expect, type Page } from '@playwright/test';
import { bootIntoTrip, ERRAND_FIXTURE, shortLiveTripDates } from './boot';
import { t } from '../src/i18n/he';

const ADD_LOCATION = 'הוספת מקום';
const CHOOSE = t.map.errand.choose;

test.beforeEach(async ({ page }) => {
  await bootIntoTrip(page, {
    bookings: ERRAND_FIXTURE.bookings,
    places: ERRAND_FIXTURE.places,
    events: ERRAND_FIXTURE.events,
    dates: shortLiveTripDates(),
  });
  await page.goto('/');
});

/** Index tab → the bookings screen → the hotel's detail sheet. */
async function openBookingDetail(page: Page) {
  await page.locator('nav.nav button', { hasText: 'אינדקס' }).click();
  await expect(page).toHaveURL(/[?&]tab=index/);
  await page.locator('.wp-idx-tile').first().click();
  await expect(page.locator('.idx-screen')).toBeVisible();
  await page.locator('.wp-listrow', { hasText: 'Shinjuku hotel' }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

test('a booking with no place sends an errand and comes back to its FORM, place filled', async ({
  page,
}) => {
  await openBookingDetail(page);

  // `＋ מיקום` on the detail's location fact — the errand's start.
  await page.getByText(ADD_LOCATION).first().click();

  // …lands on the Map tab, in errand mode, with the field already open (session 168).
  await expect(page).toHaveURL(/[?&]tab=map/);
  await expect(page.locator('.map-screen')).toBeVisible();

  // The trip's own place is a row with the CHOOSE verb — the free half, no Google.
  await page.locator('button.map-addmaybe', { hasText: CHOOSE }).first().click();

  // THE ASSERTION THE OWNER KEEPS REPORTING: back on the Index, with the booking's own FORM
  // open — not the landing, not the bookings list, not the read-only detail.
  await expect(page).toHaveURL(/[?&]tab=index/);
  // Two assertions, in order, because they fail for different reasons: the SCREEN has to be
  // re-mounted (the return's job) before the FORM can be re-opened (the channel's job).
  await expect(page.locator('.idx-screen')).toBeVisible();
  const form = page.getByRole('dialog');
  await expect(form).toBeVisible();
  await expect(form.locator('input.bs-title')).toHaveValue('Shinjuku hotel');
  // …and the place it went to fetch is in it.
  await expect(form.getByText('Mori Museum')).toBeVisible();
});

test('cancelling the errand comes back to the same form, with no place', async ({ page }) => {
  await openBookingDetail(page);
  await page.getByText(ADD_LOCATION).first().click();
  await expect(page).toHaveURL(/[?&]tab=map/);

  await page.locator('.wp-banner button, .map-gbtn', { hasText: 'ביטול' }).first().click();

  await expect(page).toHaveURL(/[?&]tab=index/);
  const form = page.getByRole('dialog');
  await expect(form).toBeVisible();
  await expect(form.locator('input.bs-title')).toHaveValue('Shinjuku hotel');
  await expect(form.getByText('Mori Museum')).toBeHidden();
});

// **AN IMPLICIT WAY OUT IS STILL A WAY OUT** (owner, 2026-07-29: _"when there's an implicit
// way to go back (closing a modal by tapping outside it for example) we should also treat
// system back as the same"_).
//
// The companion to `back-parity.spec.ts`, which covered surfaces with a VISIBLE back control.
// This one covers surfaces you dismiss without one: a backdrop tap, a tap outside a popover,
// Escape. `Modal` already ties its backdrop to the same `onClose` it registers, so every
// sheet and dialog agrees for free — these are the hand-rolled panels that do not go through
// it and so were never in the back stack at all.
//
// Same assertion shape as the parity spec: put the surface in the state that offers the
// implicit dismissal, press the platform back, and assert the state that dismissal produces —
// the panel gone AND whatever hosts it still open.
import { test, expect, type Page } from '@playwright/test';
import { bootIntoTrip, ERRAND_FIXTURE, shortLiveTripDates, tripPlaces } from './boot';

// Fire the platform system-back the way the OS does — a history traversal — rather than
// page.goBack(), whose navigation-commit wait fights the interceptor's preventDefault();
// assertions then poll the resulting state. Same helper as the other back specs.
async function systemBack(page: Page) {
  await page.evaluate(() => window.history.back());
}

/** The event form's own dialog. Every popover selector is scoped through this: the day
 *  builder BEHIND the form has an icon chip and a time field of its own, and an unscoped
 *  `.first()` picks the obscured one. */
const form = (page: Page) => page.getByRole('dialog').first();

const PLAN_MODE = '✏️ תכנון';
const NEW_EVENT = '＋ אירוע חדש';

/** Plan mode's day builder, with the event form open — the host for both popovers below. */
async function openEventForm(page: Page) {
  await page.getByText(PLAN_MODE).first().click();
  await page.locator('nav.nav button', { hasText: 'יום-יום' }).click();
  await expect(page).toHaveURL(/[?&]tab=days/);
  await page.getByText(NEW_EVENT).first().click();
  await expect(form(page)).toBeVisible();
}

test.describe('the icon picker panel', () => {
  test.beforeEach(async ({ page }) => {
    await bootIntoTrip(page, { dates: shortLiveTripDates() });
    await page.goto('/');
    await openEventForm(page);
  });

  // It closes on a tap anywhere outside itself and on Escape — two implicit dismissals, no
  // button. It renders its own panel rather than going through `Modal`, so it was never in
  // the back stack: a system back fell straight through to the FORM's layer and threw away
  // what you were typing, while a tap two pixels to the left just closed the panel.
  test('one system back closes it, leaving the form open', async ({ page }) => {
    await form(page).locator('button.icon-chip').first().click();
    await expect(page.locator('.icon-panel')).toBeVisible();

    await systemBack(page);
    await expect(page.locator('.icon-panel')).toBeHidden();
    // The form is the thing a tap-outside would have left standing.
    await expect(form(page)).toBeVisible();
  });

  // …and only the press after that closes the form, so the panel costs exactly one back.
  test('the next system back closes the form', async ({ page }) => {
    await form(page).locator('button.icon-chip').first().click();
    await systemBack(page);
    await expect(page.locator('.icon-panel')).toBeHidden();

    await systemBack(page);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test.describe('the time panel', () => {
  test.beforeEach(async ({ page }) => {
    await bootIntoTrip(page, { dates: shortLiveTripDates() });
    await page.goto('/');
    await openEventForm(page);
  });

  // `TimeField`/`TimePicker` render a `.tp-backdrop` whose whole job is "tap here to close
  // me". That is a dismissal the surface itself offers, so back owes the same one.
  test('one system back closes it, leaving the form open', async ({ page }) => {
    await form(page).locator('button.tp-field').first().click();
    await expect(page.locator('.tp-panel')).toBeVisible();
    await expect(page.locator('.tp-backdrop')).toBeAttached();

    await systemBack(page);
    await expect(page.locator('.tp-panel')).toBeHidden();
    await expect(form(page)).toBeVisible();
  });
});

test.describe('a selected place on the Map', () => {
  test.beforeEach(async ({ page }) => {
    await bootIntoTrip(page, {
      places: tripPlaces(),
      events: ERRAND_FIXTURE.events,
      dates: shortLiveTripDates(),
    });
    await page.goto('/');
    await page.locator('nav.nav button', { hasText: 'מפה' }).click();
    await expect(page.locator('.map-screen')).toBeVisible();
  });

  // Selecting raises the place card, and a tap on blank canvas clears it (`onCanvasTap`) —
  // the implicit dismissal. Back used to leave the tab instead, throwing away the selection
  // AND the screen when the canvas would only have thrown away the selection.
  test('one system back clears the selection, staying on the tab', async ({ page }) => {
    await page.locator('.place[role="button"]').first().click();
    await expect(page.locator('.place[aria-pressed="true"]')).toHaveCount(1);

    await systemBack(page);
    await expect(page.locator('.place[aria-pressed="true"]')).toHaveCount(0);
    await expect(page).toHaveURL(/[?&]tab=map/);
    await expect(page.locator('.map-screen')).toBeVisible();
  });

  // …and with nothing selected, back leaves as it always did.
  test('the next system back leaves the tab', async ({ page }) => {
    await page.locator('.place[role="button"]').first().click();
    await systemBack(page);
    await expect(page.locator('.place[aria-pressed="true"]')).toHaveCount(0);

    await systemBack(page);
    await expect(page).toHaveURL(/^[^?]*\/$/);
  });
});

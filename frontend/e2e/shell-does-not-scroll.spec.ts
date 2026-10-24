// **The document never scrolls** (ADR-0200 §1) — the invariant behind the empty band under
// the tab bar, which a real engine can assert even though the band itself cannot be reproduced
// off a device.
//
// What is NOT testable here, and is stated so nobody adds a test that pretends to be it: the
// band appears when the initial containing block and the dynamic viewport disagree, which needs
// a browser with retractable chrome. No desktop engine produces it and jsdom has no layout at
// all. What IS testable is the rule that makes the band unreachable whether or not they
// disagree — the root refuses to scroll — plus the one property that rule has to have and the
// obvious spelling of it does not (see below).
import { test, expect } from '@playwright/test';
import { bootIntoTrip, shortLiveTripDates, todayAt } from './boot';
import { t } from '../src/i18n/he';

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

const NOW = todayAt('10:00');
const TODAY = new Date(NOW).toISOString().slice(0, 10);

/** Enough of a day to outgrow one screen — the last test needs a scroller that really has
 *  somewhere to go, and an empty trip gives it none. */
const EVENTS = Array.from({ length: 10 }, (_, i) => ({
  id: `ev-${i}`,
  tripId: 't1',
  date: TODAY,
  title: `יעד ${i}`,
  kind: 'soft',
  status: 'planned',
  sortOrder: i,
  source: 'manual',
  startsAt: `${TODAY}T${String(9 + i).padStart(2, '0')}:00:00.000Z`,
  endsAt: `${TODAY}T${String(9 + i).padStart(2, '0')}:40:00.000Z`,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  updatedBy: 'u1',
}));

test.beforeEach(async ({ page }) => {
  await bootIntoTrip(page, { events: EVENTS, now: NOW, dates: shortLiveTripDates(NOW) });
  await page.goto('/');
  await expect(page.locator('nav.nav')).toBeVisible();
});

test('the document refuses to scroll, however it is asked', async ({ page }) => {
  const moved = await page.evaluate(() => {
    const targets = [document.scrollingElement, document.documentElement, document.body].filter(
      (el): el is HTMLElement => el instanceof HTMLElement,
    );
    for (const el of targets) el.scrollTop = 500;
    window.scrollTo(0, 500);
    return targets.map((el) => el.scrollTop).concat(window.scrollY);
  });
  expect(moved).toEqual(moved.map(() => 0));
});

// The rule has to be `clip` rather than `hidden`, and this is the property that decides it:
// `hidden` leaves the root a scroll CONTAINER that merely refuses the user, so it still has a
// scrollport and `scrollIntoView` still walks it — which put an empty second scroll target in
// front of `.body` on the arrival path and showed up as an intermittent no-move in
// `event-arrival-scroll.spec.ts`. `clip` is not a scroll container at all.
test('and it is not a scroll container, so nothing walks it on the way to .body', async ({
  page,
}) => {
  const overflow = await page.evaluate(() => ({
    html: getComputedStyle(document.documentElement).overflowY,
    body: getComputedStyle(document.body).overflowY,
  }));
  expect(overflow).toEqual({ html: 'clip', body: 'clip' });
});

// The other half of "every scroll is an element's": the one that IS supposed to scroll still
// does. A shell that cannot scroll anything is not a fix.
test('the body still scrolls, on a tab with more than a screenful', async ({ page }) => {
  await page.locator('nav.nav button', { hasText: t.tabs.days }).click();
  const body = page.locator('main.body');
  // Wait for the day's rows rather than for the body: the tab's content arrives a render
  // later, and an extent measured before it is 0 for a reason that says nothing.
  await expect(page.locator('[data-event]').first()).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(() => body.evaluate((el) => el.scrollHeight - el.clientHeight))
    .toBeGreaterThan(0);
  const top = await body.evaluate((el) => {
    el.scrollTop = 200;
    return el.scrollTop;
  });
  expect(top).toBeGreaterThan(0);
});

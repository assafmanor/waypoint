// **On All Trips the share entry is a HOLD, and there is no control** (ADR-0033's 2026-08-30
// amendment §1). The visible icon shipped first and the owner reported what it cost: _"The
// share icon is taking much space and is causing a line overflow. Perhaps we need a long
// click instead?"_ — 42px of a 152px content column at 360px, with the meta on three lines.
//
// This file is in a real browser because everything the gesture can get wrong lives there.
// jsdom has no `PointerEvent` and reports every rect as zero, so the unit spec can assert the
// hold fires and nothing about the two things that actually break: the click that lands on
// RELEASE (unswallowed, it opens the trip the hold just shared) and the width the row got
// back.
import { expect, test } from '@playwright/test';
import { bootIntoAllTrips, twoTrips } from './boot';
import { stableBox } from './measure';
import { DRAG_HOLD_MS } from '../src/constants';
import { t } from '../src/i18n/he';

const PHONE = { width: 360, height: 640 };

/** What `GET /trips/:id` answers, which is the only thing that makes the sheet draw the
 *  admin's level cards. Local to this spec rather than exported from `boot.ts`: it is the
 *  one route no other e2e needs, and the boot fixture's membership is not otherwise shaped
 *  like this response. */
const TRIP_WITH_MEMBERS = {
  // `tripSchema` is strict about the whole entity, and `fetchTripWithMembers`
  // swallows a parse failure — so a half-built trip here reads as "not an admin"
  // and the level cards silently never render.
  trip: {
    ...twoTrips()[0],
    id: 't1',
  },
  members: [
    {
      id: 'm1',
      tripId: 't1',
      userId: 'u1',
      role: 'admin',
      calendarSyncEnabled: false,
      joinedAt: '2024-01-01T00:00:00.000Z',
    },
  ],
  users: [],
};

// Both list shapes: the live trip's hero and an upcoming trip's row (`AllTrips.tsx`).
const SHAPES = [
  { name: 'the live hero', card: '.trip-hero' },
  { name: 'an upcoming row', card: '.trip-card' },
];

/** The shell's arrival transition translates `.route-shell` (ADR-0140), and a box measured
 *  mid-transform comes back off by float noise. Settle it rather than rounding the
 *  assertion, so what is measured is the layout and not a frame. */
async function settled(page: import('@playwright/test').Page) {
  // Polled rather than awaited on `animation.finished`: the shell is keyed on the pathname,
  // so the boot's own navigation replaces the node and rejects that promise with an
  // AbortError. A finished CSS animation with no fill mode leaves the list by itself.
  await page.waitForFunction(
    () => (document.querySelector('.route-shell')?.getAnimations().length ?? 1) === 0,
  );
}

/** Press and keep pressing. Past `DRAG_HOLD_MS` by a margin the box's own scheduling can eat,
 *  then release — the release is the half that matters, so it is never skipped. */
async function hold(page: import('@playwright/test').Page, selector: string) {
  const box = await stableBox(page.locator(selector).first());
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(DRAG_HOLD_MS + 200);
  await page.mouse.up();
}

for (const shape of SHAPES) {
  test(`holding ${shape.name} opens the share sheet, and the release does not open the trip`, async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await bootIntoAllTrips(page);
    await settled(page);

    await hold(page, shape.card);
    await expect(page.getByText(t.share.owner.title)).toBeVisible();

    // **The gesture's own tail must not also navigate.** A hold fires with the finger still
    // down, so the click that lands on release would otherwise reach the card underneath and
    // open the trip behind the sheet — `useHoldToOpen`'s `armClickSwallow`, and the one thing
    // in this feature that no unit test can see.
    await expect(page).toHaveURL(/\/trips$/);
  });
}

test('a tap still opens the trip, and the row carries no share control', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await bootIntoAllTrips(page);
  await settled(page);

  // The gesture costs the row nothing — that is the whole point of choosing it.
  await expect(page.locator('.trip-share-action')).toHaveCount(0);

  await page.locator('.trip-hero').click();
  await expect(page).not.toHaveURL(/\/trips$/);
});

// **The height is the honest witness for the width.** The reported defect was a meta line
// wrapping, so what has to be true is that it stops wrapping — and a card that no longer
// reserves a 56px column is a card whose meta fits. The mockup measured the shipped one at
// 104px and three lines at 360px; this fixture (no member count) lands at 74px and one. The
// bound is loose on purpose: it must fail a returning third line, not a font revision.
test('the meta no longer wraps the card open at 360px', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await bootIntoAllTrips(page);
  await settled(page);

  const card = await stableBox(page.locator('.trip-card').first());
  expect(Math.round(card.height)).toBeLessThanOrEqual(90);

  // Nothing overlays the card any more, so its content runs to its own padding: the title
  // starts within a flag's width of the inline (RTL: right) edge and the countdown is the
  // only tenant of the trailing side.
  const main = await stableBox(page.locator('.trip-card .main').first());
  const chip = await stableBox(page.locator('.trip-card .chip.soon').first());
  expect(main.x).toBeGreaterThan(chip.x + chip.width);
});

// **THE SEND UNIT COLLAPSED TO ITS OWN TWO BORDERS, ON EVERY PHONE** (owner, 2026-08-30,
// after four reports and three wrong explanations from me: _"I still don't see the link when
// on all and no matter what you say I don't buy your explanation … I think that you're
// missing something"_ — correct).
//
// `.modal-form` is a scrolling flex column, so its children are flex items. An item whose
// `overflow` is not `visible` loses its automatic minimum size (Flexbox §4.5), and
// `.share-send` is the sheet's only clipping child — so once the content passed 75dvh the
// browser satisfied the overflow by squashing THAT box instead of scrolling. Measured 2.0px
// against the 92px its link row and two buttons need.
//
// This file, and not the unit spec beside the component, is the whole point: the unit test
// asserting DOM order and both buttons' presence PASSED throughout, because jsdom lays
// nothing out. Only a real engine can be asked how tall a box came out.
test('the link and both send buttons survive the sheet at Everything', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await bootIntoAllTrips(page);

  // A share that already exists, which is the worse case: it adds the 44px link row on top
  // of the two 48px outcomes, and it is the state every owner is in after their first send.
  // The level cards are the admin's, and the sheet resolves that from
  // `GET /trips/:id` — unstubbed, `isAdmin` stays false and there is no
  // Everything to select. The boot fixture's own membership is the admin one.
  await page.route(
    (u) => /^\/trips\/[^/]+$/.test(u.pathname),
    (r) =>
      r.request().resourceType() === 'document'
        ? r.continue()
        : r.fulfill({ json: TRIP_WITH_MEMBERS }),
  );
  await page.route(
    (u) => /^\/trips\/[^/]+\/share$/.test(u.pathname),
    (r) =>
      r.fulfill({
        json: {
          code: '3JARS9gq',
          shareUrl: '/s/3JARS9gq',
          detailLevel: 'everything',
          sensitive: { bookingSecrets: false, notesAndTasks: false, travelerIdentity: false },
          documentIds: [],
          updatedAt: new Date().toISOString(),
        },
      }),
  );
  await settled(page);

  await hold(page, '.trip-hero');
  await page.getByRole('radio', { name: t.share.owner.audience.read }).click();
  await page.getByRole('radio', { name: t.share.owner.levels.everything }).click();

  const send = page.locator('.share-send');
  await expect(send).toBeVisible();

  // The assertion is the HEIGHT, not the presence — presence is what stayed true while this
  // was broken. A box that holds a 44px row and a 48px button row cannot be under 88px.
  const box = await stableBox(send);
  expect(Math.round(box.height)).toBeGreaterThanOrEqual(88);

  // And what it holds is actually inside it, rather than clipped away by `overflow: hidden`.
  const link = await stableBox(page.locator('.share-send .share-link-row'));
  const outcomes = await stableBox(page.locator('.share-send .share-outcomes'));
  expect(link.y + link.height).toBeLessThanOrEqual(box.y + box.height + 1);
  expect(outcomes.y + outcomes.height).toBeLessThanOrEqual(box.y + box.height + 1);
});

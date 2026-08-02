// **A NOTE OPENS WHERE IT IS, AND ITS HOST IS ONE TAP AWAY** (ADR-0153 §4/§8's 2026-08-02
// amendments, round two).
//
// Both halves need a real browser, for different reasons:
//
//  1. **The expansion** is a row growing inside a list. jsdom reports every rect as zero, so
//     "the list is still there and nothing was raised over it" is a claim only a browser can
//     check — and the whole point of the change is that nothing covers the list.
//  2. **The way in** ends on a DIFFERENT TAB, through a URL param that a freshly mounted
//     screen takes and spends. Two of the five destinations (the event and the idea) live on
//     the day view, which has no unit suite at all — this file is their only coverage.
//
// The place destination is deliberately absent: it goes through the Map's focus channel, and
// the hermetic e2e has no Maps key, so there is no pane to land on (the same reason phase 6's
// card geometry was measured off a harness rather than here).
import { test, expect, type Page } from '@playwright/test';
import { bootIntoTrip, shortLiveTripDates, todayAt, TRIP_ID } from './boot';

const PHONE = { width: 390, height: 844 };
const NOW = () => todayAt('15:00');
const today = () => new Date().toISOString().slice(0, 10);
const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

const stamps = {
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  updatedBy: 'u1',
};

const dinner = {
  id: 'ev-dinner',
  tripId: TRIP_ID,
  date: tomorrow(),
  title: 'ארוחת ערב במסעדת מון',
  icon: '🍜',
  category: 'food',
  kind: 'soft',
  status: 'planned',
  startsAt: `${tomorrow()}T10:00:00.000Z`,
  sortOrder: 0,
  source: 'manual',
  ...stamps,
};

const hotel = {
  id: 'bk-hotel',
  tripId: TRIP_ID,
  type: 'hotel',
  title: 'מלון שינג׳וקו גרנבל',
  source: 'manual',
  ...stamps,
};

const idea = {
  id: 'm-onsen',
  tripId: TRIP_ID,
  title: 'אונסן בהאקונה',
  category: 'nature',
  targetDate: tomorrow(),
  consumed: false,
  createdBy: 'u1',
  ...stamps,
};

const note = (id: string, body: string, host: Record<string, unknown>) => ({
  id,
  tripId: TRIP_ID,
  body,
  source: 'member',
  createdBy: 'u1',
  createdAt: '2024-01-02T00:00:00.000Z',
  updatedAt: '2024-01-02T00:00:00.000Z',
  updatedBy: 'u1',
  ...host,
});

const LONG =
  'הכניסה מאחור, ליד חנות הפרחים — לא מהרחוב הראשי. אחרי שש בערב השער הקדמי נעול והמשלוחים נכנסים מאותו פתח, אז אם יש תור זה שם.';

const NOTES = [
  note('n-event', 'לבקש את השולחן בגג', { eventId: dinner.id }),
  note('n-booking', 'הצ׳ק-אין רק מ-15:00', { bookingId: hotel.id }),
  note('n-idea', 'עדיף באמצע השבוע', { maybeItemId: idea.id }),
  note('n-general', LONG, {}),
];

async function boot(page: Page) {
  await page.setViewportSize(PHONE);
  await bootIntoTrip(page, {
    events: [dinner],
    bookings: [hotel],
    maybeItems: [idea],
    notes: NOTES,
    now: NOW(),
    dates: shortLiveTripDates(),
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'אינדקס' }).click();
  await page.getByText('פתקים', { exact: true }).first().click();
  await expect(page.locator('.wp-listrow').first()).toBeVisible();
}

/** Tap a note row by the words it shows. */
const tapNote = (page: Page, text: string) =>
  page.getByRole('button', { name: text, exact: true }).click();

test.describe('a note opens where it is', () => {
  test('the card grows under the row, and the list stays — nothing is raised over it', async ({
    page,
  }) => {
    await boot(page);
    const card = page.locator('.listcard');
    const row = page.locator('.wp-listrow', { hasText: 'לבקש את השולחן בגג' });
    const cardBefore = (await card.boundingBox())!.height;
    const rowBefore = (await row.boundingBox())!.height;
    const titleBefore = (await row.locator('.wp-listrow-title').boundingBox())!.height;
    const rowsBefore = await page.locator('.wp-listrow').count();

    await tapNote(page, 'לבקש את השולחן בגג');

    await expect(page.locator('.wp-listrow.is-open')).toHaveCount(1);
    const foot = page.locator('.note-open-foot');
    await expect(foot).toHaveCount(1);

    // **The card grows; the ROW does not** — and that is the design, not a rounding error.
    // This note is short, so lifting its two-line clamp adds nothing, and the foot is the
    // row's SIBLING rather than something inside it. On a short note opening adds only the
    // foot, which is the honest answer: the words were never what was missing.
    //
    // `<=` rather than `===`, and the slack is exactly one pixel with a reason: an open row
    // gives up its bottom hairline, because the row and its foot are one object and a rule
    // between them would cut a sentence from its own byline — the foot carries it instead.
    // So the row can only SHED a border, never grow, and growing is what this guards: a row
    // that got taller would mean the body had been printed inside it.
    expect((await card.boundingBox())!.height).toBeGreaterThan(cardBefore);
    expect((await row.boundingBox())!.height).toBeLessThanOrEqual(rowBefore);
    // …and the words themselves did not move, which is the claim underneath all of it.
    expect((await row.locator('.wp-listrow-title').boundingBox())!.height).toBe(titleBefore);

    // The foot sits immediately under the row it belongs to, inside the same card.
    const rowBox = (await row.boundingBox())!;
    const footBox = (await foot.boundingBox())!;
    expect(Math.abs(footBox.y - (rowBox.y + rowBox.height))).toBeLessThan(2);

    // …and the list is untouched: every other row is still on screen, and there is no dialog
    // over any of it. That is the whole difference from the sheet this replaced.
    expect(await page.locator('.wp-listrow').count()).toBe(rowsBefore);
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  });

  // The row clamps to two lines; opening lifts the clamp rather than printing the body a
  // second time underneath, which is the thing the mockup's first draft got wrong.
  test('a long note stops being cut off, in place', async ({ page }) => {
    await boot(page);
    const line = page.locator('.wp-listrow', { hasText: LONG }).locator('.note-body-line');
    const clamped = (await line.boundingBox())!.height;

    await tapNote(page, LONG);

    const opened = (await line.boundingBox())!.height;
    expect(opened).toBeGreaterThan(clamped);
    // The words appear ONCE — the expansion is the clamp coming off, not a copy.
    expect(await page.getByText(LONG, { exact: true }).count()).toBe(1);
  });

  test('one at a time, and a second tap closes it', async ({ page }) => {
    await boot(page);
    await tapNote(page, 'לבקש את השולחן בגג');
    await tapNote(page, 'הצ׳ק-אין רק מ-15:00');
    await expect(page.locator('.note-open-foot')).toHaveCount(1);
    await tapNote(page, 'הצ׳ק-אין רק מ-15:00');
    await expect(page.locator('.note-open-foot')).toHaveCount(0);
  });
});

test.describe('the way in to a note’s host', () => {
  test('an event: lands on its day with the card expanded', async ({ page }) => {
    await boot(page);
    await tapNote(page, 'לבקש את השולחן בגג');
    await page.getByRole('button', { name: `מעבר אל ${dinner.title}` }).click();

    // The day tab, on the host's OWN day — not the day you were standing on.
    await expect(page).toHaveURL(new RegExp(`tab=days.*day=${tomorrow()}`));
    // …and the card is open, which is what the id in the URL was for.
    await expect(page.locator('.wp-event.open')).toHaveCount(1);
    await expect(page.locator('.wp-event.open')).toContainText(dinner.title);
    // The param is spent on arrival, so a reload does not re-open what you have closed.
    await expect(page).not.toHaveURL(/event=/);
  });

  test('a booking: lands on the Index with its detail open', async ({ page }) => {
    await boot(page);
    await tapNote(page, 'הצ׳ק-אין רק מ-15:00');
    await page.getByRole('button', { name: `מעבר אל ${hotel.title}` }).click();

    await expect(page).toHaveURL(/tab=index/);
    await expect(page.getByRole('dialog')).toContainText(hotel.title);
    await expect(page).not.toHaveURL(/booking=/);
  });

  test('an idea: lands on its day with the idea’s own sheet open', async ({ page }) => {
    await boot(page);
    await tapNote(page, 'עדיף באמצע השבוע');
    await page.getByRole('button', { name: `מעבר אל ${idea.title}` }).click();

    await expect(page).toHaveURL(new RegExp(`tab=days.*day=${tomorrow()}`));
    await expect(page.getByRole('dialog')).toContainText(idea.title);
    await expect(page).not.toHaveURL(/idea=/);
  });

  // A general note has no host, so there is nothing to go to — the line says so and offers
  // no control, rather than a caret that does nothing.
  test('a general note offers no way in at all', async ({ page }) => {
    await boot(page);
    await tapNote(page, LONG);
    await expect(page.locator('.note-open-foot .note-open-host.plain')).toBeVisible();
    await expect(page.locator('.note-open-foot button.note-open-host')).toHaveCount(0);
  });
});

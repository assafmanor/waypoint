// **THE MARK MUST COST NOTHING** (ADR-0152 §6c) — and whether it does is a question about
// layout, which jsdom answers for nothing: it reports every rect as zero, so the entire
// class of bug this spec covers is invisible to the unit suite by construction.
//
// The unit tests pin the composition RULE (which parts render). This pins the three things
// only a real browser knows:
//
//  1. a noted row is exactly as tall as an unnoted one — a "mark" that costs a line is not
//     a mark, it is content, and ADR-0149 spent a whole session on those pixels;
//  2. the confirmation code is never what the ellipsis eats — a shortened place name is a
//     cosmetic loss, a shortened code is the fact you opened the row to read;
//  3. the case no mockup measured (the plan's G4): a row carrying a PENDING sync badge as
//     well as a code and a mark, which is the true worst case for that line.
import { test, expect, type Page } from '@playwright/test';
import { bootIntoTrip, shortLiveTripDates, TRIP_ID } from './boot';

const PHONE = { width: 390, height: 844 };
const DAYS_TAB = 'יום-יום';

const today = () => new Date().toISOString().slice(0, 10);

/** A crowded day row: a place, a confirmation code, a duration and a time — the shape the
 *  ADR measured, and the one where the line is already exactly full. */
const codedEvent = (over: Record<string, unknown> = {}) => ({
  id: 'e-coded',
  tripId: TRIP_ID,
  date: today(),
  title: 'ארוחת ערב במסעדת מון',
  icon: '🍜',
  category: 'food',
  kind: 'hard',
  startsAt: `${today()}T10:30:00.000Z`,
  endsAt: `${today()}T12:00:00.000Z`,
  status: 'planned',
  bookingId: 'b-coded',
  sortOrder: 0,
  source: 'manual',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  updatedBy: 'u1',
  ...over,
});

const booking = {
  id: 'b-coded',
  tripId: TRIP_ID,
  type: 'restaurant',
  title: 'ארוחת ערב במסעדת מון',
  confirmationCode: 'MN-4471',
  placeId: 'pl-1',
  source: 'manual',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  updatedBy: 'u1',
};

const place = (name: string) => ({
  id: 'pl-1',
  tripId: TRIP_ID,
  name,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  updatedBy: 'u1',
});

const note = (id: string) => ({
  id,
  tripId: TRIP_ID,
  body: 'הכניסה מאחור, ליד חנות הפרחים',
  eventId: 'e-coded',
  source: 'member',
  createdBy: 'u1',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  updatedBy: 'u1',
});

async function openDay(
  page: Page,
  opts: { notes?: unknown[]; placeName?: string; kind?: string } = {},
): Promise<void> {
  // A test that re-boots the same page to compare two states must drop the previous run's
  // route handlers first — they accumulate, and which one answers is not worth relying on.
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await bootIntoTrip(page, {
    dates: shortLiveTripDates(),
    events: [codedEvent(opts.kind ? { kind: opts.kind } : {})],
    bookings: [booking],
    places: [place(opts.placeName ?? 'שיבויה')],
    notes: opts.notes ?? [],
  });
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await page.locator('nav.nav button', { hasText: DAYS_TAB }).click();
  await expect(page).toHaveURL(/[?&]tab=days/);
  await expect(page.locator('.wp-event').first()).toBeVisible();
}

const rowHeight = (page: Page) =>
  page
    .locator('.wp-event')
    .first()
    .evaluate((el) => Math.round(el.getBoundingClientRect().height));

/** The meta line's own height — the precise claim, and immune to anything that changes the
 *  title line (a status tag, a settle strip) while the test is arranging its state. */
const metaHeight = (page: Page) =>
  page
    .locator('.wp-event-m')
    .first()
    .evaluate((el) => Math.round(el.getBoundingClientRect().height));

test.describe('the note mark on a day row (ADR-0152 §6c)', () => {
  test('costs a crowded row zero height', async ({ page }) => {
    await openDay(page);
    const without = await rowHeight(page);

    await openDay(page, { notes: [note('n1'), note('n2')] });
    await expect(page.locator('.note-mark')).toBeVisible();
    const withMark = await rowHeight(page);

    expect(withMark).toBe(without);
  });

  test('keeps the meta on ONE line — it ellipsises rather than wrapping', async ({ page }) => {
    // A place name far too long for the line, which used to wrap beneath the sync badge.
    await openDay(page, {
      notes: [note('n1')],
      placeName: 'רובע שיבויה, סמוך לתחנת הרכבת המרכזית ומול הכניסה הראשית',
    });
    const lines = await page
      .locator('.wp-event-m')
      .first()
      .evaluate((el) => {
        const style = getComputedStyle(el);
        const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
        return Math.round(el.getBoundingClientRect().height / lineHeight);
      });
    expect(lines).toBe(1);
  });

  test('never lets the ellipsis eat the confirmation code', async ({ page }) => {
    await openDay(page, {
      placeName: 'רובע שיבויה, סמוך לתחנת הרכבת המרכזית ומול הכניסה הראשית',
    });
    const code = page.locator('.wp-event-m-code').first();
    await expect(code).toBeVisible();
    // Fully rendered: nothing of it is clipped.
    const intact = await code.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
    expect(intact).toBe(true);
  });

  // The rule, seen at the width it was written for: something has to go, and it is the
  // place name rather than a `ש..` stub.
  test('a coded, noted row shows no place name at all — not a stub', async ({ page }) => {
    await openDay(page, { notes: [note('n1')] });
    await expect(page.locator('.wp-event-m-code')).toBeVisible();
    await expect(page.locator('.note-mark')).toBeVisible();
    await expect(page.locator('.wp-event-m-txt')).toHaveCount(0);
  });

  // G4: the case no mockup drew, and it needed a correction of its own. The sync badge is
  // the one node that already lived on this line, and the ADR's own measurement omitted it
  // — so badge + code + mark, the true worst case, had never been on screen anywhere.
  //
  // **The comparison has to isolate the MARK.** A first pass here compared a row before and
  // after its write was queued and failed at 15px vs 19px — which is the BADGE's own height,
  // not a wrap, and it has been that way since ADR-0091 put the badge there. What this
  // asserts is the only thing the mark is responsible for: given a badge already on the
  // line, adding the mark costs nothing.
  test('adds nothing to a line that already carries a pending badge and a code', async ({
    page,
  }) => {
    const queuedMetaHeight = async (notes: unknown[]) => {
      // Soft, so the row offers a verb that writes without the hard-edit guard.
      await openDay(page, { notes, kind: 'soft' });
      await page.context().setOffline(true);
      // `היינו` is offered by the opened row's action strip on an upcoming soft event and
      // by the inline settle prompt on a passed one (ADR-0043), so this is located by ROLE
      // rather than by either one's class — the test is about the meta line, not about
      // which of the two the clock happens to produce.
      await page.locator('.wp-event-face').first().click();
      await page.getByRole('button', { name: 'היינו' }).first().click();
      await expect(page.locator('.wp-event-m .sync-badge')).toBeVisible();
      await expect(page.locator('.wp-event-m-code')).toBeVisible();
      const height = await metaHeight(page);
      await page.context().setOffline(false);
      return height;
    };

    const withoutMark = await queuedMetaHeight([]);
    const withMark = await queuedMetaHeight([note('n1'), note('n2')]);
    await expect(page.locator('.note-mark')).toBeVisible();

    expect(withMark).toBe(withoutMark);
  });
});

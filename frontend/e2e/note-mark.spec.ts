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
import { bootIntoTrip, shortLiveTripDates, todayAt, TRIP_ID } from './boot';

const PHONE = { width: 390, height: 844 };
const DAYS_TAB = 'יום-יום';

/** **The clock is pinned, and this file is why the harness grew the option.** Its fixtures
 *  are times "today", so what they MEAN — passed, now, upcoming — was decided by the hour
 *  the suite happened to run at. The queued-badge test settles a passed event, which stopped
 *  existing the moment the date rolled past midnight UTC and the 10:30 fixture became
 *  tomorrow morning. 15:00 puts the morning fixtures behind us, deterministically. */
const NOW = () => todayAt('15:00');

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

const note = (id: string, host: Record<string, string> = { eventId: 'e-coded' }) => ({
  id,
  tripId: TRIP_ID,
  body: 'הכניסה מאחור, ליד חנות הפרחים',
  ...host,
  source: 'member',
  createdBy: 'u1',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  updatedBy: 'u1',
});

/** An idea for the shelf, and a document for the Index — the two hosts phase 5 wires whose
 *  rows had never carried a mark. */
const idea = {
  id: 'm-idea',
  tripId: TRIP_ID,
  title: 'מקדש מייג׳י',
  icon: '⛩️',
  consumed: false,
  createdBy: 'u1',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  updatedBy: 'u1',
};

const passportDoc = {
  id: 'd-passport',
  tripId: TRIP_ID,
  type: 'passport',
  title: 'דרכון של דנה',
  mimeType: 'image/jpeg',
  sizeBytes: 248_000,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  updatedBy: 'u1',
};

async function openDay(
  page: Page,
  opts: { notes?: unknown[]; placeName?: string; kind?: string } = {},
): Promise<void> {
  // A test that re-boots the same page to compare two states must drop the previous run's
  // route handlers first — they accumulate, and which one answers is not worth relying on.
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await bootIntoTrip(page, {
    now: NOW(),
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

// ── Phase 5's two rows, whose height claims are the ones a mockup could not settle ──────
//
// Both are the same question as the day row's, asked where the answer is less obvious: the
// IDEA tile is 140×76 with a corner already spoken for by Plan's `✕`, and the DOCUMENT row
// is the one host row with no meta line at all, so the mark brings one.

/** The Plan-mode day builder, where an idea tile carries BOTH corner affordances. Trip
 *  mode's shelf has no `✕`, so the crowded case only exists here. */
async function openPlanShelf(page: Page, notes: unknown[]): Promise<void> {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await bootIntoTrip(page, { now: NOW(), dates: shortLiveTripDates(), maybeItems: [idea], notes });
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await page.getByRole('button', { name: 'תכנון', exact: true }).click();
  await expect(page.locator('.app')).toHaveAttribute('data-mode', 'plan');
  await page.locator('nav.nav button', { hasText: DAYS_TAB }).click();
  await expect(page.locator('.wp-maybecard').first()).toBeVisible({ timeout: 20_000 });
}

const tileBox = (page: Page) =>
  page
    .locator('.wp-maybecard')
    .first()
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { h: Math.round(r.height), w: Math.round(r.width) };
    });

test.describe('the note mark on an idea tile (ADR-0153 §7)', () => {
  test('costs the tile no height, with Plan’s ✕ present — which no mockup drew', async ({
    page,
  }) => {
    await openPlanShelf(page, []);
    await expect(page.locator('.wp-maybecard-remove')).toBeVisible();
    const without = await tileBox(page);

    await openPlanShelf(page, [
      note('n1', { maybeItemId: 'm-idea' }),
      note('n2', { maybeItemId: 'm-idea' }),
    ]);
    await expect(page.locator('.wp-maybecard-remove')).toBeVisible();
    await expect(page.locator('.wp-maybecard .note-mark')).toBeVisible();
    const withMark = await tileBox(page);

    expect(withMark).toEqual(without);
  });

  // The corner the mark takes must be the one the `✕` does NOT: §7's correction says the
  // adjacency worth checking is the mark against the glyph, and this is the check.
  test('sits in the opposite corner from the ✕, and clear of the glyph', async ({ page }) => {
    await openPlanShelf(page, [note('n1', { maybeItemId: 'm-idea' })]);
    const boxes = await page
      .locator('.wp-maybecard')
      .first()
      .evaluate((el) => {
        const pick = (sel: string) => {
          const r = el.querySelector(sel)!.getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
        };
        return {
          mark: pick('.note-mark'),
          x: pick('.wp-maybecard-remove'),
          ic: pick('.wp-maybecard-ic'),
        };
      });
    // RTL: inline-start is the RIGHT edge, so the mark sits to the right of the `✕`.
    expect(boxes.mark.left).toBeGreaterThan(boxes.x.right);
    // And above the glyph, which is vertically centred in the tile.
    expect(boxes.mark.bottom).toBeLessThanOrEqual(boxes.ic.top);
  });
});

test.describe('the note mark on a document row (ADR-0152 §6)', () => {
  async function openDocuments(page: Page, notes: unknown[]): Promise<void> {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await bootIntoTrip(page, {
      now: NOW(),
      dates: shortLiveTripDates(),
      documents: [passportDoc],
      notes,
    });
    await page.setViewportSize(PHONE);
    await page.goto('/');
    await page.locator('nav.nav button', { hasText: 'אינדקס' }).click();
    await page.locator('.wp-idx-tile').nth(1).click(); // the documents tile
    await expect(page.locator('.wp-listrow').first()).toBeVisible();
  }

  const rowH = (page: Page) =>
    page
      .locator('.wp-listrow')
      .first()
      .evaluate((el) => Math.round(el.getBoundingClientRect().height));

  // The row has no meta line until a note gives it one, so this is the one case where the
  // mark could plausibly cost a line. It does not: the row's height is its 36px badge plus
  // padding, and title + meta together still measure under that.
  test('costs the row no height, even though it brings the meta line with it', async ({ page }) => {
    await openDocuments(page, []);
    await expect(page.locator('.wp-listrow-meta')).toHaveCount(0);
    const without = await rowH(page);

    await openDocuments(page, [
      note('n1', { documentId: 'd-passport' }),
      note('n2', { documentId: 'd-passport' }),
    ]);
    await expect(page.locator('.wp-listrow-meta .note-mark')).toBeVisible();
    const withMark = await rowH(page);

    expect(withMark).toBe(without);
  });
});

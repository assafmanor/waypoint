// **THE SUMMARY BLOCK, AND THE WAY THROUGH TO GOOGLE** (ADR-0167 §9.3/§5/§6, build plan Phase 5).
//
// §9.3 buys the summary a **pinned two-line block** under the identity, and the whole argument
// for it is arithmetic: hours ride the meta line at 0px, so this block is paid for rather than
// added. Every claim in that sentence is about boxes, so it is measured here — jsdom loads no CSS
// and reports every rect as zero, which is why `Map.embedded.test.tsx` can only assert which rows
// get a block and in which language.
//
// What this spec can reach, and what it cannot: the **selected list row** uses `.place`'s plain
// wrapping-line layout, and that is what runs here. The **bounded card**'s grid — the one where
// this block becomes row 2 and the notes list is the single scrolling track — only exists on a
// rendered canvas, and the hermetic run has no Maps key (the same wall Phase 4's spec hit for
// the way to the pin). So the grid placement is asserted as DOM order in the unit suite and its
// pinning is a device question; the clamp, the full-width line, the footer's wrap and ADR-0017's
// floors are all real here.
import { test, expect, type Page } from '@playwright/test';
import { bootIntoTrip, shortLiveTripDates, todayAt, TRIP_ID } from './boot';

const WIDTHS = [390, 360]; // ADR-0017's primary band, both ends
const today = () => new Date().toISOString().slice(0, 10);
const stamps = {
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  updatedBy: 'u1',
};

/** A real Wikipedia extract's length. The measured range is 86–1,321 characters (ADR-0166 §11),
 *  so the clamp is what stops two places differing by an order of magnitude — and only a long
 *  one can prove the clamp is doing anything at all. */
const LONG_EN =
  'Nezu Museum is an art museum in the Minami-Aoyama neighbourhood of Minato, Tokyo, Japan. ' +
  'It houses the collection of pre-modern Japanese and East Asian art assembled by the ' +
  'businessman and politician Kaichiro Nezu, and its garden holds several teahouses.';

const places = [
  { id: 'pl-known', tripId: TRIP_ID, name: 'Nezu', lat: 35.6656, lng: 139.7167, ...stamps },
  { id: 'pl-blank', tripId: TRIP_ID, name: 'Nezu', lat: 35.6657, lng: 139.7168, ...stamps },
];

const events = places.map((p, i) => ({
  id: `ev-${p.id}`,
  tripId: TRIP_ID,
  date: today(),
  title: `stop ${i + 1}`,
  icon: '🍜',
  category: 'food',
  kind: 'soft',
  status: 'planned',
  placeId: p.id,
  startsAt: `${today()}T0${5 + i}:00:00.000Z`,
  sortOrder: i,
  source: 'manual',
  ...stamps,
}));

const summary = (lang: string, value: string) => ({
  value,
  lang,
  source: 'wikipedia',
  license: 'CC BY-SA 4.0',
  attribution: 'Wikipedia',
  fetchedAt: '2026-08-05T10:00:00.000Z',
  confidence: 1,
  method: 'settled_id',
  ref: 'Q1054134',
});

async function boot(page: Page, width: number, lang = 'en'): Promise<void> {
  await page.setViewportSize({ width, height: 844 });
  await bootIntoTrip(page, {
    places,
    events,
    // Only the first place knows anything. The second is the majority case (ADR-0166 §11.3) and
    // the comparison: the same row, same title, without a block.
    enrichments: { 'pl-known': { summary: { [lang]: summary(lang, LONG_EN) } } },
    now: todayAt('02:00'),
    dates: shortLiveTripDates(),
  });
  await page.goto('/');
  await expect(page.locator('nav.nav')).toBeVisible();
  await page.locator('nav.nav button', { hasText: 'מפה' }).click();
  await expect(page.locator('.map-screen')).toBeVisible();
  await expect(page.locator('.map-list .place')).toHaveCount(places.length);
}

/** Select the row we know something about — the reveal is selection-gated, like the notes. */
async function selectKnown(page: Page) {
  await page.locator('.map-list .place').first().click();
  await expect(page.locator('.map-list .place.selected')).toHaveCount(1);
  await expect(page.locator('.map-sum')).toBeVisible();
}

async function measure(page: Page) {
  return page.evaluate(() => {
    const round = (r: DOMRect) => ({
      w: Math.round(r.width),
      h: Math.round(r.height),
      top: Math.round(r.top),
      left: Math.round(r.left),
      right: Math.round(r.right),
    });
    const rows = [...document.querySelectorAll('.map-list .place')] as HTMLElement[];
    const selected = rows.find((r) => r.classList.contains('selected'))!;
    const block = selected.querySelector('.map-sum') as HTMLElement;
    const prose = block.querySelector('.map-sum-t') as HTMLElement;
    const marker = block.querySelector('.map-sum-lang') as HTMLElement | null;
    const main = selected.querySelector('.map-main') as HTMLElement;
    const name = selected.querySelector('.map-name') as HTMLElement;
    const foot = selected.querySelector('.map-refs-foot') as HTMLElement;
    const lineHeight = parseFloat(getComputedStyle(prose).lineHeight);
    return {
      row: round(selected.getBoundingClientRect()),
      // The unselected row beside it: same fixture, so the difference IS the reveal.
      otherRowH: Math.round(rows.find((r) => r !== selected)!.getBoundingClientRect().height),
      block: round(block.getBoundingClientRect()),
      prose: round(prose.getBoundingClientRect()),
      lineHeight,
      // The clamp, proved rather than assumed: the text does not fit in the box it is given.
      clamped: prose.scrollHeight > prose.clientHeight + 1,
      lineClamp: getComputedStyle(prose).webkitLineClamp,
      marker: marker ? round(marker.getBoundingClientRect()) : null,
      // The identity row must not have moved or reflowed to make room for a full-width line.
      main: round(main.getBoundingClientRect()),
      nameLines: name.getClientRects().length,
      // The footer, which now holds three controls (ADR-0167 §6 added the third).
      foot: round(foot.getBoundingClientRect()),
      footItems: [...foot.children].map((el) => {
        const r = el.getBoundingClientRect();
        return { text: el.textContent ?? '', h: Math.round(r.height), top: Math.round(r.top) };
      }),
    };
  });
}

for (const width of WIDTHS) {
  test.describe(`the selected row's summary block @${width}`, () => {
    test.beforeEach(({ page }) => boot(page, width));

    // THE BLOCK IS TWO LINES. Not "about two" — the clamp is the only thing standing between a
    // 1,321-character extract and a card that changes size by an order of magnitude per place.
    test('is exactly two lines, and truncates a real extract', async ({ page }) => {
      await selectKnown(page);
      const m = await measure(page);
      expect(m.lineClamp).toBe('2');
      expect(m.clamped).toBe(true);
      // Two line boxes' worth of height, ±1px of rounding — not three, which is the specific
      // regression ADR-0167 §9 records (a later-declared 3-line rule won the specificity tie).
      expect(m.prose.h).toBeGreaterThanOrEqual(Math.round(2 * m.lineHeight) - 1);
      expect(m.prose.h).toBeLessThanOrEqual(Math.round(2 * m.lineHeight) + 1);
    });

    // A full-width line of its own, like `.map-refs` and the note section — so it costs the
    // identity row nothing, which is the same bargain every other block in this row struck.
    test('takes its own full-width line and reflows nothing above it', async ({ page }) => {
      const before = await page.evaluate(() => {
        const main = document.querySelector('.map-list .place .map-main') as HTMLElement;
        return { w: Math.round(main.getBoundingClientRect().width) };
      });
      await selectKnown(page);
      const m = await measure(page);
      expect(m.nameLines).toBe(1);
      expect(m.main.w).toBe(before.w);
      // Below the identity, and as wide as the row's content box.
      expect(m.block.top).toBeGreaterThanOrEqual(m.main.top + m.main.h);
      expect(m.block.w).toBeGreaterThan(m.main.w);
      // And it grew the row by its own height rather than by more: the reveal is the block plus
      // the blocks that were already there, never a reflow.
      expect(m.row.h).toBeGreaterThan(m.otherRowH);
    });

    // §5: the marker is inline BEFORE the prose. In an RTL flow "before" means further to the
    // right, and it must share the prose's first line rather than taking one of its own.
    test('puts באנגלית before the prose, on its first line', async ({ page }) => {
      await selectKnown(page);
      const m = await measure(page);
      expect(m.marker).not.toBeNull();
      expect(m.marker!.right).toBeGreaterThan(m.prose.right);
      expect(m.marker!.top).toBeGreaterThanOrEqual(m.prose.top - 1);
      expect(m.marker!.top).toBeLessThan(m.prose.top + m.lineHeight);
      // It costs the block no height: the block is the prose's two lines.
      expect(m.block.h).toBeLessThanOrEqual(m.prose.h + 1);
    });

    // **THE THIRD CONTROL DOES NOT FIT ON ONE LINE, AND THE MOCKUP HID THAT.** Measured:
    // `שיבוץ ליום` 118px + `עוד בגוגל` 83px + `מחיקת המקום` 116px + two 16px gaps = 349px
    // against 332px of footer at 390px and 302px at 360px. So the footer wraps — which it has
    // always been allowed to do (`flex-wrap: wrap` predates this) and which costs a second
    // 44px row plus the gap.
    //
    // v2 drew all three on one line because its delete is a bare `🗑` glyph; the shipped one is
    // a labelled 44px control that ADR-0157 §2 chose deliberately. This is the catalog's own
    // warning — the mockup's CSS is hand-written and not the app's — landing on a second phase.
    //
    // Asserted as it measures, not as it was drawn: nothing overlaps, nothing is clipped, every
    // control clears ADR-0017's floor, and the cost is stated. What to do about it is the
    // owner's call (see the session note): accept the wrap, unlabel the delete as the mockup
    // did, or move the way through out of the footer.
    test('gives all three footer controls their floor, wrapping to a second line', async ({
      page,
    }) => {
      await selectKnown(page);
      const m = await measure(page);
      expect(m.footItems).toHaveLength(3);
      for (const item of m.footItems) expect(item.h).toBeGreaterThanOrEqual(44);
      // Two lines, and the footer's own box is the two rows plus the gap — so the wrap is
      // accounted for rather than overflowing the row it is in.
      const tops = [...new Set(m.footItems.map((i) => i.top))];
      expect(tops).toHaveLength(2);
      // **And the wrap falls in the right place, which is why it is tolerable rather than a
      // defect:** the primary and the way through share line 1, and the DESTRUCTIVE control is
      // the one that drops — so it gains distance from the primary instead of sitting 16px from
      // it, which is the exact hazard `.map-refs-foot`'s gap comment was written about.
      expect(m.footItems[0].top).toBe(m.footItems[1].top);
      expect(m.footItems[2].top).toBeGreaterThan(m.footItems[1].top);
      expect(m.foot.h).toBeGreaterThanOrEqual(44 * 2);
      expect(m.foot.h).toBeLessThanOrEqual(44 * 2 + 20);
      // Each control is inside the footer's box: a wrap that overflowed would still measure
      // two "lines" while the third control sat outside the card.
      for (const item of m.footItems) {
        expect(item.top).toBeGreaterThanOrEqual(m.foot.top - 1);
        expect(item.top + item.h).toBeLessThanOrEqual(m.foot.top + m.foot.h + 1);
      }
    });
  });
}

// A Hebrew summary is the one that needs no marker — and the block must not reserve room for
// one it is not drawing.
test('a Hebrew summary draws no marker at all', async ({ page }) => {
  await boot(page, 390, 'he');
  await selectKnown(page);
  const m = await measure(page);
  expect(m.marker).toBeNull();
  // The prose starts at the block's own start edge (RTL: its right edge).
  expect(m.prose.right).toBe(m.block.right);
});

// The majority case (ADR-0166 §11.3 — Tokyo restaurants scored 0 of 7): nothing is drawn where a
// summary would be (ADR-0109 §7), and the footer's way through to Google is then the whole
// content of the reveal rather than an empty state to apologise for (§6).
test('a place we know nothing about draws no block, and still offers עוד בגוגל', async ({
  page,
}) => {
  await boot(page, 390);
  const blank = page.locator('.map-list .place').nth(1);
  await blank.click();
  await expect(blank).toHaveClass(/selected/);
  await expect(blank.locator('.map-sum')).toHaveCount(0);
  const google = blank.getByRole('link', { name: 'עוד בגוגל' });
  await expect(google).toBeVisible();
  // A different question from `נווט`, which the row still carries — and it opens away from us.
  await expect(google).toHaveAttribute('target', '_blank');
  await expect(blank.locator('.map-navbtn')).toBeVisible();
});

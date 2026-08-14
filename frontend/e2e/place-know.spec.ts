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

/** **The measured MAXIMUM** (ADR-0166 §11: extracts run 86–1,321 characters). The scroll spec needs
 *  a card that genuinely exceeds its scrollport — that is the state in which `nearest` is a no-op
 *  and `center` hides the identity row — and at the small end of ADR-0017's band a long extract is
 *  what produces one. */
const MAX_EN =
  'Nezu Museum is an art museum in the Minami-Aoyama neighbourhood of Minato, Tokyo, Japan. ' +
  'It houses the collection of pre-modern Japanese and East Asian art assembled over four ' +
  'decades by the businessman and politician Kaichiro Nezu, who served as president of the ' +
  'Tobu Railway and sat in the House of Peers. The collection numbers some seven thousand ' +
  'four hundred works, among them seven designated National Treasures and eighty-seven ' +
  'Important Cultural Properties, and it is shown in rotation rather than all at once. The ' +
  'garden that surrounds the galleries holds several teahouses, a stream and a collection of ' +
  'stone sculpture, and it is open to visitors with a museum ticket; the irises painted by ' +
  'Ogata Korin on a pair of celebrated folding screens are shown each spring, when the ' +
  'garden’s own irises are in flower.';

const filler = (i: number) => ({
  id: `pl-filler-${i}`,
  tripId: TRIP_ID,
  name: `Filler ${i}`,
  lat: 35.666 + i / 1000,
  lng: 139.717 + i / 1000,
  ...stamps,
});

const places = [
  // **Filler ABOVE, and it earns its place as much as the filler below does.** The alignment spec
  // needs the known row to start somewhere OTHER than the top of its scroller, or there is nothing
  // for `block: 'start'` to do and the test cannot tell `start` from `nearest` — both leave an
  // already-flush row where it is. That was invisible while the Map tab had no rendered map in
  // e2e: the list-only path puts the controls row and the notices above `.map-list` inside the
  // shell's body, so the first row was never flush. On the split (ADR-0186 Phase 2 made that the
  // path e2e takes) `.map-list` is the sheet's first content, so the first row is flush by
  // construction and the discriminator has to come from the fixture.
  ...[0, 1].map(filler),
  { id: 'pl-known', tripId: TRIP_ID, name: 'Nezu', lat: 35.6656, lng: 139.7167, ...stamps },
  { id: 'pl-blank', tripId: TRIP_ID, name: 'Nezu', lat: 35.6657, lng: 139.7168, ...stamps },
  // **Filler below**: `scrollIntoView({ block: 'start' })` can only bring a row's top to the top
  // if there is content BELOW it to scroll into. With two rows the scroller maxed out 102px short
  // — a limit of the scroll extent, not of the alignment — so the spec that measures the alignment
  // needs a list long enough to express it.
  ...[2, 3, 4, 5].map(filler),
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
  startsAt: `${today()}T${String(5 + i).padStart(2, '0')}:00:00.000Z`,
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

/** A real delivered image, so the expanded card has a hero and a credit to measure. */
const IMAGE = {
  url: '/enrichment/images/enr_11111111-2222-3333-4444-555555555555',
  mimeType: 'image/png',
  width: 840,
  height: 600,
  sizeBytes: 1024,
  source: 'commons',
  license: 'CC BY-SA 4.0',
  attribution: 'Kakidai',
  fetchedAt: '2026-08-05T10:00:00.000Z',
  confidence: 1,
  method: 'settled_id',
  ref: 'Nezu.jpg',
};

async function boot(
  page: Page,
  width: number,
  lang = 'en',
  opts: { height?: number; extract?: string } = {},
): Promise<void> {
  await page.setViewportSize({ width, height: opts.height ?? 844 });
  // The hero's bytes. A 1x1 PNG is enough here — this spec measures boxes, and
  // `place-photo-frame.spec.ts` is where a real decode is asserted.
  await page.route(
    (u) => u.pathname.startsWith('/enrichment/images/'),
    (r) =>
      r.fulfill({
        contentType: 'image/png',
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
          'base64',
        ),
      }),
  );
  await bootIntoTrip(page, {
    places,
    events,
    // Only the first place knows anything. The second is the majority case (ADR-0166 §11.3) and
    // the comparison: the same row, same title, without a block.
    enrichments: {
      'pl-known': {
        summary: { [lang]: summary(lang, opts.extract ?? LONG_EN) },
        image: IMAGE,
      },
    },
    now: todayAt('02:00'),
    dates: shortLiveTripDates(),
  });
  await page.goto('/');
  await expect(page.locator('nav.nav')).toBeVisible();
  await page.locator('nav.nav button', { hasText: 'מפה' }).click();
  await expect(page.locator('.map-screen')).toBeVisible();
  await expect(page.locator('.map-list .place')).toHaveCount(places.length);
}

/** The row we know something about, addressed by id rather than by position — it is no longer
 *  first, and `.first()` was always saying "the known one" rather than "the top one". */
const knownRow = (page: Page) => page.locator('.map-list .place[data-place="pl-known"]');

/** Select the row we know something about — the reveal is selection-gated, like the notes. */
async function selectKnown(page: Page) {
  await knownRow(page).click();
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

    // **THE FOOTER IS FULL, AND WHETHER IT WRAPS IS A FONT-METRIC COIN TOSS.** Measured on this
    // box: `שיבוץ ליום` 118px + `עוד בגוגל` 83px + `מחיקת המקום` 116px + two 16px gaps = 349px
    // against 332px of footer at 390px and 302px at 360px. At 360 it wraps everywhere; **at 390
    // it fit on CI's narrower Hebrew metrics and wrapped locally**, which is the first version
    // of this test failing in CI and being right to.
    //
    // So the wrap itself is not assertable — the same three labels measure differently on a
    // machine with different fonts, and pinning either outcome pins the machine. What IS
    // invariant, and is what actually matters:
    //
    //   - every control clears ADR-0017's 44px floor, on however many lines it takes;
    //   - nothing escapes the footer's own box (a wrap that overflowed would still look like
    //     "two lines" to a naive count while the third control sat outside the card);
    //   - **when it does wrap, the control that drops is the DESTRUCTIVE one.** The primary and
    //     the way through stay together, so the delete gains distance from the primary instead
    //     of sitting 16px from it — the exact hazard `.map-refs-foot`'s gap comment names.
    //
    // v2 drew all three on one line because its delete is a bare `🗑` glyph; the shipped one is
    // a labelled 44px control ADR-0157 §2 chose deliberately. What to do about a full footer is
    // the owner's call (see the session note): accept it, unlabel the delete as the mockup did,
    // or move the way through out of the footer.
    test('gives all three footer controls their floor, and drops only the destructive one', async ({
      page,
    }) => {
      await selectKnown(page);
      const m = await measure(page);
      expect(m.footItems).toHaveLength(3);
      for (const item of m.footItems) expect(item.h).toBeGreaterThanOrEqual(44);
      // The primary and the way through share a line whether or not anything wraps; the delete
      // is at or below them, never above and never between.
      expect(m.footItems[0].top).toBe(m.footItems[1].top);
      expect(m.footItems[2].top).toBeGreaterThanOrEqual(m.footItems[1].top);
      // The footer's own box accounts for however many lines that turned out to be, so the
      // reveal's height is honest either way.
      const lines = new Set(m.footItems.map((i) => i.top)).size;
      expect(m.foot.h).toBeGreaterThanOrEqual(44 * lines);
      expect(m.foot.h).toBeLessThanOrEqual(44 * lines + 16 * (lines - 1) + 12);
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

// **THE SELECTED CARD SCROLLS TO ITS OWN TOP** (owner, 2026-08-05: _"it still doesn't auto scroll
// on the list when selecting... it should auto scroll to the top of the card, it's much better when
// the card is too big to display fully"_).
//
// Measured in a real browser because the defect was in the *semantics* of the scroll, not in the
// wiring: the unit test asserted that `scrollIntoView` was CALLED and passed the whole time, while
// `nearest` is a no-op on a box taller than the scrollport and `center` puts the card's identity row
// above the fold. Only a rendered scroller can tell you where the card actually ended up.
//
// What this run reaches: the **graceful-absence path** (no Maps key here, so the list renders in the
// shell's scrolling body). The split's own sheet scroller needs a canvas, so the sheet stops stay a
// device question — but the alignment being asserted is the same call on the same row.
/** **Where the selected card ended up, polled rather than slept on** (ADR-0168 §3). The scroll is
 *  eased now, so a fixed wait measures a box in flight — which is exactly what the 120ms these two
 *  tests used to carry was doing, calibrated as it was for an instant jump. Both assertions are
 *  about where the card **lands**, so they retry through `toPass()` and depend on no duration at
 *  all: a wrong landing keeps failing until the timeout, where a longer sleep would only have
 *  moved the flake (and this spec already carries one environment-specific number CI corrected). */
async function measureLanding(page: Page) {
  return page.evaluate(() => {
    const el = document.querySelector('.map-list .place.selected') as HTMLElement;
    // **The card's OWN scroller, found rather than named.** The app scrolls with
    // `row.scrollIntoView({ block: 'start' })`, which acts on the nearest scrollable ancestor,
    // and which element that is depends on the path: `.wp-snapsheet-body` when a map is rendered
    // (the card is inside the sheet), the shell's `.body` on the list-only one. Naming `.body`
    // asserted the invariant against a box the card is not inside at all whenever there is a map.
    // Resolved by COMPUTED OVERFLOW, not by `scrollHeight`: `.wp-reveal` overflows its content
    // under `overflow: clip` and would otherwise win.
    let scroller = el.parentElement;
    while (scroller && !/^(auto|scroll)$/.test(getComputedStyle(scroller).overflowY)) {
      scroller = scroller.parentElement;
    }
    scroller ??= document.querySelector('.body') as HTMLElement;
    const r = el.getBoundingClientRect();
    const s = scroller.getBoundingClientRect();
    return {
      top: Math.round(r.top),
      height: Math.round(r.height),
      scrollerTop: Math.round(s.top),
      scrollerHeight: Math.round(s.height),
      scrolled: Math.round(scroller.scrollTop),
    };
  });
}

test.describe('the selected card scrolls to its top @390', () => {
  // **The SMALL end of ADR-0017's band, with the longest measured extract**, because the case the
  // owner reported is a card that does not fit: at 844px with an ordinary extract the card is 422px
  // against a 709px port, which is a state where `nearest` behaves perfectly well. CI found that
  // for me — the first version of this guard asserted a ratio that was true locally and 3px false
  // on the runner, which is the same environment-specific mistake ADR-0167 §13 already records.
  test.beforeEach(({ page }) => boot(page, 390, 'en', { height: 640, extract: MAX_EN }));

  test('brings the card’s top to the top of the list, not its middle', async ({ page }) => {
    // A card tall enough that the old modes misbehaved: summary + the notes section + the footer.
    const row = knownRow(page);
    const before = await row.evaluate((el) => Math.round(el.getBoundingClientRect().top));
    await row.click();
    await expect(page.locator('.map-sum')).toBeVisible();

    // **No height premise here, and CI is what corrected that**: a COLLAPSED card is clamped to
    // two lines (§9.3), so it does not exceed the port however long the extract is — 327px against
    // 505px on the runner. The too-fat-to-fit case is the EXPANSION, which is the next test.
    // What discriminates here is the alignment itself: `nearest` would bring the card's bottom in
    // and leave its top somewhere down the list, and `center` would put the top above the fold.
    await expect(async () => {
      const m = await measureLanding(page);
      expect(m.scrolled).toBeGreaterThan(0);
      expect(m.top).toBeLessThan(before);
      // And its TOP is at the scroller's top: within the 8px `scroll-margin-top` plus rounding,
      // never centred (which for a card taller than the port would put `top` ABOVE the scroller).
      expect(m.top).toBeGreaterThanOrEqual(m.scrollerTop - 1);
      expect(m.top).toBeLessThanOrEqual(m.scrollerTop + 24);
    }).toPass();
  });

  // The expansion is the bigger version of the same growth — and the one the owner's screenshot
  // caught opening under the tab bar.
  test('does the same when the card expands', async ({ page }) => {
    const row = knownRow(page);
    await row.click();
    await expect(page.locator('.map-sum')).toBeVisible();
    await page.getByRole('button', { name: 'עוד', exact: true }).click();
    await expect(page.locator('.map-hero')).toBeVisible();

    await expect(async () => {
      const m = await measureLanding(page);
      // **The card really is taller than the port** — otherwise this proves nothing about the
      // reported case: it is exactly the state where `nearest` scrolls nothing at all.
      expect(m.height).toBeGreaterThan(m.scrollerHeight);
      expect(m.top).toBeGreaterThanOrEqual(m.scrollerTop - 1);
      expect(m.top).toBeLessThanOrEqual(m.scrollerTop + 24);
    }).toPass();
  });
});

// **EXPANDING IS A MODE CHANGE, NOT GROWTH** (ADR-0167 §11.1). Measured here because the claim is
// about boxes: the itinerary blocks LEAVE, which is what dissolved §10.2's problem — a hero
// revealed inside the collapsed card left the notes scroller 31px.
test.describe('the research card @390', () => {
  test.beforeEach(({ page }) => boot(page, 390));

  test('swaps the blocks rather than adding to them', async ({ page }) => {
    await selectKnown(page);
    const before = await measure(page);
    // Collapsed: two clamped lines, the notes section, the references, the footer's three verbs.
    expect(before.prose.h).toBeLessThanOrEqual(Math.round(2 * before.lineHeight) + 1);

    await page.getByRole('button', { name: 'עוד', exact: true }).click();
    const hero = page.locator('.map-hero');
    await expect(hero).toBeVisible();

    const after = await page.evaluate(() => {
      const row = document.querySelector('.map-list .place.selected') as HTMLElement;
      const heroEl = row.querySelector('.map-hero') as HTMLElement;
      const prose = row.querySelector('.map-sum-t') as HTMLElement;
      return {
        heroH: Math.round(heroEl.getBoundingClientRect().height),
        heroFills: Math.round(
          (heroEl.querySelector('img') as HTMLElement).getBoundingClientRect().width,
        ),
        heroW: Math.round(heroEl.getBoundingClientRect().width),
        // The clamp is gone, so the whole extract is on screen.
        clamped: prose.scrollHeight > prose.clientHeight + 1,
        lineClamp: getComputedStyle(prose).webkitLineClamp,
        credit: (row.querySelector('.map-credit') as HTMLElement | null)?.textContent ?? null,
        // **The itinerary blocks are not on screen at the same time.**
        hasNotes: !!row.querySelector('.note-sec'),
        hasRefs: !!row.querySelector('.map-refs'),
        back: !!row.querySelector('.map-backrow'),
      };
    });

    // The mockup's own number for the hero.
    expect(after.heroH).toBe(130);
    expect(after.heroFills).toBe(after.heroW);
    expect(after.lineClamp).toBe('none');
    expect(after.clamped).toBe(false);
    expect(after.credit).toContain('CC BY-SA 4.0');
    expect(after.hasNotes).toBe(false);
    expect(after.hasRefs).toBe(false);
    expect(after.back).toBe(true);
  });

  // The credit stays aligned with every other line on the card, which is §8.2's whole point: the
  // bug was making the element LTR, which orphaned it to the opposite edge.
  test('keeps the credit on the card’s own edge', async ({ page }) => {
    await selectKnown(page);
    await page.getByRole('button', { name: 'עוד', exact: true }).click();
    const edges = await page.evaluate(() => {
      const row = document.querySelector('.map-list .place.selected') as HTMLElement;
      const credit = row.querySelector('.map-credit') as HTMLElement;
      // The summary block, not the NAME: the name is inset by the badge and its gap (40 + 11px),
      // while both of these are full-width blocks on the row's own content edge.
      const block = row.querySelector('.map-sum') as HTMLElement;
      const r = (el: HTMLElement) => Math.round(el.getBoundingClientRect().right);
      return {
        credit: r(credit),
        block: r(block),
        dir: getComputedStyle(credit).direction,
        // The defect §8.2 records is the line orphaning itself to the OPPOSITE edge, so the
        // distance from the row's left edge is what would collapse if it recurred.
        fromLeft: Math.round(
          credit.getBoundingClientRect().left - row.getBoundingClientRect().left,
        ),
      };
    });
    // RTL, so "the start edge" is the right one — the same edge every other block sits against.
    expect(edges.dir).toBe('rtl');
    expect(Math.abs(edges.credit - edges.block)).toBeLessThanOrEqual(1);
    expect(edges.fromLeft).toBeLessThan(20);
  });

  // **THE WAY BACK SITS ON ITS ROW'S LINE** (owner, 2026-08-05: _"the text חזרה לפרטי המקום isn't
  // line aligned correctly"_). `.map-know-more` carries `align-self: flex-start` for its FIRST
  // host — inside `.map-sum` it hugs the first line of baseline-aligned prose — and in this row its
  // neighbour is a 30px pill, so the same declaration pushed it ~10px above the line. jsdom cannot
  // see it: this is two boxes' centres, which is why it is measured here.
  test('centres the way back against the Google exit beside it', async ({ page }) => {
    await selectKnown(page);
    await page.getByRole('button', { name: 'עוד', exact: true }).click();
    const m = await page.evaluate(() => {
      const row = document.querySelector('.map-list .place.selected') as HTMLElement;
      const foot = row.querySelector('.map-backrow') as HTMLElement;
      const back = foot.querySelector('.map-know-more') as HTMLElement;
      const google = foot.querySelector('.map-gbtn') as HTMLElement;
      const mid = (el: HTMLElement) => {
        const r = el.getBoundingClientRect();
        return Math.round(r.top + r.height / 2);
      };
      return { back: mid(back), google: mid(google), footH: Math.round(foot.offsetHeight) };
    });
    // Two controls, one line: their centres agree to within a pixel of rounding.
    expect(Math.abs(m.back - m.google)).toBeLessThanOrEqual(1);
    // And the row did not grow to accommodate a second line while doing it.
    expect(m.footH).toBeLessThan(60);
  });

  test('comes back to the itinerary detail', async ({ page }) => {
    await selectKnown(page);
    await page.getByRole('button', { name: 'עוד', exact: true }).click();
    await page.getByRole('button', { name: 'חזרה לפרטי המקום', exact: true }).click();
    await expect(page.locator('.map-hero')).toHaveCount(0);
    await expect(page.locator('.map-list .place.selected .note-sec')).toBeVisible();
  });

  // §11.1 keeps the full-screen preview as the level below, reached from the hero — the app's own
  // viewer, which is ADR-0062's one permitted zoom.
  test('opens the full picture from the hero, credited', async ({ page }) => {
    await selectKnown(page);
    await page.getByRole('button', { name: 'עוד', exact: true }).click();
    await page.locator('.map-hero').click();
    await expect(page.locator('.doc-viewer')).toBeVisible();
    await expect(page.locator('.doc-viewer-caption')).toContainText('CC BY-SA 4.0');
  });
});

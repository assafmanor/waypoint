// Browser-contract e2e for the shelf's press-and-hold drag (ADR-0116 §5 and its
// session-113/115/116 amendments). Four rounds of gesture bugs were reported off a
// real phone and every one of them was invisible to the unit tests, because each
// turned on something jsdom does not have: a compositor, real layout, real
// hit-testing, `cancelable` touch semantics, a clock driving re-renders.
//
// Writing these found three defects the reports hadn't separated:
//
//   1. the pending hold was cancelled by any re-render inside its 280 ms window —
//      the builder re-renders every second on the clock, so the drag armed or not
//      by luck. That was the "arms only on some parts of the card" report;
//   2. the edge auto-scroll compared a VIEWPORT y against the SCROLLER's height,
//      so with a tall header both bands sat ~250 px too high and a finger resting
//      mid-list read as "past the bottom edge" — the list ran away under it;
//   3. the click a drop fires retargets (the dragged card is `pointer-events:
//      none`), so a capture handler on the card never saw it and releasing a drag
//      also opened the new-event sheet.
//
// Driven through CDP touch events (`Input.dispatchTouchEvent`) — `page.touchscreen`
// can only tap, and this whole file is about what happens between the touchstart
// and the touchend.
//
// WHAT THIS STILL CANNOT PROVE: the reports came from a phone, and Chromium is not
// the engine that broke. It is close enough to catch this CLASS of bug and to keep
// it from coming back. Feel — whether the hold reads as responsive — is out of
// reach of any automated test (ADR-0017 still wants a real-device pass).
import { test, expect, type Page, type CDPSession } from '@playwright/test';
import { bootIntoTrip, shortLiveTripDates } from './boot';
import { DRAG_EDGE_SCROLL_ZONE_PX } from '../src/constants';

// Phone-sized and touch-capable: the drag is a touch gesture on a ~390px screen
// (ADR-0017), and `hasTouch` is what makes the browser arbitrate scroll-vs-drag
// at all. Short viewport on purpose, so the shelf sits below the fold.
test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 660 } });

const TODAY = new Date().toISOString().slice(0, 10); // trip timezone is UTC
const TOMORROW = new Date(Date.parse(`${TODAY}T00:00:00.000Z`) + 86_400_000)
  .toISOString()
  .slice(0, 10);

/** The `?day=` param — the app's single source for which day is on screen, omitted
 *  when it is today (ADR-0035), so `null` means "back on the day we started". */
const dayParam = (page: Page) => new URL(page.url()).searchParams.get('day');

const event = (id: string, hhmm: string, title: string, status = 'planned') => ({
  id,
  tripId: 't1',
  date: TODAY,
  title,
  kind: 'soft',
  status,
  source: 'manual',
  sortOrder: 1,
  startsAt: `${TODAY}T${hhmm}:00.000Z`,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  updatedBy: 'u1',
});

const idea = (id: string, title: string) => ({
  id,
  tripId: 't1',
  title,
  icon: '💡',
  consumed: false,
  createdBy: 'u1',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  updatedBy: 'u1',
});

// A morning and an evening event leave a wide gap between them, so the builder
// renders a gap chip — the drag's real drop target.
const EVENTS = [event('ev-1', '07:00', 'בוקר'), event('ev-2', '20:00', 'ערב')];
const IDEAS = [idea('mb-1', 'מגדל אייפל'), idea('mb-2', 'קולוסיאום'), idea('mb-3', 'רעיון טוב')];

/** Touch input has to go through CDP: `page.touchscreen` only taps, and this
 *  whole file is about what happens BETWEEN touchstart and touchend. */
async function touch(
  cdp: CDPSession,
  type: 'touchStart' | 'touchMove' | 'touchEnd',
  x = 0,
  y = 0,
): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
  });
}

const scrollTop = (page: Page) => page.locator('.body').evaluate((el) => el.scrollTop);
/** The POOL strip specifically: while an idea is dragged out of it the day's group
 *  materialises above it (ADR-0116 §2 amendment), so `.shelf` first is a different
 *  element mid-drag than it was before. */
const POOL_STRIP = '[data-shelf-drop="pool"]';
/** Its VERTICAL offset: that is the axis the bug was about (the strip being picked
 *  as the drag's scroller). `scrollLeft` is the axis the strip legitimately owns, and
 *  in RTL it drifts by a pixel on relayout, so asserting on it would just be noise. */
const stripScrollTop = (page: Page) => page.locator(POOL_STRIP).evaluate((el) => el.scrollTop);

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Viewport-space box of an element, scrolled into view first — the shelf sits
 *  below the fold on a phone, and CDP touch points are viewport coordinates: a
 *  box measured off-screen aims the finger at nothing. */
async function boxOf(page: Page, selector: string): Promise<Box> {
  const el = page.locator(selector).first();
  await el.scrollIntoViewIfNeeded();
  const box = await el.boundingBox();
  if (!box) throw new Error(`no box for ${selector}`);
  return box;
}

async function centre(page: Page, selector: string): Promise<{ x: number; y: number }> {
  const box = await boxOf(page, selector);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Move an armed drag onto `selector` and keep re-aiming until it lights up.
 *
 *  One shot at a position measured before the move is not enough, and that is the
 *  feature rather than flake: if the target happens to sit inside an edge band, the
 *  finger arriving there starts the auto-scroll, which moves the target. Re-measuring
 *  each round converges — the scroll stops at the end of the scroller, and from then
 *  on the target holds still. Returns the point it finally settled on. */
async function holdOver(
  cdp: CDPSession,
  page: Page,
  selector: string,
): Promise<{ x: number; y: number }> {
  let at = { x: 0, y: 0 };
  await expect
    .poll(
      async () => {
        const el = page.locator(selector).first();
        // Scrolled into view first: a target below the fold has a box outside the
        // viewport, and a CDP touch there lands on nothing at all.
        await el.scrollIntoViewIfNeeded().catch(() => {});
        const box = await el.boundingBox();
        if (!box) return false;
        at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        await touch(cdp, 'touchMove', at.x, at.y);
        return (await page.locator(`${selector}.drop-over`).count()) > 0;
      },
      { timeout: 8000 },
    )
    .toBe(true);
  return at;
}

/** The app's scroll container is `.body`, and the edge auto-scroll's bands are
 *  measured against ITS box (not the viewport's), so every y in these tests is
 *  derived from it — a hard-coded y lands in a different band on a different
 *  header height and the test starts lying. */
async function bodyBands(page: Page) {
  const box = await boxOf(page, '.body');
  return {
    /** Inside the top band: the auto-scroll runs, and the finger is still over the
     *  list, so what scrolls under it can become the drop target. */
    topBand: box.y + 24,
    /** Clear of both bands: nothing but the browser's own pan can move the list. */
    middleFrom: box.y + box.height - DRAG_EDGE_SCROLL_ZONE_PX - 24,
    middleTo: box.y + DRAG_EDGE_SCROLL_ZONE_PX + 24,
  };
}

/** A live trip lands in Trip mode, and the shelf's drag lives on the PLAN day
 *  builder — so the mode toggle comes first, then the day tab. Both screens are
 *  lazy chunks, hence waiting on the builder rather than the click. */
async function openPlanDayBuilder(page: Page) {
  await page.locator('.modebar .toggle button', { hasText: 'תכנון' }).click();
  await expect(page.locator('.app')).toHaveAttribute('data-mode', 'plan');
  await page.locator('nav.nav button', { hasText: 'יום-יום' }).click();
  // Generous: the day builder is a lazy chunk, and under the dev server several
  // parallel workers asking for it at once can take a while to transform.
  // `.builder-side` and not `.shelf`: a shelf strip only exists when it has content or
  // a drag is in flight, and one scenario here deliberately starts with neither.
  await expect(page.locator('.builder-side')).toBeVisible({ timeout: 20_000 });
}

/** Cold-boot into the Plan day builder with the day seeded as given. Per-scenario
 *  rather than one global fixture, because the drop targets a day OFFERS depend on
 *  what is on it: a day with a gap has a gap chip, a day with nothing has neither. */
async function bootBuilder(
  page: Page,
  seed: { events?: unknown[]; maybeItems?: unknown[] },
): Promise<void> {
  await bootIntoTrip(page, { ...seed, dates: shortLiveTripDates() });
  await page.goto('/');
  await expect(page.locator('nav.nav')).toBeVisible();
  await openPlanDayBuilder(page);
}

test.describe('a day with a wide gap between two events', () => {
  test.beforeEach(({ page }) => bootBuilder(page, { events: EVENTS, maybeItems: IDEAS }));

  test('a hold arms the drag from anywhere on the card, not just some of it', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);

    // Four places a thumb actually lands: the padding ring, the glyph, the title,
    // and the action line. Reported as "drag activates ... just by holding specific
    // areas of the card". Re-measured per spot, because a completed drag reshuffles
    // the shelf (the day's group appears while an idea is in flight).
    const spots = [
      { name: 'top-left padding', at: (b: Box) => ({ x: b.x + 4, y: b.y + 4 }) },
      { name: 'glyph', at: (b: Box) => ({ x: b.x + b.width * 0.5, y: b.y + 18 }) },
      { name: 'title', at: (b: Box) => ({ x: b.x + b.width * 0.5, y: b.y + b.height * 0.5 }) },
      { name: 'action line', at: (b: Box) => ({ x: b.x + b.width * 0.5, y: b.y + b.height - 12 }) },
    ];

    for (const spot of spots) {
      const point = spot.at(await boxOf(page, `${POOL_STRIP} .wp-maybecard`));
      await touch(cdp, 'touchStart', point.x, point.y);
      await expect(page.locator('.wp-maybecard.dragging'), `held the ${spot.name}`).toBeVisible();
      await touch(cdp, 'touchEnd');
      await expect(page.locator('.wp-maybecard.dragging')).toHaveCount(0);
    }
  });

  test('an armed drag suppresses native scrolling — the finger no longer scrolls the page', async ({
    page,
  }) => {
    const cdp = await page.context().newCDPSession(page);
    const card = await centre(page, '.wp-maybecard');
    const bands = await bodyBands(page);

    await touch(cdp, 'touchStart', card.x, card.y);
    await expect(page.locator('.wp-maybecard.dragging')).toBeVisible();

    // Park in the middle of the scroller and let any auto-scroll from the lift settle,
    // so what follows is a clean read of the browser's own pan.
    await touch(cdp, 'touchMove', card.x, bands.middleFrom);
    await page.waitForTimeout(300);
    const before = await scrollTop(page);

    // Drag up the screen, staying clear of both edge bands: the ONLY thing that could
    // move the list now is a native pan. Before the fix it did — the listener meant to
    // suppress it was attached on arm, 280 ms after touchstart, by which point the
    // gesture was already on the compositor's fast path and `preventDefault` was a
    // no-op on an uncancellable touchmove.
    const span = bands.middleFrom - bands.middleTo;
    for (const step of [0.25, 0.5, 0.75, 1]) {
      await touch(cdp, 'touchMove', card.x, bands.middleFrom - span * step);
    }
    expect(await scrollTop(page)).toBe(before);

    await touch(cdp, 'touchEnd');
  });

  test('a flick without a hold scrolls the page and never arms a drag', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    const card = await centre(page, '.wp-maybecard');

    // Straight into a swipe: the drag must hand the gesture back, or ordinary
    // scrolling from a card is broken (which is how this saga started).
    await touch(cdp, 'touchStart', card.x, card.y);
    for (const y of [card.y - 30, card.y - 80, card.y - 140, card.y - 200]) {
      await touch(cdp, 'touchMove', card.x, y);
    }
    await expect(page.locator('.wp-maybecard.dragging')).toHaveCount(0);
    await touch(cdp, 'touchEnd');
    await expect.poll(() => scrollTop(page)).toBeGreaterThan(0);
  });

  test('holding at the top edge auto-scrolls the page, not the shelf strip', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    // Start from a scrolled-down position so there is somewhere to scroll back to.
    await page.locator('.body').evaluate((el) => (el.scrollTop = el.scrollHeight));
    const before = await scrollTop(page);
    const stripBefore = await stripScrollTop(page);
    const card = await centre(page, '.wp-maybecard');
    const bands = await bodyBands(page);

    await touch(cdp, 'touchStart', card.x, card.y);
    await expect(page.locator('.wp-maybecard.dragging')).toBeVisible();
    await touch(cdp, 'touchMove', card.x, bands.topBand); // into the top band, then held

    // The page scrolls up while the finger holds still…
    await expect.poll(() => scrollTop(page), { timeout: 3000 }).toBeLessThan(before);
    // …and the horizontally-scrolling strip is untouched: it reports
    // `overflow-y: auto` and used to be picked as the scroller instead of the page.
    expect(await stripScrollTop(page)).toBe(stripBefore);

    await touch(cdp, 'touchEnd');
  });

  test('the drop target keeps up while the page auto-scrolls under a still finger', async ({
    page,
  }) => {
    const cdp = await page.context().newCDPSession(page);
    // From the top, with the shelf below the fold, and hold in the BOTTOM band so the
    // list scrolls down until it can't — which brings the shelf to REST under the
    // still finger. Deliberately a target the scroll ends on rather than one it sweeps
    // past: a swept target is under the finger for a frame or two, and asserting on
    // that races React's batching for reasons that have nothing to do with the
    // behaviour under test (an earlier version of this case did, and flaked).
    await page.locator('.body').evaluate((el) => (el.scrollTop = 0));
    const card = await centre(page, '.wp-maybecard');
    const bands = await bodyBands(page);

    await touch(cdp, 'touchStart', card.x, card.y);
    await expect(page.locator('.wp-maybecard.dragging')).toBeVisible();
    // Note the y: the bottom band, not the shelf's position. Nothing here aims at the
    // target — the content is what moves.
    await touch(cdp, 'touchMove', card.x, bands.middleFrom + DRAG_EDGE_SCROLL_ZONE_PX);

    // The hit-test used to run on pointer MOVE only, so a held finger saw a frozen
    // answer: whatever scrolled under it never lit up and couldn't be dropped on —
    // the "the card never finds a stable place to drop" report.
    await expect(page.locator('.shelf.drop-over')).toBeVisible({ timeout: 5000 });
    await expect.poll(() => scrollTop(page)).toBeGreaterThan(0);

    await touch(cdp, 'touchEnd');
  });

  // The other half of the feedback (session-117): the card said "picked up" but never
  // "…and it's over HERE", so the drop stayed guesswork. A CLONE moves, not the card
  // itself — the card lives in a horizontally scrolling strip that would clip it the
  // moment it left, which is a thing only a real browser can demonstrate.
  test('the held card follows the finger, and its slot stays behind', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    const card = await centre(page, '.wp-maybecard');
    const bands = await bodyBands(page);
    const ghost = page.locator('.wp-dragghost');

    await expect(ghost).toHaveCount(0);
    await touch(cdp, 'touchStart', card.x, card.y);
    await expect(ghost).toBeVisible();

    // It starts where the card is: the grab offset is the point of it, so the clone
    // appears under the finger rather than snapping its own corner there.
    const lifted = (await ghost.boundingBox())!;
    expect(Math.abs(lifted.y + lifted.height / 2 - card.y)).toBeLessThan(12);

    // …and it goes where the finger goes.
    await touch(cdp, 'touchMove', card.x, bands.middleFrom);
    await touch(cdp, 'touchMove', card.x, bands.middleTo);
    const moved = (await ghost.boundingBox())!;
    expect(moved.y).toBeLessThan(lifted.y - 40);

    // The source keeps its slot, so the drop targets don't reflow under the finger.
    await expect(page.locator('.wp-maybecard.dragging')).toBeVisible();

    await touch(cdp, 'touchEnd');
    await expect(ghost).toHaveCount(0);
  });

  // An idea becoming an event is a CREATE, so the drop opens the form rather than
  // committing a slot the user never saw — the same thing an empty day already did
  // (session-120). Everything that already EXISTS still moves silently.
  test('an idea dropped on a gap opens the form on that slot', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    const card = await centre(page, '.wp-maybecard');

    await touch(cdp, 'touchStart', card.x, card.y);
    await expect(page.locator('.wp-maybecard.dragging')).toBeVisible();
    await holdOver(cdp, page, '.gap');
    await touch(cdp, 'touchEnd');

    const form = page.getByRole('dialog');
    await expect(form).toBeVisible();
    // Prefilled from the gap chip, not from the day's next opening: the gap runs
    // 07:00→20:00, so the form starts at 07:00.
    await expect(form.getByRole('button', { name: /07:00/ })).toBeVisible();
  });
});

test.describe('a skipped event on the shelf', () => {
  // A skipped soft event renders on the day's shelf group (ADR-0027's union), and
  // until session-117 it was the one card there you could not drag — the card that
  // most obviously wants to go back onto the day.
  test.beforeEach(({ page }) =>
    bootBuilder(page, {
      events: [
        event('ev-1', '07:00', 'בוקר'),
        event('ev-2', '20:00', 'ערב'),
        event('ev-skip', '12:00', 'דילגנו', 'skipped'),
      ],
      maybeItems: IDEAS,
    }),
  );

  test('drags like an idea does', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    const skipped = await centre(page, '.wp-maybecard.skipped-card');

    await touch(cdp, 'touchStart', skipped.x, skipped.y);
    await expect(page.locator('.wp-maybecard.skipped-card.dragging')).toBeVisible();
    await expect(page.locator('.wp-dragghost .skipped-card')).toBeVisible();
    await touch(cdp, 'touchEnd');
  });

  // Restored AND moved, in one write: putting it back at its old time when you
  // dropped it into a specific gap would contradict the gesture.
  test('dropped on a gap comes back into that slot', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    const skipped = await centre(page, '.wp-maybecard.skipped-card');

    await touch(cdp, 'touchStart', skipped.x, skipped.y);
    await expect(page.locator('.wp-maybecard.dragging')).toBeVisible();
    await holdOver(cdp, page, '.gap');
    await touch(cdp, 'touchEnd');

    // It leaves the shelf and joins the day's rows — the shelf only holds skipped
    // events, so its absence there IS the restore.
    await expect(page.locator('.wp-maybecard.skipped-card')).toHaveCount(0);
    await expect(page.locator('[data-bld-id="ev-skip"]')).toBeVisible();
  });
});

test.describe('a day with nothing on it', () => {
  // No events means no gap chips, so before session-117 there was nowhere to drop on
  // the very day where dragging an idea in is most obviously the point.
  test.beforeEach(({ page }) => bootBuilder(page, { events: [], maybeItems: IDEAS }));

  test('grows a drop zone while a card is in flight, and asks for a time on release', async ({
    page,
  }) => {
    const cdp = await page.context().newCDPSession(page);
    const card = await centre(page, '.wp-maybecard');
    const empty = page.locator('.builder-empty');

    // Idle, it is just the empty state.
    await expect(empty).not.toHaveClass(/droppable/);

    await touch(cdp, 'touchStart', card.x, card.y);
    await expect(page.locator('.wp-maybecard.dragging')).toBeVisible();
    await expect(empty).toHaveClass(/droppable/);

    const target = await centre(page, '.builder-empty');
    await touch(cdp, 'touchMove', target.x, target.y);
    await expect(empty).toHaveClass(/drop-over/);
    await touch(cdp, 'touchEnd');

    // The empty day knows WHICH day but has no slot to offer, so the release opens
    // the schedule sheet instead of inventing a time.
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});

test.describe('a builder row, dragged by a hold from anywhere on it', () => {
  // The reverse direction (session-118): the shelf could send a card onto the day, and
  // the day had no way to send a row back. Same two groups, opposite meaning.
  test.beforeEach(({ page }) =>
    bootBuilder(page, { events: [event('ev-1', '07:00', 'בוקר')], maybeItems: [] }),
  );

  // A DOM clone rather than a re-render, which is what lets one ghost serve markup as
  // different as a shelf card and a builder row.
  test('lifts a clone of the row that follows the finger', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    const row = await centre(page, '[data-bld-id="ev-1"]');
    const ghost = page.locator('.wp-dragghost');

    await expect(ghost).toHaveCount(0);
    await touch(cdp, 'touchStart', row.x, row.y);
    await expect(ghost).toBeVisible();
    // It really is the row: same title, and the row's own width rather than a chip's.
    await expect(ghost.locator('.bld-ttl')).toHaveText('בוקר');
    const lifted = (await ghost.boundingBox())!;
    const source = (await page.locator('[data-bld-id="ev-1"]').boundingBox())!;
    expect(Math.abs(lifted.width - source.width)).toBeLessThan(2);

    await touch(cdp, 'touchMove', row.x, row.y - 120);
    const moved = (await ghost.boundingBox())!;
    expect(moved.y).toBeLessThan(lifted.y - 60);

    // The clone must not answer hit-tests, or the drop target would always be itself.
    await expect(ghost).toHaveCSS('pointer-events', 'none');
    // …and it carries no duplicate of the row's hit-test attribute.
    await expect(page.locator('[data-bld-id="ev-1"]')).toHaveCount(1);

    await touch(cdp, 'touchEnd');
    await expect(ghost).toHaveCount(0);
  });

  // Both groups are conjured up for a row drag: on a day with an empty shelf there
  // would otherwise be nothing to aim at, and the two groups mean different days.
  test("dropped on the day's group, the row parks as an idea for that day", async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    const row = await centre(page, '[data-bld-id="ev-1"]');

    await expect(page.locator('.shelf')).toHaveCount(0);
    await touch(cdp, 'touchStart', row.x, row.y);
    await expect(page.locator('[data-shelf-drop="day"]')).toBeVisible();
    await expect(page.locator('[data-shelf-drop="pool"]')).toBeVisible();

    await holdOver(cdp, page, '[data-shelf-drop="day"]');
    await touch(cdp, 'touchEnd');

    // Off the day, onto the shelf — and into the day's group, not the pool.
    await expect(page.locator('[data-bld-id="ev-1"]')).toHaveCount(0);
    await expect(page.locator('[data-shelf-drop="day"] .wp-maybecard')).toHaveText(/בוקר/);
  });

  test('dropped on the pool, it parks as someday instead', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    const row = await centre(page, '[data-bld-id="ev-1"]');

    await touch(cdp, 'touchStart', row.x, row.y);
    await holdOver(cdp, page, '[data-shelf-drop="pool"]');
    await touch(cdp, 'touchEnd');

    await expect(page.locator('[data-bld-id="ev-1"]')).toHaveCount(0);
    await expect(page.locator('[data-shelf-drop="pool"] .wp-maybecard')).toHaveText(/בוקר/);
  });

  // The grip is gone (session-119): the row arms on a hold from wherever your thumb
  // lands, exactly like a shelf card, and there is no ⠿ or ▲/▼ left on it.
  test('arms from anywhere on the row, and the row carries no handle or arrows', async ({
    page,
  }) => {
    const cdp = await page.context().newCDPSession(page);
    await expect(page.locator('.bld-grip')).toHaveCount(0);
    await expect(page.locator('.bld-move')).toHaveCount(0);

    const box = await boxOf(page, '[data-bld-id="ev-1"]');
    const spots = [
      { name: 'leading edge', x: box.x + 6, y: box.y + box.height / 2 },
      { name: 'title', x: box.x + box.width * 0.4, y: box.y + box.height / 2 },
      { name: 'trailing edge', x: box.x + box.width - 6, y: box.y + box.height / 2 },
    ];
    for (const spot of spots) {
      await touch(cdp, 'touchStart', spot.x, spot.y);
      await expect(page.locator('.bld.dragging'), `held the ${spot.name}`).toBeVisible();
      await touch(cdp, 'touchEnd');
      await expect(page.locator('.bld.dragging')).toHaveCount(0);
    }
  });

  // Carrying a row to another day: resting on a day pill switches the builder to that
  // day UNDER the drag, which unmounts the very row being dragged — the reason the
  // gesture listens on the window rather than through pointer capture.
  test('dwelling on another day pill switches the day mid-drag', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    const row = await centre(page, '[data-bld-id="ev-1"]');
    const before = await dayParam(page);

    await touch(cdp, 'touchStart', row.x, row.y);
    await expect(page.locator('.bld.dragging')).toBeVisible();

    const pill = await centre(page, `[data-day-pill="${TOMORROW}"]`);
    await touch(cdp, 'touchMove', pill.x, pill.y);
    // Lit immediately, switched only after the dwell — a drag crosses pills on its way.
    await expect(page.locator(`[data-day-pill="${TOMORROW}"]`)).toHaveClass(/drop-over/);
    await expect.poll(() => dayParam(page), { timeout: 3000 }).toBe(TOMORROW);
    // The row it started on belongs to the old day and is gone; the drag is not.
    await expect(page.locator('[data-bld-id="ev-1"]')).toHaveCount(0);
    await expect(page.locator('.wp-dragghost')).toBeVisible();

    // Released on the pill, the event moves to that day.
    await touch(cdp, 'touchEnd');
    await expect(page.locator('[data-bld-id="ev-1"]')).toBeVisible();
    expect(await dayParam(page)).toBe(TOMORROW);
    expect(before).not.toBe(TOMORROW);
  });

  // Cancelling puts the day back: the switch was scaffolding for a drag that didn't
  // happen, and a day change is `replace` navigation with no back step to undo it.
  test('a drop on nothing returns to the day the drag started on', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    const row = await centre(page, '[data-bld-id="ev-1"]');

    await touch(cdp, 'touchStart', row.x, row.y);
    await expect(page.locator('.bld.dragging')).toBeVisible();
    const pill = await centre(page, `[data-day-pill="${TOMORROW}"]`);
    await touch(cdp, 'touchMove', pill.x, pill.y);
    await expect.poll(() => dayParam(page), { timeout: 3000 }).toBe(TOMORROW);

    // Release over the header chrome, which accepts nothing.
    await touch(cdp, 'touchMove', pill.x, 4);
    await touch(cdp, 'touchEnd');

    await expect.poll(() => dayParam(page)).toBe(null);
    await expect(page.locator('[data-bld-id="ev-1"]')).toBeVisible();
  });

  // The reported bug: after the dwell switches days, the first move DOWN into the day
  // view killed the drag and bounced you back. The switch unmounts the row the touch
  // started on, and a touch pointer is implicitly captured by that element — so the
  // question this pins is whether the gesture survives losing its own target.
  test('survives the day switch and can still be dropped in the new day', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    const row = await centre(page, '[data-bld-id="ev-1"]');
    const ghost = page.locator('.wp-dragghost');

    await touch(cdp, 'touchStart', row.x, row.y);
    await expect(page.locator('.bld.dragging')).toBeVisible();
    const pill = await centre(page, `[data-day-pill="${TOMORROW}"]`);
    await touch(cdp, 'touchMove', pill.x, pill.y);
    await expect.poll(() => dayParam(page), { timeout: 3000 }).toBe(TOMORROW);

    // Down off the strip and into the day view — the move that used to cancel it.
    const bands = await bodyBands(page);
    for (const y of [pill.y + 30, bands.middleTo, bands.middleTo + 40]) {
      await touch(cdp, 'touchMove', pill.x, y);
    }
    await expect(ghost, 'the drag survived leaving the strip').toBeVisible();
    expect(await dayParam(page)).toBe(TOMORROW);

    // …and it can still be dropped on something in the new day.
    await holdOver(cdp, page, '[data-shelf-drop="pool"]');
    await touch(cdp, 'touchEnd');
    await expect(page.locator('[data-shelf-drop="pool"] .wp-maybecard')).toHaveText(/בוקר/);
    expect(await dayParam(page)).toBe(TOMORROW);
  });
});

// The gesture has to work TWICE. Every test above starts from a cold boot and touches
// its target once, which is the one thing a real session never does — and the gap this
// class of bug keeps falling through (reported after session 120: "starting the move it
// cancels briefly after, and the auto-scroll isn't working").
test.describe('a second gesture on the same element', () => {
  test.beforeEach(({ page }) => bootBuilder(page, { events: EVENTS, maybeItems: IDEAS }));

  test('a shelf card still owns the finger on its second drag', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    const bands = await bodyBands(page);

    // Gesture one: lift and release on nothing. Nothing about it should leave the card
    // worse off for the next one.
    const first = await centre(page, `${POOL_STRIP} .wp-maybecard`);
    await touch(cdp, 'touchStart', first.x, first.y);
    await expect(page.locator('.wp-maybecard.dragging')).toBeVisible();
    await touch(cdp, 'touchEnd');
    await expect(page.locator('.wp-maybecard.dragging')).toHaveCount(0);

    // Gesture two, same card: arm, then move up the screen clear of both edge bands.
    const again = await centre(page, `${POOL_STRIP} .wp-maybecard`);
    await touch(cdp, 'touchStart', again.x, again.y);
    await expect(page.locator('.wp-maybecard.dragging')).toBeVisible();
    await touch(cdp, 'touchMove', again.x, bands.middleFrom);
    await page.waitForTimeout(300);
    const before = await scrollTop(page);

    const span = bands.middleFrom - bands.middleTo;
    for (const step of [0.25, 0.5, 0.75, 1]) {
      await touch(cdp, 'touchMove', again.x, bands.middleFrom - span * step);
    }
    // The two halves of the report, in order: the list must not pan under the finger…
    expect(await scrollTop(page), 'the second drag still suppresses the native pan').toBe(before);
    // …and the drag must still be alive after the moves (a pan cancels the pointer).
    await expect(page.locator('.wp-maybecard.dragging'), 'the second drag survived').toBeVisible();

    await touch(cdp, 'touchEnd');
  });

  test('a builder row still auto-scrolls on its second drag', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await page.locator('.body').evaluate((el) => (el.scrollTop = el.scrollHeight));
    const bands = await bodyBands(page);

    const first = await centre(page, '[data-bld-id="ev-1"]');
    await touch(cdp, 'touchStart', first.x, first.y);
    await expect(page.locator('.bld.dragging')).toBeVisible();
    await touch(cdp, 'touchEnd');
    await expect(page.locator('.bld.dragging')).toHaveCount(0);

    await page.locator('.body').evaluate((el) => (el.scrollTop = el.scrollHeight));
    const before = await scrollTop(page);
    const again = await centre(page, '[data-bld-id="ev-1"]');
    await touch(cdp, 'touchStart', again.x, again.y);
    await expect(page.locator('.bld.dragging')).toBeVisible();
    await touch(cdp, 'touchMove', again.x, bands.topBand);

    // Held in the top band: the page scrolls up, and the drag is still live to do it.
    await expect.poll(() => scrollTop(page), { timeout: 3000 }).toBeLessThan(before);
    await expect(page.locator('.wp-dragghost')).toBeVisible();

    await touch(cdp, 'touchEnd');
  });
});

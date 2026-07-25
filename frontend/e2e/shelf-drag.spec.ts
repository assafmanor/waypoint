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

const event = (id: string, hhmm: string, title: string) => ({
  id,
  tripId: 't1',
  date: TODAY,
  title,
  kind: 'soft',
  status: 'planned',
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
  await expect(page.locator('.builder-side')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.shelf').first()).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await bootIntoTrip(page, {
    events: EVENTS,
    maybeItems: IDEAS,
    dates: shortLiveTripDates(),
  });
  await page.goto('/');
  await expect(page.locator('nav.nav')).toBeVisible();
  await openPlanDayBuilder(page);
});

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
  await page.locator('.body').evaluate((el) => (el.scrollTop = el.scrollHeight));
  const card = await centre(page, '.wp-maybecard');
  const bands = await bodyBands(page);

  // Recorded rather than sampled: the gap SWEEPS past the held finger as the list
  // moves, so polling for `.drop-over` can miss the window entirely and the test
  // would fail for a reason that has nothing to do with the behaviour.
  await page.evaluate(() => {
    const seen = () => {
      if (document.querySelector('.gap.drop-over')) {
        document.documentElement.dataset.sawDropOver = '1';
      }
    };
    new MutationObserver(seen).observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });
  });

  await touch(cdp, 'touchStart', card.x, card.y);
  await expect(page.locator('.wp-maybecard.dragging')).toBeVisible();
  await touch(cdp, 'touchMove', card.x, bands.topBand);

  // The finger never moves again: the gap scrolls INTO it. The hit-test used to run
  // on pointer MOVE only, so nothing ever lit up and the drop landed on nothing —
  // the "the card never finds a stable place to drop" report.
  await expect
    .poll(() => page.locator('html').getAttribute('data-saw-drop-over'), { timeout: 5000 })
    .toBe('1');

  await touch(cdp, 'touchEnd');
});

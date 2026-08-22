// Browser-contract e2e for the shelf's press-and-hold drag (ADR-0116 §5 and its
// session-113/115/116 amendments). Four rounds of gesture bugs were reported off a
// real phone and every one of them was invisible to the unit tests, because each
// turned on something jsdom does not have: a compositor, real layout, real
// hit-testing, `cancelable` touch semantics, a clock driving re-renders.
//
// Writing these found three defects the reports hadn't separated:
//
//   1. the pending hold was cancelled by any re-render inside its DRAG_HOLD_MS window —
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
import { bootIntoTrip, shortLiveTripDates, todayAt } from './boot';
import { dispatchTouch } from './touch';
import {
  DRAG_DAY_DWELL_MS,
  DRAG_DAY_EDGE_PX,
  DRAG_DAY_LIFT_PX,
  DRAG_DAY_REVERSE_DWELL_MS,
  DRAG_EDGE_SCROLL_RELEASE_PX,
  DRAG_EDGE_SCROLL_ZONE_PX,
  DRAG_GHOST_LIFT_PX,
} from '../src/constants';
import { t } from '../src/i18n/he';

// Phone-sized and touch-capable: the drag is a touch gesture on a ~390px screen
// (ADR-0017), and `hasTouch` is what makes the browser arbitrate scroll-vs-drag
// at all. Short viewport on purpose, so the shelf sits below the fold.
test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 660 } });

const TODAY = new Date().toISOString().slice(0, 10); // trip timezone is UTC
const TOMORROW = new Date(Date.parse(`${TODAY}T00:00:00.000Z`) + 86_400_000)
  .toISOString()
  .slice(0, 10);
/** The day the surface's TRAILING edge names in RTL — the other half of the mirror. */
const YESTERDAY = new Date(Date.parse(`${TODAY}T00:00:00.000Z`) - 86_400_000)
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
 *  whole file is about what happens BETWEEN touchstart and touchend. One finger,
 *  which is what every gesture here is; `touch.ts` is the shape underneath it. */
async function touch(
  cdp: CDPSession,
  type: 'touchStart' | 'touchMove' | 'touchEnd',
  x = 0,
  y = 0,
): Promise<void> {
  await dispatchTouch(cdp, type, [{ x, y }]);
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

/** Wait for the top chrome to stop moving before believing any coordinate.
 *
 *  Scrolling the body condenses the header (ADR-0149 §7) over a CSS transition, so
 *  every box read in the frames after a scroll is a number that is about to change
 *  by 52px — and a CDP touch aimed with one lands on whatever slid into that place.
 *  This is the same trap the mockup that designed the header hit four times, one
 *  layer down: **a transition in flight makes every measurement a lie.**
 *
 *  It waits for the TRANSITIONS, not for a height that happens to repeat: a stable
 *  sample is not the same claim, and a height polled inside the gap between the
 *  scroll event and React flipping the class is stable at exactly the wrong value.
 *  Costs nothing when the chrome was not moving, and cannot drift from the token
 *  that times it. */
async function settleChrome(page: Page) {
  // Two frames first, so a class change React has queued but not yet painted has
  // landed: a scroll event condenses the chrome one render LATER, and sampling
  // inside that gap sees a perfectly stable pre-condense height and believes it.
  // That race is what made a measured card sit 52px — exactly the condense — from
  // where the drag ghost then appeared.
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  // Then wait for the transitions THEMSELVES rather than for a height that happens
  // to repeat. `getAnimations` reports running CSS transitions, so this asks the
  // question exactly instead of inferring it from samples.
  //
  // …and for the chrome to be at an END. A scroll leaves it wherever the finger
  // did and it SNAPS on an idle timer afterwards (ADR-0149 §7's 2026-08-04
  // amendment), so "nothing is animating" is true twice: once mid-gesture, before
  // the snap has even started, at a height nothing will still be at.
  await page.waitForFunction(
    () => {
      const el = document.querySelector('.header');
      if (!el) return true;
      if (document.querySelector('.app[data-chrome-row="mid"]')) return false;
      return el.getAnimations({ subtree: true }).every((a) => a.playState !== 'running');
    },
    null,
    { polling: 'raf' },
  );
}

/** Viewport-space box of an element, scrolled into view first — the shelf sits
 *  below the fold on a phone, and CDP touch points are viewport coordinates: a
 *  box measured off-screen aims the finger at nothing. */
async function boxOf(page: Page, selector: string): Promise<Box> {
  const el = page.locator(selector).first();
  await el.scrollIntoViewIfNeeded();
  await settleChrome(page);
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
 *  on the target holds still. Returns the point it finally settled on.
 *
 *  **Lit is not enough; it also has to have stopped moving** (found when ADR-0149
 *  shortened the header by ~135px, which put targets that used to clear the top band
 *  inside it). Returning on the first `drop-over` can hand back a point the
 *  auto-scroll is still dragging the target away from, so the release lands on
 *  whatever slid into that place — a drop that lights up and then does nothing.
 *  Convergence was always this helper's stated contract; this is it made literal. */
async function holdOver(
  cdp: CDPSession,
  page: Page,
  selector: string,
): Promise<{ x: number; y: number }> {
  let at = { x: 0, y: 0 };
  let lastY: number | null = null;
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
        const lit = (await page.locator(`${selector}.drop-over`).count()) > 0;
        const settled = lastY !== null && Math.abs(box.y - lastY) < 1;
        lastY = box.y;
        return lit && settled;
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
  await page.getByRole('button', { name: t.mode.plan, exact: true }).click();
  await expect(page.locator('.app')).toHaveAttribute('data-mode', 'plan');
  await page.locator('nav.nav button', { hasText: t.tabs.days }).click();
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
  // Pinned, because the BUILDER'S HEIGHT depends on the day's phase: a passed event carries
  // settle chrome and a now-line that an upcoming one does not, and the auto-scroll tests
  // need a page taller than its viewport to have anywhere to scroll. Run after midnight UTC
  // the seeded 07:00/20:00 events were both ahead, the page lost that chrome, and the second
  // auto-scroll test failed on code nobody had touched.
  await bootIntoTrip(page, { ...seed, now: todayAt('15:00'), dates: shortLiveTripDates() });
  await page.goto('/');
  await expect(page.locator('nav.nav')).toBeVisible();
  await openPlanDayBuilder(page);
}

// A plain TAP, which this file never covered because a tap was never the interesting half
// of the gesture — until ADR-0116 §5a changed what it does. Kept next to the drag on
// purpose: the two share one card, and the whole reason the extra tap is affordable is that
// the hold above still slots an idea in one gesture.
test.describe('a plain tap on an idea (ADR-0116 §5a)', () => {
  test.beforeEach(({ page }) => bootBuilder(page, { events: EVENTS, maybeItems: IDEAS }));

  /** **A real tap, and it has to be.** `locator.click()` is a mouse press whose
   *  down→up round-trip through CDP can outlast `DRAG_HOLD_MS` (500ms) — which arms the
   *  hold, so the release swallows the click and the tap does nothing at all. That is the
   *  shipped contract (a slow press IS a drag, and the swallow is defect 3 above), not a
   *  defect this found; it just means only `touchscreen.tap` asks the question. */
  const tap = async (page: Page, selector: string) => {
    const at = await centre(page, selector);
    await page.touchscreen.tap(at.x, at.y);
  };

  test('opens the idea itself, with שיבוץ ליום first and its notes above', async ({ page }) => {
    await tap(page, `${POOL_STRIP} .wp-maybecard-body`);

    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    // The sheet is the idea's, not the schedule form's: it names the idea and offers the
    // verb the tap used to perform.
    await expect(sheet.getByText('מגדל אייפל')).toBeVisible();
    await expect(sheet.locator('.note-sec:not(.tsk-sec)')).toBeVisible();
    await expect(sheet.locator('.wp-row-action').first()).toContainText('שיבוץ ליום');

    // And one press deeper is the day's own positions (ADR-0161 §4) — not the clock the
    // form used to open on. The picker asks WHERE, in the day's words.
    await sheet.getByRole('button', { name: 'שיבוץ ליום' }).click();
    await expect(page.getByRole('dialog').getByRole('button', { name: 'שיבוץ ליום' })).toHaveCount(
      0,
    );
    const positions = page.getByRole('dialog').locator('.slotpick-opt:not(.escape)');
    await expect(positions.first()).toBeVisible();

    // Picking one lands where the tap used to: the schedule form, on that position's slot.
    await positions.first().click();
    await expect(page.locator('.vt-date').first()).toBeVisible();
  });

  test('does not schedule anything by itself — the shelf is unchanged behind it', async ({
    page,
  }) => {
    const before = await page.locator(`${POOL_STRIP} .wp-maybecard`).count();
    await tap(page, `${POOL_STRIP} .wp-maybecard-body`);
    await expect(page.getByRole('dialog')).toBeVisible();
    // No event was written and no idea consumed: the tap is a read, and the day's rows are
    // the same ones. (The gap chips are what a scheduled idea would have displaced.)
    await expect(page.locator('[data-event]')).toHaveCount(EVENTS.length);
    expect(await page.locator(`${POOL_STRIP} .wp-maybecard`).count()).toBe(before);
  });
});

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
      // Defect 3 above, re-aimed by ADR-0116 §5a: the click a drop fires used to open the
      // new-event sheet, and the tile's tap now opens the IDEA's sheet — so a release in
      // place must still open nothing at all. The swallow's target changed; the claim did
      // not, and it would have gone untested if this loop only watched `.dragging`.
      await expect(page.getByRole('dialog'), `released the ${spot.name}`).toHaveCount(0);
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
    // suppress it was attached on arm, DRAG_HOLD_MS after touchstart, by which point the
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
    // Out of the band first, and that step is part of the contract rather than
    // padding: the shelf sits at the bottom, so the card was LIFTED inside the bottom
    // band, and a band the drag started in stays latched off until it leaves once
    // (`gateEdgeStep`) — otherwise picking a card up scrolls the page on its own.
    await touch(cdp, 'touchMove', card.x, bands.middleTo);
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

    // It starts where the card is: the grab offset is the point of it, so the clone appears
    // under the finger rather than snapping its own corner there — LIFTED clear of it by
    // `DRAG_GHOST_LIFT_PX`, so the target the finger is over is never underneath the clone
    // (ADR-0161 §8).
    //
    // The offset is asserted against that constant rather than against zero with a fuzzy
    // tolerance, which is how this caught the lift in the first place: the old bound was
    // `< 12` and the lift is exactly 12, so the test failed by a pixel and was right to.
    // The finger grabbed the card's centre, so nothing else should displace the clone —
    // hence 3px, tighter than the 12 it replaces.
    const lifted = (await ghost.boundingBox())!;
    const offset = lifted.y + lifted.height / 2 - card.y;
    expect(Math.abs(offset + DRAG_GHOST_LIFT_PX), `offset was ${offset}`).toBeLessThan(3);

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

  // **A seam costs no layout, and only a real browser can say so** (ADR-0161 §2). A
  // position now exists between every pair of rows rather than only where 60 free minutes
  // are, which is what makes "right after the flight" expressible — but the first version
  // gave each one an 18px box, so arming a drag grew the list by ~90px on a four-event day
  // and every target below the finger slid down as you reached for it. The seam is
  // zero-height now, painting into the 9px `.bld` already leaves between rows.
  //
  // jsdom cannot see this class of bug at all (every rect is zero), and `holdOver` would
  // hide it by converging, so the invariant is asserted here directly: the rows do not move
  // when the drag arms.
  test('arming a drag reveals the seams without moving the rows', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    const card = await centre(page, '.wp-maybecard');
    const lastRow = page.locator('.bld').last();
    const rowPosition = () =>
      lastRow.evaluate((el) => {
        const body = el.closest('.body');
        if (!(body instanceof HTMLElement)) throw new Error('builder row has no body scroller');
        return el.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop;
      });
    // Asserted on the seam's LINE, not on the seam: the seam is zero-height by design, and
    // a box with no area reads as hidden to Playwright exactly as it does to
    // `elementFromPoint`. The line is the 3px that actually paints.
    const seamLine = page.locator('.bld-seam .bld-seam-line').first();

    await expect(seamLine).toBeHidden();
    const before = await rowPosition();

    await touch(cdp, 'touchStart', card.x, card.y);
    await expect(page.locator('.wp-maybecard.dragging')).toBeVisible();
    // The seam is there. This fixture has exactly one — its 07:00 first event sits on the
    // window's own opening, so the day's head has no free time and never earned a chip,
    // which is precisely the position ADR-0161 §2 made reachable.
    await expect(seamLine).toBeVisible();
    expect(await page.locator('.bld-seam').count()).toBe(1);
    // …and the row below them has not budged.
    const after = await rowPosition();
    expect(Math.abs(after - before)).toBeLessThan(1);

    await touch(cdp, 'touchEnd');
    await expect(seamLine).toBeHidden();
  });

  // **The seam as a drop target, end to end** — the whole of ADR-0161 §2, and the one
  // claim about it that no unit test can make: a position between two rows with LESS than
  // `GAP_MIN_MINUTES` of free time is reachable by a finger and moves the row into it.
  // The fixture's two events are 07:00 and 20:00, so the seam under test is the day's
  // head — before the first row, where no chip has ever been.
  test('a row dropped on a seam moves into that position', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    const row = page.locator('[data-event="ev-2"]');
    const timeBefore = await row.locator('.bld-time').innerText();
    const start = (await boxOf(page, '[data-event="ev-2"]'))!;

    await touch(cdp, 'touchStart', start.x + start.width / 2, start.y + 8);
    await expect(page.locator('.bld.dragging')).toBeVisible();

    // Through `holdOver`, not a single move to a pre-measured point: the seam sits at the
    // top of the list, so it can be inside the edge band — and then the finger arriving
    // starts the auto-scroll, which moves the target out from under it. Converging is what
    // this helper exists for. Its zero-height box is fine to aim at: the 22px `::after`
    // reaches ±11px around it, which is what actually catches the finger.
    await holdOver(cdp, page, '.bld-seam');
    await touch(cdp, 'touchEnd');

    // It landed somewhere else, and it is still an event on the day rather than an idea.
    await expect(row).toBeVisible();
    await expect(row.locator('.bld-time')).not.toHaveText(timeBefore);
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

// Reported off the phone: "when you start dragging near the top or bottom of the
// screen it starts scrolling that way before you even started moving." Two causes,
// both about the FIRST frames of a drag rather than about the pacing: the loop
// tracked 0,0 until the first move arrived (which reads as pinned against the top
// edge), and a drag lifted inside a band was indistinguishable from one that had
// reached it. A tall day, so there is room to run away in both directions.
test.describe('a drag lifted inside an edge band', () => {
  const TALL_DAY = ['08:00', '09:30', '11:00', '12:30', '14:00', '15:30', '17:00', '18:30'].map(
    (hhmm, i) => event(`ev-${i + 1}`, hhmm, `אירוע ${i + 1}`),
  );

  test.beforeEach(({ page }) => bootBuilder(page, { events: TALL_DAY, maybeItems: IDEAS }));

  test('holds the list still until the drag has left that band', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    // Park a middle row at the very top of the scroller: its own position is then
    // inside the top band, with plenty of list above it for a runaway to be visible.
    await page
      .locator('[data-event="ev-5"]')
      .evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await settleChrome(page);
    const row = (await page.locator('[data-event="ev-5"]').boundingBox())!;
    const bands = await bodyBands(page);
    const body = await boxOf(page, '.body');
    expect(row.y, 'the row really is in the top band').toBeLessThan(
      body.y + DRAG_EDGE_SCROLL_ZONE_PX,
    );
    const before = await scrollTop(page);
    expect(before, 'and there is list above it to scroll to').toBeGreaterThan(0);

    const x = row.x + row.width / 2;
    await touch(cdp, 'touchStart', x, row.y + 8);
    await expect(page.locator('.bld.dragging')).toBeVisible();
    // Long enough for tens of frames: pre-fix this ran the list to the top at
    // DRAG_EDGE_SCROLL_MAX_PX a frame, under a finger that never moved.
    await page.waitForTimeout(500);
    expect(await scrollTop(page), 'the list stayed where the drag found it').toBe(before);

    // …and the band is not disabled, only deferred: leave it and come back, and it
    // scrolls like any other.
    await touch(cdp, 'touchMove', x, bands.middleTo);
    await touch(cdp, 'touchMove', x, bands.topBand);
    await expect.poll(() => scrollTop(page), { timeout: 3000 }).toBeLessThan(before);

    await touch(cdp, 'touchEnd');
  });

  // The follow-up report: "near an edge, if you want to drag in the direction of the
  // edge, it doesn't allow you even after starting the move." Leaving the band was
  // the only release, so the one edge you could not reach was the one you started
  // next to — you had to walk a band's depth away from it and come back.
  test('scrolls as soon as the drag pushes on toward that same edge', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    // A row parked a little way INTO the top band, so there is room to push further
    // toward the edge without leaving `.body` for the header chrome.
    await page
      .locator('[data-event="ev-5"]')
      .evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.locator('.body').evaluate((el) => (el.scrollTop -= 50));
    await settleChrome(page);
    const row = (await page.locator('[data-event="ev-5"]').boundingBox())!;
    const body = await boxOf(page, '.body');
    const from = row.y + 8;
    expect(from, 'lifted inside the top band').toBeLessThan(body.y + DRAG_EDGE_SCROLL_ZONE_PX);
    expect(from, 'with room to push toward the edge').toBeGreaterThan(
      body.y + DRAG_EDGE_SCROLL_RELEASE_PX,
    );
    const before = await scrollTop(page);
    expect(before).toBeGreaterThan(0);

    await touch(cdp, 'touchStart', row.x + row.width / 2, from);
    await expect(page.locator('.bld.dragging')).toBeVisible();
    // Straight on toward the top edge, staying inside the band the whole way — no
    // detour out of it and back.
    await touch(cdp, 'touchMove', row.x + row.width / 2, body.y + 6);
    await expect.poll(() => scrollTop(page), { timeout: 3000 }).toBeLessThan(before);

    await touch(cdp, 'touchEnd');
  });

  // The opposite band was never latched, and must not be: reaching for something
  // off-screen is the whole reason the auto-scroll exists.
  test('still reaches the far edge straight away', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await page
      .locator('[data-event="ev-5"]')
      .evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await settleChrome(page);
    const row = (await page.locator('[data-event="ev-5"]').boundingBox())!;
    const bands = await bodyBands(page);
    const before = await scrollTop(page);

    await touch(cdp, 'touchStart', row.x + row.width / 2, row.y + 8);
    await expect(page.locator('.bld.dragging')).toBeVisible();
    await touch(
      cdp,
      'touchMove',
      row.x + row.width / 2,
      bands.middleFrom + DRAG_EDGE_SCROLL_ZONE_PX,
    );

    await expect.poll(() => scrollTop(page), { timeout: 3000 }).toBeGreaterThan(before);

    await touch(cdp, 'touchEnd');
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
    await expect(page.locator('[data-event="ev-skip"]')).toBeVisible();
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
    // the schedule sheet instead of inventing a time. Named rather than counted: since
    // ADR-0116 §5a a stray click on the tile would ALSO produce a dialog — the idea's own
    // sheet — so "a dialog is visible" no longer distinguishes the two.
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'שיבוץ ליום' })).toHaveCount(0);
  });
});

// The day's EDGES (session-123): free time before the first event and after the last,
// which `gapBetween` structurally cannot see because each has an event on ONE side
// only. Same chip, same drop contract, so "drag it before the first" stops being the
// one thing the gesture could not say.
test.describe("a day's edge gaps", () => {
  test.beforeEach(({ page }) =>
    bootBuilder(page, {
      events: [event('ev-1', '09:00', 'בוקר'), event('ev-2', '12:00', 'צהריים')],
      maybeItems: IDEAS,
    }),
  );

  test('offers a chip before the first event and after the last', async ({ page }) => {
    // 07:00 (the day window) → 09:00 before it, 09:00 → 12:00 between, 12:00 → 23:59
    // after. Each hugs the event it is named for, so the leading one starts at 08:00.
    await expect(page.locator('.gap')).toHaveCount(3);
    await expect(page.locator('.gap').first()).toHaveAttribute('data-gap-start', '08:00');
    await expect(page.locator('.gap').last()).toHaveAttribute('data-gap-start', '12:00');
  });

  test('an idea dropped before the first event opens the form on the hour before it', async ({
    page,
  }) => {
    const cdp = await page.context().newCDPSession(page);
    const card = await centre(page, '.wp-maybecard');

    await touch(cdp, 'touchStart', card.x, card.y);
    await expect(page.locator('.wp-maybecard.dragging')).toBeVisible();
    await holdOver(cdp, page, '.gap[data-gap-start="08:00"]');
    await touch(cdp, 'touchEnd');

    const form = page.getByRole('dialog');
    await expect(form).toBeVisible();
    await expect(form.getByRole('button', { name: /08:00/ })).toBeVisible();
  });

  // A row takes the same targets a card does (session-123), and it moves silently:
  // it exists already, so there is nothing to choose in a form.
  test('a row dropped there moves in front of the first event', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    const row = await centre(page, '[data-event="ev-2"]');

    await touch(cdp, 'touchStart', row.x, row.y);
    await expect(page.locator('.bld.dragging')).toBeVisible();
    await holdOver(cdp, page, '.gap[data-gap-start="08:00"]');
    await touch(cdp, 'touchEnd');

    await expect(page.locator('[data-event="ev-2"] .bld-time')).toContainText('08:00');
    await expect(page.getByRole('dialog')).toHaveCount(0);
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
    const row = await centre(page, '[data-event="ev-1"]');
    const ghost = page.locator('.wp-dragghost');

    await expect(ghost).toHaveCount(0);
    await touch(cdp, 'touchStart', row.x, row.y);
    await expect(ghost).toBeVisible();
    // It really is the row: same title, and the row's own width rather than a chip's.
    await expect(ghost.locator('.bld-ttl')).toHaveText('בוקר');
    const lifted = (await ghost.boundingBox())!;
    const source = (await page.locator('[data-event="ev-1"]').boundingBox())!;
    expect(Math.abs(lifted.width - source.width)).toBeLessThan(2);

    await touch(cdp, 'touchMove', row.x, row.y - 120);
    const moved = (await ghost.boundingBox())!;
    expect(moved.y).toBeLessThan(lifted.y - 60);

    // The clone must not answer hit-tests, or the drop target would always be itself.
    await expect(ghost).toHaveCSS('pointer-events', 'none');
    // …and it carries no duplicate of the row's hit-test attribute.
    await expect(page.locator('[data-event="ev-1"]')).toHaveCount(1);

    await touch(cdp, 'touchEnd');
    await expect(ghost).toHaveCount(0);
  });

  // Both groups are conjured up for a row drag: on a day with an empty shelf there
  // would otherwise be nothing to aim at, and the two groups mean different days.
  test("dropped on the day's group, the row parks as an idea for that day", async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    const row = await centre(page, '[data-event="ev-1"]');

    await expect(page.locator('.shelf')).toHaveCount(0);
    await touch(cdp, 'touchStart', row.x, row.y);
    await expect(page.locator('[data-shelf-drop="day"]')).toBeVisible();
    await expect(page.locator('[data-shelf-drop="pool"]')).toBeVisible();

    await holdOver(cdp, page, '[data-shelf-drop="day"]');
    await touch(cdp, 'touchEnd');

    // Off the day, onto the shelf — and into the day's group, not the pool.
    await expect(page.locator('[data-event="ev-1"]')).toHaveCount(0);
    await expect(page.locator('[data-shelf-drop="day"] .wp-maybecard')).toHaveText(/בוקר/);
  });

  test('dropped on the pool, it parks as someday instead', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    const row = await centre(page, '[data-event="ev-1"]');

    await touch(cdp, 'touchStart', row.x, row.y);
    await holdOver(cdp, page, '[data-shelf-drop="pool"]');
    await touch(cdp, 'touchEnd');

    await expect(page.locator('[data-event="ev-1"]')).toHaveCount(0);
    await expect(page.locator('[data-shelf-drop="pool"] .wp-maybecard')).toHaveText(/בוקר/);
  });

  // The grip is gone (session-119): the row arms on a hold from wherever your thumb
  // lands, exactly like a shelf card, and there is no ⠿ or ▲/▼ left on it.
  //
  // It used to also assert `.bld-move` was absent — the `הזז` step's container. That class no
  // longer exists anywhere in the app (ADR-0161 §7 moved the move to the row's own time), so
  // the assertion had become vacuously true while reading as "the row carries no way to move
  // it", which is now the opposite of the case. Replaced with the two things that are true: no
  // retired grip, and the row's time IS the control.
  test('arms from anywhere on the row, and the row carries no handle or arrows', async ({
    page,
  }) => {
    const cdp = await page.context().newCDPSession(page);
    await expect(page.locator('.bld-grip')).toHaveCount(0);
    await expect(page.locator('button.bld-time').first()).toBeVisible();

    const box = await boxOf(page, '[data-event="ev-1"]');
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
    const row = await centre(page, '[data-event="ev-1"]');
    const before = await dayParam(page);

    await touch(cdp, 'touchStart', row.x, row.y);
    await expect(page.locator('.bld.dragging')).toBeVisible();

    const pill = await centre(page, `[data-day-pill="${TOMORROW}"]`);
    await touch(cdp, 'touchMove', pill.x, pill.y);
    // Lit immediately, switched only after the dwell — a drag crosses pills on its way.
    await expect(page.locator(`[data-day-pill="${TOMORROW}"]`)).toHaveClass(/drop-over/);
    await expect.poll(() => dayParam(page), { timeout: 3000 }).toBe(TOMORROW);
    // The row it started on belongs to the old day and is gone; the drag is not.
    await expect(page.locator('[data-event="ev-1"]')).toHaveCount(0);
    await expect(page.locator('.wp-dragghost')).toBeVisible();

    // Released on the pill, the event moves to that day.
    await touch(cdp, 'touchEnd');
    await expect(page.locator('[data-event="ev-1"]')).toBeVisible();
    expect(await dayParam(page)).toBe(TOMORROW);
    expect(before).not.toBe(TOMORROW);
  });

  // The other half of session-123: an event carried to another day had only the shelf
  // to land on once it got there, which turns it into an IDEA. The empty day takes it
  // as what it already is.
  test('carried onto an empty day, it lands as an event and not as an idea', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    const row = await centre(page, '[data-event="ev-1"]');

    await touch(cdp, 'touchStart', row.x, row.y);
    await expect(page.locator('.bld.dragging')).toBeVisible();
    const pill = await centre(page, `[data-day-pill="${TOMORROW}"]`);
    await touch(cdp, 'touchMove', pill.x, pill.y);
    await expect.poll(() => dayParam(page), { timeout: 3000 }).toBe(TOMORROW);

    // Tomorrow has nothing on it, so the empty state is the drop zone — armed for a
    // row now, not just for a card.
    await holdOver(cdp, page, '.builder-empty');
    await touch(cdp, 'touchEnd');

    await expect(page.locator('[data-event="ev-1"]')).toBeVisible();
    await expect(page.locator('[data-event="ev-1"] .bld-time')).toContainText('07:00');
    // Not on the shelf: that is what dropping it on a shelf group would have meant.
    await expect(page.locator('.wp-maybecard')).toHaveCount(0);
    expect(await dayParam(page)).toBe(TOMORROW);
  });

  // Cancelling puts the day back: the switch was scaffolding for a drag that didn't
  // happen, and a day change is `replace` navigation with no back step to undo it.
  test('a drop on nothing returns to the day the drag started on', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    const row = await centre(page, '[data-event="ev-1"]');

    await touch(cdp, 'touchStart', row.x, row.y);
    await expect(page.locator('.bld.dragging')).toBeVisible();
    const pill = await centre(page, `[data-day-pill="${TOMORROW}"]`);
    await touch(cdp, 'touchMove', pill.x, pill.y);
    await expect.poll(() => dayParam(page), { timeout: 3000 }).toBe(TOMORROW);

    // Release over the header chrome, which accepts nothing.
    await touch(cdp, 'touchMove', pill.x, 4);
    await touch(cdp, 'touchEnd');

    await expect.poll(() => dayParam(page)).toBe(null);
    await expect(page.locator('[data-event="ev-1"]')).toBeVisible();
  });

  // The reported bug: after the dwell switches days, the first move DOWN into the day
  // view killed the drag and bounced you back. The switch unmounts the row the touch
  // started on, and a touch pointer is implicitly captured by that element — so the
  // question this pins is whether the gesture survives losing its own target.
  test('survives the day switch and can still be dropped in the new day', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    const row = await centre(page, '[data-event="ev-1"]');
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

    const first = await centre(page, '[data-event="ev-1"]');
    await touch(cdp, 'touchStart', first.x, first.y);
    await expect(page.locator('.bld.dragging')).toBeVisible();
    await touch(cdp, 'touchEnd');
    await expect(page.locator('.bld.dragging')).toHaveCount(0);

    await page.locator('.body').evaluate((el) => (el.scrollTop = el.scrollHeight));
    const before = await scrollTop(page);
    const again = await centre(page, '[data-event="ev-1"]');
    await touch(cdp, 'touchStart', again.x, again.y);
    await expect(page.locator('.bld.dragging')).toBeVisible();
    await touch(cdp, 'touchMove', again.x, bands.topBand);

    // Held in the top band: the page scrolls up, and the drag is still live to do it.
    await expect.poll(() => scrollTop(page), { timeout: 3000 }).toBeLessThan(before);
    await expect(page.locator('.wp-dragghost')).toBeVisible();

    await touch(cdp, 'touchEnd');
  });
});

// ── THE EDGE THAT NAMES ANOTHER DAY (ADR-0116 §2's 2026-08-22 amendment) ─────────────────
//
// Owner: _"you could drag from the edge to a different day."_ The unit suite owns which day an
// edge means (`src/lib/useEdgeDayStep.test.tsx`) — the mirror, the latch, the trip's ends. What
// only an engine can answer is whether the thing works as a GESTURE: a real finger, the real
// hit-test, the real dwell, and a card that is still being dragged afterwards.
test.describe('carrying a card to another day from the surface edge', () => {
  test.beforeEach(({ page }) => bootBuilder(page, { events: EVENTS, maybeItems: IDEAS }));

  /** Inside the inline band, at a height clear of both vertical bands so the auto-scroll is
   *  not also running — one gesture, one thing being asserted. */
  /** Waits for the day the edge is stepping toward, **and does so promptly** — the interval
   *  is the whole point of the helper.
   *
   *  Holding at the edge steps again and again, and §2d put `--t-base` between a turn being
   *  COMMANDED and its day arriving: the cadence is ~940ms, and the next turn is committed
   *  240ms before the previous day even appears. `expect.poll`'s default ladder (0, 100, 250,
   *  500, 1000ms) can then report an arrival a full second late, so a test that acts on what
   *  it saw is acting on the day before last. Measured on the row case: 2026-08-23 was
   *  reported at 1850ms and 2026-08-24 landed at 1880. A flat 50ms hands the caller the whole
   *  dwell to move out of the band in. */
  const stepsTo = (page: Page, day: string) =>
    expect
      .poll(() => dayParam(page), { timeout: DRAG_DAY_DWELL_MS * 4, intervals: [50] })
      .toBe(day);

  async function edgeOf(page: Page, side: 'left' | 'right') {
    const box = await boxOf(page, '.day-swipe:not([data-preview])');
    const bands = await bodyBands(page);
    const inset = Math.round(DRAG_DAY_EDGE_PX / 4);
    return {
      x: side === 'left' ? box.x + inset : box.x + box.width - inset,
      y: (bands.middleFrom + bands.middleTo) / 2,
    };
  }

  /** The clone's centre against the finger it is meant to be under. `DRAG_GHOST_LIFT_PX` is the
   *  deliberate offset above the touch point, so a healthy clone reads as exactly that. */
  async function ghostOff(page: Page, at: { x: number; y: number }) {
    const g = await page.locator('.wp-dragghost').evaluate((el) => {
      const r = el.getBoundingClientRect();
      return {
        cx: r.x + r.width / 2,
        cy: r.y + r.height / 2,
        // **The fact under the whole case.** A `position: fixed` box has no offset parent —
        // unless an ancestor is transformed, which re-parents it, and that is exactly what the
        // lift did to it.
        anchored: (el as HTMLElement).offsetParent === null,
      };
    });
    return { dx: g.cx - at.x, dy: g.cy - (at.y - DRAG_GHOST_LIFT_PX), anchored: g.anchored };
  }

  // **The clone stays under the finger while the page moves under it** (§2d's repair; owner:
  // _"after moving to a day it no longer is under the finger"_, _"the ghost disappears
  // sometimes"_).
  //
  // A transform makes its element the containing block for every `position: fixed` descendant,
  // and the ghost rendered inside `.day-page` — the element the lift translates. So the moment
  // the edge lifted, the clone stopped being positioned against the viewport and took on the
  // page's own offset: measured 117px down the screen and then 156, with the finger never
  // leaving y=353. `offsetParent` is the assertion because it is the mechanism rather than a
  // symptom — a fixed box that reports one is not viewport-anchored, whatever its rect says
  // this frame.
  test('the dragged clone stays with the finger through a lift and a turn', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    const card = await centre(page, '.wp-maybecard');
    const host = page.locator('.day-swipe:not([data-preview])');

    await touch(cdp, 'touchStart', card.x, card.y);
    await expect(page.locator('.wp-maybecard.dragging')).toBeVisible();

    const edge = await edgeOf(page, 'left');
    await touch(cdp, 'touchMove', edge.x, edge.y);
    await expect(host).toHaveAttribute('data-edge-lift', '');
    const lifted = await ghostOff(page, edge);
    expect(lifted.anchored, 'the clone is positioned against the viewport, not the page').toBe(
      true,
    );
    expect(Math.abs(lifted.dx)).toBeLessThan(2);
    expect(Math.abs(lifted.dy)).toBeLessThan(2);

    await stepsTo(page, TOMORROW);
    // A move after the day changed, because the defect's offset GREW with each turn.
    await touch(cdp, 'touchMove', edge.x, edge.y + 1);
    const after = await ghostOff(page, { x: edge.x, y: edge.y + 1 });
    expect(after.anchored).toBe(true);
    expect(Math.abs(after.dx)).toBeLessThan(2);
    expect(Math.abs(after.dy)).toBeLessThan(2);
    await touch(cdp, 'touchEnd');
  });

  // **One pixel of jitter must not cancel the turn** (§2d's repair; owner: _"doesn't always
  // move to the next or prev day"_, and _"a weird stutter where it sort of looks like it tries
  // to complete the swipe but out of place"_).
  //
  // The edge re-issues its lift on every move it sees — and on every frame the auto-scroll
  // scrolls — so the turn's `--t-base` was being cleared by a finger that had not gone
  // anywhere. Measured before the fix: `dx 382px` / `settling=turn`, one 1px move, `dx 48px`,
  // and no day change at all.
  test('a twitch inside the turn does not put the page back', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    const card = await centre(page, '.wp-maybecard');
    const host = page.locator('.day-swipe:not([data-preview])');
    const dx = () =>
      host.evaluate((el) => (el as HTMLElement).style.getPropertyValue('--swipe-dx'));

    await touch(cdp, 'touchStart', card.x, card.y);
    await expect(page.locator('.wp-maybecard.dragging')).toBeVisible();
    const edge = await edgeOf(page, 'left');
    await touch(cdp, 'touchMove', edge.x, edge.y);
    await expect(host).toHaveAttribute('data-swipe-settling', 'turn', {
      timeout: DRAG_DAY_DWELL_MS * 4,
    });
    const travelling = await dx();
    await touch(cdp, 'touchMove', edge.x, edge.y + 1);
    // Still travelling: the same offset, still the turn's own settle, and no detent.
    expect(await dx()).toBe(travelling);
    await expect(host).toHaveAttribute('data-swipe-settling', 'turn');
    await expect(host).not.toHaveAttribute('data-edge-lift', '');
    await stepsTo(page, TOMORROW);
    await touch(cdp, 'touchEnd');
  });

  // **Leaving the band inside the turn lets it FINISH** (§2d's fourth repair; owner: _"dragging
  // to another day and then backing away still does this weird 'going back' animation, but stays
  // on the same day, and it comes across as super confusing"_).
  //
  // It used to rewind, and the recording is why that reads as it does: sampled every frame, the
  // page went from 247px back to 0 over ~160ms — over half a page of reverse travel, both peeks
  // moving with it, ending on the day it started on. The dwell had already fired and the page was
  // most of the way there, so finishing is both shorter and truer. What the withdrawal decides is
  // where it LANDS: nothing is holding the surface, so it is given back rather than kept claimed.
  test('leaving the band inside the turn lets the turn finish', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    const card = await centre(page, '.wp-maybecard');
    const host = page.locator('.day-swipe:not([data-preview])');
    const bands = await bodyBands(page);

    // **Every measurement happens BEFORE the window.** The turn lasts `--t-base`, so a
    // `boundingBox` round trip taken after the settle was observed can spend the whole of it —
    // which is a test that fails under load for reasons the app has nothing to do with. The
    // poll is tight for the same reason: what is left inside the window is one CDP dispatch.
    const box = await boxOf(page, '.day-swipe:not([data-preview])');
    const middle = { x: box.x + box.width / 2, y: (bands.middleFrom + bands.middleTo) / 2 };

    await touch(cdp, 'touchStart', card.x, card.y);
    await expect(page.locator('.wp-maybecard.dragging')).toBeVisible();
    const edge = await edgeOf(page, 'left');
    await touch(cdp, 'touchMove', edge.x, edge.y);
    await expect
      .poll(() => host.getAttribute('data-swipe-settling'), {
        timeout: DRAG_DAY_DWELL_MS * 4,
        intervals: [20],
      })
      .toBe('turn');
    const travelling = parseFloat(
      await host.evaluate((el) => (el as HTMLElement).style.getPropertyValue('--swipe-dx')),
    );
    await touch(cdp, 'touchMove', middle.x, middle.y);

    // Forward, never back: the offset never retreats from where the withdrawal found it, and the
    // day it was travelling to is the day that arrives.
    await expect
      .poll(() => host.evaluate((el) => (el as HTMLElement).style.getPropertyValue('--swipe-dx')), {
        intervals: [16],
      })
      .toMatch(/^0px$|^$/);
    expect(dayParam(page)).toBe(TOMORROW);
    // …and once it has arrived, nothing is holding it, so the surface is given back.
    await expect(host).not.toHaveAttribute('data-swiping', '');
    expect(travelling).toBeGreaterThan(0);
    await touch(cdp, 'touchEnd');
  });

  // **Going back is cheaper than going on** (§2d's repair; owner: _"hard to go back"_). The
  // opposite band, inside the reversal window, pays half the dwell — so this asserts a day
  // arriving in less time than a first step is allowed to take.
  test('reversing costs half a dwell', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    const card = await centre(page, '.wp-maybecard');
    const bands = await bodyBands(page);
    const box = await boxOf(page, '.day-swipe:not([data-preview])');
    const middle = { x: box.x + box.width / 2, y: (bands.middleFrom + bands.middleTo) / 2 };

    await touch(cdp, 'touchStart', card.x, card.y);
    await expect(page.locator('.wp-maybecard.dragging')).toBeVisible();
    const forward = await edgeOf(page, 'left');
    await touch(cdp, 'touchMove', forward.x, forward.y);
    await stepsTo(page, TOMORROW);

    // **Reaching the far band is not the request — asking for it is** (§2d's seventh repair,
    // below). So the price is measured from the ask, which is the second entry: the first one
    // latches the band, leaving releases it, and coming back means it.
    const back = await edgeOf(page, 'right');
    await touch(cdp, 'touchMove', back.x, back.y);
    await touch(cdp, 'touchMove', middle.x, middle.y);
    await touch(cdp, 'touchMove', back.x, back.y);
    const at = Date.now();
    await stepsTo(page, null as unknown as string);
    /**
     * **The bound sits between the two answers, which the first version did not.** A reversal
     * costs half a dwell plus the turn's travel — ~590ms — where a fresh journey costs the full
     * dwell plus the same travel, ~940ms. Asserting `< DRAG_DAY_DWELL_MS` put the line 110ms
     * above the expected value: true alone, eaten by two workers, which is how it failed once in
     * a group run and passed 3/3 on its own. `+100` leaves ~200ms either side.
     */
    expect(Date.now() - at).toBeLessThan(DRAG_DAY_DWELL_MS + 100);
    expect(Date.now() - at).toBeGreaterThan(DRAG_DAY_REVERSE_DWELL_MS - 50);
    await touch(cdp, 'touchEnd');
  });

  // **Nothing animates a second time after a landing** (§2d's second repair; owner: _"after
  // landing on the new day there's like a second animation for switching days"_, and _"moving
  // multiple days by holding on the edge is not looking good"_ — the same thing, once per day).
  //
  // The commit used to hand back the WHOLE offset, so the surface went to level and the edge —
  // whose finger is still in the band — animated it back to the detent. Recorded in the engine
  // before the fix, per day: the lift, the turn, then a third `transitionrun` on `.day-page`
  // 91ms after the URL changed. This counts transitions instead of looking at one, because "a
  // second animation" is a statement about how many there are.
  test('a landing does not start a second animation', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    const card = await centre(page, '.wp-maybecard');
    const host = page.locator('.day-swipe:not([data-preview])');
    await page.evaluate(() => {
      const w = window as unknown as { __runs: number };
      w.__runs = 0;
      document.addEventListener(
        'transitionrun',
        (ev) => {
          const el = ev.target as HTMLElement;
          if (el.classList?.contains('day-page') || el.classList?.contains('day-peek')) w.__runs++;
        },
        true,
      );
    });

    await touch(cdp, 'touchStart', card.x, card.y);
    await expect(page.locator('.wp-maybecard.dragging')).toBeVisible();
    const edge = await edgeOf(page, 'left');
    await touch(cdp, 'touchMove', edge.x, edge.y);
    await stepsTo(page, TOMORROW);
    const atLanding = await page.evaluate(() => (window as unknown as { __runs: number }).__runs);
    // Long enough for the old re-lift (it began ~90ms after the day changed and ran 240ms) and
    // comfortably short of the next dwell.
    await page.waitForTimeout(400);
    expect(
      await page.evaluate(() => (window as unknown as { __runs: number }).__runs),
      'the arriving day is already at the detent, so nothing has to move',
    ).toBe(atLanding);

    // And it IS still claimed — at LEVEL, which is what makes the next step continuous AND
    // leaves nothing to give back if the drag walks away instead (§2d's fourth repair).
    const state = await host.evaluate((el) => ({
      dx: parseFloat((el as HTMLElement).style.getPropertyValue('--swipe-dx')),
      lift: el.hasAttribute('data-edge-lift'),
      settling: el.getAttribute('data-swipe-settling'),
      rebase: el.hasAttribute('data-swipe-rebase'),
    }));
    expect(state.dx).toBe(0);
    expect(state.lift).toBe(true);
    expect(state.settling).toBeNull();
    // The suppression lasted its one frame and is long gone.
    expect(state.rebase).toBe(false);
    await touch(cdp, 'touchEnd');
  });

  // Holding through several days is the case the report was actually about: _"moving multiple
  // days by holding on the edge is not looking good"_. **Counted rather than sampled** — one
  // motion per day is a statement about how many transitions run, and a first version of this
  // read `--swipe-dx` a frame after each landing, which is a magnitude at a moment and duly
  // failed under load for reasons the app had nothing to do with.
  //
  // Three runs on `.day-page` for two days: the lift, then a turn each. Before the fix it was
  // five — every landing dropped to level and animated back to the detent.
  test('holding through two days is one motion per day', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    const card = await centre(page, '.wp-maybecard');
    const host = page.locator('.day-swipe:not([data-preview])');
    const dayAfter = new Date(Date.parse(`${TOMORROW}T00:00:00.000Z`) + 86_400_000)
      .toISOString()
      .slice(0, 10);
    await page.evaluate(() => {
      const w = window as unknown as { __page: number };
      w.__page = 0;
      document.addEventListener(
        'transitionrun',
        (ev) => {
          const el = ev.target as HTMLElement;
          // The host's own page only: the panes ride the same offset and would treble the count
          // without saying anything the page does not.
          if (
            el.classList?.contains('day-page') &&
            el.parentElement?.matches('.day-swipe:not([data-preview])')
          )
            w.__page++;
        },
        true,
      );
    });

    await touch(cdp, 'touchStart', card.x, card.y);
    await expect(page.locator('.wp-maybecard.dragging')).toBeVisible();
    const edge = await edgeOf(page, 'left');
    await touch(cdp, 'touchMove', edge.x, edge.y);
    await stepsTo(page, TOMORROW);
    await stepsTo(page, dayAfter);
    // Past where a re-lift would have started (~90ms after the landing) and short of the next
    // dwell, so the count is settled and nothing new has been commanded.
    await page.waitForTimeout(400);
    expect(
      await page.evaluate(() => (window as unknown as { __page: number }).__page),
      'the lift, then one turn per day, and nothing else',
    ).toBe(3);
    await expect(host).toHaveAttribute('data-edge-lift', '');
    await touch(cdp, 'touchEnd');
  });

  // **Backing away after a landing moves nothing at all** (§2d's fourth repair, and the third
  // repair's case rewritten — the jitter it fixed was in a motion that should not exist).
  //
  // The surface rests at LEVEL between days now: the lift is spent once on entering the band,
  // and after a turn the edge stays armed at zero. So there is no offset to give back, and a
  // withdrawal is not a motion. Sampled every frame before this, the same gesture ran the page
  // from 48px back to 0 — small, backwards, and meaning nothing, which is the report.
  //
  // Asserted as "no transition ran", which is what a still surface IS — a magnitude at a moment
  // would pass just as well on a motion that had merely finished early.
  test('backing away after a landing does not move the surface', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    const card = await centre(page, '.wp-maybecard');
    const host = page.locator('.day-swipe:not([data-preview])');
    const bands = await bodyBands(page);
    const box = await boxOf(page, '.day-swipe:not([data-preview])');
    const middle = { x: box.x + box.width / 2, y: (bands.middleFrom + bands.middleTo) / 2 };

    await page.evaluate(() => {
      const w = window as unknown as { __runs: number; __watch: () => void };
      w.__watch = () => {
        w.__runs = 0;
        document.addEventListener('transitionrun', (ev) => {
          const el = ev.target as HTMLElement;
          if (el.classList?.contains('day-page') || el.classList?.contains('day-peek')) w.__runs++;
        });
      };
    });

    await touch(cdp, 'touchStart', card.x, card.y);
    await expect(page.locator('.wp-maybecard.dragging')).toBeVisible();
    const edge = await edgeOf(page, 'left');
    await touch(cdp, 'touchMove', edge.x, edge.y);
    await stepsTo(page, TOMORROW);
    // Armed after the landing rather than before it, so the turn's own motion is not counted.
    await page.evaluate(() => (window as unknown as { __watch: () => void }).__watch());
    expect(
      await host.evaluate((el) => (el as HTMLElement).style.getPropertyValue('--swipe-dx')),
      'the day it landed on rests at level',
    ).toBe('0px');

    await touch(cdp, 'touchMove', middle.x, middle.y);
    await page.waitForTimeout(400);
    expect(
      await page.evaluate(() => (window as unknown as { __runs: number }).__runs),
      'nothing had to move, so nothing did',
    ).toBe(0);
    expect(dayParam(page)).toBe(TOMORROW);
    await touch(cdp, 'touchEnd');
  });

  // **Turning back during the animation stops, it does not reverse** (§2d's fifth repair;
  // owner: _"we 'turn back' during the animation, then it does a full animation of going back…
  // this looks very awkward and confusing"_).
  //
  // Recorded, with the pager's commands logged: `turn(1)` at 6229ms · the finger reaching the
  // opposite band at 6260 while the page travelled · the day arriving at 6501 · then `turn(-1)`
  // at 7300 and again at 8372, a full page backwards each time. The hand was retreating from
  // the edge it had just used, which is where a hand goes next.
  //
  // Counted rather than sampled: after the day lands, the offset must never travel the other
  // way, and no further day may arrive on its own.
  test('turning back during the turn stops, and does not walk back', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    const card = await centre(page, '.wp-maybecard');
    const host = page.locator('.day-swipe:not([data-preview])');
    const bands = await bodyBands(page);
    const box = await boxOf(page, '.day-swipe:not([data-preview])');
    const y = (bands.middleFrom + bands.middleTo) / 2;
    // The far band — where a hand pulling the card back the way it came ends up.
    const back = { x: box.x + box.width - Math.round(DRAG_DAY_EDGE_PX / 4), y };

    await page.evaluate(() => {
      const w = window as unknown as { __turns: number; __watch: () => void };
      w.__watch = () => {
        w.__turns = 0;
        const el = document.querySelector('.day-swipe:not([data-preview])') as HTMLElement;
        // Every time the host is told to travel a page — in either direction.
        new MutationObserver(() => {
          if (el.getAttribute('data-swipe-settling') === 'turn') w.__turns++;
        }).observe(el, { attributes: true, attributeFilter: ['data-swipe-settling'] });
      };
    });

    await touch(cdp, 'touchStart', card.x, card.y);
    await expect(page.locator('.wp-maybecard.dragging')).toBeVisible();
    const edge = await edgeOf(page, 'left');
    await touch(cdp, 'touchMove', edge.x, edge.y);
    await expect
      .poll(() => host.getAttribute('data-swipe-settling'), {
        timeout: DRAG_DAY_DWELL_MS * 4,
        intervals: [16],
      })
      .toBe('turn');
    // Armed after the forward turn was commanded, so only what follows is counted.
    await page.evaluate(() => (window as unknown as { __watch: () => void }).__watch());
    await touch(cdp, 'touchMove', back.x, back.y);

    // The turn that was already travelling still arrives — that much is #680's rule.
    await stepsTo(page, TOMORROW);
    // Then nothing, for three dwells: no reverse turn, no further day.
    await page.waitForTimeout(DRAG_DAY_DWELL_MS * 3);
    expect(
      await page.evaluate(() => (window as unknown as { __turns: number }).__turns),
      'the band the hand retreated into is not a request to go back',
    ).toBe(0);
    expect(dayParam(page)).toBe(TOMORROW);

    // And it still WORKS as a way back — once the drag asks for it, by leaving and returning.
    await touch(cdp, 'touchMove', box.x + box.width / 2, y);
    await touch(cdp, 'touchMove', back.x, back.y);
    await expect.poll(() => dayParam(page), { timeout: DRAG_DAY_DWELL_MS * 4 }).toBeNull();
    await touch(cdp, 'touchEnd');
  });

  // **The hand crossing to the far edge AFTER the landing is not a request to go back either**
  // (§2d's seventh repair; owner, with a screen recording: _"once the moving animation starts for
  // dragging, moving the opposite direction shouldn't cancel the operation, undo, or do any other
  // animation. It should complete the day move and animation. Only after you're on the next day
  // you should be able to go back."_ And: _"if you move your finger back fast enough — even a
  // little — it happens every time"_.)
  //
  // Read off the recording frame by frame: a step forward from day 2 of 12 to day 3, then, as the
  // hand crossed to the other edge, a full page travelling back to day 2. The fifth repair
  // covered the hand that crossed WHILE the page travelled; this is the hand that crosses a frame
  // after it lands, which is the same motion and read as a fresh request. It is the sixth repair's
  // case moved from "at the arrival" to "for as long as the step is on screen".
  //
  // The case above stops at the turn's own settle; this one waits for the day to arrive first, so
  // the two windows are asserted separately rather than one covering for the other.
  test('crossing to the far edge after a landing does not walk back', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    const card = await centre(page, '.wp-maybecard');
    const bands = await bodyBands(page);
    const box = await boxOf(page, '.day-swipe:not([data-preview])');
    const y = (bands.middleFrom + bands.middleTo) / 2;
    const back = { x: box.x + box.width - Math.round(DRAG_DAY_EDGE_PX / 4), y };

    await page.evaluate(() => {
      const w = window as unknown as { __turns: number; __watch: () => void };
      w.__watch = () => {
        w.__turns = 0;
        const el = document.querySelector('.day-swipe:not([data-preview])') as HTMLElement;
        new MutationObserver(() => {
          if (el.getAttribute('data-swipe-settling') === 'turn') w.__turns++;
        }).observe(el, { attributes: true, attributeFilter: ['data-swipe-settling'] });
      };
    });

    await touch(cdp, 'touchStart', card.x, card.y);
    await expect(page.locator('.wp-maybecard.dragging')).toBeVisible();
    const edge = await edgeOf(page, 'left');
    await touch(cdp, 'touchMove', edge.x, edge.y);
    // The day has ARRIVED — not merely been commanded, which is the other case's window.
    await stepsTo(page, TOMORROW);
    await page.evaluate(() => (window as unknown as { __watch: () => void }).__watch());
    await touch(cdp, 'touchMove', back.x, back.y);

    // Three dwells of nothing: no page travels, and the day the step landed on is the day that
    // stays. Before this repair the reverse fired ~590ms in — half a dwell, because the app
    // priced it as an undo — and the owner watched a step they had just made come apart.
    await page.waitForTimeout(DRAG_DAY_DWELL_MS * 3);
    expect(
      await page.evaluate(() => (window as unknown as { __turns: number }).__turns),
      'the band the hand crossed into is not a request to go back',
    ).toBe(0);
    expect(dayParam(page)).toBe(TOMORROW);

    // And the second half of the owner's sentence: going back is still there to be asked for.
    await touch(cdp, 'touchMove', box.x + box.width / 2, y);
    await touch(cdp, 'touchMove', back.x, back.y);
    await expect.poll(() => dayParam(page), { timeout: DRAG_DAY_DWELL_MS * 4 }).toBeNull();
    await touch(cdp, 'touchEnd');
  });

  // **The page a turn arrived on is handed back in ONE paint, never animated back** (§2d's
  // sixth repair).
  //
  // `hold(null)` writes the offset to 0, and the unwind rule — `--t-quick`/`--ease-exit`,
  // written for giving back a 48px detent — animated a whole PAGE when the release landed after
  // a committed turn. Measured on the PAINTED transform: `382 → 372 → 347 → 312 → 268 → 159 → 0`
  // with the heading flipping to the arriving day partway through, so what you watched was the
  // day you had just reached sliding backwards into place. Four failures in six runs before the
  // fix; six of six after.
  //
  // **Two things about how this is asserted, both of which cost rounds to learn.** It samples
  // the PAINT, never `--swipe-dx`: the variable is a transition's destination and reads `0px`
  // while the picture is still a page away, which is why four earlier probes reported clean.
  // And the reverse here is a slow glide, because the window is the gap between the commit and
  // React drawing the arriving day — a fast flick leaves the band while the turn is still
  // travelling, where `hold` correctly does nothing (measured: that variant passes with the fix
  // and without it, on a desktop runner and throttled 6x). The owner's own gesture is the fast
  // one, so **this case is not proof that their report is answered** — it is proof of one defect
  // that produced their words.
  test('the page a turn arrived on is handed back, not animated back', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    const host = page.locator('.day-swipe:not([data-preview])');
    const bands = await bodyBands(page);
    const box = await boxOf(page, '.day-swipe:not([data-preview])');
    const y = (bands.middleFrom + bands.middleTo) / 2;
    const edge = { x: box.x + Math.round(DRAG_DAY_EDGE_PX / 4), y };
    const middle = box.x + box.width / 2;
    // Measured last: the two above move the page, and a coordinate captured before them lands
    // on nothing by the time the touch is dispatched.
    const card = await centre(page, '.wp-maybecard');

    await page.evaluate(() => {
      const w = window as unknown as { __runs: number; __paint: string[]; __watch: () => void };
      w.__watch = () => {
        w.__runs = 0;
        w.__paint = [];
        const el = document.querySelector('.day-swipe:not([data-preview])') as HTMLElement;
        document.addEventListener('transitionrun', (ev) => {
          if ((ev.target as HTMLElement).classList?.contains('day-page')) w.__runs++;
        });
        setInterval(() => {
          const pg = el.querySelector(':scope > .day-page') as HTMLElement;
          if (!pg) return;
          w.__paint.push(
            `${Math.round(new DOMMatrixReadOnly(getComputedStyle(pg).transform).m41)}@${new URL(location.href).searchParams.get('day') ?? 'today'}`,
          );
        }, 16);
      };
    });

    // Armed before the gesture, so the count is the whole motion: the lift, then the turn.
    await page.evaluate(() => (window as unknown as { __watch: () => void }).__watch());
    await touch(cdp, 'touchStart', card.x, card.y);
    await expect(page.locator('.wp-maybecard.dragging')).toBeVisible();
    const steps = Math.round((card.x - edge.x) / 8);
    for (let i = 1; i <= steps; i++) {
      await touch(cdp, 'touchMove', card.x + ((edge.x - card.x) * i) / steps, y);
      await page.waitForTimeout(8);
    }
    await expect
      .poll(() => host.getAttribute('data-swipe-settling'), {
        timeout: DRAG_DAY_DWELL_MS * 4,
        intervals: [8],
      })
      .toBe('turn');
    const back = Math.round((middle - edge.x) / 8);
    for (let i = 1; i <= back; i++) {
      await touch(cdp, 'touchMove', edge.x + ((middle - edge.x) * i) / back, y);
      await page.waitForTimeout(8);
    }
    await stepsTo(page, TOMORROW);
    await page.waitForTimeout(400);

    const [runs, paint] = await page.evaluate(() => [
      (window as unknown as { __runs: number }).__runs,
      (window as unknown as { __paint: string[] }).__paint,
    ]);
    // The lift on the way in, and the turn. A third is the reverse slide this case forbids.
    expect(runs, 'the lift and the turn, and nothing else').toBe(2);
    const arrived = paint.findIndex((f) => f.endsWith(TOMORROW));
    expect(arrived, 'the day never arrived').toBeGreaterThan(-1);
    const between = paint
      .slice(arrived)
      .map((f) => Math.abs(Number(f.split('@')[0])))
      .filter((px) => px > 40 && px < 340);
    expect(between, `the page was painted mid-way back: ${between.join(',')}`).toEqual([]);
    expect(dayParam(page)).toBe(TOMORROW);
    await touch(cdp, 'touchEnd');
  });

  test('holding at the edge steps the day, and keeps stepping', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    const card = await centre(page, '.wp-maybecard');
    expect(dayParam(page)).toBeNull();

    await touch(cdp, 'touchStart', card.x, card.y);
    await expect(page.locator('.wp-maybecard.dragging')).toBeVisible();

    // In RTL the next day lies to the LEFT — the side its peek pane sits on — so dragging a
    // card that way is dragging it toward tomorrow.
    const edge = await edgeOf(page, 'left');
    await touch(cdp, 'touchMove', edge.x, edge.y);
    await stepsTo(page, TOMORROW);

    // **And the card is still in hand.** A day switch unmounts most of the screen; the whole
    // point of arriving there mid-drag is that you can now drop on this day's own targets.
    await expect(page.locator('.wp-dragghost')).toBeVisible();

    // Held, not re-moved: the finger has not travelled since the last `touchMove`, so the
    // second step can only come from the neighbours having shifted under it.
    const dayAfter = new Date(Date.parse(`${TOMORROW}T00:00:00.000Z`) + 86_400_000)
      .toISOString()
      .slice(0, 10);
    await stepsTo(page, dayAfter);

    await touch(cdp, 'touchEnd');
  });

  // **THE LIFT (ADR-0116 §2d).** §2c animated the incoming pane over the whole dwell and the
  // owner rejected it: 48px over 700ms is 1.1px per frame, a static offset with a timer. The
  // STRIP is lifted to a detent instead, briskly, and the dwell completes the turn. Asserted as
  // states and distances, never as a sampled frame.
  test('the page lifts to a detent, stops there, and the dwell completes the turn', async ({
    page,
  }) => {
    const cdp = await page.context().newCDPSession(page);
    const card = await centre(page, '.wp-maybecard');
    const host = page.locator('.day-swipe:not([data-preview])');

    await touch(cdp, 'touchStart', card.x, card.y);
    await expect(page.locator('.wp-maybecard.dragging')).toBeVisible();
    expect(await page.locator('.day-peek').count()).toBe(0);

    const edge = await edgeOf(page, 'left');
    await touch(cdp, 'touchMove', edge.x, edge.y);

    // ① The lift: the host says it is held at a detent, and the panes are mounted — through
    // the pager's OWN `live`, because a commanded lift is a page turn that has begun.
    await expect(host).toHaveAttribute('data-edge-lift', '');
    await expect(host).toHaveAttribute('data-swiping', '');
    await expect(page.locator('.day-peek')).toHaveCount(2);

    // The distance is the detent, on the strip's own channel — and it is the WHOLE strip, which
    // is the difference from §2c: the page moves, so `--swipe-dx` is what carries it.
    const aim = await host.evaluate((el) => ({
      dx: parseFloat((el as HTMLElement).style.getPropertyValue('--swipe-dx')),
      // The page and the incoming pane are one thing: both transitions are the detent's.
      pageEase: getComputedStyle(el.querySelector(':scope > .day-page')!).transitionTimingFunction,
      paneEase: getComputedStyle(el.querySelector('.day-peek[data-day="next"]')!)
        .transitionTimingFunction,
      dur: getComputedStyle(el.querySelector(':scope > .day-page')!).transitionDuration,
    }));
    expect(Math.abs(aim.dx)).toBe(DRAG_DAY_LIFT_PX);
    expect(aim.pageEase).toBe(aim.paneEase);
    expect(aim.dur).not.toBe('0s');

    // ② and ③: it stops there, and the dwell finishes the turn on the swipe's own settle.
    await expect(host).toHaveAttribute('data-swipe-settling', 'turn', {
      timeout: DRAG_DAY_DWELL_MS * 4,
    });
    await stepsTo(page, TOMORROW);
    await touch(cdp, 'touchEnd');
  });

  test('and leaving the band puts the page back without turning the day', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    const card = await centre(page, '.wp-maybecard');
    const host = page.locator('.day-swipe:not([data-preview])');
    const bands = await bodyBands(page);

    await touch(cdp, 'touchStart', card.x, card.y);
    await expect(page.locator('.wp-maybecard.dragging')).toBeVisible();
    const edge = await edgeOf(page, 'left');
    await touch(cdp, 'touchMove', edge.x, edge.y);
    await expect(host).toHaveAttribute('data-edge-lift', '');

    const box = await boxOf(page, '.day-swipe:not([data-preview])');
    await touch(cdp, 'touchMove', box.x + box.width / 2, (bands.middleFrom + bands.middleTo) / 2);
    // The detent is released and the offset goes back to zero — the unwind itself is CSS.
    await expect(host).not.toHaveAttribute('data-edge-lift', '');
    await expect
      .poll(() => host.evaluate((el) => (el as HTMLElement).style.getPropertyValue('--swipe-dx')))
      .toMatch(/^0px$|^$/);
    await page.waitForTimeout(DRAG_DAY_DWELL_MS * 2);
    expect(dayParam(page)).toBeNull();
    await touch(cdp, 'touchEnd');
  });

  // **A ROW, whose own element is what the day switch unmounts.** The card case above proves
  // the gesture; this proves the trap ADR-0116 §2 lists first — with `setPointerCapture` the
  // browser releases capture when the captured element goes away, so a drag that held one
  // would freeze mid-air. The edge reaches the same dwell from a different side of the screen,
  // so it inherits that answer rather than needing its own; asserted because "inherits" is a
  // claim about code, and the ghost outliving its source is a fact about the screen.
  test('a ROW carried to the edge survives the day it is dragged out of', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    const row = await centre(page, '[data-event]');
    const ghost = page.locator('.wp-dragghost');

    await touch(cdp, 'touchStart', row.x, row.y);
    await expect(page.locator('.bld.dragging')).toBeVisible();
    const edge = await edgeOf(page, 'left');
    await touch(cdp, 'touchMove', edge.x, edge.y);
    await stepsTo(page, TOMORROW);

    // The row it came off no longer exists — tomorrow has none — and the drag is still live.
    // **Scoped to the surface you are ON**, because §2c's lean mounts the peeks during a drag
    // and every row class then exists three times over (ADR-0200 §7's own warning, which this
    // assertion walked straight into: it counted tomorrow's rows inside a peek pane).
    await expect(
      page.locator('.day-swipe:not([data-preview]) > .day-page [data-event]'),
    ).toHaveCount(0);
    await expect(ghost, 'the drag survived the day it was lifted from').toBeVisible();

    // And it can still be put down on the day it was carried to.
    //
    // **Scoped with `:not(.day-peek *)`, and the obvious scope does not work.** A live lean
    // mounts the peeks, so `[data-shelf-drop="pool"]` matches three strips — and
    // `.day-swipe:not([data-preview]) …` matches all three too, because every pane lives
    // INSIDE the non-preview host, so `closest` finds it from a pane as readily as from the
    // real strip. Measured: `.first()` resolved to the pane parked off the far edge, which
    // put the finger deep in the opposite band and walked the day back to the trip's first
    // day (2026-08-19). Excluding by peek ancestry is the only scope that holds.
    await holdOver(cdp, page, '[data-shelf-drop="pool"]:not(.day-peek *)');
    await touch(cdp, 'touchEnd');
    // By its title, not by a count: this describe seeds the pool, so the row parks BESIDE
    // three ideas that were always there.
    await expect(
      page.locator(`[data-shelf-drop="pool"] .wp-maybecard`).filter({ hasText: 'בוקר' }),
    ).toHaveCount(1);
    expect(dayParam(page)).toBe(TOMORROW);
  });

  // ADR-0116 §2's asymmetry, which the edge inherits by feeding the same dwell: the day switch
  // is scaffolding for the drag, so a gesture that resolves to nothing takes it back.
  test('a drag that comes to nothing puts the day back', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    const card = await centre(page, '.wp-maybecard');

    await touch(cdp, 'touchStart', card.x, card.y);
    await expect(page.locator('.wp-maybecard.dragging')).toBeVisible();
    const edge = await edgeOf(page, 'left');
    await touch(cdp, 'touchMove', edge.x, edge.y);
    await stepsTo(page, TOMORROW);

    // Released over the edge, which accepts nothing: the edge NAVIGATES and is deliberately
    // not a drop target (a gap chip's own last 36px lie inside the band, and `overDate` is
    // read before the chip — see `PlanDay`).
    await touch(cdp, 'touchEnd');
    await expect.poll(() => dayParam(page)).toBeNull();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  // The latch, in the engine: a card whose own box reaches into a band must not set the days
  // running before the finger has asked. Vertically this was "you pressed, held, and the list
  // took off"; here it would be a day flipping under a stationary finger.
  //
  // **The lift point is measured, and the premise is asserted rather than assumed.** A first
  // attempt lifted 9px from the CARD's leading edge on the theory that this was near the
  // screen's — and in RTL the first pool card sits at x 234-374, so that point was 100px clear
  // of any band and the "does not step" half passed for no reason at all. The card's TRAILING
  // edge is the one flush with the surface's, and an event row spans the whole width, so a
  // drag lifted inside a band is the ordinary case rather than a contrived one.
  test('a card lifted inside the band does not step until the drag asks', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    const host = await boxOf(page, '.day-swipe:not([data-preview])');
    const card = await boxOf(page, '.wp-maybecard');
    const bands = await bodyBands(page);
    const midY = (bands.middleFrom + bands.middleTo) / 2;
    // Inside the trailing band with room left to push deeper than the release distance.
    const lift = {
      x: host.x + host.width - DRAG_EDGE_SCROLL_RELEASE_PX - 4,
      y: card.y + card.height / 2,
    };
    expect(host.x + host.width - lift.x).toBeLessThan(DRAG_DAY_EDGE_PX);
    expect(lift.x).toBeGreaterThan(card.x);

    await touch(cdp, 'touchStart', lift.x, lift.y);
    await expect(page.locator('.wp-maybecard.dragging')).toBeVisible();
    // Carried down to the middle of the scroller without leaving the band, and held there for
    // twice the dwell: the day must not move.
    await touch(cdp, 'touchMove', lift.x, midY);
    await page.waitForTimeout(DRAG_DAY_DWELL_MS * 2);
    expect(dayParam(page)).toBeNull();

    // Now it asks — by pushing deeper into the same band than it was lifted at. The trailing
    // edge is the PREVIOUS day in RTL, which is the other half of the mirror this file's
    // sibling unit test pins.
    await touch(cdp, 'touchMove', lift.x + DRAG_EDGE_SCROLL_RELEASE_PX, midY);
    await stepsTo(page, YESTERDAY);
    await touch(cdp, 'touchEnd');
  });
});

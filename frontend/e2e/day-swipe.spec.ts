// Browser-contract e2e for **stepping the day with a swipe** (ADR-0200).
//
// The unit suite already owns the recogniser's arithmetic (`lib/useSwipePager.test.tsx`).
// What only a real engine can answer is the part the gesture is actually made of:
//
//   • **Whether the browser lets us have the horizontal axis at all.** There is deliberately
//     no `touch-action` on the host (it intersects down the chain and would take the maybe
//     shelf's own scroll away — ADR-0182's device-pass scar), so the arbitration is the
//     browser's heuristic against our `AXIS_RATIO`. jsdom has no such heuristic: it delivers
//     every synthetic pointer event unconditionally, so a unit test cannot fail this.
//   • **That a swipe over a strip scrolls the STRIP.** `scrollerWithin` asks "does it overflow
//     right now", which is a layout question — every rect is zero in jsdom, so the unit test
//     has to fake the overflow it is checking for.
//   • **Both day surfaces, in both modes.** They are two screens sharing one hook, and
//     `frontend/CLAUDE.md` records twice that a day-surface change verified on one of them
//     shipped broken on the other.
//
// Driven through CDP touch for the reason `e2e/touch.ts` states: `page.touchscreen` can only
// tap, and this whole file is about the travel in between — and an untrusted pointer event
// dispatched from `page.evaluate` has no active pointer behind it, so `setPointerCapture`
// throws on it and the gesture never starts.
import { test, expect, type CDPSession, type Page } from '@playwright/test';
import { bootIntoTrip, shortLiveTripDates, todayAt } from './boot';
import { dispatchTouch } from './touch';
import { SWIPE_PAGER } from '../src/constants';
import { t } from '../src/i18n/he';

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

const DAY = 86_400_000;
const NOW = todayAt('10:00');
const RANGE = shortLiveTripDates(NOW);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const TODAY = iso(NOW);
const TOMORROW = iso(NOW + DAY);
const YESTERDAY = iso(NOW - DAY);

const stamps = {
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  updatedBy: 'u1',
};

/** A tall-enough day, so the vertical case below has something to scroll and the swipe has
 *  a surface to land on well away from any edge. Trip timezone is UTC. */
const EVENTS = Array.from({ length: 8 }, (_, i) => ({
  id: `ev-${i}`,
  tripId: 't1',
  date: TODAY,
  title: `יעד ${i}`,
  kind: 'soft',
  status: 'planned',
  sortOrder: i,
  source: 'manual',
  startsAt: `${TODAY}T${String(11 + i).padStart(2, '0')}:00:00.000Z`,
  endsAt: `${TODAY}T${String(11 + i).padStart(2, '0')}:40:00.000Z`,
  ...stamps,
}));

/** **One event that exists only tomorrow**, so "the peek shows the NEXT day" is a statement
 *  about content and not about a heading that happens to differ. */
const TOMORROW_ONLY = 'מחר ייחודי';
const TOMORROW_EVENT = {
  id: 'ev-tomorrow',
  tripId: 't1',
  date: TOMORROW,
  title: TOMORROW_ONLY,
  kind: 'soft',
  status: 'planned',
  sortOrder: 0,
  source: 'manual',
  startsAt: `${TOMORROW}T09:00:00.000Z`,
  endsAt: `${TOMORROW}T09:40:00.000Z`,
  ...stamps,
};

/** Enough ideas that the shelf really overflows its strip — the whole point of the strip
 *  case is that `scrollsOn` answers yes about a box the browser actually laid out. */
const IDEAS = Array.from({ length: 10 }, (_, i) => ({
  id: `mb-${i}`,
  tripId: 't1',
  title: `רעיון ארוך למדי ${i}`,
  icon: '📍',
  consumed: false,
  createdBy: 'u1',
  ...stamps,
}));

const touch = (
  cdp: CDPSession,
  type: 'touchStart' | 'touchMove' | 'touchEnd',
  x = 0,
  y = 0,
  timestamp?: number,
) => dispatchTouch(cdp, type, [{ x, y }], timestamp);

/** The page's clock, so a gesture can state when each of its moves happened rather than
 *  inheriting the CDP connection's round-trip time as its speed (`e2e/touch.ts`). */
async function clockBase(page: Page) {
  const [origin, now] = await page.evaluate(() => [performance.timeOrigin, performance.now()]);
  return (ms: number) => (origin + now + ms) / 1000;
}

/** The `?day=` on screen. Omitted entirely when the day IS today (`daySelectTarget`), so the
 *  absence is a value and not a missing assertion. */
const dayParam = (page: Page) => new URL(page.url()).searchParams.get('day');

/** **The day you are ON.** While a gesture is live a peek holds a whole day surface, so
 *  `.day-swipe`, `.day-page` and every row class exist three times over — a bare selector
 *  returns whichever pane the DOM lists first, which is a real trap and not a style point. */
const PAGE = '.day-swipe:not([data-preview])';

/** Boxes read off the live page, rounded — the geometry the peek's whole claim rests on. */
async function boxes(page: Page) {
  return page.evaluate((pageSel) => {
    const r = (el: Element | null) =>
      el
        ? (({ left, top, width, right, bottom }) => ({
            left: Math.round(left),
            top: Math.round(top),
            width: Math.round(width),
            right: Math.round(right),
            bottom: Math.round(bottom),
          }))(el.getBoundingClientRect())
        : null;
    const next = document.querySelector('.day-peek[data-day="next"]');
    return {
      gap:
        parseFloat(
          getComputedStyle(document.querySelector(pageSel)!).getPropertyValue('--swipe-page-gap'),
        ) || 0,
      win: r(document.querySelector('.day-peeks')),
      next: r(next),
      prev: r(document.querySelector('.day-peek[data-day="prev"]')),
      page: r(document.querySelector(`${pageSel} > .day-page`)),
      body: r(document.querySelector('main.body')),
      /** A pane's OWN inner page, which must sit flush with its pane and not be shifted a
       *  second time by the offset the pane is already carrying. */
      nextInner: r(next?.querySelector('.day-page') ?? null),
      nextText: next?.textContent ?? '',
    };
  }, PAGE);
}

const bodyScroll = (page: Page) =>
  page.evaluate(() => document.querySelector('main.body')!.scrollTop);

/** One observation of the surface mid-swap: is the page back at level, is the day it draws the
 *  one we swiped to, and is the body still scrolled where the last day was. */
interface SwapState {
  level: boolean;
  arrived: boolean;
  scrolled: boolean;
}

/**
 * Log every DOM state the host passes through from here on, one entry per mutation batch.
 *
 * Call it with the finger still down: the resting state is `level && !arrived` too, which is
 * legitimate BEFORE a gesture and is exactly the defect after one, so the log has to start
 * inside the gesture for the combination to mean anything.
 */
async function watchSwap(page: Page) {
  await page.evaluate(
    ([sel, marker]) => {
      const host = document.querySelector(sel)!;
      const body = document.querySelector('main.body')!;
      const seen: SwapState[] = [];
      (window as unknown as { __swap: SwapState[] }).__swap = seen;
      const look = () => {
        // The host's OWN page, re-queried each time: `host.textContent` includes the peek panes,
        // which are drawing tomorrow on purpose, and would report the arrival early.
        const el = host.querySelector(':scope > .day-page');
        if (!el) return;
        // The RENDERED transform rather than the variable: `--swipe-dx` is removed by the reset,
        // and a page at level looks the same either way. This is the visible fact.
        const tx = getComputedStyle(el).transform;
        seen.push({
          level: tx === 'none' || Math.abs(new DOMMatrixReadOnly(tx).m41) < 1,
          arrived: (el.textContent ?? '').includes(marker),
          scrolled: body.scrollTop > 0,
        });
      };
      new MutationObserver(look).observe(host, {
        attributes: true,
        childList: true,
        subtree: true,
        characterData: true,
      });
    },
    [PAGE, TOMORROW_ONLY] as const,
  );
}

const swapLog = (page: Page): Promise<SwapState[]> =>
  page.evaluate(() => (window as unknown as { __swap: SwapState[] }).__swap);

async function boot(page: Page, mode: 'trip' | 'plan') {
  await bootIntoTrip(page, {
    events: [...EVENTS, TOMORROW_EVENT],
    maybeItems: IDEAS,
    now: NOW,
    dates: RANGE,
  });
  await page.goto('/');
  await expect(page.locator('nav.nav')).toBeVisible();
  if (mode === 'plan') {
    await page.getByRole('button', { name: t.mode.plan, exact: true }).click();
    await expect(page.locator('.app')).toHaveAttribute('data-mode', 'plan');
  }
  await page.locator('nav.nav button', { hasText: t.tabs.days }).click();
  await expect(page.locator(PAGE)).toBeVisible({ timeout: 20_000 });
}

/**
 * One swipe across the day surface, in steps so the browser sees a real gesture rather than a
 * teleport. `dx` is signed in screen px: positive is rightward, which in this RTL app is the
 * NEXT day.
 *
 * `holdAtEnd` stops before lifting, which is the only way to observe the follow — after the
 * release the surface is already on its way back to level.
 */
async function swipeDay(
  page: Page,
  cdp: CDPSession,
  dx: number,
  {
    dy = 0,
    holdAtEnd = false,
    from = 'heading',
    pace,
  }: {
    dy?: number;
    holdAtEnd?: boolean;
    from?: 'heading' | 'upper';
    /** Ms between moves, stated rather than measured — this is the gesture's SPEED, and speed
     *  decides a flick (§9). Left out, the moves carry the real clock, which is what every
     *  case that is about distance wants. */
    pace?: number;
  } = {},
) {
  const at = pace === undefined ? null : await clockBase(page);
  const stamp = (i: number) => (at ? at(i * pace!) : undefined);
  // `upper` is for a day that has been SCROLLED: the heading is then off the top of the
  // viewport, and a touch dispatched at an off-screen coordinate lands on nothing at all —
  // which presents as "the swipe did not commit" and says nothing about the swipe. The body's
  // upper third is day rows at any offset, and is never the shelf at the tail.
  if (from === 'upper') {
    const strip = (await page.locator('main.body').boundingBox())!;
    const ux = strip.x + strip.width * 0.45;
    const uy = strip.y + strip.height * 0.25;
    await touch(cdp, 'touchStart', ux, uy, stamp(0));
    for (let i = 1; i <= 8; i++) {
      await touch(cdp, 'touchMove', ux + (dx * i) / 8, uy + (dy * i) / 8, stamp(i));
    }
    if (!holdAtEnd) await touch(cdp, 'touchEnd', ux + dx, uy + dy, stamp(8));
    return { x: ux + dx, y: uy + dy };
  }
  // **The origin is the day's heading row, not a share of the surface's height.** A share
  // lands wherever the day happens to be tall — on a loaded day that is the maybe shelf,
  // which owns the horizontal axis and correctly refuses the gesture, so the spec would be
  // measuring the wrong thing while looking green on one fixture. The heading is the first
  // row of both day surfaces and exists on an empty day too, which the last-day case needs.
  const box = await page.locator(`${PAGE} .sec-title`).first().boundingBox();
  if (!box) throw new Error('no day heading to swipe from');
  const x0 = box.x + box.width * 0.45;
  const y0 = box.y + box.height / 2;
  await touch(cdp, 'touchStart', x0, y0, stamp(0));
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    await touch(cdp, 'touchMove', x0 + (dx * i) / steps, y0 + (dy * i) / steps, stamp(i));
  }
  if (holdAtEnd) return { x: x0 + dx, y: y0 + dy };
  await touch(cdp, 'touchEnd', x0 + dx, y0 + dy, stamp(steps));
  return { x: x0 + dx, y: y0 + dy };
}

/** Comfortably past `COMMIT_SHARE` of the 390px column (the surface is narrower than the
 *  viewport by the body's padding, so this over-shoots on purpose rather than measuring). */
const COMMIT_PX = Math.ceil(390 * SWIPE_PAGER.COMMIT_SHARE) + 40;

test.describe('a day surface steps day to day with a swipe', () => {
  test('rightward is the next day and leftward is the previous one (Trip mode)', async ({
    page,
  }) => {
    const cdp = await page.context().newCDPSession(page);
    await boot(page, 'trip');
    expect(dayParam(page)).toBeNull(); // today

    await swipeDay(page, cdp, COMMIT_PX);
    await expect.poll(() => dayParam(page)).toBe(TOMORROW);

    await swipeDay(page, cdp, -COMMIT_PX);
    await expect.poll(() => dayParam(page)).toBeNull();

    await swipeDay(page, cdp, -COMMIT_PX);
    await expect.poll(() => dayParam(page)).toBe(YESTERDAY);
  });

  test('the Plan builder steps the same way — one hook, two surfaces', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await boot(page, 'plan');
    expect(dayParam(page)).toBeNull();

    await swipeDay(page, cdp, COMMIT_PX);
    await expect.poll(() => dayParam(page)).toBe(TOMORROW);
  });

  // THE REBUFF, on the surface rather than in the state: at the trip's last day the swipe
  // still moves something, capped, and then comes back with the day unchanged. Asserting only
  // "the day did not change" would pass just as well for a dead surface.
  test('the last day refuses the next one by straining and settling back', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await boot(page, 'trip');
    await page.goto(`/?tab=days&day=${RANGE.endDate}`);
    await expect(page.locator(PAGE)).toBeVisible();

    await swipeDay(page, cdp, COMMIT_PX, { holdAtEnd: true });
    const surface = page.locator(PAGE);
    await expect(surface).toHaveAttribute('data-swiping', '');
    const strained = await surface.evaluate((el) =>
      parseFloat(getComputedStyle(el).getPropertyValue('--swipe-dx')),
    );
    expect(strained).toBeGreaterThan(0);
    expect(strained).toBeLessThanOrEqual(SWIPE_PAGER.EDGE_MAX_PX);

    await touch(cdp, 'touchEnd');
    expect(dayParam(page)).toBe(RANGE.endDate);
    await expect(surface).not.toHaveAttribute('data-swiping', '');
  });

  // The arbitration the host declares no `touch-action` for. A vertical drag is the body's
  // scroll and must not also page the day.
  test('a vertical drag scrolls the day instead of stepping it', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await boot(page, 'trip');

    const before = await page.evaluate(() => document.querySelector('main.body')!.scrollTop);
    await swipeDay(page, cdp, 0, { dy: -260 });
    await expect
      .poll(() => page.evaluate(() => document.querySelector('main.body')!.scrollTop))
      .toBeGreaterThan(before);
    expect(dayParam(page)).toBeNull();
  });

  // ── THE PEEK (§7) ─────────────────────────────────────────────────────────────────────
  //
  // "It should feel continuous" is a claim about geometry, so it is asserted as geometry: the
  // pages are one gutter apart, at every offset. A sign error, a wrong width, a percentage
  // resolved against the viewport instead of the column, or a commit that travels a page
  // without its gutter all show up here — and in none of them would a day look wrong on its
  // own. The gutter is READ from the stylesheet rather than repeated here, so moving
  // `--swipe-page-gap` cannot leave this spec asserting the old spacing.
  test('the neighbouring days ride the gesture, one gutter from the page', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await boot(page, 'trip');

    // Nothing is mounted until a gesture is claimed — two extra day surfaces are not a resting
    // cost, and asserting the absence is what keeps that true.
    expect(await page.locator('.day-peek').count()).toBe(0);

    await swipeDay(page, cdp, 120, { holdAtEnd: true });
    const b = await boxes(page);

    // The strip: [next] gutter [page] gutter [prev], one offset.
    expect(b.gap).toBeGreaterThan(0);
    expect(b.page!.left - b.next!.right).toBe(b.gap);
    expect(b.prev!.left - b.page!.right).toBe(b.gap);
    expect(b.next!.width).toBe(b.page!.width);

    // The pane's own inner page sits flush with its pane. It does NOT, if the transform is
    // written as a descendant selector — a peek holds a `.day-page` of its own, so it gets the
    // offset twice and its content slides out from under its own frame. Measured, not reasoned:
    // that is exactly what the first render of this feature did.
    expect(b.nextInner!.left).toBe(b.next!.left);

    // And it is the NEXT day, by content rather than by a heading that merely differs.
    expect(b.nextText).toContain(TOMORROW_ONLY);
    await expect(page.locator(`${PAGE} > .day-page`)).not.toContainText(TOMORROW_ONLY);

    await touch(cdp, 'touchEnd');
    await expect.poll(() => page.locator('.day-peek').count()).toBe(0);
  });

  // A fixed layer inside the body has to be told where the body is, or it paints over the
  // header and the tab bar — the one failure mode that would look fine in a screenshot taken
  // mid-gesture on a short day.
  test('the peek window is bounded to the body, never over the chrome', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await boot(page, 'trip');
    await swipeDay(page, cdp, 120, { holdAtEnd: true });
    const b = await boxes(page);
    expect(b.win!.top).toBeGreaterThanOrEqual(b.body!.top);
    expect(b.win!.bottom).toBeLessThanOrEqual(b.body!.bottom);
    expect(b.win!.left).toBeGreaterThanOrEqual(b.body!.left);
    expect(b.win!.right).toBeLessThanOrEqual(b.body!.right);
    await touch(cdp, 'touchEnd');
  });

  test('the Plan builder previews its neighbours too — one hook, two surfaces', async ({
    page,
  }) => {
    const cdp = await page.context().newCDPSession(page);
    await boot(page, 'plan');
    await swipeDay(page, cdp, 120, { holdAtEnd: true });
    const b = await boxes(page);
    expect(b.page!.left - b.next!.right).toBe(b.gap);
    expect(b.nextText).toContain(TOMORROW_ONLY);
    await touch(cdp, 'touchEnd');
  });

  // **The turn travels a page PLUS the gutter**, which is the one number that cannot be
  // checked mid-gesture: it decides where the arriving pane comes to REST. A commit that
  // travelled only a page would leave the new day sitting a gutter off level for the length of
  // the animation and then snap — and every mid-gesture assertion above would still pass. It
  // was wrong exactly this way once, caught by an unused-variable warning rather than by a
  // test, which is why the assertion exists.
  test('the turn travels a page and its gutter, so the new day lands level', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await boot(page, 'trip');
    await swipeDay(page, cdp, COMMIT_PX, { holdAtEnd: true });
    const b = await boxes(page);
    await touch(cdp, 'touchEnd');

    // Read the offset the settle aims at, on the frame the release sets it.
    const aim = await page.evaluate(
      (sel) =>
        parseFloat(
          (document.querySelector(sel) as HTMLElement).style.getPropertyValue('--swipe-dx'),
        ),
      PAGE,
    );
    expect(aim).toBe(b.page!.width + b.gap);
  });

  // ── A DAY OPENS AT ITS TOP (§6) ───────────────────────────────────────────────────────
  //
  // Owner: _"if you're at the end of the day, swiping keeps you on the bottom. It should be on
  // the top of the day"_ — and then _"this should be true for the day strip as well"_, which is
  // why both triggers are asserted. One action, two ways in; a fix that covered only the
  // gesture would be the divergence `frontend/CLAUDE.md` warns about, one layer out.
  test('a swipe from the bottom of a day lands at the top of the next one', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await boot(page, 'trip');
    await page.evaluate(() => {
      const body = document.querySelector('main.body')!;
      body.scrollTop = body.scrollHeight;
    });
    await expect.poll(() => bodyScroll(page)).toBeGreaterThan(0);

    await swipeDay(page, cdp, COMMIT_PX, { from: 'upper' });
    await expect.poll(() => dayParam(page)).toBe(TOMORROW);
    await expect.poll(() => bodyScroll(page)).toBe(0);
  });

  test('and so does a day picked from the header strip', async ({ page }) => {
    await boot(page, 'trip');
    await page.evaluate(() => {
      const body = document.querySelector('main.body')!;
      body.scrollTop = body.scrollHeight;
    });
    await expect.poll(() => bodyScroll(page)).toBeGreaterThan(0);

    // The pill for the day after tomorrow — a day away from both today and the one a swipe
    // would reach, so this cannot pass on the swipe's behaviour. Found by the number it shows
    // (the pill carries no date attribute, and adding one just for this would be a test seam
    // in shipped markup); matched exactly, so `2` cannot select `22`.
    const target = iso(NOW + 2 * DAY);
    const dayOfMonth = target.slice(8).replace(/^0/, '');
    await page
      .locator('.wp-daystrip button')
      .filter({ has: page.locator('.n', { hasText: new RegExp(`^${dayOfMonth}$`) }) })
      .first()
      .click();
    await expect.poll(() => dayParam(page)).toBe(target);
    await expect.poll(() => bodyScroll(page)).toBe(0);
  });

  // ── THE SWAP IS ONE PAINT (§8) ────────────────────────────────────────────────────────
  //
  // Owner, 2026-08-22: _"after you swipe to the next/last day, there's like a stutter where you
  // briefly (for a really short time, like a few ms) see the last day"_.
  //
  // **Asserted as an ordering, not as a frame.** The tempting probe is a `requestAnimationFrame`
  // sampler hunting the flash, and it would be the fourth spec in the class `docs/backlog.md`
  // already names — a timing read competing with the machine that runs it. What actually has to
  // hold is an order the DOM can be asked about, and a browser cannot paint in the middle of a
  // task: if the reset and the new day arrive in ONE mutation batch, no frame can exist between
  // them; if they arrive in two, the first one IS the stutter, at whatever length the machine
  // gives it. So the log below is a list of DOM states, and the assertion is that a forbidden
  // combination never appears in it — no tolerance, no sampling rate, nothing to tune.
  test('the day you left is never drawn at level again (Trip mode)', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await boot(page, 'trip');
    await swipeDay(page, cdp, COMMIT_PX, { holdAtEnd: true });
    await watchSwap(page);

    await touch(cdp, 'touchEnd');
    await expect.poll(() => dayParam(page)).toBe(TOMORROW);

    const seen = await swapLog(page);
    // The gesture really was observed — an empty log would pass the assertion below vacuously,
    // which is the one way this test could report green while seeing nothing at all.
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.filter((s) => s.level && !s.arrived)).toEqual([]);
  });

  // The other half of the same swap: the day that arrives used to be drawn at the scroll offset
  // the day you LEFT was reading at, and only then jump to its top — the same stutter on the
  // other axis, and invisible to the `bodyScroll` assertion above, which polls until it settles
  // at 0 and so cannot see what it passed through.
  //
  // **What this does and does not pin, measured rather than assumed.** It goes red on the
  // unfixed surface and green on the fixed one. But re-run with §6's landing put back to an
  // ordinary effect and it still passes — React flushes that effect before the observer's own
  // microtask, so at this resolution the two phases are indistinguishable. The landing is a
  // LAYOUT effect because a scroll write is geometry and belongs in the commit that changed the
  // day, not because this spec can tell: relying on a passive effect landing before the paint
  // is the same kind of incidental timing the bug above was made of.
  test('and it never arrives at the scroll offset of the day you left', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await boot(page, 'trip');
    await page.evaluate(() => {
      const body = document.querySelector('main.body')!;
      body.scrollTop = body.scrollHeight;
    });
    await expect.poll(() => bodyScroll(page)).toBeGreaterThan(0);

    await swipeDay(page, cdp, COMMIT_PX, { holdAtEnd: true, from: 'upper' });
    await watchSwap(page);

    await touch(cdp, 'touchEnd');
    await expect.poll(() => dayParam(page)).toBe(TOMORROW);

    const seen = await swapLog(page);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.filter((s) => s.arrived && s.scrolled)).toEqual([]);
    expect(seen.filter((s) => s.level && !s.arrived)).toEqual([]);
  });

  test('the Plan builder swaps in one paint too — one hook, two surfaces', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await boot(page, 'plan');
    await swipeDay(page, cdp, COMMIT_PX, { holdAtEnd: true });
    await watchSwap(page);

    await touch(cdp, 'touchEnd');
    await expect.poll(() => dayParam(page)).toBe(TOMORROW);

    const seen = await swapLog(page);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.filter((s) => s.level && !s.arrived)).toEqual([]);
  });

  // ── THE FEEL (§9) ─────────────────────────────────────────────────────────────────────
  //
  // Two owner reports on the shipped gesture: _"it doesn't feel smooth enough"_ and _"quick
  // swipes don't always register."_ Both are answerable in an engine, and neither is a frame
  // sample — one is the geometry of the first few moves, the other is a stated velocity.

  // **The surface leaves level at zero and then tracks the finger.** Measured before the fix,
  // in this browser: `finger+4 → 0, +8 → 0, +12 → 0, +16 → 0, +20 → 0, +24 → 24`. Twenty px of
  // a surface that had already stopped scrolling (the axis is taken at `DECIDE_PX`) and had not
  // started moving, then a 24px jump on one frame — at the start of every swipe.
  test('the page leaves level at zero and tracks the finger from there', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await boot(page, 'trip');
    const box = (await page.locator(`${PAGE} .sec-title`).first().boundingBox())!;
    const x0 = box.x + box.width * 0.45;
    const y0 = box.y + box.height / 2;

    const tx = () =>
      page.evaluate((sel) => {
        const el = document.querySelector(`${sel} > .day-page`);
        const t = el ? getComputedStyle(el).transform : 'none';
        return t === 'none' ? 0 : Math.round(new DOMMatrixReadOnly(t).m41);
      }, PAGE);

    await touch(cdp, 'touchStart', x0, y0);
    const trail: number[] = [];
    for (let i = 1; i <= 10; i++) {
      await touch(cdp, 'touchMove', x0 + i * 6, y0);
      trail.push(await tx());
    }
    await touch(cdp, 'touchEnd');

    // No frame of the follow may be a jump: the biggest single step the page takes is the
    // biggest step the FINGER took, and nothing bigger. A lurch is exactly a step the finger
    // did not make, so this one assertion covers the dead zone and the jump at once.
    const steps = trail.slice(1).map((v, i) => v - trail[i]);
    expect(Math.max(...steps.map(Math.abs))).toBeLessThanOrEqual(6);
    // And it does move — an inert surface would satisfy the line above perfectly.
    expect(trail[trail.length - 1]).toBeGreaterThan(6 * 5);
  });

  // **A deliberate drag under the commit distance still refuses**, at a stated 0.075px/ms —
  // which is what keeps the flick from swallowing the distance rule whole. Stating the pace is
  // safe in this direction and only this one: a loaded machine delivers moves further apart,
  // i.e. slower, i.e. refusing harder.
  //
  // Its opposite number — a flick committing UNDER that distance — is deliberately not here.
  // Input arrives frame-aligned (`e2e/touch.ts`), so a gesture short enough that distance
  // cannot commit it cannot also be thrown fast enough to clear `SNAP_FLICK_PX_PER_MS` in this
  // environment: measured at 33–83ms between delivered moves, the two conditions have no
  // overlap. The flick is pinned in `src/lib/useSwipePager.test.tsx` instead, where the clock
  // belongs to the test. A phone is not the constraint here — a real finger moves 20–60px per
  // 8–16ms frame, and this is the same threshold and sampling the sheet's drag has been using
  // on the owner's own device since ADR-0122 §4.
  test('a short drag that is not thrown does not step the day', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await boot(page, 'trip');
    await swipeDay(page, cdp, Math.floor(COMMIT_PX * 0.6), { pace: 100 });
    await expect(page.locator(PAGE)).not.toHaveAttribute('data-swiping', '');
    expect(dayParam(page)).toBeNull();
  });

  // And the strip keeps its own axis, which is what `scrollerWithin` is there for.
  test('a swipe across the maybe shelf scrolls the shelf, not the day', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await boot(page, 'trip');
    const shelf = page.locator('.shelf').first();
    await shelf.scrollIntoViewIfNeeded();
    await expect(shelf).toBeVisible();
    const box = await shelf.boundingBox();
    if (!box) throw new Error('no shelf');

    const x0 = box.x + box.width * 0.7;
    const y0 = box.y + box.height / 2;
    await touch(cdp, 'touchStart', x0, y0);
    for (let i = 1; i <= 8; i++) await touch(cdp, 'touchMove', x0 - (140 * i) / 8, y0);
    await touch(cdp, 'touchEnd');

    expect(dayParam(page)).toBeNull();
    // Polled, not read once: the strip is `scroll-snap-type: x mandatory`, so a released
    // drag is still animating to its snap point for a frame or two. Reading immediately
    // caught a 0 under a loaded machine and said the shelf had not moved.
    await expect.poll(() => shelf.evaluate((el) => Math.abs(el.scrollLeft))).toBeGreaterThan(0);
  });
});

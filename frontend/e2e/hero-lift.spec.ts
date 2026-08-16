// **THE HERO LIFTS OFF THE BOARD IT WAS PRESSED ON** (ADR-0160 §5/§7) — in a real
// browser, which is the only place any of this is true or false.
//
// Every claim the lift makes is a claim about geometry, and the unit suite cannot see
// one of them: jsdom reports every rect as zero, so `lib/useLiftFlight.test.tsx` can only
// check which boxes the code aimed at, never whether those boxes are where the hero
// actually is. `frontend/CLAUDE.md` records three shipped bugs from a landing position
// written as a constant instead of measured; this is the assertion that class of defect
// cannot survive.
//
// The specific defect that motivated the spec was reported from a phone in one sentence:
// _"now it became a simple overlay rendering the hero twice instead of lifting up"_. Two
// boards on screen at once — so the first test here is a count, not a measurement.
import { test, expect, type Page } from '@playwright/test';
import { bootIntoTrip, shortLiveTripDates, todayAt, TRIP_ID } from './boot';

const PHONE = { width: 390, height: 844 };
const NOW = () => todayAt('15:00');
const today = () => new Date().toISOString().slice(0, 10);

const stamps = {
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  updatedBy: 'u1',
};

/** A now event with a PLACE, which is what makes the horizon worth lifting (`canLift`). */
const lunch = {
  id: 'ev-lunch',
  tripId: TRIP_ID,
  date: today(),
  title: 'ראמן בשוק',
  icon: '🍜',
  category: 'food',
  kind: 'soft',
  status: 'planned',
  startsAt: `${today()}T14:30:00.000Z`,
  endsAt: `${today()}T16:00:00.000Z`,
  placeId: 'pl-market',
  sortOrder: 0,
  source: 'manual',
  ...stamps,
};

const market = {
  id: 'pl-market',
  tripId: TRIP_ID,
  name: 'Mercato di Porta Nolana',
  lat: 40.85,
  lng: 14.27,
  source: 'manual',
  ...stamps,
};

const BOARD = '.wp-board.is-tappable';
const HERO = '.hero-lifted';

async function boot(page: Page, opts: { reducedMotion?: boolean } = {}) {
  if (opts.reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize(PHONE);
  await bootIntoTrip(page, {
    events: [lunch],
    places: [market],
    now: NOW(),
    dates: shortLiveTripDates(),
  });
  await page.goto('/');
  await expect(page.locator(BOARD)).toBeVisible();
}

/**
 * Press the board and sample the hero's real box, frame by frame, from the FIRST frame.
 *
 * The click is dispatched inside the page rather than through Playwright so that React's
 * render and the flight's layout effect have both run by the time the first
 * `requestAnimationFrame` fires — driven from outside, several frames of a 240ms tween are
 * gone before the first sample lands.
 *
 * **Deliberately not `effect.getKeyframes()`**, which is how the trip-handoff spec reads
 * its aim, and which was tried here first. Measured: it reads back `left: 35.1875px,
 * top: 422px` for keyframes that were passed `left: 9px, top: 273.5px` — the element's own
 * resolved offsets, because the lift card's `left`/`top` are `auto` in CSS and nothing but
 * the animation ever supplies them. That spec's clone is `position: fixed` with real
 * offsets, so its readback is honest and this one would not be. Observed geometry answers
 * the question either way, and answers it about what the user sees.
 */
async function flightFrames(page: Page, count = 24) {
  return page.evaluate(async (n) => {
    const board = document.querySelector('.wp-board.is-tappable') as HTMLElement;
    const r = board.getBoundingClientRect();
    const boardBox = { left: r.left, top: r.top, width: r.width, height: r.height };
    board.click();
    const frames: {
      left: number;
      top: number;
      width: number;
      height: number;
      inFlight: boolean;
    }[] = [];
    for (let i = 0; i < n; i++) {
      await new Promise((res) => requestAnimationFrame(() => res(null)));
      const hero = document.querySelector('.hero-lifted') as HTMLElement | null;
      if (!hero) continue;
      const b = hero.getBoundingClientRect();
      // `inFlight` is what makes the far-end assertion mean anything: the borrowed
      // `position: fixed` is the flight's own footprint, so frames carrying it are the
      // animation's and frames without it are CSS's.
      frames.push({
        left: b.left,
        top: b.top,
        width: b.width,
        height: b.height,
        inFlight: hero.style.position === 'fixed',
      });
    }
    return { boardBox, frames };
  }, count);
}

const box = async (page: Page, sel: string) => {
  const b = await page.locator(sel).boundingBox();
  if (!b) throw new Error(`${sel} has no box`);
  return b;
};

test.describe('the lifted hero (ADR-0160)', () => {
  // The reported defect, as a count. The collapsed board and the lifted hero are the SAME
  // object one elevation up (§1), so both being visible is the overlay grammar the
  // promotion exists to reject.
  test('only one board is on screen at a time', async ({ page }) => {
    await boot(page);
    await expect(page.locator('.wp-board:visible')).toHaveCount(1);
    await page.locator(BOARD).click();
    await expect(page.locator(HERO)).toBeAttached();
    await expect(page.locator('.wp-board:visible')).toHaveCount(1);
    // …and it is the LIFTED one that is visible, with the collapsed one hidden in place.
    expect(await page.locator(BOARD).evaluate((el) => getComputedStyle(el).visibility)).toBe(
      'hidden',
    );
  });

  // `visibility`, never `display`. The board has to keep its box for two independent
  // reasons: the descent measures it, and Home's layout must not collapse under the hero.
  test('the collapsed board keeps its box while hidden', async ({ page }) => {
    await boot(page);
    // The board carries its own arrival animation on trip entry; measured under it, the box
    // reads a few px from where it settles.
    await page
      .locator(BOARD)
      .evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished.catch(() => {}))));
    const before = await box(page, BOARD);
    await page.locator(BOARD).click();
    await expect(page.locator(HERO)).toBeAttached();
    const during = await page.locator(BOARD).evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    });
    expect(Math.abs(during.y - before.y)).toBeLessThan(1);
    expect(Math.abs(during.height - before.height)).toBeLessThan(1);
    expect(during.height).toBeGreaterThan(0);
  });

  // THE ASSERTION THE BUILD PLAN ASKS FOR: the hero leaves the board's own measured box and
  // arrives at its own settled one, with both ends measured independently of the animation
  // that connects them. A landing position written as a constant instead of measured is the
  // defect this codebase has shipped three times in other costumes.
  test('the flight leaves the board box and lands on the settled box', async ({ page }) => {
    await boot(page);
    const { boardBox, frames } = await flightFrames(page);
    expect(frames.length).toBeGreaterThan(4);

    // Frame one is the board, give or take one frame of progress.
    expect(Math.abs(frames[0].top - boardBox.top)).toBeLessThan(40);
    expect(Math.abs(frames[0].left - boardBox.left)).toBeLessThan(14);
    expect(Math.abs(frames[0].height - boardBox.height)).toBeLessThan(40);

    // …and the far end is where CSS alone puts the hero. The comparison has to be against
    // the last frame the FLIGHT drew, not the last frame sampled: once the flight releases
    // its borrowed `position`, the hero snaps to the CSS box whatever the animation was
    // aiming at — so a version of this test that read the final sample passed happily with
    // the landing box hardcoded to the wrong rect. Verified by doing exactly that.
    await expect
      .poll(() => page.locator(HERO).evaluate((el) => (el as HTMLElement).style.position), {
        timeout: 5000,
      })
      .toBe('');
    const settled = await box(page, HERO);
    const flown = frames.filter((f) => f.inFlight);
    expect(flown.length).toBeGreaterThan(4);
    const last = flown[flown.length - 1];
    expect(Math.abs(last.top - settled.y)).toBeLessThan(2);
    expect(Math.abs(last.left - settled.x)).toBeLessThan(2);
    expect(Math.abs(last.width - settled.width)).toBeLessThan(2);
    expect(Math.abs(last.height - settled.height)).toBeLessThan(2);
    // And the release is not a jump: the first frame after it is the same box.
    const released = frames.find((f) => !f.inFlight);
    if (released) {
      expect(Math.abs(released.top - last.top)).toBeLessThan(2);
      expect(Math.abs(released.height - last.height)).toBeLessThan(2);
    }
    // The flight went somewhere, rather than both ends being the same box.
    expect(settled.height).toBeGreaterThan(boardBox.height + 20);
  });

  // §5 measured the whole visible budget as HEIGHT, and `height` does not interpolate to
  // `auto` — it reports the start, then the end, with nothing between. That property is the
  // only reason the FLIP measures twice, so it gets its own guard.
  test('the height genuinely interpolates rather than snapping', async ({ page }) => {
    await boot(page);
    const { boardBox, frames } = await flightFrames(page);
    const settled = await box(page, HERO);
    const between = frames.filter(
      (f) => f.height > boardBox.height + 2 && f.height < settled.height - 2,
    );
    expect(between.length).toBeGreaterThan(2);
  });

  // §5's character is the swing, and §5 also says all three candidates animate the BOX so
  // text is crisp at both ends. A scale in the transform is the rejected option (b), which
  // would resample the text for the whole tween.
  test('the swing is a 3D rotation and nothing scales', async ({ page }) => {
    await boot(page);
    await page.locator(BOARD).click();
    const transforms = await page.evaluate(async () => {
      const hero = document.querySelector('.hero-lifted')!;
      const seen: string[] = [];
      for (let i = 0; i < 8; i++) {
        seen.push(getComputedStyle(hero).transform);
        await new Promise((r) => requestAnimationFrame(() => r(null)));
      }
      return seen;
    });
    // A rotateX resolves to a matrix3d whose [1][1] is cos(angle) — below 1 while the
    // angle is non-zero, and exactly 1 when it has straightened up.
    const cosines = transforms
      .filter((tr) => tr.startsWith('matrix3d'))
      .map((tr) => parseFloat(tr.slice(9).split(',')[5]));
    expect(cosines.length).toBeGreaterThan(0);
    expect(Math.min(...cosines)).toBeLessThan(1);
    // …and it ends at identity rather than leaving the hero tilted.
    await expect
      .poll(() => page.locator(HERO).evaluate((el) => getComputedStyle(el).transform), {
        timeout: 5000,
      })
      .toBe('none');
  });

  // §7: the object visibly touches down instead of the flight merely stopping — and the
  // beat has to survive React's reconcile of the same `className` it is written on.
  test('the board that comes back plays the landing beat', async ({ page }) => {
    await boot(page);
    await page.locator(BOARD).click();
    await expect(page.locator(HERO)).toBeAttached();
    await page.locator('.hero-x').click();

    const landing = await page.waitForFunction(
      () => {
        const el = document.querySelector('.wp-board.is-tappable');
        const beat = el?.getAnimations().find((a) => a.animationName === 'board-landing');
        if (!beat) return null;
        return {
          duration: beat.effect?.getTiming().duration,
          origin: getComputedStyle(el!).transformOrigin,
          height: el!.getBoundingClientRect().height,
        };
      },
      undefined,
      { timeout: 5000 },
    );
    const beat = await landing.jsonValue();
    // `--t-quick`, and the origin at the bottom edge: it is set DOWN, not squeezed.
    expect(beat.duration).toBe(140);
    expect(parseFloat(beat.origin.split(' ')[1])).toBeCloseTo(beat.height, 0);

    // The board is back, and the hero is gone rather than both lingering.
    await expect(page.locator(HERO)).toHaveCount(0);
    await expect(page.locator(BOARD)).toBeVisible();
  });

  test('back dismisses the hero as one layer', async ({ page }) => {
    await boot(page);
    await page.locator(BOARD).click();
    await expect(page.locator(HERO)).toBeAttached();
    await page.goBack();
    // The lift is a back layer and that is not negotiable (§2) — a back peels it and
    // leaves the trip rather than walking out of Home.
    await expect(page.locator(HERO)).toHaveCount(0);
    await expect(page.locator(BOARD)).toBeVisible();
  });

  // The card is a TRANSPARENT SHELL in this variant — the hero inside owns every visible
  // edge. Resetting only `border-radius` left the base rule's 1px `--line` border as a
  // square stroke boxing in the rounded hero, which is what it looked like on a phone. A
  // computed-style assertion, because that is the whole defect: no geometry moved.
  test('the modal card paints nothing around the hero', async ({ page }) => {
    await boot(page);
    await page.locator(BOARD).click();
    await expect(page.locator(HERO)).toBeAttached();
    const shell = await page.locator('.modal-card').evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        borderWidth: cs.borderTopWidth,
        background: cs.backgroundImage === 'none' ? cs.backgroundColor : cs.backgroundImage,
        boxShadow: cs.boxShadow,
        padding: cs.paddingTop,
      };
    });
    expect(shell.borderWidth).toBe('0px');
    expect(shell.background).toBe('rgba(0, 0, 0, 0)');
    expect(shell.boxShadow).toBe('none');
    expect(shell.padding).toBe('0px');
    // …while the hero itself keeps the board's own rounded edge.
    const radius = await page
      .locator(HERO)
      .evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius));
    expect(radius).toBeGreaterThan(8);
  });

  // **PLAN'S HERO LIFTS TOO NOW** (ADR-0193 §4), and this test replaces the one that
  // asserted the opposite. ADR-0160 §H had this hero answer a tap with a rebuff because it
  // opened nothing — its depth was the checklist rendered directly beneath it. §H also wrote
  // its own revisit condition ("when Plan's hero summarises something it does not show
  // inline"), and ADR-0193 §3 creates it by folding the far and undated tasks behind one
  // row. So the rebuff is retired from this surface and the press opens the run-up.
  //
  // In a browser for the reason §4 is in a browser at all: **the no-nested-control rule is
  // a claim about Chrome's PARSER**, and jsdom does not reproduce it. A `<button>` inside a
  // `<button>` is not merely invalid markup — Chrome closes the outer element at the nested
  // one and reparents every following sibling out of it, so the readiness bar and the task
  // readout would silently leave the hero while still existing on the page. A unit test
  // asserting "the pieces render" passes through that defect; only this can catch it.
  test('Plan mode: the prep hero lifts, and the parser leaves it intact', async ({ page }) => {
    // A task in the fixture on purpose, and not for the rows: it is what makes the hero
    // render its `.prep-tasks` readout, so the parser guard below has the FULL set of
    // children to prove it still owns. With no task the readout is correctly absent
    // (ADR-0045 — there is no "0 משימות פתוחות" state), and the guard would be weaker
    // against exactly the reparenting it exists to catch.
    await page.setViewportSize(PHONE);
    await bootIntoTrip(page, {
      events: [lunch],
      places: [market],
      now: NOW(),
      dates: shortLiveTripDates(),
      tasks: [
        {
          id: 'tk-plan',
          tripId: TRIP_ID,
          title: 'לקנות מתאם חשמל',
          status: 'open',
          dueHasTime: false,
          important: false,
          createdBy: 'u1',
          ...stamps,
        },
      ],
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'תכנון', exact: true }).click();
    await expect(page.locator('.app')).toHaveAttribute('data-mode', 'plan');
    // `.prep-dates`, not `.prep`. `PlanHome` is lazy-loaded and `HomeSkeleton` renders its
    // own placeholder `.prep` in the meantime — which has no handler, so a spec that clicks
    // the first `.prep` it sees clicks the skeleton. It cost a round of diagnosis once; the
    // real hero is the one with the trip's dates in it.
    // `.prep.is-tappable`, and the reason is the promotion itself: once lifted, the card is
    // ALSO a `.prep` with a `.prep-dates` in it — being the same object is the whole claim —
    // so a locator keyed on those two matches both elevations and trips strict mode. The
    // collapsed one is the one that is a control.
    const hero = page.locator('.prep.is-tappable');
    await expect(hero).toBeVisible();
    // Still guard against the lazy-loaded skeleton, which renders its own placeholder
    // `.prep` with no handler — a spec that clicks the first `.prep` it sees clicks that one.
    await expect(hero.locator('.prep-dates')).toBeVisible();

    // A control, because it now opens something.
    expect(await hero.evaluate((el) => el.tagName)).toBe('BUTTON');

    // THE PARSER GUARD (ADR-0160 §4). Both halves matter and the second is the one a
    // reasonable person forgets: the pieces DO still exist after a reparent — they are just
    // not inside the hero any more.
    const parsed = await hero.evaluate((el) => ({
      controls: el.querySelectorAll('button, a, input, select, textarea').length,
      ownsReadiness: !!el.querySelector('.prep-ready'),
      ownsDates: !!el.querySelector('.prep-dates'),
      ownsTasks: !!el.querySelector('.prep-tasks'),
    }));
    expect(parsed.controls).toBe(0);
    expect(parsed.ownsReadiness).toBe(true);
    expect(parsed.ownsDates).toBe(true);
    expect(parsed.ownsTasks).toBe(true);

    // …and the press opens the run-up, with the collapsed hero hidden behind it — the same
    // one-object-at-a-time rule the board's own first test asserts.
    await hero.click();
    const lifted = page.locator('.prep-lifted');
    await expect(lifted).toBeVisible();
    expect(await hero.evaluate((el) => getComputedStyle(el).visibility)).toBe('hidden');

    // The bands are a READ: nothing in them is pressable (ADR-0160 §U, ADR-0193 §4).
    expect(
      await lifted.evaluate(
        (el) => el.querySelector('.prep-lift-body')!.querySelectorAll('button, a, input').length,
      ),
    ).toBe(0);

    // A bounded card (ADR-0148 §1): it stops at the screen and its body absorbs the rest.
    const bounded = await lifted.evaluate((el) => ({
      cardH: el.getBoundingClientRect().height,
      viewportH: window.innerHeight,
    }));
    expect(bounded.cardH).toBeLessThanOrEqual(bounded.viewportH);

    // **EVERY INK IN THE CARD CLEARS AA, swept rather than listed** (ADR-0193 §5). The lifted
    // plan hero is a violet RAMP, so a rung tuned for the board does not survive it — and the
    // rungs are easy to leak in by omission rather than by choice: `.hero-task-more` shipped
    // at `--on-dark-faint` and measured 3.89:1, because the band labels that had carried the
    // override were deleted and took it with them. Listing rungs is how the next one is
    // missed, so this walks every text-bearing node, composites the ink over the gradient AT
    // THAT NODE'S OWN HEIGHT (the ground is position-dependent by design) and asserts the
    // floor. jsdom can compute none of this.
    const contrast = await lifted.evaluate((card) => {
      const rgb = (s: string) => (s.match(/[\d.]+/g) ?? ['0', '0', '0']).slice(0, 3).map(Number);
      const lum = (c: number[]) =>
        c
          .map((v) => v / 255)
          .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
          .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
      const over = (f: number[], b: number[], a: number) => f.map((v, i) => v * a + b[i] * (1 - a));
      const box = card.getBoundingClientRect();
      const stops = [
        ...getComputedStyle(card).backgroundImage.matchAll(
          /(rgba?\([^)]+\))(?:\s+([\d.]+)(px|%))?/g,
        ),
      ].map((m) => ({ c: rgb(m[1]), v: m[2] == null ? null : Number(m[2]), unit: m[3] }));
      if (stops[0].v == null) {
        stops[0].v = 0;
        stops[0].unit = 'px';
      }
      const last = stops[stops.length - 1];
      if (last.v == null) {
        last.v = 100;
        last.unit = '%';
      }
      const P = stops.map((s) => (s.unit === '%' ? (s.v! / 100) * box.height : s.v!));
      const groundAt = (y: number) => {
        for (let i = 1; i < stops.length; i++) {
          if (y > P[i]) continue;
          const t = P[i] === P[i - 1] ? 0 : (y - P[i - 1]) / (P[i] - P[i - 1]);
          return stops[i - 1].c.map((v, k) => v + (stops[i].c[k] - v) * t);
        }
        return stops[stops.length - 1].c;
      };
      const worst: { text: string; ratio: number }[] = [];
      card.querySelectorAll('*').forEach((el) => {
        // Only nodes that render text OF THEIR OWN — a wrapper inherits its children's ink
        // and would be measured at whatever box it happens to span.
        const own = [...el.childNodes].some(
          (n) => n.nodeType === 3 && (n.textContent ?? '').trim().length > 0,
        );
        if (!own) return;
        const r = el.getBoundingClientRect();
        if (r.height === 0) return;
        const g = groundAt(r.top + r.height / 2 - box.top);
        const m = getComputedStyle(el).color.match(/[\d.]+/g) ?? ['0', '0', '0'];
        const a = m.length > 3 ? Number(m[3]) : 1;
        const fg =
          a === 1 ? rgb(getComputedStyle(el).color) : over(rgb(getComputedStyle(el).color), g, a);
        const L1 = lum(fg);
        const L2 = lum(g);
        const ratio =
          Math.round(((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)) * 100) / 100;
        worst.push({ text: (el.textContent ?? '').trim().slice(0, 30), ratio });
      });
      return worst.sort((a, b) => a.ratio - b.ratio);
    });
    expect(contrast.length).toBeGreaterThan(3);
    expect(
      contrast[0],
      `worst ink in the lifted plan hero: ${JSON.stringify(contrast[0])}`,
    ).toHaveProperty('ratio');
    expect(contrast[0].ratio).toBeGreaterThanOrEqual(4.5);

    // It is a `Modal`, so back peels it — the contract ADR-0103/0090 give it no exemption from.
    await page.goBack();
    await expect(page.locator('.prep-lifted')).toHaveCount(0);
    await expect(hero).toBeVisible();
  });

  // **The same answer on the Trip board** (ADR-0160 §Q, reversing §A's silence): with nothing
  // to lift, a press is felt and opens nothing. It sits beside Plan's test on purpose — one
  // beat, two surfaces, and the pair is what proves the shared rule reaches both. The board
  // is the harder of the two: `.app[data-mode='trip'] .wp-board` already owns `animation` for
  // the Plan→Trip power-on and outranks a single class, so the beat rides a `--board-beat`
  // slot and only a real engine can say it fired.
  test('Trip mode: a board with nothing to lift rebuffs instead of opening', async ({ page }) => {
    // The same fixture as `boot`, minus the place — which is the entire difference between a
    // horizon worth lifting and one that adds nothing (`canLift`).
    await page.setViewportSize(PHONE);
    await bootIntoTrip(page, {
      events: [{ ...lunch, placeId: undefined }],
      now: NOW(),
      dates: shortLiveTripDates(),
    });
    await page.goto('/');
    const board = page.locator('.wp-board');
    await expect(board).toBeVisible();
    // Not a control, for the reason Plan's hero is not one: it opens nothing.
    expect(await board.evaluate((el) => el.tagName)).toBe('DIV');

    const beat = await page.evaluate(async () => {
      const el = document.querySelector('.wp-board') as HTMLElement;
      el.click();
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const running = el.getAnimations();
      return { names: running.map((a) => a.animationName), className: el.className };
    });
    // The power-on holds slot 0, so the assertion is that the beat is IN the list.
    expect(beat.names).toContain('wp-rebuff');
    expect(beat.className).toContain('is-rebuffing');
    // …and nothing lifted.
    await expect(page.locator(HERO)).toHaveCount(0);
  });

  // A user who asked for less motion did not ask for a different outcome: they get the
  // horizon, immediately, with no flight and no hero left mid-air.
  test('reduced motion: no flight, and the lifted state is still correct', async ({ page }) => {
    await boot(page, { reducedMotion: true });
    await page.locator(BOARD).click();
    await expect(page.locator(HERO)).toBeVisible();
    expect(
      await page.locator(HERO).evaluate((el) => ({
        position: el.style.position,
        animations: el.getAnimations().length,
      })),
    ).toEqual({ position: '', animations: 0 });
    // The content is there, which is the part that must never depend on the motion.
    await expect(page.locator(HERO)).toContainText('Mercato di Porta Nolana');
  });

  // ── משימה, the fourth content block (ADR-0160 §U) ─────────────────────────
  //
  // Two claims, and neither is checkable in jsdom: where the two blocks' text lines START,
  // and what colour the deadline actually paints. The first is the exact number ADR-0191 §5
  // got wrong on a device (40px, on a rule it had written down as deliberate); the second is
  // a token that measures 2.44:1 on this ground in light mode and looked fine in dark.
  const noteAndTask = {
    notes: [
      {
        id: 'nt-1',
        tripId: TRIP_ID,
        body: 'שמרו מקום ליד החלון',
        eventId: 'ev-lunch',
        source: 'member',
        createdBy: 'u1',
        ...stamps,
      },
    ],
    tasks: [
      {
        id: 'tk-1',
        tripId: TRIP_ID,
        title: 'להזמין מקומות מראש',
        eventId: 'ev-lunch',
        // Before `NOW()`, so this one is late and takes the `--miss` ink.
        dueAt: `${today()}T13:00:00.000Z`,
        dueHasTime: true,
        important: true,
        status: 'open',
        createdBy: 'u1',
        ...stamps,
      },
    ],
  };

  test('the task block starts where the note block starts', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await bootIntoTrip(page, {
      events: [lunch],
      places: [market],
      now: NOW(),
      dates: shortLiveTripDates(),
      ...noteAndTask,
    });
    await page.goto('/');
    await page.locator(BOARD).click();
    await expect(page.locator('.hero-task')).toBeVisible();
    // **Wait for the flight to LAND before reading any x.** §5's swing is a `rotateX`, and a
    // 3D rotation under perspective projects x as a function of y — so mid-flight two blocks
    // at different heights sit at different horizontal offsets and this assertion measures the
    // animation rather than the layout. Measured at 1.24px of false drift before this wait.
    await page.waitForFunction(
      () => document.querySelector('.hero-lifted')?.getAnimations().length === 0,
    );

    // The START edge in this RTL app is the RIGHT edge. Comparing `x` would compare where
    // the two lines happen to END, which is a function of their content.
    const edges = await page.evaluate(() => {
      const right = (sel) => document.querySelector(sel)!.getBoundingClientRect().right;
      return { note: right('.hero-note-tx'), task: right('.hero-task-hd') };
    });
    expect(Math.abs(edges.note - edges.task)).toBeLessThan(0.5);
  });

  // **Reported from a device: "tick alignment is bad".** An `.icon` inside a block is an
  // inline box on a BASELINE, and a baseline is not a centre — so both glyphs hung below the
  // first line of their own text (the clipboard by 1.4px, the checkbox by 2.4px, measured).
  // Invisible to the unit suite, which answers zero for every rect, and invisible in review,
  // because the markup is right and only the optical result is wrong.
  test('both content glyphs sit ON their line, not below it', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await bootIntoTrip(page, {
      events: [lunch],
      places: [market],
      now: NOW(),
      dates: shortLiveTripDates(),
      ...noteAndTask,
    });
    await page.goto('/');
    await page.locator(BOARD).click();
    await expect(page.locator('.hero-task')).toBeVisible();
    await page.waitForFunction(
      () => document.querySelector('.hero-lifted')?.getAnimations().length === 0,
    );

    const sag = await page.evaluate(() => {
      const mid = (sel) => {
        const r = document.querySelector(sel)!.getBoundingClientRect();
        return (r.top + r.bottom) / 2;
      };
      return {
        note: mid('.hero-note-ic .icon') - mid('.hero-note-tx'),
        task: mid('.hero-task-ic .icon') - mid('.hero-task-hd'),
        // The one the report was actually about: the tick against the star beside it.
        tickVsStar: mid('.hero-task-ic .icon') - mid('.hero-task-star .icon'),
      };
    });
    for (const v of Object.values(sag)) expect(Math.abs(v)).toBeLessThan(0.5);
  });

  // Asserted as an EQUALITY against the board's own control rather than as a colour literal —
  // §P's precedent. What must stay true is that the deadline paints in the ink this surface
  // already uses for the same meaning, not what that ink currently is.
  test('a passed deadline takes the board’s --miss ink, not the paper one', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await bootIntoTrip(page, {
      events: [lunch],
      places: [market],
      now: NOW(),
      dates: shortLiveTripDates(),
      ...noteAndTask,
    });
    await page.goto('/');
    await page.locator(BOARD).click();
    await expect(page.locator('.hero-task-due.late')).toBeVisible();

    const inks = await page.evaluate(() => {
      const colour = (sel) => getComputedStyle(document.querySelector(sel)!).color;
      return {
        due: colour('.hero-task-due.late'),
        boardMiss: colour('.wp-settle.board .wp-settle-btn.skip'),
        paperMiss: getComputedStyle(document.documentElement).getPropertyValue('--miss-deep'),
      };
    });
    expect(inks.due).toBe(inks.boardMiss);
    expect(inks.due).not.toBe(inks.paperMiss.trim());
  });
});

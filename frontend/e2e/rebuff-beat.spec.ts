// **The rebuff beat resolves on both surfaces that play it** (ADR-0160 §Q).
//
// It has an e2e because the unit tests can only see the CLASS: jsdom reads no tokens and
// runs no animations, so `PlanHome.rebuff.test.tsx` and `Home.lift.test.tsx` both stay green
// whether the keyframes exist, are misspelled, or are outranked by another rule. That last
// one is not hypothetical here — the Trip board's `animation` property is already owned by
// the Plan→Trip power-on, whose selector outranks a single class, which is why the board
// plugs the beat into its `--board-beat` slot instead of declaring `animation` itself.
//
// And it is what guards the move: the beat used to be declared twice (a `prep-rebuff` copy
// in `screens.css`) and is now one rule in `styles/beats.css`. If that rule stops reaching
// either surface, the beat silently stops with every unit test still passing.
//
// **The assertions add the class rather than clicking for it**, and that is deliberate: the
// beat removes itself after `--t-base`, so a click-then-assert races a ~240ms window and
// fails on a slow runner for a reason that has nothing to do with the beat. What the CLICK
// does is already covered deterministically in jsdom; what only a browser can answer is
// which `animation` a surface with that class actually resolves to.
import { test, expect, type Page } from '@playwright/test';
import { bootIntoTrip, shortLiveTripDates } from './boot';

const NOW = Date.parse('2026-08-05T12:30:00.000Z');
const DAY = '2026-08-05';

/** An event in progress with NO depth at all: no place, no note, no booking, nothing
 *  concurrent and nothing after it. That is the whole condition for "nothing to lift" —
 *  the collapsed board already says everything there is. */
const BARE_EVENT = [
  {
    id: 'ev-now',
    tripId: 't1',
    date: DAY,
    title: 'סיור',
    kind: 'soft',
    startsAt: '2026-08-05T12:00:00.000Z',
    endsAt: '2026-08-05T13:00:00.000Z',
    status: 'planned',
    sortOrder: 1,
    source: 'manual',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    updatedBy: 'u1',
  },
];

/** What `animation-name` this surface resolves to while it carries the beat — the value a
 *  class assertion cannot reach. Toggled on and off inside one evaluate, so nothing is left
 *  behind and nothing depends on the beat's own clock. */
const resolvedBeat = (page: Page, selector: string) =>
  page.evaluate((s) => {
    const el = document.querySelector(s)!;
    el.classList.add('is-rebuffing');
    const name = getComputedStyle(el).animationName;
    el.classList.remove('is-rebuffing');
    return name;
  }, selector);

const boot = async (page: Page) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await bootIntoTrip(page, { now: NOW, dates: shortLiveTripDates(), events: BARE_EVENT });
  await page.goto('/');
};

test('the Trip board resolves the beat through its own animation channel', async ({ page }) => {
  await boot(page);
  const board = page.locator('.wp-board').first();
  await expect(board).toBeVisible();
  // Not a control: it opens nothing, so it must not announce one (ADR-0160 §H's reasoning
  // reaching this surface).
  expect(await board.evaluate((el) => el.tagName)).toBe('DIV');
  // The power-on holds slot 0 and the beat rides slot 1, so the beat must be IN the list
  // rather than the only animation — which is the whole reason `--board-beat` exists.
  expect(await resolvedBeat(page, '.wp-board')).toContain('wp-rebuff');

  // And the press really is answered and really opens nothing.
  await board.click();
  await expect(page.locator('.hero-lifted')).toHaveCount(0);
});

test('Plan’s prep hero resolves the same beat after it moved to one rule', async ({ page }) => {
  await boot(page);
  // `תכנון` — the mode toggle is icon-only, so its accessible name is the way in.
  await page.getByRole('button', { name: 'תכנון' }).click();
  const prep = page.locator('.prep');
  await expect(prep).toBeVisible();
  expect(await resolvedBeat(page, '.prep')).toContain('wp-rebuff');
});

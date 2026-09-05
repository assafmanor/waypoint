// **THE DAY'S HEAD, MEASURED** (ADR-0219 §2/§3).
//
// The head replaced a 12px muted heading with a card, and every claim ADR-0219 makes about it is
// a claim about GEOMETRY on the narrowest phone the app supports (ADR-0017's 360px): what it
// costs above the fold, that the day's name is not ellipsised by anything in the card, and that
// the one action in its footer band is still reachable at the touch floor. jsdom can see none of
// it — it loads no CSS, resolves no `var()` and reports every rect as zero — so the head's screen
// spec (`src/screens/DayView.head.test.tsx`) asserts what it SAYS and this asserts what it takes.
//
// **Both themes and both modes**, in `day-total.spec.ts`'s shape: the two day surfaces render one
// component off one derivation, and ADR-0159 §1 forbids them differing about a fact — "does the
// head fit" is one.
import { test, expect, type Page } from '@playwright/test';
import { bootIntoTrip, todayAt, TRIP_ID } from './boot';
import { stableBox } from './measure';
import { t } from '../src/i18n/he';

/** ADR-0017's floor, and the box ADR-0219 §3's cost is stated against. */
const NARROW = { width: 360, height: 640 };

const stamps = {
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  updatedBy: 'u1',
};
const DAY = new Date().toISOString().slice(0, 10);

/** **The mockup's own day**, because its title is the one that broke a layout: round 2 put the
 *  labelled button in the head's trailing cell and this name ellipsised to `…ur crater ← Háifoss`
 *  at 360. The footer band is the repair, and this is the case that proves it. */
const places = [
  { id: 'p-a', tripId: TRIP_ID, name: 'Stútur crater', lat: 63.9, lng: -20.1, ...stamps },
  { id: 'p-b', tripId: TRIP_ID, name: 'Háifoss', lat: 64.2, lng: -19.6, ...stamps },
];

const event = (id: string, placeId: string, from: string, to: string) => ({
  id,
  tripId: TRIP_ID,
  date: DAY,
  title: id,
  icon: '📌',
  category: 'sightseeing',
  placeId,
  kind: 'soft',
  status: 'planned',
  startsAt: `${DAY}T${from}:00.000Z`,
  endsAt: `${DAY}T${to}:00.000Z`,
  sortOrder: 0,
  source: 'manual',
  ...stamps,
});

/** A delivered image that clears `dayPhoto`'s gate — `confidence ≥ 0.9` and a credit we can
 *  print. Served from the app's own `public/`, so the run stays hermetic. */
const IMAGE = {
  url: '/pwa-512.png',
  mimeType: 'image/png',
  width: 512,
  height: 512,
  sizeBytes: 40_000,
  source: 'commons',
  license: 'CC BY-SA 4.0',
  attribution: 'A. Photographer',
  fetchedAt: '2026-08-01T00:00:00.000Z',
  method: 'name_proximity',
  ref: 'Q38519',
  confidence: 1,
};

async function boot(page: Page, withShot: boolean): Promise<void> {
  await page.setViewportSize(NARROW);
  await bootIntoTrip(page, {
    events: [event('ev-a', 'p-a', '00:30', '01:00'), event('ev-b', 'p-b', '04:00', '06:00')],
    places,
    // The picture is ranked on dwell, so the two-hour stop wins it — which is also the point of
    // the fixture: the day is named by its route and pictured by the stop it was spent at.
    enrichments: withShot ? { 'p-b': { image: IMAGE } } : {},
    now: todayAt('00:00'),
    dates: { startDate: DAY, endDate: DAY },
  });
  await page.goto('/');
  await expect(page.locator('nav.nav')).toBeVisible();
}

async function openDays(page: Page, mode: 'trip' | 'plan'): Promise<void> {
  // Stated for BOTH, never inferred from the boot: which mode a trip opens in depends on where
  // the trip is in its life, so a spec that only clicks for one measures whichever it landed on.
  await page.getByRole('button', { name: t.mode[mode], exact: true }).click();
  await expect(page.locator('.app')).toHaveAttribute('data-mode', mode);
  await page.locator('nav.nav button', { hasText: t.tabs.days }).click();
  await expect(head(page)).toBeVisible();
}

/** **`> .day-page`, and the child combinator is the whole point**: a peek pane holds a whole day
 *  surface, so the head exists three times over while a gesture is live and `.day-peeks` renders
 *  BEFORE `.day-page` (`frontend/CLAUDE.md`'s named e2e trap). Inside the real page a DESCENDANT
 *  is safe and is what the two modes need — Trip's head is a child of `.day-page`, Plan's sits a
 *  level down inside `.builder-main`, and that difference is layout rather than a fact. */
const PAGE = '.day-swipe:not([data-preview]) > .day-page';
const head = (page: Page) => page.locator(`${PAGE} .wp-dayhead`).first();

for (const theme of ['light', 'dark'] as const) {
  for (const mode of ['trip', 'plan'] as const) {
    test.describe(`the day's head at 360, ${mode} · ${theme}`, () => {
      test.beforeEach(async ({ page }) => {
        await page.emulateMedia({ colorScheme: theme });
      });

      // **The cost, stated** (ADR-0219 §3, amended with these numbers). The frame alone is what
      // most city days pay; with the shot it is that plus a 116px band. Measured here at
      // ⁦124px⁩ = the grid's ⁦76px⁩ floor + the footer band's ⁦46px⁩ + ⁦2px⁩ of border, and ⁦240px⁩ with
      // the shot — both bigger than the mockup's 78/194, which drew each band without the
      // content that goes in it (the `אירוע חדש` in the footer, the third line `עכשיו` adds to
      // today's date tile). The bounds carry slack for the font stack rather than pinning the
      // pixel, and the run PRINTS the parts — so a drift arrives as a number in the log, not as
      // a red bound nobody can attribute.
      test('costs the frame alone when the day has no picture', async ({ page }) => {
        await boot(page, false);
        await openDays(page, mode);
        await expect(head(page).locator('.wp-dayhead-shot')).toHaveCount(0);
        const box = await stableBox(head(page));
        const parts = await head(page).evaluate((el) => ({
          grid: (el.querySelector('.wp-dayhead-head') as HTMLElement).getBoundingClientRect()
            .height,
          foot: (el.querySelector('.wp-dayhead-foot') as HTMLElement)?.getBoundingClientRect()
            .height,
        }));
        console.log(
          `[head · no shot · ${mode} · ${theme}] ${box.height.toFixed(1)}px = grid ${parts.grid.toFixed(1)} + foot ${parts.foot?.toFixed(1)}`,
        );
        expect(box.height).toBeGreaterThan(112);
        expect(box.height).toBeLessThan(136);
      });

      test('adds the 116px shot when a stop clears the gate', async ({ page }) => {
        await boot(page, true);
        await openDays(page, mode);
        const shot = head(page).locator('.wp-dayhead-shot img');
        await expect(shot).toBeVisible();
        const image = await stableBox(shot);
        expect(Math.round(image.height)).toBe(116);
        const box = await stableBox(head(page));
        console.log(`[head · with shot · ${mode} · ${theme}] ${box.height.toFixed(1)}px`);
        // The frame's ⁦124px⁩ plus the shot's ⁦116px⁩, and the addition is exact by construction.
        expect(box.height).toBeGreaterThan(228);
        expect(box.height).toBeLessThan(252);
      });

      // **THE PHOTOGRAPH BLEEDS; THE HEAD DOES NOT** (ADR-0219 §3's 2026-09-05 amendment). A
      // picture is edge content, so a day with one loses the gap above it and hangs off the day
      // strip; a day without one keeps the card, which is the majority case. The gutters stay in
      // both — every row under the head sits at the body's own inline padding, and a head at the
      // viewport edges would be the one object on the day that does not line up.
      test('hangs the picture off the day strip, and keeps the card without one', async ({
        page,
      }) => {
        /**
         * **The gap above the head, measured so the scroll position cannot reach it.**
         *
         * This is a LAYOUT question — how far the head sits from the top of the day's content —
         * and a bare viewport read answers a different one, because Trip mode lands on the
         * now-marker and a day with a 240px head is scrolled when it arrives. The first draft
         * scrolled to 0 and waited 120ms, which CI caught: the landing is an EASED
         * `scrollIntoView` that keeps re-aiming while the surface settles, so a fixed wait races
         * it and the read lands mid-flight. It failed at `-19` and, on the retry, `-3` — a
         * NEGATIVE gap, which is the scroller still on its way back rather than any layout at
         * all. `frontend/CLAUDE.md` names both halves: an eased scroll is a state to converge
         * on, not a value to read, and a fixed wait is what makes that a flake instead of a
         * failure.
         *
         * Adding `scrollTop` back removes the race rather than widening the window for it:
         * `.body` has no border, so `head.y - body.y + body.scrollTop` is the head's offset from
         * the scroller's own content origin — the same number wherever the scroll happens to be,
         * with nothing to wait for and nothing to retry. Scoped to the real page, since a peek
         * pane holds a whole day surface and its own head.
         */
        const gapAbove = () =>
          page.evaluate((sel) => {
            const scroller = document.querySelector('.body') as HTMLElement;
            const el = document.querySelector(`${sel} .wp-dayhead`) as HTMLElement;
            const h = el.getBoundingClientRect();
            const b = scroller.getBoundingClientRect();
            return {
              gap: Math.round(h.y - b.y + scroller.scrollTop),
              x: Math.round(h.x),
              w: Math.round(h.width),
            };
          }, PAGE);

        await boot(page, true);
        await openDays(page, mode);
        const withShot = await gapAbove();
        expect(withShot.gap).toBe(0);
        // The rows under it: `.wp-event` in Trip, `.bld` in Plan — the same inset either way.
        const row = await stableBox(page.locator(`${PAGE} .wp-event, ${PAGE} .bld`).first());
        expect(Math.round(row.x)).toBe(withShot.x);

        await boot(page, false);
        await openDays(page, mode);
        const noShot = await gapAbove();
        console.log(
          `[bleed · ${mode} · ${theme}] shot gap ${withShot.gap}px, no shot ${noShot.gap}px`,
        );
        expect(noShot.gap).toBeGreaterThan(20);
        // The gutters are the half of "full bleed" this deliberately does not take, in BOTH
        // cases — so the head and the rows under it share one inset.
        expect(noShot.x).toBe(withShot.x);
        expect(noShot.w).toBe(withShot.w);
      });

      // **A head's width belongs to its title** (ADR-0219 §2). This is the assertion round 2
      // failed: the labelled button in the trailing cell took it, and the day's own name came
      // back as `…ur crater ← Háifoss`. Reading `scrollWidth` is right HERE, where the question
      // is whether the ellipsis fired at all — the element is the clipped one.
      test('does not ellipsise the day’s own name', async ({ page }) => {
        await boot(page, true);
        await openDays(page, mode);
        const title = head(page).locator('.wp-dayhead-copy > strong');
        await expect(title).toBeVisible();
        const fit = await title.evaluate((el) => ({
          scroll: el.scrollWidth,
          client: el.clientWidth,
          text: el.textContent ?? '',
        }));
        console.log(`[title · ${mode} · ${theme}] "${fit.text}" ${fit.scroll}/${fit.client}px`);
        expect(fit.text).toContain('Háifoss');
        expect(fit.scroll).toBeLessThanOrEqual(fit.client);
      });

      // **The day's one action moved under the grid rather than into the trailing cell, and it
      // keeps its own look** — ADR-0219 §2 says so outright, so what this checks is that the
      // band did not squeeze it: the BAND's own height, and the button at the end edge.
      //
      // **The button is ⁦26px⁩ and this does not assert ⁦44px⁩ on it**, deliberately. That is
      // `.new-event-btn`'s shipped size and it was ⁦26px⁩ in `.sec-title` too, so ADR-0017's touch
      // floor is a standing debt of that control rather than anything this change introduced —
      // asserting it here would turn one ADR's device question into another ADR's red test. The
      // ⁦46px⁩ band is what §2 promised, and the button's own hit area is the device pass's call
      // (ADR-0219 "After phase 5").
      test('keeps the day’s one action reachable in the footer band', async ({ page }) => {
        await boot(page, true);
        await openDays(page, mode);
        const button = head(page).locator('.wp-dayhead-foot > .new-event-btn');
        await expect(button).toBeVisible();
        const box = await stableBox(button);
        console.log(
          `[action · ${mode} · ${theme}] ${box.width.toFixed(1)}×${box.height.toFixed(1)}px`,
        );
        const band = await stableBox(head(page).locator('.wp-dayhead-foot'));
        expect(band.height).toBeGreaterThanOrEqual(38);
        // It sits at the END edge of the band, which is where `.sec-title` always put it: in RTL
        // that is the left, so its box starts inside the head's own left half.
        const frame = await stableBox(head(page));
        expect(box.x).toBeLessThan(frame.x + frame.width / 2);
      });
    });
  }
}

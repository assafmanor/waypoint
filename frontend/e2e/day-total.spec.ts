// **HOW FAR THE DAY GOES, MEASURED** (ADR-0206 §V1.9 / §AP).
//
// §M2 records that a THREE-part line is where the day breaks at 360×640; this one is two-part,
// so it should sit inside budget — but "should" is what §M refuses, and the three traps §AN6
// names all report a line that clips as a line that fits. So this file measures it in the LIVE
// PAGE rather than reading a snapshotted table, after `document.fonts.ready` (the artefact's own
// numbers are the fallback font's and ran ~35px narrow), summing EVERY child and gap rather than
// the text halves, and comparing the natural width of an off-screen span carrying the element's
// computed font against the box — because `scrollWidth` on an ellipsised child reports the
// CLIPPED width and would report the clip as a fit.
//
// **Both day surfaces**, because a day's total distance is a FACT and ADR-0159 §1 forbids the two
// differing about one. The unit specs assert they say the same thing; this asserts that both can
// SHOW what they say on the narrowest phone the app supports (ADR-0017).
import { test, expect, type Page } from '@playwright/test';
import { bootIntoTrip, todayAt, TRIP_ID } from './boot';
import { t } from '../src/i18n/he';

/** ADR-0017's floor, and §M2's own measuring box. */
const NARROW = { width: 360, height: 640 };

const stamps = {
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  updatedBy: 'u1',
};
const DAY = new Date().toISOString().slice(0, 10);

/** Three real Tokyo stops, so the day has two legs and the total is a sum rather than one leg
 *  wearing a different hat. */
const place = (id: string, name: string, lat: number, lng: number) => ({
  id,
  tripId: TRIP_ID,
  name,
  lat,
  lng,
  ...stamps,
});
const places = [
  place('p-a', 'שער קמינרימון', 35.7108, 139.7967),
  place('p-b', 'מוזיאון אדו', 35.6963, 139.7966),
  place('p-c', 'קאבוקי-זה', 35.6695, 139.7647),
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

/** **The widest honest line this feature can produce**, which is what a budget has to be measured
 *  against rather than a typical one: `H:MM שע׳` is the ladder's longest rung (§AE5 measured the
 *  hero widening on exactly that), and a whole-kilometre distance past `WHOLE_KM_FROM` is its
 *  longest too. ⁦68⁩ + ⁦75⁩ minutes reads `~2:23 שע׳`; the distances sum past ⁦10 ק״מ⁩. */
const LEG_A = { durationSeconds: 68 * 60, distanceMeters: 5_400 };
const LEG_B = { durationSeconds: 75 * 60, distanceMeters: 6_100 };

/** The routing endpoint, answered from the fixtures above — hermetic, like every other mock in
 *  `boot.ts`. Every admitted mode carries the same numbers: the trip derives `walking` and the
 *  total reads whichever mode the leg resolves to, so a per-mode fixture would only encode this
 *  spec's guess about that derivation. */
async function mockRoutes(page: Page): Promise<void> {
  await page.route(
    (u) => u.pathname.endsWith(`/trips/${TRIP_ID}/routes`),
    async (route, request) => {
      if (request.method() !== 'POST') return route.fallback();
      const body = request.postDataJSON() as { modes: string[] };
      const estimates = (leg: { durationSeconds: number; distanceMeters: number }) =>
        body.modes.map((mode) => ({ mode, ...leg }));
      await route.fulfill({
        json: {
          legs: [
            {
              fromIndex: 0,
              toIndex: 1,
              estimates: estimates(LEG_A),
              refusedModes: [],
              pendingModes: [],
            },
            {
              fromIndex: 1,
              toIndex: 2,
              estimates: estimates(LEG_B),
              refusedModes: [],
              pendingModes: [],
            },
          ],
        },
      });
    },
  );
}

async function boot(page: Page): Promise<void> {
  await page.setViewportSize(NARROW);
  await mockRoutes(page);
  await bootIntoTrip(page, {
    events: [
      event('ev-a', 'p-a', '00:30', '01:00'),
      event('ev-b', 'p-b', '04:00', '05:00'),
      event('ev-c', 'p-c', '08:00', '10:00'),
    ],
    places,
    now: todayAt('00:00'),
    dates: { startDate: DAY, endDate: DAY },
  });
  await page.goto('/');
  await expect(page.locator('nav.nav')).toBeVisible();
}

/**
 * **Does this line fit its box?** — the three traps of §AN6, answered.
 *
 * Natural width comes from an off-screen span carrying the element's own computed font, never
 * from `scrollWidth` (which reports the clipped width inside `overflow: hidden`) and never from a
 * `Range` (unreliable in the same box). The row's demand is EVERY child's natural width plus
 * EVERY gap, because summing only the text halves drops the glyph and one gap — ⁦24px⁩ of a ⁦308px⁩
 * box, which is most of the margin a too-long line appears to have.
 */
async function fitOf(page: Page, selector: string) {
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate((sel) => {
    const row = document.querySelector(sel) as HTMLElement;
    const style = getComputedStyle(row);
    const probe = document.createElement('span');
    probe.style.cssText = 'position:fixed;left:-9999px;top:0;white-space:pre;visibility:hidden';
    document.body.append(probe);
    const naturalOf = (el: HTMLElement) => {
      const s = getComputedStyle(el);
      probe.style.font = s.font || `${s.fontWeight} ${s.fontSize}/${s.lineHeight} ${s.fontFamily}`;
      probe.style.letterSpacing = s.letterSpacing;
      probe.textContent = el.textContent ?? '';
      // An element with no text of its own (the glyph tile) contributes its laid-out box.
      return probe.textContent.trim()
        ? probe.getBoundingClientRect().width
        : el.getBoundingClientRect().width;
    };
    const children = [...row.children] as HTMLElement[];
    const gap = parseFloat(style.columnGap || style.gap || '0') * Math.max(0, children.length - 1);
    const padding = parseFloat(style.paddingInlineStart) + parseFloat(style.paddingInlineEnd);
    const demand = children.reduce((sum, el) => sum + naturalOf(el), 0) + gap + padding;
    probe.remove();
    return {
      demand,
      box: row.getBoundingClientRect().width,
      text: row.textContent ?? '',
      clipped: children.some((el) => el.scrollWidth > el.clientWidth + 1),
    };
  }, selector);
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`the day's total at 360, ${theme}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await boot(page);
    });

    test('fits its box on the day list', async ({ page }) => {
      await page.locator('nav.nav button', { hasText: t.tabs.days }).click();
      const line = page.locator('.day-page .day-total').first();
      await expect(line).toBeVisible();
      const fit = await fitOf(page, '.day-page .day-total');
      // Reported so the PR carries the numbers rather than the claim.
      console.log(
        `[day list · ${theme}] "${fit.text}" — ${fit.demand.toFixed(1)}px of ${fit.box.toFixed(1)}px`,
      );
      expect(fit.clipped).toBe(false);
      expect(fit.demand).toBeLessThanOrEqual(fit.box);
    });

    test('fits its box in Plan mode', async ({ page }) => {
      await page.getByRole('button', { name: t.mode.plan, exact: true }).click();
      await expect(page.locator('.app')).toHaveAttribute('data-mode', 'plan');
      await page.locator('nav.nav button', { hasText: t.tabs.days }).click();
      const line = page.locator('.day-page .day-total').first();
      await expect(line).toBeVisible();
      const fit = await fitOf(page, '.day-page .day-total');
      console.log(
        `[plan · ${theme}] "${fit.text}" — ${fit.demand.toFixed(1)}px of ${fit.box.toFixed(1)}px`,
      );
      expect(fit.clipped).toBe(false);
      expect(fit.demand).toBeLessThanOrEqual(fit.box);
    });
  });
}

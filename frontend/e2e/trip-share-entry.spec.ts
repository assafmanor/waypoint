// **The share entry sits on the trip card's row** (ADR-0213), and it is here because that
// claim is pure geometry.
//
// The shipped version put the action on a line of its OWN — the wrapper had no CSS at all,
// so a `width: 100%` card pushed its sibling to the next row (owner report, 2026-08-30).
// Nothing caught it: the unit spec asserted the button was not NESTED inside the card, which
// is true of a control anywhere on the page, and jsdom reports every rect as zero so it
// could not have asserted anything else. Same-row is a real browser's question.
import { expect, test } from '@playwright/test';
import { bootIntoAllTrips } from './boot';
import { stableBox } from './measure';
import { t } from '../src/i18n/he';

const PHONES = [
  { width: 360, height: 640 },
  { width: 430, height: 932 },
];

// Both list shapes: the live trip's hero and an upcoming trip's row (`AllTrips.tsx`).
const SHAPES = [
  { name: 'the live hero', card: '.trip-hero' },
  { name: 'an upcoming row', card: '.trip-card' },
];

/** The shell's arrival transition translates `.route-shell` (ADR-0140), and a box measured
 *  mid-transform comes back off by float noise — 43.999999 against a 44px floor. Settle it
 *  rather than rounding the assertion, so what is measured is the layout and not a frame. */
async function settled(page: import('@playwright/test').Page) {
  // Polled rather than awaited on `animation.finished`: the shell is keyed on the pathname,
  // so the boot's own navigation replaces the node and rejects that promise with an
  // AbortError. A finished CSS animation with no fill mode leaves the list by itself.
  await page.waitForFunction(
    () => (document.querySelector('.route-shell')?.getAnimations().length ?? 1) === 0,
  );
}

for (const viewport of PHONES) {
  for (const shape of SHAPES) {
    test(`share sits on ${shape.name}'s row at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await bootIntoAllTrips(page);
      await settled(page);

      const wrap = page.locator('.trip-share-wrap', { has: page.locator(shape.card) }).first();
      const card = await stableBox(wrap.locator(shape.card));
      const action = await stableBox(wrap.locator('.trip-share-action'));

      // The whole of the action is within the card's own vertical band — which is what
      // "same row" means, and what a wrapped sibling fails by its entire height.
      expect(action.y).toBeGreaterThanOrEqual(card.y);
      expect(action.y + action.height).toBeLessThanOrEqual(card.y + card.height);

      // …and it is at the card's inline END. The app is RTL, so that is the LEFT edge.
      expect(action.x).toBeLessThan(card.x + card.width / 2);

      // ADR-0017's touch floor, measured rather than assumed.
      expect(action.height).toBeGreaterThanOrEqual(44);
      expect(action.width).toBeGreaterThanOrEqual(44);
    });
  }
}

test('the two controls do not overlap, so a thumb can hit either', async ({ page }) => {
  await page.setViewportSize(PHONES[0]);
  await bootIntoAllTrips(page);
  await settled(page);

  const wrap = page.locator('.trip-share-wrap').first();
  const action = await stableBox(wrap.locator('.trip-share-action'));

  // The card is under the action by design (one grid cell, both children in it), so what
  // has to be true is that the action wins the point — a tap on the icon must not open the
  // trip, and a tap on the title must not open the sheet.
  const onAction = await page.evaluate(
    (point) => document.elementFromPoint(point.x, point.y)?.closest('button')?.className ?? '',
    { x: action.x + action.width / 2, y: action.y + action.height / 2 },
  );
  expect(onAction).toContain('trip-share-action');

  const title = await stableBox(wrap.locator('.t').first());
  const onTitle = await page.evaluate(
    (point) => document.elementFromPoint(point.x, point.y)?.closest('button')?.className ?? '',
    { x: title.x + title.width / 2, y: title.y + title.height / 2 },
  );
  expect(onTitle).not.toContain('trip-share-action');
});

test('pressing share opens the sheet; pressing the card still opens the trip', async ({ page }) => {
  await page.setViewportSize(PHONES[0]);
  await bootIntoAllTrips(page);

  const hero = page.locator('.trip-share-wrap.is-live');
  await hero.locator('.trip-share-action').click();
  await expect(page.getByText(t.share.owner.title)).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByText(t.share.owner.title)).toHaveCount(0);

  await hero.locator('.trip-hero').click();
  await expect(page).not.toHaveURL(/\/trips$/);
});

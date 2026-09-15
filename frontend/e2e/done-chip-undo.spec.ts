// **ONE DONE MARK, AND IT IS THE UNDO** (ADR-0230) — the half jsdom cannot see.
//
// The unit tests pin the composition rule: the chip carries the role, the ✓ circle and the
// `שחזור` button are gone, the tap restores without toggling. What only a real browser knows
// is the number the whole decision turns on — **is the chip actually tappable?** The circle it
// replaces was 22px painted and 30px reachable; this chip paints 17px and reaches ADR-0017's
// 44px floor through an `::after` OVERLAY (ADR-0177's idiom), which has no rect of its own.
// So it is measured the only way it can be: by asking the document what is under the finger.
//
// `-12px` reached 41px and the mockup's first render is what said so. A constant nobody
// measures is exactly the anti-pattern `frontend/CLAUDE.md` lists three times over.
import { test, expect, type Page } from '@playwright/test';
import { bootIntoTrip, shortLiveTripDates, todayAt, TRIP_ID } from './boot';
import { t } from '../src/i18n/he';

const PHONE = { width: 390, height: 844 };
/** ADR-0017's floor, stated here so a failure names the rule rather than a number. */
const TOUCH_FLOOR = 44;
/** Afternoon, so a morning fixture is behind us whatever hour the suite runs at. */
const NOW = () => todayAt('15:00');
const today = () => new Date().toISOString().slice(0, 10);

const settled = {
  id: 'e-done',
  tripId: TRIP_ID,
  date: today(),
  title: 'ארוחת בוקר בשוק',
  icon: '🥐',
  category: 'food',
  kind: 'soft',
  startsAt: `${today()}T07:00:00.000Z`,
  endsAt: `${today()}T08:00:00.000Z`,
  status: 'done',
  sortOrder: 0,
  source: 'manual',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  updatedBy: 'u1',
};

async function openDay(page: Page): Promise<void> {
  await bootIntoTrip(page, {
    now: NOW(),
    dates: shortLiveTripDates(),
    events: [settled],
  });
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await page.locator('nav.nav button', { hasText: t.tabs.days }).click();
  await expect(row(page).first()).toHaveClass(/\bdone\b/);
}

/** **Scoped to the live day, with the child combinator** (`frontend/CLAUDE.md`). A peek pane
 *  holds a whole day surface, so `.wp-event` and every class on it exists more than once
 *  while the pager is mounted — and `.day-peeks` renders BEFORE `.day-page`, so an unscoped
 *  query answers about TOMORROW. It cost this file one red run. */
const DAY = '.day-swipe:not([data-preview]) > .day-page';
const row = (page: Page) => page.locator(`${DAY} .wp-event`);
const chip = (page: Page) => page.locator(`${DAY} .wp-event.done .wp-event-tag-done`);

test.describe('the done chip is the undo (ADR-0230)', () => {
  // THE MEASUREMENT. `elementFromPoint` at the extremes of the claimed target, because the
  // overlay is a pseudo-element and `boundingBox()` reports only the 17px the chip paints.
  // Asked at the chip's own centre line so a wide chip is not what carries the result.
  test('reaches the 44px touch floor without growing the line it sits on', async ({ page }) => {
    await openDay(page);
    const reach = await chip(page).evaluate((el, floor) => {
      const box = el.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const mid = box.top + box.height / 2;
      const hits = (y: number) => {
        const at = document.elementFromPoint(x, y);
        return !!at && (at === el || el.contains(at));
      };
      // Walk out from the centre until the document stops answering with this element.
      let up = 0;
      while (up < 40 && hits(mid - up - 1)) up += 1;
      let down = 0;
      while (down < 40 && hits(mid + down + 1)) down += 1;
      return { reachable: up + down, painted: Math.round(box.height), floor };
    }, TOUCH_FLOOR);

    expect(reach.reachable).toBeGreaterThanOrEqual(TOUCH_FLOOR);
    // …and the point of the overlay: the line itself is untouched by meeting the floor.
    expect(reach.painted).toBeLessThan(TOUCH_FLOOR);
  });

  // The other thing that needs a browser: the tap at the TOP of that reach — inside the
  // face's own padding, where no pixel of the chip is painted — must still restore rather
  // than toggle the card open. That is the whole risk of an expanded target.
  test('a tap in the overlay restores, and does not open the card', async ({ page }) => {
    await openDay(page);
    const box = (await chip(page).boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y - 8);

    await expect(page.locator(`${DAY} .wp-event.done`)).toHaveCount(0);
    await expect(page.locator(`${DAY} .wp-event.open`)).toHaveCount(0);
  });

  // **WHAT THE TARGET TAKES.** An expanded target is fine over its own neighbourhood and
  // fatal over a neighbouring CONTROL (`frontend/CLAUDE.md`) — so the claim is checked
  // against the four other things on this face by asking the document what is under each of
  // them. jsdom reports every rect as zero and can make none of these calls.
  test('covers no other control on the face', async ({ page }) => {
    await openDay(page);
    const stolen = await page.evaluate((day) => {
      const face = document.querySelector(`${day} .wp-event.done .wp-event-face`)!;
      const chip = document.querySelector(`${day} .wp-event-tag-done`)!;
      return [...face.querySelectorAll('button, [role="button"], .wp-event-badge')]
        .filter((el) => el !== chip && !chip.contains(el))
        .filter((el) => {
          const b = el.getBoundingClientRect();
          const at = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
          return !!at && (at === chip || chip.contains(at));
        })
        .map((el) => el.className.toString());
    }, DAY);
    expect(stolen).toEqual([]);
  });

  // The deletions, asserted where they are visible rather than by a class name that would
  // quietly stop matching anything: one control on the settled row, and it wears the word.
  test('carries exactly one way back, and it is the chip with the word on it', async ({ page }) => {
    await openDay(page);
    // Counted by the LABEL rather than by `getByRole`, and the difference is a real fact
    // about the tree: an `aria-label` on a descendant feeds the ancestor's name-from-content,
    // so the face `<button>` this chip sits inside also answers to `שחזור` and the role query
    // resolves two. It did with the ✓ circle too — nothing regressed — but a count assertion
    // that reads two when one control exists is not measuring what it says it is.
    await expect(page.locator(`${DAY} [aria-label="${t.actions.undoDone}"]`)).toHaveCount(1);
    await expect(chip(page)).toContainText(t.event.didThis);

    // Opened, the verb band is empty and so does not render at all (ADR-0228's amendment
    // applying itself once `שחזור` leaves the list).
    //
    // **Opened from the TITLE, not from the face's centre**, and the difference is a measured
    // fact rather than a preference: the title line's centre sits ⁦11px⁩ from the card's, so
    // the chip's ⁦45px⁩ target contains the face's geometric centre and a `.click()` on the
    // face — which aims there — presses the chip instead. See the spec below, which is the
    // assertion that keeps that band honest.
    await page.locator(`${DAY} .wp-event.done .wp-event-title-txt`).click();
    await expect(page.locator(`${DAY} .wp-event.open`)).toBeVisible();
    await expect(page.locator(`${DAY} .wp-event.open .wp-event-act-row`)).toHaveCount(0);
  });
});

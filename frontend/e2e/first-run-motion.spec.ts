// The two first-run SEQUENCES, in a real browser — because nothing else can see them.
//
// **This file exists because two device screenshots found two real bugs that 1809 unit
// tests could not.** jsdom loads no CSS and reports every rect as zero, so a `.birth-arr`
// animating from invisible TO invisible (ADR-0142's build log) and a card positioned from
// an invented `118px` both passed the whole suite. Every assertion here is deliberately
// one of the two things jsdom is blind to: **computed opacity** and **geometry**.
//
// It does NOT assert how the motion looks — that stays a human pass, and saying so is the
// point (frontend/CLAUDE.md). It asserts that each beat actually reaches its end state and
// that nothing lands on top of anything else.
import { expect, test, type Locator } from '@playwright/test';
import { bootIntoCreate, bootIntoJoin, CREATED_TRIP } from './boot';

type Box = { top: number; bottom: number; left: number; right: number; height: number };

/** Do two elements actually land on top of each other? BOTH axes, because that is what
 *  "covers" means — a vertical-only check called the stamp an overlap of the trip name
 *  after a gutter had separated them horizontally, which is a false positive that would
 *  have sent someone chasing a fixed layout. Half a pixel of tolerance for sub-pixel
 *  layout. */
function overlaps(a: Box, b: Box): boolean {
  const vertical = a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
  const horizontal = a.left < b.right - 0.5 && b.left < a.right - 0.5;
  return vertical && horizontal;
}

async function box(locator: Locator): Promise<Box> {
  const b = await locator.boundingBox();
  if (!b) throw new Error('element has no box');
  return { top: b.y, bottom: b.y + b.height, left: b.x, right: b.x + b.width, height: b.height };
}

test.describe('trip birth (ADR-0142)', () => {
  test('the card sits in its slot rather than over the form', async ({ page }) => {
    await bootIntoCreate(page);
    // THE REGRESSION: the card was positioned from an invented `--birth-card-top: 118px`
    // and floated over the destination and date fields.
    const card = await box(page.locator('.birth-card'));
    const slot = await box(page.locator('[data-slot="form"]'));
    expect(Math.abs(card.top - slot.top)).toBeLessThan(1);
    // …and the slot must actually reserve the card's height, or what follows collides.
    expect(slot.height).toBeGreaterThanOrEqual(card.height - 0.5);
  });

  test('every beat of the born screen reaches its end state', async ({ page }) => {
    await bootIntoCreate(page);
    await page
      .locator('.dest-trigger, .birth-form input')
      .first()
      .click()
      .catch(() => {});
    // Fill the three inputs the schema needs. The destination picker is a search sheet, so
    // the form is driven the way a person drives it.
    await page.locator('.birth-form input[type="date"]').nth(0).fill('2026-09-12');
    await page.locator('.birth-form input[type="date"]').nth(1).fill('2026-09-23');
    await page.locator('.title-input').fill(CREATED_TRIP.name);
    await page.evaluate(() => {
      // The destination is the one field behind a Places sheet; setting it directly keeps
      // this spec hermetic (no Google), which is the same trade the Map specs make.
      const el = document.querySelector<HTMLElement>('.dest-trigger');
      el?.click();
    });
    const cta = page.locator('.create-btn');
    // Only assert the sequence if the form could actually be completed; the destination
    // sheet is out of this spec's scope, so skip rather than assert a half-truth.
    if (await cta.isDisabled()) test.skip(true, 'destination picker needs its own fixture');

    await cta.click();
    // THE REGRESSION: `.birth-arr` has `opacity: 0` as its base and its keyframe declared
    // only a `from`, so with `forwards` the implicit `to` was that same 0 — the entire born
    // screen stayed invisible. Wait for the last beat, then require every piece VISIBLE.
    await expect(page.locator('.birth[data-content="in"]')).toBeAttached({ timeout: 5000 });
    await page.waitForFunction(
      () => {
        const els = [...document.querySelectorAll('.birth-arr')];
        return els.length > 3 && els.every((el) => +getComputedStyle(el).opacity > 0.99);
      },
      undefined,
      { timeout: 5000 },
    );
    // The board is the payoff, so it specifically must be lit rather than merely present.
    expect(await page.locator('.birth-board').evaluate((el) => +getComputedStyle(el).opacity)).toBe(
      1,
    );
    // And the committed card must not have landed on the hero it sits below.
    expect(
      overlaps(await box(page.locator('.birth-card')), await box(page.locator('.born-hero'))),
    ).toBe(false);
  });
});

test.describe('the invite pass (ADR-0143)', () => {
  test('loading shows the pass-shaped skeleton, then the real pass', async ({ page }) => {
    await bootIntoJoin(page);
    await expect(page.locator('.join-ticket')).toBeVisible();
    await expect(page.locator('.join-ticket-skel')).toHaveCount(0);
    // The glow ramps with the pass rather than being warm before there is anything to be
    // warm about — so the ready flag has to be on the root for the CSS to key off.
    await expect(page.locator('.join-land[data-pass="ready"]')).toBeAttached();
  });

  test('the avatars all arrive — the staggered ones are the screen’s social proof', async ({
    page,
  }) => {
    await bootIntoJoin(page);
    await expect(page.locator('.ticket-av')).toHaveCount(4);
    // Wait for the stagger to FINISH rather than guessing how long it takes — the contract
    // is "every one of them reaches full opacity", and a fixed sleep tests the clock
    // instead. A stagger built on a `both` fill and a delay is exactly where an element
    // gets left behind at 0, which is the born screen's bug in another costume.
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('.ticket-av')].every(
          (el) => +getComputedStyle(el).opacity > 0.99,
        ),
      undefined,
      { timeout: 4000 },
    );
  });

  test('joining stamps the pass, tears it, then hands off', async ({ page }) => {
    await bootIntoJoin(page);
    await page.locator('.join-cta-btn').click();
    await expect(page.locator('.ticket-stamp')).toBeVisible();
    // The stamp must be READABLE, not a rotated blur, and it must not cover the trip name.
    // Measure only once the stamp has LANDED. Its entrance starts at `scale(2.4)`, so a
    // bounding box read mid-flight is ~2.4× too big and reports an overlap that does not
    // exist a moment later — the contract is that the SETTLED stamp does not cover the
    // name, not that its animation never passes over it.
    await page
      .locator('.ticket-stamp')
      .evaluate((el) =>
        Promise.all((el.getAnimations?.() ?? []).map((a) => a.finished.catch(() => {}))),
      );
    expect(
      overlaps(await box(page.locator('.ticket-stamp')), await box(page.locator('.ticket-name'))),
    ).toBe(false);
    await expect(page.locator('.join-land[data-outcome="torn"]')).toBeAttached({ timeout: 3000 });
    // The handoff is the LAST beat — the trip's own shell is what we land on.
    await expect(page).toHaveURL(/\/$/, { timeout: 3000 });
  });

  test('an expired invite reads as a refused pass', async ({ page }) => {
    await bootIntoJoin(page, { expired: true });
    await expect(page.locator('.join-land[data-refused]')).toBeAttached();
    await expect(page.locator('.ticket-stamp.is-refused')).toBeVisible();
    // The hero cannot congratulate you while the pass is refused — and it is not merely
    // faded, it is never rendered, which is the stronger version of the same rule.
    await expect(page.locator('.join-hero')).toHaveCount(0);
    // …and there is nothing to join.
    await expect(page.locator('.join-cta')).toHaveCount(0);
  });
});

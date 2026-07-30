// The trip handoff (ADR-0140 §7), in a real browser — the only place it can be checked.
//
// A shared element is entirely a claim about GEOMETRY: the glyph must land on the pill's
// own icon, not near it. jsdom reports every rect as zero, so the whole mechanism is
// invisible to the unit suite by construction (`lib/trip-handoff.test.tsx` covers the
// store's rules and says so). And the specific failure this guards against has already
// happened three times in this codebase in other costumes — a position invented as a
// constant instead of measured (ADR-0142's `118px`, the join stamp's `58px`).
//
// So the landing is verified against the flight's OWN final keyframe, read out of the Web
// Animations API, compared with the pill's settled rect. That asks the exact question:
// where did the code aim, and is that where the target actually is.
import { expect, test } from '@playwright/test';
import { bootIntoAllTrips } from './boot';

const UPCOMING = '.trip-card';
const LIVE = '.trip-hero';

/** The flight's last keyframe — where the glyph is aiming. Polls, because the animation
 *  only exists once the trip shell has mounted and claimed the handoff, which is a boot
 *  fetch away. */
async function aimedAt(page: import('@playwright/test').Page) {
  return page.waitForFunction(
    () => {
      const clone = document.querySelector('.handoff-glyph');
      if (!clone) return null;
      // The lift/land transform animations are CSS; the flight is the one carrying `left`.
      const flight = clone.getAnimations().find((a) => {
        const frames = (a as Animation & { effect: KeyframeEffect }).effect?.getKeyframes?.() ?? [];
        return frames.some((f) => 'left' in f);
      });
      const frames = (flight as Animation & { effect: KeyframeEffect })?.effect?.getKeyframes();
      const last = frames?.[frames.length - 1] as Record<string, string> | undefined;
      if (!last) return null;
      return {
        left: parseFloat(last.left),
        top: parseFloat(last.top),
        width: parseFloat(last.width),
        height: parseFloat(last.height),
      };
    },
    undefined,
    { timeout: 5000 },
  );
}

test.describe('trip handoff (ADR-0140 §7)', () => {
  test('the glyph lands on the switcher pill, not near it', async ({ page }) => {
    await bootIntoAllTrips(page);
    await page.locator(UPCOMING).first().click();

    const aim = await (await aimedAt(page)).jsonValue();

    // The pill's own glyph, once everything has settled. Measured independently of the
    // flight, which is what makes the comparison meaningful.
    await expect(page.locator('.handoff-glyph')).toHaveCount(0, { timeout: 5000 });
    const pill = await page.locator('.trip-icon').boundingBox();
    if (!pill) throw new Error('the pill has no glyph');

    expect(Math.abs(aim.left - pill.x)).toBeLessThan(1);
    expect(Math.abs(aim.top - pill.y)).toBeLessThan(1);
    expect(Math.abs(aim.width - pill.width)).toBeLessThan(1);
    expect(Math.abs(aim.height - pill.height)).toBeLessThan(1);
  });

  test('the pill hides its own glyph in flight and shows it again on arrival', async ({ page }) => {
    await bootIntoAllTrips(page);
    await page.locator(UPCOMING).first().click();

    // Two glyphs on screen at once is the failure a shared element is most prone to.
    await expect(page.locator('.trip-icon.is-handoff')).toBeAttached({ timeout: 5000 });
    expect(await page.locator('.trip-icon').evaluate((el) => getComputedStyle(el).visibility)).toBe(
      'hidden',
    );

    // …and the opposite failure: a handoff that never lands leaves the trip with no glyph
    // at all. The clone going away and the icon coming back are one commit.
    await expect(page.locator('.handoff-glyph')).toHaveCount(0, { timeout: 5000 });
    await expect(page.locator('.trip-icon')).toBeVisible();
    expect(await page.locator('.trip-icon').evaluate((el) => getComputedStyle(el).visibility)).toBe(
      'visible',
    );
  });

  test('the shell fades rather than slides, so the target is measurable', async ({ page }) => {
    await bootIntoAllTrips(page);
    await page.locator(LIVE).click();
    // A translating ancestor would offset the pill's measured rect by up to
    // `--route-offset` — the reason this arrival has its own manner (NAV_DIR.HANDOFF).
    await expect(page.locator('.route-shell[data-nav="handoff"]')).toBeAttached();
  });

  test('the hero hands off too — both list shapes, one code path', async ({ page }) => {
    await bootIntoAllTrips(page);
    await page.locator(LIVE).click();
    const aim = await (await aimedAt(page)).jsonValue();
    await expect(page.locator('.handoff-glyph')).toHaveCount(0, { timeout: 5000 });
    const pill = await page.locator('.trip-icon').boundingBox();
    if (!pill) throw new Error('the pill has no glyph');
    expect(Math.abs(aim.left - pill.x)).toBeLessThan(1);
    expect(Math.abs(aim.top - pill.y)).toBeLessThan(1);
  });

  test('reduced motion: no clone, and the pill is never hidden', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await bootIntoAllTrips(page);
    await page.locator(UPCOMING).first().click();
    // A user who asked for less motion did not ask for a different outcome (ADR-0140 §5):
    // they land in the trip with its glyph on the pill, immediately.
    await expect(page.locator('.trip-icon')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.handoff-glyph')).toHaveCount(0);
    await expect(page.locator('.trip-icon.is-handoff')).toHaveCount(0);
    // …and the ordinary forward transition plays instead, rather than nothing at all.
    await expect(page.locator('.route-shell[data-nav="forward"]')).toBeAttached();
  });

  test('the back arrow into the live trip recedes', async ({ page }) => {
    await bootIntoAllTrips(page);
    // `/trips` renders the arrow only when there is a live trip to go back to, and that
    // navigation bypasses the back resolver — so it stamped nothing and read as a forward
    // push, the one back in the app that advanced.
    await page.locator('header .back').click();
    await expect(page.locator('.route-shell[data-nav="back"]')).toBeAttached();
  });
});

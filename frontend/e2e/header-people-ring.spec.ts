// The people stack's own ring, in a real browser — because nothing else can see it.
//
// `.hdr-top` clips (its `overflow` is what makes the condense collapse), and the stack
// sits at the clipped edge. Your "this is you" ring is a box-shadow, so it paints OUTSIDE
// the avatar's box and the row shaved it. It only ever showed on a SOLO trip: with
// co-members the outer circle is a plain one with no shadow to lose.
//
// jsdom is blind to this twice over — no CSS, and every rect zero — so the assertion is
// geometry against the clipper's own box, the one thing only a browser knows.
import { expect, test, type Page } from '@playwright/test';
import { bootIntoTrip } from './boot';

/** How far the ring paints beyond the avatar's border box, read off the computed
 *  shadow rather than written down here — so the test still means what it says if the
 *  ring is re-tuned. The widest spread in `box-shadow` is the outer edge. */
async function ringSpread(page: Page): Promise<number> {
  return page.locator('.hdr-people .av.is-me').evaluate((el) => {
    const shadow = getComputedStyle(el).boxShadow;
    const spreads = [...shadow.matchAll(/(-?[\d.]+)px/g)].map((m) => Number(m[1]));
    return Math.max(...spreads);
  });
}

test('a solo trip draws your whole ring inside the row that clips it', async ({ page }) => {
  await bootIntoTrip(page);
  await page.goto('/');
  const row = page.locator('.hdr-top');
  await expect(row).toBeVisible();
  // Guard the premise: if the row stops clipping, this spec is passing for free.
  await expect(row).toHaveCSS('overflow', 'hidden');
  // ...and that it really is the solo case, which is the only one that ever broke.
  await expect(page.locator('.hdr-people .av')).toHaveCount(1);

  const clip = (await row.boundingBox())!;
  const avatar = (await page.locator('.hdr-people .av.is-me').boundingBox())!;
  const spread = await ringSpread(page);
  expect(spread).toBeGreaterThan(0);

  // THE REGRESSION: the ring's leading edge landed at 12.5px against a clip at 16px.
  expect(avatar.x - spread).toBeGreaterThanOrEqual(clip.x);
  expect(avatar.x + avatar.width + spread).toBeLessThanOrEqual(clip.x + clip.width);
  expect(avatar.y - spread).toBeGreaterThanOrEqual(clip.y);
  expect(avatar.y + avatar.height + spread).toBeLessThanOrEqual(clip.y + clip.height);
});

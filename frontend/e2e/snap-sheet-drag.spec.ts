// **THE SHEET'S BODY AS A DRAG TARGET, MEASURED IN A REAL ENGINE** (ADR-0122 §4's 2026-09-15
// amendment, in its third reading).
//
// The 2026-08-06 rule — "the body drags while it cannot scroll" — carried its whole claim in one
// CSS attribute, so this spec asserted `touch-action` and nothing else. The rule now is asked of
// the LIST, once, when the finger has a direction: **can it still scroll that way?** If yes, the
// gesture is the browser's pan for its whole life, to the list's end and past it. If no, the
// sheet moves from the first pixel. Whether Chromium really keeps its pan when the hook stands
// down, really never starts one when the hook claims, and really moves nothing when a pan runs
// the list out under the finger — those are facts only a real engine with real touch input can
// report. jsdom has no scroll, no pan and no `touch-action`, so `SnapSheet.test.tsx` covers the
// decision and this covers the browser.
//
// Driven through CDP touch for the reason `e2e/touch.ts` states: `page.touchscreen` can only tap.
// The component is the REAL one, mounted by `snap-sheet-harness.html` — the app cannot host it
// here (the sheet needs a canvas and the hermetic boot has no Maps key, ADR-0121 §13), and a
// markup copy would measure the copy. The harness is a dev-server file, so this spec skips under
// `E2E_PREVIEW`.
import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { dispatchTouch } from './touch';

test.skip(process.env.E2E_PREVIEW === '1', 'the harness is served by the dev server only');

/** The pane the sheet is absolutely positioned inside (`snap-sheet-harness.html`). */
const PANE = 600;
const HALF = Math.round(PANE * 0.56);
const X = 195;
/** The sheet's top edge at the `full` stop: the pane minus the controls-row inset. */
const FULL_TOP = 46;
/** A press inside the BODY at each stop: the sheet is anchored at the pane's bottom and its top
 *  region is `MAP_SHEET_STRIP_H` (52px), so the body starts 52px below the sheet's top edge. */
const PRESS_Y = { half: PANE - HALF + 120, full: 200 } as const;
/** A press on the HANDLE ROW at the `full` stop. */
const HANDLE_Y = FULL_TOP + 20;

async function mount(page: Page, view: 'half' | 'full', contentPx = 2000) {
  await page.setViewportSize({ width: 390, height: PANE + 40 });
  await page.goto(`/e2e/snap-sheet-harness.html?view=${view}&content=${contentPx}`);
  await expect(page.locator('.wp-snapsheet')).toHaveAttribute('data-view', view);
  return page.context().newCDPSession(page);
}

function read(page: Page) {
  return page.evaluate(() => {
    const sheet = document.querySelector('.wp-snapsheet') as HTMLElement;
    const body = document.querySelector('.wp-snapsheet-body') as HTMLElement;
    return {
      view: sheet.dataset.view,
      scrollTop: Math.round(body.scrollTop),
      scrollable: body.scrollHeight > body.clientHeight,
      bodyTouch: getComputedStyle(body).touchAction,
      topTouch: getComputedStyle(document.querySelector('.wp-snapsheet-top')!).touchAction,
      contentHeight: Math.round(
        (document.querySelector('.content') as HTMLElement).getBoundingClientRect().height,
      ),
    };
  });
}

const setScroll = (page: Page, px: number) =>
  page.evaluate((v) => {
    (document.querySelector('.wp-snapsheet-body') as HTMLElement).scrollTop = v;
  }, px);

/** One finger, pressed at `y`, travelling `dy` as a DELIBERATE drag. The timestamps are the
 *  point: CDP delivers moves a frame apart, so 12 steps of 20px read as 1.3px/ms — a flick, which
 *  commits to the next stop in its direction rather than the nearest — and this spec is about
 *  where a drag lands, so the gesture states its own slow clock (`e2e/touch.ts`). */
async function drag(cdp: CDPSession, y: number, dy: number) {
  const steps = 12;
  const stepMs = 80;
  const t0 = Date.now() / 1000;
  await dispatchTouch(cdp, 'touchStart', [{ x: X, y }], t0);
  for (let i = 1; i <= steps; i++) {
    await dispatchTouch(
      cdp,
      'touchMove',
      [{ x: X, y: y + (dy * i) / steps }],
      t0 + (i * stepMs) / 1000,
    );
  }
  await dispatchTouch(cdp, 'touchEnd', [], t0 + ((steps + 1) * stepMs) / 1000);
}

test.describe('the sheet’s body as a drag target', () => {
  test('the body declares no touch-action of its own; the handle row still does', async ({
    page,
  }) => {
    await mount(page, 'half');
    const m = await read(page);
    expect(m.scrollable).toBe(true);
    expect(m.bodyTouch).toBe('auto');
    expect(m.topTouch).toBe('none');
  });

  // **The correction, measured.** With more list below, an upward finger scrolls the list and
  // the sheet stays where it was — the hook stood down and Chromium kept its pan.
  test('at half with more list below, a drag up scrolls the list and moves no sheet', async ({
    page,
  }) => {
    const cdp = await mount(page, 'half');
    await drag(cdp, PRESS_Y.half, -200);
    const m = await read(page);
    expect(m.view).toBe('half');
    expect(m.scrollTop).toBeGreaterThan(100);
  });

  test('at half with the list at its bottom, a drag up grows the sheet to full', async ({
    page,
  }) => {
    const cdp = await mount(page, 'half');
    await setScroll(page, 99999);
    await drag(cdp, PRESS_Y.half, -240);
    await expect(page.locator('.wp-snapsheet')).toHaveAttribute('data-view', 'full');
  });

  // **The third reading, measured.** The list has 100px left to scroll from `half`; the finger
  // travels 320. Every pixel is the browser's pan: the list ends up at its bottom and the sheet
  // has not moved. Then a NEW swipe, with the list already there, opens it from the first pixel.
  test('a long drag up scrolls the list to its end and stops there; the next swipe opens the sheet', async ({
    page,
  }) => {
    const bodyAtHalf = HALF - 52;
    const cdp = await mount(page, 'half', bodyAtHalf + 100);
    await drag(cdp, PRESS_Y.half, -320);
    const m = await read(page);
    expect(m.view).toBe('half');
    expect(m.scrollable).toBe(true);
    expect(m.scrollTop).toBeGreaterThanOrEqual(99);
    await drag(cdp, PRESS_Y.half, -240);
    await expect(page.locator('.wp-snapsheet')).toHaveAttribute('data-view', 'full');
  });

  test('at half with the list at its top, a drag down shrinks the sheet', async ({ page }) => {
    const cdp = await mount(page, 'half');
    await drag(cdp, PRESS_Y.half, 200);
    await expect(page.locator('.wp-snapsheet')).toHaveAttribute('data-view', 'map');
  });

  test('at full with more list below, a drag up is the list’s native scroll', async ({ page }) => {
    const cdp = await mount(page, 'full');
    await drag(cdp, PRESS_Y.full, -240);
    const m = await read(page);
    expect(m.view).toBe('full');
    expect(m.scrollTop).toBeGreaterThan(100);
  });

  test('at full with the list at its top, a drag down shrinks the sheet', async ({ page }) => {
    const cdp = await mount(page, 'full');
    await drag(cdp, PRESS_Y.full, 220);
    await expect(page.locator('.wp-snapsheet')).toHaveAttribute('data-view', 'half');
  });

  // A list scrolled below its top owns the downward gesture until it reaches its top; a short
  // drag only scrolls it back.
  test('at full, a short drag down on a scrolled list scrolls it back and moves no sheet', async ({
    page,
  }) => {
    const cdp = await mount(page, 'full');
    await setScroll(page, 300);
    await drag(cdp, PRESS_Y.full, 160);
    const m = await read(page);
    expect(m.view).toBe('full');
    expect(m.scrollTop).toBeLessThan(300);
    expect(m.scrollTop).toBeGreaterThan(0);
  });

  // …and a long one reaches the top and stops there; the next swipe down closes the sheet.
  test('a long drag down scrolls a list to its top and stops there; the next swipe shrinks the sheet', async ({
    page,
  }) => {
    const cdp = await mount(page, 'full');
    await setScroll(page, 80);
    await drag(cdp, PRESS_Y.full, 320);
    const m = await read(page);
    expect(m.view).toBe('full');
    expect(m.scrollTop).toBe(0);
    await drag(cdp, PRESS_Y.full, 220);
    await expect(page.locator('.wp-snapsheet')).toHaveAttribute('data-view', 'half');
  });

  // The handle row is the target that works at every stop, whatever the list is doing.
  test('the handle row still drags a scrolled list’s sheet down', async ({ page }) => {
    const cdp = await mount(page, 'full');
    await setScroll(page, 300);
    await drag(cdp, HANDLE_Y, 260);
    await expect(page.locator('.wp-snapsheet')).toHaveAttribute('data-view', 'half');
  });

  // The body is a plain block scroller. It was briefly a flex column to host a spacer, and that
  // had a trap in it worth one assertion: flex items default to `flex-shrink: 1`, so a long list
  // would have been COMPRESSED to fit rather than overflowing — the scroll silently ceasing to
  // exist on the one region this component has.
  test('never compresses the content to fit, so the scroll survives', async ({ page }) => {
    await mount(page, 'half', PANE * 2);
    const m = await read(page);
    expect(m.contentHeight).toBe(PANE * 2);
    expect(m.scrollable).toBe(true);
  });
});

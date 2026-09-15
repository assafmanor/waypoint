// **THE SHEET'S BODY AS A DRAG TARGET, MEASURED IN A REAL ENGINE** (ADR-0122 §4's 2026-09-15
// amendment, which replaced the 2026-08-06 one).
//
// The 2026-08-06 rule — "the body drags while it cannot scroll" — carried its whole claim in one
// CSS attribute, so this spec asserted `touch-action` and nothing else. The rule now is about the
// DIRECTION of the gesture against the state of the list: **up is the sheet's while the sheet can
// still grow; down is the sheet's while the list is at its top**; the rest is the list's own
// scroll. The claim is a `preventDefault` on the `touchmove` at the slop, and whether that really
// keeps Chromium from starting its pan — and really lets it when the hook stands down — is a fact
// only a real engine with real touch input can report. jsdom has no scroll, no pan and no
// `touch-action`, so `SnapSheet.test.tsx` covers the decision and this covers the browser.
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

  // From `half` a drag up OPENS the list rather than scrolling it — the choice every native
  // bottom sheet makes — and the travel the top stop refuses becomes the list's scroll, so one
  // gesture both opens the list and starts reading it.
  test('at half, a drag up on a scrollable list grows the sheet, then scrolls it', async ({
    page,
  }) => {
    const cdp = await mount(page, 'half');
    await drag(cdp, PRESS_Y.half, -(PANE - HALF - FULL_TOP + 120));
    await expect(page.locator('.wp-snapsheet')).toHaveAttribute('data-view', 'full');
    const m = await read(page);
    expect(m.scrollTop).toBeGreaterThan(60);
  });

  test('at half, a drag down on a list at its top shrinks the sheet', async ({ page }) => {
    const cdp = await mount(page, 'half');
    await drag(cdp, PRESS_Y.half, 200);
    await expect(page.locator('.wp-snapsheet')).toHaveAttribute('data-view', 'map');
  });

  // **The hand-off in the other direction.** At the top stop the sheet cannot grow, so the hook
  // stands down and Chromium's own pan scrolls the list — the assertion that the `preventDefault`
  // claim is per gesture and not a blanket one.
  test('at full, a drag up is the list’s native scroll', async ({ page }) => {
    const cdp = await mount(page, 'full');
    await drag(cdp, PRESS_Y.full, -240);
    const m = await read(page);
    expect(m.view).toBe('full');
    expect(m.scrollTop).toBeGreaterThan(100);
  });

  test('at full, a drag down on a list at its top shrinks the sheet', async ({ page }) => {
    const cdp = await mount(page, 'full');
    await drag(cdp, PRESS_Y.full, 220);
    await expect(page.locator('.wp-snapsheet')).toHaveAttribute('data-view', 'half');
  });

  // A list scrolled below its top owns the downward gesture: the finger is asking to read what
  // is above, and a sheet that closed instead would take the list away mid-read.
  test('at full, a drag down on a scrolled list scrolls it back and moves no sheet', async ({
    page,
  }) => {
    const cdp = await mount(page, 'full');
    await setScroll(page, 300);
    await drag(cdp, PRESS_Y.full, 200);
    const m = await read(page);
    expect(m.view).toBe('full');
    expect(m.scrollTop).toBeLessThan(300);
    expect(m.scrollTop).toBeGreaterThanOrEqual(0);
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

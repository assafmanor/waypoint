// **THE SHEET'S EMPTY AREA, MEASURED IN A REAL ENGINE** (ADR-0122 §4's 2026-08-06 amendment).
//
// The owner's report is that the 51px handle row is the only way to change stops, and that a
// sheet whose body is mostly blank is exactly where a bigger target costs nothing: _"sometimes
// there's a lot of free space that I feel like it would be easier and more intuitive to scroll
// from, for example when the list is empty or there's a large area that's empty"_.
//
// The answer is one flex spacer after the content, and **the whole gate is flexbox**: `flex: 1 0 0`
// gives it the space the content did not take, so it is the gap below a short list and zero below a
// long one — which is precisely when a drag there would be fighting the list's own scroll. That is
// a layout fact, and `SnapSheet.test.tsx` says in as many words that it cannot answer it: jsdom
// lays nothing out, so `flex: 1 0 0` and a long list's zero are the same nothing to it.
//
// It also cannot be driven through the app: the sheet needs a canvas, the hermetic boot has no Maps
// key, and the list-only path renders no sheet at all (ADR-0121 §13). So the harness is the same
// shape `map-pin-photo.spec.ts` uses for the pin's photograph — the app's OWN stylesheet over
// markup mirroring `SnapSheet`, in Chromium — and it asserts the two numbers the mechanism rests
// on, plus the two rules that would silently undo it.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const TOKENS = fileURLToPath(new URL('../src/styles/tokens.css', import.meta.url));
const SHEET = fileURLToPath(new URL('../src/ui/primitives/snap-sheet.css', import.meta.url));

/** The pane the sheet is absolutely positioned inside, and the `half` stop's own height. */
const PANE = 600;
const SHEET_H = Math.round(PANE * 0.56);

/** `contentPx` is what the caller's rows add up to — the one variable that decides whether there
 *  is an empty area at all. */
async function board(page: Page, contentPx: number) {
  await page.setViewportSize({ width: 390, height: PANE + 40 });
  // Mirrors `SnapSheet`'s tree: the top region, then the body holding the caller's content and
  // the slack after it. The pane is what the sheet is absolutely positioned against.
  await page.setContent(`
    <div class="pane" style="position:relative;height:${PANE}px">
      <div class="wp-snapsheet" style="--snap-h:${SHEET_H}px" data-view="half">
        <div class="wp-snapsheet-top">
          <button class="wp-snapsheet-grab" role="separator">
            <span class="wp-snapsheet-grabline"></span>
          </button>
        </div>
        <div class="wp-snapsheet-body">
          <div class="content" style="height:${contentPx}px"></div>
          <div class="wp-snapsheet-slack" aria-hidden="true"></div>
        </div>
      </div>
    </div>`);
  // `addStyleTag({ path })` and NOT a `file://` link: `setContent` leaves the document on
  // `about:blank`, which blocks a file subresource — so the linked version silently applied no
  // CSS at all and every measurement here read the browser's defaults. The same idiom
  // `map-pin-photo.spec.ts` uses, for the same reason.
  await page.addStyleTag({ path: TOKENS });
  await page.addStyleTag({ path: SHEET });
  await page.addStyleTag({ content: 'body { margin: 0 }' });
}

function read(page: Page) {
  return page.evaluate(() => {
    const box = (sel: string) => {
      const el = document.querySelector(sel) as HTMLElement;
      return Math.round(el.getBoundingClientRect().height);
    };
    const body = document.querySelector('.wp-snapsheet-body') as HTMLElement;
    return {
      slack: box('.wp-snapsheet-slack'),
      content: box('.content'),
      body: box('.wp-snapsheet-body'),
      scrollable: body.scrollHeight > body.clientHeight,
      touchAction: getComputedStyle(document.querySelector('.wp-snapsheet-slack')!).touchAction,
    };
  });
}

test.describe('the sheet’s empty area as a drag target', () => {
  // The reported case: a short list — or an empty one — in a sheet with room to spare.
  test('claims every pixel the content did not take', async ({ page }) => {
    await board(page, 80);
    const m = await read(page);
    expect(m.content).toBe(80);
    // The gap below the list IS the slack: nothing is left over between them.
    expect(m.slack).toBe(m.body - m.content);
    expect(m.slack).toBeGreaterThan(100);
    // And there is nothing to scroll, which is what makes the drag safe here rather than a
    // gesture competing with the list.
    expect(m.scrollable).toBe(false);
  });

  // The empty state is the same case at its limit, and it is the one the owner named first.
  test('is nearly the whole body when the list is empty', async ({ page }) => {
    await board(page, 0);
    const m = await read(page);
    expect(m.slack).toBe(m.body);
  });

  // **THE GATE.** A list taller than the sheet leaves no empty area, so there is nothing to grab —
  // and the drag never has to arbitrate against the scroll, because the two states cannot both be
  // true. This is the assertion that keeps that claim honest.
  test('collapses to nothing once the list fills the sheet, leaving the scroll alone', async ({
    page,
  }) => {
    await board(page, PANE * 2);
    const m = await read(page);
    expect(m.slack).toBe(0);
    expect(m.scrollable).toBe(true);
  });

  // **THE TRAP THIS COULD HAVE SHIPPED WITH.** Making a scroller a flex column gives its children
  // `flex-shrink: 1`, so content taller than the port is COMPRESSED to fit instead of overflowing —
  // the scroll stops existing on the one region this component has. It is invisible to the unit
  // suite and it is one line of CSS away at all times.
  test('never compresses the content to fit — the scroll survives the flex column', async ({
    page,
  }) => {
    await board(page, PANE * 2);
    const m = await read(page);
    expect(m.content).toBe(PANE * 2);
    expect(m.content).toBeGreaterThan(m.body);
  });

  // The browser must not claim the vertical pan before the first `pointermove` arrives — the same
  // reason the top region carries it. Safe here only because this element has height only when
  // there is nothing to pan, which the tests above are what establish.
  test('takes the pan, like the handle row above it', async ({ page }) => {
    await board(page, 80);
    expect((await read(page)).touchAction).toBe('none');
  });
});

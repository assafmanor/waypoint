// **THE SHEET'S BODY AS A DRAG TARGET, MEASURED IN A REAL ENGINE** (ADR-0122 §4's 2026-08-06
// amendment).
//
// §4 widened the target from a 76×16px handle to a 390×51 region and stopped there, so a sheet
// whose list fits offers a thin stripe over a large useless area. The owner's report is that the
// area should work too: _"when the list doesn't scroll (or there's text that's not list items, for
// example the empty state has a glyph+text that doesn't allow us to scroll), we should be able to
// use the same gesture"_.
//
// **The rule is one fact — the body drags while it cannot scroll — and that fact is what makes it
// tractable.** Dragging from a scroller is genuinely hard: `touch-action: none` is what lets a drag
// be seen at all and is exactly what makes a list unscrollable, and a native pan cannot be taken
// over once the browser has started one. None of it arises when the content fits, because then no
// pan can start.
//
// **So `touch-action` is the assertion that matters here, and only a real engine has it.** jsdom
// has no layout and no computed `touch-action`, so `SnapSheet.test.tsx` can reach the gate (its
// scroll metrics are stubbed, which IS the scenario) and not one pixel of this. The harness is the
// same shape `map-pin-photo.spec.ts` uses: the app's OWN stylesheet over markup mirroring
// `SnapSheet`, in Chromium.
//
// It cannot be driven through the app either — the sheet needs a canvas, the hermetic boot has no
// Maps key, and the list-only path renders no sheet at all (ADR-0121 §13).
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const TOKENS = fileURLToPath(new URL('../src/styles/tokens.css', import.meta.url));
const SHEET = fileURLToPath(new URL('../src/ui/primitives/snap-sheet.css', import.meta.url));

/** The pane the sheet is absolutely positioned inside, and the `half` stop's own height. */
const PANE = 600;
const SHEET_H = Math.round(PANE * 0.56);

/** `contentPx` is what the caller's rows add up to — the one variable that decides everything
 *  here. `drags` mirrors what the component's observer would have written for that content, so
 *  the CSS is asserted against the state it will really be in. */
async function board(page: Page, contentPx: number) {
  await page.setViewportSize({ width: 390, height: PANE + 40 });
  const drags = contentPx <= SHEET_H - 52 ? ' data-drag=""' : '';
  // Mirrors `SnapSheet`'s tree: the top region, then the body holding the caller's content.
  await page.setContent(`
    <div class="pane" style="position:relative;height:${PANE}px">
      <div class="wp-snapsheet" style="--snap-h:${SHEET_H}px" data-view="half">
        <div class="wp-snapsheet-top">
          <button class="wp-snapsheet-grab" role="separator">
            <span class="wp-snapsheet-grabline"></span>
          </button>
        </div>
        <div class="wp-snapsheet-body"${drags}>
          <div class="content" style="height:${contentPx}px"></div>
        </div>
      </div>
    </div>`);
  // `addStyleTag({ path })` and NOT a `file://` link: `setContent` leaves the document on
  // `about:blank`, which blocks a file subresource — so the linked version silently applied no
  // CSS at all and every measurement read the browser's defaults. The same idiom
  // `map-pin-photo.spec.ts` uses, for the same reason.
  await page.addStyleTag({ path: TOKENS });
  await page.addStyleTag({ path: SHEET });
  await page.addStyleTag({ content: 'body { margin: 0 }' });
}

function read(page: Page) {
  return page.evaluate(() => {
    const body = document.querySelector('.wp-snapsheet-body') as HTMLElement;
    const top = document.querySelector('.wp-snapsheet-top') as HTMLElement;
    return {
      scrollable: body.scrollHeight > body.clientHeight,
      bodyTouch: getComputedStyle(body).touchAction,
      topTouch: getComputedStyle(top).touchAction,
      bodyHeight: Math.round(body.getBoundingClientRect().height),
      contentHeight: Math.round(
        (document.querySelector('.content') as HTMLElement).getBoundingClientRect().height,
      ),
    };
  });
}

test.describe('the sheet’s body as a drag target', () => {
  // The reported case, and its limit: a short list, and an empty state's glyph-and-text block.
  // The old spacer only claimed space AFTER the content, so a tall empty state left it nothing —
  // which is why the rule moved to the body itself.
  for (const [name, contentPx] of [
    ['a short list', 80],
    ['an empty state that fills most of the body', SHEET_H - 60],
  ] as const) {
    test(`takes the vertical gesture with ${name}`, async ({ page }) => {
      await board(page, contentPx);
      const m = await read(page);
      // Nothing to scroll — which is the entire reason taking the pan costs nothing.
      expect(m.scrollable).toBe(false);
      expect(m.bodyTouch).toBe('none');
      // The same value the handle row above it carries: one gesture, two targets.
      expect(m.bodyTouch).toBe(m.topTouch);
    });
  }

  // **THE GATE.** Once the list outgrows the sheet the pan is the browser's again, and this is
  // the assertion that keeps the whole claim honest: the drag never competes with a scroll,
  // because the attribute that enables it is absent in exactly that state.
  test('hands the pan back once the list outgrows the sheet', async ({ page }) => {
    await board(page, PANE * 2);
    const m = await read(page);
    expect(m.scrollable).toBe(true);
    expect(m.bodyTouch).not.toBe('none');
    // The handle row is unaffected — it is the target that works at every stop.
    expect(m.topTouch).toBe('none');
  });

  // The body is a plain block scroller again. It was briefly a flex column to host a spacer, and
  // that had a trap in it worth one assertion: flex items default to `flex-shrink: 1`, so a long
  // list would have been COMPRESSED to fit rather than overflowing — the scroll silently ceasing
  // to exist on the one region this component has.
  test('never compresses the content to fit, so the scroll survives', async ({ page }) => {
    await board(page, PANE * 2);
    const m = await read(page);
    expect(m.contentHeight).toBe(PANE * 2);
    expect(m.contentHeight).toBeGreaterThan(m.bodyHeight);
  });
});

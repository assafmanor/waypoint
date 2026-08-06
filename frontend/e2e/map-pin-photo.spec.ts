// **THE PIN'S PHOTOGRAPH, MEASURED IN A REAL ENGINE** (ADR-0167 §16 and its 2026-08-05 and
// 2026-08-06 amendments — the latter retiring the canvas-height gate, so what decides whether a
// photograph is drawn is now the pin's own tier and nothing else).
//
// Every other spec in here drives the app. This one cannot: the canvas needs a Maps key and the
// hermetic boot has none (ADR-0121 §13), so no pin has ever been rendered by a test. That gap is
// exactly where the reported defect lived — a full-size pin at country zoom drew an EMPTY head,
// because the photo was hidden off the pane's `data-pins='dot'` while the photographed paint,
// which keys on `:has(.pin-photo)`, stayed. Both halves are pure CSS, and all three mechanisms
// that produced it — a container query, `:has()`, and one selector out-specifying another — are
// things jsdom models as nothing at all. The container query is gone now and the other two are
// not, which is why this file is still the only thing that can see either.
//
// So the harness is the app's OWN stylesheets over markup mirroring `MapPane`'s pin, in Chromium.
// What it cannot see is what a photograph LOOKS like at 35px; that stays the device pass.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const TOKENS = fileURLToPath(new URL('../src/styles/tokens.css', import.meta.url));
const PANE = fileURLToPath(new URL('../src/ui/domain/map-pane.css', import.meta.url));

// A 1×1 transparent GIF. The question is which rules fire, so a real photograph would add a
// network dependency and answer nothing.
const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

// Two canvas heights, kept after the size gate was retired (ADR-0167 §16's third amendment)
// rather than collapsed into one: 436px of pane used to be the threshold — 48px of pin — so
// `SHORT` is the height that used to withhold a photograph and is now the sharpest place to
// assert that nothing does but the pin's own tier.
const TALL = 700;
const SHORT = 400;

type Board = {
  /** The canvas the container query reads — the pane is the sheet's leftovers, so this is a stop. */
  height?: number;
  scope?: 'day' | 'all';
  /** `data-pins='dot'`: the zoom is below `MAP_ZOOM.DOT_BELOW`. */
  dots?: boolean;
  /** The errand's context demotion (`data-choosing`). */
  choosing?: boolean;
  /** The pin's own tier/state classes: `aside`, `ghost aside`, `nextstop`, `selected`, … */
  pin?: string;
  cat?: string;
  photo?: boolean;
};

async function board(page: Page, o: Board = {}) {
  const {
    height = TALL,
    scope = 'day',
    dots = false,
    choosing = false,
    pin = '',
    cat = 'cat-food',
    photo = true,
  } = o;
  // Mirrors `MapPane`'s pin: `.pin-photo` and `.pin-g` inside `.pin-b`, the counter its sibling.
  await page.setContent(`
    <div class="map-screen" data-scope="${scope}"${choosing ? ' data-choosing="place"' : ''}
         style="position:relative;width:390px;height:${height}px">
      <div class="map-pane"${dots ? ' data-pins="dot"' : ''}>
        <div class="map-pin ${cat} ${pin}" role="button" aria-label="place">
          <span class="pin-b">
            ${photo ? `<span class="pin-photo"><img src="${PIXEL}" alt=""></span>` : ''}
            <span class="pin-g">🍜</span>
          </span>
          <span class="pin-n">1</span>
        </div>
      </div>
    </div>`);
  await page.addStyleTag({ path: TOKENS });
  await page.addStyleTag({ path: PANE });
}

async function read(page: Page) {
  return page.evaluate(() => {
    // Tokens resolved by the engine rather than copied here, so a re-tuned palette cannot make
    // this spec assert a colour the app stopped using.
    const token = (name: string) => {
      const el = document.createElement('span');
      el.style.color = `var(${name})`;
      document.body.append(el);
      const resolved = getComputedStyle(el).color;
      el.remove();
      return resolved;
    };
    const photo = document.querySelector('.pin-photo');
    const head = getComputedStyle(document.querySelector('.pin-b')!);
    const glyph = document.querySelector('.pin-g')!;
    return {
      photoDrawn: !!photo && getComputedStyle(photo).display !== 'none',
      glyphDrawn: getComputedStyle(glyph).display !== 'none',
      head: head.backgroundColor,
      edge: head.borderTopColor,
      ring: head.boxShadow,
      card: token('--card'),
      food: token('--cat-food'),
      transit: token('--cat-transit'),
      amber: token('--amber'),
    };
  });
}

test.describe('the photograph on a pin', () => {
  test('fills a full-size head, moving the hue to a ring and dropping the glyph', async ({
    page,
  }) => {
    await board(page);
    const m = await read(page);
    expect(m.photoDrawn).toBe(true);
    // The picture IS the answer the glyph stood in for, so they never share the slot.
    expect(m.glyphDrawn).toBe(false);
    expect(m.head).toBe(m.card);
    expect(m.ring).toContain(m.food);
  });

  // **THE CANVAS'S HEIGHT NO LONGER GATES IT** (ADR-0167 §16's third amendment; owner,
  // 2026-08-06: _"on half mode the pins don't render the thumbnail … we need to be more
  // consistent and render thumbnails when displaying a pin"_). The measurement behind the old
  // `@container (min-height: 436px)` was right — at `half` a 34px pin carries ~21px of picture —
  // and what was wrong was the conclusion: a pin that shows a photograph at one sheet stop and a
  // glyph at the next changes what kind of object it is on a drag. This asserts the inversion
  // directly, at the height the gate used to refuse, so nobody re-adds the threshold by accident.
  test('is drawn on a short canvas too, where the size gate used to refuse it', async ({
    page,
  }) => {
    await board(page, { height: SHORT });
    const m = await read(page);
    expect(m.photoDrawn).toBe(true);
    // And the photographed paint goes with it, which is the half that used to come apart when
    // the two were decided by different rules: the head is `--card` and the glyph is gone.
    expect(m.glyphDrawn).toBe(false);
    expect(m.head).toBe(m.card);
    expect(m.ring).toContain(m.food);
  });

  // The surviving axis, at the same short canvas — so the two are tested where they used to
  // disagree. The pin's TIER is the only thing that withholds a photograph now.
  test('…and still goes to the dot tier there, hue and all', async ({ page }) => {
    await board(page, { height: SHORT, dots: true, scope: 'day', pin: 'aside' });
    const m = await read(page);
    expect(m.photoDrawn).toBe(false);
    expect(m.glyphDrawn).toBe(false);
    expect(m.head).toBe(m.food);
  });

  // **THE REPORT** (owner, 2026-08-05, with a screenshot of Iceland at country zoom): _"the
  // thumbnails aren't rendering into the pins … even when zoomed out the pins are full size, and
  // in these cases there's no thumbnail"_. `data-pins='dot'` is a fact about the PANE, but the
  // dot tier is scoped — in day scope only the `.aside` pins become dots — so hiding the photo
  // off the pane's attribute took it off a full-size numbered stop, and the `:has()` paint that
  // stayed left a `--card` head with no glyph in it: an empty pin.
  test('survives a zoom-out on a pin that does not become a dot', async ({ page }) => {
    await board(page, { dots: true, scope: 'day' });
    const m = await read(page);
    expect(m.photoDrawn).toBe(true);
    expect(m.head).toBe(m.card);
  });

  test('goes when the pin itself goes to a dot, and the hue comes back with the fill', async ({
    page,
  }) => {
    await board(page, { dots: true, scope: 'day', pin: 'aside' });
    const m = await read(page);
    expect(m.photoDrawn).toBe(false);
    expect(m.glyphDrawn).toBe(false);
    // A dot with a card-coloured face is a hole in the canvas: the photo's absence has to give
    // the head its category hue back.
    expect(m.head).toBe(m.food);
  });

  test('degrades with everything else in all-days, where the amber pins are the exception', async ({
    page,
  }) => {
    await board(page, { dots: true, scope: 'all' });
    expect(await read(page)).toMatchObject({ photoDrawn: false });
    // The one pin all-days spares at the dot tier keeps its picture too — it is a full pin.
    await board(page, { dots: true, scope: 'all', pin: 'nextstop' });
    expect(await read(page)).toMatchObject({ photoDrawn: true });
  });

  // ADR-0109 §6 spends the canvas's whole accent budget on ONE amber cue. `:has()` counts its
  // argument's specificity, so the category ring (4 classes) silently outranked `.nextstop` (3)
  // and a photographed next stop lost the one mark that says it is next.
  test('never costs a next stop its amber, which outranks a category ring', async ({ page }) => {
    await board(page, { pin: 'nextstop' });
    const m = await read(page);
    expect(m.photoDrawn).toBe(true);
    expect(m.ring).toContain(m.amber);
    expect(m.ring).not.toContain(m.food);
  });

  test('is backdrop under an errand, and keeps its picture on what you are choosing', async ({
    page,
  }) => {
    await board(page, { choosing: true });
    expect(await read(page)).toMatchObject({ photoDrawn: false, glyphDrawn: false });
    await board(page, { choosing: true, pin: 'selected' });
    expect(await read(page)).toMatchObject({ photoDrawn: true });
  });
});

// The hue is one variable now, read by the fill, the ring and the ghost's outline. These two say
// it still reaches all three per category — the thing five-rules-per-consumer was doing before.
test.describe('one hue per pin', () => {
  test('paints each category its own fill', async ({ page }) => {
    await board(page, { cat: 'cat-transit', photo: false });
    const m = await read(page);
    expect(m.head).toBe(m.transit);
  });

  test('pencils a ghost in its own category, and leaves it hollow', async ({ page }) => {
    await board(page, { cat: 'cat-transit', pin: 'ghost aside', photo: false });
    const transit = await read(page);
    await board(page, { cat: 'cat-food', pin: 'ghost aside', photo: false });
    const food = await read(page);
    // Hollow is the point: there is nothing of this day in it.
    expect(transit.head).toBe('rgba(0, 0, 0, 0)');
    expect(transit.edge).not.toBe(food.edge);
  });
});

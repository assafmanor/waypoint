// **THE WHEN IS OPERABLE** (ADR-0177) — two things only a real browser can answer,
// and both shipped broken because nothing here was asking.
//
//  1. **A date token can actually be opened.** The token's touch target is an `::after`
//     overlay (ADR-0161 §7's trick, which is how the 44px floor is met without growing
//     the line). A pseudo-element is painted after its siblings and takes pointer
//     events — harmless over a `<button>`, whose press the button under it handles
//     anyway, and FATAL over a date, whose real control is the native `<input>` inside
//     the token (ADR-0176). It swallowed every tap and no date in the app could be
//     changed. The unit tests could not see it, and neither could the e2e suite,
//     because every spec that touches a date uses `.fill()` — which sets the value
//     programmatically and never hit-tests. So this one CLICKS.
//
//  2. **"ללא שעה" is our control, not the browser's.** A regex deleting the retired
//     cell chrome ate one selector too many and left `.tp-clear`'s rule as
//     `.tp-dur .tp-clear`, which matches nothing — so the button fell back to the UA
//     stylesheet and rendered as a light box in a dark form. It looked like a bug
//     because it was one, and a class name is not evidence that a rule applies.
import { test, expect, type Page } from '@playwright/test';
import { bootIntoCreate, bootIntoTrip, shortLiveTripDates } from './boot';
import { t } from '../src/i18n/he';

const form = (page: Page) => page.getByRole('dialog').first();

const PLAN_MODE = t.mode.plan;
const NEW_EVENT = 'אירוע חדש';

async function openEventForm(page: Page) {
  await page.getByRole('button', { name: PLAN_MODE, exact: true }).click();
  await page.locator('nav.nav button', { hasText: t.tabs.days }).click();
  await expect(page).toHaveURL(/[?&]tab=days/);
  await page.getByText(NEW_EVENT).first().click();
  await expect(form(page)).toBeVisible();
}

test.describe('a when can be operated', () => {
  test.beforeEach(async ({ page }) => {
    await bootIntoTrip(page, { dates: shortLiveTripDates() });
    await page.goto('/');
    await openEventForm(page);
  });

  test('tapping the date token reaches the native input, not an overlay', async ({ page }) => {
    const token = form(page).locator('.vt-date').first();
    const input = token.locator('input[type="date"]');
    await expect(token).toBeVisible();

    // A real press at the token's centre. If anything is painted over the input —
    // the target overlay, the face, a host's chrome — focus lands elsewhere and the
    // field is dead to a finger however healthy its rect looks.
    await token.click();
    await expect(input).toBeFocused();
  });

  test('the date target still reaches ADR-0017 floor, without growing the token', async ({
    page,
  }) => {
    // The whole reason the reach exists: a real `min-height` would grow every form. The token
    // stays its own size and its `::after` reaches the 44px, so a point 20px off its centre is
    // still the token — the element whose click opens the picker.
    const token = form(page).locator('.vt-date').first();
    const box = (await token.boundingBox())!;
    expect(box.height).toBeLessThan(44);
    const reached = await token.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const x = r.x + r.width / 2;
      const y = r.y + r.height / 2;
      return [y - 20, y + 20].map((py) => el.contains(document.elementFromPoint(x, py)));
    });
    expect(reached).toEqual([true, true]);
  });

  test('the whole token opens the picker, wherever the engine lays out its input', async ({
    page,
  }) => {
    // The token, not the native input, is the target (field reports from a Galaxy S25 Ultra:
    // only the token's left end opened anything, twice, through two different layout causes).
    // So the spec gives the input the worst layout an engine could choose — a sliver at one end
    // — and still expects every point of the token and its reach to open the picker.
    await page.addStyleTag({
      content: '.df .df-input { inline-size: 10px !important; block-size: 10px !important; }',
    });
    await page.evaluate(() => {
      const w = window as unknown as { __pickers: number };
      w.__pickers = 0;
      HTMLInputElement.prototype.showPicker = function () {
        w.__pickers++;
      };
    });
    // A click lands at coordinates, so the sheet must have finished arriving before they are read.
    await page
      .locator('.modal-card')
      .first()
      .evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished.catch(() => {}))));
    const token = form(page).locator('.vt-date').first();
    const input = token.locator('input[type="date"]');
    const box = (await token.boundingBox())!;
    const midY = box.y + box.height / 2;
    const points = [
      [box.x + box.width - 3, midY], // the end the Galaxy refused: where RTL words start
      [box.x + box.width / 2, midY],
      [box.x + 3, midY],
      // ADR-0017's 44px reach, above and below a token shorter than that
      [box.x + box.width / 2, midY - 20],
      [box.x + box.width / 2, midY + 20],
    ];
    for (const [i, [x, y]] of points.entries()) {
      await page.mouse.click(x, y);
      await expect(input).toBeFocused();
      await expect
        .poll(() => page.evaluate(() => (window as unknown as { __pickers: number }).__pickers))
        .toBe(i + 1);
      await input.evaluate((el) => (el as HTMLInputElement).blur());
    }
  });

  test('a date typed into the token is the date the form holds', async ({ page }) => {
    const input = form(page).locator('.vt-date input[type="date"]').first();
    await input.fill('2026-09-12');
    await expect(input).toHaveValue('2026-09-12');
    // The face is ours, not the platform's (ADR-0176), and inside a trip it reads by
    // name (ADR-0177 §4) — so the visible text is Hebrew, never `09/12/2026`.
    await expect(form(page).locator('.vt-date .df-face').first()).toContainText('בספט׳');
  });

  // **THE CLOSED FIELD IS OURS, EVEN AFTER THE PICKER HAS BEEN IN IT** (field report
  // #36). The face used to step aside on `:focus-within`, which was the same thing as
  // "the platform's picker owns the screen" only until a phone was holding it: the
  // picker leaves the input FOCUSED when it closes, so the field then read the
  // platform's own format and clipped it — in exactly the state a reader checks the date
  // they just entered. Measured here rather than asserted in jsdom, because what was
  // wrong was a computed style and a box, and neither is visible to the unit suite.
  test('the field still reads by name after a real press has focused it', async ({ page }) => {
    const token = form(page).locator('.vt-date').first();
    const input = token.locator('input[type="date"]');
    await input.fill('2026-09-12');

    await token.click();
    await expect(input).toBeFocused();
    // The reported string is the NATIVE control's rendering of the same date — the one
    // thing ADR-0176 exists to hide. So the assertion is that ours is what paints.
    await expect(token.locator('.df-face')).toBeVisible();
    await expect(token.locator('.df-face')).toContainText('בספט׳');
    await expect(input).toHaveCSS('opacity', '0');
  });

  // Android's text scaling multiplies computed font sizes, and every size in this app
  // derives from the three type tokens — so raising them is what a larger system font
  // does to this line. The owner's rule: the whole Hebrew date, at any scale, adapting
  // rather than shrinking, ellipsing or falling back to digits.
  for (const factor of [1.6, 2.2]) {
    test(`the date survives ${factor}x system text without clipping`, async ({ page }) => {
      const token = form(page).locator('.vt-date').first();
      await token.locator('input[type="date"]').fill('2026-09-12');
      await token.click();
      await page.addStyleTag({
        content: `:root { --text-body: ${14.5 * factor}px; --text-secondary: ${13 * factor}px; --text-caption: ${11 * factor}px; }`,
      });

      const face = token.locator('.df-face');
      // Visible, not merely present: what the report saw was OUR face stepped aside and
      // the native control's `12.9.2026` in its place, and a text assertion alone cannot
      // tell those apart — hidden text still matches.
      await expect(face).toBeVisible();
      await expect(face).toContainText('בספט׳');
      // A rect is not visibility (frontend/CLAUDE.md): what clipped was text overflowing
      // its own box, which only the scroll/client pair can see.
      const m = await face.evaluate((el) => ({
        overflow: el.scrollWidth - el.clientWidth,
        right: el.getBoundingClientRect().right,
      }));
      expect(m.overflow).toBeLessThanOrEqual(0);
      // …and the line it sits in reflows around it rather than cutting it off.
      const line = await form(page).locator('.wf-line').first().boundingBox();
      expect(m.right).toBeLessThanOrEqual(line!.x + line!.width + 1);
    });
  }

  // **THE PICKER'S CLEAR IS A CANCELLATION** (field report #38). Android's date picker
  // has a Clear button; the crash it caused was a render-path `RangeError` on the empty
  // date it reported, and with no error boundary anywhere the tree unmounted. The unit
  // tests pin the rollback; this one pins that a REAL control writing a real empty value
  // — through React's own value tracking, which a synthetic jsdom event bypasses — still
  // leaves an app on screen.
  test('a cleared date rolls back rather than blanking the app', async ({ page }) => {
    const token = form(page).locator('.vt-date').first();
    const input = token.locator('input[type="date"]');
    await input.fill('2026-09-12');
    await token.click();

    await input.evaluate((el: HTMLInputElement) => {
      // The platform writes the value itself, so React's tracker sees the change. The
      // prototype setter is how a test reaches past the instance property React patches.
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, '');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await expect(form(page)).toBeVisible();
    await expect(input).toHaveValue('2026-09-12');
    await expect(token.locator('.df-face')).toContainText('בספט׳');
  });

  test('"ללא שעה" is styled by us, not by the user agent', async ({ page }) => {
    // Give the event a time so the clear appears at all.
    await form(page).locator('.vt-time').first().click();
    await form(page).locator('.tp-list button').first().click();

    const clear = form(page).locator('button.tp-clear');
    await expect(clear).toBeVisible();
    // A UA-default button is a filled light box with a border. Ours is a quiet
    // underlined link on the form's own ground.
    await expect(clear).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(clear).toHaveCSS('border-top-style', 'none');
    await expect(clear).toHaveCSS('text-decoration-line', 'underline');
  });
});

// The range forms put two date tokens on ONE line, and the token's touch reach now
// extends past its own box (see `value-token.css`). Two things follow that only a
// browser can settle: the second token must still be independently reachable, and the
// ordering rule — an end may not precede its start — must reach the native control
// rather than living only in the save-time check.
test.describe('a two-date range stays operable and ordered', () => {
  test.beforeEach(async ({ page }) => {
    await bootIntoCreate(page);
  });

  test('both dates in one line are independently reachable', async ({ page }) => {
    const tokens = page.locator('.wf-line .vt-date');
    await expect(tokens).toHaveCount(2);

    // Each in turn, because an enlarged reach on the first is exactly what could
    // swallow the second.
    await tokens.nth(0).click();
    await expect(tokens.nth(0).locator('input')).toBeFocused();
    await tokens.nth(1).click();
    await expect(tokens.nth(1).locator('input')).toBeFocused();
  });

  test('a press at either end of a full-width date still opens it', async ({ page }) => {
    // `:active` shrinks a token about its centre and the click is hit-tested after that, so
    // the ends of a wide token used to click the line instead: 372px at 0.97 loses ~5.6px per
    // end. The reach is sized to give back exactly what the press takes.
    await page.evaluate(() => {
      const w = window as unknown as { __pickers: number };
      w.__pickers = 0;
      HTMLInputElement.prototype.showPicker = function () {
        w.__pickers++;
      };
    });
    const tokens = page.locator('.wf-line .vt-date');
    let expected = 0;
    for (const k of [0, 1]) {
      const box = (await tokens.nth(k).boundingBox())!;
      for (const x of [box.x + 2, box.x + box.width - 2]) {
        await page.mouse.click(x, box.y + box.height / 2);
        expected++;
        await expect
          .poll(() => page.evaluate(() => (window as unknown as { __pickers: number }).__pickers))
          .toBe(expected);
      }
    }
  });

  test('the end date cannot be set before the start, at the control', async ({ page }) => {
    const [start, end] = [
      page.locator('.wf-line .vt-date input').nth(0),
      page.locator('.wf-line .vt-date input').nth(1),
    ];
    // Every date here is floored at today even before a start is picked — a trip that
    // already ended is not a trip you are about to take.
    await expect(start).toHaveAttribute('min', /\d{4}-\d{2}-\d{2}/);

    await start.fill('2035-06-10');
    // The floor moves to the start the moment one exists, so the browser itself will
    // not offer an earlier arrival.
    await expect(end).toHaveAttribute('min', '2035-06-10');
  });
});

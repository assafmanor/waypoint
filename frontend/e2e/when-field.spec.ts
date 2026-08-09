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

const form = (page: Page) => page.getByRole('dialog').first();

const PLAN_MODE = 'תכנון';
const NEW_EVENT = 'אירוע חדש';

async function openEventForm(page: Page) {
  await page.getByRole('button', { name: PLAN_MODE, exact: true }).click();
  await page.locator('nav.nav button', { hasText: 'יום-יום' }).click();
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

  test('the date target still reaches ADR-0017 floor, on the input itself', async ({ page }) => {
    // The whole reason the overlay existed: a real `min-height` would grow every form.
    // A date reaches the same 44px by growing its INPUT past the token's box, which is
    // both the target and the control — so this asserts the box stayed small and the
    // hit area did not.
    const box = await form(page).locator('.vt-date').first().boundingBox();
    const hit = await form(page).locator('.vt-date input[type="date"]').first().boundingBox();
    expect(box).not.toBeNull();
    expect(hit).not.toBeNull();
    expect(hit!.height).toBeGreaterThanOrEqual(44);
    expect(hit!.height).toBeGreaterThan(box!.height);
  });

  test('a date typed into the token is the date the form holds', async ({ page }) => {
    const input = form(page).locator('.vt-date input[type="date"]').first();
    await input.fill('2026-09-12');
    await expect(input).toHaveValue('2026-09-12');
    // The face is ours, not the platform's (ADR-0176), and inside a trip it reads by
    // name (ADR-0177 §4) — so the visible text is Hebrew, never `09/12/2026`.
    await expect(form(page).locator('.vt-date .df-face').first()).toContainText('בספט׳');
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

// **A REFUSAL HAS TO BE SEEN** (ADR-0150) — and whether it is, is a question about
// computed style, which jsdom answers for nothing. The unit tests pin the behaviour
// (which field is marked, that every problem is reported at once, that addressing one
// retires it); this pins the two things only a real browser knows:
//
//  1. The refused control is actually painted in `--miss` **while it is focused** —
//     the refusal focuses the field it names, and `field.css`'s teal focus border
//     out-specifies a plain attribute selector, so the marked field would have been
//     drawn as the healthy focused one (§4). Every unit test stayed green through it.
//  2. The browser's own constraint validation does not get there first (§5): the form
//     is `noValidate`, so an out-of-trip date reaches the app's Hebrew refusal instead
//     of an untranslated bubble, and `submit` runs at all.
import { test, expect, type Page } from '@playwright/test';
import { bootIntoCreate, bootIntoTrip, shortLiveTripDates } from './boot';
import { t } from '../src/i18n/he';

const form = (page: Page) => page.getByRole('dialog').first();

const PLAN_MODE = t.mode.plan;
const NEW_EVENT = 'אירוע חדש';
const SAVE = 'שמירה';

/** `--miss` (design-language's status mini-palette) as the browser reports it. */
const MISS = 'rgb(194, 88, 78)';

async function openEventForm(page: Page) {
  await page.getByRole('button', { name: PLAN_MODE, exact: true }).click();
  await page.locator('nav.nav button', { hasText: t.tabs.days }).click();
  await expect(page).toHaveURL(/[?&]tab=days/);
  await page.getByText(NEW_EVENT).first().click();
  await expect(form(page)).toBeVisible();
}

test.describe('a form refuses at the field', () => {
  test.beforeEach(async ({ page }) => {
    await bootIntoTrip(page, { dates: shortLiveTripDates() });
    await page.goto('/');
    await openEventForm(page);
  });

  test('the refused control is painted in --miss, and stays that way while focused', async ({
    page,
  }) => {
    const title = form(page).locator('input.title-input');
    await form(page).getByText(SAVE).click();

    const field = form(page).locator('.field', { has: page.locator('input.title-input') });
    await expect(field).toHaveAttribute('data-invalid', '');
    await expect(field.locator('.field-error')).toHaveText(t.eventForm.titleRequired);

    // The refusal put focus here — which is exactly the state the teal focus rule
    // would have won in.
    await expect(title).toBeFocused();
    await expect(title).toHaveCSS('border-color', MISS);
  });

  test('a day outside the trip is refused by the app, in Hebrew, at the day', async ({ page }) => {
    await form(page).locator('input.title-input').fill('ארוחת ערב');
    // Well past the trip's end — the value the browser's own min/max would have
    // blocked with a bubble of its own before `submit` ever ran.
    // `.vt-date` is the DateField BOX now — a ValueToken (ADR-0177); the input is inside it.
    await form(page).locator('.vt-date input').fill('2035-01-01');
    await form(page).getByText(SAVE).click();

    const dateField = form(page).locator('.field', { has: page.locator('.vt-date') });
    await expect(dateField).toHaveAttribute('data-invalid', '');
    // And the BOX is what reddens (ADR-0176 §3). The date field is a wrapper around a
    // native input now, so the shell's chrome (`.vt-date`, and its amber
    // `:focus-within` — the refusal focuses this field) sits at the same specificity the
    // mark used to beat outright. It shipped broken for exactly one run of this file:
    // ring drawn, border still neutral.
    await expect(form(page).locator('.vt-date')).toHaveCSS('border-color', MISS);
    await expect(dateField.locator('.field-error')).toHaveText('התאריך מחוץ לטווח הטיול');
    await expect(form(page)).toBeVisible();
  });
});

// **A REFUSAL MOVES THE FORM, AND WHAT FLOATS OVER IT HAS TO FOLLOW.** The create screen's
// birth card is absolutely positioned over a slot it MEASURES (ADR-0142 §1), and three
// refusals appearing at once push that slot ~57px down. It used to re-measure only from a
// `ResizeObserver` on the root — which is viewport-sized, so a form growing inside it
// changes no box the observer watches and the callback never runs: the card stayed where
// it was, covering the field above and the refusal under it. jsdom cannot see any of this.
test('the create screen refuses without the floating card going stale', async ({ page }) => {
  await bootIntoCreate(page);
  const cta = page.locator('button.create-btn');
  await expect(cta).toBeVisible();
  // Dim, but pressable — disabled is only for offline / a write in flight (ADR-0150 §8).
  await expect(cta).toBeEnabled();
  await cta.click();

  await expect(page.getByText('חסר יעד')).toBeVisible();
  await expect(page.getByText('חסרים תאריכים')).toBeVisible();
  await expect(page.getByText('חסר שם לטיול')).toBeVisible();
  // Both date boxes are refused here, and both must LOOK it — same trap as above, on the
  // screen where the two boxes are the only thing naming the missing dates.
  for (const box of await page.locator('.wf-line .df').all())
    await expect(box).toHaveCSS('border-color', MISS);

  const card = await page.locator('.birth-card').boundingBox();
  const slot = await page.locator('.birth-slot[data-slot="form"]').boundingBox();
  expect(Math.abs(card!.y - slot!.y)).toBeLessThan(1);
});

// **`החלף` IS ONE DECISION, TAKEN ON THE SLOT** (ADR-0161 §6).
//
// It used to `skip` the event and post a toast saying "picked for replacement · choose a
// replacement from the shelf" — so the verb emptied the slot and then left, with nothing on
// screen to choose from. Owner: _"the החלף button is also confusing and hard to understand how
// to use."_ It had no test of any kind, at any level, which is how that shipped.
//
// This spec is here rather than in the unit suite because the whole flow crosses three
// surfaces that only exist together on a real screen: the row's `⋯` sheet, the slot chooser
// over it, and the day list underneath that has to show the replacement at the displaced
// event's own time afterwards. The day view has no unit suite at all (see `note-way-in`).
import { test, expect, type Page } from '@playwright/test';
import { bootIntoTrip, shortLiveTripDates, todayAt, TRIP_ID } from './boot';

const PHONE = { width: 390, height: 844 };
/** **Pinned before both fixtures**, which is load-bearing here: a PASSED soft event renders the
 *  settle strip instead of the `⋯` menu (ADR-0027), and this spec is about a verb that lives in
 *  that menu. The harness default is an afternoon, which put the 05:00 event behind now and the
 *  menu simply was not there. The e2e trip runs in **UTC**, so the fixture clocks below are the
 *  clocks the day view shows. */
const NOW = () => todayAt('02:00');
const today = () => new Date().toISOString().slice(0, 10);

const stamps = {
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  updatedBy: 'u1',
};

/** The event being displaced: soft, planned, and still ahead of the pinned clock. */
const museum = {
  id: 'ev-museum',
  tripId: TRIP_ID,
  date: today(),
  title: 'מוזיאון אדו',
  icon: '🏛️',
  category: 'sightseeing',
  kind: 'soft',
  status: 'planned',
  startsAt: `${today()}T05:00:00.000Z`,
  endsAt: `${today()}T07:00:00.000Z`, // a two-hour slot for the replacement to inherit
  sortOrder: 0,
  source: 'manual',
  ...stamps,
};

/** A hard event, so the spec can also say what `החלף` is NOT offered on (ADR-0011). */
const flight = {
  id: 'ev-flight',
  tripId: TRIP_ID,
  date: today(),
  title: 'טיסה הביתה',
  icon: '✈️',
  kind: 'hard',
  status: 'planned',
  startsAt: `${today()}T11:00:00.000Z`,
  sortOrder: 1,
  source: 'manual',
  ...stamps,
};

const idea = (id: string, title: string) => ({
  id,
  tripId: TRIP_ID,
  title,
  category: 'food',
  consumed: false,
  createdBy: 'u1',
  ...stamps,
});

const IDEAS = [idea('m-oden', 'אודן קאשימה'), idea('m-garden', 'גן ריקוגי-אן')];

/** Trip mode's day view — where `החלף` lives. The cold boot lands on the trip Home, so the
 *  tab is a navigation like every other day-view spec's. */
async function boot(page: Page): Promise<void> {
  await bootIntoTrip(page, {
    events: [museum, flight],
    maybeItems: IDEAS,
    now: NOW(),
    dates: shortLiveTripDates(),
  });
  await page.goto('/');
  await expect(page.locator('nav.nav')).toBeVisible();
  await page.locator('nav.nav button', { hasText: 'יום-יום' }).click();
  await expect(page).toHaveURL(/[?&]tab=days/);
}

/** Open a row's `⋯` sheet. The card has to be expanded first — the menu lives inside it, and
 *  both locators are scoped to the card so a day of several rows cannot answer for the wrong
 *  one. */
async function openRowMenu(page: Page, title: string) {
  const card = page.locator('.wp-event', { hasText: title });
  await card.locator('.wp-event-face').click();
  await card.locator('.wp-event-act.more').click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

test.describe('החלף on a soft event', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(PHONE);
    await boot(page);
  });

  test('opens the slot chooser, naming the event and the slot it hands over', async ({ page }) => {
    await openRowMenu(page, 'מוזיאון אדו');
    await page.getByRole('button', { name: 'החלף' }).click();

    const sheet = page.getByRole('dialog');
    // The header names what is being displaced — a gap fill names the slot, because it has
    // nothing else to be called.
    await expect(sheet).toContainText('החלפה');
    await expect(sheet).toContainText('מוזיאון אדו');
    // …and the line under it says what the replacement inherits, which is the promise.
    await expect(sheet.locator('.slotfill-sub')).toContainText('05:00');
    await expect(sheet.locator('.slotfill-sub')).toContainText('07:00');
    // The shelf's ideas, ranked, with a way out to a fresh event.
    await expect(sheet.locator('.slotfill-row')).toHaveCount(IDEAS.length);
    await expect(sheet.locator('.slotfill-new')).toBeVisible();
  });

  test('spends no plan violet: the accent follows the mode (root rule 4)', async ({ page }) => {
    await openRowMenu(page, 'מוזיאון אדו');
    await page.getByRole('button', { name: 'החלף' }).click();

    const sheet = page.locator('.slotfill');
    await expect(sheet).toHaveAttribute('data-mode', 'trip');
    // The `אירוע חדש` fill is the loudest thing in the sheet, so it is the one to check: it
    // resolves to the neutral CTA here and to `--plan` only in Plan mode.
    const [accent, plan] = await sheet.evaluate((el) => {
      const style = getComputedStyle(el);
      return [
        style.getPropertyValue('--slotfill-accent').trim(),
        style.getPropertyValue('--plan').trim(),
      ];
    });
    expect(accent).not.toBe('');
    expect(accent).not.toBe(plan);
  });

  test('picking a replacement puts it in that exact slot and parks the displaced event', async ({
    page,
  }) => {
    await openRowMenu(page, 'מוזיאון אדו');
    await page.getByRole('button', { name: 'החלף' }).click();
    await page.locator('.slotfill-row', { hasText: 'אודן קאשימה' }).click();

    // The replacement is on the day, at the displaced event's own time — that is §1's rule
    // applied to the one verb that puts one thing where another was.
    const replacement = page.locator('.wp-event', { hasText: 'אודן קאשימה' });
    await expect(replacement).toBeVisible();
    await expect(replacement).toContainText('05:00');
    await expect(replacement).toContainText('07:00');

    // The displaced event is off the day and on the shelf — parked, not skipped: it is the
    // thing you are most likely to re-slot (ADR-0027).
    await expect(page.locator('.wp-event', { hasText: 'מוזיאון אדו' })).toHaveCount(0);
    await expect(page.locator('.shelf').getByText('מוזיאון אדו')).toBeVisible();

    // One toast for one decision, and the slot was never empty in between.
    await expect(page.locator('.toast')).toContainText('אודן קאשימה');
  });

  test('one undo puts the day back — both halves of it', async ({ page }) => {
    await openRowMenu(page, 'מוזיאון אדו');
    await page.getByRole('button', { name: 'החלף' }).click();
    await page.locator('.slotfill-row', { hasText: 'אודן קאשימה' }).click();

    await page.locator('.toast').getByRole('button').click();

    await expect(page.locator('.wp-event', { hasText: 'מוזיאון אדו' })).toBeVisible();
    await expect(page.locator('.wp-event', { hasText: 'אודן קאשימה' })).toHaveCount(0);
    // The chosen idea is back on the shelf, un-consumed, and the parked one is gone from it.
    await expect(page.locator('.shelf').getByText('אודן קאשימה')).toBeVisible();
    await expect(page.locator('.shelf').getByText('מוזיאון אדו')).toHaveCount(0);
  });

  // The escape when the shelf holds nothing that fits. Deliberately two actions rather than
  // one atomic write (§6's amendment): there is nothing to write until the form is saved, and
  // the form can be cancelled — so the park is its own undoable step.
  test('אירוע חדש parks the event and opens the form on the slot it freed', async ({ page }) => {
    await openRowMenu(page, 'מוזיאון אדו');
    await page.getByRole('button', { name: 'החלף' }).click();
    await page.locator('.slotfill-new').click();

    await expect(page.locator('.wp-event', { hasText: 'מוזיאון אדו' })).toHaveCount(0);
    await expect(page.locator('.shelf').getByText('מוזיאון אדו')).toBeVisible();
    // The form opens on the freed slot, not on the day's next opening.
    await expect(page.locator('.tp-fields .tp-field').first()).toContainText('05:00');
  });
});

test('a hard event is never offered החלף — a commitment is not displaced (ADR-0011)', async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await boot(page);
  await openRowMenu(page, 'טיסה הביתה');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'החלף' })).toHaveCount(0);
});

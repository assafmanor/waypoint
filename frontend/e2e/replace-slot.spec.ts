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
// The control is `t.actions.swap`. The spec's PROSE keeps saying `החלף` because that is the
// name ADR-0161 §6 gave this decision; the 2026-08-17 register pass reworded the button to
// `החלפה` and broke all seven selectors, which is why none of them is a literal any more.
import { t } from '../src/i18n/he';

const PHONE = { width: 390, height: 844 };
/** **Pinned before both fixtures**, which is load-bearing here: a PASSED soft event renders the
 *  settle strip instead of the `⋯` menu (ADR-0027), and this spec is about a verb that lives in
 *  that menu. The harness default is an afternoon, which put the 05:00 event behind now and the
 *  menu simply was not there. The e2e trip runs in **UTC**, so the fixture clocks below are the
 *  clocks the day view shows. */
const NOW = () => todayAt('02:00');
const today = () => new Date().toISOString().slice(0, 10);
const yesterday = () => new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

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
/** The same pair on a day that is already over — the read-only archive (ADR-0029). Seeded here
 *  rather than in its own spec so the gap being STATED and not OFFERED is one comparison. */
const pastPair = [
  {
    ...museum,
    id: 'ev-museum-past',
    date: yesterday(),
    startsAt: `${yesterday()}T05:00:00.000Z`,
    endsAt: `${yesterday()}T07:00:00.000Z`,
  },
  {
    ...flight,
    id: 'ev-flight-past',
    kind: 'soft',
    date: yesterday(),
    startsAt: `${yesterday()}T11:00:00.000Z`,
  },
];

async function boot(page: Page): Promise<void> {
  await bootIntoTrip(page, {
    events: [museum, flight, ...pastPair],
    maybeItems: IDEAS,
    now: NOW(),
    dates: shortLiveTripDates(),
  });
  await page.goto('/');
  await expect(page.locator('nav.nav')).toBeVisible();
  await page.locator('nav.nav button', { hasText: t.tabs.days }).click();
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
    await page.getByRole('button', { name: t.actions.swap }).click();

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
    await page.getByRole('button', { name: t.actions.swap }).click();

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
    await page.getByRole('button', { name: t.actions.swap }).click();
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
    await page.getByRole('button', { name: t.actions.swap }).click();
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
    await page.getByRole('button', { name: t.actions.swap }).click();
    await page.locator('.slotfill-new').click();

    await expect(page.locator('.wp-event', { hasText: 'מוזיאון אדו' })).toHaveCount(0);
    await expect(page.locator('.shelf').getByText('מוזיאון אדו')).toBeVisible();
    // The form opens on the freed slot, not on the day's next opening.
    await expect(page.locator('.wf-line .vt-time').first()).toContainText('05:00');
  });
});

// **THE DAY'S FREE TIME ANSWERS WHEN TAPPED** (ADR-0161 §9, amending ADR-0159 §1).
//
// ADR-0159 made the Trip-mode gap information-only and gave a good reason: a control belongs to
// the mode that builds the day. But ADR-0025's Tier-1 list already contains "schedule-from-shelf
// onto today", so filling a hole on the ground is on-the-ground work — and the one shipped
// surface that STATES the hole was the one place it could not be done.
//
// A browser, because both halves of the claim are things jsdom cannot see: that the strip is
// still the quietest row on the list (it keeps its words and spends no hue), and that the tap
// reaches the same sheet `החלף` opens, over a real day list.
test.describe('the gap between two rows', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(PHONE);
    await boot(page);
  });

  test('states the free time and offers to fill it, in the same row', async ({ page }) => {
    const strip = page.locator('button.day-gap').first();
    await expect(strip).toBeVisible();
    // The words are still a MEASUREMENT — no verb, no `שבץ` (ADR-0159 §2 stands).
    await expect(strip).toContainText('פנוי');
    await expect(strip.locator('.day-gap-add')).toBeVisible();
    // …and Plan's violet did not come over with the tap (root rule 4).
    const [add, plan] = await strip.locator('.day-gap-add').evaluate((el) => {
      const style = getComputedStyle(el);
      return [style.color, getComputedStyle(document.documentElement).getPropertyValue('--plan')];
    });
    expect(add).not.toBe(plan.trim());
  });

  test('the tap opens the slot sheet on that gap, and a pick lands in it', async ({ page }) => {
    await page.locator('button.day-gap').first().click();

    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    // The gap's own header — the slot, because a gap has no other name.
    await expect(sheet).toContainText('מילוי הפער');
    await expect(sheet.locator('.slotfill-row')).toHaveCount(IDEAS.length);

    await sheet.locator('.slotfill-row', { hasText: 'אודן קאשימה' }).click();
    // 07:00 is where the museum ends, so that is where the gap starts.
    const created = page.locator('.wp-event', { hasText: 'אודן קאשימה' });
    await expect(created).toBeVisible();
    await expect(created).toContainText('07:00');
  });

  test('a past day states the gap and does not offer it — the archive is read-only', async ({
    page,
  }) => {
    // A day that is over is a read-only archive (ADR-0029), so the write is gated — and the
    // strip goes back to being the statement it was, rather than a control that refuses.
    await page.goto(`/?tab=days&day=${yesterday()}`);
    await expect(page.locator('.wp-event', { hasText: 'מוזיאון אדו' })).toBeVisible();
    await expect(page.locator('.day-gap')).toBeVisible();
    await expect(page.locator('button.day-gap')).toHaveCount(0);
  });
});

// **THE BLANK SCREEN** (reported 2026-08-04, off the shipped build). `החלף` was offered on an
// untimed row, which has no slot to be replaced — so the shelf was ranked against a slot with no
// clock, `zonedIso(date, '', tz)` built an Invalid Date, `toISOString()` threw, and the whole day
// view unmounted. Two rules now: the verb is not offered there, and the derivation refuses to
// invent an instant it was not given.
//
// A browser is the only place this can be caught: the throw happens during render, so what it
// produces is an EMPTY tree — jsdom would have to be asked the same question to see it, and no
// unit test was asking.
test('an untimed row is never offered החלף, and nothing crashes on the way', async ({ page }) => {
  await page.setViewportSize(PHONE);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await bootIntoTrip(page, {
    // No `startsAt` at all — the shape that took the screen down.
    events: [
      { ...museum, id: 'ev-untimed', title: 'משהו', startsAt: undefined, endsAt: undefined },
    ],
    maybeItems: IDEAS,
    now: NOW(),
    dates: shortLiveTripDates(),
  });
  await page.goto('/');
  await expect(page.locator('nav.nav')).toBeVisible();
  await page.locator('nav.nav button', { hasText: t.tabs.days }).click();

  const card = page.locator('.wp-event', { hasText: 'משהו' });
  await card.locator('.wp-event-face').click();
  await card.locator('.wp-event-act.more').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: t.actions.swap })).toHaveCount(0);

  // The day is still standing, which is the actual report.
  await expect(page.locator('.wp-event', { hasText: 'משהו' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a hard event is never offered החלף — a commitment is not displaced (ADR-0011)', async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await boot(page);
  await openRowMenu(page, 'טיסה הביתה');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: t.actions.swap })).toHaveCount(0);
});

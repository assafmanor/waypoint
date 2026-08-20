// **THE OTHER DIRECTION: FROM A PLACE TO ITS EVENT** (owner, 2026-08-20: _"going from a place
// to the event (and maybe also booking) doesn't scroll correctly. Check plan day and trip
// day."_).
//
// A place's card lists what happens there (ADR-0122 §7's reference block), and tapping one of
// those entries used to land on the DAY and stop: on a full day the card you came for is
// wherever the day happens to sit, and on today the day had already scrolled itself to the
// now-line. Nothing said which row you asked for.
//
// The entry now carries the event's id — `?event=`, the channel a note's way-in already used —
// and **both** day surfaces open on that card and land it. They are two different screens
// (`DayView` in Trip mode, `PlanDay` in Plan mode) drawing the same day, which is why this
// spec runs the same arrival twice: `frontend/CLAUDE.md`'s standing rule is that a day-surface
// change checked in one of them is a change checked nowhere.
//
// Measured here rather than in the unit suite for the reason every landing spec in this repo
// is: jsdom has no layout and no scrolling, so it can only see that a scroll was ASKED for.
import { test, expect, type Page } from '@playwright/test';
import { bootIntoTrip, shortLiveTripDates, todayAt, TRIP_ID } from './boot';
import { t } from '../src/i18n/he';

const today = () => new Date().toISOString().slice(0, 10);
const stamps = {
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  updatedBy: 'u1',
};

/** A long day, because the whole defect is about a card that is not on screen when you land.
 *  The place we navigate FROM is the last stop's, so its card starts well below the fold. */
const places = Array.from({ length: 16 }, (_, i) => i).map((i) => ({
  id: `pl-${i}`,
  tripId: TRIP_ID,
  name: `מקום ${i}`,
  lat: 35.666 + i / 1000,
  lng: 139.717 + i / 1000,
  ...stamps,
}));

const events = places.map((p, i) => ({
  id: `ev-${i}`,
  tripId: TRIP_ID,
  date: today(),
  title: `עצירה ${i + 1}`,
  icon: '🍜',
  category: 'food',
  kind: 'soft',
  status: 'planned',
  placeId: p.id,
  startsAt: `${today()}T${String(4 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}:00.000Z`,
  sortOrder: i,
  source: 'manual',
  ...stamps,
}));

/** **The target sits in the MIDDLE of the day, and both halves of that matter**: far enough
 *  down to start off screen, with enough day below it that `block: 'start'` can bring its top
 *  to the top at all (the scroll-extent premise `place-know.spec.ts` spells out — the last row
 *  of a list cannot rise above the extent its own height provides). */
const TARGET_EVENT = 'ev-8';
const TARGET_PLACE = 'pl-8';

async function boot(page: Page, mode: 'trip' | 'plan'): Promise<void> {
  await page.setViewportSize({ width: 390, height: 844 });
  await bootIntoTrip(page, {
    places,
    events,
    // Before the day starts, so every card is upcoming: a PASSED card renders the settle
    // variant, which does not expand at all (`EventCard`'s `showSettle`), and the arrival's
    // expansion is half of what is under test. Trip mode's "land on now" still has its own
    // opinion about where today should sit, which is the other half.
    now: todayAt('03:00'),
    dates: shortLiveTripDates(),
  });
  await page.goto('/');
  await expect(page.locator('nav.nav')).toBeVisible();
  if (mode === 'plan') {
    await page.getByRole('button', { name: t.mode.plan, exact: true }).click();
  }
  await page.locator('nav.nav button', { hasText: t.tabs.map }).click();
  await expect(page.locator('.map-screen')).toBeVisible();
}

/** Where the landed row ended up in its own scroller — the day surfaces scroll the shell's
 *  body, so the scroller is found by walking rather than named (as `place-know.spec.ts` does). */
async function measureLanding(page: Page, eventId: string) {
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-event="${id}"]`) as HTMLElement | null;
    if (!el) return null;
    let scroller = el.parentElement;
    while (scroller && !/^(auto|scroll)$/.test(getComputedStyle(scroller).overflowY)) {
      scroller = scroller.parentElement;
    }
    scroller ??= document.scrollingElement as HTMLElement;
    const r = el.getBoundingClientRect();
    const s = scroller.getBoundingClientRect();
    return {
      scroller: scroller.className,
      top: Math.round(r.top),
      max: scroller.scrollHeight - scroller.clientHeight,
      scrollerTop: Math.round(s.top),
      scrolled: Math.round(scroller.scrollTop),
    };
  }, eventId);
}

async function expectLanded(page: Page, eventId: string) {
  await expect(page.locator(`[data-event="${eventId}"]`)).toBeVisible();
  await expect(async () => {
    const m = await measureLanding(page, eventId);
    // Its top at the scroller's top, within the 8px `scroll-margin-top` plus rounding.
    expect(m!.top).toBeGreaterThanOrEqual(m!.scrollerTop - 1);
    expect(m!.top).toBeLessThanOrEqual(m!.scrollerTop + 24);
    // …and it really did have to move, so a day that happened to open there proves nothing.
    expect(m!.scrolled).toBeGreaterThan(0);
  }).toPass();
}

/** Select the place's row on the Map, then tap the reference entry for what happens there. */
async function openTheReference(page: Page) {
  await page.locator(`.map-list .place[data-place="${TARGET_PLACE}"]`).click();
  const ref = page.locator('.map-refs .map-ref-open').first();
  await expect(ref).toBeVisible();
  await ref.click();
}

test('Trip day: the event you asked for opens and lands at the top', async ({ page }) => {
  await boot(page, 'trip');
  await openTheReference(page);
  // The card is open — the arrival expands it, which is Trip's own posture …
  await expect(page.locator(`[data-event="${TARGET_EVENT}"]`)).toHaveClass(/\bopen\b/);
  // … and it is where you can read it.
  await expectLanded(page, TARGET_EVENT);
});

test('Plan day: the same arrival lands the builder row', async ({ page }) => {
  await boot(page, 'plan');
  await openTheReference(page);
  await expect(page.locator('.builder-side')).toBeVisible({ timeout: 20_000 });
  // Plan opens no sheet on arrival (its row's tap raises one over the day, which would hide
  // the day you were sent to) — what it owes is the row, in front of you.
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expectLanded(page, TARGET_EVENT);
});

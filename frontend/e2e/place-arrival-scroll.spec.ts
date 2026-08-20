// **THE ROW YOU WERE SENT TO LANDS AT THE TOP OF THE LIST** (owner, 2026-08-20: _"when you're
// referred from a maybe/event/booking to the map, the map list doesn't scroll correctly to the
// place listing. The listing should be scrolled so that it appears opened on top."_).
//
// `place-know.spec.ts` already measures the landing for a row TAP. This measures the other way
// in — `useShowPlaceOnMap`, the badge on an event card, a booking detail or a shelf tile — and
// it is a separate spec because the defect lives in the difference between them: an arrival
// often WIDENS the list to find its row (`setAllDays`), so the row it aims at is a row still
// revealing from `0fr`.
//
// **Why this cannot be a unit test.** `scrollIntoView` clamps its destination to the scroll
// extent that exists at the call, and a revealing row has not contributed its height to that
// extent yet — so the scroll was silently truncated by roughly one row. Every element involved
// reported healthy numbers; the wrongness is only in where the scroller ended up, which jsdom
// (no CSS, no layout, no scrolling) cannot express at all. Measured here: 624px needed, 328px
// of extent at the call, and the animation stopped at 303.
import { test, expect, type Page } from '@playwright/test';
import { bootIntoTrip, shortLiveTripDates, todayAt, TRIP_ID } from './boot';
import { t } from '../src/i18n/he';

const today = () => new Date().toISOString().slice(0, 10);
/** Tomorrow, for the arrival that has to widen the day scope to find its row. */
const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

const stamps = {
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  updatedBy: 'u1',
};

/** Enough stops that the target row starts well below the fold, and enough content below it
 *  that `block: 'start'` has somewhere to scroll to (the premise `place-know.spec.ts`'s filler
 *  spells out). */
const places = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({
  id: `pl-${i}`,
  tripId: TRIP_ID,
  name: `מקום ${i}`,
  lat: 35.666 + i / 1000,
  lng: 139.717 + i / 1000,
  ...stamps,
}));

/** The place only a dateless idea references — so the Map's day scope does not list it, and the
 *  arrival has to widen to all-days first. This is the reported case. */
const ideaPlace = {
  id: 'pl-idea',
  tripId: TRIP_ID,
  name: 'מקום הרעיון',
  lat: 35.68,
  lng: 139.73,
  ...stamps,
};

/** …and the same shape through the other widening door: a place on ANOTHER day. */
const laterPlace = {
  id: 'pl-later',
  tripId: TRIP_ID,
  name: 'מקום מחר',
  lat: 35.69,
  lng: 139.74,
  ...stamps,
};

const event = (id: string, i: number, placeId: string, date: string) => ({
  id,
  tripId: TRIP_ID,
  date,
  title: `עצירה ${i + 1}`,
  icon: '🍜',
  category: 'food',
  kind: 'soft',
  status: 'planned',
  placeId,
  startsAt: `${date}T${String(5 + i).padStart(2, '0')}:00:00.000Z`,
  sortOrder: i,
  source: 'manual',
  ...stamps,
});

const events = [
  ...places.map((p, i) => event(`ev-${p.id}`, i, p.id, today())),
  event('ev-later', 0, laterPlace.id, tomorrow()),
];

const idea = {
  id: 'm-idea',
  tripId: TRIP_ID,
  title: 'רעיון',
  icon: '💡',
  placeId: ideaPlace.id,
  consumed: false,
  createdBy: 'u1',
  ...stamps,
};

async function boot(page: Page): Promise<void> {
  await page.setViewportSize({ width: 390, height: 844 });
  await bootIntoTrip(page, {
    places: [...places, ideaPlace, laterPlace],
    events,
    maybeItems: [idea],
    now: todayAt('02:00'),
    dates: shortLiveTripDates(),
  });
  await page.goto('/');
  await expect(page.locator('nav.nav')).toBeVisible();
}

/** Where the selected row ended up, in its own scroller. The scroller is FOUND rather than
 *  named, for the reason `place-know.spec.ts` records: which element scrolls depends on
 *  whether a map is rendered (`.wp-snapsheet-body`) or not (the shell's `.body`). */
async function measureLanding(page: Page) {
  return page.evaluate(() => {
    const el = document.querySelector('.map-list .place.selected') as HTMLElement | null;
    if (!el) return null;
    let scroller = el.parentElement;
    while (scroller && !/^(auto|scroll)$/.test(getComputedStyle(scroller).overflowY)) {
      scroller = scroller.parentElement;
    }
    scroller ??= document.querySelector('.body') as HTMLElement;
    const r = el.getBoundingClientRect();
    const s = scroller.getBoundingClientRect();
    return {
      place: el.dataset.place,
      top: Math.round(r.top),
      height: Math.round(r.height),
      scrollerTop: Math.round(s.top),
      scrollerHeight: Math.round(s.height),
      scrolled: Math.round(scroller.scrollTop),
    };
  });
}

/** The landing, polled rather than slept on — the scroll is eased, and it is allowed to aim a
 *  second time once the reveal it was racing has finished, so any fixed wait would be measuring
 *  a box in flight. `toPass` depends on no duration at all. */
async function expectLandedOn(page: Page, placeId: string) {
  await expect(page.locator(`.map-list .place.selected[data-place="${placeId}"]`)).toHaveCount(1);
  await expect(async () => {
    const m = await measureLanding(page);
    expect(m?.place).toBe(placeId);
    // Its top at the scroller's top, within the 8px `scroll-margin-top` plus rounding. The
    // defect left it a full row-height (329px at 390×844) below this.
    expect(m!.top).toBeGreaterThanOrEqual(m!.scrollerTop - 1);
    expect(m!.top).toBeLessThanOrEqual(m!.scrollerTop + 24);
  }).toPass();
}

const toDays = (page: Page) => page.locator('nav.nav button', { hasText: t.tabs.days }).click();

/** The badge on a day card — `PlaceBadge`'s `role="button"`, which is the way in ADR-0121 §8's
 *  amendment put on every event, booking and idea. */
const eventBadge = (page: Page, index: number) => page.locator('.wp-event-badge').nth(index);

test('an arrival from an event on the day lands on its row', async ({ page }) => {
  await boot(page);
  await toDays(page);
  // The day's LAST stop, so its row starts below the fold and the aim has real work to do.
  await eventBadge(page, 7).click();
  await expect(page.locator('.map-screen')).toBeVisible();
  await expectLandedOn(page, 'pl-7');
});

// ── The reported case ──────────────────────────────────────────────────────────────────
// A dateless idea's place is in no day, so the arrival widens the list to all-days and the row
// it aims at is one that is still revealing. The previous fix waited for the row to EXIST,
// which it did — one frame after the widening, at height 0.
test('an arrival from a dateless shelf idea lands on its row, not a row short', async ({
  page,
}) => {
  await boot(page);
  await toDays(page);
  await page.locator('.wp-maybecard-ic[role="button"]').first().click();
  await expect(page.locator('.map-screen')).toBeVisible();
  await expectLandedOn(page, 'pl-idea');
});

// The other widening door: a place on another day. It landed correctly even before the fix —
// kept because it is the arrival the app performs most often and nothing measured it, not
// because it reproduced anything.
test('an arrival from another day lands on its row too', async ({ page }) => {
  await boot(page);
  await toDays(page);
  // Tomorrow's only stop, reached from tomorrow's day view: the Map lands on the day the tap
  // came from and widens for the row, which is the second door onto the same reveal.
  const days = page.locator('.wp-daystrip button');
  const onDay = await days.evaluateAll((els) =>
    els.findIndex((el) => el.getAttribute('aria-pressed') === 'true'),
  );
  await days.nth(onDay + 1).click();
  await expect(page.locator('.wp-event-badge')).toHaveCount(1);
  await eventBadge(page, 0).click();
  await expect(page.locator('.map-screen')).toBeVisible();
  await expectLandedOn(page, 'pl-later');
});

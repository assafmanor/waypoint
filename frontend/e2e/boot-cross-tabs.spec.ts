// **A BOOT-AND-CROSS-THE-TABS SMOKE TEST** (docs/backlog.md, "e2e smoke").
//
// Dozens of specs in this directory boot into one specific screen for its own
// fixture; none of them ever ask the coarse question — does every TAB render,
// with no white screen and no console error — after a real boot. A unit
// suite can't ask this either: jsdom never renders four screens' worth of
// real DOM/CSS/lazy-chunk loading in sequence. Deliberately coarse: this is a
// smoke test, not a per-screen assertion suite (those already exist,
// per-feature, elsewhere in this directory).
import { test, expect, type Page } from '@playwright/test';
import { bootIntoTrip, shortLiveTripDates, todayAt, TRIP_ID } from './boot';
import { t } from '../src/i18n/he';

const PHONE = { width: 390, height: 844 };
const NOW = () => todayAt('15:00');
const today = () => new Date().toISOString().slice(0, 10);

const stamps = {
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  updatedBy: 'u1',
};

const market = {
  id: 'pl-market',
  tripId: TRIP_ID,
  name: 'Mercato di Porta Nolana',
  lat: 40.85,
  lng: 14.27,
  source: 'manual',
  ...stamps,
};

const lunch = {
  id: 'ev-lunch',
  tripId: TRIP_ID,
  date: today(),
  title: 'ראמן בשוק',
  icon: '🍜',
  category: 'food',
  kind: 'soft',
  status: 'planned',
  startsAt: `${today()}T14:30:00.000Z`,
  endsAt: `${today()}T16:00:00.000Z`,
  placeId: 'pl-market',
  sortOrder: 0,
  source: 'manual',
  ...stamps,
};

const hotel = {
  id: 'bk-hotel',
  tripId: TRIP_ID,
  type: 'hotel',
  title: 'מלון שינג׳וקו גרנבל',
  placeId: 'pl-market',
  source: 'manual',
  ...stamps,
};

const note = {
  id: 'n-lunch',
  tripId: TRIP_ID,
  eventId: 'ev-lunch',
  body: 'להזמין שולחן מראש',
  source: 'member',
  createdBy: 'u1',
  createdAt: '2024-01-02T00:00:00.000Z',
  updatedAt: '2024-01-02T00:00:00.000Z',
  updatedBy: 'u1',
};

/** Each tab's accessible name (`t.tabs`, the bottom nav's own label source) and
 *  whether it's expected to render meaningfully once. Order matches the nav. */
const TABS: { id: 'home' | 'map' | 'index' | 'days'; label: string }[] = [
  { id: 'home', label: t.tabs.home },
  { id: 'map', label: t.tabs.map },
  { id: 'index', label: t.tabs.index },
  { id: 'days', label: t.tabs.days },
];

/** Collects console errors + uncaught page errors from the moment it's called —
 *  attach before navigating, since the point is to catch a bad RENDER, not
 *  just a bad boot. `pageerror` is what a thrown-in-render error boundary
 *  miss would surface as; `console.error` catches React's own dev warnings
 *  escalated to errors and any caught-but-logged failure. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

/** Not a white screen: real apps have real text on screen. Deliberately not a
 *  per-screen selector — DayView's own root is a bare fragment with no single
 *  wrapper class, so a bespoke selector per tab would mean four different
 *  things to keep matching four different internals, which is exactly the
 *  fragility a SMOKE test should not have. */
async function hasVisibleContent(page: Page): Promise<boolean> {
  const text = await page.locator('body').innerText();
  return text.trim().length > 0;
}

test('every tab renders after boot, with real content and a clean console', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize(PHONE);
  await bootIntoTrip(page, {
    events: [lunch],
    bookings: [hotel],
    places: [market],
    notes: [note],
    now: NOW(),
    dates: shortLiveTripDates(),
  });
  await page.goto('/');
  await expect(page.locator('.app')).toBeVisible();

  for (const tabDef of TABS) {
    await page.getByRole('button', { name: tabDef.label, exact: true }).click();
    // `aria-current` on the nav button is how the shell marks the active tab
    // (App.tsx) — waiting on it is waiting on the route having actually
    // switched, not just the click having landed.
    await expect(page.getByRole('button', { name: tabDef.label, exact: true })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await expect(async () => {
      expect(await hasVisibleContent(page)).toBe(true);
    }).toPass({ timeout: 5000 });
  }

  expect(errors, errors.join('\n')).toEqual([]);
});

// **THE MAP ON A FINISHED TRIP** (ADR-0239 §2–§4). The unit suite mocks `useMode`; this boots
// the real phase derivation with the clock pinned four days past the trip's end, so "finished"
// is the app's own answer rather than a fixture's claim.
import { test, expect } from '@playwright/test';
import { bootIntoTrip } from './boot';
import { t } from '../src/i18n/he';

const START = '2026-05-01';
const END = '2026-05-03';
const NOW = Date.parse('2026-05-07T03:00:00.000Z');

const stamp = {
  tripId: 't1',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  updatedBy: 'u1',
};
const place = (id: string, name: string, lng: number) => ({ id, name, lat: 35.66, lng, ...stamp });
const event = (id: string, placeId: string, date: string) => ({
  id,
  date,
  startsAt: `${date}T01:00:00.000Z`,
  title: `${id} plan`,
  kind: 'soft',
  status: 'planned',
  placeId,
  sortOrder: 0,
  source: 'manual',
  ...stamp,
});

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await bootIntoTrip(page, {
    now: NOW,
    dates: { startDate: START, endDate: END },
    places: [
      place('pl-1', 'Day one', 139.7),
      place('pl-2', 'Day two', 139.71),
      place('pl-3', 'Day three', 139.72),
    ],
    // Out of order on purpose: the list must sort them, not echo the fixture.
    events: [
      event('ev-3', 'pl-3', END),
      event('ev-1', 'pl-1', START),
      event('ev-2', 'pl-2', '2026-05-02'),
    ],
  });
  await page.goto('/?trip=t1&tab=map');
  await expect(page.locator('.map-screen')).toBeVisible();
});

test('opens on all days, day 1 first, with none of the live trip’s help', async ({ page }) => {
  await expect(page.getByRole('button', { name: new RegExp(t.map.allDays) })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.place .map-name')).toHaveText(['Day one', 'Day two', 'Day three']);
  await expect(page.locator('.map-grouphead')).toHaveCount(0);

  await expect(page.locator('.map-geoprompt')).toHaveCount(0);
  await expect(page.locator('.map-nearchip')).toHaveCount(0);
  await expect(page.locator('.map-recenter')).toHaveCount(0);
  await expect(page.getByRole('link', { name: new RegExp(t.actions.navigate) })).toHaveCount(0);
});

test('a selected row offers no way to add to the trip', async ({ page }) => {
  await page.locator('.place', { hasText: 'Day two' }).click();
  await expect(page.locator('.place.selected')).toBeVisible();
  await expect(page.getByRole('button', { name: t.map.scheduleToDay })).toHaveCount(0);
  // The sections still render what was written; only their way in is gone.
  await expect(page.locator('.place.selected .note-sec').first()).toBeVisible();
  await expect(page.locator('.place.selected .note-sec .add')).toHaveCount(0);
});

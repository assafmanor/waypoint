// **COMING HOME** (ADR-0241 §3): the first open of a finished trip plays its beat once, settles
// into the cover it measured, and is remembered. jsdom cannot see the landing: the FLIP's target
// is `.mem-cover`'s real box, so it is asserted here against that box (frontend CLAUDE.md).
import { test, expect } from '@playwright/test';
import { t } from '../src/i18n/he';
import { bootIntoTrip } from './boot';

const START = '2026-05-01';
const END = '2026-05-03';
const NOW = Date.parse('2026-05-07T03:00:00.000Z');

const stamp = {
  tripId: 't1',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  updatedBy: 'u1',
};
const place = (id: string, lng: number) => ({ id, name: id, lat: 35.66, lng, ...stamp });
const event = (id: string, placeId: string, time: string) => ({
  id,
  date: '2026-05-02',
  startsAt: `2026-05-02T${time}:00.000Z`,
  title: `${id} plan`,
  kind: 'soft',
  status: 'done',
  placeId,
  sortOrder: 0,
  source: 'manual',
  ...stamp,
});

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await bootIntoTrip(page, {
    now: NOW,
    dates: { startDate: START, endDate: END },
    places: [place('pl-1', 139.7), place('pl-2', 139.75)],
    events: [event('ev-1', 'pl-1', '01:00'), event('ev-2', 'pl-2', '05:00')],
    comingHome: true,
  });
});

test('plays once, settles onto the cover it measured, and is remembered', async ({ page }) => {
  await page.goto('/?trip=t1&tab=home');
  await expect(page.getByText(t.planHome.past.comingHome.kicker)).toBeVisible();
  const settling = page.locator('.mem-beat.is-settling');
  await expect(settling).toBeAttached({ timeout: 20_000 });
  const aim = await page.evaluate(() => {
    const beat = document.querySelector<HTMLElement>('.mem-beat')!;
    const cover = document.querySelector('.mem-cover')!.getBoundingClientRect();
    return { top: parseFloat(beat.style.getPropertyValue('--to-top')), coverTop: cover.top };
  });
  expect(Math.abs(aim.top - aim.coverTop)).toBeLessThanOrEqual(1);
  await expect(page.locator('.mem-beat')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.mem-cover')).toBeVisible();
  await expect(page.locator('.mem-beat')).toHaveCount(0);
});

test('`דילוג` ends it at once, and it does not come back', async ({ page }) => {
  await page.goto('/?trip=t1&tab=home');
  await page.getByRole('button', { name: t.planHome.past.comingHome.skip }).click();
  await expect(page.locator('.mem-beat')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.mem-cover')).toBeVisible();
  await expect(page.locator('.mem-beat')).toHaveCount(0);
});

test('under reduced motion it is withheld, not shortened', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?trip=t1&tab=home');
  await expect(page.locator('.mem-cover')).toBeVisible();
  await expect(page.locator('.mem-beat')).toHaveCount(0);
});

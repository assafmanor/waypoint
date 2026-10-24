// **THE MEMORY HOME, MEASURED WHERE THE ADR MEASURED IT** (ADR-0240 §4).
//
// Two claims jsdom cannot see. The cover's picture bleeds to the day strip the way a day head's
// does, which is `day-head.css`'s `:first-child:has()` rule applied to a card that is not a day.
// And at 360×640 with a 168px cover, `במספרים` and its figures are above the fold: the ADR's
// reason for putting the stragglers in the cover's footer rather than a card of their own.
// Then the contact sheet (4.2): only the day where something happened gets a frame, its
// picture is the 84px thumb, and a tap on it opens that day rather than the Days tab's default.
// And the stragglers (4.4): the footer's `לסמן` asks about each unmarked row until none is left.
// Next time (4.5): a skipped row wears `דילגנו` and opens its day; a someday idea has none to open,
// and waits behind the section's continuation row (owner, 2026-09-27).
// The journal (4.6): a note sits under the day its stop was on, and a tap reads it in place.
// The record (4.7): a kind chip opens the search on that kind, and the search finds a row by its
// place.
import { test, expect } from '@playwright/test';
import { t } from '../src/i18n/he';
import { dayPhrase } from '../src/lib/hebrew';
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
const place = (id: string, name: string, lng: number) => ({ id, name, lat: 35.66, lng, ...stamp });
const event = (id: string, placeId: string, time: string, end: string, status: string) => ({
  id,
  date: '2026-05-02',
  startsAt: `2026-05-02T${time}:00.000Z`,
  endsAt: `2026-05-02T${end}:00.000Z`,
  title: `${id} plan`,
  kind: 'soft',
  status,
  placeId,
  sortOrder: 0,
  source: 'manual',
  ...stamp,
});

/** Clears `dayPhoto`'s gate, served from the app's own `public/` — `day-swipe.spec.ts`'s image. */
const IMAGE = {
  url: '/pwa-512.png',
  mimeType: 'image/png',
  width: 512,
  height: 512,
  sizeBytes: 40_000,
  source: 'commons',
  license: 'CC BY-SA 4.0',
  attribution: 'A. Photographer',
  fetchedAt: '2026-08-01T00:00:00.000Z',
  method: 'name_proximity',
  ref: 'Q38519',
  confidence: 1,
};

test('the memory Home: a bled cover, and its figures above the fold at 360×640', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await bootIntoTrip(page, {
    now: NOW,
    dates: { startDate: START, endDate: END },
    places: [
      place('pl-1', 'Bar', 139.7),
      place('pl-2', 'Club', 139.75),
      place('pl-3', 'Park', 139.8),
    ],
    events: [
      event('ev-1', 'pl-1', '01:00', '04:00', 'done'),
      event('ev-2', 'pl-2', '05:00', '06:00', 'done'),
      event('ev-3', 'pl-3', '07:00', '08:00', 'planned'),
    ],
    enrichments: { 'pl-1': { image: IMAGE } },
  });
  await page.goto('/?trip=t1&tab=home');

  const cover = page.locator('.mem-cover');
  await expect(cover.locator('.wp-photoband.is-cover img')).toBeVisible();
  await expect(cover.locator('.wp-dayhead-foot')).toContainText(t.planHome.past.unresolved(1));

  const figures = page.locator('.mem-figs');
  await expect(figures).toBeVisible();

  const geometry = await page.evaluate(() => {
    const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
    const chrome = document.querySelector('.mode-chrome')!.getBoundingClientRect();
    return {
      chromeBottom: chrome.bottom,
      coverTop: box('.mem-cover').top,
      pictureHeight: box('.mem-cover .wp-photoband img').height,
      figuresBottom: box('.mem-figs').bottom,
      viewport: window.innerHeight,
    };
  });
  // Flush to the strip, as a day head's picture is.
  expect(Math.abs(geometry.coverTop - geometry.chromeBottom)).toBeLessThanOrEqual(1);
  expect(geometry.pictureHeight).toBe(168);
  expect(geometry.figuresBottom).toBeLessThanOrEqual(geometry.viewport);
});

test('the contact sheet frames only the days that happened, and a frame opens its day', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await bootIntoTrip(page, {
    now: NOW,
    dates: { startDate: START, endDate: END },
    places: [place('pl-1', 'Bar', 139.7), place('pl-2', 'Club', 139.75)],
    events: [
      event('ev-1', 'pl-1', '01:00', '04:00', 'done'),
      event('ev-2', 'pl-2', '05:00', '06:00', 'done'),
    ],
    enrichments: { 'pl-1': { image: IMAGE } },
  });
  await page.goto('/?trip=t1&tab=home');

  const frames = page.locator('.mem-sheet .mem-day');
  await expect(frames).toHaveCount(1);
  const thumb = frames.first().locator('.wp-photoband.is-thumb img');
  await expect(thumb).toBeVisible();
  expect((await thumb.boundingBox())?.height).toBe(84);
  // The licence rides on the thumb even where the name does not.
  await expect(frames.first().locator('figcaption')).toContainText('A. Photographer');
  await expect(page.locator('.mem-foot')).toHaveText(t.planHome.past.quietDays(dayPhrase(2)));

  await frames.first().click();
  await expect(page).toHaveURL(/tab=days/);
  // Day 2, not the Days tab's own default of day 1 on a finished trip.
  await expect(page.locator('.wp-daypill.on')).toContainText('02');
});

test('firsts and bests: a place row carries its pin and an amber clock, a day row neither', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await bootIntoTrip(page, {
    now: NOW,
    dates: { startDate: START, endDate: END },
    places: [place('pl-1', 'Bar', 139.7), place('pl-2', 'Club', 139.75)],
    events: [
      event('ev-1', 'pl-1', '01:00', '04:00', 'done'),
      event('ev-2', 'pl-2', '05:00', '06:00', 'done'),
    ],
  });
  await page.goto('/?trip=t1&tab=home');

  const rows = page.locator('.mem-bests .wp-listrow');
  await expect(rows.first()).toBeVisible();
  const first = rows.first();
  await expect(first).toContainText(t.planHome.past.bests.first);
  await expect(first.locator('.wp-placebadge-mark')).toHaveCount(1);
  // Amber still marks a clock on a finished trip (ADR-0240 §4).
  const clock = first.locator('.mem-clock');
  const [clockColor, amber] = await clock.evaluate((el) => [
    getComputedStyle(el).color,
    (() => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--amber-deep)';
      document.body.append(probe);
      const colour = getComputedStyle(probe).color;
      probe.remove();
      return colour;
    })(),
  ]);
  expect(clockColor).toBe(amber);

  const day = rows.filter({ hasText: t.planHome.past.bests.busiestDay });
  await expect(day).toHaveCount(1);
  await expect(day.locator('.wp-placebadge-mark')).toHaveCount(0);
});

test('the stragglers sheet asks about the unmarked row, and the answer clears the footer', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await bootIntoTrip(page, {
    now: NOW,
    dates: { startDate: START, endDate: END },
    places: [place('pl-1', 'Bar', 139.7), place('pl-3', 'Park', 139.8)],
    events: [
      event('ev-1', 'pl-1', '01:00', '04:00', 'done'),
      event('ev-3', 'pl-3', '07:00', '08:00', 'planned'),
    ],
  });
  await page.goto('/?trip=t1&tab=home');

  const foot = page.locator('.mem-cover .wp-dayhead-foot');
  await foot.getByRole('button', { name: t.planHome.past.settle.action }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toContainText('ev-3 plan');
  await sheet.getByRole('button', { name: t.actions.wasThere }).click();

  await expect(sheet).toHaveCount(0);
  await expect(foot).toHaveCount(0);
});

test('next time: a skipped row carries its tag and opens its day, a someday idea stays put', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await bootIntoTrip(page, {
    now: NOW,
    dates: { startDate: START, endDate: END },
    places: [place('pl-1', 'Bar', 139.7), place('pl-2', 'Club', 139.75)],
    events: [
      event('ev-1', 'pl-1', '01:00', '04:00', 'done'),
      event('ev-2', 'pl-2', '05:00', '06:00', 'skipped'),
    ],
    maybeItems: [{ id: 'mb-1', title: 'Skytree', createdBy: 'u1', consumed: false, ...stamp }],
  });
  await page.goto('/?trip=t1&tab=home');

  const skipped = page.locator('.mem-next:not(.mem-next-rest) .wp-listrow');
  await expect(skipped).toHaveCount(1);
  await expect(skipped.first().locator('.tag-skip')).toHaveText(t.event.skipped);

  // The idea is folded behind one row, and the row opens in place.
  const more = page.getByRole('button', { name: t.planHome.past.nextTime.more(1, 1, true) });
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await more.click();
  const idea = page.locator('.mem-next-rest .wp-listrow');
  await expect(idea).toBeVisible();
  await expect(idea).toContainText(t.planHome.past.nextTime.idea);
  await expect(idea.locator('.wp-listrow-open')).toBeDisabled();

  await skipped.first().locator('.wp-listrow-open').click();
  await expect(page).toHaveURL(/tab=days/);
  await expect(page.locator('.wp-daypill.on')).toContainText('02');
});

test('the journal files a note under the day of its stop, and a tap reads it in place', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await bootIntoTrip(page, {
    now: NOW,
    dates: { startDate: START, endDate: END },
    places: [place('pl-1', 'Bar', 139.7)],
    events: [event('ev-1', 'pl-1', '01:00', '04:00', 'done')],
    notes: [
      {
        id: 'nt-1',
        title: 'Jazz upstairs',
        body: 'Six seats only',
        eventId: 'ev-1',
        source: 'member',
        createdBy: 'u1',
        ...stamp,
        createdAt: '2026-04-20T00:00:00.000Z',
      },
    ],
  });
  await page.goto('/?trip=t1&tab=home');

  const day = page.locator('.mem-journal-day');
  await expect(day).toHaveCount(1);
  // Written before the trip, about day 2: it is day 2's.
  await expect(day.locator('.mem-journal-head')).toContainText('02.05');
  await expect(day.locator('.wp-listrow-kebab')).toHaveCount(0);
  await day.locator('.wp-listrow-open').click();
  await expect(day.locator('.note-row.is-open')).toHaveCount(1);
});

test('a long journal opens whole: the continuation reveals every note, none clipped', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 });
  // Forty long notes are well past the 2000px the open `Collapsible` used to be capped at, which
  // cut the owner's journal off mid-note (2026-09-27).
  const notes = Array.from({ length: 40 }, (_, i) => ({
    id: `nt-${i}`,
    title: `Note ${i}`,
    body: 'The road on the east side is gravel and much more weather-dependent than it looks. '.repeat(
      2,
    ),
    eventId: 'ev-1',
    source: 'member',
    createdBy: 'u1',
    ...stamp,
    createdAt: '2026-05-02T00:00:00.000Z',
  }));
  await bootIntoTrip(page, {
    now: NOW,
    dates: { startDate: START, endDate: END },
    places: [place('pl-1', 'Bar', 139.7)],
    events: [event('ev-1', 'pl-1', '01:00', '04:00', 'done')],
    notes,
  });
  await page.goto('/?trip=t1&tab=home');

  await page.getByRole('button', { name: t.planHome.past.journal.more(37) }).click();
  const rest = page.locator('.mem-journal-rest');
  await expect(rest).toHaveClass(/\bon\b/);
  await expect(rest.locator('.note-row')).toHaveCount(37);
  // A clip changes no rect of what it hides, so the proof is the last note against the box that
  // would clip it: it has to end inside it.
  await expect
    .poll(() =>
      rest.evaluate((el) => {
        const rows = el.querySelectorAll('.note-row');
        const last = rows[rows.length - 1]!.getBoundingClientRect().bottom;
        return last - el.getBoundingClientRect().bottom;
      }),
    )
    .toBeLessThanOrEqual(1);
});

test('the record: a kind chip opens the search on its kind, and the search finds a row by its place', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await bootIntoTrip(page, {
    now: NOW,
    dates: { startDate: START, endDate: END },
    places: [place('pl-1', 'Ichiran', 139.7), place('pl-2', 'Senso-ji', 139.75)],
    events: [
      { ...event('ev-1', 'pl-1', '01:00', '02:00', 'done'), category: 'food' },
      { ...event('ev-2', 'pl-1', '03:00', '04:00', 'done'), category: 'food' },
      { ...event('ev-3', 'pl-2', '05:00', '06:00', 'skipped'), category: 'sightseeing' },
    ],
  });
  await page.goto('/?trip=t1&tab=home');

  // The Home keeps the counts, fullest first, and no list under them.
  const kinds = page.locator('.mem-kinds-entry');
  await expect(kinds.locator('.choice-pill').first()).toContainText(t.iconPicker.categories.food);
  await expect(kinds.locator('.wp-listrow')).toHaveCount(0);

  await kinds.locator('.choice-pill', { hasText: t.iconPicker.categories.sightseeing }).click();
  const results = page.locator('.search-overlay .wp-reveal:not(.hidden) .wp-listrow');
  await expect(results).toHaveCount(1);
  await expect(results.first().locator('.tag-skip')).toHaveText(t.event.skipped);
  // Its own chips widen it back to every row.
  await page
    .locator('.search-overlay .choice-pill', { hasText: t.planHome.past.record.kindsAll })
    .click();
  await expect(results).toHaveCount(3);
  await page.getByRole('button', { name: t.planHome.past.record.search.backAria }).click();
  await expect(page.locator('.search-overlay')).toHaveCount(0);

  await page
    .locator('.mem-cover')
    .getByRole('button', { name: t.planHome.past.record.search.button })
    .click();
  await page.keyboard.type('Senso');
  await expect(results).toHaveCount(1);
  await results.first().locator('.wp-listrow-open').click();
  await expect(page).toHaveURL(/tab=days/);
  await expect(page.locator('.wp-daypill.on')).toContainText('02');
});

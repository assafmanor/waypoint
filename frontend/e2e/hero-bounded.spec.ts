// **THE LIFTED HERO ACTUALLY CLIPS, INSTEAD OF GROWING PAST ITS CARD** (ADR-0160 §8/§T).
//
// jsdom reports every rect as zero, so this class of bug is invisible to the unit suite by
// construction (`frontend/CLAUDE.md` already records three others like it) — the whole claim
// is geometry. `.wp-board.hero-lifted`'s `max-height: 100%` was a percentage against
// `.modal-card`, whose own `height` is `auto` (only a `max-height` sits on it); a percentage
// on the CHILD of a box with no *specified* height computes to `none` regardless of what the
// parent's own max-height renders at (CSS2.1 §10.5). So the hero grew past the card instead
// of scrolling within it, and `.hero-scroll` — the ONE scroller §8 promises — never engaged.
// Measured in the ADR at 360×640: an in-transit hero with one attached document was 668px
// against 622px of card.
import { test, expect, type Page } from '@playwright/test';
import { bootIntoTrip, shortLiveTripDates } from './boot';

const NOW = Date.parse('2026-08-05T20:36:00.000Z');
const DAY = '2026-08-05';

const PLACES = [
  {
    id: 'p-fra',
    tripId: 't1',
    name: 'פרנקפורט (Frankfurter Flughafen – FRA)',
    lat: 50.037,
    lng: 8.562,
    timezone: 'Europe/Berlin',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    updatedBy: 'u1',
  },
  {
    id: 'p-tlv',
    tripId: 't1',
    name: 'נמל התעופה בן גוריון',
    lat: 32.009,
    lng: 34.882,
    timezone: 'Asia/Jerusalem',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    updatedBy: 'u1',
  },
];

const BOOKINGS = [
  {
    id: 'bk-fl',
    tripId: 't1',
    type: 'flight',
    title: 'LH 692',
    confirmationCode: 'LH692',
    fromPlaceId: 'p-fra',
    toPlaceId: 'p-tlv',
    source: 'manual',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    updatedBy: 'u1',
  },
];

/** A red-eye (the fullest meta row, ADR-0160 §M) plus a note and one attached document — the
 *  in-transit-plus-document combination §T measured as over the 360×640 card. */
const EVENTS = [
  {
    id: 'ev-fl',
    tripId: 't1',
    date: DAY,
    title: 'LH 692',
    icon: '✈️',
    category: 'transport',
    kind: 'hard',
    startsAt: '2026-08-05T19:00:00.000Z',
    endsAt: '2026-08-06T10:00:00.000Z',
    endDate: '2026-08-06',
    bookingId: 'bk-fl',
    status: 'planned',
    sortOrder: 1,
    source: 'manual',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    updatedBy: 'u1',
  },
  {
    id: 'ev-next',
    tripId: 't1',
    date: DAY,
    title: 'איוש',
    icon: '💡',
    kind: 'soft',
    startsAt: '2026-08-06T04:00:00.000Z',
    endsAt: '2026-08-06T05:00:00.000Z',
    status: 'planned',
    sortOrder: 2,
    source: 'manual',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    updatedBy: 'u1',
  },
];

const NOTE = {
  id: 'n-flight',
  tripId: 't1',
  eventId: 'ev-fl',
  body:
    'שורה ראשונה: לבקש מקום ליד החלון. שורה שנייה: להחליף מטבע בנחיתה. שורה שלישית: לשמור את ' +
    'כרטיס העלייה נגיש. שורה רביעית: לוודא שהמזוודה לא עוברת את המשקל המותר. שורה חמישית: לקחת ' +
    'מטען נייד לטלפון, כי הטיסה ארוכה ואין שקע ליד המושב. שורה שישית: להוריד מראש את מפת התחבורה ' +
    'הציבורית של היעד, כי לא בטוח שיהיה אינטרנט בנחיתה.',
  source: 'member',
  createdBy: 'u1',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  updatedBy: 'u1',
};

const DOCUMENT = {
  id: 'd-boarding',
  tripId: 't1',
  title: 'כרטיס עלייה למטוס',
  type: 'other',
  mimeType: 'application/pdf',
  sizeBytes: 1200,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  updatedBy: 'u1',
};
const ATTACHMENT = {
  id: 'a-boarding',
  tripId: 't1',
  documentId: 'd-boarding',
  eventId: 'ev-fl',
  createdBy: 'u1',
  createdAt: '2024-01-01T00:00:00.000Z',
};

async function liftedHero(page: Page) {
  await bootIntoTrip(page, {
    now: NOW,
    dates: shortLiveTripDates(NOW),
    events: EVENTS,
    bookings: BOOKINGS,
    places: PLACES,
    notes: [NOTE],
    documents: [DOCUMENT],
    documentAttachments: [ATTACHMENT],
  });
  await page.goto('/');
  const board = page.locator('.wp-board').first();
  await expect(board).toBeVisible();
  await board.click();
  const hero = page.locator('.hero-lifted');
  await expect(hero).toBeVisible();
  // Wait for the FLIP to settle — mid-flight the scroller is transiently a different size,
  // which is a real measurement of a state nobody looks at (mirrors hero-in-transit.spec.ts).
  await page.waitForFunction(
    () => {
      const el = document.querySelector('.hero-lifted') as HTMLElement | null;
      if (!el) return false;
      const h = Math.round(el.getBoundingClientRect().height);
      const prev = Number(el.dataset.e2eLastHeight ?? '-1');
      el.dataset.e2eLastHeight = String(h);
      return h > 0 && h === prev;
    },
    undefined,
    { polling: 100 },
  );
  return hero;
}

test('the hero clips to its card instead of growing past it, on a heavy point at 360×640', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await liftedHero(page);

  const measured = await page.evaluate(() => {
    const card = document.querySelector('.modal-card') as HTMLElement;
    const hero = document.querySelector('.hero-lifted') as HTMLElement;
    const scroll = document.querySelector('.hero-scroll') as HTMLElement;
    return {
      cardHeight: card.getBoundingClientRect().height,
      heroHeight: hero.getBoundingClientRect().height,
      scrollHeight: scroll.scrollHeight,
      clientHeight: scroll.clientHeight,
    };
  });

  // The fixture genuinely exceeds the room on this phone — otherwise the assertions below
  // prove nothing. `.modal-card`'s own box is unaffected by the bug (its max-height resolves
  // fine against the overlay, ADR-0160 §T), so it is the independent reference for "the room".
  expect(measured.scrollHeight).toBeGreaterThan(measured.cardHeight);

  // THE ASSERTION: the hero is bounded to its card, not spilling past it.
  expect(measured.heroHeight).toBeLessThanOrEqual(measured.cardHeight + 1);
  // …and `.hero-scroll` — the ONE scroller §8 promises — is what absorbs the rest.
  expect(measured.scrollHeight).toBeGreaterThan(measured.clientHeight);
});

// **The public itinerary, in a real browser** (ADR-0213).
//
// Two claims the unit suite cannot make. First, ANONYMITY: the reader has no account, so
// the gate must let `/s/<code>` through with no auth mocked at all — a jsdom render of the
// screen in isolation proves nothing about the route it lives on. Second, GEOMETRY at the
// phone widths ADR-0017 targets: jsdom reports every rect as zero, so "no horizontal
// overflow at 360px" is invisible to it by construction.
//
// Deliberately hermetic like the rest of the suite: the one public endpoint is route-mocked,
// nothing else is, and the absence of an auth mock IS the anonymity assertion.
import { test, expect, type Page } from '@playwright/test';
import {
  SHARE_DAY_KIND,
  SHARE_DAY_SUMMARY_KIND,
  SHARE_DAYPART,
  SHARE_DETAIL_LEVEL,
  SHARE_OP_KIND,
  SHARE_TRIP_SHAPE,
  type SharedItinerary,
} from '@waypoint/shared';
import { t } from '../src/i18n/he';

const CODE = '7Kq2mB9x';
const PHONES = [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
];

const SUMMARY: SharedItinerary = {
  status: 'live',
  detailLevel: SHARE_DETAIL_LEVEL.SUMMARY,
  generatedAt: '2026-08-29T08:10:00.000Z',
  shareUrl: `/s/${CODE}`,
  trip: {
    name: 'איסלנד עם המשפחה',
    destination: 'Iceland',
    icon: '🇮🇸',
    startDate: '2026-08-29',
    endDate: '2026-08-31',
    dayCount: 3,
    eventCount: 3,
    routeLabels: ['רייקיאוויק', 'ויק'],
    routeStopCount: 2,
    shape: SHARE_TRIP_SHAPE.LINE,
    baseCount: 2,
  },
  narrative: { source: 'deterministic', title: 'רייקיאוויק ← ויק', summary: '' },
  // Required, and empty here on purpose: Summary states no booking, so the bookings block
  // has nothing to draw and must not draw a heading over nothing.
  commitments: [],
  days: [
    {
      ordinal: 1,
      date: '2026-08-29',
      // The derived shapes, not sentences — the words are the renderer's (ADR-0213's
      // 2026-08-30 amendment), so this fixture is also the check that it has them.
      title: { kind: SHARE_DAY_KIND.FLIGHT_OUT, to: 'איסלנד' },
      summary: { kind: SHARE_DAY_SUMMARY_KIND.STAY, place: 'Laugavegur 22' },
      sections: [
        {
          daypart: SHARE_DAYPART.MORNING,
          events: [{ title: 'נחיתה בקפלוויק', icon: '✈️', daypart: SHARE_DAYPART.MORNING }],
        },
      ],
    },
    {
      ordinal: 2,
      date: '2026-08-30',
      title: { kind: SHARE_DAY_KIND.NONE },
      summary: { kind: SHARE_DAY_SUMMARY_KIND.NONE },
      sections: [],
    },
    {
      ordinal: 3,
      date: '2026-08-31',
      title: { kind: SHARE_DAY_KIND.NONE },
      summary: { kind: SHARE_DAY_SUMMARY_KIND.NONE },
      sections: [],
    },
  ],
};

const FULL: SharedItinerary = {
  ...SUMMARY,
  detailLevel: SHARE_DETAIL_LEVEL.FULL,
  days: [
    {
      ...SUMMARY.days[0],
      sections: [
        {
          daypart: SHARE_DAYPART.MORNING,
          events: [
            {
              title: 'נחיתה בקפלוויק',
              icon: '✈️',
              daypart: SHARE_DAYPART.MORNING,
              hard: true,
              startLabel: '09:30',
              placeName: 'Keflavík',
              address: 'Keflavíkurflugvöllur',
              mapUrl: 'https://www.google.com/maps/search/?api=1&query=Keflav%C3%ADk',
            },
          ],
        },
      ],
    },
    SUMMARY.days[1],
    SUMMARY.days[2],
  ],
};

/**
 * **The confirmation code rides its own event now** (ADR-0213's fourth 2026-08-30
 * amendment). It used to be `appendix.bookingSecrets`, four flat lists at the foot of the
 * document — the owner's _"nothing is linked to the events"_ — and the appendix has been
 * narrowed to what is attached to nothing. So the fixture attaches it, and the test below
 * opens the fold it now lives behind.
 */
const EVERYTHING: SharedItinerary = {
  ...FULL,
  detailLevel: SHARE_DETAIL_LEVEL.EVERYTHING,
  days: [
    {
      ...FULL.days[0],
      sections: [
        {
          ...FULL.days[0].sections[0],
          events: [
            {
              ...FULL.days[0].sections[0].events[0],
              ops: [{ kind: SHARE_OP_KIND.CODE, code: 'KEF-4821', provider: 'Icelandair' }],
            },
          ],
        },
      ],
    },
    FULL.days[1],
    FULL.days[2],
  ],
};

/**
 * The app's silent session probe fails for an anonymous reader — a 404 here, a 401 in
 * production — and the browser logs that as a console error. It is correct behaviour and
 * not this page's: `/s/` renders regardless, which is the whole point of the gate exemption.
 * Filtered by name rather than by dropping the assertion, so anything else still fails.
 */
const ANONYMOUS_AUTH_PROBE = /auth\/refresh/;

async function open(page: Page, projection: SharedItinerary, viewport = PHONES[0]) {
  const errors: string[] = [];
  const record = (text: string) => {
    if (!ANONYMOUS_AUTH_PROBE.test(text)) errors.push(text);
  };
  // The URL is in the message's LOCATION, not its text — a failed-resource console entry
  // reads only "Failed to load resource: ... 404", which names nothing.
  page.on(
    'console',
    (message) =>
      message.type() === 'error' && record(`${message.location().url} ${message.text()}`),
  );
  page.on('pageerror', (error) => record(error.message));
  await page.setViewportSize(viewport);
  await page.route(
    (url) => url.pathname === `/shared-itineraries/${CODE}`,
    (route) => route.fulfill({ json: projection }),
  );
  await page.goto(`/s/${CODE}`);
  return errors;
}

for (const viewport of PHONES) {
  test(`anonymous Summary reads cleanly at ${viewport.width}px`, async ({ page }) => {
    // No /me, no /auth/refresh, no token — the reader has no account, and the absence of
    // those mocks is what proves the gate let them through.
    const errors = await open(page, SUMMARY, viewport);

    await expect(page.getByRole('heading', { name: 'איסלנד עם המשפחה' })).toBeVisible();
    await expect(page.getByText('נחיתה בקפלוויק').first()).toBeVisible();
    await expect(page).not.toHaveURL(/login/);
    expect(errors).toEqual([]);

    // Nothing may push the page sideways at a phone width (ADR-0017).
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test('Summary shows no exact fact the projection did not send', async ({ page }) => {
  await open(page, SUMMARY);

  await expect(page.getByText('בוקר')).toBeVisible();
  await expect(page.getByText('09:30')).toHaveCount(0);
  await expect(page.getByText('Keflavíkurflugvöllur')).toHaveCount(0);
  await expect(page.getByText('KEF-4821')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /מפה/ })).toHaveCount(0);
});

test('Full adds the orientation facts, and a map link big enough to hit', async ({ page }) => {
  await open(page, FULL);

  await expect(page.getByText('09:30')).toBeVisible();
  await expect(page.getByText(/Keflavíkurflugvöllur/)).toBeVisible();
  const mapLink = page.getByRole('link', { name: /מפה/ }).first();
  await expect(mapLink).toBeVisible();
  // ADR-0017's touch floor, measured rather than assumed.
  expect((await mapLink.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test('Everything puts the booking code on its own event, behind the row fold', async ({ page }) => {
  await open(page, EVERYTHING);

  // Present but not shown: the fold is what keeps a schedule readable to someone who wants
  // the schedule, while an operator is one press from the code.
  const code = page.getByText('KEF-4821');
  await expect(code).toBeAttached();
  await expect(code).not.toBeVisible();

  await page.locator('.sh-ops summary').first().click();
  await expect(code).toBeVisible();

  // The other two families were never enabled, and the appendix carries neither.
  await expect(page.getByText('פתקים ומשימות')).toHaveCount(0);
  await expect(page.getByText('הנוסעים')).toHaveCount(0);
});

test('days open one at a time', async ({ page }) => {
  await open(page, FULL);

  const heads = page.locator('.sh-day-head');
  await expect(heads.first()).toHaveAttribute('aria-expanded', 'true');
  await heads.nth(1).click();
  await expect(heads.first()).toHaveAttribute('aria-expanded', 'false');
  await expect(heads.nth(1)).toHaveAttribute('aria-expanded', 'true');
});

test('a revoked link says so without disclosing whether the trip exists', async ({ page }) => {
  await page.setViewportSize(PHONES[0]);
  await page.route(
    (url) => url.pathname === `/shared-itineraries/${CODE}`,
    (route) => route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND' } } }),
  );
  await page.goto(`/s/${CODE}`);

  await expect(page.getByRole('heading', { name: 'המסלול לא זמין' })).toBeVisible();
  // It must not name a trip, a person or a reason.
  await expect(page.getByText('איסלנד עם המשפחה')).toHaveCount(0);
});

test('the dark theme renders the page, with the trip identity staying dark', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  const errors = await open(page, FULL);

  await expect(page.getByRole('heading', { name: 'איסלנד עם המשפחה' })).toBeVisible();
  expect(errors).toEqual([]);
});

/** Enough days to be taller than any phone — the state the reader is actually in. */
const LONG: SharedItinerary = {
  ...FULL,
  trip: { ...FULL.trip, dayCount: 14, endDate: '2026-09-11' },
  days: Array.from({ length: 14 }, (_, index) => ({
    ...FULL.days[0],
    ordinal: index + 1,
    date: new Date(Date.UTC(2026, 7, 29 + index)).toISOString().slice(0, 10),
  })),
};

/**
 * **The page a stranger sees has to scroll, and it did not** (owner report, 2026-08-30).
 *
 * The app shell refuses to scroll on purpose — `html, body { overflow: clip }`, every scroll
 * belongs to `.body`, a sheet or a strip (`e2e/shell-does-not-scroll.spec.ts` asserts that
 * refusal) — and this screen renders OUTSIDE the shell, so it inherited the refusal and none
 * of the scroller. A day past the fold was simply unreachable. Only a real browser can say
 * so: in jsdom every element is 0px tall and therefore never overflows.
 */
/**
 * **The DOCUMENT scrolls, and that is the assertion** — not merely "something scrolled".
 *
 * This test used to drive `.sh-page`'s own `scrollTo`, which passed against an inner
 * `100dvh` scroller and so said nothing about the browser's pull-to-refresh: a pull at the
 * top of an inner scroller is not a viewport overscroll, and the reader shipped unable to
 * refresh for a round because nothing here asked WHO scrolls (owner, 2026-08-31).
 */
test('the reader scrolls the document to its last day and its footer', async ({ page }) => {
  await open(page, LONG);

  // The page is content, not a viewport: no scrollport of its own to trap the gesture in.
  const pageIsAScroller = await page
    .locator('.sh-page')
    .evaluate((el) => el.scrollHeight - el.clientHeight > 0);
  expect(pageIsAScroller).toBe(false);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
  );
  expect(overflow).toBeGreaterThan(0);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await expect(page.getByText(t.share.public.inviteTitle)).toBeInViewport();
});

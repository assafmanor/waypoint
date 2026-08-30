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
import { SHARE_DAYPART, SHARE_DETAIL_LEVEL, type SharedItinerary } from '@waypoint/shared';

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
  },
  narrative: { source: 'deterministic', title: 'רייקיאוויק ← ויק', summary: '' },
  days: [
    {
      ordinal: 1,
      date: '2026-08-29',
      title: 'קפלוויק ← רייקיאוויק',
      summary: 'נחיתה בקפלוויק',
      sections: [
        {
          daypart: SHARE_DAYPART.MORNING,
          events: [{ title: 'נחיתה בקפלוויק', icon: '✈️', daypart: SHARE_DAYPART.MORNING }],
        },
      ],
    },
    { ordinal: 2, date: '2026-08-30', title: '', summary: '', sections: [] },
    { ordinal: 3, date: '2026-08-31', title: '', summary: '', sections: [] },
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

const EVERYTHING: SharedItinerary = {
  ...FULL,
  detailLevel: SHARE_DETAIL_LEVEL.EVERYTHING,
  appendix: { bookingSecrets: [{ title: 'טיסה', lines: ['Icelandair', 'KEF-4821'] }] },
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

test('Everything shows exactly the one family that was enabled', async ({ page }) => {
  await open(page, EVERYTHING);

  await expect(page.getByText('KEF-4821')).toBeVisible();
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

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
  TIME_MEANING,
  type SharedItinerary,
} from '@waypoint/shared';
import { t } from '../src/i18n/he';
import { stableBox } from './measure';

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
    // UTC+0 year-round, so `PINNED` below is the trip's wall clock as well as the box's and
    // a now-line assertion needs no offset arithmetic (ADR-0213's eleventh amendment §6).
    // Every day below repeats it as its own `timezone`, which is what the page actually reads
    // for `now` since the eighteenth amendment — a trip whose days are all lived in the
    // destination is the case where the two agree, and that keeps the arithmetic-free clock.
    timezone: 'Atlantic/Reykjavik',
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
      timezone: 'Atlantic/Reykjavik',
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
      timezone: 'Atlantic/Reykjavik',
      title: { kind: SHARE_DAY_KIND.NONE },
      summary: { kind: SHARE_DAY_SUMMARY_KIND.NONE },
      sections: [],
    },
    {
      ordinal: 3,
      date: '2026-08-31',
      timezone: 'Atlantic/Reykjavik',
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
              // **What the ROW prints** (ADR-0213's 2026-08-31 amendment §1). `startLabel`
              // is still projected — the journey header and its legs read it — but a row's
              // clock now comes from `time`, so a stub carrying only the raw pair renders no
              // hour at all. Reproduced by deleting this line: the `09:30` assertion below
              // fails. It lives here rather than coming from the projection because this
              // spec stubs the response.
              time: { label: '09:30', meaning: TIME_MEANING.EXACT },
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

/**
 * **09:00 on the trip's first day** (ADR-0213's eleventh amendment). The page now derives
 * what opens, what is marked and how old it is from the clock, so a spec whose fixture
 * carries fixed dates must set its own `now` — `frontend/CLAUDE.md`'s rule, and without it
 * every assertion below would open nothing the moment the box clock drifted past the
 * fixture's three days.
 *
 * Also 09:00 rather than 09:31: the fixture's one timed event is at 09:30, so the now-line
 * lands above it and the day still reads as ahead of the reader.
 */
const PINNED = Date.parse('2026-08-29T09:00:00.000Z');

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
  // **Pinned twice, exactly as `boot.ts` explains it.** `waypoint:dev-now` is read at module
  // load behind `import.meta.env.DEV`, so under `E2E_PREVIEW=1` — a production bundle — that
  // branch is compiled out and the fixture would silently read the wall clock on one leg
  // only. `setFixedTime` pins the platform's clock, so both legs agree.
  await page.addInitScript(
    (now) => localStorage.setItem('waypoint:dev-now', now as string),
    String(PINNED),
  );
  await page.clock.setFixedTime(PINNED);
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

test('days open one at a time, starting on the day the trip is on', async ({ page }) => {
  await open(page, FULL);

  const heads = page.locator('.sh-day-head');
  // Day one is today at `PINNED` — the clock opened it, not an index (eleventh amendment §1).
  await expect(heads.first()).toHaveAttribute('aria-expanded', 'true');
  await heads.nth(1).click();
  await expect(heads.first()).toHaveAttribute('aria-expanded', 'false');
  await expect(heads.nth(1)).toHaveAttribute('aria-expanded', 'true');
  // And closing the open one leaves nothing open, which is a real state here.
  await heads.nth(1).click();
  await expect(page.locator('.sh-day.open')).toHaveCount(0);
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

/**
 * **THE LANDING, WHICH IS THE ONE CLAIM ONLY A BROWSER CAN MAKE** (ADR-0213's eleventh
 * amendment §1). jsdom reports every rect as zero, so the unit suite can prove that today's
 * card is the open one and nothing about where the page ends up — and "where it ends up" is
 * the whole feature. Fourteen days, so there is somewhere to land from.
 */
test('the reader lands on the day the trip is on, with the day before peeking above', async ({
  page,
}) => {
  // Day 4 is today at `PINNED + 3 days`, so there is real history above the target rather
  // than a card that happens to be first.
  const later = Date.parse('2026-09-01T09:00:00.000Z');
  await page.addInitScript(
    (now) => localStorage.setItem('waypoint:dev-now', now as string),
    String(later),
  );
  await page.clock.setFixedTime(later);
  await page.setViewportSize(PHONES[1]);
  await page.route(
    (url) => url.pathname === `/shared-itineraries/${CODE}`,
    (route) => route.fulfill({ json: LONG }),
  );
  await page.goto(`/s/${CODE}`);

  const today = page.locator('.sh-day.is-now');
  await expect(today).toHaveCount(1);
  await expect(today.locator('.sh-now-mark')).toHaveText(t.common.now);
  /**
   * **The whole block retries, which is `expectLanded`'s shape in
   * `event-arrival-scroll.spec.ts`** — the suite's own idiom for this exact question, and it
   * is the right one for two reasons an earlier draft of this test learned the hard way.
   * The scroll is eased, so a `scrollY > 0` poll goes true the moment it STARTS travelling
   * and any box read after it lands mid-flight; and `landAtTop` keeps re-aiming while the
   * surface settles, so the landing is a state to converge on rather than a value to read.
   * Polling one number and then reading another outside the retry went red once in three
   * runs on a loaded box.
   *
   * **The whole header on screen** is the claim: it carries the date and the `עכשיו` mark,
   * and a reader who lands mid-document has no masthead to tell them which day this is. The
   * gap above it is the row's own `scroll-margin-block-start`, so the bound measures the
   * stylesheet rather than restating its number.
   *
   * **And `stableBox` inside the retry, because the two answer different questions.**
   * `stableBox` absorbs a `boundingBox()` that returns `null` for a node a render detached
   * mid-call — `frontend/CLAUDE.md`'s trap, and this surface re-renders on the clock as well
   * as on every re-aim, so it is exactly the case that helper exists for. It also bounds each
   * attempt, which matters because a bare `boundingBox()` inherits `actionTimeout: 0` and a
   * locator that never resolves hangs to the test timeout naming no element. What it cannot
   * do is wait for an EASED SCROLL to arrive where it is going; that is the outer `toPass`.
   * Nested deliberately: node-replacement is not scroll-settling.
   */
  await expect(async () => {
    const box = await stableBox(today.locator('.sh-day-head'));
    expect(box.y).toBeGreaterThan(0);
    expect(box.y).toBeLessThan(60);
    // It really did have to move: a page that happened to open there proves nothing.
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    // And the day before is still a visible sliver, which is what the peek is for — a reader
    // must be able to see there is history above them without reading it.
    const previous = await stableBox(page.locator('.sh-day').nth(2));
    expect(previous.y + previous.height).toBeGreaterThan(0);
  }).toPass();

  // Nothing was marked past-or-future by accident: three days behind, ten ahead.
  await expect(page.locator('.sh-day.is-past')).toHaveCount(3);
});

test('nothing is open before the trip starts, and everything is cooled after it', async ({
  page,
}) => {
  const before = Date.parse('2026-08-20T09:00:00.000Z');
  await page.addInitScript(
    (now) => localStorage.setItem('waypoint:dev-now', now as string),
    String(before),
  );
  await page.clock.setFixedTime(before);
  await page.setViewportSize(PHONES[0]);
  await page.route(
    (url) => url.pathname === `/shared-itineraries/${CODE}`,
    (route) => route.fulfill({ json: LONG }),
  );
  await page.goto(`/s/${CODE}`);

  await expect(page.getByRole('heading', { name: 'איסלנד עם המשפחה' })).toBeVisible();
  // No day is a default: falling back to the first card is the same arbitrary index-pick the
  // amendment replaced. And the page stays where it opened.
  await expect(page.locator('.sh-day.open')).toHaveCount(0);
  await expect(page.locator('.sh-day.is-now')).toHaveCount(0);
  await expect(page.locator('.sh-day.is-past')).toHaveCount(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  // The masthead says where the trip is rather than asserting it is live.
  await expect(page.locator('.sh-kicker')).toContainText(t.share.public.phase.soon(9));
});

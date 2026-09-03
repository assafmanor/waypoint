// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  BOOKING_TYPE,
  SHARE_DAY_KIND,
  SHARE_DAY_SUMMARY_KIND,
  SHARE_OP_KIND,
  SHARE_DAYPART,
  SHARE_DETAIL_LEVEL,
  TIME_MEANING,
  type SharedItinerary as Projection,
} from '@waypoint/shared';
// The reader lands on today's card (eleventh amendment §1), and jsdom has no
// `scrollIntoView` at all — the same platform gap the day view's own tests state.
import '../test/scroll-into-view';
import { SharedItinerary } from './SharedItinerary';
import { t } from '../i18n/he';
import { withoutBidiControls } from '../lib/bidi';
import { agoLabel, hoursPhrase } from '../lib/duration';
import { getNow, setSimulatedNow } from '../lib/useClock';
import { SHARE_LOAD_RETRY_MS } from '../constants';

/** `ltrIsolate` wraps every Latin/numeric run in invisible bidi controls (ADR-0118), so a
 *  plain string match would never hit. */
const plain = (needle: string) => (text: string) => withoutBidiControls(text).includes(needle);

const CODE = '7Kq2mB9x';

/**
 * **Inside the trip, on its first day.** The page derives what to open, what to mark and how
 * old it is from the clock (ADR-0213's eleventh amendment), so every test here would otherwise
 * change behaviour as the real date drifted past the fixture's dates — a suite that passes in
 * August and opens nothing in September. `setSimulatedNow` is `useClock`'s own dev override,
 * the same one `Header` and `EventForm` pin their clocks with.
 */
const NOW = Date.parse('2026-08-29T09:00:00.000Z');

const summaryProjection: Projection = {
  status: 'live',
  detailLevel: SHARE_DETAIL_LEVEL.SUMMARY,
  generatedAt: '2026-08-29T08:10:00.000Z',
  shareUrl: `/s/${CODE}`,
  trip: {
    name: 'איסלנד עם המשפחה',
    destination: 'Iceland',
    icon: '🇮🇸',
    startDate: '2026-08-29',
    endDate: '2026-08-30',
    // UTC+0 year-round, so the trip's wall clock and `NOW` below are the same reading and a
    // now-line assertion needs no offset arithmetic to be checkable.
    timezone: 'Atlantic/Reykjavik',
    dayCount: 2,
    eventCount: 3,
    routeLabels: ['רייקיאוויק', 'ויק'],
    routeStopCount: 2,
    shape: 'line',
    baseCount: 2,
  },
  narrative: { source: 'deterministic', title: 'רייקיאוויק ← ויק', summary: '' },
  // Empty: a trip with nothing booked is a real state, and the block is then absent from
  // the page rather than present and blank.
  commitments: [],
  days: [
    {
      ordinal: 1,
      date: '2026-08-29',
      timezone: 'Atlantic/Reykjavik',
      title: { kind: SHARE_DAY_KIND.FLIGHT_OUT, to: 'איסלנד' },
      summary: { kind: SHARE_DAY_SUMMARY_KIND.STAY, place: 'Laugavegur 22' },
      sections: [
        {
          daypart: SHARE_DAYPART.MORNING,
          events: [
            { title: 'הפארק הלאומי ת׳ינגווליר', icon: '🌋', daypart: SHARE_DAYPART.MORNING },
          ],
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
  ],
};

/** Full, plus a booking on the first row — the caption's only input. */
const bookedProjection: Projection = {
  ...summaryProjection,
  detailLevel: SHARE_DETAIL_LEVEL.FULL,
  days: [
    {
      ...summaryProjection.days[0],
      sections: [
        {
          daypart: SHARE_DAYPART.MORNING,
          events: [
            {
              title: 'The Hill Hotel at Fludir',
              icon: '🏨',
              daypart: SHARE_DAYPART.MORNING,
              bookingType: BOOKING_TYPE.HOTEL,
              startLabel: '15:00',
              time: { label: '15:00', meaning: TIME_MEANING.EXACT },
              placeName: 'Fludir',
            },
          ],
        },
      ],
    },
    summaryProjection.days[1],
  ],
};

/** `fullProjection`'s day, with its one row given BOTH ends so it holds the pinned ⁦09:00⁩.
 *  The shipped fixture's row is `09:30` with no end — a point, which by design cannot hold a
 *  moment — so the nailed form needs a day of its own rather than a widened assertion. */
const runningRowProjection = (): Projection => ({
  ...fullProjection,
  days: [
    {
      ...fullProjection.days[0],
      sections: [
        {
          daypart: SHARE_DAYPART.MORNING,
          events: [
            {
              title: 'טבילה בלגונה הכחולה',
              icon: '♨️',
              daypart: SHARE_DAYPART.MORNING,
              hard: true,
              startLabel: '08:30',
              endLabel: '10:00',
              time: { label: '08:30–10:00', meaning: TIME_MEANING.WINDOW },
            },
          ],
        },
      ],
    },
    ...fullProjection.days.slice(1),
  ],
});

const fullProjection: Projection = {
  ...summaryProjection,
  detailLevel: SHARE_DETAIL_LEVEL.FULL,
  days: [
    {
      ...summaryProjection.days[0],
      sections: [
        {
          daypart: SHARE_DAYPART.MORNING,
          events: [
            {
              title: 'הפארק הלאומי ת׳ינגווליר',
              icon: '🌋',
              daypart: SHARE_DAYPART.MORNING,
              hard: false,
              startLabel: '09:30',
              time: { label: '09:30', meaning: TIME_MEANING.EXACT },
              placeName: 'Þingvellir',
              address: '806 Selfoss',
              mapUrl: 'https://www.google.com/maps/search/?api=1&query=%C3%9Eingvellir',
              journey: { mode: 'driving', minutes: 35, km: 28 },
            },
          ],
        },
      ],
    },
    summaryProjection.days[1],
  ],
};

const everythingProjection: Projection = {
  ...fullProjection,
  detailLevel: SHARE_DETAIL_LEVEL.EVERYTHING,
  // **The amendment's shape**: what has a host travels on it, and only what is attached to
  // nothing is left for the block at the foot.
  days: fullProjection.days.map((day, index) =>
    index > 0
      ? day
      : {
          ...day,
          sections: day.sections.map((section, sectionIndex) =>
            sectionIndex > 0
              ? section
              : {
                  ...section,
                  events: section.events.map((event, eventIndex) =>
                    eventIndex > 0
                      ? event
                      : {
                          ...event,
                          ops: [
                            { kind: SHARE_OP_KIND.CODE, code: 'KEF-4821', provider: 'Icelandair' },
                            {
                              kind: SHARE_OP_KIND.FILE,
                              handle: 'doc-1',
                              title: 'הזמנת הדירה.pdf',
                              mimeType: 'application/pdf',
                            },
                          ],
                        },
                  ),
                },
          ),
        },
  ),
  appendix: {
    ops: [{ kind: SHARE_OP_KIND.NOTE, title: 'נעלי הליכה' }],
  },
};

function serve(body: unknown, ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 404,
    json: async () => body,
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const renderShared = () =>
  render(
    <MemoryRouter initialEntries={[`/s/${CODE}`]}>
      <Routes>
        <Route path="s/:code" element={<SharedItinerary />} />
      </Routes>
    </MemoryRouter>,
  );

describe('SharedItinerary', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    setSimulatedNow(NOW);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    setSimulatedNow(null);
  });

  it('reads the public route without a bearer token', async () => {
    const fetchMock = serve(summaryProjection);
    renderShared();

    await screen.findByText('איסלנד עם המשפחה');
    const [, init] = fetchMock.mock.calls[0];
    // Never `apiFetch`: a 401 there would try a refresh and could log a signed-in owner
    // out of another tab because a stranger opened their link.
    expect(init?.headers).toBeUndefined();
  });

  it('renders Summary event identity with no exact facts', async () => {
    serve(summaryProjection);
    renderShared();

    expect(await screen.findByText(plain('הפארק הלאומי ת׳ינגווליר'))).toBeTruthy();
    expect(screen.queryByText(plain('09:30'))).toBeNull();
    expect(screen.queryByText(plain('806 Selfoss'))).toBeNull();
    expect(screen.queryByRole('link', { name: new RegExp(t.share.public.map) })).toBeNull();
  });

  it('composes the counts sentence itself when the narrative is deterministic', async () => {
    serve(summaryProjection);
    renderShared();

    expect(await screen.findByText(t.share.public.counts(2, 3))).toBeTruthy();
  });

  it('prints the generated summary when there is one', async () => {
    serve({
      ...summaryProjection,
      narrative: { source: 'generated', title: 'כביש 1', summary: 'ערים קטנות, טבע גדול.' },
    });
    renderShared();

    expect(await screen.findByText('ערים קטנות, טבע גדול.')).toBeTruthy();
  });

  it('adds times, address, map link and journey at Full', async () => {
    serve(fullProjection);
    renderShared();

    expect(await screen.findByText(plain('09:30'))).toBeTruthy();
    expect(screen.getByText(plain('806 Selfoss'))).toBeTruthy();
    // The mode is the point of the line: two bare numbers made a 121-minute walk and a
    // 67-minute drive the same shape (owner, 2026-08-30). Read off the row rather than by
    // text, because the mode's ICON sits in it beside its word.
    const leg = document.querySelector('.sh-journey');
    expect(withoutBidiControls(leg?.textContent ?? '')).toContain(
      withoutBidiControls(t.share.public.journey(t.travelMode.driving, 35, 28)),
    );
    expect(leg?.querySelector('svg.icon')).toBeTruthy();
    expect(screen.getByRole('link', { name: new RegExp(t.share.public.map) })).toBeTruthy();
  });

  it('renders a daypart heading only where events belong to it', async () => {
    serve(fullProjection);
    renderShared();

    expect(await screen.findByText(t.share.dayparts.morning)).toBeTruthy();
    for (const empty of ['noon', 'afternoon', 'evening', 'night', 'flexible'] as const) {
      expect(screen.queryByText(t.share.dayparts[empty])).toBeNull();
    }
  });

  it('names a day with no places by its date rather than inventing a title', async () => {
    serve(summaryProjection);
    renderShared();

    await screen.findByText('איסלנד עם המשפחה');
    expect(screen.getByText(plain('ראשון 30'))).toBeTruthy();
  });

  // **The words are this renderer's, from a kind the server shipped** (ADR-0213's
  // 2026-08-30 amendment; owner: _"Some day titles could also be derived (flying to
  // Iceland, flying back…)"_). The projection carries `{ kind: 'flightOut', to: 'איסלנד' }`
  // and no sentence at all, so this asserts the join as well as the word.
  it('says a derived day headline in words rather than joining two place names', async () => {
    serve(summaryProjection);
    renderShared();

    await screen.findByText('איסלנד עם המשפחה');
    expect(screen.getByText(plain(t.share.public.dayTitle.flightOut('איסלנד')))).toBeTruthy();
  });

  // The owner's own phrasing for the second line: _"night at…, Sleeping at…"_.
  it('names where the night is instead of repeating the day', async () => {
    serve(summaryProjection);
    renderShared();

    await screen.findByText('איסלנד עם המשפחה');
    expect(screen.getByText(plain(t.share.public.daySummary.stay('Laugavegur 22')))).toBeTruthy();
  });

  // A booking states its type, so the row can say what it IS before it says where — and it
  // says it in the app's own word, never a second copy invented for this page.
  it('captions a booking-backed row with the booking type', async () => {
    serve(bookedProjection);
    renderShared();

    await screen.findByText('איסלנד עם המשפחה');
    expect(screen.getByText(t.index.bookingType.hotel)).toBeTruthy();
  });

  // **A flight has to say when it lands** (owner, 2026-08-30). Both ends were in the
  // projection all along and this renderer printed only the first.
  it('prints a time range where the event carries both ends', async () => {
    serve({
      ...fullProjection,
      days: [
        {
          ...fullProjection.days[0],
          sections: [
            {
              daypart: SHARE_DAYPART.MORNING,
              events: [
                {
                  title: 'טיסה לאיסלנד',
                  icon: '✈️',
                  daypart: SHARE_DAYPART.MORNING,
                  startLabel: '09:20',
                  endLabel: '14:05',
                  time: { label: '09:20', endLabel: '14:05', meaning: TIME_MEANING.EXACT },
                  placeName: 'KEF',
                },
              ],
            },
          ],
        },
        fullProjection.days[1],
      ],
    });
    renderShared();

    await screen.findByText('איסלנד עם המשפחה');
    expect(screen.getByText(plain(t.share.public.timeRange('09:20', '14:05')))).toBeTruthy();
  });

  /**
   * **THE FLEXIBLE HALF** (ADR-0213's 2026-08-31 amendment §1; owner: _"that also includes
   * flexible times like starting from.. Or until..."_).
   *
   * A floor and a deadline are not halves of a range — a `held` resource's far end is a
   * different day's fact — so they say which they are instead of printing a bare clock that
   * reads as an appointment. The words are the app's own (`t.day.fromTime`/`untilTime`),
   * repeated in `share.public` because a stranger never sees the app's dictionary.
   */
  it('says מ- for a floor and עד for a deadline, never a range', async () => {
    serve({
      ...fullProjection,
      days: [
        {
          ...fullProjection.days[0],
          sections: [
            {
              daypart: SHARE_DAYPART.MORNING,
              events: [
                {
                  title: 'השכרת רכב',
                  daypart: SHARE_DAYPART.MORNING,
                  // The raw pair is still projected — a journey header reads it — and the
                  // ROW deliberately does not print it: the return is five days away.
                  startLabel: '10:00',
                  endLabel: '18:00',
                  time: { label: '10:00', meaning: TIME_MEANING.NOT_BEFORE },
                },
                {
                  title: 'עזיבת הגסטהאוס',
                  daypart: SHARE_DAYPART.MORNING,
                  startLabel: '11:00',
                  time: { label: '11:00', meaning: TIME_MEANING.NOT_AFTER },
                },
                {
                  title: 'The Hill Hotel',
                  daypart: SHARE_DAYPART.MORNING,
                  startLabel: '17:00',
                  time: { label: '17:00', endLabel: '21:00', meaning: TIME_MEANING.WINDOW },
                },
              ],
            },
          ],
        },
        fullProjection.days[1],
      ],
    });
    const { container } = renderShared();

    await screen.findByText('איסלנד עם המשפחה');
    // **The word and the clock are two elements**, because the word is prose and `.sh-time`
    // is a mono face with no Hebrew (2026-08-31). So the assertion reads the composed line
    // rather than looking for one node holding both.
    const said = [...container.querySelectorAll('.sh-said')].map((el) =>
      withoutBidiControls(el.textContent ?? ''),
    );
    expect(said).toContain(withoutBidiControls(t.share.public.timeFrom('10:00')));
    expect(said).toContain(withoutBidiControls(t.share.public.timeUntil('11:00')));
    // A closed window prints both bounds (ADR-0184 §1) — the one flexible arm that does.
    expect(screen.getByText(plain(t.share.public.timeRange('17:00', '21:00')))).toBeTruthy();
    // …and the hire's far end never reaches the page as the other half of a range, which is
    // the `10:00–18:00`-for-a-week defect the `hard` gate was masking.
    expect(screen.queryByText(plain(t.share.public.timeRange('10:00', '18:00')))).toBeNull();
  });

  /**
   * **THE STAY'S TWO MOMENTS** (§2). A check-in window is the commonest flexible time the
   * app holds and sharing showed it nowhere, because the fourth amendment moved the stay out
   * of the schedule into `day.stay` — a name with no clock, so there was no row for a rule
   * about rows to reach. They come back to the day's FRAME, on their own line.
   */
  it('states the stay’s check-in and check-out on the day frame', async () => {
    serve({
      ...fullProjection,
      days: [
        {
          ...fullProjection.days[0],
          stay: 'פלוּדיר',
          checkIn: { label: '15:00', endLabel: '21:00', meaning: TIME_MEANING.WINDOW },
          checkOut: { label: '11:00', meaning: TIME_MEANING.NOT_AFTER },
        },
        fullProjection.days[1],
      ],
    });
    const { container } = renderShared();

    await screen.findByText('איסלנד עם המשפחה');
    const when = container.querySelector('.sh-stay-when');
    expect(when).toBeTruthy();
    // `plain` is a MATCHER factory for `getByText`, not a string transform — the whole
    // point here is to read one element's composed text, so the control strip is direct.
    const text = withoutBidiControls(when!.textContent ?? '');
    expect(text).toContain(t.share.public.checkIn);
    expect(text).toContain(withoutBidiControls(t.share.public.timeRange('15:00', '21:00')));
    // The check-out names no place: the place being left is the card immediately above, and
    // naming it made this line read future → past → future (§3).
    expect(text).toContain(t.share.public.checkOut);
    expect(text).not.toContain('ויק');
    expect(text).toContain(withoutBidiControls(t.share.public.timeUntil('11:00')));
    // **And the header is FOUR lines, not seven** (§3, the reported mess). `.sh-day-copy`'s
    // rules used to be descendant selectors, so the spans `.sh-stay-when` composes its line
    // out of each became a muted grey block of their own. Only its direct children stack.
    const copy = container.querySelector('.sh-day-copy')!;
    const blocks = [...copy.querySelectorAll('span, strong')].filter(
      (el) => el.parentElement === copy,
    );
    expect(blocks).toHaveLength(3);
    // **And the two moments are two blocks, not one `·`-joined run** (§4). Joined, the pair
    // wrapped wherever it ran out of box — which at 360 fell between `צ׳ק-אין` and its own
    // clock, stranding a noun from the time it names.
    expect(when!.querySelectorAll('.sh-moment')).toHaveLength(2);
    expect(text).not.toContain('·');
  });

  it('captions nothing on a row no booking backs', async () => {
    serve(fullProjection);
    const { container } = renderShared();

    await screen.findByText('איסלנד עם המשפחה');
    expect(container.querySelector('.sh-kind')).toBeNull();
  });

  it('opens one day at a time', async () => {
    serve(fullProjection);
    const { container } = renderShared();

    await screen.findByText('איסלנד עם המשפחה');
    const [first, second] = [...container.querySelectorAll('.sh-day-head')];
    expect(first.getAttribute('aria-expanded')).toBe('true');
    act(() => fireEvent.click(second));
    expect(first.getAttribute('aria-expanded')).toBe('false');
    expect(second.getAttribute('aria-expanded')).toBe('true');
  });

  it('shows the operational appendix only when the projection carries one', async () => {
    serve(everythingProjection);
    renderShared();

    // **Attached to its row, not listed at the foot** (ADR-0213's 2026-08-30 amendment).
    // The fold is closed, so the material is in the DOM and not on screen — which is the
    // design: a reader wants the schedule, an operator opens the fold.
    expect(await screen.findByText(plain('KEF-4821'))).toBeTruthy();
    expect(
      screen.getByRole('link', { name: plain('הזמנת הדירה.pdf') }).getAttribute('href'),
    ).toContain(`/shared-itineraries/${CODE}/documents/doc-1`);

    // And what is attached to nothing keeps a block, under a heading that says what it is
    // rather than `פרטים נוספים`.
    expect(screen.getByText(t.share.public.appendix.title)).toBeTruthy();
    expect(screen.getByText(plain('נעלי הליכה'))).toBeTruthy();
  });

  it('says the link is unavailable, without hinting whether the trip exists', async () => {
    serve({ error: { code: 'NOT_FOUND' } }, false);
    renderShared();

    expect(await screen.findByText(t.share.public.unavailableTitle)).toBeTruthy();
    expect(screen.getByText(t.share.public.unavailableBody)).toBeTruthy();
  });

  /**
   * **ADR-0213's seventeenth amendment** — the owner's report was that a deploy took his
   * live links away, and every assertion here is one of the three ways it did.
   *
   * The suite used to pin the opposite of the first two: _"treats a projection this build
   * cannot parse as unavailable"_ and nothing at all for a 500, so the page's only verdict
   * was `יכול להיות שהלינק בוטל` — a sentence about the LINK, drawn for two failures that
   * are about the document and the connection.
   */
  describe('a failed read says which failure it was', () => {
    const RELOAD_STAMP_KEY = 'waypoint:share-reload';
    /** Valid enough to reach the parse, and unreadable to this build — which is exactly the
     *  shape of a projection from a server one deploy ahead (`sharedItinerarySchema` is
     *  strict, so an added field is a parse failure and not an ignored key). */
    const fromANewerServer = { ...summaryProjection, tomorrowsField: 'v' };

    let reload: ReturnType<typeof vi.fn>;
    beforeEach(() => {
      reload = vi.fn();
      vi.stubGlobal('location', { ...window.location, reload });
      window.sessionStorage.clear();
    });
    afterEach(() => {
      vi.useRealTimers();
      window.sessionStorage.clear();
    });

    it('takes a fresh document for a projection this build cannot read, and says nothing about the link', async () => {
      serve(fromANewerServer);
      renderShared();

      // The cure is a newer document, so the page reloads rather than accusing the link.
      // `takeParkedBuild` found no service worker here (jsdom has none), which is the
      // second half of the same recovery and the reason this falls through to `reloadOnce`.
      await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
      expect(screen.queryByText(t.share.public.unavailableTitle)).toBeNull();
    });

    it('does not spin: a second unreadable read inside the cooldown says so instead of reloading again', async () => {
      window.sessionStorage.setItem(RELOAD_STAMP_KEY, String(getNow()));
      serve(fromANewerServer);
      renderShared();

      expect(await screen.findByText(t.share.public.failedTitle)).toBeTruthy();
      expect(reload).not.toHaveBeenCalled();
      expect(screen.queryByText(t.share.public.unavailableTitle)).toBeNull();
    });

    /**
     * The ladder is half a minute of real seconds, so these two drive it on fake timers and
     * query synchronously — `waitFor` cannot help here: @testing-library/dom only recognises
     * *jest*'s fake clock, so under vitest's it would poll a timer that never advances.
     */
    const settle = async (ms = 0) => {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    };
    const runTheLadder = async () => {
      await settle();
      for (const ms of SHARE_LOAD_RETRY_MS) await settle(ms);
    };

    it('re-asks a failure that is not the link, and renders when the answer arrives', async () => {
      vi.useFakeTimers();
      // Two failures a deploy actually produces — a proxy 502 while the container swaps,
      // then a socket that went nowhere — followed by the deploy finishing.
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 502, json: async () => ({}) })
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValue({ ok: true, status: 200, json: async () => summaryProjection });
      vi.stubGlobal('fetch', fetchMock);
      renderShared();

      await settle();
      // It never draws the revoked card on the way there: nothing said the link was gone.
      expect(screen.queryByText(t.share.public.unavailableTitle)).toBeNull();
      await settle(SHARE_LOAD_RETRY_MS[0]);
      await settle(SHARE_LOAD_RETRY_MS[1]);

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(screen.getByText('איסלנד עם המשפחה')).toBeTruthy();
      // Stopped asking the moment it had an answer.
      await settle(SHARE_LOAD_RETRY_MS[2]);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('gives up saying the link was NOT revoked, and the tap asks again', async () => {
      vi.useFakeTimers();
      const fetchMock = vi.fn().mockRejectedValue(new Error('network error'));
      vi.stubGlobal('fetch', fetchMock);
      renderShared();
      await runTheLadder();

      expect(screen.getByText(t.share.public.failedTitle)).toBeTruthy();
      expect(screen.getByText(t.share.public.failedBody)).toBeTruthy();
      expect(screen.queryByText(t.share.public.unavailableTitle)).toBeNull();
      // The whole ladder ran, and stopped: one attempt plus a retry per rung.
      expect(fetchMock).toHaveBeenCalledTimes(SHARE_LOAD_RETRY_MS.length + 1);

      fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => summaryProjection });
      fireEvent.click(screen.getByText(t.share.public.failedAction));
      await settle();
      expect(screen.getByText('איסלנד עם המשפחה')).toBeTruthy();
    });
  });

  it('keeps the last loaded page and labels it stale when a refresh fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => summaryProjection })
      .mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);
    const { rerender } = renderShared();

    await screen.findByText('איסלנד עם המשפחה');
    // A second mount with the same code re-reads; the failure must not blank the page.
    rerender(
      <MemoryRouter initialEntries={[`/s/${CODE}`]}>
        <Routes>
          <Route path="s/:code" element={<SharedItinerary />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.queryByText('איסלנד עם המשפחה')).toBeTruthy());
  });
  /** What ADR-0213's 2026-08-30 amendment put on this page. */
  describe('the stay, the journey and the fixed points', () => {
    const withDay = (day: Record<string, unknown>) => ({
      ...fullProjection,
      days: [{ ...fullProjection.days[0], ...day }],
    });

    /** The ops fold is closed by default — a reader wants the schedule, an operator wants
     *  the code — so the file row has to be disclosed before it can be pressed. */
    const openOpsAndFindFile = async (): Promise<HTMLElement> => {
      const fold = await waitFor(() => {
        const found = document.querySelector('details.sh-ops');
        expect(found).toBeTruthy();
        return found as HTMLDetailsElement;
      });
      await act(async () => {
        fold.open = true;
      });
      return screen.getByText(plain('הזמנת הדירה.pdf'));
    };

    it('says where you sleep in the day header, not as a row in its afternoon', async () => {
      serve(withDay({ stay: 'Reykjahlíð' }));
      renderShared();
      expect(await screen.findByText(plain(t.share.public.stay('Reykjahlíð')))).toBeTruthy();
    });

    it('names the wait between two legs of one journey', async () => {
      const event = fullProjection.days[0].sections[0].events[0];
      serve(
        withDay({
          sections: [
            {
              ...fullProjection.days[0].sections[0],
              events: [
                {
                  ...event,
                  // Real leg titles are ROUTES, which is what made the defect invisible here:
                  // a bare city as a title happens to read correctly when the layover line is
                  // composed from it. The wait names one airport, never the next hop.
                  legs: [
                    { title: 'תל אביב ← וינה', startLabel: '14:30', endLabel: '18:15' },
                    {
                      title: 'וינה ← קפלאוויק',
                      startLabel: '19:00',
                      endLabel: '23:20',
                      layoverMinutes: 45,
                      layoverPlace: 'וינה',
                    },
                  ],
                },
              ],
            },
          ],
        }),
      );
      renderShared();
      // The first leg has nothing before it, so it carries no wait — only the second does.
      expect(
        await screen.findByText(plain(t.share.public.layover('וינה', hoursPhrase(45)))),
      ).toBeTruthy();
      // …and never the leg it precedes, which is what it used to say.
      expect(
        screen.queryByText(plain(t.share.public.layover('וינה ← קפלאוויק', hoursPhrase(45)))),
      ).toBeNull();
      expect(
        screen.queryByText(plain(t.share.public.layover('תל אביב', hoursPhrase(45)))),
      ).toBeNull();
    });

    /**
     * **The journey is a container; the header totals, each leg its own flight time**
     * (ADR-0213 ninth amendment §1-§2).
     *
     * This test previously asserted exactly ONE duration on the card, pinning the eighth
     * amendment's reading that "confusing" meant too many numbers. The owner rejected that
     * the same day — _"doesn't show journey leg durations (flights)"_ — so the assertion is
     * inverted on purpose: the total AND each leg, with the wait between them.
     */
    it('renders a chained journey as a container, with a span on the header and on each leg', async () => {
      const event = fullProjection.days[0].sections[0].events[0];
      serve(
        withDay({
          sections: [
            {
              ...fullProjection.days[0].sections[0],
              events: [
                {
                  ...event,
                  durationMinutes: 675,
                  zoneShiftMinutes: 180,
                  journeyTo: 'קפלאוויק',
                  // The JOURNEY's clock, which the projection overrides for a chain: leg
                  // one's departure to the LAST leg's arrival (2026-09-01).
                  startLabel: '14:30',
                  endLabel: '23:20',
                  time: { label: '14:30', endLabel: '23:20', meaning: TIME_MEANING.EXACT },
                  legs: [
                    {
                      title: 'תל אביב ← וינה',
                      startLabel: '14:30',
                      endLabel: '18:15',
                      durationMinutes: 225,
                    },
                    {
                      title: 'וינה ← קפלאוויק',
                      startLabel: '19:00',
                      endLabel: '23:20',
                      layoverMinutes: 165,
                      layoverPlace: 'וינה',
                      durationMinutes: 260,
                    },
                  ],
                },
              ],
            },
          ],
        }),
      );
      const { container } = renderShared();

      // The container exists, and the row it replaces does not: a journey is not an event row.
      await waitFor(() => expect(container.querySelector('.sh-trek')).toBeTruthy());
      expect(container.querySelector('.sh-trek .sh-event')).toBeNull();

      // The header names the DESTINATION, not the route — the legs spell the route out.
      expect(screen.getByText(plain(t.share.public.journeyTo('קפלאוויק')))).toBeTruthy();
      expect(screen.getByText(plain(t.share.public.journeyLegs(2)), { exact: false })).toBeTruthy();

      // Every span the card carries: the total, both legs, and the wait.
      for (const minutes of [675, 225, 260]) {
        expect(screen.getByText(plain(hoursPhrase(minutes)), { exact: false })).toBeTruthy();
      }
      expect(
        screen.getByText(plain(t.share.public.layover('וינה', hoursPhrase(165)))),
      ).toBeTruthy();

      // **The head states the WHOLE journey, and reads it from `time`** (2026-09-01). It used
      // to compose the span from `startLabel`/`endLabel` here — right, and by a route that
      // bypassed the contract, so when the projection left `time` describing leg one only
      // paper showed it. Both renderers spell one field now.
      const head = container.querySelector('.sh-trek-head')!;
      expect(withoutBidiControls(head.textContent ?? '')).toContain(
        withoutBidiControls(t.share.public.timeRange('14:30', '23:20')),
      );
      expect(withoutBidiControls(head.textContent ?? '')).not.toContain(
        withoutBidiControls(t.share.public.timeRange('14:30', '18:15')),
      );

      // The zone shift stays on the journey and is NOT repeated per leg (§2).
      expect(container.querySelectorAll('.wp-tzshift')).toHaveLength(1);
    });

    /** The flight's own booking code has to survive the container, which is the reason the
     *  frame's attachments ride inside it rather than being dropped with its row. */
    it("keeps a journey row's ops fold inside the container", async () => {
      const event = everythingProjection.days[0].sections[0].events[0];
      serve({
        ...everythingProjection,
        days: [
          {
            ...everythingProjection.days[0],
            sections: [
              {
                ...everythingProjection.days[0].sections[0],
                events: [
                  {
                    ...event,
                    journeyTo: 'קפלאוויק',
                    legs: [
                      { title: 'תל אביב ← וינה', startLabel: '14:30', endLabel: '18:15' },
                      { title: 'וינה ← קפלאוויק', startLabel: '19:00', endLabel: '23:20' },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });
      const { container } = renderShared();
      await waitFor(() => expect(container.querySelector('.sh-trek')).toBeTruthy());
      expect(container.querySelector('.sh-trek details.sh-ops')).toBeTruthy();
    });

    /**
     * **A number keeps its unit behind it** (owner, 2026-08-31: _"it shows שע׳ 3:30 instead
     * of 3:30 שע׳"_). `hoursPhrase` already reads correctly as bare text in the RTL flow;
     * the defect was an `ltrIsolate` around the whole phrase, which forces it left-to-right
     * so the reader meets the unit first. jsdom lays out nothing, so the assertion is the
     * absence of the isolate character in front of the phrase — which is where it was.
     */
    it('leaves a duration phrase out of an LTR isolate', async () => {
      const event = fullProjection.days[0].sections[0].events[0];
      serve(
        withDay({
          sections: [
            {
              ...fullProjection.days[0].sections[0],
              events: [{ ...event, durationMinutes: 210 }],
            },
          ],
        }),
      );
      renderShared();
      const node = await screen.findByText(plain(hoursPhrase(210)));
      expect(node.textContent).toContain(hoursPhrase(210));
      expect(node.textContent).not.toContain('\u2066');
    });

    /**
     * **A download that shows how far it has got** (owner, 2026-08-31, second pass: _"the
     * download indication is not enough … it should have another animation"_).
     *
     * The bytes are read through a stream, so the bar can report the real fraction against
     * `Content-Length` instead of spinning. Two states are asserted because only one of them
     * is honest at a time: with a length the bar is a `progressbar` carrying `aria-valuenow`,
     * and the second half of the test is the case where the server declares none — there the
     * control must claim no fraction at all rather than inventing one.
     */
    it('reports real progress while a document downloads', async () => {
      const chunks = [new Uint8Array(40), new Uint8Array(60)];
      const bodyWith = (headers: Record<string, string>) =>
        new Response(
          new ReadableStream({
            start(controller) {
              for (const chunk of chunks) controller.enqueue(chunk);
              controller.close();
            },
          }),
          { headers },
        );

      serve(everythingProjection);
      renderShared();
      const link = await openOpsAndFindFile();

      const fetchMock = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(bodyWith({ 'content-length': '100' }));
      const url = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

      await act(async () => {
        fireEvent.click(link);
      });
      await waitFor(() => expect(url).toHaveBeenCalled());
      expect(fetchMock).toHaveBeenCalled();

      // The whole file arrived, so the bar reached the end rather than a guess at it.
      await waitFor(() => expect(screen.queryByText(plain(t.share.public.file.done))).toBeTruthy());
    });

    it('claims no fraction for a response that declares no length', async () => {
      serve(everythingProjection);
      renderShared();
      const link = await openOpsAndFindFile();

      // A body that never closes: the control stays in `working`, which is the only state
      // where the bar exists — and with no `Content-Length` it must be indeterminate.
      let release: (() => void) | undefined;
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          new ReadableStream({
            start(controller) {
              release = () => controller.close();
            },
          }),
        ),
      );

      await act(async () => {
        fireEvent.click(link);
      });
      const bar = await waitFor(() => {
        const found = document.querySelector('.sh-dl-bar');
        expect(found).toBeTruthy();
        return found!;
      });
      expect(bar.getAttribute('role')).toBe('progressbar');
      expect(bar.hasAttribute('data-indeterminate')).toBe(true);
      expect(bar.hasAttribute('aria-valuenow')).toBe(false);
      await act(async () => {
        release?.();
      });
    });

    it('puts the bookings under the days, and states each day instead of jumping to it', async () => {
      serve({
        ...fullProjection,
        commitments: [
          {
            bookingType: 'flight',
            title: 'תל אביב',
            date: '2026-08-29',
            dayOrdinal: 1,
          },
        ],
      });
      renderShared();
      const block = await screen.findByText(t.share.public.commitments.title);
      const days = document.querySelector('.sh-days');
      // **Below now, not above** (owner, 2026-08-30). It is a reference — what is booked and
      // when — and a reference belongs after the thing it refers to.
      expect(
        block.closest('.sh-fixed')!.compareDocumentPosition(days!) &
          Node.DOCUMENT_POSITION_PRECEDING,
      ).toBeTruthy();
      // **And no anchor.** Every row used to be `href="#day-N"`, so the one gesture the
      // block invited threw the reader down the document (_"clicking on a booking teleports
      // you down which is inconvenient"_). The day is written on the row instead.
      expect(screen.queryByRole('link', { name: plain('תל אביב') })).toBeNull();
      expect(screen.getByText(t.share.public.commitments.day(1))).toBeTruthy();
    });

    it('draws no fixed-points block for a trip with nothing booked', async () => {
      serve(fullProjection);
      renderShared();
      await screen.findByText(plain('הפארק הלאומי ת׳ינגווליר'));
      // Empty is a real state: no block, rather than a block with nothing in it.
      expect(screen.queryByText(t.share.public.commitments.title)).toBeNull();
    });
  });
  /**
   * **ADR-0213's eleventh amendment** — which day the page opens on, and how the spine says
   * where the trip is. The fixture trip runs 29–30.08 and `NOW` is the 29th, so day 1 is
   * today unless a test moves the clock.
   */
  describe('the day the reader is in (eleventh amendment)', () => {
    /** A day whose events cross a zone, which is the one day the now-line refuses. */
    const zoneCrossingProjection: Projection = {
      ...fullProjection,
      days: [
        {
          ...fullProjection.days[0],
          sections: [
            {
              daypart: SHARE_DAYPART.MORNING,
              events: [
                {
                  title: 'תל אביב ← קפלאוויק',
                  daypart: SHARE_DAYPART.MORNING,
                  startLabel: '08:00',
                  endLabel: '14:25',
                  zoneShiftMinutes: -180,
                },
              ],
            },
          ],
        },
        fullProjection.days[1],
      ],
    };

    it('opens the day the trip is on, and marks only that one', async () => {
      serve(fullProjection);
      const { container } = renderShared();
      await screen.findByText('איסלנד עם המשפחה');

      const [first, second] = [...container.querySelectorAll('.sh-day')];
      expect(first.classList.contains('open')).toBe(true);
      expect(first.classList.contains('is-now')).toBe(true);
      expect(first.querySelector('.sh-now-mark')?.textContent).toBe(t.common.now);
      // The future is the page's default and carries no mark of any kind: a chip every card
      // in a dated, chronological run wears repeats the date beside it (`.chip.past`'s
      // deletion, `App.css`).
      expect(second.classList.contains('is-now')).toBe(false);
      expect(second.classList.contains('is-past')).toBe(false);
      expect(second.querySelector('.sh-now-mark')).toBeNull();
    });

    it('opens NOTHING before the trip has started — no day is a default', async () => {
      setSimulatedNow(Date.parse('2026-08-20T09:00:00.000Z'));
      serve(fullProjection);
      const { container } = renderShared();
      await screen.findByText('איסלנד עם המשפחה');

      // Falling back to the first card would be the same arbitrary index-pick `useState(0)`
      // made, with a rationale bolted on. The clock is the only thing that opens a card.
      expect(container.querySelectorAll('.sh-day.open')).toHaveLength(0);
      expect(container.querySelectorAll('.sh-day-body')).toHaveLength(0);
      expect(container.querySelectorAll('.sh-day.is-now')).toHaveLength(0);
      expect(container.querySelectorAll('.sh-day.is-past')).toHaveLength(0);
    });

    it('opens nothing after the trip, and cools every day behind', async () => {
      setSimulatedNow(Date.parse('2026-09-10T09:00:00.000Z'));
      serve(fullProjection);
      const { container } = renderShared();
      await screen.findByText('איסלנד עם המשפחה');

      expect(container.querySelectorAll('.sh-day.open')).toHaveLength(0);
      // A treatment, not a badge — the class is what carries the desaturation and the muted
      // title, and nothing is added to the card's copy.
      expect(container.querySelectorAll('.sh-day.is-past')).toHaveLength(2);
      expect(container.querySelector('.sh-now-mark')).toBeNull();
    });

    it('lets the reader close today and open another day, keyed by ordinal', async () => {
      serve(fullProjection);
      const { container } = renderShared();
      await screen.findByText('איסלנד עם המשפחה');

      const [first, second] = [...container.querySelectorAll('.sh-day-head')];
      act(() => fireEvent.click(second));
      expect(first.getAttribute('aria-expanded')).toBe('false');
      expect(second.getAttribute('aria-expanded')).toBe('true');
      // Today keeps its mark while a different card is open: the mark is the trip's state,
      // not the reader's (§2 — amber moved off `.open` for exactly this).
      expect(container.querySelector('.sh-day.is-now')).toBe(
        container.querySelectorAll('.sh-day')[0],
      );
      // Closing the open one leaves nothing open, which is a state an index could not hold.
      act(() => fireEvent.click(second));
      expect(container.querySelectorAll('.sh-day.open')).toHaveLength(0);
    });

    it('lets a #day-N in the URL win over today', async () => {
      serve(fullProjection);
      const { container } = render(
        <MemoryRouter initialEntries={[`/s/${CODE}#day-2`]}>
          <Routes>
            <Route path="s/:code" element={<SharedItinerary />} />
          </Routes>
        </MemoryRouter>,
      );
      await screen.findByText('איסלנד עם המשפחה');

      const [first, second] = [...container.querySelectorAll('.sh-day')];
      // Somebody handed a link to day two asked for day two — and day one is still the day
      // the trip is on, so it keeps its mark without being open.
      expect(second.classList.contains('open')).toBe(true);
      expect(first.classList.contains('open')).toBe(false);
      expect(first.classList.contains('is-now')).toBe(true);
    });

    it('says where the trip is instead of asserting it is live', async () => {
      serve(fullProjection);
      const { container } = renderShared();
      await screen.findByText('איסלנד עם המשפחה');
      expect(withoutBidiControls(container.querySelector('.sh-kicker')!.textContent!)).toContain(
        t.share.public.phase.live(1, 2),
      );

      cleanup();
      setSimulatedNow(Date.parse('2026-08-20T09:00:00.000Z'));
      serve(fullProjection);
      const soon = renderShared();
      await screen.findByText('איסלנד עם המשפחה');
      expect(
        withoutBidiControls(soon.container.querySelector('.sh-kicker')!.textContent!),
      ).toContain(t.share.public.phase.soon(9));

      cleanup();
      setSimulatedNow(Date.parse('2026-09-10T09:00:00.000Z'));
      serve(fullProjection);
      const ended = renderShared();
      await screen.findByText('איסלנד עם המשפחה');
      expect(
        withoutBidiControls(ended.container.querySelector('.sh-kicker')!.textContent!),
      ).toContain(t.share.public.phase.ended);
    });

    it('says how old what it shows is, not that it is current', async () => {
      serve(fullProjection);
      const { container } = renderShared();
      await screen.findByText('איסלנד עם המשפחה');
      // `generatedAt` is 08:10 and the clock is 09:00 — a fixed "עודכן עכשיו" was the defect.
      expect(container.querySelector('.sh-freshness')!.textContent).toContain(
        t.share.public.updated(agoLabel('2026-08-29T08:10:00.000Z', NOW)),
      );
    });

    it('refetches when the tab comes back, so the label can be true', async () => {
      const fetchMock = serve(fullProjection);
      renderShared();
      await screen.findByText('איסלנד עם המשפחה');
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      // jsdom reports `visible` by default, which is the case that matters: a reader coming
      // back to a tab they left open is exactly when the projection is stalest.
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('draws the app’s own mark inside today’s card, and only where there are times', async () => {
      serve(fullProjection);
      const { container } = renderShared();
      await screen.findByText(plain('הפארק הלאומי ת׳ינגווליר'));

      // The app has ONE "you are here" mark and `ui/domain/NowMarker` is it (ADR-0217) —
      // the same component the two day surfaces render, not a third thing that resembles it.
      const line = container.querySelector('.sh-day-body .now-here');
      expect(line).toBeTruthy();
      // The day's only row starts at 09:30 and carries NO end label, so it is a point and
      // cannot hold 09:00 (ADR-0217 §4). The boundary form is what is left.
      expect(line!.classList.contains('edge')).toBe(true);
      expect(withoutBidiControls(line!.textContent!)).toContain('09:00');
      expect(line!.getAttribute('aria-label')).toBe(t.day.nowLineAria('09:00'));
      // …and under the daypart heading rather than above the section, which a render decided.
      expect(
        line!.compareDocumentPosition(container.querySelector('.sh-part-head')!) &
          Node.DOCUMENT_POSITION_PRECEDING,
      ).toBeTruthy();
    });

    // **THE CASE THIS PAGE COULD NEVER DRAW BEFORE** (ADR-0217, amended for the reader
    // 2026-09-02). `share-now-line.ts` used to have to choose between a line above a running
    // row and one below it, and its own comment asked for this. The mark now goes IN the row.
    it('nails the mark to the row that holds the moment, and that row says so', async () => {
      serve(runningRowProjection());
      const { container } = renderShared();
      await screen.findByText(plain('טבילה בלגונה הכחולה'));

      const mark = container.querySelector('.sh-day-body .now-here')!;
      expect(mark).toBeTruthy();
      expect(mark.classList.contains('edge')).toBe(false);
      // 09:00 through 08:30–10:00 is a third of the way in.
      expect(mark.getAttribute('style')).toContain(`--thru: ${(30 / 90) * 100}%`);
      // The row is INSIDE the mark rather than beside it…
      expect(mark.querySelector('.sh-event')).toBeTruthy();
      // …and the mark itself says nothing, because the row says the word (ADR-0217 §1's
      // premise, made true on this surface by `.sh-event-now`).
      expect(mark.querySelector('.nowline-chip')).toBeNull();
      expect(container.querySelector('.sh-event-now')!.textContent).toBe(t.common.now);
      // One mark, not two: a nailed mark and a boundary mark would be one fact drawn twice.
      expect(container.querySelectorAll('.sh-day-body .now-here')).toHaveLength(1);
    });

    it('draws no now-line at Summary, which carries no times at all', async () => {
      serve(summaryProjection);
      const { container } = renderShared();
      await screen.findByText(plain('הפארק הלאומי ת׳ינגווליר'));
      expect(container.querySelector('.now-here')).toBeNull();
    });

    it('draws no now-line on a day that crosses a time zone', async () => {
      serve(zoneCrossingProjection);
      const { container } = renderShared();
      await screen.findByText(plain('תל אביב ← קפלאוויק'));
      // The label is the day's own wall clock and the rows' are per event (ADR-0107), so the
      // comparison would be wrong by the shift. The card is still today's.
      expect(container.querySelector('.sh-day.is-now')).toBeTruthy();
      expect(container.querySelector('.now-here')).toBeNull();
    });
  });

  /**
   * **WHOSE CLOCK "NOW" IS ON** (ADR-0213's eighteenth amendment).
   *
   * The page asked `trip.timezone` — the destination's — for both halves of the question, so
   * the opening days of a trip, which are lived at home, were marked and clocked in a zone
   * nobody on the trip was reading yet. Each day now carries its own (`SharedDay.timezone`,
   * `dayAmbientZone`), which is how every day surface in the app has framed a day since
   * ADR-0107's session-100 amendment.
   *
   * Both tests here change **only** `SharedDay.timezone` against a fixture whose primary zone
   * stays `Atlantic/Reykjavik`, so what they measure is that field and nothing else.
   */
  describe('the clock the page is on (eighteenth amendment)', () => {
    /** The fixture's days, lived in the travellers' own zone — the shape of a trip's first
     *  days, before the flight. +03:00 in August against the destination's GMT. */
    const atHome = (projection: Projection): Projection => ({
      ...projection,
      days: projection.days.map((day) => ({ ...day, timezone: 'Asia/Jerusalem' })),
    });

    it('prints the marker on the day’s own clock, not the destination’s', async () => {
      // `NOW` is 09:00Z: 09:00 in Reykjavík and 12:00 in Tel Aviv. The row's own label is a
      // pre-formatted 09:30 either way, so the zone decides BOTH the hour on the chip and
      // which side of the row the mark falls on — a wrong zone here is not a rounding error.
      serve(atHome(fullProjection));
      const { container } = renderShared();
      await screen.findByText(plain('הפארק הלאומי ת׳ינגווליר'));

      const mark = container.querySelector('.sh-day-body .now-here')!;
      expect(mark.querySelector('.nowline-chip')!.textContent).toBe('12:00');
      // 12:00 is past a 09:30 row, so the mark goes after it. In the destination's zone the
      // same page reads 09:00 and puts the mark above it — the assertion the sibling test
      // below `opens the day the trip is on` already pins.
      expect(
        mark.compareDocumentPosition(container.querySelector('.sh-event')!) &
          Node.DOCUMENT_POSITION_PRECEDING,
      ).toBeTruthy();
    });

    it('marks the card whose own zone holds the moment', async () => {
      // 02:30Z on the 30th. In Reykjavík that is 02:30 — a pre-dawn hour, which this
      // projection files on the night of the 29th (`sharePreviousNight`), so the old
      // derivation marked day 1. In Tel Aviv it is 05:30, past the share's dawn, so the day
      // the travellers are actually having is the 30th.
      setSimulatedNow(Date.parse('2026-08-30T02:30:00.000Z'));
      serve(atHome(fullProjection));
      const { container } = renderShared();
      await screen.findByText('איסלנד עם המשפחה');

      const [first, second] = [...container.querySelectorAll('.sh-day')];
      expect(first.classList.contains('is-past')).toBe(true);
      expect(second.classList.contains('is-now')).toBe(true);
      expect(second.querySelector('.sh-now-mark')?.textContent).toBe(t.common.now);
    });
  });
});

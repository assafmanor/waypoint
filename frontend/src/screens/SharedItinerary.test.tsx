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
  type SharedItinerary as Projection,
} from '@waypoint/shared';
import { SharedItinerary } from './SharedItinerary';
import { t } from '../i18n/he';
import { withoutBidiControls } from '../lib/bidi';

/** `ltrIsolate` wraps every Latin/numeric run in invisible bidi controls (ADR-0118), so a
 *  plain string match would never hit. */
const plain = (needle: string) => (text: string) => withoutBidiControls(text).includes(needle);

const CODE = '7Kq2mB9x';

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
              placeName: 'Fludir',
            },
          ],
        },
      ],
    },
    summaryProjection.days[1],
  ],
};

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
    notesAndTasks: [{ title: 'נעלי הליכה', lines: [] }],
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
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
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

  it('treats a projection this build cannot parse as unavailable', async () => {
    serve({ status: 'live', detailLevel: 'quantum' });
    renderShared();

    expect(await screen.findByText(t.share.public.unavailableTitle)).toBeTruthy();
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
                  legs: [
                    { title: 'תל אביב', startLabel: '14:30', endLabel: '18:15' },
                    { title: 'וינה', startLabel: '19:00', endLabel: '23:20', layoverMinutes: 45 },
                  ],
                },
              ],
            },
          ],
        }),
      );
      renderShared();
      // The first leg has nothing before it, so it carries no wait — only the second does.
      expect(await screen.findByText(plain(t.share.public.layover('וינה', 45)))).toBeTruthy();
      expect(screen.queryByText(plain(t.share.public.layover('תל אביב', 45)))).toBeNull();
    });

    it('puts the fixed points above the days, each linking to its own', async () => {
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
      // Above, not among — the day spine stays the spine.
      expect(
        block.closest('.sh-fixed')!.compareDocumentPosition(days!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(screen.getByRole('link', { name: plain('תל אביב') }).getAttribute('href')).toBe(
        '#day-1',
      );
    });

    it('draws no fixed-points block for a trip with nothing booked', async () => {
      serve(fullProjection);
      renderShared();
      await screen.findByText(plain('הפארק הלאומי ת׳ינגווליר'));
      // Empty is a real state: no block, rather than a block with nothing in it.
      expect(screen.queryByText(t.share.public.commitments.title)).toBeNull();
    });
  });
});

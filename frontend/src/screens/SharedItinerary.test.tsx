// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
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
          events: [
            { title: 'הפארק הלאומי ת׳ינגווליר', icon: '🌋', daypart: SHARE_DAYPART.MORNING },
          ],
        },
      ],
    },
    { ordinal: 2, date: '2026-08-30', title: '', summary: '', sections: [] },
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
  appendix: {
    bookingSecrets: [{ title: 'טיסה', lines: ['Icelandair', 'KEF-4821'] }],
    documents: [{ handle: 'doc-1', title: 'הזמנת הדירה.pdf', mimeType: 'application/pdf' }],
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

    expect(await screen.findByText('הפארק הלאומי ת׳ינגווליר')).toBeTruthy();
    expect(screen.queryByText(plain('09:30'))).toBeNull();
    expect(screen.queryByText('806 Selfoss')).toBeNull();
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
    expect(screen.getByText('806 Selfoss')).toBeTruthy();
    expect(screen.getByText(t.share.public.journey(35, 28))).toBeTruthy();
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

    expect(await screen.findByText(t.share.public.appendix.title)).toBeTruthy();
    expect(screen.getByText(/KEF-4821/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'הזמנת הדירה.pdf' }).getAttribute('href')).toContain(
      `/shared-itineraries/${CODE}/documents/doc-1`,
    );
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
});

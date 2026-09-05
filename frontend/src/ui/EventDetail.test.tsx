// @vitest-environment jsdom
//
// `EventDetail` is `BookingDetail`'s peer over the shared `DetailSheet` (ADR-0174 §4), so
// what is worth asserting here is the part that is NOT the shell: the facts it states, the
// hard-commitment guard, and the one behaviour the archive depends on — that a read-only
// trip gets the read with no way to write from it (ADR-0040).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Booking, Place, TripEvent } from '@waypoint/shared';
import { wrapNav } from '../test/nav-harness';
import { setSimulatedNow } from '../lib/useClock';

let tripPlaces: Place[] = [];
let tripEnrichments: Record<string, unknown> = {};

vi.mock('../state/trip-state', () => ({
  useTrip: () => ({
    zoneCrossings: [],
    // Tasks ride the same snapshot since phase 1; the mark and the sections read them.
    tasks: [],
    taskVerbs: {
      createTask: async () => undefined,
      updateTask: async () => {},
      deleteTask: async () => {},
      tickTask: async () => {},
    },
    hostContexts: buildHostContextIndex([], []),
    // Note hosts resolve through trip-state's one index; this file asserts nothing
    // about an inherited name or category, so the index-miss fallback carries it.
    noteHosts: new Map(),
    trip: { id: 't1', timezone: 'Asia/Tokyo' },
    events: [],
    bookings: [] as Booking[],
    places: tripPlaces,
    notes: [],
    documents: [],
    documentAttachments: [],
    users: [],
    noteVerbs: { createNote: vi.fn(), updateNote: vi.fn() },
    enrichments: tripEnrichments,
  }),
}));
// The chip carries the app's ONE per-entity sync grammar (ADR-0092), so the outbox mock
// owes what `EntitySyncBadge`/`useUnsynced` read as well as the queued-upload list.
vi.mock('../lib/outbox', () => ({
  usePendingUploads: () => [],
  useSyncStatus: () => ({ state: 'synced' }),
  SYNC_STATE: { SYNCED: 'synced', PENDING: 'pending', FAILED: 'failed' },
}));

import { EventDetail } from './EventDetail';
import { buildHostContextIndex } from '../lib/host-context';
import { withoutBidiControls } from '../lib/bidi';
import { t } from '../i18n/he';

const event = (over: Partial<TripEvent> = {}): TripEvent =>
  ({
    id: 'e1',
    tripId: 't1',
    date: '2026-04-14',
    title: 'ארוחת ערב · איצ׳יראן',
    icon: '🍜',
    kind: 'soft',
    status: 'planned',
    startsAt: '2026-04-14T10:00:00Z',
    endsAt: '2026-04-14T11:30:00Z',
    sortOrder: 0,
    ...over,
  }) as TripEvent;

const show = (e: TripEvent, onEdit?: () => void) =>
  render(wrapNav(<EventDetail event={e} onClose={vi.fn()} onEdit={onEdit} />));

describe('EventDetail', () => {
  beforeEach(() => {
    setSimulatedNow(new Date('2026-04-14T08:00:00Z').getTime());
    tripPlaces = [];
    tripEnrichments = {};
  });
  afterEach(() => {
    cleanup();
    setSimulatedNow(null);
  });

  it('states the event and its kind', () => {
    show(event());
    expect(screen.getByText('ארוחת ערב · איצ׳יראן')).toBeTruthy();
    expect(screen.getByText(t.event.soft)).toBeTruthy();
  });

  // The owner's report (2026-08-21): this sheet read `19:30–18:30` for an event the day card
  // read correctly. The two clocks were concatenated either side of a dash, which makes them
  // two numeric islands an RTL flow lays out second-first — so the window is one LTR island
  // now, through `formatDayTime`'s own end (`lib/time.ts`, `clockRange`).
  it('states its window in start–end order', () => {
    show(event());
    const when = screen.getByText((text) => withoutBidiControls(text).includes('–'));
    const plain = withoutBidiControls(when.textContent ?? '');
    expect(plain).toContain('19:00–20:30');
    expect(plain).not.toContain('20:30–19:00');
  });

  it('shows the hard-commitment guard on a hard event, and not on a soft one', () => {
    // ADR-0011, and it is what ADR-0053 made a read surface FOR: the read stands between
    // you and the edit of a real commitment.
    show(event({ kind: 'hard' }));
    expect(screen.getByText(t.index.detail.hardNote)).toBeTruthy();
    cleanup();
    show(event());
    expect(screen.queryByText(t.index.detail.hardNote)).toBeNull();
  });

  it('states the location even when the event has none', () => {
    // A row gated on having something to show meant no surface anywhere said a thing was
    // placeless, which cost a false bug report on the booking side. Same rule here.
    show(event());
    expect(screen.getByText(t.index.detail.location)).toBeTruthy();
    expect(screen.getByText(t.index.detail.noLocation)).toBeTruthy();
  });

  it('states a placed event’s address and offers the map hand-off', () => {
    tripPlaces = [
      {
        id: 'p1',
        tripId: 't1',
        name: 'Ichiran Shibuya',
        address: 'Jinnan, Shibuya City',
        lat: 35.6,
        lng: 139.7,
      } as Place,
    ];
    show(event({ placeId: 'p1' }));
    expect(screen.getByText('Jinnan, Shibuya City')).toBeTruthy();
    expect(screen.getByText(t.actions.navigate)).toBeTruthy();
  });

  it('reaches the editor through its own control', () => {
    const onEdit = vi.fn();
    show(event(), onEdit);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.index.detail.edit) }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  // **THE ARCHIVE'S WHOLE POINT** (ADR-0040): a finished trip is browsable, so the read
  // opens — and nothing on it may write, so the one control that could is absent rather
  // than disabled (ADR-0150 §8: a disabled primary is not a stand-in for "you may not").
  it('carries NO way to edit when the trip is a read-only archive', () => {
    show(event());
    expect(screen.queryByRole('button', { name: new RegExp(t.index.detail.edit) })).toBeNull();
  });
});

/**
 * **THE READ GETS THE PLACE'S KNOWLEDGE** (ADR-0219 §6) — the picture, three clamped lines and
 * `עוד בגוגל`, one tap from the day's row. It is `PlaceKnowledge` at `DECIDING`, which is the
 * density with no way to expand, because this sheet has nothing to expand into.
 *
 * The component's own rules are tested where it lives; what is only observable here is that this
 * screen connects it to the right place and owns the viewer it opens.
 */
describe('EventDetail · what the world knows about the place', () => {
  const PLACE: Place = {
    id: 'p1',
    tripId: 't1',
    name: 'Háifoss',
    address: 'Fossárdalur',
    lat: 64.2,
    lng: -19.6,
  } as Place;

  const IMAGE = {
    url: '/enrichment/images/haifoss',
    mimeType: 'image/jpeg',
    width: 1200,
    height: 800,
    sizeBytes: 90_000,
    source: 'commons',
    license: 'CC BY-SA 4.0',
    attribution: 'A. Photographer',
    fetchedAt: '2026-08-01T00:00:00.000Z',
    method: 'name_proximity',
    ref: 'Q38519',
    confidence: 1,
  };

  const SUMMARY = {
    en: {
      value: 'A waterfall in the south of Iceland.',
      lang: 'en',
      source: 'wikipedia',
      license: 'CC BY-SA 4.0',
      fetchedAt: '2026-08-01T00:00:00.000Z',
      confidence: 1,
      method: 'settled_id',
      ref: 'Q1585881',
    },
  };

  beforeEach(() => {
    setSimulatedNow(new Date('2026-04-14T08:00:00Z').getTime());
    tripPlaces = [PLACE];
    tripEnrichments = {};
  });
  afterEach(() => {
    cleanup();
    setSimulatedNow(null);
  });

  /** The sheet renders through `Modal`, which portals — so RTL's `container` is not where it
   *  lands. Every query below goes through the document, as the specs above do via `screen`. */
  it('shows the picture and its credit', () => {
    tripEnrichments = { p1: { image: IMAGE } };
    show(event({ placeId: 'p1' }));
    expect(document.querySelector('.map-hero img')).toBeTruthy();
    expect(document.querySelector('.map-credit')?.textContent).toContain('A. Photographer');
  });

  it('clamps the summary to the deciding density’s three lines', () => {
    tripEnrichments = { p1: { image: IMAGE, summary: SUMMARY } };
    show(event({ placeId: 'p1' }));
    // The clamp is CSS, so what is asserted is the class that carries it — jsdom computes no
    // `-webkit-line-clamp`, and `place-knowledge.contract.test.ts` holds the rule itself.
    expect(document.querySelector('.map-sum.is-decide')).toBeTruthy();
    expect(document.querySelector('.map-sum-t')?.textContent).toContain('waterfall');
    // …and the English extract is marked as English, which is the majority case in a Hebrew app.
    expect(document.querySelector('.map-sum-lang')?.textContent).toBe(t.map.know.langMarker.en);
  });

  // **The majority case** (ADR-0166 §11.3: 0 of 7 Tokyo restaurants had an image). Nothing
  // known renders nothing at all — not an empty block, not a placeholder.
  it('renders no knowledge block at all when nothing is known', () => {
    show(event({ placeId: 'p1' }));
    expect(document.querySelector('.map-hero')).toBeNull();
    expect(document.querySelector('.map-sum')).toBeNull();
    expect(document.querySelector('.map-credit')).toBeNull();
  });

  // An image with no summary still counts: the picture is exactly what there is to show.
  //
  // **And `עוד בגוגל` is NOT here**, which the build found rather than assumed: that control is
  // `Map.tsx`'s own `.map-refs` row, beside the schedule and delete verbs, and it has never been
  // part of this component. ADR-0219 §6's acceptance describes the deciding card as it reads on
  // the Map, where the exit is a sibling of the block rather than inside it. Asserted as an
  // absence so the next reader of that sentence finds the answer here.
  it('shows a picture with no words about it, and no exit of the Map’s own', () => {
    tripEnrichments = { p1: { image: IMAGE } };
    show(event({ placeId: 'p1' }));
    expect(document.querySelector('.map-hero img')).toBeTruthy();
    expect(document.querySelector('.map-sum')).toBeNull();
    expect(screen.queryByRole('link', { name: t.map.know.moreOnGoogle })).toBeNull();
  });

  it('opens the full picture from the hero, into the app’s own viewer', () => {
    tripEnrichments = { p1: { image: IMAGE } };
    show(event({ placeId: 'p1' }));
    fireEvent.click(screen.getByRole('button', { name: t.map.know.fullPicture }));
    // The viewer is a `Modal`, so it arrives as a second dialog over the sheet — the same
    // layering `Map.tsx` uses for the same hero.
    const dialogs = screen.getAllByRole('dialog');
    expect(dialogs.length).toBeGreaterThan(1);
  });

  // **The coordinate gate is the MAP's, not the knowledge's** (ADR-0147's Place-lite). A place
  // with nothing to centre on is still a place we may know a great deal about.
  it('shows what is known about a place with no coordinates', () => {
    tripPlaces = [{ id: 'p1', tripId: 't1', name: 'Háifoss' } as Place];
    tripEnrichments = { p1: { image: IMAGE, summary: SUMMARY } };
    show(event({ placeId: 'p1' }));
    expect(document.querySelector('.map-hero img')).toBeTruthy();
    expect(document.querySelector('.map-sum-t')?.textContent).toContain('waterfall');
  });
});

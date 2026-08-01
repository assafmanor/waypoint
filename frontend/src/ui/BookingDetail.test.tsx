// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { wrapNav } from '../test/nav-harness';
import {
  BOOKING_SOURCE,
  BOOKING_TYPE,
  EVENT_KIND,
  EVENT_SOURCE,
  EVENT_STATUS,
  type Booking,
  type Place,
  type TripEvent,
} from '@waypoint/shared';
import { setSimulatedNow } from '../lib/useClock';

// Fixtures carry fixed dates, so the clock is pinned — otherwise the test reads the
// real system clock and means something different every day it runs.
const NOW = '2026-07-20T09:00:00Z';

const bk = (partial: Partial<Booking> & Pick<Booking, 'id' | 'type'>): Booking => ({
  tripId: 't1',
  title: 'Kyoto Machiya',
  source: BOOKING_SOURCE.MANUAL,
  createdAt: NOW,
  updatedAt: NOW,
  updatedBy: 'u1',
  ...partial,
});
const pl = (id: string, name: string, extra?: Partial<Place>): Place => ({
  id,
  tripId: 't1',
  name,
  createdAt: NOW,
  updatedAt: NOW,
  updatedBy: 'u1',
  ...extra,
});

const placed = pl('pl-1', 'Shinjuku Granbell', {
  lat: 35.69,
  lng: 139.7,
  address: '2-14-5 Kabukicho',
});
const lite = pl('pl-lite', 'Ichiran Ramen');

let tripPlaces: Place[] = [placed, lite];
let tripEvents: TripEvent[] = [];
const updateBooking = vi.fn(() => Promise.resolve());

const tripNotes: unknown[] = [];
vi.mock('../state/trip-state', () => ({
  // `bookings` + `maybeItems` are here for the picker sheet, not the detail: opening
  // it mounts `usePlaceSearch`, which derives `referencedPlaceIds` over all four
  // collections to answer "already in trip".
  useTrip: () => ({
    trip: { id: 't1', name: 'טיול', timezone: 'Asia/Tokyo', updatedBy: 'u1' },
    events: tripEvents,
    places: tripPlaces,
    bookings: [],
    maybeItems: [],
    indexVerbs: { updateBooking },
    notes: tripNotes,
    users: [{ id: 'u1', displayName: 'דנה' }],
    noteVerbs: {
      createNote: async () => {},
      updateNote: async () => {},
      deleteNote: async () => {},
    },
  }),
}));

// The hook is `null` outside the trip shell; each test states which world it is in,
// because "absent, not broken" is the contract on both sides.
let showPlaceOnMap: ((placeId: string) => void) | null = null;
let startErrand: ((errand: unknown) => void) | null = null;
vi.mock('../state/map-scope-state', () => ({
  useShowPlaceOnMap: () => showPlaceOnMap,
  // Every form host takes the errand's answer on return (ADR-0134 §2); nothing here
  // asserts it, so the hook just has to exist and report nothing pending.
  usePlaceErrandReturn: () => null,
  useStartPlaceErrand: () => startErrand,
}));

import { BookingDetail } from './BookingDetail';
import { t } from '../i18n/he';

// Rendered through the real back stack (`wrapNav`), not a stub — which is what makes
// the close-before-navigate ordering test below meaningful.
const open = (booking: Booking, onClose = () => {}) =>
  render(wrapNav(<BookingDetail booking={booking} onClose={onClose} onEdit={() => {}} />));

describe('BookingDetail — the location fact (ADR-0121 §8 amendment)', () => {
  beforeEach(() => {
    setSimulatedNow(Date.parse(NOW));
    tripPlaces = [placed, lite];
    tripEvents = [];
    showPlaceOnMap = null;
    startErrand = () => {};
    updateBooking.mockClear();
  });
  afterEach(() => {
    cleanup();
    setSimulatedNow(null);
  });

  it('shows ניווט and מפה for a coord-bearing place', () => {
    showPlaceOnMap = vi.fn();
    open(bk({ id: 'b1', type: BOOKING_TYPE.HOTEL, placeId: 'pl-1' }));
    expect(screen.getByText('2-14-5 Kabukicho')).toBeTruthy();
    expect(screen.getByRole('link', { name: t.actions.navigate })).toBeTruthy();
    expect(screen.getByRole('button', { name: t.actions.showOnMap })).toBeTruthy();
    // Nothing to fix, so no invitation to fix it.
    expect(screen.queryByText(t.placePicker.empty)).toBeNull();
  });

  // The bug this fixes: the fact was gated on having something to show, so a
  // placeless booking rendered NO location row and no surface anywhere said so.
  // It cost a false report — a two-night hotel "missing from the map" had no place.
  it('states the absence, and offers ＋ מיקום, when the booking has no place at all', () => {
    open(bk({ id: 'b2', type: BOOKING_TYPE.HOTEL }));
    expect(screen.getByText(t.index.detail.noLocation)).toBeTruthy();
    expect(screen.getByText(t.placePicker.empty)).toBeTruthy();
    // Nothing to navigate to and nothing to focus.
    expect(screen.queryByRole('link', { name: t.actions.navigate })).toBeNull();
    expect(screen.queryByRole('button', { name: t.actions.showOnMap })).toBeNull();
  });

  it('shows a coordless Place-lite by name, with ＋ מיקום and no מפה', () => {
    showPlaceOnMap = vi.fn();
    open(bk({ id: 'b3', type: BOOKING_TYPE.RESTAURANT, placeId: 'pl-lite' }));
    expect(screen.getByText('Ichiran Ramen')).toBeTruthy();
    expect(screen.getByText(t.placePicker.empty)).toBeTruthy();
    // Still no camera to move — the place is referenced but has no position.
    expect(screen.queryByRole('button', { name: t.actions.showOnMap })).toBeNull();
  });

  // The sheet is a Modal, so it must leave the back stack BEFORE the tab changes —
  // otherwise the Map arrives underneath a sheet still registered (ADR-0090).
  it('closes the sheet before it navigates to the map', () => {
    const order: string[] = [];
    showPlaceOnMap = () => order.push('navigate');
    open(bk({ id: 'b4', type: BOOKING_TYPE.HOTEL, placeId: 'pl-1' }), () => order.push('close'));
    fireEvent.click(screen.getByRole('button', { name: t.actions.showOnMap }));
    expect(order).toEqual(['close', 'navigate']);
  });

  // Outside the trip shell there is no Map tab to route to, so the affordance is
  // dropped — the row still renders everything else it knows.
  it('drops מפה outside the trip shell, without breaking the row', () => {
    showPlaceOnMap = null;
    open(bk({ id: 'b5', type: BOOKING_TYPE.HOTEL, placeId: 'pl-1' }));
    expect(screen.queryByRole('button', { name: t.actions.showOnMap })).toBeNull();
    expect(screen.getByText('2-14-5 Kabukicho')).toBeTruthy();
    expect(screen.getByRole('link', { name: t.actions.navigate })).toBeTruthy();
  });

  // Transport keeps the old gate: its places are the route endpoints, which
  // `routeRequired` already refuses to save without, so it cannot be placeless.
  it('does not nag a transport booking about a location', () => {
    open(bk({ id: 'b6', type: BOOKING_TYPE.FLIGHT }));
    expect(screen.queryByText(t.index.detail.noLocation)).toBeNull();
    expect(screen.queryByText(t.placePicker.empty)).toBeNull();
  });

  // ＋ מיקום IS AN ERRAND TO THE MAP NOW (ADR-0134 §1), not a picker sheet over this one:
  // a place is disambiguated BY PLACE, and the map's own search answers both corpora.
  //
  // IT CARRIES A DRAFT like every other errand (owner, session 173). It used to send none, on
  // the reasoning that a saved booking has no unsaved state — so the Map patched it directly
  // and the return had nothing to re-open. That saved the place behind the user's back AND
  // landed them on a preview; both are the same wrong assumption, and the draft is what makes
  // this path identical to the unsaved one.
  it('＋ מיקום sends an errand naming this booking, its field, and the form state', () => {
    const calls: { target: unknown; label: string; draft?: { title: string; type: string } }[] = [];
    startErrand = (errand) => calls.push(errand as (typeof calls)[number]);
    open(bk({ id: 'b7', type: BOOKING_TYPE.HOTEL, title: 'Shinjuku Granbell' }));
    fireEvent.click(screen.getByText(t.placePicker.empty));
    expect(calls).toHaveLength(1);
    expect(calls[0].target).toEqual({ kind: 'booking', id: 'b7', field: 'placeId' });
    expect(calls[0].label).toBe('Shinjuku Granbell');
    // The sheet's own opening state, derived by the one function both of them read
    // (`lib/booking-draft.ts`) rather than re-assembled here.
    expect(calls[0].draft).toMatchObject({
      title: 'Shinjuku Granbell',
      type: BOOKING_TYPE.HOTEL,
    });
    // …and no picker sheet opens over this one any more.
    expect(screen.queryByLabelText(t.placePicker.searchPlaceholder)).toBeNull();
  });

  // Outside the trip shell there is no Map tab to route to, so the affordance is simply
  // absent — the same "absent, not broken" rule `מפה` follows on this row.
  it('drops ＋ מיקום when there is no Map tab to send it to', () => {
    startErrand = null;
    open(bk({ id: 'b8', type: BOOKING_TYPE.HOTEL }));
    expect(screen.queryByText(t.placePicker.empty)).toBeNull();
  });
});

describe('BookingDetail — the linked-event facts still read (regression guard)', () => {
  beforeEach(() => {
    setSimulatedNow(Date.parse(NOW));
    tripPlaces = [placed, lite];
    showPlaceOnMap = null;
    tripEvents = [
      {
        id: 'e1',
        tripId: 't1',
        date: '2026-07-20',
        title: 'Shinjuku Granbell',
        kind: EVENT_KIND.HARD,
        startsAt: '2026-07-20T06:00:00Z',
        status: EVENT_STATUS.PLANNED,
        bookingId: 'b8',
        sortOrder: 0,
        source: EVENT_SOURCE.MANUAL,
        createdAt: NOW,
        updatedAt: NOW,
        updatedBy: 'u1',
      },
    ];
  });
  afterEach(() => {
    cleanup();
    setSimulatedNow(null);
  });

  it('renders the hard note and the timing beside the location fact', () => {
    open(bk({ id: 'b8', type: BOOKING_TYPE.HOTEL, placeId: 'pl-1' }));
    expect(screen.getByText(t.index.detail.hardNote, { exact: false })).toBeTruthy();
    expect(screen.getByText('2-14-5 Kabukicho')).toBeTruthy();
  });
});

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
// The whole trip's bookings, which is what the derived round-trip pair reads (§5).
let tripBookings: Booking[] = [];
// What the world knows about the trip's places (ADR-0166 §6) — empty for every test but the
// airport-codes one, which is also the normal state for most places.
let tripEnrichments: Record<string, unknown> = {};
const updateBooking = vi.fn(() => Promise.resolve());

const tripNotes: unknown[] = [];
vi.mock('../state/trip-state', () => ({
  // `bookings` + `maybeItems` are here for the picker sheet, not the detail: opening
  // it mounts `usePlaceSearch`, which derives `referencedPlaceIds` over all four
  // collections to answer "already in trip".
  useTrip: () => ({
    // The one context index every note surface resolves through (ADR-0172 §1);
    // built from this file's own fixtures so pairing is real rather than stubbed.
    hostContexts: buildHostContextIndex(tripEvents, tripBookings),
    trip: { id: 't1', name: 'טיול', timezone: 'Asia/Tokyo', updatedBy: 'u1' },
    events: tripEvents,
    places: tripPlaces,
    bookings: tripBookings,
    maybeItems: [],
    enrichments: tripEnrichments,
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

import { PlaceLabelsProvider } from '../state/place-labels';
import { BookingDetail } from './BookingDetail';
import { t } from '../i18n/he';
import { buildHostContextIndex } from '../lib/host-context';

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

// **A fact's value is stored content, so it sniffs its own direction** (ADR-0118). The
// reported read was `2-14-5 Kabukicho, Shinjuku, Tokyo` rendering as `Kabukicho, Shinjuku,
// Tokyo 2-14-5`: with no `dir` the value inherited the sheet's RTL, and the space between
// the numeral run and the letters is a neutral between two runs the bidi algorithm reads as
// opposite, so it took the paragraph's own level and cut the address in two.
//
// jsdom lays out no bidi, so what is asserted is the attribute — which is the whole fix, and
// the same standard ADR-0118's own tests set. The `.bk-loc` box deliberately keeps NO `dir`:
// the island is the value, never the value together with the Hebrew links beside it.
describe('BookingDetail — a fact never inherits the sheet direction (ADR-0118)', () => {
  beforeEach(() => {
    setSimulatedNow(Date.parse(NOW));
    tripPlaces = [placed, lite];
    tripEvents = [];
    showPlaceOnMap = null;
    startErrand = () => {};
  });
  afterEach(() => {
    cleanup();
    setSimulatedNow(null);
  });

  it('sniffs the direction of a stored address, without flipping the links beside it', () => {
    open(bk({ id: 'b9', type: BOOKING_TYPE.HOTEL, placeId: 'pl-1' }));
    expect(screen.getByText('2-14-5 Kabukicho').getAttribute('dir')).toBe('auto');
    expect(document.querySelector('.bk-fact-v.bk-loc')?.getAttribute('dir')).toBeNull();
  });

  // Including the muted "no location" line, which is Hebrew — `auto` resolves it RTL, which
  // is why the attribute can sit on the element unconditionally instead of on the text it
  // happens to hold today.
  it('sniffs the Hebrew absence line the same way', () => {
    open(bk({ id: 'b10', type: BOOKING_TYPE.HOTEL }));
    expect(screen.getByText(t.index.detail.noLocation).getAttribute('dir')).toBe('auto');
  });

  // The mono branch forced `dir="ltr"` through a ternary the lint guard read past, so a
  // Hebrew provider or room in that slot would have laid out backwards. Every value slot
  // now says the same thing, code and prose alike.
  it('forces no direction on any value, mono included', () => {
    open(
      bk({
        id: 'b11',
        type: BOOKING_TYPE.HOTEL,
        placeId: 'pl-1',
        confirmationCode: 'ABC123',
        provider: 'בוקינג',
        details: { room: '1204', wifi: { network: 'granbell', password: 'guest2026' } },
      }),
    );
    // `.bk-loc` is excluded by the same rule, from the other side: it holds the Hebrew
    // links as well as the value, so its island is the inner span asserted above.
    const values = [...document.querySelectorAll('.bk-fact-v:not(.bk-loc)')];
    expect(values.length).toBeGreaterThan(3);
    for (const v of values) expect(v.getAttribute('dir')).toBe('auto');
  });
});

// **The derived pair** (ADR-0154 §5). Nothing on either booking says they belong
// together — the relation is worked out from what they ARE, so these tests hand the
// detail a trip with two legs in it and assert what the sheet then says.
describe('BookingDetail — the round-trip fact', () => {
  const TLV = pl('pl-tlv', 'תל אביב', { lat: 32, lng: 34.8 });
  const NRT = pl('pl-nrt', 'טוקיו', { lat: 35.7, lng: 139.7 });
  const outbound = bk({
    id: 'b-out',
    type: BOOKING_TYPE.FLIGHT,
    title: 'תל אביב → טוקיו',
    fromPlaceId: 'pl-tlv',
    toPlaceId: 'pl-nrt',
  });
  const back = bk({
    id: 'b-back',
    type: BOOKING_TYPE.FLIGHT,
    title: 'טוקיו → תל אביב',
    fromPlaceId: 'pl-nrt',
    toPlaceId: 'pl-tlv',
  });
  const leg = (id: string, bookingId: string, startsAt: string): TripEvent => ({
    id,
    tripId: 't1',
    date: startsAt.slice(0, 10),
    title: 'טיסה',
    kind: EVENT_KIND.HARD,
    startsAt,
    status: EVENT_STATUS.PLANNED,
    bookingId,
    sortOrder: 0,
    source: EVENT_SOURCE.MANUAL,
    createdAt: NOW,
    updatedAt: NOW,
    updatedBy: 'u1',
  });

  beforeEach(() => {
    setSimulatedNow(Date.parse(NOW));
    tripPlaces = [TLV, NRT];
    tripBookings = [outbound, back];
    tripEvents = [
      leg('e-out', 'b-out', '2026-07-19T04:00:00Z'),
      leg('e-back', 'b-back', '2026-07-28T04:00:00Z'),
    ];
    showPlaceOnMap = null;
    startErrand = () => {};
  });
  afterEach(() => {
    cleanup();
    tripBookings = [];
    setSimulatedNow(null);
  });

  const facts = () =>
    [...document.querySelectorAll('.bk-fact .bk-fact-k')].map((e) => e.textContent);
  // The hosts that CAN swap their detail pass `onOpen`; the fact is a way through only
  // there. `open()` above deliberately omits it, which is the other half of the contract.
  const openWithWayThrough = (booking: Booking, onOpen = vi.fn()) => {
    render(
      wrapNav(
        <BookingDetail booking={booking} onClose={() => {}} onEdit={() => {}} onOpen={onOpen} />,
      ),
    );
    return onOpen;
  };
  const pairLink = () => document.querySelector('.bk-pairlink') as HTMLElement;

  it('names the return, LAST, when looking at the outbound', () => {
    openWithWayThrough(outbound);
    expect(screen.getByText(t.index.detail.pair)).toBeTruthy();
    // Last, because everything above it describes THIS booking and this one its neighbour.
    expect(facts()[facts().length - 1]).toBe(t.index.detail.pair);
    expect(pairLink().textContent).toContain(t.index.form.legBack);
  });

  it('names the outbound when looking at the return', () => {
    openWithWayThrough(back);
    expect(pairLink().textContent).toContain(t.index.form.legOut);
  });

  it('spends no teal on it — a sibling booking is not a location (rule 4)', () => {
    openWithWayThrough(outbound);
    // `.bk-loc-link` is the teal pill; the pair is deliberately not one of those.
    expect(pairLink().classList.contains('bk-loc-link')).toBe(false);
  });

  it('is a way through to the other leg', () => {
    const onOpen = openWithWayThrough(outbound);
    fireEvent.click(pairLink());
    expect(onOpen).toHaveBeenCalledWith(back);
  });

  // "Absent, not broken": a host with no detail state to swap still gets the fact.
  it('still states the pair where there is nowhere to go', () => {
    open(outbound);
    expect(document.querySelector('.bk-pairlink')).toBeNull();
    expect(screen.getByText(t.index.detail.pair)).toBeTruthy();
  });

  it('says so plainly when the other leg has no slot yet', () => {
    tripEvents = [leg('e-out', 'b-out', '2026-07-19T04:00:00Z')];
    open(outbound);
    expect(screen.getByText(t.index.detail.pairLeg('back', t.index.detail.pairUnscheduled)));
  });

  it('shows no such fact for a booking with no partner', () => {
    tripBookings = [outbound];
    open(outbound);
    expect(screen.queryByText(t.index.detail.pair)).toBeNull();
  });
});

// **The journey fact** (ADR-0159) — the other derived relation. Same posture as the
// pair: derived, stated last, a way through only where the host can swap its detail.
describe('BookingDetail — the journey fact', () => {
  const TLV = pl('pl-tlv', 'תל אביב', { lat: 32, lng: 34.8 });
  const DXB = pl('pl-dxb', 'דובאי', { lat: 25.2, lng: 55.4 });
  const NRT = pl('pl-nrt', 'טוקיו', { lat: 35.7, lng: 139.7 });
  const leg1 = bk({
    id: 'b-leg1',
    type: BOOKING_TYPE.FLIGHT,
    title: 'טוקיו → דובאי',
    fromPlaceId: 'pl-nrt',
    toPlaceId: 'pl-dxb',
  });
  const leg2 = bk({
    id: 'b-leg2',
    type: BOOKING_TYPE.FLIGHT,
    title: 'דובאי → תל אביב',
    fromPlaceId: 'pl-dxb',
    toPlaceId: 'pl-tlv',
  });
  const flight = (id: string, bookingId: string, startsAt: string, endsAt: string): TripEvent => ({
    id,
    tripId: 't1',
    date: startsAt.slice(0, 10),
    title: 'טיסה',
    kind: EVENT_KIND.HARD,
    startsAt,
    endsAt,
    status: EVENT_STATUS.PLANNED,
    bookingId,
    sortOrder: 0,
    source: EVENT_SOURCE.MANUAL,
    createdAt: NOW,
    updatedAt: NOW,
    updatedBy: 'u1',
  });

  beforeEach(() => {
    setSimulatedNow(Date.parse(NOW));
    tripPlaces = [TLV, DXB, NRT];
    tripBookings = [leg1, leg2];
    tripEvents = [
      flight('e-leg1', 'b-leg1', '2026-07-19T00:30:00Z', '2026-07-19T06:10:00Z'),
      flight('e-leg2', 'b-leg2', '2026-07-19T08:50:00Z', '2026-07-19T12:35:00Z'),
    ];
    showPlaceOnMap = null;
    startErrand = () => {};
  });
  afterEach(() => {
    cleanup();
    tripBookings = [];
    tripEvents = [];
    setSimulatedNow(null);
  });

  const link = () => document.querySelector('.bk-pairlink') as HTMLElement;
  const openWith = (booking: Booking, onOpen = vi.fn()) => {
    render(
      wrapNav(
        <BookingDetail booking={booking} onClose={() => {}} onEdit={() => {}} onOpen={onOpen} />,
      ),
    );
    return onOpen;
  };

  it('says which leg of the journey this is, and points at the next', () => {
    const onOpen = openWith(leg1);
    expect(screen.getByText(t.index.detail.journey)).toBeTruthy();
    expect(link().textContent).toContain(t.index.detail.journeyLeg(1, 2));
    fireEvent.click(link());
    expect(onOpen).toHaveBeenCalledWith(leg2);
  });

  // The last leg has no "next", so the way through goes back rather than disappearing.
  it('points at the previous leg from the last one', () => {
    const onOpen = openWith(leg2);
    expect(link().textContent).toContain(t.index.detail.journeyLeg(2, 2));
    fireEvent.click(link());
    expect(onOpen).toHaveBeenCalledWith(leg1);
  });

  // The defect this relation exists to prevent: one PNR across both legs is exactly
  // what a connection has, so the pair rule would otherwise call the second half of
  // the outbound journey "the return".
  it('is not confused with a round trip when both legs share a code', () => {
    tripBookings = [
      { ...leg1, confirmationCode: 'EK319' },
      { ...leg2, confirmationCode: 'EK319' },
    ];
    openWith(tripBookings[0]);
    expect(screen.getByText(t.index.detail.journey)).toBeTruthy();
    expect(screen.queryByText(t.index.detail.pair)).toBeNull();
  });

  it('shows nothing for a booking whose journey is only itself', () => {
    tripBookings = [leg1];
    openWith(leg1);
    expect(screen.queryByText(t.index.detail.journey)).toBeNull();
  });
});

/* ── THE AIRPORT CODES (ADR-0166 §18, revised 2026-08-08) ──────────────────────────────────
   The route surfaces read as cities, because they are rows. The codes live HERE, in the
   record, beside the confirmation code — the other thing you hold a ticket up against. */
describe('BookingDetail — the airport codes fact', () => {
  const tlv = pl('pl-tlv', 'נמל התעופה בן גוריון', { lat: 32, lng: 34.8 });
  const fra = pl('pl-fra', 'נמל התעופה של פרנקפורט', { lat: 50, lng: 8.5 });
  const flight = bk({
    id: 'bk-fl',
    type: BOOKING_TYPE.FLIGHT,
    title: 'נמל התעופה בן גוריון ← נמל התעופה של פרנקפורט',
    fromPlaceId: 'pl-tlv',
    toPlaceId: 'pl-fra',
  });
  const code = (value: string) => ({
    iata: {
      value,
      source: 'wikidata',
      license: 'CC0',
      fetchedAt: NOW,
      confidence: 1,
      method: 'name_proximity',
      ref: 'Q-airport',
    },
  });

  beforeEach(() => {
    tripPlaces = [tlv, fra];
    tripBookings = [flight];
    tripEnrichments = {};
  });
  afterEach(cleanup);

  it('states both codes as a route once the pipe has resolved them', () => {
    tripEnrichments = { 'pl-tlv': code('TLV'), 'pl-fra': code('FRA') };
    open(flight);
    expect(screen.getByText(t.index.detail.airports)).toBeTruthy();
    expect(screen.getByText('TLV')).toBeTruthy();
    expect(screen.getByText('FRA')).toBeTruthy();
  });

  it('is absent entirely when neither end has a code — a train has none', () => {
    open(flight);
    expect(screen.queryByText(t.index.detail.airports)).toBeNull();
  });

  it('states the half it knows when only one end resolved', () => {
    tripEnrichments = { 'pl-tlv': code('TLV') };
    open(flight);
    expect(screen.getByText(t.index.detail.airports)).toBeTruthy();
    expect(screen.getByText('TLV')).toBeTruthy();
  });

  it('is absent on a booking with no route at all', () => {
    tripEnrichments = { 'pl-1': code('TLV') };
    tripPlaces = [placed];
    open(bk({ id: 'bk-h', type: BOOKING_TYPE.HOTEL, placeId: 'pl-1' }));
    expect(screen.queryByText(t.index.detail.airports)).toBeNull();
  });
});

/* ── THE HEADING READS AS CITIES (ADR-0166 §18's amendment, owner 2026-08-08) ──────────────
   Narrowly revises ADR-0059 §3's "the detail keeps full names": a resolved city is not the
   stripping heuristic that rule was written against, and the full name is still one row down
   in the location fact. */
describe('BookingDetail — the heading', () => {
  const tlv = pl('pl-tlv', 'נמל התעופה בן גוריון', { lat: 32, lng: 34.8, address: 'לוד' });
  const fra = pl('pl-fra', 'נמל התעופה של פרנקפורט (Frankfurter Flughafen – FRA)');
  const flight = bk({
    id: 'bk-fl2',
    type: BOOKING_TYPE.FLIGHT,
    title: 'stored title nobody reads',
    fromPlaceId: 'pl-tlv',
    toPlaceId: 'pl-fra',
  });

  beforeEach(() => {
    tripPlaces = [tlv, fra];
    tripBookings = [flight];
    tripEnrichments = {};
  });
  afterEach(cleanup);

  it('shows the resolved city for an endpoint that has one', () => {
    render(
      <PlaceLabelsProvider labels={{ 'pl-tlv': 'תל אביב' }}>
        {wrapNav(<BookingDetail booking={flight} onClose={() => {}} onEdit={() => {}} />)}
      </PlaceLabelsProvider>,
    );
    expect(screen.getByText('תל אביב')).toBeTruthy();
  });

  // **The full name, not the stripped one.** The shortening is a concession rows make for
  // width, and this surface has none to make — so an unresolved endpoint keeps the record's
  // own words rather than a guess at them.
  it('keeps the FULL name for an endpoint with no label, not the stripped one', () => {
    render(
      <PlaceLabelsProvider labels={{ 'pl-tlv': 'תל אביב' }}>
        {wrapNav(<BookingDetail booking={flight} onClose={() => {}} onEdit={() => {}} />)}
      </PlaceLabelsProvider>,
    );
    expect(screen.getByText('נמל התעופה של פרנקפורט (Frankfurter Flughafen – FRA)')).toBeTruthy();
    expect(screen.queryByText('פרנקפורט (Frankfurter Flughafen – FRA)')).toBeNull();
  });

  it('reads as the stored names when nothing has resolved at all', () => {
    render(wrapNav(<BookingDetail booking={flight} onClose={() => {}} onEdit={() => {}} />));
    expect(screen.getByText('נמל התעופה בן גוריון')).toBeTruthy();
  });
});

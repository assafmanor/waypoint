// @vitest-environment jsdom
//
// **THE WAY FROM A TRIP-MODE DAY CARD INTO THE READ** (ADR-0229).
//
// The band itself is tested with hand-built props in `ui/domain/ReadBand.test.tsx`. What is only
// observable HERE is that the screen connects one to the other, and the three connections are
// exactly the ones the defect was made of:
//
//  1 · **A booked event opens `BookingDetail`, an unbooked one `EventDetail`.** Before this, the
//      event card opened neither — while `TransitionRow` and `UnplacedCommitment` on the same
//      screen already opened the first. Two row families, one screen, disagreeing about whether
//      what they stand for can be read.
//  2 · **The card STAYS OPEN behind the read** (§4, amended): the read is a sheet, and what
//      you opened is still yours when you dismiss it.
//  3 · **The band is there on a day that is not today**, where `event-actions.ts` renders no
//      verbs at all — which is the structural reason it could never live in that band.
//
// Pinned clock, and no environment this file did not set (`frontend/CLAUDE.md`).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  BOOKING_SOURCE,
  BOOKING_TYPE,
  EVENT_KIND,
  EVENT_SOURCE,
  EVENT_STATUS,
  type Booking,
  type Place,
  type TripEnrichments,
  type TripEvent,
} from '@waypoint/shared';
import { setSimulatedNow } from '../lib/useClock';
import { t } from '../i18n/he';
import { wrapNav } from '../test/nav-harness';
import { MapScopeProvider } from '../state/map-scope-state';
import { DragProvider } from '../state/drag-state';
import { buildHostContextIndex } from '../lib/host-context';
import { buildNoteHosts } from '../lib/notes';
import { image } from '../test/enrichment-image';
import '../test/scroll-into-view';

const DAY = '2026-08-03';
const NOW = `${DAY}T09:00:00Z`;
const ZONE = 'Europe/Rome';

const ev = (id: string, e: Partial<TripEvent> = {}): TripEvent => ({
  id,
  tripId: 't1',
  title: `event ${id}`,
  kind: EVENT_KIND.SOFT,
  status: EVENT_STATUS.PLANNED,
  source: EVENT_SOURCE.MANUAL,
  date: DAY,
  sortOrder: 0,
  createdAt: `${DAY}T00:00:00Z`,
  updatedAt: `${DAY}T00:00:00Z`,
  updatedBy: 'u1',
  ...e,
});

const LAGOON: Place = {
  id: 'p-lagoon',
  tripId: 't1',
  name: 'Jökulsárlón',
  address: 'Jökulsárlón, 781, איסלנד',
  lat: 64.05,
  lng: -16.18,
  createdAt: `${DAY}T00:00:00Z`,
  updatedAt: `${DAY}T00:00:00Z`,
  updatedBy: 'u1',
};

const booking: Booking = {
  id: 'b-zodiac',
  tripId: 't1',
  type: BOOKING_TYPE.ACTIVITY,
  title: 'Jökulsárlón Zodiac Boat',
  confirmationCode: 'ARC-87103041',
  placeId: LAGOON.id,
  source: BOOKING_SOURCE.MANUAL,
  createdAt: `${DAY}T00:00:00Z`,
  updatedAt: `${DAY}T00:00:00Z`,
  updatedBy: 'u1',
};

/** The booked activity — a hard event, which is what the row a booking backs renders as. */
const booked = ev('zodiac', {
  title: 'Jökulsárlón Zodiac Boat',
  kind: EVENT_KIND.HARD,
  bookingId: booking.id,
  startsAt: `${DAY}T13:00:00Z`,
  endsAt: `${DAY}T16:00:00Z`,
});

/** An unbooked stop at the same place, so the two cases differ ONLY in the booking. */
const unbooked = ev('falls', {
  title: 'Svartifoss',
  placeId: LAGOON.id,
  startsAt: `${DAY}T17:00:00Z`,
  endsAt: `${DAY}T18:00:00Z`,
});

let tripEvents: TripEvent[] = [];
let tripEnrichments: TripEnrichments = {};
let activeDate = DAY;

vi.mock('../state/mode-state', () => import('../test/mode-from-trip'));
vi.mock('../state/trip-state', () => ({
  byStart: (a: TripEvent, b: TripEvent) =>
    Date.parse(a.startsAt ?? a.date) - Date.parse(b.startsAt ?? b.date),
  useTrip: () => ({
    documentAttachments: [],
    travelModeOverrides: [],
    travelModeVerbs: { setLegMode: vi.fn(), clearLegMode: vi.fn() },
    hostContexts: buildHostContextIndex(tripEvents, [booking]),
    // The opened card mounts `HostNotes`/`HostTasks`/`HostDocuments`, which resolve through
    // this map — stated rather than omitted, because the real state always carries it and a
    // surface reading it must not be handed `undefined`.
    noteHosts: buildNoteHosts({
      events: tripEvents,
      bookings: [booking],
      places: [LAGOON],
      maybeItems: [],
      documents: [],
    }),
    trip: {
      id: 't1',
      timezone: ZONE,
      destination: 'איסלנד',
      startDate: DAY,
      endDate: '2026-08-05',
      updatedBy: 'u1',
    },
    bookings: [booking],
    places: [LAGOON],
    enrichments: tripEnrichments,
    events: tripEvents,
    maybeItems: [],
    justAddedIdea: null,
    notes: [],
    documents: [],
    members: [],
    zoneEvidence: {
      events: tripEvents,
      bookings: [booking],
      places: [LAGOON],
      crossings: [],
      primaryZone: ZONE,
    },
    activeDate,
    ripple: null,
    setActiveDate: () => {},
    changeFeed: [],
    dismissChange: () => {},
    clearChangeFeed: () => {},
    fxRates: null,
    refreshFx: async () => {},
    tasks: [],
    users: [],
    zoneCrossings: [],
    taskVerbs: {
      createTask: async () => undefined,
      updateTask: async () => {},
      deleteTask: async () => {},
      tickTask: async () => {},
    },
  }),
}));

vi.mock('../state/auth-state', () => ({ useAuth: () => ({ me: null }) }));

vi.mock('../state/verbs', () => ({
  useVerbs: () => ({
    done: vi.fn(),
    skip: vi.fn(),
    restore: vi.fn(),
    onWay: vi.fn(),
    rippleApply: vi.fn(),
    rippleDismiss: vi.fn(),
    reorder: vi.fn(),
    delay: vi.fn(),
    earlier: vi.fn(),
  }),
}));

vi.mock('../lib/travel', () => ({
  useDayTravel: () => ({ estimateFor: () => null, warmingFor: () => false }),
  useDayShapes: () => ({ pathFor: () => null }),
}));

const { DayView } = await import('./DayView');

const show = () =>
  render(
    wrapNav(
      <MapScopeProvider>
        <DragProvider>
          <DayView />
        </DragProvider>
      </MapScopeProvider>,
    ),
  );

/** Open a card by its title — the face is the button, as it has been since ADR-0043. */
const openCard = (title: string) => {
  fireEvent.click(screen.getByText(title).closest('button')!);
};

beforeEach(() => {
  setSimulatedNow(Date.parse(NOW));
  tripEvents = [booked, unbooked];
  tripEnrichments = {};
  activeDate = DAY;
});

afterEach(() => {
  cleanup();
  setSimulatedNow(null);
});

describe('DayView — the read is one tap from the card (ADR-0229)', () => {
  it('offers the booking by name on a booked row, and the event on an unbooked one', () => {
    const { container } = show();

    openCard(booked.title);
    expect(container.querySelector('.wp-event.open .rd-line .rd-t')!.textContent).toBe(
      t.hero.toBooking,
    );

    openCard(unbooked.title);
    expect(container.querySelector('.wp-event.open .rd-line .rd-t')!.textContent).toBe(
      t.day.read.details,
    );
  });

  it('states the address, which is the one fact the row above it cannot say', () => {
    const { container } = show();
    openCard(booked.title);
    expect(container.querySelector('.wp-event.open .rd-sub')!.textContent).toBe(LAGOON.address);
  });

  // 1 — the branch. A linked pair is ONE context (ADR-0172 §1), so the booked row's read is the
  // booking's, which holds the confirmation code ADR-0223 moved there.
  it('opens the booking read on a booked row, and prints the code it went there for', () => {
    const { container } = show();
    openCard(booked.title);
    fireEvent.click(container.querySelector('.rd-line')!);

    // Scoped to the sheet: the card's own hard-edit warning prints the code too, and it is
    // still in the DOM behind the read (ADR-0174 §8's carve-out — the one place outside the
    // booking where ADR-0223 lets the code survive, because it identifies what you are about
    // to change). Two copies on screen is the correct state, not a duplicate to assert away.
    const sheet = document.querySelector('.modal-card')!;
    expect(sheet.textContent).toContain(t.index.detail.code);
    expect(sheet.textContent).toContain(`#${booking.confirmationCode}`);
  });

  it('opens the event read on an unbooked row', () => {
    const { container } = show();
    openCard(unbooked.title);
    fireEvent.click(container.querySelector('.rd-line')!);

    // `EventDetail`'s own facts: a location and a when, and no confirmation code to state.
    expect(screen.getByText(t.index.detail.timing)).toBeTruthy();
    expect(screen.queryByText(t.index.detail.code)).toBeNull();
  });

  // 2 — §4, amended on the deployed build (owner: _"it also closes the event card, and it
  // shouldn't do it"_). It closed for one release, so the host sections would not render
  // twice, once per layer — a duplication behind a scrim, off one shared state. What it
  // actually cost was the reader's place: dismissing the read left a collapsed row.
  it('leaves the card open behind the read, so dismissing it returns you where you were', () => {
    const { container } = show();
    openCard(booked.title);
    fireEvent.click(container.querySelector('.rd-line')!);
    expect(container.querySelector('.wp-event.open')).toBeTruthy();
  });

  // 3 — the structural reason the band cannot live in the verb row. `event-actions.ts` gates
  // every verb on `today && !readOnly`, so a row on another day renders no band at all — and
  // that is exactly the row whose facts you want.
  it('is present on a day that is not today, where the row offers no verbs at all', () => {
    activeDate = '2026-08-04';
    // Timed, deliberately: an event with no clock is `UnplacedCommitment`, a different row
    // family (ADR-0219 §4), and this spec is about the CARD.
    tripEvents = [
      {
        ...booked,
        date: activeDate,
        startsAt: `${activeDate}T13:00:00Z`,
        endsAt: `${activeDate}T16:00:00Z`,
      },
    ];
    const { container } = show();

    openCard(booked.title);
    const open = container.querySelector('.wp-event.open')!;
    expect(open.querySelector('.wp-event-act-row')).toBeNull();
    expect(open.querySelector('.rd-line')).toBeTruthy();
  });

  // The picture is the whole point of the second design round, and it is shown REGARDLESS of a
  // picked icon: `rowPhoto`'s rule is about the 40px badge, and this band is the surface that
  // choice leaves the photograph one tap away on (ADR-0167 §2, ADR-0229 §2).
  it('shows the place photograph as a band when there is one', () => {
    tripEnrichments = { [LAGOON.id]: { image } };
    const { container } = show();

    openCard(booked.title);
    const open = container.querySelector('.wp-event.open')!;
    expect(open.querySelector('.rd-line')).toBeNull();
    const caption = open.querySelector('.rd-band .wp-photoband figcaption')!;
    expect(caption.querySelector('strong')!.textContent).toContain(LAGOON.address);
    expect(caption.querySelector('span')!.textContent).toContain('Ulrich Latzenhofer');
  });
});

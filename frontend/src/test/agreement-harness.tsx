// **ONE DAY, HANDED TO EVERY SURFACE** (ADR-0226) — the fixture the agreement suite compares over.
//
// Thirty-one test files hand-roll their own `trip-state` mock, and that is not a tidiness
// problem: it is *why* two surfaces are never fed the same day, and therefore why six
// cross-surface contradictions (ADR-0206 §AJ3, §AY, §BB, §BD, §BF, #827) shipped green. A suite
// that asks whether the board and the day view agree cannot be written until one fixture can
// reach both.
//
// **This is deliberately not a thirty-second rewrite of those files.** It serves the agreement
// suite; existing per-surface suites keep their own fixtures, which are tuned to the arm each one
// is about. New cross-surface work starts here.
//
// `vi.mock` factories are hoisted and module-scoped, so the mocking itself must live in the test
// file. What lives here is the STATE those factories read and the fixture that fills it — which
// is the part that has to be identical across surfaces for the comparison to mean anything.
import type { LatLng, Place, TravelEstimate, TravelMode, TripEvent } from '@waypoint/shared';
import { BOOKING_SOURCE, EVENT_KIND, EVENT_SOURCE, EVENT_STATUS } from '@waypoint/shared';
import { buildHostContextIndex } from '../lib/host-context';

export const AGREE_DAY = '2026-08-03';
/** Pinned. These fixtures carry fixed instants, so reading the real clock would make the suite
 *  mean something different every day it ran (`frontend/CLAUDE.md`). Rome is UTC+2 in August. */
export const AGREE_NOW = `${AGREE_DAY}T12:30:00Z`;
export const AGREE_ZONE = 'Europe/Rome';

/** The mutable world the mock factories read. One object so a spec sets up a day in one place
 *  and every surface then renders THAT day. */
export const world = {
  events: [] as TripEvent[],
  /** Seconds for any leg asked about, or `null` — the ordinary answer (ADR-0206 §D4). */
  travelSeconds: null as number | null,
  /** The day the surfaces render. A spec about the trip's LAST day has to be able to stand on
   *  one (ADR-0236 §8), and hard-coding `AGREE_DAY` here made that unreachable. */
  activeDate: AGREE_DAY,
};

export const agreePlaces: Place[] = [
  {
    id: 'p-museum',
    tripId: 't1',
    name: 'Museo di Capodimonte',
    lat: 40.867,
    lng: 14.25,
    createdAt: `${AGREE_DAY}T00:00:00Z`,
    updatedAt: `${AGREE_DAY}T00:00:00Z`,
    updatedBy: 'u1',
  },
  {
    id: 'p-dinner',
    tripId: 't1',
    name: 'Via dei Tribunali 32',
    lat: 40.851,
    lng: 14.258,
    createdAt: `${AGREE_DAY}T00:00:00Z`,
    updatedAt: `${AGREE_DAY}T00:00:00Z`,
    updatedBy: 'u1',
  },
];

export const agreeEvent = (id: string, e: Partial<TripEvent> = {}): TripEvent => ({
  id,
  tripId: 't1',
  title: `event ${id}`,
  kind: EVENT_KIND.SOFT,
  status: EVENT_STATUS.PLANNED,
  source: EVENT_SOURCE.MANUAL,
  date: AGREE_DAY,
  sortOrder: 0,
  createdAt: `${AGREE_DAY}T00:00:00Z`,
  updatedAt: `${AGREE_DAY}T00:00:00Z`,
  updatedBy: 'u1',
  ...e,
});

/** The stop the day left you at: over by ⁦12:00⁩, so at ⁦12:30⁩ you are in a hole with the schedule's
 *  last claim about where you are standing being here. */
export const agreeMuseum = agreeEvent('museum', {
  title: 'קפודימונטה',
  placeId: 'p-museum',
  startsAt: `${AGREE_DAY}T10:00:00Z`,
  endsAt: `${AGREE_DAY}T12:00:00Z`,
});

/** `הבא בתור`, `minutes` out from `AGREE_NOW`. */
export const agreeDinner = (minutes: number) =>
  agreeEvent('dinner', {
    title: 'ארוחת ערב',
    placeId: 'p-dinner',
    startsAt: new Date(Date.parse(AGREE_NOW) + minutes * 60_000).toISOString(),
    endsAt: new Date(Date.parse(AGREE_NOW) + (minutes + 90) * 60_000).toISOString(),
  });

/** The `useTrip()` value every surface in the suite reads. */
export const tripState = () => ({
  documentAttachments: [],
  travelModeOverrides: [],
  hostContexts: buildHostContextIndex(world.events, []),
  trip: {
    id: 't1',
    timezone: AGREE_ZONE,
    startDate: new Date(Date.parse(`${AGREE_DAY}T00:00:00Z`) - 86_400_000)
      .toISOString()
      .slice(0, 10),
    endDate: '2026-08-05',
    // `dayHeadTitle` reads this unguarded, so a fixture omitting it throws inside the day's
    // head rather than rendering a day with no destination.
    destination: 'נאפולי',
    updatedBy: 'u1',
  },
  bookings: [],
  places: agreePlaces,
  events: world.events,
  notes: [],
  documents: [],
  maybeItems: [],
  members: [],
  zoneEvidence: {
    events: world.events,
    bookings: [],
    places: agreePlaces,
    crossings: [],
    primaryZone: AGREE_ZONE,
  },
  enrichments: {},
  justAddedIdea: null,
  ripple: null,
  setActiveDate: () => {},
  get activeDate() {
    return world.activeDate;
  },
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
});

/** The `useDayTravel()` value. One answer for any leg, which is what makes a disagreement
 *  between two surfaces attributable to the surfaces rather than to the estimate. */
export const dayTravel = () => ({
  estimateFor: (_from: LatLng, _to: LatLng, mode: TravelMode): TravelEstimate | null =>
    world.travelSeconds == null
      ? null
      : { mode, durationSeconds: world.travelSeconds, distanceMeters: 1800 },
  /** Never warming: this suite is about what the surfaces SAY once their numbers are in
   *  (ADR-0206 §AU1), and a warming leg states no departure for anyone to disagree about. */
  warmingFor: () => false,
});

/** The other half of `lib/travel`'s surface — the day draws a leg's line from it. */
export const dayShapes = () => ({ pathFor: () => null });

export const authState = () => ({ me: null });

export const BOOKING_FIXTURE_SOURCE = BOOKING_SOURCE.MANUAL;

export function resetWorld() {
  world.events = [];
  world.travelSeconds = null;
  world.activeDate = AGREE_DAY;
}

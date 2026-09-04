// @vitest-environment jsdom
//
// **THE DAY'S OWN TRAVEL READ** (ADR-0206 §V1.1 / §V1.3 / §V1.4) — and this file exists for two
// reasons, only one of which is the feature.
//
// The first is §V1.1, which is a **bug fix**: the day has stated the whole of a hole as free
// since ADR-0159 shipped, so a hole with a forty-minute walk in it tells you about time you do
// not have, on the one surface built to be a statement. A bug fix without a failing test is a
// claim, so the two assertions at the top of this file were written against `main` and were red
// there — `פנוי · 2:40 שע׳` where the day owes `פנוי · 2:00 שע׳`.
//
// The second is that **`DayView` had no screen test at all**, which is how `frontend/CLAUDE.md`'s
// named anti-pattern — "changing a day-surface derivation in `DayView` only" — cost a release
// twice while every unit around it stayed green. The derivations are tested pure in
// `lib/day-joins.test.ts` and the block is tested with hand-built props in
// `ui/domain/DayJoinRow.test.tsx`; what is only observable here is that the screen connects one
// to the other, over the day's real rows.
//
// The GEOMETRY is not asserted here and cannot be (jsdom loads no CSS, resolves no `var()` and
// reports every rect as zero) — the 360px measurements are in the PR.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  EVENT_KIND,
  EVENT_SOURCE,
  EVENT_STATUS,
  TRAVEL_BUFFER_SECONDS,
  TRANSIT_LEG_MODE,
  TRAVEL_MODE,
  WALK_DEFAULT_MAX_SECONDS,
  type Booking,
  type LegTravelMode,
  type Place,
  type TravelEstimate,
  type TravelModeOverride,
  type TripEvent,
} from '@waypoint/shared';
import { setSimulatedNow } from '../lib/useClock';
import { approxTravelTime, freeTimePhrase, hoursPhrase, remainingPhrase } from '../lib/duration';
import { markOnWay, resetOnWayForTests } from '../lib/on-way';
import { ltrIsolate, withoutBidiControls } from '../lib/bidi';
import { clockRange, formatTime } from '../lib/time';
import { formatDistance, haversineMeters } from '../lib/distance';
import { t } from '../i18n/he';
import { wrapNav } from '../test/nav-harness';
import { MapScopeProvider } from '../state/map-scope-state';
import { DragProvider } from '../state/drag-state';
import { buildHostContextIndex } from '../lib/host-context';
// jsdom implements no scrolling, and the day's "land on now" effect calls it on mount.
import '../test/scroll-into-view';

const DAY = '2026-08-03';
/** Pinned — the fixtures carry fixed instants, so reading the real clock would make this file
 *  mean something different every day it ran (`frontend/CLAUDE.md`). Rome is UTC+2 in August. */
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

/** Two real coordinates, because the leg is looked up by coordinate and a place-lite row
 *  (ADR-0147) has none — which is itself one of §D4's absences, and a case below. */
const places: Place[] = [
  {
    id: 'p-lunch',
    tripId: 't1',
    name: 'שוק צוקיג׳י',
    lat: 40.867,
    lng: 14.25,
    createdAt: `${DAY}T00:00:00Z`,
    updatedAt: `${DAY}T00:00:00Z`,
    updatedBy: 'u1',
  },
  {
    id: 'p-theatre',
    tripId: 't1',
    name: 'קאבוקי-זה',
    lat: 40.851,
    lng: 14.258,
    createdAt: `${DAY}T00:00:00Z`,
    updatedAt: `${DAY}T00:00:00Z`,
    updatedBy: 'u1',
  },
  {
    id: 'p-morning',
    tripId: 't1',
    name: 'שער טוריי',
    lat: 40.845,
    lng: 14.262,
    createdAt: `${DAY}T00:00:00Z`,
    updatedAt: `${DAY}T00:00:00Z`,
    updatedBy: 'u1',
  },
];

/** The two coordinates the declared leg runs between, read OFF the fixtures rather than copied
 *  beside them — the crow-flies assertion below is derived, so moving a fixture moves both. */
const coordOf = (id: string) => {
  const place = places.find((p) => p.id === id)!;
  return { lat: place.lat!, lng: place.lng! };
};

/** **The mockup's own scenario, and the ADR's own example** — a ⁦2:40⁩ hole with ⁦40⁩ minutes of
 *  walking in it, leaving ⁦2:00⁩ free (§V1.1's line reads `פנוי · 2:00 שע׳ · אחרי 40 דק׳ דרך`).
 *  The numbers are the drawing's so that this file and `a-travel-time-between-two-points-v2.html`
 *  cannot disagree about the case. */
const GAP_MINUTES = 160;
const WALK_MINUTES = 40;

/** A row BEFORE the skip, so the day still has a hole once the skipped one leaves the list — and
 *  at its OWN place, because two rows that are one place have no journey between them at all
 *  (`ROUTE_MIN_CROW_M`, ADR-0205 §Z2), which is §D4's absence and would have made this spec pass
 *  for the wrong reason. */
const morning = ev('morning', {
  title: 'בוקר',
  placeId: 'p-morning',
  startsAt: `${DAY}T08:00:00Z`,
  endsAt: `${DAY}T08:30:00Z`,
});
const lunch = ev('lunch', {
  title: 'ארוחת צהריים',
  placeId: 'p-lunch',
  startsAt: `${DAY}T11:00:00Z`,
  endsAt: `${DAY}T13:20:00Z`,
});
const theatre = ev('theatre', {
  title: 'תיאטרון',
  kind: EVENT_KIND.HARD,
  placeId: 'p-theatre',
  startsAt: `${DAY}T16:00:00Z`,
  endsAt: `${DAY}T18:30:00Z`,
});

let tripOverrides: TravelModeOverride[] = [];
const travelModeVerbs = {
  setLegMode: vi.fn(async () => {}),
  clearLegMode: vi.fn(async () => {}),
};

let tripEvents: TripEvent[] = [];
const tripBookings: Booking[] = [];
let tripPlaces: Place[] = places;
/** **The zone the trip is FILED under**, which is not always the one its day is read in — the
 *  case ADR-0206 §AQ names and the one the slot's own clocks were still ignoring. */
let tripTimezone = ZONE;

vi.mock('../state/trip-state', () => ({
  byStart: (a: TripEvent, b: TripEvent) =>
    Date.parse(a.startsAt ?? a.date) - Date.parse(b.startsAt ?? b.date),
  useTrip: () => ({
    documentAttachments: [],
    // The declared legs, mutable so a spec can declare one and re-render (ADR-0206 §AM). Stated
    // rather than omitted: `useDayTravelReads` takes it as a REQUIRED list precisely so a surface
    // cannot forget to wire it and silently ignore every declaration on the trip.
    travelModeOverrides: tripOverrides,
    travelModeVerbs,
    hostContexts: buildHostContextIndex(tripEvents, tripBookings),
    trip: {
      id: 't1',
      timezone: tripTimezone,
      startDate: DAY,
      endDate: '2026-08-05',
      updatedBy: 'u1',
    },
    bookings: tripBookings,
    places: tripPlaces,
    events: tripEvents,
    maybeItems: [],
    justAddedIdea: null,
    notes: [],
    documents: [],
    members: [],
    zoneEvidence: {
      events: tripEvents,
      bookings: tripBookings,
      places: tripPlaces,
      crossings: [],
      primaryZone: tripTimezone,
    },
    activeDate: DAY,
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

/** **The estimate arrives from `useDayTravel`, so it is mocked at that seam** — the hook is M5's
 *  and tested there. `null` is the ordinary answer (§D4) and it is a case below rather than an
 *  omission. */
let travelSeconds: number | null = null;
/**
 * **The mode these fixtures DERIVE to** (ADR-0206 §AV1), read live off `travelSeconds`.
 *
 * The double answers one duration for every mode, and the leg's default is now a function of how
 * long the WALK takes — so a ⁦40⁩-minute journey is a drive, and the ⁦8⁩-minute one below is a walk.
 * A function rather than a constant because the specs retune `travelSeconds` per describe, and
 * naming it here is what keeps a threshold change to one line instead of six expectations.
 */
const derivedMode = () =>
  travelSeconds !== null && travelSeconds > WALK_DEFAULT_MAX_SECONDS
    ? TRAVEL_MODE.DRIVING
    : TRAVEL_MODE.WALKING;
/** **Every ask this screen makes for a route**, recorded rather than eyeballed: `useDayTravel` is
 *  the one seam a request can leave through, and its `stops` are what a request is keyed on. The
 *  day total's exit criterion is that it adds neither (ADR-0206 §V1.9). */
const travelAsks: { tripId: string; stops: readonly { lat: number; lng: number }[] }[] = [];
vi.mock('../lib/travel', () => ({
  useDayTravel: (opts: { tripId: string; stops: readonly { lat: number; lng: number }[] }) => {
    travelAsks.push(opts);
    return {
      estimateFor: (): TravelEstimate | null =>
        travelSeconds === null
          ? null
          : { mode: TRAVEL_MODE.WALKING, durationSeconds: travelSeconds, distanceMeters: 2400 },
      // These specs are about what a day SAYS once its numbers are in, so the double is never
      // warming (ADR-0206 §AU1). The computing arm has its own coverage in `day-joins.test.ts`
      // and `travel.test.ts`; asserting it here too would only re-test the double.
      warmingFor: () => false,
    };
  },
  useDayShapes: () => ({ pathFor: () => null }),
}));

const { DayView } = await import('./DayView');

/** `useDaySurface` reaches for the Map tab's scope (the day strip and the Map share one selected
 *  day) and for the drag state (the edge dwell that turns the page), so the day surface cannot be
 *  rendered without both. Not in `wrapNav`: those two are the day/Map surfaces' own, and the
 *  harness is for what every back-stack participant needs. */
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

/** The corrected free time, derived here the way the code derives it rather than written out —
 *  §D5's buffer is a constant and not a number this file also believes.
 *
 *  **And the buffer is part of the correction since 2026-09-01** (`goingCostMinutes`): the app tells
 *  you to leave at `arriveBy - walk - buffer`, so the five minutes after that instant are not free
 *  time, they are the start of the walk. The strip and the slot both end where the block says to
 *  go, which is the report this number moved for. */
const freeAfterWalk = GAP_MINUTES - WALK_MINUTES - TRAVEL_BUFFER_SECONDS / 60;

// One reset for the whole file rather than one per describe: a declaration leaking from a spec
// into the next would change what every following read says, and the leak would look like a bug in
// the derivation rather than in the fixture.
beforeEach(() => {
  tripOverrides = [];
  travelModeVerbs.setLegMode.mockClear();
  travelModeVerbs.clearLegMode.mockClear();
});

// ── THE MODE, PER LEG, ON THE REAL SCREEN (ADR-0206 §AM / §M5) ────────────────────────────
//
// The unit reads are asserted in `lib/day-travel.mode.test.ts` and the block's own shape in
// `ui/domain/DayJoinRow.test.tsx`. What is only observable HERE is that the screen connects them:
// that the disclosure is wired to the leg's own pair, that a declaration reaches every read on the
// surface at once, and that picking your way back to the derived mode CLEARS the row rather than
// storing one that says what the derivation already says.
describe('DayView — the leg mode is declarable (ADR-0206 §AM)', () => {
  const PAIR = { fromPlaceId: 'p-lunch', toPlaceId: 'p-theatre' };
  const declared = (mode: LegTravelMode): TravelModeOverride => ({
    id: 'tmo-1',
    tripId: 't1',
    ...PAIR,
    mode,
    createdBy: 'u1',
    createdAt: `${DAY}T00:00:00Z`,
    updatedAt: `${DAY}T00:00:00Z`,
  });

  beforeEach(() => {
    setSimulatedNow(Date.parse(NOW));
    resetOnWayForTests();
    tripEvents = [lunch, theatre];
    tripPlaces = places;
    travelSeconds = WALK_MINUTES * 60;
  });
  afterEach(() => {
    cleanup();
    resetOnWayForTests();
    setSimulatedNow(null);
  });

  /** The default, so the assertions below are differences and not coincidences. */
  it('reads the trip derivation with nothing declared', () => {
    show();
    expect(screen.getByText(t.travelMode[derivedMode()])).toBeTruthy();
    expect(document.querySelector('.day-trv')!.textContent).toContain(String(WALK_MINUTES));
  });

  // **§AA4's whole point, end to end.** Senso-ji → Tokyo Station is a 73-minute walk and a
  // 25-minute train; declaring the leg תחב״צ silences the number rather than replacing it with
  // one we cannot compute — the block keeps the distance and says `ללא הערכה`.
  it('declared תחב״צ, the surface says the mode and no duration', () => {
    tripOverrides = [declared(TRANSIT_LEG_MODE)];
    show();
    const block = document.querySelector('.day-trv')!;
    expect(screen.getByText(t.travelMode[TRANSIT_LEG_MODE])).toBeTruthy();
    expect(block.textContent).toContain(t.travel.noEstimate);
    // The number that WAS there under the derived mode is gone, and no leave-by took its place:
    // there is no departure to compute from a duration nobody has.
    expect(block.textContent).not.toContain(String(WALK_MINUTES));
    expect(block.textContent).not.toContain('יציאה');
    // **AND THE DISTANCE STAYS** — §AA4 in as many words: `2.7 ק״מ` is still true and still
    // useful, and what disappears is the walking number that was wrong. On a declared leg it is
    // the crow-flies floor, which is the same claim the canvas makes by drawing a straight line.
    expect(block.textContent).toContain(
      formatDistance(Math.round(haversineMeters(coordOf('p-lunch'), coordOf('p-theatre')))),
    );
  });

  // **The price of the declaration, stated in the mockup and asserted here**: with no duration to
  // subtract, the strip below states the RAW hole again. §V1.1 corrected it by the journey; a leg
  // nobody estimated leaves ADR-0159's line exactly as it read before any of this existed.
  it('lets the strip state the whole hole again, rather than guessing', () => {
    tripOverrides = [declared(TRANSIT_LEG_MODE)];
    show();
    expect(screen.getByText(freeTimePhrase(GAP_MINUTES)!)).toBeTruthy();
    expect(screen.queryByText(freeTimePhrase(freeAfterWalk)!)).toBeNull();
  });

  // A declaration is not only about the words — the glyph moves with it, which is what makes the
  // active mode obvious at a glance (§V1's "the control has to make the active mode obvious").
  //
  // **It declares CYCLING since §AV1, and the swap is the point rather than a detail.** It
  // declared `driving`, which this fixture's ⁦40⁩-minute journey now DERIVES to on its own — so the
  // spec would have passed without an override at all, asserting nothing. A declaration is only
  // testable against a mode the derivation would not have picked.
  it('declared cycling, the surface reads the ride', () => {
    tripOverrides = [declared(TRAVEL_MODE.CYCLING)];
    show();
    expect(screen.getByText(t.travelMode[TRAVEL_MODE.CYCLING])).toBeTruthy();
    expect(screen.queryByText(t.travelMode[derivedMode()])).toBeNull();
  });

  it('opens the mode row from the block and writes on the leg’s own pair', () => {
    show();
    fireEvent.click(document.querySelector('button.day-trv-face')!);
    fireEvent.click(screen.getByRole('button', { name: t.travelMode[TRANSIT_LEG_MODE] }));
    expect(travelModeVerbs.setLegMode).toHaveBeenCalledWith(
      PAIR.fromPlaceId,
      PAIR.toPlaceId,
      TRANSIT_LEG_MODE,
    );
  });

  // **Picking the derived mode CLEARS**, rather than storing a row that agrees with the
  // derivation: §Z2 keeps the persisted set to genuine overrides, so a trip whose bookings later
  // make it a driving trip still moves.
  it('clears rather than storing the derived mode back', () => {
    tripOverrides = [declared(TRANSIT_LEG_MODE)];
    show();
    fireEvent.click(document.querySelector('button.day-trv-face')!);
    fireEvent.click(screen.getByRole('button', { name: t.travelMode[derivedMode()] }));
    expect(travelModeVerbs.clearLegMode).toHaveBeenCalledWith(PAIR.fromPlaceId, PAIR.toPlaceId);
    expect(travelModeVerbs.setLegMode).not.toHaveBeenCalled();
  });

  // **THE PICK MUST BE UNDOABLE ON THE SURFACE THAT MADE IT** (ADR-0206 §AW, field report
  // 2026-08-31: a ⁦50 m⁩ walk switched to a drive, _"the row vanished and could not be returned"_).
  //
  // Only observable here: the derivation returns a journey and the block renders one, so the leg
  // that a person declared keeps the disclosure that declared it. **§AZ1 drops the "unless
  // somebody picked it" half** — the row's existence stopped depending on what we know about the
  // leg, so the same hole with nothing declared draws the same block.
  describe('a hop under the ladder’s floor (§AW/§AZ1)', () => {
    beforeEach(() => {
      travelSeconds = 12;
    });

    it('draws the block even where the app picked the mode itself', () => {
      show();
      const block = document.querySelector('.day-trv');
      expect(block).not.toBeNull();
      expect(block!.textContent).toContain(t.travel.underMinute);
    });

    it('keeps the block, the mode and the way back once somebody picked it', () => {
      tripOverrides = [declared(TRAVEL_MODE.DRIVING)];
      show();
      const block = document.querySelector('.day-trv');
      expect(block).not.toBeNull();
      expect(screen.getByText(t.travelMode[TRAVEL_MODE.DRIVING])).toBeTruthy();
      expect(block!.textContent).toContain(t.travel.underMinute);
      fireEvent.click(document.querySelector('button.day-trv-face')!);
      fireEvent.click(screen.getByRole('button', { name: t.travelMode[derivedMode()] }));
      expect(travelModeVerbs.clearLegMode).toHaveBeenCalledWith(PAIR.fromPlaceId, PAIR.toPlaceId);
    });

    // A leg with no length to state also has no departure to advise and no correction to make, so
    // the strip below reports the whole hole exactly as it did before the pick.
    it('states the whole hole as free, and advises no departure', () => {
      tripOverrides = [declared(TRAVEL_MODE.DRIVING)];
      show();
      expect(document.querySelector('.day-trv')!.textContent).not.toContain('יציאה');
      expect(screen.getByText(freeTimePhrase(GAP_MINUTES)!)).toBeTruthy();
    });
  });
});

describe('DayView — a hole states what is free AFTER the journey (ADR-0206 §V1.1)', () => {
  beforeEach(() => {
    setSimulatedNow(Date.parse(NOW));
    resetOnWayForTests();
    tripEvents = [lunch, theatre];
    tripPlaces = places;
    travelSeconds = WALK_MINUTES * 60;
  });
  afterEach(() => {
    cleanup();
    resetOnWayForTests();
    setSimulatedNow(null);
  });

  // **THE BUG FIX, AND THE SPEC THAT WAS RED ON `main`.** The day said `2:40` because the hole is
  // 2:40 long; forty of those minutes are the walk to the theatre, so the app was telling you
  // about time you do not have.
  it('says what is free after the walk, not the whole hole', () => {
    show();
    expect(screen.getByText(freeTimePhrase(freeAfterWalk)!)).toBeTruthy();
  });

  it('no longer states the whole hole as free', () => {
    show();
    expect(screen.queryByText(freeTimePhrase(GAP_MINUTES)!)).toBeNull();
  });

  // **AND IT IS THE STRIP THAT SAYS IT, BELOW THE BLOCK** (owner, 2026-08-26 — ADR-0206 §AH3).
  // M6a absorbed the strip INTO the block to keep one object per hole, and that put two subjects
  // on one line: the block is about the leg, the strip about the hole. Both render now, and the
  // number on the strip is the corrected one — which is the whole reason the absorption was
  // tempting in the first place, and is not a reason to say two things in one sentence.
  it('states it on the quiet strip, not inside the journey row', () => {
    show();
    const block = document.querySelector('.day-trv')!;
    const strip = document.querySelector('.day-gap')!;
    expect(block).toBeTruthy();
    expect(strip).toBeTruthy();
    expect(block.textContent).not.toContain(freeTimePhrase(freeAfterWalk)!);
    expect(strip.textContent).toContain(freeTimePhrase(freeAfterWalk)!);
    // **…and the strip comes BEFORE the block** (owner, 2026-08-31; ADR-0206 §AH3's
    // amendment). `narrowGapForTravel` ends the free window AT the leave-by, so the two lines
    // are already chronological and were simply drawn in reverse. This assertion is the whole
    // of that change, and it was the opposite one until that report.
    expect(strip.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // §V1.3 — the day reads `place · journey · place`, which is what makes §V1.1 legible.
  it('names the journey between the two rows: the mode, the hedged duration and the leave-by', () => {
    show();
    expect(screen.getByText(t.travelMode[derivedMode()])).toBeTruthy();
    // The hedge is `approxDuration`'s and it carries bidi controls, so the assertion is on the
    // block's own text rather than on a bare literal.
    const block = document.querySelector('.day-trv');
    expect(block).toBeTruthy();
    expect(block!.textContent).toContain(String(WALK_MINUTES));
    // The leave-by: the next row's start, less the walk, less §D5's buffer.
    const leaveBy = new Date(
      Date.parse(theatre.startsAt!) - (WALK_MINUTES * 60 + TRAVEL_BUFFER_SECONDS) * 1000,
    );
    expect(block!.textContent).toContain(String(leaveBy.getUTCHours() + 2));
  });

  // **§D4 — with no estimate the FREE TIME reads exactly as it read before this milestone.**
  // Never a pessimistic guess: the reader must not be able to tell "not computed" from "not
  // computable", and inventing a walk we did not measure fails that in the direction that costs
  // an afternoon. **What §AZ1 changed is the ROW, not the correction**: the block stands, says
  // the mode, the crow-flies distance and `בלי הערכת זמן`, and carries the mode control — which
  // is the difference between "we cannot time this leg" and a hole where a journey should be.
  it('states the whole hole as free when there is no estimate, and still draws the row', () => {
    travelSeconds = null;
    show();
    expect(screen.getByText(freeTimePhrase(GAP_MINUTES)!)).toBeTruthy();
    const block = document.querySelector('.day-trv');
    expect(block).not.toBeNull();
    expect(block!.textContent).toContain(t.travel.noEstimate);
    // **And the crow-flies floor, which is the number this device can always work out** (§AZ2):
    // two coordinates and arithmetic, so it survives a plane, a failed request and a dead
    // provider — where before it was given only to a declared or a refused leg.
    expect(block!.textContent).toContain(
      formatDistance(Math.round(haversineMeters(coordOf('p-lunch'), coordOf('p-theatre')))),
    );
    // No departure advised off a duration nobody measured, and no `~0 דק׳` invented for it.
    expect(block!.textContent).not.toContain(t.travel.computing);
  });

  // **THE FLOOR THE OWNER SET** (2026-08-26: _"a gap below say 15 minutes is not really free
  // time"_). This is where M6a regressed a silence: a hole under `GAP_MIN_MINUTES` earns no `gap`
  // join, so Trip mode said nothing about it — and the block, which ignores that floor on purpose
  // (§Z5 §M2), carried the free-time run in with it. The walk is still stated; the remainder is
  // the transition, not an afternoon.
  it('says nothing about what is left when a walk eats nearly all of the hole', () => {
    travelSeconds = (GAP_MINUTES - 5) * 60;
    show();
    expect(document.querySelector('.day-trv')).toBeTruthy();
    expect(document.querySelector('.day-gap')).toBeNull();
    expect(screen.queryByText(freeTimePhrase(5)!)).toBeNull();
  });

  it('states it again once what is left is a slice somebody could spend', () => {
    // Exactly at the floor, which is now measured after the buffer as well as the walk — the
    // fixture states the intent (fifteen minutes left) rather than a literal duration.
    travelSeconds = (GAP_MINUTES - 15) * 60 - TRAVEL_BUFFER_SECONDS;
    show();
    expect(screen.getByText(freeTimePhrase(15)!)).toBeTruthy();
  });

  // A place-lite row (ADR-0147) has no coordinates, so there is no leg to ask about — the same
  // absence, reached a different way.
  it('falls back when a row has no coordinates to measure from', () => {
    tripPlaces = places.map((p) =>
      p.id === 'p-lunch' ? { ...p, lat: undefined, lng: undefined } : p,
    );
    show();
    expect(screen.getByText(freeTimePhrase(GAP_MINUTES)!)).toBeTruthy();
    expect(document.querySelector('.day-trv')).toBeNull();
  });
});

describe('DayView — the four arms of a journey (ADR-0206 §V1.3/§V1.4)', () => {
  beforeEach(() => {
    resetOnWayForTests();
    tripEvents = [lunch, theatre];
    tripPlaces = places;
    travelSeconds = WALK_MINUTES * 60;
  });
  afterEach(() => {
    cleanup();
    resetOnWayForTests();
    setSimulatedNow(null);
  });

  /** The leave-by for the theatre leg, in ms — written out through the shared buffer rather than
   *  hardcoded, so §D5's constant stays the one source of it. */
  const leaveByMs =
    Date.parse(theatre.startsAt!) - (WALK_MINUTES * 60 + TRAVEL_BUFFER_SECONDS) * 1000;
  const block = () => document.querySelector('.day-trv');
  /** **Scoped to the block, because the event CARD carries a `בדרך` of its own** (ADR-0161) and an
   *  unscoped query matches both — which is how an assertion here would pass on the card's button
   *  while the block's was missing entirely. */
  const blockAction = (label: string) =>
    [...(block()?.querySelectorAll('button') ?? [])].find((b) => b.textContent?.includes(label));

  // **The row says BOTH clocks since ADR-0206 §AR1** — the departure and where it lands — because a
  // lone departure is an instruction with its reasoning withheld. The arrival is `leaveByMs` plus
  // the leg, which is §D5's buffer before the theatre's own start: derived here rather than written
  // out, so the buffer stays one constant and not a number this file also believes.
  it('states the leave-by as a NOUN, because a day list is a schedule and not an instruction', () => {
    setSimulatedNow(Date.parse(NOW));
    show();
    const clock = ltrIsolate(formatTime(new Date(leaveByMs), ZONE));
    const at = ltrIsolate(`~${formatTime(new Date(leaveByMs + WALK_MINUTES * 60_000), ZONE)}`);
    // **`עד`, because this leave-by is a ceiling** (owner, 2026-08-31). The buffered instant
    // fits inside the hole here, so nothing clamped it and `leaveByIsFloor` is false — see the
    // sibling case below, which is the arm that keeps the bare noun.
    expect(screen.getByText(t.travel.leaveByThenArrive(clock, at))).toBeTruthy();
    // …and never the hero's imperative, which speaks to the one journey you are on.
    expect(screen.queryByText(t.travel.leaveAt(clock))).toBeNull();
    expect(screen.queryByText(t.travel.leaveByDay(clock))).toBeNull();
  });

  // §V1.4 / §D7 — the single most actionable thing this data can say.
  it('marks the live hole --miss once its leave-by has gone by', () => {
    setSimulatedNow(leaveByMs + 10 * 60_000);
    show();
    expect(document.querySelector('.day-trv.miss')).toBeTruthy();
    expect(
      screen.getByText(t.travel.leavePassed(ltrIsolate(formatTime(new Date(leaveByMs), ZONE)))),
    ).toBeTruthy();
    // The one control, where the question is actually asked (ADR-0207 §7 / §Z5 §M4).
    expect(blockAction(t.actions.onWay)).toBeTruthy();
  });

  // **The arm the ADR did not name.** Every leave-by of a finished day has gone by, so without a
  // `PAST` arm a day read in the evening prints `זמן היציאה עבר` on every hole of it.
  it('says nothing about leaving once the row below has started', () => {
    setSimulatedNow(Date.parse(theatre.startsAt!) + 60_000);
    show();
    expect(block()).toBeTruthy();
    expect(document.querySelector('.day-trv.miss')).toBeNull();
    expect(blockAction(t.actions.onWay)).toBeUndefined();
    // …and it keeps the correction, because that is a measurement and not advice.
    expect(screen.getByText(freeTimePhrase(freeAfterWalk)!)).toBeTruthy();
    expect(block()!.textContent).not.toContain('יציאה');
  });

  // `בדרך` withdraws the mark on every elevation at once, because all three read `lib/on-way.ts`.
  it('turns teal and offers the way back once somebody says בדרך', () => {
    setSimulatedNow(leaveByMs + 10 * 60_000);
    markOnWay('t1', theatre.id);
    show();
    expect(document.querySelector('.day-trv.on-way')).toBeTruthy();
    expect(document.querySelector('.day-trv.miss')).toBeNull();
    expect(blockAction(t.actions.undoSettle)).toBeTruthy();
  });

  // ── ADR-0208 §2 — THE REPORT THIS SURFACE INHERITS ──────────────────────────────────────
  //
  // **THE FIXTURE'S SHAPE IS THE POINT, and the first version of it proved nothing.** With only
  // `lunch` and `theatre`, skipping `lunch` leaves ONE row and therefore no hole at all — a
  // fixture built from the rule rather than from the report, which is exactly how #710 shipped
  // green and fixed nothing. The reported shape has a row BEFORE the skip: the day list drops a
  // skipped event (ADR-0027's parking lot), so the hole is silently measured from the earlier row
  // — the longer, staler leg ADR-0208 §2 refuses in as many words, because a longer leg is an
  // earlier leave-by is a more confident late mark.
  it('withdraws the leave-by and the mark when the plan’s claim was skipped', () => {
    setSimulatedNow(leaveByMs + 10 * 60_000);
    tripEvents = [morning, { ...lunch, status: EVENT_STATUS.SKIPPED }, theatre];
    show();
    // The block is still there and still measures the hole: §V1.1's correction is a fact about the
    // plan, not a claim about the traveller, so a denial does not take it away.
    expect(block()).toBeTruthy();
    expect(block()!.textContent).toContain(t.travelMode[derivedMode()]);
    // …and the advice is gone: no leave-by, and above all no late mark derived from a walk out of
    // a place nobody went to.
    expect(document.querySelector('.day-trv.miss')).toBeNull();
    expect(block()!.textContent).not.toContain('יציאה');
    expect(blockAction(t.actions.onWay)).toBeUndefined();
  });

  // The control case, on the same three rows: nothing skipped, so the claim stands and the mark
  // is made. Without this the spec above would pass on a day that simply had no journey in it.
  it('…and still marks it late on the same three rows when nothing was skipped', () => {
    setSimulatedNow(leaveByMs + 10 * 60_000);
    tripEvents = [morning, lunch, theatre];
    show();
    expect(document.querySelector('.day-trv.miss')).toBeTruthy();
  });
});

// ── THE DAY'S FIRST LEG (ADR-0206 §AD) ────────────────────────────────────────────────────
//
// A journey block sits between two ROWS, and on a mid-stay day the hotel is ambient — off the
// day's schedule (ADR-0054) — so the first row has nothing above it and the walk out of the bed
// was the one leg the list could never draw. §AE3 named this as the first thing to reconcile.
describe('DayView — the walk out of the bed', () => {
  const hotelPlace: Place = {
    id: 'p-hotel',
    tripId: 't1',
    name: 'מלון',
    lat: 40.86,
    lng: 14.24,
    createdAt: `${DAY}T00:00:00Z`,
    updatedAt: `${DAY}T00:00:00Z`,
    updatedBy: 'u1',
  };
  /** A stay covering the night before and the night after, so this day is a strictly middle one:
   *  ambient in both directions, and the case no edge row can stand in for. */
  const stay = ev('stay', {
    title: 'מלון',
    category: 'lodging',
    placeId: 'p-hotel',
    date: '2026-08-01',
    endDate: '2026-08-05',
    startsAt: '2026-08-01T13:00:00Z',
    endsAt: '2026-08-05T09:00:00Z',
  });

  beforeEach(() => {
    setSimulatedNow(Date.parse(NOW));
    resetOnWayForTests();
    tripEvents = [stay, lunch, theatre];
    tripPlaces = [...places, hotelPlace];
    travelSeconds = 15 * 60;
  });
  afterEach(() => {
    cleanup();
    resetOnWayForTests();
    setSimulatedNow(null);
  });

  it('draws a journey above the day’s first row, and one back into it', () => {
    show();
    // **Three blocks since ADR-0209 §1**: out of the hotel, on to the theatre, and back to the
    // hotel — the return being the half of §AD that never existed, because that milestone only
    // built the leg OUT of the stay you woke in.
    expect(document.querySelectorAll('.day-trv')).toHaveLength(3);
  });

  // **AND THE RETURN SAYS SOMETHING** (ADR-0206 §AS1). The spec above counted three blocks and
  // never asked what the third one said — which is exactly how it shipped **silent at every hour
  // of every day**. It carried `bookend: true`, and that flag's one reader asks whether the
  // ORIGIN is a stay; here the stay is the DESTINATION, so the leg lost the departure instant it
  // should have taken from the theatre's own end, and with it the arrival.
  //
  // A stay's start edge is `not-before`, so there is no deadline to advise a departure against —
  // `הגעה` ALONE is the right sentence here, and §AJ2's distinction is what says so.
  it('states when you get back to the bed, off the last row’s own end', () => {
    show();
    const back = [...document.querySelectorAll('.day-trv-meta')].map((m) => m.textContent ?? '');
    const arriveAt = ltrIsolate(
      `~${formatTime(new Date(Date.parse(theatre.endsAt!) + 15 * 60_000), ZONE)}`,
    );
    expect(back).toContain(t.travel.arriveAt(arriveAt));
    // …and no departure, because a floor is not a deadline (§AI1) — not because it was withheld.
    expect(back.some((m) => m.includes('יציאה') && m.includes(arriveAt))).toBe(false);
  });

  // **The stay is named twice on a middle night, and that is the day's two ends** — which is what
  // ADR-0054's map amendment already decided a middle night is, and the band's single entry was
  // the thing that could not express it. Once each, not once here and once in the strip.
  it('names the stay as the day’s two ends, and not in the strip as well', () => {
    show();
    const staysNamed = [...document.querySelectorAll('.tr-title')].filter((el) =>
      el.textContent?.includes('מלון'),
    );
    expect(staysNamed).toHaveLength(2);
    expect(document.querySelector('.day-ambient .an')).toBeNull();
  });

  // …and neither row states a clock, which is what lets every leg stay an ordinary block (§3).
  it('states the stay’s bound and no clock of its own', () => {
    show();
    const row = document.querySelector('.transition-row')!;
    expect(row.querySelector('.tr-bound')).toBeTruthy();
    expect(row.querySelector('.tr-time')).toBeNull();
  });

  // **It says the journey and it does NOT say what is free.** A middle night has no check-out
  // instant, so there is no window to measure against — and reaching for the day window's dawn
  // instead would claim you could have left at 07:00 (ADR-0206 §AF3).
  it('states the journey and its leave-by, and claims no free time before it', () => {
    show();
    const first = document.querySelectorAll('.day-trv')[0]!;
    expect(first.textContent).toContain(t.travelMode[derivedMode()]);
    expect(first.textContent).toContain('15');
    expect(first.textContent).toContain('יציאה');
    expect(first.textContent).not.toContain('פנוי');
  });
});

// ── A DESTINATION WITH NO DEADLINE (ADR-0206 §AI1) ────────────────────────────────────────
//
// Read off ADR-0209's mockup by the owner, on shipped code: _"on check in day … it says that you're
// suggesting to leave before the previous stop is finished and ahead of time, getting to the hotel
// even before check in starts, even though you have enough time to just arrive later"_ — and then
// the half that would have shipped broken: _"we must make sure that if you haven't left by the time
// that the app suggests the app doesn't show you as being late."_
//
// `theatre` is given a check-in window here, so `edgeMeaning` answers `window` rather than `exact`.
// Everything else about the day is the file's own scenario.
describe('DayView — a leg into a window states an arrival, never a departure (§AI1)', () => {
  const windowed = { ...theatre, startWindowEnd: `${DAY}T19:00:00Z` };
  /** When you can go (lunch's end) plus the leg — never counted back from the window's opening. */
  const arrival = ltrIsolate(
    `~${formatTime(new Date(Date.parse(lunch.endsAt!) + WALK_MINUTES * 60_000), ZONE)}`,
  );

  beforeEach(() => {
    setSimulatedNow(Date.parse(NOW));
    resetOnWayForTests();
    tripEvents = [lunch, windowed];
    tripPlaces = places;
    travelSeconds = WALK_MINUTES * 60;
  });
  afterEach(() => {
    cleanup();
    resetOnWayForTests();
    setSimulatedNow(null);
  });

  it('offers no departure at all', () => {
    show();
    expect(document.querySelector('.day-trv')!.textContent).not.toContain('יציאה');
  });

  it('states when you will get there instead', () => {
    show();
    expect(screen.getByText(t.travel.arriveAt(arrival))).toBeTruthy();
  });

  // **The arm, not the sentence.** Past the leave-by the old arithmetic produced, the row must not
  // turn `--miss` — there is no deadline to have missed.
  it('never marks you late against a deadline it invented', () => {
    setSimulatedNow(Date.parse(theatre.startsAt!) - 10 * 60_000);
    show();
    expect(document.querySelector('.day-trv.miss')).toBeNull();
    expect(document.querySelector('.day-trv')!.textContent).not.toContain('עבר');
  });

  // …and the one warning nobody can currently be given at plan time.
  //
  // **The window has to shut BEFORE the walk lands, which constrains the fixture and not the
  // rule.** The first version of this spec stretched lunch to 18:40 to push the arrival late, and
  // that made lunch contain the check-in's own start — so the two clustered (ADR-0041) and there
  // was no leg at all. A window cannot close before it opens either (`schemas.ts` refuses it), so
  // the honest fixture moves the WINDOW early rather than the day late.
  it('says so when the day lands after the window has shut', () => {
    const shuts = ev('shuts', {
      title: 'צ׳ק-אין',
      kind: EVENT_KIND.HARD,
      placeId: 'p-theatre',
      startsAt: `${DAY}T13:30:00Z`,
      startWindowEnd: `${DAY}T13:45:00Z`,
      endsAt: `${DAY}T18:30:00Z`,
    });
    tripEvents = [lunch, shuts];
    show();
    // Lunch ends 13:20 and the walk is 40 minutes, so you reach it at 14:00 — fifteen minutes
    // after it shut.
    const late = ltrIsolate(
      `~${formatTime(new Date(Date.parse(lunch.endsAt!) + WALK_MINUTES * 60_000), ZONE)}`,
    );
    expect(screen.getByText(t.travel.arriveAfterClose(late))).toBeTruthy();
    expect(document.querySelector('.day-trv.miss')).toBeTruthy();
  });
});

// ── A HOLE TOO SHORT FOR A JOIN STILL HOLDS A LEG (ADR-0206 §AG6, finished) ────────────────
//
// §Z5 §M2's own example, and §AG6 recorded it as fixed by setting `DayBlockEntry.from` on every
// adjacency. It was **half** fixed: the leg was derived and then not rendered, because the render
// read `{join && <JoinRow/>}` and `gapBetween` is floored at `GAP_MIN_MINUTES`. **Plan mode gates
// on `prevEnd` instead and had been drawing it all along**, so the two day surfaces disagreed
// about a fact — what ADR-0159 §1 forbids and ADR-0171 §10e already repaired once.
describe('DayView — a 45-minute hole with a 40-minute walk is not silent', () => {
  const SHORT = 45;
  const tight = ev('tight', {
    title: 'תיאטרון',
    kind: EVENT_KIND.HARD,
    placeId: 'p-theatre',
    startsAt: `${DAY}T${String(13 + Math.floor((20 + SHORT) / 60)).padStart(2, '0')}:${String((20 + SHORT) % 60).padStart(2, '0')}:00Z`,
    endsAt: `${DAY}T18:30:00Z`,
  });

  beforeEach(() => {
    setSimulatedNow(Date.parse(NOW));
    resetOnWayForTests();
    tripEvents = [lunch, tight];
    tripPlaces = places;
    travelSeconds = WALK_MINUTES * 60;
  });
  afterEach(() => {
    cleanup();
    resetOnWayForTests();
    setSimulatedNow(null);
  });

  it('draws the journey even though the hole earns no gap join', () => {
    show();
    const block = document.querySelector('.day-trv');
    expect(block).toBeTruthy();
    expect(block!.textContent).toContain(t.travelMode[derivedMode()]);
  });

  // …and no free-time strip, because the hole earns no join and 5 minutes is not free time
  // anyway (§AH1's `statesFreeTime`). The walk is stated; the remainder is the transition.
  it('states the walk and not the remainder', () => {
    show();
    expect(document.querySelector('.day-gap')).toBeNull();
  });
});

// **WHAT BROUGHT YOU IN THROUGH THE NIGHT SORTS BEFORE THE BED** (ADR-0054's 2026-08-26
// amendment), reported off the deploy: a car collected at ⁦00:00⁩ after a late landing read BELOW
// the hotel row, so the day said "wake at the hotel, then drive ⁦25km⁩ out to the counter". The map
// has sorted that pickup ahead of the bed since 2026-08-25 (`broughtInOvernight`) — this was one
// fact answered two ways on two surfaces (ADR-0159 §1).
describe('DayView — a midnight pickup reads above the bed', () => {
  const hotelPlace: Place = {
    id: 'p-hotel',
    tripId: 't1',
    name: 'מלון',
    lat: 40.86,
    lng: 14.24,
    createdAt: `${DAY}T00:00:00Z`,
    updatedAt: `${DAY}T00:00:00Z`,
    updatedBy: 'u1',
  };
  /** Checked into the night before and out THIS morning — the edge day the report came from. */
  const stay = ev('stay', {
    title: 'Gissurarbúð 5',
    category: 'lodging',
    placeId: 'p-hotel',
    date: '2026-08-02',
    endDate: DAY,
    startsAt: '2026-08-02T13:00:00Z',
    endsAt: `${DAY}T09:00:00Z`,
  });
  /** A ten-day hire collected at midnight. The glyph is load-bearing: ADR-0162 makes a hire a
   *  HELD resource, so its start is the floor `מ-00:00` — a clock claiming no hour. */
  const hire = ev('hire', {
    title: 'Iceland Car Rental',
    category: 'transport',
    icon: '🚗',
    placeId: 'p-lunch',
    date: DAY,
    endDate: '2026-08-12',
    startsAt: `${DAY}T00:00:00Z`,
    endsAt: '2026-08-12T08:00:00Z',
  });

  beforeEach(() => {
    setSimulatedNow(Date.parse(NOW));
    resetOnWayForTests();
    tripEvents = [stay, hire, lunch, theatre];
    tripPlaces = [...places, hotelPlace];
    travelSeconds = 15 * 60;
  });
  afterEach(() => {
    cleanup();
    resetOnWayForTests();
    setSimulatedNow(null);
  });

  // RED against `main`, where the pickup row sat below the stay row.
  it('puts the pickup row above the stay row', () => {
    show();
    const rows = [...document.querySelectorAll('.day-list .transition-row')];
    const titles = rows.map((r) => r.querySelector('.tr-title')?.textContent ?? '');
    expect(titles.indexOf('Iceland Car Rental')).toBeGreaterThanOrEqual(0);
    expect(titles.indexOf('Iceland Car Rental')).toBeLessThan(titles.indexOf('Gissurarbúð 5'));
  });

  // **REVERSED by the owner (2026-08-28): the strip says the COUNT, and the row says the clock.**
  // This spec used to assert the opposite, and its reasoning was that falling back to the span
  // count would lose "the very clock the strip exists to say". What it did not weigh is that the
  // ROW below says that clock too — so the strip was not saying it, it was repeating it. Asked
  // directly, the owner: _"for consistency I'm voting no, same as hotel check in/check out days"_.
  //
  // The pair below is the whole point and neither half is enough alone: the count has to be in the
  // strip AND the transition word has to be out of it, or a fallback that merely reworded the
  // sentence would pass.
  it('says the day count in the strip, and leaves the pickup clock to the row', () => {
    show();
    const strip = document.querySelector('.day-ambient')?.textContent ?? '';
    expect(strip).toContain('Iceland Car Rental');
    expect(strip).not.toContain(t.glance.transition.carPickup);
    const rows = [...document.querySelectorAll('.day-list .transition-row')];
    const pickup = rows.find((r) => r.textContent?.includes(t.glance.transition.carPickup));
    expect(pickup).toBeTruthy();
  });

  // **AND THE DRIVE BETWEEN THEM** (owner, 2026-08-26: _"it should also show the way from the car
  // rental to the hotel, right?"_). This spec asserted the OPPOSITE six hours earlier, on
  // ADR-0054's reasoning that a leg into a check-in FLOOR had no deadline to measure against and
  // would read `אין זמן לדרך`. §AJ1 makes a floor a non-deadline, so the leg says `הגעה ~X` — the
  // refusal was a workaround for a bug rather than a decision.
  //
  // **The version it replaces was also vacuous**, which is the more useful lesson: it asked
  // `node.querySelector('.day-trv')` over the nodes between the two rows, and `querySelector` does
  // not match the node itself — so a `JourneyRow` sitting right there answered `null` and the
  // absence passed for a reason that had nothing to do with the absence.
  it('draws the drive from the pickup into the stay row', () => {
    show();
    const nodes = [...document.querySelectorAll('.day-list > *')];
    const idx = (text: string) => nodes.findIndex((n) => n.textContent?.includes(text));
    const pickup = idx('Iceland Car Rental');
    const stay = idx('Gissurarbúð 5');
    expect(pickup).toBeGreaterThanOrEqual(0);
    expect(stay).toBeGreaterThan(pickup);
    const between = nodes
      .slice(pickup + 1, stay)
      .filter((n) => n.classList.contains('day-trv') || n.querySelector('.day-trv'));
    expect(between).toHaveLength(1);
  });
});

// ── HOW FAR THE DAY GOES (ADR-0206 §V1.9 / §AP) ──────────────────────────────────────────
//
// The mixed-mode day is the case a naive build gets wrong in both directions, so it is the case
// with the most assertions here: a declared leg keeps its distance and has no duration (§AA4 /
// §AM6), which means the kilometres cover every leg and the minutes cover only the ones that
// could be timed. `PlanDay.travel.test.tsx` asserts the same line on the other day surface —
// ADR-0159 §1 forbids the two differing about a fact, and a total distance is one.
describe('DayView — the day says how far it goes (ADR-0206 §V1.9)', () => {
  const declaredLeg = (fromPlaceId: string, toPlaceId: string): TravelModeOverride => ({
    id: `tmo-${fromPlaceId}`,
    tripId: 't1',
    fromPlaceId,
    toPlaceId,
    mode: TRANSIT_LEG_MODE,
    createdBy: 'u1',
    createdAt: `${DAY}T00:00:00Z`,
    updatedAt: `${DAY}T00:00:00Z`,
  });
  /** The mocked estimate's own distance, so this file and the seam it stubs cannot disagree. */
  const ROUTED_M = 2400;
  const line = () => document.querySelector('.day-total')!;

  beforeEach(() => {
    setSimulatedNow(Date.parse(NOW));
    resetOnWayForTests();
    tripEvents = [morning, lunch, theatre];
    tripPlaces = places;
    travelSeconds = WALK_MINUTES * 60;
    travelAsks.length = 0;
  });
  afterEach(() => {
    cleanup();
    resetOnWayForTests();
    setSimulatedNow(null);
  });

  it('states the distance and the hedged duration for a day that is all one mode', () => {
    show();
    expect(line().textContent).toBe(
      t.travel.dayTotal(formatDistance(ROUTED_M * 2), approxTravelTime(WALK_MINUTES * 2 * 60)!),
    );
  });

  // **The crux.** Both halves are derived here the way the code derives them rather than written
  // out, so a fixture that moves moves the expectation with it.
  it('counts a declared leg in the kilometres and not in the minutes', () => {
    tripOverrides = [declaredLeg('p-lunch', 'p-theatre')];
    show();
    const crow = Math.round(haversineMeters(coordOf('p-lunch'), coordOf('p-theatre')));
    // **`לפחות`, because a declared leg's kilometres are the crow rather than the road** (§AZ3).
    expect(line().textContent).toBe(
      t.travel.dayTotalFloor(
        t.travel.dayTotal(formatDistance(ROUTED_M + crow), approxTravelTime(WALK_MINUTES * 60)!),
      ),
    );
    // Asserted as an absence too, because the failure this guards is a plausible-looking line:
    // the declared leg's minutes must not have been invented from its walking estimate.
    expect(line().textContent).not.toContain(String(WALK_MINUTES * 2));
  });

  // §AA4's own day: real kilometres, and no duration this app may state.
  it('states a distance alone when every leg was declared', () => {
    tripOverrides = [declaredLeg('p-morning', 'p-lunch'), declaredLeg('p-lunch', 'p-theatre')];
    show();
    const crow =
      Math.round(haversineMeters(coordOf('p-morning'), coordOf('p-lunch'))) +
      Math.round(haversineMeters(coordOf('p-lunch'), coordOf('p-theatre')));
    expect(line().textContent).toBe(t.travel.dayTotalFloor(formatDistance(crow)));
  });

  // **A day nothing routed still travels, and now says so as a FLOOR** (§AZ2/§AZ3). The rows
  // carry crow-flies kilometres rather than nothing, so the header counts what the list shows
  // (§AP2) — with `לפחות` over it, because every one of those numbers is a floor, and with no
  // minutes at all, because no duration was measured and none may be invented (§D4/§D5).
  it('states the crow-flies floor when nothing on the day is routable', () => {
    travelSeconds = null;
    show();
    const total = document.querySelector('.day-total');
    expect(total).not.toBeNull();
    expect(total!.textContent).toContain('לפחות');
    expect(total!.textContent).not.toContain('~');
  });

  // **The other exit criterion, asserted rather than eyeballed.** The total is a roll-up of the
  // journeys the rows already drew, so it must ask for nothing: one `useDayTravel` fingerprint
  // for the whole screen, the legs' own stops, and no request leaving by any other route.
  it('adds no request of its own', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    try {
      show();
      expect(line()).toBeTruthy();
      const fingerprints = new Set(travelAsks.map((ask) => JSON.stringify(ask.stops)));
      expect(fingerprints.size).toBe(1);
      // The three rows' two legs, consecutive and deduped — exactly what the ROWS need, with no
      // stop added for the total.
      expect(travelAsks[0]!.stops).toEqual([
        coordOf('p-morning'),
        coordOf('p-lunch'),
        coordOf('p-theatre'),
      ]);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

// **THE BLOCK'S CLOCK READS IN THE LEG'S OWN ZONE, NOT THE TRIP'S** (ADR-0206 §AQ1).
//
// The field report: a Georgia trip (UTC+4) whose stops were all in Israel (UTC+3). The card read
// `20:00–21:00` and the row above it advised `יציאה 20:31` — a departure after the arrival it was
// counted back from. One instant, two zones: this screen handed `JoinRow` `trip.timezone`, the zone
// the trip is FILED under, while every other clock on it reads through the itinerary's own.
//
// Asserted HERE and not only in `ui/domain/DayJoinRow.zones.test.tsx` because what was wrong was
// the wiring, not the component: the row rendered exactly what it was given. This is
// `frontend/CLAUDE.md`'s named anti-pattern in its other direction — a screen handing a shared
// component the wrong argument, with every unit around it green.
describe('DayView — a journey states its hours where the traveller is (ADR-0206 §AQ1)', () => {
  /** The reported shape: the trip is filed under one zone and every stop on it is in another.
   *  `ZONE` is this file's trip primary (Rome, UTC+2) and the stops sit two hours behind it.
   *
   *  **The DIRECTION is the fixture's whole point.** On the real trip the primary was AHEAD of the
   *  stops (Georgia UTC+4, Israel UTC+3), which is what pushed the printed departure past the hour
   *  the destination card named. A primary BEHIND the stops is the same defect and reads as merely
   *  early — true, unalarming, and the reason nobody caught it sooner. */
  const STOPS_ARE_IN = 'Atlantic/Reykjavik';

  beforeEach(() => {
    resetOnWayForTests();
    tripEvents = [lunch, theatre];
    tripPlaces = places.map((p) => ({ ...p, timezone: STOPS_ARE_IN }));
    travelSeconds = WALK_MINUTES * 60;
  });
  afterEach(() => {
    cleanup();
    resetOnWayForTests();
    setSimulatedNow(null);
  });

  const leaveByMs =
    Date.parse(theatre.startsAt!) - (WALK_MINUTES * 60 + TRAVEL_BUFFER_SECONDS) * 1000;

  it('states the departure in the stops’ zone, and never in the trip’s', () => {
    setSimulatedNow(Date.parse(NOW));
    show();
    // `leaveByThenArrive` since 2026-08-31: the buffered instant fits, so it is a ceiling.
    const inZone = (zone: string) =>
      t.travel.leaveByThenArrive(
        ltrIsolate(formatTime(new Date(leaveByMs), zone)),
        ltrIsolate(`~${formatTime(new Date(leaveByMs + WALK_MINUTES * 60_000), zone)}`),
      );
    expect(screen.getByText(inZone(STOPS_ARE_IN))).toBeTruthy();
    // **The hour the defect printed** — `trip.timezone`, which is what this screen handed the row
    // until §AQ1. Asserted as absent rather than merely "the right one is present", because the
    // two differ by exactly the offset and a spec that only checked the positive would pass on a
    // single-zone trip and say nothing about this one.
    expect(screen.queryByText(inZone(ZONE))).toBeNull();
  });

  // **The invariant, read off the screen the way the report was.** Whatever the block says about
  // leaving must be earlier than the hour the destination card beside it prints — and both are read
  // in the zone that card is in, which is the whole of what went wrong.
  it('never advises leaving after the hour the destination card names', () => {
    setSimulatedNow(Date.parse(NOW));
    show();
    const meta = document.querySelector('.day-trv-meta')?.textContent ?? '';
    const stated = /(\d{2}):(\d{2})/.exec(withoutBidiControls(meta))!;
    const starts = /(\d{2}):(\d{2})/.exec(formatTime(new Date(theatre.startsAt!), STOPS_ARE_IN))!;
    const mins = (m: RegExpExecArray) => Number(m[1]) * 60 + Number(m[2]);
    expect(mins(stated)).toBeLessThan(mins(starts));
  });
});

// **AN INFEASIBLE LEG EARNS THE MARK TOO** (ADR-0206 §AQ3).
//
// `dayJourney` answers `OVERRUNS` before it ever looks at `onWay`, and this screen's control was
// keyed on `PASSED` — so on a leg that does not fit, the day offered a shortfall and no way at all
// to say you had set off. That is the leg where saying so matters most: there was never a leave-by
// to pass, so the clock can never make the offer, and the hero (which has no `OVERRUNS` arm) was
// offering `בדרך` on the same leg at the same moment.
describe('DayView — a leg that does not fit can still be answered (ADR-0206 §AQ3)', () => {
  beforeEach(() => {
    resetOnWayForTests();
    // A hole far too short for the walk in it, so the block takes the `OVERRUNS` arm.
    tripEvents = [{ ...lunch, endsAt: `${DAY}T15:50:00Z` }, theatre];
    tripPlaces = places;
    travelSeconds = WALK_MINUTES * 60;
  });
  afterEach(() => {
    cleanup();
    resetOnWayForTests();
    setSimulatedNow(null);
  });

  const block = () => document.querySelector('.day-trv');
  const blockAction = (label: string) =>
    [...(block()?.querySelectorAll('button') ?? [])].find((b) => b.textContent?.includes(label));

  it('offers the mark on the shortfall arm, and takes it back once set', () => {
    setSimulatedNow(Date.parse(`${DAY}T15:45:00Z`));
    show();
    // The arm, so this cannot pass by the leg quietly becoming feasible.
    expect(document.querySelector('.day-trv.miss')).toBeTruthy();
    expect(blockAction(t.actions.onWay)).toBeTruthy();

    fireEvent.click(blockAction(t.actions.onWay)!);
    cleanup();
    markOnWay('t1', theatre.id); // the verb is mocked at this seam; the store is the real one
    show();
    // **The undo has to survive the arm staying `OVERRUNS`** — which is the half that was missing:
    // the old control looked for `ON_WAY`, an arm a leg that does not fit can never reach.
    expect(blockAction(t.actions.undoSettle)).toBeTruthy();
    expect(blockAction(t.actions.onWay)).toBeFalsy();
  });

  // The shortfall is still true once you are moving, so the mark withdraws the NUDGE and not the
  // warning — a row that went quiet about a leg that does not fit would be the opposite of §D7.
  it('keeps saying the shortfall while the mark is set', () => {
    markOnWay('t1', theatre.id);
    setSimulatedNow(Date.parse(`${DAY}T15:45:00Z`));
    show();
    expect(document.querySelector('.day-trv.miss')).toBeTruthy();
  });
});

// ── A CARRIED LEG IS A LINE THAT IS ALSO A COMMITMENT (ADR-0212) ──────────────────────────────
//
// What is only observable HERE is that the screen connects the derivations to the rows: that the
// thread wraps the row a flight renders as and not the row a hire renders as, that the card
// states a distance nobody hedged, and that the day's two totals stay apart. The arithmetic is
// `carriedLegMeters`' own spec in `@waypoint/shared`, and the component's contract is
// `DayTravelTotal.test.tsx`; neither can see the wiring.
//
// The GEOMETRY is not asserted (jsdom loads no CSS) — the alignment measurements are in the PR.
describe('DayView — a carried leg rides the day thread (ADR-0212)', () => {
  const TLV = { lat: 32.0114, lng: 34.8867 };
  const KEF = { lat: 63.985, lng: -22.6056 };
  const airport = (id: string, name: string, at: { lat: number; lng: number }): Place => ({
    id,
    tripId: 't1',
    name,
    lat: at.lat,
    lng: at.lng,
    createdAt: `${DAY}T00:00:00Z`,
    updatedAt: `${DAY}T00:00:00Z`,
    updatedBy: 'u1',
  });

  const flightEvent = ev('flight', {
    title: 'נתב״ג ← קפלאוויק',
    kind: EVENT_KIND.HARD,
    bookingId: 'b-flight',
    startsAt: `${DAY}T06:00:00Z`,
    endsAt: `${DAY}T10:20:00Z`,
  });

  const booking = (type: Booking['type']): Booking =>
    ({
      id: 'b-flight',
      tripId: 't1',
      type,
      title: 'נתב״ג ← קפלאוויק',
      fromPlaceId: 'p-tlv',
      toPlaceId: 'p-kef',
      createdAt: `${DAY}T00:00:00Z`,
      updatedAt: `${DAY}T00:00:00Z`,
      updatedBy: 'u1',
    }) as Booking;

  const legMetres = haversineMeters(TLV, KEF);

  const setUp = (type: Booking['type']) => {
    tripPlaces = [...places, airport('p-tlv', 'נתב״ג', TLV), airport('p-kef', 'קפלאוויק', KEF)];
    tripEvents = [flightEvent, lunch, theatre];
    tripBookings.length = 0;
    tripBookings.push(booking(type));
  };

  afterEach(() => {
    tripPlaces = places;
    tripEvents = [];
    tripBookings.length = 0;
  });

  it('wraps the flight row in the thread', () => {
    setUp('flight');
    const { container } = show();
    const thread = container.querySelector('.day-thread');
    expect(thread).toBeTruthy();
    // The CARD is inside it and keeps its box — ADR-0210 §1 reserved that for commitments, and
    // this is the strongest one the day holds. A thread that replaced the card would pass a
    // "the thread exists" assertion just as happily.
    expect(thread!.querySelector('.wp-event')).toBeTruthy();
  });

  // **The hire is why the predicate is `spendsSpanInMotion` and not `carriesRoute`.** It has two
  // endpoints and a route title, so every route-shaped test passes for it — and its span is a
  // parked car, so threading it would draw a line through a counter you walked to.
  it('does NOT thread a car hire, which carries a route and does not carry you', () => {
    setUp('car');
    const { container } = show();
    expect(container.querySelector('.day-thread')).toBeNull();
  });

  // §Context 4: the duration beside it is authored and so is this, so neither is hedged. An
  // asserted absence, because a `~` here would render a perfectly plausible-looking row.
  it('states the distance on the card, with no hedge on it', () => {
    setUp('flight');
    const { container } = show();
    const distance = container.querySelector('.wp-event-dist');
    expect(distance).toBeTruthy();
    expect(withoutBidiControls(distance!.textContent!)).toBe(
      withoutBidiControls(formatDistance(legMetres)),
    );
    expect(distance!.textContent).not.toContain('~');
  });

  it('gives a hire no distance either', () => {
    setUp('car');
    const { container } = show();
    expect(container.querySelector('.wp-event-dist')).toBeNull();
  });

  // §3 — the separation is the claim, so the spec is what the two numbers do to each other.
  it('keeps the air half out of the ground half of the day total', () => {
    setUp('flight');
    travelSeconds = WALK_MINUTES * 60;
    const { container } = show();
    const total = container.querySelector('.day-total')!.textContent ?? '';
    expect(withoutBidiControls(total)).toContain(withoutBidiControls(formatDistance(legMetres)));
    // The ground half is the walk the double reports (2400 m), and the combined number — the
    // defect this rule exists to prevent — must appear nowhere.
    expect(withoutBidiControls(total)).not.toContain(
      withoutBidiControls(formatDistance(legMetres + 2400)),
    );
    travelSeconds = null;
  });
});

// ── WHERE THE MOMENT IS, ON THE REAL SCREEN (ADR-0217 §1/§2/§3/§4) ────────────────────────
//
// **These live in this file because the harness does, and that is the whole reason.** The
// placement is pure and tested exhaustively without a renderer (`lib/now-inside.test.ts`,
// `lib/now-line.test.ts`); the mark's own two forms are tested with hand-built props
// (`ui/domain/NowMarker.test.tsx`). What is only observable HERE is that the screen connects
// one to the other over the day's real rows — and the day surface needs ~110 lines of
// `vi.mock` to render at all, so a second copy of that would be exactly the duplication root
// rule 8 forbids. `docs/backlog.md` carries the line to extract it when a third spec wants it.
//
// This is also the coverage gap that let the whole marker be replaced with a green suite: the
// day surfaces asserted nothing about it, in either scope.
// ── AND THE SLOT READS IN THE CLOCK THE DAY IS READ IN (2026-09-05) ─────────────────────────
//
// Reported with a screenshot: the strip counted `44 דק׳ פנויות` to a `יציאה עד 17:46`, and the
// sheet its `＋` opened was headed `18:05 – 18:45` — an hour on, straight through the ⁦18:00⁩ row
// below. **Not the countdown**: every wall clock a slot carries is built in `trip.timezone`,
// which ADR-0206 §AQ already had to take away from the journey block for this exact reason —
// _"the zone the trip is FILED under and not the one anybody on it is reading a watch in"_. Same
// defect, one row down, and it was there before the slot ever moved with the clock.
describe('DayView · a slot on a trip filed an hour off its stops', () => {
  /** The places resolve to Rome, so the day is READ in Rome; the trip is filed in Kyiv, an hour
   *  on. Every clock in the screenshot came from one of these two. */
  const FILED = 'Europe/Kyiv';
  beforeEach(() => {
    tripEvents = [lunch, theatre];
    tripPlaces = places.map((p) => ({ ...p, timezone: ZONE }));
    tripTimezone = FILED;
    travelSeconds = WALK_MINUTES * 60;
  });
  afterEach(() => {
    cleanup();
    tripPlaces = places;
    tripTimezone = ZONE;
    travelSeconds = null;
    setSimulatedNow(null);
  });

  it('offers the fill in the same clock the rows are printed in', () => {
    setSimulatedNow(Date.parse(`${DAY}T14:00:00Z`));
    const { container } = show();
    fireEvent.click(container.querySelector('.day-swipe > .day-page button.day-gap')!);
    // ⁦14:00⁩ UTC is ⁦16:00⁩ in Rome and ⁦17:00⁩ in Kyiv. The day prints Rome on every other row.
    expect(screen.getByText(t.slotFill.gapTitle(clockRange('16:00', '17:00')))).toBeTruthy();
    // The filed clock, which is what it printed: `17:00 – 18:00`, through the row below.
    expect(screen.queryByText(t.slotFill.gapTitle(clockRange('17:00', '18:00')))).toBeNull();
  });

  // The half that reaches the data: a pick writes `zonedIso(block.date, block.start, …)`, so a
  // slot built in one zone and written in another lands an hour from where it was offered.
  it('states the free time and the window against the same two clocks', () => {
    setSimulatedNow(Date.parse(`${DAY}T14:00:00Z`));
    const { container } = show();
    // ⁦75⁩ minutes to the ⁦15:15⁩ UTC departure — a count of instants, so it was never the bug,
    // and it has to keep agreeing with the window the strip's own `＋` opens.
    expect(container.querySelector('.day-swipe > .day-page .day-gap-lbl')!.textContent).toBe(
      freeTimePhrase(75)!,
    );
  });
});

describe('DayView · where the moment is', () => {
  /** Inside `lunch` (⁦11:00–13:20⁩ UTC): ⁦12:00⁩ is ⁦60⁩ of its ⁦140⁩ minutes in. */
  const INSIDE_LUNCH = `${DAY}T12:00:00Z`;

  beforeEach(() => {
    resetOnWayForTests();
    tripEvents = [morning, lunch, theatre];
    tripPlaces = places;
    travelSeconds = null;
  });
  afterEach(() => {
    cleanup();
    resetOnWayForTests();
    setSimulatedNow(null);
  });

  it('nails the mark to the row the moment is inside, not above it', () => {
    setSimulatedNow(Date.parse(INSIDE_LUNCH));
    const { container } = show();
    // `> .day-page` and not a descendant selector: a peek pane holds a whole day surface, so
    // `.now-here` exists three times over while one is mounted (`frontend/CLAUDE.md`).
    const marks = container.querySelectorAll('.day-swipe > .day-page .now-here');
    expect(marks).toHaveLength(1);
    const mark = marks[0];
    // The row is INSIDE the mark — which is the entire report — and it is the running one.
    expect(mark.querySelector('.wp-event')).toBeTruthy();
    expect(mark.textContent).toContain(lunch.title);
    expect(mark.classList.contains('edge')).toBe(false);
    // 60/140 of the way through, read off the derivation rather than restated here.
    expect(mark.getAttribute('style')).toContain(`--thru: ${(60 / 140) * 100}%`);
  });

  it('says what is LEFT of the running row instead of how long it is', () => {
    setSimulatedNow(Date.parse(INSIDE_LUNCH));
    const { container } = show();
    const left = container.querySelector('.day-swipe > .day-page .wp-event-left')!;
    expect(left).toBeTruthy();
    // 80 minutes remain of 140; the total must not also be printed on that row.
    expect(withoutBidiControls(left.textContent ?? '')).toBe(
      withoutBidiControls(remainingPhrase(80 * 60_000)!),
    );
    const runningRow = container.querySelector('.day-swipe > .day-page .now-here .wp-event')!;
    expect(withoutBidiControls(runningRow.textContent ?? '')).not.toContain(
      withoutBidiControls(hoursPhrase(140)),
    );
  });

  it('falls back to a boundary mark in a hole no row holds', () => {
    // ⁦14:00⁩ is in the ⁦13:20–16:00⁩ hole, which draws a join — so the mark is nailed to it.
    setSimulatedNow(Date.parse(`${DAY}T14:00:00Z`));
    const { container } = show();
    const mark = container.querySelector('.day-swipe > .day-page .now-here')!;
    expect(mark).toBeTruthy();
    expect(mark.querySelector('.wp-event')).toBeNull();
    expect(container.querySelector('.day-swipe > .day-page .wp-event-left')).toBeNull();
  });

  // The boundary form, and it says the time — which the NAILED form deliberately does not
  // (ADR-0217 §1, amended 2026-09-02: at a boundary no row carries the word, so the mark
  // carries it). The label comes from this screen's own `formatTime`, so the assertion is
  // that the day surface hands the mark a formatted clock rather than an instant.
  it('is a boundary mark carrying the clock before the day has started', () => {
    setSimulatedNow(Date.parse(`${DAY}T05:00:00Z`));
    const { container } = show();
    const marks = container.querySelectorAll('.day-swipe > .day-page .now-here');
    expect(marks).toHaveLength(1);
    expect(marks[0].classList.contains('edge')).toBe(true);
    expect(marks[0].querySelector('.wp-event')).toBeNull();
    // `ZONE` is UTC+2, so a UTC ⁦05:00⁩ reads ⁦07:00⁩ — which is the point rather than
    // an inconvenience: the mark takes a FORMATTED label (ADR-0213 §11's reason), so what is
    // asserted here is that the surface formats it in the trip's zone and not in UTC.
    expect(marks[0].querySelector('.nowline-chip')!.textContent).toBe('07:00');
  });

  // `frontend/CLAUDE.md`: assert across BOTH day scopes on a day-scoped surface. A past or
  // future day has no "now" at all (ADR-0043 §1/§4), and the mark must be absent rather than
  // clamped to an edge.
  it('draws no mark at all on a day that is not today', () => {
    setSimulatedNow(Date.parse(`2026-08-05T12:00:00Z`));
    const { container } = show();
    expect(container.querySelector('.day-swipe > .day-page .now-here')).toBeNull();
    expect(container.querySelector('.day-swipe > .day-page .wp-event-left')).toBeNull();
  });

  // ── A HOLE IS TWO ROWS (the 2026-09-04 amendment) ──────────────────────────────────────
  //
  // **The reported defect, and it is only visible at this altitude.** `--thru` is a fraction of
  // the marked box's height, and a hole with a journey in it draws TWO — the free time, then the
  // drive out of it. Wrapping the pair put the arrow ⁦56%⁩ down the sum of them and struck the
  // drive three and three-quarter hours before its own `יציאה עד`. The placement is asserted
  // pure in `lib/now-line.test.ts`; what only this file can say is WHICH BOX the screen wrapped,
  // and jsdom can see that even though it can see no geometry at all.
  describe('in a hole with a journey in it', () => {
    /** The ⁦2:40⁩ hole between `lunch` and `theatre`, with the file's own ⁦40⁩-minute walk in it:
     *  ⁦1:55⁩ free, then a departure at ⁦15:15⁩ UTC and a ⁦16:00⁩ arrival. */
    const LEAVE_BY = `${DAY}T15:15:00Z`;
    beforeEach(() => {
      travelSeconds = WALK_MINUTES * 60;
    });
    afterEach(() => {
      travelSeconds = null;
    });

    const marks = (container: HTMLElement) =>
      container.querySelectorAll('.day-swipe > .day-page .now-here');

    it('nails the mark to the FREE TIME while the departure is still ahead', () => {
      setSimulatedNow(Date.parse(`${DAY}T14:00:00Z`));
      const { container } = show();
      expect(marks(container)).toHaveLength(1);
      const mark = marks(container)[0];
      // The strip is inside the mark and the block is NOT — stated as two clauses, because a
      // mark wrapping both satisfies the first on its own, which is exactly what shipped.
      expect(mark.querySelector('.day-gap')).toBeTruthy();
      expect(mark.querySelector('.day-trv')).toBeNull();
      // 40 of the 115 free minutes, measured over the FREE TIME and not over the hole.
      expect(mark.getAttribute('style')).toContain(`--thru: ${(40 / freeAfterWalk) * 100}%`);
    });

    it('hands the mark to the journey at the leave-by', () => {
      setSimulatedNow(Date.parse(LEAVE_BY) + 15 * 60_000);
      const { container } = show();
      expect(marks(container)).toHaveLength(1);
      const mark = marks(container)[0];
      expect(mark.querySelector('.day-trv')).toBeTruthy();
      expect(mark.querySelector('.day-gap')).toBeNull();
      // 15 of the 45 minutes between the departure and the row below it — the walk plus §D5's
      // buffer, which is the whole of what the journey box is about.
      expect(mark.getAttribute('style')).toContain(
        `--thru: ${(15 / (WALK_MINUTES + TRAVEL_BUFFER_SECONDS / 60)) * 100}%`,
      );
    });

    // ── AND THE HOLE COUNTS DOWN WHILE YOU STAND IN IT (the 2026-09-05 amendment) ────────
    //
    // Reported with a screenshot at ⁦16:10⁩ of an ⁦08:00–16:46⁩ window: the strip still said
    // `8:46 שע׳ פנויות` — the length the hole had when nobody was in it — and the `＋` beside
    // it opened a sheet headed `08:00 – 09:00`, offering eight hours that had already gone.
    describe('and what is left of it', () => {
      /** ⁦14:00⁩ UTC — ⁦75⁩ minutes before the ⁦15:15⁩ departure, in a window that opened at ⁦13:20⁩. */
      const MID = `${DAY}T14:00:00Z`;
      const leftAtMid = Math.round(
        (Date.parse(theatre.startsAt!) -
          (WALK_MINUTES * 60 + TRAVEL_BUFFER_SECONDS) * 1000 -
          Date.parse(MID)) /
          60_000,
      );
      /** The hole this morning, which the clock is past — its own length, less the same walk. */
      const morningHole =
        Math.round((Date.parse(lunch.startsAt!) - Date.parse(morning.endsAt!)) / 60_000) -
        WALK_MINUTES -
        TRAVEL_BUFFER_SECONDS / 60;

      it('states what is LEFT, and leaves the hole behind us reading its own length', () => {
        setSimulatedNow(Date.parse(MID));
        const { container } = show();
        const labels = [...container.querySelectorAll('.day-swipe > .day-page .day-gap-lbl')];
        expect(labels).toHaveLength(2);
        expect(labels[1].textContent).toBe(freeTimePhrase(leftAtMid)!);
        // Not the window's planned length, which is what it said at every hour before this.
        expect(labels[1].textContent).not.toBe(freeTimePhrase(freeAfterWalk)!);
        // **And a hole behind you is untouched**: it is where you record the lunch you had at
        // ⁦12:00⁩, so clamping it would take backfilling away to fix a slot nobody is in.
        expect(labels[0].textContent).toBe(freeTimePhrase(morningHole)!);
      });

      // The half a corrected LABEL could never reach (§V1.1's own finding, at the other end):
      // the sheet's header, the block a pick writes and a new event's prefill all read the slot.
      it('opens the fill on the window that is left, not the one that has passed', () => {
        setSimulatedNow(Date.parse(MID));
        const { container } = show();
        const strips = container.querySelectorAll('.day-swipe > .day-page button.day-gap');
        fireEvent.click(strips[1]);
        // ⁦16:00⁩ local is ⁦14:00⁩ UTC in Rome — now, to the grid — never the ⁦15:20⁩ it opened at.
        expect(screen.getByText(t.slotFill.gapTitle(clockRange('16:00', '17:00')))).toBeTruthy();
        expect(screen.queryByText(t.slotFill.gapTitle(clockRange('15:20', '16:20')))).toBeNull();
      });

      // ADR-0217 §1's boundary form, in the one place a hole can leave the marker homeless: the
      // hole draws no row of its own, and the departure has not come. Same answer as the day's
      // edge legs — above the block, never inside it.
      it('stands the mark above the journey where the hole states no free time at all', () => {
        // A ⁦141⁩-minute walk leaves ⁦14⁩ free of the ⁦2:40⁩ hole — under the floor, so no strip —
        // and puts the departure at ⁦13:34⁩.
        travelSeconds = 141 * 60;
        setSimulatedNow(Date.parse(`${DAY}T13:25:00Z`));
        const { container } = show();
        expect(container.querySelector('.day-swipe > .day-page .day-gap')).toBeNull();
        const marks = container.querySelectorAll('.day-swipe > .day-page .now-here');
        expect(marks).toHaveLength(1);
        expect(marks[0].classList.contains('edge')).toBe(true);
        const blocks = [...container.querySelectorAll('.day-swipe > .day-page .day-trv')];
        expect(
          marks[0].compareDocumentPosition(blocks[blocks.length - 1]) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
      });
    });

    // The owner's own exception (ADR-0207 §2): _"unless someone marked it as 'on the way'"_.
    it('hands it to the journey early once somebody says they are on the way', () => {
      setSimulatedNow(Date.parse(`${DAY}T14:00:00Z`));
      markOnWay('t1', theatre.id);
      const { container } = show();
      const mark = marks(container)[0];
      expect(mark.querySelector('.day-trv')).toBeTruthy();
      expect(mark.querySelector('.day-gap')).toBeNull();
    });
  });

  // ── AND SO ARE THE DAY'S TWO ENDS ──────────────────────────────────────────────────────
  //
  // The leg out of the bed you woke in has no join above it (ADR-0206 §AD), so it renders
  // outside the block loop and the boundary mark had one place against it: below. At ⁦05:00⁩
  // that says an ⁦07:47⁩ departure is behind us.
  describe('against the day’s first leg, which has no join above it', () => {
    const hotel = ev('hotel', {
      title: 'מלון',
      category: 'lodging',
      placeId: 'p-theatre',
      date: '2026-08-02',
      endDate: '2026-08-04',
    });
    beforeEach(() => {
      tripEvents = [hotel, morning, lunch, theatre];
      travelSeconds = 8 * 60;
    });
    afterEach(() => {
      travelSeconds = null;
    });

    /** The wake leg's own block: the FIRST `.day-trv` in the list, above every entry. */
    const wakeLeg = (container: HTMLElement) =>
      container.querySelector('.day-swipe > .day-page .day-list .day-trv')!;
    const mark = (container: HTMLElement) =>
      container.querySelector('.day-swipe > .day-page .now-here')!;

    it('stands ABOVE the leg while its departure is still ahead', () => {
      setSimulatedNow(Date.parse(`${DAY}T05:00:00Z`));
      const { container } = show();
      expect(mark(container).classList.contains('edge')).toBe(true);
      // Document order is the whole claim: below the leg, the same mark says the drive is done.
      expect(
        mark(container).compareDocumentPosition(wakeLeg(container)) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('is nailed inside the leg once it is under way', () => {
      // Leave by ⁦07:47⁩ (⁦08:00⁩ less the ⁦8⁩-minute walk and §D5's buffer), landing ⁦07:55⁩.
      setSimulatedNow(Date.parse(`${DAY}T07:51:00Z`));
      const { container } = show();
      expect(mark(container).classList.contains('edge')).toBe(false);
      expect(mark(container).querySelector('.day-trv')).toBeTruthy();
      expect(mark(container).getAttribute('style')).toContain(`--thru: ${(4 / 8) * 100}%`);
    });

    it('keeps its shipped place below the leg once that leg is behind us', () => {
      setSimulatedNow(Date.parse(`${DAY}T07:57:00Z`));
      const { container } = show();
      expect(mark(container).classList.contains('edge')).toBe(true);
      expect(
        mark(container).compareDocumentPosition(wakeLeg(container)) &
          Node.DOCUMENT_POSITION_PRECEDING,
      ).toBeTruthy();
    });
  });

  // ADR-0217 §4: once you have answered "we were there", "how far through" is not a question.
  it('lets a settled row keep its place and drops the mark out of it', () => {
    setSimulatedNow(Date.parse(INSIDE_LUNCH));
    tripEvents = [morning, { ...lunch, status: EVENT_STATUS.DONE }, theatre];
    const { container } = show();
    const marks = container.querySelectorAll('.day-swipe > .day-page .now-here');
    expect(marks).toHaveLength(1);
    // Nailed to nothing: the boundary form, and no countdown on a row we have answered for.
    expect(marks[0].querySelector('.wp-event')).toBeNull();
    expect(container.querySelector('.day-swipe > .day-page .wp-event-left')).toBeNull();
  });
});

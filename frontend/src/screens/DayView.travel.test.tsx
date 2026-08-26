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
import { cleanup, render, screen } from '@testing-library/react';
import {
  EVENT_KIND,
  EVENT_SOURCE,
  EVENT_STATUS,
  TRAVEL_BUFFER_SECONDS,
  TRAVEL_MODE,
  type Booking,
  type Place,
  type TravelEstimate,
  type TripEvent,
} from '@waypoint/shared';
import { setSimulatedNow } from '../lib/useClock';
import { freeTimePhrase } from '../lib/duration';
import { markOnWay, resetOnWayForTests } from '../lib/on-way';
import { ltrIsolate } from '../lib/bidi';
import { formatTime } from '../lib/time';
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

let tripEvents: TripEvent[] = [];
const tripBookings: Booking[] = [];
let tripPlaces: Place[] = places;

vi.mock('../state/trip-state', () => ({
  byStart: (a: TripEvent, b: TripEvent) =>
    Date.parse(a.startsAt ?? a.date) - Date.parse(b.startsAt ?? b.date),
  useTrip: () => ({
    documentAttachments: [],
    hostContexts: buildHostContextIndex(tripEvents, tripBookings),
    trip: { id: 't1', timezone: ZONE, startDate: DAY, endDate: '2026-08-05', updatedBy: 'u1' },
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
      primaryZone: ZONE,
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
vi.mock('../lib/travel', () => ({
  useDayTravel: () => ({
    estimateFor: (): TravelEstimate | null =>
      travelSeconds === null
        ? null
        : { mode: TRAVEL_MODE.WALKING, durationSeconds: travelSeconds, distanceMeters: 2400 },
  }),
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
 *  §D5's buffer is a constant and not a number this file also believes. */
const freeAfterWalk = GAP_MINUTES - WALK_MINUTES;

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
    // …and the strip comes AFTER the block: you leave at the end of the hole, so the journey is
    // the last thing in it and the free time is what precedes it.
    expect(block.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // §V1.3 — the day reads `place · journey · place`, which is what makes §V1.1 legible.
  it('names the journey between the two rows: the mode, the hedged duration and the leave-by', () => {
    show();
    expect(screen.getByText(t.travelMode[TRAVEL_MODE.WALKING])).toBeTruthy();
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

  // **§D4 — with no estimate the slot reads exactly as it read before this milestone.** Never a
  // pessimistic guess: the reader must not be able to tell "not computed" from "not computable",
  // and inventing a walk we did not measure fails that in the direction that costs an afternoon.
  it('falls back to the plain free-time strip when there is no estimate', () => {
    travelSeconds = null;
    show();
    expect(screen.getByText(freeTimePhrase(GAP_MINUTES)!)).toBeTruthy();
    expect(document.querySelector('.day-trv')).toBeNull();
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
    travelSeconds = (GAP_MINUTES - 15) * 60;
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

  it('states the leave-by as a NOUN, because a day list is a schedule and not an instruction', () => {
    setSimulatedNow(Date.parse(NOW));
    show();
    const clock = ltrIsolate(formatTime(new Date(leaveByMs), ZONE));
    expect(screen.getByText(t.travel.leaveAtDay(clock))).toBeTruthy();
    // …and never the hero's imperative, which speaks to the one journey you are on.
    expect(screen.queryByText(t.travel.leaveAt(clock))).toBeNull();
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
    expect(block()!.textContent).toContain(t.travelMode[TRAVEL_MODE.WALKING]);
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
    expect(first.textContent).toContain(t.travelMode[TRAVEL_MODE.WALKING]);
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
    expect(block!.textContent).toContain(t.travelMode[TRAVEL_MODE.WALKING]);
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

  // Green on `main` and a guard on the fix rather than a report: the strip's sentence comes from
  // the PLACED entry, and the entry moved buckets — so without `placedEdgeOf` it would fall back
  // to the span count (`יום 1 מתוך 11`), losing the very clock the strip exists to say.
  it('keeps the strip saying the pickup clock rather than the day count', () => {
    show();
    expect(document.querySelector('.day-ambient')?.textContent).toContain(
      t.glance.transition.carPickup,
    );
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

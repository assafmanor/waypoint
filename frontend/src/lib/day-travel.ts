// **THE DAY'S TRAVEL, AS BOTH DAY SURFACES READ IT** (ADR-0206 §V1.1 / §V1.3 / §V1.4).
//
// One hook, because `DayView` and `PlanDay` differ in **posture** and may not differ about a
// **fact** (ADR-0159 §1): Trip mode STATES what is free in a hole and Plan mode OFFERS it as a
// slot, and a release where the statement says ⁦2:00⁩ and the chip says ⁦2:40⁩ about the same hole
// is precisely the divergence `frontend/CLAUDE.md` names as having cost a release twice.
//
// **What it adds over `useDayTravel` and why that is a layer rather than a widening.** That hook
// (M5, ADR-0205 §7) is the CACHE: coordinates in, `TravelEstimate | null` out. What neither day
// surface has is the step before it — turning the day's ROWS into an ordered list of coordinates,
// which needs the place authority rule (`eventPlaceId`), the trip's derived mode, and the
// knowledge that the leg out of a flight starts at the airport it LANDS at. Doing that twice is
// how the two screens would start asking about different legs.
//
// Pure plumbing otherwise: it decides nothing about what a journey says. That is `dayJourney`'s
// (`lib/day-joins.ts`) and `JourneyBlock`'s.
import { useMemo, useRef, useState } from 'react';
import {
  carriedLegMeters,
  defaultLegTravelMode,
  derivedTravelMode,
  haversineMeters,
  exceedsTravelCeiling,
  isRoutableMode,
  legTravelMode,
  TRAVEL_MODE,
  type Booking,
  type LatLng,
  type LegTravelMode,
  type Place,
  type TravelEstimate,
  type TravelMode,
  type TravelModeOverride,
  type TripEvent,
} from '@waypoint/shared';
import { eventPlaceId } from './places';
import { useDayTravel } from './travel';

/** **A leg, as the day's rows name it** — the two rows either side of one hole. */
export interface DayLeg {
  from: TripEvent;
  to: TripEvent;
  /** **The ORIGIN is a stay, so it has no usable end instant** (ADR-0206 §AD, renamed in §AS).
   *
   *  A middle night's `endsAt` is a check-out days away, so reading it as this hole's departure
   *  measures a window from next Wednesday. Carried on the leg because it is a fact about the
   *  leg's shape, not about its event.
   *
   *  **It was called `bookend`, and that name is what broke it.** The day has three bookend legs —
   *  out of the bed, in off the overnight edge, and back into tonight's bed — and all three were
   *  marked `bookend: true`, because all three are. But the flag's one reader asks about the
   *  ORIGIN, and on the leg back into the bed the stay is the DESTINATION: its origin is an
   *  ordinary row with a perfectly good `endsAt`. So that leg lost its departure instant, and with
   *  it the arrival — silent on Trip mode at every hour of every day (§AS1). The name now states
   *  the fact it encodes, which is the one thing a writer cannot get wrong. */
  fromIsStay?: boolean;
  /** **Which END of a span this leg leaves from** (2026-08-26) — set only where the origin is a
   *  span EDGE rather than a whole row, which today means the overnight run above the bed: you
   *  collected the car at ⁦00:00⁩ and drove to the hotel.
   *
   *  It exists because the endpoint question inverts. `endpointPlaceId(from, 'leaving')` answers
   *  "where did this row leave you" and for transport that is the DESTINATION — right for a flight
   *  you got off, wrong for a hire you just picked up, whose place is its origin. A pickup and a
   *  return at the same counter hides this completely, which is exactly the trip it was found on. */
  fromEdge?: 'start' | 'end';
  /** **When this leg may leave**, where the origin's own `endsAt` is not it. A span's `endsAt` is
   *  its RETURN — ten days out on a car hire — so a leg off its pickup edge has to carry the edge's
   *  own placed instant or it measures the drive to the hotel from next week. */
  departAfterMs?: number;
}

/**
 * **The earliest instant this leg's journey could start**, or `undefined` where there is none.
 *
 * Three rules in one place, because there were **three copies of them** and a fourth was about to
 * be written (ADR-0206 §AJ3): the leg's own placed instant wins where it has one (a span edge's
 * pickup, §AS); a leg **out of a stay** has none, since a middle night's `endsAt` is a check-out
 * days away and reading it as this hole's departure measures a window from next Wednesday (§AF3);
 * otherwise it is the origin row's own end.
 *
 * It is exported because the BOARD needs it too, and that is the whole reason this exists as a
 * function: the hero built its leg without one and so never applied §AJ2's clamp, which is how it
 * came to say `6 דקות באיחור ליציאה` about a departure the day view — correctly — printed as
 * ⁦00:30⁩, the end of the event the traveller was sitting in (field report, 2026-08-27).
 */
export function legDepartAfterMs(leg: DayLeg): number | undefined {
  if (leg.departAfterMs !== undefined) return leg.departAfterMs;
  if (leg.fromIsStay) return undefined;
  const at = Date.parse(leg.from.endsAt ?? leg.from.startsAt ?? '');
  return Number.isFinite(at) ? at : undefined;
}

export interface DayTravelReads {
  /** The trip's DERIVED mode (§Z2) — the same read the Map and the hero make, off the same
   *  function, so one leg cannot be a drive on the canvas and a walk in the list.
   *
   *  **This is the trip's default, not any particular leg's**: ask `modeFor` for a leg, which
   *  since §AU2 is a distance-aware answer that this one is only the floor under. It stays exposed
   *  because the mode CONTROL needs to know which pick means "no override" — see
   *  `useLegModeControl`, which had to stop comparing against it. */
  mode: TravelMode;
  /**
   * **What mode THIS leg is** (ADR-0206 §AM) — the override where somebody set one, the derived
   * mode otherwise. A `LegTravelMode`, so it can answer `transit`, which no provider ever sees.
   */
  modeFor(from: TripEvent, to: TripEvent): LegTravelMode;
  /**
   * The estimate for the journey between two rows, or `null` — which is ordinary (§D4).
   *
   * **`null` for a DECLARED leg, always** (§AA4). A declared תחב״צ leg has no duration by nature:
   * the point of the declaration is silence where the app would otherwise print a walking number
   * for a journey nobody will walk. The block then reads the same way it does for any absent
   * estimate — §D4's distance and no time — which is why suppressing it here is the whole change
   * rather than a branch on every surface.
   */
  estimateFor(from: TripEvent, to: TripEvent): TravelEstimate | null;
  /**
   * **How far the leg covers, in metres** — the ROUTED distance where there is an estimate, and on
   * a DECLARED leg the crow-flies floor between its two ends (ADR-0206 §AA4: _"it suppresses the
   * duration and keeps the distance … `2.7 ק״מ` is still true and still useful"_).
   *
   * One derivation rather than a rule each day surface applies, and the crow-flies fallback is the
   * same claim the canvas makes for a declared leg: a straight segment, because we do not know the
   * road it takes. `null` where the leg has neither.
   */
  distanceFor(from: TripEvent, to: TripEvent): number | null;
  /** **The two place ids this leg runs between**, or `undefined` where either end is unresolved.
   *  Exposed because the mode control writes an override keyed on exactly this pair, and it must
   *  not re-derive it — `endpointPlaceId`'s transport inversion is the kind of rule that goes
   *  wrong when it is answered twice. */
  pairFor(from: TripEvent, to: TripEvent): { fromPlaceId: string; toPlaceId: string } | undefined;
  /**
   * **Has this device said what it holds for this day yet?** (ADR-0206 §AT.) Passed straight
   * through from `useDayTravel` — the day surfaces hold their first paint on it, and no
   * derivation here branches on it.
   */
  settled: boolean;
  /**
   * **How many of the day's holes could not be measured AT ALL** (ADR-0206 §AT2) — a leg with an
   * end that resolves to no place, or to a place with no coordinates.
   *
   * Counted here because this is where the resolution happens, and kept apart from every other
   * kind of missing number on purpose: a pending or refused leg is §D4's ordinary absence and will
   * or will not gain a number later, but a hole with an unplaced end is a leg this app can never
   * measure. That is the one gap the day's total may not stay silent about, because it is a
   * PERMANENT hole in what the total covers rather than a transient one.
   *
   * A hole whose two ends are the SAME place is not counted: it travels nothing, which is measured
   * rather than missing.
   */
  unplacedLegs: number;
  /**
   * **Is this leg's own mode simply too far for it?** (ADR-0206 §AM10.)
   *
   * The gate's ceiling, asked locally — no network, no clusters, instant on a mode switch. It is
   * ONE derivation with two surfaces for the reason every read here is: `frontend/CLAUDE.md` names
   * "changing a day-surface derivation in `DayView` only" as having cost a release twice, and a
   * leg that reads impossible in Plan mode and blank in Trip mode is that failure again.
   *
   * `false` for a declared leg — nothing routes it, so nothing refuses it either (§AA4).
   */
  refusedFor(from: TripEvent, to: TripEvent): boolean;
  /**
   * **Is this leg's number still being computed?** (ADR-0206 §AU1.) `useDayTravel`'s own signal,
   * asked for the leg's OWN mode — the one thing this layer adds, and the reason it is not read
   * straight off that hook at a screen: a leg reads as computing only in the mode it is actually
   * drawn in, so a declared תחב״צ leg (never asked) and a refused one (never coming) are both
   * `false` here whatever the other two modes are still doing.
   */
  warmingFor(from: TripEvent, to: TripEvent): boolean;
  /**
   * **What this leg would be with no override on it** (ADR-0206 §AU2) — the distance-aware
   * default, per leg.
   *
   * Exposed because the mode control needs it and may not re-derive it: picking the default is
   * what CLEARS the stored row (§Z2 keeps the persisted set to genuine overrides), and comparing
   * the pick against the TRIP's mode instead would store a row on every leg whose default the
   * distance had already changed — a walking trip's ⁦300 m⁩ hop picked as `הליכה` would write an
   * override saying what the derivation already says, and then hold it against a later change.
   */
  defaultModeFor(from: TripEvent, to: TripEvent): TravelMode;
}

const NOTHING: DayTravelReads['estimateFor'] = () => null;

/** Exported since ADR-0212: a carried leg needs the same place→coordinate resolution a routed
 *  leg does, and a second copy of `places.find(...)` beside this one is how two surfaces start
 *  disagreeing about whether a place is placed (root rule 8). */
export const coordOf = (
  places: readonly Place[],
  placeId: string | undefined,
): LatLng | undefined => {
  const place = placeId ? places.find((p) => p.id === placeId) : undefined;
  return place?.lat != null && place.lng != null ? { lat: place.lat, lng: place.lng } : undefined;
};

/**
 * **HOW FAR THIS BOOKING CARRIES YOU** (ADR-0212), in metres, or `null` when it is not a carried
 * type or either endpoint has no coordinates.
 *
 * The rule about WHICH types answer lives in `carriedLegMeters` (`@waypoint/shared`) with the
 * routing gate it is the counterpart to; this resolves the two places and nothing else, so the
 * two halves stay where they belong and a backend surface can ask the same question.
 */
export function carriedBookingMeters(
  booking: Pick<Booking, 'type' | 'fromPlaceId' | 'toPlaceId'>,
  places: readonly Place[],
): number | null {
  const from = coordOf(places, booking.fromPlaceId ?? undefined);
  const to = coordOf(places, booking.toPlaceId ?? undefined);
  return from && to ? carriedLegMeters(booking.type, from, to) : null;
}

/**
 * **HOW FAR THE DAY GOES IN THE AIR** (ADR-0212 §3) — the carried half of the day's total, or
 * `null` on a day that flies nowhere.
 *
 * **Deduped by booking**, because a booking can hold more than one row on a day: ADR-0064's
 * departure and landing edges are two entries pointing at one flight, and summing per ROW would
 * report the trip to Keflavík twice. The events are the day's, so a red-eye counts on the day its
 * row falls on and nowhere else — the same rule every other number on this strip follows.
 */
export function dayAirMeters(
  events: readonly TripEvent[],
  bookings: readonly Booking[],
  places: readonly Place[],
): number | null {
  const counted = new Set<string>();
  let metres: number | null = null;
  for (const event of events) {
    if (!event.bookingId || counted.has(event.bookingId)) continue;
    const booking = bookings.find((b) => b.id === event.bookingId);
    if (!booking) continue;
    counted.add(booking.id);
    const leg = carriedBookingMeters(booking, places);
    if (leg !== null) metres = (metres ?? 0) + leg;
  }
  return metres;
}

/**
 * **Where a row leaves you, and where a row wants you.** Two questions and not one, and the
 * difference is only visible on transport: you leave a flight at the airport it LANDS at
 * (`heading`), and you have to reach a flight at the airport it TAKES OFF from. `eventPlaceId`
 * already owns both — the same rule `routeEndpointDay` reads for which day an end falls on — so
 * asking it the right way round is the whole of it. Getting it backwards draws the leg between
 * the two ends of one flight.
 *
 * **Exported since ADR-0206 §AQ, for the hero.** `Home` resolved its own leg's origin with
 * `eventPlaceId(event, booking)` — the default, which is `arriving` — so the leg out of a flight
 * you had just got off was measured from the airport it TOOK OFF from. It is the same inversion
 * this function exists to get right, asked a second time and answered the other way; there is one
 * of it now.
 */
export function endpointPlaceId(
  event: TripEvent,
  bookings: readonly Booking[],
  end: 'leaving' | 'arriving',
): string | undefined {
  const booking = event.bookingId ? bookings.find((b) => b.id === event.bookingId) : undefined;
  return eventPlaceId(event, booking, end === 'leaving');
}

/**
 * **The travel times for one day's holes**, asked for once.
 *
 * `legs` are the day's holes in order, as the surface's own row derivation named them — `dayBlocks`
 * records the row each join was measured from, so a caller reads them off that rather than
 * re-deciding which rows are adjacent (`DayBlockEntry.from`).
 *
 * **The stops it asks about are consecutive, deduped, and only the ones it can resolve.** A leg
 * whose either end is a place-lite row (ADR-0147, no coordinates) is simply not in the array —
 * §D4's absence, reached from the data rather than from the gate — and a leg whose two ends are
 * one place is dropped too, because `ROUTE_MIN_CROW_M` would refuse it anyway and asking costs a
 * request to be told what we already know.
 *
 * **Memoized on the leg identities, and that is not a micro-optimisation.** Both day surfaces
 * re-render on the clock, and `useDayTravel` fingerprints its own input — but the array handed to
 * it is built here, so an unmemoized build would hand it a fresh array every second. The
 * fingerprint would hold; the work would not be free, and this is the shape ADR-0206 §AC6 was
 * written about (`frontend/CLAUDE.md`: the work was never the problem, WHEN it lands is).
 */
export function useDayTravelReads(opts: {
  tripId: string;
  legs: readonly DayLeg[];
  bookings: readonly Booking[];
  places: readonly Place[];
  /** **The declared legs** (ADR-0206 §AM). Empty on almost every trip, because the default is
   *  derived — so a trip nobody has overridden takes exactly the path it took before this existed.
   *
   *  **Required, and deliberately so** — the same reasoning that made `useDayShapes`' mode required
   *  when it replaced `useLegShape`, whose optional one drew pedestrian routes on every trip. An optional
   *  list with an empty default reads as harmless and isn't: a surface that forgets to wire it
   *  silently ignores every declaration on the trip, which is indistinguishable from nobody having
   *  made one. A screen passing `[]` is stating that; a screen passing nothing must not compile. */
  overrides: readonly TravelModeOverride[];
}): DayTravelReads {
  const { tripId, legs, bookings, places, overrides } = opts;
  const mode = useMemo(() => derivedTravelMode(bookings), [bookings]);

  /**
   * **KEYED ON THE LEGS' CONTENT, NEVER ON THE ARRAY'S IDENTITY** (ADR-0206 §AZ7).
   *
   * The memo below has always been documented as load-bearing — _"both day surfaces re-render on
   * the clock … an unmemoized build would hand `useDayTravel` a fresh array every second"_ — and
   * it was keyed on `legs`, which BOTH surfaces rebuild every render: `DayView` derives its blocks
   * outside any memo, and a memo over a fresh array is a memo over nothing. So the whole chain
   * downstream of it — the resolution, the reads object, and each surface's map of journeys — ran
   * once a second on a screen that had not changed.
   *
   * `useDayTravel` next door already solved this for its own input and this is the same shape,
   * one layer up: a string over every field the resolution reads, with the values themselves taken
   * through a ref. Nothing here is a micro-optimisation — it is the difference between a day
   * surface that re-derives on a tick and one that does not, which is what
   * `frontend/CLAUDE.md` names as having turned the preview suite red.
   */
  const legsKey = legs
    .map(
      (leg) =>
        `${leg.from.id}>${leg.to.id}|${leg.fromEdge ?? ''}|${leg.fromIsStay ? 1 : 0}|${leg.departAfterMs ?? ''}`,
    )
    .join(';');
  const legsRef = useRef(legs);
  legsRef.current = legs;

  /** Every leg's two coordinates AND its two place ids, keyed by the pair of row ids the caller
   *  will ask with. The place ids ride along because the override is keyed on them (§AM1) and this
   *  is the one function that resolves them — re-deriving `endpointPlaceId` at a screen is how the
   *  transport inversion starts being answered two ways. */
  const resolved = useMemo(() => {
    const byRows = new Map<
      string,
      { from: LatLng; to: LatLng; fromPlaceId: string; toPlaceId: string }
    >();
    const stops: LatLng[] = [];
    // Holes this app can never measure, kept apart from the ones it simply has no answer for yet
    // (see `DayTravelReads.unplacedLegs`).
    let unplacedLegs = 0;
    for (const leg of legsRef.current) {
      // A leg off a span's START edge leaves from that span's ORIGIN — the counter you collected
      // the car at, not the one you will return it to. See `DayLeg.fromEdge`.
      const fromId = endpointPlaceId(
        leg.from,
        bookings,
        leg.fromEdge === 'start' ? 'arriving' : 'leaving',
      );
      const toId = endpointPlaceId(leg.to, bookings, 'arriving');
      const from = coordOf(places, fromId);
      const to = coordOf(places, toId);
      // A hole between two rows at the same place travels nothing and is not a gap in what the
      // total covers; a hole with an end nobody placed is, so the two are counted apart.
      if (fromId !== undefined && fromId === toId) continue;
      if (!from || !to || !fromId || !toId) {
        unplacedLegs += 1;
        continue;
      }
      byRows.set(legKey(leg.from, leg.to), { from, to, fromPlaceId: fromId, toPlaceId: toId });
      // Consecutive and deduped: hole `n`'s destination is hole `n + 1`'s origin whenever the
      // rows between them are placed, so the day's holes collapse into the ordered stop list the
      // matrix wants. Where placement breaks the chain the array simply has a seam, and the leg
      // across it reads as absent on a first visit (the server caches every matrix cell, so it
      // arrives on the next one — ADR-0205 §Z4).
      const last = stops[stops.length - 1];
      if (!last || last.lat !== from.lat || last.lng !== from.lng) stops.push(from);
      stops.push(to);
    }
    return { byRows, stops, unplacedLegs };
    // `legsKey` carries every field the loop above reads; the legs themselves ride the ref.
  }, [legsKey, bookings, places]);

  const travel = useDayTravel({ tripId, stops: resolved.stops });

  return useMemo(() => {
    const legFor = (from: TripEvent, to: TripEvent) => resolved.byRows.get(legKey(from, to));
    // **The fallback is the LEG's, not the trip's** (ADR-0206 §AU2) — `defaultLegTravelMode` reads
    // how long the WALK takes and answers the trip's derived mode only where there is nothing to
    // measure. Composed here rather than inside `legTravelMode` because that function is the
    // OVERRIDE lookup and knows neither coordinates nor estimates; this is the one place that
    // holds all three, which is what keeps the day list, the hero and the Map on one answer.
    //
    // **The walking duration is read even on a leg drawn as a drive** (§AV1), and that is not a
    // waste: `useDayTravel` fetches every mode's duration in one matrix precisely so a mode
    // question costs no request, and the walk's own length is what decides whether this leg is a
    // walk. Asking about the leg's CURRENT mode instead would be circular.
    const defaultFor = (leg: ReturnType<typeof legFor>): TravelMode =>
      defaultLegTravelMode(
        leg?.from,
        leg?.to,
        mode,
        leg ? travel.estimateFor(leg.from, leg.to, TRAVEL_MODE.WALKING)?.durationSeconds : null,
      );
    const modeOf = (from: TripEvent, to: TripEvent): LegTravelMode => {
      const leg = legFor(from, to);
      // **The default is passed as a THUNK**, so a leg somebody has declared never probes the
      // walking estimate it would discard (§AV1) — which the board asserts by name for תחב״צ.
      return legTravelMode(overrides, leg?.fromPlaceId, leg?.toPlaceId, () => defaultFor(leg));
    };
    /** **Is an answer for this leg still on its way?** Hoisted out of the object below because
     *  `distanceFor` asks it too since §AZ2: a pending leg is the one absence that must NOT be
     *  covered by the crow, and both reads have to agree about which legs those are. */
    const warmingOf = (from: TripEvent, to: TripEvent): boolean => {
      const leg = legFor(from, to);
      if (!leg) return false;
      const legMode = modeOf(from, to);
      // Same two narrowings every other read here makes: a declared leg is never asked about
      // (§AA4) and a refused one is never coming (§AM10), so neither is ever "computing".
      if (!isRoutableMode(legMode) || exceedsTravelCeiling(legMode, leg.from, leg.to)) return false;
      return travel.warmingFor(leg.from, leg.to, legMode);
    };
    return {
      mode,
      settled: travel.settled,
      unplacedLegs: resolved.unplacedLegs,
      modeFor: modeOf,
      distanceFor: (from: TripEvent, to: TripEvent) => {
        const leg = legFor(from, to);
        if (!leg) return null;
        const legMode = modeOf(from, to);
        if (!isRoutableMode(legMode)) return Math.round(haversineMeters(leg.from, leg.to));
        const routed = travel.estimateFor(leg.from, leg.to, legMode)?.distanceMeters;
        if (routed !== undefined) return routed;
        // **EVERY LEG WITH NO ROUTED NUMBER FALLS BACK TO THE CROW** (ADR-0206 §AZ2, closing the
        // hole §AW5 left open). §AM10 drew this for a refused mode and §AA4 for a declared one,
        // and the reasoning was never about those two cases: a crow-flies distance is arithmetic
        // over two coordinates this device already holds, so it is available offline, on a failed
        // request and on a provider that answered nothing — which is precisely what §D4 has
        // called the floor since it was written. Without it those legs printed a mode and a
        // sentence with no kilometres, and before §AZ1 they printed nothing at all.
        //
        // **Except while an answer is still on its way** (§AU1), which is the one distinction
        // that keeps §D4 intact: there we genuinely do not know yet, and a crow number that later
        // becomes a routed one is a figure that changes under the reader — and the day's total
        // reads these journeys, so the header would climb leg by leg as the matrix lands.
        return warmingOf(from, to) ? null : Math.round(haversineMeters(leg.from, leg.to));
      },
      pairFor: (from, to) => {
        const leg = legFor(from, to);
        return leg ? { fromPlaceId: leg.fromPlaceId, toPlaceId: leg.toPlaceId } : undefined;
      },
      defaultModeFor: (from: TripEvent, to: TripEvent) => defaultFor(legFor(from, to)),
      warmingFor: warmingOf,
      refusedFor: (from: TripEvent, to: TripEvent) => {
        const leg = legFor(from, to);
        if (!leg) return false;
        const legMode = modeOf(from, to);
        // A declared leg is not refused, it is simply not asked — §AA4's own distinction, and the
        // same `isRoutableMode` narrowing every other read here makes at the provider boundary.
        return isRoutableMode(legMode) && exceedsTravelCeiling(legMode, leg.from, leg.to);
      },
      estimateFor: resolved.byRows.size
        ? (from: TripEvent, to: TripEvent) => {
            const leg = legFor(from, to);
            if (!leg) return null;
            const legMode = modeOf(from, to);
            // **A declared leg has no estimate to read**, and this is the one place that has to
            // say so: `isRoutableMode` is the single narrowing at the provider boundary (§AM5),
            // so `transit` cannot even be passed to a cache keyed by `TravelMode`.
            if (!isRoutableMode(legMode)) return null;
            return travel.estimateFor(leg.from, leg.to, legMode);
          }
        : NOTHING,
    };
  }, [resolved, travel, mode, overrides]);
}

const legKey = (from: TripEvent, to: TripEvent) => `${from.id}>${to.id}`;

/** What a `JourneyRow` needs to offer the mode switch, or nothing at all. */
export interface LegModeControl {
  modes?: {
    current: LegTravelMode;
    onPick: (mode: LegTravelMode) => void;
    open: boolean;
    onToggle: () => void;
  };
}

/**
 * **THE MODE SWITCH, FOR EVERY SURFACE THAT DRAWS A JOURNEY** (ADR-0206 §AL10/§AM9).
 *
 * A hook rather than a per-screen assembly because there are two day surfaces and they may not
 * differ about a **fact** (ADR-0159 §1) — and M8b shipped this in `DayView` alone, so Plan mode
 * could read a leg's mode and not change it. `frontend/CLAUDE.md` names that exact failure ("changing
 * a day-surface derivation in `DayView` only") as having cost a release twice; this is the third.
 *
 * **Plan mode is where the override matters MOST**, which is what makes the omission a defect
 * rather than a missing nicety: §AL10's own argument for keying on the place pair is that the
 * declaration "is exactly the sort of thing set while planning rather than while standing in it".
 *
 * Three rules live in here so neither host re-decides them:
 *
 * - **The open state is the DAY's**, not the block's. Two holes must not both be open, and a
 *   per-block `useState` would forget on every clock re-render (both surfaces re-render on the
 *   clock).
 * - **Picking the derived mode CLEARS the row** rather than storing one that says what the
 *   derivation already says — §Z2 keeps the persisted set to genuine overrides, so a trip whose
 *   bookings later make it a driving trip still moves. Since §AU2 the derivation is **per leg**
 *   (`defaultModeFor`), so the comparison is too.
 * - **No control on a read-only day, or on a leg whose two ends do not both resolve to a place**:
 *   every other write is gated on the former (ADR-0029), and the latter has no pair to key an
 *   override on (§AM4 — such a leg is inert rather than broken).
 */
export function useLegModeControl(opts: {
  reads: Pick<DayTravelReads, 'mode' | 'modeFor' | 'pairFor' | 'defaultModeFor'>;
  verbs: {
    setLegMode: (fromPlaceId: string, toPlaceId: string, mode: LegTravelMode) => unknown;
    clearLegMode: (fromPlaceId: string, toPlaceId: string) => unknown;
  };
  readOnly?: boolean;
}): (from: TripEvent, to: TripEvent) => LegModeControl {
  const { reads, verbs, readOnly = false } = opts;
  const [open, setOpen] = useState<string | null>(null);
  return (from: TripEvent, to: TripEvent) => {
    const pair = reads.pairFor(from, to);
    if (readOnly || !pair) return {};
    const key = legKey(from, to);
    return {
      modes: {
        current: reads.modeFor(from, to),
        open: open === key,
        onToggle: () => setOpen((prev) => (prev === key ? null : key)),
        onPick: (picked: LegTravelMode) => {
          // **Against THIS leg's default, not the trip's** (ADR-0206 §AU2). The rule is unchanged
          // — picking the default clears the row — but the default is per leg now, and comparing
          // against the trip's would persist an override that says exactly what the derivation
          // already says on every leg the distance rule had already moved.
          void (picked === reads.defaultModeFor(from, to)
            ? verbs.clearLegMode(pair.fromPlaceId, pair.toPlaceId)
            : verbs.setLegMode(pair.fromPlaceId, pair.toPlaceId, picked));
        },
      },
    };
  };
}

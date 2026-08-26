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
import { useMemo } from 'react';
import {
  derivedTravelMode,
  type Booking,
  type LatLng,
  type Place,
  type TravelEstimate,
  type TravelMode,
  type TripEvent,
} from '@waypoint/shared';
import { eventPlaceId } from './places';
import { useDayTravel } from './travel';

/** **A leg, as the day's rows name it** — the two rows either side of one hole. */
export interface DayLeg {
  from: TripEvent;
  to: TripEvent;
  /** **This leg leaves a BOOKEND rather than a row** (ADR-0206 §AD) — the stay you woke in. It has
   *  no departure window: a middle night's `endsAt` is a check-out days away, so reading it as this
   *  hole's start measures a window from next Wednesday. Carried on the leg because it is a fact
   *  about the leg's shape, not about its event. */
  bookend?: boolean;
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

export interface DayTravelReads {
  /** The trip's mode, derived rather than stored (§Z2) — the same read the Map and the hero make,
   *  off the same function, so one leg cannot be a drive on the canvas and a walk in the list. */
  mode: TravelMode;
  /** The estimate for the journey between two rows, or `null` — which is ordinary (§D4). */
  estimateFor(from: TripEvent, to: TripEvent): TravelEstimate | null;
}

const NOTHING: DayTravelReads['estimateFor'] = () => null;

const coordOf = (places: readonly Place[], placeId: string | undefined): LatLng | undefined => {
  const place = placeId ? places.find((p) => p.id === placeId) : undefined;
  return place?.lat != null && place.lng != null ? { lat: place.lat, lng: place.lng } : undefined;
};

/**
 * **Where a row leaves you, and where a row wants you.** Two questions and not one, and the
 * difference is only visible on transport: you leave a flight at the airport it LANDS at
 * (`heading`), and you have to reach a flight at the airport it TAKES OFF from. `eventPlaceId`
 * already owns both — the same rule `routeEndpointDay` reads for which day an end falls on — so
 * asking it the right way round is the whole of it. Getting it backwards draws the leg between
 * the two ends of one flight.
 */
function endpointPlaceId(
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
}): DayTravelReads {
  const { tripId, legs, bookings, places } = opts;
  const mode = useMemo(() => derivedTravelMode(bookings), [bookings]);

  /** Every leg's two coordinates, keyed by the pair of row ids the caller will ask with. */
  const resolved = useMemo(() => {
    const byRows = new Map<string, { from: LatLng; to: LatLng }>();
    const stops: LatLng[] = [];
    for (const leg of legs) {
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
      if (!from || !to || fromId === toId) continue;
      byRows.set(legKey(leg.from, leg.to), { from, to });
      // Consecutive and deduped: hole `n`'s destination is hole `n + 1`'s origin whenever the
      // rows between them are placed, so the day's holes collapse into the ordered stop list the
      // matrix wants. Where placement breaks the chain the array simply has a seam, and the leg
      // across it reads as absent on a first visit (the server caches every matrix cell, so it
      // arrives on the next one — ADR-0205 §Z4).
      const last = stops[stops.length - 1];
      if (!last || last.lat !== from.lat || last.lng !== from.lng) stops.push(from);
      stops.push(to);
    }
    return { byRows, stops };
  }, [legs, bookings, places]);

  const travel = useDayTravel({ tripId, stops: resolved.stops });

  return useMemo(
    () => ({
      mode,
      estimateFor: resolved.byRows.size
        ? (from: TripEvent, to: TripEvent) => {
            const leg = resolved.byRows.get(legKey(from, to));
            return leg ? travel.estimateFor(leg.from, leg.to, mode) : null;
          }
        : NOTHING,
    }),
    [resolved, travel, mode],
  );
}

const legKey = (from: TripEvent, to: TripEvent) => `${from.id}>${to.id}`;

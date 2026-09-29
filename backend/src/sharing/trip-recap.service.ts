// **The trip recap, as the server reads it** (ADR-0239 §9) — the adapter the past-tense narrative,
// the trip book and the group-chat card will share (epic Phase 6A). It decides nothing: the rows go
// through `trips.mapper` (never `as never`, `packages/shared/CLAUDE.md`), the legs come from the
// same `RouteLeg` rows the app's route pack is cut from, and `tripRecap` does the rest — so the app
// and every share print one number for one trip.
import { Injectable } from '@nestjs/common';
import {
  tripRecap,
  tripRecapLegKeys,
  tripZoneCrossings,
  type Booking,
  type MaybeItem,
  type TripEvent,
  type TripRecap,
  type ZoneEvidence,
} from '@waypoint/shared';

/** The recap and the rows it was counted from, so a renderer that names a row (the trip book's
 *  firsts and bests) reads the same rows rather than a second query of its own. */
export interface TripRecord {
  recap: TripRecap;
  events: TripEvent[];
  bookings: Booking[];
  maybes: MaybeItem[];
  /** What a row's clock is read in (`eventDisplayZones`), built as the app builds it. */
  evidence: ZoneEvidence;
}
import { EnrichmentService } from '../enrichment/enrichment.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  toBookingDto,
  toEventDto,
  toMaybeItemDto,
  toPlaceDto,
  toTravelModeOverrideDto,
  toTripDto,
} from '../trips/trips.mapper';
import { labelWith } from './sharing-projection.service';

@Injectable()
export class TripRecapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly enrichment: EnrichmentService,
  ) {}

  async recapFor(tripId: string): Promise<TripRecap> {
    return (await this.recordFor(tripId)).recap;
  }

  async recordFor(tripId: string): Promise<TripRecord> {
    const where = { tripId };
    const [trip, events, bookings, places, maybes, overrides] = await Promise.all([
      this.prisma.trip.findUniqueOrThrow({ where: { id: tripId } }),
      this.prisma.event.findMany({ where }),
      this.prisma.booking.findMany({ where }),
      this.prisma.place.findMany({ where }),
      this.prisma.maybeItem.findMany({ where }),
      this.prisma.travelModeOverride.findMany({ where }),
    ]);
    // A read, never a fetch: a memory is not a reason to spend the provider's budget, and the
    // snapshot read already schedules whatever is stale.
    const { enrichments } = await this.enrichment.readForPlaces(places);
    const label = labelWith(enrichments);
    const placeById = new Map(places.map((place) => [place.id, place]));

    const input = {
      trip: toTripDto(trip),
      events: events.map(toEventDto),
      bookings: bookings.map(toBookingDto),
      places: places.map(toPlaceDto),
      maybes: maybes.map(toMaybeItemDto),
      enrichments,
      overrides: overrides.map(toTravelModeOverrideDto),
      placeLabel: (placeId: string) => label(placeById.get(placeId) ?? null),
    };
    const keys = tripRecapLegKeys(input);
    const legs = keys.length
      ? await this.prisma.routeLeg.findMany({
          where: { key: { in: keys } },
          select: { key: true, durationSeconds: true, distanceMeters: true },
        })
      : [];
    return {
      recap: tripRecap({ ...input, legs: new Map(legs.map((leg) => [leg.key, leg])) }),
      events: input.events,
      bookings: input.bookings,
      maybes: input.maybes,
      evidence: {
        events: input.events,
        bookings: input.bookings,
        places: input.places,
        crossings: tripZoneCrossings(input.events, input.bookings, input.places),
        primaryZone: input.trip.timezone,
      },
    };
  }
}

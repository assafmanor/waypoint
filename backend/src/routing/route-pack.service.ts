// **The offline route pack** (ADR-0206 §V1.8) — the trip's travel times, gathered so a phone can
// read them on the plane.
//
// **It is cheap only because ADR-0186 §5/§6 already exists**, and that is the whole design note:
// the region signature says when it is stale, the byte budget bounds it, the LRU evicts it, the
// current trip pins it and the metered-connection policy decides whether it downloads at all.
// None of that is restated here — this file computes a slice of a table and hands it over.
//
// **Three inherited rules it does not re-decide:**
//
//   - **A pack is a cache, never data** (ADR-0186 §6, ADR-0205 §4). It is a cache OF a cache:
//     `RouteLeg` is already a server-owned answer from outside, deliberately outside the change
//     log. So nothing here goes through `ChangeService.mutate()` — not as an exception to
//     `backend/CLAUDE.md`'s one hard boundary, but because routes are not data-plane at all.
//   - **A missing pack is not an error** (§6 rule 5, ADR-0206 §D4). Every leg it would have
//     carried is still readable remotely, and the client falls back to the crow-flies chip
//     meanwhile.
//   - **Where the service lives is a dependency fact, not a preference** (§AO). M10's card places
//     this in `backend/src/map/`; a `RoutePackService` there would need `RoutingService`, which
//     already needs `MapService` for the trip's clusters — a module cycle. It sits on the side
//     that already imports the other.
import { Injectable, Logger } from '@nestjs/common';
import {
  TRAVEL_MODES,
  clusterLatLngs,
  type LatLng,
  type RoutePack,
  type RoutePackLeg,
} from '@waypoint/shared';
import { MapService } from '../map/map.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ROUTE_PACK_MAX_LEGS,
  routePackDays,
  routePackLegKeys,
  type RoutePackRow,
} from './route-pack';
import { RoutingService, retryAfterFor } from './routing.service';

/** A place as the pack reads it — coordinates or nothing, like everything else that consumes
 *  Place-lite rows (ADR-0147). */
interface PackPlace {
  lat: number | null;
  lng: number | null;
}

/** The trip's schedule, as much of it as a pack needs. */
interface PackEvent {
  date: Date;
  endDate: Date | null;
  place: PackPlace | null;
  booking: {
    place: PackPlace | null;
    fromPlace: PackPlace | null;
    toPlace: PackPlace | null;
  } | null;
}

const isoDate = (at: Date): string => at.toISOString().slice(0, 10);

function coords(...places: (PackPlace | null | undefined)[]): LatLng[] {
  return places.flatMap((place) =>
    place && place.lat != null && place.lng != null ? [{ lat: place.lat, lng: place.lng }] : [],
  );
}

@Injectable()
export class RoutePackService {
  private readonly logger = new Logger(RoutePackService.name);

  /**
   * **The signature each trip's legs have been warmed for**, so a pack is precomputed once and
   * not once per download.
   *
   * **The existing signature and not a new one** (M10's exit criteria): `map-region.ts` already
   * answers "did the covered ground change", so a trip whose places changed gets a different
   * value here and warms again, while a trip whose places were merely renamed does not. A second
   * hash would be a second answer to a question that already has one.
   *
   * In memory, like `RoutingService.inFlight`: losing it on a restart costs one warm pass whose
   * every call is a cache hit, which is cheaper than a table to keep in sync.
   */
  private readonly warmed = new Map<string, string>();

  /** One warm pass per trip at a time. `MapService`'s `inFlight` shape again. */
  private readonly inFlight = new Map<string, Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly map: MapService,
    private readonly routing: RoutingService,
  ) {}

  /**
   * **The trip's pack**, and a warm started for whatever is not computed yet.
   *
   * Built live from `RouteLeg` rather than cut into the byte sink beside the archive, which is
   * §AO's one rejected alternative: the rows are already stored, a second copy of them would go
   * stale the moment a leg was warmed, and it would need an eviction rule of its own that M12
   * does not have. A pack is ~200 KB of JSON assembled from one indexed query.
   *
   * `retryAfterSeconds` set means "still warming, ask again" — ADR-0187's flow, the same one the
   * batch endpoint and the archive routes already speak, so the client needed no new vocabulary.
   */
  async packFor(tripId: string): Promise<RoutePack> {
    const region = await this.map.regionFor(tripId);
    if (!region) return { signature: '', legs: [] };

    const days = routePackDays(await this.scheduleFor(tripId));
    const clusters = clusterLatLngs(await this.map.coordinatesFor(tripId));
    const wanted = routePackLegKeys(days, clusters);

    // **A bound that says what it dropped.** A silent truncation reads as "covered everything".
    const keys = wanted.slice(0, ROUTE_PACK_MAX_LEGS);
    if (keys.length < wanted.length) {
      this.logger.warn(
        `route pack for ${tripId} capped at ${ROUTE_PACK_MAX_LEGS} legs; ${wanted.length - keys.length} not carried`,
      );
    }

    const legs = await this.readLegs(keys);
    const warming = this.warmIfNeeded(tripId, region.signature, days);
    return {
      signature: region.signature,
      legs,
      ...(warming ? { retryAfterSeconds: retryAfterFor(days.length * TRAVEL_MODES.length) } : {}),
    };
  }

  /** Await the warm pass in flight, if any. The test seam `RoutingService.settled` is for, and
   *  for the same reason: a pass nobody holds cannot otherwise be waited on. */
  async settled(): Promise<void> {
    while (this.inFlight.size > 0) {
      await Promise.allSettled([...this.inFlight.values()]);
    }
    await this.routing.settled();
  }

  /**
   * **Precompute the trip's legs**, once per signature.
   *
   * One `batch` call per day, which is the endpoint a day surface already makes — so the pack
   * warms exactly the legs a person opening that day would have warmed, through the same gate,
   * the same matrix batching and the same politeness limiter. Nothing here talks to the provider.
   *
   * Returns whether a pass is running, which is what makes `retryAfterSeconds` truthful rather
   * than a permanent header: once a pass has settled for this signature the pack answers with
   * whatever it holds, holes included. A leg the provider refuses outright (ADR-0205 §Z4's
   * terminal `154`) is never coming, and a client that kept re-asking for it would poll forever.
   */
  private warmIfNeeded(tripId: string, signature: string, days: readonly LatLng[][]): boolean {
    if (this.warmed.get(tripId) === signature) return false;
    if (days.length === 0) {
      this.warmed.set(tripId, signature);
      return false;
    }
    const existing = this.inFlight.get(tripId);
    if (existing) return true;

    const started = this.warmTrip(tripId, days)
      .then(() => {
        this.warmed.set(tripId, signature);
      })
      .finally(() => this.inFlight.delete(tripId));
    this.inFlight.set(tripId, started);
    started.catch((error: unknown) => {
      this.logger.warn(`route pack warm failed for ${tripId}: ${String(error)}`);
    });
    return true;
  }

  private async warmTrip(tripId: string, days: readonly LatLng[][]): Promise<void> {
    for (const stops of days) {
      await this.routing.batch(tripId, { stops: [...stops], modes: [...TRAVEL_MODES] });
    }
    // The batches above start work nobody holds; the pass is not over until it lands, or the
    // signature would be marked warmed before a single leg was written.
    await this.routing.settled();
  }

  /**
   * The stored rows for these keys, as the pack ships them. A key with no row is simply absent —
   * refused upstream, still warming, or written after this read (§D4).
   *
   * **No geometry, and that is measured** (§AO). A shapeless leg is **138 bytes** of JSON, so a
   * fortnight of six-stop days is ~170 KB; the same leg carrying a city walk's polyline is
   * ~1,375 — ten times the artefact for a line ADR-0206 §D8 draws one of at a time. What a device
   * already fetched a shape for it still holds (`useDayShapes` writes them), and what it has not
   * falls back to the straight segment the map drew before M7 — §D4's floor, unchanged by this.
   */
  private async readLegs(keys: readonly string[]): Promise<RoutePackLeg[]> {
    if (keys.length === 0) return [];
    const rows = await this.prisma.routeLeg.findMany({
      where: { key: { in: [...keys] } },
      select: { key: true, mode: true, durationSeconds: true, distanceMeters: true },
    });
    return rows.flatMap((row) => {
      const mode = TRAVEL_MODES.find((known) => known === row.mode);
      if (!mode) return [];
      return [
        {
          // **The stored key, copied and never rebuilt.** `routeLegKey` wrote it; spelling it a
          // second time here is the one mistake that ships a pack which can never hit a row.
          key: row.key,
          estimate: {
            mode,
            durationSeconds: row.durationSeconds,
            distanceMeters: row.distanceMeters,
          },
        },
      ];
    });
  }

  /**
   * The trip's rows in schedule order, each reduced to the coordinates it puts on its day(s).
   *
   * **Both ends of a booking, deliberately.** Which end of a transport row a leg leaves from is
   * the client's derivation (`endpointPlaceId` — a flight leaves you at its destination, a car
   * hire at its origin), and re-deciding it here would be a second answer to a question
   * `lib/day-travel.ts` already owns. Carrying both covers either.
   */
  private async scheduleFor(tripId: string): Promise<RoutePackRow[]> {
    const place = { select: { lat: true, lng: true } } as const;
    const events: PackEvent[] = await this.prisma.event.findMany({
      where: { tripId },
      orderBy: [{ date: 'asc' }, { startsAt: 'asc' }, { sortOrder: 'asc' }],
      select: {
        date: true,
        endDate: true,
        place,
        booking: { select: { place, fromPlace: place, toPlace: place } },
      },
    });
    return events.map((event) => ({
      date: isoDate(event.date),
      endDate: event.endDate ? isoDate(event.endDate) : null,
      points: coords(
        event.place,
        event.booking?.place,
        event.booking?.fromPlace,
        event.booking?.toPlace,
      ),
    }));
  }
}

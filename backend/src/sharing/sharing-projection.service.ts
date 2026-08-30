import { Injectable, NotFoundException } from '@nestjs/common';
import { EVENT_KIND, TRAVEL_MODES } from '@waypoint/shared';
import {
  NARRATIVE_SOURCE,
  SHARE_DAYPART_ORDER,
  SHARE_DETAIL_LEVEL,
  routeLegKey,
  shareDaypart,
  shareTimeLabel,
  sharedItinerarySchema,
  tripZoneCrossings,
  type ShareDaypart,
  type ShareDetailLevel,
  type SharedAppendix,
  type SharedDay,
  type SharedEvent,
  type SharedItinerary,
  type TravelMode,
} from '@waypoint/shared';
import { eventDisplayZone, type TripZoneContext } from '../common/event-zone.util';
import { PrismaService } from '../prisma/prisma.service';
import {
  fallbackDaySummary,
  fallbackDayTitle,
  fallbackTripTitle,
  routeLabelsFrom,
} from './itinerary-narrative.fallback';
import {
  SHARE_EVENT_SELECT,
  SHARE_PLACE_SELECT,
  SHARE_SECRET_BOOKING_SELECT,
  SHARE_ZONE_BOOKING_SELECT,
  type ShareEventRow,
  type SharePlaceRow,
} from './sharing.select';

/** The policy a projection runs under — the `TripShare` row, nothing more. */
export interface SharePolicy {
  id: string;
  tripId: string;
  code: string;
  detailLevel: ShareDetailLevel;
  includeBookingSecrets: boolean;
  includeNotesAndTasks: boolean;
  includeTravelerIdentity: boolean;
}

/** A calendar day as `YYYY-MM-DD`. `Event.date` is a `@db.Date`, which Prisma hands back at
 *  UTC midnight, so the UTC slice IS the stored day — no zone enters here. */
const dayKey = (date: Date): string => date.toISOString().slice(0, 10);

const GOOGLE_MAPS_SEARCH = 'https://www.google.com/maps/search/?api=1&query=';

/** A place's public label: the nickname a traveller chose, else the official name
 *  (ADR-0166 §18). Never the `googlePlaceId`, never the coordinates. */
const placeLabel = (place: { name: string; nickname: string | null } | null): string | undefined =>
  place ? (place.nickname?.trim() || place.name).trim() || undefined : undefined;

/**
 * **Everything an anonymous reader is ever handed**, built once and consumed unchanged by
 * the public page and the PDF (ADR-0213 §1).
 *
 * Two rules run through all of it. First, the level decides what is QUERIED, not what is
 * deleted afterwards — see `sharing.select.ts` for why that ordering is the safety property
 * rather than a style choice. Second, every wall clock printed anywhere comes from
 * `eventDisplayZone`, ADR-0107's one resolver, so the page, the PDF and a notification can
 * never disagree about what hour an event is at.
 */
@Injectable()
export class SharingProjectionService {
  constructor(private readonly prisma: PrismaService) {}

  /** Resolve a public code to its live projection. A missing, revoked or rotated code is
   *  the same `NotFoundException` — the response must not distinguish "never existed" from
   *  "was withdrawn", or the 404 becomes a trip-existence oracle. */
  async byCode(code: string): Promise<SharedItinerary> {
    return this.project(await this.requireActiveShare(code));
  }

  async requireActiveShare(code: string): Promise<SharePolicy> {
    const share = await this.prisma.tripShare.findFirst({
      where: { code, revokedAt: null },
      select: {
        id: true,
        tripId: true,
        code: true,
        detailLevel: true,
        includeBookingSecrets: true,
        includeNotesAndTasks: true,
        includeTravelerIdentity: true,
      },
    });
    if (!share) throw new NotFoundException('Shared itinerary unavailable');
    return share;
  }

  async project(share: SharePolicy): Promise<SharedItinerary> {
    const detail = share.detailLevel;
    const orienting = detail !== SHARE_DETAIL_LEVEL.SUMMARY;

    const [trip, events, places, zoneBookings] = await Promise.all([
      this.prisma.trip.findUniqueOrThrow({
        where: { id: share.tripId },
        select: {
          name: true,
          destination: true,
          icon: true,
          startDate: true,
          endDate: true,
          timezone: true,
        },
      }),
      this.prisma.event.findMany({
        where: { tripId: share.tripId },
        select: SHARE_EVENT_SELECT,
        orderBy: [{ date: 'asc' }, { startsAt: 'asc' }, { sortOrder: 'asc' }],
      }),
      this.prisma.place.findMany({ where: { tripId: share.tripId }, select: SHARE_PLACE_SELECT }),
      this.prisma.booking.findMany({
        where: { tripId: share.tripId },
        select: SHARE_ZONE_BOOKING_SELECT,
      }),
    ]);

    const zones: TripZoneContext = {
      // The shared derivation reads four fields off these rows; Prisma's shapes are
      // structurally compatible for all of them, exactly as the notification sweep does it.
      crossings: tripZoneCrossings(events as never, zoneBookings as never, places as never),
      primaryZone: trip.timezone,
    };

    const byDay = this.groupByDay(events, trip.startDate, trip.endDate);
    const journeys = orienting ? await this.journeyLookup(share.tripId, byDay, places) : undefined;

    const days: SharedDay[] = byDay.map(({ date, events: dayEvents }, index) => {
      const projected = dayEvents.map((event) =>
        this.projectEvent(event, zones, detail, journeys?.get(event.id)),
      );
      return {
        ordinal: index + 1,
        date,
        title: fallbackDayTitle(dayEvents.map((event) => placeLabel(event.place))),
        summary: fallbackDaySummary(dayEvents.map((event) => event.title)),
        sections: this.groupByDaypart(projected),
      };
    });

    const routeLabels = routeLabelsFrom(
      byDay.map(({ events: dayEvents }) =>
        placeLabel(dayEvents.find((e) => e.place)?.place ?? null),
      ),
    );

    return sharedItinerarySchema.parse({
      status: 'live',
      detailLevel: detail,
      generatedAt: new Date().toISOString(),
      shareUrl: `/s/${share.code}`,
      trip: {
        name: trip.name,
        destination: trip.destination,
        icon: trip.icon,
        startDate: dayKey(trip.startDate),
        endDate: dayKey(trip.endDate),
        dayCount: days.length,
        eventCount: events.length,
        routeLabels,
      },
      narrative: {
        source: NARRATIVE_SOURCE.DETERMINISTIC,
        title: fallbackTripTitle(routeLabels, trip.name),
        // Deliberately empty for a deterministic narrative: the counts beside it are
        // `trip.*` fields, and the sentence joining them is each renderer's own copy.
        summary: '',
      },
      days,
      appendix:
        detail === SHARE_DETAIL_LEVEL.EVERYTHING ? await this.buildAppendix(share) : undefined,
    });
  }

  /**
   * The day spine: every day of the trip, plus any day an event landed on outside it, in
   * order. Days with nothing in them are kept — a shared trip that silently skips its
   * quiet days misrepresents its own length.
   */
  private groupByDay(
    events: ShareEventRow[],
    startDate: Date,
    endDate: Date,
  ): { date: string; events: ShareEventRow[] }[] {
    const grouped = new Map<string, ShareEventRow[]>();
    // An ambient multi-day span is listed on the day it starts, once (ADR-0209): repeating a
    // four-night stay on four days reads as four stays.
    for (const event of events) {
      const key = dayKey(event.date);
      const bucket = grouped.get(key);
      if (bucket) bucket.push(event);
      else grouped.set(key, [event]);
    }
    for (
      let cursor = new Date(startDate);
      cursor <= endDate;
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    ) {
      const key = dayKey(cursor);
      if (!grouped.has(key)) grouped.set(key, []);
    }
    return [...grouped.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, dayEvents]) => ({ date, events: dayEvents }));
  }

  private projectEvent(
    event: ShareEventRow,
    zones: TripZoneContext,
    detail: ShareDetailLevel,
    journey: SharedEvent['journey'],
  ): SharedEvent {
    const zone = eventDisplayZone(event, zones);
    const daypart = shareDaypart(event.startsAt, zone);
    const base: SharedEvent = {
      title: event.title,
      icon: event.icon,
      category: event.category,
      daypart,
      hard: event.kind === EVENT_KIND.HARD,
    };
    if (detail === SHARE_DETAIL_LEVEL.SUMMARY) return base;

    const label = placeLabel(event.place);
    const address = event.place?.address?.trim() || undefined;
    return {
      ...base,
      startLabel: event.startsAt ? shareTimeLabel(event.startsAt, zone) : undefined,
      endLabel: event.endsAt ? shareTimeLabel(event.endsAt, zone) : undefined,
      placeName: label,
      address,
      // Built from the public display text, so opening a map never requires the projection
      // to carry a coordinate the owner did not choose to publish.
      mapUrl: label
        ? `${GOOGLE_MAPS_SEARCH}${encodeURIComponent([label, address].filter(Boolean).join(', '))}`
        : undefined,
      journey,
    };
  }

  /** Dayparts in reading order, and only the ones that hold something. */
  private groupByDaypart(
    events: SharedEvent[],
  ): { daypart: ShareDaypart; events: SharedEvent[] }[] {
    return SHARE_DAYPART_ORDER.map((daypart) => ({
      daypart,
      events: events.filter((event) => event.daypart === daypart),
    })).filter((section) => section.events.length > 0);
  }

  /**
   * The journey INTO each event, read from the leg cache and **never computed**.
   *
   * A public unauthenticated route that could trigger a routing provider call would be a
   * free proxy for anyone holding a link; a page that only prints legs somebody already
   * looked at is honest and costs one indexed read. A pair with no stored leg simply has
   * no journey line.
   */
  private async journeyLookup(
    tripId: string,
    byDay: { events: ShareEventRow[] }[],
    places: SharePlaceRow[],
  ): Promise<Map<string, SharedEvent['journey']>> {
    const coordOf = new Map(
      places
        .filter((place) => place.lat != null && place.lng != null)
        .map((place) => [place.id, { lat: place.lat as number, lng: place.lng as number }]),
    );
    const pairs: { eventId: string; fromPlaceId: string; toPlaceId: string; keys: string[] }[] = [];
    for (const { events } of byDay) {
      for (let i = 1; i < events.length; i++) {
        const from = events[i - 1].placeId ?? events[i - 1].booking?.toPlaceId;
        const to = events[i].placeId ?? events[i].booking?.fromPlaceId;
        if (!from || !to || from === to) continue;
        const [a, b] = [coordOf.get(from), coordOf.get(to)];
        if (!a || !b) continue;
        pairs.push({
          eventId: events[i].id,
          fromPlaceId: from,
          toPlaceId: to,
          keys: TRAVEL_MODES.map((mode) => routeLegKey(a, b, mode)),
        });
      }
    }
    if (pairs.length === 0) return new Map();

    const [legs, overrides] = await Promise.all([
      this.prisma.routeLeg.findMany({
        where: { key: { in: [...new Set(pairs.flatMap((pair) => pair.keys))] } },
        select: { key: true, mode: true, durationSeconds: true, distanceMeters: true },
      }),
      this.prisma.travelModeOverride.findMany({
        where: { tripId },
        select: { fromPlaceId: true, toPlaceId: true, mode: true },
      }),
    ]);
    const legByKey = new Map(legs.map((leg) => [leg.key, leg]));
    const overrideFor = new Map(
      overrides.map((row) => [`${row.fromPlaceId}>${row.toPlaceId}`, row.mode]),
    );

    const out = new Map<string, SharedEvent['journey']>();
    for (const pair of pairs) {
      // The traveller's own mode choice wins where they made one; otherwise the first mode
      // that has an answer, in `TRAVEL_MODES` order.
      const chosen = overrideFor.get(`${pair.fromPlaceId}>${pair.toPlaceId}`);
      const ordered = chosen
        ? [chosen as TravelMode, ...TRAVEL_MODES.filter((mode) => mode !== chosen)]
        : [...TRAVEL_MODES];
      for (const mode of ordered) {
        const leg = pair.keys
          .map((key) => legByKey.get(key))
          .find((candidate) => candidate?.mode === mode);
        if (!leg) continue;
        out.set(pair.eventId, {
          mode: leg.mode,
          minutes: Math.round(leg.durationSeconds / 60),
          km: Math.round(leg.distanceMeters / 100) / 10,
        });
        break;
      }
    }
    return out;
  }

  /**
   * Everything's operational block — and only the families explicitly switched on.
   *
   * Each is its own query, run only when its flag is set, so a share with notes off never
   * loads a note. Grouped here rather than inline beside each event on purpose (ADR-0213
   * §4): beside the schedule it wrecks scanning and leaves the reader unable to tell which
   * facts were deliberately published.
   */
  private async buildAppendix(share: SharePolicy): Promise<SharedAppendix | undefined> {
    const appendix: SharedAppendix = {};

    if (share.includeBookingSecrets) {
      const bookings = await this.prisma.booking.findMany({
        where: { tripId: share.tripId },
        select: SHARE_SECRET_BOOKING_SELECT,
      });
      appendix.bookingSecrets = bookings
        .map((booking) => ({
          title: booking.title,
          lines: [booking.provider, booking.confirmationCode].filter((line): line is string =>
            Boolean(line?.trim()),
          ),
        }))
        .filter((entry) => entry.lines.length > 0);
    }

    if (share.includeNotesAndTasks) {
      const [notes, tasks] = await Promise.all([
        this.prisma.note.findMany({
          where: { tripId: share.tripId },
          select: { title: true, body: true },
        }),
        this.prisma.task.findMany({
          where: { tripId: share.tripId },
          select: { title: true, body: true },
        }),
      ]);
      appendix.notesAndTasks = [...notes, ...tasks]
        .map((row) => ({
          title: (row.title ?? '').trim(),
          lines: [row.body?.trim()].filter((line): line is string => Boolean(line)),
        }))
        .filter((entry) => entry.title || entry.lines.length > 0);
    }

    if (share.includeTravelerIdentity) {
      const members = await this.prisma.membership.findMany({
        where: { tripId: share.tripId },
        // Names only. There is no toggle anywhere that reveals an email, which is why the
        // `select` cannot name one rather than the mapper choosing not to read it.
        select: { user: { select: { displayName: true } } },
        orderBy: { joinedAt: 'asc' },
      });
      appendix.travelers = members.map((member) => member.user.displayName);
    }

    const documents = await this.prisma.tripShareDocument.findMany({
      where: { shareId: share.id },
      select: { document: { select: { id: true, title: true, mimeType: true } } },
    });
    if (documents.length > 0) {
      appendix.documents = documents.map(({ document }) => ({
        // The one identifier that crosses: a bearer handle, meaningful only inside a
        // download URL under this share's own code (ADR-0213 §1's single exception).
        handle: document.id,
        title: document.title,
        mimeType: document.mimeType,
      }));
    }

    return Object.keys(appendix).length > 0 ? appendix : undefined;
  }
}

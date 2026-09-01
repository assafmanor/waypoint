// `trip.tomorrow` — 19:00 the evening before day 1 (ADR-0198 §2).
//
// **The one row in the catalogue that fires before the trip has anything timed in it**, which
// is why it is the only phase-B kind whose query starts from `Trip` rather than from `Event`.
// Its subject is the trip itself, so there is nothing on the itinerary for it to hang off.
//
// Like the digest, its trigger is a **wall clock** rather than a stored instant, and it stays
// inside the inverted loop the same way: one small query for the trips that start tomorrow,
// then zones only for those. The set is tiny by construction — a trip starts on exactly one
// day — so this is the one place where asking about trips first is also the cheap way round.
import { currentZone, NOTIFICATION_KIND, todayInTz } from '@waypoint/shared';
import { hourInZone, hourStartInZone } from '../send-policy';
import {
  DEDUP,
  NOTIFY_PREF,
  type DueInput,
  type DueSend,
  type NotificationKind,
  type TripZones,
} from '../notification-kind';
import { tripTomorrowPayload } from '../notify-copy';
import { EVENT_SELECT, eventZones, type EventRow } from './event-shape';
import { tripAudience } from './trip-audience';

/** The local hour. Evening, so there is still time to pack — and a fixed hour for the same
 *  reason quiet hours are constants (ADR-0198 §6). */
export const TOMORROW_HOUR = 19;

/** Three hours. Generous, because the send is not about a moment: being told at 21:00 that you
 *  travel tomorrow is still useful, and 22:00 is where quiet hours take over anyway. */
const STALE_AFTER_MS = 3 * 60 * 60 * 1000;

export const tripTomorrowKind: NotificationKind = {
  id: NOTIFICATION_KIND.TRIP_TOMORROW,
  // 19:00 is outside the quiet window by construction, so this never needs to break it.
  timeCritical: false,
  staleAfterMs: STALE_AFTER_MS,
  dedup: DEDUP.BY_INSTANT,
  pref: NOTIFY_PREF.OBLIGATIONS,

  async due({ prisma, nowMs, zonesFor }: DueInput): Promise<DueSend[]> {
    // Every trip whose first day is within a day either side of now. Deliberately wider than
    // "starts tomorrow": which calendar day it *is* depends on the trip's own zone, and that
    // is not known until the zone is resolved — so the SQL is generous and the zone check is
    // exact.
    const dayMs = 24 * 60 * 60 * 1000;
    const trips = await prisma.trip.findMany({
      where: {
        startDate: { gte: new Date(nowMs - dayMs), lte: new Date(nowMs + 2 * dayMs) },
      },
      select: { id: true, name: true, startDate: true, timezone: true },
    });
    if (trips.length === 0) return [];

    const audience = await tripAudience(
      prisma,
      trips.map((trip) => ({ tripId: trip.id })),
      nowMs,
    );

    const sends: DueSend[] = [];
    for (const trip of trips) {
      if (!audience.isLive(trip.id)) continue;
      const zones = await zonesFor(trip.id);
      // Before the first crossing this is home, which is exactly where somebody is the evening
      // before they travel (ADR-0197 §5). Using the trip's own zone would say 19:00 at the
      // destination, which for a long-haul departure is the middle of the night at home.
      const zone = currentZone(nowMs, zones.crossings, zones.primaryZone);
      if (hourInZone(nowMs, zone) !== TOMORROW_HOUR) continue;

      // `startDate` is a `@db.Date`, so it is midnight UTC of the first day — read as a day
      // key, never as an instant.
      const startKey = trip.startDate.toISOString().slice(0, 10);
      if (startKey !== todayInTz(zone, new Date(nowMs + dayMs))) continue;

      const first = await firstTimedThing(prisma, trip.id, startKey, zones);
      for (const userId of audience.members(trip.id)) {
        sends.push({
          userId,
          tripId: trip.id,
          kind: NOTIFICATION_KIND.TRIP_TOMORROW,
          subjectId: trip.id,
          // **19:00 itself, not the tick that noticed it.** The hour check passes for all
          // sixty of its minutes, so keying on `nowMs` would mint a new `fireKey` every tick
          // and leave the 1/day cap doing the ledger's job — the defect the phase-B
          // measurement found in `task.digest` (ADR-0197 §10).
          aimedAtMs: hourStartInZone(nowMs, zone),
          payload: tripTomorrowPayload({
            tripId: trip.id,
            dateKey: startKey,
            tripName: trip.name,
            firstThing: first,
          }),
        });
      }
    }
    return sends;
  },
};

/**
 * The first timed thing on day 1, or `null`.
 *
 * `null` is common rather than exceptional — plenty of trips have a first day with nothing on
 * a clock — so the copy has a shape for it rather than treating it as an error. Any kind of
 * event, hard or soft: this is not an obligation notification, it is "here is what tomorrow
 * opens with", and a soft 09:00 breakfast answers that perfectly well.
 */
async function firstTimedThing(
  prisma: DueInput['prisma'],
  tripId: string,
  dayKey: string,
  zones: TripZones,
): Promise<{ title: string; atMs: number; zone: string } | null> {
  const events = (await prisma.event.findMany({
    where: { tripId, date: new Date(`${dayKey}T00:00:00.000Z`), startsAt: { not: null } },
    orderBy: { startsAt: 'asc' },
    take: 1,
    select: EVENT_SELECT,
  })) as EventRow[];
  const first = events[0];
  if (!first?.startsAt) return null;
  return {
    title: first.title,
    atMs: first.startsAt.getTime(),
    zone: eventZones(first, zones).start,
  };
}

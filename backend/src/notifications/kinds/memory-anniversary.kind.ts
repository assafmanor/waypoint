// `memory.anniversary` — a morning hour on the anniversary of a finished trip's first day
// (ADR-0239 §8, copy ADR-0241 §7).
//
// **The catalogue's one send that is not about something you can still miss.** ADR-0198 notifies
// only that, and this is a fenced exception: once per trip per year (the ledger, keyed on the
// aimed-at hour, whose date carries the year), never inside quiet hours, behind its own switch,
// and only when the record names a place that happened. With no such place there is no send,
// never a generic "remember your trip?".
//
// Like `trip.tomorrow`, its subject is the trip, so its query starts from `Trip`. A month and day
// is not something the `startDate` column can be asked for directly, so the query names the exact
// dates instead: this calendar day, either side of it, in each past year. The zone check below is
// what decides which of them is today.
import { anniversaryYears, currentZone, NOTIFICATION_KIND, todayInTz } from '@waypoint/shared';
import { hourInZone, hourStartInZone } from '../send-policy';
import {
  DEDUP,
  NOTIFY_PREF,
  type DueInput,
  type DueSend,
  type NotificationKind,
} from '../notification-kind';
import { memoryAnniversaryPayload } from '../notify-copy';
import { tripAudience } from './trip-audience';

/** The local morning hour. Later than the 08:00 digest: a memory is not the day's to-do list. */
export const ANNIVERSARY_HOUR = 9;

/** How far back the query looks. A trip's fiftieth is the furthest; the check stays exact. */
export const ANNIVERSARY_MAX_YEARS = 50;

/** Three hours, like the evening-before send: the moment is the day, not the minute. */
const STALE_AFTER_MS = 3 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Every `startDate` that could have its anniversary today somewhere on Earth: this UTC day and
 *  the one either side, in each past year. A February 29 joins a common year's February 28. */
export function anniversaryCandidates(nowMs: number): Date[] {
  const year = new Date(nowMs).getUTCFullYear();
  const days = new Set<string>();
  for (const offset of [-1, 0, 1]) {
    const monthDay = new Date(nowMs + offset * DAY_MS).toISOString().slice(5, 10);
    days.add(monthDay);
    if (monthDay === '02-28') days.add('02-29');
  }
  const dates: Date[] = [];
  for (let back = 1; back <= ANNIVERSARY_MAX_YEARS; back++) {
    for (const monthDay of days) {
      const key = `${year - back}-${monthDay}`;
      const date = new Date(`${key}T00:00:00.000Z`);
      // `2025-02-29` rolls to March 1; a date that does not exist is no trip's first day.
      if (date.toISOString().startsWith(key)) dates.push(date);
    }
  }
  return dates;
}

export const memoryAnniversaryKind: NotificationKind = {
  id: NOTIFICATION_KIND.MEMORY_ANNIVERSARY,
  // 09:00 is outside the quiet window by construction, so this never needs to break it.
  timeCritical: false,
  staleAfterMs: STALE_AFTER_MS,
  dedup: DEDUP.BY_INSTANT,
  pref: NOTIFY_PREF.MEMORIES,

  async due({ prisma, nowMs, zonesFor, recapFor }: DueInput): Promise<DueSend[]> {
    const trips = await prisma.trip.findMany({
      where: { startDate: { in: anniversaryCandidates(nowMs) } },
      select: { id: true, name: true, startDate: true, endDate: true },
    });
    if (trips.length === 0) return [];

    // Members at send time (ADR-0197 §2.4); `isLive` is not asked, since every one of these ended.
    const audience = await tripAudience(
      prisma,
      trips.map((trip) => ({ tripId: trip.id })),
      nowMs,
    );

    const sends: DueSend[] = [];
    for (const trip of trips) {
      const zones = await zonesFor(trip.id);
      // After the trip, the last segment: home, for a trip that came home.
      const zone = currentZone(nowMs, zones.crossings, zones.primaryZone);
      if (hourInZone(nowMs, zone) !== ANNIVERSARY_HOUR) continue;

      // `@db.Date` columns are midnight UTC of the day, so they are read as day keys.
      const today = todayInTz(zone, new Date(nowMs));
      const years = anniversaryYears(trip.startDate.toISOString().slice(0, 10), today);
      if (!years || trip.endDate.toISOString().slice(0, 10) >= today) continue;

      const place = (await recapFor(trip.id)).memoryPlace;
      if (!place) continue;

      for (const userId of audience.members(trip.id)) {
        sends.push({
          userId,
          tripId: trip.id,
          kind: NOTIFICATION_KIND.MEMORY_ANNIVERSARY,
          subjectId: trip.id,
          // The hour, not the tick: the key then names the day, and the day names the year.
          aimedAtMs: hourStartInZone(nowMs, zone),
          payload: memoryAnniversaryPayload({ tripId: trip.id, tripName: trip.name, years, place }),
        });
      }
    }
    return sends;
  },
};

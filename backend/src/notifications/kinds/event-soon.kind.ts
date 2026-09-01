// `event.hard.soon` — a **hard** commitment, its category's lead ahead of it (ADR-0198 §2/§3).
//
// ── THE FILTER IS ADR-0011, AND IT IS THE WHOLE POINT ─────────────────────────────────────
//
// A soft event is never notified. Not once, not ever, not as a preference — ADR-0011 says a
// soft item is free to move, slip and be skipped, so a ping about one interrupts somebody to
// tell them about something that is by definition fine to ignore. This is the line that keeps
// the budget honest, and it is a `where` clause rather than a comment.
//
// ── AND THE SECOND FILTER, WHICH IS EASY TO MISS ──────────────────────────────────────────
//
// **An ambient multi-day span is not this kind's.** A hotel stay's `startsAt` is a check-in
// and a flight-with-an-endDate is a long journey; their EDGES are `span.edge.soon`'s, which
// aims at the closing window bound where ADR-0184 gives one. Without this exclusion a hotel
// check-in would fire twice, once from each kind, an hour apart — which is exactly the
// double-count `isAmbient` exists to prevent one surface over (ADR-0164 §3).
//
// ── THE FIRST timeCritical ROW IN THE CATALOGUE ───────────────────────────────────────────
//
// This is the reason `timeCritical` exists at all: a 05:30 departure has to ring at 03:30 or
// the feature is decorative (ADR-0197 §5). It is also the reason the caps do not reach it —
// you cannot ration a flight.
import { isAmbient, NOTIFICATION_KIND, notifyLeadMinutesFor } from '@waypoint/shared';
import {
  DEDUP,
  NOTIFY_PREF,
  type DueInput,
  type DueSend,
  type NotificationKind,
} from '../notification-kind';
import { eventSoonPayload } from '../notify-copy';
import { tripAudience } from './trip-audience';
import { eventDayKey, EVENT_SELECT, eventZones, type EventRow } from './event-shape';

/** One hour. A commitment you were told about ninety minutes late is a commitment you have
 *  already missed or already made; either way the send is noise (ADR-0197 §3). */
const STALE_AFTER_MS = 60 * 60 * 1000;

/** The widest lead any category declares. The query's window has to cover it, and reading it
 *  off the table rather than hard-coding 120 means re-tuning a lead cannot silently put an
 *  event outside the window that is supposed to catch it. */
const MAX_LEAD_MS = 120 * 60 * 1000;

export const eventSoonKind: NotificationKind = {
  id: NOTIFICATION_KIND.EVENT_HARD_SOON,
  timeCritical: true,
  staleAfterMs: STALE_AFTER_MS,
  dedup: DEDUP.BY_INSTANT,
  pref: NOTIFY_PREF.OBLIGATIONS,

  async due({ prisma, nowMs, zonesFor }: DueInput): Promise<DueSend[]> {
    // ONE indexed range scan on `Event(startsAt)`. The window spans from the longest lead
    // ahead of now back to `staleAfterMs` behind it, because the lead is per category and the
    // exact instant each row is aimed at can only be known once its category is in hand.
    const events = (await prisma.event.findMany({
      where: {
        kind: 'hard',
        status: 'planned',
        startsAt: {
          gte: new Date(nowMs - STALE_AFTER_MS),
          lte: new Date(nowMs + MAX_LEAD_MS),
        },
      },
      select: EVENT_SELECT,
    })) as EventRow[];
    if (events.length === 0) return [];

    const audience = await tripAudience(prisma, events, nowMs);
    const sends: DueSend[] = [];
    for (const event of events) {
      if (!audience.isLive(event.tripId)) continue;
      // The span-edge exclusion. `isAmbient` reads the same derivation the board does.
      if (isAmbient(asShared(event))) continue;

      const leadMinutes = notifyLeadMinutesFor(asShared(event));
      // `0` is "this category is not notified ahead of time" (ADR-0198 §3) — sightseeing,
      // nature, shopping, other, and any event with no category at all.
      if (leadMinutes === 0) continue;

      const startsAtMs = event.startsAt!.getTime();
      const aimedAtMs = startsAtMs - leadMinutes * 60_000;
      // The window above is deliberately wider than any one row's aim, so each row checks its
      // own: too early is not yet, too late is the sweep's own staleness check.
      if (aimedAtMs > nowMs) continue;

      const zones = await zonesFor(event.tripId);
      // An event's own start: "starts soon" is about boarding, so the origin's clock.
      const zone = eventZones(event, zones).start;
      const payload = eventSoonPayload({
        tripId: event.tripId,
        dateKey: eventDayKey(event, zone),
        title: event.title,
        leadMinutes,
        startsAtMs,
        zone,
      });
      // An event is the whole group's, always: nobody is assigned a flight.
      for (const userId of audience.recipients({ tripId: event.tripId, assigneeUserId: null })) {
        sends.push({
          userId,
          tripId: event.tripId,
          kind: NOTIFICATION_KIND.EVENT_HARD_SOON,
          subjectId: event.id,
          aimedAtMs,
          payload,
        });
      }
    }
    return sends;
  },
};

/** A Prisma row as the shared derivations read one. They take the DTO's string dates where
 *  Prisma hands back `Date`s, and `null` where the DTO says absent — one place to convert, so
 *  a kind never passes a half-converted row to `isAmbient` and gets a quiet wrong answer. */
export function asShared(event: EventRow) {
  return {
    category: event.category,
    icon: event.icon,
    date: event.date.toISOString().slice(0, 10),
    endDate: event.endDate ? event.endDate.toISOString().slice(0, 10) : undefined,
    startsAt: event.startsAt?.toISOString(),
    endsAt: event.endsAt?.toISOString(),
  } as Parameters<typeof isAmbient>[0];
}

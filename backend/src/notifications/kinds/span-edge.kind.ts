// `span.edge.soon` — **an ambient span's own edge**, an hour out (ADR-0198 §2, ADR-0164).
//
// ── WHAT THIS KIND IS ABOUT, AND WHY IT IS SEPARATE FROM `event.hard.soon` ─────────────────
//
// ADR-0164 measured the thing this exists for: a four-night stay draws no block and counts
// nothing on its middle days — correctly, that is ADR-0054 working — but a **15:00 check-in
// with luggage**, an **11:00 check-out**, a **10:00 pick-up** and a **10:00 return** are timed
// obligations that can be breached, and a day whose only real commitment was returning the car
// read `0 נותרו היום`. The edges are the obligations; the middle is a backdrop.
//
// So the split with `event.hard.soon` is exactly ADR-0164's own: `isAmbient` decides. A point
// commitment is that kind's, a span's two edges are this one's, and no row is both. Getting
// that wrong would fire a hotel check-in twice an hour apart.
//
// ── AND THE WINDOW BOUNDS, WHICH CHANGE WHICH INSTANT IS THE OBLIGATION ───────────────────
//
// ADR-0184 gives a flexible edge a second bound: a check-in that reads 17:00-21:00 is a
// **deadline at 21:00**, not an appointment at 17:00. So this aims at `startWindowEnd` where
// there is one and `startsAt` otherwise — and at `endWindowStart`'s counterpart the other way
// round, where the EARLIEST is the constraint you can breach by being late to start.
import { isAmbient, NOTIFICATION_KIND, eventTransitionKeys } from '@waypoint/shared';
import {
  DEDUP,
  NOTIFY_PREF,
  type DueInput,
  type DueSend,
  type NotificationKind,
} from '../notification-kind';
import { spanEdgePayload, spanEdgeWord } from '../notify-copy';
import { asShared } from './event-soon.kind';
import { eventDayKey, EVENT_SELECT, eventZone, type EventRow } from './event-shape';
import { tripAudience } from './trip-audience';

/** One hour before the edge. A fixed lead rather than a per-category one: an edge is a
 *  deadline you walk to, and the categories that have edges (a stay, a hire, a long journey)
 *  all want about the same warning. */
const LEAD_MS = 60 * 60 * 1000;

/** Thirty minutes. Tighter than every other kind, because an edge notification that arrives
 *  after the edge has passed is worse than silence — it tells you about a check-out you have
 *  already missed. */
const STALE_AFTER_MS = 30 * 60 * 1000;

/** Which end of the span, and the instant it is actually breachable at. */
interface Edge {
  atMs: number;
  /** `start` or `end`, which is what picks the word. */
  which: 'start' | 'end';
}

export const spanEdgeKind: NotificationKind = {
  id: NOTIFICATION_KIND.SPAN_EDGE_SOON,
  timeCritical: true,
  staleAfterMs: STALE_AFTER_MS,
  dedup: DEDUP.BY_INSTANT,
  pref: NOTIFY_PREF.OBLIGATIONS,

  async due({ prisma, nowMs, zonesFor }: DueInput): Promise<DueSend[]> {
    // A span's own row is selected by its `endDate` being set — that is what makes it
    // multi-day and therefore ambient. Both of its edges are then in hand from the one row, so
    // there is no second query for "the other end".
    //
    // The window is generous on purpose: an edge can be `startsAt`, `startWindowEnd`, `endsAt`
    // or `endWindowStart`, and only `startsAt` is indexed — so the scan is bounded by the
    // multi-day filter and the day range rather than by a bound on the edge instant itself.
    const dayMs = 24 * 60 * 60 * 1000;
    const events = (await prisma.event.findMany({
      where: {
        kind: 'hard',
        status: 'planned',
        endDate: { not: null },
        date: { lte: new Date(nowMs + dayMs) },
      },
      select: EVENT_SELECT,
    })) as EventRow[];
    if (events.length === 0) return [];

    const audience = await tripAudience(prisma, events, nowMs);
    const sends: DueSend[] = [];
    for (const event of events) {
      if (!audience.isLive(event.tripId)) continue;
      // The other half of ADR-0164's split: only the spans ADR-0054 EXCLUDED can add
      // themselves back, which is what stops a same-day booking being counted twice.
      if (!isAmbient(asShared(event))) continue;

      const words = eventTransitionKeys(asShared(event));
      for (const edge of edgesOf(event)) {
        const aimedAtMs = edge.atMs - LEAD_MS;
        if (aimedAtMs > nowMs) continue;
        // Past its own staleness is the sweep's call, but an edge already BEHIND us is this
        // kind's own refusal: "check out by 11:00" at 11:30 is worse than saying nothing.
        if (edge.atMs < nowMs) continue;

        const zones = await zonesFor(event.tripId);
        const zone = eventZone(event, zones, edge.atMs);
        const payload = spanEdgePayload({
          tripId: event.tripId,
          dateKey: eventDayKey(event, zone),
          edgeWord: spanEdgeWord(edge.which === 'start' ? words?.startKey : words?.endKey),
          subject: event.title,
          atMs: edge.atMs,
          zone,
        });
        for (const userId of audience.recipients({
          tripId: event.tripId,
          assigneeUserId: null,
        })) {
          sends.push({
            userId,
            tripId: event.tripId,
            kind: NOTIFICATION_KIND.SPAN_EDGE_SOON,
            // **The edge, not the event.** A span has two obligations and they are days
            // apart, so keying on the event id alone would let the check-in's ledger row
            // suppress the check-out's. `aimedAtMs` differs too, but only by luck — the
            // subject is the honest discriminator.
            subjectId: `${event.id}:${edge.which}`,
            aimedAtMs,
            payload,
          });
        }
      }
    }
    return sends;
  },
};

/**
 * **The two instants a span can be breached at**, per ADR-0184.
 *
 * A window bound wins over the point it closes, and that is the whole subtlety: `startsAt` is
 * when the desk opens, `startWindowEnd` is when you have to be there by. The same the other
 * way round — `endWindowStart` is the earliest you may check out, so the thing you can miss is
 * `endsAt`, and the window bound is not the deadline on that side.
 *
 * An edge with no instant at all contributes nothing: an untimed span has nothing to be late
 * for.
 */
function edgesOf(event: EventRow): Edge[] {
  const edges: Edge[] = [];
  const startAt = event.startWindowEnd ?? event.startsAt;
  if (startAt) edges.push({ atMs: startAt.getTime(), which: 'start' });
  if (event.endsAt) edges.push({ atMs: event.endsAt.getTime(), which: 'end' });
  return edges;
}

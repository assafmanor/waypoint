// **The sweep** (ADR-0197 §3): what is due, right now, and what has already been sent.
//
// This is the exception to "the read is the trigger" that §3 opens, and the shape of the
// exception is chosen to keep as much of that practice as possible: nothing is enqueued, the
// schedule is derived from the entities every tick, and surplus work is dropped rather than
// queued. What is stored is the PAST — `NotificationSend` — which is the half that cannot go
// stale.
//
// **The cost scales with things due, not with trips.** Each kind runs one indexed query
// across every trip at once; zone context is resolved only for the trips those queries
// actually returned, memoized per tick; and the daily caps are counted in one grouped query
// rather than one per candidate. An idle tick is one indexed range scan per kind, returning
// nothing — see `notification-kind.ts`'s header for the per-trip version this replaced and
// the numbers that killed it.
//
// **Phase 3 registers no kinds** (`NOTIFICATION_KINDS` is empty), so this runs and sends
// nothing. That is the deliverable: the machinery is exercised, the policies are enforced,
// and no traveller can be surprised while the catalogue is still being written.
import { Inject, Injectable, Logger } from '@nestjs/common';
import { tripZoneCrossings } from '@waypoint/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_DISPATCHER, type NotificationDispatcher } from './notification-dispatcher';
import {
  NOTIFICATION_KINDS,
  type DueSend,
  type NotificationKind,
  type TripZones,
} from './notification-kind';
import {
  capWindowStart,
  dailySource,
  fireKeyFor,
  isStale,
  QUIET_VERDICT,
  quietVerdict,
  remainingToday,
} from './send-policy';

/** What one tick did, for the log and for a spec to assert against. */
export interface SweepReport {
  candidates: number;
  /** Passed every policy and got a ledger row. Not "delivered" — that is the dispatcher's. */
  claimed: number;
  droppedStale: number;
  deferredQuiet: number;
  droppedCapped: number;
  /** Lost the ledger race to another tick or another instance. */
  alreadySent: number;
}

const EMPTY_REPORT: SweepReport = {
  candidates: 0,
  claimed: 0,
  droppedStale: 0,
  deferredQuiet: 0,
  droppedCapped: 0,
  alreadySent: 0,
};

@Injectable()
export class NotificationSweepService {
  private readonly log = new Logger(NotificationSweepService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATION_DISPATCHER) private readonly dispatcher: NotificationDispatcher,
  ) {}

  /**
   * One tick.
   *
   * `nowMs` is an argument, not a clock read — which is what lets a spec place the tick
   * anywhere without waiting for real time, and is the same clock-injection every pure
   * derivation in this repo uses.
   */
  async sweep(nowMs: number): Promise<SweepReport> {
    // The short circuit that makes phase 3 free: with no kinds registered there is nothing
    // any query could answer, so the tick costs one comparison rather than a scan.
    if (NOTIFICATION_KINDS.length === 0) return { ...EMPTY_REPORT };

    const report = { ...EMPTY_REPORT };
    const zonesFor = this.memoizedZones();

    // Every kind's candidates, gathered before any policy runs — so the caps below can be
    // counted in one grouped query for the whole tick instead of one per candidate.
    const found: { candidate: DueSend; kind: NotificationKind }[] = [];
    for (const kind of NOTIFICATION_KINDS) {
      const due = await kind.due({ prisma: this.prisma, nowMs, zonesFor });
      for (const candidate of due) found.push({ candidate, kind });
    }
    report.candidates = found.length;
    if (found.length === 0) return report;

    const spent = await this.spentToday([...new Set(found.map((f) => f.candidate.userId))], nowMs);

    // Claimed sends accumulate and go out in ONE dispatch at the end. Not per-candidate,
    // deliberately: the dispatcher is the seam a queue replaces (ADR-0197 §3.1), so it should
    // see the tick's whole batch — that is the unit a `QueueDispatcher` would enqueue, and
    // handing it one item at a time would make the swap a rewrite instead of a binding change.
    const claimed: DueSend[] = [];
    for (const { candidate, kind } of found) {
      if (await this.consider(candidate, kind, nowMs, zonesFor, spent, report)) {
        claimed.push(candidate);
      }
    }

    // **After the claims, never interleaved with them.** A send that is claimed but not yet
    // delivered is recoverable only as "we said we sent it"; claiming everything first means
    // a crash mid-dispatch loses deliveries rather than double-sending them, which is the
    // direction a notification should fail in.
    if (claimed.length > 0) await this.dispatcher.dispatch(claimed);

    this.log.log(
      `sweep: ${report.candidates} candidates, ${report.claimed} claimed, ` +
        `${report.droppedStale} stale, ${report.deferredQuiet} quiet, ` +
        `${report.droppedCapped} capped, ${report.alreadySent} already sent`,
    );
    return report;
  }

  /**
   * How many sends each of these users has had inside the cap window — **one grouped query
   * for the whole tick**, not one count per candidate.
   *
   * The per-candidate version was an N+1 that got worse exactly when the cap mattered most:
   * the busiest recipient generated the most counts. Users absent from the result have sent
   * nothing, so the map's missing keys read as zero.
   */
  private async spentToday(userIds: string[], nowMs: number): Promise<Map<string, number>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.prisma.notificationSend.groupBy({
      by: ['userId', 'kind'],
      where: { userId: { in: userIds }, sentAt: { gte: capWindowStart(nowMs) } },
      _count: { _all: true },
    });
    // Keyed by `userId|source` rather than by user, because the caps are per SOURCE
    // (ADR-0198 §5) — a person's six task reminders must not exhaust their one nudge.
    const spent = new Map<string, number>();
    for (const row of rows) {
      const key = `${row.userId}|${dailySource(row.kind)}`;
      spent.set(key, (spent.get(key) ?? 0) + row._count._all);
    }
    return spent;
  }

  /**
   * The trip's zone facts, through **the shared derivation the screens use** (ADR-0197 §5) —
   * the line that makes a send time and a printed time the same fact.
   *
   * Memoized per tick and **only ever called for a trip a kind's query actually returned**.
   * That is the inverted loop's whole saving: the three-table load that used to run for every
   * live trip now runs for the few that have something due.
   */
  private memoizedZones(): (tripId: string) => Promise<TripZones> {
    const cache = new Map<string, Promise<TripZones>>();
    return (tripId: string) => {
      const hit = cache.get(tripId);
      if (hit) return hit;
      const loading = this.loadZones(tripId);
      cache.set(tripId, loading);
      return loading;
    };
  }

  private async loadZones(tripId: string): Promise<TripZones> {
    const [trip, events, bookings, places] = await Promise.all([
      this.prisma.trip.findUniqueOrThrow({ where: { id: tripId }, select: { timezone: true } }),
      // Only what a crossing can come from: a transport booking's own event needs both a
      // `startsAt` and a `bookingId`, so an untimed or unlinked row cannot contribute one.
      this.prisma.event.findMany({
        where: { tripId, bookingId: { not: null }, startsAt: { not: null } },
      }),
      this.prisma.booking.findMany({ where: { tripId } }),
      this.prisma.place.findMany({ where: { tripId } }),
    ]);
    return {
      // The shared function reads four fields off these rows and Prisma's shapes are
      // structurally compatible for all of them.
      crossings: tripZoneCrossings(events as never, bookings as never, places as never),
      primaryZone: trip.timezone,
    };
  }

  /**
   * One candidate against the three policies, then the ledger.
   *
   * Order matters and is not arbitrary: **stale before quiet** (a send already too old should
   * not be deferred into being older), **quiet before the cap** (a deferred send has not spent
   * anything yet), and **the cap before the ledger insert** (the insert is the commitment).
   */
  private async consider(
    candidate: DueSend,
    kind: NotificationKind,
    nowMs: number,
    zonesFor: (tripId: string) => Promise<TripZones>,
    spent: Map<string, number>,
    report: SweepReport,
  ): Promise<boolean> {
    if (isStale({ nowMs, aimedAtMs: candidate.aimedAtMs, staleAfterMs: kind.staleAfterMs })) {
      report.droppedStale += 1;
      return false;
    }

    const zones = await zonesFor(candidate.tripId);
    const verdict = quietVerdict({
      nowMs,
      crossings: zones.crossings,
      primaryZone: zones.primaryZone,
      timeCritical: kind.timeCritical,
    });
    if (verdict === QUIET_VERDICT.DEFER) {
      // Nothing is written: the candidate is re-derived on a tick after 07:00 and carries the
      // SAME `fireKey` then, so it arrives once. Storing a defer would be the queue this
      // design rejects.
      report.deferredQuiet += 1;
      return false;
    }

    const source = dailySource(candidate.kind);
    const key = `${candidate.userId}|${source}`;
    if (!kind.timeCritical && remainingToday(source, spent.get(key) ?? 0) === 0) {
      report.droppedCapped += 1;
      return false;
    }

    // **The claim.** Inserting the ledger row IS the exactly-once mechanism: a unique
    // violation means another tick, or another backend instance, already owns this send.
    // Nothing here needs a lock or a leader.
    try {
      await this.prisma.notificationSend.create({
        data: {
          userId: candidate.userId,
          kind: candidate.kind,
          subjectId: candidate.subjectId,
          fireKey: fireKeyFor(candidate.aimedAtMs),
        },
      });
      report.claimed += 1;
      // Counted against the budget in-memory too, so one tick cannot spend the same allowance
      // twice — the grouped query above is a snapshot from before any of these claims.
      spent.set(key, (spent.get(key) ?? 0) + 1);
      return true;
    } catch {
      report.alreadySent += 1;
      return false;
    }
  }
}

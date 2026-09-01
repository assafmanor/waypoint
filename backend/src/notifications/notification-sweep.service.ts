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
  DEDUP,
  type DueSend,
  type NotificationKind,
  type NotifyPref,
  type TripZones,
} from './notification-kind';
import { NOTIFICATION_KINDS } from './notification-registry';
import {
  capWindowStart,
  dailySource,
  fireKeyFor,
  isStale,
  QUIET_VERDICT,
  quietVerdict,
  remainingToday,
  SUBJECT_FIRE_KEY,
} from './send-policy';

/** What one tick did, for the log and for a spec to assert against. */
export interface SweepReport {
  candidates: number;
  /** Passed every policy and got a ledger row. Not "delivered" — that is the dispatcher's. */
  claimed: number;
  droppedStale: number;
  deferredQuiet: number;
  droppedCapped: number;
  /** The recipient has this kind's category switched off (ADR-0198 §6). */
  droppedPref: number;
  /** **Already in the ledger.** Nearly always found by the pre-check — a candidate whose
   *  window has not closed yet but whose send went out on an earlier tick — and occasionally
   *  by losing the insert race to another instance in the same minute. */
  alreadySent: number;
  /** Claimed, then reached no device, so the claim was handed back for the next tick to
   *  re-derive (ADR-0197 §10). Non-zero means somebody's notification is late, not lost. */
  released: number;
}

/**
 * How long a **dedup-by-instant** ledger row is kept. Correctness needs only the 24-hour cap
 * window; this is long because ADR-0197 §10 makes the ledger the log too, and a month is how
 * far back "why did I get that" is worth answering. Dedup-by-subject rows are exempt — see
 * `pruneLedger`.
 */
export const LEDGER_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** **What makes two `DueSend`s the same send**, by value rather than by reference — so a
 *  dispatcher that serialised its input can still be understood when it reports back. The
 *  four fields that decide a ledger row, before `fireKey` bucketing. */
function sendIdentity(send: DueSend): string {
  return [send.userId, send.kind, send.subjectId, send.aimedAtMs].join('\u0000');
}

/** The ledger's own unique key, as a value. Exactly the four columns of
 *  `@@unique([userId, kind, subjectId, fireKey])`, so the pre-check and the insert cannot
 *  disagree about what identifies a send. */
interface LedgerKey {
  userId: string;
  kind: string;
  subjectId: string;
  fireKey: string;
}

/** A `LedgerKey` as a `Set` member. `\u0000` separates, because it cannot occur in any of the
 *  four values — so two different keys can never collide into one string. */
const ledgerKeyString = (key: LedgerKey): string =>
  [key.userId, key.kind, key.subjectId, key.fireKey].join('\u0000');

const EMPTY_REPORT: SweepReport = {
  candidates: 0,
  claimed: 0,
  droppedStale: 0,
  deferredQuiet: 0,
  droppedCapped: 0,
  droppedPref: 0,
  alreadySent: 0,
  released: 0,
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

    const userIds = [...new Set(found.map((f) => f.candidate.userId))];
    const [spent, prefs, sent] = await Promise.all([
      this.spentToday(userIds, nowMs),
      this.prefsFor(userIds),
      this.alreadyInLedger(found.map((f) => this.keyFor(f.candidate, f.kind))),
    ]);

    // Claimed sends accumulate and go out in ONE dispatch at the end. Not per-candidate,
    // deliberately: the dispatcher is the seam a queue replaces (ADR-0197 §3.1), so it should
    // see the tick's whole batch — that is the unit a `QueueDispatcher` would enqueue, and
    // handing it one item at a time would make the swap a rewrite instead of a binding change.
    const claimed: DueSend[] = [];
    // The ledger key each claim was written under, so a send nobody received can hand it
    // back without re-deriving the key from a candidate a second time.
    //
    // **Keyed by the send's own identity, NOT by object identity.** `DirectDispatcher`
    // happens to return the very objects it was handed, so a `Map<DueSend, …>` would work
    // today and break silently the moment the seam does what it exists for: a
    // `QueueDispatcher` (ADR-0197 §3.1) serialises, so what comes back is an equal object
    // and never the same one. Releases would quietly stop happening, with no failing test.
    const keys = new Map<string, LedgerKey>();
    for (const { candidate, kind } of found) {
      if (await this.consider(candidate, kind, nowMs, zonesFor, spent, prefs, sent, report)) {
        claimed.push(candidate);
        keys.set(sendIdentity(candidate), this.keyFor(candidate, kind));
      }
    }

    // **After the claims, never interleaved with them.** A send that is claimed but not yet
    // delivered is recoverable only as "we said we sent it"; claiming everything first means
    // a crash mid-dispatch loses deliveries rather than double-sending them, which is the
    // direction a notification should fail in.
    if (claimed.length > 0) {
      const undelivered = await this.dispatcher.dispatch(claimed);
      report.released = await this.release(undelivered, keys);
    }

    // **A tick that did nothing says nothing.** "Every candidate already sent" is the normal
    // state for the whole of a kind's window — three hours, per task — so logging it once a
    // minute buried the ticks that matter. Anything actually claimed, or actually dropped for
    // a reason, still logs.
    if (report.claimed > 0 || report.alreadySent < report.candidates) {
      this.log.log(
        `sweep: ${report.candidates} candidates, ${report.claimed} claimed, ` +
          `${report.droppedStale} stale, ${report.deferredQuiet} quiet, ` +
          `${report.droppedCapped} capped, ${report.droppedPref} opted out, ` +
          `${report.alreadySent} already sent, ${report.released} released for retry`,
      );
    }
    return report;
  }

  /**
   * The ledger key for one candidate. **One derivation, two readers** — the pre-check below
   * and the claim itself — because a pre-check that computed the key even slightly differently
   * from the insert would silently stop matching and quietly restore the storm it exists to
   * prevent.
   */
  private keyFor(candidate: DueSend, kind: NotificationKind): LedgerKey {
    return {
      userId: candidate.userId,
      kind: candidate.kind,
      subjectId: candidate.subjectId,
      fireKey: kind.dedup === DEDUP.BY_SUBJECT ? SUBJECT_FIRE_KEY : fireKeyFor(candidate.aimedAtMs),
    };
  }

  /**
   * **Which of this tick's candidates the ledger already holds** — one query, before any
   * insert is attempted.
   *
   * ── WHY THIS EXISTS, AND IT IS A PRODUCTION DEFECT IT FIXES ──────────────────────────
   *
   * The unique index is the exactly-once mechanism and stays exactly that. But relying on the
   * VIOLATION as the normal path was wrong, and the shape of the windows is what makes it
   * obvious: `task.due` selects `dueAt` within `staleAfterMs` (three hours), so a deadline
   * that fired at 12:00 is still a candidate at 12:01, 12:02 … 14:59. Every one of those ticks
   * re-derived it, re-attempted the insert and took a **Postgres ERROR** — around 180 per
   * task, forever, for every task ever notified.
   *
   * Correctness never broke; observability did. A log full of expected errors is a log with no
   * errors in it, which is the state this was found in: on a production dashboard, by the
   * owner, not by a test.
   *
   * So the pre-check makes the normal case a read, and the insert keeps its `catch` for what it
   * was always really for — **two instances inside the same minute**. That is a genuine race,
   * it is rare, and losing it is worth a line in the log.
   *
   * Exact tuples rather than three `in` lists intersected in memory: the tuple form cannot
   * match a row this tick did not ask about, and each branch is a lookup on the unique index.
   * The candidate count per tick is small by construction — every kind's window is bounded by
   * its own `staleAfterMs`.
   */
  private async alreadyInLedger(keys: LedgerKey[]): Promise<Set<string>> {
    if (keys.length === 0) return new Set();
    const rows = await this.prisma.notificationSend.findMany({
      where: { OR: keys },
      select: { userId: true, kind: true, subjectId: true, fireKey: true },
    });
    return new Set(rows.map(ledgerKeyString));
  }

  /**
   * **Retention: forget the sends nothing will ever read again** — and NOT the ones that are
   * somebody's only memory.
   *
   * The ledger grows monotonically. It cascades from `User`, so a deleted account takes its
   * rows, but there is deliberately no FK to `Task` or `Trip` (the subject is an id, not a
   * relation — a send is about a thing that may be gone, which is the point), so nothing
   * else ever removes a row.
   *
   * **The split is by `dedup`, and getting it the other way round would resurrect
   * notifications.** A `BY_INSTANT` row stops mattering once its instant is far behind: the
   * longest thing that reads one is the 24-hour cap window, so anything older is dead weight.
   * A `BY_SUBJECT` row IS the permanent answer to "has this person already been told about
   * this task" — delete it and every assignment announcement fires again. So those are never
   * pruned, and they are cheap: one row per assignee per task, ever.
   *
   * Thirty days rather than the 25 hours correctness needs, because §10 makes this table the
   * log as well as the ledger — "why did I get that" is worth being able to answer for longer
   * than a day.
   *
   * A kind REMOVED from the registry leaves rows that are neither prunable nor read. Harmless,
   * and named here so the next person does not have to work out why.
   */
  async pruneLedger(nowMs: number): Promise<number> {
    const byInstant = NOTIFICATION_KINDS.filter((kind) => kind.dedup === DEDUP.BY_INSTANT).map(
      (kind) => kind.id,
    );
    if (byInstant.length === 0) return 0;
    const { count } = await this.prisma.notificationSend.deleteMany({
      where: { kind: { in: byInstant }, sentAt: { lt: new Date(nowMs - LEDGER_RETENTION_MS) } },
    });
    if (count > 0) this.log.log(`pruned ${count} ledger rows past retention`);
    return count;
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
   * Each recipient's category switches (ADR-0198 §6) — **one query for the whole tick**, the
   * same shape as `spentToday` above and for the same reason.
   *
   * A user the query does not return is treated as opted OUT, which is the safe direction:
   * the only way to be absent is to have been deleted between a kind's query and this one.
   */
  private async prefsFor(userIds: string[]): Promise<Map<string, Record<NotifyPref, boolean>>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, notifyTasks: true, notifyObligations: true },
    });
    return new Map(
      rows.map((row) => [
        row.id,
        { notifyTasks: row.notifyTasks, notifyObligations: row.notifyObligations },
      ]),
    );
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
      // **Kept, not re-queried** — the two arrays the crossings were just built from are the
      // place rung `eventZones` needs to answer per end (2026-09-01).
      bookings,
      places,
    };
  }

  /**
   * **Hand back the claims nobody received**, so the next tick re-derives them.
   *
   * This is not a new policy — it is what `SEND_OUTCOME.FAILED` has always documented
   * ("recorded and dropped; §3's sweep re-derives on the next tick"). That re-derivation
   * could not happen: the claim is written BEFORE the send, on purpose, so a crash loses a
   * delivery rather than double-sending it — and a claim that outlives a failed send makes
   * the loss permanent. The distinction that makes releasing safe is **who told us**: a
   * crash leaves us guessing what got through, while a transport failure is the sender
   * reporting, in-process, that nothing did. Retrying what we know did not arrive is not a
   * double send.
   *
   * **`staleAfterMs` is the bound**, and it is the right one: the candidate stops being
   * derived when the moment it names has passed, so a persistently unreachable device costs
   * one attempt a tick until the notification is no longer worth sending, and a device the
   * push service reports as `410` is deleted on the first attempt and stops being tried at
   * all. A `429` is retried on the next tick, which at this app's volume (§0198 §5: a
   * handful of sends per person per day) cannot itself be what caused the throttle —
   * ADR-0197 §3.1's fourth threshold (non-410 failures over ~1%) is where that stops being
   * true and a backoff belongs.
   */
  private async release(
    undelivered: readonly DueSend[],
    keys: Map<string, LedgerKey>,
  ): Promise<number> {
    if (undelivered.length === 0) return 0;
    const rows = undelivered
      .map((send) => keys.get(sendIdentity(send)))
      .filter((key): key is LedgerKey => !!key);
    if (rows.length === 0) return 0;
    // One statement, exact tuples — the same shape as the pre-check, so a row can only be
    // released under precisely the key it was claimed under.
    const { count } = await this.prisma.notificationSend.deleteMany({ where: { OR: rows } });
    if (count > 0) {
      this.log.warn(`released ${count} claims whose send reached no device; next tick retries`);
    }
    return count;
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
    prefs: Map<string, Record<NotifyPref, boolean>>,
    sent: Set<string>,
    report: SweepReport,
  ): Promise<boolean> {
    // **First, because a send already made is not a candidate for anything.** Ahead of the
    // policies deliberately: a done send is not "dropped as stale" or "deferred for quiet
    // hours", and counting it as either would misreport what the tick did.
    const ledgerKey = this.keyFor(candidate, kind);
    if (sent.has(ledgerKeyString(ledgerKey))) {
      report.alreadySent += 1;
      return false;
    }

    if (isStale({ nowMs, aimedAtMs: candidate.aimedAtMs, staleAfterMs: kind.staleAfterMs })) {
      report.droppedStale += 1;
      return false;
    }

    // **The preference, before anything else costs a query.** Declared per kind so a kind
    // cannot forget to check (ADR-0198 §6); a kind with `pref: null` is one nobody can
    // decline, and that is visible in its own source rather than by omission here.
    if (kind.pref && prefs.get(candidate.userId)?.[kind.pref] !== true) {
      report.droppedPref += 1;
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
      await this.prisma.notificationSend.create({ data: ledgerKey });
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

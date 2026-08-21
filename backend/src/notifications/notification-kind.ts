// **What a notification kind IS, and the registry the sweep iterates** (ADR-0197 §3,
// ADR-0198's catalogue).
//
// Phase 3 registers **nothing**. That is the deliverable, not an oversight: the tick runs,
// the ledger exists, quiet hours and the cap are enforced, and no notification can reach
// anybody — a state that is testable and that cannot surprise a real traveller while the
// catalogue is still being built. Phase 4 adds `task.due` here and the sweep starts working
// without another line changing.
//
// ── THE SHAPE, AND WHY IT IS THIS SHAPE ────────────────────────────────────────────────────
//
// **A kind asks "what is due?" globally, in ONE indexed query. It is never handed a trip.**
//
// The first version of this interface took a per-trip `SweepContext`, so the sweep looped
// over every live trip and loaded its events, bookings and places to derive zones — `1 + 3T`
// sequential queries per tick, paid whether or not anything was due. Measured: fine at 100
// trips, past the 30-second threshold at ~1,000, and over the 60-second interval at ~5,000.
// The cost scaled with **trips** when it should scale with **things due**, and on a
// notification sweep almost every tick has nothing to do.
//
// So the loop is inverted. A kind runs one range query over its own candidate table
// (`Task.dueAt`, `Event.startsAt` — both now indexed) across all trips at once, and gets back
// only the handful actually due. Zone context is then resolved for the few trips that
// appeared, memoized per tick. An idle tick costs one indexed query per kind and returns
// nothing.
import type {
  NotificationKind as CatalogueKind,
  PushPayload,
  ZoneCrossing,
} from '@waypoint/shared';
import type { PrismaService } from '../prisma/prisma.service';

/** A trip's zone facts, as a kind needs them to say what a wall clock means. */
export interface TripZones {
  crossings: ZoneCrossing[];
  primaryZone: string;
}

/** What a kind is given. Deliberately narrow: a database, a clock, and a way to ask what
 *  zone a trip is in. No request, no socket, no response. */
export interface DueInput {
  prisma: PrismaService;
  /** The tick's instant. Injected, never read from the clock inside a kind, so a spec can
   *  place the tick anywhere without waiting for real time. */
  nowMs: number;
  /**
   * The trip's zone facts, through the **shared** derivation the screens read (ADR-0197 §5) —
   * which is what makes a send time and a printed time the same fact.
   *
   * **Memoized per tick by the sweep**, so a kind may call it once per candidate without
   * thinking about it: twenty tasks in one trip cost one resolution. Call it only for trips a
   * query actually returned — that is the whole point of the inverted loop.
   */
  zonesFor: (tripId: string) => Promise<TripZones>;
}

/** One thing that should be sent, as a kind reports it. */
export interface DueSend {
  /** Who to reach. A **user**, not a device: the sweep decides the person, and the sender
   *  fans out to whatever devices they have registered. */
  userId: string;
  /** Which trip it came from — the sweep needs it to resolve quiet hours in the recipient's
   *  zone, and it is the reason a kind returns this rather than being handed a trip. */
  tripId: string;
  kind: NotificationKindId;
  /** The task / event / trip this is about — half of the ledger key. */
  subjectId: string;
  /**
   * The instant this send was aimed at. **The ledger's `fireKey` is derived from this**, so a
   * kind never invents its own dedup identity: it says what moment it is firing for, and the
   * sweep turns that into a key. A kind that reports the same subject and the same aimed-at
   * instant twice is idempotent for free.
   */
  aimedAtMs: number;
  /** What the notification says. Built by the kind, because only the kind knows the words. */
  payload: PushPayload;
}

/**
 * A notification kind: what of this sort is due right now, anywhere.
 *
 * Two properties are declared rather than inferred, because both are per-kind policy that the
 * sweep enforces and a kind must not be able to forget:
 *
 * - **`timeCritical`** — may this fire inside quiet hours? A 05:30 airport departure has to
 *   ring at 04:00 or the feature is decorative; a task reminder does not (ADR-0197 §5).
 * - **`staleAfterMs`** — how long after its aimed-at instant is this still worth sending? A
 *   missed tick DROPS rather than delivering late (§3): "leave for the airport" is worthless
 *   twenty minutes on, and a redeploy must not fire eleven notifications at once.
 *
 * **The contract on `due`:** one bounded, indexed query. Its window should be no wider than
 * `staleAfterMs` — anything older is dropped by the sweep anyway, so selecting it is work
 * thrown away. It must not iterate trips.
 */
export interface NotificationKind {
  id: NotificationKindId;
  timeCritical: boolean;
  staleAfterMs: number;
  due(input: DueInput): Promise<DueSend[]>;
}

/** The registered kinds. **Empty in phase 3, deliberately** — see the file header. */
export const NOTIFICATION_KINDS: readonly NotificationKind[] = [];

/** The id union, taken from `@waypoint/shared`'s `NOTIFICATION_KIND` rather than declared a
 *  second time here — a bare `string` would be the exact weakness ADR-0095 exists to
 *  prevent, and the wire contract already owns this vocabulary. A kind added to the shared
 *  constant widens this automatically; one that is not there does not compile. */
export type NotificationKindId = CatalogueKind;

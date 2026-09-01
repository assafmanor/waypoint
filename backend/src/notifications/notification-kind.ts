// **What a notification kind IS, and the registry the sweep iterates** (ADR-0197 §3,
// ADR-0198's catalogue).
//
// **The registry lives next door, in `notification-registry.ts`**, and that split is not
// tidiness. A kind needs `DEDUP` and `NOTIFY_PREF` from this file at module-eval time, so a
// registry here would make this file import its own implementers and them import it back — a
// cycle that in CommonJS leaves one side reading `undefined` from a half-initialised module.
// An interface that does not know who implements it also mocks cleanly, which the sweep's
// spec depends on.
//
// Phase 3 registered nothing on purpose, and phase 4 filled it in: `task.due`, `task.digest`
// and `task.assigned`, ADR-0198's phase A. The claim phase 3 made held — the registry is the
// only line that changed to turn the machinery on.
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

/**
 * A trip's zone facts, as a kind needs them to say what a wall clock means.
 *
 * **The bookings and the places are the place rung** (2026-09-01), and they cost nothing:
 * `loadZones` already reads both in full to derive the crossings, and simply did not keep
 * them. Without them a kind can only ask which segment an instant falls in — which is where
 * you ARE, not what a clock SAYS — so a flight's departure resolved to its destination and a
 * hotel standing in a zone the itinerary says you have not reached resolved to the segment.
 * Untyped here for the reason the crossing derivation is: these are Prisma rows, structurally
 * compatible with `@waypoint/shared`'s entity shapes for the fields the resolvers read.
 */
export interface TripZones {
  crossings: ZoneCrossing[];
  primaryZone: string;
  bookings: unknown[];
  places: unknown[];
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
 * How a send of this kind is identified in the ledger.
 *
 * The default is the aimed-at minute, which is what makes a moved deadline re-arm and an
 * edited title not. `BY_SUBJECT` exists for a kind whose trigger is a **transition** rather
 * than a clock: there is no instant that both bounds its staleness and stays put across
 * later edits, so the two jobs are separated instead of one of them being fudged.
 */
export const DEDUP = {
  /** Once per (recipient, subject, aimed-at minute). */
  BY_INSTANT: 'byInstant',
  /** Once per (recipient, subject), ever. ADR-0198's "dedup on the assignee, so passing a
   *  task back and forth does not multiply" is exactly this. */
  BY_SUBJECT: 'bySubject',
} as const;
export type Dedup = (typeof DEDUP)[keyof typeof DEDUP];

/**
 * Which `User` preference switches this kind off (ADR-0198 §6), or `null` for a kind nobody
 * can decline.
 *
 * **Declared per kind and enforced by the sweep**, for the same reason `timeCritical` is: a
 * kind must not be able to forget to check, and a new kind that names no preference is
 * visibly un-declinable rather than accidentally so.
 */
export const NOTIFY_PREF = {
  TASKS: 'notifyTasks',
  OBLIGATIONS: 'notifyObligations',
} as const;
export type NotifyPref = (typeof NOTIFY_PREF)[keyof typeof NOTIFY_PREF];

/**
 * A notification kind: what of this sort is due right now, anywhere.
 *
 * Four properties are declared rather than inferred, because each is per-kind policy that
 * the sweep enforces and a kind must not be able to forget:
 *
 * - **`timeCritical`** — may this fire inside quiet hours? A 05:30 airport departure has to
 *   ring at 04:00 or the feature is decorative; a task reminder does not (ADR-0197 §5).
 * - **`staleAfterMs`** — how long after its aimed-at instant is this still worth sending? A
 *   missed tick DROPS rather than delivering late (§3): "leave for the airport" is worthless
 *   twenty minutes on, and a redeploy must not fire eleven notifications at once.
 * - **`dedup`** — see `DEDUP` above.
 * - **`pref`** — which switch turns this off, or `null`.
 *
 * **The contract on `due`:** one bounded, indexed query. Its window should be no wider than
 * `staleAfterMs` — anything older is dropped by the sweep anyway, so selecting it is work
 * thrown away. It must not iterate trips.
 */
export interface NotificationKind {
  id: NotificationKindId;
  timeCritical: boolean;
  staleAfterMs: number;
  dedup: Dedup;
  pref: NotifyPref | null;
  due(input: DueInput): Promise<DueSend[]>;
}

/** The id union, taken from `@waypoint/shared`'s `NOTIFICATION_KIND` rather than declared a
 *  second time here — a bare `string` would be the exact weakness ADR-0095 exists to
 *  prevent, and the wire contract already owns this vocabulary. A kind added to the shared
 *  constant widens this automatically; one that is not there does not compile. */
export type NotificationKindId = CatalogueKind;

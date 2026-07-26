// The pin grammar, as pure functions (ADR-0121 §6 + §13's testing rule): which
// tier a place's pin is in, what number it carries, and which pin wins when two
// sit on the same spot. A rendered Google map cannot be exercised in the suite,
// so everything that decides what a pin LOOKS like lives here, with no Google
// present — the same posture `place-usage.ts` / `distance.ts` take.
//
// It reads the one shared derivation rather than re-deriving anything: the same
// `PlaceUsage` the list rows read, the same `comparePlacesBySchedule` order the
// Day view renders. That is the property the list-first investment was for — a
// chip that changes the list changes the pins in the same pass (ADR-0110 §2).
import {
  comparePlacesBySchedule,
  isDayUsagePast,
  isOnShelf,
  placeDay,
  type DayUsage,
  type PlaceOrderContext,
  type PlaceUsage,
} from './place-usage';

/**
 * The prominence ladder, one tier per pin (ADR-0121 §6). The list separates
 * past/upcoming/idea by **partitioning into blocks** with headers; a map puts
 * every pin on one plane, so the distinction lives on the pin itself.
 *
 * `ghost` is the population the list never had to render: a place that fails the
 * day filter but sits inside the viewport. Hiding the café you are standing next
 * to because it is pencilled for Thursday is the inverse of what this tab is for.
 *
 * The next stop is **not** a tier — it is an additive amber cue that composes
 * with `upcoming` (a full pin plus an outline), exactly as selection composes
 * with both. One tier, two independent cues.
 */
export const PIN_TIER = {
  /** Ahead of you, with a position in the day: a solid, numbered category pin. */
  upcoming: 'upcoming',
  /** Nothing scheduled it — a shelf idea, or an idea pencilled in for a day.
   *  Dashed and unnumbered, which is itself the plan/idea distinction. */
  idea: 'idea',
  /** A strictly-middle night of an ambient stay (ADR-0054): backdrop, not a stop. */
  ambient: 'ambient',
  /** Done, skipped, or simply passed — desaturated, and it KEEPS its number. */
  behind: 'behind',
  /** In view, but not in this day (or on no day at all). Day scope only. */
  ghost: 'ghost',
} as const;
export type PinTier = (typeof PIN_TIER)[keyof typeof PIN_TIER];

/** What the tier + number are resolved against. A subset of `PlaceOrderContext`,
 *  because the tier needs the clock (ahead/behind) but the NUMBER must not. */
export type PinContext = Pick<PlaceOrderContext, 'onDate' | 'nowMs' | 'today'>;

/**
 * Does this day give the place a position in the schedule? Only a real event's
 * edge does: an idea's pencilled-in target day carries no clock and no event
 * (ADR-0116 §1), and a strictly-middle ambient night is neither an arrival nor a
 * departure. Both are therefore unnumbered — "a pin with no position in the
 * schedule gets no number" (ADR-0121 §6).
 */
export function hasScheduleSlot(day: DayUsage | undefined): boolean {
  return day != null && day.prominence === 'edge' && day.eventId != null;
}

/**
 * Which tier a place's pin is in. Precedence, and each step is load-bearing:
 *
 * 1. **Out of the day scope → `ghost`**, before anything else. A place not in
 *    this day is subordinate no matter what else is true of it — including being
 *    the trip's next stop, whose amber cue would otherwise claim a prominence
 *    its (absent) row cannot back up.
 * 2. **No day at all** (an unlinked booking, a "someday" idea) — an idea if it is
 *    on the shelf, else an ordinary upcoming pin. Neither is numbered: nothing
 *    put it in a sequence. Reachable only in all-days scope, where step 1 is off.
 * 3. **Behind you** — the day is past, or a human settled it (ADR-0117 §2).
 * 4. **Ambient** backdrop, then **idea** (no schedule slot), else **upcoming**.
 */
export function placePinTier(usage: PlaceUsage, ctx: PinContext): PinTier {
  const day = placeDay(usage, ctx.onDate);
  if (!day) return ctx.onDate ? PIN_TIER.ghost : ideaOrUpcoming(usage);
  if (ctx.nowMs != null && isDayUsagePast(day, ctx.nowMs, ctx.today)) return PIN_TIER.behind;
  if (day.prominence === 'ambient') return PIN_TIER.ambient;
  return hasScheduleSlot(day) ? PIN_TIER.upcoming : ideaOrUpcoming(usage);
}

const ideaOrUpcoming = (usage: PlaceUsage): PinTier =>
  isOnShelf(usage) ? PIN_TIER.idea : PIN_TIER.upcoming;

/**
 * `placeId → the pin's number`: the index in `comparePlacesBySchedule`'s
 * sequence for this scope, 1-based (ADR-0121 §6). Three properties the callers
 * depend on, all of them consequences of how this is computed:
 *
 * - **A filter never renumbers.** `usages` is the whole SCOPED set, before any
 *   chip is applied — the same shape `listRows` takes, where visibility is a
 *   predicate over a fixed array (ADR-0120 session-130). Gaps (`1, 3, 4`) are
 *   correct and informative: they say something is filtered out.
 * - **Near-me never renumbers.** The order comes from
 *   `comparePlacesBySchedule` specifically, never from the screen's `listOrder`,
 *   which becomes a distance sort when near-me is on.
 * - **The clock never renumbers.** `nowMs` is deliberately NOT passed, so the
 *   ahead/behind partition cannot reach the number: a visited stop keeps its `1`
 *   though the partition sinks it. It also makes this memo-stable on a screen
 *   that re-renders every second.
 *
 * Callers pass the day-scoped set, so a ghost is never numbered.
 */
export function buildPinOrderIndex(
  usages: readonly PlaceUsage[],
  ctx: { nameOf: PlaceOrderContext['nameOf']; onDate?: string },
): Map<string, number> {
  const { nameOf, onDate } = ctx;
  const numbered = usages.filter((u) => hasScheduleSlot(placeDay(u, onDate)));
  numbered.sort((a, b) => comparePlacesBySchedule(a, b, { nameOf, onDate }));
  return new Map(numbered.map((usage, i) => [usage.placeId, i + 1]));
}

/**
 * Coincident pins get a stated z-order (ADR-0121 §6), so the one that matters
 * most is the one you can see and tap: the next stop, then what is ahead in day
 * order, then ideas, then ambient, then what is behind you, then ghosts.
 *
 * Within `upcoming` an earlier number sits higher — on the ground the stop you
 * reach first is the one you are looking for. `ORDER_SPREAD` bounds that nudge
 * so a big number can never outrank a lower tier.
 */
const TIER_Z: Record<PinTier, number> = {
  [PIN_TIER.upcoming]: 400,
  [PIN_TIER.idea]: 300,
  [PIN_TIER.ambient]: 200,
  [PIN_TIER.behind]: 100,
  [PIN_TIER.ghost]: 0,
};
const NEXT_STOP_Z = 500;
const ORDER_SPREAD = 99;

export function pinZIndex(pin: { tier: PinTier; nextStop?: boolean; order?: number }): number {
  if (pin.nextStop) return NEXT_STOP_Z;
  const nudge =
    pin.tier === PIN_TIER.upcoming && pin.order != null ? Math.max(0, ORDER_SPREAD - pin.order) : 0;
  return TIER_Z[pin.tier] + nudge;
}

/** Where a place is, or `undefined` for a coordless Place-lite. The one check
 *  behind "only coord-bearing places pin" and behind whether a row's tap has a
 *  camera to move — selection happens either way (ADR-0121 §8). */
export function placePoint(place: {
  lat?: number | null;
  lng?: number | null;
}): { lat: number; lng: number } | undefined {
  if (place.lat == null || place.lng == null) return undefined;
  return { lat: place.lat, lng: place.lng };
}

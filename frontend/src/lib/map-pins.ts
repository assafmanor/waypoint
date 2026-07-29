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
import { MAP_PIN } from '../constants';
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
  /** Done, skipped, or simply passed — desaturated, and it KEEPS its number. Which of
   *  the three it is rides on the pin as a mark, not as a tier ({@link pinOutcome}):
   *  the grey says *behind you*, a ✓/✕ says *what happened*.
   *  **Trip mode only** (ADR-0130 §2): in Plan mode the day is a shape to arrange,
   *  and nothing on it is behind you. */
  behind: 'behind',
  /** On the shelf and on **no day at all**, seen from a day scope (ADR-0130 §3).
   *  It is a maybe, not a ghost — nothing pencilled it elsewhere, which is exactly
   *  what leaves it available today — so it wears the maybe's paint at the
   *  subordinate ratio: you did not put it in this day. */
  shelf: 'shelf',
  /** In view, but pencilled for ANOTHER day. Day scope only. */
  ghost: 'ghost',
} as const;
export type PinTier = (typeof PIN_TIER)[keyof typeof PIN_TIER];

/** What the tier + number are resolved against. A subset of `PlaceOrderContext`,
 *  because the tier needs the clock (ahead/behind) but the NUMBER must not — plus the
 *  one thing the clock alone cannot decide: whether being past MEANS anything here. */
export type PinContext = Pick<PlaceOrderContext, 'onDate' | 'nowMs' | 'today'> & {
  /** Plan mode. The clock still resolves which day a place is read as, but nothing is
   *  demoted for having passed (ADR-0130 §2): you are arranging a day's shape, and a
   *  faded stop is one you are least able to see while doing it. The screen decides
   *  this, exactly as it decides the amber cues — the lib takes the answer. */
  planning?: boolean;
};

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
 * 1. **Out of the day scope**, before anything else — a place not in this day is
 *    subordinate no matter what else is true of it, including being the trip's next
 *    stop, whose amber cue would otherwise claim a prominence its (absent) row cannot
 *    back up. But there are **two ways to be out of it**, and they are not the same
 *    claim (ADR-0130 §3): a place pencilled for ANOTHER day is elsewhere (`ghost`),
 *    while a shelf maybe on **no** day is nowhere — which is precisely what leaves it
 *    available today, so it stays a maybe (`shelf`) rather than being drawn as
 *    another day's business.
 * 2. **No day at all** (an unlinked booking, a "someday" idea) — an idea if it is
 *    on the shelf, else an ordinary upcoming pin. Neither is numbered: nothing
 *    put it in a sequence. Reachable only in all-days scope, where step 1 is off.
 * 3. **Behind you** — the day is past, or a human settled it (ADR-0117 §2). Trip mode
 *    only: `planning` withdraws the whole question (§2 of the same ADR).
 * 4. **Ambient** backdrop, then **idea** (no schedule slot), else **upcoming**.
 */
export function placePinTier(usage: PlaceUsage, ctx: PinContext): PinTier {
  const day = placeDay(usage, ctx);
  if (!day) {
    if (!ctx.onDate) return ideaOrUpcoming(usage);
    return usage.days.length === 0 && isOnShelf(usage) ? PIN_TIER.shelf : PIN_TIER.ghost;
  }
  if (!ctx.planning && ctx.nowMs != null && isDayUsagePast(day, ctx.nowMs, ctx.today)) {
    return PIN_TIER.behind;
  }
  if (day.prominence === 'ambient') return PIN_TIER.ambient;
  return hasScheduleSlot(day) ? PIN_TIER.upcoming : ideaOrUpcoming(usage);
}

const ideaOrUpcoming = (usage: PlaceUsage): PinTier =>
  isOnShelf(usage) ? PIN_TIER.idea : PIN_TIER.upcoming;

/** What a human said happened at a place, as the canvas draws it. The stored vocabulary
 *  (`DayUsage['outcome']`, ADR-0117 §1), never a second one — the row and the pin have to
 *  be answering with the same word. */
export type PinOutcome = NonNullable<DayUsage['outcome']>;

/**
 * The outcome mark a pin carries, or `undefined` for none (ADR-0117 §1 on the canvas —
 * the "Phase 6 inherits it" its Consequences promised).
 *
 * The `behind` tier used to draw all three of ADR-0117's states identically, so the
 * canvas said *the clock passed this* and could not say which of *we were there* /
 * *we skipped it* / *nobody said* it was. The list has always said it in words; a pin
 * has no room for words, so it says it in a mark.
 *
 * Three precedence rules, each one load-bearing:
 *
 * 1. **Only the `behind` tier is marked.** An outcome is a claim about a place you have
 *    finished with, and every other tier contradicts it: an upcoming stop marked done is
 *    not upcoming (ADR-0117 §2 already sank it here), and the two aside tiers are drawn
 *    subordinate precisely because this day did not choose them — a ✓ on another day's
 *    hollow ghost would report on a day you are not looking at. It also falls out that
 *    **Plan mode draws no marks at all**, `planning` having withdrawn the tier
 *    (ADR-0130 §2): a day you are arranging has no past to report on.
 * 2. **The day the TIER read, not the day the row reads.** `placeDay`, the same call and
 *    the same context `placePinTier` resolves against — never `placeMetaDay`, whose
 *    all-days walk to the next edge is right for a row's wording and would let a pin be
 *    greyed by one day and marked by another.
 * 3. **A strictly-middle stay night reports nothing.** `spanDays` gives every day of a
 *    span the event's outcome, so marking a hotel done would stamp a ✓ on each of its
 *    nights — a claim nobody made about any of them. Same suppression the row already
 *    applies for the same reason (`Map.tsx`'s `dayMeta`).
 */
export function pinOutcome(usage: PlaceUsage, ctx: PinContext): PinOutcome | undefined {
  if (placePinTier(usage, ctx) !== PIN_TIER.behind) return undefined;
  const day = placeDay(usage, ctx);
  return day?.prominence === 'ambient' ? undefined : day?.outcome;
}

/**
 * `placeId → the pin's number`: the index in `comparePlacesBySchedule`'s
 * sequence for **a day**, 1-based (ADR-0121 §6). Four properties the callers
 * depend on, all of them consequences of how this is computed:
 *
 * - **Only a day scope numbers anything.** §6 defined the number as the index in
 *   THE DAY's sequence, so all-days has nothing for it to be an index of: the
 *   comparator would sequence the whole trip and a pin would read `27`, which
 *   answers a question nobody asked. Both halves lose it together because they
 *   read this one map, and it is not a loss — an all-days row states its day in
 *   words (`relativeDayLabel`) exactly where the number was ambiguous.
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
  // No day, no sequence to be an index in — and renumbering per day is worse than
  // nothing: two pins both reading `1` on one canvas, with nothing on either saying
  // which day it belongs to.
  if (!onDate) return new Map();
  // Still no `nowMs`, and the omission stays deliberate now that the guard above
  // makes it unreachable: it is the signature that states a number cannot depend on
  // the clock. `placeDay` resolves the ALL-DAYS case against a clock when given one,
  // so a `PlaceOrderContext` here would be a tick away from renumbering a pin.
  const numbered = usages.filter((u) => hasScheduleSlot(placeDay(u, { onDate })));
  numbered.sort((a, b) => comparePlacesBySchedule(a, b, { nameOf, onDate }));
  return new Map(numbered.map((usage, i) => [usage.placeId, i + 1]));
}

/**
 * Coincident pins get a stated z-order (ADR-0121 §6), so the one that matters
 * most is the one you can see and tap: the next stop, then what is ahead in day
 * order, then ideas, then ambient, then a shelf maybe, then what is behind you, then
 * ghosts. A shelf maybe sits **below ambient** because a night you are sleeping
 * somewhere is a commitment and an idea is not, and **above behind** because a place
 * you are still considering outranks one you have already passed.
 *
 * Within `upcoming` an earlier number sits higher — on the ground the stop you
 * reach first is the one you are looking for. `ORDER_SPREAD` bounds that nudge
 * so a big number can never outrank a lower tier. All-days nothing is numbered,
 * so the nudge is simply inert there and the tier order carries the whole thing.
 */
const TIER_Z: Record<PinTier, number> = {
  [PIN_TIER.upcoming]: 400,
  [PIN_TIER.idea]: 300,
  [PIN_TIER.ambient]: 200,
  [PIN_TIER.shelf]: 150,
  [PIN_TIER.behind]: 100,
  [PIN_TIER.ghost]: 0,
};
const NEXT_STOP_Z = 500;
const ORDER_SPREAD = 99;

/** An unsaved Google result's ring (ADR-0132 §6) sits **below every trip pin**, ghosts
 *  included: what you already have outranks what you might add, and a ring is legible
 *  under a teardrop anyway (it is a different silhouette, not a competing one). Named
 *  here beside `TIER_Z` rather than in the pane, because this is the same one ordering
 *  question — it just happens to be about a population that is not on the ladder. */
export const MAP_RESULT_Z = -100;

/** …**except the one you tapped** (owner, session 166 — _"the selected Google search result
 *  is not prominent enough to distinguish from other results"_). The rule above is about a
 *  population; a selection is about one member of it, and a chosen candidate sitting behind
 *  a trip pin is the one case where "what you already have outranks what you might add"
 *  gives the wrong answer — you are looking AT it. Above the ladder's top rung and the next
 *  stop, below only the me-dot, which is not a place. */
export const MAP_RESULT_SELECTED_Z = 900;

export function pinZIndex(pin: { tier: PinTier; nextStop?: boolean; order?: number }): number {
  if (pin.nextStop) return NEXT_STOP_Z;
  const nudge =
    pin.tier === PIN_TIER.upcoming && pin.order != null ? Math.max(0, ORDER_SPREAD - pin.order) : 0;
  return TIER_Z[pin.tier] + nudge;
}

/**
 * **Context rather than answer:** the two tiers a day scope draws because the place is
 * physically in view, not because the day's filter chose it — the other day's `ghost`
 * and the dayless `shelf` maybe (ADR-0130 §3). Neither has a row in the sheet, so both
 * behave the same everywhere that matters: no amber cue (whose prominence an absent row
 * cannot back up), no pull on the camera, and a tap surfaces its one row.
 *
 * One predicate rather than a growing `!== ghost` in five places — the split of `ghost`
 * into two tiers had to change every one of them, which is what named it.
 */
export const isAsidePin = (tier: PinTier): boolean =>
  tier === PIN_TIER.ghost || tier === PIN_TIER.shelf;

/**
 * Does the camera answer to this pin? Every tier except the two aside ones.
 *
 * §7 says the camera fits **the filtered set**, and an aside pin is precisely what the
 * filter left out, so it must not pull the frame: letting ghosts in is how a two-stop
 * day framed three continents, because the trip's other days were scattered across
 * them. A dayless maybe is the same hazard with a different cause — a shelf idea on the
 * far side of the city would reframe a day it was never part of.
 *
 * The same subordination §6 already applies to near-me's sort and its distance
 * chips — a ghost enters neither — now stated for the camera too.
 *
 * **It reads the pin's `aside` flag, not its tier** (ADR-0131 §4). Normally the two
 * agree. They part under a live query: search is scope-blind by rule, so a match from
 * another day is what was asked for, and the screen withdraws the flag while keeping
 * the tier. Reading the flag is therefore what makes the `frame` control frame the
 * matches with no change to the control — and reading the TIER here instead would have
 * been the silent version of that bug, since the two are equal in every other state.
 */
export function isFramedByCamera(pin: { tier: PinTier; aside?: boolean }): boolean {
  return !(pin.aside ?? isAsidePin(pin.tier));
}

/**
 * ── HOW BIG IS A PIN (ADR-0123) ──────────────────────────────────────────────────
 *
 * **The canvas sizes the pin.** A teardrop is a legibility unit and a touch target on
 * a map whose visible height the sheet's stop changes by a factor of two, so one fixed
 * size cannot serve both: 34px reads as a speck on a 545px canvas and would swallow a
 * 260px one. The rule is therefore a share of the canvas's height, floored at the
 * shipped size and capped where a marker stops reading as a point — `MAP_PIN`.
 *
 * `canvasHeightPx` is the **pane's** height, which is exactly what the snapped stop
 * leaves visible (`--sheet-h`, ADR-0121 §5) — not the viewport's, and not the
 * screen's. That is the parameter, and it is the only one: the deliberate rejections
 * are recorded in the ADR (zoom and pin density both resize pins **under a moving
 * finger**, which is the churn ADR-0121 §9 keeps out of the `באזור` readout).
 */
export function pinHeightFor(canvasHeightPx: number): number {
  const share = canvasHeightPx * MAP_PIN.CANVAS_SHARE;
  return Math.min(Math.max(share, MAP_PIN.MIN_H), MAP_PIN.MAX_H);
}

/**
 * The same rule as a CSS length, resolved by the browser against the pane's own box
 * (`container-type: size` on `.map-pane`, `map-pane.css`).
 *
 * Declarative on purpose, and the same trade `stopHeightCss` makes: `screens/Map.tsx`
 * re-renders every second, so the alternative — measure the pane, put the number in
 * state — is a layout read on the clock, and passing it to `MapPane` would be a prop
 * that changes on a gesture, re-diffing every marker for a value CSS already knows
 * (ADR-0121 §4 / ADR-0122 §9). The browser re-resolves `cqh` when the pane resizes,
 * which is on snap, never per drag frame.
 */
export function pinSizeCss(): string {
  return `clamp(${MAP_PIN.MIN_H}px, ${MAP_PIN.CANVAS_SHARE} * 100cqh, ${MAP_PIN.MAX_H}px)`;
}

/**
 * How much room a pin needs **above its coordinate** on a canvas that tall — the
 * teardrop's tip is the anchor, so its whole body and any amber tag extend upwards,
 * and a fit that reserves nothing draws the topmost pin half off-canvas (ADR-0121 §7).
 *
 * Derived from the size the pin will actually be, not from a worst case: at the map
 * extreme it reserves more than the hand-tuned 64px it replaces, and at `half` — where
 * the pin is at its floor and the inset competes with `fitPaddingFor`'s half-an-axis
 * limit — it reserves less. A hand-tuned constant could be right for one stop only.
 */
export function pinClearanceFor(canvasHeightPx: number): number {
  return Math.ceil(pinHeightFor(canvasHeightPx) * (1 + MAP_PIN.TAG_RISE));
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

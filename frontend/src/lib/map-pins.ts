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
import { iconForCategory, type EventCategory, type TripEvent } from '@waypoint/shared';
import { chosenIcon, DEFAULT_PLACE_ICON, MAP_PIN } from '../constants';
import {
  comparePlacesBySchedule,
  isDayUsagePast,
  isOnShelf,
  placeDay,
  placeMetaDay,
  type DayUsage,
  type PlaceOrderContext,
  type PlaceUsage,
} from './place-usage';
import { eventEdgeTransition } from './transitions';

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
   *  the grey says *behind you*, a ✓/✕ says *what happened*, and the category glyph
   *  stays put because that is what tells one grey pin from another (ADR-0137).
   *  **Trip mode only** (ADR-0130 §2): in Plan mode the day is a shape to arrange,
   *  and nothing on it is behind you. */
  behind: 'behind',
  /** On the shelf and on **no day at all**, seen from a day scope (ADR-0130 §3).
   *  It is a maybe, not a ghost — nothing pencilled it elsewhere, which is exactly
   *  what leaves it available today — so it wears the maybe's paint at the
   *  subordinate ratio: you did not put it in this day. */
  shelf: 'shelf',
  /** In view, but pencilled for ANOTHER day. Day scope only. Hollow — which is what
   *  leaves it the one pin with a free centre, and therefore the one that can say what
   *  happened at it without giving anything up ({@link pinOutcome}, ADR-0137). */
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
 * The outcome mark a pin carries, or `undefined` for none (ADR-0137, keeping the promise
 * ADR-0117's Consequences made: "Phase 6 inherits it — the same outcome drives the
 * rendered pin's treatment when the map lands").
 *
 * The canvas could say *the clock passed this* and not which of ADR-0117's three states
 * it was: *we were there* / *we skipped it* / *nobody said*. The list has always said it
 * in words; a pin has no room for words, so it says it in a mark.
 *
 * **Two tiers carry one, for two different reasons**, which is the whole shape of
 * ADR-0137 and the correction it makes to its own first pass:
 *
 * - **`ghost`** — a place pencilled for ANOTHER day. This is the tier the report was
 *   about, and the one where the mark is worth most: a ghost is context, and the only
 *   question context raises is *do I still need to care about this?* It is also the one
 *   pin with a free centre (no fill, no glyph, no number), so the mark costs it nothing.
 * - **`behind`** — passed or settled, in this day. Here the mark is the narrower claim
 *   ADR-0117 §4 named, sitting beside a grey that only ever meant "behind you".
 *
 * Every other tier is silent, and not by exclusion — none of them CAN have an outcome.
 * An `idea` and a `shelf` maybe have no event to carry a status; an `ambient` night is
 * mid-span, where nothing happens to settle (see below); and a place marked done is
 * `behind` by ADR-0117 §2, since a human outranks the clock — so `upcoming` is
 * unreachable rather than excluded. **Plan mode therefore marks no filled pin at all**,
 * `planning` having withdrawn `behind` (ADR-0130 §2): a day you are arranging has no past
 * to report on. Its ghosts still speak, because a ghost is about another day either way.
 *
 * Two rules about WHICH DAY the mark reports on:
 *
 * 1. **A `behind` pin reports the day its tier read** — `placeDay` with the same context
 *    `placePinTier` resolved against, so the grey and the mark can never describe two
 *    different days. Never `placeMetaDay`, whose all-days walk to the next edge is right
 *    for a row's wording and would decouple the two.
 * 2. **A ghost has no day in the scope** — that is its definition — so it reports the day
 *    it is LIVE on, which is what `placeDay` answers with the scope dropped: the earliest
 *    day not behind you, else the last. The same resolution `isPlaceLeft` and the list's
 *    all-days rows already use, so a chip, a row and a pin cannot disagree about one
 *    place. A ghost aimed at a day still ahead is therefore unmarked, which is correct:
 *    nothing has happened there to have an outcome about.
 *
 * And one about ambient: `spanDays` gives every day of a span the event's outcome, so a
 * hotel marked done would stamp a ✓ on each of its nights — a claim nobody made about any
 * of them. Suppressed here exactly as the row suppresses it (`Map.tsx`'s `dayMeta`).
 */
export function pinOutcome(usage: PlaceUsage, ctx: PinContext): PinOutcome | undefined {
  const tier = placePinTier(usage, ctx);
  if (tier !== PIN_TIER.behind && tier !== PIN_TIER.ghost) return undefined;
  // A ghost is out of the scope by definition, so asking about `onDate` returns nothing;
  // dropping it asks the question the ghost is actually answering ("which day is this
  // place?"), which is the all-days resolution.
  const day =
    tier === PIN_TIER.ghost
      ? placeDay(usage, { nowMs: ctx.nowMs, today: ctx.today })
      : placeDay(usage, ctx);
  return day?.prominence === 'ambient' ? undefined : day?.outcome;
}

/**
 * **Which transition is next at this place**, in the app's existing words for it, or
 * `undefined` when there is none (ADR-0141).
 *
 * The pin used to say the hour and nothing else, so a check-in and a check-out were
 * one pin with two different numbers. The words for the difference already existed
 * (ADR-0063's `transitionLabel`/`eventTransitionKeys`, shared by the hero, the glance
 * markers and the Index) — **and one of them was already on this screen**: `Map.tsx`'s
 * `dayMeta` calls the same `eventEdgeTransition`, and its answer is the FIRST thing a
 * place row's meta line says. So the row read `צ׳ק-אאוט` while the pin above it read
 * `היעד הבא`. This is the wording half of what ADR-0137 did for the outcome mark: one
 * derivation, rendered twice, instead of two halves making unequal claims.
 *
 * **Which end it is IS the pre/during distinction**, which is why no prefix word is
 * needed and none is minted: `צ׳ק-אין` is the moment you arrive, `צ׳ק-אאוט` the moment
 * you leave, `המראה` before boarding and `נחיתה` in the air. `DayUsage.edge` already
 * carries it, and a strictly-middle stay night carries **neither** end — so a mid-span
 * night is silent by construction rather than by a rule.
 *
 * Three things it deliberately does not do:
 *
 * - **It takes the transition word only, never `dayMeta`'s title fallback.** A name in a
 *   ~10px pill over map tiles is unreadable, and it is not a phase; the pin's name is
 *   already its accessible name. No word means no tag.
 * - **The neutral tag is DAY-SCOPED, which the screen enforces, not this** — see
 *   `Map.tsx`. All-days there is nothing on the pin saying which day the word belongs
 *   to, so two stays from two days both read `צ׳ק-אין`: the same ambiguity that killed
 *   all-days renumbering ({@link buildPinOrderIndex}). The amber cues stay scope-blind.
 * - **`behind` is silent.** The transition happened, so a word naming it as ahead is a
 *   lie — and that tier's one badge is already the outcome's (ADR-0137 §2). Every other
 *   silence is a consequence rather than an exclusion: an `ambient` mid-span day has no
 *   edge, and `idea`/`shelf`/`ghost` carry no tag at all.
 *
 * **The day it reports on is `placeMetaDay`, not `placeDay`** — deliberately the
 * opposite choice from `pinOutcome`'s. There the requirement was that the grey and the
 * mark describe one day; here it is that the pin and the row say the same **word**, and
 * `placeMetaDay` is the function that answers "which day has something to say about
 * this place". The two differ in exactly one case — all-days, on an ambient night, where
 * it walks to the stay's next edge — and that is precisely the case where a silent pin
 * under a row reading `צ׳ק-אאוט` would be the defect this removes. The tier gate still
 * reads `placePinTier`, so a passed pin stays silent whichever day the wording picks.
 */
export function pinTransition(
  usage: PlaceUsage,
  ctx: PinContext,
  eventById: (id: string) => TripEvent | undefined,
  /** **What this place is, when it is a connection stop** (ADR-0159) — the word the day
   *  list's band uses, looked up per place and DAY. It wins over the edge word, and the
   *  reason is the same one that made the tag exist: `נחיתה` at a place you leave again
   *  two hours later is true and misleading, and the pin has room for one word. Absent
   *  on surfaces that do not resolve journeys, which then behave exactly as before. */
  connectionWordAt?: (placeId: string, date: string) => string | undefined,
): string | undefined {
  if (placePinTier(usage, ctx) === PIN_TIER.behind) return undefined;
  const day = placeMetaDay(usage, ctx);
  const stop = day?.date ? connectionWordAt?.(usage.placeId, day.date) : undefined;
  if (stop) return stop;
  const event = day?.eventId ? eventById(day.eventId) : undefined;
  return event ? eventEdgeTransition(event, day?.edge) : undefined;
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

/**
 * **The glyph a place shows** — on its pin, on its list row, and on its card, which is why
 * it is one function and not three copies of a `??` chain (ADR-0147).
 *
 * It is the bottom two rungs of the app's icon resolution chain:
 *
 * ```
 * chosenIcon(event.icon) ?? BOOKING_TYPE_ICON[booking.type]   ← the event/booking surfaces
 * ?? chosenIcon(place.icon) ?? iconForCategory(category) ?? DEFAULT_PLACE_ICON   ← here
 * ```
 *
 * **Note the direction, because intuition gets it backwards:** a linked event's *deliberate*
 * pick beats the booking's type glyph, and a place sits under both — the deliberate choice at
 * the NEAREST scope wins, and a place is the widest scope. A place surface never sees the
 * upper rungs (there is no event in hand), so this is the whole chain for the Map.
 *
 * Through `chosenIcon`, so a stored placeholder does not shadow a category that actually says
 * something — a *default* `📌` is not a pick, which is the refinement `constants.ts` records.
 *
 * @param category the place's resolved category (`usage.pin.category` — its own if a human set
 *                 one, else what the referencing entities agree on, ADR-0165), or `undefined`
 *                 when nothing categorises this place yet.
 */
export function placeGlyph(
  place: { icon?: string | null },
  category: EventCategory | null | undefined,
): string {
  return (
    chosenIcon(place.icon ?? undefined) ??
    (category ? iconForCategory(category) : DEFAULT_PLACE_ICON)
  );
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

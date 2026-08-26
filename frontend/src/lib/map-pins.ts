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
import { iconForCategory, isAmbient, type EventCategory, type TripEvent } from '@waypoint/shared';
import { chosenIcon, DEFAULT_PLACE_ICON, MAP_PIN } from '../constants';
import {
  isDayUsagePast,
  isOnShelf,
  knowsMoment,
  placeDay,
  relevantMoment,
  placeMetaDay,
  type DayUsage,
  type PlaceOrderContext,
  type PlaceUsage,
} from './place-usage';
import { eventEdgeTransition } from './transitions';
// The one derivation that says whether an ambient span is a STAY (ADR-0163 §4) — a hotel
// brackets your day, a car hire does not. Read, not re-asked: its docblock already exports it
// for a second shape.
import { countsNights } from './glance';
import { t } from '../i18n/he';

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
  const day = placeMetaDay(usage, ctx);
  // **A STAY KEEPS ITS WORD WHEN IT IS BEHIND YOU** (ADR-0054's 2026-08-26 amendment).
  // The silence below is right for a word that means *what happens next here* — naming a
  // departed flight as ahead is a lie. A stay's word is not that claim: it is which END of
  // the day this place was, and the day does not stop having started at the hotel because
  // it is now the afternoon. Without the exemption the map states the check-IN you are
  // heading for and stays mute about the check-OUT you already did, which is half a route.
  // The grey still says "behind you"; the word only says which moment it was.
  const stay = day ? stayEnds(day, day.date, eventById) : undefined;
  if (!stay && placePinTier(usage, ctx) === PIN_TIER.behind) return undefined;
  const stop = day?.date ? connectionWordAt?.(usage.placeId, day.date) : undefined;
  if (stop) return stop;
  const event = day?.eventId ? eventById(day.eventId) : undefined;
  const edge = event ? eventEdgeTransition(event, day?.edge) : undefined;
  // A strictly middle night carries NEITHER end, so there is no transition word to find —
  // and it is the one pin sitting at both ends of the route. It says what it is instead.
  return edge ?? (stay ? t.map.stayNight : undefined);
}

/**
 * `placeId → the pin's number`: **the index of the STOP its row is naming**, in the day's
 * chronological sequence of stops, 1-based (ADR-0121 §6).
 *
 * **Stops, not places, and that is the 2026-08-06 correction.** This numbered PLACES, sorted
 * by each one's earliest moment — which agreed with what the row said only because the row
 * named the earliest moment too. Once the row started naming the reference that is actually
 * relevant, the two came apart, and the screen contradicted itself: an airport whose landing
 * was at 02:00 and whose car is due back at 18:00 read `1 · 18:00` **above** a place reading
 * `2 · 09:00`. Both numbers were right about "which place did you reach first" and the pair
 * was unreadable. Owner: _"the numbering is weird"_.
 *
 * A day is a sequence of **stops**, and a place you go to twice is two of them. So the
 * sequence is numbered, and a place shows the number of the stop it is currently about.
 * The airport above becomes `3` — `1` belongs to the landing it already did, and the gap is
 * informative in exactly the way the filter's gaps already are.
 *
 * Five properties the callers depend on:
 *
 * - **Only a day scope numbers anything.** §6 defined the number as the index in THE DAY's
 *   sequence, so all-days has nothing for it to be an index of: the comparator would sequence
 *   the whole trip and a pin would read `27`. An all-days row states its day in words
 *   (`relativeDayLabel`) exactly where the number was ambiguous.
 * - **A filter never renumbers.** `usages` is the whole SCOPED set, before any chip is
 *   applied. Gaps (`1, 3, 4`) are correct and informative: they say something is not shown.
 * - **Near-me never renumbers.** The order is the day's clock, never the screen's `listOrder`,
 *   which becomes a distance sort when near-me is on.
 * - **THE SEQUENCE ITSELF IS CLOCK-FREE**, which is what preserves §6's "a tick can never
 *   renumber a pin" for every place that is visited once — i.e. nearly all of them. The stop
 *   list is built and numbered without `nowMs`; the clock decides only WHICH of its own stops
 *   a twice-visited place displays, so no other pin's number can move under it.
 * - **A pin with no position in the schedule gets no number** (`hasScheduleSlot`), unchanged.
 */
/** One moment of one place, as the day's sequence holds it. */
export interface DayStopMoment {
  at?: number;
  eventId?: string;
  edge?: 'start' | 'end';
}

/**
 * **A stop of the day** — the unit you step through (ADR-0182 §1).
 *
 * `order` is the 1-based number the pin and the row wear, and it is absent for exactly the
 * two populations that cannot carry one: a moment the app does not KNOW (a floor, a ceiling,
 * a clockless edge — ADR-0171 §10b), and a tail member, which has no moment at all.
 */
export interface DayStop {
  usage: PlaceUsage;
  day: DayUsage;
  moment: DayStopMoment;
  order?: number;
  /** **The tail** (ADR-0182 §2): on the day, but with no schedule slot to hold a position —
   *  an idea pencilled in with no event. It is traversable and it is never numbered. */
  tail?: true;
}

export interface DayStopContext {
  nameOf: PlaceOrderContext['nameOf'];
  onDate?: string;
  /** The moment's event, so this can ask what its time MEANS (ADR-0171 §10b). Absent
   *  on surfaces that cannot resolve events, which then number every moment as before. */
  eventById?: (id: string) => TripEvent | undefined;
  /** **Is this place a connection stop on this day** — `connectionStops`, the same
   *  derivation the day's band and the pin's word already read (ADR-0159 §6). Absent
   *  where journeys are not resolved. */
  isConnectionStop?: (placeId: string, date: string) => boolean;
  /** **When this day's morning begins**, as an instant — `dayWindowMs(onDate, zone).startMs`
   *  (ADR-0045's window / ADR-0037's dawn). Resolved by the screen because a wall-clock hour
   *  needs a zone and these derivations deliberately hold none. Absent means no stop is ever
   *  read as a night arrival, so the sequence behaves exactly as it did. */
  dawnMs?: number;
}

/** A stop before it is numbered: a place, the day it sits on, and one of that day's moments. */
type DayStopEntry = { usage: PlaceUsage; day: DayUsage; moment: DayStopMoment };

/**
 * **Which ends of `date` a stay bookends**, or `undefined` when this day is not a night of
 * one (ADR-0054's 2026-08-25 amendment).
 *
 * A night-counting ambient span is the only thing that can answer, and both halves of that
 * are load-bearing: `isAmbient` is what makes a stay backdrop rather than a stop, and
 * `countsNights` is what separates a hotel from a car hire — you sleep in one, so it brackets
 * your day, and you merely hold the other, so its pickup and return are ordinary stops at
 * their own (unnumbered) instants. Both are read off ADR-0162's profile, so a future ambient
 * category inherits the answer without anyone naming it here.
 *
 * It walks **every** moment on the day rather than the day's own pointer, because the pointer
 * names the earliest reference and a hotel you also eat dinner at would hide behind the
 * dinner. Two stays on one day (you moved) both get their say, which is what makes the
 * change-over day come out as `A's check-out … B's check-in` with no rule of its own.
 *
 * `eventById` absent means no stay is ever found, so every surface that cannot resolve events
 * behaves exactly as it did — the same shape the rest of this file uses, and the same one that
 * keeps `knowsMoment` inert there.
 */
function stayEnds(
  day: DayUsage,
  date: string,
  eventById?: (id: string) => TripEvent | undefined,
): { first: boolean; last: boolean } | undefined {
  const moments = day.moments?.length ? day.moments : [{ eventId: day.eventId }];
  let found = false;
  let first = false;
  let last = false;
  for (const moment of moments) {
    const event = moment.eventId ? eventById?.(moment.eventId) : undefined;
    if (!event?.endDate || !isAmbient(event) || !countsNights(event)) continue;
    found = true;
    first ||= event.date < date;
    last ||= date < event.endDate;
  }
  return found ? { first, last } : undefined;
}

/**
 * **THE DAY, IN ORDER** (ADR-0182 §1) — the array `buildPinOrderIndex` used to build,
 * number and then throw away. It had no name because it had one reader; it has two now,
 * and the second one steps through it rather than looking places up in it.
 *
 * **There is deliberately one derivation and not two.** `buildPinOrderIndex` below is this
 * function's first consumer, so a number on a pin and a position in the traversal cannot
 * disagree — which is the whole failure ADR-0121 §6's 2026-08-06 amendment was written to
 * end, arriving from a new direction.
 *
 * **CLOCK-FREE, and that is load-bearing.** No `nowMs` reaches here: a tick can never
 * renumber a pin (§6's own property) and it must never reorder a traversal either. The clock
 * enters exactly one line, in `buildPinOrderIndex`, deciding which of its own stops a
 * twice-visited place is currently about.
 *
 * The order is: the stay you woke in; then the day's stops by their moment, with one
 * connection collapsed to one stop and the clockless ones after; then the stay you are
 * sleeping in; then the **tail** — places on the day with no schedule slot at all, which
 * never entered this function's first step and are what "untimed items come after the timed
 * portion" actually names.
 *
 * **`ambient` is no longer excluded outright** (ADR-0054's 2026-08-25 amendment). A strictly
 * middle night of a stay is still backdrop as a PIN — {@link PIN_TIER} is untouched — and it
 * is now also the two ends of the day's route, because it is the one place you can be sure
 * you both started and finished at. Nothing else ambient enters.
 */
export function buildDayStopSequence(
  usages: readonly PlaceUsage[],
  ctx: DayStopContext,
): DayStop[] {
  const { nameOf, onDate, eventById, isConnectionStop, dawnMs } = ctx;
  // No day, no sequence to be an index in — and renumbering per day is worse than
  // nothing: two pins both reading `1` on one canvas, with nothing on either saying
  // which day it belongs to. Which is also why an all-days scope has no traversal:
  // there is no sequence to traverse rather than a control to disable (ADR-0182 §11).
  if (!onDate) return [];
  const onDay = usages
    .map((usage) => ({ usage, day: placeDay(usage, { onDate }) }))
    .filter((entry): entry is { usage: PlaceUsage; day: DayUsage } => hasScheduleSlot(entry.day));
  // Every stop of the day, each carrying the place it belongs to. A day usage always has at
  // least its own pointer to fall back on, so a place is never dropped for want of a moment.
  const stops = onDay.flatMap(({ usage, day }) =>
    (day.moments?.length
      ? day.moments
      : [{ at: day.at, eventId: day.eventId, edge: day.edge }]
    ).map((moment) => ({ usage, day, moment })),
  );
  // The day's own order, and no clock in it: stops carrying a moment sort by that moment,
  // the rest after (they cannot claim a position they do not have), then the manual
  // `sortOrder` and the name — the same tail `comparePlacesBySchedule` breaks its ties with.
  //
  // **It ORDERS on the instant and NUMBERS on `knowsMoment`, and the two questions are
  // deliberately different again** (ADR-0182 §3's 2026-08-25 amendment, reversing its
  // 2026-08-11 one *here only*). They were made one question so that a stop could not sort
  // as timed and read as unnumbered — right for a LIST, where a position is a claim about
  // the schedule, and `comparePlacesBySchedule` still asks it that way. This sequence is
  // now also the map's **route**, where a position is a claim about GEOGRAPHY: a car
  // collected "from 09:00" is somewhere you go at 09:00-ish, and sinking it to the day's
  // tail draws the line through it in an order you were never in. The number still refuses
  // to guess (`knowsMoment`, one block down); the line no longer has to.
  const clocked = (m: DayStopMoment) => m.at != null;
  stops.sort((a, b) => {
    if (clocked(a.moment) && clocked(b.moment) && a.moment.at !== b.moment.at)
      return a.moment.at! - b.moment.at!;
    if (clocked(a.moment) !== clocked(b.moment)) return clocked(a.moment) ? -1 : 1;
    const sa = a.day.sortOrder ?? 0;
    const sb = b.day.sortOrder ?? 0;
    if (sa !== sb) return sa - sb;
    return nameOf(a.usage).localeCompare(nameOf(b.usage));
  });
  // **ONE CONNECTION IS ONE STOP** (ADR-0171 §7). A layover contributes two moments —
  // the arrival of the leg that brings you in and the departure of the one that takes
  // you out — and they are not two visits, they are waiting. So two ADJACENT moments of
  // one place collapse when that place is a connection stop on this day, which is the
  // gate: adjacency alone is not evidence (an airport you land at in the morning and
  // return a car to at 18:00 is a genuine revisit), and a genuine LATER revisit is never
  // adjacent, because the stops you went to in between sit between them.
  //
  // This partly reverses ADR-0121 §6's 2026-08-06 amendment, and only there: "a place you
  // go to twice is two stops" still holds for a revisit, which is the case it was
  // reasoning about.
  const merged = stops.filter((stop, i) => {
    const prev = stops[i - 1];
    if (!prev || prev.usage.placeId !== stop.usage.placeId) return true;
    return !isConnectionStop?.(stop.usage.placeId, onDate);
  });
  // ── A DAY STARTS AND ENDS WHERE YOU SLEEP ───────────────────────────────────────────
  // (ADR-0054's 2026-08-25 amendment. Owner: _"on most days you can infer for certain that
  // you're gonna start the day in a hotel and end in a hotel, so you can add poly lines to
  // them and place them first/last on the schedule"_.)
  //
  // The stay you slept in is the one stop of the day nobody schedules and everybody makes,
  // and it was missing from this sequence for **two different reasons**, which is why one
  // fix could not have found it: a strictly middle night is `ambient`, which this function
  // drops as backdrop, and a check-in / check-out day carries a floor or a ceiling, which
  // the sort above used to sink past every stop that had a defensible clock.
  //
  // **A bookend is a POSITION, not a number.** `knowsMoment` still refuses the mark — "from
  // 15:00" is any hour after — so it joins the sequence and the map's route wearing nothing
  // (owner's call: _"sequence + route, no number"_), and the numbering below is untouched by
  // construction rather than by an exclusion.
  //
  // **Which end needs no third rule**: the stay covered last night → you woke there
  // (`first`); it covers tonight → you end there (`last`). So a check-in day is `last` only,
  // a check-out day `first` only, and a middle night is **both** — the day with a hotel at
  // each end. A day you change hotels gets A's check-out first and B's check-in last, for
  // free, because each answers about its own span.
  const first: DayStopEntry[] = [];
  const middle: DayStopEntry[] = [];
  const last: DayStopEntry[] = [];
  for (const stop of merged) {
    const ends = stayEnds(stop.day, onDate, eventById);
    if (!ends) {
      middle.push(stop);
      continue;
    }
    if (ends.first) first.push(stop);
    if (ends.last) last.push(stop);
    if (!ends.first && !ends.last) middle.push(stop);
  }
  // The nights `hasScheduleSlot` never let in. Same rule, second population — a middle night
  // has no edge and no clock at all, so it can only ever have been found this way.
  for (const usage of usages) {
    const day = placeDay(usage, { onDate });
    if (!day || hasScheduleSlot(day)) continue;
    const ends = stayEnds(day, onDate, eventById);
    if (!ends) continue;
    const stop = { usage, day, moment: { eventId: day.eventId, edge: day.edge } };
    if (ends.first) first.push(stop);
    if (ends.last) last.push(stop);
  }
  // **WHAT BROUGHT YOU IN THROUGH THE NIGHT SORTS BEFORE THE BED** — and this is the SECOND
  // answer this question has had, because the first one used a number that proves nothing.
  //
  // Earlier today this compared each stop against the stay's own `startsAt`, on the reasoning
  // that "nothing that happened before you arrived can sort after the stay you woke in". The
  // sentence is fine; `startsAt` is not the arrival. A lodging start is a **floor** — the hour
  // the room opens — which is exactly what `knowsMoment` already refuses to treat as a moment
  // (ADR-0171 §10b), and I then treated it as one. Owner's day: the room was available from
  // ⁦15:00⁩ the previous afternoon, they landed at ⁦23:20⁩, collected a car at ⁦00:00⁩ and reached
  // the hotel around ⁦02:00⁩. Every stop of the day is after ⁦15:00⁩ the day before, so the
  // comparison moved nothing and the route still ran bed → car.
  //
  // What actually separates "this brought me in" from "I left the hotel for this" is TWO
  // questions, and one alone gets the other case wrong:
  //
  //  - **Is it before dawn** (`dawnMs`, the day window's own 07:00 — ADR-0045/0037, resolved
  //    by the screen because a wall-clock hour needs a zone and this file has none). After
  //    dawn you are up and out, whatever it is.
  //  - **Is it a moment the app KNOWS** (`knowsMoment`). A ⁦06:30⁩ flight before dawn is an
  //    exact commitment you left the bed for, so the hotel still leads. A car "available from
  //    ⁦00:00⁩" is a floor: it claims no hour, and a floor in the small hours is the shape of
  //    a night arrival rather than of an early start.
  //
  // Its known cost, stated rather than buried: a pre-dawn stop with an EXACT time that you
  // genuinely went out for after checking in (a ⁦01:00⁩ table) keeps the hotel ahead of it. That
  // leaves the bookend where it was, which is the safer of the two wrong answers, and it is
  // the trade that buys the early-flight morning.
  const early = (stop: DayStopEntry) =>
    dawnMs != null &&
    stop.moment.at != null &&
    stop.moment.at < dawnMs &&
    !knowsMoment(stop.moment, eventById);
  const bookended = [
    ...middle.filter(early),
    ...first,
    ...middle.filter((s) => !early(s)),
    ...last,
  ];
  // **A NUMBER IS ONLY EVER THE INDEX OF A MOMENT THE APP KNOWS** (ADR-0171 §10b). A
  // number asserts "this is the Nth place you were at", and a floor, a ceiling and a row
  // with no clock cannot back that up: "from 15:00" is any hour after, and numbering a
  // check-out from its ceiling is what put the owner back in Iceland after landing in
  // Tel Aviv. The unknown ones keep their place in the list and lose the mark — so the
  // known stops still count 1, 2, 3 with no hole, unlike a filter's informative gaps,
  // because nothing is hidden here to hint at.
  let counted = 0;
  const sequence: DayStop[] = bookended.map((stop) => ({
    ...stop,
    order: knowsMoment(stop.moment, eventById) ? ++counted : undefined,
  }));
  // **THE TAIL** (ADR-0182 §2). `hasScheduleSlot` above wants `prominence === 'edge'` AND an
  // `eventId`, so an idea pencilled to this day with no event never entered the sequence at
  // all — while the list shows it, because the list asks the much wider `inDayScope`. That
  // gap IS the tail, and it is what the owner's "untimed items come after the timed portion"
  // names once a floor is understood to have an instant (§3).
  //
  // `ambient` is excluded rather than parked: a strictly middle night of a stay is backdrop,
  // not somewhere you step to, which {@link PIN_TIER} already says in those words.
  const tail = usages
    .map((usage) => ({ usage, day: placeDay(usage, { onDate }) }))
    .filter(
      (entry): entry is { usage: PlaceUsage; day: DayUsage } =>
        entry.day != null && entry.day.prominence !== 'ambient' && !hasScheduleSlot(entry.day),
    )
    // The same tie-break tail the timed sort ends with, so one comparator orders the whole
    // sequence rather than two that could drift.
    .sort(
      (a, b) =>
        (a.day.sortOrder ?? 0) - (b.day.sortOrder ?? 0) ||
        nameOf(a.usage).localeCompare(nameOf(b.usage)),
    )
    .map(({ usage, day }): DayStop => ({ usage, day, moment: {}, tail: true }));
  return [...sequence, ...tail];
}

/**
 * **Which of a place's stops the day is CURRENTLY about**, as an index into an ordered route.
 *
 * A place visited twice in one day is two stops, and since M7c's bookends that is the ORDINARY
 * case rather than an edge one: on a middle night the stay is the day's first stop and its last.
 * So "the stop you asked about" cannot be answered from a place id alone, and the reported defect
 * is what happens when you try — `findIndex` on a place id returns the FIRST occurrence, so
 * selecting the evening visit drew the leg into the morning one.
 *
 * The rule is not new and is deliberately not re-invented here: {@link relevantMoment} already
 * decides which visit a place is about, and {@link buildPinOrderIndex} already uses it to pick the
 * NUMBER the pin wears. Reading it here too is what makes the amber line agree with the badge on
 * the pin it is drawn to — which is the whole of what a reader expects when they tap `5` and watch
 * for a line from `4`.
 *
 * `-1` when the place is not in this route at all.
 */
export function stopIndexOf(
  route: readonly DayStop[],
  placeId: string,
  ctx: { eventById?: DayStopContext['eventById']; nowMs?: number } = {},
): number {
  const mine = route
    .map((stop, index) => ({ stop, index }))
    .filter(({ stop }) => stop.usage.placeId === placeId);
  if (mine.length === 0) return -1;
  if (mine.length === 1) return mine[0]!.index;
  const naming = relevantMoment(mine[0]!.stop.day, ctx.nowMs);
  if (!naming) return mine[0]!.index;
  const at = mine.find(
    ({ stop }) =>
      stop.moment.at === naming.at &&
      stop.moment.eventId === naming.eventId &&
      stop.moment.edge === naming.edge,
  );
  return (at ?? mine[0]!).index;
}

/**
 * **The one leg the day spends its solid amber on** (ADR-0206 §D8 / §AC2) — the journey INTO the
 * stop you are asking about: the selected one, or the next one in Trip mode.
 *
 * Pure and here rather than a `useMemo` in `screens/Map.tsx`, which is where it was when it got
 * the twice-visited case wrong: `frontend/CLAUDE.md` puts every decision about what the canvas
 * draws in a `lib/` function precisely so it can be tested without a renderer.
 *
 * `-1` for "spend none", which is a real answer: Plan mode with nothing selected spends no amber
 * at all (§AC1), and a route of fewer than two stops has no leg to spend it on.
 */
export function amberLegIndex(
  route: readonly DayStop[],
  ctx: {
    selectedPlaceId?: string;
    nextStopPlaceId?: string;
    eventById?: DayStopContext['eventById'];
    nowMs?: number;
  },
): number {
  if (route.length < 2) return -1;
  const asked = ctx.selectedPlaceId
    ? stopIndexOf(route, ctx.selectedPlaceId, ctx)
    : ctx.nextStopPlaceId
      ? stopIndexOf(route, ctx.nextStopPlaceId, ctx)
      : -1;
  if (asked < 0) return -1;
  // The day's first stop is the one place with no leg arriving at it, so it takes the leg
  // departing it instead. Leg `i` runs from stop `i` to stop `i + 1`.
  return Math.max(asked, 1) - 1;
}

export function buildPinOrderIndex(
  usages: readonly PlaceUsage[],
  ctx: DayStopContext & { nowMs?: number },
): Map<string, number> {
  const { onDate, nowMs } = ctx;
  if (!onDate) return new Map();
  // The one derivation, read rather than repeated (ADR-0182 §1). Only stops that carry a
  // number are candidates; the tail never had one and never will.
  const numbered = buildDayStopSequence(usages, ctx).filter((stop) => stop.order != null);
  // …and each place takes the number of the stop it is CURRENTLY about, which is the same
  // moment `placeMetaDay` puts on its row. This is the only line the clock reaches.
  const index = new Map<string, number>();
  for (const { usage, day } of numbered) {
    const naming = relevantMoment(day, nowMs);
    const at = numbered.find(
      (stop) =>
        stop.usage.placeId === usage.placeId &&
        (naming == null ||
          (stop.moment.at === naming.at &&
            stop.moment.eventId === naming.eventId &&
            stop.moment.edge === naming.edge)),
    );
    if (at) index.set(usage.placeId, at.order!);
  }
  return index;
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
  [PIN_TIER.ghost]: 1,
};
const NEXT_STOP_Z = 500;
const ORDER_SPREAD = 99;

/** An unsaved Google result's ring (ADR-0132 §6) sits **below every trip pin**, ghosts
 *  included: what you already have outranks what you might add, and a ring is legible
 *  under a teardrop anyway (it is a different silhouette, not a competing one). Named
 *  here beside `TIER_Z` rather than in the pane, because this is the same one ordering
 *  question — it just happens to be about a population that is not on the ladder. */
export const MAP_RESULT_Z = 0;

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

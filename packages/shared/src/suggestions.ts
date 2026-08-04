// A suggestion has a source, a score and a reason (ADR-0151). One shape, one
// registry, one entry point — so the second strategy is a registration and not an
// edit to every surface that ranks something.
//
// WHY THE INDIRECTION LOOKS LIKE OVERKILL RIGHT NOW. There is exactly one strategy
// registered (`near-the-day`, §3), so `suggestFor` currently does what calling it
// directly would do. That is expected and deliberate (ADR-0151 §2): the seam is the
// deliverable, because retrofitting one under a shipped `.sort()` is the more
// expensive half. Do not "simplify" it away.
//
// WHERE A STRATEGY RUNS IS A PROPERTY OF THE STRATEGY. `LOCAL` needs no key, no
// network and no money, so it runs in the browser and works offline; `REMOTE` bills
// for its answer and runs behind §4's endpoint, which is RESERVED AND NOT BUILT —
// there is no `REMOTE` strategy yet, and the placement split exists so adding one
// changes no surface.
import { z } from 'zod';
import { maybeItemSchema } from './entities';
import { haversineMeters, latLngSchema, type LatLng } from './geo';

/** The strategy that produced a suggestion (ADR-0095: named, never a bare string). */
export const SUGGESTION_SOURCE = {
  NEAR_THE_DAY: 'near-the-day',
  /** Which day does this dateless idea belong to (ADR-0151's 2026-08-04 amendment). */
  FITS_A_DAY: 'fits-a-day',
} as const;
export type SuggestionSource = (typeof SUGGESTION_SOURCE)[keyof typeof SUGGESTION_SOURCE];

export const SUGGESTION_PLACEMENT = { LOCAL: 'local', REMOTE: 'remote' } as const;
export type SuggestionPlacement = (typeof SUGGESTION_PLACEMENT)[keyof typeof SUGGESTION_PLACEMENT];

/** What a suggestion points at. The third tag is the whole point of ADR-0151 §6:
 *  an external candidate is NOT in the trip and owns no row until a human picks it,
 *  so nothing here may be persisted as a `MaybeItem`. Nothing emits it yet. */
export const SUGGESTION_REF = {
  MAYBE_ITEM: 'maybeItem',
  PLACE: 'place',
  EXTERNAL: 'external',
} as const;
export type SuggestionRefKind = (typeof SUGGESTION_REF)[keyof typeof SUGGESTION_REF];

export const suggestionRefSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal(SUGGESTION_REF.MAYBE_ITEM), id: z.string() }),
  z.object({ kind: z.literal(SUGGESTION_REF.PLACE), id: z.string() }),
  z.object({
    kind: z.literal(SUGGESTION_REF.EXTERNAL),
    googlePlaceId: z.string(),
    name: z.string(),
    at: latLngSchema.optional(),
  }),
]);
export type SuggestionRef = z.infer<typeof suggestionRefSchema>;

/** Why this strategy spoke (ADR-0151 §8). Required — a strategy that cannot say
 *  why it spoke has not finished — and STRUCTURED rather than a rendered string.
 *
 *  ADR-0151 §1 wrote "a rendered string"; the build reads that as "a reason the
 *  consumer renders", for two reasons that only show up in code. This package
 *  holds no UI copy (`packages/shared/CLAUDE.md`: it supplies stable keys, the
 *  frontend supplies Hebrew), and §4's endpoint returns `Suggestion[]` FROM THE
 *  SERVER — a rendered string would put Hebrew UI copy in a Nest service, against
 *  ADR-0009. The requirement §1 was making (a reason is never optional) is intact;
 *  only who spells it changes. Amended on ADR-0151 in place. */
export const SUGGESTION_REASON = {
  /** Nearest to a stop on the day being ranked. Params: `meters`, `stopName`. */
  NEAR_STOP: 'near-stop',
  /** Already pencilled in for another day, so it is spoken for. Param: `targetDate`. */
  AIMED_AT_DAY: 'aimed-at-day',
  /** Nothing spatial to say — no place, or a Place-lite with no coordinates — so
   *  what actually put it here is recency, and that is what it says. */
  RECENTLY_ADDED: 'recently-added',
  /** Nearest to a stop on ANOTHER day than the one being ranked — the day this idea
   *  looks like it belongs to. Params: `date`, `meters`, `stopName`.
   *
   *  A code rather than an optional `date` on `NEAR_STOP`: the union is discriminated and
   *  exhaustively rendered, so a new code makes every consumer declare what it says, while
   *  an optional field lets one silently print a distance with no day attached. */
  FITS_DAY: 'fits-day',
} as const;
export type SuggestionReasonCode = (typeof SUGGESTION_REASON)[keyof typeof SUGGESTION_REASON];

export const suggestionReasonSchema = z.discriminatedUnion('code', [
  z.object({
    code: z.literal(SUGGESTION_REASON.NEAR_STOP),
    meters: z.number(),
    stopName: z.string(),
  }),
  z.object({ code: z.literal(SUGGESTION_REASON.AIMED_AT_DAY), targetDate: z.string() }),
  z.object({ code: z.literal(SUGGESTION_REASON.RECENTLY_ADDED) }),
  z.object({
    code: z.literal(SUGGESTION_REASON.FITS_DAY),
    date: z.string(),
    meters: z.number(),
    stopName: z.string(),
  }),
]);
export type SuggestionReason = z.infer<typeof suggestionReasonSchema>;

export const suggestionSchema = z.object({
  source: z.enum([SUGGESTION_SOURCE.NEAR_THE_DAY, SUGGESTION_SOURCE.FITS_A_DAY]),
  ref: suggestionRefSchema,
  /** Comparable WITHIN ONE STRATEGY ONLY, higher is better. Scores from different
   *  strategies are not two readings of one quantity, so nothing may sort a merged
   *  list by it (ADR-0151 §2) — `suggestFor` interleaves by rank instead. */
  score: z.number(),
  reason: suggestionReasonSchema,
});
export type Suggestion = z.infer<typeof suggestionSchema>;

/** A place the day actually stops at, which is what proximity is measured against.
 *  `name` is carried because the reason names it ("0.3 ק״מ ממסעדת מון"). */
export const suggestionStopSchema = z.object({ name: z.string(), at: latLngSchema });
export type SuggestionStop = z.infer<typeof suggestionStopSchema>;

/** An idea plus where it is. A `MaybeItem` carries only a `placeId`, so the caller
 *  resolves the join; `at` is absent for an idea with no place, or one whose place
 *  is a Place-lite with no coordinates (ADR-0048). */
export const suggestionIdeaSchema = z.object({
  item: maybeItemSchema,
  at: latLngSchema.optional(),
});
export type SuggestionIdea = z.infer<typeof suggestionIdeaSchema>;

/** The owner's filters, typed once (ADR-0151 §2). */
export const suggestionContextSchema = z.object({
  /** The day being ranked for, ISO `YYYY-MM-DD`. */
  date: z.string(),
  /** Everywhere that day already stops. */
  dayStops: z.array(suggestionStopSchema),
  ideas: z.array(suggestionIdeaSchema),
  category: z.string().optional(),
  /** A narrower anchor than the whole day — the gap sheet passes the events on
   *  either side of the slot it was opened on. This is why the gap sheet is a
   *  different CONTEXT rather than a second strategy (ADR-0151 §3). */
  near: z.array(suggestionStopSchema).optional(),
  /** **Every day of the trip and where it stops**, for the strategy that answers "which day
   *  does this belong to" rather than "how does this rank for the day I am on" (ADR-0151's
   *  2026-08-04 amendment). Absent, or holding only `date`, means `fits-a-day` has nothing to
   *  say and stays silent — which is what every surface except the shelf passes.
   *
   *  Separate from `dayStops` rather than derived from it: `dayStops` is ONE day's, and the
   *  question this answers is about the others. */
  days: z.array(z.object({ date: z.string(), stops: z.array(suggestionStopSchema) })).optional(),
  limit: z.number().optional(),
});
export type SuggestionContext = z.infer<typeof suggestionContextSchema>;

export interface SuggestionStrategy {
  source: SuggestionSource;
  placement: SuggestionPlacement;
  run: (ctx: SuggestionContext) => Suggestion[];
}

/** Ideas with no target day lead: an idea pencilled in for Thursday is spoken for.
 *  This is ADR-0116 §2's own partition, preserved — the rank sorts WITHIN it, it
 *  never reorders across it. */
const TIER = { DATELESS: 1, AIMED_ELSEWHERE: 0 } as const;

/** Each tier owns half the [0,1] score range, so sorting by score descending
 *  reproduces the documented order exactly and the number stays a real quantity
 *  (how close, within how spoken-for) rather than a rank dressed up as a measure. */
const TIER_SPAN = 0.5;

/** Where proximity stops discriminating. Past this, two ideas are both simply
 *  "not near today", and recency decides — which is honest, and keeps one idea
 *  across town from outranking a placeless one purely on having coordinates. */
const FAR_M = 5_000;

const nearestStop = (at: LatLng, stops: SuggestionStop[]) =>
  stops.reduce<{ stop: SuggestionStop; meters: number } | null>((best, stop) => {
    const meters = haversineMeters(at, stop.at);
    return best && best.meters <= meters ? best : { stop, meters };
  }, null);

/** Proximity in [0,1]: 1 at the stop itself, 0 at `FAR_M` and beyond. Both strategies score
 *  the same quantity the same way — they differ in WHICH stops they measure against, which is
 *  the whole distinction between them. */
const proximityOf = (meters: number) => Math.max(0, 1 - meters / FAR_M);

/** ADR-0151 §3's first strategy, and the only `LOCAL` one. Ranks ideas ALREADY ON
 *  THE SHELF: it proposes nothing new, makes no network call and spends nothing.
 *  The user gets the same set in a better order with a reason attached. */
const nearTheDay: SuggestionStrategy = {
  source: SUGGESTION_SOURCE.NEAR_THE_DAY,
  placement: SUGGESTION_PLACEMENT.LOCAL,
  run(ctx) {
    const stops = ctx.near?.length ? ctx.near : ctx.dayStops;
    const ideas = ctx.category
      ? ctx.ideas.filter((i) => i.item.category === ctx.category)
      : ctx.ideas;

    const scored = ideas.map((idea) => {
      const tier = idea.item.targetDate ? TIER.AIMED_ELSEWHERE : TIER.DATELESS;
      const near = idea.at && stops.length ? nearestStop(idea.at, stops) : null;
      // Proximity in [0,1] within the tier: 1 at the stop itself, 0 at FAR_M and
      // beyond, and 0 with nothing to measure — so a located-but-distant idea and
      // a placeless one tie, and `createdAt` breaks it below.
      const proximity = near ? proximityOf(near.meters) : 0;
      const reason: SuggestionReason = near
        ? { code: SUGGESTION_REASON.NEAR_STOP, meters: near.meters, stopName: near.stop.name }
        : idea.item.targetDate
          ? { code: SUGGESTION_REASON.AIMED_AT_DAY, targetDate: idea.item.targetDate }
          : { code: SUGGESTION_REASON.RECENTLY_ADDED };
      return {
        suggestion: {
          source: SUGGESTION_SOURCE.NEAR_THE_DAY,
          ref: { kind: SUGGESTION_REF.MAYBE_ITEM, id: idea.item.id },
          score: tier * TIER_SPAN + proximity * TIER_SPAN,
          reason,
        } satisfies Suggestion,
        createdAt: idea.item.createdAt,
      };
    });

    scored.sort(
      (a, b) =>
        b.suggestion.score - a.suggestion.score ||
        // Newest first: a just-added idea is the one still on your mind. The
        // backend's `orderBy` (ADR-0151 §3) is what makes this tail deterministic.
        b.createdAt.localeCompare(a.createdAt),
    );
    return scored.map((s) => s.suggestion);
  },
};

/**
 * **ADR-0151's second `LOCAL` strategy** (2026-08-04 amendment): for a DATELESS idea, which
 * day of the trip does it look like it belongs to?
 *
 * A different question from `near-the-day`, which is why it is a strategy and not a parameter
 * on that one (§2's own rejected alternative): that one asks how an idea ranks for the day you
 * are looking at, and answers `recently-added` when it has nothing spatial to say. This one
 * asks which OTHER day the idea sits near, which is the fact that goes missing at volume —
 * with thirty researched places, finding that eight of them cluster around Thursday's plan
 * meant visiting every day and reading the shelf again.
 *
 * It speaks only where it has an answer, and that is what keeps it out of the way:
 *  - an idea with a `targetDate` is already spoken for (`near-the-day` says so);
 *  - an idea with no coordinates has nothing to measure;
 *  - the day being ranked is EXCLUDED — "it fits today" is `near-the-day`'s sentence, not a
 *    second opinion on it;
 *  - a day past `FAR_M` scores 0, which is "not near this day either", and is dropped rather
 *    than reported as a proposal with no content.
 */
const fitsADay: SuggestionStrategy = {
  source: SUGGESTION_SOURCE.FITS_A_DAY,
  placement: SUGGESTION_PLACEMENT.LOCAL,
  run(ctx) {
    const others = (ctx.days ?? []).filter((d) => d.date !== ctx.date && d.stops.length > 0);
    if (others.length === 0) return [];
    const ideas = ctx.category
      ? ctx.ideas.filter((i) => i.item.category === ctx.category)
      : ctx.ideas;

    const scored = ideas.flatMap((idea) => {
      if (idea.item.targetDate || !idea.at) return [];
      // The best day, not every day it is near: the question has one answer.
      const best = others.reduce<{ date: string; stop: SuggestionStop; meters: number } | null>(
        (acc, day) => {
          const near = nearestStop(idea.at!, day.stops);
          if (!near) return acc;
          return acc && acc.meters <= near.meters ? acc : { date: day.date, ...near };
        },
        null,
      );
      const proximity = best ? proximityOf(best.meters) : 0;
      // Nothing near enough to name a day is not a suggestion. `near-the-day` still ranks
      // this idea and still says `recently-added` about it, which is the honest answer.
      if (!best || proximity === 0) return [];
      return [
        {
          source: SUGGESTION_SOURCE.FITS_A_DAY,
          ref: { kind: SUGGESTION_REF.MAYBE_ITEM, id: idea.item.id },
          // No tier: every idea here is dateless, so the partition `near-the-day` preserves
          // has nothing to separate. The score is the proximity, whole.
          score: proximity,
          reason: {
            code: SUGGESTION_REASON.FITS_DAY,
            date: best.date,
            meters: best.meters,
            stopName: best.stop.name,
          },
        } satisfies Suggestion,
      ];
    });

    scored.sort((a, b) => b.score - a.score);
    return scored;
  },
};

/**
 * One entry per strategy (the ADR-0094 registry idiom). A second strategy is one line here; a
 * `REMOTE` one is that plus §4's handler.
 *
 * **`fits-a-day` leads deliberately.** `suggestFor` dedupes by ref keeping the first
 * occurrence, and interleaves by rank in this order — so for the few ideas `fits-a-day` can
 * speak about, its sentence wins, and `near-the-day` keeps every other idea and the ordering
 * of the rest. The consequence is that those ideas lead the pool, which is the intended
 * reading rather than a side effect: "this one fits Thursday, 300m from the museum" is a
 * stronger thing to know than "added recently". Registering it second would have made it dead
 * code, because `near-the-day` emits EVERY idea and would win every ref.
 */
export const SUGGESTION_STRATEGIES: readonly SuggestionStrategy[] = [fitsADay, nearTheDay];

/** Interleave by RANK, never by score (ADR-0151 §2): "0.3 km from lunch" and
 *  "popular in this area" are different claims, and normalising them would be
 *  false precision. Round-robin over each strategy's own ordering. */
function interleave(lists: Suggestion[][]): Suggestion[] {
  const merged: Suggestion[] = [];
  const depth = Math.max(0, ...lists.map((l) => l.length));
  for (let rank = 0; rank < depth; rank++) {
    for (const list of lists) if (rank < list.length) merged.push(list[rank]);
  }
  return merged;
}

/**
 * **One suggestion per thing suggested.** Two strategies can point at the same idea — the
 * shelf's two `LOCAL` ones do, by design — and a consumer maps a suggestion to a row, so a
 * duplicate ref is a duplicate row.
 *
 * First wins, which is why registry order is a decision (see `SUGGESTION_STRATEGIES`). This is
 * a property of MERGING, not of ranking: nothing here compares scores across strategies, so
 * ADR-0151 §2's rule is intact.
 */
function dedupeByRef(suggestions: Suggestion[]): Suggestion[] {
  const seen = new Set<string>();
  return suggestions.filter((s) => {
    const key = s.ref.kind === SUGGESTION_REF.EXTERNAL ? s.ref.googlePlaceId : s.ref.id;
    if (seen.has(`${s.ref.kind}:${key}`)) return false;
    seen.add(`${s.ref.kind}:${key}`);
    return true;
  });
}

/**
 * The one entry point. A surface calls this, never a strategy — which is what makes
 * the next strategy a registration rather than a hunt through call sites
 * (ADR-0151 §2). The shelf and the gap sheet both come through here and neither
 * knows `near-the-day` exists.
 */
export function suggestFor(ctx: SuggestionContext, placement: SuggestionPlacement): Suggestion[] {
  const lists = SUGGESTION_STRATEGIES.filter((s) => s.placement === placement).map((s) =>
    s.run(ctx),
  );
  // Dedupe BEFORE the limit, or a duplicate would spend one of the N slots.
  const merged = dedupeByRef(interleave(lists));
  return ctx.limit == null ? merged : merged.slice(0, ctx.limit);
}

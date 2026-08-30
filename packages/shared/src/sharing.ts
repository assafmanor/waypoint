// **The public face of a trip** (ADR-0213), and the contract both renderers read.
//
// Sharing has two audiences and two media: a live page read on a phone, and a fixed A4
// PDF. Each renders independently, but neither decides what is IN the itinerary — the
// server projects it once, into the shapes below, and both consume that. That is the
// whole privacy argument: a field the projection never carries cannot be revealed by a
// rendering bug, a client-side `hidden` class, or a future model prompt.
//
// So every object here is STRICT. An unknown key is a parse failure rather than a
// silently-passed-through field, in both directions: the server's own response is
// validated on the way out (`ZodSerializerDto`, ADR-0023), so a `select` that starts
// returning `googlePlaceId` fails the request instead of publishing it.
//
// **Times are pre-formatted here, deliberately.** `startLabel` is `HH:MM` already
// resolved in the event's display zone, not an instant — because the zone derivation is
// ADR-0107's and belongs in one place. Two renderers formatting two instants is exactly
// how a PDF prints an hour the app never showed. Labels that are *language* (weekday
// names, daypart words) are NOT here — those stay each renderer's own copy, since this
// package holds no UI strings (see this package's CLAUDE.md).
import { z } from 'zod';
import { entityIdSchema, isoDateTimeSchema, dateOnlySchema } from './schemas';
import { bookingTypeSchema, eventCategorySchema } from './entities';
import { LEG_TRAVEL_MODES } from './constants';

/** How much of the trip a link reveals. Three intents, not three amounts (ADR-0213 §1). */
export const SHARE_DETAIL_LEVEL = {
  /** Inspiration: identity, route, narrative, event titles. No exact facts. */
  SUMMARY: 'summary',
  /** Orientation: adds times, places, addresses, map links, travel legs. */
  FULL: 'full',
  /** Operation: Full plus the sensitive families the owner explicitly enabled. */
  EVERYTHING: 'everything',
} as const;
export type ShareDetailLevel = (typeof SHARE_DETAIL_LEVEL)[keyof typeof SHARE_DETAIL_LEVEL];

/**
 * The part of the day an event belongs to.
 *
 * A section heading over real events, never a decorative rail — the v2 mockup's
 * sunrise/sun/sunset/moon strip was rejected precisely because it labelled a day without
 * organizing anything in it. An empty daypart is not rendered, so these are groups, not
 * a fixed spine.
 */
export const SHARE_DAYPART = {
  MORNING: 'morning',
  NOON: 'noon',
  AFTERNOON: 'afternoon',
  EVENING: 'evening',
  NIGHT: 'night',
  /** No start time at all — an idea pinned to the day rather than to an hour. */
  FLEXIBLE: 'flexible',
} as const;
export type ShareDaypart = (typeof SHARE_DAYPART)[keyof typeof SHARE_DAYPART];

/** Rendering order. Flexible sits last: it is the day's unplaced remainder, not its night. */
export const SHARE_DAYPART_ORDER: readonly ShareDaypart[] = [
  SHARE_DAYPART.MORNING,
  SHARE_DAYPART.NOON,
  SHARE_DAYPART.AFTERNOON,
  SHARE_DAYPART.EVENING,
  SHARE_DAYPART.NIGHT,
  SHARE_DAYPART.FLEXIBLE,
];

/**
 * Where each daypart starts, as a local hour (ADR-0213 §1). Presentation policy, not
 * stored data — nothing on an `Event` records which part of the day it is in, and nothing
 * should: re-tuning these must not need a migration.
 *
 * Night wraps midnight, which is why it is the fallthrough rather than a range.
 */
export const SHARE_DAYPART_START_HOUR = {
  [SHARE_DAYPART.MORNING]: 5,
  [SHARE_DAYPART.NOON]: 12,
  [SHARE_DAYPART.AFTERNOON]: 14,
  [SHARE_DAYPART.EVENING]: 18,
  [SHARE_DAYPART.NIGHT]: 22,
} as const;

/**
 * The local hour an instant reads as in a named zone, 0-23.
 *
 * `formatToParts` rather than `format`: a bare `format` with only `hour` set is free to
 * return `"09"`, `"9"`, or `"09時"` depending on the locale's ICU data, and `Number()` of
 * the last one is `NaN`. The part is the number regardless.
 */
function localHour(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  return Number(parts.find((part) => part.type === 'hour')?.value ?? NaN);
}

/**
 * The daypart an event's displayed start falls in — the one derivation the public page
 * and the PDF share.
 *
 * @param startsAt the event's start instant, or null for an event with no time
 * @param displayTimezone the zone the app SHOWS this event in (ADR-0107 §4's resolver),
 *   not the trip's primary zone and not the viewer's — a shared page reads the same wall
 *   clock the travellers do.
 */
export function shareDaypart(
  startsAt: string | Date | null,
  displayTimezone: string,
): ShareDaypart {
  if (!startsAt) return SHARE_DAYPART.FLEXIBLE;
  const hour = localHour(startsAt instanceof Date ? startsAt : new Date(startsAt), displayTimezone);
  if (!Number.isFinite(hour)) return SHARE_DAYPART.FLEXIBLE;
  if (hour >= SHARE_DAYPART_START_HOUR.night) return SHARE_DAYPART.NIGHT;
  if (hour >= SHARE_DAYPART_START_HOUR.evening) return SHARE_DAYPART.EVENING;
  if (hour >= SHARE_DAYPART_START_HOUR.afternoon) return SHARE_DAYPART.AFTERNOON;
  if (hour >= SHARE_DAYPART_START_HOUR.noon) return SHARE_DAYPART.NOON;
  if (hour >= SHARE_DAYPART_START_HOUR.morning) return SHARE_DAYPART.MORNING;
  return SHARE_DAYPART.NIGHT;
}

/**
 * **The share's day starts at dawn, and the grouping has to agree with the sections.**
 *
 * `shareDaypart` already says so — `night` is the FALLTHROUGH below hour 5, which is the
 * same statement as "05:00 begins the day". The day grouping did not honour it, so a
 * landing at 00:30 was filed on its own calendar date and, because `night` renders last,
 * printed at the BOTTOM of that card, under an evening that happened nineteen hours later
 * (owner, 2026-08-30: _"The night part gets folded at the end of the wrong day. I think
 * that up until some late point it should still count the night of the previous day"_).
 *
 * Note that this is a **share-only** rule and does not contradict the app's own day
 * surfaces: those sort by `startsAt`, so the same event already reads first in its day
 * there. It is grouping by daypart that turns a pre-dawn hour into a trailing one, so it is
 * grouping by daypart that owes the correction.
 *
 * Presentation policy like the hours themselves — nothing stored moves, and `Event.date`
 * remains what the traveller authored.
 */
export function sharePreviousNight(
  startsAt: string | Date | null,
  displayTimezone: string,
): boolean {
  if (!startsAt) return false;
  const hour = localHour(startsAt instanceof Date ? startsAt : new Date(startsAt), displayTimezone);
  return Number.isFinite(hour) && hour < SHARE_DAYPART_START_HOUR.morning;
}

/** `HH:MM` in a named zone — the only time formatting the projection does. */
export function shareTimeLabel(instant: string | Date, displayTimezone: string): string {
  const date = instant instanceof Date ? instant : new Date(instant);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: displayTimezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

/**
 * **The punctuation a composed public line is made of** — not copy, and that distinction is
 * what lets it live in this package (see this package's `CLAUDE.md`). A separator and an
 * arrow carry no language; the words around them are each renderer's own.
 *
 * `ROUTE_ARROW` is wrapped in an LRI/PDI pair so its rendered direction is a **constant**.
 * Chromium leaves `←` unmirrored at either base direction, but mirroring an arrow inside an
 * RTL run is something the bidi algorithm permits, and the whole point of this line is that
 * the same route renders the same way on the page and on the paper (ADR-0118).
 *
 * They are here rather than in the backend's narrative module because **both renderers now
 * compose the route themselves**: the projection ships a day's two endpoints and a kind, so
 * the words can differ per renderer while the punctuation between them cannot.
 */
export const NARRATIVE_SEPARATOR = ' · ';
const LEFT_TO_RIGHT_ISOLATE = '\u2066';
const POP_DIRECTIONAL_ISOLATE = '\u2069';
export const ROUTE_ARROW = `${LEFT_TO_RIGHT_ISOLATE} ← ${POP_DIRECTIONAL_ISOLATE}`;

/**
 * **What a day's headline SAYS, as a kind plus its values — never as a sentence.**
 *
 * The projection used to ship `title` already joined (`נתב״ג ← קפלוויק`), which is why no
 * renderer could ever say _"טסים לאיסלנד"_: a server that holds no UI copy can only join
 * data with punctuation, so every day of every trip got the same shape of line however
 * little it said (owner, 2026-08-30: _"Some day titles could also be derived (flying to
 * Iceland, flying back…)"_).
 *
 * The repair is the one `journey.mode` already made one field over — **ship the
 * discriminant**. Each renderer keys its own words off the kind and isolates the values
 * with its own bidi helper, so the page and the PDF say the same thing in the same words
 * from one derivation, and a second locale is a second word table rather than a second
 * derivation.
 */
export const SHARE_DAY_KIND = {
  /** The trip's outbound flight day. `to` is where the trip is going. */
  FLIGHT_OUT: 'flightOut',
  /** The trip's returning flight day. Carries no value — "home" is not a place we know. */
  FLIGHT_HOME: 'flightHome',
  /** Any other flight day. `to` is where it lands. */
  FLIGHT: 'flight',
  /** Moved between two stops that are not the same. */
  ROUTE: 'route',
  /** Spent somewhere. */
  PLACE: 'place',
  /** **The region the day's stops share** (`P131`) — the best name a day can have, because
   *  it is where you WERE rather than what you happened to stop at. */
  REGION: 'region',
  /** **What the day's stops ARE** (`P31`), when a clear majority agree. Four waterfalls is
   *  a day of waterfalls. Below `region`: where beats what. */
  KIND: 'kind',
  /** Prose from a generator, which has no kind to key off (ADR-0213 §2). */
  TEXT: 'text',
  /** Nothing true to say. The renderer falls back to the date — inventing a title here is
   *  exactly the mandatory day title the owner rejected. */
  NONE: 'none',
} as const;
export type ShareDayKind = (typeof SHARE_DAY_KIND)[keyof typeof SHARE_DAY_KIND];

export const sharedDayTitleSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal(SHARE_DAY_KIND.FLIGHT_OUT), to: z.string() }),
  z.strictObject({ kind: z.literal(SHARE_DAY_KIND.FLIGHT_HOME) }),
  z.strictObject({ kind: z.literal(SHARE_DAY_KIND.FLIGHT), to: z.string() }),
  z.strictObject({ kind: z.literal(SHARE_DAY_KIND.ROUTE), from: z.string(), to: z.string() }),
  z.strictObject({ kind: z.literal(SHARE_DAY_KIND.PLACE), at: z.string() }),
  /** **The region the day's stops share** — Wikidata `P131`, resolved for each place and
   *  taken when a clear majority of the day agrees. A day whose eleven stops are all in
   *  Skútustaðahreppur is `מיוואטן`, not two of its waterfalls' names. */
  z.strictObject({ kind: z.literal(SHARE_DAY_KIND.REGION), at: z.string() }),
  /** **What the day's stops ARE, when they agree** — Wikidata `P31`, resolved to a class
   *  noun. Four waterfalls in one day is a day of waterfalls, and that is a better name
   *  than any two of them. Below `region` because where you were beats what you saw. */
  z.strictObject({ kind: z.literal(SHARE_DAY_KIND.KIND), of: z.string() }),
  z.strictObject({ kind: z.literal(SHARE_DAY_KIND.TEXT), text: z.string() }),
  z.strictObject({ kind: z.literal(SHARE_DAY_KIND.NONE) }),
]);
export type SharedDayTitle = z.infer<typeof sharedDayTitleSchema>;

/**
 * **A day's second line, and it must not repeat the first.**
 *
 * It shipped as the first two event titles joined, which on a flight day printed two
 * airport names under a headline made of the same two airport names. What a reader
 * actually wants from a day's second line is **where they sleep** — so a day holding a
 * lodging says so, and only a day with no bed to name falls back to what it holds.
 */
export const SHARE_DAY_SUMMARY_KIND = {
  /** `place` is where the night is. */
  STAY: 'stay',
  /** `titles` are event titles, already filtered of anything the headline said. */
  EVENTS: 'events',
  TEXT: 'text',
  NONE: 'none',
} as const;
export type ShareDaySummaryKind =
  (typeof SHARE_DAY_SUMMARY_KIND)[keyof typeof SHARE_DAY_SUMMARY_KIND];

export const sharedDaySummarySchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal(SHARE_DAY_SUMMARY_KIND.STAY), place: z.string() }),
  z.strictObject({
    kind: z.literal(SHARE_DAY_SUMMARY_KIND.EVENTS),
    titles: z.array(z.string()).min(1),
  }),
  z.strictObject({ kind: z.literal(SHARE_DAY_SUMMARY_KIND.TEXT), text: z.string() }),
  z.strictObject({ kind: z.literal(SHARE_DAY_SUMMARY_KIND.NONE) }),
]);
export type SharedDaySummary = z.infer<typeof sharedDaySummarySchema>;

// ── Owner-side configuration ────────────────────────────────────────────────────────

export const shareDetailLevelSchema = z.enum([
  SHARE_DETAIL_LEVEL.SUMMARY,
  SHARE_DETAIL_LEVEL.FULL,
  SHARE_DETAIL_LEVEL.EVERYTHING,
]);

export const shareDaypartSchema = z.enum([
  SHARE_DAYPART.MORNING,
  SHARE_DAYPART.NOON,
  SHARE_DAYPART.AFTERNOON,
  SHARE_DAYPART.EVENING,
  SHARE_DAYPART.NIGHT,
  SHARE_DAYPART.FLEXIBLE,
]);

/**
 * The four sensitive families, each independently chosen and each off by default.
 *
 * Files are not here because a file is chosen one at a time (`documentIds`), not as a
 * family — "share my documents" is a promise nobody can check, and the mockup's per-file
 * checkboxes are the approved control. Financial data has no member at all in v1: no
 * approved control exposes it, so the safe default is that the shape cannot express it.
 */
export const shareSensitiveFieldsSchema = z.strictObject({
  /** Confirmation codes, room/unit numbers, WiFi — a `Booking`'s operational secrets. */
  bookingSecrets: z.boolean(),
  /** Notes and tasks attached to shared itinerary rows. */
  notesAndTasks: z.boolean(),
  /** Traveller display names. Never email, ever — there is no toggle that reveals one. */
  travelerIdentity: z.boolean(),
});
export type ShareSensitiveFields = z.infer<typeof shareSensitiveFieldsSchema>;

export const NO_SENSITIVE_FIELDS: ShareSensitiveFields = {
  bookingSecrets: false,
  notesAndTasks: false,
  travelerIdentity: false,
};

const anySensitiveEnabled = (fields: ShareSensitiveFields): boolean =>
  Object.values(fields).some(Boolean);

/**
 * What the owner sends to configure the one link.
 *
 * The cross-field refusal is the point: a client cannot enable a sensitive family while
 * asking for Summary or Full and hope the server sorts it out later. Below Everything the
 * only accepted value is off, so the level and the exposure can never disagree — and the
 * stored row can be trusted by the projection without re-deriving the rule.
 */
export const upsertTripShareSchema = z
  .strictObject({
    detailLevel: shareDetailLevelSchema,
    sensitive: shareSensitiveFieldsSchema,
    documentIds: z.array(entityIdSchema).max(50),
  })
  .refine(
    (input) =>
      input.detailLevel === SHARE_DETAIL_LEVEL.EVERYTHING ||
      (!anySensitiveEnabled(input.sensitive) && input.documentIds.length === 0),
    { message: 'sensitive fields require the everything detail level' },
  );
export type UpsertTripShareInput = z.infer<typeof upsertTripShareSchema>;

/** A root-relative public path, never an origin: the client owns which host it is on
 *  (`lib/invite-link.ts`), exactly as the invite link already does (ADR-0067). */
const publicSharePathSchema = z
  .string()
  .regex(/^\/s\/[1-9A-HJ-NP-Za-km-z]{8}$/, 'expected a root-relative /s/<code> path');

export const tripShareConfigSchema = z.strictObject({
  code: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{8}$/),
  shareUrl: publicSharePathSchema,
  detailLevel: shareDetailLevelSchema,
  sensitive: shareSensitiveFieldsSchema,
  documentIds: z.array(entityIdSchema),
  updatedAt: isoDateTimeSchema,
});
export type TripShareConfig = z.infer<typeof tripShareConfigSchema>;

// ── The public projection ───────────────────────────────────────────────────────────

/**
 * **How a trip MOVES, which is a different question from where it goes** (owner,
 * 2026-08-30, reading the reference render's `רייקיאוויק ← סנייפלסנס`: _"it is actually a
 * circumnavigation (טיול מתגלגל maybe), where you switch locations every day … Then
 * there's טיול כוכב where you stay at one place"_).
 *
 * Two trips with identical destinations and day counts are read completely differently
 * depending on this, and the page was saying nothing about it — worse, it was printing a
 * ROUTE for both, which on a star trip is actively false: every day of one starts and ends
 * at the same base, so `base ← somewhere` describes the commute rather than the day.
 *
 * **Derived from the run-length encoding of `day.stay`, and nothing else.** Consecutive
 * nights in one place are one base; the number of bases and whether the last is the first
 * are the whole classification. No new column, no heuristic over distances, and it is
 * `unknown` for a trip that records no nights at all — which is a real state (a day trip,
 * or a trip whose lodging was never entered) and not a failure.
 */
export const SHARE_TRIP_SHAPE = {
  /** One base for the whole trip; you go out and come back to the same bed. */
  BASE: 'base',
  /** Several bases, ending where it started — a ring road, a circuit. */
  LOOP: 'loop',
  /** Several bases, ending somewhere else — a one-way traverse. */
  LINE: 'line',
  /** No nights recorded. Says so rather than guessing. */
  UNKNOWN: 'unknown',
} as const;
export type ShareTripShape = (typeof SHARE_TRIP_SHAPE)[keyof typeof SHARE_TRIP_SHAPE];
export const shareTripShapeSchema = z.enum([
  SHARE_TRIP_SHAPE.BASE,
  SHARE_TRIP_SHAPE.LOOP,
  SHARE_TRIP_SHAPE.LINE,
  SHARE_TRIP_SHAPE.UNKNOWN,
]);

/**
 * The bases a trip sleeps at, in order, with consecutive repeats collapsed — and the shape
 * that follows from them. One function so the projection, a renderer and a test cannot
 * disagree about what a base is.
 */
export function tripShapeOf(stays: readonly (string | undefined)[]): {
  shape: ShareTripShape;
  baseCount: number;
} {
  const bases: string[] = [];
  for (const stay of stays) {
    const value = stay?.trim();
    if (!value) continue;
    if (bases[bases.length - 1] === value) continue;
    bases.push(value);
  }
  if (bases.length === 0) return { shape: SHARE_TRIP_SHAPE.UNKNOWN, baseCount: 0 };
  if (bases.length === 1) return { shape: SHARE_TRIP_SHAPE.BASE, baseCount: 1 };
  // **The count is of DISTINCT bases, not of runs.** A trip that leaves Reykjavík, tours
  // the ring and comes home sleeps there twice — calling that seven bases would say it
  // stayed somewhere it did not.
  const distinct = new Set(bases).size;
  return {
    shape: bases[0] === bases[bases.length - 1] ? SHARE_TRIP_SHAPE.LOOP : SHARE_TRIP_SHAPE.LINE,
    baseCount: distinct,
  };
}

/**
 * **One operational fact, attached to the row it belongs to** (ADR-0213's 2026-08-30
 * amendment, reversing §4's appendix).
 *
 * §4 grouped this material at the foot of the document "so a reader can see exactly what
 * was published". The owner's verdict on the shipped result was that _"nothing is linked
 * to the events"_ — and the grouping was never a privacy requirement, only a missing
 * join: `Note.eventId|bookingId|placeId|documentId` is a closed union present since the
 * first migration, `DocumentAttachment` binds a file to an event or a booking, and
 * `Event.bookingId` is `@unique`. What §4 actually wanted — the owner being able to see
 * what a level publishes — is answered by the share sheet, which is where the owner is.
 *
 * Still governed entirely by the sensitive-field toggles: an op only exists here when its
 * family is switched on, which is the same gate the appendix had.
 */
export const SHARE_OP_KIND = { CODE: 'code', NOTE: 'note', TASK: 'task', FILE: 'file' } as const;
export type ShareOpKind = (typeof SHARE_OP_KIND)[keyof typeof SHARE_OP_KIND];

export const sharedOpSchema = z.discriminatedUnion('kind', [
  /** A booking reference. `provider` and `code` stay separate values rather than one
   *  composed string, for the reason the day title had to stop being one: a renderer
   *  that wants to make the code copyable needs to know which half is the code. */
  z.strictObject({
    kind: z.literal(SHARE_OP_KIND.CODE),
    code: z.string(),
    provider: z.string().optional(),
  }),
  z.strictObject({
    kind: z.literal(SHARE_OP_KIND.NOTE),
    title: z.string().optional(),
    body: z.string().optional(),
  }),
  z.strictObject({ kind: z.literal(SHARE_OP_KIND.TASK), title: z.string() }),
  z.strictObject({
    kind: z.literal(SHARE_OP_KIND.FILE),
    /** The bearer download handle under the share's own code — §1's single exception,
     *  unchanged by the move out of the appendix. */
    handle: z.string(),
    title: z.string(),
    mimeType: z.string(),
  }),
]);
export type SharedOp = z.infer<typeof sharedOpSchema>;

/**
 * **One leg of a journey that has several** (ADR-0213's 2026-08-30 amendment; owner:
 * _"Layovers must be represented … Flights should be clumped together, not split by
 * days"_).
 *
 * Nothing about this is stored. Legs chain exactly when the previous one's `toPlaceId` is
 * this one's `fromPlaceId`, and the wait is the gap between the previous `endsAt` and this
 * `startsAt` — both derivable today, which is why the half-built `connectsToPrevious`
 * columns written for this were reverted rather than migrated.
 */
export const sharedLegSchema = z.strictObject({
  title: z.string(),
  /** `TLV → VIE`, where there is room for it. ADR-0166 §18 keeps the IATA code off
   *  row-shaped surfaces because it doubles their width; inside a journey block there is a
   *  second line for it, and a code is what you check against a boarding pass. */
  code: z.string().optional(),
  startLabel: z.string().optional(),
  endLabel: z.string().optional(),
  /** The wait **before** this leg. Absent on the first leg, which nothing precedes. */
  layoverMinutes: z.number().int().positive().optional(),
});
export type SharedLeg = z.infer<typeof sharedLegSchema>;

/**
 * One event as the public sees it.
 *
 * Everything optional is absent at Summary — absent, not empty-string or null, so a
 * renderer that forgets to branch shows nothing rather than a stray colon. There is no
 * id, no `placeId`, no coordinates and no `googlePlaceId`: the map link is a URL built
 * server-side from the public display name, so the reader can open a map without the
 * projection carrying a location the owner did not publish.
 */
export const sharedEventSchema = z.strictObject({
  title: z.string(),
  icon: z.string().nullish(),
  /** **The enum, not a free string**, for the reason `journey.mode` is one: a renderer
   *  keys a word off it. It was `z.string()` while nothing read it. */
  category: eventCategorySchema.nullish(),
  /** **What this row IS, when a booking says so** (owner, 2026-08-30: _"hotels and other
   *  derivable stuff texts should be enhanced … and that also includes bookings"_). The
   *  type, never the booking — a `hotel` here lets a renderer print `לינה` beside the
   *  hotel's own name, and carries none of the booking's operational content, which stays
   *  behind the Everything appendix. Absent on an event no booking backs, so a renderer
   *  captions nothing it cannot name. */
  bookingType: bookingTypeSchema.optional(),
  daypart: shareDaypartSchema,
  /** True for a real commitment (ADR-0011) — a flight, a reservation. Renders firmer. */
  hard: z.boolean().optional(),
  /** Full and above. `HH:MM` in the event's own display zone. */
  startLabel: z.string().optional(),
  endLabel: z.string().optional(),
  placeName: z.string().optional(),
  address: z.string().optional(),
  mapUrl: z.string().url().optional(),
  /** **What this place IS, in one line** (owner, 2026-08-30, choosing every level: a
   *  stop's description is public knowledge about a public place and reveals nothing about
   *  the trip). From the stored Wikipedia `summary` enrichment, `he` then `en` — so it is
   *  absent for a car park and present for a waterfall, which is the right asymmetry. */
  caption: z.string().optional(),
  /** **The legs, when this row is a journey rather than a stop.** At least two, or it is
   *  not a journey. A renderer that ignores this still draws one correct row: the title is
   *  the whole journey and `startLabel`/`endLabel` are its first departure and last
   *  arrival, so the degradation is a summary rather than a hole. */
  legs: z.array(sharedLegSchema).min(2).optional(),
  /** **The operational material that belongs to THIS row**, at Everything and only for the
   *  families the owner switched on. Absent, not empty, when there is none. */
  ops: z.array(sharedOpSchema).optional(),
  /** The journey INTO this event, when one is already stored (ADR-0205). Full and above. */
  journey: z
    .strictObject({
      /** **The enum, not a free string** — a reader keys both a word and an icon off it,
       *  which is the definition of a discriminant (`packages/shared/CLAUDE.md`). It was
       *  `z.string()`, and both renderers answered by dropping the mode entirely: a 121-min
       *  walk and a 67-min drive printed as the same shape of line (owner, 2026-08-30). */
      mode: z.enum(LEG_TRAVEL_MODES),
      minutes: z.number().int().nonnegative(),
      km: z.number().nonnegative(),
    })
    .optional(),
});
export type SharedEvent = z.infer<typeof sharedEventSchema>;

export const sharedDaypartSectionSchema = z.strictObject({
  daypart: shareDaypartSchema,
  events: z.array(sharedEventSchema).min(1), // an empty section is never projected
});

/** **A photo of the day's most significant stop, or nothing at all** (owner, 2026-08-30,
 *  reversing ADR-0213 §3's refusal of imagery).
 *
 *  §3 refused "stock photography, generated imagery" and a cover upload, and none of those
 *  describe this: a Commons photo resolved through Wikidata `P18` is already in the store,
 *  already licensed, already credited, and already rendered elsewhere in the app. What §3
 *  was protecting against was a new media dependency, and there is not one.
 *
 *  **The absence is part of the design.** A day whose stops clear no confidence gate gets
 *  no photo — not a gradient, not a map tile, not the trip's own image repeated. Nine days
 *  with photos and three without reads as honest; three days showing the wrong mountain
 *  destroys trust in the other nine. */
export const sharedPhotoSchema = z.strictObject({
  /** **Root-relative, like every other path this contract carries** (`shareUrl`, a
   *  document's download path). `deliveredImageValueSchema` says why: the server has no
   *  reliable view of its own public origin, so it never writes one. A `z.string().url()`
   *  here rejected every real value — caught by the first test that fed the projection a
   *  real delivered image rather than a hand-written fixture. */
  url: z.string().regex(/^\/[^\s]*$/, 'must be a root-relative path'),
  /** The subject, for the alt text and the caption. Which stop this is a picture OF is a
   *  fact the reader needs — an unlabelled photo of a waterfall on a day with four of them
   *  says nothing. */
  of: z.string(),
  /** Required, never optional: 27 of the 32 Commons files ADR-0166 §12.2 surveyed demand
   *  attribution, so a credit that a renderer could forget is a licensing breach waiting. */
  credit: z.string(),
});
export type SharedPhoto = z.infer<typeof sharedPhotoSchema>;

export const sharedDaySchema = z.strictObject({
  ordinal: z.number().int().positive(),
  date: dateOnlySchema,
  title: sharedDayTitleSchema,
  summary: sharedDaySummarySchema,
  /** **Where you sleep, as the day's frame rather than a row in its afternoon** (owner,
   *  2026-08-30: _"Bad event ordering when it comes to the flights and hotels"_). A lodging
   *  event sorts by its check-in hour, so on the outbound day it landed between the two
   *  flight legs — reading as if you leave the airport in Vienna to sleep, then fly on. It
   *  is also what made a stay print `15:00–11:00`, a range that reads backwards because it
   *  spans midnight. A stay is not an event at 15:00; it is the roof over the day. */
  stay: z.string().optional(),
  photo: sharedPhotoSchema.optional(),
  sections: z.array(sharedDaypartSectionSchema),
});
export type SharedDay = z.infer<typeof sharedDaySchema>;

/** Where the narrative on the page came from. Shown to nobody; it exists so a failed
 *  model reads as a fallback in the logs rather than as missing trip data. */
export const NARRATIVE_SOURCE = { DETERMINISTIC: 'deterministic', GENERATED: 'generated' } as const;
export type NarrativeSource = (typeof NARRATIVE_SOURCE)[keyof typeof NARRATIVE_SOURCE];

/**
 * **The trip's fixed points, five lines above the seventy-nine** (owner, 2026-08-30:
 * _"Maybe these sharings should have sections for important stuff, like flights,
 * reservations etc."_).
 *
 * Not a tab — ADR-0004 forbids one and the day spine stays the spine — and not a second
 * schedule. It is the answer to what a reader looks for first and what they screenshot:
 * the flights, the car, the nights, the booked tours. Derived, never authored: a row is
 * here exactly when its event is hard (ADR-0011) or a booking backs it.
 *
 * **At every level, including Summary.** These are the facts a Summary reader most needs
 * and they carry no address, no code and no exact clock — a date and what the thing is.
 */
export const sharedCommitmentSchema = z.strictObject({
  bookingType: bookingTypeSchema,
  title: z.string(),
  /** The second line — a route's waypoint, a stay's town. Absent where there is nothing
   *  true to add; a guess in this slot is worse than a gap. */
  detail: z.string().optional(),
  date: dateOnlySchema,
  /** A stay spans nights, so it names both ends. Absent for a point in time. */
  endDate: dateOnlySchema.optional(),
  /** Which day to jump to. An ordinal rather than a date because the reader page's anchors
   *  are ordinals, and a date would make the renderer look the day up to find out. */
  dayOrdinal: z.number().int().positive(),
  /** **The operational material of a commitment that has no row of its own** — which is
   *  every stay, since a stay became the day's frame rather than an event in its afternoon.
   *  Its confirmation code and the note about which gate to use would otherwise have been
   *  lifted out of the schedule with it and dropped, and this block is where a reader looks
   *  for a hotel anyway. Same toggles, same gate. */
  ops: z.array(sharedOpSchema).optional(),
});
export type SharedCommitment = z.infer<typeof sharedCommitmentSchema>;

/**
 * **What is attached to nothing** — and, since ADR-0213's 2026-08-30 amendment, only that.
 *
 * This used to carry every booking, note, task and file in the trip as four flat lists at
 * the foot of the document. Everything with a host now travels on its host (`SharedOp`),
 * so what is left here is the material that genuinely belongs to the trip rather than to
 * any one moment in it: the packing list, the group's own reminders, a document nobody
 * attached. That is a real category and it deserves a real name in each renderer —
 * `לקראת הנסיעה`, not `פרטים נוספים`.
 *
 * **`notesAndTasks` is also where a privacy defect lived.** The share sheet promises
 * `רק תוכן שמחובר למסלול` and `buildAppendix` queried `where: { tripId }` with no linkage
 * filter, so a trip's every note was published under a control that said it would not be.
 * Splitting attached from unattached is what makes that promise true rather than a caption.
 */
export const sharedAppendixSchema = z.strictObject({
  notesAndTasks: z
    .array(z.strictObject({ title: z.string(), lines: z.array(z.string()) }))
    .optional(),
  travelers: z.array(z.string()).optional(),
  documents: z
    .array(
      z.strictObject({
        /** The one identifier the projection carries, and only as a bearer download
         *  handle under the share's own code — never a trip-scoped reference. */
        handle: z.string(),
        title: z.string(),
        mimeType: z.string(),
      }),
    )
    .optional(),
});
export type SharedAppendix = z.infer<typeof sharedAppendixSchema>;

export const sharedItinerarySchema = z.strictObject({
  status: z.literal('live'),
  detailLevel: shareDetailLevelSchema,
  generatedAt: isoDateTimeSchema,
  shareUrl: publicSharePathSchema,
  trip: z.strictObject({
    name: z.string(),
    destination: z.string(),
    icon: z.string().nullish(),
    startDate: dateOnlySchema,
    endDate: dateOnlySchema,
    dayCount: z.number().int().positive(),
    eventCount: z.number().int().nonnegative(),
    /** Ordered destination labels — the compact route strip, built from real stops
     *  rather than a cover photo or a static map (ADR-0213 §3). Capped, so it is what the
     *  strip DRAWS and never how many places the trip visits. */
    routeLabels: z.array(z.string()),
    /** **How many stops the route actually has.** `routeLabels.length` was being printed
     *  as the trip's `אזורים` count, and it is the capped strip: a twenty-stop trip
     *  reported eight (owner, 2026-08-30, reading the PDF masthead). */
    routeStopCount: z.number().int().nonnegative(),
    /** **How the trip moves** — see `tripShapeOf`. A renderer keys a word off it, which is
     *  what makes it an enum and not a boolean pair. */
    shape: shareTripShapeSchema,
    /** How many distinct places the trip sleeps at. `0` when no nights are recorded. */
    baseCount: z.number().int().nonnegative(),
  }),
  narrative: z.strictObject({
    source: z.enum([NARRATIVE_SOURCE.DETERMINISTIC, NARRATIVE_SOURCE.GENERATED]),
    title: z.string(),
    summary: z.string(),
  }),
  days: z.array(sharedDaySchema),
  /** Empty for a trip with nothing booked, which is a real state and not an error — a
   *  renderer draws no block rather than an empty one. */
  commitments: z.array(sharedCommitmentSchema),
  appendix: sharedAppendixSchema.optional(),
});
export type SharedItinerary = z.infer<typeof sharedItinerarySchema>;

// ── The model boundary ──────────────────────────────────────────────────────────────

/** Length ceilings on generated prose. A model that returns an essay is not returning a
 *  day title, and a page that grows without bound is a layout the mockups never measured. */
export const NARRATIVE_LIMIT = {
  TITLE: 60,
  SUMMARY: 240,
} as const;

/** No URL may appear in generated text: it is the one payload that turns a narrative into
 *  a delivery mechanism, and the reader has no way to tell a model's link from ours. */
const NO_URL = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|app|co)\b)/i;
const noUrl = (value: string) => !NO_URL.test(value);

/**
 * **Everything a future generator is allowed to see** — built server-side, from Summary-
 * public text only, and INDEPENDENTLY of the selected share level, so no Everything toggle
 * can widen it (ADR-0213 §2).
 *
 * Strict at every level, which is what makes that claim checkable rather than a promise:
 * a builder that starts passing `travelerNames` fails the parse before the dispatch.
 */
export const summaryNarrativeInputSchema = z.strictObject({
  locale: z.string().max(8),
  routeLabels: z.array(z.string()),
  days: z.array(
    z.strictObject({
      ordinal: z.number().int().positive(),
      events: z.array(
        z.strictObject({
          title: z.string(),
          daypart: shareDaypartSchema,
          icon: z.string().optional(),
          category: eventCategorySchema.optional(),
          placeName: z.string().optional(),
        }),
      ),
    }),
  ),
});
export type SummaryNarrativeInput = z.infer<typeof summaryNarrativeInputSchema>;

export const itineraryNarrativeOutputSchema = z.strictObject({
  title: z.string().min(1).max(NARRATIVE_LIMIT.TITLE).refine(noUrl, 'narrative may not link'),
  summary: z.string().max(NARRATIVE_LIMIT.SUMMARY).refine(noUrl, 'narrative may not link'),
  days: z.array(
    z.strictObject({
      ordinal: z.number().int().positive(),
      title: z.string().min(1).max(NARRATIVE_LIMIT.TITLE).refine(noUrl, 'narrative may not link'),
      summary: z.string().max(NARRATIVE_LIMIT.SUMMARY).refine(noUrl, 'narrative may not link'),
    }),
  ),
});
export type ItineraryNarrativeOutput = z.infer<typeof itineraryNarrativeOutputSchema>;

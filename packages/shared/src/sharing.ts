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

export const sharedDaySchema = z.strictObject({
  ordinal: z.number().int().positive(),
  date: dateOnlySchema,
  title: sharedDayTitleSchema,
  summary: sharedDaySummarySchema,
  sections: z.array(sharedDaypartSectionSchema),
});
export type SharedDay = z.infer<typeof sharedDaySchema>;

/** Where the narrative on the page came from. Shown to nobody; it exists so a failed
 *  model reads as a fallback in the logs rather than as missing trip data. */
export const NARRATIVE_SOURCE = { DETERMINISTIC: 'deterministic', GENERATED: 'generated' } as const;
export type NarrativeSource = (typeof NARRATIVE_SOURCE)[keyof typeof NARRATIVE_SOURCE];

/** The operational material Everything adds, kept OUT of the schedule.
 *  Beside each event it would wreck scanning and make the privacy state ambiguous;
 *  as its own block a reader can see exactly what was published (ADR-0213 §4). */
export const sharedAppendixSchema = z.strictObject({
  bookingSecrets: z
    .array(z.strictObject({ title: z.string(), lines: z.array(z.string()) }))
    .optional(),
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
  }),
  narrative: z.strictObject({
    source: z.enum([NARRATIVE_SOURCE.DETERMINISTIC, NARRATIVE_SOURCE.GENERATED]),
    title: z.string(),
    summary: z.string(),
  }),
  days: z.array(sharedDaySchema),
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

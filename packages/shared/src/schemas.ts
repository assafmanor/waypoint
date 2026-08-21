// Zod schemas shared by client and server — one definition validates both ends.
// Used for API request validation (backend) and form/optimistic-write validation (frontend).

import { z } from 'zod';
import {
  ATTACHMENT_HOST_KEYS,
  NOTE_HOST_KEYS,
  bookingTypeSchema,
  documentTypeSchema,
  eventCategorySchema,
  eventKindSchema,
  eventSourceSchema,
  eventStatusSchema,
  membershipRoleSchema,
  placeSearchKindSchema,
  TASK_HOST_KEYS,
  taskDerivedKeySchema,
  taskStatusSchema,
  type NoteHostKey,
  type TaskHostKey,
} from './entities';
import { currencyCodeSchema } from './currency';
import { geoBoundsSchema } from './geo';
import { avatarChoiceSchema, identityHueSchema } from './identity';
import {
  MAX_DISPLAY_NAME_LENGTH,
  MAX_PUSH_ENDPOINT_LENGTH,
  MAX_PUSH_KEY_LENGTH,
  MAX_USER_AGENT_LENGTH,
  MAX_PLACE_NICKNAME_LENGTH,
  MAX_TRIP_NAME_LENGTH,
} from './constants';

/** Client-generated id (cuid/uuid). Server validates format only. ADR-0018. */
// ponytail: charset+length guard, tighten to exact cuid2/uuid grammar if it ever matters.
export const entityIdSchema = z.string().regex(/^[a-z0-9-]{8,64}$/i, 'invalid id format');

// Domain-typed temporal fields (backend-review B-05 / ADR-0068's error contract):
// bare `z.string()` accepted "banana" as a date/timezone, which surfaced as a
// Prisma 500 or an `Intl` RangeError deep in the request instead of a 400. These
// reject malformed input at the edge, identically on client and server (ADR-0023).

/** A calendar date, `YYYY-MM-DD`, that is also a real day (rejects `2026-02-30`). */
export const dateOnlySchema = z.iso.date();

/** An ISO-8601 datetime with a `Z` or numeric offset (rejects `banana`). */
export const isoDateTimeSchema = z.iso.datetime({ offset: true });

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** A valid IANA time zone (e.g. `Asia/Tokyo`), checked with the same ICU the app
 *  uses at runtime, so a bad zone is a 400 here rather than a `RangeError` 500 in
 *  `Intl.DateTimeFormat` on the next nudge (assertValidMoveTarget). */
export const timezoneSchema = z.string().refine(isValidTimeZone, 'invalid IANA time zone');

const eventFieldsSchema = z.object({
  id: entityIdSchema.optional(),
  date: dateOnlySchema,
  endDate: dateOnlySchema.optional(),
  title: z.string().min(1),
  icon: z.string().optional(),
  category: eventCategorySchema.optional(),
  kind: eventKindSchema,
  startsAt: isoDateTimeSchema.optional(), // UTC instant
  endsAt: isoDateTimeSchema.optional(),
  // The other bound of a flexible edge's window (ADR-0184). `nullish` for the same
  // reason `displayTimezone` is: **null clears** the window back to the open-ended
  // floor/deadline it was, absent leaves it untouched in a patch — and removing a
  // window is a control the form actually offers (`TimeField`'s `onClear`).
  startWindowEnd: isoDateTimeSchema.nullish(),
  endWindowStart: isoDateTimeSchema.nullish(),
  placeId: z.string().optional(), // FK → Place; cleared server-side when bookingId is set (ADR-0048)
  // Manual display-zone override (ADR-0107 §6-7), written only by the zone chip:
  // a real IANA zone pins the event's display zone forever; **null clears it**
  // back to the derived zone (place > segment > trip primary); absent leaves it
  // untouched in a patch. Validated as a zone so a bad value is a 400 here, not a
  // RangeError deep in `Intl.DateTimeFormat` on the next render.
  displayTimezone: timezoneSchema.nullish(),
  bookingId: z.string().optional(),
  sortOrder: z.number().int().optional(),
  source: eventSourceSchema.default('manual'),
});

/** Client and server both reject an inverted/zero-duration span — enforced once
 *  here rather than separately on each end (ADR-0023). */
const endAfterStart = (data: { startsAt?: string; endsAt?: string }) =>
  !data.startsAt || !data.endsAt || Date.parse(data.endsAt) > Date.parse(data.startsAt);
const endAfterStartIssue = { message: 'endsAt must be after startsAt', path: ['endsAt'] };

/** **A window must contain the edge it widens** (ADR-0184 §3). A check-in window closes
 *  AFTER its floor opens and a check-out window opens BEFORE its deadline — an inverted
 *  pair is nonsense rather than an unusual booking, so it is refused on both ends like
 *  the span above. Only checked when both halves are present: a window with no edge to
 *  hang off is caught by the same rule that would reject a bare `endsAt`. */
const windowsContainTheirEdge = (data: {
  startsAt?: string;
  endsAt?: string;
  startWindowEnd?: string | null;
  endWindowStart?: string | null;
}) =>
  (!data.startsAt ||
    !data.startWindowEnd ||
    Date.parse(data.startWindowEnd) > Date.parse(data.startsAt)) &&
  (!data.endsAt ||
    !data.endWindowStart ||
    Date.parse(data.endWindowStart) < Date.parse(data.endsAt));
const windowIssue = {
  message: 'a window must close after its floor and open before its deadline',
  path: ['startWindowEnd'],
};

/** Payload to create an event. Client supplies `id`; server assigns updatedBy/timestamps. */
export const createEventSchema = eventFieldsSchema
  .refine(endAfterStart, endAfterStartIssue)
  .refine(windowsContainTheirEdge, windowIssue);
export type CreateEventInput = z.infer<typeof createEventSchema>;

/** Partial update to an event. Hard events require confirmation server-side (ADR-0011). */
export const updateEventSchema = eventFieldsSchema
  .partial()
  .extend({ status: eventStatusSchema.optional() })
  .refine(endAfterStart, endAfterStartIssue)
  .refine(windowsContainTheirEdge, windowIssue);
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

/** Move an event to another date/time/order. ADR-0018 (no dayId). */
export const moveEventSchema = z.object({
  date: dateOnlySchema.optional(),
  startsAt: isoDateTimeSchema.optional(),
  sortOrder: z.number().int().optional(),
});
export type MoveEventInput = z.infer<typeof moveEventSchema>;

/** Set an event's status (done/skipped). */
export const eventStatusUpdateSchema = z.object({ status: eventStatusSchema });
export type EventStatusUpdateInput = z.infer<typeof eventStatusUpdateSchema>;

/** Optional event to auto-create/update alongside a booking (ADR-0047 §1). Present
 *  only when the booking has a time. title/placeId/bookingId/source are derived by the
 *  service — the linked event's place comes from the booking (ADR-0048). */
export const bookingEventSeedSchema = z.object({
  id: entityIdSchema.optional(),
  date: dateOnlySchema,
  startsAt: isoDateTimeSchema.optional(),
  endsAt: isoDateTimeSchema.optional(),
  // A booking's window rides the seed, because the Event is the sole time authority
  // (ADR-0047 §1) and a hotel's check-in window is the only place one is authored today.
  startWindowEnd: isoDateTimeSchema.nullish(),
  endWindowStart: isoDateTimeSchema.nullish(),
  endDate: dateOnlySchema.optional(),
  kind: eventKindSchema.optional(),
  icon: z.string().optional(),
  category: eventCategorySchema.optional(),
});
export type BookingEventSeed = z.infer<typeof bookingEventSeedSchema>;

export const createBookingSchema = z.object({
  id: entityIdSchema.optional(),
  type: bookingTypeSchema,
  title: z.string().min(1),
  confirmationCode: z.string().optional(),
  provider: z.string().optional(),
  placeId: z.string().optional(), // single-place types; mutually exclusive with from/to
  fromPlaceId: z.string().optional(), // transport origin (ADR-0048)
  toPlaceId: z.string().optional(), // transport destination (ADR-0048)
  // Per-end manual display-zone overrides (ADR-0107 §6-7): `start` is the origin's
  // zone for transport and the only one a single-place booking uses; `end` is the
  // destination's. Validated as real IANA zones; **null clears** back to the derived
  // zone (the place, else the itinerary segment, else the trip primary).
  startDisplayTimezone: timezoneSchema.nullish(),
  endDisplayTimezone: timezoneSchema.nullish(),
  details: z.record(z.string(), z.unknown()).optional(),
  event: bookingEventSeedSchema.optional(),
});
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

/** Partial update to a booking.
 *
 *  **The three place FKs are `nullish` here and `optional` on create, and the difference is
 *  load-bearing**: `null` CLEARS, exactly as `startDisplayTimezone` above already documents
 *  for itself. Under `.partial()` alone they were merely optional, so `null` never survived
 *  validation and `undefined` is dropped by `JSON.stringify` — which made clearing a
 *  booking's place a **silent no-op**, and made a type change across the route↔single axis
 *  impossible at all: `bookings.service.ts` merges the previous value under the NEW type and
 *  `assertPlaceShape` then rejects the pair with a 400. `bookingUpdateData` already spreads
 *  a present-but-null key straight through to Prisma, so nothing downstream changes. */
export const updateBookingSchema = createBookingSchema.partial().extend({
  placeId: z.string().nullish(),
  fromPlaceId: z.string().nullish(),
  toPlaceId: z.string().nullish(),
});
export type UpdateBookingInput = z.infer<typeof updateBookingSchema>;

export const createPlaceSchema = z.object({
  id: entityIdSchema.optional(),
  name: z.string().min(1),
  googlePlaceId: z.string().optional(),
  address: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  /** The glyph a human chose (ADR-0147). Writable on create because a pin dropped on the
   *  canvas is named AND iconed in one form, and on update because renaming is that same
   *  form reopened. `timezone` deliberately stays absent: the server resolves it from the
   *  coordinates, and a client-supplied zone would be a second source of truth. */
  icon: z.string().optional(),
  /** The short label a human chose (ADR-0166 §18). Writable on the same two paths as `icon`,
   *  and bounded because it exists to be SHORTER than the name it overrides — a label longer
   *  than that is not a nickname, it is a rename. An empty string is the way to clear it, so
   *  the floor is 0 rather than 1. */
  nickname: z.string().max(MAX_PLACE_NICKNAME_LENGTH).optional(),
  /** What a human said this place is (ADR-0165). Writable on the same two paths and for the
   *  same reason as `icon` above: the canvas's form asks for both at once, and reopening it on
   *  a place already in the trip is a rename. */
  category: eventCategorySchema.optional(),
  /** **Google's aggregate rating, writable only so an undone delete can hand it back.**
   *  Every other field a deleted place carries is either user-authored or re-derived
   *  server-side (`timezone` from the coordinates), so the restore reproduces the row
   *  exactly — except these two, which came from a Place Details call nobody wants to pay
   *  for twice (ADR-0157 §4). The client is re-asserting a number our own server cached and
   *  handed it, in one trip; that is the whole of the trust it is being given. */
  rating: z.number().min(0).max(5).optional(),
  userRatingsTotal: z.number().int().nonnegative().optional(),
});
export type CreatePlaceInput = z.infer<typeof createPlaceSchema>;

/** Partial update to a place (the picker enriches a name-only row later). */
export const updatePlaceSchema = createPlaceSchema.partial();
export type UpdatePlaceInput = z.infer<typeof updatePlaceSchema>;

/** A session token groups a run of Autocomplete keystrokes with the terminating
 *  Place Details pick so Google bills the searches at $0 (ADR-0108 §1). The FE
 *  mints it (`crypto.randomUUID()`) and threads the same value through every
 *  search and the resolve; the proxy forwards it verbatim. Validated only as a
 *  bounded opaque string — Google's own format check is authoritative. */
export const sessionTokenSchema = z.string().min(1).max(128);

/** One Autocomplete suggestion crossing the proxy boundary (ADR-0110 §9). The
 *  proxy flattens Google's `suggestions[].placePrediction` to just what the picker
 *  renders; `alreadyInTrip` is a client-side derivation over the snapshot, not a
 *  field here (ADR-0110 §1). */
export const placePredictionSchema = z.object({
  googlePlaceId: z.string(),
  primaryText: z.string(),
  secondaryText: z.string().optional(),
});
export type PlacePrediction = z.infer<typeof placePredictionSchema>;

/** `POST /trips/:tripId/places/search` body — the debounced Autocomplete relay
 *  (ADR-0108 §1 / ADR-0110 §1). */
export const searchPlacesSchema = z.object({
  // Bounded so an oversized string can't be relayed verbatim to the billed Autocomplete
  // endpoint; a real place query is short (Google itself caps around this length).
  input: z.string().min(1).max(200),
  sessionToken: sessionTokenSchema,
});
export type SearchPlacesInput = z.infer<typeof searchPlacesSchema>;

/** One **Text Search** result crossing the proxy boundary (ADR-0132 §7). Same row
 *  grammar as a prediction, plus the thing a prediction structurally cannot carry:
 *  **coordinates**. That is the whole reason this SKU exists — an Autocomplete
 *  prediction has no location until the pick (ADR-0115 §2), so it can be a row but
 *  never a pin, while one Text Search call returns N results already placeable.
 *
 *  `lat`/`lng` are optional because Google's response is not a contract we control;
 *  a result without them is a row and no ring, which the client already handles for
 *  every coordless place it holds. */
export const placeResultSchema = placePredictionSchema.extend({
  lat: z.number().optional(),
  lng: z.number().optional(),
});
export type PlaceResult = z.infer<typeof placeResultSchema>;

/** `POST /trips/:tripId/places/search-text` body — the Text Search relay (ADR-0132
 *  §7). **No session token**, and that is the cost story rather than an omission:
 *  Text Search has no concept of a session, so every query is billed on its own,
 *  where Autocomplete's token folds a run of keystrokes into the pick's single
 *  charge. The controls that remain are the min-chars floor and the pause-gated
 *  debounce, both client-side, plus the same per-member·trip throttle.
 *
 *  `bias` is the canvas's current bounds: free relevance (it changes ranking, not
 *  price), so a query typed while the map is on Shinjuku means Shinjuku. */
export const searchPlacesTextSchema = z.object({
  input: z.string().min(1).max(200),
  /** Restrict the answer to one kind of place (field report #6). Absent = the whole corpus,
   *  which is every search but a flight leg's. */
  kind: placeSearchKindSchema.optional(),
  /** **Stays permissive on purpose — do not add a span or validity refinement here**
   *  (field report #34). A world-wide viewport is a real thing to be looking at, and
   *  refusing it here 400s the search from our own API, which is the failure that report
   *  is about. Google's geometry rules are enforced where Google is called, by dropping
   *  the hint: `isSendableViewport` / `GooglePlacesClient.textSearch`. */
  bias: geoBoundsSchema.optional(),
});
export type SearchPlacesTextInput = z.infer<typeof searchPlacesTextSchema>;

/** `POST /trips/:tripId/places/resolve` body — the terminating enrich-on-pick
 *  (create-or-link) call (ADR-0108 §3 / ADR-0110 §1). `enrichPlaceId` names an
 *  existing coordless Place-lite to enrich in place instead of minting a new row
 *  (ADR-0110 §1). Server dedup on `(tripId, googlePlaceId)` governs the rest.
 *
 *  `details` is the Text Search half's add path (ADR-0132 §7): that call already
 *  returned the name, the address and the point, so a Place Details call to fetch
 *  them again would be spending twice for one place. Supplied here, the resolve
 *  persists without touching Google at all. It is a client-supplied value, which is
 *  the same trust level `createPlace` has always had for `lat`/`lng` — and the
 *  dedup, the trip scoping and the zone resolution are unchanged either way. */
export const resolvePlaceSchema = z.object({
  googlePlaceId: z.string().min(1),
  sessionToken: sessionTokenSchema.optional(),
  enrichPlaceId: entityIdSchema.optional(),
  details: z
    .object({
      name: z.string().min(1).max(200),
      address: z.string().max(500).optional(),
      lat: z.number().optional(),
      lng: z.number().optional(),
    })
    .optional(),
});
export type ResolvePlaceInput = z.infer<typeof resolvePlaceSchema>;

// ── Trip-destination endpoints (ADR-0113) — trip-agnostic (no tripId yet at
// creation), authed + per-user throttled, no persistence. Distinct from the
// trip-scoped place proxy above; the search request shape is identical, so it
// reuses `searchPlacesSchema` / `placePredictionSchema`.

/** `POST /destinations/resolve` body — geocode a picked destination place (any
 *  granularity: city / region / country) into its point + country + zone. */
export const resolveDestinationSchema = z.object({
  googlePlaceId: z.string().min(1),
  sessionToken: sessionTokenSchema.optional(),
});
export type ResolveDestinationInput = z.infer<typeof resolveDestinationSchema>;

/** `POST /destinations/resolve` result (ADR-0113 §4). `timezone` is the derived
 *  default (`geo-tz` on the representative point — always present for a real
 *  place). `candidateZones` is populated only for a known multi-zone country
 *  (US, Australia…), so the creation UI can show the "spans several zones" note
 *  and pre-filter the ZonePicker; absent means treat the single zone as trusted. */
export const destinationResultSchema = z.object({
  googlePlaceId: z.string(),
  name: z.string(),
  countryCode: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  timezone: timezoneSchema.optional(),
  candidateZones: z.array(timezoneSchema).optional(),
});
export type DestinationResult = z.infer<typeof destinationResultSchema>;

/** `fileRef`/`mimeType`/`sizeBytes` are computed server-side from the uploaded
 *  file (multipart), not client input — this validates the accompanying fields. */
export const createDocumentSchema = z.object({
  id: entityIdSchema.optional(),
  type: documentTypeSchema,
  title: z.string().min(1),
  ownerUserId: entityIdSchema.optional(),
});
export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;

/** Metadata patch for an existing document (ADR-0052): rename and/or change type.
 *  A file replacement rides as the multipart `file` alongside this, handled
 *  server-side like create — not a field here. */
export const updateDocumentSchema = z.object({
  title: z.string().min(1).optional(),
  type: documentTypeSchema.optional(),
});
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;

export const createTripSchema = z
  .object({
    name: z.string().min(1).max(MAX_TRIP_NAME_LENGTH),
    destination: z.string().min(1),
    // The picked destination's structured fields (ADR-0113). Optional so a bare
    // API create still works; the creation UI sends them from the Places pick and
    // sets `timezone` from the derived default rather than leaving it 'UTC'.
    destinationGooglePlaceId: z.string().optional(),
    destinationLat: z.number().optional(),
    destinationLng: z.number().optional(),
    destinationCountryCode: z.string().optional(),
    startDate: dateOnlySchema,
    endDate: dateOnlySchema,
    timezone: timezoneSchema.default('UTC'),
    currency: z.string().optional(),
    icon: z.string().optional(),
  })
  // A trip can't end before it begins (a same-day, one-night trip is fine).
  // ISO date strings sort chronologically, so a lexical compare is valid.
  // Enforced once here so client and server reject it identically (ADR-0023).
  .refine((data) => data.endDate >= data.startDate, {
    message: 'endDate must not be before startDate',
    path: ['endDate'],
  });
export type CreateTripInput = z.infer<typeof createTripSchema>;

/** `PATCH /trips/:tripId` — partial trip edit (admin-only, ADR-0039). Every field
 *  is optional so the details form sends only what changed; the same
 *  `endDate >= startDate` rule as create is re-checked here whenever both bounds
 *  are present in the patch (ADR-0023). A patch that moves only one bound is
 *  validated against the stored trip in the service. */
export const updateTripSchema = z
  .object({
    name: z.string().min(1).max(MAX_TRIP_NAME_LENGTH),
    destination: z.string().min(1),
    // The picked destination's structured fields (ADR-0113). Settings sends
    // these when the destination is edited via the picker (mirrors
    // createTripSchema). Nullable — unlike create — so a "use as typed"
    // destination clears the now-stale coordinates rather than leaving the old
    // place's point behind.
    destinationGooglePlaceId: z.string().nullable().optional(),
    destinationLat: z.number().nullable().optional(),
    destinationLng: z.number().nullable().optional(),
    destinationCountryCode: z.string().nullable().optional(),
    icon: z.string(),
    startDate: dateOnlySchema,
    endDate: dateOnlySchema,
    timezone: timezoneSchema,
    currency: z.string(),
  })
  .partial()
  .refine(
    (data) =>
      data.startDate === undefined || data.endDate === undefined || data.endDate >= data.startDate,
    { message: 'endDate must not be before startDate', path: ['endDate'] },
  );
export type UpdateTripInput = z.infer<typeof updateTripSchema>;

/** `PATCH /trips/:tripId/members/:userId` — admin promotes a peer to admin
 *  (ADR-0039). No explicit demotion path in v1, but the schema accepts either
 *  role so the "last admin leaving auto-promotes" write can reuse it. */
export const updateMembershipRoleSchema = z.object({ role: membershipRoleSchema });
export type UpdateMembershipRoleInput = z.infer<typeof updateMembershipRoleSchema>;

export const createMaybeItemSchema = z.object({
  id: entityIdSchema.optional(),
  title: z.string().min(1),
  icon: z.string().optional(),
  category: eventCategorySchema.optional(),
  placeId: z.string().optional(),
  /** The pencilled-in day (ADR-0116 §1); nullish clears it back to "someday". */
  targetDate: z.string().nullish(),
});
export type CreateMaybeItemInput = z.infer<typeof createMaybeItemSchema>;

/** `PATCH /trips/:tripId/maybe-items/:id` — re-aiming an idea at a day, or back to
 *  "someday" with `null` (ADR-0116 §1 + its session-114 amendment). Deliberately
 *  narrow: the day is the only field with an edit surface today. */
export const updateMaybeItemSchema = z.object({
  targetDate: z.string().nullish(),
});
export type UpdateMaybeItemInput = z.infer<typeof updateMaybeItemSchema>;

// --- Notes (ADR-0152 / ADR-0153) ------------------------------------------------------
// The two rules a note owes, enforced here so client and server refuse identically
// (ADR-0023) and the frontend's `useFormErrors` and the Nest pipe read the same verdict.

const noteHostCount = (data: Partial<Record<NoteHostKey, unknown>>): number =>
  NOTE_HOST_KEYS.filter((key) => data[key] != null).length;

/** A note says something, or points somewhere, or both — never neither. This is the
 *  editor's ONE refusal (ADR-0153 §5), and it is marked on **both** fields that can cure
 *  it rather than the first, so a save is not refused twice for one mistake (ADR-0150). */
const hasContent = (data: { body?: string | null; url?: string | null }): boolean =>
  !!data.body?.trim() || !!data.url?.trim();

export const createNoteSchema = z
  .object({
    id: entityIdSchema.optional(),
    title: z.string().optional(),
    body: z.string().optional(),
    url: z.string().optional(),
    /** Absent on a hosted note **by design** — the category is resolved from the host at
     *  render, never copied at write time (ADR-0152 §5's amendment). */
    category: eventCategorySchema.optional(),
    eventId: entityIdSchema.optional(),
    bookingId: entityIdSchema.optional(),
    placeId: entityIdSchema.optional(),
    maybeItemId: entityIdSchema.optional(),
    documentId: entityIdSchema.optional(),
  })
  .refine(hasContent, { message: 'a note needs a body or a url', path: ['body'] })
  .refine((data) => noteHostCount(data) <= 1, {
    message: 'a note has at most one host',
    path: ['eventId'],
  });
export type CreateNoteInput = z.infer<typeof createNoteSchema>;

/** `PATCH /trips/:tripId/notes/:noteId` — **a whole-content submit, not a sparse patch.**
 *  Every content field is sent and an absent one means cleared, because the only edit
 *  surfaces are a form that holds all of them (the editor sheet) and the composer chip,
 *  which reopens the note's whole body. Stated because the refusal below reads the SUBMITTED
 *  fields: a caller that sent only `category` would be told it needs a body, which would be
 *  a confusing lie about a note that has one. Same shape as `updateMaybeItemSchema`, whose
 *  `apply` writes `targetDate ?? null` unconditionally for the same reason.
 *
 *  **The host is immutable to a USER and transferable by a CONVERSION** (ADR-0152 §5's
 *  2026-08-01 amendment). There is still no host picker (ADR-0153 §5) — nothing a person
 *  operates re-hosts a note. What does is the app converting one entity into another: an
 *  idea scheduled into an event, an event parked back onto the shelf, an idea booked. Those
 *  used to strand a note on the entity that was consumed, or — when the old host was
 *  DELETED, as parking does — let the FK cascade destroy it.
 *
 *  **The host fields are the one part of this payload that is not whole-content.** Absent
 *  means UNTOUCHED, not cleared, which is the opposite of the rule above and is why they are
 *  called out here: an ordinary edit from the editor sheet sends none of them and must never
 *  lose the note's host. A conversion sends the new host and `null` for the old one. */
export const updateNoteSchema = z
  .object({
    title: z.string().nullish(),
    body: z.string().nullish(),
    url: z.string().nullish(),
    category: eventCategorySchema.nullish(),
    eventId: entityIdSchema.nullish(),
    bookingId: entityIdSchema.nullish(),
    placeId: entityIdSchema.nullish(),
    maybeItemId: entityIdSchema.nullish(),
    documentId: entityIdSchema.nullish(),
  })
  .refine(hasContent, { message: 'a note needs a body or a url', path: ['body'] })
  .refine((data) => noteHostCount(data) <= 1, {
    message: 'a note has at most one host',
    path: ['eventId'],
  });
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;

// --- Tasks (tasks brief §5, ADR-0188) -------------------------------------------------
// Notes' sibling, so the host rule below is the same rule, enforced the same way at both
// edges (ADR-0023). What differs is the ONE refusal: a note needs a body or a url, and a
// task needs a title — "a task with no title is nothing".

const taskHostCount = (data: Partial<Record<TaskHostKey, unknown>>): number =>
  TASK_HOST_KEYS.filter((key) => data[key] != null).length;

const hasTitle = (data: { title?: string | null }): boolean => !!data.title?.trim();

/** **What a SUB-TASK may not carry** (ADR-0196 §1/§8), refused at both edges rather than
 *  trusted to a form. Each entry has its own reason in that ADR, and one of them pays for the
 *  rest: a step with no deadline cannot be urgent, cannot be overdue, and therefore has
 *  nothing to say on any surface ordered by urgency — which is what makes nineteen of the
 *  twenty-three task derivations correct about children *vacuously* instead of by remembering.
 *
 *  `parentTaskId` itself is in the list, and that is the depth cap: a step may not be a
 *  parent. `assignedToAll` is not here only because it is not built yet (brief §6, phase 6) —
 *  when it lands it joins this array, and §1's third refusal (a task is a checklist or an
 *  `everyone` task, never both) becomes its own `.refine`. */
const SUBTASK_REFUSED_KEYS = [
  'parentTaskId',
  'dueAt',
  'dueHasTime',
  'displayTimezone',
  'important',
  'body',
  'derivedKey',
  ...TASK_HOST_KEYS,
] as const;

/** **Carries a VALUE, not merely a key.** `null`/`undefined` is an absent field; `false` and
 *  `''` are a form sending its own defaults, and refusing those would reject a perfectly good
 *  step for the values nobody chose — `important: false` and `dueHasTime: false` are exactly
 *  what `TaskSheet` fills in. The suite caught this on the accept case that sits beside the
 *  refusals. */
const carries = (value: unknown): boolean => value != null && value !== false && value !== '';

/** True when this input is a step AND carries something a step may not. Written over the
 *  SUBMITTED keys so a sparse patch is judged on what it actually sends: a tick on a step
 *  sends `status` alone and must not be refused for the fields it never mentioned. */
const subtaskCarriesRefused = (
  data: Record<string, unknown>,
  parentTaskId: string | null | undefined,
): boolean =>
  parentTaskId != null &&
  SUBTASK_REFUSED_KEYS.some((key) => key !== 'parentTaskId' && carries(data[key]));

export const createTaskSchema = z
  .object({
    id: entityIdSchema.optional(),
    title: z.string(),
    body: z.string().optional(),
    /** An ISO instant. Resolved from the typed wall-clock through `authoringZone` at the
     *  form, never from whatever zone the call site happened to hold (ADR-0107 §2). */
    dueAt: z.string().optional(),
    dueHasTime: z.boolean().optional(),
    /** The zone the deadline was typed in (2026-08-17). Absent → derived, as before. */
    displayTimezone: timezoneSchema.optional(),
    assigneeUserId: entityIdSchema.optional(),
    important: z.boolean().optional(),
    /** Set only when the row overlays a readiness check (brief §4) — a human dismissing,
     *  assigning or flagging a derivation is what mints it. */
    derivedKey: taskDerivedKeySchema.optional(),
    /** **The task this one is a step of** (ADR-0196 §1). See the refusal below for what a
     *  step may not carry alongside it. */
    parentTaskId: entityIdSchema.optional(),
    /** **Present so that the act which MINTS an overlay row can be the dismissal itself.**
     *  A check nobody has touched has no row, and "a dismissal is a human decision and
     *  cannot be derived" (brief §4) — so dismissing one is a create, not an update, and
     *  without this it would have to be a create followed by a patch: two writes for one
     *  press, with the second orphaned if the first fails. Defaults to `open` everywhere
     *  else, which is every manual task. */
    status: taskStatusSchema.optional(),
    eventId: entityIdSchema.optional(),
    bookingId: entityIdSchema.optional(),
    placeId: entityIdSchema.optional(),
    maybeItemId: entityIdSchema.optional(),
    documentId: entityIdSchema.optional(),
  })
  .refine(hasTitle, { message: 'a task needs a title', path: ['title'] })
  .refine((data) => taskHostCount(data) <= 1, {
    message: 'a task has at most one host',
    path: ['eventId'],
  })
  // **A step is its title and its assignee, and nothing else** (ADR-0196 §8). Marked on
  // `parentTaskId` because that is the field which makes the rest refusable — a form that
  // got here sent a step, and the cure is to send a top-level task instead.
  .refine((data) => !subtaskCarriesRefused(data, data.parentTaskId), {
    message: 'a sub-task carries only a title and an assignee',
    path: ['parentTaskId'],
  });
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

/** `PATCH /trips/:tripId/tasks/:taskId` — **sparse throughout, and clearing a field is an
 *  explicit `null`.** This is the one place tasks deliberately part company with
 *  `updateNoteSchema`, whose absent-means-cleared rule is bought by a note having exactly
 *  one edit surface. A task has two: the editor, which holds every field, and **the tick**,
 *  which settles a task without opening anything and so sends `status` alone. Under the
 *  note's rule that tick would erase the task's own words and its deadline.
 *
 *  So an absent field means untouched, a `null` means cleared, and the refusal below reads
 *  the SUBMITTED fields — `title` is optional here and refused only when it is actually
 *  sent, or a tick would be told the task needs a title it already has. */
export const updateTaskSchema = z
  .object({
    title: z.string().optional(),
    body: z.string().nullish(),
    dueAt: z.string().nullish(),
    dueHasTime: z.boolean().optional(),
    /** `nullish` and not `optional`, for the reason the sparse patch already has one
     *  `nullish` field: absent = untouched, **`null` = un-pin back to derived**. Without the
     *  null a pinned zone could be set and never cleared. */
    displayTimezone: timezoneSchema.nullish(),
    assigneeUserId: entityIdSchema.nullish(),
    important: z.boolean().optional(),
    status: taskStatusSchema.optional(),
    eventId: entityIdSchema.nullish(),
    bookingId: entityIdSchema.nullish(),
    placeId: entityIdSchema.nullish(),
    maybeItemId: entityIdSchema.nullish(),
    documentId: entityIdSchema.nullish(),
    // **No `parentTaskId`, deliberately.** A step's parent is set at create and never
    // changes: there is no move-between-checklists verb and no promote-to-task verb in v1,
    // so an editable field here would be surface nothing sends. Removing a step is
    // `deleteTask`. And the refusal it would gate cannot live here anyway — a sparse patch
    // does not say whether its target is a step, so only the server, which loads the row,
    // can enforce what a step may not carry (`TasksService.update`).
  })
  .refine((data) => data.title === undefined || hasTitle(data), {
    message: 'a task needs a title',
    path: ['title'],
  })
  .refine((data) => taskHostCount(data) <= 1, {
    message: 'a task has at most one host',
    path: ['eventId'],
  });
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

/** **What a patch may touch on a STEP** (ADR-0196 §8) — the server's half of the refusal
 *  above, exported so `TasksService.update` and its spec read the same list. A sparse patch
 *  cannot say whether its target is a step, so this is checked against the loaded row.
 *
 *  A step is its title, its assignee and its status: rename it, hand it to someone, tick it.
 *  Everything else is the parent's. */
export const subtaskPatchRefuses = (input: UpdateTaskInput): boolean =>
  SUBTASK_REFUSED_KEYS.some(
    (key) => key !== 'parentTaskId' && carries((input as Record<string, unknown>)[key]),
  );

// --- Document attachments (ADR-0173) --------------------------------------------------
// The link between an existing document and a booking or an event. There is no update
// schema and there never will be: a link has no content, so it is created and removed.

/** `POST /trips/:tripId/document-attachments` — attach a document the trip already holds.
 *
 *  **Exactly one host**, where a note's rule is "at most one": a note with none is a general
 *  note and a real thing; an attachment with none is a link to nowhere. The id is optional
 *  and client-generated in practice, which is what makes an attachment written beside a
 *  queued upload idempotent on an outbox retry (ADR-0056 / ADR-0173 §5). */
export const createDocumentAttachmentSchema = z
  .object({
    id: entityIdSchema.optional(),
    documentId: entityIdSchema,
    eventId: entityIdSchema.optional(),
    bookingId: entityIdSchema.optional(),
  })
  .refine(
    (data) => ATTACHMENT_HOST_KEYS.filter((key) => data[key] != null).length === 1,
    // Marked on `bookingId` because it is the anchor a linked pair writes to (ADR-0172 §2),
    // so a form that got this wrong is pointed at the field it should have sent.
    { message: 'an attachment has exactly one host', path: ['bookingId'] },
  );
export type CreateDocumentAttachmentInput = z.infer<typeof createDocumentAttachmentSchema>;

/** `POST /trips/:tripId/invite` response. */
export const inviteUrlSchema = z.object({ inviteUrl: z.string() });
export type InviteUrl = z.infer<typeof inviteUrlSchema>;

/** `GET /invites/:code` response — public preview shown before joining (ADR-0024).
 *  Carries `tripId` so an authed visitor already in the trip is redirected in
 *  rather than shown the invite ticket (ADR-0067). */
export const invitePreviewSchema = z.object({
  tripId: z.string(),
  tripName: z.string(),
  icon: z.string().optional(), // the trip's chosen glyph, shown on the ticket
  destination: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  memberCount: z.number().int(),
});
export type InvitePreview = z.infer<typeof invitePreviewSchema>;

/** `GET /trips/:tripId/blocks` item — a member an admin kicked, shown in the
 *  trip-settings "Removed" section so they can be allowed back (ADR-0067). */
export const removedMemberSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  avatarHue: identityHueSchema,
  blockedAt: z.string(),
});
export type RemovedMember = z.infer<typeof removedMemberSchema>;

/** `POST /auth/refresh` response — the access JWT lives in memory client-side, never a cookie (ADR-0020). */
export const accessTokenResponseSchema = z.object({ accessToken: z.string() });
export type AccessTokenResponse = z.infer<typeof accessTokenResponseSchema>;

/** `PATCH /trips/:tripId/members/me` — a member's own consent flags (self-only, ADR-0005). */
export const updateMembershipPrefsSchema = z.object({ calendarSyncEnabled: z.boolean() });
export type UpdateMembershipPrefsInput = z.infer<typeof updateMembershipPrefsSchema>;

/** `POST /trips/join/:token` body — same field, optional (defaults to the Prisma column default). */
export const joinTripSchema = updateMembershipPrefsSchema.partial();
export type JoinTripInput = z.infer<typeof joinTripSchema>;

/** `PATCH /me` — the only write path onto your own `User` (ADR-0133 §1/§11).
 *
 *  Every field is optional and a partial patch, LWW like the trip patch (ADR-0012).
 *  `avatarHue` is a ramp KEY, so an unknown colour is a 400 rather than an
 *  un-rendered hex; `.nullable()` on it means "hand this back to the derivation"
 *  exactly the way ADR-0107's zone chip clears a manual override to null.
 *  `displayName` is trimmed and length-capped because it renders on every
 *  co-member's roster — it is shared state, not a private label. */
/** `POST /notifications/subscription` — the browser's `PushSubscription`, as the browser
 *  gives it (ADR-0197 §2). Three fields and a courtesy label; there is nothing here we
 *  choose, which is why the shape is this literal.
 *
 *  `endpoint` is checked as a URL because it IS one, and it is the row's identity — a
 *  garbage endpoint would be a row that can never be reached and never be replaced. The
 *  key material is length-bounded rather than decoded: base64url of a P-256 point and a
 *  16-byte secret have known sizes, and a value outside them cannot be either, but the
 *  authority on whether they are valid is the push service at send time, not us. */
export const createPushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(MAX_PUSH_ENDPOINT_LENGTH),
  p256dh: z.string().min(1).max(MAX_PUSH_KEY_LENGTH),
  auth: z.string().min(1).max(MAX_PUSH_KEY_LENGTH),
  /** The device label a person recognises their own row by. Trimmed and capped because it
   *  is rendered; absent is fine and renders as the generic "this device". */
  userAgent: z.string().trim().max(MAX_USER_AGENT_LENGTH).optional(),
});
export type CreatePushSubscriptionInput = z.infer<typeof createPushSubscriptionSchema>;

/** `DELETE /notifications/subscription` — by endpoint, because that is the identity, and
 *  in a body rather than a path segment: an endpoint is a URL and a bearer capability, so
 *  it has no business being percent-encoded into a path or written to an access log. */
export const deletePushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(MAX_PUSH_ENDPOINT_LENGTH),
});
export type DeletePushSubscriptionInput = z.infer<typeof deletePushSubscriptionSchema>;

export const updateMeSchema = z
  .object({
    displayName: z.string().trim().min(1).max(MAX_DISPLAY_NAME_LENGTH).optional(),
    avatarChoice: avatarChoiceSchema.optional(),
    avatarHue: identityHueSchema.nullable().optional(),
    // `null` clears the pick and hands the client back to its device-region
    // default (ADR-0184 §2) — the same nullable-means-unchosen shape as
    // `avatarHue` above, so the patch needs no separate "reset" verb.
    preferredCurrency: currencyCodeSchema.nullable().optional(),
    // A plain boolean, NOT nullable: there is no "unchosen" state to clear back to
    // (ADR-0198 §6). The device's permission is the opt-in; this only narrows it.
    notifyTasks: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'patch must change at least one field' });
export type UpdateMeInput = z.infer<typeof updateMeSchema>;

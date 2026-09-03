// Shared domain shapes — the single source of truth for entity shapes used by
// both the backend and the frontend. Mirrors docs/architecture/data-model.md.
// Keep in sync with the Prisma schema (backend/prisma/schema.prisma).
//
// Zod-first (ADR-0023): each entity is a schema; the TS type is `z.infer` of it.
// This is also what backend response validation and OpenAPI generation read from.

import { z } from 'zod';
import { tripEnrichmentsSchema } from './enrichment';
import { currencyCodeSchema } from './currency';
import { fxRatesSchema } from './fx';
import { forecastSchema } from './weather';
import { avatarChoiceSchema, identityHueSchema } from './identity';

export const idSchema = z.string();
export type ID = string;

/** The decisive distinction — see ADR-0011. */
export const eventKindSchema = z.enum(['hard', 'soft']);
export type EventKind = z.infer<typeof eventKindSchema>;

export const authProviderSchema = z.enum(['google']);
export type AuthProvider = z.infer<typeof authProviderSchema>;

export const eventStatusSchema = z.enum(['planned', 'done', 'skipped']);
export type EventStatus = z.infer<typeof eventStatusSchema>;

export const eventSourceSchema = z.enum(['manual', 'gmail', 'maybe_shelf', 'integration']);
export type EventSource = z.infer<typeof eventSourceSchema>;

export const bookingTypeSchema = z.enum([
  'flight',
  'hotel',
  'restaurant',
  'train',
  // The third transport mode (ADR-0156): bus, ferry, cable car, shuttle. Everything
  // that carries you somewhere on someone else's schedule and is neither a flight
  // nor a train.
  'transit',
  // The fourth transport mode (ADR-0162), and the first that is NOT `transportProfile`:
  // you hold the car for days, so it has no return leg to mirror and no connection to
  // make. ADR-0156 counted car hire under `transit`; ADR-0162 §1 is why that was too coarse.
  'car',
  'activity',
  'other',
]);
export type BookingType = z.infer<typeof bookingTypeSchema>;

export const bookingSourceSchema = z.enum(['manual', 'gmail']);
export type BookingSource = z.infer<typeof bookingSourceSchema>;

/** Canonical semantic type of a timeline item — the durable primitive future
 *  features (index unification, map-pin colour, filtering) read, distinct from
 *  the `icon` glyph which is only its badge (ADR-0038). `BookingType`, the
 *  icon-picker browse-groups, and map-pin categories all derive *from* this. */
export const eventCategorySchema = z.enum([
  'transport',
  'food',
  'lodging',
  'sightseeing',
  'nature',
  'activity',
  'shopping',
  'services',
  'other',
]);
export type EventCategory = z.infer<typeof eventCategorySchema>;

/** **How you get from one stop to the next** (ADR-0205, ADR-0206 §V1.6).
 *
 *  **Three members, and the absence of a fourth is a decision** (ADR-0206 §D9, confirmed by
 *  §Z3): there is no transit entry — not a disabled one — because the router we can reach
 *  carries no GTFS, and a control that announces a mode and then answers nothing is worse
 *  than a control that never mentions it.
 *
 *  Our vocabulary, not a provider's: Valhalla spells these `pedestrian`/`auto`/`bicycle` and
 *  a second provider will spell them differently again, so the translation belongs in the
 *  provider adapter behind ADR-0205 §2's port and nowhere else. */
export const travelModeSchema = z.enum(['walking', 'driving', 'cycling']);
export type TravelMode = z.infer<typeof travelModeSchema>;

/**
 * **What a LEG may be, which is one more thing than what a router may be asked** (ADR-0206 §AA4,
 * shaped by §AM5).
 *
 * `travelModeSchema` above is the **routable** set: the values a provider can answer, and therefore
 * the only ones that may appear in a `RouteBatchRequest`. תחב״צ is a fourth thing a leg can BE and
 * not a fourth thing to ask about — declared by a person, never inferred, with no provider behind
 * it. §AA4 is explicit that it is _"not a fourth member of `travelModeSchema`"_, and keeping the two
 * types apart is what makes "no request is ever made for transit" a fact about the type system
 * rather than a rule everyone has to remember.
 *
 * **Counted, the split lands on exactly three `Record<TravelMode, …>` sites** (§AM5): `TRAVEL_GATE`
 * and the provider's `COSTING` keep three entries — a transit mode reaching either of those is the
 * bug — and only the frontend's copy widens, because it is the one that needs a word for it.
 */
export const legTravelModeSchema = z.enum([...travelModeSchema.options, 'transit']);
export type LegTravelMode = z.infer<typeof legTravelModeSchema>;

// creator is admin — ADR-0005/0018
export const membershipRoleSchema = z.enum(['admin', 'peer']);
export type MembershipRole = z.infer<typeof membershipRoleSchema>;

export const documentTypeSchema = z.enum([
  'passport',
  'visa',
  'license',
  'ticket',
  'reservation',
  'insurance',
  'health',
  'other',
]);
export type DocumentType = z.infer<typeof documentTypeSchema>;

export const changeActionSchema = z.enum(['create', 'update', 'move', 'delete', 'status']);
export type ChangeAction = z.infer<typeof changeActionSchema>;

/** The entity kinds a Change (and the sync appliers) can target — the single
 *  source both the backend Change log and the frontend applier registries key
 *  off (ADR-0094). Named values live in `ENTITY_TYPE` (constants.ts). */
export const entityTypeSchema = z.enum([
  'event',
  'booking',
  'document',
  'maybeItem',
  'place',
  'trip',
  'membership',
  'note',
  'task',
  'documentAttachment',
  'travelModeOverride',
]);
export type EntityType = z.infer<typeof entityTypeSchema>;

export const userSchema = z.object({
  id: idSchema,
  email: z.string(),
  displayName: z.string(),
  // Identity, per ADR-0133. `avatarHue` is a ramp KEY (never a hex, so the dark
  // remap reaches it) and is always present on the wire — the column is nullable
  // for "never chosen" and the server resolves it via `resolveAvatarHue`, so no
  // client ever has to answer that question or fall back.
  avatarHue: identityHueSchema,
  avatarChoice: avatarChoiceSchema,
  // The `picture` Google returns — a fact from the provider, refreshed at each
  // sign-in, never user-edited. Kept even when the user is on `initials`, which is
  // what makes "use my Google photo" a real way back rather than a dead end.
  googleAvatarUrl: z.string().nullable(),
  // Where this user's uploaded avatar is served from, or null when there is no
  // upload — the server builds it from the stored blob key via `avatarContentPath`,
  // so no client knows the route shape and a retired key simply stops appearing.
  // Relative to the API origin, since the server has no reliable notion of its own
  // public URL (`FRONTEND_URL` is the frontend's, not ours).
  uploadedAvatarUrl: z.string().nullable(),
  // The member's home currency (ADR-0184 §2), or null when they have never
  // chosen one — the client then seeds a default from the device region rather
  // than the server guessing on their behalf.
  preferredCurrency: currencyCodeSchema.nullable(),
  // NOTE: the notification preferences are deliberately NOT here — see `notifyPrefsSchema`
  // below. This shape is also every co-member's row in the roster.
  createdAt: z.string(),
});
export type User = z.infer<typeof userSchema>;

/** Provider identity + OAuth material; the encrypted token stays server-side (ADR-0020). */
export const authIdentitySchema = z.object({
  id: idSchema,
  userId: idSchema,
  provider: authProviderSchema,
  providerAccountId: z.string(),
  scopes: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AuthIdentity = z.infer<typeof authIdentitySchema>;

/** Rotating refresh-token store, server-side (ADR-0020). */
export const sessionSchema = z.object({
  id: idSchema,
  userId: idSchema,
  expiresAt: z.string(),
  createdAt: z.string(),
  revokedAt: z.string().optional(),
  userAgent: z.string().optional(),
});
export type Session = z.infer<typeof sessionSchema>;

export const tripSchema = z.object({
  id: idSchema,
  name: z.string(),
  destination: z.string(),
  // Structured destination, set when the free-text field becomes a Google Places
  // pick at creation (ADR-0113). `destination` stays the display string; these
  // carry the picked place's identity + the point `timezone` is derived from. All
  // optional — a trip created before ADR-0113 (or via a bare API call) has none.
  destinationGooglePlaceId: z.string().optional(),
  destinationLat: z.number().optional(),
  destinationLng: z.number().optional(),
  destinationCountryCode: z.string().optional(),
  startDate: z.string(), // ISO date
  endDate: z.string(), // ISO date
  timezone: z.string(),
  currency: z.string().optional(),
  icon: z.string().optional(), // chosen badge glyph; no category (ADR-0038 §5)
  createdBy: idSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  updatedBy: idSchema,
  // Only populated by GET /trips (the all-trips list, ADR-0033) — a cheap
  // aggregate for that one screen, not a general-purpose field every Trip
  // producer has to supply.
  memberCount: z.number().int().optional(),
});
export type Trip = z.infer<typeof tripSchema>;

export const membershipSchema = z.object({
  id: idSchema,
  tripId: idSchema,
  userId: idSchema,
  role: membershipRoleSchema,
  calendarSyncEnabled: z.boolean(),
  joinedAt: z.string(),
});
export type Membership = z.infer<typeof membershipSchema>;

export const tripEventSchema = z.object({
  id: idSchema,
  tripId: idSchema,
  date: z.string(), // ISO date
  endDate: z.string().optional(), // non-null = multi-day ambient span (ADR-0018)
  title: z.string(),
  icon: z.string().optional(),
  category: eventCategorySchema.optional(), // canonical semantic type (ADR-0038)
  kind: eventKindSchema,
  startsAt: z.string().optional(), // UTC instant
  endsAt: z.string().optional(),
  /** **The other bound of a flexible edge's window** (ADR-0184). A held span's start is
   *  already a floor and its end a deadline (ADR-0171 §1), i.e. each is a window with
   *  ONE side open; these close them. `startWindowEnd` is the latest a check-in can
   *  happen, `endWindowStart` the earliest a check-out can.
   *
   *  Instants, like `startsAt`/`endsAt` rather than `HH:MM`, so a reception open until
   *  01:00 is expressible and the display-zone derivation applies unchanged (ADR-0107).
   *  Absent on nearly every event, which is the point: the form does not ask. */
  startWindowEnd: z.string().optional(),
  endWindowStart: z.string().optional(),
  placeId: z.string().optional(), // authoritative only for unlinked events (ADR-0048)
  /** Manual display-zone override (ADR-0107 §7 / ADR-0110): the only writer is the
   *  time-field zone chip. Null trusts the derived zone (place > segment > trip
   *  primary), so adding the outbound flight reorients placeless times; non-null is
   *  the user's pinned zone, honoured forever. Not a cache of the derived value. */
  displayTimezone: z.string().optional(),
  status: eventStatusSchema,
  bookingId: idSchema.optional(),
  sortOrder: z.number(),
  source: eventSourceSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  updatedBy: idSchema,
});
export type TripEvent = z.infer<typeof tripEventSchema>;

export const bookingSchema = z.object({
  id: idSchema,
  tripId: idSchema,
  type: bookingTypeSchema,
  title: z.string(),
  confirmationCode: z.string().optional(),
  provider: z.string().optional(),
  placeId: z.string().optional(), // single-place types; mutually exclusive with from/to
  fromPlaceId: z.string().optional(), // transport origin (ADR-0048)
  toPlaceId: z.string().optional(), // transport destination (ADR-0048)
  // Manual display-zone overrides, one per end (ADR-0107 §6-7 session-99 amendment).
  // They follow the same authority rule as the place fields: for transport `start`
  // is the origin's zone and `end` the destination's; for a single-place booking
  // only `start` is used and it drives both ends. Set only by the form's zone chip,
  // and only needed when a place can't answer (a coordless Place-lite).
  startDisplayTimezone: z.string().optional(),
  endDisplayTimezone: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
  source: bookingSourceSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  updatedBy: idSchema,
});
export type Booking = z.infer<typeof bookingSchema>;

/** **What a search is being asked to find, when the asker knows** (field report #6).
 *
 *  A caller names a KIND, and which Google type(s) that becomes is the places proxy's
 *  business, not a form's. A flight leg wants an airport — searching `נתב"ג` unrestricted
 *  returns the terminal, the car park and a hotel beside it, all legitimate answers to the
 *  words and none of them where the plane leaves from.
 *
 *  **`train_station` and `transit_station` join it in ADR-0203 §8**, closing a gap the old
 *  one-member version left and which `BookingSheet.findPlace`'s own comment already named:
 *  _"a train's stop is a station this restriction has no type for yet"_. Which type a
 *  BOOKING asks for is now the profile's answer (`BOOKING_TYPE_PROFILE.searchKind`), not a
 *  conditional at the call site. */
export const placeSearchKindSchema = z.enum(['airport', 'train_station', 'transit_station']);
export type PlaceSearchKind = z.infer<typeof placeSearchKindSchema>;

/** Trip-scoped location registry (ADR-0048). Every `placeId` FK points here. A
 *  name-only row is valid ("Place-lite"); the Google Places picker fills in
 *  googlePlaceId/lat/lng/timezone/rating later (ADR-0108). All the Google-derived
 *  fields are nullable — a Place-lite has none until it's enriched on a pick. */
export const placeSchema = z.object({
  id: idSchema,
  tripId: idSchema,
  googlePlaceId: z.string().optional(),
  name: z.string(),
  address: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  /** IANA zone resolved server-side from lat/lng once, at pick time (ADR-0107/0108). */
  timezone: z.string().optional(),
  /** **The glyph a human chose for this place** (ADR-0147). The only user-authored field
   *  here besides `name`, and it exists for the same reason: it must survive deleting the
   *  idea it was written through, which an icon on `MaybeItem` would not.
   *
   *  It sits at the BOTTOM of the icon resolution chain — under a linked event's own pick
   *  and under a booking's type glyph — because the deliberate choice at the nearest scope
   *  wins and a place is the widest scope.
   *
   *  **And it is why a `Place` stays a row inside a trip.** A chosen icon is trip-scoped
   *  data about a place, not a property of the entity Google describes, so a cross-trip
   *  global place cache cannot hold it (ADR-0147's Consequences). */
  icon: z.string().optional(),
  /** **What a human calls this place** (ADR-0166 §18, field report #23) — a short label that
   *  outranks everything derived, for the cases automation cannot resolve: Ben Gurion's
   *  Wikidata `P931` lists Tel Aviv AND Jerusalem at equal rank, and no tie-break makes that
   *  a fact rather than a coin toss, so the answer to "which one" is a person.
   *
   *  Exactly `icon`'s pattern (ADR-0147 §5) and here for exactly its reason: it is
   *  user-authored, and it must survive deleting the idea or booking it was written through —
   *  which a nickname held on the referencing entity would not. It is display-only, so
   *  `name` still holds what the place is officially called, and the record surfaces
   *  (the booking detail, the editors) keep showing that. */
  nickname: z.string().optional(),
  /** **What a human said this place IS** (ADR-0165). The place's own answer, and it OUTRANKS
   *  the one derived from the referencing entities (`place-usage.ts`'s most-committed
   *  reference) on every place-scoped surface: its pin's hue, its badge glyph, the type facet
   *  it answers to. An event still carries its own category for its own surfaces — the
   *  deliberate choice at the nearest scope wins, exactly as the icon chain resolves.
   *
   *  Here rather than on the referencing `MaybeItem` for the same reason `icon` is (ADR-0147
   *  §5): it must survive deleting the idea it was written through, and the referencing entity
   *  that could hold it is ambiguous the moment two ideas point at one place. */
  category: eventCategorySchema.optional(),
  /** Google's aggregate rating (0–5) and its count, cached on the pick (ADR-0109 §9). */
  rating: z.number().optional(),
  userRatingsTotal: z.number().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  updatedBy: idSchema,
});
export type Place = z.infer<typeof placeSchema>;

/** Idempotency map for one-way calendar push, per member per event (ADR-0020). */
export const calendarEventLinkSchema = z.object({
  id: idSchema,
  eventId: idSchema,
  userId: idSchema,
  googleCalendarEventId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CalendarEventLink = z.infer<typeof calendarEventLinkSchema>;

export const tripDocumentSchema = z.object({
  id: idSchema,
  tripId: idSchema,
  type: documentTypeSchema,
  title: z.string(),
  fileRef: z.string(), // reference to a server-side-encrypted blob — ADR-0015
  mimeType: z.string(),
  sizeBytes: z.number(),
  ownerUserId: idSchema.optional(), // absent = group doc
  createdAt: z.string(),
  updatedAt: z.string(),
  updatedBy: idSchema,
});
export type TripDocument = z.infer<typeof tripDocumentSchema>;

/** List response shape — omits `fileRef` so the encrypted blob reference never
 *  leaves the server outside the guarded `/content` route. */
export const documentSummarySchema = tripDocumentSchema.omit({ fileRef: true });
export type DocumentSummary = z.infer<typeof documentSummarySchema>;

/** The two typed host FKs of an attachment, as one list — the same discipline `Note` uses
 *  (`NOTE_HOST_KEYS`), so "exactly one host" is a `.filter().length` rather than a boolean
 *  and a third host would be one string. There are two members and not three on purpose: a
 *  Place may **display** an inherited attachment and may never **originate** one
 *  (ADR-0173 §4), so its inheritance is entirely a read-time resolution with no row that
 *  could be mis-hosted. */
export const ATTACHMENT_HOST_KEYS = ['eventId', 'bookingId'] as const;
export type AttachmentHostKey = (typeof ATTACHMENT_HOST_KEYS)[number];

/** **A document attaches, it detaches, and it never dies with its host** (ADR-0173 §1).
 *
 *  The link is its own row rather than a host FK on `TripDocument`, and that is what makes
 *  "detach, never delete" the DEFAULT behaviour instead of a `SetNull` special case somebody
 *  later "fixes": deleting a booking cascades this row away and cannot reach the document,
 *  which is a separate row still owned by the trip. A note is born owned by its host; a
 *  document is not — it already exists, with its own screen and its own upload flow, and it
 *  gets attached after the fact.
 *
 *  Many-to-many falls out and is a real requirement rather than generality for its own sake:
 *  ADR-0154 fixes a round trip as **two** `Booking`s, and one confirmation PDF covers both.
 *
 *  No `updatedAt`/`updatedBy`: a link has no content to edit. It is created and it is
 *  removed. */
export const documentAttachmentSchema = z.object({
  id: idSchema,
  tripId: idSchema,
  documentId: idSchema,
  // Exactly one is set, enforced by `createDocumentAttachmentSchema` at both edges
  // (ADR-0023) — the closed union is not expressible as a Prisma check constraint.
  eventId: idSchema.optional(),
  bookingId: idSchema.optional(),
  createdBy: idSchema,
  createdAt: z.string(),
});
export type DocumentAttachment = z.infer<typeof documentAttachmentSchema>;

/**
 * **HOW YOU GET BETWEEN TWO PLACES ON THIS TRIP, WHERE A PERSON HAS SAID** (ADR-0206 §V1.6 as
 * amended by §Z2, and §AM says what the row is about).
 *
 * The default mode is **derived** (`derivedTravelMode`, `routing.ts`) and there is deliberately no
 * `defaultTravelMode` column — §Z2 forbids one. This row is the only persisted half: it exists when
 * somebody actually overrode the derivation for one journey, and not otherwise.
 *
 * **Keyed on the PLACE PAIR, not on an event** (§AM1). The two ids are **canonicalised (sorted)**, so
 * one row serves the pair in both directions — a rail corridor is a rail corridor either way, and
 * the failure that matters is the silent one: declaring תחב״צ on A→B and having the return leg keep
 * printing a walking number (§AM2). An event key would die on every reorder and is finer than the
 * coordinate-keyed cache it modifies, which is incoherent rather than merely awkward.
 *
 * `mode` is a `LegTravelMode`, so `transit` is expressible here and nowhere a provider can see it.
 */
export const travelModeOverrideSchema = z.object({
  id: idSchema,
  tripId: idSchema,
  /** The lower of the two place ids. Canonicalised by `travelOverridePair`, never by a call site. */
  fromPlaceId: idSchema,
  /** The higher of the two. Same canonicalisation. */
  toPlaceId: idSchema,
  mode: legTravelModeSchema,
  createdBy: idSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TravelModeOverride = z.infer<typeof travelModeOverrideSchema>;

/** **Setting one is idempotent on the pair** — the same two places, a mode, and the server upserts.
 *  There is no separate create/update at the edge because there is nothing to distinguish: a person
 *  is stating what this journey is, and stating it twice is stating it once. */
export const setTravelModeOverrideSchema = z.object({
  /** **Client-minted, like every other offline-capable write** (ADR-0056's shape). It is what lets
   *  the queued row and the row the server writes be the same row, so an offline declaration does
   *  not become a second one when the queue flushes. The server honours it on a create and keeps
   *  the EXISTING id on an update, because the pair is the identity and the id is only its handle. */
  id: idSchema.optional(),
  fromPlaceId: idSchema,
  toPlaceId: idSchema,
  mode: legTravelModeSchema,
});
export type SetTravelModeOverride = z.infer<typeof setTravelModeOverrideSchema>;

export const maybeItemSchema = z.object({
  id: idSchema,
  tripId: idSchema,
  title: z.string(),
  icon: z.string().optional(),
  category: eventCategorySchema.optional(), // canonical semantic type (ADR-0038)
  placeId: z.string().optional(),
  /** The day we're thinking of, pencilled in (ADR-0116 §1) — an ISO date, or absent
   *  for "someday". NOT a schedule: an idea with a target day carries no time, no
   *  slot, and never appears on the timeline; it only groups on the shelf. */
  targetDate: z.string().nullish(),
  createdBy: idSchema,
  consumed: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  updatedBy: idSchema,
});
export type MaybeItem = z.infer<typeof maybeItemSchema>;

/** Where a note came from (ADR-0152 §1/§8). One value in v1 — a member wrote it — because
 *  no strategy is registered and nothing external can produce a row yet (§9). It is a named
 *  constant rather than a boolean precisely so the second value is a line and not a
 *  migration: an external tip becomes a `Note` only when a human keeps it, and the row has
 *  to record which source that was. */
export const noteSourceSchema = z.enum(['member']);
export type NoteSource = z.infer<typeof noteSourceSchema>;

/** The five typed host FKs as one list, so "at most one host" is a `.filter().length`
 *  rather than a ten-clause boolean and a sixth host is one string. `NOTE_HOST_FIELD`
 *  (`constants.ts`) is the same set from the other direction — entity type → which FK —
 *  and it is what the cascade rule keys off. Declared here rather than beside the schemas
 *  that enforce it because `constants.ts` needs the type too, and `schemas.ts` already
 *  imports `constants.ts`. */
export const NOTE_HOST_KEYS = [
  'eventId',
  'bookingId',
  'placeId',
  'maybeItemId',
  'documentId',
] as const;
export type NoteHostKey = (typeof NOTE_HOST_KEYS)[number];

/** **A note is one entity and what it is about is a field** (ADR-0152 §1). No host = a
 *  general note; exactly one host FK set = that entity's note. Same row, same editor, same
 *  list, same sync channel, same offline story either way.
 *
 *  `category` stays **null on a hosted note** and is RESOLVED at render as
 *  `note.category ?? host.category` (§5's amendment) — copying the host's value at write
 *  time looks identical on day one and goes stale the moment the host is recategorised.
 *  There is deliberately no `icon`: the same chain gives the glyph, and a field of its own
 *  would drag an icon picker into an editor whose whole point is that it asks for nothing.
 *
 *  A note carries `body` or `url` or both — never neither, which is the editor's one
 *  refusal (ADR-0150 / ADR-0153 §5). `title` is optional; when it and a body are both
 *  present the row shows the title and demotes the body, so they are never printed twice. */
export const noteSchema = z.object({
  id: idSchema,
  tripId: idSchema,
  title: z.string().optional(),
  body: z.string().optional(),
  /** A pasted Instagram/TikTok/blog reference. **"Social media" is a link, not a category**
   *  (ADR-0152 §5) — and it is the honest hook for later enrichment, which an enum never was. */
  url: z.string().optional(),
  category: eventCategorySchema.optional(),
  // The typed host union: AT MOST ONE is set (ADR-0152 §2). Typed FKs rather than a
  // `targetType`/`targetId` pair so orphan cleanup is the database's job in one place
  // instead of application logic in five delete paths.
  eventId: idSchema.optional(),
  bookingId: idSchema.optional(),
  placeId: idSchema.optional(),
  maybeItemId: idSchema.optional(),
  documentId: idSchema.optional(),
  source: noteSourceSchema,
  createdBy: idSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  updatedBy: idSchema,
});
export type Note = z.infer<typeof noteSchema>;

/** **A task is an obligation with a deadline and optionally a doer; an event is a slot the
 *  group occupies** (tasks brief §1). That line is what keeps a task off the day rail, out
 *  of the ripple, and free of ADR-0011's hard/soft axis — it is already the flexible thing.
 *
 *  `open` → `done` (someone did it) or `dismissed` (it stopped mattering). Two settled
 *  values rather than one boolean because they are different facts, and the screen collapses
 *  them together while the row draws them apart. */
export const taskStatusSchema = z.enum(['open', 'done', 'dismissed']);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

/** **Which readiness check this row overlays** (tasks brief §4). The five ids
 *  `computeReadiness` returns, promoted here because the column crosses the FE/BE boundary:
 *  the server validates what it stores and the client resolves the row against the
 *  derivation. `lib/readiness.ts`'s `CheckId` is this type, not a second copy of it.
 *
 *  A check nobody has touched has **no row at all** and renders as a pure derivation. The
 *  moment someone dismisses, assigns or flags it, a `Task` carrying `derivedKey` is written
 *  — same entity, same sync channel, same appliers. `status` stays the derivation's answer
 *  unless the row says `dismissed`, so done-ness cannot go stale. */
export const taskDerivedKeySchema = z.enum([
  'flights',
  'lodging',
  'itinerary',
  'documents',
  'group',
]);
export type TaskDerivedKey = z.infer<typeof taskDerivedKeySchema>;

/** **An alias, deliberately, rather than the same five strings written a second time.** A
 *  task hangs off the same five hosts a note does and under the same "at most one" rule, so
 *  the compiler holds them identical instead of a reviewer having to. The coupling is the
 *  point: if the two sets are ever meant to differ, this line becomes a real list and the
 *  divergence is visible at the moment it is introduced. (`ATTACHMENT_HOST_KEYS` is the
 *  precedent for a genuinely different set — two members, for a stated reason.) */
export const TASK_HOST_KEYS = NOTE_HOST_KEYS;
export type TaskHostKey = NoteHostKey;

/** **A task is one entity and what it is about is a field** — `Note`'s shape (ADR-0152 §1)
 *  down to the host block, because this is that feature's sibling. No host = a general
 *  task; exactly one host FK set = that entity's task.
 *
 *  Deliberate absences, each with its reason (brief §5): **no `category`** — the row's
 *  leading element is its completion control, so there is no icon slot to fill and no
 *  `EventCategory` chain to inherit; **no hard/soft**; **no priority enum**, because rule 4
 *  has no colour left to spend and `important` upgrades to a scale later as a column rather
 *  than a redesign.
 *
 *  **`displayTimezone` REVERSES brief §10** (owner, 2026-08-17: the zone should be
 *  selectable in the task form _"the same way as in the event and booking forms"_). §10 had
 *  the due zone derived through ADR-0107's resolver and nothing stored, so the chip stated a
 *  zone and offered no pin.
 *
 *  Deriving it is right until somebody can CHOOSE it, and then it is the bug
 *  `Event.displayTimezone` exists to prevent: type 09:00 with Tokyo picked, and a resolver
 *  that answers "the zone you will be in when this falls due" renders it as 03:00 somewhere
 *  else — a deadline showing a wall-clock nobody typed. A picked zone has to be stored or it
 *  is not picked, only borrowed for the arithmetic.
 *
 *  Absent = derived, exactly as before, which is what keeps every existing task unchanged.
 *
 *  `dueAt` absent = no deadline, which is a legitimate task and not a half-filled one.
 *  `dueHasTime` is not derivable from `dueAt`: a deadline of "Thursday" and one of
 *  "Thursday 00:00" are the same instant and different obligations. */
export const taskSchema = z.object({
  id: idSchema,
  tripId: idSchema,
  title: z.string(),
  body: z.string().optional(),
  dueAt: z.string().optional(),
  dueHasTime: z.boolean(),
  /** The zone the deadline was TYPED in, when somebody pinned one. Absent → derived through
   *  ADR-0107's resolver, which is every task written before this and every one where the
   *  chip was left alone. `Event.displayTimezone`'s twin, down to the name. */
  displayTimezone: z.string().optional(),
  /** Absent = the group's ("one of us"), which already covers the "either of these two"
   *  case the brief's §6 refuses to model. Set = delegated. */
  assigneeUserId: idSchema.optional(),
  important: z.boolean(),
  status: taskStatusSchema,
  settledAt: z.string().optional(),
  settledBy: idSchema.optional(),
  derivedKey: taskDerivedKeySchema.optional(),
  /** **The task this one is a step of** (ADR-0196 §1). Set = this row is a sub-task, and the
   *  schemas refuse everything a step may not carry: a host FK, a deadline, `important`,
   *  `body`, `derivedKey` and a child of its own. Absent = a top-level task, which is every
   *  task written before this.
   *
   *  **Depth is one level and it is enforced at both edges**, which is the decision that
   *  keeps the rest of the feature finite. Nothing here records whether a task IS a parent:
   *  that is `subtasks.get(id)?.length` on the client, so a "checklist" with no steps cannot
   *  exist and no flag can go stale against the rows. */
  parentTaskId: idSchema.optional(),
  // The typed host union: AT MOST ONE is set, `onDelete: Cascade`, same discipline and
  // same five columns as `Note` above (ADR-0152 §2). Nothing reads them until phase 4;
  // they ship in the first migration because a nullable column is free today and a
  // second migration on a live synced entity is not.
  eventId: idSchema.optional(),
  bookingId: idSchema.optional(),
  placeId: idSchema.optional(),
  maybeItemId: idSchema.optional(),
  documentId: idSchema.optional(),
  createdBy: idSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  updatedBy: idSchema,
});
export type Task = z.infer<typeof taskSchema>;

/** Full current trip state + sync cursor — GET /trips/:tripId/snapshot (ADR-0019/0022). */
export const tripSnapshotSchema = z.object({
  trip: tripSchema,
  members: z.array(membershipSchema),
  // Display info for each member (displayName/avatarHue/picture) — Membership only
  // carries userId/role, so the Header's avatar row needs this alongside it.
  users: z.array(userSchema),
  events: z.array(tripEventSchema),
  bookings: z.array(bookingSchema),
  documents: z.array(documentSummarySchema),
  maybeItems: z.array(maybeItemSchema),
  places: z.array(placeSchema),
  notes: z.array(noteSchema),
  tasks: z.array(taskSchema),
  /** The document↔host links (ADR-0173 §1). A first-class syncable entity of its own, the
   *  cost ADR-0172's derivation deliberately avoided — but the storage genuinely differs
   *  here, so the sync substrate does too. Which DOCUMENT a link resolves to is answered
   *  against `documents` above, so an attachment whose document this reader cannot see
   *  renders as nothing (§6). */
  documentAttachments: z.array(documentAttachmentSchema),
  /** **The per-leg travel-mode overrides** (ADR-0206 §V1.6/§Z2, keyed per §AM). Only the ones
   *  somebody actually set — the default is derived, so an untouched trip carries an empty array
   *  and reads exactly as it did before this existed. Defaulted rather than required for the same
   *  compatibility reason `fxRates` is: a client on an older snapshot must not fail to parse. */
  travelModeOverrides: z.array(travelModeOverrideSchema).default([]),
  /** **The world's facts about the trip's places, keyed by `placeId`** (ADR-0166 §6). A
   *  server-owned read model joined onto the snapshot, not an entity of the trip: the store
   *  is global and no client writes it, so it carries no `Change` and never appears in the
   *  change feed. Absent-or-empty is the normal state — most places have nothing. */
  enrichments: tripEnrichmentsSchema,
  /** **The world's exchange rates** (ADR-0184 §7), on the same terms as
   *  `enrichments` above: global, server-owned, no `Change`, never client-written.
   *  `null` is the normal cold state — nothing has been fetched yet, or the
   *  fetcher is switched off — and every surface that reads it treats absence as
   *  a state to render rather than an error.
   *
   *  **Defaulted rather than required**, which is a compatibility decision and not
   *  laziness: a client can meet a server that predates this field mid-deploy, and
   *  a missing key must read as the cold state it already has a rendering for
   *  rather than failing the whole snapshot parse and blanking the trip. */
  fxRates: fxRatesSchema.nullable().default(null),
  /** **The world's weather over the trip's coordinate cells** (ADR-0218 §1/§6), on
   *  exactly the terms `fxRates` above states: global, server-owned, no `Change`,
   *  never client-written, and defaulted rather than required so a client that
   *  meets an older server mid-deploy reads the cold state instead of failing the
   *  whole snapshot parse.
   *
   *  **This is the only way a forecast reaches a client** — there is no route and
   *  no controller (§6). `FxController` exists because a human taps refresh;
   *  nobody taps a forecast, so the snapshot read both serves it and triggers it. */
  forecast: forecastSchema.nullable().default(null),
  latestSeq: z.string(), // BigInt serialized as string, see Change.seq
});
export type TripSnapshot = z.infer<typeof tripSnapshotSchema>;

export const changeSchema = z.object({
  id: idSchema,
  seq: z.string(), // BigInt serialized as string to avoid JS precision loss (ADR-0019)
  tripId: idSchema,
  actorUserId: idSchema,
  entityType: entityTypeSchema,
  entityId: idSchema,
  action: changeActionSchema,
  before: z.record(z.string(), z.unknown()).optional(),
  after: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string(),
});
export type Change = z.infer<typeof changeSchema>;

/** `GET /trips/:tripId` response shape — not its own persisted entity. */
export const tripWithMembersSchema = z.object({
  trip: tripSchema,
  members: z.array(membershipSchema),
});
export type TripWithMembers = z.infer<typeof tripWithMembersSchema>;

/** What this server can do about notifications, answered at boot (ADR-0197 §7).
 *
 *  `vapidPublicKey` is `null` when the server holds no keypair — a real state, not an
 *  error: a dev box or a deploy that never set them. It rides `/me` rather than a
 *  `VITE_` copy of its own for two reasons. The halves of a keypair must not be able to
 *  drift (the private one lives only on the server, so the public one is the server's to
 *  state), and a client that is about to offer a control needs the answer **before** the
 *  first gesture, which is exactly when `/me` has already landed.
 *
 *  Its own object rather than a loose field, because §7's settings row will need to say
 *  more than one true thing about the server's side of this. */
export const pushCapabilitySchema = z.object({
  vapidPublicKey: z.string().nullable(),
});
export type PushCapability = z.infer<typeof pushCapabilitySchema>;

/**
 * One registered device, as a settings surface lists it (ADR-0197 §2, phase 1b).
 *
 * **The endpoint is not here, and that is the point.** It is a bearer capability — anyone
 * holding it can push to that device — so it stays server-side, and the row is addressed by
 * its own `id` instead. A client identifies *its own* row by the id it stored when it
 * subscribed, never by comparing endpoints.
 *
 * `label` is derived on the server from the stored user-agent (`deviceLabel`), so the raw
 * string never ships either: nothing on the screen needs it, and it is a hint rather than an
 * identity — the "this device" mark is what carries recognition.
 */
export const pushDeviceSchema = z.object({
  id: idSchema,
  /** `iPhone · Safari`, or `מכשיר` when the user-agent said nothing recognisable. */
  label: z.string(),
  /** When this device was last actually reached, or null if it never has been. What answers
   *  "is this row still alive" without a second call. */
  lastSentAt: z.string().nullable(),
  createdAt: z.string(),
});
export type PushDevice = z.infer<typeof pushDeviceSchema>;

/**
 * Which categories of notification this person wants (ADR-0198 §6).
 *
 * **On `Me` and not on `userSchema`, and that is the whole point of the separation.**
 * `userSchema` is also every CO-MEMBER's row — the roster, the avatars, the assignee
 * options — so a preference put there would tell the group what each of them has switched
 * off. It is account state (it follows a person to a new phone, unlike the per-device
 * subscription), and it is nobody else's business.
 *
 * Two fields, for phases A and B. `group` arrives only if phase D is ever built — a field for
 * a phase that may never ship is a preference for a feature that does not exist.
 */
export const notifyPrefsSchema = z.object({
  tasks: z.boolean(),
  /** Phase B: the trip's own commitments — hard events, span edges, and the evening-before
   *  send. A separate switch from `tasks` because they are different registers: one is what
   *  a person wrote down, the other is what the itinerary already committed them to. */
  obligations: z.boolean(),
});
export type NotifyPrefs = z.infer<typeof notifyPrefsSchema>;

/**
 * **Which planet build the live map source is serving right now** (ADR-0187 §1 amendment,
 * 2026-08-21).
 *
 * On `/me` for the same two reasons `push` is, and the first one is the bug it fixes: the id
 * names an upstream object whose lifetime is about a week, so the server — the only side that
 * knows what it can actually read — has to be the one that states it. A build id compiled into
 * the client is a URL that expires, and it expired silently.
 *
 * The second reason is timing: the answer has to be in hand before the FIRST TILE, and `/me` has
 * already landed by the time the Map tab mounts.
 *
 * `null` is a real state, not an error — no live source resolved (upstream unreachable at boot,
 * or a mirror misconfigured). The client answers it by drawing the coarse world layer as its
 * detail source, which is the same fallback a plane already uses: coarse, but never blank.
 */
export const mapCapabilitySchema = z.object({
  liveBuild: z.string().nullable(),
  /** **Which vintage of the OFFLINE archives this server is cutting** (ADR-0186 §6 amendment).
   *  A device compares it with the vintage it holds to know whether a fresher archive exists at
   *  all — without it, a downloaded map is frozen at the build it was cut from forever. `null`
   *  when the server cannot name one (no live build resolved).
   *
   *  **`.optional()`, and the reason is the whole point of the outer object being optional too.**
   *  A field ADDED to a capability object has to tolerate the object's older shape, because that
   *  shape is already in `localStorage` on every device (`readCachedMe`) and in every fixture
   *  written against the previous build. Required, it made `meSchema.parse` throw on a `/me`
   *  holding only `liveBuild` — so `fetchMe` rejected, the cached identity failed to parse with
   *  it, and the app dropped to /login: an offline cold-load signing a person out on a plane.
   *  Caught as 231 e2e timeouts, which is what "the app does not boot" looks like from CI. */
  archiveVintage: z.string().nullable().optional(),
});
export type MapCapability = z.infer<typeof mapCapabilitySchema>;

/** `GET /me` response shape — not its own persisted entity (ADR-0020). */
export const meSchema = z.object({
  user: userSchema,
  memberships: z.array(membershipSchema),
  /** Optional so a client built against this schema still reads a `/me` from a server
   *  that predates it — the cached copy in Dexie is exactly such a payload. */
  push: pushCapabilitySchema.optional(),
  /** Optional for the same reason `push` is: a cached `/me` from before this field. A
   *  reader that finds it absent should treat the preferences as ON, matching the column
   *  default — the safe direction here is "as the server has it", not "off". */
  notify: notifyPrefsSchema.optional(),
  /** Optional for the same reason the two above are — and here the absent case is also the
   *  CACHED one: a `/me` stored before this field says nothing about the live source, and a
   *  reader that finds it missing falls back to the world layer rather than guessing a date. */
  map: mapCapabilitySchema.optional(),
});
export type Me = z.infer<typeof meSchema>;

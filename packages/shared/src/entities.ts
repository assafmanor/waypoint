// Shared domain shapes — the single source of truth for entity shapes used by
// both the backend and the frontend. Mirrors docs/architecture/data-model.md.
// Keep in sync with the Prisma schema (backend/prisma/schema.prisma).
//
// Zod-first (ADR-0023): each entity is a schema; the TS type is `z.infer` of it.
// This is also what backend response validation and OpenAPI generation read from.

import { z } from 'zod';
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

// creator is admin — ADR-0005/0018
export const membershipRoleSchema = z.enum(['admin', 'peer']);
export type MembershipRole = z.infer<typeof membershipRoleSchema>;

export const documentTypeSchema = z.enum(['passport', 'insurance', 'visa', 'other']);
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
  dailyBudgetMinor: z.number().optional(),
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

/** `GET /me` response shape — not its own persisted entity (ADR-0020). */
export const meSchema = z.object({
  user: userSchema,
  memberships: z.array(membershipSchema),
});
export type Me = z.infer<typeof meSchema>;

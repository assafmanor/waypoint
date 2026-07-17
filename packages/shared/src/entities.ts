// Shared domain shapes — the single source of truth for entity shapes used by
// both the backend and the frontend. Mirrors docs/architecture/data-model.md.
// Keep in sync with the Prisma schema (backend/prisma/schema.prisma).
//
// Zod-first (ADR-0023): each entity is a schema; the TS type is `z.infer` of it.
// This is also what backend response validation and OpenAPI generation read from.

import { z } from 'zod';

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

export const userSchema = z.object({
  id: idSchema,
  email: z.string(),
  displayName: z.string(),
  avatarColor: z.string(),
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
  details: z.record(z.string(), z.unknown()).optional(),
  source: bookingSourceSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  updatedBy: idSchema,
});
export type Booking = z.infer<typeof bookingSchema>;

/** Trip-scoped location registry (ADR-0048). Every `placeId` FK points here. A
 *  name-only row is valid ("Place-lite"); the Google Places picker fills in
 *  googlePlaceId/lat/lng later. */
export const placeSchema = z.object({
  id: idSchema,
  tripId: idSchema,
  googlePlaceId: z.string().optional(),
  name: z.string(),
  address: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
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
  createdBy: idSchema,
  consumed: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  updatedBy: idSchema,
});
export type MaybeItem = z.infer<typeof maybeItemSchema>;

/** Full current trip state + sync cursor — GET /trips/:tripId/snapshot (ADR-0019/0022). */
export const tripSnapshotSchema = z.object({
  trip: tripSchema,
  members: z.array(membershipSchema),
  // Display info for each member (displayName/avatarColor) — Membership only
  // carries userId/role, so the Header's avatar row needs this alongside it.
  users: z.array(userSchema),
  events: z.array(tripEventSchema),
  bookings: z.array(bookingSchema),
  documents: z.array(documentSummarySchema),
  maybeItems: z.array(maybeItemSchema),
  places: z.array(placeSchema),
  latestSeq: z.string(), // BigInt serialized as string, see Change.seq
});
export type TripSnapshot = z.infer<typeof tripSnapshotSchema>;

export const changeSchema = z.object({
  id: idSchema,
  seq: z.string(), // BigInt serialized as string to avoid JS precision loss (ADR-0019)
  tripId: idSchema,
  actorUserId: idSchema,
  entityType: z.string(),
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

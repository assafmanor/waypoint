import type {
  Booking,
  Document,
  DocumentAttachment,
  Event,
  Membership,
  MaybeItem,
  Note,
  Place,
  Task,
  TravelModeOverride as PrismaTravelModeOverride,
  Trip,
  User,
} from '@prisma/client';
import type {
  Booking as SharedBooking,
  DocumentAttachment as SharedDocumentAttachment,
  DocumentSummary,
  InvitePreview,
  Membership as SharedMembership,
  MaybeItem as SharedMaybeItem,
  Note as SharedNote,
  NoteSource,
  Place as SharedPlace,
  Task as SharedTask,
  TaskDerivedKey,
  TravelModeOverride as SharedTravelModeOverride,
  Trip as SharedTrip,
  TripEvent,
  User as SharedUser,
} from '@waypoint/shared';
import { avatarContentPath, resolveAvatarHue } from '@waypoint/shared';

/** A `@db.Date` column as `YYYY-MM-DD`. Exported since ADR-0220: `SharingService`'s
 *  `previewByCode` needs the same conversion, and a second one-liner beside this one is how
 *  a preview comes to print a different day than the ticket it advertises. */
export const toDateOnly = (d: Date): string => d.toISOString().slice(0, 10);

/** The one place a `User` row becomes a wire DTO. It RESOLVES the identity hue
 *  (stored pick, else derived from the id), so a nullable column can never reach a
 *  render and no client has to own that fallback — ADR-0133 §5. It likewise turns the
 *  stored blob key into a URL (§12), so the route shape lives on the server and a
 *  client only ever sees "here is where the face is, or there isn't one". */
export const toUserDto = (u: User): SharedUser => ({
  id: u.id,
  email: u.email,
  displayName: u.displayName,
  avatarHue: resolveAvatarHue(u.id, u.avatarHue),
  avatarChoice: u.avatarChoice,
  googleAvatarUrl: u.googleAvatarUrl,
  uploadedAvatarUrl: u.uploadedAvatarKey ? avatarContentPath(u.id, u.uploadedAvatarKey) : null,
  preferredCurrency: u.preferredCurrency,
  createdAt: u.createdAt.toISOString(),
});

export const toTripDto = (t: Trip, memberCount?: number): SharedTrip => ({
  id: t.id,
  name: t.name,
  destination: t.destination,
  destinationGooglePlaceId: t.destinationGooglePlaceId ?? undefined,
  destinationLat: t.destinationLat ?? undefined,
  destinationLng: t.destinationLng ?? undefined,
  destinationCountryCode: t.destinationCountryCode ?? undefined,
  startDate: toDateOnly(t.startDate),
  endDate: toDateOnly(t.endDate),
  timezone: t.timezone,
  currency: t.currency ?? undefined,
  icon: t.icon ?? undefined,
  createdBy: t.createdBy,
  createdAt: t.createdAt.toISOString(),
  updatedAt: t.updatedAt.toISOString(),
  updatedBy: t.updatedBy,
  memberCount,
});

export const toMembershipDto = (m: Membership): SharedMembership => ({
  id: m.id,
  tripId: m.tripId,
  userId: m.userId,
  role: m.role,
  calendarSyncEnabled: m.calendarSyncEnabled,
  joinedAt: m.joinedAt.toISOString(),
});

export const toEventDto = (e: Event): TripEvent => ({
  id: e.id,
  tripId: e.tripId,
  date: toDateOnly(e.date),
  endDate: e.endDate ? toDateOnly(e.endDate) : undefined,
  title: e.title,
  icon: e.icon ?? undefined,
  category: e.category ?? undefined,
  kind: e.kind,
  startsAt: e.startsAt?.toISOString(),
  endsAt: e.endsAt?.toISOString(),
  startWindowEnd: e.startWindowEnd?.toISOString(),
  endWindowStart: e.endWindowStart?.toISOString(),
  placeId: e.placeId ?? undefined,
  displayTimezone: e.displayTimezone ?? undefined,
  status: e.status,
  bookingId: e.bookingId ?? undefined,
  sortOrder: e.sortOrder,
  source: e.source,
  createdAt: e.createdAt.toISOString(),
  updatedAt: e.updatedAt.toISOString(),
  updatedBy: e.updatedBy,
});

/**
 * **AN EVENT AS A `Change.after` PAYLOAD** — the persisted row, with every absent field stated as
 * an explicit `null`.
 *
 * `sync-and-offline.md` §3 already required the row rather than the request ("build `after` from
 * what `apply` returned"), and `events.service.ts` was the module that never did: it published
 * `after: input`, so a field the service DERIVED was invisible to every other device. The reported
 * cost (owner, 2026-09-01) was a peer's drag — `move` shifts `endsAt` itself to preserve the
 * duration, the input has no `endsAt`, so peers took the new start, kept the old end and silently
 * held an event of a different length. `endsAt` is the instant a hole is measured from, so that
 * day's journeys, free time and total were all then derived from a time the server had replaced.
 *
 * **The `null`s are what make it a ROW rather than a patch, and they are the half `toEventDto`
 * cannot express.** A receiving client merges `after` over what it holds, and `undefined` does not
 * survive JSON — so a field the server CLEARED (an event's own place, once it is linked to a
 * booking: ADR-0048's authority invariant) would simply be missing from the payload and the peer
 * would keep the stale value. `null` is the wire's "unset me", already understood on the far side
 * by `coerceClearedFields`.
 */
export const toEventChangePayload = (e: Event): Record<string, unknown> =>
  Object.fromEntries(Object.entries(toEventDto(e)).map(([key, value]) => [key, value ?? null]));

export const toBookingDto = (b: Booking): SharedBooking => ({
  id: b.id,
  tripId: b.tripId,
  type: b.type,
  title: b.title,
  confirmationCode: b.confirmationCode ?? undefined,
  provider: b.provider ?? undefined,
  placeId: b.placeId ?? undefined,
  fromPlaceId: b.fromPlaceId ?? undefined,
  toPlaceId: b.toPlaceId ?? undefined,
  startDisplayTimezone: b.startDisplayTimezone ?? undefined,
  endDisplayTimezone: b.endDisplayTimezone ?? undefined,
  details: (b.details as Record<string, unknown> | null) ?? undefined,
  source: b.source,
  createdAt: b.createdAt.toISOString(),
  updatedAt: b.updatedAt.toISOString(),
  updatedBy: b.updatedBy,
});

export const toDocumentSummaryDto = (d: Document): DocumentSummary => ({
  id: d.id,
  tripId: d.tripId,
  type: d.type,
  title: d.title,
  mimeType: d.mimeType,
  sizeBytes: d.sizeBytes,
  ownerUserId: d.ownerUserId ?? undefined,
  createdAt: d.createdAt.toISOString(),
  updatedAt: d.updatedAt.toISOString(),
  updatedBy: d.updatedBy,
});

export const toMaybeItemDto = (m: MaybeItem): SharedMaybeItem => ({
  id: m.id,
  tripId: m.tripId,
  title: m.title,
  icon: m.icon ?? undefined,
  category: m.category ?? undefined,
  placeId: m.placeId ?? undefined,
  targetDate: m.targetDate ?? undefined,
  createdBy: m.createdBy,
  consumed: m.consumed,
  createdAt: m.createdAt.toISOString(),
  updatedAt: m.updatedAt.toISOString(),
  updatedBy: m.updatedBy,
});

/** A note row → its wire DTO. `source` is a plain column rather than a Prisma enum (it
 *  has one value in v1 and its second arrives with the first strategy, ADR-0152 §8), so
 *  this is the one place the stored string is narrowed to the shared union. */
export const toNoteDto = (n: Note): SharedNote => ({
  id: n.id,
  tripId: n.tripId,
  title: n.title ?? undefined,
  body: n.body ?? undefined,
  url: n.url ?? undefined,
  category: n.category ?? undefined,
  eventId: n.eventId ?? undefined,
  bookingId: n.bookingId ?? undefined,
  placeId: n.placeId ?? undefined,
  maybeItemId: n.maybeItemId ?? undefined,
  documentId: n.documentId ?? undefined,
  source: n.source as NoteSource,
  createdBy: n.createdBy,
  createdAt: n.createdAt.toISOString(),
  updatedAt: n.updatedAt.toISOString(),
  updatedBy: n.updatedBy,
});

/** `derivedKey` and `status` are the two columns the database holds looser than the wire
 *  does — a `String?` by design (a sixth readiness check must not be a migration) and a
 *  Prisma enum whose member names are the shared union's values. Both are re-narrowed here,
 *  which is the same cast `toNoteDto` makes for `source`. */
export const toTaskDto = (t: Task): SharedTask => ({
  id: t.id,
  tripId: t.tripId,
  title: t.title,
  body: t.body ?? undefined,
  dueAt: t.dueAt?.toISOString(),
  dueHasTime: t.dueHasTime,
  assigneeUserId: t.assigneeUserId ?? undefined,
  important: t.important,
  status: t.status,
  settledAt: t.settledAt?.toISOString(),
  settledBy: t.settledBy ?? undefined,
  derivedKey: (t.derivedKey as TaskDerivedKey | null) ?? undefined,
  parentTaskId: t.parentTaskId ?? undefined,
  eventId: t.eventId ?? undefined,
  bookingId: t.bookingId ?? undefined,
  placeId: t.placeId ?? undefined,
  maybeItemId: t.maybeItemId ?? undefined,
  documentId: t.documentId ?? undefined,
  createdBy: t.createdBy,
  createdAt: t.createdAt.toISOString(),
  updatedAt: t.updatedAt.toISOString(),
  updatedBy: t.updatedBy,
});

/** A link row → its wire DTO (ADR-0173 §1). No `updatedAt`/`updatedBy`: a link has no
 *  content, so there is nothing to have edited. */
export const toDocumentAttachmentDto = (a: DocumentAttachment): SharedDocumentAttachment => ({
  id: a.id,
  tripId: a.tripId,
  documentId: a.documentId,
  eventId: a.eventId ?? undefined,
  bookingId: a.bookingId ?? undefined,
  createdBy: a.createdBy,
  createdAt: a.createdAt.toISOString(),
});

/** **The override, as the snapshot and the change feed carry it** (ADR-0206 §AM). The pair is
 *  already canonicalised in storage, so nothing here has to sort — reading it back out in the
 *  same order it went in is what keeps the client's lookup a single key. */
export const toTravelModeOverrideDto = (o: PrismaTravelModeOverride): SharedTravelModeOverride => ({
  id: o.id,
  tripId: o.tripId,
  fromPlaceId: o.fromPlaceId,
  toPlaceId: o.toPlaceId,
  mode: o.mode as SharedTravelModeOverride['mode'],
  createdBy: o.createdBy,
  createdAt: o.createdAt.toISOString(),
  updatedAt: o.updatedAt.toISOString(),
});

export const toInvitePreviewDto = (t: Trip, memberCount: number): InvitePreview => ({
  tripId: t.id,
  tripName: t.name,
  icon: t.icon ?? undefined,
  destination: t.destination,
  startDate: toDateOnly(t.startDate),
  endDate: toDateOnly(t.endDate),
  memberCount,
});

export const toPlaceDto = (p: Place): SharedPlace => ({
  id: p.id,
  tripId: p.tripId,
  googlePlaceId: p.googlePlaceId ?? undefined,
  name: p.name,
  address: p.address ?? undefined,
  lat: p.lat ?? undefined,
  lng: p.lng ?? undefined,
  timezone: p.timezone ?? undefined,
  icon: p.icon ?? undefined,
  nickname: p.nickname ?? undefined,
  category: p.category ?? undefined,
  rating: p.rating ?? undefined,
  userRatingsTotal: p.userRatingsTotal ?? undefined,
  createdAt: p.createdAt.toISOString(),
  updatedAt: p.updatedAt.toISOString(),
  updatedBy: p.updatedBy,
});

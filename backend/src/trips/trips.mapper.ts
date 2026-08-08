import type {
  Booking,
  Document,
  DocumentAttachment,
  Event,
  Membership,
  MaybeItem,
  Note,
  Place,
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
  Trip as SharedTrip,
  TripEvent,
  User as SharedUser,
} from '@waypoint/shared';
import { avatarContentPath, resolveAvatarHue } from '@waypoint/shared';

const toDateOnly = (d: Date): string => d.toISOString().slice(0, 10);

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
  dailyBudgetMinor: t.dailyBudgetMinor ?? undefined,
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

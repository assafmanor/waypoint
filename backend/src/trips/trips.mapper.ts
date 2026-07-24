import type {
  Booking,
  Document,
  Event,
  Membership,
  MaybeItem,
  Place,
  Trip,
  User,
} from '@prisma/client';
import type {
  Booking as SharedBooking,
  DocumentSummary,
  InvitePreview,
  Membership as SharedMembership,
  MaybeItem as SharedMaybeItem,
  Place as SharedPlace,
  Trip as SharedTrip,
  TripEvent,
  User as SharedUser,
} from '@waypoint/shared';

const toDateOnly = (d: Date): string => d.toISOString().slice(0, 10);

export const toUserDto = (u: User): SharedUser => ({
  id: u.id,
  email: u.email,
  displayName: u.displayName,
  avatarColor: u.avatarColor,
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
  createdBy: m.createdBy,
  consumed: m.consumed,
  createdAt: m.createdAt.toISOString(),
  updatedAt: m.updatedAt.toISOString(),
  updatedBy: m.updatedBy,
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
  rating: p.rating ?? undefined,
  userRatingsTotal: p.userRatingsTotal ?? undefined,
  createdAt: p.createdAt.toISOString(),
  updatedAt: p.updatedAt.toISOString(),
  updatedBy: p.updatedBy,
});

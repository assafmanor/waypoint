import type { Booking, Event, Membership, MaybeItem, Trip, TripNote } from '@prisma/client';
import type {
  Booking as SharedBooking,
  InvitePreview,
  Membership as SharedMembership,
  MaybeItem as SharedMaybeItem,
  Trip as SharedTrip,
  TripEvent,
  TripNote as SharedTripNote,
} from '@waypoint/shared';

const toDateOnly = (d: Date): string => d.toISOString().slice(0, 10);

export const toTripDto = (t: Trip): SharedTrip => ({
  id: t.id,
  name: t.name,
  destination: t.destination,
  startDate: toDateOnly(t.startDate),
  endDate: toDateOnly(t.endDate),
  timezone: t.timezone,
  currency: t.currency ?? undefined,
  dailyBudgetMinor: t.dailyBudgetMinor ?? undefined,
  createdBy: t.createdBy,
  createdAt: t.createdAt.toISOString(),
  updatedAt: t.updatedAt.toISOString(),
  updatedBy: t.updatedBy,
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
  kind: e.kind,
  startsAt: e.startsAt?.toISOString(),
  endsAt: e.endsAt?.toISOString(),
  location: e.location ?? undefined,
  placeId: e.placeId ?? undefined,
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
  address: b.address ?? undefined,
  placeId: b.placeId ?? undefined,
  startsAt: b.startsAt?.toISOString(),
  endsAt: b.endsAt?.toISOString(),
  details: (b.details as Record<string, unknown> | null) ?? undefined,
  source: b.source,
  createdAt: b.createdAt.toISOString(),
  updatedAt: b.updatedAt.toISOString(),
  updatedBy: b.updatedBy,
});

export const toMaybeItemDto = (m: MaybeItem): SharedMaybeItem => ({
  id: m.id,
  tripId: m.tripId,
  title: m.title,
  icon: m.icon ?? undefined,
  placeId: m.placeId ?? undefined,
  createdBy: m.createdBy,
  consumed: m.consumed,
  createdAt: m.createdAt.toISOString(),
  updatedAt: m.updatedAt.toISOString(),
  updatedBy: m.updatedBy,
});

export const toInvitePreviewDto = (t: Trip, memberCount: number): InvitePreview => ({
  tripName: t.name,
  destination: t.destination,
  startDate: toDateOnly(t.startDate),
  endDate: toDateOnly(t.endDate),
  memberCount,
});

export const toTripNoteDto = (n: TripNote): SharedTripNote => ({
  id: n.id,
  tripId: n.tripId,
  category: n.category,
  label: n.label,
  value: n.value,
  sortOrder: n.sortOrder,
  createdAt: n.createdAt.toISOString(),
  updatedAt: n.updatedAt.toISOString(),
  updatedBy: n.updatedBy,
});

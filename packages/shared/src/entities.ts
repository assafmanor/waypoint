// Shared domain types — the single source of truth for entity shapes used by
// both the backend and the frontend. Mirrors docs/architecture/data-model.md.
// Keep in sync with the Prisma schema (backend/prisma/schema.prisma).

export type ID = string;

/** The decisive distinction — see ADR-0011. */
export type EventKind = 'hard' | 'soft';

export type EventStatus = 'planned' | 'now' | 'done' | 'skipped';

export type EventSource = 'manual' | 'gmail' | 'maybe_shelf' | 'integration';

export type BookingType = 'flight' | 'hotel' | 'restaurant' | 'train' | 'activity' | 'other';

export type BookingSource = 'manual' | 'gmail';

export type MembershipRole = 'peer'; // reserved for future roles — ADR-0005

export type DocumentType = 'passport' | 'insurance' | 'visa' | 'other';

export type ChangeAction = 'create' | 'update' | 'move' | 'delete' | 'status';

export interface User {
  id: ID;
  email: string;
  displayName: string;
  avatarColor: string;
  createdAt: string;
}

export interface Trip {
  id: ID;
  name: string;
  destination: string;
  startDate: string; // ISO date
  endDate: string; // ISO date
  timezone: string;
  createdBy: ID;
  createdAt: string;
}

export interface Membership {
  id: ID;
  tripId: ID;
  userId: ID;
  role: MembershipRole;
  calendarSyncEnabled: boolean;
  googleConnected: boolean;
  joinedAt: string;
}

export interface Day {
  id: ID;
  tripId: ID;
  date: string; // ISO date
  label?: string;
}

export interface TripEvent {
  id: ID;
  tripId: ID;
  dayId: ID;
  title: string;
  icon?: string;
  kind: EventKind;
  startTime?: string;
  endTime?: string;
  location?: string;
  placeId?: string;
  status: EventStatus;
  bookingId?: ID;
  sortOrder: number;
  source: EventSource;
  updatedBy: ID;
  updatedAt: string;
}

export interface Booking {
  id: ID;
  tripId: ID;
  type: BookingType;
  title: string;
  confirmationCode?: string;
  provider?: string;
  address?: string;
  placeId?: string;
  startsAt?: string;
  endsAt?: string;
  details?: Record<string, unknown>;
  source: BookingSource;
  offlineAvailable: boolean;
}

export interface TripDocument {
  id: ID;
  tripId: ID;
  type: DocumentType;
  title: string;
  fileRef: string; // reference to a server-side-encrypted blob — ADR-0015
  ownerUserId?: ID;
}

export interface MaybeItem {
  id: ID;
  tripId: ID;
  title: string;
  icon?: string;
  meta?: string;
  placeId?: string;
  createdBy: ID;
  consumed: boolean;
}

export interface Change {
  id: ID;
  tripId: ID;
  actorUserId: ID;
  entityType: string;
  entityId: ID;
  action: ChangeAction;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  createdAt: string;
}

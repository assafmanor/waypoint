// Shared domain types — the single source of truth for entity shapes used by
// both the backend and the frontend. Mirrors docs/architecture/data-model.md.
// Keep in sync with the Prisma schema (backend/prisma/schema.prisma).

export type ID = string;

export type AuthProvider = 'google';

/** The decisive distinction — see ADR-0011. */
export type EventKind = 'hard' | 'soft';

export type EventStatus = 'planned' | 'done' | 'skipped';

export type EventSource = 'manual' | 'gmail' | 'maybe_shelf' | 'integration';

export type BookingType = 'flight' | 'hotel' | 'restaurant' | 'train' | 'activity' | 'other';

export type BookingSource = 'manual' | 'gmail';

export type MembershipRole = 'admin' | 'peer'; // creator is admin — ADR-0005/0018

export type DocumentType = 'passport' | 'insurance' | 'visa' | 'other';

export type TripNoteCategory = 'wifi' | 'note';

export type ChangeAction = 'create' | 'update' | 'move' | 'delete' | 'status';

export interface User {
  id: ID;
  email: string;
  displayName: string;
  avatarColor: string;
  createdAt: string;
}

/** Provider identity + OAuth material; the encrypted token stays server-side (ADR-0020). */
export interface AuthIdentity {
  id: ID;
  userId: ID;
  provider: AuthProvider;
  providerAccountId: string;
  scopes: string[];
  createdAt: string;
  updatedAt: string;
}

/** Rotating refresh-token store, server-side (ADR-0020). */
export interface Session {
  id: ID;
  userId: ID;
  expiresAt: string;
  createdAt: string;
  revokedAt?: string;
  userAgent?: string;
}

export interface Trip {
  id: ID;
  name: string;
  destination: string;
  startDate: string; // ISO date
  endDate: string; // ISO date
  timezone: string;
  currency?: string;
  dailyBudgetMinor?: number;
  createdBy: ID;
  createdAt: string;
  updatedAt: string;
  updatedBy: ID;
}

export interface Membership {
  id: ID;
  tripId: ID;
  userId: ID;
  role: MembershipRole;
  calendarSyncEnabled: boolean;
  joinedAt: string;
}

export interface TripEvent {
  id: ID;
  tripId: ID;
  date: string; // ISO date
  endDate?: string; // non-null = multi-day ambient span (ADR-0018)
  title: string;
  icon?: string;
  kind: EventKind;
  startsAt?: string; // UTC instant
  endsAt?: string;
  location?: string;
  placeId?: string;
  status: EventStatus;
  bookingId?: ID;
  sortOrder: number;
  source: EventSource;
  createdAt: string;
  updatedAt: string;
  updatedBy: ID;
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
  createdAt: string;
  updatedAt: string;
  updatedBy: ID;
}

/** Idempotency map for one-way calendar push, per member per event (ADR-0020). */
export interface CalendarEventLink {
  id: ID;
  eventId: ID;
  userId: ID;
  googleCalendarEventId: string;
  createdAt: string;
  updatedAt: string;
}

export interface TripDocument {
  id: ID;
  tripId: ID;
  type: DocumentType;
  title: string;
  fileRef: string; // reference to a server-side-encrypted blob — ADR-0015
  mimeType: string;
  sizeBytes: number;
  ownerUserId?: ID; // null = group doc
  createdAt: string;
  updatedAt: string;
  updatedBy: ID;
}

export interface MaybeItem {
  id: ID;
  tripId: ID;
  title: string;
  icon?: string;
  placeId?: string;
  createdBy: ID;
  consumed: boolean;
  createdAt: string;
  updatedAt: string;
  updatedBy: ID;
}

/** The practical layer's small stuff (WiFi codes, notes) — ADR-0018. */
export interface TripNote {
  id: ID;
  tripId: ID;
  category: TripNoteCategory;
  label: string;
  value: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: ID;
}

/** Full current trip state + sync cursor — GET /trips/:tripId/snapshot (ADR-0019/0022). */
export interface TripSnapshot {
  trip: Trip;
  members: Membership[];
  events: TripEvent[];
  bookings: Booking[];
  maybeItems: MaybeItem[];
  notes: TripNote[];
  latestSeq: string; // BigInt serialized as string, see Change.seq
}

export interface Change {
  id: ID;
  seq: string; // BigInt serialized as string to avoid JS precision loss (ADR-0019)
  tripId: ID;
  actorUserId: ID;
  entityType: string;
  entityId: ID;
  action: ChangeAction;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  createdAt: string;
}

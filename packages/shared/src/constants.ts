// Value constants for the domain enums declared in entities.ts. Types describe
// the shapes; these give call sites named values instead of magic strings.
// `satisfies` pins each value to its union so the two can never drift.
import type {
  AuthProvider,
  BookingSource,
  BookingType,
  ChangeAction,
  DocumentType,
  EventKind,
  EventSource,
  EventStatus,
  MembershipRole,
  TripNoteCategory,
} from './entities';

export const AUTH_PROVIDER = { GOOGLE: 'google' } as const satisfies Record<string, AuthProvider>;

export const EVENT_KIND = { HARD: 'hard', SOFT: 'soft' } as const satisfies Record<
  string,
  EventKind
>;

export const EVENT_STATUS = {
  PLANNED: 'planned',
  DONE: 'done',
  SKIPPED: 'skipped',
} as const satisfies Record<string, EventStatus>;

export const EVENT_SOURCE = {
  MANUAL: 'manual',
  GMAIL: 'gmail',
  MAYBE_SHELF: 'maybe_shelf',
  INTEGRATION: 'integration',
} as const satisfies Record<string, EventSource>;

export const BOOKING_TYPE = {
  FLIGHT: 'flight',
  HOTEL: 'hotel',
  RESTAURANT: 'restaurant',
  TRAIN: 'train',
  ACTIVITY: 'activity',
  OTHER: 'other',
} as const satisfies Record<string, BookingType>;

export const BOOKING_SOURCE = {
  MANUAL: 'manual',
  GMAIL: 'gmail',
} as const satisfies Record<string, BookingSource>;

export const MEMBERSHIP_ROLE = {
  ADMIN: 'admin',
  PEER: 'peer',
} as const satisfies Record<string, MembershipRole>;

export const DOCUMENT_TYPE = {
  PASSPORT: 'passport',
  INSURANCE: 'insurance',
  VISA: 'visa',
  OTHER: 'other',
} as const satisfies Record<string, DocumentType>;

export const TRIP_NOTE_CATEGORY = {
  WIFI: 'wifi',
  NOTE: 'note',
} as const satisfies Record<string, TripNoteCategory>;

export const CHANGE_ACTION = {
  CREATE: 'create',
  UPDATE: 'update',
  MOVE: 'move',
  DELETE: 'delete',
  STATUS: 'status',
} as const satisfies Record<string, ChangeAction>;

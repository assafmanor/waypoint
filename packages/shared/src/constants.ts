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

/** Trip name length cap — keeps the header switcher pill to one line
 *  (app-shell.md §5). Validated server-side (createTripSchema) and enforced
 *  client-side (the create form's input `maxLength`). */
export const MAX_TRIP_NAME_LENGTH = 18;

/** Document upload cap (T-046) — passport/insurance/visa scans are single-page
 *  PDFs or phone photos, never large media; the whole file is buffered in memory
 *  for encryption, so this also bounds worst-case per-request memory use. */
export const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024;

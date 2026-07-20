// Value constants for the domain enums declared in entities.ts. Types describe
// the shapes; these give call sites named values instead of magic strings.
// `satisfies` pins each value to its union so the two can never drift.
import type {
  AuthProvider,
  BookingSource,
  BookingType,
  ChangeAction,
  DocumentType,
  EntityType,
  EventCategory,
  EventKind,
  EventSource,
  EventStatus,
  MembershipRole,
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

export const EVENT_CATEGORY = {
  TRANSPORT: 'transport',
  FOOD: 'food',
  LODGING: 'lodging',
  SIGHTSEEING: 'sightseeing',
  NATURE: 'nature',
  ACTIVITY: 'activity',
  SHOPPING: 'shopping',
  SERVICES: 'services',
  OTHER: 'other',
} as const satisfies Record<string, EventCategory>;

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

/** Default EventCategory for a booking-backed event when the form supplies no icon
 *  (ADR-0038: category normally derives from the chosen icon's group — this is only a
 *  last-resort fallback so an auto-created event is never category-less). */
export const BOOKING_TYPE_TO_CATEGORY = {
  flight: 'transport',
  train: 'transport',
  hotel: 'lodging',
  restaurant: 'food',
  activity: 'activity',
  other: 'other',
} as const satisfies Record<BookingType, EventCategory>;

export const CHANGE_ACTION = {
  CREATE: 'create',
  UPDATE: 'update',
  MOVE: 'move',
  DELETE: 'delete',
  STATUS: 'status',
} as const satisfies Record<string, ChangeAction>;

/** The entity kinds a Change targets (ADR-0094) — the single source the backend
 *  Change log and the frontend applier registries (cache + memory channels) both
 *  key off, so no layer hardcodes the strings. */
export const ENTITY_TYPE = {
  EVENT: 'event',
  BOOKING: 'booking',
  DOCUMENT: 'document',
  MAYBE_ITEM: 'maybeItem',
  PLACE: 'place',
  TRIP: 'trip',
  MEMBERSHIP: 'membership',
} as const satisfies Record<string, EntityType>;

/** Max `Change` rows one `GET /changes` page returns (backend-review B-09). A very
 *  old or reset cursor otherwise streams a trip's entire history unbounded; the
 *  client cursors on `seq` and keeps fetching while a page comes back full. Shared
 *  so the server's `take` and the client's continuation loop agree. */
export const CHANGES_PAGE_LIMIT = 500;

/** Trip name length cap — keeps the header switcher pill to one line
 *  (app-shell.md §5). Validated server-side (createTripSchema) and enforced
 *  client-side (the create form's input `maxLength`). */
export const MAX_TRIP_NAME_LENGTH = 18;

/** Document upload cap (T-046) — passport/insurance/visa scans are single-page
 *  PDFs or phone photos, never large media; the whole file is buffered in memory
 *  for encryption, so this also bounds worst-case per-request memory use. */
export const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024;

/** Server-enforced upload allow-list (ADR-0069 / backend-review B-03). Documents
 *  are passport/insurance/visa scans — single-page PDFs or phone photos — so this
 *  is the safe, closed set. It deliberately excludes anything the browser can
 *  execute in the app origin (`text/html`, `image/svg+xml`, `application/xhtml+xml`):
 *  an uploaded "document" of those types would run script when a co-traveler opens
 *  it, enabling refresh-cookie → access-token theft. Also enforced client-side so
 *  the picker rejects early. */
export const ALLOWED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
] as const;

export function isAllowedDocumentMimeType(mimeType: string): boolean {
  return (ALLOWED_DOCUMENT_MIME_TYPES as readonly string[]).includes(mimeType);
}

/** Non-image document types the viewer may still open inline in a new tab: only
 *  PDF, which browsers render in their built-in viewer (no origin script). Every
 *  other non-image type is download-only (backend-review B-03; refines ADR-0052's
 *  mobile PDF open/download). */
export function isInlineOpenableDocumentMimeType(mimeType: string): boolean {
  return mimeType === 'application/pdf';
}

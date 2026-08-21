// Value constants for the domain enums declared in entities.ts. Types describe
// the shapes; these give call sites named values instead of magic strings.
// `satisfies` pins each value to its union so the two can never drift.
import type {
  AttachmentHostKey,
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
  NoteHostKey,
  NoteSource,
  PlaceSearchKind,
  TaskDerivedKey,
  TaskStatus,
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
  TRANSIT: 'transit',
  CAR: 'car',
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

/** The kinds a place search can be restricted to (field report #6). A form names the kind;
 *  the proxy owns the mapping to Google's own type vocabulary. */
export const PLACE_SEARCH_KIND = {
  AIRPORT: 'airport',
} as const satisfies Record<string, PlaceSearchKind>;

export const MEMBERSHIP_ROLE = {
  ADMIN: 'admin',
  PEER: 'peer',
} as const satisfies Record<string, MembershipRole>;

/** **Declaration order is the app's document order** (ADR-0052 §6, amended 2026-08-13):
 *  identity → what you present on the way → cover → other. The upload/manage grids and
 *  the Index's groups all read it from here, so there is one order rather than a display
 *  list beside the value list. The Postgres enum's own order differs (values can only be
 *  appended) and is invisible to everything. */
export const DOCUMENT_TYPE = {
  PASSPORT: 'passport',
  VISA: 'visa',
  LICENSE: 'license',
  TICKET: 'ticket',
  RESERVATION: 'reservation',
  INSURANCE: 'insurance',
  HEALTH: 'health',
  OTHER: 'other',
} as const satisfies Record<string, DocumentType>;

/** Default EventCategory for a booking-backed event when the form supplies no icon
 *  (ADR-0038: category normally derives from the chosen icon's group — this is only a
 *  last-resort fallback so an auto-created event is never category-less). */
export const BOOKING_TYPE_TO_CATEGORY = {
  flight: 'transport',
  train: 'transport',
  transit: 'transport',
  car: 'transport',
  hotel: 'lodging',
  restaurant: 'food',
  activity: 'activity',
  other: 'other',
} as const satisfies Record<BookingType, EventCategory>;

/** The **inverse** direction (ADR-0136 §2): which booking an event of this category would
 *  be, for the `יש הזמנה` row that creates one from `EventForm`. Not injective — the
 *  categories outnumber the types — so this is a **guess the form states out loud** and the
 *  category pill is how it is corrected, never a second picker.
 *
 *  It sits beside its inverse on purpose. The two are one fact in two directions, and a new
 *  `BookingType` has to be answered in both: the `satisfies Record<…>` on **each** is what
 *  makes a missed side a compile error rather than a silent gap. `transport → flight` is the
 *  honest edge — a train is one tap on the category the form was already showing. */
export const CATEGORY_TO_BOOKING_TYPE = {
  lodging: 'hotel',
  food: 'restaurant',
  transport: 'flight',
  sightseeing: 'activity',
  nature: 'activity',
  activity: 'activity',
  shopping: 'other',
  services: 'other',
  other: 'other',
} as const satisfies Record<EventCategory, BookingType>;

export const CHANGE_ACTION = {
  CREATE: 'create',
  UPDATE: 'update',
  MOVE: 'move',
  DELETE: 'delete',
  STATUS: 'status',
} as const satisfies Record<string, ChangeAction>;

/**
 * **A change the SERVER made as housekeeping, not a person's edit** (ADR-0157 §6).
 *
 * The orphan sweep deletes places nothing points at any more, and it does so through
 * `ChangeService` like every other data-plane write (ADR-0019) — which is right for the
 * caches, and wrong for the change feed: it would read as _"דנה removed <place>"_ against
 * whoever happened to pick a place that minute, for a row nobody could see. The feed is a
 * bounded 20-entry ring, so a misleading line also evicts a real one (the reason a note's
 * edits already don't narrate, ADR-0152's session-206 amendment).
 *
 * It rides the delete's **`after`**, which a delete otherwise leaves empty — so no applier
 * changes: `applyToRow` returns `undefined` for a delete without reading it. A discriminant
 * both layers branch on, so it lives here rather than as a literal at either end.
 */
export const HOUSEKEEPING_CHANGE = { swept: true } as const;

/** Was this change housekeeping rather than somebody's edit? Written by the backend's
 *  sweep, read by the frontend's change feed — one predicate, so neither side spells the
 *  key. */
export function isHousekeepingChange(change: { after?: unknown }): boolean {
  return (change.after as { swept?: boolean } | null | undefined)?.swept === true;
}

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
  NOTE: 'note',
  TASK: 'task',
  DOCUMENT_ATTACHMENT: 'documentAttachment',
} as const satisfies Record<string, EntityType>;

/** A task's lifecycle (tasks brief §5). `dismissed` is a real outcome and not a soft
 *  delete: it stopped mattering, which the row says by struck-through rather than by
 *  disappearing. */
export const TASK_STATUS = {
  OPEN: 'open',
  DONE: 'done',
  DISMISSED: 'dismissed',
} as const satisfies Record<string, TaskStatus>;

/** The five readiness checks a task row can overlay (tasks brief §4) — the same ids
 *  `computeReadiness` returns, named here because both layers branch on them. */
export const TASK_DERIVED_KEY = {
  FLIGHTS: 'flights',
  LODGING: 'lodging',
  ITINERARY: 'itinerary',
  DOCUMENTS: 'documents',
  GROUP: 'group',
} as const satisfies Record<string, TaskDerivedKey>;

/** **How many steps one task may hold** (ADR-0196 §1). Refused at the editor with a
 *  sentence rather than silently truncated.
 *
 *  **Thirty** (owner's call, 2026-08-19, raised from twenty). The original number came from a
 *  measurement — a step row costs **26.8px**, so twenty is 536px, the whole of a 640px
 *  viewport — and that measurement answered the wrong question: how many steps fit on one
 *  screen, not how many a packing list has. A real one runs past twenty, and the open region
 *  scrolls. What the cap is actually for is the runaway case, which is far above either
 *  figure. Here rather than in the frontend because the server refuses the thirty-first too:
 *  a cap only the client knows is a cap the outbox can replay past. */
export const TASK_SUBTASK_CAP = 30;

/** Where a note came from (ADR-0152 §1). One value in v1 — §9 registers no strategy. */
export const NOTE_SOURCE = {
  MEMBER: 'member',
} as const satisfies Record<string, NoteSource>;

/** **Which FK holds a note's host, per host entity type** (ADR-0152 §2) — the lookup that
 *  makes the cascade rule ONE rule instead of five branches.
 *
 *  A database cascade deletes a host's notes **without writing `Change` rows**, so a peer
 *  holding the trip in memory or in Dexie never hears about it and keeps rendering notes
 *  whose host is gone. The cascade is the storage guarantee; this is what the sync half
 *  keys off, consulted in both places a change is mirrored — the memory channels in
 *  `state/trip-state.tsx` and `CACHE_CHANNELS` in `lib/cache.ts`. Partial on purpose: the
 *  entity types NOT here (trip, membership, note) cannot host a note, and a `delete` for
 *  one of them drops nothing.
 *
 *  `NOTE_HOST_KEYS` in `schemas.ts` is the same set from the validation side. */
export const NOTE_HOST_FIELD = {
  [ENTITY_TYPE.EVENT]: 'eventId',
  [ENTITY_TYPE.BOOKING]: 'bookingId',
  [ENTITY_TYPE.PLACE]: 'placeId',
  [ENTITY_TYPE.MAYBE_ITEM]: 'maybeItemId',
  [ENTITY_TYPE.DOCUMENT]: 'documentId',
} as const satisfies Partial<Record<EntityType, NoteHostKey>>;

/** **Which FK holds a task's host** — an alias of the note lookup above, for the reason
 *  `TASK_HOST_KEYS` states: the two entities host off the same five FKs under the same
 *  cascade rule, so the compiler holds them identical rather than a reviewer having to.
 *  Nothing consults it until phase 4 wires the hosts. */
export const TASK_HOST_FIELD = NOTE_HOST_FIELD;

/** **Which FK holds an attachment's host, per host entity type** (ADR-0173 §1/§7) — the
 *  same lookup as `NOTE_HOST_FIELD` above and for the same reason: the host FKs are
 *  `onDelete: Cascade` **on the link row**, so Postgres removes a deleted host's links
 *  without writing a `Change`, and the client owes a local derivation off the parent's
 *  change (`dropAttachmentsForHostChange`) in both places a change is mirrored.
 *
 *  Two members, not five. A `Place` never hosts one (§4) and `documentId` is not a host at
 *  all — deleting the DOCUMENT cascades the link too, but that is the link dying with the
 *  thing it points at rather than with the thing it points from, and the client hears about
 *  it through the document's own channel. */
export const ATTACHMENT_HOST_FIELD = {
  [ENTITY_TYPE.EVENT]: 'eventId',
  [ENTITY_TYPE.BOOKING]: 'bookingId',
} as const satisfies Partial<Record<EntityType, AttachmentHostKey>>;

/** The `code` field of the error envelope (api-contract.md §14). One source the
 *  backend throws and the client branches on, so neither side spells the string:
 *  the exception filter maps HTTP statuses + Prisma faults to these, services throw
 *  the domain ones directly, and the frontend `ApiError.code` matches them. */
export const ERROR_CODE = {
  // HTTP-status / infrastructure faults (mapped in the global exception filter).
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  CONSTRAINT_VIOLATION: 'CONSTRAINT_VIOLATION',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  ERROR: 'ERROR',
  NOT_READY: 'NOT_READY',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  // Domain outcomes services throw and the client phrases specially.
  HARD_EVENT_REQUIRES_CONFIRM: 'HARD_EVENT_REQUIRES_CONFIRM',
  MOVE_INTO_PAST: 'MOVE_INTO_PAST',
  MOVE_CROSSES_DAY: 'MOVE_CROSSES_DAY',
  REMOVED_FROM_TRIP: 'REMOVED_FROM_TRIP',
  INVITE_EXPIRED: 'INVITE_EXPIRED',
} as const;

export type ErrorCode = (typeof ERROR_CODE)[keyof typeof ERROR_CODE];

/** Realtime stream message discriminants (F-04, sync-and-offline.md). The server
 *  and client each define their own payload shapes, but share this one vocabulary
 *  so a rename can't drift the two ends of the wire apart. */
export const WS_MESSAGE_TYPE = {
  HELLO: 'hello',
  CHANGE: 'change',
  PRESENCE: 'presence',
  PING: 'ping',
  PONG: 'pong',
  /** **Enrichment landed for a place you hold** (ADR-0166 §6). Its own message type rather
   *  than a `change`, because enrichment is deliberately outside the change log: the row is
   *  global with no `tripId`, no client authored it, and none of LWW/undo/ordering applies.
   *  So it carries **no `seq`** — a reader must not advance its cursor or suspect a gap on
   *  one of these, which is precisely what a fake `Change` would have caused. */
  ENRICHMENT: 'enrichment',
} as const;

export type WsMessageType = (typeof WS_MESSAGE_TYPE)[keyof typeof WS_MESSAGE_TYPE];

/** Max `Change` rows one `GET /changes` page returns (backend-review B-09). A very
 *  old or reset cursor otherwise streams a trip's entire history unbounded; the
 *  client cursors on `seq` and keeps fetching while a page comes back full. Shared
 *  so the server's `take` and the client's continuation loop agree. */
export const CHANGES_PAGE_LIMIT = 500;

/** Trip name length cap. **A length bound, not a one-line guarantee** — the
 *  guarantee this comment used to make stopped holding once the header row filled
 *  up, and 18 characters clipped anyway (ADR-0149 §9). What keeps the name on one
 *  line is `useShrinkToFit` in the header, with the CSS ellipsis behind it; how
 *  much room it gets depends on the screen width and on how many avatars sit
 *  beside it, so no single character count can promise a fit. Kept at 18 rather
 *  than re-derived downward: a smaller cap would invalidate names already typed
 *  and still promise nothing. Validated server-side (createTripSchema) and
 *  enforced client-side (the create form's input `maxLength`). */
export const MAX_TRIP_NAME_LENGTH = 18;

/** **A place nickname's length cap** (ADR-0166 §18). The nickname exists to be SHORTER than
 *  the official name it overrides — it lands on a day row beside a time — so a bound is part
 *  of what it means, not a storage concern. Roomier than the trip name because it is not a
 *  pill and the surfaces that show it wrap; something longer than this is a rename, and the
 *  name field is right there. Validated server-side (`createPlaceSchema`) and enforced
 *  client-side by the input's `maxLength`. */
export const MAX_PLACE_NICKNAME_LENGTH = 60;

/** Display-name length cap. Roomier than the trip name because it is a person's
 *  name rather than a pill that must stay on one line, but bounded because it
 *  renders on every co-member's roster row (ADR-0133 §7). Validated server-side
 *  (updateMeSchema) and enforced client-side as the input's `maxLength`. */
export const MAX_DISPLAY_NAME_LENGTH = 40;

/** Document upload cap (T-046) — passport/insurance/visa scans are single-page
 *  PDFs or phone photos, never large media; the whole file is buffered in memory
 *  for encryption, so this also bounds worst-case per-request memory use. */
/** Caps on a push subscription's fields (ADR-0197 §2). Not guesses: a real FCM endpoint
 *  is ~200 chars and Mozilla's ~100, so 1 KB is an order of magnitude of headroom while
 *  still bounding a hostile body; `p256dh` is base64url of a 65-byte uncompressed P-256
 *  point (88 chars) and `auth` of a 16-byte secret (22), so 256 covers both with room for
 *  padding variants. They exist to bound the column, not to validate the crypto — the push
 *  service is the authority on whether the keys work, at send time. */
export const MAX_PUSH_ENDPOINT_LENGTH = 1024;
export const MAX_PUSH_KEY_LENGTH = 256;

/** The device label shown beside a subscription. A real UA string is ~120 chars; this is
 *  a rendered label rather than a forensic record, so it is capped well below the endpoint. */
export const MAX_USER_AGENT_LENGTH = 256;

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

/** The square edge an uploaded avatar is normalized to before it leaves the phone
 *  (ADR-0133 §12). An avatar renders at 96px at its largest (`lg`), so 512 covers 3×
 *  density with room to spare, and re-encoding at this size is what makes the byte
 *  ceiling below a non-event rather than a rejection users hit. */
export const AVATAR_IMAGE_EDGE_PX = 512;

/** What the client re-encodes an avatar to, and therefore the only type the happy
 *  path ever sends. JPEG because every canvas can emit it, every browser renders it
 *  inline, and a face is a photograph — PNG would be several times the bytes for no
 *  visible gain. */
export const AVATAR_IMAGE_MIME_TYPE = 'image/jpeg';

/** JPEG quality for that re-encode. 0.85 is the usual "no visible artefacts at
 *  photographic content" point; at 512px it lands a face around 40–80 KB. */
export const AVATAR_IMAGE_QUALITY = 0.85;

/** Server ceiling on the bytes actually received. Deliberately ~20× smaller than
 *  `MAX_DOCUMENT_SIZE_BYTES`: the client already re-encodes to a 512px JPEG, so this
 *  is a bound on a hostile or broken client rather than a limit real uploads meet —
 *  and it bounds per-request memory, since the whole buffer is held to sniff it. */
export const MAX_AVATAR_SIZE_BYTES = 512 * 1024;

/** Server-enforced avatar allow-list. Narrower than the document list for one reason
 *  that matters: an avatar is served back **inline** to be drawn in an `<img>`, where
 *  a document is always `Content-Disposition: attachment`. So this set is exactly the
 *  raster types a browser renders as an image and nothing else — no `image/svg+xml`
 *  (a script document wearing an image type), no HEIC (which browsers can't draw and
 *  the client re-encodes away), and no GIF (an animated face is not a thing we want).
 *  The type is additionally **sniffed from the bytes** server-side rather than trusted
 *  from the declared header — see `sniffImageMimeType`. */
export const ALLOWED_AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export function isAllowedAvatarMimeType(mimeType: string): boolean {
  return (ALLOWED_AVATAR_MIME_TYPES as readonly string[]).includes(mimeType);
}

/** Non-image document types the viewer may still open inline in a new tab: only
 *  PDF, which browsers render in their built-in viewer (no origin script). Every
 *  other non-image type is download-only (backend-review B-03; refines ADR-0052's
 *  mobile PDF open/download). */
export function isInlineOpenableDocumentMimeType(mimeType: string): boolean {
  return mimeType === 'application/pdf';
}

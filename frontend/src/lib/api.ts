// Data layer for the events read/write API (T-034/T-014).
import {
  accessTokenResponseSchema,
  bookingSchema,
  changeSchema,
  deliveredEnrichmentFieldsSchema,
  inviteUrlSchema,
  invitePreviewSchema,
  destinationResultSchema,
  documentAttachmentSchema,
  fxRefreshResultSchema,
  type FxRates,
  maybeItemSchema,
  noteSchema,
  meSchema,
  membershipSchema,
  placePredictionSchema,
  placeResultSchema,
  placeSchema,
  removedMemberSchema,
  routeBatchSchema,
  taskSchema,
  tripDocumentSchema,
  tripEventSchema,
  tripSchema,
  tripSnapshotSchema,
  ERROR_CODE,
  type Booking,
  type Change,
  type CreateBookingInput,
  type CreateDocumentAttachmentInput,
  type CreateDocumentInput,
  type CreateEventInput,
  type CreateMaybeItemInput,
  type CreateNoteInput,
  pushDeviceSchema,
  type CreatePushSubscriptionInput,
  type PushDevice,
  type CreateTaskInput,
  type UpdateMaybeItemInput,
  type UpdateNoteInput,
  type UpdateTaskInput,
  type CreatePlaceInput,
  type CreateTripInput,
  type DeliveredEnrichmentFields,
  type DestinationResult,
  type DocumentAttachment,
  type DocumentType,
  type EnrichmentLookupInput,
  type EventStatus,
  type MaybeItem,
  type Note,
  type TripDocument,
  type InvitePreview,
  type InviteUrl,
  type JoinTripInput,
  type Me,
  type Membership,
  type MoveEventInput,
  type MembershipRole,
  type Place,
  type PlaceResult,
  type PlaceSearchKind,
  type PlacePrediction,
  type ResolvePlaceInput,
  type RemovedMember,
  type RouteBatch,
  type RouteBatchRequest,
  type Task,
  type Trip,
  type TripEvent,
  type TripSnapshot,
  type UpdateBookingInput,
  type UpdateEventInput,
  type UpdatePlaceInput,
  type UpdateMeInput,
  type UpdateTripInput,
} from '@waypoint/shared';
import { API_BASE_URL, API_PHASE, API_TIMEOUT_MS, AVATAR_UPLOAD_FILENAME } from '../constants';
import type { MapBounds } from './map-camera';
import { withDeadline } from './deadline';
import { evictCachedDocument, readCachedBlob, writeCachedBlob } from './doc-cache';

// Defined in `constants.ts` (a primitive needs it without importing this module) and
// re-exported here, where every caller already looks for it.
export { API_BASE_URL };

/** HTTP methods the request helpers use. Named because `RequestInit.method` is
 *  typed `string`, so a bare `'POST'` typo (`'PSOT'`) fails silently at runtime
 *  rather than at compile time. GET is the fetch default and left implicit. */
export const HTTP_METHOD = {
  POST: 'POST',
  PATCH: 'PATCH',
  DELETE: 'DELETE',
} as const;

// In memory only, never localStorage (ADR-0020) — module-level so apiFetch
// can read it without every caller going through a hook.
let accessToken: string | null = null;
let onSessionExpired: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}
/** **The token, for the one fetch that cannot go through `apiFetch`.** The map's tile reads are
 *  issued by the `pmtiles` protocol, deep inside MapLibre and on a worker thread — so they cannot
 *  be routed through `rawFetch` below, and without the Bearer header they hit ADR-0020's global
 *  `JwtAuthGuard` and come back **401**. Which is exactly what they did (2026-08-14). Exported
 *  narrowly rather than exposing the variable: `lib/pmtiles.ts` is the only reader. */
export function accessTokenForHeader(): string | null {
  return accessToken;
}
export function setOnSessionExpired(callback: (() => void) | null): void {
  onSessionExpired = callback;
}

async function rawFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  return fetch(url, { ...init, headers, credentials: 'include' });
}

/** **A request that never answers, bounded** (`lib/deadline.ts`, field reports #20/#22).
 *  A radio that is ON but has no upstream does not fail the way airplane mode does — the
 *  request simply goes quiet, so neither `.then` nor `.catch` ever runs and every offline
 *  fallback in the app, all of which key on a *rejection*, never gets its chance.
 *
 *  The caller's own signal rides along rather than being replaced, so a superseded keystroke
 *  still aborts its search.
 *
 *  **Multipart uploads are deliberately unbounded.** Their response headers only arrive once
 *  the bytes have gone UP, so on a slow link "still uploading" and "dead" look identical from
 *  here — and the cost of guessing wrong is a lost upload, which is worse than the wait. */
function boundedFetch(url: string, init: RequestInit): Promise<Response> {
  if (init.body instanceof FormData) return rawFetch(url, init);
  return withDeadline(
    API_PHASE.FETCH,
    API_TIMEOUT_MS.FETCH,
    (signal) => rawFetch(url, { ...init, signal }),
    init.signal,
  );
}

/** **A response body is a read like any other, and takes the same bound.** Headers can land
 *  while the bytes behind them never do — a 200 whose body never arrives hangs exactly as a
 *  request nobody answered, and an error body hangs `throwApiError` the same way. */
function readJson(res: Response): Promise<unknown> {
  return withDeadline(API_PHASE.BODY, API_TIMEOUT_MS.BODY, () => res.json());
}

/** Attaches the in-memory bearer token + session cookie; on a 401 tries one
 *  silent refresh (the access JWT is short-lived by design) and retries once
 *  before telling `AuthProvider` the session is gone.
 *
 *  The **refresh** is the one wait here that is not bounded, and that is deliberate: a
 *  refresh that is slow-but-alive would become a forced sign-out, which is a product
 *  trade-off rather than a free fix (backlogged separately). It is also not what #22 hits —
 *  with no upstream the request above times out long before any 401 can arrive. */
export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const res = await boundedFetch(url, init);
  if (res.status !== 401) return res;
  if (!(await refreshAccessToken())) {
    onSessionExpired?.();
    return res;
  }
  return boundedFetch(url, init);
}

// Shared in-flight refresh: the token rotates on each use (ADR-0020), so two
// concurrent /auth/refresh calls race and corrupt the session. Coalesce them.
let refreshInFlight: Promise<boolean> | null = null;

export function refreshAccessToken(): Promise<boolean> {
  refreshInFlight ??= withRefreshLock(doRefresh).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

// Cross-tab single-flight (backend-review B-11): the httpOnly refresh cookie
// rotates on each use, so two *tabs* refreshing at once make the loser present a
// now-stale cookie and get logged out. A Web Lock serializes refresh across tabs
// (the shared cookie is already rotated when the next tab runs), on top of the
// in-tab promise coalescing above. Falls back to a bare call where the Locks API
// is unavailable (older browsers, test env).
function withRefreshLock(run: () => Promise<boolean>): Promise<boolean> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!locks) return run();
  // The Locks API resolves to the callback's awaited value at runtime; lib.dom's
  // generic captures the promise, so assert the flattened result.
  return locks.request('wp-refresh', () => run()) as unknown as Promise<boolean>;
}

async function doRefresh(): Promise<boolean> {
  const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: HTTP_METHOD.POST,
    credentials: 'include',
  });
  if (!res.ok) return false;
  accessToken = accessTokenResponseSchema.parse(await res.json()).accessToken;
  return true;
}

export async function requestLogout(): Promise<void> {
  await fetch(`${API_BASE_URL}/auth/logout`, { method: HTTP_METHOD.POST, credentials: 'include' });
  accessToken = null;
}

export async function fetchMe(): Promise<Me> {
  const res = await apiFetch(`${API_BASE_URL}/me`);
  if (!res.ok) return throwApiError(res);
  return meSchema.parse(await readJson(res));
}

/** Edit your own identity (ADR-0133 §11). Online-only and deliberately NOT
 *  outboxed: a `User` is not a syncable entity type (§8), so there is no cache
 *  channel or WS echo to reconcile against — the response IS the truth, and the
 *  caller replaces its `Me` with it. */
export async function updateMe(input: UpdateMeInput): Promise<Me> {
  const res = await apiFetch(`${API_BASE_URL}/me`, {
    method: HTTP_METHOD.PATCH,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) return throwApiError(res);
  return meSchema.parse(await readJson(res));
}

/** Upload an avatar (ADR-0133 §12). Multipart, one `file` part — no `Content-Type`
 *  header set by hand, because the browser has to add the multipart boundary itself.
 *  Online-only for the same reason as `updateMe`: a `User` is not a syncable entity,
 *  and bytes are not something the outbox replays. */
export async function uploadAvatar(blob: Blob): Promise<Me> {
  const form = new FormData();
  form.set('file', blob, AVATAR_UPLOAD_FILENAME);
  const res = await apiFetch(`${API_BASE_URL}/me/avatar`, {
    method: HTTP_METHOD.POST,
    body: form,
  });
  if (!res.ok) return throwApiError(res);
  return meSchema.parse(await readJson(res));
}

/** Delete the uploaded avatar; the server lands you on the Google photo if there
 *  still is one, else initials. Returns the new `Me` rather than 204, so the caller
 *  never has to guess which of those two happened. */
export async function deleteAvatar(): Promise<Me> {
  const res = await apiFetch(`${API_BASE_URL}/me/avatar`, { method: HTTP_METHOD.DELETE });
  if (!res.ok) return throwApiError(res);
  return meSchema.parse(await readJson(res));
}

// ── PUSH SUBSCRIPTIONS (ADR-0197 §2) ───────────────────────────────────────────────────
// Control plane, beside `/me` rather than under a trip: a subscription belongs to a person
// and a device, and one device is reached about every trip that person is in.

/** Register (or refresh) this device. Idempotent server-side — the row is upserted on the
 *  endpoint — so a caller that is unsure whether it already registered may just call it. */
export async function registerPushSubscription(
  input: CreatePushSubscriptionInput,
): Promise<{ id: string }> {
  const res = await apiFetch(`${API_BASE_URL}/notifications/subscription`, {
    method: HTTP_METHOD.POST,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) return throwApiError(res);
  // The row's id, which the caller stores so the device list can mark "this device" without
  // an endpoint ever appearing in a list response (ADR-0197 §2).
  return (await readJson(res)) as { id: string };
}

/** This person's registered devices, for the notifications settings surface. Carries neither
 *  the endpoint nor the raw user-agent — the server derives a label and keeps the rest. */
export async function fetchPushDevices(): Promise<PushDevice[]> {
  const res = await apiFetch(`${API_BASE_URL}/notifications/subscriptions`);
  if (!res.ok) return throwApiError(res);
  return pushDeviceSchema.array().parse(await readJson(res));
}

/** Revoke a device by id — "I lost that phone". A 404 is tolerated for the same reason
 *  `deletePushSubscription`'s is: a missing row already means the desired state. */
export async function deletePushDevice(id: string): Promise<void> {
  const res = await apiFetch(
    `${API_BASE_URL}/notifications/subscriptions/${encodeURIComponent(id)}`,
    { method: HTTP_METHOD.DELETE },
  );
  if (!res.ok && res.status !== 404) return throwApiError(res);
}

/** Drop this device. A 404 is tolerated for the same reason `removeMember`'s is: the
 *  desired state is "this endpoint is not registered", and a missing row already means it. */
export async function deletePushSubscription(endpoint: string): Promise<void> {
  const res = await apiFetch(`${API_BASE_URL}/notifications/subscription`, {
    method: HTTP_METHOD.DELETE,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  });
  if (!res.ok && res.status !== 404) return throwApiError(res);
}

export async function fetchTrips(): Promise<Trip[]> {
  const res = await apiFetch(`${API_BASE_URL}/trips`);
  if (!res.ok) return throwApiError(res);
  return tripSchema.array().parse(await readJson(res));
}

export async function createTrip(input: CreateTripInput): Promise<Trip> {
  const res = await apiFetch(`${API_BASE_URL}/trips`, {
    method: HTTP_METHOD.POST,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) return throwApiError(res);
  return tripSchema.parse(await readJson(res));
}

/** Admin-only trip-details edit (ADR-0039). Data-plane: the server broadcasts +
 *  logs the change, so it reaches other members and reconciles like the timeline. */
export async function updateTrip(tripId: string, input: UpdateTripInput): Promise<Trip> {
  const res = await apiFetch(`${API_BASE_URL}/trips/${tripId}`, {
    method: HTTP_METHOD.PATCH,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) return throwApiError(res);
  return tripSchema.parse(await readJson(res));
}

/** Admin-only trip deletion (ADR-0039). 404 tolerated (already gone). */
export async function deleteTrip(tripId: string): Promise<void> {
  const res = await apiFetch(`${API_BASE_URL}/trips/${tripId}`, { method: HTTP_METHOD.DELETE });
  if (!res.ok && res.status !== 404) return throwApiError(res);
}

/** Admin-only: promote a member to a role (ADR-0039). */
export async function setMemberRole(
  tripId: string,
  userId: string,
  role: MembershipRole,
): Promise<Membership> {
  const res = await apiFetch(`${API_BASE_URL}/trips/${tripId}/members/${userId}`, {
    method: HTTP_METHOD.PATCH,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  });
  if (!res.ok) return throwApiError(res);
  return membershipSchema.parse(await readJson(res));
}

/** Remove a member (admin) or leave (self) — ADR-0005/0039. 404 tolerated. */
export async function removeMember(tripId: string, userId: string): Promise<void> {
  const res = await apiFetch(`${API_BASE_URL}/trips/${tripId}/members/${userId}`, {
    method: HTTP_METHOD.DELETE,
  });
  if (!res.ok && res.status !== 404) return throwApiError(res);
}

/** The trip's one stable invite link (ADR-0067): get-or-create, so repeated calls
 *  return the same short-code link rather than churning a new one. */
export async function createInvite(tripId: string): Promise<InviteUrl> {
  const res = await apiFetch(`${API_BASE_URL}/trips/${tripId}/invite`, {
    method: HTTP_METHOD.POST,
  });
  if (!res.ok) return throwApiError(res);
  return inviteUrlSchema.parse(await readJson(res));
}

/** Revoke + replace the invite link (admin-only, ADR-0067): the old code dies. */
export async function rotateInvite(tripId: string): Promise<InviteUrl> {
  const res = await apiFetch(`${API_BASE_URL}/trips/${tripId}/invite/rotate`, {
    method: HTTP_METHOD.POST,
  });
  if (!res.ok) return throwApiError(res);
  return inviteUrlSchema.parse(await readJson(res));
}

/** Public/unguarded preview for the join screen (ADR-0024/0067) — no auth needed.
 *  404 = unknown code, 410 = trip already ended. */
export async function fetchInvitePreview(code: string): Promise<InvitePreview> {
  // Bounded like every other read (#22), but deliberately still a bare `fetch`: this route
  // is unguarded, so it carries neither the bearer token nor the session cookie.
  const res = await withDeadline(API_PHASE.FETCH, API_TIMEOUT_MS.FETCH, (signal) =>
    fetch(`${API_BASE_URL}/invites/${code}`, { signal }),
  );
  if (!res.ok) return throwApiError(res);
  return invitePreviewSchema.parse(await readJson(res));
}

/** Idempotent — rejoining an already-joined trip keeps the existing role and
 *  re-applies `calendarSyncEnabled` (api-contract.md). 403 REMOVED_FROM_TRIP if
 *  the caller was kicked and not yet allowed back (ADR-0067). */
export async function joinTrip(code: string, input: JoinTripInput = {}): Promise<Membership> {
  const res = await apiFetch(`${API_BASE_URL}/trips/join/${code}`, {
    method: HTTP_METHOD.POST,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) return throwApiError(res);
  return membershipSchema.parse(await readJson(res));
}

/** Admin-only "Removed" list — members an admin kicked (ADR-0067). */
export async function fetchRemovedMembers(tripId: string): Promise<RemovedMember[]> {
  const res = await apiFetch(`${API_BASE_URL}/trips/${tripId}/blocks`);
  if (!res.ok) return throwApiError(res);
  return removedMemberSchema.array().parse(await readJson(res));
}

/** Admin re-invite (ADR-0067): clear a member's block so the live link works for
 *  them again. Idempotent; 404 tolerated. */
export async function allowMemberBack(tripId: string, userId: string): Promise<void> {
  const res = await apiFetch(`${API_BASE_URL}/trips/${tripId}/blocks/${userId}`, {
    method: HTTP_METHOD.DELETE,
  });
  if (!res.ok && res.status !== 404) return throwApiError(res);
}

const snapshotUrl = (tripId: string) => `${API_BASE_URL}/trips/${tripId}/snapshot`;
const eventsUrl = (tripId: string) => `${API_BASE_URL}/trips/${tripId}/events`;
const eventUrl = (tripId: string, eventId: string) => `${eventsUrl(tripId)}/${eventId}`;
const changesUrl = (tripId: string, sinceSeq: string) =>
  `${API_BASE_URL}/trips/${tripId}/changes?sinceSeq=${sinceSeq}`;
const maybeItemsUrl = (tripId: string) => `${API_BASE_URL}/trips/${tripId}/maybe-items`;
const maybeItemUrl = (tripId: string, maybeItemId: string) =>
  `${maybeItemsUrl(tripId)}/${maybeItemId}`;
const consumeMaybeItemUrl = (tripId: string, maybeItemId: string) =>
  `${maybeItemUrl(tripId, maybeItemId)}/consume`;
const restoreMaybeItemUrl = (tripId: string, maybeItemId: string) =>
  `${maybeItemUrl(tripId, maybeItemId)}/restore`;
const notesUrl = (tripId: string) => `${API_BASE_URL}/trips/${tripId}/notes`;
const noteUrl = (tripId: string, noteId: string) => `${notesUrl(tripId)}/${noteId}`;
const tasksUrl = (tripId: string) => `${API_BASE_URL}/trips/${tripId}/tasks`;
const taskUrl = (tripId: string, taskId: string) => `${tasksUrl(tripId)}/${taskId}`;
const attachmentsUrl = (tripId: string) => `${API_BASE_URL}/trips/${tripId}/document-attachments`;
const attachmentUrl = (tripId: string, attachmentId: string) =>
  `${attachmentsUrl(tripId)}/${attachmentId}`;
const bookingsUrl = (tripId: string) => `${API_BASE_URL}/trips/${tripId}/bookings`;
const bookingUrl = (tripId: string, bookingId: string) => `${bookingsUrl(tripId)}/${bookingId}`;
const placesUrl = (tripId: string) => `${API_BASE_URL}/trips/${tripId}/places`;
const placeUrl = (tripId: string, placeId: string) => `${placesUrl(tripId)}/${placeId}`;
const documentsUrl = (tripId: string) => `${API_BASE_URL}/trips/${tripId}/documents`;
const documentContentUrl = (tripId: string, docId: string) =>
  `${documentsUrl(tripId)}/${docId}/content`;

/** Server error shape (api-contract.md): `{ error: { code, message, details? } }`. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(code ?? `request failed: ${status}`);
  }
}

export const isHardEventConfirmError = (err: unknown): boolean =>
  err instanceof ApiError && err.code === ERROR_CODE.HARD_EVENT_REQUIRES_CONFIRM;

export const isMoveIntoPastError = (err: unknown): boolean =>
  err instanceof ApiError && err.code === ERROR_CODE.MOVE_INTO_PAST;

/** The Places proxy's per-member·trip rate limit tripped (ADR-0108 §5). The picker
 *  degrades softly on this (a "try again" cue), never a hard error (ADR-0110 §1). */
export const isRateLimitedError = (err: unknown): boolean =>
  err instanceof ApiError && err.code === ERROR_CODE.RATE_LIMITED;

export const isMoveCrossesDayError = (err: unknown): boolean =>
  err instanceof ApiError && err.code === ERROR_CODE.MOVE_CROSSES_DAY;

// Invite/join outcomes the join screen phrases specially (ADR-0067).
export const isRemovedFromTripError = (err: unknown): boolean =>
  err instanceof ApiError && err.code === ERROR_CODE.REMOVED_FROM_TRIP;

export const isInviteExpiredError = (err: unknown): boolean =>
  err instanceof ApiError && err.code === ERROR_CODE.INVITE_EXPIRED;

// The error body takes the same bound as a success body: a 500 whose body never arrives
// would hang here exactly as a 200's would hang at its own read.
async function throwApiError(res: Response): Promise<never> {
  const body = (await readJson(res).catch(() => undefined)) as
    { error?: { code?: string; details?: unknown } } | undefined;
  throw new ApiError(res.status, body?.error?.code, body?.error?.details);
}

export async function fetchSnapshot(tripId: string): Promise<TripSnapshot> {
  const res = await apiFetch(snapshotUrl(tripId));
  if (!res.ok) throw new Error(`snapshot fetch failed: ${res.status}`);
  return tripSnapshotSchema.parse(await readJson(res));
}

export async function createEvent(tripId: string, input: CreateEventInput): Promise<TripEvent> {
  const res = await apiFetch(eventsUrl(tripId), {
    method: HTTP_METHOD.POST,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) return throwApiError(res);
  return tripEventSchema.parse(await readJson(res));
}

export async function updateEvent(
  tripId: string,
  eventId: string,
  input: UpdateEventInput,
  confirm = false,
): Promise<TripEvent> {
  const url = `${eventUrl(tripId, eventId)}${confirm ? '?confirm=true' : ''}`;
  const res = await apiFetch(url, {
    method: HTTP_METHOD.PATCH,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) return throwApiError(res);
  return tripEventSchema.parse(await readJson(res));
}

export async function setEventStatus(
  tripId: string,
  eventId: string,
  status: EventStatus,
): Promise<TripEvent> {
  const res = await apiFetch(`${eventUrl(tripId, eventId)}/status`, {
    method: HTTP_METHOD.POST,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) return throwApiError(res);
  return tripEventSchema.parse(await readJson(res));
}

export interface RippleSuggestion {
  movedTitle: string;
  // 'later' = the moved event was delayed, ripple following events forward;
  // 'earlier' = it was moved up, ripple preceding events back. Drives the prompt
  // wording (see i18n ripple.prompt).
  direction: 'later' | 'earlier';
  candidates: { id: string; startsAt: string; endsAt?: string }[];
}

export interface MoveEventResult {
  event: TripEvent;
  rippleSuggestion?: RippleSuggestion;
}

export async function moveEvent(
  tripId: string,
  eventId: string,
  input: MoveEventInput,
  confirm = false,
): Promise<MoveEventResult> {
  const url = `${eventUrl(tripId, eventId)}/move${confirm ? '?confirm=true' : ''}`;
  const res = await apiFetch(url, {
    method: HTTP_METHOD.POST,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) return throwApiError(res);
  const body = (await readJson(res)) as { event: unknown; rippleSuggestion?: RippleSuggestion };
  return { event: tripEventSchema.parse(body.event), rippleSuggestion: body.rippleSuggestion };
}

export async function deleteEvent(tripId: string, eventId: string, confirm = false): Promise<void> {
  const url = `${eventUrl(tripId, eventId)}${confirm ? '?confirm=true' : ''}`;
  const res = await apiFetch(url, { method: HTTP_METHOD.DELETE });
  if (!res.ok && res.status !== 404) return throwApiError(res);
}

/** Reconnect catch-up (sync-and-offline.md "Bootstrap & catch-up"): replays
 *  anything committed since `sinceSeq`, cursored on `seq` not a timestamp. */
export async function fetchChanges(tripId: string, sinceSeq: string): Promise<Change[]> {
  const res = await apiFetch(changesUrl(tripId, sinceSeq));
  if (!res.ok) throw new Error(`changes fetch failed: ${res.status}`);
  return changeSchema.array().parse(await readJson(res));
}

/** Marks a maybe-shelf item consumed server-side (T-058) — schedule() used to
 *  only flip this locally, so a resync after an offline reconnect silently
 *  reverted an already-scheduled item back to unscheduled. */
export async function consumeMaybeItem(tripId: string, maybeItemId: string): Promise<void> {
  const res = await apiFetch(consumeMaybeItemUrl(tripId, maybeItemId), {
    method: HTTP_METHOD.POST,
  });
  if (!res.ok) return throwApiError(res);
}

/** **Puts a consumed idea back on the shelf** — the compensating write an UNDONE schedule owes
 *  the server. Without it the reducer's snapshot restored the idea locally and the next resync
 *  re-consumed it, so the idea vanished a second time with nothing on screen explaining why. */
export async function restoreMaybeItem(tripId: string, maybeItemId: string): Promise<void> {
  const res = await apiFetch(restoreMaybeItemUrl(tripId, maybeItemId), {
    method: HTTP_METHOD.POST,
  });
  if (!res.ok) return throwApiError(res);
}

/** Add an idea to the maybe shelf (Plan-mode Tier 3). */
export async function createMaybeItem(
  tripId: string,
  input: CreateMaybeItemInput,
): Promise<MaybeItem> {
  const res = await apiFetch(maybeItemsUrl(tripId), {
    method: HTTP_METHOD.POST,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) return throwApiError(res);
  return maybeItemSchema.parse(await readJson(res));
}

/** Write a note — general, or hosted by one of the five entities (ADR-0152 §1/§2). */
export async function createNote(tripId: string, input: CreateNoteInput): Promise<Note> {
  const res = await apiFetch(notesUrl(tripId), {
    method: HTTP_METHOD.POST,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) return throwApiError(res);
  return noteSchema.parse(await readJson(res));
}

/** Edit a note's own words. A whole-content submit, and the host is not editable. */
export async function updateNote(
  tripId: string,
  noteId: string,
  input: UpdateNoteInput,
): Promise<Note> {
  const res = await apiFetch(noteUrl(tripId, noteId), {
    method: HTTP_METHOD.PATCH,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) return throwApiError(res);
  return noteSchema.parse(await readJson(res));
}

export async function deleteNote(tripId: string, noteId: string): Promise<void> {
  const res = await apiFetch(noteUrl(tripId, noteId), { method: HTTP_METHOD.DELETE });
  if (!res.ok) return throwApiError(res);
}

export async function createTask(tripId: string, input: CreateTaskInput): Promise<Task> {
  const res = await apiFetch(tasksUrl(tripId), {
    method: HTTP_METHOD.POST,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) return throwApiError(res);
  return taskSchema.parse(await readJson(res));
}

/** Edit a task or settle it. **Sparse** — the tick sends `{ status }` alone and everything
 *  it did not send survives (`updateTaskSchema`). */
export async function updateTask(
  tripId: string,
  taskId: string,
  input: UpdateTaskInput,
): Promise<Task> {
  const res = await apiFetch(taskUrl(tripId, taskId), {
    method: HTTP_METHOD.PATCH,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) return throwApiError(res);
  return taskSchema.parse(await readJson(res));
}

export async function deleteTask(tripId: string, taskId: string): Promise<void> {
  const res = await apiFetch(taskUrl(tripId, taskId), { method: HTTP_METHOD.DELETE });
  if (!res.ok) return throwApiError(res);
}

/** Attach a document the trip already holds to a booking or an event (ADR-0173 §1). */
export async function createDocumentAttachment(
  tripId: string,
  input: CreateDocumentAttachmentInput,
): Promise<DocumentAttachment> {
  const res = await apiFetch(attachmentsUrl(tripId), {
    method: HTTP_METHOD.POST,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) return throwApiError(res);
  return documentAttachmentSchema.parse(await readJson(res));
}

/** Detach — the LINK goes, the file never does (ADR-0173 §1). */
export async function deleteDocumentAttachment(
  tripId: string,
  attachmentId: string,
): Promise<void> {
  const res = await apiFetch(attachmentUrl(tripId, attachmentId), {
    method: HTTP_METHOD.DELETE,
  });
  if (!res.ok) return throwApiError(res);
}

/** Re-aim an idea at a day, or back to "someday" with `null` (ADR-0116 §1). */
export async function updateMaybeItem(
  tripId: string,
  maybeItemId: string,
  input: UpdateMaybeItemInput,
): Promise<MaybeItem> {
  const res = await apiFetch(maybeItemUrl(tripId, maybeItemId), {
    method: HTTP_METHOD.PATCH,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) return throwApiError(res);
  return maybeItemSchema.parse(await readJson(res));
}

/** Remove an idea from the shelf. 404 is tolerated (already gone), matching deleteEvent. */
export async function deleteMaybeItem(tripId: string, maybeItemId: string): Promise<void> {
  const res = await apiFetch(maybeItemUrl(tripId, maybeItemId), { method: HTTP_METHOD.DELETE });
  if (!res.ok && res.status !== 404) return throwApiError(res);
}

/** Create a booking (ADR-0047). An optional `event` seed auto-creates the linked
 *  event atomically server-side (ADR-0048). */
export async function createBooking(tripId: string, input: CreateBookingInput): Promise<Booking> {
  const res = await apiFetch(bookingsUrl(tripId), {
    method: HTTP_METHOD.POST,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) return throwApiError(res);
  return bookingSchema.parse(await readJson(res));
}

export async function updateBooking(
  tripId: string,
  bookingId: string,
  input: UpdateBookingInput,
): Promise<Booking> {
  const res = await apiFetch(bookingUrl(tripId, bookingId), {
    method: HTTP_METHOD.PATCH,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) return throwApiError(res);
  return bookingSchema.parse(await readJson(res));
}

/** Delete a booking (ADR-0047 §3). `deleteEvents=false` (default) unlinks — the
 *  linked event is kept, its `bookingId` nulled; `true` deletes both. A hard
 *  linked event without `confirm` yields a 409 (surfaced for the delete/unlink
 *  prompt). 404 tolerated (already gone), matching deleteEvent. */
export async function deleteBooking(
  tripId: string,
  bookingId: string,
  opts: { confirm?: boolean; deleteEvents?: boolean } = {},
): Promise<void> {
  const params = new URLSearchParams();
  if (opts.confirm) params.set('confirm', 'true');
  if (opts.deleteEvents) params.set('deleteEvents', 'true');
  const qs = params.toString();
  const res = await apiFetch(`${bookingUrl(tripId, bookingId)}${qs ? `?${qs}` : ''}`, {
    method: HTTP_METHOD.DELETE,
  });
  if (!res.ok && res.status !== 404) return throwApiError(res);
}

/** Create a Place (ADR-0048). Name-only ("Place-lite") is valid; the Google
 *  Places picker enriches googlePlaceId/lat/lng later. */
export async function createPlace(tripId: string, input: CreatePlaceInput): Promise<Place> {
  const res = await apiFetch(placesUrl(tripId), {
    method: HTTP_METHOD.POST,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) return throwApiError(res);
  return placeSchema.parse(await readJson(res));
}

export async function updatePlace(
  tripId: string,
  placeId: string,
  input: UpdatePlaceInput,
): Promise<Place> {
  const res = await apiFetch(placeUrl(tripId, placeId), {
    method: HTTP_METHOD.PATCH,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) return throwApiError(res);
  return placeSchema.parse(await readJson(res));
}

/** Remove a place from the trip (ADR-0157). A 404 is success: the row is already gone,
 *  which is what an offline op replayed twice looks like — the same tolerance every other
 *  delete here has. */
export async function deletePlace(tripId: string, placeId: string): Promise<void> {
  const res = await apiFetch(placeUrl(tripId, placeId), { method: HTTP_METHOD.DELETE });
  if (!res.ok && res.status !== 404) return throwApiError(res);
}

/** Debounced Google Places Autocomplete relay through the backend proxy (ADR-0108
 *  §1 / ADR-0110 §1). The `sessionToken` groups these keystrokes with the terminating
 *  {@link resolvePlace} so Google bills the searches at $0; `signal` lets a superseding
 *  keystroke abort the in-flight request. Online-only — never outboxed (needs Google). */
export async function searchPlaces(
  tripId: string,
  { input, sessionToken, signal }: { input: string; sessionToken: string; signal?: AbortSignal },
): Promise<PlacePrediction[]> {
  const res = await apiFetch(`${placesUrl(tripId)}/search`, {
    method: HTTP_METHOD.POST,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input, sessionToken }),
    signal,
  });
  if (!res.ok) return throwApiError(res);
  return placePredictionSchema.array().parse(await readJson(res));
}

/** The Text Search relay (ADR-0132 §7) — the half whose results can be drawn, because
 *  they arrive WITH coordinates. No session token: this SKU has none, so every call is
 *  billed on its own and the client-side floor + debounce are what stand in front of it.
 *  `bias` is the canvas's current bounds — free relevance, not a cost lever. `kind` restricts
 *  the corpus to airports for a flight leg (field report #6) and is free too: it is a request
 *  parameter, not a field-mask entry, so it moves neither the mask nor the tier. */
export async function searchPlacesText(
  tripId: string,
  {
    input,
    bias,
    kind,
    signal,
  }: { input: string; bias?: MapBounds; kind?: PlaceSearchKind; signal?: AbortSignal },
): Promise<PlaceResult[]> {
  const res = await apiFetch(`${placesUrl(tripId)}/search-text`, {
    method: HTTP_METHOD.POST,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input, bias, kind }),
    signal,
  });
  if (!res.ok) return throwApiError(res);
  return placeResultSchema.array().parse(await readJson(res));
}

/**
 * **What do we know about a place the trip does not hold yet** (ADR-0166 §17).
 *
 * The snapshot carries enrichment for the trip's own places, keyed by `placeId` — a Google result
 * has none, so this is the one enrichment read a client asks for rather than receives. The
 * identity travels with the question because matching needs a name and a point, and the server
 * holds neither for a place nobody has added; those are the values the Text Search call already
 * returned, exactly as `resolvePlace`'s `details` passes them.
 *
 * The server may run a pass before answering, so this can take a couple of seconds and can quite
 * legitimately answer `{}` — that is the majority case (ADR-0166 §11.3), not an error. Online-only
 * and never outboxed: it needs Wikimedia, and the search that produced the candidate needed
 * Google.
 */
export async function lookupEnrichment(
  tripId: string,
  input: EnrichmentLookupInput,
  signal?: AbortSignal,
): Promise<DeliveredEnrichmentFields> {
  const res = await apiFetch(`${API_BASE_URL}/trips/${tripId}/enrichment/lookup`, {
    method: HTTP_METHOD.POST,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  if (!res.ok) return throwApiError(res);
  return deliveredEnrichmentFieldsSchema.parse(await readJson(res));
}

/** The terminating enrich-on-pick (create-or-link) call (ADR-0108 §3 / ADR-0110 §1).
 *  Passes the **same** session token as the searches (what bills in-session autocomplete
 *  at $0). `enrichPlaceId` enriches an existing coordless Place-lite in place. Server-side
 *  dedup on (tripId, googlePlaceId) — the caller just adopts the returned row. Online-only. */
export async function resolvePlace(tripId: string, input: ResolvePlaceInput): Promise<Place> {
  const res = await apiFetch(`${placesUrl(tripId)}/resolve`, {
    method: HTTP_METHOD.POST,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) return throwApiError(res);
  return placeSchema.parse(await readJson(res));
}

// ── ROUTES & TRAVEL TIME (ADR-0205 §6, amended by §Y2) ─────────────────────────────────

/**
 * **A day's travel times, one request** — its ordered stops × every mode wanted for them.
 *
 * One request per day, never one per leg and never one per mode: a per-mode endpoint would put
 * a round-trip behind every press of the mode control, which ADR-0206 §Z2 forbids by name.
 *
 * **`202` is a success here, and the body says so.** The server answers `202` + `Retry-After`
 * while anything is still warming (ADR-0187's flow) with the same body shape either way, so
 * `res.ok` already covers it — and the wait is read from the body's own `retryAfterSeconds`,
 * which zod has validated, rather than from a second parse of the header that duplicates it.
 * A caller that ignores the field renders a correct day with fewer numbers in it.
 *
 * The gate runs server-side (§3), so an out-of-range pair costs a refusal and never a `400`.
 */
export async function fetchRoutes(
  tripId: string,
  input: RouteBatchRequest,
  signal?: AbortSignal,
): Promise<RouteBatch> {
  const res = await apiFetch(`${API_BASE_URL}/trips/${tripId}/routes`, {
    method: HTTP_METHOD.POST,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  if (!res.ok) return throwApiError(res);
  return routeBatchSchema.parse(await readJson(res));
}

// ── Trip-destination lookup (ADR-0113): trip-agnostic, used at creation before a
// trip exists. Geo-type-restricted autocomplete + a geocode→zone resolve. Online-only.

const destinationsUrl = `${API_BASE_URL}/destinations`;

/** Destination autocomplete (cities / regions / countries). Same `{ input,
 *  sessionToken }` shape as the trip-scoped search; `signal` aborts a superseded
 *  keystroke. */
export async function searchDestinations({
  input,
  sessionToken,
  signal,
}: {
  input: string;
  sessionToken: string;
  signal?: AbortSignal;
}): Promise<PlacePrediction[]> {
  const res = await apiFetch(`${destinationsUrl}/search`, {
    method: HTTP_METHOD.POST,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input, sessionToken }),
    signal,
  });
  if (!res.ok) return throwApiError(res);
  return placePredictionSchema.array().parse(await readJson(res));
}

/** Geocode a picked destination into `{ googlePlaceId, name, countryCode?, lat?,
 *  lng?, timezone?, candidateZones? }` (ADR-0113 §4). No persistence. */
export async function resolveDestination(input: {
  googlePlaceId: string;
  sessionToken?: string;
}): Promise<DestinationResult> {
  const res = await apiFetch(`${destinationsUrl}/resolve`, {
    method: HTTP_METHOD.POST,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) return throwApiError(res);
  return destinationResultSchema.parse(await readJson(res));
}

/** Upload a document (multipart). The browser sets the multipart `Content-Type`
 *  boundary, so we must NOT set it ourselves. */
export async function uploadDocument(
  tripId: string,
  input: CreateDocumentInput,
  file: File,
): Promise<TripDocument> {
  const form = new FormData();
  form.set('type', input.type);
  form.set('title', input.title);
  if (input.id) form.set('id', input.id);
  if (input.ownerUserId) form.set('ownerUserId', input.ownerUserId);
  form.set('file', file);
  const res = await apiFetch(documentsUrl(tripId), { method: HTTP_METHOD.POST, body: form });
  if (!res.ok) return throwApiError(res);
  return tripDocumentSchema.parse(await readJson(res));
}

/** Fetch a document's decrypted content as a Blob. The `/content` route is
 *  auth-guarded, so it can't be a raw `<img src>` — the viewer turns this Blob
 *  into an object URL.
 *
 *  Read-through the client blob cache (ADR-0055): a repeat open is served with no
 *  network fetch, and an offline re-open of a previously viewed doc still succeeds
 *  (ADR-0042). The blob is immutable by fileRef but the URL is reused across a
 *  replace, so `version` (the doc's `updatedAt`) keys the cache — a replace mints a
 *  fresh key and the stale one is evicted on write.
 *
 *  **Every await here is bounded** (`lib/deadline.ts`, field-report #20). None of them was,
 *  and the viewer's only route to an error state is a rejection — so any one of them going
 *  quiet was a spinner that outlived the screen. The cache's own bound lives in
 *  `doc-cache.ts`, which answers null; the two network phases reject, and the viewer turns
 *  that into a retry. Those two are `apiFetch`'s own bounds now (#22 made them every read's),
 *  so this path holds no second copy of them. */
export async function fetchDocumentContent(
  tripId: string,
  docId: string,
  version?: string,
): Promise<Blob> {
  const baseUrl = documentContentUrl(tripId, docId);
  const url = version ? `${baseUrl}?v=${encodeURIComponent(version)}` : baseUrl;

  const cached = await readCachedBlob(url);
  if (cached) return cached;

  const res = await apiFetch(url);
  const blob = await withDeadline(API_PHASE.BODY, API_TIMEOUT_MS.BODY, () =>
    res.ok ? res.blob() : throwApiError(res),
  );

  // **Not awaited.** The bytes are already in hand, so the caller has its answer and the
  // write is pure optimization — awaiting it meant a jammed or full cache held up a read
  // that had already succeeded, and the eviction sweep it runs first walks every key.
  // It cannot reject (`doc-cache.ts` is best-effort throughout).
  //
  // **Unversioned reads are served but never stored** (field report #33). Without a version
  // the key would be the bare `/content` path, which no later version can supersede — the
  // one entry ADR-0055's keying exists to prevent. Skipping the write costs such a read its
  // offline copy and keeps every entry in the store version-keyed.
  if (version) void writeCachedBlob(url, blob, baseUrl);
  return blob;
}

/** Rename / change type (ADR-0052, replace-file dropped in the 2026-07-18
 *  amendment). Multipart matching upload so it shares the one PATCH route. */
export async function updateDocument(
  tripId: string,
  docId: string,
  input: { title?: string; type?: DocumentType },
): Promise<TripDocument> {
  const form = new FormData();
  if (input.title !== undefined) form.set('title', input.title);
  if (input.type !== undefined) form.set('type', input.type);
  const res = await apiFetch(`${documentsUrl(tripId)}/${docId}`, {
    method: HTTP_METHOD.PATCH,
    body: form,
  });
  if (!res.ok) return throwApiError(res);
  return tripDocumentSchema.parse(await readJson(res));
}

/** Delete a document (row + encrypted blob, server-side). 204, no body. */
export async function deleteDocument(tripId: string, docId: string): Promise<void> {
  const res = await apiFetch(`${documentsUrl(tripId)}/${docId}`, { method: HTTP_METHOD.DELETE });
  if (!res.ok) return throwApiError(res);
}

/** Drop every cached version of a document's blob (ADR-0055/0057). Used when a
 *  remote replace/delete arrives: the `/content` URL is reused across a replace,
 *  and a peer's WS change carries no fresh `updatedAt` to re-key the cache, so a
 *  stale open would otherwise hit the old bytes. Evicting forces a fresh fetch. */
export async function evictDocumentBlob(tripId: string, docId: string): Promise<void> {
  await evictCachedDocument(documentContentUrl(tripId, docId));
}

/** **Ask for a fresh rate set, and wait for the answer** (ADR-0180 §4).
 *
 *  The only FX call a client makes: every render's rates ride the snapshot. This
 *  exists for the one case the push cannot serve — the stored set has lapsed and
 *  the background pass has not landed one — so it awaits the fetch rather than
 *  scheduling it, because someone is watching the mark spin.
 *
 *  Trip-scoped in the path though the store is global: that is what makes the
 *  server's existing `MembershipGuard` apply (see `FxController`). `null` is a
 *  real answer, not a failure — a first fetch that did not land. */
export async function refreshFxRates(tripId: string): Promise<FxRates | null> {
  const res = await apiFetch(`${API_BASE_URL}/trips/${tripId}/fx/refresh`, {
    method: HTTP_METHOD.POST,
  });
  if (!res.ok) return throwApiError(res);
  return fxRefreshResultSchema.parse(await readJson(res)).fxRates;
}

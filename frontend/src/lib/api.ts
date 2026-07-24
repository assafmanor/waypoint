// Data layer for the events read/write API (T-034/T-014).
import {
  accessTokenResponseSchema,
  bookingSchema,
  changeSchema,
  inviteUrlSchema,
  invitePreviewSchema,
  destinationResultSchema,
  maybeItemSchema,
  meSchema,
  membershipSchema,
  placePredictionSchema,
  placeSchema,
  removedMemberSchema,
  tripDocumentSchema,
  tripEventSchema,
  tripSchema,
  tripSnapshotSchema,
  ERROR_CODE,
  type Booking,
  type Change,
  type CreateBookingInput,
  type CreateDocumentInput,
  type CreateEventInput,
  type CreateMaybeItemInput,
  type CreatePlaceInput,
  type CreateTripInput,
  type DestinationResult,
  type DocumentType,
  type EventStatus,
  type MaybeItem,
  type TripDocument,
  type InvitePreview,
  type InviteUrl,
  type JoinTripInput,
  type Me,
  type Membership,
  type MoveEventInput,
  type MembershipRole,
  type Place,
  type PlacePrediction,
  type ResolvePlaceInput,
  type RemovedMember,
  type Trip,
  type TripEvent,
  type TripSnapshot,
  type UpdateBookingInput,
  type UpdateEventInput,
  type UpdatePlaceInput,
  type UpdateTripInput,
} from '@waypoint/shared';
import { evictCachedDocument, readCachedBlob, writeCachedBlob } from './doc-cache';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

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
export function setOnSessionExpired(callback: (() => void) | null): void {
  onSessionExpired = callback;
}

async function rawFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  return fetch(url, { ...init, headers, credentials: 'include' });
}

/** Attaches the in-memory bearer token + session cookie; on a 401 tries one
 *  silent refresh (the access JWT is short-lived by design) and retries once
 *  before telling `AuthProvider` the session is gone. */
export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const res = await rawFetch(url, init);
  if (res.status !== 401) return res;
  if (!(await refreshAccessToken())) {
    onSessionExpired?.();
    return res;
  }
  return rawFetch(url, init);
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
  return meSchema.parse(await res.json());
}

export async function fetchTrips(): Promise<Trip[]> {
  const res = await apiFetch(`${API_BASE_URL}/trips`);
  if (!res.ok) return throwApiError(res);
  return tripSchema.array().parse(await res.json());
}

export async function createTrip(input: CreateTripInput): Promise<Trip> {
  const res = await apiFetch(`${API_BASE_URL}/trips`, {
    method: HTTP_METHOD.POST,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) return throwApiError(res);
  return tripSchema.parse(await res.json());
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
  return tripSchema.parse(await res.json());
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
  return membershipSchema.parse(await res.json());
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
  return inviteUrlSchema.parse(await res.json());
}

/** Revoke + replace the invite link (admin-only, ADR-0067): the old code dies. */
export async function rotateInvite(tripId: string): Promise<InviteUrl> {
  const res = await apiFetch(`${API_BASE_URL}/trips/${tripId}/invite/rotate`, {
    method: HTTP_METHOD.POST,
  });
  if (!res.ok) return throwApiError(res);
  return inviteUrlSchema.parse(await res.json());
}

/** Public/unguarded preview for the join screen (ADR-0024/0067) — no auth needed.
 *  404 = unknown code, 410 = trip already ended. */
export async function fetchInvitePreview(code: string): Promise<InvitePreview> {
  const res = await fetch(`${API_BASE_URL}/invites/${code}`);
  if (!res.ok) return throwApiError(res);
  return invitePreviewSchema.parse(await res.json());
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
  return membershipSchema.parse(await res.json());
}

/** Admin-only "Removed" list — members an admin kicked (ADR-0067). */
export async function fetchRemovedMembers(tripId: string): Promise<RemovedMember[]> {
  const res = await apiFetch(`${API_BASE_URL}/trips/${tripId}/blocks`);
  if (!res.ok) return throwApiError(res);
  return removedMemberSchema.array().parse(await res.json());
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

async function throwApiError(res: Response): Promise<never> {
  const body = (await res.json().catch(() => undefined)) as
    { error?: { code?: string; details?: unknown } } | undefined;
  throw new ApiError(res.status, body?.error?.code, body?.error?.details);
}

export async function fetchSnapshot(tripId: string): Promise<TripSnapshot> {
  const res = await apiFetch(snapshotUrl(tripId));
  if (!res.ok) throw new Error(`snapshot fetch failed: ${res.status}`);
  return tripSnapshotSchema.parse(await res.json());
}

export async function createEvent(tripId: string, input: CreateEventInput): Promise<TripEvent> {
  const res = await apiFetch(eventsUrl(tripId), {
    method: HTTP_METHOD.POST,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) return throwApiError(res);
  return tripEventSchema.parse(await res.json());
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
  return tripEventSchema.parse(await res.json());
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
  return tripEventSchema.parse(await res.json());
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
  const body = (await res.json()) as { event: unknown; rippleSuggestion?: RippleSuggestion };
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
  return changeSchema.array().parse(await res.json());
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
  return maybeItemSchema.parse(await res.json());
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
  return bookingSchema.parse(await res.json());
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
  return bookingSchema.parse(await res.json());
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
  return placeSchema.parse(await res.json());
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
  return placeSchema.parse(await res.json());
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
  return placePredictionSchema.array().parse(await res.json());
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
  return placeSchema.parse(await res.json());
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
  return placePredictionSchema.array().parse(await res.json());
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
  return destinationResultSchema.parse(await res.json());
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
  return tripDocumentSchema.parse(await res.json());
}

/** Fetch a document's decrypted content as a Blob. The `/content` route is
 *  auth-guarded, so it can't be a raw `<img src>` — the viewer turns this Blob
 *  into an object URL.
 *
 *  Read-through the client blob cache (ADR-0055): a repeat open is served with no
 *  network fetch, and an offline re-open of a previously viewed doc still succeeds
 *  (ADR-0042). The blob is immutable by fileRef but the URL is reused across a
 *  replace, so `version` (the doc's `updatedAt`) keys the cache — a replace mints a
 *  fresh key and the stale one is evicted on write. */
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
  if (!res.ok) return throwApiError(res);
  const blob = await res.blob();
  await writeCachedBlob(url, blob, baseUrl);
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
  return tripDocumentSchema.parse(await res.json());
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

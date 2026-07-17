// Data layer for the events read/write API (T-034/T-014).
import {
  accessTokenResponseSchema,
  bookingSchema,
  changeSchema,
  documentSummarySchema,
  inviteUrlSchema,
  invitePreviewSchema,
  maybeItemSchema,
  meSchema,
  membershipSchema,
  placeSchema,
  tripDocumentSchema,
  tripEventSchema,
  tripSchema,
  tripSnapshotSchema,
  type Booking,
  type Change,
  type CreateBookingInput,
  type CreateDocumentInput,
  type CreateEventInput,
  type CreateMaybeItemInput,
  type CreatePlaceInput,
  type CreateTripInput,
  type DocumentSummary,
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
  refreshInFlight ??= doRefresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function doRefresh(): Promise<boolean> {
  const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) return false;
  accessToken = accessTokenResponseSchema.parse(await res.json()).accessToken;
  return true;
}

export async function requestLogout(): Promise<void> {
  await fetch(`${API_BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include' });
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
    method: 'POST',
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
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) return throwApiError(res);
  return tripSchema.parse(await res.json());
}

/** Admin-only trip deletion (ADR-0039). 404 tolerated (already gone). */
export async function deleteTrip(tripId: string): Promise<void> {
  const res = await apiFetch(`${API_BASE_URL}/trips/${tripId}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) return throwApiError(res);
}

/** Admin-only: promote a member to a role (ADR-0039). */
export async function setMemberRole(
  tripId: string,
  userId: string,
  role: MembershipRole,
): Promise<Membership> {
  const res = await apiFetch(`${API_BASE_URL}/trips/${tripId}/members/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  });
  if (!res.ok) return throwApiError(res);
  return membershipSchema.parse(await res.json());
}

/** Remove a member (admin) or leave (self) — ADR-0005/0039. 404 tolerated. */
export async function removeMember(tripId: string, userId: string): Promise<void> {
  const res = await apiFetch(`${API_BASE_URL}/trips/${tripId}/members/${userId}`, {
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 404) return throwApiError(res);
}

/** Generates/refreshes the trip's invite link (T-065, ADR-0030 — link-only). */
export async function createInvite(tripId: string): Promise<InviteUrl> {
  const res = await apiFetch(`${API_BASE_URL}/trips/${tripId}/invite`, { method: 'POST' });
  if (!res.ok) return throwApiError(res);
  return inviteUrlSchema.parse(await res.json());
}

/** Public/unguarded preview for the join screen (T-042, ADR-0024) — no auth needed. */
export async function fetchInvitePreview(token: string): Promise<InvitePreview> {
  const res = await fetch(`${API_BASE_URL}/invites/${token}`);
  if (!res.ok) return throwApiError(res);
  return invitePreviewSchema.parse(await res.json());
}

/** Idempotent — rejoining an already-joined trip keeps the existing role and
 *  re-applies `calendarSyncEnabled` (api-contract.md). */
export async function joinTrip(token: string, input: JoinTripInput = {}): Promise<Membership> {
  const res = await apiFetch(`${API_BASE_URL}/trips/join/${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) return throwApiError(res);
  return membershipSchema.parse(await res.json());
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

export const HARD_EVENT_REQUIRES_CONFIRM = 'HARD_EVENT_REQUIRES_CONFIRM';
export const isHardEventConfirmError = (err: unknown): boolean =>
  err instanceof ApiError && err.code === HARD_EVENT_REQUIRES_CONFIRM;

export const MOVE_INTO_PAST = 'MOVE_INTO_PAST';
export const isMoveIntoPastError = (err: unknown): boolean =>
  err instanceof ApiError && err.code === MOVE_INTO_PAST;

export const MOVE_CROSSES_DAY = 'MOVE_CROSSES_DAY';
export const isMoveCrossesDayError = (err: unknown): boolean =>
  err instanceof ApiError && err.code === MOVE_CROSSES_DAY;

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
    method: 'POST',
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
    method: 'PATCH',
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
    method: 'POST',
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
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) return throwApiError(res);
  const body = (await res.json()) as { event: unknown; rippleSuggestion?: RippleSuggestion };
  return { event: tripEventSchema.parse(body.event), rippleSuggestion: body.rippleSuggestion };
}

export async function deleteEvent(tripId: string, eventId: string, confirm = false): Promise<void> {
  const url = `${eventUrl(tripId, eventId)}${confirm ? '?confirm=true' : ''}`;
  const res = await apiFetch(url, { method: 'DELETE' });
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
  const res = await apiFetch(consumeMaybeItemUrl(tripId, maybeItemId), { method: 'POST' });
  if (!res.ok) return throwApiError(res);
}

/** Add an idea to the maybe shelf (Plan-mode Tier 3). */
export async function createMaybeItem(
  tripId: string,
  input: CreateMaybeItemInput,
): Promise<MaybeItem> {
  const res = await apiFetch(maybeItemsUrl(tripId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) return throwApiError(res);
  return maybeItemSchema.parse(await res.json());
}

/** Remove an idea from the shelf. 404 is tolerated (already gone), matching deleteEvent. */
export async function deleteMaybeItem(tripId: string, maybeItemId: string): Promise<void> {
  const res = await apiFetch(maybeItemUrl(tripId, maybeItemId), { method: 'DELETE' });
  if (!res.ok && res.status !== 404) return throwApiError(res);
}

/** Create a booking (ADR-0047). An optional `event` seed auto-creates the linked
 *  event atomically server-side (ADR-0048). */
export async function createBooking(tripId: string, input: CreateBookingInput): Promise<Booking> {
  const res = await apiFetch(bookingsUrl(tripId), {
    method: 'POST',
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
    method: 'PATCH',
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
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 404) return throwApiError(res);
}

/** Create a Place (ADR-0048). Name-only ("Place-lite") is valid; the Google
 *  Places picker enriches googlePlaceId/lat/lng later. */
export async function createPlace(tripId: string, input: CreatePlaceInput): Promise<Place> {
  const res = await apiFetch(placesUrl(tripId), {
    method: 'POST',
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
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) return throwApiError(res);
  return placeSchema.parse(await res.json());
}

/** Trip documents (ADR-0015/0034). The list omits `fileRef` (the encrypted blob
 *  reference never leaves the server outside the guarded `/content` route). */
export async function listDocuments(tripId: string): Promise<DocumentSummary[]> {
  const res = await apiFetch(documentsUrl(tripId));
  if (!res.ok) return throwApiError(res);
  return documentSummarySchema.array().parse(await res.json());
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
  const res = await apiFetch(documentsUrl(tripId), { method: 'POST', body: form });
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

/** Rename / change type, and optionally replace the file (ADR-0052). Always
 *  multipart (matching upload) so metadata-only and replace share one route. */
export async function updateDocument(
  tripId: string,
  docId: string,
  input: { title?: string; type?: DocumentType },
  file?: File,
): Promise<TripDocument> {
  const form = new FormData();
  if (input.title !== undefined) form.set('title', input.title);
  if (input.type !== undefined) form.set('type', input.type);
  if (file) form.set('file', file);
  const res = await apiFetch(`${documentsUrl(tripId)}/${docId}`, { method: 'PATCH', body: form });
  if (!res.ok) return throwApiError(res);
  return tripDocumentSchema.parse(await res.json());
}

/** Delete a document (row + encrypted blob, server-side). 204, no body. */
export async function deleteDocument(tripId: string, docId: string): Promise<void> {
  const res = await apiFetch(`${documentsUrl(tripId)}/${docId}`, { method: 'DELETE' });
  if (!res.ok) return throwApiError(res);
}

/** Drop every cached version of a document's blob (ADR-0055/0057). Used when a
 *  remote replace/delete arrives: the `/content` URL is reused across a replace,
 *  and a peer's WS change carries no fresh `updatedAt` to re-key the cache, so a
 *  stale open would otherwise hit the old bytes. Evicting forces a fresh fetch. */
export async function evictDocumentBlob(tripId: string, docId: string): Promise<void> {
  await evictCachedDocument(documentContentUrl(tripId, docId));
}

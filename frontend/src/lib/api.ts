// Data layer for the events read/write API (T-034/T-014).
import {
  changeSchema,
  tripEventSchema,
  tripSnapshotSchema,
  type Change,
  type CreateEventInput,
  type EventStatus,
  type MoveEventInput,
  type TripEvent,
  type TripSnapshot,
  type UpdateEventInput,
} from '@waypoint/shared';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

const snapshotUrl = (tripId: string) => `${API_BASE_URL}/trips/${tripId}/snapshot`;
const eventsUrl = (tripId: string) => `${API_BASE_URL}/trips/${tripId}/events`;
const eventUrl = (tripId: string, eventId: string) => `${eventsUrl(tripId)}/${eventId}`;
const changesUrl = (tripId: string, sinceSeq: string) =>
  `${API_BASE_URL}/trips/${tripId}/changes?sinceSeq=${sinceSeq}`;
const consumeMaybeItemUrl = (tripId: string, maybeItemId: string) =>
  `${API_BASE_URL}/trips/${tripId}/maybe-items/${maybeItemId}/consume`;

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
  const res = await fetch(snapshotUrl(tripId));
  if (!res.ok) throw new Error(`snapshot fetch failed: ${res.status}`);
  return tripSnapshotSchema.parse(await res.json());
}

export async function createEvent(tripId: string, input: CreateEventInput): Promise<TripEvent> {
  const res = await fetch(eventsUrl(tripId), {
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
  const res = await fetch(url, {
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
  const res = await fetch(`${eventUrl(tripId, eventId)}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) return throwApiError(res);
  return tripEventSchema.parse(await res.json());
}

export interface RippleSuggestion {
  movedTitle: string;
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
  const res = await fetch(url, {
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
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) return throwApiError(res);
}

/** Reconnect catch-up (sync-and-offline.md "Bootstrap & catch-up"): replays
 *  anything committed since `sinceSeq`, cursored on `seq` not a timestamp. */
export async function fetchChanges(tripId: string, sinceSeq: string): Promise<Change[]> {
  const res = await fetch(changesUrl(tripId, sinceSeq));
  if (!res.ok) throw new Error(`changes fetch failed: ${res.status}`);
  return changeSchema.array().parse(await res.json());
}

/** Marks a maybe-shelf item consumed server-side (T-058) — schedule() used to
 *  only flip this locally, so a resync after an offline reconnect silently
 *  reverted an already-scheduled item back to unscheduled. */
export async function consumeMaybeItem(tripId: string, maybeItemId: string): Promise<void> {
  const res = await fetch(consumeMaybeItemUrl(tripId, maybeItemId), { method: 'POST' });
  if (!res.ok) return throwApiError(res);
}

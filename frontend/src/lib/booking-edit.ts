// Booking edit helpers (ADR-0047). Kept pure so the merge/flag/seed logic is
// unit-testable without rendering the sheet.
import type {
  Booking,
  BookingEventSeed,
  EventCategory,
  EventKind,
  Place,
  TripEvent,
} from '@waypoint/shared';
import { EVENT_SOURCE, EVENT_STATUS, bookingEventFields } from '@waypoint/shared';
import { zonedIso, resolveEndIso, isoToTimeInput, todayInTz } from './time';

/** Editable free-form detail fields the sheet exposes (the rest of the booking's
 *  `details` blob is preserved untouched). */
export interface BookingDetailEdits {
  room?: string;
  wifiNetwork?: string;
  wifiPassword?: string;
  notes?: string;
}

const clean = (v?: string) => {
  const trimmed = v?.trim();
  return trimmed ? trimmed : undefined;
};

/** Merge the sheet's edited detail fields into a booking's `details` blob,
 *  pruning empties. The backend replaces `details` wholesale on update, so the
 *  sheet must send the fully merged object — this builds it. Returns `undefined`
 *  when nothing is left, so an emptied blob is dropped rather than stored as {}. */
export function mergeBookingDetails(
  existing: Booking['details'],
  edits: BookingDetailEdits,
): Booking['details'] | undefined {
  const { wifi: _oldWifi, room: _oldRoom, notes: _oldNotes, ...rest } = existing ?? {};
  const next: Record<string, unknown> = { ...rest };

  const room = clean(edits.room);
  if (room) next.room = room;

  const notes = clean(edits.notes);
  if (notes) next.notes = notes;

  const network = clean(edits.wifiNetwork);
  const password = clean(edits.wifiPassword);
  if (network || password) next.wifi = { network, password };

  return Object.keys(next).length > 0 ? next : undefined;
}

/** Delete-prompt choice → the `deleteBooking` flags (ADR-0047 §3). Both choices
 *  send `confirm:true`: the backend guards a hard linked event on *either* path
 *  (delete-both removes it; unlink strips its confirmation linkage — both are
 *  edits to a commitment), and the prompt (with its 🔒 note) is that
 *  confirmation. `confirm:true` is harmless when the event is soft or absent. */
export function deleteFlags(choice: 'both' | 'unlink'): {
  deleteEvents: boolean;
  confirm: boolean;
} {
  return choice === 'both'
    ? { deleteEvents: true, confirm: true }
    : { deleteEvents: false, confirm: true };
}

/** A transport booking's stored title is derived from its route, not hand-typed
 *  (ADR-0059 §3): `origin ← dest` (using the app's route arrow; either endpoint
 *  may be blank). Returns '' when both are blank — the sheet reads that as
 *  "route required". This title backs the linked event's title and any
 *  place-less fallback, so a flight never carries a name. */
export function routeTitle(origin: string, dest: string, arrow: string): string {
  return [origin.trim(), dest.trim()].filter(Boolean).join(` ${arrow} `);
}

/** Match a typed place name to an existing Place (trimmed, case-insensitive) so
 *  re-typing a name reuses its row instead of spawning a duplicate. Returns
 *  `undefined` for a blank name or no match — the caller then authors a new one.
 *  Dedup gets richer once the Google Places picker replaces free text. */
export function findPlaceByName(places: Place[], name: string): Place | undefined {
  const key = name.trim().toLowerCase();
  if (!key) return undefined;
  return places.find((p) => p.name.trim().toLowerCase() === key);
}

/** Build the linked-event seed a booking save sends when it has a schedule
 *  (ADR-0047 §1) — same date/time math as EventForm. Returns `undefined` with no
 *  date (an index-only booking, no itinerary event). No `id`: the backend mints
 *  the event and the WS echo delivers it. `end` without `start` files as an
 *  end-of-day marker (zonedIso on the date), matching EventForm. */
export function buildEventSeed(
  input: {
    date: string;
    start: string;
    end: string;
    kind: EventKind;
    icon?: string;
    category?: EventCategory;
  },
  timeZone: string,
): BookingEventSeed | undefined {
  const { date, start, end, kind, icon, category } = input;
  if (!date) return undefined;
  const startsAt = start ? zonedIso(date, start, timeZone) : undefined;
  const endsAt = end
    ? start
      ? resolveEndIso(date, start, end, timeZone)
      : zonedIso(date, end, timeZone)
    : undefined;
  return { date, startsAt, endsAt, kind, icon, category };
}

/** True if a `date` or `datetime-local` value's day part falls outside the trip's
 *  [startDate, endDate]. Blank is in-range (an index-only booking has no schedule
 *  to bound). The span inputs' native min/max are a hint browsers don't hard-block
 *  on typed input, so this stays the real guard on save. */
export function dateOutOfTripRange(value: string, startDate: string, endDate: string): boolean {
  const day = value.split('T')[0];
  return !!day && (day < startDate || day > endDate);
}

/** A native datetime-local value ("YYYY-MM-DDTHH:MM") → its date + time parts. */
function splitLocal(dt: string): { date: string; time: string } | null {
  const [date, time] = dt.split('T');
  return date && time ? { date, time } : null;
}

/** An instant → a datetime-local input value in the trip timezone, for
 *  prefilling the span (departure/arrival, check-in/check-out) fields on edit. */
export function isoToDateTimeLocal(iso: string, timeZone: string): string {
  return `${todayInTz(timeZone, new Date(iso))}T${isoToTimeInput(iso, timeZone)}`;
}

/** Linked-event seed for a two-endpoint booking (ADR-0047 §1): flight/train
 *  departure→arrival, or a hotel check-in→check-out. Each endpoint is a full
 *  datetime in the trip timezone; the event spans calendar days via `endDate`
 *  when the end lands on a later day. Returns `undefined` with no start (an
 *  index-only booking). */
export function buildSpanSeed(
  input: {
    startAt: string;
    endAt: string;
    kind: EventKind;
    icon?: string;
    category?: EventCategory;
  },
  timeZone: string,
): BookingEventSeed | undefined {
  const startParts = splitLocal(input.startAt);
  if (!startParts) return undefined;
  const startsAt = zonedIso(startParts.date, startParts.time, timeZone);
  const endParts = splitLocal(input.endAt);
  const endsAt = endParts ? zonedIso(endParts.date, endParts.time, timeZone) : undefined;
  const endDate = endParts && endParts.date !== startParts.date ? endParts.date : undefined;
  return {
    date: startParts.date,
    startsAt,
    endsAt,
    endDate,
    kind: input.kind,
    icon: input.icon,
    category: input.category,
  };
}

/** Build the linked itinerary event a timed booking implies (ADR-0093), mirroring
 *  the server's derivation (`eventDataFromBooking`): the title tracks the booking,
 *  the category defaults to the booking type's, the place stays null (a linked
 *  event's place comes from the booking, ADR-0048), and `bookingId` ties them.
 *  Used for the optimistic mirror so a booking saved offline shows its schedule +
 *  lands on the timeline immediately; the `seed.id` is the id the server will
 *  upsert under, so the write reconciles in place on flush (no duplicate). The
 *  caller must give the seed an id. */
export function eventFromBookingSeed(
  booking: Pick<Booking, 'id' | 'tripId' | 'title' | 'type'>,
  seed: BookingEventSeed & { id: string },
  meta: { updatedBy: string; nowIso: string },
): TripEvent {
  // The booking→event mapping is shared with the server (bookingEventFields), so
  // the two can't diverge; this only adds the client-side event shape around it.
  return {
    ...bookingEventFields(booking, seed),
    id: seed.id,
    tripId: booking.tripId,
    placeId: undefined,
    status: EVENT_STATUS.PLANNED,
    sortOrder: 0,
    source: EVENT_SOURCE.MANUAL,
    createdAt: meta.nowIso,
    updatedAt: meta.nowIso,
    updatedBy: meta.updatedBy,
  };
}

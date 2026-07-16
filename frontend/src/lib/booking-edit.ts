// Booking edit helpers (ADR-0047). Kept pure so the merge/flag/seed logic is
// unit-testable without rendering the sheet.
import type { Booking, BookingEventSeed, EventCategory, EventKind, Place } from '@waypoint/shared';
import { zonedIso, resolveEndIso } from './time';

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

// Booking edit helpers (ADR-0047). Kept pure so the merge/flag logic is unit-
// testable without rendering the sheet.
import type { Booking } from '@waypoint/shared';

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

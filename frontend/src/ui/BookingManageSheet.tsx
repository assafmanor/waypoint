// Per-booking manage sheet — the "⋯" a booking row carries (like the document
// row's, ADR-0052 §2). Edit opens the merged BookingSheet; Delete raises the
// delete/unlink prompt (ADR-0047 §3). Kept off the read-only detail view, which
// carries only the edit button (ADR-0053 revision, 2026-07-17).
//
// Redesigned in ADR-0138. Two changes beyond the icons: the sheet NAMES its
// subject (it used to render two anonymous rows over a scrim, with the booking
// you were deleting hidden behind it), and it offers `שבץ במסלול` — the verb the
// row's own `לא משובצת במסלול` was asking for and could not reach, since
// scheduling lives inside the edit form and nothing said so.
import { useState } from 'react';
import { type Booking } from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
import { RowManageSheet, type RowAction } from './domain';
import { BookingTitle } from './BookingTitle';
import { DeletePrompt } from './BookingSheet';
import { deleteFlags } from '../lib/booking-edit';
import { useRoundTripPartner } from '../lib/booking-pair';
import { CONTROL_ICON, DOT_SEPARATOR } from '../constants';
import { t } from '../i18n/he';

export function BookingManageSheet({
  booking,
  onClose,
  onEdit,
}: {
  booking: Booking;
  onClose: () => void;
  /** `focus` asks the edit sheet to open ON the when-field — what makes
   *  `שבץ במסלול` a shortcut to the schedule rather than an alias for `ערוך`. */
  onEdit: (booking: Booking, focus?: 'when') => void;
}) {
  const { events, places, indexVerbs } = useTrip();
  const linkedEvent = events.find((e) => e.bookingId === booking.id);
  const [deleting, setDeleting] = useState(false);
  const pair = useRoundTripPartner(booking);

  if (deleting) {
    return (
      <DeletePrompt
        hasLinkedEvent={!!linkedEvent}
        linkedIsHard={linkedEvent?.kind === 'hard'}
        partnerLeg={pair?.leg}
        onCancel={() => setDeleting(false)}
        onChoose={(choice) => {
          void indexVerbs.deleteBooking(booking.id, deleteFlags(choice)).catch(() => {});
          onClose();
        }}
      />
    );
  }

  const actions: RowAction[] = [
    {
      // Reads as "change it" once there IS a slot — the same verb would
      // otherwise promise something the booking already has.
      label: linkedEvent ? t.index.detail.reschedule : t.index.detail.schedule,
      icon: CONTROL_ICON.schedule,
      onSelect: () => onEdit(booking, 'when'),
    },
    { label: t.index.detail.edit, icon: CONTROL_ICON.edit, onSelect: () => onEdit(booking) },
    {
      label: t.index.detail.delete,
      icon: CONTROL_ICON.trash,
      danger: true,
      onSelect: () => setDeleting(true),
    },
  ];

  return (
    <RowManageSheet
      title={<BookingTitle booking={booking} places={places} />}
      subject={`${t.index.bookingType[booking.type]} ${DOT_SEPARATOR} ${
        linkedEvent ? t.index.detail.isScheduled : t.index.unlinked
      }`}
      onClose={onClose}
      actions={actions}
    />
  );
}

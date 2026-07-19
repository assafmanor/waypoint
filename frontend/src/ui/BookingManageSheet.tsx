// Per-booking manage sheet — the "⋯" a booking row carries (like the document
// row's, ADR-0052 §2). Edit opens the merged BookingSheet; Delete raises the
// delete/unlink prompt (ADR-0047 §3). Kept off the read-only detail view, which
// carries only the edit button (ADR-0053 revision, 2026-07-17).
import { useState } from 'react';
import { type Booking } from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
import { RowManageSheet } from './domain';
import { DeletePrompt } from './BookingSheet';
import { deleteFlags } from '../lib/booking-edit';
import { t } from '../i18n/he';

export function BookingManageSheet({
  booking,
  onClose,
  onEdit,
}: {
  booking: Booking;
  onClose: () => void;
  onEdit: (booking: Booking) => void;
}) {
  const { events, indexVerbs } = useTrip();
  const linkedEvent = events.find((e) => e.bookingId === booking.id);
  const [deleting, setDeleting] = useState(false);

  if (deleting) {
    return (
      <DeletePrompt
        hasLinkedEvent={!!linkedEvent}
        linkedIsHard={linkedEvent?.kind === 'hard'}
        onCancel={() => setDeleting(false)}
        onChoose={(choice) => {
          void indexVerbs.deleteBooking(booking.id, deleteFlags(choice)).catch(() => {});
          onClose();
        }}
      />
    );
  }

  return (
    <RowManageSheet
      ariaLabel={t.index.detail.actions}
      onClose={onClose}
      actions={[
        { label: t.index.detail.edit, icon: '✏️', onSelect: () => onEdit(booking) },
        {
          label: t.index.detail.delete,
          icon: '🗑️',
          danger: true,
          onSelect: () => setDeleting(true),
        },
      ]}
    />
  );
}

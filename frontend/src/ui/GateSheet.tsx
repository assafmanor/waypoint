// **The gate, added without editing the flight** (ADR-0222 §7).
//
// The cost this exists to remove is ADR-0155's and it is real: `BookingSheet` is a stepped
// form that COMMITS ONCE, so setting two characters at the airport meant paging to its
// `more` step and rewriting the whole booking. This sends `{ gate }` and nothing else.
//
// It is deliberately the smallest possible surface built entirely from primitives — `Sheet`
// (which is `Modal`, so it joins the back stack like every other overlay), one `Field`, one
// `FormActions`. Nothing here is new: if this file were long, the quick-add would have become
// a second form system, which is the thing rule 8 is for.
import { useState } from 'react';
import { MAX_GATE_LENGTH, type Booking } from '@waypoint/shared';
import { t } from '../i18n/he';
import { useTrip } from '../state/trip-state';
import { Sheet } from './Sheet';
import { Field } from './primitives/Field';
import { FormActions } from './primitives/FormActions';

export function GateSheet({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const { indexVerbs } = useTrip();
  const [value, setValue] = useState(booking.gate ?? '');
  const [busy, setBusy] = useState(false);
  const label = t.index.sheet.gateLabel[booking.type];

  const save = async () => {
    setBusy(true);
    try {
      // The trimmed value even when empty: an empty string is the explicit "clear the gate"
      // intent, which this surface has to support because a gate that CHANGED is the normal
      // case and the schema's `nullish` exists for it.
      await indexVerbs.updateBooking(booking.id, { gate: value.trim() });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title={label} onClose={onClose}>
      <Field label={label} htmlFor="gate-quick" hint={t.index.sheet.gateHint}>
        <input
          id="gate-quick"
          dir="ltr"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t.index.sheet.gatePlaceholder[booking.type]}
          maxLength={MAX_GATE_LENGTH}
        />
      </Field>
      <FormActions
        primary={{ label: t.index.sheet.save, onClick: save, busy }}
        secondary={{ label: t.index.sheet.cancel, onClick: onClose }}
      />
    </Sheet>
  );
}

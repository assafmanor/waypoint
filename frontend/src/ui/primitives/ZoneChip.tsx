// ZoneChip — the editable "which zone is this time in" chip (ADR-0107 §6). The
// zone an event's times are read and written in is *inferred* (place > itinerary
// segment > trip primary), and the ADR's rule is that inference is never silently
// authoritative on the boundary cases: the chip states the resolved zone and one
// tap corrects it, through the shared `ZonePicker` (ADR-0113 §6) like every other
// place a zone is chosen.
//
// A correction is a **manual override** (`Event.displayTimezone`), not a cache of
// the derived value (ADR-0110 §94-99): while it's set the chip reads as pinned and
// offers a reset, and clearing it (`onChange(null)`) hands the event back to the
// derivation — so adding the outbound flight later re-orients an un-pinned time.
//
// Presentational: it owns its picker's open state and nothing else. Read-only when
// no `onChange` is given (a zone that follows a picked place isn't correctable
// here — you'd change the place).
import { useState } from 'react';
import { Icon } from '../Icon';
import { ZonePicker, zoneLabel } from './ZonePicker';
import { t } from '../../i18n/he';
import './zone-chip.css';

export interface ZoneChipProps {
  /** The zone in force — the override when pinned, else the derived zone. */
  value: string;
  /** A zone pins it as a manual override; `null` clears back to derived. Omitted
   *  → the chip is a read-only statement of the resolved zone. */
  onChange?: (zone: string | null) => void;
  /** `value` is a manual override rather than the derived zone (drives the reset). */
  pinned?: boolean;
  /** Zones to surface first in the picker (the trip's zones, the device's). */
  suggested?: string[];
}

export function ZoneChip({ value, onChange, pinned = false, suggested }: ZoneChipProps) {
  const [picking, setPicking] = useState(false);
  const label = zoneLabel(value);

  return (
    <div className="zchip">
      <span className="zchip-cap">{t.eventForm.zoneLabel}</span>
      {onChange ? (
        <button
          type="button"
          className={'zchip-btn' + (pinned ? ' pinned' : '')}
          onClick={() => setPicking(true)}
          aria-label={t.eventForm.zonePick(label)}
        >
          <span aria-hidden="true">🕐</span>
          <span className="zchip-zone">{label}</span>
          <span className="zchip-caret" aria-hidden="true">
            <Icon name="caret" dir="down" />
          </span>
        </button>
      ) : (
        <span className="zchip-static">
          <span aria-hidden="true">🕐</span> <span className="zchip-zone">{label}</span>
        </span>
      )}
      {pinned && onChange && (
        <button type="button" className="zchip-reset" onClick={() => onChange(null)}>
          {t.eventForm.zoneReset}
        </button>
      )}
      {picking && (
        <ZonePicker
          value={value}
          suggested={suggested}
          onChange={(zone) => {
            setPicking(false);
            onChange?.(zone);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}

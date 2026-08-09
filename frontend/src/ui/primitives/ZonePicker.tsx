// The shared zone picker (ADR-0113 §6): one searchable control over the full IANA
// set (`Intl.supportedValuesOf('timeZone')` — no curated list to ship or age),
// used everywhere a timezone is chosen — trip settings, trip creation, and the
// per-event zone chip (ADR-0110 §3).
//
// **The sheet itself is now `CodePicker`** (ADR-0180 §6), which a currency needed
// verbatim. What stays here is the only part that was ever the zone's: how a zone
// is labelled, and what a query matches against. Behaviour is unchanged — this
// file's own test predates the extraction and still passes untouched, which is
// the check that mattered.
import { getNow } from '../../lib/useClock';
import { t } from '../../i18n/he';
import { CodePicker } from './CodePicker';

/** The runtime's complete IANA zone set, read once. Empty on a runtime without
 *  `supportedValuesOf` (older engines) — search then only matches suggested. */
const ALL_ZONES: string[] =
  typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];

/** "New York" from "America/New_York" — the last path segment, readable. */
export function zoneCity(zone: string): string {
  return (zone.split('/').pop() ?? zone).replace(/_/g, ' ');
}

/** The zone's current UTC offset as "GMT+9" (DST-correct for today). '' if the
 *  runtime can't format it — the label then falls back to the city alone. */
export function zoneOffset(zone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      timeZoneName: 'shortOffset',
    }).formatToParts(new Date(getNow()));
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}

/** The friendly one-line label a caller's trigger shows, e.g. "Tokyo · GMT+9". */
export function zoneLabel(zone: string): string {
  const offset = zoneOffset(zone);
  return offset ? `${zoneCity(zone)} · ${offset}` : zoneCity(zone);
}

export function ZonePicker({
  value,
  onChange,
  onClose,
  suggested = [],
}: {
  /** The current zone (highlighted + always surfaced in the suggested group). */
  value?: string;
  onChange: (zone: string) => void;
  onClose: () => void;
  /** Zones to surface first (device zone, the trip's place zones, the current
   *  value) — relevant candidates before the full list (ADR-0113 §6). */
  suggested?: string[];
}) {
  return (
    <CodePicker
      kind="zone"
      all={ALL_ZONES}
      suggested={suggested}
      value={value}
      onChange={onChange}
      onClose={onClose}
      row={(zone) => ({
        primary: zoneCity(zone),
        secondary: zone,
        trailing: zoneOffset(zone),
      })}
      matches={(zone, q) =>
        zone.toLowerCase().includes(q) ||
        zoneCity(zone).toLowerCase().includes(q) ||
        zoneOffset(zone).toLowerCase().includes(q)
      }
      copy={{
        title: t.zonePicker.title,
        searchPlaceholder: t.zonePicker.searchPlaceholder,
        suggested: t.zonePicker.suggested,
        all: t.zonePicker.allZones,
        noResults: t.zonePicker.noResults,
      }}
    />
  );
}

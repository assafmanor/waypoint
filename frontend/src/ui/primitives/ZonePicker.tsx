// The shared zone picker (ADR-0113 §6): one searchable control over the full IANA
// set (`Intl.supportedValuesOf('timeZone')` — no curated list to ship or age),
// used everywhere a timezone is chosen — trip settings, trip creation, and the
// per-event zone chip (ADR-0110 §3). Renders through `Modal`/`useOverlay` like
// every overlay (never a hand-rolled portal, ADR-0090). This is the sheet only;
// each call site owns its trigger (a settings field, a creation line, a chip).
import { useMemo, useRef, useState } from 'react';
import { getNow } from '../../lib/useClock';
import { t } from '../../i18n/he';
import { EmptyState } from '../feedback';
import { Modal } from './Modal';
import './zone-picker.css';

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
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // The candidates shown first: the passed suggestions + the current value,
  // de-duped, kept only if the runtime knows the zone (or the list is empty).
  const known = useMemo(() => new Set(ALL_ZONES), []);
  const top = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const z of [value, ...suggested]) {
      if (z && !seen.has(z) && (known.has(z) || ALL_ZONES.length === 0)) {
        seen.add(z);
        out.push(z);
      }
    }
    return out;
  }, [value, suggested, known]);

  const q = query.trim().toLowerCase();
  const matches = (zone: string) =>
    !q ||
    zone.toLowerCase().includes(q) ||
    zoneCity(zone).toLowerCase().includes(q) ||
    zoneOffset(zone).toLowerCase().includes(q);

  // While searching, one flat matched list over everything (suggested included);
  // at rest, the suggested group first, then the full list minus what's above.
  const topSet = useMemo(() => new Set(top), [top]);
  const rest = useMemo(() => ALL_ZONES.filter((z) => !topSet.has(z)), [topSet]);

  const searching = q.length > 0;
  const shownTop = searching ? [] : top;
  const shownRest = (searching ? [...top, ...rest] : rest).filter(matches);

  const row = (zone: string) => (
    <li key={zone}>
      <button
        type="button"
        className={'zp-row' + (zone === value ? ' on' : '')}
        onClick={() => onChange(zone)}
      >
        <span className="zp-city">{zoneCity(zone)}</span>
        <span className="zp-zone">{zone}</span>
        <span className="zp-offset" dir="ltr">
          {zoneOffset(zone)}
        </span>
      </button>
    </li>
  );

  const empty = shownTop.length === 0 && shownRest.length === 0;

  return (
    <Modal variant="sheet" title={t.zonePicker.title} onClose={onClose} initialFocusRef={searchRef}>
      <div className="zp-sheet">
        <input
          ref={searchRef}
          className="zp-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.zonePicker.searchPlaceholder}
          aria-label={t.zonePicker.searchPlaceholder}
        />

        {empty ? (
          <EmptyState title={t.zonePicker.noResults} />
        ) : (
          <ul className="zp-list">
            {shownTop.length > 0 && (
              <li className="zp-group" aria-hidden="true">
                {t.zonePicker.suggested}
              </li>
            )}
            {shownTop.map(row)}
            {shownTop.length > 0 && shownRest.length > 0 && (
              <li className="zp-group" aria-hidden="true">
                {t.zonePicker.allZones}
              </li>
            )}
            {shownRest.map(row)}
          </ul>
        )}
      </div>
    </Modal>
  );
}

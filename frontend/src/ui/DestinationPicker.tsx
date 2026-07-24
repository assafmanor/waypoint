// The trip-creation destination picker (ADR-0113 §1/§5): the free-text field
// becomes a Google Places pick at any granularity (city / region / country).
// Mirrors PlacePicker's sheet (reusing its `.pp-*` styling) but over the
// trip-agnostic `/destinations/*` core — it resolves a destination (point +
// country + derived zone) rather than persisting a trip Place. A "use as typed"
// fallback keeps creation unblocked when Google returns nothing useful.
import { useRef, useState } from 'react';
import type { PlacePrediction } from '@waypoint/shared';
import { useDestinationSearch } from '../lib/useDestinationSearch';
import { t } from '../i18n/he';
import { Icon } from './Icon';
import { StatusBanner } from './feedback';
import { Modal } from './primitives/Modal';
import './primitives/place-picker.css';

/** What a pick yields to the creation form. A resolved pick carries the derived
 *  zone + (for a multi-zone country) candidate zones; a "use as typed" carries
 *  only the name (no structured fields, zone stays the device default). */
export interface PickedDestination {
  name: string;
  googlePlaceId?: string;
  lat?: number;
  lng?: number;
  countryCode?: string;
  timezone?: string;
  candidateZones?: string[];
}

export function DestinationPicker({
  value,
  onPick,
}: {
  value: string;
  onPick: (destination: PickedDestination) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        id="dest"
        className="dest-trigger"
        onClick={() => setOpen(true)}
        aria-label={t.shell.newTrip.destLabel}
      >
        <span className={value ? '' : 'ghost'}>{value || t.shell.newTrip.destPlaceholder}</span>
        <Icon name="caret" dir="down" />
      </button>
      {open && (
        <DestinationPickerSheet
          onPick={(d) => {
            onPick(d);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function DestinationPickerSheet({
  onPick,
  onClose,
}: {
  onPick: (destination: PickedDestination) => void;
  onClose: () => void;
}) {
  const search = useDestinationSearch();
  const [busy, setBusy] = useState(false);
  const [pickFailed, setPickFailed] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const close = () => {
    search.reset();
    onClose();
  };

  const pickPrediction = async (prediction: PlacePrediction) => {
    setBusy(true);
    setPickFailed(false);
    try {
      const r = await search.resolve(prediction);
      onPick({
        name: r.name,
        googlePlaceId: r.googlePlaceId,
        lat: r.lat,
        lng: r.lng,
        countryCode: r.countryCode,
        timezone: r.timezone,
        candidateZones: r.candidateZones,
      });
    } catch {
      // Offline / 429 / upstream fault — keep the sheet open; the typed fallback stays.
      setPickFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const name = search.query.trim();

  return (
    <Modal
      variant="sheet"
      title={t.shell.newTrip.destPickerTitle}
      onClose={close}
      initialFocusRef={searchRef}
    >
      <div className="pp-sheet">
        <input
          ref={searchRef}
          className="pp-search"
          value={search.query}
          onChange={(e) => search.setQuery(e.target.value)}
          placeholder={t.shell.newTrip.destSearchPlaceholder}
          aria-label={t.shell.newTrip.destSearchPlaceholder}
        />

        {search.rateLimited && <StatusBanner tone="warn">{t.placePicker.rateLimited}</StatusBanner>}
        {(search.failed || pickFailed) && (
          <StatusBanner tone="warn">{t.placePicker.failed}</StatusBanner>
        )}

        <ul className="pp-results">
          {search.predictions.map((prediction) => (
            <li key={prediction.googlePlaceId}>
              <button
                type="button"
                className="pp-result"
                disabled={busy}
                onClick={() => pickPrediction(prediction)}
              >
                <span className="pp-primary">{prediction.primaryText}</span>
                {prediction.secondaryText && (
                  <span className="pp-secondary">{prediction.secondaryText}</span>
                )}
              </button>
            </li>
          ))}
        </ul>

        {name.length > 0 && (
          <button
            type="button"
            className="pp-name-only"
            disabled={busy}
            onClick={() => onPick({ name })}
          >
            {t.shell.newTrip.destUseTyped(name)}
          </button>
        )}

        <p className="pp-cost-footer">{t.placePicker.costFooter}</p>
      </div>
    </Modal>
  );
}

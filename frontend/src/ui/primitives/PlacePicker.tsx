// The single-select in-form Places picker shell (ADR-0110 §1 / ADR-0109 §12): a
// trigger showing the current place, opening a search sheet over the shared
// `usePlaceSearch` core. Every overlay is a `Modal` (never a hand-rolled portal,
// ADR-0090). The picker owns presentation only — session token, debounce, dedup,
// offline fallback, and soft-429 all live in the hook.
import { useRef, useState, type MouseEvent } from 'react';
import type { Place, PlacePrediction } from '@waypoint/shared';
import { usePlaceSearch } from '../../lib/usePlaceSearch';
import { useTrip } from '../../state/trip-state';
import { ICONS } from '../../constants';
import { t } from '../../i18n/he';
import { StatusBanner } from '../feedback/StatusBanner';
import { Modal } from './Modal';
import './place-picker.css';

export function PlacePicker({
  value,
  onChange,
  ariaLabel,
  placeholder,
}: {
  /** Current placeId (a trip Place, possibly a coordless name-only Place-lite). */
  value?: string;
  onChange: (placeId: string | undefined) => void;
  ariaLabel?: string;
  placeholder?: string;
}) {
  const { places } = useTrip();
  const [open, setOpen] = useState(false);
  const current = value ? places.find((p) => p.id === value) : undefined;

  return (
    <div className="place-picker">
      <button
        type="button"
        className={'pp-trigger' + (current ? ' filled' : '')}
        onClick={() => setOpen(true)}
        aria-label={ariaLabel ?? t.placePicker.open}
      >
        <span className="pp-trigger-icon" aria-hidden>
          📍
        </span>
        <span className="pp-trigger-label">
          {current ? current.name : (placeholder ?? t.placePicker.empty)}
        </span>
      </button>
      {current && (
        <button
          type="button"
          className="pp-clear"
          aria-label={t.placePicker.clear}
          onClick={() => onChange(undefined)}
        >
          ✕
        </button>
      )}
      {open && (
        <PlacePickerSheet
          current={current}
          onPick={(placeId) => {
            onChange(placeId);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * The `＋ מיקום` trigger for a row that has no usable place — dashed and muted,
 * deliberately NOT the teal `נווט` action, because there is nowhere to navigate
 * yet: it is a provisional invitation, not a location.
 *
 * Lives beside the sheet it opens, and is shared by every surface that notices a
 * place is missing: the Map's coordless Place-lite row (ADR-0121 §8) and a
 * placeless booking's `מיקום` fact. It was the Map's one-off `.map-addbtn` until
 * the second surface needed it (rule 8) — a third is now a one-line import, not a
 * third copy of the same dashed pill.
 */
export function AddLocationButton({
  onClick,
  className,
}: {
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  /** Extra modifier class for a host that needs its own spacing. */
  className?: string;
}) {
  return (
    <button
      type="button"
      className={'pp-addbtn' + (className ? ` ${className}` : '')}
      onClick={onClick}
    >
      <span aria-hidden="true">{ICONS.add}</span> {t.placePicker.addLocation}
    </button>
  );
}

/** The search sheet, also used standalone by the `＋ מיקום` enrich affordance
 *  above (ADR-0110 §1): opened on a coordless Place-lite, a pick enriches that
 *  row in place; opened with no `current` it mints a place for a row that had
 *  none. Exported so a caller can drive it with its own trigger instead of the
 *  in-form `PlacePicker` trigger. */
export function PlacePickerSheet({
  current,
  onPick,
  onClose,
}: {
  current: Place | undefined;
  onPick: (placeId: string) => void;
  onClose: () => void;
}) {
  // A coordless Place-lite in the current field is enriched in place on a pick
  // (adopts googlePlaceId/coords/timezone) rather than minting a duplicate (ADR-0110 §1).
  const enrichPlaceId = current && current.googlePlaceId == null ? current.id : undefined;
  const search = usePlaceSearch(enrichPlaceId);
  const [busy, setBusy] = useState(false);
  const [pickFailed, setPickFailed] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const close = () => {
    search.reset();
    onClose();
  };

  const pick = async (run: () => Promise<string>) => {
    setBusy(true);
    setPickFailed(false);
    try {
      onPick(await run());
    } catch {
      // Offline, a 429, or an upstream fault — keep the sheet open; the name-only
      // fallback stays available so the user is never blocked (ADR-0110 §1).
      setPickFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const name = search.query.trim();

  return (
    <Modal variant="sheet" title={t.placePicker.title} onClose={close} initialFocusRef={searchRef}>
      <div className="pp-sheet">
        <input
          ref={searchRef}
          className="pp-search"
          value={search.query}
          onChange={(e) => search.setQuery(e.target.value)}
          placeholder={t.placePicker.searchPlaceholder}
          aria-label={t.placePicker.searchPlaceholder}
        />

        {search.rateLimited && <StatusBanner tone="warn">{t.placePicker.rateLimited}</StatusBanner>}
        {(search.failed || pickFailed) && (
          <StatusBanner tone="warn">{t.placePicker.failed}</StatusBanner>
        )}

        <ul className="pp-results">
          {search.predictions.map((prediction: PlacePrediction) => {
            const existing = search.alreadyInTrip(prediction);
            return (
              <li key={prediction.googlePlaceId}>
                <button
                  type="button"
                  className="pp-result"
                  disabled={busy}
                  onClick={() => pick(() => search.pick(prediction).then((p) => p.id))}
                >
                  <span className="pp-primary">{prediction.primaryText}</span>
                  {prediction.secondaryText && (
                    <span className="pp-secondary">{prediction.secondaryText}</span>
                  )}
                  {existing && <span className="pp-chip">{t.placePicker.alreadyInTrip}</span>}
                </button>
              </li>
            );
          })}
        </ul>

        {name.length > 0 && (
          <button
            type="button"
            className="pp-name-only"
            disabled={busy}
            onClick={() => pick(() => search.saveNameOnly(name))}
          >
            {t.placePicker.saveNameOnly(name)}
          </button>
        )}

        <p className="pp-cost-footer">{t.placePicker.costFooter}</p>
      </div>
    </Modal>
  );
}

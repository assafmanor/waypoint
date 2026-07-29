// The single-select in-form Places picker FIELD (ADR-0110 §1 / ADR-0109 §12): a trigger
// showing the current place, which sends an errand to the Map tab to change it.
//
// **It used to own a search sheet as well, and that sheet is gone** (ADR-0134 §9). Choosing
// a place is choosing it on a map — the tab answers both halves of the query, the trip's own
// places free and offline from the first character and Google's for everything else — so a
// second search surface here was the parallel copy rule 8 exists to prevent. What is left is
// the display and the launcher, which is all a form ever needed from it.
import { type MouseEvent } from 'react';
import { useTrip } from '../../state/trip-state';
import { ICONS } from '../../constants';
import { t } from '../../i18n/he';
import './place-picker.css';

export function PlacePicker({
  value,
  onChange,
  ariaLabel,
  placeholder,
  onFind,
}: {
  /** Current placeId (a trip Place, possibly a coordless name-only Place-lite). */
  value?: string;
  onChange: (placeId: string | undefined) => void;
  ariaLabel?: string;
  placeholder?: string;
  /** **Send an errand to the Map to choose one** (ADR-0134 §1). Required, and supplied by
   *  the FORM rather than by this field, because only the form can write the draft the
   *  errand has to carry — this field has no idea what else is half-typed above it.
   *
   *  Its callers hold a `useStartPlaceErrand()` that is `null` outside the trip shell, and
   *  pass a function that then does nothing. That is not a degraded mode, it is an
   *  unreachable one: every surface that authors a place — both forms, on all five hosts —
   *  renders under `MapScopeProvider`, and a place field with no trip to pick in has no
   *  meaning anyway. Naming the invariant here is what the retired fallback was standing
   *  in for. */
  onFind: () => void;
}) {
  const { places } = useTrip();
  const current = value ? places.find((p) => p.id === value) : undefined;

  return (
    <div className="place-picker">
      <button
        type="button"
        className={'pp-trigger' + (current ? ' filled' : '')}
        onClick={onFind}
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
 *
 * It borrows the in-form picker's own empty label rather than carrying its own, so
 * one action reads one way on every surface. It also had to: the label was `מיקום`,
 * which is ALSO what the booking detail's location fact calls itself, so a placeless
 * row read `מיקום · לא הוגדר מיקום · ＋ מיקום`.
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
      <span aria-hidden="true">{ICONS.add}</span> {t.placePicker.empty}
    </button>
  );
}

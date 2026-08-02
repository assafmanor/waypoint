// **A journey's two endpoints, and the one control that reverses them** (ADR-0154 §3).
//
// Extracted from `BookingSheet`, which owned this markup inline while it was the only
// surface that could author a route. `EventForm` is the second host, and the reason the
// extraction happened rather than a copy: a route-shaped booking authored from the event
// form used to send a single `placeId` and get a 400 back (§1), and the fix is this field
// appearing there too. `ui/HostNotes.tsx` made exactly this call three days earlier — one
// host is fine inline, the second is when it becomes a component.
//
// **The swap is new to both.** An existing transport event carries one place and cannot
// say which end of the journey it is, so it lands in the origin and one tap moves it —
// no errand, no second trip to the Map. `BookingSheet` never had it either: correcting a
// route entered backwards cost two errands.
//
// Its glyph is `swap`, which `Icon` draws as a VERTICAL pair, and here that is the literal
// motion rather than a compromise — these two pickers are stacked. (That icon's own comment
// warns a horizontal pair reads backwards in RTL; this layout never has to test the rule.)
//
// `ui/domain/`: presentational, every value via props. It composes `PlacePicker`, which
// resolves its own name from trip-state — that is that primitive's existing contract, not
// something added here.
import { PlacePicker } from '../primitives/PlacePicker';
import { Icon } from '../Icon';
import { t } from '../../i18n/he';
import './route-field.css';

/** Which end an errand is for. The names are the `Booking` field names on purpose: the
 *  errand channel assigns its result with `draft[target.field]`, so a draft key, an errand
 *  field and the entity column are one string end to end (ADR-0134 §2). */
export type RouteEnd = 'fromPlaceId' | 'toPlaceId';

export interface RouteFieldProps {
  from?: string;
  to?: string;
  /** Both ends at once, so a swap is one call and one render rather than two. */
  onChange: (next: { from?: string; to?: string }) => void;
  /** Start a place errand for one end. The host writes the draft — only it knows what
   *  else is half-typed — and the label says which end, so the Map's banner can too. */
  onFind: (end: RouteEnd, sideLabel: string) => void;
  /** Replaces the default "real places feed the map and the zones" note. `EventForm`
   *  passes its own, because there both ends are optional and that is worth saying. */
  hint?: string;
}

export function RouteField({ from, to, onChange, onFind, hint }: RouteFieldProps) {
  // Offered only with something to exchange — a swap over two empty slots is a control
  // that cannot do anything, which ADR-0150 §8 makes a `disabled` primary's rule and is
  // the same judgement here: absent beats inert.
  const canSwap = !!(from || to);

  return (
    <>
      <div className="route-field">
        {/* TWO FIELDS, TWO ERRANDS — this is why `target.field` is not optional
            (ADR-0134 §2): without it a successful return could assign the right
            place to the wrong end of the journey. */}
        <PlacePicker
          value={from}
          onChange={(id) => onChange({ from: id, to })}
          ariaLabel={t.index.form.originLabel}
          placeholder={t.index.form.originShort}
          onFind={() => onFind('fromPlaceId', t.index.form.originLabel)}
        />
        {canSwap && (
          <button
            type="button"
            className="route-field-swap"
            onClick={() => onChange({ from: to, to: from })}
          >
            <Icon name="swap" /> {t.index.form.swapRoute}
          </button>
        )}
        <PlacePicker
          value={to}
          onChange={(id) => onChange({ from, to: id })}
          ariaLabel={t.index.form.destLabel}
          placeholder={t.index.form.destShort}
          onFind={() => onFind('toPlaceId', t.index.form.destLabel)}
        />
      </div>
      <div className="route-field-hint">
        <Icon name="pin" /> {hint ?? t.index.form.routeHint}
      </div>
    </>
  );
}

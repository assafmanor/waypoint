// **A journey's two endpoints, and the one control that reverses them** (ADR-0154 §3) —
// and, since ADR-0163 §1, a HIRE's two counters, which are the same two columns asking a
// different question. `shape` picks between them; see that prop and `HireEndsField`.
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
import { useState } from 'react';
import { PlacePicker } from '../primitives/PlacePicker';
import { ChoiceGrid } from '../primitives/ChoiceGrid';
import { Icon } from '../Icon';
import { MAX_ROUTE_STOPS } from '../../constants';
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
  /** **The stops between the two ends** (ADR-0159) — a layover, a change of train.
   *  Absent (not `[]`) means this host does not author them at all, which is the
   *  `EventForm` case: one event cannot be a sequence of journeys, so it gets no
   *  control for one. Present means the host will write a booking per leg. */
  stops?: (string | undefined)[];
  onStopsChange?: (next: (string | undefined)[]) => void;
  /** The errand for one stop. Separate from `onFind` because a stop is addressed by
   *  INDEX, not by a `Booking` column: the two are genuinely different targets. */
  onFindStop?: (index: number, sideLabel: string) => void;
  /** **Which question the two ends answer** (ADR-0163 §1). `'journey'` is the original:
   *  מוצא → יעד, reversible, optionally with stops. `'hire'` is a car: the ends are two
   *  COUNTERS, usually the same one, so it asks איסוף and then whether the return is
   *  elsewhere — and it has no swap, because a pick-up and a return cannot trade places.
   *
   *  A variant rather than a sibling component, for what the two genuinely share: two
   *  `PlacePicker`s over the same two `Booking` columns, with the same errand plumbing
   *  that ADR-0134 §2 made per-field. A copy would fork that. */
  shape?: 'journey' | 'hire';
}

export function RouteField({
  from,
  to,
  onChange,
  onFind,
  hint,
  stops,
  onStopsChange,
  onFindStop,
  shape = 'journey',
}: RouteFieldProps) {
  if (shape === 'hire') {
    return <HireEndsField from={from} to={to} onChange={onChange} onFind={onFind} />;
  }
  return (
    <JourneyField
      from={from}
      to={to}
      onChange={onChange}
      onFind={onFind}
      hint={hint}
      stops={stops}
      onStopsChange={onStopsChange}
      onFindStop={onFindStop}
    />
  );
}

/** **A hire's two counters** (ADR-0163 §1). One picker, then a question — and the second
 *  picker only if the answer is "somewhere else".
 *
 *  The toggle is LOCAL state seeded from the props, not derived on every render, and that
 *  is the one subtle thing here: "same place" writes `to = from`, so a derived reading
 *  (`to === from`) would flip straight back to "same" the moment the user chose
 *  "elsewhere" and the return picker was still empty. The seed is what lets the field
 *  hold an answer the data cannot yet express.
 *
 *  Storing `to = from` rather than leaving it blank is deliberate: every existing reader of
 *  these columns — the map pins, the per-end zones, the server's `assertPlaceShape` — then
 *  needs no special case for a hire, and `undefined` would be indistinguishable from
 *  "not answered yet". */
function HireEndsField({
  from,
  to,
  onChange,
  onFind,
}: Pick<RouteFieldProps, 'from' | 'to' | 'onChange' | 'onFind'>) {
  const [returnsElsewhere, setReturnsElsewhere] = useState(() => !!to && to !== from);

  const setPickup = (id: string | undefined) =>
    // While the return is the same counter it FOLLOWS the pick-up: changing where you
    // collect the car changes where you bring it back, with no second tap.
    onChange({ from: id, to: returnsElsewhere ? to : id });

  const chooseSame = (elsewhere: boolean) => {
    setReturnsElsewhere(elsewhere);
    // Leaving "elsewhere" re-points the return at the pick-up; entering it clears the
    // slot so the picker opens empty rather than pre-filled with the pick-up's name.
    onChange({ from, to: elsewhere ? undefined : from });
  };

  return (
    <>
      <div className="route-field">
        <PlacePicker
          value={from}
          onChange={setPickup}
          ariaLabel={t.index.form.pickupPlaceLabel}
          placeholder={t.index.form.pickupPlaceShort}
          onFind={() => onFind('fromPlaceId', t.index.form.pickupPlaceLabel)}
        />
      </div>
      <div className="route-field-return">
        <ChoiceGrid
          layout="pills"
          options={[
            // No glyph on either: this is a question about a place, and ChoiceGrid's
            // empty string is the documented way to omit the slot (as the direction
            // control does for the same reason).
            { value: 'same', icon: '', label: t.index.form.returnSame },
            { value: 'other', icon: '', label: t.index.form.returnElsewhere },
          ]}
          value={returnsElsewhere ? 'other' : 'same'}
          onChange={(v) => chooseSame(v === 'other')}
          ariaLabel={t.index.form.returnWhereLabel}
        />
        {returnsElsewhere && (
          <div className="route-field">
            <PlacePicker
              value={to}
              onChange={(id) => onChange({ from, to: id })}
              ariaLabel={t.index.form.dropoffPlaceLabel}
              placeholder={t.index.form.dropoffPlaceShort}
              onFind={() => onFind('toPlaceId', t.index.form.dropoffPlaceLabel)}
            />
          </div>
        )}
      </div>
    </>
  );
}

function JourneyField({
  from,
  to,
  onChange,
  onFind,
  hint,
  stops,
  onStopsChange,
  onFindStop,
}: RouteFieldProps) {
  // Offered only with something to exchange — a swap over two empty slots is a control
  // that cannot do anything, which ADR-0150 §8 makes a `disabled` primary's rule and is
  // the same judgement here: absent beats inert.
  const canSwap = !!(from || to);
  // A stop is authored only where the host asked for them, and the ceiling is a named
  // number rather than an open list: past a few, this is an itinerary and not a journey.
  const authorsStops = !!stops && !!onStopsChange;
  const setStop = (index: number, value: string | undefined) =>
    onStopsChange?.(
      // **Clearing a stop REMOVES it.** An empty stop is not a state worth keeping —
      // it names no place, so it can neither be flown to nor scheduled — which is why
      // the picker's own `✕` is the only removal control this field has.
      value === undefined
        ? stops!.filter((_, i) => i !== index)
        : stops!.map((s, i) => (i === index ? value : s)),
    );

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
            // With stops it reverses the WHOLE sequence, which is exactly what its
            // label already promises: the direction of the journey, not of two of its
            // points. So the control neither moves nor gains a second meaning.
            onClick={() => {
              onChange({ from: to, to: from });
              if (stops) onStopsChange?.([...stops].reverse());
            }}
          >
            <Icon name="swap" /> {t.index.form.swapRoute}
          </button>
        )}
        {stops?.map((stop, i) => (
          // Indented, because a stop is a WAYPOINT and not an endpoint: a three-row
          // stack of equals reads as three destinations. Same thing `.cluster-kids`
          // says with an indent about the rows that belong to the one above them.
          //
          // **`removable` is the fix for a shipped defect** (ADR-0203 §4): the picker's ✕ is
          // this field's only way to remove a stop, and it used to render only with a place
          // in it — so a stop the `＋` had just added could not be removed at all, and its
          // one other control launches an errand that unmounts the sheet. The ADR-0159 §5
          // decision ("clearing IS removing") is unchanged; what changes is that the control
          // it names is now actually there.
          <PlacePicker
            key={i}
            className="place-picker-stop"
            value={stop}
            onChange={(id) => setStop(i, id)}
            ariaLabel={t.index.form.stopLabel}
            placeholder={t.index.form.stopShort}
            onFind={() => onFindStop?.(i, t.index.form.stopLabel)}
            removable
            clearLabel={t.placePicker.removeStop}
          />
        ))}
        <PlacePicker
          value={to}
          onChange={(id) => onChange({ from, to: id })}
          ariaLabel={t.index.form.destLabel}
          placeholder={t.index.form.destShort}
          onFind={() => onFind('toPlaceId', t.index.form.destLabel)}
        />
      </div>
      {authorsStops && stops!.length < MAX_ROUTE_STOPS && (
        <button
          type="button"
          className="route-field-add"
          onClick={() => onStopsChange!([...stops!, undefined])}
        >
          <Icon name="plus" /> {t.index.form.addStop}
        </button>
      )}
      <div className="route-field-hint">
        <Icon name="pin" /> {hint ?? t.index.form.routeHint}
      </div>
    </>
  );
}

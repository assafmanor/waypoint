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
import { RouteLabel } from '../RouteLabel';
import { useTrip } from '../../state/trip-state';
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
  /** **The way home's OWN stops, when it has them** (ADR-0203 §6) — `null` while the return
   *  is still the outbound reversed, and absent entirely when this host authors no return at
   *  all. Reported from the field: a round trip's stops "could be different stops and/or a
   *  different number of stops", and after choosing round trip there was no way to say so.
   *
   *  **The two ENDS are not offered here**, and that is the scope decision: you fly home from
   *  where you landed, so the way back's endpoints are the outbound's two, swapped. Drawing
   *  pickers for them would offer an edit that writes to the outbound. An open-jaw trip is a
   *  different feature (see the ADR). */
  returnStops?: (string | undefined)[] | null;
  /** A LIST edit, or `null` to return the way back to a mirror. Never used to switch INTO
   *  an independent route — that is `onReturnDiverge`, and conflating the two made clearing
   *  the last stop look identical to "give me my own route", so the host restored the list the
   *  user had just emptied. Two intents, two callbacks. */
  onReturnStopsChange?: (next: (string | undefined)[] | null) => void;
  /** Give the way back a route of its own. The HOST decides what it opens with — the
   *  outbound reversed the first time, whatever was typed before if there is any. */
  onReturnDiverge?: () => void;
  onFindReturnStop?: (index: number, sideLabel: string) => void;
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
  returnStops,
  onReturnStopsChange,
  onReturnDiverge,
  onFindReturnStop,
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
      returnStops={returnStops}
      onReturnStopsChange={onReturnStopsChange}
      onReturnDiverge={onReturnDiverge}
      onFindReturnStop={onFindReturnStop}
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

/** **The stop rows and their `＋`, once** — used by the outbound and by the way back
 *  (ADR-0203 §6). Extracted rather than copied: the two lists differ only in which state
 *  they write to, and a second hand-built stack is how the removal rule, the indent and the
 *  `MAX_ROUTE_STOPS` ceiling drift apart. `PlacePicker`'s own `✕` is the only removal
 *  control either list has (ADR-0159 §5, fixed by ADR-0203 §4's `removable`). */
function StopRows({
  stops,
  onStopsChange,
  onFindStop,
}: {
  stops: (string | undefined)[];
  onStopsChange: (next: (string | undefined)[]) => void;
  onFindStop?: (index: number, sideLabel: string) => void;
}) {
  const setStop = (index: number, value: string | undefined) =>
    onStopsChange(
      // **Clearing a stop REMOVES it.** An empty stop is not a state worth keeping — it
      // names no place, so it can neither be flown to nor scheduled.
      value === undefined
        ? stops.filter((_, i) => i !== index)
        : stops.map((s, i) => (i === index ? value : s)),
    );
  return (
    <>
      {stops.map((stop, i) => (
        // Indented, because a stop is a WAYPOINT and not an endpoint: a three-row stack of
        // equals reads as three destinations. Same thing `.cluster-kids` says with an indent.
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
    </>
  );
}

/** The `＋ עצירת ביניים` button, withheld at the ceiling. A named number rather than an open
 *  list: past a few, this is an itinerary and not a journey. */
function AddStop({
  stops,
  onStopsChange,
}: {
  stops: (string | undefined)[];
  onStopsChange: (next: (string | undefined)[]) => void;
}) {
  if (stops.length >= MAX_ROUTE_STOPS) return null;
  return (
    <button
      type="button"
      className="route-field-add"
      onClick={() => onStopsChange([...stops, undefined])}
    >
      <Icon name="plus" /> {t.index.form.addStop}
    </button>
  );
}

/** **The way home, as its own route** (ADR-0203 §6).
 *
 *  Opens as a derived SENTENCE and not a control: most round trips do come back the same
 *  way, so the common case costs one line and no second list. Choosing `דרך אחרת` seeds the
 *  list from the outbound reversed — you edit a route rather than start from nothing, which
 *  is §6's own wording — and the two ends stay statements, because they are the outbound's
 *  two swapped.
 *
 *  **Pills, not a text offer**, and drawing both is what settled it: the question sits
 *  directly under the direction control, which is also pills, so "one way or round trip?" and
 *  "same way or a different one?" read as a pair. And a text offer's revert has to say
 *  `חזרה לאותה דרך`, where `חזרה` is already the name of this section — one word for two
 *  things in adjacent lines. */
function ReturnRoute({
  from,
  to,
  returnStops,
  onReturnStopsChange,
  onReturnDiverge,
  onFindReturnStop,
}: {
  from?: string;
  to?: string;
  returnStops: (string | undefined)[] | null;
  onReturnStopsChange: (next: (string | undefined)[] | null) => void;
  onReturnDiverge: () => void;
  onFindReturnStop?: (index: number, sideLabel: string) => void;
}) {
  // `RouteLabel` states NAMES, and this field is handed ids — so the names are resolved the
  // same way `PlacePicker` resolves its own, which is that primitive's existing contract
  // rather than a prop threaded down from the host.
  const { places } = useTrip();
  const nameOf = (id?: string) => (id ? places.find((p) => p.id === id)?.name : undefined);
  const own = returnStops !== null;
  return (
    <div className="rf-back">
      {/* `roundTrip`, which is the icon `RouteLabel` already draws for a mirrored pair — and
          the right one here for the same reason its own note gives: it is symmetric, so it
          claims no direction for a locale to flip. There is no `flag` in `Icon`, and inventing
          one for a section head would be a glyph nobody decided. */}
      <div className="rf-back-head">
        <Icon name="roundTrip" />
        <span>{t.index.form.legBack}</span>
      </div>
      <ChoiceGrid
        layout="pills"
        options={[
          { value: 'same', icon: '', label: t.index.form.returnSameWay },
          { value: 'own', icon: '', label: t.index.form.returnOtherWay },
        ]}
        value={own ? 'own' : 'same'}
        // Seeded from the outbound reversed, so `דרך אחרת` opens on a route to edit. Going
        // back to `אותה דרך` passes null; the host keeps what was typed, so this is not a
        // destructive tap and no dialog has to ask.
        onChange={(v) => (v === 'own' ? onReturnDiverge() : onReturnStopsChange(null))}
        ariaLabel={t.index.form.returnRouteAria}
      />
      {own ? (
        <>
          {/* The two ends, stated. `RouteLabel` rather than a hand-built line: it owns the
              `<bdi>` per end and draws its arrow as `NavArrow`, which is correct in RTL —
              a literal `←` is `Bidi_Mirrored` and flips (ADR-0118). */}
          <div className="rf-back-ends">
            <RouteLabel from={nameOf(to)} to={nameOf(from)} />
          </div>
          <div className="route-field">
            <StopRows
              stops={returnStops}
              onStopsChange={onReturnStopsChange}
              onFindStop={onFindReturnStop}
            />
          </div>
          <AddStop stops={returnStops} onStopsChange={onReturnStopsChange} />
        </>
      ) : (
        <div className="rf-back-same">{t.index.form.returnMirrors}</div>
      )}
    </div>
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
  returnStops,
  onReturnStopsChange,
  onReturnDiverge,
  onFindReturnStop,
}: RouteFieldProps) {
  // Offered only with something to exchange — a swap over two empty slots is a control
  // that cannot do anything, which ADR-0150 §8 makes a `disabled` primary's rule and is
  // the same judgement here: absent beats inert.
  const canSwap = !!(from || to);
  // A stop is authored only where the host asked for them, and the ceiling is a named
  // number rather than an open list: past a few, this is an itinerary and not a journey.
  const authorsStops = !!stops && !!onStopsChange;
  /** Whether this host authors the way back at all — `EventForm` does not (one event cannot
   *  be a journey), and neither does a one-way. */
  const authorsReturn = returnStops !== undefined && !!onReturnStopsChange;

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
              // A mirrored way back follows by construction and needs no write. An
              // INDEPENDENT one is a route somebody typed, so reversing the outbound must
              // not silently rewrite it — the two stopped being the same list (§6).
            }}
          >
            <Icon name="swap" /> {t.index.form.swapRoute}
          </button>
        )}
        {stops && onStopsChange && (
          <StopRows stops={stops} onStopsChange={onStopsChange} onFindStop={onFindStop} />
        )}
        <PlacePicker
          value={to}
          onChange={(id) => onChange({ from, to: id })}
          ariaLabel={t.index.form.destLabel}
          placeholder={t.index.form.destShort}
          onFind={() => onFind('toPlaceId', t.index.form.destLabel)}
        />
      </div>
      {authorsStops && <AddStop stops={stops!} onStopsChange={onStopsChange!} />}
      {authorsReturn && (
        <ReturnRoute
          from={from}
          to={to}
          returnStops={returnStops!}
          onReturnStopsChange={onReturnStopsChange!}
          onReturnDiverge={onReturnDiverge!}
          onFindReturnStop={onFindReturnStop}
        />
      )}
      <div className="route-field-hint">
        <Icon name="pin" /> {hint ?? t.index.form.routeHint}
      </div>
    </>
  );
}

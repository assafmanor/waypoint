// **FOUR SOURCES, ONE FORM** (ADR-0147 §4). A long press on the canvas, a tap on one of
// Google's own sights, a search result's add, and renaming a place the trip already has all
// render THIS — because they are one act: **a place's NAME is the user's.** Naming and
// renaming differ only in whether the field starts empty.
//
// And it is not a new policy. `places.service.ts`'s `enrichExisting` writes
// `googlePlaceId`/`address`/`lat`/`lng`/`timezone` and **deliberately not `name`** (nor
// `icon`), so a user-authored name already survives Google enriching the row. This form is
// the missing way IN to a rule the backend has always kept.
//
// **Presentational, and every varying thing is data** — which is the whole claim the design
// rests on: only `title`, what is prefilled, the hint and the confirm's word differ between
// the four, so a fifth source is a new `MapPlaceFormSpec` and not a new flow. No `state/`
// import, no screen import (the `ui/domain/` contract): the host owns obtaining the place,
// deciding where it lands and resetting the form.
//
// **The host resets it by `key`**, not by an effect. Every field here is local state seeded
// from the spec, so a new draft must be a new component instance — `key`ing the element on the
// draft's identity is how a form built out of `useState` is reset without a synchronising
// effect, and it is the only reason there is no `useEffect` in this file.
import { useId, useState } from 'react';
import { iconForCategory, type EventCategory } from '@waypoint/shared';
import { useDerivedField } from '../../lib/useDerivedField';
import { placeGlyph } from '../../lib/map-pins';
import { EVENT_CATEGORY_OPTIONS } from '../../lib/category-options';
import { t } from '../../i18n/he';
import { Icon } from '../Icon';
import { IconPicker } from '../IconPicker';
import { ChoiceGrid } from '../primitives/ChoiceGrid';
import { Field } from '../primitives/Field';

/** What the four sources disagree about, and nothing else. Built by the host, because only it
 *  knows whether the trip already owns the place and what the confirm is going to do. */
export interface MapPlaceFormSpec {
  /** The card's heading — and the name field's real `<label>`, because it is the question the
   *  field answers ("מה יש כאן?"). One element, both jobs: a placeholder cannot be the label,
   *  since it disappears the moment you type, which is exactly when "what is this field" is
   *  still being asked. */
  title: string;
  /** The name to open with. **Empty for a long press** (nothing is known about the spot) and
   *  **empty for a tapped sight** (naming it before the confirm is a Place Details call, i.e.
   *  paying to browse — the exact spend that blocked Phase 6a for three weeks). Prefilled
   *  wherever a name is already in our hand, so the third tap is only to correct it. */
  name: string;
  /** The line under the fields: the point for a bare coordinate, the address once there is
   *  one. Confirmation, not instruction — the card sits on the spot and the camera framed it. */
  meta: string;
  /** A quiet note under the field: who is going to fill the name, or that this one is free.
   *  `Field`'s hint slot, whose stated job is exactly "what leaving this empty costs". */
  hint?: string;
  /** The glyph a human has already chosen for this place. **Its presence is
   *  `initiallyTouched`**, which is the whole of rename's special-casing: a place that already
   *  carries a glyph counts as chosen, so tapping a category will not stomp it. */
  icon?: string;
  /** The category the referencing entities agree on, so the pills open where the place already
   *  is rather than at nothing. */
  category?: EventCategory;
  /** The FREE `place_id` deep link, present only where there is something to vet before
   *  spending (ADR-0115 §2). A dropped pin needs none — you chose the spot. */
  vetUrl?: string;
  /** The confirm's word: an add, or a save. */
  confirmLabel: string;
  /** Whether an empty name may be submitted. **True only for a tapped sight we have not paid
   *  to name**, whose confirm buys Google's label — everywhere else an empty name would write
   *  a nameless place. */
  nameOptional?: boolean;
}

export interface MapPlaceFormValue {
  /** Trimmed. Empty only where `nameOptional` allowed it, meaning "let Google name it". */
  name: string;
  /** The glyph in force — derived from the category until a human picked one. */
  icon: string;
  /** **Whether a human actually chose that glyph.** The host writes `Place.icon` only when this
   *  is true, and that is not a nicety: a glyph the CATEGORY derived must not be stored, or the
   *  place would stop following its category from then on — which is precisely the defect
   *  `chosenIcon` exists to undo one layer down (a stored default `📌` shadowing ✈️). `touched`
   *  is exposed by `useDerivedField` for exactly this call-site policy. */
  iconTouched: boolean;
  /** The category, or `undefined` if none was ever chosen or inherited. */
  category?: EventCategory;
}

export function MapPlaceForm({
  spec,
  busy,
  error,
  onConfirm,
  onCancel,
  onValueChange,
}: {
  spec: MapPlaceFormSpec;
  /** A write is in flight: the confirm is disabled rather than removed, because it is about
   *  to come back. */
  busy?: boolean;
  /** The write failed. Rendered in `Field`'s error slot, which carries the `role="alert"`
   *  that announces it — so the message is not a second mechanism beside the label and hint. */
  error?: string | null;
  onConfirm: (value: MapPlaceFormValue) => void;
  onCancel: () => void;
  /** **The value in force changed** — so the host can draw it. The canvas marks the spot under
   *  this form with a pin in the CATEGORY's hue, which is the visible payoff of the form
   *  carrying a category at all: on a surface whose whole grammar is "colour = category", a
   *  restaurant's pin coming out `leisure` green is wrong information rather than absent
   *  information. The form stays the owner of its fields; this only reports.
   *
   *  Fired from the two handlers that change a value, never from an effect: a render-phase
   *  report would put the host's state update inside this component's render. */
  onValueChange?: (value: MapPlaceFormValue) => void;
}) {
  const nameId = useId();
  const [name, setName] = useState(spec.name);
  const [category, setCategory] = useState<EventCategory | undefined>(spec.category);
  // **A CATEGORY DRIVES THE ICON UNTIL A HUMAN SAYS OTHERWISE**, through the one mechanism
  // that already does this job — `useDerivedField`, extracted because five hand-rolled
  // `*Touched` pairs said the same thing five times. The starting glyph is the place's own
  // resolution (`placeGlyph`), so the chip opens showing what the pin already shows.
  const icon = useDerivedField(placeGlyph({ icon: spec.icon }, spec.category), Boolean(spec.icon));

  const report = (next: Partial<MapPlaceFormValue>) =>
    onValueChange?.({
      name: name.trim(),
      icon: icon.value,
      iconTouched: icon.touched,
      category,
      ...next,
    });

  const trimmed = name.trim();
  const submittable = !busy && (trimmed !== '' || spec.nameOptional === true);
  const confirm = () => {
    if (!submittable) return;
    onConfirm({ name: trimmed, icon: icon.value, iconTouched: icon.touched, category });
  };

  return (
    <div className="map-draft">
      <Field label={spec.title} htmlFor={nameId} hint={spec.hint} error={error}>
        <div className="map-draft-name">
          {/* THE APP'S OWN PICKER, not a row of chips at "its own scale" — a single 44px chip
              whose panel FLOATS over the card rather than expanding it, which is what the
              shipped `.icon-panel` already does. `AddIdea` uses the same control for the same
              object, so this is the second host and not a second picker. */}
          <IconPicker
            icon={icon.value}
            onChange={(glyph) => {
              icon.set(glyph);
              report({ icon: glyph, iconTouched: true });
            }}
            ariaLabel={t.map.make.iconLabel}
          />
          {/* **NO `dir`, which is what every other text field in this app does** — and it is not
              a shortcut, it is the only thing that reads correctly. `dir="auto"` on an INPUT
              sniffs its VALUE, and an empty field has no strong character to sniff, so it falls
              back to LTR and left-anchors the Hebrew placeholder (`שם המקום`). Inheriting the
              page's RTL puts the placeholder and the caret where a Hebrew speaker starts
              typing, and a Latin name typed into it still reads left-to-right because bidi
              resolves the RUN, not the field (ADR-0118 — whose rule is against `dir="ltr"`,
              and whose "or no `dir`" is this). */}
          <input
            id={nameId}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t.map.make.namePlaceholder}
            autoFocus
            enterKeyHint="done"
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirm();
            }}
          />
        </div>
      </Field>
      {/* ALL NINE `EventCategory` values, from the ONE options list `EventForm` and the shelf's
          add already read (`EVENT_CATEGORY_OPTIONS`) — so `other` (כללי) is present and last
          because the enum puts it there, not because this surface chose an order.
          **Here the category is not invisible metadata: it is the pin's HUE.** That is why the
          map differs from session 76's recorded rejection of a category picker on quick-add
          (ADR-0109 §11) — without a choice a restaurant's pin comes out `leisure` green, which
          on a surface whose entire grammar is "colour = category" is wrong information rather
          than absent information. */}
      <div className="category-pills">
        <ChoiceGrid
          layout="pills"
          options={EVENT_CATEGORY_OPTIONS}
          value={category}
          onChange={(next) => {
            setCategory(next);
            // `redrive` answers with the value now in force — derived, or whatever a human
            // already set — so the report reads the truth rather than a `useState` React has
            // not flushed yet. That return value is exactly why the hook has one.
            report({ category: next, icon: icon.redrive(iconForCategory(next)) });
          }}
          ariaLabel={t.map.make.categoryLabel}
        />
      </div>
      <p className="map-draft-meta" dir="auto">
        {spec.meta}
      </p>
      <div className="map-draft-acts">
        {spec.vetUrl && (
          <a
            className="map-res-out"
            href={spec.vetUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t.map.research.openInGoogle}
            title={t.map.research.openInGoogle}
          >
            <Icon name="external" />
          </a>
        )}
        {/* `.map-gbtn` is already this screen's neutral button (the geo prompt's dismiss), so
            the cancel is that rather than a class minted for one card. */}
        <button type="button" className="map-gbtn" onClick={onCancel}>
          {t.map.make.cancel}
        </button>
        <button type="button" className="map-addmaybe" disabled={!submittable} onClick={confirm}>
          {spec.confirmLabel}
        </button>
      </div>
    </div>
  );
}

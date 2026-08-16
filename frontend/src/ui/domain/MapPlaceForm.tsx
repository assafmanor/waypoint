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
import { MAX_PLACE_NICKNAME_LENGTH, type EventCategory } from '@waypoint/shared';
import { useDerivedField } from '../../lib/useDerivedField';
import { placeGlyph } from '../../lib/map-pins';
import { t } from '../../i18n/he';
import { Icon } from '../Icon';
import { IconPicker } from '../IconPicker';
import { CategoryField } from '../primitives/CategoryField';
import { Field } from '../primitives/Field';
import { NoteComposer, useNoteComposer } from '../NoteComposer';
import { useFormErrors } from '../primitives/useFormErrors';

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
  /** **The ONE quiet line under the field**, in `Field`'s hint slot — whichever of the two
   *  things this source has to say is worth a line:
   *
   *  - a dropped pin has only its **point**, which is confirmation that the pin fell where the
   *    finger was (there is no address on purpose: a reverse geocode is paid, ADR-0147 §7);
   *  - a tapped sight says **who fills the name**, and its coordinates add nothing a ring under
   *    your finger has not already said;
   *  - a result or a rename says the **address**.
   *
   *  It was two rows — a hint and a `.map-draft-meta` — which is 44px of a 243px card spent on
   *  two short muted clauses that were never both load-bearing at once (ADR-0148 §1). Two
   *  competing quiet lines is also just worse than one. */
  note?: string;
  /** The glyph a human has already chosen for this place. **Its presence is
   *  `initiallyTouched`**, which is the whole of rename's special-casing: a place that already
   *  carries a glyph counts as chosen, so tapping a category will not stomp it. */
  icon?: string;
  /** The category in force — the place's own if a human set one, else what the referencing
   *  entities agree on — so the pills open where the place already is rather than at nothing,
   *  and the glyph chip opens showing what the pin already shows. **Its presence is NOT
   *  `initiallyTouched`**, unlike `icon`'s: a category the references derived is not the place's
   *  own answer, so treating the seed as a choice is how a save nobody aimed at the pills would
   *  stamp a derived value onto the row (the `booked`-row defect, ADR-0136 §2). */
  category?: EventCategory;
  /** **The short label a human may set** (ADR-0166 §18, field report #23), and its presence is
   *  what OFFERS the field at all — only the rename source does, because a place that does not
   *  exist yet has nothing to nickname and the question would be noise on the two add paths.
   *
   *  `fallback` is what the label resolves to with no nickname — the served city, or
   *  the shortened name — so the hint can say what leaving it empty means rather than making
   *  the user guess what they are overriding. */
  nickname?: { value: string; fallback: string };
  /** The FREE `place_id` deep link, present only where there is something to vet before
   *  spending (ADR-0115 §2). A dropped pin needs none — you chose the spot. */
  vetUrl?: string;
  /** The confirm's word: an add, or a save. */
  confirmLabel: string;
}

export interface MapPlaceFormValue {
  /** Trimmed, and never empty: every remaining source either types a name or arrives with one.
   *  A `nameOptional` escape existed for the tapped sight, whose confirm bought Google's label,
   *  and went with that source (ADR-0148 §6). */
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
  /** **Whether a human actually chose that category** — the same call-site policy `iconTouched`
   *  carries, for the same reason (ADR-0165): the host writes `Place.category` only when this is
   *  true, so a rename that only fixes a typo does not also stamp the referencing entities'
   *  derived category onto the place. */
  categoryTouched: boolean;
  /** The short label, when this source offered the field. **Absent** — not empty — where it did
   *  not, which is what stops an add path from writing `nickname: null` over nothing. An empty
   *  string is a real value here: it is how a nickname is cleared. */
  nickname?: string;
  /** **The notes typed on the way** (ADR-0152 §6b) — bodies, in order, none of them written
   *  yet. The host writes them behind the place, because only the host knows which of the four
   *  sources produced it and therefore when its id exists. Empty is the common case. */
  notes: string[];
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
  /** The write failed. Reported through the same refusal mechanism as an empty name
   *  (ADR-0150), so a failure the host reports and a refusal the form makes look alike
   *  and land in the same place — this card has one field, and both are about it. */
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
  const errors = useFormErrors<'name'>();
  const nameMark = errors.field('name');
  const [name, setName] = useState(spec.name);
  const [nickname, setNickname] = useState(spec.nickname?.value ?? '');
  const nicknameId = useId();
  // **THE CATEGORY IS DERIVED UNTIL A HUMAN TAPS A PILL**, through the same mechanism the icon
  // uses one line down — because it is the same shape: the seed is what the place's references
  // say, and only a tap makes it the place's own answer (ADR-0165). Nothing ever `redrive`s it;
  // what the host needs is `touched`, and a second hand-rolled flag pair beside `icon`'s is
  // exactly what `useDerivedField` exists to prevent.
  const category = useDerivedField<EventCategory | undefined>(spec.category);
  // **A CATEGORY DRIVES THE ICON UNTIL A HUMAN SAYS OTHERWISE**, through the one mechanism
  // that already does this job — `useDerivedField`, extracted because five hand-rolled
  // `*Touched` pairs said the same thing five times. The starting glyph is the place's own
  // resolution (`placeGlyph`), so the chip opens showing what the pin already shows.
  const icon = useDerivedField(placeGlyph({ icon: spec.icon }, spec.category), Boolean(spec.icon));
  // **A note is written on the way** (ADR-0152 §6b) — the same composer every other host form
  // carries, so a place is the fifth host and not a fifth way of writing a note. Local state,
  // read once at confirm: this file stays presentational and the host does the writing.
  const composer = useNoteComposer({ standalone: true });
  const noteId = useId();

  const report = (next: Partial<MapPlaceFormValue>) =>
    onValueChange?.({
      name: name.trim(),
      icon: icon.value,
      iconTouched: icon.touched,
      category: category.value,
      categoryTouched: category.touched,
      ...(spec.nickname && { nickname: nickname.trim() }),
      notes: composer.pending(),
      ...next,
    });

  const trimmed = name.trim();
  const confirm = () => {
    if (busy) return;
    // A PLACE NEEDS A NAME, and saying so is the fix (ADR-0150): the confirm used to be
    // disabled while the field was empty, so the Enter key — which this field binds —
    // ran `confirm` into a silent `return` and the card sat there answering nothing.
    if (!trimmed) return void errors.report([{ field: 'name', message: t.map.make.nameRequired }]);
    onConfirm({
      name: trimmed,
      icon: icon.value,
      iconTouched: icon.touched,
      category: category.value,
      categoryTouched: category.touched,
      ...(spec.nickname && { nickname: nickname.trim() }),
      // Whatever is in the box counts, committed or not — which is what makes `＋` optional and
      // one note type-and-save.
      notes: composer.pending(),
    });
  };

  return (
    <div className="map-draft" {...errors.formProps}>
      {/* The host's failure and the form's own refusal share the slot; a failure the host is
          still reporting outranks a mark the user has since retired by typing. */}
      {/* The hint is a stored **address** for two of the three sources and the app's own
          Hebrew for the third, so it sniffs its own direction rather than inheriting the
          card's RTL (ADR-0118). Wrapped here rather than in `Field`, whose hint is the app's
          own copy everywhere else. */}
      <Field
        label={spec.title}
        htmlFor={nameId}
        hint={spec.note == null ? undefined : <span dir="auto">{spec.note}</span>}
        {...nameMark}
        error={error ?? nameMark.error}
      >
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
          {/* **AND NO `autoFocus`** (owner, on a phone: _"it starts by opening the keyboard and
              immediately closing"_). The gesture that opens this form ends with a finger LIFTING
              off the canvas, so a field focused during the press loses focus to the release: the
              keyboard arrived and left in one motion, which reads as a glitch rather than as
              help. It is the wrong default on its own terms too — the card is landing, the camera
              is moving and the sheet is standing down, and taking half the screen during that is
              the "form breathes" failure ADR-0148 §5 refuses one layer up. Tapping the field is
              one tap, and it is the tap that means it. */}
          <input
            id={nameId}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t.map.make.namePlaceholder}
            enterKeyHint="done"
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirm();
            }}
          />
        </div>
      </Field>
      {/* **WHAT SCROLLS, AND WHY THESE TWO** (ADR-0148 §1). The card is bounded by the room it
          actually has, so something has to give when the keyboard takes the rest — and the
          choice is not arbitrary. While you are typing, the questions on screen are "what am I
          naming", "what have I typed" and "how do I get out": that is the `Field` above and the
          actions below, and they stay PINNED. The categories and the point are the two things
          you cannot act on while typing anyway, which is the same derived-affordance reasoning
          that takes `נווט` off a row under an errand (ADR-0134 §4).
          Nothing is hidden — it is pushed out of a window with a way back to it, which is what
          "total visibility" actually asks for. Every other form in this app already works this
          way (`EventForm`/`BookingSheet`: a scrolling body with pinned `FormActions`); this one
          did not, because it was drawn as a card. It can be both. */}
      <div className="map-draft-scroll">
        {/* ALL NINE `EventCategory` values, through the ONE selector `EventForm` and `NoteSheet`
          also read (`CategoryField`) — so `other` (כללי) is present and last because the enum
          puts it there, not because this surface chose an order.
          **Here the category is not invisible metadata: it is the pin's HUE.** That is why the
          map differs from session 76's recorded rejection of a category picker on quick-add
          (ADR-0109 §11) — without a choice a restaurant's pin comes out `leisure` green, which
          on a surface whose entire grammar is "colour = category" is wrong information rather
          than absent information. It follows that this is the one host that must **not**
          collapse the pills behind a statement (`disclosure` stays off), and that it carries
          no visible caption (`label={null}`): this card's height is arithmetic (ADR-0148 §1),
          and the row is named for assistive tech instead. */}
        <CategoryField
          label={null}
          clearable={false}
          ariaLabel={t.map.make.categoryLabel}
          value={category.value}
          onChange={(next) => {
            category.set(next);
            // `redrive` answers with the value now in force — derived, or whatever a human
            // already set — so the report reads the truth rather than a `useState` React has
            // not flushed yet. That return value is exactly why the hook has one.
            //
            // `placeGlyph` rather than `iconForCategory`, so the glyph is derived by the one
            // function that already answers "what does a place with this category show" —
            // including the `undefined` the type permits and `clearable={false}` prevents.
            report({
              category: next,
              categoryTouched: true,
              icon: icon.redrive(placeGlyph({}, next)),
            });
          }}
        />
        {/* **The short label** (ADR-0166 §18), in the scroll region and not the pinned head —
            the head is what you are naming and the actions are how you get out, and this card's
            height is arithmetic (ADR-0148 §1). It is `Field` + an input like every other text
            field in this app rather than a control of its own, and it carries NO `dir`, for the
            reason the name field one region up spells out: `dir="auto"` on an input sniffs its
            VALUE, so an empty field left-anchors its Hebrew placeholder (ADR-0118). */}
        {spec.nickname && (
          <Field
            label={t.map.make.nicknameLabel}
            htmlFor={nicknameId}
            hint={t.map.make.nicknameHint(spec.nickname.fallback)}
          >
            <input
              id={nicknameId}
              value={nickname}
              onChange={(e) => {
                setNickname(e.target.value);
                report({ nickname: e.target.value.trim() });
              }}
              placeholder={t.map.make.nicknamePlaceholder}
              maxLength={MAX_PLACE_NICKNAME_LENGTH}
              enterKeyHint="done"
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirm();
              }}
            />
          </Field>
        )}
        {/* The scroll region's SECOND child, which is the region ADR-0148 §1 built for exactly
            this: the head (what am I naming), the actions (how do I get out) and now the note
            box are three different jobs, and only the first two must survive a keyboard.

            **And it carries NO hint**, where every other host's composer does. Two reasons, and
            the second is the real one: a place has no category of its own, so the sentence the
            hint exists to say (`יורש את הקטגוריה והסמל`) is not true here — and this is the one
            card in the app whose height is arithmetic, where ADR-0148 §1 spent a session
            refusing "two competing quiet lines". The `＋` beside the box says the rest. */}
        <Field label={t.notes.composer.label} htmlFor={noteId}>
          <NoteComposer state={composer} id={noteId} />
        </Field>
      </div>
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
        <button type="button" className="map-addmaybe" disabled={busy} onClick={confirm}>
          {spec.confirmLabel}
        </button>
      </div>
    </div>
  );
}

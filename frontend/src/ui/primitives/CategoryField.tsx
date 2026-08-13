// **The one category selector**, collected from the three call sites that were already
// building it by hand: `EventForm`, `MapPlaceForm` and `NoteSheet` each wrote
// `Field` › `.category-pills` › `ChoiceGrid layout="pills"` over the same
// `EVENT_CATEGORY_OPTIONS` — and `NoteSheet` **forgot the wrapper**, so its pills rendered
// at the Index FILTER density (28px against 35px, measured). That is the shape of defect an
// extraction removes by construction rather than by remembering, which is why the fourth
// caller this change needed became this component instead of a fourth copy (rule 8).
//
// Two things it adds over the sandwich it replaces:
//
//  - **A way back to no answer at all.** `ChoiceGrid`'s `onChange` only ever SETS, so once a
//    note had a category there was no route back to `undefined` — half the report this was
//    built for. The cure is one leading option carrying a sentinel value, which is verbatim
//    what `IndexNotesView`'s `הכל` chip already ships (`NOTE_CATEGORY_ALL`): no change to the
//    primitive, no new CSS, and the state is stated on screen rather than hidden inside a
//    gesture. A tap-the-selected-pill-to-clear was the alternative and is undiscoverable on
//    touch (no hover, ADR-0017) as well as non-standard for a `role="radio"`.
//  - **A `disclosure` mode**, where the field collapses to what it currently is and reveals
//    the pills on a tap (`ChoiceDisclosure`). Opt-in per **call**, not per host, because it is
//    not universally right: on the Map the category **is** the pin's hue, and `MapPlaceForm`'s
//    own comment says that on a surface whose grammar is "colour = category" an unanswered
//    category is wrong information rather than absent information — and `NoteSheet` collapses
//    only on an **edit**, where a statement of the value already saved is what the row is for
//    (ADR-0183 §4's 2026-08-13 amendment). A create has no earlier answer to state, so it gets
//    the open field every other form's category is.
import { useState, type ReactNode } from 'react';
import type { EventCategory } from '@waypoint/shared';
import { EVENT_CATEGORY_OPTIONS, NO_CATEGORY } from '../../lib/category-options';
import { ChoiceGrid, type Choice } from './ChoiceGrid';
import { ChoiceDisclosure } from './ChoiceDisclosure';
import { Field } from './Field';
import { DEFAULT_EVENT_ICON } from '../../constants';
import { t } from '../../i18n/he';

/** What the leading pill says, and what the collapsed row states, when nothing was chosen.
 *  A host that inherits supplies both halves (`🏨` + `לפי ההזמנה`); one that simply has no
 *  answer supplies neither and gets `ללא`. */
export interface CategoryDefault {
  /** The glyph in force. Omitted when nothing is inherited. */
  glyph?: string;
  /** Where it came from, in words — `לפי ההזמנה`. Omitted when nothing is inherited. */
  from?: string;
  /** The category actually in force, for the collapsed row's label. */
  category?: EventCategory;
}

export function CategoryField({
  value,
  onChange,
  fallback,
  disclosure = false,
  clearable = true,
  label = t.eventForm.categoryLabel,
  ariaLabel,
}: {
  /** The chosen category, or `undefined` for "no answer of its own". */
  value?: EventCategory;
  /** `undefined` is the leading pill being picked — a real answer, not a no-op. */
  onChange: (next?: EventCategory) => void;
  /** What `undefined` MEANS here. Absent = plainly nothing. */
  fallback?: CategoryDefault;
  /** Collapse to a statement and reveal the pills on a tap. Off by default, so a form that has
   *  nothing to state — every create — keeps the plain field. */
  disclosure?: boolean;
  /** Off where "no category" is not a state worth reaching. Its one caller is `MapPlaceForm`:
   *  there the category **is** the pin's hue, and that file's own comment says an unanswered
   *  category on a surface whose grammar is "colour = category" is wrong information rather
   *  than absent information — so offering a way back to it would be offering the defect. */
  clearable?: boolean;
  /** `null` drops the `Field` shell entirely — for a host that names the row some other way
   *  and cannot afford the caption's height. Its one caller is `MapPlaceForm`, whose card
   *  height is arithmetic (ADR-0148 §1); pass `ariaLabel` there instead. */
  label?: string | null;
  /** The row's accessible name when it carries no visible caption. Defaults to `label`. */
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const name = ariaLabel ?? label ?? t.eventForm.categoryLabel;

  const options: Choice<EventCategory | typeof NO_CATEGORY>[] = [
    ...(clearable
      ? [
          {
            value: NO_CATEGORY,
            icon: fallback?.glyph ?? '',
            label: fallback?.from ?? t.eventForm.categoryNone,
          },
        ]
      : []),
    ...EVENT_CATEGORY_OPTIONS,
  ];

  const pills = (
    <div className="category-pills">
      <ChoiceGrid
        layout="pills"
        options={options}
        value={value ?? NO_CATEGORY}
        onChange={(next) => {
          onChange(next === NO_CATEGORY ? undefined : next);
          // **Choosing collapses it.** A single-select chooser has nothing left to ask once it
          // is answered, and staying open hides the statement the answer just rewrote — the
          // one thing the reader wants to see. Harmless when the field is not a disclosure.
          setOpen(false);
        }}
        ariaLabel={name}
      />
    </div>
  );

  const shell = (body: ReactNode) => (label === null ? body : <Field label={label}>{body}</Field>);

  if (!disclosure) return shell(pills);

  // The value in force: the chosen one, else whatever the host inherits, else nothing.
  const inForce = value ?? fallback?.category;
  const option = inForce ? EVENT_CATEGORY_OPTIONS.find((o) => o.value === inForce) : undefined;
  // **The caption survives the collapse.** `ChoiceDisclosure` renders none of its own — right
  // for `BookingSheet`, where the row is a step's header and `🏨 לינה` says what it is — but in
  // a form of captioned fields a bare `📌 ללא` does not say which question it answers.
  return shell(
    <ChoiceDisclosure
      glyph={option?.icon ?? DEFAULT_EVENT_ICON}
      label={option?.label ?? t.eventForm.categoryNone}
      // Only while the value is inherited: once a human has chosen, nothing derived it.
      from={value === undefined ? fallback?.from : undefined}
      open={open}
      onToggle={() => setOpen((v) => !v)}
      ariaLabel={name}
    >
      {pills}
    </ChoiceDisclosure>,
  );
}

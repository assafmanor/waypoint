// The note editor (ADR-0153 §5) — create and edit in one sheet, because they differ only
// in what the fields open with. On the `Modal`-based `Sheet` like every other overlay, so
// back / Escape / backdrop all resolve through the one stack (ADR-0090/0103).
//
// **Its one refusal**: a note with neither body nor url — and it is the FORM's
// (`field: null`), not any field's (ADR-0150, amended by the owner 2026-08-02). Every field
// here is individually optional: a link on its own is a whole note, so marking the body
// calls a field mandatory that isn't, and marking the url reddens a box whose own label
// reads `לא חובה`. Both read as a bug because both state something untrue. What is wrong is
// the note, so it says so once, in the form's slot above the actions, and no field turns
// red. The primary is never `disabled` as a stand-in for it (§8 of that ADR).
//
// **There is no host picker** (ADR-0153 §5): a note written here is always general, and a
// note opened from a host states that host as a fact. Attachment is established from the
// host's side, which is where it is natural anyway — a real limitation, accepted knowingly.
//
// **The category leads the form, and it is a plain field on a create and the statement on an
// edit** (owner, 2026-08-13; ADR-0183 §4 amended in place). It is present on every note,
// hosted or not: it used to be rendered behind `{!host && …}`, which meant the common note —
// the one written on a booking, an event, an idea, a place or a document (ADR-0152 §6b's whole
// point) — could never be re-filed at all. What §6b actually bought is that a note is written
// with **no category chosen**, and that is intact either way: the leading pill arrives already
// selected, showing the value in force and where it came from, so there is nothing to answer.
// Choosing writes `Note.category`; choosing the leading pill writes `null` and returns to
// inheritance, which §5's amendment requires to be RESOLVED at render and never copied at
// write time.
import { useId, useState } from 'react';
import { iconForCategory, type EventCategory, type Note } from '@waypoint/shared';
import type { NoteHostRef } from '../lib/notes';
import { Sheet } from './Sheet';
import { Icon } from './Icon';
import { NOTE_HOST_ICON } from '../constants';
import { Field } from './primitives/Field';
import { FormActions } from './primitives/FormActions';
import { FormError } from './primitives/FormError';
import { CategoryField } from './primitives/CategoryField';
import { useFormErrors } from './primitives/useFormErrors';
import { t } from '../i18n/he';
import './notes.css';

/** What the sheet hands back — the shape both the create and the edit verb take. */
export interface NoteDraft {
  title?: string;
  body?: string;
  url?: string;
  category?: EventCategory;
}

/** No field of this form can be refused on its own, so there is no field name to refuse
 *  with — the one refusal is the form's (`field: null`). */
type NoteField = never;

export function NoteSheet({
  note,
  host,
  onSave,
  onClose,
}: {
  /** The note being edited, or undefined to create one. */
  note?: Note;
  /** Stated, never chosen — present only when the sheet was opened from a host. */
  host?: NoteHostRef;
  onSave: (draft: NoteDraft) => void;
  onClose: () => void;
}) {
  const bodyId = useId();
  const titleId = useId();
  const urlId = useId();
  const errors = useFormErrors<NoteField>();

  const [body, setBody] = useState(note?.body ?? '');
  const [title, setTitle] = useState(note?.title ?? '');
  const [url, setUrl] = useState(note?.url ?? '');
  // A hosted note carries no category of its own — it resolves from the host at render
  // (ADR-0152 §5's amendment), so this opens ABSENT rather than pre-filled with the host's,
  // and the field states the inherited value instead of seeding itself from it. `undefined`
  // survives the round trip as a clear without any special casing: the note PATCH is a
  // whole-content submit and its service writes `category ?? null` unconditionally.
  const [category, setCategory] = useState<EventCategory | undefined>(note?.category);

  const save = () => {
    const trimmed = { body: body.trim(), title: title.trim(), url: url.trim() };
    if (!trimmed.body && !trimmed.url) {
      errors.report([{ field: null, message: t.notes.sheet.needsBodyOrUrl }]);
      return;
    }
    onSave({
      body: trimmed.body || undefined,
      title: trimmed.title || undefined,
      url: trimmed.url || undefined,
      category,
    });
  };

  return (
    <Sheet title={note ? t.notes.sheet.editTitle : t.notes.sheet.createTitle} onClose={onClose}>
      {/* `formProps`' dismissal is per-field, so a refusal with no field would outlive
          every cure for it. Either box being typed in is the cure, so any keystroke here
          retires it — the next save re-states it if it still holds. */}
      <div className="note-sheet" onInputCapture={() => errors.clear()}>
        {host && (
          <p className="note-sheet-host">
            <span className="note-host">
              <Icon name={NOTE_HOST_ICON[host.kind]} />
              <span className="note-host-n">{host.name}</span>
            </span>
          </p>
        )}

        {/* **First, like the category in every other form** (`EventForm` leads with it too,
            ADR-0109 §11) — a note is filed under something, and the field that says under what
            reads above the boxes rather than after them.

            **And on a CREATE it is the open field, not the statement** (owner, 2026-08-13). The
            collapse was built for the report it closed — re-filing something already saved — and
            reaching it costs a tap plus a second one to close, which on a brand-new note is a
            step paid for nothing: there is no earlier answer to state. An edit keeps it, because
            there the row IS the statement the editor opens with (ADR-0183 §1) and changing the
            category is the rare pass. Either way nothing is asked: the leading pill opens
            selected, carrying the value in force.

            `fallback` is what `undefined` MEANS on this note: the host's own category while
            one is inherited, plainly nothing otherwise. Picking the leading pill writes
            `null` and returns to inheritance — the field's `category` stays absent and the
            render resolves it again (§5's amendment: resolved, never copied). */}
        <CategoryField
          label={t.notes.sheet.categoryLabel}
          disclosure={note !== undefined}
          value={category}
          onChange={setCategory}
          fallback={{
            category: host?.category,
            glyph: host?.category ? iconForCategory(host.category) : undefined,
            from: host?.category ? t.notes.sheet.categoryFrom[host.kind] : undefined,
          }}
        />

        <Field label={t.notes.sheet.bodyLabel} htmlFor={bodyId}>
          <textarea
            id={bodyId}
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t.notes.sheet.bodyPlaceholder}
          />
        </Field>

        <Field label={t.notes.sheet.titleLabel} htmlFor={titleId}>
          <input
            id={titleId}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t.notes.sheet.titlePlaceholder}
          />
        </Field>

        <Field label={t.notes.sheet.urlLabel} htmlFor={urlId}>
          {/* `dir="ltr"` is correct on an INPUT and only on an input (ADR-0118): a url is
              typed left-to-right, and the lint rule that blocks it elsewhere allows it
              exactly here. */}
          <input
            id={urlId}
            dir="ltr"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t.notes.sheet.urlPlaceholder}
          />
        </Field>

        {/* The same slot `EventForm` and `BookingSheet` keep for what has no field to
            point at. Here it is the only refusal, and it sits against the button that was
            just pressed — the half ADR-0150's old bottom-of-form caption never had. */}
        <FormError>{errors.formError}</FormError>

        <FormActions
          primary={{ label: t.notes.sheet.save, onClick: save }}
          secondary={{ label: t.notes.sheet.cancel, onClick: onClose }}
        />
      </div>
    </Sheet>
  );
}

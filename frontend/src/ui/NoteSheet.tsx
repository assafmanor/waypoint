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
import { useId, useState } from 'react';
import { EVENT_CATEGORY_OPTIONS } from '../lib/category-options';
import type { EventCategory, Note } from '@waypoint/shared';
import type { NoteHostRef } from '../lib/notes';
import { Sheet } from './Sheet';
import { Icon } from './Icon';
import { NOTE_HOST_ICON } from '../constants';
import { Field } from './primitives/Field';
import { FormActions } from './primitives/FormActions';
import { ChoiceGrid } from './primitives/ChoiceGrid';
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
  // (ADR-0152 §5's amendment), so the picker is absent rather than pre-filled.
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

        {/* A hosted note inherits its category, so it is not asked for one — everything
            that can be spared from the user is (ADR-0152 §6b). */}
        {!host && (
          <Field label={t.notes.sheet.categoryLabel}>
            <ChoiceGrid
              options={EVENT_CATEGORY_OPTIONS}
              value={category}
              onChange={setCategory}
              layout="pills"
              ariaLabel={t.notes.sheet.categoryLabel}
            />
          </Field>
        )}

        {/* The same slot `EventForm` and `BookingSheet` keep for what has no field to
            point at. Here it is the only refusal, and it sits against the button that was
            just pressed — the half ADR-0150's old bottom-of-form caption never had. */}
        {errors.formError && (
          <p className="field-error" role="alert">
            {errors.formError}
          </p>
        )}

        <FormActions
          primary={{ label: t.notes.sheet.save, onClick: save }}
          secondary={{ label: t.notes.sheet.cancel, onClick: onClose }}
        />
      </div>
    </Sheet>
  );
}

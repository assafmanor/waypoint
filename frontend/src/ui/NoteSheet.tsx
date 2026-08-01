// The note editor (ADR-0153 §5) — create and edit in one sheet, because they differ only
// in what the fields open with. On the `Modal`-based `Sheet` like every other overlay, so
// back / Escape / backdrop all resolve through the one stack (ADR-0090/0103).
//
// **Its one refusal**: a note with neither body nor url. It is marked on **both** fields
// that can cure it, in a single `report` call — a refusal that stops at the first problem
// sends the user round the save loop again to be told the next one (ADR-0150). The primary
// is never `disabled` as a stand-in for it (§8 of that ADR).
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

/** The two fields that can cure the one refusal, so `report` can name them both. */
type NoteField = 'body' | 'url';

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
      errors.report([
        { field: 'body', message: t.notes.sheet.needsBodyOrUrl },
        { field: 'url', message: t.notes.sheet.needsBodyOrUrlHere },
      ]);
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
      <div className="note-sheet" {...errors.formProps}>
        {host && (
          <p className="note-sheet-host">
            <span className="note-host">
              <Icon name={NOTE_HOST_ICON[host.kind]} />
              <span className="note-host-n">{host.name}</span>
            </span>
          </p>
        )}

        <Field label={t.notes.sheet.bodyLabel} htmlFor={bodyId} {...errors.field('body')}>
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

        <Field label={t.notes.sheet.urlLabel} htmlFor={urlId} {...errors.field('url')}>
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

        <FormActions
          primary={{ label: t.notes.sheet.save, onClick: save }}
          secondary={{ label: t.notes.sheet.cancel, onClick: onClose }}
        />
      </div>
    </Sheet>
  );
}

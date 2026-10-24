// **The quick add** (ADR-0231 §3) — ADR-0043 §3's Tier-1 add, "a soft event, today", finally
// built as the small room it was decided to be: a title, one when-sentence, one primary.
//
// What shipped in its place was the full `EventForm`, prefilled at the day's LAST end — at 13:51
// with the afternoon in front of you, ⁦23:15⁩ for ⁦44⁩ minutes. Counted on the running app at six
// steps. This is three: the ＋, the title, `הוספה`.
//
// **The when-sentence is `TimePicker`** — ADR-0036's start + duration setter, the same two
// `ValueToken`s the form's own when line renders. Not a second sentence beside it, and not the
// day's position list: the default here is `עכשיו` (fork F4), which is a clock, and a chooser of
// positions for a value that is already right would be a second picker for nothing. Anything
// more than a name and a time — a place, a booking, a hard kind — is `עוד פרטים…`, which hands
// what was typed to the form rather than losing it.
//
// The sheet's title carries `היום`, so the sentence need not: the first render said it twice and
// wrapped at 360 (the mockup's own finding).
import { useState } from 'react';
import { Sheet } from './Sheet';
import { Field } from './primitives/Field';
import { TimePicker } from './TimePicker';
import { Icon } from './Icon';
import type { GapDefaults } from '../lib/gaps';
import { t } from '../i18n/he';

export interface QuickAddDraft {
  title: string;
  start: string;
  end: string;
}

export function QuickAddSheet({
  defaults,
  onAdd,
  onMore,
  onClose,
}: {
  /** Where it lands — now, or the gap that was tapped (`quickAddSlot` / the gap's own fill). */
  defaults: GapDefaults;
  onAdd: (draft: QuickAddDraft) => void;
  /** The way into the big room, with the draft. */
  onMore: (draft: QuickAddDraft) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState({ start: defaults.start, end: defaults.end });
  const draft = (): QuickAddDraft => ({ title: title.trim(), ...when });
  const canAdd = title.trim().length > 0;
  return (
    <Sheet title={t.day.quickAdd.title} onClose={onClose}>
      <form
        className="quick-add"
        onSubmit={(e) => {
          e.preventDefault();
          if (canAdd) onAdd(draft());
        }}
      >
        <Field label={t.eventForm.titleLabel} htmlFor="quick-add-title">
          <input
            id="quick-add-title"
            type="text"
            autoFocus
            value={title}
            placeholder={t.day.quickAdd.titlePlaceholder}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field label={t.whenField.label}>
          <TimePicker start={when.start} end={when.end} onChange={setWhen} />
        </Field>
        {/* `disabled` only while a press could not work (ADR-0150 §8): an empty title is the one
            refusal this sheet has, and it is visible in the empty box the primary sits under. */}
        <button type="submit" className="sched-confirm" disabled={!canAdd}>
          <Icon name="plus" /> {t.day.quickAdd.add}
        </button>
        <button type="button" className="quick-add-more" onClick={() => onMore(draft())}>
          {t.day.quickAdd.more}
        </button>
      </form>
    </Sheet>
  );
}

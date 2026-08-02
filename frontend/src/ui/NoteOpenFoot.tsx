// **What an open note shows besides its words** (ADR-0153 §4's 2026-08-02 amendment, round
// two): where it belongs, and the one verb.
//
// A note has exactly two things to say about itself, which is why this is one line and not the
// head-badge-rule-fact stack the sheet had. The author and the time are already on the row (or
// the section line) above — printing them again is the "same sentence twice" failure this
// feature keeps re-learning.
//
// **The way in is the host's own name.** It was already written there and inert; here it is the
// same words with a caret and a 44px target. A BUTTON rather than a link, because this is
// in-app navigation (a tab plus a pending id, `lib/note-host-target.ts`) and this app does that
// through `navigate` — never an `<a href>`.
//
// Absent in two cases, both "absent, not broken" rather than a dead control:
//   • the surface IS the host (a booking's own note section — you are already there);
//   • the host has nowhere to go (a general note; a someday idea, which lives in the pool
//     rather than on a day, so there is a shelf to reach but not a tile).
import type { NoteHostRef } from '../lib/notes';
import { Icon } from './Icon';
import { t } from '../i18n/he';
import './notes.css';

export function NoteOpenFoot({
  host,
  onGoToHost,
  onEdit,
}: {
  /** Resolved, never copied (ADR-0152 §5) — absent for a general note. */
  host?: NoteHostRef;
  /** Absent when there is nowhere to go, or when this surface is the host itself. */
  onGoToHost?: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="note-open-foot">
      {host && onGoToHost ? (
        <button
          type="button"
          className="note-open-host"
          onClick={onGoToHost}
          aria-label={t.notes.open.toHost(host.name)}
        >
          {host.name}
          <Icon name="caret" dir="left" />
        </button>
      ) : (
        <span className="note-open-host plain">{host ? host.name : t.notes.open.general}</span>
      )}
      <span className="note-open-sp" />
      <button type="button" className="note-open-act" onClick={onEdit}>
        <Icon name="edit" /> {t.notes.open.edit}
      </button>
    </div>
  );
}

// **What an open note shows besides its words** (ADR-0153 §4's 2026-08-02 amendment, round
// two): where it belongs, and the one verb.
//
// A note has exactly two things to say about itself, which is why this is one line and not the
// head-badge-rule-fact stack the sheet had. The author and the time are already on the row (or
// the section line) above — printing them again is the "same sentence twice" failure this
// feature keeps re-learning.
//
// **And its url, when it has one** (owner, 2026-08-02: notes' links weren't clickable anywhere).
// It belongs here rather than on the row for the reason ADR-0153 §8 already gave about the link
// MARK: at ~16px inside a row whose whole width is one open target, a second tappable thing is a
// mistap, not an affordance. Here it is a line of its own with the 44px floor — and it is the
// only place a note's url is legible at all on a host, where the row prints title-or-body and
// a link-bearing note showed nothing of its link.
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
import { noteUrlHref, type NoteHostRef } from '../lib/notes';
import { ltrIsolate } from '../lib/bidi';
import { Icon } from './Icon';
import { t } from '../i18n/he';
import './notes.css';

export function NoteOpenFoot({
  host,
  url,
  onGoToHost,
  onEdit,
}: {
  /** Resolved, never copied (ADR-0152 §5) — absent for a general note. */
  host?: NoteHostRef;
  /** The note's url, if it has one. Rendered only when it resolves to an http(s) target. */
  url?: string;
  /** Absent when there is nowhere to go, or when this surface is the host itself. */
  onGoToHost?: () => void;
  onEdit: () => void;
}) {
  const href = noteUrlHref(url);

  return (
    <>
      {/* Its own line, above the verb row: a url is as long as it is, and squeezing it in
          beside the host name would truncate both. `ltrIsolate`, never `dir="ltr"` on a
          non-input (ADR-0118) — the icon would end up on the wrong side of the words. */}
      {href && (
        <a
          className="note-open-url"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t.notes.open.openLink}
        >
          <Icon name="link" />
          <span className="note-open-url-t">{ltrIsolate(url!.trim())}</span>
        </a>
      )}
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
    </>
  );
}

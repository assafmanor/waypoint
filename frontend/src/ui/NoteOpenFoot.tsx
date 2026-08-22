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
import type { NoteHostRef } from '../lib/notes';
import { externalHref, prettyUrl } from '../lib/external-url';
import { ltrIsolate } from '../lib/bidi';
import { Icon } from './Icon';
import { RowOpenFoot } from './domain';
import { t } from '../i18n/he';
import './notes.css';

export function NoteOpenFoot({
  host,
  url,
  urlIsTheTitle,
  onGoToHost,
  onView,
  onHostSurface,
  onEdit,
}: {
  /** Resolved, never copied (ADR-0152 §5) — absent for a general note. */
  host?: NoteHostRef;
  /** The note's url, if it has one. Rendered only when `externalHref` can make an href of
   *  it — a `javascript:` in a group-visible text field is not a link. */
  url?: string;
  /** Is the row above already showing this url as its title line? A url-only note's row IS
   *  the url, so repeating it here is the "same sentence twice" failure this feature keeps
   *  re-learning — the link then reads as the VERB instead, which is the only thing the
   *  line above is missing. */
  urlIsTheTitle?: boolean;
  /** Absent when there is nowhere to go, or when this surface is the host itself. */
  onGoToHost?: () => void;
  /** **Open this note on its own screen** (ADR-0202 §1). Present on both surfaces, always —
   *  never conditional on how long the note is, because a control whose position depends on
   *  the length of the text cannot be learned, and it costs 0px in a line that already
   *  exists. */
  onView?: () => void;
  /** **Is the surface showing this foot the note's own host?** (ADR-0202's build.)
   *
   *  This exists because of what the two absences used to collapse into. `host` being absent
   *  meant BOTH "this note has no host" and "you are standing on its host", and the lead then
   *  printed `פתק כללי` for both — so on a booking's own note section, every hosted note was
   *  labelled a general note. A shipped copy defect, and invisible in the tests because the
   *  screen's rows (which do pass a host) are where the lead was asserted.
   *
   *  With it true the lead is absent entirely, which is `RowOpenFoot`'s own documented case
   *  and the right answer: the host is the screen you are on, so the foot has nothing to say
   *  about where this belongs and says nothing rather than saying something false. */
  onHostSurface?: boolean;
  onEdit: () => void;
}) {
  // `externalHref` (ADR-0153 §5b) owns the scheme-supplying and the allowlist, `prettyUrl`
  // owns what a reader should see of it — the href keeps everything, the label does not.
  const href = externalHref(url);

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
          <span className="note-open-url-t">
            {urlIsTheTitle ? t.notes.open.openLink : ltrIsolate(prettyUrl(url))}
          </span>
        </a>
      )}
      {/* The line itself is `RowOpenFoot` — shared with tasks since ADR-0189. What is note-
          specific is only what the LEAD says, which is this component's whole remaining job. */}
      <RowOpenFoot
        lead={
          // Nothing at all where the surface IS the host — see `onHostSurface`.
          onHostSurface ? undefined : host && onGoToHost ? (
            <button
              type="button"
              className="row-open-lead"
              onClick={onGoToHost}
              aria-label={t.notes.open.toHost(host.name)}
            >
              {/* Its own element so it can ellipsise: with a third control on this line a
                  long host name wraps it, and the verbs are what must keep the trailing
                  edge (`row-open.css`, ADR-0202 §1). */}
              <span className="row-open-lead-n">{host.name}</span>
              <Icon name="caret" dir="left" />
            </button>
          ) : (
            <span className="row-open-lead plain">
              <span className="row-open-lead-n">{host ? host.name : t.notes.open.general}</span>
            </span>
          )
        }
        viewLabel={onView ? t.notes.open.full : undefined}
        onView={onView}
        editLabel={t.notes.open.edit}
        onEdit={onEdit}
      />
    </>
  );
}

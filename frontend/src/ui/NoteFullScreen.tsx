// **A note on its own screen** (ADR-0202 §2/§3) — the third container, above the in-place
// expansion rather than instead of it.
//
// The expansion stays: ADR-0153 §4's 2026-08-02 amendment replaced a sheet with it and
// `note-preview-v2.html` measured the trade (+37px for a short note, +89px for a long one,
// against 151/199px for a sheet that also covered the list). What it cannot do is give a long
// structured note room, or make a url inside the body tappable — the row's body is a
// `<button>`, so an `<a>` cannot live in it. Those are this surface's two reasons to exist.
//
// **`Modal variant="full"`, not a route and not a second `idx-screen`.** A note is opened from
// the notes screen and from five hosts, four of which are view state inside screens that are
// not the Index (`lib/note-host-target.ts`). A full-variant Modal portals to `document.body`
// and registers through `useOverlay`, so it opens from any of them without a host learning
// anything, and back / Escape / the Android gesture all resolve through the one stack
// (ADR-0090/0103). It is `SearchOverlay`'s own shape one surface over.
//
// **`MediaViewer` was the tempting reuse and is refused.** It is the app's only other
// full-screen surface, and ADR-0167 §10.2 chose to extend it once already rather than build a
// hero. But what it brings is BYTES: an object URL, a decode with a timeout, ADR-0062's sole
// pinch exception, and a graceful hand-off to "open in a tab". A note has none of them, so
// reusing it would mean switching every one off — which is the opposite of extending it.
//
// **No `⋯`.** `BookingDetail`'s grammar, which this surface is a sibling of: a read surface
// carries ONE visible edit and the delete stays on the row's kebab (ADR-0053). The mockup drew
// a menu here and the build removed it, because both of the verbs it would hold are already on
// screen — the host way in and `עריכה` are in the foot — and a menu whose only unique item is
// the destructive one is a worse place for the destructive one.
//
// **And no host chip in the bar**, which the mockup also drew. The foot's lead already names
// the host and is the way to it, and ADR-0153 §4's amendment settled this exact question one
// surface down: when a note opens, `.wp-listrow.is-open .note-host` HIDES the row's chip,
// because the foot below it carries the same fact. A bar chip here is that stutter again with
// a whole screen between the two copies instead of six pixels. So the bar is back + `פתק`,
// which is `IndexBackRow`'s shape, and the host lives once — in the half that can be tapped.
import type { Note, User } from '@waypoint/shared';
import { noteWhen, type NoteHostRef } from '../lib/notes';
import { externalHref, prettyUrl } from '../lib/external-url';
import { baseDirection, ltrIsolate } from '../lib/bidi';
import { Modal } from './primitives/Modal';
import { NavArrow } from './NavArrow';
import { NoteProse } from './NoteProse';
import { RowOpenFoot } from './domain';
import { Icon } from './Icon';
import { useMode } from '../state/mode-state';
import { t } from '../i18n/he';
import './notes.css';

export function NoteFullScreen({
  note,
  host,
  users,
  now,
  onGoToHost,
  onEdit,
  onClose,
}: {
  note: Note;
  /** Resolved, never copied (ADR-0152 §5) — absent for a general note. */
  host?: NoteHostRef;
  users: User[];
  now: Date;
  /** Absent when there is nowhere to go, or when the surface behind this IS the host. */
  onGoToHost?: () => void;
  onEdit: () => void;
  onClose: () => void;
}) {
  // **The tint is read here, not taken as a prop** — and the prop version was written first,
  // so this is a measurement rather than a preference. `SearchOverlay` takes `mode` from its
  // caller because it lives in `primitives/` and must stay domain-free; passing it here means
  // `HostNotes` has to read it, and `HostNotes` is rendered by all five hosts — which turned
  // 169 tests in six unrelated specs into "useMode must be used within <ModeProvider>". The
  // read belongs where the tint is used: this component mounts only when a note is opened, so
  // only a spec that opens one needs to say anything about mode.
  const { mode } = useMode();
  const author = users.find((u) => u.id === note.createdBy)?.displayName;
  const href = externalHref(note.url);
  // A url-only note has no words to print, so the link IS the content and reads as the verb.
  const urlIsTheTitle = !note.title && !note.body;

  return (
    <Modal variant="full" ariaLabel={t.notes.one} onClose={onClose}>
      {/* The visible back control takes the overlay's own animated close, so leaving by the
          arrow looks like leaving by a system back — one dismissal, one path (ADR-0103 §2). */}
      {(close) => (
        <div className="note-full">
          {/* `.mode-chrome` and `.chrome-ghost-btn` are App.css's, two of the three
              `SearchOverlay` borrows, so this reads as part of the app rather than as a
              foreign white overlay — and it wears the mode's tint for free. */}
          <div className="note-full-bar mode-chrome" data-mode={mode}>
            <button
              type="button"
              className="chrome-ghost-btn"
              onClick={close}
              aria-label={t.notes.full.backAria}
            >
              <NavArrow variant="back" />
            </button>
            {/* Says what KIND of thing this is, never the note's own words — ADR-0153 §4's
                rule for the row, one surface up. The words are below, in full. */}
            <span className="note-full-t">{t.notes.one}</span>
            <span className="note-full-sp" />
          </div>

          <div className="note-full-body">
            {/* Same rule as the prose below it, and for the same reason: a title reading
                `TL;DR: מה לעשות` would flip under `dir="auto"` because of the `T`. A title is
                short enough that the first strong character is USUALLY right, which is exactly
                what made the reported defect hard to see — the title in the screenshot was
                fine and the body under it was not. */}
            {note.title && (
              <h1 className="note-full-title" dir={baseDirection(note.title)}>
                {note.title}
              </h1>
            )}
            {/* The one line the row's foot refuses: on a row the author and the elapsed time
                sit two lines above it, and here there is no row. */}
            <p className="note-full-meta">
              {[author, noteWhen(note.createdAt, now.getTime())].filter(Boolean).join(' · ')}
            </p>
            {/* Live anchors: this body is a plain div, so a url in the prose is finally a
                url you can follow (ADR-0202 §6). */}
            {note.body && <NoteProse body={note.body} />}
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
                  {urlIsTheTitle ? t.notes.open.openLink : ltrIsolate(prettyUrl(note.url))}
                </span>
              </a>
            )}
          </div>

          {/* `RowOpenFoot` again, pinned: a long note scrolls, and the way out of it must not
              be at the end of the reading. No `onView` — you are already here. */}
          <div className="note-full-foot">
            <RowOpenFoot
              lead={
                host && onGoToHost ? (
                  <button
                    type="button"
                    className="row-open-lead"
                    onClick={onGoToHost}
                    aria-label={t.notes.open.toHost(host.name)}
                  >
                    <span className="row-open-lead-n">{host.name}</span>
                    <Icon name="caret" dir="left" />
                  </button>
                ) : (
                  // Unreachable, or the surface behind this IS the host — either way the name
                  // still belongs here, because with no chip in the bar this is the ONLY place
                  // the host appears. That is the difference from the row's foot, where the
                  // surface itself says which host you are on and repeating it is the stutter.
                  <span className="row-open-lead plain">
                    <span className="row-open-lead-n">
                      {host ? host.name : t.notes.open.general}
                    </span>
                  </span>
                )
              }
              editLabel={t.notes.open.edit}
              onEdit={onEdit}
            />
          </div>
        </div>
      )}
    </Modal>
  );
}

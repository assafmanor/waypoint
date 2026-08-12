// **The statement at the top of an editor IS the control** (owner, 2026-08-12:
// _"the edit already has a category on top, so it should probably become clickable — for
// both notes and bookings"_).
//
// Generalised from `BookingSheet`'s collapsed `BookingTypeRow`, which had already written
// the grammar down and was missing only the press: a glyph, what the thing is, and the way
// back to the grid pushed to the far edge — so the eight-option chooser is paid for once,
// at the moment it is being answered, and the answer stays legible everywhere after that.
// What that row could not do is be tapped on an edit, which is the whole report this
// component exists to close.
//
// Three things it owes its hosts, and none of them is the host's to re-decide:
//
//  - **The chooser reveals IN PLACE**, through the shared `Collapsible` (ADR-0098's reuse
//    audit) — not a step, and not a second overlay. A step is what you pay on every pass
//    through the form and this is a rare edit (the owner's call, same day); an overlay for
//    one of eight options with no search is a layer over a sheet that hides the form the
//    choice returns to. Closed it costs nothing at all.
//  - **The row is a `<button>`**, which is load-bearing beyond the press: `BookingSheet`
//    and `EventForm` already run `onFocusCapture` → `scrollIntoView` over their whole
//    body, so a focusable row scrolls its own revealed panel into view for free where a
//    `<div>` would not. Drawn at 360×640 the opened form overruns the screen, so this is
//    the difference between "the grid is below the fold" and "the grid arrives".
//  - **It states where an unchosen value came from** (`from`), and drops that the moment a
//    human chooses — there is no source left to name.
//
// It spends no hue. A category is neither time (amber), place (teal) nor Plan mode
// (violet), and rule 4 has no spare colour to lend it; `ValueToken` (ADR-0177) was the
// considered alternative and declares its open mark in **amber for every host**, which on
// a booking type would spend the clock's colour on something that is not a clock.
import { type ReactNode } from 'react';
import { Collapsible } from './Collapsible';
import { Icon } from '../Icon';
import { t } from '../../i18n/he';
import './choice-disclosure.css';

export function ChoiceDisclosure({
  glyph,
  label,
  from,
  open,
  onToggle,
  ariaLabel,
  children,
}: {
  /** The chosen option's mark. Emoji, and decorative — the label carries the meaning. */
  glyph: string;
  /** What the thing currently is, in words. */
  label: string;
  /** **Where an unchosen value came from** — `לפי ההזמנה` on a note that inherits its
   *  host's category. Absent once a human has chosen, because then nothing derived it. */
  from?: string;
  open: boolean;
  onToggle: () => void;
  /** Names the row for assistive tech ("סוג ההזמנה", "קטגוריה"), since the visible
   *  content is a value rather than a question. */
  ariaLabel: string;
  /** The chooser. Rendered always (never unmounted) so `Collapsible` has something to
   *  animate against, which is that primitive's own contract. */
  children: ReactNode;
}) {
  return (
    <div className="wp-disclose-w">
      <button
        type="button"
        className="wp-disclose"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={onToggle}
      >
        <span className="wp-disclose-ic" aria-hidden="true">
          {glyph}
        </span>
        <span className="wp-disclose-lbl">{label}</span>
        {from != null && <span className="wp-disclose-from">{from}</span>}
        <span className="wp-disclose-verb">
          <Icon name="reset" /> {t.common.change}
        </span>
      </button>
      <Collapsible expanded={open}>
        {/* **`inert` while closed, and it is not decoration.** `Collapsible` never unmounts its
            children — that is its contract, so the transition has something to animate
            against — and `max-height: 0` hides a thing from the EYE only: collapsed, this
            panel's eight radios stay in the accessibility tree and in the tab order, so a
            screen reader would read out a chooser that is not on screen and a keyboard would
            land inside it. `inert` fixes both and costs no layout, which is why it goes here
            rather than as `hidden` (that would kill the height transition) and rather than
            inside `Collapsible` (four other call sites, none of which is a radiogroup — a
            shared-primitive change to make on its own evidence, not smuggled in here). */}
        <div className="wp-disclose-panel" inert={!open}>
          {children}
        </div>
      </Collapsible>
    </div>
  );
}

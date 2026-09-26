// The done chip — `היינו ✓` — on both day surfaces: Trip's `EventCard` and Plan's archive row
// (ADR-0230 §1, ADR-0240 §5). One chip, so the word, the mark, the hue and the undo cannot
// differ between the two rows that say one fact.
//
// **AND WHERE THE ROW CAN BE TAKEN BACK THE CHIP IS ALSO THE CONTROL** (ADR-0230 §1). One verb
// was spelled four ways — the label, a ✓ circle on the face, a `שחזור` button in the verb band,
// and Plan's own circle — and the circle's meaning lived in a `hover`/`focus-visible` morph,
// neither of which a phone tap produces (ADR-0017). The chip already carries the word, so it is
// the one mark that explains itself.
//
// A `role="button"` SPAN, not a `<button>`: both hosts are buttons themselves, and a nested
// button is invalid HTML — the parser closes the outer and reparents the rest
// (`frontend/CLAUDE.md`; the first render of ADR-0230's mockup grew the card +64px proving it).
import type { HTMLAttributes } from 'react';
import { Icon } from '../Icon';
import { t } from '../../i18n/he';
import './done-chip.css';

export function DoneChip({ onUndo }: { onUndo?: () => void }) {
  const undo = (e: { preventDefault: () => void; stopPropagation: () => void }) => {
    e.preventDefault();
    e.stopPropagation();
    onUndo?.();
  };
  // Everything the chip needs to BE the control, or nothing. `title` as well as `aria-label`,
  // because `היינו ✓` names the state and the tap does the opposite of it.
  const control: HTMLAttributes<HTMLSpanElement> = onUndo
    ? {
        role: 'button',
        tabIndex: 0,
        'aria-label': t.actions.undoDone,
        title: t.actions.undoDone,
        onClick: undo,
        onKeyDown: (e) => {
          if (e.key === 'Enter' || e.key === ' ') undo(e);
        },
      }
    : {};
  return (
    <span className={`wp-event-tag-done${onUndo ? ' btn' : ''}`} {...control}>
      <Icon name="check" /> {t.event.didThis}
    </span>
  );
}

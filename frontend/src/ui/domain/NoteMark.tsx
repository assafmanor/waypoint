// **The mark a host's row carries** (ADR-0153 §6). One shape everywhere — the same
// `clipboard` `Icon` the notes tile and the empty state use — so "note" has ONE silhouette
// across the app. An `Icon` and not an emoji because it is a UI mark, not the thing's own
// face; the category badge beside it stays emoji for exactly the same reason, inverted
// (ADR-0138).
//
// A count only past 1: a `1` beside a glyph that already means "a note" is a digit that
// says nothing.
//
// It is a **read-only indicator**, not a tap target (§8): ~16px against a 44px floor, and
// widening it would put it in competition with opening the row it sits in. The reach goes
// through controls that already meet the floor — the row menu, the detail surface's
// section, `＋ פתק`, and the notes screen.
//
// Named for a screen reader the way `SyncBadge` does it (`role="img"` + `aria-label` +
// `title`, icon `aria-hidden`), so it is not a mystery glyph.
import { Icon } from '../Icon';
import { t } from '../../i18n/he';
import '../notes.css';

export function NoteMark({ count, className }: { count?: number; className?: string }) {
  if (!count) return null;
  const label = t.notes.mark(count);
  return (
    <span
      className={'note-mark' + (className ? ` ${className}` : '')}
      role="img"
      aria-label={label}
      title={label}
    >
      <Icon name="clipboard" />
      {count > 1 ? count : ''}
    </span>
  );
}

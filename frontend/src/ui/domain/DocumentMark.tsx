// **The mark a host's row carries when it holds a FILE** (ADR-0174 §1). `NoteMark`'s exact
// shape, size, count rule and a11y contract, with the app's own `documents` silhouette —
// and copying those rather than re-deciding them is `NoteMark`'s own stated reason: one
// shape everywhere, so "document" has ONE silhouette across the app, the same one the attach
// control, the picker and the Index tile already draw.
//
// **Two marks and not one combined "has content" glyph.** They are not the same promise — a
// note is something a person WROTE, a document is a file you may have to SHOW SOMEONE AT A
// BORDER — and one glyph cannot say which of the two a tap will get you.
//
// A **read-only indicator**, not a tap target, on ADR-0152 §8's argument unchanged: ~16px
// against a 44px floor, and widening it would put it in competition with opening the row it
// sits in. The reach is the row's own open — the expanded card, the detail sheet, the lifted
// hero — never the mark.
import { Icon } from '../Icon';
import { t } from '../../i18n/he';
import '../attach.css';

export function DocumentMark({ count, className }: { count?: number; className?: string }) {
  if (!count) return null;
  const label = t.docs.mark(count);
  return (
    <span
      className={'doc-mark' + (className ? ` ${className}` : '')}
      role="img"
      aria-label={label}
      title={label}
    >
      <Icon name="documents" />
      {count > 1 ? count : ''}
    </span>
  );
}

// The bookings/documents sub-screen header (ADR-0100 §1): the back button and
// the screen's trailing fact (booking count / documents' encrypted badge)
// share ONE compact `idx-head` row instead of a separate back-row plus a
// second title/count row — the two-row version read as an oversized,
// mostly-blank block right under the header. `idx-head-start` groups the
// back button + the screen's own title (ADR-0101: "הזמנות"/"מסמכים", not the
// generic "אינדקס" — each dedicated screen names what's actually open) so the
// arrow reads as "go back from THIS screen," not a floating unrelated
// control; the icon button's onClick is the same `onClose` the screen passed
// to `useOverlay`, so a direct tap and a back/gesture/system-back land on the
// exact same landing-return path. Shared by both dedicated screens so it
// isn't a second copy of the same header — any future dedicated screen reuses
// it by passing its own `title`.
import type { ReactNode } from 'react';
import { NavArrow } from './NavArrow';
import { t } from '../i18n/he';

export function IndexBackRow({
  title,
  onBack,
  end,
}: {
  title: string;
  onBack: () => void;
  end?: ReactNode;
}) {
  return (
    <div className="idx-head">
      <div className="idx-head-start">
        <button
          type="button"
          className="back-icon-btn"
          onClick={onBack}
          aria-label={t.index.backAria}
        >
          <NavArrow variant="back" />
        </button>
        <span className="idx-head-title">{title}</span>
      </div>
      {end}
    </div>
  );
}

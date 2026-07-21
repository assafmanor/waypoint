// The bookings/documents sub-screen header (ADR-0098 §5): an icon-only back
// button + adjacent label, matching the shipped `.back` pattern (TripSettings/
// AllTrips) — here the icon button's onClick is the same `onClose` the screen
// passed to `useOverlay`, so a direct tap and a back/gesture/system-back land
// on the exact same landing-return path. Shared by both dedicated screens so
// it isn't a second copy of the same three-line header.
import { NavArrow } from './NavArrow';
import { t } from '../i18n/he';

export function IndexBackRow({ onBack }: { onBack: () => void }) {
  return (
    <div className="back-row">
      <button
        type="button"
        className="back-icon-btn"
        onClick={onBack}
        aria-label={t.index.backAria}
      >
        <NavArrow variant="back" />
      </button>
      <span className="back-label">{t.index.back}</span>
    </div>
  );
}

// StatusBanner — an inline banner for offline / stale / status messages
// (ADR-0078, U-10). Generalizes the ad-hoc `.offline-badge`; `tone` maps to the
// Wave-0 status tokens (never amber/teal/plan). Polite live-region so a state
// change (e.g. going offline) is announced without interrupting. Optional dismiss.
import type { ReactNode } from 'react';
import type { BannerTone, FeedbackAction } from './types';
import { t } from '../../i18n/he';
import { Icon } from '../Icon';

export function StatusBanner({
  tone = 'neutral',
  children,
  action,
  onDismiss,
}: {
  tone?: BannerTone;
  children: ReactNode;
  /** The family's shared CTA shape (`./types`), which this banner was always
   *  declared to share and until ADR-0181 never took. A status the user can
   *  *act* on (reload for the new build) needs the verb inside the banner —
   *  a second component beside it would be the seventh one-off ADR-0078 collected. */
  action?: FeedbackAction;
  onDismiss?: () => void;
}) {
  return (
    <div className={`fb-banner fb-banner-${tone}`} role="status" aria-live="polite">
      <span className="fb-banner-text">{children}</span>
      {action && (
        <button type="button" className="fb-banner-action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
      {onDismiss && (
        <button
          type="button"
          className="fb-banner-dismiss"
          onClick={onDismiss}
          aria-label={t.feedback.dismiss}
        >
          <Icon name="close" />
        </button>
      )}
    </div>
  );
}

// StatusBanner — an inline banner for offline / stale / status messages
// (ADR-0078, U-10). Generalizes the ad-hoc `.offline-badge`; `tone` maps to the
// Wave-0 status tokens (never amber/teal/plan). Polite live-region so a state
// change (e.g. going offline) is announced without interrupting. Optional dismiss.
import type { ReactNode } from 'react';
import type { BannerTone } from './types';
import { t } from '../../i18n/he';

export function StatusBanner({
  tone = 'neutral',
  children,
  onDismiss,
}: {
  tone?: BannerTone;
  children: ReactNode;
  onDismiss?: () => void;
}) {
  return (
    <div className={`fb-banner fb-banner-${tone}`} role="status" aria-live="polite">
      <span className="fb-banner-text">{children}</span>
      {onDismiss && (
        <button
          type="button"
          className="fb-banner-dismiss"
          onClick={onDismiss}
          aria-label={t.feedback.dismiss}
        >
          ✕
        </button>
      )}
    </div>
  );
}

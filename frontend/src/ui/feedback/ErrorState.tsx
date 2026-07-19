// ErrorState — titled error with an OPTIONAL retry (ADR-0078, U-10). This is what
// the retry-less snapshot dead-end will use once screens migrate. The title
// carries role="alert" so a screen-reader announces the failure; the retry button
// only renders when the caller can actually recover.
import type { ReactNode } from 'react';
import { Icon } from '../Icon';
import { t } from '../../i18n/he';

export function ErrorState({
  title,
  body,
  onRetry,
  retryLabel,
}: {
  title: string;
  body?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="fb-error">
      <div className="fb-error-icon" aria-hidden="true">
        ⚠️
      </div>
      <p className="fb-error-title" role="alert">
        {title}
      </p>
      {body != null && <p className="fb-error-body">{body}</p>}
      {onRetry && (
        <button type="button" className="fb-error-retry" onClick={onRetry}>
          <Icon name="reset" />
          {retryLabel ?? t.feedback.retry}
        </button>
      )}
    </div>
  );
}

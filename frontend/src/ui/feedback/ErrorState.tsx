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
  size = 'md',
}: {
  title: string;
  body?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  /** `'pane'` for an error state that owns a whole region rather than sitting in a
   *  list's flow — `EmptyState`'s own `size` prop (ADR-0078), one sibling over: the
   *  Map's canvas slot (field report #28) is the first caller. */
  size?: 'md' | 'pane';
}) {
  return (
    <div className={size === 'pane' ? 'fb-error fb-error-pane' : 'fb-error'}>
      <div className="fb-error-icon" aria-hidden="true">
        <Icon name="warn" />
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

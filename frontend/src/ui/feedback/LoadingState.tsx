// LoadingState — a labelled loading cue that composes the shared Spinner (ADR-0052)
// with an optional skeleton (ADR-0078, U-10). Body-level: it renders INSIDE the
// AppShell chrome, not full-screen, so a trip-switch keeps its header/tab frame
// instead of flashing a centered <h1>. The Spinner is the single announced
// live-region (role="status"); the visible label is mirrored into it and hidden
// from the a11y tree so the loading state announces exactly once.
import type { ReactNode } from 'react';
import { Spinner } from '../Spinner';
import { t } from '../../i18n/he';

export function LoadingState({ label, skeleton }: { label?: string; skeleton?: ReactNode }) {
  const text = label ?? t.feedback.loading;
  return (
    <div className="fb-loading">
      {skeleton != null && <div className="fb-loading-skel">{skeleton}</div>}
      <div className="fb-loading-cue">
        <Spinner className="ink" label={text} />
        <span className="fb-loading-label" aria-hidden="true">
          {text}
        </span>
      </div>
    </div>
  );
}

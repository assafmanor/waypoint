// EmptyState — the one shared empty shell (ADR-0078, U-10). Screens pass the
// CONTENT (icon/copy/CTA); this owns the SHELL. Body-level: it renders inside the
// AppShell chrome, never full-screen. Calm, teaching tone — the app never
// dead-ends, so it can hand back a next step via `action`.
import type { ReactNode } from 'react';
import type { FeedbackAction } from './types';

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  // Decorative — announced content lives in title/body, so the icon is hidden.
  icon?: ReactNode;
  title: string;
  body?: ReactNode;
  action?: FeedbackAction;
}) {
  return (
    <div className="fb-empty">
      {icon != null && (
        <div className="fb-empty-icon" aria-hidden="true">
          {icon}
        </div>
      )}
      <p className="fb-empty-title">{title}</p>
      {body != null && <p className="fb-empty-body">{body}</p>}
      {action && (
        <button type="button" className="fb-empty-action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}

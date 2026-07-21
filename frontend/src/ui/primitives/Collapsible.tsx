// Shared expand/collapse mechanism (ADR-0098 reuse audit): generalized out of
// PlanHome's showCompleted/.chk-toggle pattern so the Index's past-bookings
// collapse doesn't grow a second one-off copy. `CollapseToggle` is the
// count-in-label button (`t.x.showY(n)` / `t.x.hideY`); `Collapsible` is the
// animated container — max-height + opacity, never a `display:none` snap, so
// PlanHome's checklist gains the same open/shut motion as a side effect.
// prefers-reduced-motion turns the transition off via the existing global
// wildcard (App.css), so no extra handling is needed here.
import { type ReactNode } from 'react';
import './collapsible.css';

export function CollapseToggle({
  expanded,
  onToggle,
  expandLabel,
  collapseLabel,
  className,
}: {
  expanded: boolean;
  onToggle: () => void;
  /** Shown while collapsed — typically carries the hidden count ("הצג הזמנות מהעבר (5)"). */
  expandLabel: string;
  /** Shown while expanded ("הסתר הזמנות מהעבר"). */
  collapseLabel: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={'wp-collapse-toggle' + (className ? ` ${className}` : '')}
      onClick={onToggle}
      aria-expanded={expanded}
    >
      {expanded ? collapseLabel : expandLabel}
    </button>
  );
}

export function Collapsible({
  expanded,
  children,
  className,
}: {
  expanded: boolean;
  /** Always rendered (never unmounted) so the max-height transition has content
   *  to animate against instead of popping in after the fact. */
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={'wp-collapsible' + (expanded ? ' on' : '') + (className ? ` ${className}` : '')}
    >
      {children}
    </div>
  );
}

// The render half of the shared filter/search reveal (ADR-0120): `lib/
// filter-reveal.ts` decides which rows match and what each one's stagger delay
// is, this wraps them so they collapse/expand instead of appearing and
// disappearing. Both halves are generic — a surface supplies its own rows and
// its own predicate, and gets the motion for free.
//
// A hidden row stays mounted (that's what lets it animate out), so it is
// `inert`: out of the a11y tree, unfocusable, untappable. Without that, a
// filtered-out row is still reachable by keyboard and still read aloud — the
// row is gone visually and present to everyone else.
import { Fragment, type ReactNode } from 'react';
import type { Revealed } from '../../lib/filter-reveal';
import './reveal-list.css';

export function RevealRow({
  visible,
  delayMs,
  className,
  children,
}: {
  visible: boolean;
  /** From `revealRows` — the per-row stagger, already capped. */
  delayMs: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={'wp-reveal' + (visible ? '' : ' hidden') + (className ? ' ' + className : '')}
      style={{ transitionDelay: `${delayMs}ms` }}
      inert={!visible}
    >
      {/* The wrapper the collapse needs — see `reveal-list.css`. */}
      <div className="wp-reveal-inner">{children}</div>
    </div>
  );
}

export function RevealList<T>({
  rows,
  getKey,
  renderRow,
  renderBefore,
  className,
}: {
  rows: Revealed<T>[];
  getKey: (item: T) => string;
  renderRow: (item: T) => ReactNode;
  /** Optional non-row content emitted **outside** the collapsing wrapper, e.g. a
   *  group header. It reads the row's index, so a caller that derives headers
   *  from the visible rows only (as it must) can place them itself. */
  renderBefore?: (item: T, index: number) => ReactNode;
  /** The list container's own class (`listcard`, `map-list`, …). */
  className?: string;
}) {
  return (
    <div className={className}>
      {rows.map(({ item, visible, delayMs }, i) => (
        <Fragment key={getKey(item)}>
          {renderBefore?.(item, i)}
          <RevealRow visible={visible} delayMs={delayMs}>
            {renderRow(item)}
          </RevealRow>
        </Fragment>
      ))}
    </div>
  );
}

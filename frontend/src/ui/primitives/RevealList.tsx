// The render half of the shared list-change motion (ADR-0120): `lib/
// filter-reveal.ts` decides which rows match and what each one's stagger delay
// is, this wraps them so they collapse/expand instead of appearing and
// disappearing — and `lib/useFlipRows.ts` slides the rows that merely moved, so
// a re-order animates too (session-130). Every half is generic: a surface
// supplies its own rows, its own predicate, and its own order, and gets the
// motion for free.
//
// A hidden row stays mounted (that's what lets it animate out), so it is
// `inert`: out of the a11y tree, unfocusable, untappable. Without that, a
// filtered-out row is still reachable by keyboard and still read aloud — the
// row is gone visually and present to everyone else.
import { Fragment, useRef, type ReactNode } from 'react';
import type { Revealed } from '../../lib/filter-reveal';
import { FLIP_KEY_ATTR, useFlipRows } from '../../lib/useFlipRows';
import './reveal-list.css';

export function RevealRow({
  visible,
  delayMs,
  className,
  flipKey,
  children,
}: {
  visible: boolean;
  /** From `revealRows` — the per-row stagger, already capped. */
  delayMs: number;
  className?: string;
  /** Identity for the move animation; only a visible row can be seen moving. */
  flipKey?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={'wp-reveal' + (visible ? '' : ' hidden') + (className ? ' ' + className : '')}
      style={{ transitionDelay: `${delayMs}ms` }}
      inert={!visible}
      {...(visible && flipKey ? { [FLIP_KEY_ATTR]: flipKey } : {})}
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
  const container = useRef<HTMLDivElement>(null);
  // What "the list changed" means here: which rows are on screen, in what order.
  // Anything else (a clock tick re-render) must not cost a layout measurement.
  useFlipRows(container, rows.map(({ item, visible }) => (visible ? getKey(item) : '')).join('\n'));

  return (
    <div className={className} ref={container}>
      {rows.map(({ item, visible, delayMs }, i) => (
        <Fragment key={getKey(item)}>
          {renderBefore?.(item, i)}
          <RevealRow visible={visible} delayMs={delayMs} flipKey={getKey(item)}>
            {renderRow(item)}
          </RevealRow>
        </Fragment>
      ))}
    </div>
  );
}

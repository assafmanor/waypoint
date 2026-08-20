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

/** The class every row wrapper carries — exported because the query below is about it, and a
 *  caller that needs to ask "is this list still moving" must not hand-write the selector. */
export const REVEAL_ROW_CLASS = 'wp-reveal';

/**
 * **Is any row inside `scope` still animating its own height?** — i.e. is the list's LAYOUT
 * still changing (2026-08-20).
 *
 * It exists for one caller and one defect, and the defect is worth stating because nothing
 * about it is visible in a rect: `scrollIntoView` computes its destination **once, clamped to
 * the scroll extent that exists at that moment**. A row revealing from `0fr` has not yet
 * contributed its own height to that extent, so a scroll aimed at it while the reveal runs is
 * silently truncated — the list stops short by roughly the height of whatever was still
 * arriving, and nothing re-fires. Measured on the Map: extent 328px at the call, 666px once
 * the row was open, and the scroll stopped at 303 of the 624 it needed.
 *
 * Both phases of the motion count as moving, which is the reason this reads the animations
 * rather than the boxes: a row inside its `transition-delay` (`revealDelayMs`'s stagger) has
 * height 0 and is not changing yet, so any "has it stopped growing" test reports it settled
 * one frame before it starts. A pending CSS transition is `running`, so this does not.
 *
 * Scoped to the wrappers themselves, never `getAnimations({ subtree: true })`: rows hold
 * decorative infinite animations (the Map's `map-row-now` pulse), and a subtree read would
 * report a list that never settles. `getAnimations` is absent in jsdom, where there is no
 * motion to wait for either — so "not moving" is the right answer there, not a crash.
 */
export function revealsRunning(scope: ParentNode): boolean {
  return [...scope.querySelectorAll(`.${REVEAL_ROW_CLASS}`)].some(
    (el) =>
      typeof el.getAnimations === 'function' &&
      el.getAnimations().some((a) => a.playState === 'running'),
  );
}

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
      className={REVEAL_ROW_CLASS + (visible ? '' : ' hidden') + (className ? ' ' + className : '')}
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

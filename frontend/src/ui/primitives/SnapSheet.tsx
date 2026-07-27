// A sheet that lives INSIDE a pane, on a snap-height axis (ADR-0121 §5).
//
// **It is not an overlay, and that is the point.** It renders inline, whatever is
// behind it stays interactive, and nothing dismisses it — so it goes through
// neither `Modal` nor `useOverlay`, and registers nothing with the back stack.
// Back leaves the screen at any height, because the height is view state like a
// filter chip beside it; registering it would make back mean "shrink the sheet" on
// exactly one surface, which is the unpredictability ADR-0103's typed-layer model
// exists to prevent. (The same reading ADR-0109's session-105 amendment applied to
// the geolocation pre-prompt: inline, not overlay.)
//
// Generic mechanics with no trip-domain shape, so it is a primitive: the caller
// owns the stops, the current stop, the header content, and the scrolling body.
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { clampToStops, nearestStop, stopHeightCss, type SnapStop } from '../../lib/snap-sheet';
import { useSnapDrag } from '../../lib/useSnapDrag';
import './snap-sheet.css';

export function SnapSheet<T extends string>({
  stops,
  order,
  view,
  onViewChange,
  grabLabel,
  stopLabels,
  header,
  children,
  className,
}: {
  stops: Record<T, SnapStop>;
  /** The stops in low → high order; the drag clamps to the outermost two. */
  order: readonly T[];
  /** The current stop. One state, so a drag and any shortcut control (a toggle)
   *  cannot disagree about where the sheet is. */
  view: T;
  onViewChange: (view: T) => void;
  /** Accessible name for the splitter — the gesture's affordance and its keyboard. */
  grabLabel: string;
  /** What each stop is called, read out as the splitter's `aria-valuetext`. Without
   *  it a screen reader gets "1 of 3", which says nothing about what the sheet is
   *  showing. */
  stopLabels?: Record<T, string>;
  /** Fixed content in the top region, beside the grab line (ADR-0122 §4: the region
   *  is a real row now — the view toggle and the list's own sort control live here). */
  header?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  // The live height WHILE dragging, in px. `null` at rest, which is what hands the
  // height back to CSS so the snap animates instead of being set imperatively.
  const [dragPx, setDragPx] = useState<number | null>(null);

  const containerPx = useCallback(() => root.current?.parentElement?.clientHeight ?? 0, []);
  const currentPx = useCallback(() => root.current?.getBoundingClientRect().height ?? 0, []);

  const drag = useSnapDrag({
    heightPx: currentPx,
    onDrag: (px) => setDragPx(clampToStops(px, containerPx(), stops, order)),
    onRelease: (px, velocity) => {
      const container = containerPx();
      setDragPx(null);
      onViewChange(
        nearestStop(clampToStops(px, container, stops, order), container, stops, order, velocity),
      );
    },
  });

  // A resize mid-drag would leave the live height clamped against a container
  // that no longer exists (a rotation, an on-screen keyboard). Drop back to the
  // snapped height rather than carrying a stale pixel number.
  useEffect(() => {
    if (dragPx == null) return;
    const drop = () => setDragPx(null);
    window.addEventListener('resize', drop);
    return () => window.removeEventListener('resize', drop);
  }, [dragPx]);

  // The splitter's keyboard, which is the whole reason for the role: arrows move one
  // stop, Home/End go to the extremes. As a focusable button that did nothing on a
  // keyboard, the middle stop was unreachable without a pointer (ADR-0122 §4).
  const index = order.indexOf(view);
  const onKeyDown = (e: React.KeyboardEvent) => {
    const to =
      e.key === 'ArrowUp'
        ? Math.min(index + 1, order.length - 1)
        : e.key === 'ArrowDown'
          ? Math.max(index - 1, 0)
          : e.key === 'End'
            ? order.length - 1
            : e.key === 'Home'
              ? 0
              : null;
    if (to == null) return;
    e.preventDefault();
    onViewChange(order[to]);
  };

  return (
    <div
      ref={root}
      className={
        'wp-snapsheet' + (dragPx != null ? ' dragging' : '') + (className ? ' ' + className : '')
      }
      // The resting height is declarative (`--snap-h`), so the browser animates the
      // snap; the live drag height overrides it imperatively and drops back to
      // `null` on release, which is what makes the release animate.
      style={
        {
          '--snap-h': stopHeightCss(stops[view]),
          ...(dragPx != null ? { height: `${dragPx}px` } : null),
        } as CSSProperties
      }
      data-view={view}
    >
      {/* The whole top region is the drag target, not the grab line inside it: 76×16px
          is under ADR-0017's touch floor, where this is 390×51 (ADR-0122 §4). */}
      <div className="wp-snapsheet-top" {...drag}>
        <button
          type="button"
          className="wp-snapsheet-grab"
          // A real ARIA splitter, not a button that happens to look like a handle: the
          // height axis is a value with a min, a max and a current position, and that
          // is what a `separator` reports.
          role="separator"
          aria-orientation="horizontal"
          aria-label={grabLabel}
          aria-valuemin={0}
          aria-valuemax={order.length - 1}
          aria-valuenow={index}
          aria-valuetext={stopLabels?.[view]}
          tabIndex={0}
          title={grabLabel}
          onKeyDown={onKeyDown}
        >
          <span className="wp-snapsheet-grabline" aria-hidden="true" />
        </button>
        {header && <div className="wp-snapsheet-headrow">{header}</div>}
      </div>
      <div className="wp-snapsheet-body">{children}</div>
    </div>
  );
}

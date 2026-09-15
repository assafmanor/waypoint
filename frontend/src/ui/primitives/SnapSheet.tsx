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
import { scrollerWithin } from '../../lib/scrollable';
import { SNAP_CLAIM, useSnapDrag } from '../../lib/useSnapDrag';
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

  const onRelease = (px: number, velocity: number) => {
    const container = containerPx();
    setDragPx(null);
    onViewChange(
      nearestStop(clampToStops(px, container, stops, order), container, stops, order, velocity),
    );
  };

  const drag = useSnapDrag({
    heightPx: currentPx,
    onDrag: (px) => setDragPx(clampToStops(px, containerPx(), stops, order)),
    onRelease,
  });

  /** **THE LIST SCROLLS FIRST; THE SHEET MOVES ONLY ONCE THE LIST HAS NOTHING LEFT TO SCROLL
   *  THAT WAY** (ADR-0122 §4's 2026-09-15 amendment, as corrected the same day by the owner:
   *  _"I want it to scroll first and only when there's nothing more to scroll then it goes to
   *  switch to full list"_).
   *
   *  One question decides every vertical press on the body, and it is asked of the LIST, not
   *  the sheet: **can it still scroll the way the finger is going?** If it can, the gesture is
   *  the browser's pan, and the hook watches it until the list runs out — at which point the
   *  same finger starts moving the sheet (`handoff`). If it cannot — a finger going up with the
   *  list already at its bottom, a finger going down with the list at its top, or a list that
   *  fits and so is at both ends at once — the sheet moves from the first pixel. So from
   *  `half` a long drag up reads the rest of the list and then opens it, in one motion.
   *
   *  The reasons are read LIVE from the DOM at each decision, never off state: the DOM cannot
   *  be a frame behind the way state can, and the Map's sheet re-renders every second. */
  const bodyRef = useRef<HTMLDivElement>(null);
  const listAtEnd = (dy: number) => {
    const body = bodyRef.current;
    if (!body) return true;
    return dy < 0
      ? body.scrollTop >= body.scrollHeight - body.clientHeight - SCROLL_END_EPSILON_PX
      : body.scrollTop <= 0;
  };
  const bodyDrag = useSnapDrag({
    heightPx: currentPx,
    claim: ({ dx, dy }) => {
      // Vertical-dominant or nothing: a sideways finger is a strip's, or a text selection's.
      if (Math.abs(dx) > Math.abs(dy)) return SNAP_CLAIM.none;
      return listAtEnd(dy) ? SNAP_CLAIM.sheet : SNAP_CLAIM.list;
    },
    handoff: listAtEnd,
    onDrag: (px) => setDragPx(clampToStops(px, containerPx(), stops, order)),
    onRelease,
  });

  /** The body's own press, gated on the two things that make it nobody's drag at all — the
   *  direction rule above is asked later, at the slop, once there is a direction to ask about. */
  const onBodyPointerDown = (e: React.PointerEvent) => {
    const body = bodyRef.current;
    const target = e.target as HTMLElement;
    if (!body) return;
    // 1. Something INSIDE it scrolls on this axis → the press is that scroller's. `boundary` is
    //    the body itself, which is why the walk has to stop below it: the body is an
    //    `overflow-y: auto` box, so a walk that included it would always find one.
    if (scrollerWithin(target, body, 'block')) return;
    // 2. The press is on text the user may be selecting or a field they may be caretting into.
    //    A sheet that moves when you try to place a cursor is worse than no gesture at all —
    //    and the Map's sheet holds a note composer on every selected row.
    if (target.closest('input, textarea, select, [contenteditable]')) return;
    bodyDrag.onPointerDown(e);
  };

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
      {/* **THE BODY SCROLLS FIRST AND DRAGS THE SHEET ONCE IT HAS NOTHING LEFT TO SCROLL** (ADR-0122
          §4's 2026-09-15 amendment; the rule is on `bodyDrag` above). It carries NO
          `touch-action` of its own: whose the pan is gets decided per gesture, at the slop, and
          the hand-off at the list's end rides the same touch — `touch-action` would have to be
          decided before the finger has moved, which is before anything that decides it exists. */}
      <div ref={bodyRef} className="wp-snapsheet-body" onPointerDown={onBodyPointerDown}>
        {children}
      </div>
    </div>
  );
}

/** A sub-pixel short of the bottom is the bottom: `scrollHeight` is an integer and `scrollTop`
 *  need not be, so without the slack a list at its end would keep the gesture for nothing. */
const SCROLL_END_EPSILON_PX = 1;

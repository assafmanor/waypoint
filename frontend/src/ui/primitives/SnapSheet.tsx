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
import {
  clampToStops,
  nearestStop,
  stopHeightCss,
  stopsRangePx,
  type SnapStop,
} from '../../lib/snap-sheet';
import { scrollerWithin } from '../../lib/scrollable';
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

  /** **THE BODY TAKES A VERTICAL DRAG EXACTLY WHEN THE LIST CANNOT USE IT THAT WAY** (ADR-0122
   *  §4's 2026-09-15 amendment, replacing the 2026-08-06 rule "the body drags while it cannot
   *  scroll" — which was this rule in the one case where both directions answer the same).
   *
   *  One sentence decides every press: **up is the sheet's while the sheet can still grow;
   *  down is the sheet's while the list is at its top.** Everything else is the list's own
   *  scroll, and the hook stands down without touching it. So from `half` a drag up opens the
   *  list rather than scrolling it (nothing scrolls until the sheet is as tall as it gets),
   *  at `full` a drag up scrolls, and a drag down from a list at its top closes the sheet —
   *  the hand-off every native bottom sheet makes, and the one the `touch-action` version
   *  could not, because `touch-action` is read before the direction exists.
   *
   *  The reasons are read LIVE at the press and at the slop, never off state: the DOM cannot
   *  be a frame behind the way state can, and the Map's sheet re-renders every second. */
  const bodyRef = useRef<HTMLDivElement>(null);
  /** Where the list's scroll stood at the press — the base the continuation below adds to. */
  const scrollAtPress = useRef(0);
  const bodyDrag = useSnapDrag({
    heightPx: currentPx,
    claim: ({ dx, dy }) => {
      const body = bodyRef.current;
      if (!body) return false;
      // Vertical-dominant or nothing: a sideways finger is a strip's, or a text selection's.
      if (Math.abs(dx) > Math.abs(dy)) return false;
      if (dy < 0) {
        const { max } = stopsRangePx(containerPx(), stops, order);
        return currentPx() < max - GROW_EPSILON_PX;
      }
      return body.scrollTop <= 0;
    },
    onDrag: (px) => {
      const clamped = clampToStops(px, containerPx(), stops, order);
      setDragPx(clamped);
      // **The travel the clamp refuses is handed to the list.** A drag up that reaches the top
      // stop keeps following the finger as a scroll, so one gesture from `half` both opens the
      // list and starts reading it — and coming back down unwinds the scroll before the sheet
      // moves, which is the same statement in reverse. Scroll from the press's base, never by
      // deltas, so nothing accumulates across frames the browser clamped.
      const body = bodyRef.current;
      if (body) body.scrollTop = scrollAtPress.current + Math.max(0, px - clamped);
    },
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
    scrollAtPress.current = body.scrollTop;
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
      {/* **THE BODY IS A DRAG TARGET WHEN THE LIST CANNOT USE THE GESTURE THAT WAY** (ADR-0122
          §4's 2026-09-15 amendment; the rule is on `bodyDrag` above). It carries NO
          `touch-action` of its own: the pan is arbitrated per gesture, at the slop, by a
          `preventDefault` on the `touchmove` — `touch-action` would have to be decided before
          the finger has moved, which is before the direction that decides it exists. */}
      <div ref={bodyRef} className="wp-snapsheet-body" onPointerDown={onBodyPointerDown}>
        {children}
      </div>
    </div>
  );
}

/** A sub-pixel of headroom is not "room to grow": a fractional stop height and a rounded
 *  rect would otherwise let a drag up at the top stop claim a list's scroll for nothing. */
const GROW_EPSILON_PX = 1;

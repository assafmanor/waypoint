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
import { observeResize } from '../../lib/observe-resize';
import { scrollerWithin, scrollsOn } from '../../lib/scrollable';
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

  /** **Whether the BODY is currently a drag target** — true exactly while it cannot scroll.
   *
   *  State rather than a live read because its consumer is `touch-action`, which the browser
   *  evaluates when a gesture STARTS: an attribute set on `pointerdown` is already too late.
   *  Maintained by a `ResizeObserver`, so it costs nothing per render — which matters on the
   *  Map, whose sheet re-renders every second on the clock and whose one hard rule is that no
   *  height may depend on a layout read (ADR-0121 §5). An observer fires when a box actually
   *  changes, and the clock does not change one. */
  const [bodyDrags, setBodyDrags] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const read = () => setBodyDrags(!scrollsOn(body, 'block'));
    // The one-shot read is what correctness depends on; the observer keeps it true after.
    read();
    // **The body AND its content**, because they answer different halves of one question: the
    // body's box changes when the sheet snaps to another stop, and the content's when rows
    // arrive, a row is selected (which grows it severalfold) or a filter empties the list.
    // Observing only the body would keep `touch-action: none` on a list that had just grown
    // past the port, which is the one state this must never be wrong about.
    return observeResize([body, ...body.children], read);
    // Re-subscribed when the children change identity, so a caller swapping its content
    // (`searching` flips the Map's sheet between two different trees) is observed too.
  }, [children]);

  /** The body's own press, gated on the two things that make it not ours (ADR-0122 §4).
   *
   *  The reasons are read LIVE rather than off `bodyDrags`: this is the decision, and the DOM
   *  cannot be a frame behind the way state can. */
  const onBodyPointerDown = (e: React.PointerEvent) => {
    const body = bodyRef.current;
    const target = e.target as HTMLElement;
    if (!body) return;
    // 1. It scrolls → the press is the list's. Nothing here competes with a scroll.
    if (scrollsOn(body, 'block')) return;
    // 2. Something INSIDE it scrolls on this axis → the press is that scroller's. `boundary` is
    //    the body itself, which is why the walk has to stop below it: the body is an
    //    `overflow-y: auto` box, so a walk that included it would always find one.
    if (scrollerWithin(target, body, 'block')) return;
    // 3. The press is on text the user may be selecting or a field they may be caretting into.
    //    A sheet that moves when you try to place a cursor is worse than no gesture at all —
    //    and the Map's sheet holds a note composer on every selected row.
    if (target.closest('input, textarea, select, [contenteditable]')) return;
    drag.onPointerDown(e);
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
      {/* **THE BODY IS A DRAG TARGET EXACTLY WHILE IT CANNOT SCROLL** (ADR-0122 §4's 2026-08-06
          amendment; owner: _"when the list doesn't scroll (or there's text that's not list items,
          for example the empty state has a glyph+text that doesn't allow us to scroll), we should
          be able to use the same gesture"_).

          **One fact decides it, and it is the fact that removes the hard problem.** Dragging from
          a scroller is genuinely hard: `touch-action: none` is what lets a drag be seen at all,
          and it is exactly what makes a list unscrollable — and the browser will not hand a
          native pan back once it has started one, so the choice cannot be deferred to the first
          move either. **None of that arises when the content fits**, because then no pan can
          start: there is nothing to scroll, so there is nothing to arbitrate against, and the
          whole body is as safe a target as the handle row above it.

          It replaced a `flex: 1` spacer that claimed only the space AFTER the content. That was
          the same idea reaching a subset of the same cases, and it under-delivered on the one the
          owner named first: an empty state is a tall glyph-and-text block, so it leaves little or
          no gap below itself while scrolling nothing. One rule covers both, and the flex column
          and its `flex-shrink` trap went with the spacer.

          `data-drag` and the live read are two readers of one fact, deliberately: the attribute
          carries `touch-action`, which the browser needs BEFORE the gesture starts, so it comes
          from an observer; the gate is the decision and must be current, so it reads the DOM at
          `pointerdown` and cannot be stale. */}
      <div
        ref={bodyRef}
        className="wp-snapsheet-body"
        {...(bodyDrags ? { 'data-drag': '' } : null)}
        onPointerDown={onBodyPointerDown}
      >
        {children}
      </div>
    </div>
  );
}

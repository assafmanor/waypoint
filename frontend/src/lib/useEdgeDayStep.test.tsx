// @vitest-environment jsdom
//
// The edge that names another day (ADR-0116 §2's 2026-08-22 amendment). Four things are worth
// pinning here and the dwell is not one of them — `useSpringLoadedDay` already owns that, and
// this hook only says WHICH day, which is the part with arithmetic in it:
//
//   1. **The mirror.** In RTL the next day lies to the LEFT, because that is where its peek
//      pane sits (`screens.css`). A hard-coded side here is a feature that works in one
//      direction on one layout, and the two ways of reaching tomorrow would disagree.
//   2. **The latch**, which is a transposed scar rather than caution: a row spans the surface,
//      so a card lifted from its end starts inside a band, and the days would begin flipping
//      under a finger that had not moved.
//   3. **The trip's ends**, where the neighbour is `null` and the edge must do nothing at all.
//   4. **Repeating.** Holding still steps again, and it does so because the neighbours changed
//      rather than because the finger moved — which is the one thing in here the dwell cannot
//      give for free.
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { useRef, type ReactNode } from 'react';
import {
  DRAG_DAY_DWELL_MS,
  DRAG_DAY_EDGE_PX,
  DRAG_DAY_LIFT_PX,
  DRAG_DAY_REVERSE_DWELL_MS,
  DRAG_DAY_REVERSE_MS,
  DRAG_EDGE_SCROLL_RELEASE_PX,
} from '../constants';
import { getNow, setSimulatedNow } from './useClock';
import { useEdgeDayStep, type DayNeighbours, type EdgeDayStep } from './useEdgeDayStep';
import type { SwipeStep } from './useSwipePager';

/** Every `hold` the hook issued, in order — the commanded lift is what §2d replaced v1's
 *  pane-painting with, so this log IS the contract. */
type Held = { step: SwipeStep | null; px?: number };

const WIDTH = 360;
const LEFT = 20;

/** jsdom lays nothing out, and every number here is measured off a box — so the host states
 *  one, the way `useSwipePager`'s own harness does. */
function Host({
  neighbours,
  rtl = true,
  held,
  children,
}: {
  neighbours: DayNeighbours;
  rtl?: boolean;
  held: Held[];
  children: (edge: EdgeDayStep) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  if (ref.current) {
    ref.current.getBoundingClientRect = () =>
      ({ left: LEFT, width: WIDTH, right: LEFT + WIDTH, top: 0, height: 640 }) as DOMRect;
  }
  const edge = useEdgeDayStep(ref, neighbours, (step, px) => held.push({ step, px }));
  return (
    <div ref={ref} style={{ direction: rtl ? 'rtl' : 'ltr' }}>
      {children(edge)}
    </div>
  );
}

/** The hook's value, re-read after every act — it is state, so a stale capture would assert
 *  the previous frame. */
function mount(neighbours: DayNeighbours, rtl = true) {
  let api: EdgeDayStep | null = null;
  const held: Held[] = [];
  const view = render(
    <Host neighbours={neighbours} rtl={rtl} held={held}>
      {(edge) => {
        api = edge;
        return null;
      }}
    </Host>,
  );
  const at = (x: number) => ({ clientX: LEFT + x, clientY: 300 });
  return {
    // A first render happened with no box (the ref was null), so re-render to let the harness
    // install one — the same order a real host has, where layout exists by the time a drag arms.
    settle: () =>
      act(() =>
        view.rerender(
          <Host neighbours={neighbours} rtl={rtl} held={held}>
            {(e) => {
              api = e;
              return null;
            }}
          </Host>,
        ),
      ),
    arm: (x: number) => act(() => api!.arm(at(x))),
    /** The commands issued so far, and the last one — which is the state the surface is in. */
    held: () => held,
    last: () => held[held.length - 1],
    track: (x: number) => act(() => api!.track(at(x))),
    /** What `PlanDay` calls the instant the dwell commands a turn. */
    turning: () => act(() => api!.turning()),
    stop: () => act(() => api!.stop()),
    date: () => api!.date,
    step: () => api!.step,
    dwell: () => api!.dwell,
    redraw: (next: DayNeighbours) =>
      act(() => {
        view.rerender(
          <Host neighbours={next} rtl={rtl} held={held}>
            {(e) => {
              api = e;
              return null;
            }}
          </Host>,
        );
      }),
  };
}

const PREV = '2026-08-21';
const NEXT = '2026-08-23';
const BOTH = { prev: PREV, next: NEXT };
/** Comfortably inside a band, and comfortably past the latch's release distance from the
 *  middle so a drag armed centrally is never gated. */
const AT_LOW = 4;
const AT_HIGH = WIDTH - 4;
const MIDDLE = WIDTH / 2;

afterEach(() => {
  cleanup();
  // One case pins the clock past the undo window (below); the rule is the suite's, not that
  // case's — a leaked `now` means every test after it reads a different one.
  setSimulatedNow(null);
});

describe('useEdgeDayStep', () => {
  it('names the NEXT day at the left edge and the PREVIOUS one at the right, in RTL', () => {
    const h = mount(BOTH);
    h.settle();
    h.arm(MIDDLE);
    h.track(AT_LOW);
    expect(h.date()).toBe(NEXT);
    h.track(AT_HIGH);
    expect(h.date()).toBe(PREV);
  });

  it('mirrors under ltr', () => {
    const h = mount(BOTH, false);
    h.settle();
    h.arm(MIDDLE);
    h.track(AT_LOW);
    expect(h.date()).toBe(PREV);
    h.track(AT_HIGH);
    expect(h.date()).toBe(NEXT);
  });

  it('names nothing from the middle', () => {
    const h = mount(BOTH);
    h.settle();
    h.arm(MIDDLE);
    h.track(MIDDLE);
    expect(h.date()).toBeNull();
    h.track(DRAG_DAY_EDGE_PX + 10);
    expect(h.date()).toBeNull();
  });

  // THE LATCH. A row spans the surface, so this is the ordinary case of picking a card up by
  // its end — not an edge case.
  it('says nothing about the band it was lifted in until the drag asks for it', () => {
    const h = mount(BOTH);
    h.settle();
    h.arm(AT_LOW);
    h.track(AT_LOW);
    expect(h.date()).toBeNull();
    // Still inside the band, not yet pushed far enough toward it to count as asking.
    h.track(AT_LOW - 2);
    expect(h.date()).toBeNull();
    // Leaving the band releases the latch, and coming back is then an ordinary approach.
    h.track(MIDDLE);
    h.track(AT_LOW);
    expect(h.date()).toBe(NEXT);
  });

  it('or until it pushes deeper into that band than it was lifted at', () => {
    const h = mount(BOTH);
    h.settle();
    const lifted = DRAG_DAY_EDGE_PX - 4;
    h.arm(lifted);
    h.track(lifted);
    expect(h.date()).toBeNull();
    h.track(lifted - DRAG_EDGE_SCROLL_RELEASE_PX);
    expect(h.date()).toBe(NEXT);
  });

  // The trip's ends, which is the same statement the swipe's rebuff makes: nothing arrives,
  // and no label is needed to say so.
  it('names nothing past the end of the trip', () => {
    const h = mount({ prev: PREV, next: null });
    h.settle();
    h.arm(MIDDLE);
    h.track(AT_LOW);
    expect(h.date()).toBeNull();
    h.track(AT_HIGH);
    expect(h.date()).toBe(PREV);
  });

  // **Holding still keeps stepping.** The finger does not move, so nothing calls `track` — the
  // day having changed under it is the whole input. Without the effect that recomputes on the
  // neighbours, the edge would step exactly once and then look broken.
  it('re-aims at the new neighbour when the day it named has arrived', () => {
    const h = mount(BOTH);
    h.settle();
    h.arm(MIDDLE);
    h.track(AT_LOW);
    expect(h.date()).toBe(NEXT);
    // The dwell fired and the day is now NEXT, so the neighbours have shifted a day along.
    h.redraw({ prev: '2026-08-22', next: '2026-08-24' });
    expect(h.date()).toBe('2026-08-24');
  });

  // ── WHAT THE EDGE COMMANDS (§2d) ─────────────────────────────────────────────────────
  //
  // v1 animated the incoming pane itself and the owner rejected it on sight — 48px over the
  // 700ms dwell is 1.1px per frame, a static offset with a timer attached. §2d lifts the whole
  // STRIP to a detent instead, briskly, through the pager's own channel. So what this hook owes
  // is a command, and these cases are that command's contract; how it LOOKS is `screens.css`'s
  // and is asserted where it can be seen (`e2e/shelf-drag.spec.ts`).
  it('lifts toward the neighbour it names, by the detent', () => {
    const h = mount(BOTH);
    h.settle();
    h.arm(MIDDLE);
    h.track(AT_LOW);
    // In RTL the next day lies to the left, and the pager owns the mirror — so what it is
    // handed is the STEP, not a side of the screen.
    expect(h.last()).toEqual({ step: 1, px: DRAG_DAY_LIFT_PX });
    h.track(AT_HIGH);
    expect(h.last()).toEqual({ step: -1, px: DRAG_DAY_LIFT_PX });
  });

  it('lets the page go when the edge stops naming a day', () => {
    const h = mount(BOTH);
    h.settle();
    h.arm(MIDDLE);
    h.track(AT_LOW);
    h.track(MIDDLE);
    expect(h.last()).toEqual({ step: null, px: 0 });
  });

  it('lifts nothing past the end of the trip', () => {
    const h = mount({ prev: PREV, next: null });
    h.settle();
    h.arm(MIDDLE);
    h.track(AT_LOW);
    // Nothing to lift toward, so the only command is the one that lets go — never a lift with
    // no page behind it, which would show the gutter and a hole.
    expect(h.held().every((c) => c.step === null)).toBe(true);
  });

  // **The lift is spent once per stay in the band** (§2d's fourth repair). Re-lifting after every
  // turn is what the owner saw twice: kept at the detent it was a second animation on the heels
  // of each day, and given back on the way out it was _"this weird 'going back' animation, but
  // stays on the same day"_. After the first turn the edge arms at zero — still claimed, nothing
  // offset, nothing owed back.
  it('arms at zero once this stay in the band has turned a day', () => {
    const h = mount(BOTH);
    h.settle();
    h.arm(MIDDLE);
    h.track(AT_LOW);
    expect(h.last()).toEqual({ step: 1, px: DRAG_DAY_LIFT_PX });
    // The turn was commanded, and then landed — which for this hook is the neighbours moving
    // along. Both halves matter: a day that changed for some OTHER reason (a pill's dwell) is
    // not this edge's turn and spends none of its state.
    h.turning();
    h.redraw({ prev: '2026-08-22', next: '2026-08-24' });
    expect(h.last()).toEqual({ step: 1, px: 0 });
  });

  it('and lifts again for a fresh stay in the band', () => {
    const h = mount(BOTH);
    h.settle();
    h.arm(MIDDLE);
    h.track(AT_LOW);
    h.turning();
    h.redraw({ prev: '2026-08-22', next: '2026-08-24' });
    expect(h.last()).toEqual({ step: 1, px: 0 });
    // Out of the band and back in: a new approach, so the affordance is worth paying for again.
    h.track(MIDDLE);
    h.track(AT_LOW);
    expect(h.last()).toEqual({ step: 1, px: DRAG_DAY_LIFT_PX });
  });

  it('reports the step beside the day, so the dwell knows which way to turn', () => {
    const h = mount(BOTH);
    h.settle();
    h.arm(MIDDLE);
    expect(h.step()).toBeNull();
    h.track(AT_LOW);
    expect(h.step()).toBe(1);
    expect(h.date()).toBe(NEXT);
    h.track(MIDDLE);
    expect(h.step()).toBeNull();
  });

  // ── LEAVING THE BAND COSTS MORE THAN ENTERING IT (§2d's repair) ───────────────────────
  //
  // The band had one threshold, so a finger resting near its boundary chattered — lift,
  // unwind, lift — at whatever rate the pointer reported. Entering still costs
  // `DRAG_DAY_EDGE_PX`; leaving costs that plus the release distance the latch already spends
  // on this axis for the same question.
  describe('the band holds on once the drag is inside it', () => {
    /** Just outside the entry threshold: enough to have left under the old rule, not enough
     *  under this one. */
    const JUST_OUT = DRAG_DAY_EDGE_PX + 4;
    const WELL_OUT = DRAG_DAY_EDGE_PX + DRAG_EDGE_SCROLL_RELEASE_PX + 4;

    it('does not let go for a pixel past the edge it entered at', () => {
      const h = mount(BOTH);
      h.settle();
      h.arm(MIDDLE);
      h.track(AT_LOW);
      expect(h.date()).toBe(NEXT);
      h.track(JUST_OUT);
      expect(h.date()).toBe(NEXT);
      expect(h.last()).toEqual({ step: 1, px: DRAG_DAY_LIFT_PX });
    });

    it('lets go once the drag has really left', () => {
      const h = mount(BOTH);
      h.settle();
      h.arm(MIDDLE);
      h.track(AT_LOW);
      h.track(WELL_OUT);
      expect(h.date()).toBeNull();
      expect(h.last()).toEqual({ step: null, px: 0 });
    });

    // The hysteresis is the band's own, not the axis's: reaching for the OTHER edge must be
    // exactly as easy as it was, or every step across the surface would carry the last band
    // with it.
    it('and the opposite band still starts where it always did', () => {
      const h = mount(BOTH);
      h.settle();
      h.arm(MIDDLE);
      h.track(AT_LOW);
      h.track(WIDTH - JUST_OUT);
      expect(h.date()).toBeNull();
      h.track(AT_HIGH);
      expect(h.date()).toBe(PREV);
    });
  });

  // ── UNDOING A STEP IS CHEAPER THAN MAKING ONE (§2d's repair) ──────────────────────────
  //
  // Owner: _"hard to go back"_. Reversing used to cost a fresh 940ms with nothing to say it
  // was an undo. The dwell is a property of the TARGET, so it is computed here.
  describe('the dwell it asks for', () => {
    it('is the full rest for a step this drag has not made', () => {
      const h = mount(BOTH);
      h.settle();
      h.arm(MIDDLE);
      h.track(AT_LOW);
      expect(h.dwell()).toBe(DRAG_DAY_DWELL_MS);
    });

    it('is halved when the edge is undoing the step it just made', () => {
      const h = mount(BOTH);
      h.settle();
      h.arm(MIDDLE);
      h.track(AT_LOW);
      // The turn was commanded and landed: the day moved on, which is the only notice this hook
      // gets that its own request arrived.
      h.turning();
      h.redraw({ prev: '2026-08-22', next: '2026-08-24' });
      // …and now the other edge, asked for: the far band is latched on arrival inside the undo
      // window, so reaching it is not the request (see the seventh repair, below).
      h.track(AT_HIGH);
      h.track(MIDDLE);
      h.track(AT_HIGH);
      expect(h.step()).toBe(-1);
      expect(h.dwell()).toBe(DRAG_DAY_REVERSE_DWELL_MS);
    });

    it('is the full rest for carrying ON in the same direction', () => {
      const h = mount(BOTH);
      h.settle();
      h.arm(MIDDLE);
      h.track(AT_LOW);
      h.turning();
      h.redraw({ prev: '2026-08-22', next: '2026-08-24' });
      // Still the same band, still going the same way: a second day is a second journey.
      expect(h.step()).toBe(1);
      expect(h.dwell()).toBe(DRAG_DAY_DWELL_MS);
    });

    it('forgets the reversal window when the drag ends', () => {
      const h = mount(BOTH);
      h.settle();
      h.arm(MIDDLE);
      h.track(AT_LOW);
      h.turning();
      h.redraw({ prev: '2026-08-22', next: '2026-08-24' });
      h.stop();
      h.arm(MIDDLE);
      h.track(AT_HIGH);
      expect(h.dwell()).toBe(DRAG_DAY_DWELL_MS);
    });
  });

  // ── A BAND THE DRAG DRIFTED INTO IS NOT A REQUEST (§2d's fifth repair) ────────────────
  //
  // Owner: _"we 'turn back' during the animation, then it does a full animation of going
  // back"_. Recorded: the turn commanded at 6229ms, the finger reaching the opposite band at
  // 6260 while the page travelled, the day arriving at 6501 — and a full reverse turn at 7300,
  // then another at 8372. The hand was retreating from the edge it had just used, which is
  // where a hand goes next; nothing about it asked to go back.
  //
  // `gateEdgeStep`'s scar, at a third moment. The band that produced the turn stays exempt,
  // because holding still there has to keep stepping.
  describe('a page arriving under a wandering finger', () => {
    /** The gesture in full: aim at the low edge, the dwell fires, the hand retreats across to
     *  the far band while the page travels, and the day lands. */
    const drift = () => {
      const h = mount(BOTH);
      h.settle();
      h.arm(MIDDLE);
      h.track(AT_LOW);
      expect(h.step()).toBe(1);
      h.turning();
      h.track(AT_HIGH);
      h.redraw({ prev: '2026-08-22', next: '2026-08-24' });
      return h;
    };

    it('does not name the day behind it', () => {
      const h = drift();
      expect(h.date()).toBeNull();
      expect(h.step()).toBeNull();
    });

    it('and names it once the drag asks — by leaving and coming back', () => {
      const h = drift();
      h.track(MIDDLE);
      h.track(AT_HIGH);
      expect(h.step()).toBe(-1);
    });

    it('and the latch is the one the seventh repair installs, so it survives the arrival', () => {
      const h = drift();
      // Not a fresh render's worth of latch: the same band, still latched, one move later.
      h.track(AT_HIGH - 1);
      expect(h.step()).toBeNull();
    });

    it('or by pushing deeper into it than it drifted to', () => {
      const h = mount(BOTH);
      h.settle();
      h.arm(MIDDLE);
      h.track(AT_LOW);
      h.turning();
      const drifted = WIDTH - DRAG_DAY_EDGE_PX + 4;
      h.track(drifted);
      h.redraw({ prev: '2026-08-22', next: '2026-08-24' });
      expect(h.date()).toBeNull();
      h.track(drifted + DRAG_EDGE_SCROLL_RELEASE_PX);
      expect(h.step()).toBe(-1);
    });

    // The exemption, and it is §2b's whole promise: a finger that has not moved keeps stepping.
    it('but a finger that stayed put keeps stepping the way it was going', () => {
      const h = mount(BOTH);
      h.settle();
      h.arm(MIDDLE);
      h.track(AT_LOW);
      h.turning();
      h.redraw({ prev: '2026-08-22', next: '2026-08-24' });
      expect(h.date()).toBe('2026-08-24');
      expect(h.step()).toBe(1);
    });

    // And the reversal window is the REQUEST's step, not whatever the hand was over when the
    // page landed — which is what it used to record.
    it('records the step that turned, not the one the hand drifted to', () => {
      const h = drift();
      h.track(MIDDLE);
      h.track(AT_HIGH);
      expect(h.step()).toBe(-1);
      expect(h.dwell()).toBe(DRAG_DAY_REVERSE_DWELL_MS);
    });
  });

  // ── AN UNDO IS ASKED FOR, NOT ARRIVED AT (§2d's seventh repair) ───────────────────────
  //
  // Owner, with a screen recording: _"once the moving animation starts for dragging, moving the
  // opposite direction shouldn't cancel the operation, undo, or do any other animation. It
  // should complete the day move and animation. Only after you're on the next day you should be
  // able to go back."_ The recording shows a step forward to day 3 of 12 and then, as the hand
  // crosses to the other edge, a full page walking back to day 2 — a step being undone that
  // nobody asked for.
  //
  // Two windows leaked, and they are consecutive. `track` covers the first: while the page is
  // travelling the edge named the day behind and the dwell armed on it AT HALF REST, so the
  // undo fired barely after the step landed — which is why the owner's report was about moving
  // back FAST. These cases cover the second: the hand that crosses after the arrival.
  describe('the band opposite the one that turned', () => {
    /** A step forward, landed, with the hand still at the edge that made it. */
    const stepped = () => {
      const h = mount(BOTH);
      h.settle();
      h.arm(MIDDLE);
      h.track(AT_LOW);
      expect(h.step()).toBe(1);
      h.turning();
      h.redraw({ prev: '2026-08-22', next: '2026-08-24' });
      return h;
    };

    it('says nothing the first time the drag reaches it', () => {
      const h = stepped();
      h.track(MIDDLE);
      h.track(AT_HIGH);
      expect(h.date()).toBeNull();
      expect(h.step()).toBeNull();
      expect(h.last()).toEqual({ step: null, px: 0 });
    });

    it('and stays quiet for a hand that rests there', () => {
      const h = stepped();
      h.track(MIDDLE);
      h.track(AT_HIGH);
      h.track(AT_HIGH);
      h.track(AT_HIGH - 2);
      expect(h.step()).toBeNull();
    });

    // Going back is the second half of the owner's sentence, so it must stay possible — in the
    // same words every other band in this app is asked in.
    it('acts once the drag pushes deeper into it than it entered at', () => {
      const h = stepped();
      h.track(MIDDLE);
      const entered = WIDTH - DRAG_DAY_EDGE_PX + 4;
      h.track(entered);
      expect(h.step()).toBeNull();
      h.track(entered + DRAG_EDGE_SCROLL_RELEASE_PX);
      expect(h.step()).toBe(-1);
      expect(h.dwell()).toBe(DRAG_DAY_REVERSE_DWELL_MS);
    });

    it('or once it has left and come back', () => {
      const h = stepped();
      h.track(MIDDLE);
      h.track(AT_HIGH);
      h.track(MIDDLE);
      h.track(AT_HIGH);
      expect(h.step()).toBe(-1);
    });

    // The gate is the undo window's, not the drag's: a retreat two seconds later was never the
    // undo this repair is about, and gating it would be the _"hard to go back"_ this feature
    // already answered once.
    it('is ordinary again once the step it undoes has been on screen a while', () => {
      const h = stepped();
      setSimulatedNow(getNow() + DRAG_DAY_REVERSE_MS + 1);
      h.track(MIDDLE);
      h.track(AT_HIGH);
      expect(h.step()).toBe(-1);
      // …and at full price, because the same window prices the dwell.
      expect(h.dwell()).toBe(DRAG_DAY_DWELL_MS);
    });

    // The exemption, and it is §2b: the band that did the turning keeps stepping under a finger
    // that has not moved.
    it('while the band that turned is untouched', () => {
      const h = stepped();
      expect(h.step()).toBe(1);
      expect(h.date()).toBe('2026-08-24');
      h.track(AT_LOW);
      expect(h.step()).toBe(1);
    });

    // Each turn arms the gate once more: walking forward two days and then retreating is the
    // same motion as retreating after one.
    it('and every further step arms it again', () => {
      const h = stepped();
      h.turning();
      h.redraw({ prev: '2026-08-23', next: '2026-08-25' });
      h.track(MIDDLE);
      h.track(AT_HIGH);
      expect(h.step()).toBeNull();
    });

    it('and a fresh drag knows nothing about it', () => {
      const h = stepped();
      h.stop();
      h.arm(MIDDLE);
      h.track(AT_HIGH);
      expect(h.step()).toBe(-1);
    });
  });

  // **A turn in flight is committed, and that includes what the EDGE thinks** (§2d's seventh
  // repair, first half). The pager has refused offset commands mid-turn since the second repair,
  // but the edge kept resolving underneath it — so a hand crossing to the far band during the
  // `--t-base` travel named the day behind, and the dwell armed on it at half rest and fired
  // barely after the step landed. Nothing is named until the day it is turning to arrives.
  describe('while a turn is travelling', () => {
    it('names nothing new, wherever the hand goes', () => {
      const h = mount(BOTH);
      h.settle();
      h.arm(MIDDLE);
      h.track(AT_LOW);
      h.turning();
      const before = h.held().length;
      h.track(MIDDLE);
      h.track(AT_HIGH);
      expect(h.date()).toBe(NEXT);
      expect(h.step()).toBe(1);
      // Not one command in either direction: the page is on its way and nothing may land.
      expect(h.held().length).toBe(before);
    });

    it('and resolves against wherever the hand ended up when the day arrives', () => {
      const h = mount(BOTH);
      h.settle();
      h.arm(MIDDLE);
      h.track(AT_LOW);
      h.turning();
      h.track(AT_HIGH);
      h.redraw({ prev: '2026-08-22', next: '2026-08-24' });
      // The far band, reached mid-flight and latched at the arrival — the sixth repair's case,
      // now the seventh's.
      expect(h.date()).toBeNull();
    });
  });

  it('forgets the drag when it ends', () => {
    const h = mount(BOTH);
    h.settle();
    h.arm(MIDDLE);
    h.track(AT_LOW);
    expect(h.date()).toBe(NEXT);
    h.stop();
    expect(h.date()).toBeNull();
    // And a redraw after the drag is over must not resurrect a target.
    h.redraw({ prev: '2026-08-22', next: '2026-08-24' });
    expect(h.date()).toBeNull();
  });
});

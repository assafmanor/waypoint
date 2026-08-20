// @vitest-environment jsdom
//
// The landing watcher's STATE MACHINE, which is the half a browser cannot pin down cheaply:
// `e2e/place-arrival-scroll.spec.ts` measures where a row actually ends up, and it can only do
// that for the causes a hermetic run happens to produce. What must hold for every cause is the
// sequence — aim, leave a moving scroller alone, ask again once, aim again when the geometry
// moves, and stop the moment a hand touches the list — so that is asserted here, over a fake
// scroller whose numbers the test moves by hand.
//
// jsdom has no layout, so every rect and every scroll number is scripted. That is the point:
// the machine's inputs are three numbers and a rect, and scripting them covers states a real
// browser only reaches on a slow device.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { landAtTop } from './land-at-top';

/** One frame at a time, so the assertions read as "after the next frame …". */
let frames: (() => void)[] = [];
const pump = (n = 1) => {
  for (let i = 0; i < n; i++) {
    const due = frames;
    frames = [];
    for (const cb of due) cb();
  }
};

/** A scroller whose overflow, extent and offset the test writes. `scrollerFor` needs a real
 *  computed `overflow-y` and genuine overflow, which is why this is a real element. */
function scroller(): HTMLElement {
  const el = document.createElement('div');
  el.style.overflowY = 'auto';
  Object.defineProperty(el, 'clientHeight', { value: 300, writable: true });
  Object.defineProperty(el, 'scrollHeight', { value: 900, writable: true });
  el.scrollTop = 0;
  el.getBoundingClientRect = () => ({ top: 0, bottom: 300 }) as DOMRect;
  document.body.append(el);
  return el;
}

/** A row inside it, at `top` within the scrollable CONTENT — so its viewport rect moves with
 *  the scroll exactly as a real one does. Modelling that is load-bearing rather than pedantic:
 *  the watcher's "did the surface change" test is deliberately scroll-independent, and a fake
 *  whose rect ignored `scrollTop` would report a change on every frame of our own scrolling. */
function row(parent: HTMLElement, top: number) {
  const el = document.createElement('div');
  el.dataset.top = String(top);
  el.getBoundingClientRect = () => ({ top: Number(el.dataset.top) - parent.scrollTop }) as DOMRect;
  el.scrollIntoView = vi.fn();
  parent.append(el);
  return el;
}

const aims = (el: HTMLElement) => (el.scrollIntoView as ReturnType<typeof vi.fn>).mock.calls.length;

beforeEach(() => {
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
    frames.push(cb);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe('landAtTop', () => {
  it('waits for an element that is not there yet, then aims once', () => {
    const box = scroller();
    let el: HTMLElement | null = null;
    landAtTop(() => el);
    pump(3);
    el = row(box, 500);
    pump();
    expect(aims(el)).toBe(1);
  });

  it('leaves a moving scroller alone, and keeps asking while it is at rest', () => {
    const box = scroller();
    const el = row(box, 500);
    landAtTop(() => el);
    pump(); // the first aim
    expect(aims(el)).toBe(1);
    // Our own eased scroll, in flight: two frames of movement, and neither is an occasion to
    // re-aim — re-aiming into a live scroll is the Zeno trap that makes a correction crawl.
    box.scrollTop = 120;
    pump();
    box.scrollTop = 240;
    pump();
    expect(aims(el)).toBe(1);
    // Stopped — which does NOT mean landed. An aim can move nothing at all while a surface is
    // still sizing itself (measured on a throttled Plan day: two asks, `scrollTop` still 0,
    // and the scroll only took hold 300ms later), so the ask repeats for as long as the
    // scroller is still. That is what makes this robust to a slow mount rather than to one
    // named cause.
    pump();
    expect(aims(el)).toBe(2);
    pump(3);
    expect(aims(el)).toBe(5);
  });

  it('goes quiet again the moment an ask actually moves the scroller', () => {
    const box = scroller();
    const el = row(box, 500);
    landAtTop(() => el);
    pump(2);
    const before = aims(el);
    box.scrollTop = 300; // the ask took hold
    pump();
    expect(aims(el)).toBe(before); // …so this frame says nothing
  });

  it('is still aiming after a notice arrives above the row', () => {
    const box = scroller();
    const el = row(box, 8);
    landAtTop(() => el);
    pump(3);
    const before = aims(el);
    // A notice arrives above the row: the content grew and the row is 96px lower. This is the
    // reported case — the map was still loading, and this is what "still loading" does. The
    // scroller has not moved, so the watch is still asking, and the next ask carries the new
    // geometry.
    Object.defineProperty(box, 'scrollHeight', { value: 996, writable: true });
    el.dataset.top = '104';
    pump();
    expect(aims(el)).toBe(before + 1);
  });

  // The state the Map's own unit tests depend on, and the one a list that grows into a
  // scroller reaches: nothing overflows at the aim, so the aim moved nothing and has to be
  // repeated once there is something to move. jsdom reports no overflow at all, which is
  // exactly why the aim may not be gated on finding a scroller.
  it('aims with no scroller at all, and again once one exists', () => {
    const box = scroller();
    Object.defineProperty(box, 'scrollHeight', { value: 300, writable: true }); // fits
    const el = row(box, 8);
    landAtTop(() => el);
    pump();
    expect(aims(el)).toBe(1);
    pump(3);
    expect(aims(el)).toBe(1);
    Object.defineProperty(box, 'scrollHeight', { value: 900, writable: true }); // now it does
    pump();
    expect(aims(el)).toBe(2);
    // …and from here it is the at-rest rule's business, not the one-shot's.
    pump();
    expect(aims(el)).toBe(3);
  });

  it('stops the moment a hand touches the list, and never aims again', () => {
    const box = scroller();
    const el = row(box, 500);
    landAtTop(() => el);
    pump();
    expect(aims(el)).toBe(1);
    window.dispatchEvent(new Event('pointerdown'));
    Object.defineProperty(box, 'scrollHeight', { value: 2000, writable: true });
    el.dataset.top = '900';
    pump(20);
    expect(aims(el)).toBe(1);
  });

  it('stops when cancelled, so a second landing cannot fight the first', () => {
    const box = scroller();
    const el = row(box, 500);
    const cancel = landAtTop(() => el);
    pump();
    cancel();
    el.dataset.top = '900';
    pump(20);
    expect(aims(el)).toBe(1);
  });

  it('closes the watch when its window is over', () => {
    const box = scroller();
    const el = row(box, 8);
    landAtTop(() => el, 0);
    pump();
    expect(aims(el)).toBe(1);
    el.dataset.top = '900';
    pump(20);
    expect(aims(el)).toBe(1);
  });
});

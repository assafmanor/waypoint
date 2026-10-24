// @vitest-environment jsdom
//
// **The fade names the edge that is hiding something, and only that edge** — the bug the owner
// reported on 2026-08-21 (the row faded its first chip at rest, and faded both ends of a strip
// that fits entirely). ADR-0100 §6 decided the fade; this is its condition.
//
// jsdom reports 0 for every scroll metric and no `overflow` at all, so both are stubbed —
// exactly as `scrollable.test.ts` does, and for the same reason: the stubs ARE the scenarios.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { edgeFadeRef } from './edge-fade';

/** A strip `travel`px wider than its box, resting `along`px from its LEADING edge — negative
 *  `scrollLeft` in RTL, positive in LTR, which is the one asymmetry the module has to absorb. */
function strip({
  travel,
  along = 0,
  rtl = true,
  scrolls = true,
}: {
  travel: number;
  along?: number;
  rtl?: boolean;
  scrolls?: boolean;
}) {
  const el = document.createElement('div');
  document.body.append(el);
  Object.defineProperty(el, 'clientWidth', { configurable: true, get: () => 100 });
  Object.defineProperty(el, 'scrollWidth', { configurable: true, get: () => 100 + travel });
  el.scrollLeft = rtl ? -along : along;
  vi.spyOn(window, 'getComputedStyle').mockImplementation(
    () =>
      ({
        direction: rtl ? 'rtl' : 'ltr',
        overflowX: scrolls ? 'auto' : 'visible',
        overflowY: 'visible',
      }) as CSSStyleDeclaration,
  );
  return el;
}

/** What the stylesheet's gradient ends up reading: `''` = the class's own 14px. */
const stops = (el: HTMLElement) => ({
  left: el.style.getPropertyValue('--edge-fade-l'),
  right: el.style.getPropertyValue('--edge-fade-r'),
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('edgeFadeRef', () => {
  it('fades neither edge of a strip whose content fits', () => {
    const el = strip({ travel: 0 });
    edgeFadeRef(el);
    expect(stops(el)).toEqual({ left: '0px', right: '0px' });
  });

  it('fades neither edge of a strip that CLIPS instead of scrolling', () => {
    // The Map's nested pills group: the outer facet strip owns the scroll, so a mask here
    // would fade the same chip twice.
    const el = strip({ travel: 200, scrolls: false });
    edgeFadeRef(el);
    expect(stops(el)).toEqual({ left: '0px', right: '0px' });
  });

  it('fades only the trailing side at rest — physically LEFT in RTL', () => {
    const el = strip({ travel: 200, along: 0 });
    edgeFadeRef(el);
    expect(stops(el)).toEqual({ left: '', right: '0px' });
  });

  it('fades only the trailing side at rest — physically RIGHT in LTR', () => {
    const el = strip({ travel: 200, along: 0, rtl: false });
    edgeFadeRef(el);
    expect(stops(el)).toEqual({ left: '0px', right: '' });
  });

  it('fades both sides mid-scroll', () => {
    const el = strip({ travel: 200, along: 100 });
    edgeFadeRef(el);
    expect(stops(el)).toEqual({ left: '', right: '' });
  });

  it('fades only the leading side at the end of the travel', () => {
    const el = strip({ travel: 200, along: 200 });
    edgeFadeRef(el);
    expect(stops(el)).toEqual({ left: '0px', right: '' });
  });

  // The shelf pads its own inline edges by 2px under mandatory snap, so it RESTS at
  // `scrollLeft: -2` — a 1px tolerance faded the first card of a strip nobody had scrolled,
  // which is the reported bug surviving its own fix.
  it('treats a snap boundary inside the strip’s padding as being AT the edge', () => {
    const el = strip({ travel: 200, along: 2 });
    edgeFadeRef(el);
    expect(stops(el)).toEqual({ left: '', right: '0px' });
  });

  it('fades the leading side once a real scroll has hidden something', () => {
    const el = strip({ travel: 200, along: 20 });
    edgeFadeRef(el);
    expect(stops(el)).toEqual({ left: '', right: '' });
  });

  it('re-measures when the strip is scrolled', () => {
    const el = strip({ travel: 200, along: 0 });
    edgeFadeRef(el);
    el.scrollLeft = -200;
    el.dispatchEvent(new Event('scroll'));
    expect(stops(el)).toEqual({ left: '0px', right: '' });
  });

  it('stops listening once React hands back the cleanup', () => {
    const el = strip({ travel: 200, along: 0 });
    edgeFadeRef(el)?.();
    el.scrollLeft = -200;
    el.dispatchEvent(new Event('scroll'));
    // Still the resting answer: nothing recomputed it.
    expect(stops(el)).toEqual({ left: '', right: '0px' });
  });

  it('re-measures when chips arrive and leave without the box changing', async () => {
    const el = strip({ travel: 200, along: 200 });
    edgeFadeRef(el);
    expect(stops(el)).toEqual({ left: '0px', right: '' });
    // The last chip of a category goes; the row now fits, so neither end has anything behind
    // it. A `ResizeObserver` on the strip never fires for this — its own box is unchanged.
    Object.defineProperty(el, 'scrollWidth', { configurable: true, get: () => 100 });
    el.scrollLeft = 0;
    el.append(document.createElement('span'));
    await vi.waitFor(() => expect(stops(el)).toEqual({ left: '0px', right: '0px' }));
  });

  it('is a no-op when the ref is called with null rather than a throw', () => {
    expect(edgeFadeRef(null)).toBeUndefined();
  });
});

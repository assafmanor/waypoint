// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { edgeScrollStep, nearestScroller } from './edge-autoscroll';

// The pacing only (ADR-0116 §5 amendment): the rAF loop and the scroller lookup
// need real layout, but how fast a held pointer scrolls is pure arithmetic.
describe('edgeScrollStep', () => {
  const H = 800;

  it('does not scroll from the middle of the screen', () => {
    expect(edgeScrollStep(400, H)).toBe(0);
    expect(edgeScrollStep(200, H)).toBe(0);
  });

  it('scrolls up near the top edge and down near the bottom', () => {
    expect(edgeScrollStep(10, H)).toBeLessThan(0);
    expect(edgeScrollStep(H - 10, H)).toBeGreaterThan(0);
  });

  it('ramps with depth into the edge band, so easing in crawls', () => {
    const shallow = Math.abs(edgeScrollStep(70, H, 84, 14));
    const deep = Math.abs(edgeScrollStep(4, H, 84, 14));
    expect(shallow).toBeGreaterThan(0);
    expect(deep).toBeGreaterThan(shallow);
    expect(deep).toBeLessThanOrEqual(14);
  });

  it('never exceeds the max step, even past the edge', () => {
    expect(edgeScrollStep(-50, H, 84, 14)).toBe(-14);
    expect(edgeScrollStep(H + 50, H, 84, 14)).toBe(14);
  });

  it('shrinks the bands on a short viewport instead of overlapping them', () => {
    // With a 100px viewport an 84px band each side would overlap, making the
    // middle scroll both ways at once.
    expect(edgeScrollStep(50, 100, 84, 14)).toBe(0);
  });

  it('is inert without a viewport', () => {
    expect(edgeScrollStep(10, 0)).toBe(0);
  });
});

// The two bugs behind "dragging and auto-scrolling are clashing", both about WHICH
// element scrolls and WHEN the drop target is recomputed.
describe('scroller selection + frame callback', () => {
  const nodes: HTMLElement[] = [];
  const el = (style: Partial<CSSStyleDeclaration>, scrollH: number, clientH: number) => {
    const node = document.createElement('div');
    Object.assign(node.style, style);
    Object.defineProperty(node, 'scrollHeight', { value: scrollH, configurable: true });
    Object.defineProperty(node, 'clientHeight', { value: clientH, configurable: true });
    nodes.push(node);
    return node;
  };

  afterEach(() => {
    nodes.forEach((n) => n.remove());
    nodes.length = 0;
  });

  it('ignores a horizontally-scrolling strip that overflows vertically by a hair', () => {
    // `.shelf { overflow-x: auto }` computes overflow-y: auto, and such a strip is
    // often 1-2px taller than its box — picking it made the drag nudge the strip
    // instead of scrolling the page.
    const page = el({ overflowY: 'auto' }, 4000, 800);
    const strip = el({ overflowX: 'auto' }, 152, 150);
    const card = document.createElement('div');
    page.append(strip);
    strip.append(card);
    document.body.append(page);

    expect(nearestScroller(card)).toBe(page);
  });

  it('picks a strip that genuinely scrolls vertically', () => {
    const page = el({ overflowY: 'auto' }, 4000, 800);
    const inner = el({ overflowY: 'auto' }, 900, 300);
    const card = document.createElement('div');
    page.append(inner);
    inner.append(card);
    document.body.append(page);

    expect(nearestScroller(card)).toBe(inner);
  });
});

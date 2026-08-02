// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  motionDurationMs,
  prefersReducedMotion,
  readDurationMs,
  overlayOriginOffset,
} from './motion';

const stubReducedMotion = (matches: boolean) =>
  vi.stubGlobal(
    'matchMedia',
    vi.fn((q: string) => ({ matches: matches && q.includes('reduce'), media: q })),
  );

describe('prefersReducedMotion', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reflects the reduced-motion media query', () => {
    stubReducedMotion(true);
    expect(prefersReducedMotion()).toBe(true);
  });

  it('is false when the user has no motion preference set', () => {
    stubReducedMotion(false);
    expect(prefersReducedMotion()).toBe(false);
  });
});

// `readDurationMs` and `motionDurationMs` deliberately answer DIFFERENTLY when the
// token cannot be read, and that difference is the point (ADR-0140). The mode
// switch wants a sane duration for a transition that may still be running; a
// caller timing "when may I tear this surface down" must not invent one.
describe('readDurationMs', () => {
  afterEach(() => document.documentElement.style.removeProperty('--t-quick'));

  it('reads a ms token off :root', () => {
    document.documentElement.style.setProperty('--t-quick', '140ms');
    expect(readDurationMs('--t-quick')).toBe(140);
  });

  it('tolerates a token expressed in seconds', () => {
    document.documentElement.style.setProperty('--t-quick', '0.6s');
    expect(readDurationMs('--t-quick')).toBe(600);
  });

  it('falls back to a literal when nothing is readable', () => {
    expect(readDurationMs('--nope')).toBe(400);
  });
});

describe('motionDurationMs', () => {
  afterEach(() => {
    document.documentElement.style.removeProperty('--t-quick');
    vi.unstubAllGlobals();
  });

  it('is the token value when an animation will play', () => {
    stubReducedMotion(false);
    document.documentElement.style.setProperty('--t-quick', '140ms');
    expect(motionDurationMs('--t-quick')).toBe(140);
  });

  it('is 0 under reduced motion, because App.css has killed the animation', () => {
    stubReducedMotion(true);
    document.documentElement.style.setProperty('--t-quick', '140ms');
    expect(motionDurationMs('--t-quick')).toBe(0);
  });

  // No readable token means no stylesheet, which means nothing is animating —
  // guessing a duration here would hold a dismissed overlay on screen for it.
  it('is 0 when the token is unreadable, rather than guessing', () => {
    stubReducedMotion(false);
    expect(motionDurationMs('--t-quick')).toBe(0);
  });
});

describe('overlayOriginOffset', () => {
  const withViewport = (height: number, rect: Partial<DOMRect>) => {
    vi.stubGlobal('innerHeight', height);
    return { getBoundingClientRect: () => ({ top: 0, height: 0, width: 0, ...rect }) } as Element;
  };
  afterEach(() => vi.unstubAllGlobals());

  it('is the distance from the element centre to the viewport centre', () => {
    // A row at 100..160 has its centre at 130; a 800px viewport has its at 400.
    expect(overlayOriginOffset(withViewport(800, { top: 100, height: 60, width: 300 }))).toBe(-270);
  });

  it('is positive for a row below the middle', () => {
    expect(overlayOriginOffset(withViewport(800, { top: 500, height: 60, width: 300 }))).toBe(130);
  });

  // An origin far outside the card turns a scale into a slide across the screen.
  it('clamps to 42% of the viewport either way', () => {
    expect(overlayOriginOffset(withViewport(800, { top: 780, height: 60, width: 300 }))).toBe(336);
    expect(overlayOriginOffset(withViewport(800, { top: -400, height: 60, width: 300 }))).toBe(
      -336,
    );
  });

  // The deep-link case: nothing was tapped, so the overlay is summoned at centre.
  it('is null with no element', () => {
    expect(overlayOriginOffset(null)).toBeNull();
    expect(overlayOriginOffset(undefined)).toBeNull();
  });

  // jsdom reports every rect as zero, which would read as "dead centre" — a lie no unit
  // test could see through, and the class of bug frontend/CLAUDE.md warns about twice.
  it('is null for an unmeasurable element rather than reporting dead centre', () => {
    expect(overlayOriginOffset(withViewport(800, { top: 0, height: 0, width: 0 }))).toBeNull();
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { prefersReducedMotion } from './motion';

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

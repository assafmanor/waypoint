import { describe, expect, it } from 'vitest';
import { IDENTITY_HUES, deriveAvatarHue, identityHueSchema, resolveAvatarHue } from './identity';

describe('deriveAvatarHue', () => {
  it('is stable for the same id', () => {
    // The whole requirement: a user must not see "their" colour change between
    // renders, runtimes or deploys.
    expect(deriveAvatarHue('u-abc')).toBe(deriveAvatarHue('u-abc'));
  });

  it('only ever returns a hue from the ramp', () => {
    for (let i = 0; i < 500; i++) {
      expect(identityHueSchema.safeParse(deriveAvatarHue(`user-${i}`)).success).toBe(true);
    }
  });

  it('spreads across the whole ramp rather than favouring one hue', () => {
    // The defect this replaces was one colour for everyone, so "it varies" is the
    // property under test — not a specific assignment.
    const seen = new Set(Array.from({ length: 200 }, (_, i) => deriveAvatarHue(`u-${i}`)));
    expect(seen.size).toBe(IDENTITY_HUES.length);
  });

  it('handles an empty id without throwing', () => {
    expect(identityHueSchema.safeParse(deriveAvatarHue('')).success).toBe(true);
  });
});

describe('resolveAvatarHue', () => {
  it('honours a stored pick', () => {
    expect(resolveAvatarHue('u-abc', 'rose')).toBe('rose');
  });

  it('derives when nothing is stored — null, undefined, or empty', () => {
    const derived = deriveAvatarHue('u-abc');
    expect(resolveAvatarHue('u-abc', null)).toBe(derived);
    expect(resolveAvatarHue('u-abc', undefined)).toBe(derived);
    expect(resolveAvatarHue('u-abc', '')).toBe(derived);
  });

  it('derives rather than passing through a value outside the ramp', () => {
    // A legacy hex is exactly this case: the pre-ADR-0133 column held `#E9A63C`,
    // and it must never reach a render as a hue name.
    expect(resolveAvatarHue('u-abc', '#E9A63C')).toBe(deriveAvatarHue('u-abc'));
    expect(resolveAvatarHue('u-abc', 'amber')).toBe(deriveAvatarHue('u-abc'));
  });
});

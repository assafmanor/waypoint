import { describe, expect, it } from 'vitest';
import {
  IDENTITY_HUES,
  avatarContentPath,
  deriveAvatarHue,
  identityHueSchema,
  resolveAvatarHue,
} from './identity';

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

  it('does not cluster on short ids that share a prefix', () => {
    // The regression: plain djb2 (no avalanche finalizer) barely mixes its low bits,
    // so `u-`-prefixed human-readable ids collapsed onto one or two hues — three of
    // the seed's five users came out the same colour. Collisions are fine and
    // expected; a hash that ignores most of its input is not.
    const ids = ['u-assaf', 'u-noam', 'u-dana', 'u-maor', 'u-ron', 'u-gal', 'u-tal', 'u-omer'];
    expect(new Set(ids.map(deriveAvatarHue)).size).toBeGreaterThanOrEqual(3);

    // And over a larger prefixed set every hue must appear.
    const many = Array.from({ length: 60 }, (_, i) => `u-member${i}`);
    expect(new Set(many.map(deriveAvatarHue)).size).toBe(IDENTITY_HUES.length);
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

describe('avatarContentPath', () => {
  it('puts the blob key in the path, so the URL is immutable per blob', () => {
    expect(avatarContentPath('u-abc', 'k-123')).toBe('/users/u-abc/avatar/k-123');
  });

  it('changes when the key changes — which is what retires the cached face on replace', () => {
    expect(avatarContentPath('u-abc', 'k-1')).not.toBe(avatarContentPath('u-abc', 'k-2'));
  });

  it('is root-relative, since the server has no reliable view of its own public origin', () => {
    expect(avatarContentPath('u', 'k').startsWith('/')).toBe(true);
  });
});

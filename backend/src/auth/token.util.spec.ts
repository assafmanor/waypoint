import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
  verifyAccessToken,
} from './token.util';

afterEach(() => vi.useRealTimers());

describe('token.util', () => {
  it('round-trips a signed access token', () => {
    const token = signAccessToken({ sub: 'u-1', email: 'a@example.com' });
    expect(verifyAccessToken(token)).toEqual({ sub: 'u-1', email: 'a@example.com' });
  });

  it('rejects a tampered signature', () => {
    const token = signAccessToken({ sub: 'u-1', email: 'a@example.com' });
    const [header, body, signature] = token.split('.');
    const lastChar = signature.at(-1);
    const flipped = lastChar === 'a' ? 'b' : 'a';
    const tampered = `${header}.${body}.${signature.slice(0, -1)}${flipped}`;
    expect(verifyAccessToken(tampered)).toBeNull();
  });

  it('rejects a malformed token', () => {
    expect(verifyAccessToken('not-a-jwt')).toBeNull();
  });

  it('rejects an expired token', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-01-01T00:00:00Z'));
    const token = signAccessToken({ sub: 'u-1', email: 'a@example.com' });

    vi.setSystemTime(new Date('2027-01-01T00:16:00Z')); // 16 min later, past the 15-min TTL
    expect(verifyAccessToken(token)).toBeNull();
  });

  it('generates distinct opaque refresh tokens with a deterministic hash', () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a).not.toEqual(b);
    expect(hashRefreshToken(a)).toEqual(hashRefreshToken(a));
    expect(hashRefreshToken(a)).not.toEqual(hashRefreshToken(b));
  });
});

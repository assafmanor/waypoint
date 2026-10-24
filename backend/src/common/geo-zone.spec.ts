import { describe, expect, it } from 'vitest';
import { zoneAt } from './geo-zone';

describe('zoneAt', () => {
  it('resolves a real coordinate to its IANA zone', () => {
    expect(zoneAt(35.6595, 139.7005)).toBe('Asia/Tokyo'); // Shibuya Crossing
    expect(zoneAt(32.0853, 34.7818)).toBe('Asia/Jerusalem'); // Tel Aviv
  });

  it('degrades rather than guessing — no coordinates, no zone', () => {
    expect(zoneAt(undefined, undefined)).toBeUndefined();
    expect(zoneAt(35.6595, undefined)).toBeUndefined();
    expect(zoneAt(null, null)).toBeUndefined();
  });

  // Pinned because the code this replaced claimed the opposite in a comment: geo-tz v7 covers
  // the sea with nautical zones, so open ocean is a real offset rather than a miss.
  it('answers the nautical zone over open ocean, not undefined', () => {
    expect(zoneAt(0, -160)).toBe('Etc/GMT+11');
  });

  // geo-tz throws `Invalid latitude: 91` rather than answering, and every caller here reads a
  // nullable Float somebody else wrote — a 500 on a bad row is worse than no zone.
  it('answers undefined for an out-of-range coordinate instead of throwing', () => {
    expect(zoneAt(91, 0)).toBeUndefined();
    expect(zoneAt(0, 181)).toBeUndefined();
    expect(zoneAt(Number.NaN, 0)).toBeUndefined();
  });
});

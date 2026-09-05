import { describe, expect, it } from 'vitest';
import { heTripRange, SHARE_META_COPY } from './hebrew.copy';

/**
 * **The four range shapes, asserted in Hebrew.**
 *
 * These are the same four `frontend/src/lib/time.test.ts` asserts for `formatTripDates`'s
 * `prose` style, and that pairing is deliberate (ADR-0220 §4): both renderers read
 * `tripRangeShape` for the decision, so what is left to check per layer is the words. If the
 * two files ever disagree, the invite ticket and the preview that advertised it disagree
 * about one trip.
 *
 * It also fails loudly on a runtime built with small-ICU, where `he-IL` would silently give
 * English month names. Node ships full ICU by default and the image is `node:22-slim`, so
 * this is a guard rather than a live concern — but a silent fallback here would put English
 * dates in a Hebrew preview and nothing else would notice.
 */
describe('heTripRange', () => {
  it('names the month once when both ends share it', () => {
    expect(heTripRange('2026-09-11', '2026-09-22')).toBe('11–22 בספטמבר');
  });

  it('names both months when they differ', () => {
    expect(heTripRange('2026-09-27', '2026-10-03')).toBe('27 בספטמבר – 3 באוקטובר');
  });

  it('reads as one date when the trip is a single day', () => {
    expect(heTripRange('2026-09-11', '2026-09-11')).toBe('11 בספטמבר');
  });

  /** Crossing a year is the same two-month shape here, on purpose: the year is not printed
   *  in a preview description, where the range sits next to a destination and the trip is
   *  self-evidently upcoming. `formatTripDates`'s `withYear` mode is the surface that needs
   *  it, and that surface is the screen. */
  it('names both months across a year boundary, without a year', () => {
    expect(heTripRange('2026-12-27', '2027-01-03')).toBe('27 בדצמבר – 3 בינואר');
  });

  it('is in Hebrew at all — the small-ICU guard', () => {
    expect(heTripRange('2026-09-11', '2026-09-22')).toMatch(/[֐-׿]/);
  });

  /** Calendar dates read in UTC, never the runtime's zone: a trip's span is not an instant,
   *  and a server in UTC−7 must not print the day before. */
  it('reads the dates in UTC', () => {
    expect(heTripRange('2026-03-01', '2026-03-01')).toBe('1 במרץ');
  });
});

describe('SHARE_META_COPY', () => {
  /** The owner asked for both off these surfaces (2026-09-05). The dot is the app's own
   *  separator and reads as debris in a chat preview; the em dash is forbidden in UI copy
   *  repo-wide. The en dash inside a date range is `heTripRange`'s and is exempt. */
  it('spends neither the dot separator nor an em dash', () => {
    const strings = [
      SHARE_META_COPY.siteName,
      SHARE_META_COPY.home.title,
      SHARE_META_COPY.home.description,
      SHARE_META_COPY.invite.title('יפן 2026'),
      SHARE_META_COPY.invite.description('אוסקה', '11–22 בספטמבר', 3),
      SHARE_META_COPY.live.title('יפן 2026'),
      SHARE_META_COPY.live.description('אוסקה', '11–22 בספטמבר'),
    ].join(' ');
    expect(strings).not.toContain('·');
    expect(strings).not.toContain('—');
  });

  it('binds the invite title with a bare ל, so a trip named טיול… does not stutter', () => {
    expect(SHARE_META_COPY.invite.title('טיול הבוגרים ליוון')).toBe('הוזמנת לטיול הבוגרים ליוון');
  });
});

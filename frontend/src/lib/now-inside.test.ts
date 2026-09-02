import { describe, expect, it } from 'vitest';
import { nowInside, type NowSpan } from './now-inside';

const span = (key: string, start: number, end: number, settled?: boolean): NowSpan => ({
  key,
  start,
  end,
  ...(settled ? { settled } : {}),
});

describe('nowInside', () => {
  it('nails the marker to the only row holding the moment', () => {
    expect(nowInside([span('a', 100, 200)], 150)).toEqual({ key: 'a', thruFrac: 0.5 });
  });

  it('answers nothing when no row holds it — before, between and after', () => {
    const day = [span('a', 100, 200), span('b', 300, 400)];
    expect(nowInside(day, 50)).toBeNull();
    expect(nowInside(day, 250)).toBeNull();
    expect(nowInside(day, 500)).toBeNull();
  });

  it('treats `end` as exclusive, so a row that has just finished holds nothing', () => {
    expect(nowInside([span('a', 100, 200)], 200)).toBeNull();
    expect(nowInside([span('a', 100, 200)], 199)).not.toBeNull();
  });

  it('is inclusive of `start`, so a row holds the moment it begins', () => {
    expect(nowInside([span('a', 100, 200)], 100)).toEqual({ key: 'a', thruFrac: 0 });
  });

  // A check-in, a landing, a car pick-up (ADR-0210 §1): an instant is ahead of us or behind
  // us, never around us — and no caller has to know that.
  it('never lets a zero-length span hold the moment', () => {
    expect(nowInside([span('point', 100, 100)], 100)).toBeNull();
  });

  it('takes the CHILD of an envelope, because it started later', () => {
    const festival = span('festival', 0, 400);
    const concert = span('concert', 100, 200);
    expect(nowInside([festival, concert], 150)?.key).toBe('concert');
    // …and hands the festival back the moment the concert is over.
    expect(nowInside([festival, concert], 250)?.key).toBe('festival');
  });

  it('takes the more recently entered peer of a cluster', () => {
    const market = span('market', 100, 300);
    const pools = span('pools', 200, 400);
    expect(nowInside([market, pools], 250)?.key).toBe('pools');
    // Before the second one opens, the first is still the only holder.
    expect(nowInside([market, pools], 150)?.key).toBe('market');
  });

  // The tie-break is LENGTH and not `key`: a talk that opens with the pass containing it is
  // the more specific answer, and ordering by id would make that depend on an id.
  it('breaks a shared start on the shorter span', () => {
    const pass = span('pass', 100, 500);
    const talk = span('talk', 100, 145);
    expect(nowInside([pass, talk], 120)?.key).toBe('talk');
    expect(nowInside([talk, pass], 120)?.key).toBe('talk');
  });

  it('skips a settled row and falls through to whatever else holds the moment', () => {
    const dinner = span('dinner', 100, 300, true);
    expect(nowInside([dinner], 150)).toBeNull();
    expect(nowInside([span('festival', 0, 400), dinner], 150)?.key).toBe('festival');
  });

  it('reports the fraction from the holder it chose, not from the outermost one', () => {
    // 3/4 through the concert, only 3/8 through the festival around it.
    const inside = nowInside([span('festival', 0, 400), span('concert', 100, 200)], 175);
    expect(inside).toEqual({ key: 'concert', thruFrac: 0.75 });
  });

  // The unit is the caller's, which is the whole reason this is shareable: the day surfaces
  // count epoch milliseconds and the shared reader counts minutes from the share's own dawn
  // (`dawnOrder`, `lib/share-now-line.ts`).
  it('is unit-agnostic', () => {
    const inMinutes = nowInside([span('a', 8 * 60, 10 * 60)], 9 * 60);
    const inMs = nowInside([span('a', 8 * 3600_000, 10 * 3600_000)], 9 * 3600_000);
    expect(inMinutes).toEqual(inMs);
  });

  it('answers nothing for an empty day', () => {
    expect(nowInside([], 150)).toBeNull();
  });
});

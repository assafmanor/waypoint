import { describe, expect, it } from 'vitest';
import { countVisible, revealDelayMs, revealRows, visibleItems } from './filter-reveal';
import { FILTER_STAGGER_MAX_MS, FILTER_STAGGER_MS } from '../constants';

describe('revealRows (ADR-0120, the app-wide filter/search reveal)', () => {
  const items = (n: number) => Array.from({ length: n }, (_, i) => `i${i}`);

  it('marks everything visible and increments the delay when nothing filters', () => {
    const { rows, nextIndex } = revealRows(items(3), () => true);
    expect(rows.every((r) => r.visible)).toBe(true);
    expect(rows.map((r) => r.delayMs)).toEqual([0, FILTER_STAGGER_MS, FILTER_STAGGER_MS * 2]);
    expect(nextIndex).toBe(3);
  });

  it('hides non-matching items with a zero delay, and only counts visible ones', () => {
    const { rows, nextIndex } = revealRows(['a', 'b', 'a'], (i) => i === 'a');
    expect(rows.map((r) => r.visible)).toEqual([true, false, true]);
    expect(rows[1].delayMs).toBe(0);
    expect(rows[2].delayMs).toBe(FILTER_STAGGER_MS); // second VISIBLE row, not third row
    expect(nextIndex).toBe(2);
  });

  it('caps the delay so a long list does not drag the reveal out', () => {
    const { rows } = revealRows(items(50), () => true);
    expect(rows.at(-1)?.delayMs).toBe(FILTER_STAGGER_MAX_MS);
    expect(revealDelayMs(1000)).toBe(FILTER_STAGGER_MAX_MS);
  });

  it('chains a startIndex so two lists share one continuous stagger', () => {
    const first = revealRows(items(2), () => true);
    const second = revealRows(items(2), () => true, first.nextIndex);
    expect(second.rows.map((r) => r.delayMs)).toEqual([
      FILTER_STAGGER_MS * 2,
      FILTER_STAGGER_MS * 3,
    ]);
  });

  it('reports what is actually on screen — hidden rows stay mounted but never count', () => {
    const { rows } = revealRows(['a', 'b', 'a'], (i) => i === 'a');
    expect(rows).toHaveLength(3);
    expect(countVisible(rows)).toBe(2);
    expect(visibleItems(rows)).toEqual(['a', 'a']);
  });
});

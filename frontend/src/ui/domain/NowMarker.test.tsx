// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { NOW_POSTURE, NowMarker } from './NowMarker';
import { t } from '../../i18n/he';

describe('NowMarker', () => {
  afterEach(cleanup);

  it('wraps the row it is nailed to and reports how far through it is', () => {
    const { container } = render(
      <NowMarker label="12:30" thruFrac={0.53}>
        <div data-testid="row">row</div>
      </NowMarker>,
    );
    const mark = container.querySelector('.now-here')!;
    expect(mark).toBeTruthy();
    expect(mark.querySelector('[data-testid="row"]')).toBeTruthy();
    expect(mark.getAttribute('style')).toContain('--thru: 53%');
    // The boundary form is the one with no row, so a nailed mark must not claim it.
    expect(mark.classList.contains('edge')).toBe(false);
  });

  it('is the boundary form when it is given no row', () => {
    const { container } = render(<NowMarker label="07:30" />);
    const mark = container.querySelector('.now-here')!;
    expect(mark.classList.contains('edge')).toBe(true);
    // `.edge` supplies `--thru` and its own room in CSS, so nothing is written inline.
    expect(mark.getAttribute('style')).toBeNull();
  });

  // **THE TWO FORMS DIFFER ABOUT THE CAPTION ON PURPOSE** (ADR-0217 §1, amended
  // 2026-09-02). Nailed to a row it renders nothing: that row's own chip says the word, and a
  // second caption would be one fact drawn twice. At a BOUNDARY no row carries it — which is
  // the stated premise for §1's silence, absent — so the mark says the time itself, through
  // `screens.css`'s `.nowline-chip`, the chip the public reader still ships.
  it('renders no text when it is nailed to a row', () => {
    const { container } = render(
      <NowMarker label="12:30" thruFrac={0.5}>
        <div>row</div>
      </NowMarker>,
    );
    const mark = container.querySelector('.now-here')!;
    expect(mark.textContent).toBe('row');
    expect(mark.querySelector('.nowline-chip')).toBeNull();
  });

  it('says the time itself at a boundary, in the chip the shared reader uses', () => {
    const { container } = render(<NowMarker label="12:30" />);
    const mark = container.querySelector('.now-here')!;
    expect(mark.querySelector('.nowline-chip')).toBeTruthy();
    expect(mark.textContent).toBe('12:30');
    // The dot is decoration beside a clock that is already read out.
    expect(mark.querySelector('.nowline-dot')!.getAttribute('aria-hidden')).toBe('true');
  });

  // Whatever it renders, the accessible name is the one `.nowline` and `.nowref` both carried,
  // so a screen reader hears no change from a mark that moved into a row.
  it('carries the clock as its accessible name in both forms', () => {
    const { container: edge } = render(<NowMarker label="12:30" />);
    expect(edge.querySelector('.now-here')!.getAttribute('aria-label')).toBe(
      t.day.nowLineAria('12:30'),
    );
    const { container: held } = render(
      <NowMarker label="12:30" thruFrac={0.5}>
        <div />
      </NowMarker>,
    );
    expect(held.querySelector('.now-here')!.getAttribute('aria-label')).toBe(
      t.day.nowLineAria('12:30'),
    );
  });

  it('is live by default and takes Plan’s posture on request', () => {
    const { container: live } = render(<NowMarker label="12:30" />);
    expect(live.querySelector('.now-here')!.getAttribute('data-posture')).toBe(NOW_POSTURE.LIVE);
    const { container: plan } = render(<NowMarker label="12:30" posture={NOW_POSTURE.PLAN} />);
    expect(plan.querySelector('.now-here')!.getAttribute('data-posture')).toBe(NOW_POSTURE.PLAN);
  });

  // A stale render between a clock tick and a re-derivation is the one way a fraction can
  // arrive outside its range, and a mark at `-40%` points at the row above.
  it('clamps a fraction that arrives out of range', () => {
    const { container: under } = render(
      <NowMarker label="12:30" thruFrac={-0.4}>
        <div />
      </NowMarker>,
    );
    expect(under.querySelector('.now-here')!.getAttribute('style')).toContain('--thru: 0%');
    const { container: over } = render(
      <NowMarker label="12:30" thruFrac={9}>
        <div />
      </NowMarker>,
    );
    expect(over.querySelector('.now-here')!.getAttribute('style')).toContain('--thru: 100%');
  });

  it('hands its element to a host that needs to scroll it into view', () => {
    let node: HTMLDivElement | null = null;
    render(
      <NowMarker
        label="12:30"
        ref={(el) => {
          node = el;
        }}
      />,
    );
    expect(node).toBeInstanceOf(HTMLDivElement);
    expect(node!.classList.contains('now-here')).toBe(true);
  });
});

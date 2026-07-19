// @vitest-environment jsdom
import { afterEach, describe, it, expect } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Board } from './Board';
import { t } from '../../i18n/he';

describe('Board', () => {
  afterEach(() => cleanup());

  it('now + hard: the live pill, the amber hard-lock label, next-row + progress', () => {
    const { container } = render(
      <Board
        variant="now"
        clock="14:30"
        nowKind="hard"
        nowTitle={<span>טיסה לטוקיו</span>}
        nowUntil="16:00"
        next={{ title: <span>מלון</span>, time: '17:00', hard: true, code: 'ABC123' }}
        countdown={{ value: '2:30', unit: 'שעות' }}
        progress={40}
        windowStartHour="07:00"
        windowEndHour="23:00"
      />,
    );
    // The board is the one loud surface.
    expect(container.querySelector('.wp-board')).toBeTruthy();
    // Hard coding: the now-label carries the 🔒 קשיח grammar (ADR-0011).
    const label = container.querySelector('.wp-board-now-label');
    expect(label?.textContent).toContain(t.event.hard);
    // Next row + day progress show when not in transit.
    expect(container.querySelector('.wp-board-next-row')).toBeTruthy();
    expect(container.querySelector('.wp-board-progress')).toBeTruthy();
    expect(container.querySelector('.wp-board-countdown .t')?.textContent).toBe('2:30');
    expect(container.querySelector('.wp-board-next-meta .code')?.textContent).toBe('ABC123');
  });

  it('now + soft: the label reads soft (not hard)', () => {
    const { container } = render(
      <Board variant="now" clock="14:30" nowKind="soft" nowTitle={<span>ראמן</span>} next={null} />,
    );
    const label = container.querySelector('.wp-board-now-label');
    expect(label?.textContent).toBe(t.event.soft);
    expect(label?.textContent).not.toContain(t.event.hard);
  });

  it('free: the calm empty hero, no now-title event', () => {
    const { container } = render(<Board variant="free" clock="14:30" next={null} />);
    expect(screen.getByText(t.board.freeTitle)).toBeTruthy();
    expect(container.querySelector('.wp-board-now-label')?.textContent).toBe(t.board.freeLabel);
  });

  it('group-split: concurrent soft events read as equals', () => {
    const { container } = render(
      <Board
        variant="group-split"
        clock="14:30"
        next={null}
        splitRows={[
          { key: 'a', icon: '🍜', title: <span>ראמן</span>, until: '15:00' },
          { key: 'b', icon: '🛍️', title: <span>קניות</span>, until: '15:30' },
        ]}
      />,
    );
    expect(screen.getByText(t.board.concurrentNow)).toBeTruthy();
    expect(container.querySelectorAll('.wp-board-now-split .wp-board-also-row').length).toBe(2);
  });

  it('in-transit: teal "where you are" hero + flight progress; no next-row/progress rail', () => {
    const { container } = render(
      <Board
        variant="in-transit"
        clock="14:30"
        nowTitle={<span>טיסה</span>}
        transit={{
          labelKey: 'arrival',
          endTime: '18:00',
          progress: 0.5,
          startTime: '14:00',
          showCountdown: true,
        }}
        next={{ title: <span>מלון</span> }}
      />,
    );
    // Teal identity on the live pill.
    expect(container.querySelector('.wp-board.transit')).toBeTruthy();
    expect(container.querySelector('.wp-board-live.loc')).toBeTruthy();
    expect(screen.getByText(t.board.inTransitLive)).toBeTruthy();
    // The flight IS the activity → no next-row / day rail.
    expect(container.querySelector('.wp-board-transit-prog')).toBeTruthy();
    expect(container.querySelector('.wp-board-next-row')).toBeNull();
    expect(container.querySelector('.wp-board-progress')).toBeNull();
  });

  it('the "ועוד N" concurrency expander toggles the also-list', () => {
    render(
      <Board
        variant="now"
        clock="14:30"
        nowKind="hard"
        nowTitle={<span>טיסה</span>}
        next={null}
        alsoNow={[{ key: 'a', icon: '🍜', title: <span>ראמן</span>, hard: false, until: '15:00' }]}
      />,
    );
    const toggle = screen.getByRole('button', { name: t.board.alsoNow(1) });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('.wp-board-also-now .wp-board-also-list')).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelector('.wp-board-also-now .wp-board-also-list')).toBeTruthy();
  });
});

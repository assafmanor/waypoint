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

  it('in-transit: the shift pill sits at the destination end, where both times are read', () => {
    // A flight whose ends are in different zones: 07:15 origin → 11:00 destination
    // reads as 3h45 unless the −3 is right there beside them (ADR-0107).
    const { container } = render(
      <Board
        variant="in-transit"
        clock="09:30"
        nowTitle={<span>טיסה</span>}
        transit={{
          labelKey: 'arrival',
          endTime: '11:00',
          progress: 0.5,
          startTime: '07:15',
          fromPlace: 'בן גוריון',
          toPlace: 'קפלאוויק',
          shift: -180,
        }}
        next={null}
      />,
    );
    const destination = container.querySelector('.tp-end.end')!;
    expect(destination.textContent).toContain('11:00');
    expect(destination.querySelector('.wp-tzshift')?.textContent).toContain('−3');
    // The origin end stays bare — the shift is stated once, not per end.
    expect(container.querySelector('.tp-end:not(.end) .wp-tzshift')).toBeNull();
  });

  it('the next slot carries its own shift; a single-zone next carries none', () => {
    const shifted = render(
      <Board
        variant="free"
        clock="14:30"
        next={{ title: <span>טיסה</span>, time: '23:00', shift: 360 }}
      />,
    );
    expect(
      shifted.container.querySelector('.wp-board-next-meta .wp-tzshift')?.textContent,
    ).toContain('+6');
    cleanup();
    const plain = render(
      <Board variant="free" clock="14:30" next={{ title: <span>ראמן</span>, time: '19:00' }} />,
    );
    expect(plain.container.querySelector('.wp-board-next-meta .wp-tzshift')).toBeNull();
  });

  it('the now slot carries its own shift', () => {
    const { container } = render(
      <Board
        variant="now"
        clock="14:30"
        nowKind="soft"
        nowTitle={<span>ראמן</span>}
        nowUntil="19:00"
        nowShift={120}
        next={null}
      />,
    );
    expect(container.querySelector('.wp-board-now-meta .wp-tzshift')?.textContent).toContain('+2');
  });

  // An also-row's own shift used to be asserted behind the `ועוד N` toggle. That
  // toggle is gone (ADR-0160 §4) and its rows now live in the lifted hero, so the
  // coverage moves to the OTHER host of the same row — `group-split`, where the
  // rows render unconditionally. Same component, an unconditional path instead of
  // one behind a control.
  it('a group-split equal carries its own shift', () => {
    const { container } = render(
      <Board
        variant="group-split"
        clock="14:30"
        splitRows={[{ key: 'x', title: <span>מוזיאון</span>, until: '18:00', shift: 120 }]}
        next={null}
      />,
    );
    expect(container.querySelector('.wp-board-also-row .wp-tzshift')?.textContent).toContain('+2');
  });

  it('"ועוד N עכשיו" is a readout: the count without a control, and no rows', () => {
    const { container } = render(
      <Board
        variant="now"
        clock="14:30"
        nowKind="hard"
        nowTitle={<span>טיסה</span>}
        next={null}
        alsoNow={[{ key: 'a', icon: '🍜', title: <span>ראמן</span>, hard: false, until: '15:00' }]}
      />,
    );
    const readout = container.querySelector('.wp-board-also-read');
    expect(readout?.textContent).toContain(t.board.alsoNow(1));
    // The count is legible without a tap, and there is nothing to tap.
    expect(screen.queryByRole('button', { name: t.board.alsoNow(1) })).toBeNull();
    expect(container.querySelector('.wp-board-also-list')).toBeNull();
  });

  it('the board is a plain div until a lift is offered, and a button once it is', () => {
    const plain = render(
      <Board variant="now" clock="14:30" nowKind="soft" nowTitle={<span>ראמן</span>} next={null} />,
    );
    expect(plain.container.querySelector('div.wp-board')).toBeTruthy();
    expect(plain.container.querySelector('button.wp-board')).toBeNull();
    cleanup();

    let lifted = 0;
    const tappable = render(
      <Board
        variant="now"
        clock="14:30"
        nowKind="soft"
        nowTitle={<span>ראמן</span>}
        next={null}
        onLift={() => (lifted += 1)}
      />,
    );
    const board = tappable.container.querySelector('button.wp-board');
    expect(board).toBeTruthy();
    expect(board?.classList.contains('is-tappable')).toBe(true);
    fireEvent.click(board!);
    expect(lifted).toBe(1);
  });

  // THE REGRESSION GUARD for ADR-0160 §4, and it needs a comment because what it
  // protects is invisible: a `<button>` nested in the board's own `<button>` is not
  // just invalid markup — Chrome CLOSES the outer element at the nested one and
  // reparents every following sibling out of it, so the divider, the next row and
  // the day rail silently leave the board (1 of 4 children left, measured in
  // `mockups/hero-horizon-v1.html`). A snapshot cannot see it, and neither can a
  // render that only checks the pieces exist — they DO exist, just not inside the
  // board. So: assert the board has no interactive descendant, and assert the
  // pieces are still its children.
  it('a liftable board contains no nested control, and keeps its own children', () => {
    const { container } = render(
      <Board
        variant="now"
        clock="14:30"
        nowKind="soft"
        nowTitle={<span>ראמן</span>}
        next={{ title: <span>מלון</span>, time: '17:00' }}
        alsoNow={[{ key: 'a', title: <span>שוק</span>, until: '15:00' }]}
        progress={40}
        onLift={() => {}}
      />,
    );
    const board = container.querySelector('button.wp-board')!;
    expect(board.querySelectorAll('button, a, input, select, textarea')).toHaveLength(0);
    for (const sel of [
      '.wp-board-also-read',
      '.wp-board-divider',
      '.wp-board-next-row',
      '.wp-board-progress',
    ]) {
      expect(board.querySelector(sel), sel).toBeTruthy();
    }
  });

  it('free is liftable too, and in-transit is not asked to be', () => {
    const free = render(<Board variant="free" clock="14:30" next={null} onLift={() => {}} />);
    expect(free.container.querySelector('button.wp-board')).toBeTruthy();
    cleanup();
    // The caller decides; the board renders whatever it is handed. In-transit gets
    // no `onLift` until phase 4, so it stays the div it has always been.
    const transit = render(
      <Board
        variant="in-transit"
        clock="14:30"
        nowTitle={<span>טיסה</span>}
        transit={{ labelKey: 'departure', progress: 0.5 }}
      />,
    );
    expect(transit.container.querySelector('div.wp-board.transit')).toBeTruthy();
  });
});

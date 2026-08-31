// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Board, type BoardCountdown, type BoardGap, type BoardProps } from './Board';
import { GAP_CHARACTER, NIGHT_BAND } from '../../lib/gap-character';
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

  // ── THE GAP'S CHARACTER (ADR-0211) ─────────────────────────────────────────
  // `זמן חופשי` used to be this component's final `else`, so it printed on a bus, in bed and
  // on a day nobody planned. The board no longer decides: it draws the answer the screen
  // derived, and each of these is one `read` away from the next.
  describe('the gap says which gap it is', () => {
    const gapBoard = (gap: BoardGap, extra?: Partial<BoardProps>) =>
      render(<Board variant="free" clock="14:30" next={null} gap={gap} {...extra} />).container;

    it('open: a real gap keeps the words it always had, and finally says until when', () => {
      const c = gapBoard({ read: { kind: GAP_CHARACTER.OPEN }, until: '16:20' });
      expect(c.querySelector('.wp-board-now-label')?.textContent).toBe(t.board.freeLabel);
      expect(c.querySelector('.wp-board-now-title')?.textContent).toBe(t.board.freeTitle);
      // The meta line the `free` branch never rendered, while `GlanceCard` said it two
      // inches lower (§5).
      expect(c.querySelector('.wp-board-now-meta')?.textContent).toContain('16:20');
    });

    it('on the way: the reported contradiction, from the side that was wrong', () => {
      const c = gapBoard({ read: { kind: GAP_CHARACTER.ON_THE_WAY } });
      expect(c.querySelector('.wp-board-now-label')?.textContent).toBe(t.board.gap.onTheWay.label);
      expect(c.querySelector('.wp-board-now-title')?.textContent).toBe(t.board.gap.onTheWay.title);
      expect(c.textContent).not.toContain(t.board.freeTitle);
      // The teal register, and it is the shipped one: `in-transit` already paints
      // `כרגע · בדרך` this way. A journey a person asserted is the same fact as one the
      // plan brackets, so it must not read amber over a teal line two rows down.
      expect(c.querySelector('.wp-board-now-label')?.className).toContain('loc');
      expect(c.querySelector('.wp-board-live')?.className).toContain('loc');
      expect(c.querySelector('.wp-board-live')?.textContent).toBe(t.board.gap.onTheWay.title);
    });

    it('at the stay: a PLACE and an hour, never a claim about sleeping', () => {
      const night = gapBoard({
        read: { kind: GAP_CHARACTER.AT_THE_STAY, band: NIGHT_BAND.NIGHT },
        stayName: 'Rooms Hotel Tbilisi',
      });
      expect(night.querySelector('.wp-board-now-label')?.textContent).toBe(
        t.board.gap.atTheStay.night,
      );
      expect(night.querySelector('.wp-board-now-title')?.textContent).toBe('Rooms Hotel Tbilisi');
      // `לילה` is a claim about the CLOCK, and the clock is amber's (root rule 4).
      expect(night.querySelector('.wp-board-now-label')?.className).not.toContain('loc');
      expect(night.querySelector('.wp-board-live')?.textContent).toBe(t.common.now);

      const morning = gapBoard({
        read: { kind: GAP_CHARACTER.AT_THE_STAY, band: NIGHT_BAND.MORNING },
        stayName: 'Rooms Hotel Tbilisi',
      });
      expect(morning.querySelector('.wp-board-now-label')?.textContent).toBe(
        t.board.gap.atTheStay.morning,
      );
    });

    it('a day that is over and a day nobody planned read differently', () => {
      expect(
        gapBoard({ read: { kind: GAP_CHARACTER.DAY_DONE } }).querySelector('.wp-board-now-title')
          ?.textContent,
      ).toBe(t.board.endOfDay);
      expect(
        gapBoard({ read: { kind: GAP_CHARACTER.EMPTY_DAY } }).querySelector('.wp-board-now-title')
          ?.textContent,
      ).toBe(t.board.gap.emptyDay.title);
    });

    // The rail clamps (`dayProgress`), so at 02:40 it drew a knob at 0% under a label
    // reading `עכשיו` — the board placing somebody in bed at 07:00.
    it('the rail is drawn only where the day is the frame you are in', () => {
      const withRail = gapBoard({ read: { kind: GAP_CHARACTER.OPEN } }, { showRail: true });
      expect(withRail.querySelector('.wp-board-progress')).toBeTruthy();
      const night = gapBoard(
        { read: { kind: GAP_CHARACTER.AT_THE_STAY }, stayName: 'X' },
        { showRail: false },
      );
      expect(night.querySelector('.wp-board-progress')).toBeNull();
    });
  });

  // `deriveNow` has no date filter, so this slot has always crossed midnight — and said
  // nothing about it, which is what makes `07:00` at 22:40 read as this morning.
  it('the next slot says which day it is, beside the time it qualifies', () => {
    const { container } = render(
      <Board
        variant="free"
        clock="22:40"
        gap={{ read: { kind: GAP_CHARACTER.DAY_DONE } }}
        next={{ title: <span>טיסה לבטומי</span>, time: '07:00', day: 'מחר' }}
      />,
    );
    const meta = container.querySelector('.wp-board-next-meta');
    expect(meta?.textContent).toContain('07:00');
    expect(meta?.textContent).toContain('מחר');
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
          liveWord: t.board.midSpan.flightLive,
          label: t.board.midSpan.transitLabel,
          mark: '✈️',
          endTime: '18:00',
          progress: 0.5,
          startTime: '14:00',
          remaining: '3:30 שע׳',
        }}
        next={{ title: <span>מלון</span> }}
      />,
    );
    // Teal identity on the live pill.
    expect(container.querySelector('.wp-board.transit')).toBeTruthy();
    expect(container.querySelector('.wp-board-live.loc')).toBeTruthy();
    expect(screen.getByText(t.board.midSpan.flightLive)).toBeTruthy();
    // The flight IS the activity → no next-row / day rail.
    expect(container.querySelector('.wp-board-transit-prog')).toBeTruthy();
    expect(container.querySelector('.wp-board-next-row')).toBeNull();
    expect(container.querySelector('.wp-board-progress')).toBeNull();
    // **The rail's middle slot says what is LEFT, not the arrival time its own end
    // label already prints.** Both were `22:15` on one 10.5px line before session 215.
    const middle = container.querySelector('.tp-left')!;
    expect(middle.textContent).toContain(t.board.remaining);
    expect(middle.textContent).toContain('3:30 שע׳');
    expect(middle.textContent).not.toContain('18:00');
    // The travelling mark is the event's own glyph — a train must not cross its rail
    // behind a plane, and the app has no train icon to reach for.
    expect(container.querySelector('.tp-plane')?.textContent).toBe('✈️');
  });

  // The words belong to the MODE, not to this surface (session 215). The board used to
  // print the literal `בטיסה` for anything mid-span, so a train read as a flight.
  it('in-transit: the live word and the label are whatever the mode handed it', () => {
    const { container } = render(
      <Board
        variant="in-transit"
        clock="13:50"
        nowIcon="🚆"
        nowTitle={<span>רכבת</span>}
        transit={{
          labelKey: 'arrival',
          liveWord: t.board.midSpan.transitLive,
          label: t.board.midSpan.transitLabel,
          mark: '🚆',
          endTime: '14:12',
          progress: 0.42,
          startTime: '13:32',
          remaining: '28 דק׳',
        }}
      />,
    );
    expect(screen.getByText(t.board.midSpan.transitLive)).toBeTruthy();
    expect(screen.queryByText(t.board.midSpan.flightLive)).toBeNull();
    // `הגעה`, not `נחיתה` — the ends already resolved per mode before this change.
    expect(screen.getByText(t.glance.transition.arrival)).toBeTruthy();
    expect(container.querySelector('.tp-plane')?.textContent).toBe('🚆');
  });

  // A red-eye lands at `06:00`, which reads as this morning, and the zone jump breaks the
  // arithmetic you would use to check. The day is a disambiguator for exactly that, so it
  // rides with the TIME it qualifies and appears only when there is something to
  // disambiguate (ADR-0160 §M).
  it('in-transit: the arrival day sits beside the arrival time, and only when handed one', () => {
    const redEye = (endDay?: string) => (
      <Board
        variant="in-transit"
        clock="04:20"
        nowTitle={<span>טיסה</span>}
        transit={{
          labelKey: 'flightArrival',
          liveWord: t.board.midSpan.flightLive,
          label: t.board.midSpan.transitLabel,
          mark: '✈️',
          endTime: '06:00',
          endDay,
          progress: 0.8,
          startTime: '22:00',
          remaining: '1:40 שע׳',
        }}
      />
    );
    const meta = () => document.querySelector('.wp-board-now-meta')!;
    const { rerender } = render(redEye('מחר'));
    expect(meta().textContent).toContain('06:00');
    expect(meta().textContent).toContain('מחר');
    // Beside the arrival, not on the countdown: what is ambiguous is `06:00`, and the
    // countdown lives two lines down on the rail regardless.
    const spans = [...meta().querySelectorAll('span')].map((s) => s.textContent);
    expect(spans.indexOf('מחר')).toBe(spans.indexOf('06:00') + 1);

    rerender(redEye(undefined));
    expect(meta().textContent).toContain('06:00');
    expect(meta().textContent).not.toContain('מחר');
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
          liveWord: t.board.midSpan.flightLive,
          label: t.board.midSpan.transitLabel,
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
        transit={{
          labelKey: 'departure',
          liveWord: t.board.midSpan.flightLive,
          label: t.board.midSpan.transitLabel,
          progress: 0.5,
        }}
      />,
    );
    expect(transit.container.querySelector('div.wp-board.transit')).toBeTruthy();
  });

  // The flight is a FLIP off THIS element's box, and a landing position may never be a
  // constant (`frontend/CLAUDE.md` records three bugs from writing one). Reporting what
  // was pressed keeps the board presentational: it measures nothing itself.
  it('hands the pressed element to onLift', () => {
    const lifted = vi.fn();
    const { container } = render(
      <Board variant="free" clock="14:30" next={null} onLift={lifted} />,
    );
    const board = container.querySelector('button.wp-board')!;
    fireEvent.click(board);
    expect(lifted).toHaveBeenCalledWith(board);
  });

  // The defect this guards was reported from a phone: two boards on screen at once reads
  // as an overlay over the hero rather than the hero itself being promoted.
  it('hides itself while the hero is lifted out of it, without giving up its box', () => {
    const { container } = render(
      <Board variant="free" clock="14:30" next={null} onLift={() => {}} lifted />,
    );
    const board = container.querySelector('.wp-board')!;
    expect(board.className).toContain('is-lifted');
    // `visibility`, never `display`: the descent measures this element on the way back
    // down, and a `display: none` origin has no box to land on.
    expect(board.className).not.toContain('is-hidden');
  });

  it('is not marked lifted when it is not', () => {
    const { container } = render(
      <Board variant="free" clock="14:30" next={null} onLift={() => {}} />,
    );
    expect(container.querySelector('.wp-board')!.className).not.toContain('is-lifted');
  });
});

describe('Board — the countdown swaps what it counts to (ADR-0206 §Z1)', () => {
  const board = (countdown: BoardCountdown) =>
    render(
      <Board
        variant="free"
        clock="17:22"
        next={{ title: <span>ארוחת ערב</span>, time: '18:00' }}
        countdown={countdown}
      />,
    );

  // The `unit` slot has said what the minutes are left OF since ADR-0184 §6's `לסגירה`; a live
  // leave-by is the same fact pointed one step earlier. One tile, three referents.
  it('is the SAME tile under all three units, never a second box', () => {
    for (const unit of ['דקות', t.board.leaveIn, t.board.lateBy('דקות')]) {
      const { container, unmount } = board({ value: '10', unit });
      expect(container.querySelectorAll('.wp-board-countdown')).toHaveLength(1);
      expect(container.querySelector('.wp-board-countdown .u')?.textContent).toBe(unit);
      unmount();
    }
  });

  it('paints the tile --miss once the leave-by has passed, and only then', () => {
    const live = board({ value: '10', unit: t.board.leaveIn });
    expect(live.container.querySelector('.wp-board-countdown.missed')).toBeNull();
    live.unmount();
    const passed = board({ value: '7', unit: t.board.lateBy('דקות'), missed: true });
    expect(passed.container.querySelector('.wp-board-countdown.missed')).toBeTruthy();
  });

  // **ADR-0208 §1.** Three parts will not fit on one line inside the tile's own ⁦48px⁩, so the
  // sentence wraps: the number, then what it measures, then what it is late FOR. Explicit lines
  // rather than a `max-width` and a hope — a font fallback would wrap where nothing measured it.
  it('carries a second unit line, and only when it is given one', () => {
    const passed = board({
      value: '7',
      unit: t.board.lateBy('דקות'),
      unitBelow: t.board.leaveIn,
      missed: true,
    });
    const lines = [...passed.container.querySelectorAll('.wp-board-countdown .u')].map(
      (u) => u.textContent,
    );
    expect(lines).toEqual([t.board.lateBy('דקות'), t.board.leaveIn]);
    passed.unmount();
    const live = board({ value: '10', unit: t.board.leaveIn });
    expect(live.container.querySelectorAll('.wp-board-countdown .u')).toHaveLength(1);
  });

  // ── TOMORROW IS THE NIGHT BOARD'S SUBJECT (ADR-0214) ───────────────────────
  // Three states, and the rule that generates them is one line: rank 1 is whichever slot holds
  // tomorrow. So the shapes differ because the DATA differs, not because the board has three
  // branches about the clock.
  const RIBBON = {
    blocks: [
      {
        key: 'a',
        startFrac: 0.01,
        endFrac: 0.17,
        hard: true,
        point: false,
        nextDay: false,
        composite: false,
        cue: true,
      },
      {
        key: 'b',
        startFrac: 0.25,
        endFrac: 0.41,
        hard: false,
        point: false,
        nextDay: false,
        composite: false,
        cue: false,
      },
    ],
    marks: [{ key: 'a', frac: 0.01, icon: '🚄' }],
    count: 2,
  };
  const tomorrowProps: Partial<BoardProps> = {
    variant: 'free',
    clock: '22:40',
    gap: { read: { kind: GAP_CHARACTER.DAY_DONE } },
    next: { title: <span>רכבת לקיוטו</span>, time: '07:12', day: 'מחר', hard: true, code: 'HIK1' },
    countdown: { value: '8:32', unit: 'שעות' },
  };

  it('a planned tomorrow takes rank 1, and the day-done words are not drawn at all', () => {
    const { container } = render(
      <Board {...(tomorrowProps as BoardProps)} tomorrow={{ label: 'מחר', ribbon: RIBBON }} />,
    );
    // The next slot IS the first slot: it wears rank 1 and there is no now-slot above it.
    expect(container.querySelector('.wp-board-next-label')?.getAttribute('data-rank')).toBe('1');
    expect(container.querySelector('.wp-board-next-label')?.textContent).toBe('מחר');
    expect(container.querySelector('.wp-board-next-title')?.getAttribute('data-rank')).toBe('1');
    expect(container.querySelector('.wp-board-now-title')).toBeNull();
    expect(container.textContent).not.toContain(t.board.endOfDay);
    // Nothing above it to divide from.
    expect(container.querySelector('.wp-board-divider')).toBeNull();
    // The rail's slot carries the shape instead of a bar with nothing left to measure.
    expect(container.querySelector('.wp-board-progress.wp-track')).toBeTruthy();
    expect(container.querySelectorAll('.wp-track-blk')).toHaveLength(2);
    expect(container.querySelector('.wp-track-blk.hard.cue')).toBeTruthy();
    expect(container.querySelectorAll('.wp-board-progress .knob')).toHaveLength(0);
  });

  // The three subtractions, and the day token is the one that DEPENDS on the rank swap: the
  // label above now says `מחר`, so keeping it prints one word twice.
  it('at rank 1 the code, the lock and the day token come off the meta row', () => {
    const { container } = render(
      <Board {...(tomorrowProps as BoardProps)} tomorrow={{ label: 'מחר', ribbon: RIBBON }} />,
    );
    const meta = container.querySelector('.wp-board-next-meta');
    expect(meta?.textContent).toContain('07:12');
    expect(meta?.querySelector('.code')).toBeNull();
    expect(meta?.querySelector('.lockmini')).toBeNull();
    expect(meta?.textContent?.match(/מחר/g) ?? []).toHaveLength(0);
    // …and the label is where that word now lives, exactly once on the card.
    expect(container.textContent?.match(/מחר/g)).toHaveLength(1);
  });

  it('the same board WITHOUT a tomorrow keeps every one of them', () => {
    const { container } = render(<Board {...(tomorrowProps as BoardProps)} />);
    const meta = container.querySelector('.wp-board-next-meta');
    expect(meta?.querySelector('.code')?.textContent).toBe('HIK1');
    expect(meta?.querySelector('.lockmini')).toBeTruthy();
    expect(meta?.textContent).toContain('מחר');
    expect(container.querySelector('.wp-board-now-title')?.textContent).toBe(t.board.endOfDay);
    expect(container.querySelector('.wp-board-next-label')?.getAttribute('data-rank')).toBeNull();
  });

  it('an unplanned tomorrow keeps its words in the now-slot, and the far point keeps rank 2', () => {
    const { container } = render(
      <Board
        {...(tomorrowProps as BoardProps)}
        next={{ title: <span>טיסה לאוסקה</span>, time: '09:00', day: 'מחרתיים' }}
        tomorrow={{ label: 'מחר', ribbon: { blocks: [], marks: [], count: 0 } }}
      />,
    );
    expect(container.querySelector('.wp-board-now-label')?.textContent).toBe('מחר');
    expect(container.querySelector('.wp-board-now-title')?.textContent).toBe(
      t.board.gap.emptyDay.title,
    );
    // No swap: the point is a day or more out, so it stays `הבא בתור` — and it keeps the day
    // token, because the label above it does not say it.
    expect(container.querySelector('.wp-board-next-label')?.getAttribute('data-rank')).toBeNull();
    expect(container.querySelector('.wp-board-next-meta')?.textContent).toContain('מחרתיים');
    // A dashed strip, and no blocks to draw.
    expect(container.querySelector('.wp-track-empty')).toBeTruthy();
    expect(container.querySelectorAll('.wp-track-blk')).toHaveLength(0);
    expect(container.querySelector('.wp-board-divider')).toBeTruthy();
    // And no day rail under it: two bands for two things with nothing left to measure is
    // what the running app showed, so the spent rail goes here as well.
    expect(container.querySelector('.wp-board-progress:not(.wp-track)')).toBeNull();
  });

  it('the bed is named only when the screen passes it', () => {
    const { container: without } = render(
      <Board {...(tomorrowProps as BoardProps)} tomorrow={{ label: 'מחר', ribbon: RIBBON }} />,
    );
    expect(without.querySelector('.wp-board-tmr-sleep')).toBeNull();
    cleanup();
    const { container: withBed } = render(
      <Board
        {...(tomorrowProps as BoardProps)}
        tomorrow={{ label: 'מחר', ribbon: RIBBON, sleeps: 'Hotel Kanra' }}
      />,
    );
    expect(withBed.querySelector('.wp-board-tmr-sleep')?.textContent).toContain('Hotel Kanra');
  });

  // The strip is a READOUT: the board is a `<button>`, and ADR-0160 §4 is the record of what a
  // nested one does to it (Chrome closes the board at the inner button and reparents the rest).
  it('the strip contains no control, so a tappable board keeps its children', () => {
    const { container } = render(
      <Board
        {...(tomorrowProps as BoardProps)}
        tomorrow={{ label: 'מחר', ribbon: RIBBON, sleeps: 'Hotel Kanra' }}
        onLift={() => {}}
      />,
    );
    const board = container.querySelector('button.wp-board');
    expect(board).toBeTruthy();
    expect(board?.querySelectorAll('button')).toHaveLength(0);
    // Everything after the strip is still inside the board.
    expect(board?.querySelector('.wp-track')).toBeTruthy();
    expect(board?.querySelector('.wp-board-tmr-sleep')).toBeTruthy();
  });
});

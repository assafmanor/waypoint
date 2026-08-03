// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EVENT_STATUS } from '@waypoint/shared';
import { HeroLift, type HeroLiftPoint } from './HeroLift';
import { t } from '../../i18n/he';
import { wrapNav } from '../../test/nav-harness';

/** The lifted hero registers a back layer (it is a `Modal`), so it cannot be
 *  rendered bare — `wrapNav` supplies the provider stack rather than this file
 *  open-coding it a second time.
 *
 *  Queries go through `document`, not the render's `container`: a `Modal` portals
 *  into `document.body`, so a container query finds nothing and every assertion
 *  would pass vacuously the moment it was written as `queryBy…`. */
const show = (props: Partial<Parameters<typeof HeroLift>[0]> = {}) => {
  render(wrapNav(<HeroLift clock="14:12" now={[point()]} onClose={() => {}} {...props} />));
  return document;
};

const point = (over: Partial<HeroLiftPoint> = {}): HeroLiftPoint => ({
  key: 'now',
  title: <span>סיור אוכל</span>,
  kind: 'soft',
  until: '15:30',
  ...over,
});

describe('HeroLift', () => {
  afterEach(() => cleanup());

  it('renders the horizon: the live point, next, and אחר כך', () => {
    const container = show({
      now: [point({ place: 'Via dei Tribunali' })],
      next: point({ key: 'next', title: <span>מלון סנטרו</span>, kind: 'hard' }),
      nextTime: '16:00',
      nextCode: '#7QK4LM',
      then: { title: 'ארוחת ערב', time: '19:30' },
      rail: <div className="wp-board-progress" />,
    });
    expect(container.querySelector('.hero-lifted')).toBeTruthy();
    expect(screen.getByText('סיור אוכל')).toBeTruthy();
    expect(screen.getByText('מלון סנטרו')).toBeTruthy();
    expect(container.querySelector('.wp-board-next-meta .code')?.textContent).toBe('#7QK4LM');
    expect(container.querySelector('.hero-then')?.textContent).toContain('ארוחת ערב');
    // The rail is the collapsed board's own node, passed in — pinned as the foot.
    expect(container.querySelector('.hero-foot .wp-board-progress')).toBeTruthy();
  });

  it('has exactly one scroller, with the head and foot outside it', () => {
    const container = show({ rail: <div className="wp-board-progress" /> });
    expect(container.querySelectorAll('.hero-scroll')).toHaveLength(1);
    const scroll = container.querySelector('.hero-scroll')!;
    expect(scroll.querySelector('.hero-head')).toBeNull();
    expect(scroll.querySelector('.hero-foot')).toBeNull();
  });

  // Each part is absent when its datum is — the common case is an event with a
  // place and no note, so "no note" must be silence rather than an empty block.
  it('omits איפה, פתק and the settle strip when the point carries none of them', () => {
    const container = show({ now: [point()] });
    expect(screen.queryByText(t.hero.where)).toBeNull();
    expect(screen.queryByText(t.hero.note)).toBeNull();
    expect(container.querySelector('.wp-settle')).toBeNull();
  });

  it('shows a note, and says how many it is NOT showing', () => {
    show({ now: [point({ note: 'הכניסה מהחצר האחורית', noteMore: 2 })] });
    expect(screen.getByText('הכניסה מהחצר האחורית')).toBeTruthy();
    expect(screen.getByText(t.hero.moreNotes(2))).toBeTruthy();
  });

  it('the note count is silent when there is only one note', () => {
    show({ now: [point({ note: 'יש תור', noteMore: 0 })] });
    expect(screen.queryByText(t.hero.moreNotes(0))).toBeNull();
  });

  it('the map way-in is a button and ניווט is a real link', () => {
    const onMap = vi.fn();
    show({
      now: [point({ place: 'Via Toledo', onMap, navigateUrl: 'https://maps.example/x' })],
    });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.hero.onMap) }));
    expect(onMap).toHaveBeenCalledOnce();
    // An anchor, so long-press/share work and no popup blocker is involved.
    const nav = screen.getByRole('link', { name: new RegExp(t.hero.navigate) });
    expect(nav.getAttribute('href')).toBe('https://maps.example/x');
    expect(nav.getAttribute('rel')).toContain('noopener');
  });

  // ADR-0139: a fourth host adds a DENSITY. The words, marks and hues are not the
  // host's to choose, so the assertion is that they are the shipped ones.
  it('settles through SettleControl’s board density, with the shipped words', () => {
    const onDone = vi.fn();
    const onSkip = vi.fn();
    const container = show({ now: [point({ onDone, onSkip })] });
    const settle = container.querySelector('.wp-settle.board');
    expect(settle).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t.actions.wasThere }));
    fireEvent.click(screen.getByRole('button', { name: t.event.skipped }));
    expect(onDone).toHaveBeenCalledOnce();
    expect(onSkip).toHaveBeenCalledOnce();
  });

  it('a settled point shows the record and the one verb left', () => {
    const onUndo = vi.fn();
    const container = show({
      now: [point({ settled: EVENT_STATUS.DONE, onDone: () => {}, onSkip: () => {}, onUndo })],
    });
    expect(container.querySelector('.wp-settle-tag.ok')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t.actions.undoSettle }));
    expect(onUndo).toHaveBeenCalledOnce();
  });

  // ADR-0041 §6: the split exists on there being no primary, so no equal is
  // promoted and each carries the same depth.
  it('the group split promotes no equal and gives each the same depth', () => {
    const container = show({
      split: true,
      now: [
        point({
          key: 'a',
          title: <span>סיור</span>,
          place: 'A',
          onDone: () => {},
          onSkip: () => {},
        }),
        point({
          key: 'b',
          title: <span>שוק</span>,
          place: 'B',
          onDone: () => {},
          onSkip: () => {},
        }),
      ],
    });
    expect(screen.getByText(t.board.concurrentNow)).toBeTruthy();
    // No point is the lead, and both carry a place and a settle strip.
    expect(container.querySelectorAll('.hero-point[data-lead]')).toHaveLength(0);
    expect(container.querySelectorAll('.hero-equal-hd')).toHaveLength(2);
    expect(container.querySelectorAll('.wp-settle.board')).toHaveLength(2);
    expect(container.querySelectorAll('.hero-where-nm')).toHaveLength(2);
  });

  it('what the horizon adds to NEXT is the way through, not a second code', () => {
    const onBooking = vi.fn();
    show({
      next: point({ key: 'next', title: <span>מלון</span>, onBooking }),
      nextCode: '#ABC',
    });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.hero.toBooking) }));
    expect(onBooking).toHaveBeenCalledOnce();
    // The code is printed once, by the next-row, not again by the hand-off.
    expect(screen.getAllByText('#ABC')).toHaveLength(1);
  });

  // ADR-0160 §12's condition, asserted on the render as well as on the type: one
  // line, and nothing in it is pressable.
  it('אחר כך is one line with no control in it', () => {
    const container = show({ then: { title: 'ארוחת ערב', time: '19:30' } });
    const then = container.querySelector('.hero-then')!;
    expect(then.querySelectorAll('button, a')).toHaveLength(0);
    expect(then.textContent).toContain('19:30');
  });

  // ADR-0103/0090: it can be dismissed, so the dismissal is ONE handler. The `✕`
  // must reach the primitive's animated close rather than the caller's onClose.
  it('the ✕ closes it', () => {
    const onClose = vi.fn();
    show({ onClose });
    fireEvent.click(screen.getByRole('button', { name: t.hero.close }));
    // The exit runs first, so the caller is told after the animation — which in
    // jsdom is 0ms (`motionDurationMs` answers 0 with no CSS engine).
    expect(onClose).toHaveBeenCalled();
  });

  it('every time is the caller’s, pre-formatted — the hero derives none of them', () => {
    // The zone pill is the shared one (ADR-0107): more times on this surface means
    // more pills, and each rides its own point's shift.
    const container = show({
      now: [point({ shift: 120 })],
      next: point({ key: 'next', title: <span>מלון</span>, shift: 120 }),
      nextTime: '16:00',
    });
    expect(container.querySelectorAll('.wp-tzshift')).toHaveLength(2);
  });
});

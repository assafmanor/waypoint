// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { DayStrip, type DayStripDay } from './DayStrip';
import { fakeScroller } from '../../test/scroller-harness';

const DAYS: DayStripDay[] = [
  { date: '2026-07-18', dayOfMonth: '18', letter: 'ש', hasEvents: true },
  { date: '2026-07-19', dayOfMonth: '19', letter: 'א', monthLabel: 'יולי', hasEvents: false },
  { date: '2026-07-20', dayOfMonth: '20', letter: 'ב', hasEvents: true },
];

describe('DayStrip', () => {
  afterEach(() => cleanup());

  it('marks today (amber anchor) and the selected day in Trip mode', () => {
    const { container } = render(
      <DayStrip
        days={DAYS}
        selected="2026-07-20"
        today="2026-07-19"
        mode="trip"
        onSelect={() => {}}
      />,
    );
    const pills = container.querySelectorAll('.wp-daypill');
    // today (19th) is not selected → today-anchor; the 20th is a selected future day.
    expect(pills[1].classList.contains('today-anchor')).toBe(true);
    expect(pills[2].classList.contains('sel-future')).toBe(true);
    // A selected day is announced via aria-pressed.
    expect(pills[2].getAttribute('aria-pressed')).toBe('true');
    expect(pills[0].getAttribute('aria-pressed')).toBe('false');
  });

  it('marks the selected day "on" when it is today', () => {
    const { container } = render(
      <DayStrip
        days={DAYS}
        selected="2026-07-19"
        today="2026-07-19"
        mode="trip"
        onSelect={() => {}}
      />,
    );
    expect(container.querySelectorAll('.wp-daypill')[1].classList.contains('on')).toBe(true);
  });

  it('fires onSelect with the tapped date', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <DayStrip
        days={DAYS}
        selected="2026-07-19"
        today="2026-07-19"
        mode="trip"
        onSelect={onSelect}
      />,
    );
    fireEvent.click(container.querySelectorAll('.wp-daypill')[2]);
    expect(onSelect).toHaveBeenCalledWith('2026-07-20');
  });

  // ADR-0149 §6: the month stopped being a row above the pills and became a divider
  // between them — so it sits BEFORE the first pill of its month in the strip's own
  // flow, and it is decorative (every pill already carries its date).
  it('renders the month as a divider before the first pill of a new month', () => {
    const { container } = render(
      <DayStrip
        days={DAYS}
        selected="2026-07-19"
        today="2026-07-19"
        mode="trip"
        onSelect={() => {}}
      />,
    );
    const dividers = container.querySelectorAll('.wp-monthdiv');
    expect(dividers.length).toBe(1);
    expect(dividers[0].textContent).toBe('יולי');
    expect(dividers[0].getAttribute('aria-hidden')).toBe('true');
    // Between the pills, not above them: the divider precedes the 19th's pill.
    expect(dividers[0].nextElementSibling).toBe(container.querySelectorAll('.wp-daypill')[1]);
  });

  it('gives the pill a weekday letter over the day number', () => {
    const { container } = render(
      <DayStrip
        days={DAYS}
        selected="2026-07-19"
        today="2026-07-19"
        mode="trip"
        onSelect={() => {}}
      />,
    );
    const pill = container.querySelectorAll('.wp-daypill')[0];
    expect(pill.querySelector('.l')?.textContent).toBe('ש');
    expect(pill.querySelector('.n')?.textContent).toBe('18');
  });

  it('Plan mode: selection is violet ("on") and empty days get the gap marker', () => {
    const { container } = render(
      <DayStrip
        days={DAYS}
        selected="2026-07-18"
        today="2026-07-19"
        mode="plan"
        onSelect={() => {}}
      />,
    );
    expect(container.querySelector('.wp-daystrip')?.getAttribute('data-mode')).toBe('plan');
    const pills = container.querySelectorAll('.wp-daypill');
    expect(pills[0].classList.contains('on')).toBe(true); // selected
    expect(pills[1].classList.contains('empty')).toBe(true); // no events
    expect(pills[0].classList.contains('empty')).toBe(false); // has events
  });

  // `unscoped` = the host surface isn't showing one day: the Map's all-days scope
  // (ADR-0110 §4) and a trip-wide tab like the Index (field report #39). Both want
  // exactly this — the day is still in the URL, it is simply not the selected one here.
  it('unscoped (all-days / a trip-wide tab): drops the filled selection but keeps the today-anchor', () => {
    const { container } = render(
      <DayStrip
        days={DAYS}
        selected="2026-07-20"
        today="2026-07-19"
        mode="trip"
        onSelect={() => {}}
        unscoped
      />,
    );
    const pills = container.querySelectorAll('.wp-daypill');
    // The 20th is the active date but must NOT read as selected while unscoped.
    expect(pills[2].classList.contains('sel-future')).toBe(false);
    expect(pills[2].getAttribute('aria-pressed')).toBe('false');
    // today still anchors; the 20th falls back to plain future styling.
    expect(pills[1].classList.contains('today-anchor')).toBe(true);
    expect(pills[2].classList.contains('future')).toBe(true);
  });

  // Suppressing the selection must not suppress the CONTROL: from the Index the pill
  // is how you pick a day (its tap routes to the Day view, `daySelectTarget`).
  it('keeps every pill tappable while unscoped', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <DayStrip
        days={DAYS}
        selected="2026-07-20"
        today="2026-07-19"
        mode="trip"
        onSelect={onSelect}
        unscoped
      />,
    );
    const pills = container.querySelectorAll('.wp-daypill');
    fireEvent.click(pills[2]); // the day that would have been "selected"
    fireEvent.click(pills[0]);
    expect(onSelect.mock.calls).toEqual([['2026-07-20'], ['2026-07-18']]);
    expect([...pills].some((p) => p.hasAttribute('disabled'))).toBe(false);
  });

  // Plan mode has its own selection grammar (violet `on` + the empty-day markers), so
  // the suppression has to hold there too — and the markers have to survive it.
  it('withholds the selection in Plan mode too, keeping the empty-day markers', () => {
    const { container } = render(
      <DayStrip
        days={DAYS}
        selected="2026-07-18"
        today="2026-07-19"
        mode="plan"
        onSelect={() => {}}
        unscoped
      />,
    );
    const pills = container.querySelectorAll('.wp-daypill');
    expect(pills[0].classList.contains('on')).toBe(false);
    expect(pills[0].getAttribute('aria-pressed')).toBe('false');
    expect(pills[1].classList.contains('empty')).toBe(true);
  });

  // The centring itself — the arrival, the axis, the latch — is `lib/useCenterSelected`'s
  // own test. What belongs here is the WIRING: that the ref rides the selected pill, and
  // that an unscoped surface withholds it. The harness has to be installed after mount (React
  // creates the strip during the commit that also runs the effect), so these drive the
  // selection change rather than the arrival.
  const LONG_TRIP: DayStripDay[] = Array.from({ length: 5 }, (_, i) => ({
    date: `2026-07-${18 + i}`,
    dayOfMonth: String(18 + i),
    letter: 'ש',
    hasEvents: true,
  }));

  /** Render a 5-day strip and make its 100px pills a 300px scroller (see the harness): the
   *  first pill's centre is 100px before the viewport's, the third's 100px after. */
  function scrollableStrip(selected: string, unscoped?: boolean) {
    const props = { days: LONG_TRIP, today: '2026-07-19', mode: 'trip' as const, onSelect() {} };
    const { container, rerender } = render(
      <DayStrip {...props} selected={selected} unscoped={unscoped} />,
    );
    const strip = container.querySelector<HTMLElement>('.wp-daystrip')!;
    const pills = Array.from(container.querySelectorAll<HTMLElement>('.wp-daypill'));
    return {
      scroller: fakeScroller(strip, pills),
      select: (date: string) =>
        rerender(<DayStrip {...props} selected={date} unscoped={unscoped} />),
    };
  }

  it('centres the newly selected pill in the strip', () => {
    const { scroller, select } = scrollableStrip('2026-07-19');
    select('2026-07-20'); // the third pill — 100px past the strip's centre
    expect(scroller.lastDelta()).toBe(100);

    select('2026-07-18'); // back to the first — 100px before it
    expect(scroller.lastDelta()).toBe(-100);
  });

  it('does not centre a day that is not visually selected (unscoped surface)', () => {
    const { scroller, select } = scrollableStrip('2026-07-19', true);
    select('2026-07-20');
    expect(scroller.calls).toHaveLength(0);
  });

  // Spring-loaded pills (ADR-0116 session-119): while a drag is in flight the strip
  // announces its pills as drop targets and shows which one a drop would land on. The
  // dwell that actually switches days lives with the drag (`lib/useSpringLoadedDay`),
  // because only it can hit-test the pointer — a touch pointer is implicitly captured
  // by the element the touch started on, so the pill's own `pointerenter` never fires.
  describe('while a drag is in flight', () => {
    const strip = (props: { dragging?: boolean; overDate?: string | null }) =>
      render(
        <DayStrip
          days={DAYS}
          selected="2026-07-19"
          today="2026-07-19"
          mode="plan"
          onSelect={vi.fn()}
          {...props}
        />,
      ).container;

    it('marks its pills as drop targets only while dragging', () => {
      expect(strip({ dragging: true }).querySelectorAll('[data-day-pill]')).toHaveLength(
        DAYS.length,
      );
      cleanup();
      expect(strip({}).querySelectorAll('[data-day-pill]')).toHaveLength(0);
    });

    it('lights the pill the drag is over, so the drop reads as landing there', () => {
      const container = strip({ dragging: true, overDate: '2026-07-20' });
      const pills = container.querySelectorAll('.wp-daypill');
      expect(pills[2].className).toContain('drop-over');
      expect(pills[0].className).not.toContain('drop-over');
    });

    it('lights nothing when no drag is in flight', () => {
      const container = strip({ overDate: '2026-07-20' });
      expect(container.querySelector('.drop-over')).toBeNull();
    });
  });
});

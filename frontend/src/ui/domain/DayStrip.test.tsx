// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { DayStrip, type DayStripDay } from './DayStrip';

// jsdom has no layout engine, so it doesn't implement scrollIntoView — the
// auto-scroll-to-selected effect below calls it on every mount/selection change.
Element.prototype.scrollIntoView = vi.fn();

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

  it('renders the month label above the first pill of a new month', () => {
    const { container } = render(
      <DayStrip
        days={DAYS}
        selected="2026-07-19"
        today="2026-07-19"
        mode="trip"
        onSelect={() => {}}
      />,
    );
    const labels = container.querySelectorAll('.wp-month-label');
    expect(labels.length).toBe(1);
    expect(labels[0].textContent).toBe('יולי');
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

  it('allScope (Map all-days): drops the filled selection but keeps the today-anchor', () => {
    const { container } = render(
      <DayStrip
        days={DAYS}
        selected="2026-07-20"
        today="2026-07-19"
        mode="trip"
        onSelect={() => {}}
        allScope
      />,
    );
    const pills = container.querySelectorAll('.wp-daypill');
    // The 20th is the active date but must NOT read as selected under all-days.
    expect(pills[2].classList.contains('sel-future')).toBe(false);
    expect(pills[2].getAttribute('aria-pressed')).toBe('false');
    // today still anchors; the 20th falls back to plain future styling.
    expect(pills[1].classList.contains('today-anchor')).toBe(true);
    expect(pills[2].classList.contains('future')).toBe(true);
  });

  it('scrolls the selected pill into view (centered) on mount and on selection change', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const { container, rerender } = render(
      <DayStrip
        days={DAYS}
        selected="2026-07-19"
        today="2026-07-19"
        mode="trip"
        onSelect={() => {}}
      />,
    );
    expect(scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ inline: 'center', block: 'nearest' }),
    );
    const pills = container.querySelectorAll('.wp-daypill');
    expect(scrollIntoView.mock.instances[0]).toBe(pills[1]); // the 19th (selected)

    scrollIntoView.mockClear();
    rerender(
      <DayStrip
        days={DAYS}
        selected="2026-07-20"
        today="2026-07-19"
        mode="trip"
        onSelect={() => {}}
      />,
    );
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.instances[0]).toBe(pills[2]); // the 20th (now selected)
  });
});

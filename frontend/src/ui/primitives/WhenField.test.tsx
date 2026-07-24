// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { WhenField } from './WhenField';

const spanProps = {
  variant: 'span' as const,
  minDate: '2026-07-01',
  maxDate: '2026-07-31',
  labels: { start: 'המראה 🛫', end: 'נחיתה 🛬' },
  timeZone: 'UTC',
};

describe('WhenField — day variant', () => {
  afterEach(() => cleanup());

  it('round-trips the date and preserves the time range', () => {
    const onChange = vi.fn();
    const { container } = render(
      <WhenField
        variant="day"
        date="2026-07-20"
        start="09:00"
        end="10:00"
        onChange={onChange}
        minDate="2026-07-01"
        maxDate="2026-07-31"
      />,
    );
    const date = container.querySelector('input[type="date"]') as HTMLInputElement;
    expect(date.value).toBe('2026-07-20');
    fireEvent.change(date, { target: { value: '2026-07-22' } });
    expect(onChange).toHaveBeenCalledWith({ date: '2026-07-22', start: '09:00', end: '10:00' });
  });
});

describe('WhenField — span variant', () => {
  afterEach(() => cleanup());

  it('day variant: shows the zone chip only when a zone is passed (ADR-0107 §6)', () => {
    const bare = render(
      <WhenField variant="day" date="2026-07-20" start="09:00" end="10:00" onChange={() => {}} />,
    );
    expect(bare.container.querySelector('.zchip')).toBeNull();
    cleanup();

    const zoned = render(
      <WhenField
        variant="day"
        date="2026-07-20"
        start="09:00"
        end="10:00"
        onChange={() => {}}
        zone={{ value: 'Asia/Tokyo' }}
      />,
    );
    expect(zoned.container.querySelector('.zchip-zone')!.textContent).toContain('Tokyo');
    // No onChange → a statement, not a control (the zone follows a picked place).
    expect(zoned.container.querySelector('.zchip-btn')).toBeNull();
  });

  it('bounds the end date to [start, tripEnd] so it can never precede the start', () => {
    render(<WhenField {...spanProps} start="2026-07-26T08:00" end="" onChange={vi.fn()} />);
    const dates = document.querySelectorAll('input[type="date"]');
    // Start leg: full trip range. End leg: earliest is the start's day.
    expect((dates[0] as HTMLInputElement).min).toBe('2026-07-01');
    expect((dates[0] as HTMLInputElement).max).toBe('2026-07-31');
    expect((dates[1] as HTMLInputElement).min).toBe('2026-07-26');
    expect((dates[1] as HTMLInputElement).max).toBe('2026-07-31');
  });

  it('seeds both endpoints and marks a crossed day with a +N badge', () => {
    render(
      <WhenField
        {...spanProps}
        start="2026-07-26T23:20"
        end="2026-07-27T17:05"
        onChange={vi.fn()}
      />,
    );
    const dates = document.querySelectorAll('input[type="date"]');
    expect((dates[0] as HTMLInputElement).value).toBe('2026-07-26');
    expect((dates[1] as HTMLInputElement).value).toBe('2026-07-27');
    // The end leg carries a "+1" crosses-a-day badge and a duration read-out.
    expect(screen.getByText('+1')).toBeTruthy();
    expect(screen.getByText(/משך:/)).toBeTruthy();
  });

  it('reads a lodging span in nights from the two calendar days (no crosses-a-day note)', () => {
    render(
      <WhenField
        {...spanProps}
        labels={{ start: 'צ׳ק-אין 🏨', end: 'צ׳ק-אאוט 🧳' }}
        durationUnit="nights"
        start="2026-07-15T15:00"
        end="2026-07-17T10:00"
        onChange={vi.fn()}
      />,
    );
    // Two calendar days apart → "2 לילות", not the elapsed-time "יום".
    expect(screen.getByText(/משך:/).textContent).toContain('2 לילות');
    expect(screen.queryByText(/חוצה יממה/)).toBeNull();
  });

  it('opens a time panel and AUTO-CLOSES it when a time is picked', () => {
    const onChange = vi.fn();
    render(<WhenField {...spanProps} start="2026-07-26" end="" onChange={onChange} />);
    // Open the departure time panel (the first leg).
    fireEvent.click(screen.getAllByText('הוסף שעה')[0]);
    expect(document.querySelector('.tp-panel')).toBeTruthy();
    // Pick 09:00 from the list → combines with the seeded date and closes the panel.
    const list = document.querySelector('.tp-list') as HTMLElement;
    fireEvent.click(within(list).getByText('09:00'));
    expect(onChange).toHaveBeenCalledWith({ start: '2026-07-26T09:00', end: '' });
    expect(document.querySelector('.tp-panel')).toBeNull();
  });

  it('a time picked before a date borrows the defaultDate', () => {
    const onChange = vi.fn();
    render(
      <WhenField {...spanProps} start="" end="" defaultDate="2026-07-26" onChange={onChange} />,
    );
    fireEvent.click(screen.getAllByText('הוסף שעה')[0]);
    const list = document.querySelector('.tp-list') as HTMLElement;
    fireEvent.click(within(list).getByText('08:30'));
    expect(onChange).toHaveBeenCalledWith({ start: '2026-07-26T08:30', end: '' });
  });
});

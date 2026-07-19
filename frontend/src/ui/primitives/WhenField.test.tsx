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

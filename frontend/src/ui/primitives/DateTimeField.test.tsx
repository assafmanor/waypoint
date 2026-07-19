// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DateTimeField } from './DateTimeField';

describe('DateTimeField', () => {
  afterEach(() => cleanup());

  it('mode="date" round-trips a YYYY-MM-DD value', () => {
    const onChange = vi.fn();
    const { container } = render(
      <DateTimeField
        mode="date"
        value="2026-07-20"
        onChange={onChange}
        min="2026-07-01"
        max="2026-07-31"
      />,
    );
    const input = container.querySelector('input[type="date"]') as HTMLInputElement;
    expect(input.value).toBe('2026-07-20');
    fireEvent.change(input, { target: { value: '2026-07-22' } });
    expect(onChange).toHaveBeenCalledWith('2026-07-22');
  });

  it('mode="datetime" splits the value and recombines each part', () => {
    const onChange = vi.fn();
    const { container } = render(
      <DateTimeField
        mode="datetime"
        value="2026-07-20T15:30"
        onChange={onChange}
        min="2026-07-01T00:00"
        max="2026-07-31T23:59"
      />,
    );
    const date = container.querySelector('input[type="date"]') as HTMLInputElement;
    const time = container.querySelector('input[type="time"]') as HTMLInputElement;
    expect(date.value).toBe('2026-07-20');
    expect(time.value).toBe('15:30');
    // Only the date part bounds the date input.
    expect(date.min).toBe('2026-07-01');
    expect(date.max).toBe('2026-07-31');

    fireEvent.change(time, { target: { value: '18:00' } });
    expect(onChange).toHaveBeenCalledWith('2026-07-20T18:00');
    fireEvent.change(date, { target: { value: '2026-07-21' } });
    expect(onChange).toHaveBeenCalledWith('2026-07-21T15:30');
  });

  it('mode="datetime" emits empty until both parts are present', () => {
    const onChange = vi.fn();
    const { container } = render(<DateTimeField mode="datetime" value="" onChange={onChange} />);
    const date = container.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(date, { target: { value: '2026-07-20' } });
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('mode="time" renders the TimePicker range control', () => {
    const onChange = vi.fn();
    render(<DateTimeField mode="time" start="09:00" end="10:00" onChange={onChange} />);
    // TimePicker surfaces the committed start value.
    expect(screen.getByText('09:00')).toBeTruthy();
  });
});

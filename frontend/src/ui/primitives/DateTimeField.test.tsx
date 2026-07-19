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

  it('mode="datetime" seeds both parts from the value and bounds only the date', () => {
    const { container } = render(
      <DateTimeField
        mode="datetime"
        value="2026-07-20T15:30"
        onChange={vi.fn()}
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
  });

  it('mode="datetime" keeps a partial date and combines once a time is added', () => {
    const onChange = vi.fn();
    const { container } = render(<DateTimeField mode="datetime" value="" onChange={onChange} />);
    const date = container.querySelector('input[type="date"]') as HTMLInputElement;
    const time = container.querySelector('input[type="time"]') as HTMLInputElement;
    // A date on its own is not yet a usable instant, but it must not be lost.
    fireEvent.change(date, { target: { value: '2026-07-20' } });
    expect(onChange).toHaveBeenLastCalledWith('');
    expect(date.value).toBe('2026-07-20');
    fireEvent.change(time, { target: { value: '09:00' } });
    expect(onChange).toHaveBeenLastCalledWith('2026-07-20T09:00');
  });

  it('mode="datetime" keeps a time entered before a date, then combines', () => {
    const onChange = vi.fn();
    const { container } = render(<DateTimeField mode="datetime" value="" onChange={onChange} />);
    const date = container.querySelector('input[type="date"]') as HTMLInputElement;
    const time = container.querySelector('input[type="time"]') as HTMLInputElement;
    fireEvent.change(time, { target: { value: '09:00' } });
    expect(onChange).toHaveBeenLastCalledWith('');
    expect(time.value).toBe('09:00');
    fireEvent.change(date, { target: { value: '2026-07-21' } });
    expect(onChange).toHaveBeenLastCalledWith('2026-07-21T09:00');
  });

  it('mode="datetime" auto-fills the date from defaultDate when time comes first', () => {
    const onChange = vi.fn();
    const { container } = render(
      <DateTimeField mode="datetime" value="" defaultDate="2026-07-20" onChange={onChange} />,
    );
    const date = container.querySelector('input[type="date"]') as HTMLInputElement;
    const time = container.querySelector('input[type="time"]') as HTMLInputElement;
    fireEvent.change(time, { target: { value: '09:00' } });
    expect(onChange).toHaveBeenLastCalledWith('2026-07-20T09:00');
    expect(date.value).toBe('2026-07-20');
  });

  it('mode="datetime" adopts an external value replacement (edit-load / reset)', () => {
    const { container, rerender } = render(
      <DateTimeField mode="datetime" value="2026-07-20T15:30" onChange={vi.fn()} />,
    );
    const date = container.querySelector('input[type="date"]') as HTMLInputElement;
    rerender(<DateTimeField mode="datetime" value="2026-07-22T08:00" onChange={vi.fn()} />);
    expect(date.value).toBe('2026-07-22');
  });

  it('mode="time" renders the TimePicker range control', () => {
    const onChange = vi.fn();
    render(<DateTimeField mode="time" start="09:00" end="10:00" onChange={onChange} />);
    // TimePicker surfaces the committed start value.
    expect(screen.getByText('09:00')).toBeTruthy();
  });
});

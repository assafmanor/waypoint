// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { TimeField, toMin, toHHMM, nearestRoundSlot } from './TimeField';

describe('TimeField helpers', () => {
  it('round-trips minutes ↔ HH:MM', () => {
    expect(toMin('09:15')).toBe(9 * 60 + 15);
    expect(toHHMM(9 * 60 + 15)).toBe('09:15');
  });
  it('suggests the nearest quarter-hour, capped at 23:45', () => {
    expect(nearestRoundSlot(11 * 60 + 47)).toBe(11 * 60 + 45);
    expect(nearestRoundSlot(23 * 60 + 58)).toBe(23 * 60 + 45);
  });
});

describe('TimeField (shared atom)', () => {
  afterEach(() => cleanup());

  it('opens on tap and AUTO-CLOSES when a time is picked', () => {
    const onChange = vi.fn();
    render(<TimeField value="" onChange={onChange} label="שעה" placeholder="הוסף שעה" />);
    fireEvent.click(screen.getByText('הוסף שעה'));
    expect(document.querySelector('.tp-panel')).toBeTruthy();
    const list = document.querySelector('.tp-list') as HTMLElement;
    fireEvent.click(within(list).getByText('09:00'));
    expect(onChange).toHaveBeenCalledWith('09:00');
    expect(document.querySelector('.tp-panel')).toBeNull(); // auto-closed
  });

  it('offers no clear footer for an empty value', () => {
    render(
      <TimeField
        value=""
        onChange={vi.fn()}
        onClear={vi.fn()}
        label="שעה"
        placeholder="הוסף שעה"
      />,
    );
    fireEvent.click(screen.getByText('הוסף שעה'));
    expect(document.querySelector('.tp-panel-clear')).toBeNull();
  });

  it('clears (and closes) via the footer when a value is set', () => {
    const onClear = vi.fn();
    render(
      <TimeField
        value="09:00"
        onChange={vi.fn()}
        onClear={onClear}
        label="שעה"
        placeholder="הוסף שעה"
      />,
    );
    fireEvent.click(screen.getByText('09:00'));
    const clear = document.querySelector('.tp-panel-clear') as HTMLElement;
    expect(clear).toBeTruthy();
    fireEvent.click(clear);
    expect(onClear).toHaveBeenCalled();
    expect(document.querySelector('.tp-panel')).toBeNull();
  });
});

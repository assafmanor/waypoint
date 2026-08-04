// @vitest-environment jsdom
//
// The day as a time picker (ADR-0161 §4). What matters here is that it ASKS in positions and
// ANSWERS in slots: every row shows the clock it computes, and picking one hands back the
// slot rather than a time the user typed. The positions themselves come from
// `lib/day-positions.ts`, which is tested there.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DaySlotPicker, type DaySlotOption } from './DaySlotPicker';
import { t } from '../../i18n/he';

const option = (key: string, label: string, time: string, free?: string): DaySlotOption => ({
  key,
  label,
  time,
  free,
  fill: { date: '2026-07-07', start: time, end: '13:30' },
});

const OPTIONS = [
  option('a', 'בתחילת היום', '08:00'),
  option('b', 'אחרי מוזיאון', '12:30', t.planDay.slotFree('שעתיים')),
];

const picker = (props: Partial<Parameters<typeof DaySlotPicker>[0]> = {}) =>
  render(
    <DaySlotPicker
      sub={t.planDay.slotWhen}
      options={OPTIONS}
      onPick={vi.fn()}
      onExact={vi.fn()}
      {...props}
    />,
  );

describe('DaySlotPicker', () => {
  afterEach(() => cleanup());

  it('asks its question and lists every position given', () => {
    picker();
    expect(screen.getByText(t.planDay.slotWhen)).toBeTruthy();
    expect(screen.getByText('בתחילת היום')).toBeTruthy();
    expect(screen.getByText('אחרי מוזיאון')).toBeTruthy();
  });

  // The point of the whole component: you READ the time instead of picking it.
  it('shows the clock each position resolves to', () => {
    picker();
    expect(screen.getByText('08:00')).toBeTruthy();
    expect(screen.getByText('12:30')).toBeTruthy();
  });

  it('says how much free time is there, only where there is some to say', () => {
    picker();
    expect(screen.getByText(t.planDay.slotFree('שעתיים'))).toBeTruthy();
    // The first option carries none, so nothing about free time is rendered for it.
    expect(screen.queryByText(t.planDay.slotFree(''))).toBeNull();
  });

  it('hands back the SLOT, not a time — the caller writes what a drop would have', () => {
    const onPick = vi.fn();
    picker({ onPick });
    fireEvent.click(screen.getByText('אחרי מוזיאון'));
    expect(onPick).toHaveBeenCalledWith(OPTIONS[1].fill);
  });

  it('offers עכשיו first and marks it, when the host says the day is today', () => {
    const now = option('now', t.planDay.slotNow, '14:20');
    picker({ now });
    const rows = document.querySelectorAll('.slotpick-opt');
    expect(rows[0].textContent).toContain(t.planDay.slotNow);
    expect(rows[0].className).toContain('now');
  });

  it('has no עכשיו at all otherwise — it owns no clock of its own', () => {
    picker();
    expect(screen.queryByText(t.planDay.slotNow)).toBeNull();
  });

  // ADR-0036's setter is not replaced, it stops being the only way in.
  it('always offers the exact-time escape', () => {
    const onExact = vi.fn();
    picker({ onExact });
    fireEvent.click(screen.getByText(t.planDay.slotExactTime));
    expect(onExact).toHaveBeenCalledTimes(1);
  });

  // What made a cross-day move drag-only before ADR-0161 (through a spring-loaded dwell on a
  // day pill). Offered only where the host can act on it.
  it('offers another day when the host can take one, and not otherwise', () => {
    const onOtherDay = vi.fn();
    picker({ onOtherDay });
    fireEvent.click(screen.getByText(t.planDay.slotOtherDay));
    expect(onOtherDay).toHaveBeenCalledTimes(1);
    cleanup();
    picker();
    expect(screen.queryByText(t.planDay.slotOtherDay)).toBeNull();
  });
});

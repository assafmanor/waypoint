// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { wrapNav } from '../../test/nav-harness';
import { TimeField, toMin, toHHMM, nearestRoundSlot, offeredFrom } from './TimeField';

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
    render(wrapNav(<TimeField value="" onChange={onChange} label="שעה" placeholder="הוסף שעה" />));
    fireEvent.click(screen.getByText('הוסף שעה'));
    expect(document.querySelector('.tp-panel')).toBeTruthy();
    const list = document.querySelector('.tp-list') as HTMLElement;
    fireEvent.click(within(list).getByText('09:00'));
    expect(onChange).toHaveBeenCalledWith('09:00');
    expect(document.querySelector('.tp-panel')).toBeNull(); // auto-closed
  });

  it('offers no clear footer for an empty value', () => {
    render(
      wrapNav(
        <TimeField
          value=""
          onChange={vi.fn()}
          onClear={vi.fn()}
          label="שעה"
          placeholder="הוסף שעה"
        />,
      ),
    );
    fireEvent.click(screen.getByText('הוסף שעה'));
    expect(document.querySelector('.tp-panel-clear')).toBeNull();
  });

  it('clears (and closes) via the footer when a value is set', () => {
    const onClear = vi.fn();
    render(
      wrapNav(
        <TimeField
          value="09:00"
          onChange={vi.fn()}
          onClear={onClear}
          label="שעה"
          placeholder="הוסף שעה"
        />,
      ),
    );
    fireEvent.click(screen.getByText('09:00'));
    const clear = document.querySelector('.tp-panel-clear') as HTMLElement;
    expect(clear).toBeTruthy();
    fireEvent.click(clear);
    expect(onClear).toHaveBeenCalled();
    expect(document.querySelector('.tp-panel')).toBeNull();
  });
});

/* ── A clock that FOLLOWS another one (ADR-0203 §10) ─────────────────────────────────
   Reported from the field: the arrival's list opened at 00:00 whatever the departure was. */
describe('offeredFrom — the offered order', () => {
  const ALL = Array.from({ length: 96 }, (_, i) => i * 15);
  const rowOf = (list: number[], hhmm: string) => list.indexOf(toMin(hhmm));

  it('starts one step after the anchor and wraps through midnight back to it', () => {
    const list = offeredFrom(toMin('20:30'), ALL);
    expect(toHHMM(list[0])).toBe('20:45');
    expect(toHHMM(list[list.length - 1])).toBe('20:30');
    // Every slot survives — rotated, never filtered: an arrival at 00:45 after a 20:30
    // departure is tomorrow, not an error, so removing it would remove the answer.
    expect(list.length).toBe(ALL.length);
    expect(new Set(list).size).toBe(ALL.length);
  });

  /** **The property that makes this worth doing.** The row a leg lands on stops depending on
   *  where midnight happens to fall relative to the departure — a fact about nothing — and
   *  depends only on how long the leg is. Measured in the mockup at 2–86 today against a
   *  constant 3. */
  it('puts a leg of a given length on the same row whatever the anchor', () => {
    const LEG = 60;
    const rows = ['20:30', '06:00', '23:30'].map((a) => {
      const anchor = toMin(a);
      return offeredFrom(anchor, ALL).indexOf((anchor + LEG) % 1440);
    });
    expect(new Set(rows).size).toBe(1);
    expect(rows[0]).toBe(LEG / 15 - 1);
    // What it replaces: the same three anchors, unrotated, spread across the whole list.
    const shipped = ['20:30', '06:00', '23:30'].map((a) => ALL.indexOf((toMin(a) + LEG) % 1440));
    expect(new Set(shipped).size).toBeGreaterThan(1);
  });

  it('leaves the order alone when there is no anchor to follow', () => {
    expect(offeredFrom(-1, ALL)).toEqual(ALL);
  });

  it('composes with a bound: the anchor orders whatever the filter left', () => {
    const bounded = ALL.filter((m) => m > toMin('08:00'));
    const list = offeredFrom(toMin('20:30'), bounded);
    expect(list.length).toBe(bounded.length);
    expect(toHHMM(list[0])).toBe('20:45');
    expect(rowOf(list, '08:00')).toBe(-1);
  });
});

describe('TimeField — the day turning inside the list', () => {
  afterEach(() => cleanup());

  const open = (props: Partial<Parameters<typeof TimeField>[0]> = {}) => {
    render(
      wrapNav(
        <TimeField value="" onChange={vi.fn()} label="נחיתה" placeholder="הוספת שעה" {...props} />,
      ),
    );
    fireEvent.click(screen.getByText('הוספת שעה'));
  };

  const rows = () => [...document.querySelectorAll('.tp-list > *')];
  /** Which offered row the divider sits above. */
  const turnBefore = () => {
    const i = rows().findIndex((el) => el.classList.contains('tp-list-turn'));
    return i < 0 ? null : rows()[i + 1]?.textContent;
  };

  it('draws no divider without a host to say where the day turns', () => {
    open({ afterTime: '20:30' });
    expect(document.querySelector('.tp-list-turn')).toBeNull();
  });

  it('turns the day where the host says, which for one zone is midnight', () => {
    // The same-zone answer: every clock at or after the anchor is today, the rest tomorrow.
    open({
      afterTime: '20:30',
      dayOffsetOf: (hhmm) => (toMin(hhmm) > toMin('20:30') ? 0 : 1),
    });
    expect(turnBefore()).toBe('00:00');
  });

  /** **The case a midnight divider would get wrong**, and the reason the host answers this
   *  rather than the list computing it: Tokyo 21:00 → Honolulu 09:00 is the SAME calendar day,
   *  because the flight also crossed nineteen hours westward (ADR-0203 §2). */
  it('draws no divider on a westward crossing, where the day does not turn', () => {
    open({ afterTime: '21:00', dayOffsetOf: () => 0 });
    expect(document.querySelector('.tp-list-turn')).toBeNull();
  });

  it('offers the anchor last, not first — an arrival at its own departure is 24h later', () => {
    open({ afterTime: '20:30' });
    const buttons = [...document.querySelectorAll('.tp-list button')];
    expect(buttons[0].textContent).toBe('20:45');
    expect(buttons[buttons.length - 1].textContent).toBe('20:30');
  });
});

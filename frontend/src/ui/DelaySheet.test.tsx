// @vitest-environment jsdom
// **The day takes a delay** (ADR-0231 §5) — the sheet's contract: what moves and what stays is
// said before the tap, the chips are the delays the app offers, and a chip commits on tap.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EVENT_KIND, EVENT_STATUS, type TripEvent } from '@waypoint/shared';
import { wrapNav } from '../test/nav-harness';
import { DelaySheet } from './DelaySheet';
import { DAY_DELAY_STEPS } from '../constants';
import { t } from '../i18n/he';

const TZ = 'Asia/Tokyo';
const DATE = '2026-09-16';
const ev = (id: string, start: string, kind: TripEvent['kind'] = EVENT_KIND.SOFT): TripEvent => ({
  id,
  tripId: 't1',
  date: DATE,
  title: id,
  kind,
  status: EVENT_STATUS.PLANNED,
  startsAt: `${DATE}T${start}:00+09:00`,
  sortOrder: 1,
  source: 'manual',
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
  updatedBy: 'u1',
});

describe('DelaySheet', () => {
  afterEach(() => cleanup());

  it('says what moves, from when, and what stays — before any tap', () => {
    render(
      wrapNav(
        <DelaySheet
          moved={[ev('free', '16:30'), ev('bar', '21:30')]}
          anchor={ev('ramen', '19:30', EVENT_KIND.HARD)}
          nowLabel="13:51"
          tz={TZ}
          onPick={() => {}}
          onClose={() => {}}
        />,
      ),
    );
    expect(screen.getByText(t.day.late.what(2, '16:30'))).toBeTruthy();
    const anchor = document.querySelector('.late-anchor')!;
    expect(anchor.textContent).toContain('ramen');
    expect(anchor.textContent).toContain('19:30');
    expect(anchor.textContent).toContain(t.day.late.anchorStays);
    expect(anchor.querySelector('.hard-lock')).toBeTruthy();
  });

  it('names no anchor when nothing hard is ahead', () => {
    render(
      wrapNav(
        <DelaySheet
          moved={[ev('free', '16:30')]}
          anchor={null}
          nowLabel="13:51"
          tz={TZ}
          onPick={() => {}}
          onClose={() => {}}
        />,
      ),
    );
    expect(document.querySelector('.late-anchor')).toBeNull();
    expect(screen.getByText(t.day.late.what(1, '16:30'))).toBeTruthy();
  });

  it('offers exactly the app’s delay steps, and a chip commits its minutes on tap', () => {
    const onPick = vi.fn();
    render(
      wrapNav(
        <DelaySheet
          moved={[ev('free', '16:30')]}
          anchor={null}
          nowLabel="13:51"
          tz={TZ}
          onPick={onPick}
          onClose={() => {}}
        />,
      ),
    );
    const pills = document.querySelectorAll('.late-steps .choice-pill');
    expect(pills.length).toBe(DAY_DELAY_STEPS.length);
    fireEvent.click(screen.getByRole('radio', { name: t.day.late.minutes(45) }));
    expect(onPick).toHaveBeenCalledWith(45);
  });
});

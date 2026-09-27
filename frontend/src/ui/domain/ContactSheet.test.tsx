// @vitest-environment jsdom
//
// **The days as a contact sheet** (ADR-0240 §4). The two frame shapes (a picture, or the date
// stamped where one would be) and the one verb: a frame opens its day.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { ContactSheetDay } from '../../lib/memory-home';
import { ContactSheet } from './ContactSheet';

const day = (date: string, extra: Partial<ContactSheetDay> = {}): ContactSheetDay => ({
  date,
  when: `ו׳ ${date.slice(8)}.09`,
  numeral: date.slice(8),
  name: 'Asakusa',
  glyphs: ['⛩️', '🐟'],
  ...extra,
});

describe('ContactSheet', () => {
  afterEach(() => cleanup());

  it('stamps the date where a missing picture would be, and pictures the day that has one', () => {
    const { container } = render(
      <ContactSheet
        days={[
          day('2026-09-25'),
          day('2026-09-26', { shot: { url: '/a.jpg', of: 'Senso-ji', credit: 'CC BY-SA' } }),
        ]}
        onOpen={() => {}}
      />,
    );
    const frames = container.querySelectorAll('.mem-day');
    expect(frames).toHaveLength(2);
    expect(frames[0]!.querySelector('.mem-day-stamp')?.textContent).toBe('25');
    expect(frames[0]!.querySelector('.wp-photoband')).toBeNull();
    expect(frames[1]!.querySelector('.wp-photoband.is-thumb img')).toBeTruthy();
    // The frame is the control, so the picture inside it is not a second one.
    expect(frames[1]!.querySelector('.wp-photoband button')).toBeNull();
    expect(frames[1]!.querySelector('.mem-day-marks')?.textContent).toBe('⛩️ 🐟');
  });

  it('opens the day a frame stands for', () => {
    const onOpen = vi.fn();
    const { container } = render(
      <ContactSheet days={[day('2026-09-25'), day('2026-09-27')]} onOpen={onOpen} />,
    );
    fireEvent.click(container.querySelectorAll('.mem-day')[1]!);
    expect(onOpen).toHaveBeenCalledWith('2026-09-27');
  });
});

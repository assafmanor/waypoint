// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MaybeCard } from './MaybeCard';

describe('MaybeCard', () => {
  afterEach(() => cleanup());

  it('renders icon/title/action and schedules on tap (single-button form)', () => {
    const onSchedule = vi.fn();
    const { container } = render(
      <MaybeCard icon="🍜" title="ראמן" action="＋ שבץ ליום" onSchedule={onSchedule} />,
    );
    expect(container.querySelector('.wp-maybecard-ic')?.textContent).toBe('🍜');
    expect(screen.getByText('ראמן')).toBeTruthy();
    fireEvent.click(screen.getByRole('button'));
    expect(onSchedule).toHaveBeenCalledTimes(1);
  });

  it('renders the REAL meta prop when passed', () => {
    const { container } = render(
      <MaybeCard icon="🍜" title="ראמן" meta="נוסף ע״י נועם" action="שבץ" onSchedule={() => {}} />,
    );
    expect(container.querySelector('.wp-maybecard-meta')?.textContent).toBe('נוסף ע״י נועם');
  });

  it('omits the meta line when meta is not passed (no fixture slot)', () => {
    const { container } = render(
      <MaybeCard icon="🍜" title="ראמן" action="שבץ" onSchedule={() => {}} />,
    );
    expect(container.querySelector('.wp-maybecard-meta')).toBeNull();
  });

  it('dims + disables scheduling when consumed', () => {
    const onSchedule = vi.fn();
    const { container } = render(
      <MaybeCard icon="🍜" title="ראמן" action="שובץ" onSchedule={onSchedule} disabled />,
    );
    const btn = screen.getByRole('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(container.querySelector('.wp-maybecard.consumed')).toBeTruthy();
  });

  it('renders the remove variant (PlanDay shelf): body schedules, corner removes', () => {
    const onSchedule = vi.fn();
    const onRemove = vi.fn();
    render(
      <MaybeCard
        icon="🍜"
        title="ראמן"
        action="שבץ"
        onSchedule={onSchedule}
        onRemove={onRemove}
        removeLabel="הסר רעיון"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'הסר רעיון' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
    // The body button is the other button (no accessible-name match) — click it.
    const body = document.querySelector('.wp-maybecard-body') as HTMLButtonElement;
    fireEvent.click(body);
    expect(onSchedule).toHaveBeenCalledTimes(1);
  });
});

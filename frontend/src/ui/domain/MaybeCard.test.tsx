// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MaybeCard, MaybeMoreCard } from './MaybeCard';

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

  // The tile (ADR-0116's session-202 amendment §2). Geometry lives in CSS, which a
  // jsdom test cannot see — what it CAN assert is the markup that geometry needs,
  // and that the action line is genuinely gone rather than merely hidden.
  describe('the compact tile', () => {
    it('carries the modifier and wraps title + meta so the row axis has a block', () => {
      const { container } = render(
        <MaybeCard compact icon="🍜" title="ראמן" meta="0.3 ק״מ" onSchedule={() => {}} />,
      );
      expect(container.querySelector('.wp-maybecard.compact')).toBeTruthy();
      const main = container.querySelector('.wp-maybecard-main');
      expect(main?.querySelector('.wp-maybecard-title')?.textContent).toBe('ראמן');
      expect(main?.querySelector('.wp-maybecard-meta')?.textContent).toBe('0.3 ק״מ');
    });

    it('has no action line — the section hint above the strip says it once', () => {
      const { container } = render(
        <MaybeCard compact icon="🍜" title="ראמן" onSchedule={() => {}} />,
      );
      expect(container.querySelector('.wp-maybecard-add')).toBeNull();
    });

    it('keeps every other card behaviour: tap schedules, remove still removes', () => {
      const onSchedule = vi.fn();
      const onRemove = vi.fn();
      render(
        <MaybeCard
          compact
          icon="🍜"
          title="ראמן"
          onSchedule={onSchedule}
          onRemove={onRemove}
          removeLabel="הסר רעיון"
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'הסר רעיון' }));
      fireEvent.click(document.querySelector('.wp-maybecard-body') as HTMLButtonElement);
      expect(onRemove).toHaveBeenCalledTimes(1);
      expect(onSchedule).toHaveBeenCalledTimes(1);
    });
  });

  // The way through to the rest (§5). It borrows the tile's box and not its grammar,
  // so what a test can hold is that it is NOT a maybe card wearing a different hat:
  // no soft modifier, no schedule, no drag, no remove.
  describe('MaybeMoreCard', () => {
    it('opens the rest, and carries the tile box without the idea affordances', () => {
      const onOpen = vi.fn();
      const { container } = render(
        <MaybeMoreCard label="עוד 35 · במפה" icon={<span className="icon" />} onOpen={onOpen} />,
      );
      fireEvent.click(screen.getByRole('button', { name: /עוד 35/ }));
      expect(onOpen).toHaveBeenCalledTimes(1);
      expect(container.querySelector('.wp-maybecard.compact.more')).toBeTruthy();
      expect(container.querySelector('.wp-maybecard-add')).toBeNull();
      expect(container.querySelector('.wp-maybecard-remove')).toBeNull();
      expect(container.querySelector('.draggable')).toBeNull();
    });
  });

  // The wrapper is unconditional so there is one markup shape; `display: contents`
  // is what keeps the shipped card laying out exactly as it did.
  it('wraps title + meta on the base card too, without dropping the action', () => {
    const { container } = render(
      <MaybeCard icon="🍜" title="ראמן" meta="נוסף ע״י נועם" action="שבץ" onSchedule={() => {}} />,
    );
    expect(container.querySelector('.wp-maybecard-main .wp-maybecard-title')).toBeTruthy();
    expect(container.querySelector('.wp-maybecard-add')?.textContent).toBe('שבץ');
  });
});

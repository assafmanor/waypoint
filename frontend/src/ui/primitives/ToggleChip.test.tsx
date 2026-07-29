// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ToggleChip } from './ToggleChip';

describe('ToggleChip', () => {
  afterEach(() => cleanup());

  const chip = () => document.querySelector('.wp-chip') as HTMLElement;

  it('reports its state through aria-pressed, and carries the on class', () => {
    const { rerender } = render(
      <ToggleChip on={false} onClick={() => {}}>
        כל הימים
      </ToggleChip>,
    );
    expect(chip().getAttribute('aria-pressed')).toBe('false');
    expect(chip().classList.contains('on')).toBe(false);

    rerender(
      <ToggleChip on onClick={() => {}}>
        כל הימים
      </ToggleChip>,
    );
    expect(chip().getAttribute('aria-pressed')).toBe('true');
    expect(chip().classList.contains('on')).toBe(true);
  });

  // The distinction the Map's one filter control needs: its on-state says "filtering is
  // live" somewhere else, and announcing that as a pressed toggle would be a claim a
  // screen reader cannot see through. It still LOOKS on — only the semantics differ.
  it('omits aria-pressed for an indicator, while still showing the on state', () => {
    render(
      <ToggleChip on semantics="indicator" ariaLabel="סינון · אוכל" onClick={() => {}}>
        🍽️
      </ToggleChip>,
    );
    expect(chip().hasAttribute('aria-pressed')).toBe(false);
    expect(chip().classList.contains('on')).toBe(true);
    expect(screen.getByRole('button', { name: 'סינון · אוכל' })).toBeTruthy();
  });

  it('renders the count as decoration beside its own label, not as part of the name', () => {
    render(
      <ToggleChip on={false} count={3} onClick={() => {}}>
        אולי
      </ToggleChip>,
    );
    const count = document.querySelector('.wp-chip-count') as HTMLElement;
    expect(count.textContent).toBe('3');
    expect(count.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByRole('button', { name: 'אולי' })).toBeTruthy();
  });

  it('renders no count slot when none is given', () => {
    render(
      <ToggleChip on={false} onClick={() => {}}>
        אולי
      </ToggleChip>,
    );
    expect(document.querySelector('.wp-chip-count')).toBeNull();
  });

  // Zero is a real count, and `count && …` would have dropped it — the trap this asserts
  // against rather than describes.
  it('renders a zero count rather than treating it as absent', () => {
    render(
      <ToggleChip on={false} count={0} onClick={() => {}}>
        אולי
      </ToggleChip>,
    );
    expect(document.querySelector('.wp-chip-count')?.textContent).toBe('0');
  });

  it('carries the tone, size and provisional classes, plus the host layout class', () => {
    render(
      <ToggleChip
        on={false}
        tone="teal"
        size="touch"
        provisional
        className="map-nearchip"
        onClick={() => {}}
      >
        קרוב עכשיו
      </ToggleChip>,
    );
    expect([...chip().classList]).toEqual([
      'wp-chip',
      'teal',
      'touch',
      'provisional',
      'map-nearchip',
    ]);
  });

  it('defaults to the accent tone at compact size', () => {
    render(
      <ToggleChip on onClick={() => {}}>
        כל הימים
      </ToggleChip>,
    );
    expect([...chip().classList]).toEqual(['wp-chip', 'accent', 'on']);
  });

  it('is a non-submitting button, so it never posts the form it sits in', () => {
    render(
      <ToggleChip on={false} onClick={() => {}}>
        יש הזמנה
      </ToggleChip>,
    );
    expect(chip().getAttribute('type')).toBe('button');
  });

  it('calls onClick once per tap, and wires aria-controls when given', () => {
    const onClick = vi.fn();
    render(
      <ToggleChip on={false} ariaControls="ef-booking-body" onClick={onClick}>
        יש הזמנה
      </ToggleChip>,
    );
    expect(chip().getAttribute('aria-controls')).toBe('ef-booking-body');
    chip().click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

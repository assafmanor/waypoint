// @vitest-environment jsdom
import { afterEach, describe, it, expect } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { useDerivedField, type DerivedField } from './useDerivedField';

/** Mounts the hook and hands the live field back, so each test drives it directly. */
function mount<T>(initial: T, initiallyTouched?: boolean) {
  const ref = { current: null as unknown as DerivedField<T> };
  function Probe() {
    ref.current = useDerivedField(initial, initiallyTouched);
    return null;
  }
  render(<Probe />);
  return ref;
}

describe('useDerivedField (one mechanism for five *Touched flags)', () => {
  afterEach(() => cleanup());

  it('starts untouched on the value it was given', () => {
    const f = mount('✈️');
    expect(f.current.value).toBe('✈️');
    expect(f.current.touched).toBe(false);
  });

  it('follows the derivation while untouched, and reports what is now in force', () => {
    const f = mount('✈️');
    let inForce: string | undefined;
    act(() => {
      inForce = f.current.redrive('🏨');
    });
    expect(f.current.value).toBe('🏨');
    // The return value is the point: a caller chaining a second derivation off this one must
    // not have to read a `useState` React has not updated yet.
    expect(inForce).toBe('🏨');
    expect(f.current.touched).toBe(false);
  });

  // The whole reason the flag exists.
  it('stops deriving once a human has set it, and says so', () => {
    const f = mount('✈️');
    act(() => f.current.set('⭐'));
    expect(f.current.value).toBe('⭐');
    expect(f.current.touched).toBe(true);

    let inForce: string | undefined;
    act(() => {
      inForce = f.current.redrive('🏨');
    });
    // Unmoved, and `redrive` reports the value that actually stands rather than its argument.
    expect(f.current.value).toBe('⭐');
    expect(inForce).toBe('⭐');
  });

  // THE LOAD-BEARING CASE (ADR-0136 §4): an existing value can already count as chosen. A hook
  // that only tracked "did the user click in this session" would lose it — and losing it means
  // a soft event silently hardening the instant something re-derives its kind.
  it('honours initiallyTouched, so an existing value is never re-derived', () => {
    const f = mount<'soft' | 'hard'>('soft', true);
    expect(f.current.touched).toBe(true);
    act(() => f.current.redrive('hard'));
    expect(f.current.value).toBe('soft');
  });

  it('resets back to the derivation, so a revert control can hand it over', () => {
    const f = mount('✈️');
    act(() => f.current.set('⭐'));
    expect(f.current.touched).toBe(true);

    act(() => f.current.reset('🏨'));
    expect(f.current.value).toBe('🏨');
    expect(f.current.touched).toBe(false);
    // And it follows the derivation again afterwards — a reset that left the flag set would
    // make the revert button a one-shot that silently stopped working.
    act(() => f.current.redrive('🚄'));
    expect(f.current.value).toBe('🚄');
  });

  it('carries non-string values, since two of the five are a boolean and a union', () => {
    const b = mount(false);
    act(() => b.current.redrive(true));
    expect(b.current.value).toBe(true);
    act(() => b.current.set(false));
    act(() => b.current.redrive(true));
    expect(b.current.value).toBe(false);
  });
});

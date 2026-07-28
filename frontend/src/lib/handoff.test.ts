// @vitest-environment jsdom
//
// The hand-over channel (ADR-0134 §2). Three surfaces run on this, and every property
// asserted here is one that a copy of the pattern got wrong or would have.
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useHandoff } from './handoff';

describe('useHandoff', () => {
  it('starts empty', () => {
    const { result } = renderHook(() => useHandoff<string>());
    expect(result.current.pending).toBeNull();
    expect(result.current.take()).toBeNull();
  });

  it('hands over, then is taken exactly once', () => {
    const { result } = renderHook(() => useHandoff<string>());
    act(() => result.current.hand('pl-1'));
    expect(result.current.pending).toBe('pl-1');
    let taken: string | null = null;
    act(() => {
      taken = result.current.take();
    });
    expect(taken).toBe('pl-1');
    // The property the whole channel exists for: a later visit cannot re-fire it.
    expect(result.current.pending).toBeNull();
    expect(result.current.take()).toBeNull();
  });

  // `take()` runs inside event handlers and effects, which cannot wait a render to learn
  // what they are consuming — so two takes in one tick must not both succeed.
  it('is taken once even when called twice before a re-render', () => {
    const { result } = renderHook(() => useHandoff<string>());
    act(() => result.current.hand('pl-1'));
    let first: string | null = null;
    let second: string | null = null;
    act(() => {
      first = result.current.take();
      second = result.current.take();
    });
    expect(first).toBe('pl-1');
    expect(second).toBeNull();
  });

  it('the newest hand-over wins', () => {
    const { result } = renderHook(() => useHandoff<string>());
    act(() => result.current.hand('pl-1'));
    act(() => result.current.hand('pl-2'));
    expect(result.current.pending).toBe('pl-2');
  });

  it('can be dropped without being acted on — a cancel', () => {
    const { result } = renderHook(() => useHandoff<string>());
    act(() => result.current.hand('pl-1'));
    act(() => result.current.drop());
    expect(result.current.pending).toBeNull();
  });

  // It carries objects, not just ids: the errand is `{ target, returnTo, draft }`, and a
  // draft is an opaque blob the producer wrote.
  it('carries an object through unchanged, draft and all', () => {
    const errand = { target: { kind: 'event', field: 'placeId' }, returnTo: '/', draft: { a: 1 } };
    const { result } = renderHook(() => useHandoff<typeof errand>());
    act(() => result.current.hand(errand));
    expect(result.current.take()).toBe(errand);
  });
});

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

// The round trip the errand actually runs (ADR-0134 §2), in one place, because it spans two
// channels and the property that matters is a property of the PAIR: a form's draft goes out
// with the errand and comes back with a place, unchanged in every other field.
describe('the errand round trip', () => {
  interface Draft {
    title: string;
    date: string;
    placeId?: string;
  }
  it('carries a draft out and returns it with the chosen place, changing nothing else', () => {
    const { result } = renderHook(() => ({
      out: useHandoff<{ target: { field: keyof Draft }; draft: Draft }>(),
      back: useHandoff<{ draft: Draft; placeId: string }>(),
    }));
    const draft: Draft = { title: 'ארוחת ערב', date: '2026-07-22' };

    // The form hands its state over…
    act(() => result.current.out.hand({ target: { field: 'placeId' }, draft }));
    // …the Map takes it once, assigns, and hands the answer back…
    let taken: { target: { field: keyof Draft }; draft: Draft } | null = null;
    act(() => {
      taken = result.current.out.take();
      result.current.back.hand({ draft: taken!.draft, placeId: 'pl-9' });
    });
    expect(result.current.out.pending).toBeNull();

    // …and the host re-opens from it.
    const returned = result.current.back.take()!;
    const rehydrated = { ...returned.draft, [taken!.target.field]: returned.placeId };
    expect(rehydrated).toEqual({ title: 'ארוחת ערב', date: '2026-07-22', placeId: 'pl-9' });
  });

  it('a cancel returns the draft with no place assigned', () => {
    const { result } = renderHook(() => useHandoff<{ draft: { title: string } }>());
    act(() => result.current.hand({ draft: { title: 'ארוחת ערב' } }));
    // `ביטול` and back both just take-and-return: nothing reaches the other channel.
    let taken: { draft: { title: string } } | null = null;
    act(() => {
      taken = result.current.take();
    });
    expect(taken).toEqual({ draft: { title: 'ארוחת ערב' } });
    expect(result.current.pending).toBeNull();
  });
});

// **One surface asks another to do something, once** (ADR-0134 §2).
//
// The Map tab already had two of these and was about to get a third, which is the
// point at which rule 8 says generalise instead of copying: `focusPlaceId` +
// `requestFocus`/`clearFocus` (ADR-0121 §8's "show this place on the map"), and now the
// place errand a form sends when it needs a location picked.
//
// The shape they share is narrow and worth naming exactly, because every part of it is
// load-bearing:
//
//   • **Set by the producer, taken by the consumer.** Not shared state — a request.
//   • **Consumed exactly once.** A later visit to the tab must not re-fire a stale
//     intent, which is the bug `clearFocus` exists to prevent.
//   • **Out of the URL, and deliberately.** These are intents in flight, not places you
//     can be at: a cold link that re-fired one would be re-running someone else's tap.
//   • **Above the shell**, so both ends can reach it while the surfaces themselves mount
//     and unmount underneath (`MapScopeProvider`, ADR-0110 §4).
//
// Kept as a plain hook rather than a context of its own: the provider that owns the
// state is what decides who can see it, and the Map's scope provider already does.
import { useCallback, useMemo, useRef, useState } from 'react';

export interface Handoff<T> {
  /** What is in flight, or `null`. Read it to render; call {@link take} to act on it. */
  pending: T | null;
  /** Hand something over. Replaces anything already in flight — the newest tap wins,
   *  which is the only sane rule when the producer is a human pressing a button. */
  hand: (value: T) => void;
  /** Take it and clear it, in one call, so "consumed once" is not a discipline the
   *  caller has to remember in a second effect. Returns `null` if nothing was pending. */
  take: () => T | null;
  /** Drop it without acting — a cancel. */
  drop: () => void;
}

export function useHandoff<T>(): Handoff<T> {
  const [pending, setPending] = useState<T | null>(null);
  // The latest value, readable synchronously: `take()` is called from event handlers and
  // effects that must not wait a render to find out what they are consuming.
  const ref = useRef<T | null>(null);
  ref.current = pending;

  const hand = useCallback((value: T) => setPending(value), []);
  const take = useCallback(() => {
    const value = ref.current;
    if (value !== null) {
      ref.current = null;
      setPending(null);
    }
    return value;
  }, []);
  const drop = useCallback(() => {
    ref.current = null;
    setPending(null);
  }, []);

  return useMemo(() => ({ pending, hand, take, drop }), [pending, hand, take, drop]);
}

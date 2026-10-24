// The two words the day card, its action row and the screen all describe an event
// with. They live here rather than in `EventCard` so the action spec can read them
// without importing the component that renders it (ADR-0228) — `EventCard` re-exports
// both, so every existing import site is untouched.

/** ADR-0011's core primitive: a real commitment, or an intention. */
export type EventKind = 'hard' | 'soft';

/** Derived from the clock by the screen, never stored (ADR-0043). */
export type EventPhaseName = 'upcoming' | 'now' | 'passed' | 'done';

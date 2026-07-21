// A screen's own local UI state (a filter, a selection, …) can sit "in front
// of" leaving the screen the same way an overlay sits in front of a
// structural nav layer (ADR-0090's resolveBack) — one back should undo the
// local state first, and only actually close once that state is already at
// its default. `resolveBack` doesn't apply here (this is local screen state,
// not a structural nav decision), and it's stateless/synchronous unlike
// `useUnsavedGuard` (which holds a confirm-dialog open across a render) — so
// this is a plain function, not a hook.
/** Wrap a close handler so an active `isModified` condition consumes the
 *  FIRST back (running `reset` instead of `close`); back only actually
 *  closes once `isModified` is false. Reusable for any screen with its own
 *  resettable view state sitting in front of "leave the screen" (ADR-0102). */
export function peelBack(isModified: boolean, reset: () => void, close: () => void): void {
  if (isModified) reset();
  else close();
}

// **Watch some boxes and be told when they change.** The five lines every `ResizeObserver`
// call site in this app had written for itself, collected once (root rule 8 / ADR-0096).
//
// There were three before this existed — `useShrinkToFit`, `CreateTrip`'s birth animation and
// the Map's card reserve — and they had already started documenting each other: the Map's read
// **"the same trade `CreateTrip` makes"**, which is a comment admitting a copy. The sheet's
// drag gate was going to be the fourth. Several ADRs here (0078, 0079, 0094, 0095) exist only
// to undo parallel copies that got that far, so this is that step taken early.
//
// **It is a function returning a disposer, NOT a hook, and that is the whole design.** The
// three callers differ in exactly the two things a hook would have had to own and get wrong:
// `CreateTrip` must measure in a `useLayoutEffect` (it positions an element before paint) where
// the others are happy in a `useEffect`, and every one of them has different dependencies. So
// the caller keeps its effect and its deps, and hands over only the part that was identical:
//
//   useEffect(() => observeResize(el, measure), [deps]);
//
// **The jsdom guard is the reason this is worth extracting at all.** `ResizeObserver` does not
// exist in jsdom, so every call site needs it — and a missing guard is not a caught error, it
// is a suite-wide crash in whatever test happens to render that component. It was written three
// times and is now written once. Note what the guard implies and what the callers all say out
// loud: the one-shot measurement each of them does before subscribing is the part correctness
// depends on, and the observer is what keeps it true afterwards.

/**
 * Observe every element given and call `onResize` when any of their boxes change. Returns the
 * disposer, so a `useEffect` can return it directly.
 *
 * `null`/`undefined` entries are skipped rather than refused, because the natural argument is a
 * ref's `.current` and the natural place to call this is an effect that may run before one is
 * attached. A call that observes nothing is a no-op with a working disposer, which is what lets
 * the caller stay one line.
 *
 * **It does not call `onResize` itself.** Every caller needs a first measurement at a moment it
 * chooses — before subscribing, in its own effect, sometimes before paint — and an
 * implementation that fired on subscribe would give them a second, differently-timed one.
 */
export function observeResize(
  elements: Element | null | undefined | readonly (Element | null | undefined)[],
  onResize: () => void,
): () => void {
  if (typeof ResizeObserver === 'undefined') return () => {};
  const list = (Array.isArray(elements) ? elements : [elements]).filter(
    (el): el is Element => el != null,
  );
  if (list.length === 0) return () => {};
  const observer = new ResizeObserver(onResize);
  for (const el of list) observer.observe(el);
  return () => observer.disconnect();
}

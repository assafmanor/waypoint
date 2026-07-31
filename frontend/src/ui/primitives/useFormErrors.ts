// The one way a form refuses a save (ADR-0150). A refusal used to be a caption at
// the BOTTOM of the form — below the fold on a phone, in a scroll container the
// user was not looking at, naming a field it did not point to. This owns the three
// things that make one legible instead, in one place so every form does them the
// same way: the field is MARKED (`data-invalid`, styled by `form-errors.css`), it
// NUDGES once, and the first one is brought INTO VIEW and focused.
//
// It is deliberately not a validation library: the form still decides what is
// wrong and in what words. What this owns is what happens after — which is exactly
// the part that had drifted into three shapes (a form-level `<p>`, `Field`'s error
// slot, a hand-rolled `.invalid` class).
import { useCallback, useRef, useState, type RefCallback } from 'react';
// The marks it applies are drawn by `form-errors.css`, which `App.tsx` loads
// globally — the attribute is a contract screens honour without this hook.
import { motionDurationMs, prefersReducedMotion } from '../../lib/motion';

/** One refusal. `field: null` is the form's own — a failed save, an unexpected
 *  shape — which has no field to point at and reads in the form-level slot. */
export interface FieldProblem<F extends string> {
  field: F | null;
  message: string;
}

/** Props a `Field` (or any component forwarding them) spreads to join the mechanism:
 *  the message it shows, and the registration that lets `report` find its box. */
export interface FieldMark {
  error?: string;
  ref?: RefCallback<HTMLElement>;
}

const NUDGE_CLASS = 'is-nudging';
/** The nudge's own duration token, so the class comes off when the animation ends
 *  — and immediately under reduced motion, where none plays (ADR-0140 §5). */
const NUDGE_TOKEN = '--t-base';

export function useFormErrors<F extends string>() {
  // The refusals in force, in the order they were made. A list rather than a map:
  // there are at most a handful, and the first entry for a field is the one that
  // reads — which is also the order a form authors its checks in.
  const [problems, setProblems] = useState<readonly FieldProblem<F>[]>(NONE);
  const nodes = useRef(new Map<F, HTMLElement>());
  const refs = useRef(new Map<F, RefCallback<HTMLElement>>());

  // One stable callback per field name: a fresh identity each render would make
  // React detach and re-attach every node on every keystroke.
  const register = useCallback((name: F): RefCallback<HTMLElement> => {
    const cached = refs.current.get(name);
    if (cached) return cached;
    const cb: RefCallback<HTMLElement> = (el) => {
      if (el) nodes.current.set(name, el);
      else nodes.current.delete(name);
    };
    refs.current.set(name, cb);
    return cb;
  }, []);

  /** Record every problem at once and answer whether the save is blocked, so a
   *  caller reads `if (errors.report(problems)) return;`. All of them mark and
   *  nudge together — a form with two empty mandatory fields says so once rather
   *  than sending the user round the loop twice — and the FIRST one in document
   *  order is what gets brought into view. An empty list clears. */
  const report = useCallback((list: readonly FieldProblem<F>[]): boolean => {
    setProblems(list.length === 0 ? NONE : list);

    // A field can collect two problems (a day both outside the trip and before its
    // start); it is still one box, and it nudges once.
    const marked = [
      ...new Set(
        list
          .map((p) => (p.field === null ? null : nodes.current.get(p.field)))
          .filter((el): el is HTMLElement => el != null),
      ),
    ].sort(inDocumentOrder);
    for (const el of marked) nudge(el);
    if (marked[0]) bringIntoView(marked[0]);
    return list.length > 0;
  }, []);

  const clear = useCallback(() => setProblems(NONE), []);

  /** Addressing a refusal retires it: typing in the field it named, or tapping a
   *  control inside it, drops that mark — the statement was about the last save
   *  attempt, and the next one will make it again if it still holds. Spread on the
   *  form so no field has to wire its own clear. */
  const dismissAt = useCallback((e: { target: EventTarget | null }) => {
    const target = e.target instanceof Node ? e.target : null;
    if (!target) return;
    setProblems((current) => {
      const touched = [...nodes.current].find(
        ([name, el]) => el.contains(target) && current.some((p) => p.field === name),
      );
      if (!touched) return current;
      const next = current.filter((p) => p.field !== touched[0]);
      return next.length === 0 ? NONE : next;
    });
  }, []);

  const messageFor = (field: F | null) => problems.find((p) => p.field === field)?.message;

  return {
    /** The form's own refusal (`field: null`), for the form-level slot. */
    formError: messageFor(null) ?? null,
    report,
    clear,
    /** Props for a `Field`, or for anything that forwards a `FieldMark`. */
    field: (name: F): FieldMark => ({ error: messageFor(name), ref: register(name) }),
    formProps: { onInputCapture: dismissAt, onClickCapture: dismissAt },
  };
}

/** "Nothing is wrong", as one shared object — so a clear that clears nothing is not
 *  a re-render. */
const NONE: readonly never[] = [];

const inDocumentOrder = (a: HTMLElement, b: HTMLElement) =>
  a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;

/** Restart the animation on an element that may still be marked from the previous
 *  attempt: a CSS animation does not replay because an attribute changed value, so
 *  the class comes off, the reflow is forced, and it goes back on. */
function nudge(el: HTMLElement) {
  el.classList.remove(NUDGE_CLASS);
  void el.offsetWidth;
  el.classList.add(NUDGE_CLASS);
  window.setTimeout(() => el.classList.remove(NUDGE_CLASS), motionDurationMs(NUDGE_TOKEN));
}

/** A refusal the user cannot see is the bug this whole file exists for. Focus goes
 *  to the first typeable control so the fix is one keystroke away — with
 *  `preventScroll`, because the browser's own jump would fight the smooth scroll
 *  that follows and land the field wherever it liked. */
function bringIntoView(el: HTMLElement) {
  el.querySelector<HTMLElement>('input:not([type="hidden"]), textarea, select')?.focus({
    preventScroll: true,
  });
  // jsdom has no layout engine and so no scrollIntoView.
  el.scrollIntoView?.({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
}

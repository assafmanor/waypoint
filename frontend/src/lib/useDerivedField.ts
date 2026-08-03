// **A field the app derives until a human says otherwise** — the one mechanism behind what
// were five hand-rolled `*Touched` flag pairs (ADR-0136's Consequences called the third one
// "the moment to generalise them rather than the moment to add it"; this is that).
//
// The five were `EventForm`'s `iconTouched`/`kindTouched`/`bookedTouched` and `BookingSheet`'s
// `iconTouched`/`kindTouched`. All of them said exactly one thing — *a human said this, stop
// deriving it* — and all of them said it as a `useState` value beside a `useState` boolean,
// with the guard written out by hand at each derivation site (`if (!iconTouched) setIcon(…)`).
// Five copies of a rule is five chances to forget the guard on the sixth field.
//
// **Why a value plus a flag, and not a nullable "override" slot** — which is the other obvious
// shape, and the one `EventForm`'s zone `override` uses. Because these fields are RENDERED: a
// picker shows a glyph, a toggle shows a side. With a nullable slot every read site becomes
// `icon ?? derive()`, so the derivation has to be reachable — and cheap — everywhere the value
// is displayed, which is more call-site churn than it removes. A concrete value with the flag
// kept private reads the same as a plain `useState` at every site that only *shows* it.
//
// **Two things the five differed on, and both are inputs here rather than reasons not to
// generalise:**
//   • `initiallyTouched` — an existing value can count as already chosen. `EventForm` treats a
//     glyph the event already carries that way, and an existing event's `kind` too (ADR-0136 §4:
//     re-deriving on a conversion would silently harden a soft event). A naive hook that only
//     tracked "did the user click" would lose exactly that, and it is the load-bearing case.
//   • `reset` — `BookingSheet`'s ✨ revert hands the icon back to the derivation. Only one of
//     the five has it, which is precisely why it belongs in the shared mechanism: the next
//     field that wants one shouldn't have to invent it.
//
// **`touched` is not dirtiness, and reading it as such shipped a bug.** It answers *may the
// derivation still move this?* — which `initiallyTouched` makes true before a human has done
// anything, so the two questions coincide only for a field nothing seeds. `EventForm` read it
// for its booked row, ADR-0136 §2's amendment seeded that row from the event, and every edit of
// every event opened dirty. A dirty check diffs the VALUE against the seed; both forms do.
import { useCallback, useState } from 'react';

export interface DerivedField<T> {
  /** The value in force: derived, or whatever a human last set. Read this like a `useState`. */
  value: T;
  /** **A human said it.** Sets the value and stops deriving, permanently. */
  set: (next: T) => void;
  /** **The input this derives from changed.** Re-derives unless a human has already spoken.
   *  Returns the value now in force — so a caller chaining a second derivation off this one
   *  reads the answer directly instead of a `useState` value React has not updated yet, which
   *  is the trap the hand-rolled version worked around with a local variable. */
  redrive: (derived: T) => T;
  /** **Hand it back to the derivation** (`BookingSheet`'s revert): take the derived value now,
   *  and resume following it. */
  reset: (derived: T) => void;
  /** Whether the derivation has been switched off — because a human spoke, or because
   *  `initiallyTouched` said the starting value already counts as their answer. For a revert
   *  control that should only appear once there is something to revert. **Not a dirty
   *  check** (see the header): diff `value` against the seed for that. */
  touched: boolean;
}

/**
 * @param initial          the value to start from — a draft's, an entity's, or a first derivation.
 * @param initiallyTouched whether that starting value already counts as a human's choice. An
 *                         errand draft passes its own stored flag; a fresh form passes `false`.
 */
export function useDerivedField<T>(initial: T, initiallyTouched = false): DerivedField<T> {
  const [value, setValue] = useState<T>(initial);
  const [touched, setTouched] = useState(initiallyTouched);

  const set = useCallback((next: T) => {
    setValue(next);
    setTouched(true);
  }, []);

  // Reads this render's `touched`, which is the right question: a human either had spoken
  // before this handler ran or they had not. That also makes several fields re-deriving in one
  // handler consistent with each other — the category pill moves three of them at once.
  const redrive = useCallback(
    (derived: T) => {
      if (touched) return value;
      setValue(derived);
      return derived;
    },
    [touched, value],
  );

  const reset = useCallback((derived: T) => {
    setValue(derived);
    setTouched(false);
  }, []);

  return { value, set, redrive, reset, touched };
}

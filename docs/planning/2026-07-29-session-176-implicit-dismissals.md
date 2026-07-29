# Session 176 — an implicit way out is still a way out (2026-07-29)

> _"When there's an implicit way to go back (closing a modal by tapping outside it for
> example) we should also treat system back as the same."_

The follow-on to [session 175](2026-07-29-session-175-back-parity-scan.md), and it is a
correction to how that session **stated** its rule rather than to what it built. 175 said "if a
surface shows a way back, that way back is in the back stack" and scanned for visible controls.
The owner's sentence widens it correctly: what obliges back is that a surface **can be left**,
not that leaving it carries a label.

## Why the visible-control framing missed things

`Modal` ties its backdrop and its Escape handler to the same `onClose` it registers, so every
sheet, dialog, picker and confirm in the app already honoured the wider rule for free — which
is exactly why scanning for _controls_ found nothing wrong with them and also found nothing
wrong with the four surfaces below. Each is a **hand-rolled panel that never goes through
`Modal`**, so it was not in the back stack at all and back fell through to whatever sat under
it.

| Surface                     | The implicit dismissal           | What back did instead         |
| --------------------------- | -------------------------------- | ----------------------------- |
| `IconPicker`'s panel        | tap outside, Escape              | discarded the whole host form |
| `TimeField` / `TimePicker`  | `.tp-backdrop` tap               | discarded the whole host form |
| A selected place on the Map | tap blank canvas (`onCanvasTap`) | left the tab                  |

The form cases are the sharp ones: a tap two pixels to the left of the panel closed the panel,
and the gesture that is supposed to mean the same thing threw away everything you had typed.

## Method, unchanged and still earning its keep

Reproduced in Playwright first (`e2e/back-implicit-dismiss.spec.ts`), fixed second, re-run
third. Two of the five new cases pass both before and after — they are the "and only then does
the next press…" guards, and they exist so a fix can't over-reach and swallow a press.

Worth recording because it cost a cycle: the first run failed on _selectors_, not on the app —
`.icon-chip` and `.tp-field` also exist in the day builder **behind** the form, so an unscoped
`.first()` picked the obscured one and timed out on actionability. Scoped through the dialog
now. A failing e2e is only a reproduction once you have checked it fails for the reason you
think.

## The fix, and why the gate is the interesting part

All four register through the existing `useBackLayer`, gated on the panel's open state (or on
there being a selection). No new mechanism, per rule 8.

The gate is doing more work than it looks like. Session 175's resolve-sheet fix needed a
paragraph about child-first effect ordering to explain why the step layer sits above the
Modal's. That reasoning is unnecessary when the layer is gated: **a layer joins the stack when
it becomes active**, so a popover opened inside a form is registered after the form's layer by
construction, and on the Map whichever of {selection, query row, errand} you opened last is the
one back peels first. Gate on state, and the ordering falls out.

## The boundary held

A `✕` that clears a value or dismisses a notice is still not a back: `FilePicker`'s remove,
`StatusBanner`'s dismiss, a picker's clear, the shelf card's remove, Home's stay dismissal. The
test is whether the gesture dismisses something you are **in**, not whether it takes something
off the screen. Back navigates; it must never start editing content.

## What it cost elsewhere

Leaf primitives now participate in the back stack, so they cannot be rendered bare — the
`TimeField` and `WhenField` suites needed `NavProvider`, which needs a router and the toast.

That harness turned out to be open-coded **identically in fourteen** `*.test.tsx` files. Adding
a fifteenth is precisely what rule 8 exists to stop, so it is now `src/test/nav-harness.tsx`'s
`wrapNav` and all fourteen use it (net −93 lines). The seven wrappers that genuinely differ —
extra providers, a `BrowserRouter`, in-tree probes — keep their own.

I had first proposed leaving the copies in place and migrating them "when next touched". That
was the wrong call and the owner caught it: with fourteen exact duplicates, a shared helper used
only by the two files I happened to touch **is** a fifteenth one-off, just with a nicer name.

## Coverage

51 e2e (46 → 51), 1633 unit tests.

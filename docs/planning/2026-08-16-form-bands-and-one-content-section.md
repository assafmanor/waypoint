# 2026-08-16 — The event/booking form: bands, and one look for its content sections

Session note for [ADR-0192](../decisions/0192-a-form-has-bands-and-its-content-sections-have-one-look.md) and [`mockups/a-form-has-bands-and-one-content-section-v1.html`](../../mockups/a-form-has-bands-and-one-content-section-v1.html).

## What was asked

Two reports, in the owner's words:

> _"Notes and tasks in the event/booking creation/edit forms are formatted differently, let's align them to the same style (I think preferably to the tasks style)."_

> _"I feel like every time we add a new field or section to the event form (create, edit) we just append them to the end, now it looks very messy. Let's decide on a new ordering (+ an instruction to think from now on where we add things). Let's discuss this."_

## The three forks put to the owner, and the answers

Asked before anything was drawn, because each changes what gets built:

1. **How far the notes↔tasks alignment goes** — chrome only · chrome + entry mechanism · chrome + build ADR-0191 §7's `quiet` density.
   → **Chrome only.** The composer stays inline; ADR-0152 §6b stands.
2. **Which ordering** — the full five bands with place above time · keep when-before-where and move only `סוג` · keep today's sequence and fix the chrome.
   → **The full five bands.**
3. **Draw it first, or go straight to code.**
   → **Mockup first.**

## What reading the code changed

Recorded because none of it is recoverable from the diff, and three of the four made the reports mean something different than they first appeared:

- **The notes block was TWO blocks on an edit**, and the tasks block was one. `t.notes.composer.labelMore` (`פתק חדש · לא חובה`) existed only to stop `פתקים` heading two adjacent blocks. So the report reads as a styling complaint and is a **structure** complaint.
- **`.note-sec-h .t` and `.doc-sec-h .t` were byte-identical** — the second copy already existed, so the fix could not be "give notes the tasks header"; it had to be an extraction.
- **The two forms already disagreed about place vs time**, and `BookingSheet` was right for a reason nobody had written down: the place derives the authoring zone.
- **No form-field order existed anywhere** in `conventions.md`, `design-language.md` or the ADR router. There was nothing to append against.

Two further dead classes turned up on the way and were handled separately: `.tsk-tick-sec` (no CSS at all — fixed in #624) and `tsk-sec-quiet` (ADR-0191 §7's quiet density, specified and never written — deliberately left open, since this report asks for the **full-strength** look).

## What the render caught that reading did not

The mockup's value in this session was almost entirely in its own defects:

- **A fake 134.7px saving.** The first draft wrapped every block in mockup chrome, so the two frames differed by four `flex` gaps and four label lines. The band rail now rides the block the app already renders; the residual is a printed measured row rather than an argument.
- **Half the remaining "saving" was an input shrinking.** The first draft dropped the composer's `Field` **shell** with its label, which silently strips `field.css`'s border, padding and `min-height: 56px`. Corrected numbers: **−0.7px on a create**, **−48.7px on an edit**.
- **The `.sec-h` extraction left `.add` behind** and `＋ משימה` rendered as a native `<button>`.
- **The `סוג` clause costs 0px at 360 and 17px at 390** — the opposite way round from the guess, because at 360 the sentence already wraps.
- **Webfonts change every number.** An ad-hoc page load without Assistant reports the file's own blocks 2–7px shorter _and stays internally consistent_, which is how three "discrepancies" appeared between frames that were identical. Read the numbers from `scripts/render.mjs`.

## What the build added to the design

- **The derived sentence names the kind on a CREATE only.** A spec caught it: the re-derivation runs only while the kind is untouched, and ADR-0136 §4 counts an existing event as touched — so on an edit the toggle never moves the kind and `יסומן …` would announce a change that will not happen.
- **A band spec, not just a rule.** `EventForm.test.tsx` reads the rendered sequence and fails with the band names. Verified by moving `סוג` back below the booked row: it fails with `booking (.wp-chip.cta) must read after when (.kind-toggle)`.
- **`HostNotes` takes an optional id**, the shape `HostTasks` and `DocumentAttachField` already had, so all three content sections say "not saved yet" the same way.

## Process notes worth keeping

- **The app was run, not reasoned about.** `DEV_AUTH=1` with a system Postgres cluster (no Docker in the sandbox) — `pg_ctlcluster 16 main start`, role/db `waypoint`, `backend/.env` symlinked to the root `.env` because `prisma:seed` reads it relative to its own package. That is what produced the tick and clipping numbers in the sibling PRs, and it is cheaper to set up than it looks.
- **`git checkout <file>` to undo a temporary mutation destroyed uncommitted work** on `EventForm.tsx` mid-session, after a deliberate break-the-guard check. The edits were redone from the notes above. Use a scratch copy, or commit first.

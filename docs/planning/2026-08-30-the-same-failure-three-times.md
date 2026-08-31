# The same failure, three times (2026-08-30, session 258f)

Twelve reports on the fifth pass, deployed. Most are a sentence each and were a sentence to
fix. Three of them are one defect wearing three different materials, and that is what this
note is for. The decisions are in
[ADR-0213](../decisions/0213-a-shared-trip-changes-emphasis-and-print-is-its-own-rendering.md)'s
sixth 2026-08-30 amendment.

## The pattern

- A leg's time range **wrapped to two lines**, because its grid column was a fixed `78px`
  sized for `14:30` and not for `14:30–18:15`.
- The PDF's note body printed as **empty rectangles**, because `.pdf-ops-line` set the `font`
  shorthand to JetBrains Mono, which ships no Hebrew — while the bold label beside it, which
  overrides back to Assistant, printed perfectly.
- And **the fix for that font silently did nothing**, because `.pdf-op span` — a leftover
  selector from markup deleted one pass earlier — is (0,1,1) and beat `.pdf-ops-line` at
  (0,1,0), pinning the line at 7.8px however large the file said to set it.

Three materials, one shape: **a declaration that loses looks exactly like one that was never
written.** The fifth pass wrote this down after three instances (a `gap` that never applied, a
clamp that was never in the stylesheet, a query with no linkage filter). It recurred inside a
single pass — twice in the file I was editing at the time.

The operational consequence is short: reading the source that "has" the rule proves nothing.
All three were found by a computed-style read against a real render, and the third one was
found only because I checked whether my _own_ fix had taken effect rather than assuming it had.

## Two more the render caught, both mine

- A CSS rule I wrote this session, `.sh-op-note strong`, was styling every inline `**bold**`
  run inside `NoteProse` and breaking each onto its own line. Scoped to `> strong`.
- I put backticks inside a CSS comment inside a template literal, terminating the literal.
  That is the **sixth** time in `itinerary-pdf.template.ts`. The compiler catches it every
  time, which is why it stays a nuisance rather than a defect — but six is a habit, not bad
  luck.

## What reuse was available and unused

`NoteProse` and `lib/note-markdown.ts` have rendered note markup and linkified urls since
ADR-0202. The shared page was printing note bodies as flat strings beside them. The fix was an
import.

The PDF could not have the same, because the parser sits in `frontend/src/lib` and importing
it means moving `bidi.ts` (~40 consumers) across the workspace. Root rule 8 says to ask before
taking on a refactor that size rather than doing it silently, so paper keeps the flat body with
its line breaks preserved, and the move is a backlog line.

## The owner's question, and the rule it exposed

_"Should summary mode show bookings? It seems excessive for a summary, no?"_

Yes — and it contradicted ADR-0213 §1's own levels (inspire / orient / operate). What makes it
worth recording is that a spec named _"Summary shows no exact fact the projection did not
send"_ had been passing over it the whole time: the block was added later, and a **date** is an
exact fact nobody thought to re-check the level against. A test named after a rule does not
enforce the rule; it enforces the cases someone wrote.

## Left open

- Moving the note parser into `packages/shared` so paper renders the same markup.
- The owner's document-link symptom, still unreproduced.
- `frontend/e2e/` typechecked by nothing.

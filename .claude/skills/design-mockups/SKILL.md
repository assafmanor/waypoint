---
name: design-mockups
description: Write, revise, or review the interactive HTML design mockups in mockups/ — the RTL, phone-first, both-themes files that carry a design decision in this repo before it is built. Use this whenever the task involves designing a screen, surface, interaction, or motion for this app; whenever a design session, design brief, or ADR needs a mockup; whenever asked to create, revise, or check a mockups/*.html file; and whenever a UI change is large or contested enough that it should be drawn and measured before it is coded. Use it too before hand-copying app CSS or token values into any standalone HTML page — that is the exact failure mode this skill exists to prevent.
---

# Writing a design mockup

## What a mockup is here

Not a picture of an idea. An **interactive HTML file that renders the app's real
CSS and real layout tree**, in both themes, at real phone widths, and reports
measurements read off its own DOM. It exists so a design decision can be
*falsified before it is built*.

That framing is not decoration — it is why the format pays for itself. Rendering
a mockup in this repo has repeatedly found **shipped** defects that reading the
code did not: a reversed time range in an RTL header, an `inset` box-shadow
painting under its own children, a `:has()` rule hiding two live controls, an
accent that assumed a neutral ground. Every one was a drawing problem, invisible
until something was actually drawn.

One design question per file: `mockups/<the-question>-v1.html`. A later session
revisiting the same question writes `-v2` and the old file stays as the dated
record of what was decided then — mockups are **never** retrofitted to new rules.

## Before you draw

1. **Backlog check** (root `CLAUDE.md`): scan `docs/backlog.md` for the item.
   It may already scope the work or mark it deferred.
2. **The catalog entry for your surface** — `docs/design/mockups.md`. Grep for
   the surface name; do **not** read the file whole (it is enormous and its
   entries are per-file, so 99% of it is irrelevant to you).
3. **The ADR(s) for the domain** — route through `docs/INDEX.md`'s "Decisions by
   domain" table. Read only those. Plus the sections of
   `docs/design/design-language.md` covering whatever grammar you plan to spend.
4. **`frontend/CLAUDE.md`, and read it as a design document.** It does not
   auto-load from a root session, and it is root rule 8 — *reuse existing
   infrastructure before adding new* (ADR-0096) — spelled out for this layer.
   See **"Drawing a new mechanism is how a duplicate gets built"** below; this
   is the step most easily skipped and the most expensive to skip.
5. **The code you are about to draw.** Open the real components and stylesheets
   in `frontend/src`. The layout tree is a fact you go and find, not something
   you approximate. Several design sessions here found that the reported problem
   was already contradicted by the app's own source — the app had written the
   answer down and nobody had read it. Reading first is also what lets the
   mockup's prose say *why* rather than *what*.

## Drawing a new mechanism is how a duplicate gets built

Root `CLAUDE.md` rule 8 binds a mockup harder than it binds code, because **the
design stage is where a duplicate is born**. Nobody writes a second overlay
system on purpose; someone draws a panel that behaves *almost* like a sheet, the
ADR accepts the drawing, and the build faithfully reproduces it. ADRs 0078,
0079, 0094 and 0095 exist only to undo parallel copies that got that far.

So before you draw a control, go and find the thing already doing that job — the
lists are in `frontend/CLAUDE.md`, which is exactly this rule for this layer:

- **Every** overlay is `Modal` (with its `Sheet`/`ConfirmDialog`/`RowManageSheet`
  wrappers); it is lint-blocked, so a hand-rolled floating panel in a mockup is
  a drawing of something the app will refuse to build.
- A managed row with a ⋯ menu is `ListRow`/`RowManageSheet`. A done/skipped
  question is `SettleControl` — a fourth host adds a *density*, and its words,
  marks and hues are not that host's to choose.
- Any list that filters, searches or re-orders animates through `RevealList`
  (ADR-0120); a plain `.filter()` is the one-off that made the Map jump for two
  releases.
- Motion, press-scale, back behaviour and form steps all arrive by using the
  primitive. A mockup that redraws them is proposing a second one.

**If nothing exists, look for the one-off that nearly does.** The strongest
finding a design session can make is "this mechanism already exists twice,
half-built, in two places" — that is what turned two bespoke time pickers into
one primitive in `day-scheduling-grammar-v1.html`, and it is why that section
was drawn with the existing `.resolve-opt` geometry rather than a new one.
Generalising the existing one-off beats adding a second beside it. If
generalising would mean a substantial refactor rather than a small extraction,
say so in the ADR and **ask** — don't silently take on the larger change, and
don't silently duplicate.

Name the reused primitive in the file's prose. "This is `SnapSheet` at a second
density" is a design decision with a cost the reader can check; an unlabelled
drawing that happens to look like a sheet is a decision nobody made.

## Building the file

Start from `assets/mockup-template.html` — copy it to
`mockups/<name>-v1.html` and work through it. `references/anatomy.md` explains
each region of that file and what belongs in it.

**1 — Inline the app's real CSS, never hand-copy it.** Fill the `APP-CSS:`
manifest with the stylesheets you need, in the app's own import order (later
rules win at equal specificity), then run:

```bash
node mockups/tools/inline-app-css.mjs mockups/<name>-v1.html
```

Idempotent, so re-run it freely — and re-run it whenever a manifest sheet
changes, which is the rule the catalog has repeatedly failed to hold (`docs/backlog.md`
has ~16.6k lines of measured drift under it). Hand-copied token values are how
`map-embedded-v1.html` drew a filled amber pill for something the app renders as
amber-deep *text*. If Prettier starts fighting the generated block — it will, for
any sheet with long-form comments — add the file to `.prettierignore` beside the
others; the generator's output is the canonical form.

**2 — Reproduce the layout tree, not just the stylesheet.** Same element types,
same nesting, same class names as the real component. Real CSS over an invented
tree renders something the app cannot produce, and the difference has burned a
session before.

**3 — Keep your own CSS in one fenced, labelled block**, namespaced so it cannot
collide with a shipped class (`.bld-seam`, not `.seam` — `.seam-tag` already
means something). Written in the app's naming so it reads as the diff for the
stylesheet it will move into when the ADR is built. Keep this block small on
purpose: it is the honest size of what you are asking the app to grow, and a
long one usually means a primitive went unused (see rule 8 above).

**4 — Both themes, with a toggle** (ADR-0158 §16, and it binds on create *or*
revise). The dark remap is already inside your inlined CSS, inert; the toggle is
two buttons setting `data-theme` on `<html>` — the same attribute `lib/theme.ts`
writes. Your own `mk-*` chrome needs its own variables and a
`:root[data-theme='dark']` block **after** the light one, or a dark frame gets
judged on a white page the app never has.

**5 — Controls, not variants.** A width control (360×640 and 390×844 at
minimum), the theme toggle, a toggle per demo state, and — this is the valuable
one — **a control for any number that is a feel call**. A drag ghost's opacity
or lift distance cannot be settled in a desktop screenshot; make them buttons,
ship the defaults as the recommendation, and let the ADR hand the final pair to a
device pass.

**6 — Build frames from data, not by hand twice.** Before/after pairs are the
common case, and a hand-copied "after" is how a mockup ends up disagreeing with
itself. One row renderer, one screen renderer, and each section states only what
differs.

**7 — Icons come from `ui/Icon.tsx`.** Copy the real path data. A hand-drawn
icon inside a file that inlines the real CSS is a lie in the one place the file
promises truth. Same for directional glyphs: use the real `NavArrow`/`Icon` SVGs,
never `‹`/`›`/`→` characters — they are `Bidi_Mirrored` and silently flip inside
`dir="rtl"`.

**8 — Measure, don't estimate.** A table at the foot whose every number comes
from `getBoundingClientRect()` on this page's own rendered boxes, re-measured
when a control changes. Numbers typed into prose go stale silently; numbers read
off the DOM cannot. This is where the file earns its keep — "the seam costs 18px
live, 31% of an event row" is an argument, "it should be small" is not.

**9 — A notes panel: what was chosen, and what was rejected and why.** The
rejected alternatives are the part a future reader cannot recover, and they are
what stops the same idea being re-proposed in six weeks.

**10 — A header comment that orients.** What this file is, what reading the code
changed, which section maps to which ADR section, what is interactive, and any
shipped defect the render exposed. See `references/anatomy.md`.

## Render it — the step that pays for the file

A mockup you never opened is a document, not a mockup. Playwright and Chromium
are available:

```bash
node .claude/skills/design-mockups/scripts/render.mjs mockups/<name>-v1.html
```

It shoots every theme × width combination, prints the measurement table it read
from the live page, and reports console errors. Look at the screenshots. Then
read `references/pitfalls.md` — it is the list of things that only ever show up
once something is rendered, each with the file it was found in.

## Non-negotiables inherited from the app

- **Reuse before new** (rule 8 / ADR-0096) — the section above; it is the one
  that a mockup can violate before a single line of code exists.
- **Colour budget** (rule 4 / ADR-0028): amber = time & commitment, teal =
  location, plan violet = Plan mode. Anything else neutral, `--cta`,
  `--ok`/`--miss`. A mockup that spends one decoratively teaches the build to.
- **Phone-first** (ADR-0017): 360px is the design width, not the stress case.
  44px is the touch floor every new control is measured against.
- **RTL and bidi** (ADR-0118): any numeric or Latin run inside Hebrew prose goes
  through `lib/bidi.ts`'s `ltrIsolate`; never `dir="ltr"` on a non-`<input>`.
- **Motion respects `prefers-reduced-motion`**, and comes from the tokens in
  `design-language.md` rather than new durations.
- **Hebrew UI copy, no em dashes** — `·` between peer facts, `-` for a missing
  value.

## Finishing

A mockup is half a deliverable. The change also carries:

- **A catalog entry in `docs/design/mockups.md`**, in the same change — what the
  file is for, what it promotes, what it supersedes, what is interactive, and
  where it now differs from the shipped app. This is a hard requirement of
  ADR-0097 and the catalog goes stale the moment it slips.
- **The ADR** the mockup promotes (or an in-place amendment to an existing one),
  and a dated session note in `docs/planning/` recording the forks put to the
  owner and the answers.
- **The backlog line** updated or pruned, and any shipped defect the render
  exposed written down where the fix will be made.
- `pnpm format` (after `pnpm install`), then the PR.

## References

- `references/anatomy.md` — the file top to bottom, region by region.
- `references/pitfalls.md` — traps that only appear once rendered, each with its
  witness in the catalog.
- `assets/mockup-template.html` — a working skeleton to copy.
- `scripts/render.mjs` — screenshots + live measurements + console errors.

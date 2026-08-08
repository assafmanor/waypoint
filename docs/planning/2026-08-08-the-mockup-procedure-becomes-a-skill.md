# 2026-08-08 — the mockup procedure becomes a skill

**Outcome:** [ADR-0175](../decisions/0175-the-mockup-procedure-is-a-skill.md) + `.claude/skills/design-mockups/` (SKILL.md, two references, a working template, a renderer). No mockup was written in this session and no design rule changed.

## The request

"Create a skill for writing design mockups — read the docs and the mockup
session notes, find out what the right way to create mockups is, put it where a
cloud session discovers it automatically, use industry standards."

## What the survey found

Reading `docs/design/mockups.md`, ADR-0097, ADR-0158 §16, the newer catalog
files and a handful of design-session notes, the format turns out to be
**precise and almost entirely undocumented**. `mockups.md` carries five lines of
"Writing one". Everything else is convention visible only in the artefacts: the
`APP-CSS:` contract lives in the inliner's header, the `mk-*` chrome / controls
bar / build-from-data / DOM-measurement / notes-panel shape exists only as a
pattern the newer files happen to share, and each rendering trap is written
down wherever it was found — a catalog entry, a session note, an ADR §.

Two things sharpened the scope beyond "write down the conventions":

- **A mockup can break root rule 8 before any code exists.** The design stage is
  where a duplicate mechanism is born, and ADRs 0078/0079/0094/0095 are the
  retractions. `frontend/CLAUDE.md` is the list that prevents it and does not
  auto-load from a root session. Raised by the owner mid-session; it is now a
  named section of the skill, a step in the pre-draw checklist, and a heuristic
  the file itself reveals — a long hand-written CSS block usually means a
  primitive went unused.
- **The traps are the valuable part**, and they were the least reachable. They
  are collected in `references/pitfalls.md`, each kept with the file it was
  found in so a reader can go and look rather than take it on faith.

## Where it went, and why not the obvious places

`.claude/skills/design-mockups/` — the standard project-skill path, discovered
by local and cloud sessions, loaded only when the task is about designing a
surface. The alternatives (growing `mockups.md`, a `.claude/rules/` entry, a
section in `frontend/CLAUDE.md`) and why each was rejected are in the ADR.

The split that keeps it from drifting: **`mockups.md` and the ADRs own the
rules and the why; the skill owns the procedure.** The skill states a rule in a
sentence and points at the doc that owns it, rather than restating it — a rule
with two homes has none.

## What the renderer found, immediately, in the skill's own template

Bundling `scripts/render.mjs` was meant to make "actually look at it" cheap. Its
first run on the template found two defects in the template:

1. **`360×640` rendered as `640×360`.** A numeric run in the RTL flow with no
   isolate — ADR-0118's rule, and the same shape as the shipped
   `gapFillTitle` defect `day-scheduling-grammar-v1.html` found in July. Fixed
   with U+2066/U+2069, the pair `lib/bidi.ts` emits.
2. **The chrome printed dark ink on the dark page.** It read
   `var(--ink, #16233d)`, and a fallback cannot participate in a remap — so
   before the app CSS is inlined the dark theme had dark text on a dark ground.
   Fixed by giving the chrome its own `--mk-ink`/`--mk-line`/… in both blocks,
   which is what ADR-0158 §16 says to do and is now the template's default.

A template that could not survive its own first render is the whole argument for
shipping the renderer beside it.

## And one environment fact worth carrying past this session

**A sandboxed session cannot reach `fonts.googleapis.com` from the browser.**
The page falls back to a system font with no error a person would notice, and
then every width in a measurement table — the one part of a mockup that claims
to be real — is a measurement of the wrong typeface. `render.mjs` fetches the
fonts through `curl`, which the environment's proxy and CA bundle do serve, and
says so explicitly when it cannot.

This is not a mockup-only exposure: any headless measurement of the Hebrew UI in
a cloud session has it, including the e2e suite if it ever asserts on geometry.

## Backlog

Checked before starting; nothing matched. The CSS-drift line (2026-07-31,
session 189) gains one clause noting the skill now states the re-run rule at the
point of authoring — it does not close that line, which still wants a
regenerating branch or a CI check.

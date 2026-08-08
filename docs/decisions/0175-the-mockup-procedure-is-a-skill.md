# 0175 — The mockup procedure is a skill; the catalog stays a catalog

**Status:** Accepted
**Date:** 2026-08-08
**Relates:** [ADR-0097](0097-mockup-catalog-out-of-root-claude-md.md) (moved the catalog out of root `CLAUDE.md`; this places the _procedure_ somewhere neither of them was), [ADR-0096](0096-per-domain-claude-md-guides.md) (per-domain guides — the same progressive-disclosure argument, one layer further out), [ADR-0158 §16](0158-dark-mode-ships-and-the-ink-a-surface-carries-is-a-token.md) (both themes + a toggle, the last rule that had to be written into a doc nobody loads until they already know it exists).

## Context

How to write a mockup in this repo is real, specific, and almost entirely
undocumented. What exists:

- `docs/design/mockups.md` has a five-line "Writing one" section — the
  both-themes rule and two conventions named in one sentence each.
- Everything else lives in the artefacts. The `APP-CSS:` manifest contract is in
  the header of `mockups/tools/inline-app-css.mjs`. The `mk-*` chrome pattern,
  the controls bar, the build-frames-from-data rule, the DOM-read measurement
  table and the notes panel exist only as _convention visible in the newer
  files_. The traps — a reversed range in RTL, `[hidden]` versus a shipped
  `:has()`, measuring inside a flex row, an `inset` shadow painting under its
  children — are scattered across catalog entries and session notes, each
  recorded where it was found and nowhere a next author would look.

So the format is learned by reading a 90k-token catalog and three or four large
HTML files, or it is not learned. An agent session opened at the repo root
learns none of it: `mockups.md` is routed but enormous, and the conventions that
matter most are in files it has no reason to open. The predictable result is a
hand-copied stylesheet in a standalone page — the one thing the format exists to
prevent, and already the cause of one wrong drawing (`map-embedded-v1.html`) and
~16.6k lines of measured CSS drift.

There is also a live gap the rules cannot close by being restated: **a mockup
can violate root rule 8 before any code exists.** Nobody writes a second overlay
system deliberately; someone draws a panel that behaves almost like a sheet, an
ADR accepts the drawing, and the build reproduces it faithfully. ADRs 0078,
0079, 0094 and 0095 are all retractions of copies that reached that point.
`frontend/CLAUDE.md` is exactly the list that prevents it, and it does not
auto-load from a root session.

## Decision

**The procedure becomes a skill at `.claude/skills/design-mockups/`** — the
standard project-skill location, discovered automatically by local and cloud
sessions alike, and loaded only when the task is actually about designing a
surface.

The split of responsibility, which is the part worth remembering:

| Where                    | What it holds                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `docs/design/mockups.md` | the **catalog** (per-file: what it is for, promotes, supersedes) and the **rules**, with their owner/ADR provenance |
| ADRs                     | the **why** behind each rule                                                                                        |
| the skill                | the **procedure** — how to build one, and what breaks when rendered                                                 |

The skill therefore states rules briefly and points at the doc that owns each
one, rather than restating them; drift between the two is the failure mode being
guarded against, and a rule with two homes has none.

It carries four things the repo did not have anywhere:

1. **`assets/mockup-template.html`** — a working skeleton: the header comment's
   sections, the manifest and its generated block, a fenced proposal block,
   theme-aware `mk-*` chrome, the controls bar, a measurement table wired to
   `getBoundingClientRect`, and a notes panel.
2. **`references/pitfalls.md`** — the traps that only appear once rendered,
   collected from the entries and session notes that recorded them, each kept
   with its witness file so a reader can go and look.
3. **`scripts/render.mjs`** — shoots every theme × width the file offers by
   driving the file's own controls, prints the measurement table it read from
   the live page, and reports console errors.
4. **Rule 8 as a design step**, with `frontend/CLAUDE.md`'s primitive list read
   as a design document rather than an implementation detail.

## Consequences

- A session that never touches design loads nothing; a session that does gets
  the procedure without reading the catalog whole.
- One more artefact to keep current. It is bounded: the skill holds procedure,
  so a _rule_ change lands in `mockups.md` or an ADR and touches the skill only
  where it names the rule.
- `.claude/` is already Prettier-ignored, so the skill is outside `format:check`.
- The skill's own render step found two defects in its own template on the first
  run — a `360×640` label reversed to `640×360` by the RTL flow (ADR-0118's
  isolate, missing), and chrome that read `var(--ink, #fallback)` and so printed
  dark ink on the dark page, since a fallback cannot participate in a remap.
  Both are now fixed and both are recorded in `pitfalls.md`. That the template
  could not survive its own first render is the argument for shipping the
  renderer with it.
- **Sandboxed sessions cannot reach `fonts.googleapis.com` from the browser**, so
  a mockup rendered there silently falls back to a system font and every width in
  its measurement table is a measurement of the wrong typeface. `render.mjs`
  fetches the fonts through `curl` (which the environment's proxy and CA bundle
  do serve) and states plainly when it could not. Worth knowing beyond mockups:
  any headless measurement of this app's Hebrew UI has the same exposure.

## Alternatives considered

**Grow `docs/design/mockups.md`'s "Writing one" into the full procedure.**
Rejected: that file is ~90k tokens of catalog, and its own ADR-0097 exists
because loading it unconditionally was the anti-pattern. Procedure there is
procedure nobody reads. The catalog and the how-to also have different
lifecycles — the catalog gains an entry per session, the procedure changes
rarely.

**A `.claude/rules/` entry instead.** Root `CLAUDE.md` names that directory as a
forward hook for path-scoped rules. Rejected: rules scoped to files being edited
are the wrong trigger. The decision to _write_ a mockup is made before any file
exists, and the skill needs to carry a template and an executable, which a rules
file does not.

**A section in `frontend/CLAUDE.md`.** Rejected: mockups are not frontend
source, and that file is specifically "which existing layer to reach for" for
code. The skill points _at_ it instead, which is the relationship that was
missing.

**Leave it as tribal knowledge in the newer files.** Rejected by the drift: the
inliner rule has been in `mockups.md` and in the tool's own header the whole
time and still slipped across 14 files. Convention that is only legible by
reading exemplars is convention that is learned late, by the people who least
need it.

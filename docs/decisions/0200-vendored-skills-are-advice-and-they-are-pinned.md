# 0200 — Vendored skills are method, pinned; the ones that decide things for us are refused

**Status:** Accepted
**Date:** 2026-08-21
**Relates:** [ADR-0175](0175-the-mockup-procedure-is-a-skill.md) (the one skill we wrote; this places 33 we did not beside it), [ADR-0096](0096-per-domain-claude-md-guides.md) (progressive disclosure — the reason a skill is cheaper than a `CLAUDE.md` paragraph), [ADR-0028](0028-plan-violet-color-budget-dark-ready.md) / [`design-language.md`](../design/design-language.md) (the palette two of these repos wanted to replace), [ADR-0046](0046-retire-the-task-board.md) (the backlog line this adds)

## Context

Owner ask: pull `ui-ux-pro-max-skill`, `impeccable`, `agent-skills`,
`andrej-karpathy-skills` and Superpowers into the repo's Claude skills so sessions
actually use them.

**Taken literally, that is 47 skills, 484 files, ~15 MB, 181k lines** — and it was, in
the first pass on this branch. The owner's response to that diff is the reason this ADR
exists: _"181k lines… doesn't it look too excessive… no need for all of this 15mb of
styling and stuff… we don't want the opinionated stuff that go against our adrs and
conventions."_ Both halves of that are the same finding from two directions, and the
measurement makes it concrete:

|                                                                                                       | lines | weight |
| ----------------------------------------------------------------------------------------------------- | ----- | ------ |
| `impeccable`                                                                                          | 72.6k | 3.5 MB |
| `ui-ux-pro-max` (+ `ui-styling`, `design-system`, `brand`, `slides`, `banner-design`, `ui-ux-design`) | 90.7k | 11 MB  |
| everything else (process + engineering method)                                                        | 16.2k | 1 MB   |

**90% of the bulk was two repos whose job is to decide what a UI looks like.** Not
incidentally — that _is_ the product: a palette, a type scale, 5.5 MB of fonts, an
824 KB icon index, a 500 KB bundled browser script. And what a UI looks like is the one
thing this repo has decided most explicitly: root rule 4 (amber = time and commitment,
teal = location, `--plan` violet = plan mode, and nothing else),
[`design-language.md`](../design/design-language.md), and ADR-0175's `design-mockups`
procedure for drawing anything at all. So the largest thing in the diff was also the
thing least entitled to an opinion here.

The same test, applied to process, disqualifies six more skills — each prescribing
something already decided differently:

- `using-superpowers` — _"invoke a skill BEFORE any response or action, including
  clarifying questions"_, _"you do not have a choice"_. The exact inverse of this
  repo's context-engineering rule: load the minimum for the change in front of you.
- `git-workflow-and-versioning` — trunk-based development, its own branch naming, a
  semver/changelog release flow. Ours: branch per task, Conventional Commits, no
  versioning scheme at all.
- `documentation-and-adrs` — its own ADR template and threshold. Ours is stricter and
  written down: an ADR for a decision, not for an adjustment; amend in place.
- `finishing-a-development-branch` — presents _"merge back to `<base-branch>` locally"_
  as an option. Root `CLAUDE.md` forbids committing onto local `main`.
- `using-git-worktrees` — worktree setup as a precondition; our isolation is
  branch-per-task, and `.claude/worktrees/` is gitignored scratch.
- `using-agent-skills` — a meta-router whose decision tree points at three of the above.

Four harness facts shaped the mechanics, none guessable from the request: a project
skill is invoked by its **directory** name (frontmatter `name` is only a label); a
project skill **silently replaces a bundled skill** of the same name; grouping
subfolders inside `.claude/skills/` are not discovered at all; and the skill listing has
a **~1%-of-context character budget** past which descriptions are dropped **starting
with the least-invoked skill** — which is precisely `design-mockups`, rarely invoked and
mandatory under ADR-0175.

## Decision

**Take the method, refuse the authority.** 33 skills, ~1 MB, 16.2k lines.

### 1. What comes in

| Source                                                                                          | Kept | Refused |
| ----------------------------------------------------------------------------------------------- | ---- | ------- |
| [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills)                           | 21   | 3       |
| [obra/superpowers](https://github.com/obra/superpowers)                                         | 11   | 3       |
| [multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills)       | 1    | 0       |
| [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | 0    | 7       |
| [pbakaus/impeccable](https://github.com/pbakaus/impeccable)                                     | 0    | 1       |

What is left is review, debugging, verification, specs, incremental delivery, perf,
security, and the Karpathy pitfall list — the register root `CLAUDE.md`'s own "two ways
a session goes wrong" section is written in. `frontend-ui-engineering` survives the
design cut because it argues _against_ imposing a palette (_"use the project's actual
color palette"_), which is our rule stated by someone else.

**`impeccable`'s detector is the one real loss** and worth naming so it can be
reconsidered deliberately: mechanical anti-pattern checks are exactly what this repo
values, and ADR-0175 exists because rendering finds defects reading does not. It is
refused at 3.5 MB of bundled browser JS carrying a competing design language, not on
merit. If it comes back, it comes back as the detector alone.

### 2. Pinned by commit, with an allowlist

[`.claude/vendor/skills.json`](../../.claude/vendor/skills.json) pins each source by
commit and carries an **allowlist of upstream directory names** plus an `excluded` map
with a one-line reason per refusal. [`sync-skills.mjs`](../../.claude/vendor/sync-skills.mjs)
materialises exactly that (`--check` fails on drift, `--bump` moves the pins).

Pinned rather than tracked because **these files are instructions Claude follows**: an
upstream edit changes how every session behaves, which is a reviewed commit, not
whatever `main` said this morning. An allowlist rather than "everything in `skills/`"
because curation is now the substance of the decision — and anything upstream in neither
list is **reported by every sync**, so a `--bump` surfaces a new skill as a decision
rather than adopting or dropping it silently. The script owns only the directories the
pins name and never deletes an unclaimed one, so `design-mockups` is out of reach.

### 3. Two renames' worth of collision, down to one

Both remaining repos ship a `test-driven-development`; Superpowers keeps the plain name
and addyosmani's becomes **`agent-skills-test-driven-development`**, with the siblings
that route to it by name rewritten to match. The first pass also needed `design` →
`ui-ux-design` to stop a project skill silently replacing the bundled design canvas —
**refusing that repo removed the collision instead of managing it**, which is the better
shape of the same fix.

Where a kept skill called a refused one a **required sub-skill**, the reference is
redirected to the convention that applies here (`finishing-a-development-branch` → the
pull-request convention; `using-git-worktrees` → branch-per-task;
`git-workflow-and-versioning` → `conventions.md`). Every redirect is declared in the
manifest, so a diff against upstream stays reviewable — dangling required sub-skills
would otherwise leave three workflows with no ending.

### 4. The listing budget, and rule 9

`skillListingBudgetFraction: 0.02`. The 34 project skills now total **8.5k chars** of
description; at the default ~1% they would still crowd the bundled skills' entries, and
an evicted description is a skill Claude stops matching. Root `CLAUDE.md` gains **rule
9**: a vendored skill never outranks this repo, and the refusals are listed so one is
not proposed back from memory.

## Consequences

- 33 more skills in every session, local and cloud, found by description like any other.
  The repo grows ~1 MB of markdown and small scripts — no binaries, no vendored bundles.
  `.prettierignore` already covers `.claude/**`, so none of it enters format or lint.
- **Design guidance is deliberately unchanged by this ADR.** `design-mockups`,
  `design-language.md` and ADR-0028 remain the whole story; the only new voice near the
  surface is `frontend-ui-engineering`, on accessibility and responsive behaviour.
- Two licenses ship inside the repo (MIT ×3 across three repos). The karpathy repo
  declares MIT in its README and ships no `LICENSE` file; recorded rather than resolved.
- `browser-testing-with-devtools` needs the Chrome DevTools MCP server and fails loudly
  without it. No guard.
- The reverse risk is smaller but real: 33 confident voices still raise the odds of a
  session following generic advice over a decision recorded here. Rule 9 and
  `.claude/skills/README.md` are the answer; if it happens anyway, the fix is fewer
  skills, not more prose.

## Alternatives considered

- **Vendor all 47, as asked.** Done first, and it is what produced the 181k-line diff.
  Rejected on the owner's reading of it, and the measurement agrees: the bulk was the
  part with the least right to an opinion here.
- **Keep the design repos but strip their heavy assets** — drop the fonts, the icon
  index, the bundled detector. Rejected: the skills read those files, so what survives
  is the palette prose without the tooling that made it checkable. That is the worst
  half of both.
- **Keep the process skills and let rule 9 arbitrate.** Rejected: a rule that has to be
  re-won in every session is not a rule. A skill asserting _"you do not have a choice"_
  is not a peer to root `CLAUDE.md`, and the cheapest way to win that argument once is
  to not ship the argument.
- **A plugin marketplace install, or git submodules.** Both keep the tree small.
  Rejected: cloud and CI sessions get what is committed, so a skill needing a second
  fetch is absent exactly when a sandboxed session needs it.
- **Namespacing every skill by collection** (`superpowers-brainstorming`, …). Rejected:
  it breaks the cross-references these repos make to each other by name and turns every
  re-vendoring into a rename pass. One rename beats 33.

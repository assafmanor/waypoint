# The skills in this directory

Two kinds live here, and the difference matters more than anything else on this page.

| | Written for this repo | Vendored from upstream |
| --- | --- | --- |
| Which | `design-mockups` ([ADR-0175](../../docs/decisions/0175-the-mockup-procedure-is-a-skill.md)) | the other 33, from three public repos |
| Authority | **it is the rule** — it encodes decisions this repo has actually made | **advice** — it knows nothing about Travelive |
| Edit it? | yes, in place, like any file we own | no: edit the pin in [`../vendor/skills.json`](../vendor/skills.json) instead |

## What is here

Pinned by commit in [`../vendor/skills.json`](../vendor/skills.json). Method and
engineering practice only — roughly 1 MB of markdown and small scripts.

| Source | Kept | License |
| --- | --- | --- |
| [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | 21 — review, debugging, perf, security, specs, incremental delivery, `agent-skills-test-driven-development` | MIT |
| [obra/superpowers](https://github.com/obra/superpowers) | 11 — `brainstorming`, `systematic-debugging`, `verification-before-completion`, `test-driven-development`, plans, subagents | MIT |
| [multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills) | 1 — `karpathy-guidelines` | MIT (declared in its README; the repo ships no `LICENSE` file) |

One name differs from upstream: both repos ship a `test-driven-development`, and a
project skill is invoked by its **directory** name, so two cannot share one. Superpowers
keeps the plain name; addyosmani's is **`agent-skills-test-driven-development`**, and
the siblings that route to it by name were rewritten to match.

## What was refused, and why

Kept out on purpose, not overlooked. The full argument is in
[ADR-0201](../../docs/decisions/0201-vendored-skills-are-advice-and-they-are-pinned.md);
`skills.json` carries a one-line reason next to each.

**Two whole repos**, because their job is to decide what a UI looks like and that is
already decided here by [`design-language.md`](../../docs/design/design-language.md),
ADR-0028 and the `design-mockups` skill:

- **ui-ux-pro-max-skill** — 7 skills, 69k lines, 11 MB: a competing palette and type
  scale, 5.5 MB of fonts, an 824 KB icon index, and logo/CIP generation needing a
  Gemini key we do not ship.
- **impeccable** — 1 skill, 72k lines, 3.5 MB, mostly bundled browser JS for its own
  anti-pattern detector. The detector is the good part; without its scripts the skill is
  only a second design language, and with them it was the largest thing in the repo.

**Six process skills**, because each prescribes something this repo has already decided
differently: `using-superpowers` (demands a skill be invoked before any response,
including clarifying questions — the opposite of our context-engineering rule),
`using-agent-skills` (routes to the skills below), `git-workflow-and-versioning`
(trunk-based, its own branch naming, semver releases), `documentation-and-adrs` (its own
ADR template and threshold), `finishing-a-development-branch` (offers a local merge to
the base branch), `using-git-worktrees` (worktree setup as a precondition).

Where a kept skill called one of those a **required sub-skill**, the reference was
redirected to the convention that actually applies here — every redirect declared in the
manifest, so a diff against upstream stays reviewable.

## They still lose every argument with this repo

Even trimmed, these were written for other people's codebases. When one disagrees with
this repo, **this repo wins** — root `CLAUDE.md`, the ADRs in `docs/decisions/`,
`docs/design/design-language.md`, and the per-package `CLAUDE.md` files, in that order.
What to watch for:

- **Drawing a surface.** `design-mockups` is the procedure here, and it is not optional:
  RTL, phone-first, both themes, real app CSS, measured off the DOM. `frontend-ui-engineering`
  is a useful second opinion inside that procedure, never a replacement for it.
- **No em dashes in UI copy.** These skills write them freely. The rule in root
  `CLAUDE.md` governs what we ship regardless of what a skill's examples do.
- **Our ADR and backlog discipline** is narrower than any of them: an ADR only for a
  decision, amended in place, and a backlog line bracketing the task.
- **`shipping-and-launch` and `ci-cd-and-automation`** describe pipelines we already
  have in `.github/workflows/`. Read them as checklists, not as instructions to rebuild.

## Updating

```bash
node .claude/vendor/sync-skills.mjs           # restore the pinned state
node .claude/vendor/sync-skills.mjs --check   # exit 1 if the tree has drifted
node .claude/vendor/sync-skills.mjs --bump    # move pins to upstream head, then review
```

Pinned, not tracked, on purpose: these files are instructions Claude follows, so an
upstream edit changes how every session behaves. That belongs in a reviewed commit, not
in whatever `main` happened to say this morning.

`skills` in the manifest is an **allowlist of upstream directory names** — curation is
the point, so a skill that is not listed is not taken. Anything upstream in neither the
allowlist nor `excluded` is reported by every sync, so a `--bump` surfaces a new skill as
a decision to make rather than adopting or dropping it silently.

# The skills in this directory

Two kinds live here, and the difference matters more than anything else on this page.

| | Written for this repo | Vendored from upstream |
| --- | --- | --- |
| Which | `design-mockups` ([ADR-0175](../../docs/decisions/0175-the-mockup-procedure-is-a-skill.md)) | the other 47, from five public repos |
| Authority | **it is the rule** — it encodes decisions this repo has actually made | **advice** — it knows nothing about Travelive |
| Edit it? | yes, in place, like any file we own | no: edit the pin in [`../vendor/skills.json`](../vendor/skills.json) instead |

## Vendored skills lose every argument with this repo

They were written for other people's codebases. They will confidently tell you to
use a palette we don't use, a git workflow we don't use, and a docs convention we
don't use. When a vendored skill and this repo disagree, **this repo wins** — root
`CLAUDE.md`, the ADRs in `docs/decisions/`, `docs/design/design-language.md`, and the
per-package `CLAUDE.md` files, in that order. The conflicts that are not hypothetical:

- **Design language.** `impeccable`, `ui-ux-pro-max`, `ui-ux-design`, `ui-styling`,
  `design-system` and `brand` all carry their own opinions about color, type and
  spacing. Ours are in `docs/design/design-language.md` and root rule 4 (amber = time
  and commitment, teal = location, `--plan` violet = plan mode, and nothing else).
  Take their *method* — contrast checks, hierarchy, motion discipline, the
  anti-pattern detectors. Do not take their tokens.
- **Drawing a surface.** `design-mockups` is the procedure here, and it is not
  optional: RTL, phone-first, both themes, real app CSS, measured off the DOM. A
  vendored design skill is a second opinion inside that procedure, never a
  replacement for it.
- **Docs and git.** `documentation-and-adrs`, `git-workflow-and-versioning` and
  `shipping-and-launch` overlap root `CLAUDE.md` and `docs/engineering/conventions.md`.
  Ours are narrower and already decided — branch per task before the first commit,
  Conventional Commits, an ADR only for a decision, a backlog line to bracket the task.
- **No em dashes in UI copy.** Every one of these skills writes them freely. The rule
  in root `CLAUDE.md` applies to what we ship regardless of what a skill's examples do.

## What is here, and where it came from

Pinned by commit in [`../vendor/skills.json`](../vendor/skills.json).

| Source | Skills | License |
| --- | --- | --- |
| [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | `ui-ux-pro-max`, `ui-styling`, `design-system`, `brand`, `slides`, `banner-design`, `ui-ux-design` | MIT |
| [pbakaus/impeccable](https://github.com/pbakaus/impeccable) | `impeccable` | Apache-2.0 |
| [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | 24 engineering skills, incl. `agent-skills-test-driven-development`, `using-agent-skills` | MIT |
| [obra/superpowers](https://github.com/obra/superpowers) | 14 workflow skills, incl. `test-driven-development`, `brainstorming`, `using-superpowers` | MIT |
| [multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills) | `karpathy-guidelines` | MIT (declared in its README; the repo ships no `LICENSE` file) |

Three names differ from upstream, because a project skill is invoked by its
**directory** name and two collisions had to be broken:

- `design` → **`ui-ux-design`** — `design` is a bundled Claude Code skill (the design
  canvas). A project skill of the same name silently replaces it.
- `test-driven-development` (addyosmani) → **`agent-skills-test-driven-development`** —
  both that repo and superpowers ship one. Superpowers keeps the plain name; the
  sibling skills that route to the renamed one by name were rewritten to match.

Two path rewrites were applied for the same reason — upstream assumes a personal or
plugin install, and `${CLAUDE_PLUGIN_ROOT}` / `~/.claude/skills/…` resolve to nothing
here. Both now use `${CLAUDE_SKILL_DIR}`. Every rewrite is declared in the manifest;
nothing else was touched, so a diff against upstream stays reviewable.

## Updating

```bash
node .claude/vendor/sync-skills.mjs           # restore the pinned state
node .claude/vendor/sync-skills.mjs --check   # CI-style: fail if the tree drifted
node .claude/vendor/sync-skills.mjs --bump    # move pins to upstream head, then review
```

Pinned, not tracked, on purpose: these files are instructions Claude follows, so an
upstream edit changes how every session behaves. That belongs in a reviewed commit,
not in whatever `main` happened to say this morning. `--bump` writes new pins and
prints them; read the diff before committing it.

## What was left behind

Skills only. These upstreams also ship hooks, subagents, commands and MCP config,
which `.claude/skills/` does not load — most visibly superpowers' session-start hook,
whose job was to force `using-superpowers` to load first. Without it, these skills are
found the ordinary way, by their descriptions. That is the intended behavior here:
they are advice, and advice does not get to pre-empt the turn.

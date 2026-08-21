# 0200 — Five public skill libraries come in vendored, pinned, and outranked

**Status:** Accepted
**Date:** 2026-08-21
**Relates:** [ADR-0175](0175-the-mockup-procedure-is-a-skill.md) (the one skill we wrote; this places 47 we did not beside it), [ADR-0096](0096-per-domain-claude-md-guides.md) (progressive disclosure — the reason a skill is cheaper than a `CLAUDE.md` paragraph), [ADR-0046](0046-retire-the-task-board.md) (the backlog lines this adds), [ADR-0028](0028-plan-violet-color-budget-dark-ready.md) / [`design-language.md`](../design/design-language.md) (the palette these skills will argue with)

## Context

Owner ask: pull `ui-ux-pro-max-skill`, `impeccable`, `agent-skills`,
`andrej-karpathy-skills` and Superpowers into the repo's Claude skills so sessions
actually use them. Resolved to five upstreams:

| Repo                                                                                            | Skills                                                       | License                      |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------- |
| [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | 7 (design intelligence, searchable style/palette/font data)  | MIT                          |
| [pbakaus/impeccable](https://github.com/pbakaus/impeccable)                                     | 1 (a design language plus a real anti-pattern detector)      | Apache-2.0                   |
| [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills)                           | 24 (engineering practice: TDD, review, perf, security, ADRs) | MIT                          |
| [obra/superpowers](https://github.com/obra/superpowers)                                         | 14 (workflow: brainstorming, plans, subagents, verification) | MIT                          |
| [multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills)       | 1 (LLM coding-pitfall guidelines)                            | MIT, declared in README only |

**47 skills, 484 files, ~15 MB.** Four facts from the harness docs decided the shape,
and none of them were guessable from the request:

1. A project skill is invoked by its **directory** name. Frontmatter `name` is a
   display label and nothing more — so a rename means renaming a directory.
2. **A project skill silently replaces a bundled skill of the same name.** `design` is
   a bundled skill (the design canvas). Vendored as-is, ui-ux-pro-max's `design` would
   have taken it over with no warning anywhere.
3. Nesting for tidiness does not exist. `.claude/skills/<collection>/<skill>/SKILL.md`
   is not discovered; a nested `.claude/skills/` means _a subdirectory of the repo_,
   loaded only once Claude touches a file there. So 47 flat directories it is.
4. The skill listing has a **character budget of ~1% of the context window**, and when
   it overflows Claude Code drops descriptions **starting with the skills you invoke
   least**. Our 48 project skills alone total 13.5k chars of description, against a
   default budget near 8k for everything including the bundled skills.

Point 4 is the one that would have quietly undone the whole exercise: a skill with no
description in the listing is a skill Claude stops matching. `design-mockups` — 685
chars, second-fattest description, invoked rarely, and **mandatory** for design work
under ADR-0175 — is exactly the profile the eviction rule reaches for first. Adding 47
skills would have blunted the one skill this repo actually wrote.

And the deeper problem is not context, it is **authority**. These skills are opinionated
about the things this repo has already decided. `impeccable`, `ui-ux-pro-max`,
`ui-styling`, `design-system` and `brand` each ship a palette and type scale, against
root rule 4 (amber = time and commitment, teal = location, `--plan` violet = plan mode,
and nothing else). `documentation-and-adrs`, `git-workflow-and-versioning` and
`shipping-and-launch` overlap root `CLAUDE.md` and `conventions.md`. All of them write
em dashes freely. None has seen an RTL phone-first PWA. Left unranked, that is 47 files
of confident instruction competing with the ones we wrote on purpose.

## Decision

**Vendored, pinned by commit, flat, renamed only where a name collides, and explicitly
outranked by this repo.**

### 1. Pinned by commit, materialised by a script

[`.claude/vendor/skills.json`](../../.claude/vendor/skills.json) holds the five sources
with their commit, license, upstream skills directory, renames and path rewrites;
[`sync-skills.mjs`](../../.claude/vendor/sync-skills.mjs) re-materialises exactly that
state (`--check` fails on drift, `--bump` moves the pins and prints the diff to review).

Pinned rather than tracked because **these files are instructions Claude follows.** An
upstream edit changes how every session behaves, which is a reviewed commit, not
whatever `main` said this morning. The script owns only the directories the pinned
commits contain and names anything else as unclaimed rather than deleting it — the one
unclaimed directory today is `design-mockups`, and a sync that could remove it would be
a worse tool than no tool.

### 2. Three names differ from upstream, and only three

`design` → **`ui-ux-design`** (the bundled-skill collision above).
`test-driven-development` (addyosmani) → **`agent-skills-test-driven-development`**,
because Superpowers ships one too and two directories cannot share a name; Superpowers
keeps the plain name, and the six sibling files that route to the renamed one by name
were rewritten with it. Two path rewrites for the same class of reason —
`${CLAUDE_PLUGIN_ROOT}` and `~/.claude/skills/design/scripts/` resolve to nothing in a
project install, so both become `${CLAUDE_SKILL_DIR}`.

Every edit is declared in the manifest and applied by the script, which keeps a diff
against upstream reviewable. Verified byte-identical to the pinned trees everywhere no
rewrite was declared — including `ui-styling`'s 81 OFL font binaries, which is why the
rewriter is byte-preserving rather than UTF-8-decoding.

### 3. The listing budget is raised, and the cost is stated

`skillListingBudgetFraction: 0.04` in `.claude/settings.json`. Roughly 6–8k tokens of
every session's context spent advertising skills, which is the honest price of 47 of
them; the alternative is a listing that silently forgets `design-mockups`.

### 4. They lose every argument with this repo

Root `CLAUDE.md` gains **rule 9**, and
[`.claude/skills/README.md`](../../.claude/skills/README.md) carries the detail: the
precedence order (root `CLAUDE.md` → ADRs → `design-language.md` → package
`CLAUDE.md`), the named conflicts, and the standing instruction to take a vendored
design skill's _method_ and never its _tokens_.

### 5. Skills only

These upstreams also ship hooks, subagents, commands and MCP config, which
`.claude/skills/` does not load. The visible casualty is Superpowers' session-start
hook, whose job is to force `using-superpowers` to load before anything else. Not
ported, and that is the decision rather than an omission: advice does not get to
pre-empt the turn.

## Consequences

- Every session, local and cloud, gets 47 more skills; they are found by description
  like any other, and `design-mockups` keeps its own.
- The repo grows ~15 MB, most of it `ui-styling`'s fonts (5.5 MB, OFL, shipped with
  their licenses) and ui-ux-pro-max's searchable data (3.1 MB). `.prettierignore`
  already covers `.claude/**`, so none of it enters the format or lint surface — the
  one piece of luck in this change.
- Four licenses now ship inside the repo (MIT ×3, Apache-2.0 ×1, plus OFL fonts). The
  karpathy repo declares MIT in its README and ships no `LICENSE` file; recorded rather
  than resolved.
- A skill that assumes network, a Gemini API key, or Chrome DevTools MCP will fail
  where those are absent. `ui-ux-design`'s logo and CIP generation and
  `browser-testing-with-devtools` are the clear cases. They fail loudly, so no guard.
- The reverse risk is real and not fully mitigated: 47 confident voices raise the odds
  of a session following generic advice over a decision recorded here. Rule 9 and the
  README are the answer today. If it happens anyway, the fix is fewer skills, not more
  prose.

## Alternatives considered

- **A plugin marketplace install, or git submodules.** Both keep the tree small and
  updates trivial. Rejected: cloud and CI sessions clone this repo and get what is
  committed — a skill that needs a second fetch is a skill that is absent exactly when
  a sandboxed session needs it. Vendoring is the only form that always loads.
- **Namespacing every skill by collection** (`superpowers-brainstorming`, …). Kills all
  collisions mechanically and prints provenance in the `/` menu. Rejected: it breaks
  every cross-reference these collections make to each other by name — 40-odd of them —
  and turns each future re-vendoring into a rename pass. Two renames beat 47.
- **A `.claude-plugin/plugin.json` per collection**, which the harness loads as
  `<name>@skills-dir` and namespaces for free. Rejected: it needs the workspace trust
  dialog accepted before it loads, which is precisely the headless and cloud case.
- **Dropping the heavy assets** (fonts, style data) to keep the repo lean. Rejected:
  the skills read them. A half-vendored skill that fails at its first script is worse
  than a fat one that works.
- **Taking only the design skills**, since that is where this repo's live work is.
  Rejected against the ask, and the process skills are the better bargain anyway —
  `verification-before-completion` and `doubt-driven-development` name failure modes
  that root `CLAUDE.md`'s own "two ways a session goes wrong" section was written about.

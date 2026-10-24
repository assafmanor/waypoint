# ADR-0243: Design skills come in as critics, not designers

**Status:** Accepted 2026-09-30 (owner ask: _"Find online and add to the repo … Taste skill (the anti slop frontend framework), web-design-guidelines, awesome-design. Make sure that they're discoverable and used appropriately."_)

**Partially revises** [0201](0201-vendored-skills-are-advice-and-they-are-pinned.md), whose consequence _"design guidance is deliberately unchanged"_ no longer holds. Its mechanics (pin by commit, allowlist, `excluded` with a reason, rewrites declared in the manifest, rule 9) apply unchanged, and its two refusals stand.

## Context

0201 kept design-language repos out because their product is deciding what a UI looks like, and that is decided here. The owner now wants three design voices in. The question is not whether, but in what role, so that a session reaches for them at the right moment and loses the argument when they disagree with [`design-language.md`](../design/design-language.md).

| Asked for             | Upstream                                                                           | What it is                                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Taste skill           | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill), MIT               | 13 skills. `taste-skill` (upstream name `design-taste-frontend`) is the anti-slop all-rounder, 87 KB of markdown only.     |
| web-design-guidelines | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills), MIT       | A 1 KB skill that fetches [web-interface-guidelines](https://github.com/vercel-labs/web-interface-guidelines) at run time. |
| awesome-design        | [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md), MIT | Not a skill: 74 `DESIGN.md` analyses of real products (Linear, Stripe, Airbnb…), 2.9 MB.                                   |

## Decision

**All three come in as critics and references; none decides a value.**

1. **`taste-skill`**, vendored and pinned. Only the flagship: the other twelve each pick an aesthetic (soft, minimalist, brutalist), generate a brand, or need an image model, and are in `excluded` with a reason. Its description is rewritten in the manifest to say what it is here: a second opinion on whether a surface looks generic, never a source of palette, type, fonts or a design-system install. Upstream scopes itself to landing pages and portfolios; the rewrite keeps that visible rather than hiding it.
2. **`web-design-guidelines`**, vendored and pinned, one of nine. It is the most checkable of the three (accessibility, focus, forms, motion, `…` over `...`) and is aimed at every `frontend/` or `mockups/` change before it is called done. **Its run-time fetch reads `main`, which would bypass the pin**, so a manifest rewrite points it at a commit. The description names where its rules assume an English, hover-first, LTR page, so those are read against ours.
3. **`awesome-design`**, written here, like `design-mockups`. Upstream has no `SKILL.md`, so vendoring would mean 2.9 MB of reference nobody loads. The skill instead lists the brands and fetches one `DESIGN.md` from a pinned commit when a session needs it; it allows reasoning to be borrowed and forbids any value (hex, font, radius, spacing) entering the repo.

Run-time fetches have no `--bump`: both pins are recorded under `fetchedAtRuntime` in [`skills.json`](../../.claude/vendor/skills.json) and moved by hand, together with the URL that uses them.

## Consequences

- 37 project skills (35 vendored, 2 written here); descriptions total ~9.8k chars, inside the 2% listing budget 0201 set.
- A design change now has three extra voices. Order when they disagree: root `CLAUDE.md`, `design-language.md`, `design-mockups`, then these. Rule 9 in root `CLAUDE.md` names them.
- `web-design-guidelines` and `awesome-design` need the network at run time. Offline, they fail loudly; nothing else depends on them.
- Two sources declare MIT in a README with no `LICENSE` file (vercel-labs/agent-skills, like the karpathy repo). Recorded, not resolved.

## Alternatives considered

- **Vendor all of taste-skill.** Rejected on 0201's own test: the style skills exist to choose an aesthetic, which is the one thing already chosen.
- **Vendor awesome-design-md whole, or a handful of brands.** Rejected: the whole is 74 files a session reads one of; a handful is a guess about which brand the owner will name next.
- **Leave `web-design-guidelines` fetching `main`.** Rejected: an upstream edit would change every review silently, which is exactly what pinning exists to stop.

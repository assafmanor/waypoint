# CLAUDE.md — Waypoint

Guidance for Claude (and any coding agent) working in this repo. Read this first, then the docs it points to.

## What this is

**Waypoint** (working codename) is a travel companion for small groups traveling abroad — a **living visibility layer** for when you're on the ground ("what now / what next / what do I need in the next 30 minutes"), not a pre-trip planner. Each **trip** is a small group (~5 people traveling together), but the **app** is built to serve many trips and many users — read "~5" as the size of one trip's group, never as a ceiling on the app. It's invite-only (no public discovery or social layer) and not production-scaled yet; the mindset is **grow-later** — real multi-user collaboration works today and nothing is designed to bake in a low-user-count cap (ADR-0065).

## Founding principle: document everything

Code and documentation live together. **Any consequential decision gets an ADR** (`docs/decisions/`); **any working session gets a dated note** (`docs/planning/`); docs describe the current state and are kept in sync with the code. If you change a documented behavior or decision, update the doc/ADR in the same change.

**Bracket every task with a backlog check.** Before starting, scan `docs/backlog.md` for a matching item — it may already scope the work, or mark it deferred/blocked. If none matches, add one, so the work is tracked before it's built. When the task ships, prune the line(s) it completes in the same change; when work is decided but deferred, add or update a line. The backlog stays current alongside the ADRs and planning notes (ADR-0046).

## Where things are

- `docs/INDEX.md` — the map of all documentation. **Start here.**
- `docs/backlog.md` — decided-but-unbuilt work. A flat list, no statuses (ADR-0046). Not a record of anything: the ADRs and planning notes are.
- `docs/product/` — vision, PRD, feature catalog, personas (what & why).
- `docs/design/design-language.md` — palette, type, mode identity, semantic color budget, hard/soft grammar, RTL, dark-mode readiness (adopted in ADR-0028).
- `docs/architecture/` — overview, collaboration-model, data-model, **api-contract**, **sync-and-offline**, **auth-and-google**, tech-stack.
- `docs/decisions/` — ADRs (the "why"). `README.md` lists them chronologically; `INDEX.md`'s **"Decisions by domain"** table is the router — read the ADR(s) for a domain before you touch it.
- `docs/engineering/` — conventions + prerequisites checklist.
- `docs/design/mockups.md` — the mockup catalog: what each `mockups/*.html` file is for, what it promotes/supersedes, and its status relative to the shipped app (ADR-0097). Read the entry for the surface you're touching there, not here — this file doesn't inline it.

## Tech stack (see docs/architecture/tech-stack.md)

TypeScript monorepo (pnpm workspaces + Turborepo):

- `packages/shared` — `@waypoint/shared`: entity types + zod schemas. **Source of truth for shapes** — import from here, don't redefine.
- `backend` — NestJS + Prisma + Postgres. Google-only auth. WebSocket realtime.
- `frontend` — React + Vite PWA, RTL, Dexie offline cache.

Each package has its own `CLAUDE.md` (`packages/shared/CLAUDE.md`,
`backend/CLAUDE.md`, `frontend/CLAUDE.md`) with domain-specific good/bad
patterns — which existing infra to reuse before adding new, the constants/enum
convention, and the concrete anti-patterns already fixed once in that layer.
Read the one for the layer you're touching, in addition to this file
(ADR-0096).

## Run

```bash
cp .env.example .env
docker compose up -d                                   # Postgres + Redis
pnpm install
pnpm --filter @waypoint/backend prisma:generate
pnpm --filter @waypoint/backend prisma:migrate
pnpm dev                                               # backend :3000, frontend :5173
```

(The `node_modules` were not pre-installed — run `pnpm install` on your machine.) This is the quickstart; the authoritative toolchain, Google Cloud, and secrets setup lives in `docs/engineering/prerequisites-checklist.md` — don't duplicate its detail here.

**Testing without Google (sandbox/agent sessions):** set `DEV_AUTH=1` in `.env` to bypass OAuth — the backend treats un-tokened requests as the seeded dev user, so you can drive the app headlessly. Dev-only, never in prod. Full recipe (seed, `VITE_API_BASE_URL`, the `localhost`-origin/CORS gotcha, no-Docker Postgres, clock pinning) in `docs/engineering/prerequisites-checklist.md`.

## Non-negotiable rules

1. **Hard vs. soft events (ADR-0011)** is the core primitive. Hard = real commitment (flight, reservation code): guarded on edit, never auto-moved, excluded from ripple. Soft = free to move/skip/swap. Respect this everywhere it touches.
2. **Integrations are pipes, not screens (ADR-0004).** Any integration feeds the Now/Next timeline or the index — it never gets its own tab.
3. **Types/validation in `packages/shared`.** Keep it in sync with `backend/prisma/schema.prisma`.
4. **Amber = time & commitment only; teal = location only; plan violet (`--plan`) = plan mode only** (design-language.md, ADR-0028). Don't reuse them decoratively — generic CTAs use the neutral `--cta`, statuses use `--ok`/`--miss`.
5. **Everything works offline for reads** (index/documents/today). Never assume the network.
6. **Mobile-first, phone-primary (ADR-0017).** Design/build for the phone first (~360–430px), touch-first, no hover-only affordances. Tablet is secondary (matters most for Plan mode); desktop is a graceful minimum. Responsive by breakpoints, one codebase.
7. **Never commit `.env`, secrets, or anything the `.gitignore` excludes.**
8. **Reuse existing infrastructure before adding new (ADR-0096; see the domain `CLAUDE.md` files).** Before writing a new mechanism, look for the one already doing that job in this layer — a shared guard util, a registry, a cache, a component primitive, a named-constants object — and extend it. If none exists, build it so the next similar need is a one-line addition, not a new one-off. Several ADRs in this repo (0078, 0079, 0094, 0095) exist only to undo the parallel copies that piled up before someone generalized them; don't create the next one.

## Conventions

Conventional Commits, branch per task (create the branch _before_ the first commit — including docs-only changes, never commit onto local `main`), Prettier/ESLint authoritative. **Prefer self-documenting code** — comment only to capture a non-obvious _why_, keep comments short, and skip them where clear names make the code speak for itself. Run `pnpm format` before committing **and again before opening a PR** (unformatted code fails CI regularly). `pnpm typecheck` + `pnpm build` green before done. Full details in `docs/engineering/conventions.md`.

**No em dashes (`—`) in UI copy — never.** For a separator between peer bits of info use the small middle dot (`·`, the app's separator, e.g. `עכשיו · במקביל`); for a "no value" placeholder a regular dash (`-`) reads best; otherwise a comma or period. User-facing strings only (Hebrew UI copy, placeholders, option labels), not English code comments.

## Agent Instructions: Context Engineering

Treat your context window as scarce RAM. The goal is **progressive disclosure**, not exhaustive loading — reading the whole `docs/` tree up front is the failure mode, not diligence.

- **Context is RAM.** Never load all documentation at once. Load the minimum needed for the change in front of you, then stop.
- **Progressive disclosure.** Before any architectural, state-model, or dependency change: read the router first — [`docs/INDEX.md`](docs/INDEX.md) and its "Decisions by domain" table (with the full list in [`docs/decisions/README.md`](docs/decisions/README.md)) — locate the specific ADR(s) for the domain you're touching, and read **only** those. Don't preload sibling ADRs "for background."
- **Durable vs. scratch.** Treat `docs/decisions/` (the _why_) and `docs/architecture/` (the _current state_) as the source of truth. Any ephemeral material — scratch notes, raw session handoffs, investigation logs — is orientation only: a fact isn't authoritative until it lands in an ADR or an architecture doc. **Never cite scratch material to justify a decision.**
- **Path-scoped rules.** If a `.claude/rules/` directory exists, check it for rules scoped to the files you're editing before changing that domain. (None today — this is a forward hook, not a current requirement.)
- **Obsidian-compatible `docs/`.** The `docs/` tree is edited via Obsidian, but Git + standard Markdown are the source of truth. Use standard relative Markdown links (`[text](../decisions/0011-…md)`) — **never** Obsidian wikilinks (`[[…]]`). Any YAML frontmatter must be strictly valid so Obsidian properties parse it. (Scope: the `docs/` tree only.)

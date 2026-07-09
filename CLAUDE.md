# CLAUDE.md — Waypoint

Guidance for Claude (and any coding agent) working in this repo. Read this first, then the docs it points to.

## What this is

**Waypoint** (working codename) is a private, small-group travel companion for ~5 friends traveling abroad — a **living visibility layer** for when you're on the ground ("what now / what next / what do I need in the next 30 minutes"), not a pre-trip planner. Not commercial, not built for scale, but architected so real multi-user collaboration works and scaling later isn't blocked.

## Founding principle: document everything

Code and documentation live together. **Any consequential decision gets an ADR** (`docs/decisions/`); **any working session gets a dated note** (`docs/planning/`); docs describe the current state and are kept in sync with the code. If you change a documented behavior or decision, update the doc/ADR in the same change.

## Where things are

- `docs/INDEX.md` — the map of all documentation. **Start here.**
- `docs/product/` — vision, PRD, feature catalog, personas (what & why).
- `docs/design/design-language.md` — palette, type, hard/soft grammar, RTL.
- `docs/architecture/` — overview, collaboration-model, data-model, **api-contract**, **sync-and-offline**, **auth-and-google**, tech-stack.
- `docs/decisions/` — ADRs (the "why"). `README.md` indexes them.
- `docs/engineering/` — conventions + prerequisites checklist.
- `mockups/trip-dashboard-v2.html` — the interactive design reference.

## Tech stack (see docs/architecture/tech-stack.md)

TypeScript monorepo (pnpm workspaces + Turborepo):
- `packages/shared` — `@waypoint/shared`: entity types + zod schemas. **Source of truth for shapes** — import from here, don't redefine.
- `backend` — NestJS + Prisma + Postgres. Google-only auth. WebSocket realtime.
- `frontend` — React + Vite PWA, RTL, Dexie offline cache.

## Run

```bash
cp .env.example .env
docker compose up -d                                   # Postgres + Redis
pnpm install
pnpm --filter @waypoint/backend prisma:generate
pnpm --filter @waypoint/backend prisma:migrate
pnpm dev                                               # backend :3000, frontend :5173
```

(The `node_modules` were not pre-installed — run `pnpm install` on your machine.)

## Non-negotiable rules

1. **Hard vs. soft events (ADR-0011)** is the core primitive. Hard = real commitment (flight, reservation code): guarded on edit, never auto-moved, excluded from ripple. Soft = free to move/skip/swap. Respect this everywhere it touches.
2. **Integrations are pipes, not screens (ADR-0004).** Any integration feeds the Now/Next timeline or the index — it never gets its own tab.
3. **Types/validation in `packages/shared`.** Keep it in sync with `backend/prisma/schema.prisma`.
4. **Amber = now/active only; teal = location only.** Don't reuse them decoratively.
5. **Everything works offline for reads** (index/documents/today). Never assume the network.
6. **Mobile-first, phone-primary (ADR-0017).** Design/build for the phone first (~360–430px), touch-first, no hover-only affordances. Tablet is secondary (matters most for Plan mode); desktop is a graceful minimum. Responsive by breakpoints, one codebase.
7. **Never commit `.env`, secrets, or anything the `.gitignore` excludes.**

## Conventions

Conventional Commits, branch per task (`t-003-…`), Prettier/ESLint authoritative, `pnpm typecheck` + `pnpm build` green before done. Full details in `docs/engineering/conventions.md`.

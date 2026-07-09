# Planning Session 01 — PM Kickoff

**Date:** 2026-07-09
**Mode:** Product management — deciding features, design language, platform behavior, and technologies
**Participants:** Assaf + AI assistant

## Purpose

First formal planning session after the concept/mockup phase. Goals: (1) stand up the project under `D:\Projects\waypoint` with a full documentation handbook, (2) establish "document everything" and a repo/internal split as founding principles, (3) act as PM to draft the feature set, design language, platform behavior, and tech stack.

## What we set up

- Project folder `D:\Projects\waypoint` with the docs handbook (product / design / architecture / integrations / decisions / planning).
- A private, gitignored local area (kept out of the repo) for personal notes, people data, secrets, scratch. See ADR-0010.
- Moved the interactive mockup into `mockups/` and the original handoff into `planning/` as source material.

## Decisions taken this session

**Carried over & ratified as ADRs (Accepted):**
- Document everything + handbook + ADR process (ADR-0001)
- Each member connects their own Google account (ADR-0002)
- One-way calendar sync (ADR-0003)
- Integrations are pipes, not screens (ADR-0004)
- Docs in English, UI Hebrew/RTL (ADR-0009)
- Repo vs. internal split (ADR-0010)
- Hard/soft event model as the core primitive (ADR-0011)

**New proposals this session (Proposed — awaiting your ruling):**
- Everyone is a peer in v1, no roles (ADR-0005)
- No live GPS location sharing in v1 (ADR-0006)
- Platform = mobile-first PWA (ADR-0007)
- Backend = Supabase + thin worker (ADR-0008)
- Conflicts = last-writer-wins + undo for v1 (ADR-0012)

**Product framing decided:**
- v1 = one real trip, one real group; success measured on the ground (PRD-v1).
- Real multi-user collaboration is a v1 requirement; not built for scale but designed not to preclude it.
- Feature catalog drafted with MoSCoW priorities.

## Open questions owed by the PM (you)

1. **Platform:** PWA (proposed) vs. native shell from the start?
2. **Gmail import:** v1 or v1.1? (Highest value, highest single build — drives how much worker we build now.)
3. **Budget feature:** display-only vs. real shared expense tracking?
4. **Location sharing:** firmly out (proposed) or opt-in appetite?
5. **Auth:** Google-only vs. also email/password?
6. **Backend fork:** ratify Supabase (ADR-0008) or roll-your-own service?
7. **Worker language:** TypeScript everywhere vs. Go/Python for parsing?
8. **Document encryption:** client-side E2E vs. server-side at rest?

## Proposed next sessions

- **Session 02 — Ratify the open questions above**, flip the Proposed ADRs to Accepted.
- **Session 03 — Design the Map and Index screens** to the mockup's finish level.
- **Session 04 — Firm up the data model into DDL** and a v1 API sketch.
- Then: hand off to a **coding session** to scaffold the TS monorepo (PWA + NestJS backend).

## Addendum — decisions ratified same day

Assaf ruled on the open questions:
- ✅ **Platform: PWA** (ADR-0007 → Accepted).
- ✅ **Gmail import: v1.1** — deferred, not the most important; manual entry covers v1.
- ✅ **Auth: Google-only** for now (ADR-0013, new).
- ✅ **Backend: traditional, self-owned Python/FastAPI** — not a BaaS. TS-everywhere rejected; type-safety recovered via OpenAPI → TS codegen (ADR-0008 rewritten → Accepted).
- ✅ **Own-device location is in v1** (powers map features). Member-to-member sharing still open (ADR-0006).

**Still open:** (1) budget depth — display-only vs. shared expense tracking; (2) member-to-member live location sharing yes/no; (3) document encryption — E2E vs. at-rest.

Also decided: stand up a persistent, **agent-handoff task system** in a private, gitignored local area (kept out of the repo).

### Final rulings (same day, second pass)
- ✅ **TypeScript end-to-end** — backend switched from Python to **Node/TS (NestJS)** for natively shared types; TS monorepo with `packages/shared` (ADR-0008 rewritten).
- ✅ **Budget: display-only** for v1; may not end up a main feature (ADR-0014).
- ✅ **Member-to-member live location sharing: deferred** as a suggested future feature (ADR-0006 resolved).
- ✅ **Document encryption: server-side at rest** (ADR-0015).

**All v1 scope questions are now resolved.** Accepted ADRs: 0001–0004, 0006, 0007, 0008, 0009, 0010, 0011, 0013, 0014, 0015. Still *Proposed*: 0005 (peers/no-roles), 0012 (LWW+undo) — low-risk, ratify when convenient.

## Addendum — scaffold + specs built (same session)

Built the full TypeScript monorepo scaffold on disk and wrote the remaining v1 specs:
- **Monorepo:** pnpm workspaces + Turborepo; `packages/shared` (entity types + zod), `backend` (NestJS + Prisma, `/health`, full `schema.prisma`), `frontend` (React+Vite PWA, RTL, 4-tab shell, tokens, Dexie stub). Root config: tsconfig base, prettier, editorconfig, `.nvmrc`, `.env.example`, `docker-compose.yml` (Postgres+Redis).
- **Specs:** `docs/architecture/api-contract.md`, `sync-and-offline.md`, `auth-and-google.md`; `docs/engineering/conventions.md` + `prerequisites-checklist.md`.
- **`CLAUDE.md`** at repo root to orient coding agents.
- Board reworked: T-003/004/005 done→archive; new critical-path tasks T-006 (first run), T-007 (auth), T-008 (Home/Day port), plus a backlog through T-017.

**Two environment caveats (must be done on the Windows machine):**
1. `pnpm install` was not run — the planning sandbox can't reach the npm registry, and Linux-built binaries would be wrong for Windows anyway. Run `pnpm install` locally (lockfile will be generated then).
2. `git init` could not run — the sandbox can't manage `.git` on the mounted drive. A partial `.git/` folder was left behind; delete it (`Remove-Item -Recurse -Force .git` in PowerShell) then `git init` locally. The `.gitignore` already excludes the private local area and `.env`.

## Notes

Private/raw thoughts for this session live in the private local notes area (kept out of the repo).

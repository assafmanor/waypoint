# Engineering Conventions

**Status:** ACCEPTED. Guardrails so the codebase and any coding agent stay consistent. Short and enforced over long and ignored.

## Repository shape

TypeScript monorepo (pnpm workspaces + Turborepo):

```
waypoint/
├── packages/shared/   @waypoint/shared — entity types + zod schemas (source of truth for shapes)
├── backend/           @waypoint/backend — NestJS + Prisma API
├── frontend/          @waypoint/frontend — React + Vite PWA
├── docs/              the handbook (product/design/architecture/decisions/engineering/planning)
└── mockups/           HTML mockups
```

## Language & style

- **TypeScript everywhere**, `strict` on. No `any` without a comment justifying it.
- Prettier + ESLint are authoritative; run `pnpm format` before committing.
- **Types/validation live in `packages/shared`.** Never redefine an entity shape locally — import it. If the shape changes, change it there and in `backend/prisma/schema.prisma` together.
- camelCase in TS/JSON; the DB (Prisma) maps to the same field names.
- File naming: kebab-case files, PascalCase React components and Nest classes.

## Backend (NestJS)

- One **module per domain** (trips, events, bookings, auth, realtime), each with controller + service.
- Controllers validate input with the shared **zod** schemas; services hold logic; `PrismaService` is the only DB access.
- Every shared-state mutation writes a `Change` and broadcasts it (see sync-and-offline.md). Put that in a small shared helper, not copy-pasted.
- Trip authorization is checked in a guard, per request, against `Membership`.

## Frontend (React)

- Function components + hooks. Co-locate a component's CSS.
- Design tokens come from `styles/tokens.css` (ported from the mockup). **Amber = now/active only; teal = location only** — don't reuse them decoratively.
- Full RTL; wrap Latin runs (times, codes) with `dir="ltr"`.
- **Mobile-first, phone-primary (ADR-0017):** author and test at phone width (~390px) first; touch-first (no hover-only affordances); add tablet breakpoints where it helps (esp. Plan mode). Desktop = graceful centered layout.
- Offline reads go through the Dexie layer (`db.ts`); never assume the network.

## Data & migrations

- Prisma is the schema source; every change is a **migration** (`prisma migrate`), never a manual DB edit.
- Keep `packages/shared` entity types in sync with the Prisma models (they mirror each other by hand for now).

## Testing

- **Backend:** unit-test services (Vitest/Jest); the hard-event guard, ripple, and LWW reconciliation are must-test.
- **Frontend:** component tests for the interaction verbs; a smoke e2e (Playwright) for the 4 tabs.
- A change to a documented behavior updates the doc/ADR in the same PR.

## Git & commits

- **Conventional Commits:** `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`. Scope optional: `feat(events): ...`.
- Small, focused commits. Branch per task: `t-003-prisma-schema`.
- Never commit `.env`, secrets, or anything the `.gitignore` excludes (don't override it).

## Definition of Done

- Acceptance criteria (from the task brief) all checked.
- Types/zod/Prisma consistent; `pnpm typecheck` and `pnpm build` pass.
- Docs/ADRs updated if behavior or a decision changed.

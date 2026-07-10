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
- **Code is English-only** — identifiers, comments, commit messages, docs. **User-facing strings are the one exception**: they are localizable UI copy (Hebrew today) and must stay out of logic — reference them by key/variable, never branch on their text — so more languages can be added later.
- **No magic values.** Meaningful string/number literals never sit inline in logic — hoist them to named constants: UI copy in the locale files (`frontend/src/i18n/`), domain enum values in `@waypoint/shared` constants, tunables (durations, thresholds, sizes, default slots) in a `constants` module. This keeps logic language-agnostic and i18n-ready. Exempt: structural/framework literals (CSS class names, ARIA roles, `dir="ltr"`) and fixture/seed content.
- camelCase in TS/JSON; the DB (Prisma) maps to the same field names.
- File naming: kebab-case files, PascalCase React components and Nest classes.
- **Comment sparingly — only where a comment earns its keep.** A comment justifies itself by capturing a non-obvious _why_ (a decision, a gotcha, an ADR pointer) that the code can't. Don't restate what the code already says, and don't document what something _isn't_, _doesn't contain_, or _used to be_ — the schema/types are the record of what _is_. Prefer a short ADR reference over prose.

## Backend (NestJS)

- One **module per domain** (Auth, Trips, Events, Bookings, Documents, Calendar) + infra modules (Prisma global, Crypto, **Sync**). See the module map in the T-025 review.
- Controllers validate input with the shared **zod** schemas via a `ZodValidationPipe` (**not** class-validator/DTOs — `packages/shared` is the single source of truth); services hold logic; `PrismaService` is the only DB access.
- **Every data-plane mutation goes through `ChangeService.mutate()`** — it runs the entity write + `Change` insert in **one transaction** (`seq` assigned atomically) and broadcasts **only after commit** (ADR-0019). Domain services never write `Change` or touch the WS gateway directly. This is a hard boundary, not a convention. The **data plane** is the collaborative timeline: `TripEvent`, `Booking`, `MaybeItem`, `TripNote`, documents. The **control plane** (`User`, `Trip`, `Membership`) is plain authenticated CRUD — no `Change`, no WS (ADR-0022).
- Trip authorization is checked in a `MembershipGuard`, per request, against `Membership` (404 on no membership).
- **tsconfig guardrail:** the backend uses `NodeNext` and emits CommonJS — **never add `"type":"module"` to `backend/package.json`** (it would flip emit to ESM and break the Nest runtime).

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

- **Runner: Vitest everywhere** (backend + frontend; one runner, ESM-clean).
- **Backend:** unit-test services; the hard-event guard, ripple, LWW reconciliation, `ChangeService` atomicity, and mode-derivation are must-test.
- **Frontend:** component tests for the interaction verbs; a smoke e2e (Playwright) for the 4 tabs.
- A change to a documented behavior updates the doc/ADR in the same PR.

## Git & commits

- **Conventional Commits:** `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`. Scope optional: `feat(events): ...`.
- Small, focused commits. Branch per task: `t-003-prisma-schema`.
- Never commit `.env`, secrets, or anything the `.gitignore` excludes (don't override it).

## Definition of Done

- Acceptance criteria (from the task brief) all checked.
- **Every feature ships with tests** — its logic and its interaction verbs. Nothing merges test-free.
- Types/zod/Prisma consistent; `pnpm typecheck` and `pnpm build` pass.
- Docs/ADRs updated if behavior or a decision changed.

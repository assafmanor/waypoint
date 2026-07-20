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
- Prettier + ESLint are authoritative; run `pnpm format` before committing **and again before opening a PR** — unformatted code fails CI regularly.
- **Types/validation live in `packages/shared`.** Never redefine an entity shape locally — import it. If the shape changes, change it there and in `backend/prisma/schema.prisma` together.
- **Code is English-only** — identifiers, comments, commit messages, docs. **User-facing strings are the one exception**: they are localizable UI copy (Hebrew today) and must stay out of logic — reference them by key/variable, never branch on their text — so more languages can be added later.
- **No magic values.** Meaningful string/number literals never sit inline in logic — hoist them to named constants: UI copy in the locale files (`frontend/src/i18n/`), domain enum values in `@waypoint/shared` constants, tunables (durations, thresholds, sizes, default slots) in a `constants` module. This keeps logic language-agnostic and i18n-ready. Exempt: structural/framework literals (CSS class names, ARIA roles, `dir="ltr"`) and fixture/seed content.
- **No em dashes in UI copy** (`frontend/src/i18n/`). Use the middle dot (`·`) as the clause separator, matching the rest of the copy — it doesn't collide with RTL bidi reordering the way an em dash can. Code comments and docs are unaffected.
- camelCase in TS/JSON; the DB (Prisma) maps to the same field names.
- File naming: kebab-case files, PascalCase React components and Nest classes.
- **Prefer self-documenting code; comment sparingly.** Clear names and structure come first — if the code reads plainly on its own, leave it uncommented. When a comment does earn its keep, it captures a non-obvious _why_ (a decision, a gotcha, an ADR pointer) the code can't, and it stays short. Don't restate what the code already says, and don't document what something _isn't_, _doesn't contain_, or _used to be_ — the schema/types are the record of what _is_. Prefer a short ADR reference over prose.

## Backend (NestJS)

- One **module per domain** (Auth, Trips, Events, Bookings, Documents, Calendar) + infra modules (Prisma global, Crypto, **Sync**). See the module map in the T-025 review.
- Controllers validate input with the shared **zod** schemas via a `ZodValidationPipe` (**not** class-validator/DTOs — `packages/shared` is the single source of truth); services hold logic; `PrismaService` is the only DB access.
- **Every data-plane mutation goes through `ChangeService.mutate()`** — it runs the entity write + `Change` insert in **one transaction** (`seq` assigned atomically) and broadcasts **only after commit** (ADR-0019). Domain services never write `Change` or touch the WS gateway directly. This is a hard boundary, not a convention. The **data plane** is the collaborative timeline: `TripEvent`, `Booking`, `MaybeItem`, `TripNote`, documents. The **control plane** (`User`, `Trip`, `Membership`) is plain authenticated CRUD — no `Change`, no WS (ADR-0022).
- Trip authorization is checked in a `MembershipGuard`, per request, against `Membership` (404 on no membership).
- **tsconfig guardrail:** the backend uses `NodeNext` and emits CommonJS — **never add `"type":"module"` to `backend/package.json`** (it would flip emit to ESM and break the Nest runtime).

## Frontend (React)

- Function components + hooks. Co-locate a component's CSS.
- Design tokens come from `styles/tokens.css` (ported from the mockup). **Amber = time & commitment only; teal = location only; plan violet = plan mode only** (`docs/design/design-language.md`, ADR-0028) — don't reuse them decoratively; generic CTAs use `--cta`, statuses use `--ok`/`--miss`.
- Full RTL; wrap Latin runs (times, codes) with `dir="ltr"`.
- **Hebrew copy register:** everyday spoken Hebrew, not formal — e.g. the product word for an invite URL is **"לינק"** (owner's call; never "fix" it to "קישור"). Buttons are short nouns/imperatives; sentences stay impersonal (no slash-gender forms). All UI strings live in `i18n/he.ts`.
- **Mobile-first, phone-primary (ADR-0017):** author and test at phone width (~390px) first; touch-first (no hover-only affordances); add tablet breakpoints where it helps (esp. Plan mode). Desktop = graceful centered layout.
- Offline reads go through the Dexie layer (`db.ts`); never assume the network.
- **In-app navigation & back (ADR-0090, behavior of ADR-0035) — two load-bearing invariants.** The one back action (nav-bar Home, the return gesture, and platform system-back all resolve to it via one pure `resolveBack(snapshot)`) rests on these; break either and back silently misbehaves in ways types won't catch:
  - **Overlays render through the `Modal` primitive.** Every sheet/dialog/picker/popover goes through `ui/primitives/Modal` (or its `Sheet`/`ConfirmDialog`/`RowManageSheet` wrappers), which registers into the back stack via `useOverlay` — so one back/Escape/gesture closes the topmost overlay instead of navigating out from under it, with no per-call-site wiring. `resolveBack` consults `hasOverlay` first. **Never hand-roll a floating overlay** (a raw `createPortal` or `position:fixed` panel); if a bespoke portal is truly unavoidable, call `useOverlay()` yourself and add the file to the allowlist in `eslint.config.mjs` (the `createPortal` lint guards this).
  - **In-trip navigation is always `replace`; back is resolved from state, never from history depth.** Back does not read the browser history stack (ADR-0090) — it computes the target from the current nav state and navigates explicitly — so nothing needs a `push` to "sit behind" anything. Tabs (`useTripTab`/`tabTarget`) and deep-linkable in-screen state (e.g. the selected `?day=`, `trip-state.tsx`/`daySelectTarget`) mirror to the URL with `{ replace: true }`, keeping in-trip history flat. New in-trip surfaces follow the same rule; a new structural back case is a rule in `resolveBack` (`state/nav-state.tsx`), never a `navigate(-1)`.

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
- Small, focused commits. Branch per task, descriptive name (e.g. `index-bookings-documents-spec`) — task-ID-style names (`t-003-…`) are stale since ADR-0046 retired the task board.
- **Create the branch before the first commit** — including docs-only changes. Never commit directly onto local `main`, even briefly with the intent to move it onto a branch later.
- Never commit `.env`, secrets, or anything the `.gitignore` excludes (don't override it).

## Definition of Done

- Acceptance criteria (from the task brief) all checked.
- **Every feature ships with tests** — its logic and its interaction verbs. Nothing merges test-free.
- Types/zod/Prisma consistent; `pnpm typecheck` and `pnpm build` pass.
- Docs/ADRs updated if behavior or a decision changed.
- **Retire the backlog line your PR just built** (ADR-0046: shipped → delete the line). If the docs still call the thing "unbuilt" after you built it, the PR isn't done.
- **CI enforces this too**, not just the local pre-commit hook: `.github/workflows/ci.yml` runs typecheck/build/test/lint on every PR against `main` and blocks merge on failure.

### Managed-list parity checklist

Any new user-managed list surface (bookings, documents, members, …) is only "done" when it answers **all** of these — the Index tab shipped missing several (see `planning/2026-07-17-session-27-index-post-build-issues.md`), which is why this is a checklist now:

- **View** — can a row's content actually be opened, **on a phone** (ADR-0017)? An embedded preview that only works on desktop is not a viewer; provide open/download.
- **Create / Edit / Delete** — all present, at **both** the frontend and the backend? A list you can add to but not rename or delete from is half a feature. Deleting something irreversible (an encrypted doc, a hard commitment) is **guarded**.
- **The right edit surface** — if an entity has a merged/shared editor reachable from more than one place (an ADR that says "from X **or** Y"), enumerate every entry point and wire the same surface to each; don't build one path and leave the other on a lesser form.
- **Async states** — busy (with motion, not just a disabled button), empty (teaching, not a dead-end), and error (**cause-aware**, distinct from offline). Validate client-side before a round-trip where you can.
- **Icons/badges** — peer categories are **visually** distinct at render size, from a single source constant (not hardcoded per call site).

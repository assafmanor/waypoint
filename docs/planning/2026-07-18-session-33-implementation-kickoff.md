# Session 33 — Implementation kickoff: build the accepted session-32 ADRs (handoff)

**Purpose:** a forward execution plan (orientation, not a decision record — the ADRs remain the source of truth) for building the session-32 design work with **multiple worktree-isolated agents in parallel**. Maps tasks into waves, assigns file ownership, and fixes a merge order that avoids conflicts.

## Source of truth (each agent reads its own ADR in full before coding)

- ADRs: `docs/decisions/0063` (profile), `0059` (booking presentation), `0060` (idle-resume), `0061` (plan-home), `0062` (zoom); amendments/refinements on `0035` (swipe-back), `0052` (docs menu), `0054` (ambient/glance). All **Accepted** (session-32, 2026-07-18).
- `docs/backlog.md` → "Home & bookings triage" (per-task file pointers).
- `docs/planning/2026-07-18-session-32-home-and-booking-issue-triage.md` (the triage + file-ownership map).
- `CLAUDE.md` (conventions: branch-per-task, Conventional Commits, `pnpm format` + `typecheck` + `build` green, no em dashes in Hebrew UI copy, derive-don't-store).
- Mockups to eyeball: `mockups/booking-presentation-v1.html` (Agent F), `mockups/plan-home-readiness-v1.html` (Agent B).

## The one dependency

**ADR-0063 (the category time-profile) gates ADR-0059 and ADR-0054** — they read `CATEGORY_TIME_PROFILE` / `isBracketed` / `isAmbient`. Everything else is independent.

Two pairs are **combined into one agent each** to remove the only guaranteed file collisions:

- **0059 + 0054 → Agent F** — both rewrite `Home.tsx`'s hero/glance and read the profile; splitting them guarantees a `Home.tsx` conflict.
- **0035 + 0060 → Agent E** — both reset navigation and touch `App.tsx` + nav/trip state.

## Waves & agents

| Agent | ADR(s)           | Owns (files)                                                                                                                                             | Depends on |
| ----- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **A** | 0063 profile     | `packages/shared/src/icons.ts` (+ `isBracketed`/`isAmbient`/`isMultiDay` helpers, tests)                                                                 | —          |
| **B** | 0061 plan-home   | `frontend/src/lib/readiness.ts` (+ tests), `frontend/src/screens/PlanHome.tsx`, `frontend/src/i18n/he.ts`                                                | —          |
| **C** | 0052 docs-menu   | `frontend/src/ui/DocumentManageSheet.tsx`, `frontend/src/ui/DocumentsSection.tsx`, `frontend/src/i18n/he.ts`                                             | —          |
| **D** | 0062 zoom        | `frontend/index.html`, `frontend/src/App.css`/`styles/tokens.css`, `frontend/src/ui/DocumentViewer.tsx`, `frontend/src/screens.css`                      | —          |
| **E** | 0035 + 0060 nav  | `frontend/src/state/nav-state.tsx`, `frontend/src/state/trip-state.tsx`, `frontend/src/App.tsx`                                                          | —          |
| **F** | 0059 + 0054 home | `Home.tsx`, `lib/hero-booking.ts` (new), `lib/glance.ts`, `Index.tsx`, `ui/BookingDetail.tsx`, `DayView.tsx`, `PlanDay.tsx`, `i18n/he.ts`, `screens.css` | **A**      |

**Launch:** A, B, C, D, E all start immediately in parallel (A is independent — it only _blocks F_, nothing else). **F launches once A's branch lands.**

## Merge order & collision map

**Merge order:** `A → B → C → E → D → F`.

- `Home.tsx` → Agent F only ✓ (no collision — that's why 0059+0054 are combined).
- `App.tsx` → Agent E only ✓ (why 0035+0060 are combined).
- `he.ts` → B, C, F — append-only i18n keys; sequential merges rebase trivially.
- `screens.css` → D, F — append-only rules; same.
- `packages/shared` → A only.
- F merges **last** so it absorbs the `he.ts`/`screens.css` additions from B/C/D.

## Per-agent acceptance criteria (details in each ADR)

- **A (0063):** `CATEGORY_TIME_PROFILE` closed 9-row lookup beside the icon registry; `transport` & `lodging` = `bracketed: true, ambientWhenMultiDay: true` with `transitions` (departure/arrival, checkIn/checkOut); rest ordinary. Helpers unit-tested. No schema/DB change.
- **B (0061):** keep the 4 checks; **flights round-trip-aware** (outbound leg to the destination + return leg from it, via flight origin/destination Places); add one **per-traveller documents/passports** check from the snapshot docs list (ADR-0058); each CTA opens the **type-specific create form** (lodging→create-lodging, flights→create-flight seeded with the missing direction; empty-day→day builder on the first empty day; group→settings invite); completed checks **collapse** into a summary w/ toggle; readiness **advisory only**. Code-completeness check is out; Google/Gmail/WhatsApp stay out.
- **C (0052 amendment):** "⋯" menu → **Edit · Delete**; Edit = one rename+type sheet; **remove the replace-file path**.
- **D (0062):** app-wide zoom off (`touch-action: manipulation` on root + multi-touch gesture suppression — iOS ignores the viewport meta), **excluding `.doc-viewer`**; viewer image gains pinch-zoom + pan. **Verify on iOS Safari / installed PWA if possible.**
- **E (0035 + 0060):** back-to-Home also resets `activeDate` to today in Trip mode (gesture/`goToTab` path, not just the nav-bar tap at `App.tsx:351-354`); a `visibilitychange` nav-reset — hidden ≥ `RESET_TO_HOME_AFTER_HIDDEN_MS` (~30 min) & `mode==='trip'` → Home + `setActiveDate(today)` + clear overlays (distinct from the 30-**second** data resync). Plan mode preserves the day.
- **F (0059 + 0054):** hero renders a bracketed booking at its **transition moments only** (check-in +2h grace / check-out 3h lead; departure/arrival, arrival emphasized ~45 min — tunable constants; gate/terminal **not** shown); **teal "inside a booking"** treatment (slim dismissible strip for an ambient hotel mid-stay; hero NOW slot for a flight in transit); **shared row/detail/hero grammar**; glance excludes ambient spans from `buildTimeTree`/rail/`remaining`, renders the backdrop across covered days, and draws **amber transition markers in a dedicated lane** above the blocks (hotel check-in/out uncounted; flight departure/arrival as edge markers). `lib/hero-booking.ts` unit-tested.

## Setup (once per environment)

```bash
cp .env.example .env          # set DEV_AUTH=1 for headless driving without Google
docker compose up -d          # Postgres + Redis
pnpm install                  # node_modules are NOT pre-installed
pnpm --filter @waypoint/backend prisma:generate
pnpm --filter @waypoint/backend prisma:migrate
```

## Definition of done (per task)

- `pnpm format`; `pnpm typecheck` + `pnpm build` green; new/affected unit tests pass.
- Update the ADR / architecture doc if behavior drifts from what's written.
- One branch + one PR per task; report status.
- **Verification honesty:** this sandbox has no Google/Postgres by default — typecheck + build + unit tests are the floor; drive the real app (DEV_AUTH) only if the stack stands up. Never mark "verified" what wasn't actually run.

## Orchestration

Spawn one **worktree-isolated** agent per task (Agent tool, `isolation: "worktree"`), one branch each, respecting the two waves and the merge order above. Each agent reads its ADR(s) fully first. The earlier Index post-build batch (0052/0053/0054 **core**) is a separate workstream and is out of scope here.

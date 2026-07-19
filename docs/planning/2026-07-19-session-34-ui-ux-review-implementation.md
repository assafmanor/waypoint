# Session 34 — UI/UX review implementation (orchestration + wave log)

**Purpose:** a forward execution + progress record (orientation, not a decision record — the ADRs remain the source of truth) for _building_ the UI/UX review (`docs/reviews/ui-ux-review.md`, findings U-01…U-14). Mirrors the session-33 kickoff discipline: worktree-isolated agents in waves, disjoint file ownership, a fixed merge order, a full green gate between waves.

## Source of truth

- **Spec:** `docs/reviews/ui-ux-review.md` — §11 (remediation architecture), §12 (target structure), §13 (dependency map), §14 (phased roadmap) are the build plan.
- **Tracker:** the "UI/UX review follow-ups" block in `docs/backlog.md` — prune per shipped finding.
- **Prior art:** `docs/planning/2026-07-18-session-33-implementation-kickoff.md` (the orchestration pattern this mirrors).
- **Guardrails:** foundations before screen polish; root-cause (shared token/primitive/component) not per-screen patches; design-system fidelity (amber=time, teal=location, `--plan` violet=plan, neutral `--cta`); every shared component ships states/variants/a11y/RTL + jsdom tests before any screen migrates onto it; delete superseded markup/CSS in the same change (no parallel old+new); ADRs for each foundational choice; Hebrew RTL copy, no em dashes, strings in `i18n/he.ts`.

## Green gate

`pnpm typecheck && pnpm build && pnpm test && pnpm lint && pnpm format:check`. **Sandbox limitation:** no Docker/Postgres, so `@waypoint/backend#test` (needs a DB at `127.0.0.1:5432`) cannot run here — the runnable floor is frontend typecheck + build + unit tests + lint + format:check, plus backend build/typecheck (Prisma client generated once with `DATABASE_URL` exported). This matches session-33's "verification honesty": typecheck + build + unit tests are the floor; never mark "verified" what wasn't run. All UI/UX-track code is frontend + docs, so the frontend suite is the authoritative gate for it.

## Wave plan (respecting §13 dependencies)

| Wave  | Track(s)                                           | Findings                                    | Parallelism                        | Merge order |
| ----- | -------------------------------------------------- | ------------------------------------------- | ---------------------------------- | ----------- |
| **0** | T tokens                                           | U-08 (token layer)                          | serial (done inline on the branch) | first       |
| **1** | P1 layout · P2 Modal · P3 feedback · P4 quick wins | U-10/U-08bp · U-01-prep · U-10 · U-11/U-12  | ×4 worktree                        | P1→P2→P3→P4 |
| **2** | E editing · S sync                                 | U-01/U-02/U-05 · U-04                       | ×2 worktree                        | E→S         |
| **3** | D0 domain · D-home · D-day · D-index · D-route     | U-03 · U-13 · U-07/U-13 · U-03 · day-in-URL | D0 serial then ×3–4                | D0 first    |
| **4** | C ChangeFeed · DM dark-mode                        | U-09 · U-08 tail                            | ×2 worktree                        | either      |

Out of scope: **U-06** (Map surface — product-owned, flagged not started), **U-14** (glance-rail density — validation, not code).

## Collision map (do not violate)

- `styles/tokens.css` → Wave 0 (T) + Wave 4 (DM) only.
- `App.tsx` / `App.css` shell → P1 (Wave 1) then designated owner only.
- `EventForm.tsx` / `BookingSheet.tsx` / `ConfirmDialog.tsx` → agent E (Wave 2) only; Wave 3 rebases on E.
- `DayView.tsx`/`PlanDay.tsx` → D-day. `Index.tsx`/`DocumentsSection.tsx` → D-index. `Home.tsx` → D-home.
- `lib/outbox.ts` → S only. `ui/domain/*` created by D0; screen agents consume.

## ADR number reservations (avoid parallel-agent collisions)

- **0077** — adopt non-color design tokens (Wave 0). ✅ written.
- **0078** — shared feedback-state family (Wave 1 P3).
- **0079** — single Modal/Sheet primitive (Wave 1 P2).
- **0080** — per-entity SyncStatus model (Wave 2 S).
- **0081** — group ChangeFeed (Wave 4 C).

(Layout primitives (P1) fold into the design-language/app-shell docs rather than a standalone ADR unless a consequential layout decision emerges.)

## Wave log

### Wave 0 — tokens (U-08 token layer) — DONE

Done inline on `claude/waypoint-ui-ux-impl-6swnuo` (serial, no parallelism to gain from a worktree; lands the foundation before Wave 1 branches). Added `--space-1..6`, `--text-*` + `--leading-*`, `--radius-8/12/16/22/999`, `--elevation-flat/raised/floating`, `--bp-tablet/desktop`, `--safe-*`, `--sync-*` to `tokens.css`, matching the design-language ramps 1:1; dark-remap parity (only `--elevation-raised` re-maps; the rest are theme-independent). ADR-0077 written; README + INDEX + backlog updated. **Defined-not-migrated** per U-08 — primitives are born on these, screens convert opportunistically. Gate: frontend typecheck/build/test + backend build + lint + format all green.

### Wave 1 — primitives (4 parallel worktree agents) — DONE

Four worktree-isolated agents, disjoint file ownership, integrated in order **P1 → P2 → P3 → P4** by direct file checkout (code files are disjoint by design) + hand-reconciliation of the shared docs/`he.ts`.

- **P1 — `ui/layout/*`** (`AppShell`, `Screen`, `Section`, `Stack`, `Inline`, `StickyActionBar`, `ResponsiveGrid`): slot-based shell frame that can host body-only states (unblocks U-10 chrome-preserving load), breakpoint-aware widths (retires the blanket `max-width:430px`), safe-area adoption. `App.tsx` `Shell()` frame + `App.css` shell block refactored onto `AppShell`; phone behavior preserved. 14 jsdom tests.
- **P2 — `Modal` primitive** (`ui/primitives/Modal.tsx` + `modal.css`, ADR-0079): `sheet`/`dialog` variants sharing `useOverlay` + `useDialogFocus`; trap off for `sheet` (nested-prompt reachability), on for `dialog`. `Sheet.tsx` refactored to a thin wrapper; its ~14 consumers unchanged. Consumers fold on in Wave 2 (`.confirm-*`/`.event-form-*` still live). Modal + Sheet jsdom tests.
- **P3 — feedback family** (`ui/feedback/*`, ADR-0078): `EmptyState`, `ErrorState` (optional retry, `role="alert"`), `LoadingState`+`Skeleton` (reduced-motion aware), `StatusBanner` (toned, polite live-region). New `t.feedback.*` i18n namespace. 17 jsdom tests. No screen migrated yet.
- **P4 — quick wins**: `settings` glyph added to `Icon`; header `⚙` emoji swapped to `<Icon name="settings" />` (wired at integration); `Spinner` aria-label → `t.common.loading` (U-11, U-12 shipped).

**Integration notes:** P1/P2/P4 branched off the pre-Wave-0 commit; P1 re-added Wave-0-like tokens with slightly different values — I kept the canonical ADR-0077 `tokens.css` (P1's tokens were a strict subset; only `--leading-snug` differs, 1.25 vs 1.3, imperceptible). `he.ts` combined (P3 `feedback` namespace + P4 `common.loading`). README/INDEX/backlog reconciled to carry all of 0077/0078/0079 + the landed-vs-remaining status per finding.

**Gate (integrated):** frontend typecheck/build ✅, **416 tests pass (35 files, +40 new)**, lint 0 errors (7 pre-existing warnings), backend build ✅, `format:check` ✅. Backend `#test` unrun (no Postgres — sandbox limit).

**Left for later waves (no old+new duplication introduced):** `.confirm-*`/`.event-form-*` deleted when consumers migrate (Wave 2 E); the ~6 empty shells + snapshot retry + chrome-preserving load + `.offline-badge` migrate onto the feedback family in Wave 3.

### Wave 2 — editing grammar + sync status (2 parallel worktree agents) — DONE

Two near-disjoint agents (forms/modals vs outbox/sync/docs), integrated **E → S** (E fast-forwards from the Wave-1 tip; S is a 3-way merge, the only conflict `backlog.md`, resolved by keeping E's shipped-U-01 + S's landed-U-04 lines; `he.ts` + README/INDEX auto-merged).

- **E — one editing grammar (U-01 + U-02 + U-05)** (commit 41ca546): `EventForm` folded into `Modal variant="sheet"` (U-01 closed — back/Escape/backdrop/focus all work; `.event-form-*` deleted); one variant-driven `ConfirmDialog` (tone `neutral`/`danger`/`hard` on `Modal variant="dialog"`) replacing all three confirm impls (hard-edit gate kept its `ConfirmProvider`/`useConfirmHardEdit` API, booking `DeletePrompt`, TripSettings `Confirm`); `FormActions` (canonical: primary→cancel, destructive own row) + `Field` (error slot + `aria-describedby`) + `DateTimeField` (retires native `datetime-local`) + `useUnsavedGuard` wired into both forms. Deleted `.confirm-*`/`.event-form-*`/`.bs-modal-overlay` (grep-verified). +20 jsdom tests. Consolidation decisions folded into ADR-0079.
- **S — per-entity sync status (U-04)** (commit 833a964, ADR-0080): id-keyed lookup on `lib/outbox.ts` + `useSyncStatus(entityId)` → `synced|pending|failed(reason)` (frontend-only, from the outbox + F-03 store); non-color-coded `SyncBadge` (✓/↑/! glyphs + accessible name on the `--sync-*` tokens); a persistent `SyncReviewSheet` dead-letter (retry re-enqueues, never auto-clears) replacing the timed failed-badge in `App.tsx`; reference wiring on `DocumentsSection` rows. +6 outbox + jsdom tests.

**Gate (integrated):** frontend typecheck/build ✅, **450 tests (42 files)**, lint 0 errors (7 pre-existing warnings), backend build ✅, `format:check` ✅.

**Known follow-up (backlogged):** nested-overlay Escape can close two overlays at once (a `useDialogFocus`/overlay-stack refinement, not this wave's scope). **Remaining for Wave 3:** migrate booking + event rows onto `<SyncBadge>`; the domain-component extractions.

_(Waves 3–4 appended as they land.)_

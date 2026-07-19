# 0078 — A shared feedback-state family (empty · loading · error · status)

**Status:** Accepted (2026-07-19)
**Date:** 2026-07-19
**Relates:** [0082](0082-adopt-non-color-design-tokens.md) (the Wave-0 spacing/type/radius/elevation + status/sync tokens this family is built on), [0052](0052-document-lifecycle-view-manage-and-feedback.md) (the shared `Spinner` the loading state reuses), [0028](0028-plan-violet-color-budget-dark-ready.md) (the color budget: feedback semantics use the status tokens, never amber/teal/plan). Implements finding **U-10** of the UI/UX review (`../reviews/ui-ux-review.md`).

## Context

Empty / loading / error / offline feedback is solved once per screen, so it drifts. The review (U-10, §9, §11) found:

- **~6 bespoke empty treatments** — `board-off` (zero-state), `glance-day.empty` (Home glance), `empty-card` (+ its `.doc` variant, Index/Documents), `past-build-hint` (past-day teach), and the Index/Plan empties — each re-styled, each subtly diverging.
- **No skeletons anywhere.** Loading is text-only (a `Spinner` + a word); a `grep` finds no skeleton loading state. Trip-switch/cold-load replaces the whole shell with a centered `<h1>` (`state/trip-state.tsx`), a layout-jump flash on weak networks abroad.
- **A retry-less error dead-end.** The snapshot error is a titled full-screen `<h1>` with no way to recover.
- **Ad-hoc status badges.** Offline/stale is a stacked `.offline-badge`, re-implemented per surface.

Each new screen re-implements these four states, so inconsistency grows with the product (review principle 8: "shared before special"). The design-language lexicon already names the missing primitives (`EmptyState`, `Skeleton`/`LoadingState`, `ErrorState`, `StatusBanner`); they just weren't real modules.

## Decision

Build one feedback-state family under `frontend/src/ui/feedback/` that owns the **shell**; screens pass the **content** (icon/copy/CTA). Chrome-preserving: every primitive is body-level — it renders inside the `AppShell` header/tab frame, never full-screen.

- **`EmptyState({ icon?, title, body?, action? })`** — the one empty shell; calm/teaching tone, an optional neutral CTA so the app never dead-ends.
- **`ErrorState({ title, body?, onRetry?, retryLabel? })`** — titled error with an **optional** retry. The title carries `role="alert"`. This is what the snapshot dead-end adopts when it migrates.
- **`LoadingState` / `Skeleton`** — chrome-preserving loading. `Skeleton` gives `line`/`block`/`circle` shape primitives with a subtle shimmer that collapses to static under `prefers-reduced-motion`; `LoadingState` composes the shared `Spinner` (ADR-0052) as the single announced live-region plus an optional skeleton.
- **`StatusBanner({ tone, children, onDismiss? })`** — an inline banner for offline/stale/status messages; `tone ∈ neutral|offline|warn|ok` maps to the status tokens; polite live-region (`aria-live="polite"`), optional dismiss. Generalizes the ad-hoc `.offline-badge`.

**Tokens.** Spacing/type/radius/elevation come only from the Wave-0 tokens (ADR-0082). Feedback semantics use the status tokens (`--ok`/`--miss`/`--muted` + `--sync-*`) — never the amber/teal/plan budget, which stays reserved for time/location/plan. Generic CTAs use the neutral `--cta`.

**a11y.** `ErrorState` announces its error text (`role="alert"`); `StatusBanner` is a polite live-region; the `Skeleton` shimmer respects `prefers-reduced-motion`; decorative icons are `aria-hidden`; `LoadingState` announces exactly once (the `Spinner`'s `role="status"` label; the visible label is mirrored and hidden).

**RTL.** Logical properties only (`padding-inline`, `inline-size`, `inset`…), so the shells mirror under `dir="rtl"`; no Hebrew copy in mono. New copy lands in `i18n/he.ts` under a `feedback` namespace (`retry`, `loading`, `errorTitle`, `dismiss`).

**Scope.** New files only — **no screen migrates in this change**. The `ui/feedback` primitives are added and the CSS is co-located (`feedback.css`, imported once via the barrel). `SyncBadge` is deliberately **not** built here; a later sync-track agent owns `ui/feedback/SyncBadge` (review U-04), so that name is left free.

## Consequences

- The ~6 bespoke empty shells collapse to one `EmptyState` **as screens migrate** in later waves — no indefinite duplication, but also no big-bang rewrite: the family exists now, screens shed into it opportunistically (the same define-then-adopt posture as ADR-0082).
- The chrome-preserving trip-switch load and the snapshot **retry** land when `state/trip-state.tsx` (and the Home/Index/Day screens) migrate onto `LoadingState`/`ErrorState` — the primitives are ready; the wiring is a later wave gated on the `AppShell` layout primitive.
- Loading gains skeletons (a perceived-performance win) without each screen re-inventing them; reduced-motion users get static placeholders.
- Status/offline messaging has one banner with a fixed tone→token mapping, so offline/stale/ok read consistently and inherit the dark remap for free (the status tokens are already dark-mapped, ADR-0082).
- One more `ui/` family to keep coherent; bounded, because it is the canonical home for these states and screens delete their bespoke copies as they adopt it.

## Alternatives considered

- **Per-screen states (status quo).** Rejected: this is exactly the drift U-10 documents — every new screen re-solves four states and they diverge.
- **A third-party component library.** Rejected: the app's feedback is Waypoint-specific (RTL Hebrew, the color budget, the offline-first posture, the one-loud-element restraint) and must sit on the existing tokens and the shared `Spinner`; a generic kit would fight all of that and bloat the bundle.
- **Fold loading/empty/error into the future `AppShell` primitive.** Rejected as the home for the content shells: `AppShell` owns the chrome (header/tab/safe-area), these own the body content, and they compose. The family ships independently now; the chrome-preserving _placement_ is realized when screens move onto `AppShell` (Wave 1 layout track).
- **Build `SyncBadge` here too.** Deferred: per-entity sync status (U-04) is its own state-model change owned by the sync track; bundling it would couple this presentational family to the outbox. The `ui/feedback/SyncBadge` name is reserved for it.

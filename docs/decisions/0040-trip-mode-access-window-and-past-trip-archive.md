# 0040 — Trip mode is a live-window-only state; a finished trip is a read-only archive

**Status:** Accepted
**Date:** 2026-07-15
**Refines:** [0016](0016-plan-trip-modes-one-surface.md) (auto-by-date + manual override), [0025](0025-trip-mode-edit-capability-tiers.md) (edit tiers), [0029](0029-trip-mode-day-scope-gating.md) (day-scope gating), [0033](0033-all-trips-home.md) (board = the trip is speaking)

## Context

Mode is **derived**, never stored (ADR-0016): `today ∈ [startDate, endDate] → Trip, else Plan` (`frontend/src/lib/mode.ts`). So a trip that hasn't started, and one that has ended, both already auto-resolve to **Plan**. What was left undefined is the **manual override** (`state/mode-state.tsx`): today's `ModeToggle` lets any member peek into **Trip mode at any time**, including before the trip and after it ends. ADR-0016 even listed "preview the departure board while planning" as a legitimate use.

Two problems with letting Trip mode be reachable outside the live window:

1. **Trip mode has no "now" to stand on.** Its signature surface is the departure board — now/next, live countdown, day progress, all derived from the real clock (ADR-0026). Pre-trip there is no "now" inside the trip; post-trip every "now" is behind you. The board renders an empty shell either way. ADR-0029 already encodes the same logic in miniature: it locks **Do-it-now** on future days ("targets 'now,' which doesn't exist yet") and locks create/edit/move on past days ("rewriting history isn't on-the-ground"). A pre-trip trip is *entirely* future days; a finished trip is *entirely* past days — so ADR-0029's own reasoning, taken to its limit, says the whole Trip-mode surface is incoherent outside the window.
2. **The board is meant to be scarce.** ADR-0033 made "the board = the trip is speaking" a rule — the All-trips home carries no board because nothing is live. Letting the override conjure a board inside a not-yet-live (or already-finished) trip quietly contradicts that scarcity.

Separately, "fall back to Plan" is not a complete answer for a **finished** trip: Plan mode's Home is a **prep dashboard** ("trip in 12 days · 3 gaps to fill · 2 not yet connected"), which is nonsense once the trip is over. A past trip needs an explicit posture, not just a mode.

## Decision

**1. Trip mode is a live-window-only state.** The manual override becomes one-directional and window-scoped:

- **Inside `[startDate, endDate]`:** default **Trip**, may peek **Plan** — unchanged (editing the plan mid-trip stays essential, ADR-0016).
- **Outside the window (pre-trip and post-trip alike):** **Plan only.** The Trip-mode override is **not offered** — the `ModeToggle` is hidden entirely (with only Plan reachable, there is nothing to toggle). `deriveMode` is unchanged; this only removes the ability to override *away* from the derived Plan mode.

The governing principle: **you can always drop *down* into Plan from Trip, but you can only be *in* Trip when the trip is actually live.** Plan is the universal fallback; Trip is the privileged live state. This **retires ADR-0016's "preview the departure board while planning" rationale** — previewing a board with no live data isn't useful, and the real "will my day flow?" preview is the Plan-mode Day **builder**, which already shows the full timeline.

**2. A finished trip is a read-only archive (calm, v1).** Post-trip, in Plan mode:

- **Home:** a **calm retrospective** — a quiet header (destination · dates · "past trip"), read-only day list, and quick access to Index/Map. The prep-dashboard framing (countdown, gaps-to-fill, who's-connected) **must not render** post-trip, and there is **no board**.
- **Day-by-day:** **read-only history** — days carry ADR-0029's past-day visual signal; create/edit/delete/move are locked.
- **Index / Map:** full reference, unchanged — confirmation codes/documents and "where we went" are exactly their post-trip job, and they already work offline.
- **Trip-settings (ADR-0039):** admin **rename/delete** stay available — those are governance, not itinerary building.

The archive is **fully read-only for itinerary content**: we do **not** carve out a post-trip exception for settling stragglers (Done/Skip on unresolved past-day items). Once a trip is over, unresolved items simply read as unresolved — the marginal cleanup value doesn't justify keeping a Trip-mode verb alive outside the window and re-opening the "is this editable?" question.

**3. Pre-trip is unchanged: Plan's prep dashboard.** It is already the purpose-built surface for the before-the-trip window (countdown, bookings, gaps, who's connected).

## Consequences

- **Frontend:** `ModeToggle` renders only when `deriveMode` is `trip` (i.e. inside the window); the override can no longer select `trip` outside it. `PlanHome` gains a **past-trip variant** (retrospective copy; prep-checklist suppressed) distinct from its pre-trip prep-dashboard. `DayView`/`PlanDay` present read-only outside the window; the ADR-0029 past-day visual is reused for the whole finished trip. No data-model change — mode and window remain derived.
- **Docs:** `product/modes.md`'s "mode switch" section is updated to describe the window-scoped, one-directional override and the past-trip archive.
- **Deferred (future direction, not v1):** a richer **retrospective** — "trip wrapped"-style stats, highlights, a map of everywhere you went, per-member views, photos — is a genuinely new feature surface and would earn its own `mockups/past-trip-v1.html`. v1 ships the calm archive with no new mockup; the ideas are recorded here so we don't design them out.
- **Out of scope:** multi-leg "gap" windows (ADR-0016 mentioned returning to Plan "between multi-leg gaps"). The model is a single contiguous `[startDate, endDate]` (structured multi-destination is deferred, ADR-0033 §5), so there is one window; per-leg gating is a future concern.

## Alternatives considered

- **Keep the override always available (status quo):** rejected — a Trip-mode board with no live data is an empty shell, and conjuring it outside the window contradicts ADR-0033's board scarcity and ADR-0029's day-scope logic.
- **Gate pre-trip only, allow post-trip Trip mode to settle stragglers:** rejected — asymmetric, keeps a Trip-mode verb alive post-trip, and re-opens editability of a finished trip; the read-only archive is simpler and the residual settling value is marginal once the trip is fully over.
- **Treat a past trip as an ordinary editable Plan-mode trip:** rejected — that is "editing history" with no visual signal, the exact hazard ADR-0029 guards against for individual past days.
- **Build the rich retrospective now:** deferred — it's a new feature surface beyond "read-only archive," and arguably post-v1; documented as future direction instead.

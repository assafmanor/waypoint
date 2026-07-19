# 0079 — A single `Modal` overlay primitive (`sheet` + `dialog` variants)

**Status:** Accepted (2026-07-19)
**Date:** 2026-07-19
**Relates to:** [0035](0035-in-app-back-and-return-gesture.md) (the overlay stack + return gesture this primitive registers into), [0028](0028-plan-violet-color-budget-dark-ready.md) (design language: neutral chrome, the semantic color budget, dark-mode readiness), F-08 (the `useDialogFocus` contract this primitive carries). Foundation for the Wave-2 consolidation of `ConfirmDialog`, `BookingSheet`'s `DeletePrompt`, `TripSettings`' inline `Confirm`, and `EventForm` (UI/UX review U-01, U-02).

## Context

The experience layer grew two-plus incompatible modal families before the shared substrate existed (UI/UX review §11, §10 "Modal / bottom sheet"):

- **`ui/Sheet.tsx`** — a bottom sheet that does it right: portals to `document.body`, registers via `useOverlay(onClose)` so system-back / the return gesture closes it first (ADR-0035 §4), and runs `useDialogFocus` for focus-in + Escape + focus-restore (F-08). No Tab-trap, deliberately, so a nested body-portalled prompt stays reachable.
- **The `.confirm-overlay/.confirm-card` family** — `ConfirmDialog`, `BookingSheet`'s `DeletePrompt`, and `TripSettings`' inline `Confirm`: three separate centered-dialog implementations, each re-solving overlay + focus + direction.
- **`EventForm`'s bespoke `.event-form-*` overlay** — the app's most-used editing surface, registered with **neither** the overlay stack **nor** the focus system (review **U-01**, the top user risk): the return gesture / system-back does not close it, and it has no focus-in, no Escape, no focus-restore, no trap. A keyboard or screen-reader user can Tab behind it; a touch user gets back behavior inconsistent with every other sheet, risking an orphaned or lost in-progress edit.

The root cause is structural, not cosmetic: **there is no one overlay primitive.** Every new sheet or dialog re-implements the scrim, the portal, the overlay-stack registration, and the focus contract — so a11y and RTL work is multiplied and drifts (review **U-02**). The Wave-0 non-color tokens (radius/elevation/spacing, ADR-0082) now exist, so a token-based primitive is finally buildable without hard-coding px.

## Decision

**Introduce one overlay primitive, `ui/primitives/Modal.tsx`, that owns the scrim, the body portal, the overlay-stack registration (`useOverlay`), and the focus contract (`useDialogFocus`).** It exposes two variants that share all of that machinery and differ only in shape and position:

- **`variant="sheet"`** — bottom-anchored, full-width, rounded top (phone-first, ADR-0017). The base for `Sheet` and, in Wave 2, the Trip-mode form sheets.
- **`variant="dialog"`** — centered, width-constrained, with a screen-edge gutter. The base for the confirm family in Wave 2.

Contract:

- Portals to `document.body` (escapes any `opacity < 1` / transformed ancestor stacking context).
- `role="dialog"`, `aria-modal="true"`; labelled by a rendered `title` via `aria-labelledby`, or by `ariaLabel` when there is no visible title (e.g. the grip-only account sheet), or by an external `labelledBy` id.
- Backdrop click closes; inner click does not (stops propagation).
- `useDialogFocus` moves focus to the card on open, closes on Escape, restores focus to the opener on unmount, and optionally traps Tab.

**Trap default is variant-driven and deliberately opposite per variant** (documented at the call site in `Modal.tsx`):

- `dialog` **traps** — a centered dialog is a focus dead-end by design (a confirm/alert owning its own buttons; nothing legitimately sits behind it), so Tab wraps inside it.
- `sheet` does **not** trap — some sheets open a nested, body-portalled prompt (e.g. the booking delete/unlink `alertdialog`) that a trap on the sheet card would lock out. This preserves the pre-primitive `Sheet` behavior exactly.

An explicit `trap` prop overrides the default either way.

**`ui/Sheet.tsx` becomes a thin wrapper over `Modal` with `variant="sheet"`,** keeping its exact public API (`{ title?, ariaLabel?, onClose, children }`) and behavior — so none of its ~14 consumers change. This proves the primitive and gives Wave 2 a ready base.

**Chrome is neutral** (design-language.md, ADR-0028): the scrim + card use `--card`/`--line`/`--elevation-floating` and never amber/teal/violet — unlike the legacy `.confirm-card`, which is deliberately amber for the hard-edit guard and will keep that treatment as a `dialog` tone when it folds on. CSS is co-located in `ui/primitives/modal.css`, built on Wave-0 tokens (`--radius-*`, `--elevation-floating`, `--space-*`, `--safe-bottom`) with logical properties only (RTL needs no `left`/`right`) and a safe-area-bottom pad on the sheet variant.

**Consumers are NOT folded on in this change** — that is Wave 2, which owns `ConfirmDialog.tsx`, `EventForm.tsx`, and `BookingSheet.tsx`. The legacy `.sheet-*`/`.confirm-*`/`.event-form-*` rules stay in `screens.css` until then.

## Consequences

- **The overlay/focus contract lives in one place.** New sheets and dialogs get back-to-close, Escape, focus-in/restore, and correct trapping for free — the a11y/RTL work is solved once, not per surface.
- **`EventForm`'s U-01 gap has a home to close into.** When Wave 2 renders it through `Modal`, the return gesture, Escape, backdrop, and focus all start working with no bespoke code.
- **No consumer churn now.** `Sheet` keeps its API; every current caller is untouched. The account sheet's grip-only (title-less) case still labels via `ariaLabel`.
- **The trap-default rationale is codified,** so Wave 2 doesn't have to rediscover why sheets must not trap while dialogs should: it is the nested-prompt reachability constraint the original `Sheet` comment recorded, generalized to the variant.
- **Duplication is time-boxed, not indefinite.** `.confirm-*` and `.event-form-*` remain only until their consumers migrate in Wave 2; those class families are deleted as each consumer folds onto the primitive, so there is no standing two-families situation once Wave 2 lands.
- **Minor visual convergence.** The sheet card moves off hard-coded 18px radius/padding onto the nearest Wave-0 tokens (`--radius-16`, `--space-4`); the accessible name and all close/focus behavior are identical. This is the intended token convergence (review U-08), not a redesign.

## Alternatives considered

- **Keep the two-plus families, fix `EventForm` in place.** Rejected: it closes U-01 for one surface but leaves the structural cause (no shared primitive) and keeps re-solving overlay + focus + direction per family — exactly the drift the review flags (U-02).
- **Adopt a headless dialog library (e.g. Radix/Ark).** Rejected for now: the app already has a bespoke, well-fitted overlay model (the ADR-0035 in-memory stack + return gesture and the F-08 focus hook) that a third-party library would not integrate with cleanly; a ~90-line primitive reuses both with zero new dependency, keeping the PWA bundle lean.
- **One variant only (either sheet-that-centers or dialog-that-docks).** Rejected: bottom sheets and centered confirms have genuinely different positioning, sizing, and — critically — trap semantics; collapsing them would force one wrong default. Two variants over one shared engine keeps both correct.
- **Fold consumers in the same change.** Rejected by the wave split: `ConfirmDialog`/`EventForm`/`BookingSheet` are owned by Wave 2. Defining the substrate first, with `Sheet` as the proof, lets Wave 2 migrate against a stable primitive.

## Wave 2 consolidation (2026-07-19, follow-through)

The Wave 2 editing track (U-01/U-02/U-05) folded the consumers onto this primitive; the canonical choices it settled, recorded here so later screens don't re-derive them:

- **`EventForm` now renders inside `Modal variant="sheet"`** — U-01 closed: system-back, Escape, backdrop, and focus-in/restore all work with no bespoke overlay. `.event-form-*` deleted.
- **One generic `ConfirmDialog({tone, title, body, confirmLabel, ...})`** on `Modal variant="dialog"`, tone ∈ `neutral|danger|hard`, replaces all three prior confirm impls (the hard-edit gate — public `ConfirmProvider`/`useConfirmHardEdit` API kept — the booking `DeletePrompt`, and TripSettings' inline `Confirm`). Tone colors only the confirm button + a subtle heading accent; card chrome stays neutral. It renders `role="dialog"` (announced via title-labelled focus), not `alertdialog`.
- **Canonical `FormActions` order:** primary (Save) first, then secondary (Cancel); destructive (Delete) on its own row below, de-emphasized (`--miss` text). Shared labels live in `t.common.{save,cancel,delete}` so wording never drifts between forms.
- **One `DateTimeField`** over `TimePicker`: `mode="datetime"` uses date + a single time input (not the `TimePicker` range) because span endpoints are independent instants that may cross days; the native `datetime-local` split is gone. `Field({label,error,htmlFor})` owns the error slot + `aria-describedby`. `useUnsavedGuard(dirty)` intercepts the overlay-close and prompts a `danger`-tone discard confirm.
- **Known limitation (in the shared `useDialogFocus`, deliberately off-limits this wave):** when a nested prompt (delete/discard) is open over a sheet, one Escape can fire both document-level key listeners and close both overlays at once. Backdrop-tap and button clicks (the primary paths) hit only the topmost overlay. Tracked in the backlog as a focus-stack refinement.

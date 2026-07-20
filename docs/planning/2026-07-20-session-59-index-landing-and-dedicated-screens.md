# Session 59 — Index redesign design pass: landing + dedicated screens (handoff)

**Purpose:** a forward execution brief for building ADR-0098 in a **separate session** — the design work (mockups, arrow-mirroring bug fix, motion pass, the navigation-mechanism research) happened here; the implementation does not. This note exists so that session doesn't have to re-derive anything below.

## Source of truth (read in this order)

1. [`decisions/0098-index-landing-and-dedicated-screens.md`](../decisions/0098-index-landing-and-dedicated-screens.md) — the decision, in full. Everything below is orientation on top of it, not a substitute for reading it.
2. [`backlog.md`](../backlog.md) → "Index redesign: landing + dedicated screens" — the task list.
3. `mockups/index-findability-split-v1.html` — the accepted interactive reference (demo toggle: טיול עמוס / טיול קטן). `mockups/index-findability-v1.html` is the superseded single-page direction, kept for rationale only.
4. `CLAUDE.md` (root) + `frontend/CLAUDE.md` — conventions and the component-layering map (`ui/primitives`/`ui/domain`/`ui/feedback`); read the latter before writing anything, this task lives entirely in `frontend/`.

## What happened this session (context, not decisions — the ADR is the record)

Assaf flagged the shipped Index gets hard to scan at scale (many bookings/documents) and asked to explore. Two directions were mocked up and compared: a single page with per-section shrink + chips/search/collapse, and a landing-with-tiles pushing dedicated screens. Along the way:

- A real bug was found and fixed in both mockups: Unicode arrow/chevron glyphs (`‹`, `→`, `▾`) silently mirror direction inside `dir="rtl"` (confirmed with a Playwright rendering test — an intended-left `‹` rendered pointing right). Fixed by using the real `NavArrow`/`Icon` SVGs everywhere instead — **this is a real, verified bug class worth being aware of anywhere else raw arrow glyphs might be hiding in HTML mockups**, not just this feature.
- A motion pass was added as the "wow" lever (animated collapse, staggered filter reveal, tap feedback) instead of touching color or content, since the semantic color budget and Home's board-hero are off-limits (ADR-0028).
- Assaf chose the landing/tiles direction, partly because he wants to add more content types (notes, research, media) later — **those are explicitly not decided or in scope**; the mockup's 3 placeholder tiles were a scale check only, not a spec. Don't build them.
- Researching how to wire "back to the landing" surfaced the one genuinely load-bearing implementation decision — see below.

## The navigation mechanism (read ADR-0098 §5 for the full reasoning — this is the summary)

**Do not** model the bookings/documents screens as new react-router routes (no `/trip/:id/index/bookings`), and **do not** add a new `resolveBack` precedence rule in `state/nav-state.tsx`. Both were considered and rejected in the ADR.

**Do this instead:** keep the bookings/documents screens as local view state inside `Index.tsx` (same shape as its existing `sheet`/`detail`/`manage` state), and call the existing `useOverlay(onClose)` hook (`state/nav-state.tsx`, already used by `Modal` and — indirectly — by `BookingDetail`/`BookingSheet`/`BookingManageSheet`) from a component that's **conditionally mounted only while a sub-view is open**. `resolveBack`'s rule 1 (`hasOverlay`) runs before rule 2 ("non-Home tab → Home"), so this makes one back/gesture/system-back close the sub-view back to the landing, and only a second back fall through to the normal tab rule — with zero changes to `nav-state.tsx` itself.

```tsx
// shape to follow, not literal code:
{view !== 'landing' && (
  <IndexSubView view={view} onClose={() => setView('landing')} ... />
)}
// inside IndexSubView's body:
useOverlay(onClose);
```

Also touches the Home quick-access deep-link handling already in `Index.tsx` (`?booking=<id>` / `?focus=docs`, ADR-0050) — adapt, don't drop: `?booking=<id>` should set the view to `'bookings'` and then open the detail sheet on top (unchanged); `?focus=docs` should set the view straight to `'documents'` (no more section to `scrollIntoView`).

## Reuse checklist (ADR-0096 — audit already done in ADR-0098, repeated here as a checklist)

- [ ] Booking/document rows: keep using `ListRow`/`RowManageSheet` — no change needed.
- [ ] Category filter chips: extend `ui/primitives/ChoiceGrid.tsx` (add a scrollable-pill layout option) rather than writing a new component — it's already the right `Choice<T>` single-select shape with the right neutral-selected-state color rule.
- [ ] Past-bookings collapse: **generalize out of `screens/PlanHome.tsx`'s `showCompleted`/`.chk-toggle` pattern** into one shared primitive both screens call — don't write Index's own second copy. Carry this session's animated open/shut motion into the shared primitive (Plan Home gains it as a side effect).
- [ ] "No results for this filter" empty state: use `ui/feedback`'s `EmptyState`, not a bespoke `<div>`.
- [ ] Landing tile: net-new, `ui/domain/`, presentational, two call sites (bookings/documents) — don't over-generalize for hypothetical future tiles.
- [ ] Every directional glyph: real `NavArrow`/`Icon` SVGs, never a Unicode arrow/chevron character (see the bug above).

## Setup (once per environment)

```bash
cp .env.example .env          # DEV_AUTH=1 for headless driving without Google
docker compose up -d          # Postgres + Redis
pnpm install                  # node_modules are NOT pre-installed
pnpm --filter @waypoint/backend prisma:generate
pnpm --filter @waypoint/backend prisma:migrate
```

## Definition of done

- `pnpm format`; `pnpm typecheck` + `pnpm build` green; new/affected unit tests pass (the extracted collapsible-summary primitive and any new `lib/` derivation should get their own test file, per convention).
- Drive the real Index tab (DEV_AUTH) if the stack stands up — this is a UI-behavior change, don't rely on typecheck/build alone. Verify: landing tiles → screens → back returns to landing (not Home); the Home quick-access deep-links still land correctly; `prefers-reduced-motion` actually suppresses the new transitions.
- Update ADR-0098 or this note if implementation reveals the navigation approach or reuse plan needs to change — don't silently drift from what's written.
- Prune the backlog.md entry this completes in the same change (ADR-0046 convention).
- One branch (create it before the first commit, never on local `main`), Conventional Commits, `pnpm format` again before opening a PR.

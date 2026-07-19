# UI/UX Review

**Status:** REVIEW (advisory) · **Date:** 2026-07-19 · **Reviewer role:** senior product designer / frontend UX architect
**Scope:** `frontend/` experience layer (screens, `ui/` components, `styles/tokens.css`, `App.css`, `screens.css`, `i18n/he.ts`), read against `docs/product`, `docs/design`, the ADR router, and the `mockups/`.
**Constraint honored:** no production code was modified. Only this document (and a bracketing `backlog.md` line) was added.
**Relationship to the existing reviews:** this complements — does not repeat — `frontend-architecture-review.md` (data/state/security) and `backend-architecture-review.md`. Where a UX symptom has an architectural root already logged there (e.g. F-03 failed-sync visibility), it is cross-referenced, not re-argued.

---

## 1. Executive summary

Waypoint's experience layer is **well above its stage** and unmistakably designed _for this product_, not assembled from a UI kit. The core experience bet — a single "one loud element" departure-board that answers _what now / what next_, everything else calm — is executed with real craft: the board's now/next/in-transit states, the derived day-at-a-glance rail, the hard/soft triple-coding, and the RTL discipline are genuinely good and should be protected.

The gaps are not visual taste; they are **systemic structure**. The screens were built ahead of the shared UI substrate the design docs promised, so several patterns are solved once per screen instead of once: modals exist in two incompatible families (and the most-used form, `EventForm`, is outside both the back-gesture and focus systems), empty/loading/error/sync feedback is bespoke per screen, and the spacing/type ramps that `design-language.md` mandates live only in prose — `tokens.css` has no spacing or type tokens, so 6.5k lines of CSS hard-code them. None of this is a rewrite; it is a **foundations-first consolidation** that most screens then shed code into.

| Dimension                  | Health               | One-line read                                                                                                              |
| -------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **UX health**              | **Good**             | The now/next model is right and largely realized; friction is at the edges (forms, feedback, map gap).                     |
| **Visual-design health**   | **Strong**           | Coherent, restrained, on-brand; the color budget is respected in the components sampled.                                   |
| **Product clarity**        | **Strong**           | Hard/soft, Plan/Trip, now/next are legible; the missing pillar (Map/location) is the clarity risk.                         |
| **Mobile usability**       | **Good, phone-only** | Excellent at ~390px; there are **no width breakpoints** — tablet/desktop get a centered 430px column.                      |
| **Accessibility maturity** | **Mid**              | Real progress (`useDialogFocus`, live-region status, non-color coding) but `EventForm` and zoom (ADR-0062) are open holes. |
| **Design-system maturity** | **Emerging**         | Great token _philosophy_ and a lexicon; thin token _implementation_ and few shared components.                             |

**Top three user risks**

1. **Losing an in-progress edit / not trusting a save.** `EventForm` is a bespoke modal outside the overlay stack and focus system (§7 U-01); save-state confidence is a transient toast + a global badge, with no per-row "queued/failed" marker (§7 U-04, cross-ref F-03). "Did my booking save?" is answerable only for a few seconds.
2. **The location pillar is absent on the ground.** Map is a dead placeholder holding 1 of 4 primary nav slots, and navigate-to-next is deferred — so _"where do we go / when do we leave"_ (a stated core question and two personas' main job) has no live answer (§7 U-06).
3. **Inconsistent editing grammar.** Two form systems, two date/time input paradigms, differing Save/Cancel order and labels, no unsaved-changes guard (§7 U-02, U-05) — small individually, compounding into "the app behaves differently each place I edit."

**Top three structural implementation risks**

1. **No shared feedback/layout primitives** → every new screen re-implements empty/loading/error/sync and its own header/modal, so inconsistency grows with the product (§11, §12).
2. **Token ramp is doc-only** → spacing and type are hard-coded px across `screens.css`; dark mode (already token-wired for color) can't ship until these follow (§9, U-08).
3. **Screens are large and own layout + domain rendering inline** (`PlanDay` 1115 lines, `DayView` ~800, `screens.css` 4730) → domain components (Board, EventCard, BookingRow, DayStrip, MaybeCard) aren't extracted, so the same markup is duplicated and drifts (§12, U-03).

**Main strengths (preserve):** the derived, fixture-free board; hard/soft grammar; RTL-at-the-data-level; offline-first reads with an honest offline badge; toast+undo; the `NavArrow`/`Icon` system with a CI lint guard; two-channel mode identity; teaching empty states.

**Readiness for broader production use:** **the experience is close but not there.** The now/next core is trip-ready. Before widening the audience, the foundations in Phase 1 (§14) — one modal primitive with `EventForm` folded in, a durable sync-status surface, shared feedback states, and the spacing/type tokens — should land, because they are the difference between "polished for one built trip" and "stays coherent as screens and users grow" (the posture ADR-0065 now commits to).

---

## 2. Scope and methodology

**Documentation reviewed:** `CLAUDE.md`, `README.md`, `docs/INDEX.md`; product `vision.md`, `prd-v1.md`, `personas.md`; `design/design-language.md`; the ADR router and targeted ADRs referenced inline (0011, 0016, 0017, 0024–0029, 0033, 0035, 0040–0050, 0054, 0059–0065); both prior reviews in `docs/reviews/`. Mockups were treated as design intent, **not** as authority over shipped behavior (per the review brief and CLAUDE.md's "docs win on conflict").

**Screens reviewed (by reading source):** `Login`, `ZeroState`, `CreateTrip` (+ `Created`), `JoinTrip`, `AllTrips` (sampled), `Home`, `DayView`, `Index`, `PlanHome`, `PlanDay` (sampled), `TripSettings` (sampled). **Components:** `Sheet`, `ConfirmDialog`, `Toast`, `Spinner`, `BookingSheet` (+ `DeletePrompt`, `KindToggle`), `EventForm`, `DocumentsSection`, plus targeted reads of `TimePicker`, `IconPicker`, `NavArrow`, `Icon`, `TransitionRow`, `RouteLabel`. **Foundations:** `styles/tokens.css`, and structural `grep` sweeps of `App.css` (1834 lines) + `screens.css` (4730 lines).

**Flows traced:** first-open → auth → zero-state; create trip → invite beat; join (anon + authed + already-member + removed/expired); trip select/switch; Home now/next (incl. in-transit, group-split, empty day); day itinerary (verbs, settle, ripple, concurrency, archive); booking create/edit/delete; document view/manage; Plan-home readiness; offline/pending/failed surfaces (read).

**Viewports / languages / runtime:** reasoning is from source, CSS, and the design docs — **the app was not executed in a browser**, so RTL rendering, gesture behavior, touch-target sizes, `datetime-local` chrome, and contrast were **read, not measured**. Findings depending on runtime observation are marked _design judgment_ or _validate_. Offline behavior was traced through code (consistent with the frontend review's method). No accessibility tooling was run.

**Coverage is a sample, not exhaustive.** `PlanDay`, `TripSettings`, and `AllTrips` were sampled structurally rather than read line-by-line; the Map surface is unbuilt. Treat the absence of a finding in an unread region as "not reviewed," not "clean."

---

## 3. Current experience model

**Information architecture.** One authenticated app with a thin shell. Outside a trip: `/login`, `/trips` (all-trips), `/new`, `/join/:token`, `/trip/:id/settings`, and zero-state. Inside a trip: a single **four-tab shell** (🏠 Home · 🗺️ Map · 📇 Index · 📅 Day-by-day) whose active tab lives in the URL (`?tab=`), Home-anchored so platform-back peels tabs (ADR-0035). Sheets/dialogs register into an in-memory overlay stack that back consults first.

**The dominant UX model is _the current moment_, layered on _the trip_.** Trip mode's Home is the departure board (now/next/countdown/day-progress); Day-by-day is the interactive timeline; Index is the offline reference. Plan mode re-emphasizes the same tabs (prep dashboard / itinerary builder) rather than adding screens (ADR-0016). Mode is auto-derived by date with a session override, signaled on two+ channels (chrome hue + `ModePill` + drafting grid).

```
Trip context (header: name▾ · avatars · gear · day-strip · sync badges)
├─ 🏠 Home     Trip → Board(now/next) + quick-access + day-at-a-glance
│              Plan → prep hero + readiness checklist + stats
├─ 🗺️ Map      (unbuilt — Placeholder "coming soon", both modes)
├─ 📇 Index    Bookings (upcoming/past) + Documents  (mode-agnostic)
└─ 📅 Day      Trip → timeline: verbs, settle, ripple, concurrency, archive
               Plan → itinerary builder: rows, gaps, shelf, reorder
```

**Viewing vs. planning.** Not separate apps — the same four tabs, re-emphasized by mode. Trip mode = follow + adjust (Tier-1 quick verbs, guarded hard edits); Plan mode = build (full forms, reorder, gap-fill). Structural edits on a past day are gated to Plan (ADR-0029). This is a clean model, well realized.

**Fixed vs. flexible.** The product's spine (ADR-0011). Triple-coded: hard = solid + `🔒 קשיח` + mono code chip + edit guard; soft = dashed/hatched + lighter + free verbs. Consistent on the board, the day card, the glance rail, the Index row.

**Offline / sync model.** Offline-first reads (snapshot → Dexie), optimistic writes via an outbox, device-wide flush on reconnect, LWW + one-slot undo (frontend review §4). Surfaced as a header badge stack (offline / N pending / N failed) in a polite live region, plus per-action toasts.

**Design language.** "One loud element" (the board is the only dark, glowing surface, rationed to one per screen); a strict semantic color budget (amber = time/commitment, teal = location, `--plan` violet = plan mode, neutral `--cta` for generic buttons); a documented type/spacing/radius/motion ramp; `Secular One`/`Assistant`/`JetBrains Mono` with mono reserved for Latin/numeric runs.

---

## 4. Experience principles (Waypoint-specific)

Recommendations in this review are held against these. They are derived from the product docs, not invented:

1. **The next 30 minutes beats completeness.** When space is scarce, surface the imminent + actionable (time, place, code, leave-by) over the exhaustive. The board already lives this; the rest of the app should too.
2. **Fixed and flexible must be distinguishable without reading.** Preserve the triple-coding everywhere a commitment appears; never let a soft plan borrow hard grammar.
3. **A save is not done until it's durable — and the user must be able to tell.** Optimistic is fine; _invisible_ optimistic is not. Save/sync state must be legible per item, not only as a global count that clears on a timer.
4. **Offline is a first-class state, not an error.** Say what's cached, what's stale, and what can't be done now — in place, calmly.
5. **One editing grammar.** The same modal behavior, action order, labels, date/time controls, and unsaved-changes handling every place the user edits.
6. **RTL is authored, not mirrored.** Keep the data-level discipline (dir=ltr islands, mirrored directional icons, logical properties); extend it to every new control.
7. **Reachability holds as content grows.** Primary actions stay in thumb reach on a long day / long trip / long form; the layout adapts by breakpoint where the docs promise it (Plan on tablet).
8. **Shared before special.** A pattern that appears on two+ screens belongs to a primitive/component/token, not a per-screen copy. New inconsistency is a foundations gap, not a styling task.

---

## 5. User-journey assessment

Each entry: goal · entry · steps · strengths · friction · errors/offline · a11y · recommended · implementation.

### J1 — First open → auth

- **Goal:** understand the product, sign in. **Entry:** `/login` (or any deep link → intent saved → login).
- **Strengths:** the landing is genuinely good — dark board teaser (marketing exception, correctly the one board surface), a concise Hebrew value line, a three-feature strip, one Google CTA. Offline disables the CTA with a clear note.
- **Friction:** the teaser is `aria-hidden` static fixture data (fine). Google is stated as text only (no logo) — deliberate and clean.
- **Errors/offline:** offline → CTA disabled + "צריך חיבור לרשת כדי להתחבר". Good. A failed OAuth round-trip has no explicit surface (returns to `/login`); low risk.
- **a11y:** single CTA, semantic `<h1>`. **Recommended:** keep. **Implementation:** none. **Preserve.**

### J2 — Zero-state (authed, no trips)

- **Goal:** create or join a first trip. **Strengths:** the "board off / אין שידור" dormant board is a strong concept — it teaches the payoff before any data exists — with two equal create/join actions and a teach line (ADR-0024 §2). Offline disables both with a note.
- **Friction:** the `board-off` is a bespoke component (one of ~6 empty/dormant treatments, §9). Fine in isolation; a systemic duplication.
- **Recommended:** keep the concept; back it with the shared EmptyState family (§11). **Implementation:** cosmetic; fold into the empty-state primitive later.

### J3 — Create trip

- **Goal:** a trip in three inputs. **Strengths:** exemplary progressive disclosure (ADR-0032): destination → dates → auto-suggested name+flag → live soft-grammar draft preview → a distinct post-create **invite beat** (`Created`) that puts the link in front of the creator immediately. Date validation is inline and specific ("תאריך הסיום לפני ההתחלה" / "התאריך כבר עבר").
- **Friction:** the CTA only renders when `canCreate` — a first-timer sees no button until all fields are valid, with no hint of what's missing (the draft preview partly compensates). Consider a disabled CTA with a reason, so the affordance is always visible (principle 1: tell the user the next step). **Timezone** is silently the device tz (documented deferral, ADR open Q5).
- **Offline:** create is disabled with a note that a friend's link still opens — good honesty.
- **Recommended:** always-present CTA (disabled + reason). **Implementation:** screen-specific; adopt the shared form action-bar (§11) so the disabled+reason pattern is uniform.

### J4 — Join

- **Goal:** join from a link. **Strengths:** the boarding-pass ticket (perforation, countdown, anonymous 🙂 avatars from a members-count-only public preview) is delightful and safe (no member names leak). One explicit tap (anon → "Continue with Google" saves intent → resumes here as "Join"). Already-member → straight in; removed → "הוסרת מהטיול…"; expired/invalid/offline each have distinct copy.
- **Friction:** none material. The countdown/length use dual/plural Hebrew correctly.
- **a11y:** avatars `aria-hidden`. **Recommended:** keep. **Preserve** — this is a model flow.

### J5 — Select / switch trip

- **Goal:** pick or change the active trip. **Entry:** header trip-name **▾** → `/trips`. **Strengths:** sectioned list (now/soon/past), a prominent (glowless, per the board-scarcity rule) live-trip hero, offline note. Discoverable.
- **Friction:** switching a trip unmounts into a **full-screen** `snapshot.loading` `<h1>` (state/trip-state.tsx) — a layout-jump flash rather than a skeleton that preserves chrome (§16). On weak connectivity abroad this is a blank-ish beat.
- **Recommended:** a skeleton that keeps the header + tab frame while the snapshot loads. **Implementation:** shared LoadingState/Skeleton primitive (§11); depends on the app-shell layout primitive so chrome can render before content.

### J6 — Open during an active trip → "what now / what next"

- **Goal:** zero-tap answer. **Strengths:** the board delivers — live pill, clock, now-title with hard/soft label, next-row with countdown + code chip + lock, day-progress with a now-knob. In-transit (flight in air) reframes to a teal "where you are" hero with a plane-progress bar and from→to route ends. Group-split and "ועוד N עכשיו" handle concurrency. Empty day is a calm teach card, not a 0/0. This is the product's best screen. **Preserve.**
- **Friction:** no **leave-by / travel-time** (needs location; deferred with the map — U-06). The glance rail is information-dense (markers, lanes, composite counts, +1); _design judgment_: validate it stays readable on a genuinely busy day (the brief's warning about impressive-but-unreadable timelines).
- **Recommended:** keep; add leave-by when maps land; pressure-test the rail with real dense data. **Implementation:** none now; leave-by is a domain+API dependency (place data on events).

### J7 — Navigate to a specific day

- **Goal:** jump to day N. **Entry:** the header day-strip (horizontal pills). **Strengths:** today keeps an amber anchor wherever you browse; past/future selection is neutral/violet; a day-scope ribbon + "חזרה להיום" when off-today (ADR-0043). Good "where's now" answerability.
- **Friction:** the strip is the **only** day nav and is a horizontal scroll of narrow pills; on a 3-week trip, finding a specific day means scrubbing, and touch-target width needs verification (principle 7, _validate_). The selected day is **not in the URL** (frontend review open Q4), so reload/share always lands on today.
- **Recommended:** keep the strip; consider day in the URL for deep-linking; verify pill hit-area ≥44px. **Implementation:** URL-state change (small) + a DayStrip component that owns sizing (§12).

### J8 — Create / edit a booking

- **Goal:** add a flight/hotel/etc. with its code. **Strengths:** one merged create/edit `Sheet` (ADR-0047/0048); type cards; icon-picker with derived category + a revert affordance; transport identity = route inputs (not a name); hotel room/WiFi; per-type span vs. single-date scheduling; a thoughtful delete-both-vs-unlink prompt for linked events. Rich and correct.
- **Friction:** uses native `datetime-local` for spans but the custom `TimePicker` for single-day times — two paradigms in one form family (U-05). Save/Cancel order + labels differ from `EventForm` (U-02). Backdrop-tap closes with no unsaved-changes guard on a long form (U-05).
- **Offline:** optimistic + queued; but a later hard-fail is a global badge, not a per-booking marker (U-04 / F-03).
- **Recommended:** unify date/time controls + action-bar + guard. **Implementation:** §11 form-system + date/time field component.

### J9 — Add / schedule a flexible plan (maybe shelf)

- **Goal:** drop an idea onto a day. **Strengths:** tap a shelf card → a small time-prefilled `ScheduleSheet` → done (Tier-1, ADR-0025). Scheduled ideas leave the shelf; skipped soft events park back onto it (ADR-0027). Clean, low-ceremony.
- **Friction:** the shelf card's third line renders `maybeMeta(id)` — a **fixture** that returns real text only for seeded demo ids and `''` for every real UUID item (U-07). So for real data the meta slot is dead. `MaybeItem` has no real meta field to show there.
- **Recommended:** remove the fixture meta or replace with a real derived field (e.g. source/added-by/day-count). **Implementation:** drop the `fixtures` import from `DayView`/`PlanDay` (ties to F-05); a MaybeCard component owns the slot's real content.

### J10 — Reorder / retime plans

- **Goal:** change order/timing. **Strengths (Plan):** drag a soft row's grip (or ▲/▼ a11y fallback) to reassign soft slots; hard events pinned; atomic + undoable (ADR-0011/0027). **Trip:** ±30 nudge adapts to phase (no pulling into the past), delay ripples soft followers with an amber suggestion bar. Genuinely travel-shaped verbs.
- **Friction:** none major. The reorder grip is drag-first; the ▲/▼ fallback is the a11y path — verify it's reachable/visible (_validate_).
- **Recommended:** keep. **Preserve** the verb model.

### J11 — Find a place / address

- **Goal:** "where do we go / what's near." **Reality:** **not available** — Map is a placeholder; navigate-to-next is deferred (U-06). The "ניווט" verb on event cards deep-links out (good), but discovery/near-me/leave-by are absent.
- **Recommended:** treat Map as the highest-value _next build_, not a v1.1 nicety, given it's a stated pillar and a full nav slot. **Implementation:** new surface; out of this review's remediation scope but flagged as the #1 IA gap.

### J12 — Open a travel document

- **Goal:** get a passport/insurance PDF, offline. **Strengths:** grouped by type, encrypted badge, mobile-first open/download, HEIC fallback, per-row ⋯ manage, optimistic "uploading" rows from the outbox, a shared `Spinner`. Offline read via Cache API. Solid (ADR-0052/0056/0058).
- **Friction:** viewer inline-render/MIME safety is a **backend** concern (backend review B-03) — from a UX angle, "open in tab" for an untrusted upload is the risk; the recommended download-not-open should be honored in the viewer.
- **Recommended:** align the viewer with B-03 (attachment/download). **Implementation:** small viewer change gated on the backend header fix.

### J13 — Act while offline

- **Strengths:** reads work; writes queue with an honest "queued" toast; header shows offline + pending. **Friction:** failed-sync is a **global** dismissable badge (F-03 fix), not attached to the entity that failed; there's no retry/dead-letter affordance (U-04). **Recommended:** per-item sync state + a review surface (§11 sync pattern). **Implementation:** state-model + a `SyncStatus` component.

### J14 — Return after a peer changed the trip

- **Strengths:** WS fan-out updates lists live; reconnect runs catch-up; idle-resume resets to Home+today (ADR-0060). **Friction:** there is **no change-feed / "Noam moved ramen to 20:00"** in the UI (a PRD 4.2 item) — peer changes appear silently by mutation, so a returning user can't see _what_ changed, only the new state. This is the collaboration model's most visible gap (U-09). **Recommended:** a lightweight, dismissable change-feed. **Implementation:** state (recent-changes buffer, likely from the WS `change` stream) + a feed component; a domain/state addition, not visual-only.

### J15 — Loading failure / invalid-empty data

- **Strengths:** snapshot error → a titled full-screen state; join invalid/expired → distinct copy; empty index/docs/day each teach. **Friction:** the snapshot error is a dead-end `<h1>` with no retry button (state/trip-state.tsx) (U-10). Empty/loading/error are each bespoke (§9). **Recommended:** shared ErrorState with a retry action. **Implementation:** §11 feedback family.

---

## 6. Screen-by-screen review

Systemic issues are stated once in §7 and referenced by ID here rather than repeated.

### Home (Trip mode) — `screens/Home.tsx`

- **Purpose / primary question:** "what now, what next, how much free time?" **Hierarchy:** board (loud) → quick-access → glance. Correct.
- **Actions:** tap next-code/WiFi/documents tiles (deep-link into Index); copy WiFi; dismiss stay-strip; jump to day builder from the empty glance.
- **Strengths:** derived + fixture-free (ADR-0045); in-transit/group-split/empty states designed; deep-links carry `?booking=`/`?focus=docs`. **Best-in-app.**
- **Problems:** no leave-by (U-06); glance density (_judgment_). **Edge states:** thoroughly handled. **Mobile/RTL:** dir=ltr on all numeric/code runs; logical insets on rail markers. **a11y:** progress `aria-hidden` (the numbers are the content — acceptable); the also-now expander uses `aria-expanded`. **Recommendation:** preserve; validate rail with dense data; add leave-by with maps.

### Day-by-day (Trip mode) — `screens/DayView.tsx`

- **Primary question:** "what today, what's next, can this move, are we there yet?" **Strengths:** now-line + scroll-to-now; phase-derived receding; inline settle ("היינו שם?"); hard-edit guard + conflict flags; ripple bar; concurrency forest; archive chrome. Deep, correct, travel-shaped.
- **Problems:** a very large component (~800 lines) owning many inline sub-components (U-03); `maybeMeta` fixture on shelf cards (U-07); `EventForm` opened here is the unmanaged modal (U-01). **Mobile:** the expanded verb strip is horizontally busy — verify no overflow/`44px` on the `−/+` stepper (_validate_). **RTL:** the `+1` next-day marker, mono time ranges, and route labels are dir-handled. **Recommendation:** extract EventCard/MaybeCard; fold EventForm into the modal primitive.

### Index — `screens/Index.tsx`

- **Primary question:** "what are our bookings + codes, and are they scheduled?" **Strengths:** upcoming/past split; category-tinted badge + lock; code chip in mono/ltr; link cue vs. "לא משובצת"; row body → read-only detail, ⋯ → manage (mirrors documents); offline badge; deep-link consumption. Clean and offline-first.
- **Problems:** the ⋯ kebab is a raw glyph (acceptable — not an arrow/caret, so outside the lint rule) but is styled per-use; the row/detail/manage triad is bespoke and repeated for documents — a candidate for a shared `ListRow` + `RowManageSheet` (U-03). **Empty:** teaches (mentions Gmail import — a not-yet-built pipe; wording is aspirational but honest). **RTL:** `RouteLabel` mirrors correctly. **Recommendation:** extract a shared list-row/manage pattern shared with DocumentsSection.

### PlanHome — `screens/PlanHome.tsx`

- **Primary question:** "how ready are we; what's missing?" **Strengths:** violet prep hero (countdown + readiness bar, never amber — mode discipline held); real-derived checklist whose CTAs _do the thing_ (seeded create form / day builder / invite / upload); completed checks collapse to pills; a calm past-trip retrospective. Strong (ADR-0061).
- **Problems:** the checklist row, stat tile, and prep hero are bespoke layouts (shared with nothing); `formatDateRange` is a local util (dates are formatted ad-hoc in several screens — a candidate for a shared date-format lib). **RTL:** `%` and counts are dir=ltr. **Recommendation:** keep; extract stat-tile + checklist-row if Plan grows.

### Booking / Event forms — `ui/BookingSheet.tsx`, `ui/EventForm.tsx`

- See U-01, U-02, U-05. **Strengths:** rich, type-aware, good validation copy. **Problems:** the two forms are the clearest example of divergent editing grammar. **Recommendation:** §11 form-system.

### Trip settings — `screens/TripSettings.tsx`

- **Primary question:** "who's here, what can I change?" **Strengths:** real-role gating (`isAdmin` from `me`+membership; server-enforced per ADR-0039); details form, member action sheet (promote/remove), invite with rotate, removed-members allow-back, leave/delete danger zone; mode-neutral chrome; confirms via the shared `Confirm` (with `useOverlay`+focus). Coherent.
- **Problems:** its own inline `Confirm` component (a third confirmation implementation alongside `ConfirmDialog` and `DeletePrompt`) (U-02). Sampled, not fully read. **Recommendation:** route all confirms through one `ConfirmDialog`.

### Map — `App.tsx Placeholder`

- **Dead placeholder** in a primary nav slot (U-06). Biggest IA gap vs. the product model.

---

## 7. Findings

IDs `U-xx` (distinct from the frontend review's `F-xx` and backend `B-xx`). Ordered by severity. Mandatory fields — **Implementation layer**, **Reusable approach**, **Components/tokens/patterns**, **Dependencies** — are filled for every finding.

### High

---

**U-01 — `EventForm` is a bespoke modal outside the overlay stack and focus system**

- **Severity:** High · **Confidence:** High · **Category:** interaction / accessibility / data-loss
- **Affected flows:** J8-adjacent (event create/edit), J10. **Screens:** DayView, PlanDay (both open `EventForm`). **Files:** `ui/EventForm.tsx` (renders `<div className="confirm-overlay event-form-overlay">`, no `useOverlay`, no `useDialogFocus`); contrast `ui/Sheet.tsx` (both), `ui/ConfirmDialog.tsx` (both).
- **Current experience:** the app's most-used editing surface does **not** register as an overlay, so the return gesture / system-back does not close it via the overlay stack — back peels the tab (or, from Home, arms leave-trip) with the form still mounted; and it has no focus-in, no focus-trap, no Escape, no focus-restore. F-08 added `useDialogFocus` to `Sheet`/`ConfirmDialog`/`DocumentViewer`/settings-confirm but **not** here.
- **Why it matters:** violates principles 5 (one grammar) and re-opens the "accidentally leave an unfinished form" risk the brief calls out. Keyboard/SR users can tab behind it and can't Escape it; touch users get inconsistent back behavior versus every other sheet.
- **Realistic scenario:** mid-editing a hard flight in Plan mode, a user swipes back to check a date — the tab peels instead of closing the form, or the form is left orphaned; a screen-reader user tabs into the timeline behind the "modal."
- **Recommended experience:** `EventForm` behaves exactly like every other sheet — back/Escape/backdrop close it (through the same overlay path), focus moves in and restores out.
- **Implementation layer:** **Shared UI component** (consolidation). **Reusable approach:** make `EventForm` own only fields+submit and render its container via the single `Sheet`/`Modal` primitive (which already carries `useOverlay` + `useDialogFocus`); delete `.event-form-overlay/.event-form-card`. **Components/tokens/patterns:** `Sheet` (primitive), `useOverlay`, `useDialogFocus`, form action-bar. **Dependencies:** none (both hooks exist); do alongside U-02.
- **Design scope:** Small · **Impl scope:** Small–Medium · **Priority:** Immediate · **Validation:** jsdom test (focus-in/trap/Escape/restore) + a back-gesture test that closes the form; manual RTL keyboard pass.

---

**U-04 — Save/sync confidence is transient and global, never per-item**

- **Severity:** High · **Confidence:** High · **Category:** trust / offline / feedback
- **Affected flows:** J8, J13, J14. **Screens:** all editing surfaces; header badges (`App.tsx`). **Files:** `App.tsx` Header (`offline`/`pending`/`syncFailed` badge stack), `ui/Toast.tsx`, `lib/outbox.ts` (cross-ref frontend review **F-03**).
- **Current experience:** a write shows an optimistic result + a ~short toast; global state is a header count ("N שינויים מחכים…") and, on hard-fail, a dismissable "N שינויים לא נשמרו" badge. There is **no marker on the row/booking/event** that _this_ item is queued, failed, or rejected. Once the toast fades and the count clears, the UI reads as fully saved.
- **Why it matters:** principle 3. For a shared trip abroad, "did my restaurant booking actually save / did my delay reach the group?" is unanswerable per item; a permanently-rejected write silently vanishes at the next resync (the F-03 mechanism), with only a global badge as a clue.
- **Realistic scenario:** offline, a peer adds a booking; back online the server rejects it; the booking disappears at resync — the badge said "1 failed" but nothing tied it to the booking, so no one knows which change was lost or how to redo it.
- **Recommended experience:** one **sync-status model** per shared entity — `synced | pending | failed(reason)` — surfaced (a) as a small per-row affordance and (b) as a global summary that opens a **review/retry list** (dead-letter), not a timed dismiss.
- **Implementation layer:** **Shared interaction pattern + state/domain change.** **Reusable approach:** derive per-entity status from the outbox (id-keyed) and expose a `useSyncStatus(entityId)` hook + a `<SyncBadge>` component used by BookingRow/EventCard/DocumentRow; replace the timed failed-badge with a persistent summary → review sheet. **Components/tokens/patterns:** `SyncBadge`, `SyncStatusModel`, status tokens (`--ok`/`--miss` + a "pending" neutral). **Dependencies:** builds on F-03's failed-sync store; needs the outbox to expose per-entity lookup. **Design scope:** Medium · **Impl scope:** Medium · **Priority:** Immediate–Near · **Validation:** offline→reject→assert the row shows failed + is retryable; SR announces via live region.

### Medium

---

**U-02 — Two+ modal families and divergent Save/Cancel grammar**

- **Severity:** Medium · **Confidence:** High · **Category:** consistency / maintainability
- **Screens/files:** `ui/Sheet.tsx` (portal + overlay + focus) vs. the `.confirm-overlay/.confirm-card` family used by `ui/ConfirmDialog.tsx`, `ui/BookingSheet.tsx` `DeletePrompt`, and `screens/TripSettings.tsx` `Confirm` (three confirmation implementations); `ui/EventForm.tsx` (a fourth overlay). Action order/labels differ: `EventForm` = Cancel(left)/Save(right), labels "ביטול"/"שמירה"; `BookingSheet` = `.bs-save` then `.bs-cancel` then a separate `.bs-delete`, labels "בטל"/"שמור".
- **Current experience / why it matters:** the same conceptual action ("confirm"/"save"/"cancel") is coded and placed differently per surface — principle 5. It also multiplies a11y/RTL work (each must re-solve focus + direction).
- **Recommended:** one `Modal/Sheet` primitive (§11) + one `ConfirmDialog` (variant-driven) + one form **action-bar** with canonical label + order + destructive placement.
- **Implementation layer:** **Shared components.** **Reusable approach:** collapse the confirm variants into `ConfirmDialog({tone, title, body, confirmLabel})`; a `<FormActions primary secondary destructive>` bar. **Components/tokens/patterns:** `Modal`, `ConfirmDialog`, `FormActions`, canonical `t.common` labels. **Dependencies:** U-01 (EventForm folds in here). **Design scope:** Small · **Impl scope:** Medium · **Priority:** Near · **Validation:** visual audit that every dialog uses the primitive; label/order snapshot.

---

**U-03 — No shared list-row / card / domain components; screens own layout inline**

- **Severity:** Medium · **Confidence:** High · **Category:** maintainability / consistency
- **Files:** `screens/PlanDay.tsx` (1115), `screens/DayView.tsx` (~800), `screens.css` (4730). Repeated markup: `.li` list rows in `Index` (booking) and `DocumentsSection` (document) with near-identical open-body + `.right` + `⋯`; `MaybeCard` duplicated in DayView and PlanDay; the Board, EventCard, DayStrip, stat-tile all inline.
- **Why it matters:** principle 8. Each duplicate drifts (already visible: two MaybeCard copies, two confirm families). New screens copy the nearest markup, compounding CSS.
- **Recommended:** extract domain components (`Board`, `EventCard`, `BookingRow`/`ListRow`, `RowManageSheet`, `MaybeCard`, `DayStrip`, `StatTile`) that compose generic primitives; screens orchestrate data, not layout.
- **Implementation layer:** **Domain UI components (+ layout primitives).** **Reusable approach:** bottom-up — introduce `ListRow` + `RowManageSheet` first (Index+Documents share immediately), then `MaybeCard`, then split Board/EventCard out of the big screens. **Components/tokens/patterns:** the lexicon in design-language.md (`Board`, `VerbRow`, `MaybeShelf`, `DayStrip`, `GlanceCard`) — names already exist; make them real modules. **Dependencies:** none blocking; easier after the token work (U-08) so extracted components read tokens. **Design scope:** Small · **Impl scope:** Large (incremental) · **Priority:** Near–Phase 3 · **Validation:** LOC drop in screens + one source per pattern.

---

**U-05 — Divergent date/time inputs + no unsaved-changes guard**

- **Severity:** Medium · **Confidence:** High · **Category:** forms / mobile / consistency
- **Files:** `ui/BookingSheet.tsx` (native `datetime-local` for spans, `type="date"` + custom `TimePicker` for single-day), `ui/EventForm.tsx` (`type="date"` + `TimePicker`), `ui/TimePicker.tsx`. Backdrop `onClick={onClose}` on both forms discards immediately.
- **Why it matters:** native `datetime-local` renders browser-/locale-dependent chrome (RTL + Hebrew field order varies, _validate_) sitting beside the bespoke `TimePicker` — two mental models in one form family; and a long BookingSheet is one stray backdrop tap from total loss (principle 5).
- **Recommended:** one date/time field component (wrap or replace `datetime-local` so spans and single-day share the picker); a shared unsaved-changes guard on dirty forms (confirm before discard, routed through the same overlay-close path).
- **Implementation layer:** **Form-system + shared interaction pattern.** **Reusable approach:** a `<DateTimeField mode="date|time|datetime">` on top of `TimePicker`; a `useUnsavedGuard(dirty)` that intercepts the overlay-close. **Components/tokens/patterns:** `DateTimeField`, `TimePicker`, `useUnsavedGuard`, `useOverlay`. **Dependencies:** U-01/U-02 (same modal). **Design scope:** Medium · **Impl scope:** Medium · **Priority:** Near · **Validation:** device RTL check of the picker; dirty-close prompts.

---

**U-06 — Map pillar unbuilt yet holds a primary nav slot; no location/leave-by anywhere**

- **Severity:** Medium · **Confidence:** High · **Category:** information architecture / product
- **Files:** `App.tsx` `Placeholder` (map → "coming soon", both modes); `lib/home-quick` (navigate-to-next deferred, ADR-0045); event "ניווט" deep-links out but that's the only location touch.
- **Why it matters:** Map is vision pillar 3 and the job of two personas (navigator, go-with-the-flow), and _"where do we go / when do we leave"_ are stated core questions. A quarter of the bottom nav dead-ends, and the on-the-ground "next 30 minutes" answer is missing its spatial half.
- **Recommended:** prioritize Map as the next surface build (not a v1.1 nicety); until then, consider whether the dead tab should show an honest "coming soon with what's planned" rather than a bare placeholder, and whether 3 tabs read better than 4-with-a-stub (_design judgment_).
- **Implementation layer:** **Product / IA (new surface).** **Reusable approach:** out of remediation scope; when built, it must obey "integrations are pipes" (feeds now/next + index, ADR-0004) and the teal=location budget. **Components/tokens/patterns:** future `Map` surface, teal location affordances. **Dependencies:** place data on events (domain/API), Google Maps/Places. **Design/Impl scope:** Large · **Priority:** Product decision (flag) · **Validation:** usability test of "get us to the next thing."

---

**U-08 — Spacing and type ramps are documented but not tokenized; CSS hard-codes them**

- **Severity:** Medium · **Confidence:** High · **Category:** design-system / maintainability
- **Files:** `styles/tokens.css` (color + motion + font-family tokens only — **no** `--space-*` / `--text-*`); `design-language.md` (defines the 4px spacing grid, `{8,12,16,20,24}` padding set, and the 8-step type ramp) vs. raw px throughout `App.css`/`screens.css` (6.5k lines). Dark-mode "remaining work" already lists sweeping hardcoded hexes.
- **Why it matters:** the "pick from the ramp, don't invent values" discipline is unenforceable when the ramp isn't in CSS — spacing/type drift silently, and dark mode (color already token-wired) can't ship until the non-color values follow.
- **Recommended:** add `--space-1..6` and `--text-display..micro` (+ line-height) tokens; migrate components to them as they're touched; add a lint/CI budget discouraging raw px in component CSS.
- **Implementation layer:** **Design tokens (foundation).** **Reusable approach:** define tokens first; migrate opportunistically with U-03 extractions so new components are born token-based. **Components/tokens/patterns:** `--space-*`, `--text-*`, `--leading-*`. **Dependencies:** none; **enables** dark mode + consistent extraction. **Design scope:** Small · **Impl scope:** Medium (incremental) · **Priority:** Phase 1 · **Validation:** token coverage; a dark-mode smoke once swept.

---

**U-09 — No group change-feed; peer edits appear silently**

- **Severity:** Medium · **Confidence:** Medium · **Category:** collaboration / trust
- **Files:** WS fan-out in `trip-state` mutates lists directly; no feed component. PRD 4.2 + vision explicitly call for "Noam moved ramen to 20:00."
- **Why it matters:** the product promises _visible_ collaboration; today a returning user sees a changed state with no _what changed / by whom_. Combined with U-04, shared-state changes are under-narrated.
- **Recommended:** a lightweight, dismissable change-feed (recent shared mutations, attributed), surfaced unobtrusively (e.g. a Home strip or a header affordance), consistent with "one loud element" (quiet, not a second board).
- **Implementation layer:** **State/domain + shared component.** **Reusable approach:** a bounded recent-changes buffer fed by the WS `change` stream (attribution needs the real actor — ties to F-05); a `<ChangeFeed>` reading it. **Components/tokens/patterns:** `ChangeFeed`, attribution from `me`/members. **Dependencies:** correct authorship (F-05); WS stream. **Design scope:** Medium · **Impl scope:** Medium · **Priority:** Phase 2 · **Validation:** two-client test that a peer edit appears in the feed with the right name.

---

**U-10 — Loading/error/empty are bespoke per screen; no retry on the snapshot error; full-screen load flash**

- **Severity:** Medium · **Confidence:** High · **Category:** feedback / edge-states / perceived performance
- **Files:** `state/trip-state.tsx` (full-screen `snapshot.loading` `<h1>` and a retry-less `snapshot.errorTitle`); ~6 empty treatments (`board-off`, `glance-day.empty`, `empty-card` (+`.doc`), `past-build-hint`, index/plan empties); text-only loading, **no skeletons** anywhere (grep: none).
- **Why it matters:** trip-switch/cold-load replaces the whole shell with centered text (layout jump on weak networks — principle 4/16); an unrecoverable error dead-ends with no retry; every empty is re-styled, so they subtly diverge.
- **Recommended:** a small **feedback family** — `EmptyState`, `Skeleton`/`LoadingState` (chrome-preserving), `ErrorState` (with retry), reused everywhere; keep the _content_ (icon/copy/CTA) per screen, share the _shell_.
- **Implementation layer:** **Shared feedback components (+ layout primitive for chrome-preserving load).** **Reusable approach:** `EmptyState({icon,title,body,action})`, `ErrorState({title,onRetry})`, `Skeleton` variants; the app-shell primitive lets loading render inside the header/tab frame. **Components/tokens/patterns:** the three components + status tokens. **Dependencies:** app-shell layout primitive (§11). **Design scope:** Small–Medium · **Impl scope:** Medium · **Priority:** Phase 1 · **Validation:** trip-switch keeps chrome; forced snapshot error offers retry.

### Low / Informational

---

**U-07 — Fixture data (`maybeMeta`) renders on live maybe-shelf cards** · Low · `screens/DayView.tsx:788`, `screens/PlanDay.tsx:504/1067` render `maybeMeta(id)` (from `fixtures.ts`), which returns real text only for seeded demo ids and `''` for real UUID items — a dead card slot for real data. Also `TRIP_TZ_OFFSET` (fixture `+09:00`) is still imported for noon-anchored weekday labels (low temporal risk, but keeps `fixtures` on the production graph — ties to frontend review F-05). **Implementation layer:** state/domain cleanup + component. **Reusable approach:** remove the fixture import; if a meta line is wanted, back it with a real `MaybeItem`-derived field owned by a `MaybeCard` component. **Dependencies:** F-05. **Priority:** Near (do with F-05).

**U-11 — `⚙` gear header control is a raw emoji, not the `Icon` set** · Low/Informational · `App.tsx` Header (`⚙`). Design-language says UI controls use the `Icon`/`NavArrow` SVG set (emoji are content); the gear is the lone emoji-as-control (it does have an `aria-label`, so it's an a11y-labelled inconsistency, not a barrier). **Implementation layer:** shared component. **Reusable approach:** add a `settings` glyph to `Icon`. **Dependencies:** none. **Priority:** Quick win.

**U-12 — `Spinner` aria-label bypasses i18n** · Informational · `ui/Spinner.tsx` hardcodes `'טוען'` rather than `t.shell.booting`/a `t.common` key — a stray string outside the locale file (conventions.md keeps copy in `i18n`). **Implementation layer:** screen-specific. **Reusable approach:** default to a `t` key. **Priority:** Quick win.

**U-13 — Create-trip CTA is hidden until valid** · Low/Informational · `screens/CreateTrip.tsx` renders the button only when `canCreate`; a disabled-with-reason CTA is friendlier (principle 1). _Design judgment._ **Priority:** Quick win, but adopt the shared FormActions disabled+reason pattern (U-02) rather than a one-off.

**U-14 — Glance rail density / day-strip reachability on long trips** · Informational · _design judgment_, validate with real data and a 3-week trip. Tie any fix to the `GlanceCard`/`DayStrip` components (U-03), not per-screen CSS.

---

## 8. Positive findings (preserve, with evidence)

- **The derived, fixture-free board** (`Home.tsx` + `lib/glance`/`hero-booking`/`time`) — now/next/in-transit/group-split/empty all designed, real-data-only (ADR-0045). The product's thesis, realized.
- **Hard/soft triple-coding** everywhere (board label, day card tag + border, Index lock, confirm gate) — the ADR-0011 spine held consistently.
- **RTL authored at the data level** — `dir="ltr"` islands for times/codes/emails, `NavArrow` mirrored by direction, logical `insetInlineStart`, Hebrew never in mono, `RouteLabel` mirroring. Better than most RTL apps.
- **Offline-first reads with an honest badge** (`useIsOffline` ∨ `usingCachedSnapshot`) and server-only actions disabled-with-note (create/join). Principle 4, mostly lived.
- **Toast + undo** (`ui/Toast.tsx`) as the single lightweight-confirm/undo channel (ADR-0019) — a good, low-noise pattern.
- **The `NavArrow`/`Icon` SVG system with a CI lint rule** banning raw arrow/caret glyphs — a rare, enforced consistency guard.
- **Two-channel mode identity** (chrome hue + `ModePill` + drafting grid) — mode readable before content; the color budget (amber/teal/violet) is respected in every component sampled.
- **Teaching empty states** ("היום עוד פתוח", zero-state board-off, index/docs empties) — never dead-ends (except the snapshot error, U-10).
- **`useDialogFocus` + polite live-region status** (F-08/F-10) — real a11y foundations already shared across `Sheet`/`ConfirmDialog`/`DocumentViewer`; U-01 is about finishing the job on `EventForm`.
- **One shared `Spinner`** on every async surface (ADR-0052) — the right instinct; extend it into the full feedback family (U-10).
- **The create → invite beat and the join ticket** (J3/J4) — genuinely delightful, safe onboarding.

---

## 9. Design-system assessment

| Area                  | Consistent?                         | Tokenize?                               | Shared component?                         | Screen-specific? | Deprecate/consolidate                                               |
| --------------------- | ----------------------------------- | --------------------------------------- | ----------------------------------------- | ---------------- | ------------------------------------------------------------------- |
| **Colors**            | Yes — strict budget, honored        | Already tokens (`tokens.css`)           | —                                         | —                | Sweep remaining hardcoded hexes (dark-mode prereq)                  |
| **Typography**        | Ramp documented, **not** in CSS     | **Add `--text-*`/`--leading-*`** (U-08) | Heading/Text helpers optional             | —                | Raw font-size px                                                    |
| **Spacing**           | 4px grid documented, **not** in CSS | **Add `--space-*`** (U-08)              | `Stack`/`Inline` primitives               | —                | Raw margin/padding px                                               |
| **Layout**            | Phone-only; **no breakpoints**      | Add breakpoint tokens                   | App-shell, Screen, Section, Sticky-action | —                | The blanket `max-width:430px` (make responsive)                     |
| **Elevation**         | 3 levels documented                 | `--shadow` exists; add raised/floating  | —                                         | —                | Ad-hoc shadows                                                      |
| **Borders/radii**     | Ramp documented                     | Add `--radius-*`                        | —                                         | —                | Raw radius px                                                       |
| **Icons**             | Strong (`Icon`/`NavArrow` + lint)   | —                                       | Extend `Icon` (gear U-11)                 | Emoji-as-content | Emoji-as-control (`⚙`)                                             |
| **Buttons**           | Mostly (semantic budget)            | Use `--cta`/status tokens               | `Button` variants                         | —                | Per-screen button classes (`.bs-save`, `.create-btn`, `.plan-btn`…) |
| **Inputs**            | Divergent date/time (U-05)          | —                                       | `DateTimeField`, `Field`                  | —                | `datetime-local` vs `TimePicker` split                              |
| **Cards / list rows** | Divergent (U-03)                    | —                                       | `ListRow`, `Card`, domain cards           | Content only     | Duplicated `.li`/`MaybeCard`                                        |
| **Dialogs / sheets**  | **Two+ families** (U-02)            | —                                       | One `Modal`/`Sheet` + one `ConfirmDialog` | —                | `.event-form-*`, 3 confirm impls                                    |
| **Toasts / banners**  | Toast good; badges ad-hoc           | Status tokens                           | Keep `Toast`; add `StatusBanner`          | —                | Stacked `.offline-badge`                                            |
| **Loading**           | Text/spinner, **no skeletons**      | —                                       | `Skeleton`/`LoadingState`                 | —                | Full-screen load `<h1>`                                             |
| **Empty**             | ~6 bespoke                          | —                                       | `EmptyState`                              | Content only     | `board-off`, `empty-card`, etc. → one shell                         |
| **Error**             | Bespoke, no retry                   | —                                       | `ErrorState`                              | —                | Snapshot dead-end                                                   |
| **Offline/sync**      | Global badges + toasts              | Status tokens                           | `SyncBadge` + review sheet (U-04)         | —                | Timed failed-badge                                                  |

---

## 10. UX pattern inventory

| Pattern              | Current implementations                                                     | Inconsistencies                  | Recommended canonical behavior                                                         | Shared component/primitive      | Migration scope |
| -------------------- | --------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------- | --------------- |
| Screen header        | `header`, `new-head`, `zero-head`, `born-head`, `land-top`, `join-top`      | Each bespoke                     | One `ScreenHeader` (title/back/actions slots); the in-trip shell header stays distinct | `ScreenHeader`, app-shell       | Medium          |
| Primary action       | `.create-btn`/`.plan-btn`/`.bs-save`/`.form-save`/`.addbtn`/`.join-cta-btn` | Labels + classes vary            | One `Button variant="primary"` (neutral `--cta`)                                       | `Button`                        | Medium          |
| Secondary action     | `.bs-cancel`/`.confirm-cancel`/`.later-btn`                                 | Order + labels vary              | `Button variant="ghost"`; canonical order                                              | `Button`, `FormActions`         | Small           |
| Destructive action   | `.bs-delete`/`.row-action.danger`/`.confirm-ok bs-danger-ok`                | Placement varies                 | `Button tone="danger"`; always confirmed                                               | `Button`, `ConfirmDialog`       | Small           |
| Bottom action bar    | inline per form                                                             | None shared                      | `FormActions` (primary/secondary/destructive) sticky on mobile                         | `FormActions`, sticky primitive | Medium          |
| Form field           | `.bs-field`/`.form-field`/`.field`                                          | 3 field shells                   | One `Field({label,error,children})`                                                    | `Field`                         | Medium          |
| Validation error     | `.bs-error`/`.field-error`/`.form-error`/`.form-conflict`                   | 4 shapes                         | `Field` owns error slot + `aria-describedby`                                           | `Field`                         | Small           |
| Empty state          | `board-off`/`empty-card`/`glance-day.empty`/`past-build-hint`               | ~6 shells                        | `EmptyState` shell, per-screen content                                                 | `EmptyState`                    | Medium          |
| Error state          | snapshot `<h1>`, join copy                                                  | No retry                         | `ErrorState({onRetry})`                                                                | `ErrorState`                    | Small           |
| Loading state        | `BootScreen`/`snapshot.loading`/`Spinner`                                   | No skeletons                     | `Skeleton` preserving chrome                                                           | `Skeleton`/`LoadingState`       | Medium          |
| Offline state        | `.offline-badge` + disabled controls                                        | Badge-only                       | `StatusBanner` + disabled-with-note pattern                                            | `StatusBanner`                  | Small           |
| Saving state         | optimistic + toast                                                          | Per-item invisible               | `SyncBadge` per entity (U-04)                                                          | `SyncBadge`                     | Medium          |
| Sync failure         | global timed badge (F-03)                                                   | Not per-item, no retry           | Persistent summary → review/retry sheet                                                | `SyncStatus` + review sheet     | Medium          |
| Confirmation         | `ConfirmDialog` + `DeletePrompt` + settings `Confirm`                       | 3 impls                          | One `ConfirmDialog` (tone/variants)                                                    | `ConfirmDialog`                 | Small           |
| Booking card/row     | `Index` `.li bk`                                                            | Shares shape with docs, not code | `ListRow` + `BookingRow` domain wrapper                                                | `ListRow`, `BookingRow`         | Medium          |
| Flexible-plan card   | `MaybeCard` ×2 (DayView, PlanDay)                                           | Duplicated                       | One `MaybeCard`                                                                        | `MaybeCard`                     | Small           |
| Day navigation       | header `day-strip`                                                          | Single, not in URL               | `DayStrip` component; consider URL day                                                 | `DayStrip`                      | Small–Medium    |
| Trip switcher        | header name▾ → `/trips`                                                     | Consistent                       | Keep; extract `TripSwitcherButton`                                                     | (light)                         | Small           |
| Modal / bottom sheet | `Sheet` vs `.event-form-*` vs `.confirm-*`                                  | Two+ families                    | One `Modal`/`Sheet` primitive                                                          | `Modal`/`Sheet`                 | Medium          |

---

## 11. Maintainable remediation architecture

The through-line: **build the substrate the design docs already describe, then let screens shed code into it.** Nothing here is a rewrite; it is extraction + tokenization + consolidation, staged so the app stays usable throughout.

### Design foundations (tokens)

- **Add non-color tokens** (U-08): `--space-1..6` (4px grid → the `{8,12,16,20,24}` set), `--text-display..micro` + `--leading-*`, `--radius-8/12/16/22/999`, `--elevation-flat/raised/floating`. Color + motion tokens already exist and are good.
- **Breakpoint tokens + safe-area:** define `--bp-tablet`/`--bp-desktop` and adopt `env(safe-area-inset-*)` in the app-shell/sticky primitives (phone PWA). Today there are **zero** width breakpoints.
- **Status tokens:** formalize `pending`/`synced`/`failed` mappings (reuse `--ok`/`--miss` + a neutral) for `SyncBadge`/`StatusBanner`.
- **Focus states:** keep the teal-on-light / amber-on-dark focus rings; ensure every new primitive inherits them.

### Layout primitives

- `AppShell` (header + scrollable body frame + bottom-nav + safe-area) — lets loading/error render **inside** chrome (fixes the full-screen flash, U-10).
- `Screen` container, `Section` (owns the `sec-title` pattern), `Stack`/`Inline` (token-spaced), `StickyActionBar` (mobile primary actions), `ResponsiveGrid` (unblocks tablet Plan). These retire the blanket `max-width:430px` in favor of breakpoint-aware max-widths.

### Shared components (responsibility · states · variants · must-not-own · a11y · RTL · replaces)

- **`Modal`/`Sheet`** — portal + overlay-stack + focus. States: open/closing. Variants: bottom-sheet, centered-dialog. Must not own: form logic. a11y: `role=dialog`, focus-in/trap-optional/restore, Escape. RTL: logical insets. **Replaces:** `.event-form-*` (U-01) and unifies with `Sheet`.
- **`ConfirmDialog`** — tone (`neutral|danger|hard`), title/body/confirm-label. **Replaces:** `DeletePrompt`, settings `Confirm` (U-02).
- **`FormActions` / `Field` / `DateTimeField`** — canonical action order/labels; one field shell with error+`aria-describedby`; one date/time control over `TimePicker`. **Replaces:** `.bs-*`/`.form-*`/`.field*` variants + the `datetime-local` split (U-02, U-05).
- **`ListRow` + `RowManageSheet`** — the open-body + `.right` + `⋯`→manage pattern. **Replaces:** the duplicated Index/Documents rows (U-03).
- **Domain cards:** `Board`, `EventCard`/`VerbRow`, `BookingRow`, `MaybeCard`, `DayStrip`, `GlanceCard`, `StatTile` — the design-language lexicon made real. **Replaces:** inline markup in the big screens.
- **Feedback:** `EmptyState`, `ErrorState`, `Skeleton`/`LoadingState`, `StatusBanner`, `SyncBadge`. **Replaces:** the ~6 empty shells, the retry-less error, text-only loading, and the timed failed-badge (U-10, U-04).
- **`Icon` extension:** add `settings` (U-11).

### Shared interaction patterns (canonical behavior)

- **Saving/optimistic/pending/failed/retry:** one `SyncStatusModel` per entity, surfaced by `SyncBadge` + a review sheet; toasts stay for lightweight confirms, not as the only failure channel (U-04).
- **Delete/undo:** destructive → `ConfirmDialog`; reversible → toast-undo (already the pattern) — keep the split.
- **Navigation with unsaved changes:** `useUnsavedGuard(dirty)` intercepts overlay-close/back consistently (U-05, U-01).
- **Loading / empty / permission failures / destructive confirmation:** each has exactly one component; screens pass content, not structure.

### State & domain requirements (not solvable with visual-only changes)

- **Per-entity sync status** (U-04) — needs the outbox to expose id-keyed lookup + a rollback-on-reject reconcile (builds on F-03).
- **Change-feed** (U-09) — a bounded recent-changes buffer off the WS `change` stream, with **correct authorship** (depends on F-05 threading `me` into writes).
- **Selected day in URL** (U-06/J7, frontend review Q4) — a route-state change for deep-linkable days.
- **Place data on events** — prerequisite for leave-by and the Map surface (U-06); domain + API.

### Screen composition (the target discipline)

Screens **orchestrate data and compose** `AppShell → Section → domain cards/feedback`. They should not: hold >~300 lines of layout, duplicate list/card markup, re-declare foundations in CSS, or embed sync/empty/error logic inline. Domain components may depend on generic UI + tokens but **not** on trip state directly (pass props); generic UI must not import domain types.

### Migration strategy

1. **Foundations before polish:** tokens (U-08) + `AppShell`/`Modal`/feedback family first — every later change reads them.
2. **High-risk flows first:** fold `EventForm` into `Modal` (U-01) and ship `SyncBadge` (U-04) early — they carry the top user risks.
3. **Consolidate opportunistically:** when a screen is touched, extract its row/card into the shared component and delete the local copy (no indefinite parallel patterns).
4. **Guard against new drift:** a CI lint budget on raw px in component CSS + a "new dialog must use `Modal`" review checklist.
5. **Keep it usable:** each step is independently shippable; no big-bang.

---

## 12. Recommended target structure

Ownership + dependency direction (tokens ← generic UI ← domain UI ← screens; nothing points back):

```
frontend/src/
  styles/tokens.css        foundations: color · motion · SPACING · TYPE · radius · elevation · breakpoints
  ui/
    layout/                AppShell · Screen · Section · Stack · Inline · StickyActionBar · ResponsiveGrid
    primitives/            Button · Field · FormActions · DateTimeField · Modal/Sheet · ConfirmDialog · Icon · NavArrow · Spinner
    feedback/              EmptyState · ErrorState · Skeleton/LoadingState · StatusBanner · Toast · SyncBadge
    domain/                Board · EventCard(VerbRow) · BookingRow · MaybeCard · DayStrip · GlanceCard · StatTile · ChangeFeed · ListRow/RowManageSheet
  screens/                 compose layout + domain + feedback; own data orchestration only
  state/ lib/              unchanged (already well-factored per the frontend review)
```

Rules: tokens depend on nothing; generic UI never imports trip-domain types or state; domain UI may use generic UI + tokens and take data via props; screens compose and orchestrate; screen CSS never redefines foundations. This **fits the existing architecture** (the frontend review praised `lib`/`state` separation) — it adds the missing _view_ layer discipline, not a new framework.

---

## 13. Recommendation dependency map

| Recommendation                                    | Depends on           | Enables                        | Shared / screen | Design owner | Impl area       | Migration order |
| ------------------------------------------------- | -------------------- | ------------------------------ | --------------- | ------------ | --------------- | --------------- |
| U-08 tokens (space/type/radius/elev/bp)           | —                    | dark mode, all extractions     | Shared          | DS           | tokens          | **1**           |
| `AppShell` + layout primitives                    | U-08                 | chrome-preserving load, tablet | Shared          | DS+FE        | ui/layout       | **1**           |
| `Modal`/`Sheet` unify + U-01                      | AppShell             | consistent editing, a11y       | Shared          | FE           | ui/primitives   | **1**           |
| Feedback family + U-10                            | AppShell             | consistent states, retry       | Shared          | DS+FE        | ui/feedback     | **1**           |
| `SyncBadge` + U-04                                | F-03 (done)          | trust, offline clarity         | Shared+state    | FE           | feedback+outbox | **1–2**         |
| `ConfirmDialog` consolidation (U-02)              | Modal                | one confirm grammar            | Shared          | FE           | ui/primitives   | **2**           |
| `Field`/`FormActions`/`DateTimeField` (U-02/U-05) | Modal                | one form grammar               | Shared          | DS+FE        | ui/primitives   | **2**           |
| `ListRow`/domain cards (U-03)                     | U-08, primitives     | smaller screens, no dup        | Shared          | FE           | ui/domain       | **2–3**         |
| U-07 fixture removal                              | F-05                 | clean shelf meta               | Screen+state    | FE           | screens+state   | **2**           |
| ChangeFeed (U-09)                                 | F-05, WS stream      | visible collaboration          | Shared+state    | PM+FE        | domain+state    | **3**           |
| Day-in-URL (J7)                                   | —                    | deep-linkable days             | Screen+URL      | FE           | routing         | **3**           |
| Map surface (U-06)                                | place data, Maps API | location pillar, leave-by      | New surface     | PM+DS+FE     | new             | **Product**     |

---

## 14. Prioritized remediation roadmap

Organized by dependency, **not** by screen — foundations before dependent screen changes.

### Phase 1 — Foundations & critical usability

- **User outcome:** editing behaves the same everywhere and can't be lost; saves are legible; loads don't flash; the app is ready to grow without compounding inconsistency.
- **Design work:** define space/type/radius/elevation/breakpoint tokens; spec `Modal`, the feedback family, and `SyncBadge` states.
- **Engineering:** U-08 tokens; `AppShell`+layout primitives; unify `Modal`/`Sheet` and **fold `EventForm` in (U-01)**; feedback family + snapshot retry + chrome-preserving load (U-10); `SyncBadge` + per-entity status (U-04).
- **Dependencies:** none external (F-03/F-08 already shipped). **Risks:** touching the modal/overlay path — mitigate with the existing `nav-state` tests + new jsdom focus tests. **Validation:** jsdom (focus/back/close), offline→reject→per-row failed, trip-switch keeps chrome. **Exit:** one modal primitive in use; every empty/error/loading via the family; every editable entity shows sync state.

### Phase 2 — Core journey improvements

- **User outcome:** consistent forms and lists; peer changes become visible.
- **Design:** canonical form action-bar/field/date-time; `ConfirmDialog` variants; `ListRow`; ChangeFeed placement.
- **Engineering:** U-02 confirm+form consolidation; U-05 date/time+unsaved-guard; `ListRow`+`BookingRow` (Index+Documents share); U-07 fixture removal (with F-05); ChangeFeed (U-09).
- **Dependencies:** Phase 1 primitives; F-05 for authorship. **Risks:** form regressions — snapshot the two forms first. **Validation:** device RTL picker check; two-client change-feed test. **Exit:** one form grammar; Index/Documents share a row; a peer edit is narrated.

### Phase 3 — Component consolidation

- **User outcome:** invisible to users; the codebase stops drifting.
- **Design:** finalize the domain-component set (Board, EventCard, MaybeCard, DayStrip, GlanceCard, StatTile).
- **Engineering:** extract domain cards out of `DayView`/`PlanDay`/`Home`; delete duplicate markup and superseded CSS (`.event-form-*`, extra confirm/empty shells); day-in-URL.
- **Dependencies:** Phases 1–2. **Risks:** large surface — do screen-by-screen behind the components. **Validation:** LOC drop; one source per pattern; visual regression per screen. **Exit:** screens compose; no duplicated cards; `screens.css` materially smaller.

### Phase 4 — Polish & optimization

- **User outcome:** refinement; dark mode becomes shippable.
- **Work:** sweep remaining hardcoded hexes → tokens and ship dark mode (U-08 unblocked); glance-rail dense-data tuning (U-14); U-11/U-12/U-13 quick wins; motion polish; self-host fonts (F-11) for offline first-paint.
- **Dependencies:** Phase 1 tokens. **Validation:** dark-mode contrast pass; long-content/RTL sweep. **Exit:** dark mode on; token coverage complete.

_Note: the **Map surface (U-06)** is a product-track build, sequenced separately by product; it is the single largest experience gap but out of this remediation's foundational scope._

---

## 15. Quick wins (low risk, no throwaway code)

- **U-11** add a `settings` glyph to `Icon`, replace the `⚙` emoji control.
- **U-12** point `Spinner`'s default aria-label at a `t` key.
- **U-13** show the create-trip CTA disabled-with-reason (adopt via `FormActions` once it exists, not a one-off).
- **Delete the dead `glance: GLANCE`/`activeUserId` from `TripContext`** and drop the `fixtures` import from `DayView`/`PlanDay` (U-07 / F-05) — removes fixture wiring, no user-visible change for real data.
- **Add a CI lint budget** on raw px in `ui/` component CSS — cheap guard that makes U-08 stick.
- **Route `TripSettings`'s inline `Confirm` through `ConfirmDialog`** once the variant exists — removes the third confirm impl.

Each is either a true one-liner or a step _toward_ the target system (never a patch the target would rip out).

## 16. Validation plan

- **Usability (moderated, mobile):** the 12 core journeys at ~390px, one-handed — especially J6 (zero-tap now/next), J8 (booking entry <30s per PRD 6), J13/J14 (offline edit + peer change). Metric: task success + "did you believe it saved?"
- **RTL:** Hebrew device pass on forms, `datetime-local` chrome, day-strip, route labels, mixed Latin/Hebrew lines; confirm no mono-Hebrew fallback.
- **Accessibility:** VoiceOver/TalkBack on every modal (focus-in/trap/Escape/restore — incl. the new `EventForm`), live-region announcements for offline/pending/**failed** (U-04), contrast (amber-on-board, muted meta), touch-target audit (`−/+` stepper, day-pill, kebab ≥44px).
- **Offline / slow-network:** airplane + throttled 3G — cold trip-switch (skeleton not flash), edit→queue→reconnect, forced 4xx→per-row failed + retry (U-04), snapshot error→retry (U-10).
- **Long-content / edge data:** 3-week trip (day-strip), a genuinely busy day (glance rail + concurrency, U-14), empty/invalid/deleted-trip/expired-invite.
- **Multi-user:** two clients — peer edit appears (change-feed U-09), removed-member behavior, LWW race + undo.
- **Regression:** keep the 360-test unit suite; add the jsdom component tests the frontend review already recommends (they double as the validation harness for U-01/U-04/U-10); add a Playwright smoke crossing all tabs (also a backlog item).
- **Per-recommendation success signal:** U-01 → 0 orphaned forms / focus escapes; U-04 → users correctly report save state in testing; U-10 → no full-screen flash on switch; U-08 → dark-mode contrast passes.

## 17. Open questions and assumptions

Routed to their owner; **not** logged as confirmed defects.

1. **Product / IA:** is Map still a v1 pillar, and should it be prioritized as the next surface, or does the 4th nav slot get repurposed until it lands (U-06)? This is the single biggest model-vs-build gap.
2. **Product:** is a group change-feed (PRD 4.2) in scope for the near term (U-09), or is silent live-mutation acceptable for now?
3. **Design:** does the glance rail stay readable on a genuinely dense day, or does it need a "busy day" collapse rule (U-14)? Needs real-data testing to answer.
4. **Design / FE:** target for tablet Plan mode — real two-column builder (design-language promises it) or graceful centered column for now? Sets how far the layout primitives go in Phase 1 (U-08/§11).
5. **FE / state:** should the selected day live in the URL (deep-linkable, refresh-surviving) vs. the current Home-anchored in-memory model (frontend review Q4)?
6. **Product / a11y:** ADR-0062 disables zoom app-wide; under ADR-0065's many-user framing, is WCAG 1.4.4 revisit in scope (frontend review F-09)?
7. **FE:** is a per-entity sync-status model (U-04) the agreed direction, or is a global failed-list sufficient? (The frontend review's Q2 asks the same at the data layer.)

_Assumptions used:_ mockups are design intent, not authority (docs win); the frontend/backend reviews' shipped fixes (F-01–F-08/F-10) are in place; ADR-0065's grow-later, many-user posture is the lens (so consistency-at-scale and the F-01/F-04-class robustness matter more, not less).

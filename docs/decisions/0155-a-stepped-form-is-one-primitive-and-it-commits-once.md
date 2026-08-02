# 0155 — A stepped form is **one primitive**, it never animates height, and it commits **once**

**Status:** Accepted (owner sign-off 2026-08-02). **Built 2026-08-02**, in two parts — the extraction, then `BookingSheet`. **§5 was reversed by the owner the same day**: the form IS stepped. See §5's amendment and the second build log.
**Date:** 2026-08-02
**Design reference:** [`mockups/form-steps-v1.html`](../../mockups/form-steps-v1.html) — carries the scan of every form surface, the 80vh fold drawn at 390px, and the head-to-head. [`mockups/booking-round-trip-v1.html`](../../mockups/booking-round-trip-v1.html) §6 draws the same comparison on the one form that is a candidate.

**Extracts** the step mechanic that already exists **twice, unowned**: `ResolveSheet` and `RowManageSheet`'s `הזז` position step, both in `screens/PlanDay.tsx`.
**Applies unchanged** [0079](0079-single-modal-primitive.md) (a step is content inside a sheet, never a new overlay layer), [0103](0103-back-navigation-typed-layer-model.md) (the in-overlay step back is a back layer, registered in the Modal's **parent**, `remainsActive: true`), [0150](0150-a-form-refuses-at-the-field.md) (§3's gate rule is what keeps it honest), [0140](0140-motion-foundations-overlays-arrive-taps-answer-routes-have-a-direction.md) (a step borrows the shell's route direction rather than inventing a motion), [0078](0078-feedback-state-family.md) (`FormActions` is the footer).
**Constrained by** [0152](0152-a-note-is-one-entity-with-an-optional-host.md) §6 (the height-cap rule, and the composer that grows) and §6b (the note written on the way, behind its host in a FIFO outbox).
**Relates** [0098](0098-index-landing-and-dedicated-screens.md) (`Collapsible`, the cheaper answer to length), [0136](0136-an-event-can-also-be-booked.md) ("requires nothing"), [0032](0032-minimal-trip-creation.md), [0148](0148-the-place-form-has-the-room-it-needs.md).

## Context

The question arrived from a build, not a wish: [0154](0154-transport-authoring-a-route-shape-a-round-trip-and-a-derived-pair.md) §4 makes `BookingSheet` about 1565px, and a bottom sheet is capped at `max-height: 80vh` — roughly **675px visible** on a 390×844 phone. The whole return leg falls below the fold. So: should a long form become a stepped form with `הבא`/`הקודם`, and which existing forms would profit?

**Reading the tree answered the first half unexpectedly. The mechanic already exists twice, and neither instance is a long form.** `ResolveSheet` (pick which soft event moves → pick where) and the `הזז` step (0138 §8) each hand-roll their own step state, and each carries the **same** `useBackLayer(…, { remainsActive: true })` block with a near-identical comment explaining the parent-registration trick — a rule that is in `frontend/CLAUDE.md` precisely because it had to be got right twice. That is the rule-8 pile, and those two are the primitive's justification.

**And the scan answered the second half.** Nine form surfaces, `<Field>` and control counts read from source: `BookingSheet` 9/28, `EventForm` 5/18, `DocumentUploadSheet` 4/10, `NoteSheet` 4/5, `DocumentManageSheet` 2/3, `MaybeManageSheet` (notes only), `MapPlaceForm` 1/5, `CreateTrip` 3 groups, and `TripSettings`/`UserSettings` which save per field on blur and have no save to split. **Exactly one is long enough to be a candidate, and only after 0154 lands.** So the proposal would create the app's first form that needs paging — an argument for looking again at the proposal, not only for adding a stepper.

## Decision

### 1. Two kinds of step, and only one of them is obvious

- **Branching** — step 2's content **depends** on step 1's answer. You cannot draw the slots until you know which event moves. Both shipped surfaces are this, and for them a stepper is unarguable.
- **Chunking** — independent fields split across pages. A booking's code does not depend on its date; nothing dictates an order, so the pages are a presentation choice.

Chunking costs three things this app has paid to avoid: [0150](0150-a-form-refuses-at-the-field.md)'s "report every problem in one call" (paging **manufactures** the second save loop that ADR exists to end), [0136](0136-an-event-can-also-be-booked.md)'s "requires nothing" posture (a step is a mandatory tap), and the ability to review a hard commitment before signing it.

### 2. `ui/primitives/FormSteps`, extracted from the two that exist

One primitive owns step state, the back layer, the footer labels and the transition. `ResolveSheet` and the `הזז` step migrate onto it and their copies are deleted. It rides existing infrastructure rather than adding beside it: **`FormActions`** is the footer (the primary is `הבא` until the last step, where it is `שמירה`; the secondary is `הקודם` after the first, where it is `ביטול`) — not a second action row; **`Modal`** is still the surface (0079); **`useFormErrors`** is still the refusal (0150); **`--nav-dir`** is still the motion (0140).

The step bar is a **read-out, not a control**. Tapping a dot to jump would require every step to be independently valid, which a branching flow is not. Navigation is the footer only. It spends no hue — a step is not time, place or plan mode (rule 4).

### 3. It reports per step, and the **save** re-validates everything

A step gate reports every problem **in the current step** — 0150 unchanged, scoped. The save re-validates **all** steps and, on failure, **navigates to the first step carrying a problem and marks it**. This rule lives in the primitive, not in each host. Without it a stepped form is exactly the save-discover-return loop 0150 closed.

### 4. Two rules the notes work makes non-negotiable

**It never animates height.** The obvious transition animates `max-height` so the sheet does not jump — which is precisely the trap [0152](0152-a-note-is-one-entity-with-an-optional-host.md) §6's amendment was written for: `.wp-event-actions` animates `max-height: 0 → 220px`, a **fixed** cap, clipping notes at about three, and raising it changes the motion of every card on the day (0140). A step panel now contains a **composer that grows without bound** — a committed note collapses to a chip, so the field is `base + N×chip`. The transition is therefore `translateX` + `opacity` only, and the sheet is allowed to resize between steps. That is the visible cost, and it is accepted; the alternative clips a field.

**It commits once, on the last step.** `verbs.create`/`schedule`/`book` now resolve to their created host so notes can be queued **behind** it — the outbox is FIFO and a note that overtakes its host is refused by the server (0152 §6b). A per-step "save and continue" would queue a note in step 2 before its host is created in step 3, and it would **fail only offline**, which is the hardest place to see it. Single-commit is also what makes §3's re-validate-everything natural rather than a compromise.

**And the composer belongs in the last step**, with the fields shared across the whole form.

### 5. Not applied to `BookingSheet` yet, and `Collapsible` is tried first

> **Amended 2026-08-02, same day, by the owner — this section is REVERSED.** After the
> extraction shipped, the owner's report was: _"I still see one big form instead of a stepped
> form for transportation for example"_. That is the honest outcome of what §5 decided —
> both migrated surfaces are **choosers**, so the extraction landed with no user-visible
> change to any form, and the one form the whole question came from was untouched. Asked
> directly whether to step it now or try `Collapsible` first as written below, the owner
> chose to step it. **`BookingSheet` is stepped**; the reasoning below is kept because the
> costs it names are real and are now costs the app is paying, not costs it avoided.
>
> **Three steps, which are the form's own three subjects rather than a paging of its
> fields:** `מה ואיפה` (type, identity, route or place, and the direction control) ·
> `מתי` (the schedule and the kind) · `פרטים` (the code, room/wifi, and the composer). For
> a round trip the last two are renamed `מתי הלוך` and `חזרה ופרטים`, and the return leg
> moves onto the last step — which is what the design reference drew.
>
> **The costs below are accepted, not dismissed.** Paging does manufacture a second pass at
> a refusal, and the form no longer shows a hard commitment whole before you sign it. What
> reduces the first is that a gate refuses at the step that owns the field, which is
> **earlier** than the old save-time refusal, not later. The second is unmitigated and
> should be the first thing looked at on a phone.

`BookingSheet` is a **middle case**, and the design says so rather than rounding it off. Mostly chunking — the code does not depend on the date — but it carries one genuine cross-step dependency: 0154 §4's own refusal, _the return cannot depart before the arrival_, means the return leg is not independently valid until the outbound is answered. That is branching, and it is the strongest argument for stepping this particular form.

It is still not enough to decide from a desktop browser. **The order is: `Collapsible` first** (0098, four call sites; `EventForm` already solves the same length problem with it — progressive disclosure keeps one scroll, one review before saving, and one refusal pass), **then a phone.** Both frames exist in the two mockups so the call can be made by looking rather than by arguing.

## Consequences

- **The extraction stands alone.** It deletes a duplicated mechanic and its duplicated back-layer comment, and it does not depend on any 0154 decision.
- **`.wp-event-actions` is not touched.** Its fixed cap is a known wart with a documented reason (0152 §6); this ADR only refuses to repeat it.
- **The 1570px measured for `BookingSheet` is a floor, not a height** — the composer grows it. Any future "is this form too long" argument has to be made against a range.
- **No other form is a candidate today**, and the scan is in the mockup so the next person asking gets counts rather than intuition. `MapPlaceForm` is explicitly excluded: 0148 spent a session on its room and a card that clips cannot host more.
- If `Collapsible` proves sufficient for `BookingSheet`, this primitive still ships with two call sites and was still worth extracting.

## Alternatives considered

- **Build a stepper for `BookingSheet` and leave `PlanDay`'s two copies alone.** Rejected: it adds a third copy of a mechanic that already exists twice, and justifies a primitive on the one case that least needs it.
- **Let a step save.** Rejected in §4 — it breaks the FIFO ordering notes depend on, and only offline.
- **Animate the panel height so the sheet does not jump.** Rejected in §4 — it is 0152 §6's clip, one surface over.
- **A tappable step bar.** Rejected in §2: it presumes independent per-step validity, which branching flows do not have.
- **Solve the length with a scrollable body and a sticky footer instead.** Already the case — `.booking-sheet` scrolls and its footer pins. The fold measurement is taken **with** that in place, so it is not an available fix.

## Build log — 2026-08-02

- **The primitive is a HOOK, and that was forced rather than chosen.** §2 says "one
  primitive owns step state, the back layer, the footer labels and the transition", which
  reads like a component. It cannot be one: `useBackLayer` registers in an effect and
  child effects run first, so a `<FormSteps>` rendered _inside_ the sheet would be the
  `Modal`'s child and would register its layer **underneath** the Modal's own — back would
  dismiss the whole surface instead of peeling the step, which is the exact defect 0103's
  session-175 amendment was written for. So `useFormSteps` is called by whatever renders
  the `Modal`, and `FormStepPanel`/`FormStepActions` are only the paint. The rule is now
  in the primitive's header and in `frontend/CLAUDE.md`, where it used to be advice.

- **§3 needed one thing the ADR did not name: the report is DEFERRED past the target
  step's render.** `useFormErrors.report` marks a field by looking its node up in the live
  DOM, and the node for a step you are not on yet does not exist — so reporting in the same
  tick as the navigation silently skips the nudge and the focus. The caption still appears,
  which is what makes it nasty: the refusal looks delivered and is not. The list is parked
  and flushed from an effect instead. **The first version of the test did not catch this**
  — it asserted `data-invalid` and the message, both of which survive the bug — and only
  started failing on the mutation once it also asserted that the field is **focused**.

- **Neither migrated surface is a form**, so the footer and §3 have no call site yet and
  are held up by the primitive's own tests alone. That was put to the owner before
  building and the answer was to build the full spec now. `errors` and `validate` are
  therefore **optional**: a chooser advances by choosing and has nothing to report through.

- **One deliberate behaviour change, and unifying the gate is what surfaced it.**
  `ResolveSheet`'s visible `חזרה` and its back layer were both gated on
  `softMovers.length > 1`. With a single soft mover you could still reach step two — the
  chooser always rendered — and then neither the button nor a system back could return to
  it; the only way out was dismissing the sheet. The primitive has one gate, `index > 0`,
  so both now agree and the step is leavable. Pinned in `PlanDay.resolve.test.tsx`.

- **`ResolveSheet`'s step state came down a level.** `resolveMover` lived in `PlanDay`
  only because the step machinery did; nothing outside the sheet ever read it. The sheet
  also gained its first unit test — it had none, which is worth stating given how much of
  Plan mode's overlap handling runs through it.

- **`useBackLayer` is no longer imported by `screens/PlanDay.tsx` at all.** That import
  going dead is the cleanest measure of what the extraction removed.

## Build log — `BookingSheet`, 2026-08-02

- **The extraction shipped invisibly, and that is what prompted the reversal.** Both
  migrated surfaces advance by _choosing_, so neither renders the footer; §2's `הבא`/`שמירה`
  and §3's re-validation went out with no user-facing call site. Worth naming as a planning
  lesson rather than a build one: "extract the primitive first, apply it later" left a
  release where the thing that motivated the work was the thing that did not change.

- **Steps are the form's SUBJECTS, and the field-to-step map is a table.** `STEP_FIELDS` is
  exhaustive over `BookingField` by `satisfies`, so a new refusal has to say which step
  shows it or the build fails — otherwise a problem could belong to no step and the save
  would have nowhere to jump. One `allProblems()` feeds both the gates and the save, so a
  rule cannot hold on one path and not the other.

- **`שבץ במסלול` got better, and needed re-plumbing.** ADR-0138 §7's shortcut used to scroll
  to the schedule; it now NAVIGATES to that step. It takes two renders — the step's first
  control does not exist until the step is on screen — which is the same ordering the
  primitive's deferred refusal needs, for the same reason.

- **Delete moved to the last step.** It belongs beside the decision to commit, not beside a
  control that is only navigating.

- **The two leg headings are never adjacent now**, which reads as a contradiction of
  ADR-0154 §4's "in pairs or not at all" and is not one: what that forbids is an unlabelled
  block beside a labelled one, and each step has exactly one block. The heading earns its
  place by carrying the leg's `RouteLabel` — which way this journey goes is the part the
  step name cannot say.

- **In this form the save's walk-back to an earlier step is unreachable from the UI**, and
  the test says so instead of implying otherwise: the gates cover every rule, and you cannot
  break a step-two field from step three because it is not rendered. The path is real
  defence in depth and is tested on the primitive, where it belongs.

- **22 existing specs failed on the first run**, all of them because they assumed one page,
  and every one of them was updated rather than relaxed. Two are worth noting: the refusal
  tests now assert at the STEP GATE, which is earlier than the save they used to press; and
  the delete-prompt tests walk to the last step first.

- **Still not answered: the phone.** Everything here was judged in a browser. §5's second
  cost — that you no longer review a hard commitment whole before signing it — is exactly
  the kind of thing a desktop pass cannot weigh.

# 0150 — A form refuses at the field, and the field says so

**Status:** Accepted — **built 2026-08-04 (session 201)**
**Date:** 2026-08-04
**Design exploration:** [`mockups/form-refusal-v1.html`](../../mockups/form-refusal-v1.html) — the before/after side by side, with a live nudge on the "after" side and the app's own focus rule present, which is what surfaced §4.
**Builds on:** [0079](0079-single-modal-primitive.md) (U-05: `Field` owns the error slot + `aria-describedby`; U-02: the `FormActions` bar), [0140](0140-motion-foundations-overlays-arrive-taps-answer-routes-have-a-direction.md) (motion foundations — the duration ramp, and reduced motion as a correctness case), [0028](0028-plan-violet-color-budget-dark-ready.md) (the colour budget: a refusal is a **status**, so it is `--miss`)
**Amends:** [0079](0079-single-modal-primitive.md) §U-05 — `Field`'s error prop now also marks the field, and it is fed by one hook rather than by each form's own `useState` — and **U-13** (the create CTA is "disabled with a reason"): it keeps the reason and the dim, and loses the `disabled`. [0142](0142-trip-birth-is-the-boards-first-departure.md) §1's arming beat is untouched — it keys on `data-armed`, never on `disabled`.

## Context

Owner report, from a real phone: _"the error for missing fields is nearly noticeable"_ — a screenshot of the event form, a `חסרה כותרת` caption sitting between the kind toggle and the save button, while the title field it is about is somewhere above the fold.

Reading the code turned one form's caption into a structural finding. There were **three** different ways to say "this is wrong" across six forms, none of which marked the field:

1. **A form-level `<p className="field-error">`** just above `FormActions` — `EventForm` and `BookingSheet`. It is at the far end of the form from the field it names, in a `.modal-form` scroll container, and it does not name the field at all. Both forms also `return` at the **first** problem, so a form with two things missing refuses twice.
2. **`Field`'s `error` slot** — `DocumentUploadSheet`, `MapPlaceForm`. In the right place, but a caption only: nothing about the control changed.
3. **A hand-rolled `.invalid` class** on the input, with its own copy of `border-color: var(--miss)` in two stylesheets — `CreateTrip`, `TripSettings`.

…and a fourth that is easy to miss because it looks like an answer rather than a gap: **a disabled primary**, in four places. A disabled button cannot say what is missing, and three of the four said nothing at all — `TripSettings`' save was `disabled` on a `canSave` covering four fields **with no note beside it**; `MapPlaceForm`'s confirm was dead while the name was empty _and its field binds the Enter key_, so `confirm()` ran into a silent `return` and the card answered nothing; and `DocumentUploadSheet` carried a `fileRequired` string no code path could reach. Only `CreateTrip` named the missing fields (`ctaReason`), and even there a note cannot point at one.

This is the shape [ADR-0096](0096-domain-claude-md-files.md) names: parallel one-offs where one mechanism belongs. And the native fallback made it worse rather than better — `EventForm`'s `<form>` was natively validated, so a date outside the trip triggered the **browser's** bubble (untranslated, LTR) and `submit` never ran, while `BookingSheet`'s save is a plain button and was never natively validated at all. Two authoring forms, two different refusers.

## Decision

**A refusal is made at the field, by one mechanism, in three marks: the field is outlined, it nudges once, and the first one is brought into view.**

### 1. One hook owns what happens after a refusal — `ui/primitives/useFormErrors`

The form still decides **what** is wrong and **in what words**; this is deliberately not a validation library, and it does not read the schemas. What it owns is everything that was being re-solved per form:

```ts
const errors = useFormErrors<'title' | 'date' | 'time'>();
…
if (errors.report(problems)) return;   // problems: { field, message }[]
…
<Field label={…} {...errors.field('title')}>
```

`field(name)` returns the message **and** the registration ref, so a field joins by being spread, not by being wired. `formProps` goes on the form once.

### 2. Every problem at once, not the first one

`report` takes the whole list. A form with two empty mandatory fields marks **both** and says so once — the old first-failure `return` sent the user round the save loop to be told the next thing. A `field: null` problem is the form's own (a failed save, a shape the schema refused after every check passed) and keeps the one place it can read: the form-level slot, which is all that still renders down there.

**Amended 2026-08-02:** two things about `field: null` that the original left implicit and a third form found the hard way (ADR-0153 §5's amendment). It also covers **a rule no single field owns** — a note needs a body _or_ a url, and marking either one states something false about a field that is individually optional; when nothing is wrong with any box, the refusal is the form's. And that slot is now the `FormError` primitive (`ui/primitives/FormError.tsx`), not markup each form writes: three copies of the same `<p className="field-error" role="alert">` was two more than this ADR meant by "one place". Note the consequence, since the hook cannot help here — `dismissAt` retires a mark by matching the field that was typed in, so a refusal with **no** field is never retired by it, and a form using this must clear on input itself.

### 3. The marks

- **Outline** — the control in `--miss`, plus a 3px 20% halo, and the label goes `--miss` with it. Nothing new in the palette: a refusal is a **status**, and `--ok`/`--miss` is where statuses live (ADR-0028). Carried by **one attribute**, `data-invalid`, on whatever shell owns the field — which is what lets `Field`, a screen's own field div, and a single control inside a two-control date range all refuse identically.
- **Nudge** — one 240ms (`--t-base`) shake, added imperatively for one shot because the refusal has to be felt again on a **repeat** attempt at the same field: a mark already on screen changes nothing when you press save a second time. `linear`, because the keyframe offsets **are** the timing of an oscillation and an easing curve resamples them into a different shape (ADR-0140 §7 from the other side). No `--dir`: a shake is symmetric, the one translate in this app with no inline direction to express.
- **Into view** — the first problem in **document order** (not the order the form authored its checks in) is scrolled to `block: 'center'` and its first typeable control focused, so the fix is one keystroke away. `preventScroll` on the focus, or the browser's own jump fights the smooth scroll.

### 4. The refusal outranks the focus ring

`field.css` paints a focused control's border teal. A refusal **focuses** the field it names, so the refused control is focused the instant it is marked — and the focus rule out-specifies a plain attribute selector, which would have painted every refused field as the healthy focused one. The invalid rule carries its own `:focus-visible` pair. This was invisible in the unit tests and visible in the mockup within a second, which is the argument for the mockup.

### 5. The app does the refusing, not the browser

`EventForm`'s form is `noValidate`. The browser's constraint validation reached a date outside `min`/`max` first — an untranslated LTR bubble, and `submit` never ran, so the form's own Hebrew refusal could not. It also puts `EventForm` and `BookingSheet` on the same footing, which they were not.

### 6. One name per BOX, not per value

`BookingSheet`'s span refuses **per leg**, for the same reason it carries a zone per leg: "the dates are outside the trip" over one good field and one bad one is a refusal naming something that is not wrong. Same rule sends `EventForm`'s `endBeforeStart` to the time box rather than to the date above it.

### 7. Live invalidity stays live, and shares the mark

`CreateTrip` and `TripSettings` mark their date inputs **as you type**, before any save — a contradiction the form can see without being asked, and worth saying at once. That stays. What goes is their private copy of the outline: they set `data-invalid` on the input itself and both `.invalid` rules are deleted, so a date that is live-invalid and a date the save refused look the same, because they are the same statement. That is the whole point of the attribute being the contract rather than the hook.

### 8. A primary is disabled only for what a press could not answer

**Disabled means "pressing this cannot work right now": a write already in flight, or offline.** It is never a stand-in for a refusal the button cannot explain. So `TripSettings`' save, `CreateTrip`'s CTA, `MapPlaceForm`'s confirm and `DocumentUploadSheet`'s save are all pressable while the form is incomplete, and answer with a mark at the field.

Two things this deliberately keeps. `CreateTrip`'s CTA still **dims** until the form completes — the same 0.45, moved from `:disabled` to `:not([data-armed])` — and still **arms** on the flip, because ADR-0142 §1's beat was always a `data-armed` animation and never a property of being disabled; `ctaReason` stays too, since a note saying what is needed **before** the press and a refusal saying **where** are not the same statement. And `AddIdea` (the shelf's quick-add) keeps its disabled `＋`: it is one field with no label, the whole form is the empty control, and there is nothing for a refusal to point at that the user is not already looking at.

## Consequences

- `form-errors.css` is loaded **globally** from `App.tsx`, not by the hook that applies the marks — the two screens in §7 set the attribute without ever touching the hook, and they are lazy chunks. The attribute is the contract; the hook is one (usual) way to set it.
- **Every form in the app refuses the same way now**: `EventForm` (event), `BookingSheet` (booking), `MapPlaceForm` (place), `CreateTrip` (new trip), `TripSettings` (settings), `DocumentUploadSheet` (document). `MapPlaceForm` merges the two kinds: its host still reports a failed **write** into the same slot, because that card has one field and both statements are about it. `DocumentManageSheet` needs nothing — an empty title there falls back to the document's current one, which is an answer rather than a refusal.
- Three surfaces that never used `Field` (`CreateTrip`, `TripSettings`, and the two date rows inside them) join by setting `data-invalid` and `ref` on their own field divs. That is the attribute contract doing its job, and the reason the mechanism is not a component.
- The four zod `safeParse` backstops in `EventForm` are unreachable behind the explicit checks and still fall back to `titleRequired` as their message, which is wrong copy for an unexpected shape. Backlogged, not fixed here.
- **A refusal makes the form taller, and that found a stale landing position** — the fifth time in this repo (ADR-0148's Consequences counts four). `CreateTrip`'s birth card floats over a slot it measures, and re-measured only from a `ResizeObserver` on the root; the root is viewport-sized, so a form growing **inside** it changes no box the observer watches and the callback never ran. Three refusals pushed the slot 57px down and the card stayed put, covering the name field, its hint (invisible since ADR-0142 shipped, for the same reason) and the refusal under it. It re-measures on **every render** now — the form is the card's `children`, so a render is exactly the signal that something below may have moved — with the resize path kept for what a render cannot see (rotation, the keyboard). Pinned in `e2e/form-refusal.spec.ts`, because every number jsdom reports for this is zero.
- **`Field` no longer clones `aria-describedby` onto a composed child** — only onto a real DOM element. It always was a no-op on a component (the props landed on something that never rendered them), and the shells this ADR adds around `TimePicker` and the span legs are exactly that case. `aria-invalid` rides along on the same clone.

## Alternatives considered

- **Fix the caption in `EventForm`.** Rejected: it is the surface the report came from, not the problem. Three refusal shapes across six forms is the finding, and fixing one leaves the next form to pick whichever it copies.
- **A validation library / schema-driven field errors.** Rejected: the shapes already live in `packages/shared` and the forms already run their checks in the order and the words they want (`dateOutOfRange` reads as a **trip** statement, not a range violation). What was missing was the presentation, and only that is shared.
- **Leaving the disabled primaries alone** (§8), on the grounds that a dead button is at least honest about not being ready. Rejected on what the four of them actually did: three said nothing at all, and one of those swallowed the Enter key its own field binds. A disabled control cannot name a field, which is the entire point of this ADR.
- **A toast.** Rejected: a toast is for something that **happened** — this is a statement about a field on screen, and the field is where it can be answered. It would also leave the fields unmarked, which is the actual complaint.
- **A summary banner at the top of the form listing the missing fields.** Rejected for a phone-first app: it is a second scroll destination that repeats what the marks already say, and it re-creates the "far from the field" distance in the other direction.
- **Keeping native constraint validation and translating around it.** Rejected: the bubble's copy, direction and placement are not ours, it cannot mark a field, and it does not exist at all for a save that is a button rather than a submit.

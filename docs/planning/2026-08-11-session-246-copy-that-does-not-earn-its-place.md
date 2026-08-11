# Session 246 — copy that does not earn its place (field report #27, workstream L)

**Date:** 2026-08-11
**Workstream:** `L` — copy density. Audit by copy, then a build sweep.
**Touches:** `frontend/src/i18n/he.ts`, `screens/CreateTrip.tsx`, `screens/JoinTrip.tsx`, `screens/DayView.tsx`, `screens/PlanDay.tsx`, `screens/screens.css`, `ui/BookingSheet.tsx`, `ui/MediaViewer.tsx`, `ui/DocumentUploadSheet.tsx`, `ui/domain/RouteField.tsx` (+ its test), `docs/decisions/0116-…md`.
**No ADR of its own** — the keep/remove rule is the owner's, already recorded in `backlog.md` + the 2026-08-10 addendum §2 `#27`. **ADR-0116 is amended in place** (§4 and §5), because this pass removed copy that ADR had specifically committed to. **No mockup:** no card changed height; see §5.

## 0. The rule being applied

> Explanatory copy goes by default. The app should trust its labels, hierarchy, state and controls.

With five exceptions that are the requirement, not a softening: why an action failed and how to recover; a destructive/irreversible/privacy/offline/cross-device consequence; a constraint the control cannot express; a distinction between two readings that would save different data; necessary accessibility text.

## 1. Method

The inventory is over the **copy**, not a selector — the same job is done by four different shapes, and a class-based sweep sees only the first two:

- `Field.hint` / `FilePicker.hint` (`<p className="field-hint">`)
- `EmptyState.body` / `ErrorState.body` / `ConfirmDialog.body`+`consequence` — protected by construction
- bare inline `<p>` in screens and forms
- **clauses inside otherwise-earning strings** — the shape the handoff's grep-based inventory could not see at all, and where four of this session's twelve changes landed (§3)

`rg '<p[ >]' frontend/src --glob '*.tsx'` surfaces ~50 non-test sites; that is the superset the class-based greps are subsets of.

## 2. Removed outright — eight strings

Each deleted at both the JSX call site and the `i18n/he.ts` entry, with a repo-wide check that no other caller shared the key.

| String                     | Where                        | Why it did not earn its place                                                                                                                                                            |
| -------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.form.hireHint`      | `RouteField` hire branch     | "Most rentals return to the same counter" — trivia beside a `returnSame`/`returnElsewhere` toggle that already presents both options. A default does not need a statistic to justify it. |
| `shell.newTrip.nameHint`   | `CreateTrip` name field      | Pure narration ("we suggested it, you can change it") over an editable text box. `namePlaceholder` already sets the expectation before a value exists.                                   |
| `shell.join.heroBody`      | `JoinTrip` hero              | Restates the `<h1>` above it. The ticket below states every fact it gestures at.                                                                                                         |
| `docs.viewer.handoff`      | `MediaViewer`                | "The file is ready · open it in the right app or download" — restates the two buttons directly beneath it, which are labelled `פתח בכרטיסייה` and `הורדה`.                               |
| `day.tapToSchedule`        | `DayView` shelf header       | Gesture instruction. See §4.                                                                                                                                                             |
| `planDay.shelfHint`        | `PlanDay` shelf header       | Gesture instruction — the string the report was about. See §4.                                                                                                                           |
| `notes.composer.hintPlain` | `DocumentUploadSheet`        | "＋ only if you want another one" restates that button's own `aria-label` (`פתק נוסף`), verbatim.                                                                                        |
| `index.form.autoCaption`   | `BookingSheet` identity step | See §3 — the one item that needed evidence rather than a reading.                                                                                                                        |

## 3. Trimmed — four strings that earn part of their length

The density rule is about clauses, not only whole strings. Four strings carried a real fact **and** a restatement; each keeps the fact.

- `day.skippedTag` — `דילגתם · לחצו להחזרה` → **`דילגתם`**. The state is the only thing distinguishing a skipped card from an idea card and cannot go; the card is a `<button>`, so the tap needs no announcing. A stale comment in `DayView` reasoned that this tile "drops the action line" _because_ the string said what a tap does — no shelf card passes `action` any more, so that justification described a state the code had already left.
- `shell.created.inviteLabel` — `לינק הזמנה · לחצו להעתקה ושיתוף` → **`לינק הזמנה`**. The box has an `onClick` and a clipboard icon that flips to a check on copy.
- `notes.composer.hint` — `יורש את הקטגוריה והסמל · ＋ רק אם רוצים עוד אחד` → **`יורש את הקטגוריה והסמל`**. The inheritance is a real mechanism a label cannot express; the `＋` clause was the same restatement as `hintPlain`.
- `index.form.autoCaption`'s **block** — the caption is gone, its revert button stays and is now the whole element.

**`autoCaption` is the one item the triage guessed at and the code decided.** The handoff's tie-breaker asked one question: is the caption's `cat-readout` span the only place a reader can see which category the icon was derived from? The answer is **no** — `BookingTypeRow` renders `t.index.bookingType[type]` on every step but its own, i.e. on this very step, so the caption was a same-screen duplicate of the type label. It was also **wrong in one state**: the text `נבחר לפי סוג ההזמנה` ("selected by booking type") rendered unconditionally, including after a person had overridden the icon — precisely when it was no longer true. Removing it deletes a duplicate and a lie in one edit. Its two now-orphaned `.cat-readout` CSS rules went with it.

## 4. The reversal, and where it came from

The triage filed the shelf's gesture hints as **protected** — Category F, on the strength of two defending code comments arguing that a press-and-hold is "the one part of the gesture nobody guesses." ADR-0116 §4 and §5 both committed to them in prose.

Mid-session the owner reported the opposite, from a real user, naming the exact string:

> `לחצו לפתיחה · לחיצה ארוכה לגרירה ליום` — the UI should be intuitive enough that I wouldn't have to explain things like that with text, and it'd make the app look cleaner.

That is a decision about the product, not a reading of the rule, so it wins over both the comments and this workstream's own triage. Removed: `shelfHint` (Plan) and its Day-view sibling `tapToSchedule` — identical shape, identical position (a `.hint` span in the shelf's `sec-title`), and it would have been incoherent to delete one and keep the other. The gesture clauses in §3 came off for the same reason.

**ADR-0116 is amended, not reversed.** Capabilities are unchanged: what a tap opens is what it opened before. What the amendment records honestly is the cost — **the drag's discoverability is now an open question the ADR no longer answers.** What makes that affordable rather than a capability loss is that the tap path reaches everything the drag does (a tap opens the idea's sheet; `שיבוץ ליום` is its first action), so the hold is a fast path and not the only one. The amendment says explicitly that if the drag goes unused, the fix owed is **an affordance, not the sentence back** — otherwise the next session re-adds the caption and calls it a fix.

The dated planning notes that mention the old hint (session 113) were left alone: they are a record of what was true then.

## 5. What was kept, and why that is the result

Nothing in the protected categories was touched, and that is the pass working rather than the pass stalling:

- every `ConfirmDialog` `body`/`consequence`, every delete/discard body, `BookingSheet`'s two `bs-hard-note`s (ADR-0011 consequence)
- every `EmptyState`/`ErrorState` body, every `join-status`/`join-error`/`offline-note`
- `CreateTrip`'s `ctaReason` — a disabled primary must say why (ADR-0150 §8)
- the constraint hints: `pickHint`, `codeSharedHint`, `noLocationHint`, `derivedHint`, `themeHint`/`currencyHint`/`emailHint`/`sharedHint`, `inviteHint`/`removedHint`/`blockedHint`, `nicknameHint`, `routeHint`
- `EventForm`'s `ef-derived` — a narrated derivation standing in for a second control that could disagree with it, which is the pattern `autoCaption` turned out **not** to be
- `pastNote` and `pastBuildHint` — a frozen structure that can still be settled, and where the missing capability lives; both answer "why is this gone", not "how do I press it"
- the drop-target strings (`שחררו כאן…`) — live feedback naming a target that would otherwise be an unlabelled dashed box, present only during a drag
- `ZeroState` / `JoinTrip` first-run teaching, on `IndexNotesView`'s precedent that a _true_ empty state may teach what belongs there
- the Google cost disclosure and the FX attribution, which are contractual

**No mockup.** The carve-out is for a removal that visibly changes a card's height or vertical rhythm (ADR-0150's 57px birth-card regression is why it exists). Two removals change a row — the two shelf headers lose their trailing hint span, and the booking caption's line disappears when the icon is untouched — and neither is a card whose geometry another surface measures against.

## 6. Verification

- `pnpm typecheck` clean; `pnpm --filter @waypoint/frontend build` green.
- **207 test files, 3427 tests, all passing** — run twice, once after the §2/§3 sweep and again after §4's reversal and the `autoCaption` removal.
- One test asserted a removed string (`RouteField.test.tsx` pinned `hireHint` as the hire shape's note). It is rewritten to assert the hire branch shows **no** note and specifically not the journey one — the discrimination the original test existed for survives the copy it used to make it with.
- Every deleted key was `rg`-ed repo-wide before deletion; `.cat-readout`'s CSS was removed only after confirming no remaining TSX reference.
- `pnpm format` after `pnpm install`, and it touched **only** the files this change touched — the check root `CLAUDE.md` asks for, since a repo-wide reformat is the wrong-Prettier symptom.

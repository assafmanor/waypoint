# 0235 — A note inside a card is a preview, and the word says where you are going

**Status:** **ACCEPTED AND BUILT** (2026-09-20) — owner: _"Mockup first to make sure we get it right, then build"_. The mockup was drawn, rendered and corrected twice by its own render before a line of app code was written; the numbers below are read off that page's DOM.
**Date:** 2026-09-20
**Session note:** [`planning/2026-09-20-a-note-in-a-card-is-a-preview.md`](../planning/2026-09-20-a-note-in-a-card-is-a-preview.md)
**Mockup:** [`mockups/a-note-in-a-card-is-a-preview-v1.html`](../../mockups/a-note-in-a-card-is-a-preview-v1.html)

**Amends in place:** [0202](0202-a-note-gets-a-full-screen-and-markdown-is-a-subset.md) §6 — the row `a host's section | clamps? **never**` becomes `clamps? **yes, a box**`, and §6's peel rule is re-derived rather than inherited (§6 below) · [0153](0153-the-notes-surface-the-mark-and-no-mode-gate.md) §4 — _"a line here does not clamp — it never has — so a note is already whole on this surface"_ stops being true, and the sentence that followed from it ("opening adds the foot alone") survives unchanged for every note that still fits (§3).
**Relates:** [0167](0167-the-badge-is-the-thumbnails-frame.md) §9/§11.1 + [0219](0219-a-day-is-a-place-you-can-see.md) §6 (`.map-sum-t` + `.map-know-more` — the one-off this generalises, and the surface the owner's report points at) · [0202](0202-a-note-gets-a-full-screen-and-markdown-is-a-subset.md) §1/§2 (the full screen this routes to, and `תצוגה מלאה` as its name) · [0160](0160-the-hero-lifts-and-shows-a-horizon.md) §U (the hero's blocks, and the "nothing here is pressable" rule this qualifies) · [0100](0100-index-bookings-header-search-redesign.md) §6 (`.edge-fade`, considered and refused for the fade) · [0017](0017-mobile-first-device-targets.md) (the 44px floor) · [0138](0138-the-row-menu-is-one-surface-and-icons-are-ui.md) (one meaning, one noun — which is what §4 is about)

## Context

Two screenshots, one note. A host's welcome message — check-in times, a keypad code, a key-box code, a wifi password, a phone number, about 22 rendered lines — filled a booking sheet end to end, and then filled the board's lifted hero as well:

> All entities that embed notes (lifted hero, places, events on plan day and day view, bookings, and more?) should have a max length showing, where you can click to show more... Similar to how place descriptions are. See screenshot, how ugly it becomes when a note is very long.

**The "and more?" is countable, and the count is three.** Exactly three render sites print a note's body with no bound:

| site                              | reached from                                                                                                      | today                  |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `NoteSection`'s `.note-item-b`    | **seven hosts at once** through `HostNotes`: booking, place, event, idea, document, the event form, `DetailSheet` | the whole body, always |
| `HeroLift`'s `.hero-note-tx`      | the board's lifted hero                                                                                           | the whole body, always |
| `SharedItinerary`'s `.sh-op-note` | the public read-only page                                                                                         | the whole body, always |

PlanDay's `BuilderRow` is already answered and needs nothing: it renders a `NoteMark` **count** and no body at all, so "events on plan day" is a surface the report reasonably assumed and the code had already decided. The notes screen's row is the one surface that ever clamped — two lines, ADR-0153 §4.

**And this is a decided behaviour being reversed, not a missing one being added.** ADR-0153 §4 says a host's section never clamped "so the words are already whole and opening adds the foot alone", and ADR-0202 §6 tabulates `a host's section | clamps? never` as one of the two axes that decide how a note is painted there. Both are amended here, in place.

**The destination already exists, and the app already routes to it.** `noteReadsFullScreen` makes a tap on a long note open `NoteFullScreen` rather than the foot — shipped since ADR-0202, on both surfaces that call it. So the words are already reachable; what is missing is that the surface still prints every one of them on the way there.

## Decision

### 1. The rule is one sentence, and it is about the container rather than the note

**A note read inside a card is a preview; a note read on its own screen is the note.** Everything below follows from that, including the surface that has no screen to offer (§5).

The card does not get to decide how much of a note it shows based on the note. It states a **budget**, and whatever fits, fits.

### 2. The clip is a box, not a line count — and the first draft of this section was wrong

The reflex is `-webkit-line-clamp`, and the mockup was written to show that it cannot work here: `.note-item-b` holds the block children `NoteProse` emits, `-webkit-box` lays element children out as boxes rather than as lines, and `place-knowledge.css` already carries that caveat in prose for `.map-sum-t`.

**Rendered, the prediction was false.** On paragraph prose Chromium clamps perfectly well under `-webkit-line-clamp`, `…` and all. The mechanism was described correctly and the conclusion did not follow from it.

What actually separates the two is a **structured** note — a heading and a list, which is exactly what ADR-0202 §6 says a host's section _shapes_ rather than flattens. There a whole `<ul>` is one box in the count. Measured at light/360, same budget of 6:

| note                         | `-webkit-line-clamp: 6` | `max-height: calc(6 * 1lh)` |
| ---------------------------- | ----------------------- | --------------------------- |
| the reported prose note      | **⁦144.8px⁩**           | **⁦120.8px⁩**               |
| a note with a heading + list | **⁦170.6px⁩**           | **⁦120.8px⁩**               |

**And the deciding number is the right-hand column, not the left.** `max-height` returns the same ⁦120.8px⁩ for both, so a section's height becomes a property of the **surface** rather than of what somebody pasted into it. That is what the report is actually asking for; the ugliness in the screenshot is a card whose size is decided by its contents.

So: `max-height: calc(var(--note-clip-lines) * 1lh)` + `overflow: hidden`, with `1lh` because it is the element's own line box and therefore follows whatever a host's density does to the leading — a hand-copied `1.55` would drift the first time `.note-prose.dense` moves. Baseline since 2023 (Chrome 109 / Safari 16.4 / Firefox 120).

**The block gaps are spent from the budget, and that is the right direction.** Six lines is six line-heights, and a new paragraph costs `--space-3` out of them, so a structured note previews fewer lines than a running one. Someone who pasted headings and lists gets a preview of the structure rather than a page of it.

**The fade is part of the mechanism, not decoration.** Because the budget is a box, the cut does not always land on a line boundary, and a hard edge through the middle of a glyph reads as a broken layout rather than as "there is more". One `mask-image`, one direction. **`.edge-fade` was considered and refused**: its axis is `to right` and its two variables exist to zero a side with nothing behind it (ADR-0100 §6) — a different question, since prose always continues.

### 3. The budget is the surface's, and it is three numbers

| surface                 | budget      | why                                                                                                                                                 |
| ----------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| a host's `NoteSection`  | **6 lines** | ⁦565px⁩ → ⁦328.8px⁩ on the reported note; the section still reads as prose rather than as a teaser                                                  |
| the board's lifted hero | **3 lines** | the app's most crowded card — `איפה`, the action row, `פתק`, `משימה` and the settle question stack inside one `--lift-max-h`. ⁦400.2px⁩ → ⁦207.4px⁩ |
| `SharedItinerary`       | **6 lines** | the section's number; a reading page has no competing blocks but no reason to differ either                                                         |

Six is the recommendation and the mockup ships 4 / 6 / 8 as controls, because how much of a note reads as "enough to know what this is" is a device call and not a desktop one.

**A note that fits changes nothing.** No clip is visible, no control is rendered, and ADR-0153 §4's sentence — a tap opens the foot and nothing else, because the words were never what was missing — holds exactly as written. This ADR only ever touches the notes that overflow.

### 4. The way to the rest, and **the word says where you are going**

Four candidates, one note, drawn on the same surface:

- **א — clip with no control.** Refused. The clip hides text by definition and what it hid here is the key-box code. A fade says "there is more" and does not say how; it is why `.map-sum-t` has never shipped without `.map-know-more`.
- **ב — `עוד` expands it in place.** Refused. That is the reported screenshot with one extra tap. In-place expansion is right on the notes _screen_, where the clamp is two lines and lifting it shows a short note whole; in a host's card the budget is six, so what got clipped is by definition long — and long is what ADR-0202 §1 already decided is not read inside a card.
- **ג — a control that opens the full screen.** **Chosen.** Zero new containers and zero new state: the screen exists, and the tap is already routed to it for a long note. The control makes that routing visible, and the clip stops printing the whole note on the way.
- **ד — clip, and leave the foot's `תצוגה מלאה` as the only way.** Refused. The foot opens by tapping the note, so the way to the rest runs through the thing it is supposed to relieve — the exact complaint ADR-0202 §9 already fixed once ("the way in was only reachable _through_ the thing it relieves").

**And then the render found the rule this section is named for.** The control was drawn as `עוד ›` everywhere, since the place summary is what the report points at. On the hero that lands directly above the shipped `ועוד פתק אחד` — two different meanings one line apart, both opening on the same word. Invisible on paper.

So: **the word says where you are going, and the glyph agrees with it.**

- **`תצוגה מלאה` + `Icon name="frame"`** — this leaves the surface for the note's own screen. Both are the app's existing answer for that exact move (ADR-0202 §1 chose the glyph, borrowed from `FilePicker`; `t.notes.open.full` is the same string the foot wears).
- **`עוד` / `פחות` + a caret** — this grows the text where it stands. That is `map.know.more`'s meaning, and §5 is the only place it applies.

Two words, because there are two destinations. One word for two destinations is what ADR-0138 is about, and so is the reverse.

**And the control is `.row-open-act` — the class, not a copy of its recipe.** It was drafted as a fresh `.note-more` button in `.map-know-more`'s shape (11.5px text link, weight 700, an `::after` for the touch floor), which is when it became obvious that every one of those declarations already exists **one line below it**, on the foot's own `תצוגה מלאה`. Same verb, same destination, and painting them differently is how one meaning grows two faces. So `.note-more` is three declarations on top of it — a block of its own, under the body it is about — and the 44px `::after` overlay over a ⁦27px⁩ box arrives with the class rather than being re-declared. **Measured: ⁦44px⁩ of target against ⁦27px⁩ of box.**

`--cta` and not `--teal`: `.map-know-more` spends teal because the Map's card is a location surface and root rule 4 licenses it there — a note is not a location. Not a pill either: a section already has `＋ פתק` in its header, and a second filled control inside a row reads as a second primary.

### 5. The hero, and the one surface with nowhere to go

**The hero note gets a control, and that qualifies ADR-0160 §U rather than contradicting it.** §U settled that the hero's task block is not pressable, and it was right: ticking a task from the board is a commitment, and brief §13 declined it. A clipped note is a different thing — **the clip deletes information from the screen, and deleted information must have a way back.** The control acts on nothing; it opens a reader.

Its own alignment is a render finding: `.hero-note-more` insets itself ⁦24px⁩ to start where the note's words start, past the clipboard glyph and its gap, so the control needs the same inset or it sits ⁦20px⁩ outside the count line directly beneath it.

**`SharedItinerary` is the exception, and it is a real one.** It is a public read-only page with no app underneath it — there is no `NoteFullScreen` to open. So there, and only there, the control lifts the clip where it stands: the same `.note-clip`, the same `.note-more`, `עוד` / `פחות`, a different destination. This is exactly the shape `.map-sum.is-decide` already has for a card that has nothing to expand into (ADR-0219 §6), which is why it needs no new mechanism either.

### 6. What this does to ADR-0202 §6's table, and why the peel rule does not come with it

§6's table becomes:

| surface                | clamps?               | body is a `<button>`? | so                                      |
| ---------------------- | --------------------- | --------------------- | --------------------------------------- |
| the notes screen's row | yes, **2 lines**      | yes                   | **flat text**, markers peeled, no links |
| a host's section       | yes, **a 6-line box** | yes                   | **shaped**, dense; a url is words       |
| the full screen        | never                 | no                    | **shaped**; a url is a link             |

§6's rule was "a clamped surface gets its markers peeled", and the reason given was that `## מסעדות` inside a **two-line preview** is noise. That reason does not survive the move to six: at two lines a marker costs a third of everything you can see, and at six a heading and a bullet are what makes the preview legible at a glance. So the rule is re-derived rather than inherited — **the peel is a function of how small the budget is, not of whether there is one** — and the axis in the table is really "is there room for a block", which two lines does not have and six does.

Nothing about ADR-0202 §6's other two rows changes.

### 7. The predicate moves from an estimate to a measurement, on the surface where it was weakest

`noteReadsFullScreen` counts characters: `NOTE_ROW_CHARS_PER_LINE = 42`, the 360px design width, and `> NOTE_INLINE_MAX_LINES` (8). It is what decides whether a tap opens the full screen.

Once the same surface also clips, the estimate and the clip can disagree — and then either a control offers to reveal nothing, or a note is cut with the tap still going to the foot. `PlaceKnowledge` already solved exactly this and wrote down why: _"a character count cannot know the width it is laid out at, and a control offering to reveal nothing is worse than no control."_

So `NoteSection` routes on **`scrollHeight > clientHeight`**, in a `useLayoutEffect`, and the clip and the routing become one fact that cannot disagree. That measurement moves out of `PlaceKnowledge` into `lib/useIsClipped.ts` and `PlaceKnowledge` becomes its second caller — the extraction rule 8 asks for, not a second copy.

`noteReadsFullScreen` stays, unchanged, for the notes **screen**: there the clamp (2 lines) and the threshold (8 lines) are genuinely two different numbers, so an estimate is the right tool and a measurement would answer the wrong question.

**The gap is real, not theoretical.** On the reported note the estimate says ⁦19⁩ lines; at 360px the layout renders ⁦19⁩ and at 390px it renders ⁦18⁩ — the estimate cannot move, because 42 characters per line is frozen at the design width.

### 8. What this does not decide

- **The budget itself.** 6 / 3 / 6 are the recommendation and the mockup carries 4 / 6 / 8 as controls. A device pass owns the final number; nothing else in this ADR moves if it changes.
- **A task's body.** `IndexTasksView`'s `.tsk-open-body` prints an unbounded task body when a row opens, which is the same shape on a different entity — but a task has no full screen to route to, so it is a different decision and not a line of this one. Left on the backlog.
- **Whether the hero's `ועוד N פתקים` becomes a way to the host's other notes.** It is a caption today and stays one; the control beside it now opens the note it is actually about, which is the part the report asked for.
- **Whether the mask should be softer on the board.** It resolves against a gradient there rather than a flat surface, which a desktop screenshot judges badly.

## Consequences

- A host's note section stops being a surface whose height is decided by whoever pasted into it: ⁦565px⁩ → ⁦328.8px⁩ on the reported note, and ⁦120.8px⁩ of body whatever the note's structure.
- The board's lifted hero drops ⁦400.2px⁩ → ⁦207.4px⁩ on the same note, on the app's most contended card.
- One new mechanism (`.note-clip` + three declarations on `.row-open-act`) serves three surfaces. Nothing was copied: the control reuses the foot's class, and `useIsClipped` is `PlaceKnowledge`'s own probe extracted rather than a second copy beside it. `.map-sum-t` + `.map-know-more` stay as they are — they answer a card's mode change, not a note's reader, and merging them would be a flag argument that says "behave differently".
- `.note-item-b`'s tap and the clip can no longer disagree, because they read one fact.
- A note that fits the budget is untouched — no clip, no control, and ADR-0153 §4's foot rule intact.

## Alternatives considered

- **`-webkit-line-clamp`** — §2, with the retraction it earned.
- **A character-count clip** (reuse `noteReadsFullScreen` for the CSS too) — refused in §7: it is the estimate that cannot see the width, and doubling its job doubles its error.
- **Truncating the stored text, or capping the field** — never considered seriously and worth saying once: the reported note's whole value is the two codes near the end of it. A preview is a rendering decision; the note is the note.
- **A per-note "expanded" memory** — refused. It is state nobody asked for, it has to live somewhere, and the full screen is one tap away.

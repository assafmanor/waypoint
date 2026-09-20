# 2026-09-20 — A note inside a card is a preview

**Decision:** [ADR-0235](../decisions/0235-a-note-inside-a-card-is-a-preview.md) · **Mockup:** [`a-note-in-a-card-is-a-preview-v1.html`](../../mockups/a-note-in-a-card-is-a-preview-v1.html) · **Designed, drawn and built the same day.**

## The ask

One owner message, two screenshots. A host's welcome message — check-in times, a keypad code, a key-box code, a wifi password, a phone number — filled a booking sheet end to end, then filled the board's lifted hero as well.

> All entities that embed notes (lifted hero, places, events on plan day and day view, bookings, and more?) should have a max length showing, where you can click to show more... Similar to how place descriptions are. See screenshot, how ugly it becomes when a note is very long.
>
> Mockup first to make sure we get it right, then build

## What the census changed, before anything was drawn

The report's "and more?" is countable, and answering it moved the work:

- **Three** surfaces print a note body with no bound, not six: `NoteSection`'s `.note-item-b` (which through `HostNotes` is seven hosts at once), `HeroLift`'s `.hero-note-tx`, `SharedItinerary`'s `.sh-op-note`.
- **PlanDay's `BuilderRow` was already answered** — it renders a `NoteMark` count and no body, so one of the named surfaces needed nothing.
- **"Never clamps" was a decision, written down twice** (ADR-0153 §4, ADR-0202 §6's table), so this is a reversal to argue rather than a gap to fill.
- **The destination already existed.** `noteReadsFullScreen` has routed a long note's tap to the full screen since ADR-0202. What was missing was only that the surface still printed every line on the way there — which is why the chosen candidate adds no container and no state.

## What the render found that reading could not

1. **§2's thesis was wrong, and the file keeps it.** It was written to show that `-webkit-line-clamp` "cannot do this job" because `-webkit-box` lays element children out as boxes. The mechanism is described correctly and the prediction was false: on paragraph prose Chromium clamps it fine. What discriminates is a **structured** note (heading + list), where a whole `<ul>` is one box in that count — ⁦170.6px⁩ against `max-height`'s ⁦120.8px⁩ on the same budget. And the argument that actually decides it turned out to be the other number in that row: `max-height` returns ⁦120.8px⁩ for **both** notes, so a section's height becomes a property of the surface rather than of what somebody pasted in. The retracted claim is left in the file with its refutation, because the next session will reach for the clamp first.

2. **The word had to change, and that produced the section's rule.** The control was drawn as `עוד ›` everywhere, since the place summary is what the report points at. On the hero that lands directly above the shipped `ועוד פתק אחד` — two meanings one line apart, opening on the same word. The rule: **the word says where you are going.** `תצוגה מלאה` + `Icon name="frame"` leaves for the note's screen (both already the app's answer for that move); `עוד`/`פחות` + a caret grows the text in place, which only `SharedItinerary` can do.

3. **§2's two columns were not the same note.** The clamp frame was hand-written and silently dropped the title — the skill's own "build frames from data" rule failing in the file that states it.

4. **The fade would have eaten a short note's last line.** `100% - 1.15lh` is relative to the box, and a note shorter than the budget shrinks to content. The stops are absolute now, so a short box lies entirely inside the opaque stop — no class to toggle and no measurement to wait for.

5. **The hero's control sat ⁦20px⁩ outside the count line under it**, because `.hero-note-more` insets itself ⁦24px⁩ to start where the note's words start.

## What was built

| file                              | change                                                                                                                 |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `lib/useIsClipped.ts`             | **new** — the overflow probe, extracted from `PlaceKnowledge` rather than copied beside it                             |
| `ui/domain/PlaceKnowledge.tsx`    | its four lines become a call to that hook; behaviour unchanged                                                         |
| `ui/notes.css`                    | `.note-clip` (+ the absolute fade), `.note-more` as three declarations on top of `.row-open-act`, the section's budget |
| `ui/NoteProse.tsx`                | takes a `ref` and a `className` — the bounded element has to be the one carrying the `max-height`                      |
| `ui/NoteSection.tsx`              | the row becomes `NoteItem` (the probe needs a hook per row), clips, and routes on the measurement                      |
| `ui/domain/HeroLift.tsx` + `.css` | 3 lines, and `onReadNote` — which qualifies ADR-0160 §U rather than contradicting it                                   |
| `screens/Home.tsx`                | mounts `NoteFullScreen` + `NoteSheet` for the hero's note, resolving the host through `noteHost`                       |
| `screens/SharedItinerary.tsx`     | a `NoteOp` component: same clip, `עוד`/`פחות`, grows in place                                                          |
| `i18n/he.ts`                      | `notes.clip.more` / `.less` — the two words, repeated rather than imported from `map.know`                             |
| `lib/notes.ts` + `constants.ts`   | `noteReadsFullScreen`'s scope narrowed in place: one consumer now, and the comment says which and why                  |
| `e2e/note-in-a-card.spec.ts`      | **new** — the half only a browser can answer (see below)                                                               |

**What it cost, read off the mockup's own DOM at light/360:** the reported booking sheet's section ⁦565px⁩ → ⁦328.8px⁩, the lifted hero ⁦400.2px⁩ → ⁦207.4px⁩, the body itself ⁦386.1px⁩ → ⁦120.8px⁩ — and ⁦120.8px⁩ again for a structured note, which is the whole argument. The control is ⁦27px⁩ of box answering ⁦44px⁩ of touch.

## One test had to move, and it is worth recording why

`HostNotes.test.tsx`'s _"opens a long note on its own screen"_ seeded fourteen lines and relied on `noteReadsFullScreen` counting characters. The section now asks the box whether it hid anything, and **jsdom has no layout** — both metrics read 0, so the honest answer there is "nothing was clipped" and the tap correctly opened the foot instead.

The spec was rewritten rather than deleted: the box is told what it would have measured, on the `HTMLElement` prototype and before the render (the probe runs in a layout effect keyed on the note's text, so stubbing the element afterwards is never read). `SnapSheet.test.tsx` and `land-at-top.test.ts` already do this for their own scrollers, including the `delete` in `afterEach` that `restoreAllMocks` does not cover.

New specs came with it: a note that **fits** is untouched (no control, tap opens the foot — ADR-0153 §4 intact), the control wears the foot's own class and words, the hero's control is absent when the board has nowhere to send you, the shared page's grows in place and opens no overlay, and `useIsClipped` answers `false` where there is no layout at all. `notes.contract.test.ts` guards the two CSS facts that would ship looking fine while being wrong — the bound is a `max-height` and not a `line-clamp`, and the fade's stops are absolute.

**And a new e2e file**, because the decision is a height and everything above is jsdom being told what to think. `e2e/note-in-a-card.spec.ts` opens the booking sheet in a real browser and checks that the box really bounds the body at the stated budget, that the tap and the control both reach the note's screen with **both codes** intact, that a note which fits keeps its foot and gains no control, that the 44px target really extends past the ⁦27px⁩ text (a hit test 20px above its centre still lands on the button), and — by sampling the rendered pixels — that the mask does not grey a short note's last line. That last one has no other home: a mask paints, and neither a unit test nor a CSS-text contract can see the result.

## Left open

- **The budgets** (⁦6⁩ / ⁦3⁩ / ⁦6⁩) want a device pass; the mockup carries ⁦4⁩/⁦6⁩/⁦8⁩ as controls and nothing else moves if they change.
- **A task's body** (`IndexTasksView`'s `.tsk-open-body`) is the same shape on a different entity, and a task has no full screen to route to — a different decision, left on the backlog.

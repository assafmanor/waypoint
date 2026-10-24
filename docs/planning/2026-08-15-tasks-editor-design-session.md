# Tasks — the editor and the read surface, designed

**Date:** 2026-08-15
**Mockup:** [`mockups/task-editor-and-read-v1.html`](../../mockups/task-editor-and-read-v1.html) — **Proposed; nothing here is built.**
**Follows:** tasks phase 1 ([session note](2026-08-15-tasks-phase-1-built.md)), against which the owner reported.
**Build plan:** [`2026-08-15-tasks-build-plan.md`](2026-08-15-tasks-build-plan.md)

## Why this session happened

Owner report against shipped phase 1, verbatim: _"The creation form seems amateur. This needs a mockup. For example the 'important' button is really ugly"_ · _"On the index, tasks should be above notes"_ · _"Who is in charge shouldn't have a default and it should have a different look, also של כולנו isn't a good description, it doesn't make it obvious that it's for everyone independently"_ · _"No preview for a task and no way to see the task info (פרטים)"_.

**The reports arrive together because they are one omission.** ADR-0188 designed the row, the two menus and both Home bands. It never designed the **editor**, and phase 1 built one anyway from `NoteSheet`'s shape without rendering it. Three of the four reports are that gap; the fourth is a field with no reader.

## What reading the code found, before anything was drawn

1. **"Ugly" has a measurable defect under it.** The app ships a boolean-in-a-form idiom — `EventForm`'s `יש הזמנה` row (ADR-0136 §1): a `.field` wrapper, `ToggleChip tone="cta"`, and **`size="touch"`**, whose stated job in `toggle-chip.css` is _"The touch floor (ADR-0017), for a chip that is its surface's primary control rather than one of a strip"_. Phase 1's `חשובה` has none of the three, so it is not merely orphaned — **it is 29px against a 44px floor.** Rule 8 found this, not an eye.

2. **`של כולנו` is a name collision with phase 6, not a copy nit.** Brief §6 has three assignment states: _nobody_ ("one of us" — one tick closes it), _one person_, _everyone_ (each completes it for themselves, `completedBy[]`, phase 6). Phase 1 put `של כולנו` on the **first**. That is the phrase the **third** needs, and the owner read it as the third — which is the report. The brief's own words for the first state are "one of us".

3. **`body` is write-only.** The editor writes it; one grep says nothing renders it — not the row, not the menu, no detail surface.

4. **The read surface already exists one feature over.** ADR-0153 §4's second amendment: a row's tap **opens it where it is** — the clamp lifts, a foot line appears, no sheet and no scrim (`NoteOpenFoot`). A task inherits that idiom; the sheet alternative is drawn only to be rejected.

## What the render found that reading did not

**The first draft of §3 was growing a second scroller, and the number is what exposed it.** It drew a bespoke `flex-wrap` grid of 60px avatar columns. At a realistic roster — five people plus the unassigned option — that measured **156px and wrapped to three lines**, against the shipped pill row's 21px. Redrawn as what it should always have been: **`ChoiceGrid layout="pills"` with a person where the glyph goes.** The scroll, the snap, the edge mask, `useCenterSelected`'s centring and the radiogroup ARIA all arrive from the primitive; `ChoiceGrid` grows exactly one optional field on `Choice` (an `AvatarPerson` instead of an `icon`). Result: **48px, one line, 639px of scroll width** at 360 (661px while the unassigned option still read `מישהו מאיתנו`; the owner's shorter word took 22px off it).

**A new host is not bound by the app's deferred 44px debt.** `choice-grid.css` records in place that `.choice-pill` is 36px "here AND on the shipped category selector", and that raising it moves three shipped surfaces, one with an arithmetic card height (ADR-0148 §1). A new surface scopes its own sizing — the pattern `.category-pills` already uses — and meets the floor for free: **46px measured, against the shipped pill's 28px.**

**Two errors in this file's own first draft, both invisible in source and both caught by rendering.** The avatars were drawn as an invented `.avatar.av-md` tree and rendered as bare initials with no circle and no hue — the real one is `.wp-av.wp-av-sm` plus an inline `var(--id-*)`. And §1's "before" frame was drawing the _proposed_ assignee row, so the pair differed only in which option was lit. Both are `references/pitfalls.md`'s "real CSS over an invented tree is not the app"; both looked plausible. Recorded in the file's own header, because this is the catalog's recurring failure rather than an incident.

## Measured (360px, webfonts loaded, no console errors)

|                     | shipped                    | proposed                                                         |
| ------------------- | -------------------------- | ---------------------------------------------------------------- |
| `חשובה` control     | **29px** — under the floor | **44px**                                                         |
| assignee option     | **28px** — under the floor | **46px**                                                         |
| assignee row        | 30px                       | 48px, one line (661px scrolled)                                  |
| the whole form      | 419px                      | 470px                                                            |
| task row            | 60px                       | 60px — the details mark costs **0**                              |
| reading the details | —                          | **+46.3px** in place, against **216.5px** for the rejected sheet |

## The owner's three answers, 2026-08-15 — all folded in, none left as a fork

The mockup was rendered again after each; the only number that moved is the avatar row's scroll width, above.

**1. `חשוב`, not `חשובה`.** Grammatically `משימה` is feminine, so the shipped string agreed with it; the call is that the flag is a neutral **label** rather than an adjective about the task, so it does not inflect. Carries to the `⋯` sheet's `סימון כחשוב` / `ביטול הסימון כחשוב`. The mockup's "before" frames keep `חשובה`, because they are the record of what shipped.

**2. `לא משויך` wins the three-way fork — and the default comes back with it.** This reverses this session's own first recommendation, and the word is exactly what reverses it. The draft removed the default on the rule "no answer should be presumed"; that rule is right while the word is `של כולנו`, because that word is a **claim** about the task and a presumed claim can be false. `לא משויך` is a **description of the form's state**, and when nobody has been chosen nobody is in fact assigned — so the lit pill cannot be wrong. What is **saved** is identical either way (`assigneeUserId: undefined`); only what the reader is told changes. Also note the masculine form is the same call as §1: it names a state, it does not agree with `משימה`.

The two losing candidates, recorded so they are not re-proposed: `מישהו מאיתנו` (the brief's own words — accurate to the behaviour, but it **promises** that somebody will take it, which the form does not know) and `של הקבוצה` (too near the `של כולנו` it replaces, so it repeats the phase-6 collision in different words).

**3. The Index tile order: `הזמנות · משימות · מסמכים · פתקים`** — recommended, and **built** in this change with a spec pinning it.

The rule below the spine is one line: **order by whether the tile can be LATE.** A task expires and a missed one costs the thing it was guarding (brief §11); a document does not change; a note never expires at all — ADR-0153 §1's own tile line is "what did someone just write", a browse rather than a need.

**This session's earlier recommendation put `משימות` first, and that was wrong for a reason written in the app's own source.** `Index.tsx`'s comment on the tasks tile already says prominence for a time-bearing entity comes from the **Home bands** (phases 2–3) rather than from chrome. Leading the landing with tasks spends the lead position on prominence the bands are already paying for, and takes it from bookings — the trip's spine, the most-consulted tile on the ground, and the lead since ADR-0047/0049. So the spine keeps first and the rule orders the three below it.

**What the reorder actually cost, because it was not the one line it looked like:** three e2e specs selected the documents tile as `.wp-idx-tile` **`.nth(1)`**, which the reorder silently repoints at tasks — a wrong screen, not a failed click. All three now select by name, so the next reorder cannot break them either.

## Still open, and owed before this is built

- **An ADR promoting the mockup**, or an in-place amendment to ADR-0188. Not written — the mockup stays Proposed until it exists, and it is now the only thing between this design and its build.
- **The device pass** gains two: whether a 38px avatar in a pill reads as a person at arm's length, and whether a selection ring reads as "chosen" beside an avatar carrying a strong hue of its own.

## Shipped in this change, ahead of the ADR

The two words are user-visible defects the owner has already ruled on, so they went into `he.ts` now rather than waiting for the editor rebuild: `importantLabel`, `manage.flag`, `manage.unflag`, `sheet.nobody` and `subject.group`. The rest of the mockup — the `.field` wrapper, `size="touch"`, the avatar pills and the open-in-place read — is the build, and waits for the ADR.

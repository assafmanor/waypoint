# 0153 — The notes surface is flat and searchable, a note is a mark on its host, and notes are the one thing with no mode gate

**Status:** Accepted (owner sign-off 2026-08-01)
**Date:** 2026-08-01
**Session note:** [`planning/2026-08-01-session-205-the-notes-design-session.md`](../planning/2026-08-01-session-205-the-notes-design-session.md)
**Design references:** [`mockups/notes-screen-v1.html`](../../mockups/notes-screen-v1.html) (§A — the tile, the screen, the row's nine states, search, the row menu, the editor, the card tier, offline, the empty states) and [`mockups/notes-on-a-host-v1.html`](../../mockups/notes-on-a-host-v1.html) (§B — the mark, the reach, the composer, and every number quoted below)
**Prerequisite brief:** [`planning/2026-08-01-notes-design-brief.md`](../planning/2026-08-01-notes-design-brief.md), whose §A/§B/§D this ADR closes. Its §C (Home + Hero 2.0) is deliberately **not** closed here — see §10.

**Implements:** [0152](0152-a-note-is-one-entity-with-an-optional-host.md) — the model, the two tiers, the vocabulary, `EventCategory` as the category, group-only visibility, the migration. Nothing here re-opens any of it; §6b/§6c of that ADR were amended into it during this session and are the authority for the host forms.
**Builds on:** [0098](0098-index-landing-and-dedicated-screens.md) (the landing this takes its third tile on, and §2's chip/search/collapse apparatus), [0120](0120-filter-reveal-is-shared-infrastructure.md) (the reveal every list control uses), [0102](0102-search-mode-scope-and-multi-field-matching.md) (multi-field search), [0138](0138-the-row-menu-is-one-surface-and-icons-are-ui.md) (the row menu, and emoji-vs-icon), [0150](0150-a-form-refuses-at-the-field.md) (the editor's one refusal), [0078](0078-feedback-state-family.md) (both empty states), [0025](0025-trip-mode-edit-capability-tiers.md) (the tier framework §9 applies rather than replaces)
**Relates:** [0049](0049-index-tab-mode-and-lifecycle.md) §3 (the Index is mode-neutral chrome), [0151](0151-a-suggestion-has-a-source-and-a-reason.md) §5–§8 (the card tier's contract), [0115](0115-plan-mode-place-research.md) §6 (the "Plan mode only" rule §9 declines to repeat, because it was already withdrawn), [0149](0149-the-top-bar-is-two-rows.md) / [0116](0116-day-aware-shelf-and-idea-target-day.md) (the density budgets §6 and §7 are spent against)

## Context

ADR-0152 settled what a note **is** and left the geometry open, correctly: it named the grammar to spend and no pixels. The brief then split the remaining work into four pieces and warned that the second would be underestimated. Two mockups answered §A, §B and §D; this ADR is their decision record.

Three things the mockups found that no amount of prose would have, and they shape the decisions below:

- **A host-grouped notes list does not survive its own fixture.** At 40 notes across a realistic trip they fall on **28 distinct hosts** — **1.1 rows per header** (and 1.0 at six notes, 1.2 at eighteen), so the headers out-scroll the content they organise. _Corrected 2026-08-01, session 206: this ADR first said 22 hosts and 1.4, which the panel does not report when the fixture is driven. The correction strengthens the decision — grouping is worse than it was argued to be — and is recorded rather than quietly fixed because the number is quoted in three places._
- **The day row's meta line is exactly full.** At 390px it has 151px and its content needs 151px; the mark needs 21px that do not exist. That is not a defect the mark created — it is a ceiling it revealed, and every coded row was already at it. _Qualified 2026-08-01, session 206: the **151px available** is layout-driven and reproduces exactly, but every width derived from TEXT here (this ADR's `151px needed`, ADR-0152 §6c's `174px`, the host mockup's `+19px` and `113px vs 152px`) depends on the Assistant webfont, which a sandboxed browser cannot load — so those figures are evidence for the decisions, not acceptance criteria. Re-measure on a device. Two rows of the host mockup's panel are also now historical: with §6c's place-name-drop rule in force there is no place name left to wrap, so it reports 0px both ways._
- **`EventCard` has no `meta` prop.** The line is assembled inside the component from two string props (`EventCard.tsx:148`), so nothing could be passed through it.

## Decision

### 1. The Index gets a third tile, and its preview line is the newest note with its author

Bookings preview a "next"; documents preview their type groups. A note collection has neither, but it has a **newest** — and that is the only line on the tile that changes and is worth a glance. The real question at a glance is _"what did someone just write that I have not read"_, so the author is part of it.

Rejected: a count split (`N general · N attached`), a number that barely moves; and the categories present, which duplicates the chip row one screen inside.

### 2. The screen is FLAT, ordered by recency, and has no grouping at all

The load-bearing decision, and the argument matters more than the measurement.

There are exactly two jobs on this surface. **(1) "What do we know?"** — browsing the group's memory. **(2) "What did we say about the hotel?"** — a targeted lookup. **Job 2 is not this screen's job**: it is answered on the hotel's own row, by §6. Every host carries its own notes, so grouping here rebuilds — worse, and 28 times — what the host surfaces already do perfectly.

That is what makes flat the _answer_ rather than a compromise. The fixture only confirms it.

**And it needs no second axis.** `ChoiceGrid` is single-select, so a "general" chip beside the category chips would make "food **and** general" unaskable. The **absence** of a host chip on a row is the whole signal, and it costs nothing.

### 3. The screen's controls are ADR-0098 §2's, adopted from day one — and there is no "past" collapse

The category chip row (`ChoiceGrid`'s `pills`, second consumer, no change), search over **title, body and url** (ADR-0102), and `RevealList` on every control that changes the list (ADR-0120 — a `.filter()` here is the one-off that made the Map jump for two releases). A notes list crowds faster than a bookings list, so this ships with the apparatus rather than earning it later.

**No past-collapse.** A booking that has happened is finished; a note on a past event is not. _"There are no bins on the street"_ was written on day two and is true on day ten — a time-based collapse would hide exactly the notes that proved themselves.

### 4. The row is a `ListRow`, and it shows three of the seven facts it could

Badge = the **category glyph**; title line = the note's own words; meta = the **host chip**, then author · when; trailing = a link mark when there is a url. Dropped deliberately: the category as a _word_ (the glyph says it, ADR-0038) and the author's avatar (a second identity system per row, serving no decision the reader is making here).

Three rules the mockup's nine states forced, each of which would otherwise have been discovered late:

- **A note with a title _and_ a body shows the title, and the body drops to the meta line.** Printing both is the same sentence twice — the failure ADR-0151's tile amendment already paid for.
- **A url-only note's title line is the url**, as an LTR island via `ltrIsolate` — never `dir="ltr"`, which is lint-blocked and would lay the whole row out left-to-right (ADR-0118).
- **A note with no category falls back to `DEFAULT_EVENT_ICON`** (📌) and still counts under `other` in the chips, so it cannot vanish from a filter.

Pending writes dim the row; **failed writes deliberately do not** (ADR-0092) — a refusal must stay prominent.

**Amended (2026-08-02, session 206, owner's report) — a row's tap opens a READ surface, and the editor is one press inside it.** The tap opened the editor, which is the wrong answer to _"what does this say"_ twice over: the row's title line clamps to two lines, so a long note could not be read **at all** without entering a form; and entering a form to read is both a risk (an accidental edit on a surface whose primary is `שמירה`) and the wrong posture. The owner reported it plainly: _"on the note view, there's no preview for note, clicking on a note row leads to the note editing form. We should probably use something similar (but fitted for notes) to the booking preview."_

- **It is `BookingDetail`'s grammar rather than a new shape** (`NoteDetail`): a read-only sheet, `עריכה` as its one visible action, and the head/body/facts blocks that surface already ships. The badge is the resolved category glyph, so the preview is visibly the row you tapped.
- **The head is a rule, not a layout.** A titled note heads with its title; an **untitled** one heads with the noun `פתק` and its words read below it, unclamped — the words are the CONTENT, and printing them as heading _and_ body is this section's own "same sentence twice" failure. The host is named **once**, under the head (`פתק כללי` when there is none); a first draft also put it in a fact below and it stuttered on every untitled hosted note.
- **Delete stays on the `⋯`.** A destructive verb does not belong on a surface an ordinary tap opens — which is also §8's division: the menu holds verbs, this holds content.
- **The rule is the note's, not this screen's.** A host's own note section (`HostNotes`, §8) clamps its lines exactly as these rows do, so its tap opens the same preview. Sending one tap to a reader and the other to an author would have left the four host surfaces with no way to read a long note either.

Same-shaped mistake as the one ADR-0152 §6's amendment fixes on the same day, one surface over: **a reader was being sent into an author's surface.** Worth naming as a pair, because neither was a layout bug and no test could have failed.

### 5. The editor has one refusal, and v1 has no host picker

Body is the primary field; title and url optional. The single refusal — neither body nor url — is marked **on both fields that can cure it, in one call** (ADR-0150; a refusal that stops at the first problem sends the user round the loop again). The primary is never `disabled` as a stand-in for it.

**A note created from the notes screen is always general.** A host picker is a sub-surface — search across five entity types — and it is not built. This is a real limitation, accepted knowingly: attachment is established from the host's side, which is where it is natural anyway.

### 6. On a host, a note is a mark in the meta line — and that costs `EventCard` three changes

The mark is one shape everywhere: the `clipboard` `Icon` the tile and the empty state use, so "note" has one silhouette. A count only past 1. Neutral `--muted` — a note is not time, not place, not plan mode, and rule 4 has no colour to lend it.

The three changes are enumerated in **[ADR-0152 §6c](0152-a-note-is-one-entity-with-an-optional-host.md)** and not repeated here, because the second and third change rows that have **no notes at all** and therefore belong with the model: the meta line becomes `nowrap` with the text elementised (flex wraps _before_ it shrinks, so a shrinkable span alone measured identically), and a row carrying both a confirmation code and a mark **drops its place name** rather than degrading it to a two-character stub.

### 7. `MaybeCard`'s tile takes the mark in its corner, and the reason is eight pixels old

The tile's meta line belongs to ADR-0151's ranking reason, and that ADR's own amendment **refused** a second line at this width because the wrap cost 8px on a 76px tile just redesigned to save them. So the tile cannot have both. Measured: corner **0px**, replacing the reason 0px, both-at-once **+6px**.

Corner wins. Replacing the reason is rejected not on pixels but on meaning — the suggestion was built to say _why_ it is there, and trading that for a note count sells last week's feature for this week's.

**Corrected 2026-08-01 (session 206), because the original note was wrong twice.** It said the top-inline-start corner _"is where a `✕` would go if the tile ever gained the shelf's remove variant. It has not."_ The tile **has** that variant, shipped, in Plan mode (`PlanDay.tsx` passes `onRemove`), and `maybe-card.css` puts its `✕` at `top: 6px; inset-inline-**end**: 6px` — the opposite corner from the mark. So there is no collision and the contingency as written could never have fired. The adjacency actually worth checking is the mark against the **glyph**: `.compact` is a row axis with `.wp-maybecard-ic` leading at the inline-start, and the mockup drew the corner variant with neither a `✕` nor a glyph beside it.

### 8. The reach is four entrances to one destination, and the mark is not a tap target

The row menu, the note section on the detail surface, the `＋ פתק` control, and the notes screen all arrive at the same place. **The mark itself is a read-only indicator**: it is ~16px against a 44px floor (ADR-0017), and widening its target would put it in competition with opening the row it sits in. Conservative, and flagged in the mockup as worth feeling on a phone.

**`MaybeItem` has no detail surface** — the one real gap in ADR-0152 §6's rule. Closed without a sixth surface: the sheet the tile already opens gains the same note section the detail surfaces get, above its verbs.

**Corrected 2026-08-01 (session 206, phase 5): there was no such sheet.** The tile's only tap was `onSchedule` — it opened the **schedule** form, which is the wrong room for a note section (its question is which day and what time). So the sheet was built and **the tap now opens it**, with `שיבוץ ליום` as its first action; the reasoning, the rejected alternatives and the reason the extra tap is affordable are in **[ADR-0116 §5a](0116-day-aware-shelf-and-idea-target-day.md)**, since the gesture is that ADR's to change. A **document** likewise takes its section in the manage sheet rather than in the viewer, whose body is a pinch-zoom image in a card that clips — so of §8's four entrances an idea and a document each have three (the sheet, its `＋ פתק`, the notes screen), and the fourth is the row menu they _are_.

**Amended (2026-08-02, session 207, phase 6) — a PLACE has three of the four entrances, and its row is its body.** The gap was real and invisible from the mockup, which drew the place host as a `ListRow`: `Map.tsx`'s `PlaceRow` is not one. It has **no kebab and no `RowManageSheet`**, and a place's "detail surface" is the same row again rendered inside `.map-placecard` at the `map` sheet stop — so on the face of it a place had **none** of §8's four entrances. The owner's call was that a place carries notes in v1, and reading the Map's own files turned that from a sub-project into three modest changes:

- **The mark is one more item in `.map-m`, rendered LAST.** This row needed none of ADR-0152 §6c's three changes, and the reason is worth stating because it is the general rule: `.wp-event-m` needed `nowrap`, elementisation and a drop rule because it is a **joined string** on a line that must not grow, while `.map-m` has been `flex-wrap` with every fact its own element since it shipped. Rendering the mark last means the item this line drops to the next row first is the mark — so a crowded row can never lose a semantic tag to it, and no drop rule is needed.
- **The body rides `renderRow`, gated on `selected`** — the one curried renderer the sheet list, the ghost row and the place card all share, so a place's notes reach **the card at the `map` stop and the list at `full` from one implementation**, with no sixth surface and no gating question. The entrance is the tap that already selects. Order inside the row is facts → notes → verbs (`BookingDetail`'s order, and the idea sheet's); content under a primary action is the one arrangement no surface here uses.
- **The composer is `.map-draft-scroll`'s second child** in `MapPlaceForm`, the scrolling middle ADR-0148 §1 built. It is the only host whose composer carries **no hint**: a place has no category of its own, so the sentence that hint exists to say is not true here, and this is the one card in the app whose height is arithmetic.

So a place has the card, the section's `＋ פתק` and the notes screen — three entrances, and not the row menu, which it has never had. **The one owner question the mockup left open is answered by taking its recommendation:** on a maximally crowded meta line at **360px** the mark costs one extra line (measured: 2 lines → 3, +17px; at 390px it costs **zero**). That is accepted rather than bought back with an `EventCard`-style drop rule, because the alternative makes the mark disappear precisely on the rows most likely to have been written about, and no semantic tag moves either way.

Two consequences recorded rather than discovered later. **The selection card is bounded now** — [ADR-0148 §1](0148-the-map-place-form-has-room-and-one-way-out.md)'s `:has(> .map-draft)` becomes `:has(> .map-draft), :has(.note-sec)`, amended there — and inside it **only the note list scrolls** (owner: _"only the notes themselves should be scrollable, everything else is locked"_, and _"the שבץ ליום button should be sticky and always be visible"_): `.place` becomes a grid in that one variant, because a wrapping flex row can only distribute space between LINES and no single wrapped line can be made the flexible one. And **`.map-refs-foot` is now the ROW's child rather than the reference block's**, which is what lets the grid pin it — and incidentally fixes a shipped omission, since a selected place with no references used to get no `שיבוץ ליום` at all.

### 9. Notes are mode-neutral. No Plan gate anywhere — and this is the unusual answer, so it is stated outright

Applying [ADR-0025](0025-trip-mode-edit-capability-tiers.md)'s framework rather than inventing one — **an edit's tier is its blast radius, not its mode**:

- **Reading** — ungated, every mode, every surface. Offline-complete (rule 5); not a tier question.
- **Writing and editing a note, hosted or general — Tier 1.** It destroys nothing, moves nothing, ripples into nothing, and it is **most valuable on the ground**: _"the entrance is round the back"_ gets written while standing at the entrance. A note is one of the very few structural-looking things whose natural home is Trip mode.
- **Deleting — Tier 2**, by that ADR's own Skip-vs-Delete distinction, but **ungated**: an inline confirm, not a Plan escape. Deleting a note destroys a sentence, not a plan, and ADR-0011's hard-commitment gate does not reach it.
- **Tier 3 — nothing, in v1.** No bulk arrange, no reorder, no cross-day move. Custom categories would have been the candidate and ADR-0152 §5 deferred them.

The screen inherits mode-neutrality from ADR-0049 ("mode changes chrome only"); what is new is that the **authoring** is ungated too.

**The tempting exception is refused on precedent.** "Surely a paid AI-tip strategy is Plan-mode only" — that call was made once, on search, and the owner **overturned it**: ADR-0115 §6's "Plan mode only" was withdrawn because the paid half is answered **by the arm, not by a mode gate**. ADR-0151 §7, as amended by ADR-0152 §8, now keys arming to `cost`. Do not re-introduce a mode gate here; it was tried and withdrawn one surface over.

### 10. What this ADR does not decide

- **Home** (the brief's §C) — the quick-access tile and the change-feed line. Held because the sharper half is a **dependency, not a gap**: a note on the now/next event is a candidate answer to the Hero 2.0 brief's own open question, so notes puts **no mark on the Board** (a per-entity control there is what got backed out in ADR-0121's amendment §4) and hands that reach to the Hero 2.0 session. Its brief carries the pointer.
- **The card tier's behaviour** — drawn (§A6) so the layout has a place for it, wired by whatever registers the first strategy. Nothing emits cards; ADR-0152 §9 holds.
- **Two things a desktop browser cannot settle**, both flagged in the mockups: whether the editor's textarea should autofocus (it opens the keyboard — ADR-0148's second amendment is a whole ADR about inheriting that default onto the wrong surface), and whether the mark wants a tap target after all.

## Consequences

- **The Index landing goes to three tiles**, on a shape ADR-0098 measured at five. No navigation change: the notes screen is a `useOverlay` sub-view exactly like bookings and documents.
- **`EventCard` changes for every row, not just noted ones** — the `nowrap` meta line ellipsises where it used to wrap beneath the sync badge. Called out because it is a behaviour change to the shipped day card (ADR-0152 §6c).
- **`ChoiceGrid`, `RevealList`, `ListRow`, `EmptyState`, `Modal`, `Field`, `useFormErrors` and `SearchOverlay` all gain a consumer and nothing gains a variant.** The only net-new CSS is the note row's host chip, the mark, the composer's chip, the detail-surface note section, and the card tier.
- **New `he.ts` copy** for the tile, the screen, the row menu, the editor, the composer and both empty states; `BookingSheet`'s `הערות` label becomes `פתקים`.
- **Two mockups become the build spec** and enter the catalogue (ADR-0097).
- **The brief's §A, §B and §D are closed**; §C stays open and is now a stated hand-off rather than an unscheduled question.

## Alternatives considered

- **Group the notes screen by host.** The intuitive answer, rejected on the argument in §2 and confirmed by 1.1 rows per header at 40 notes. It also rebuilds what every host row already does.
- **A general/attached facet in the chip row.** Rejected: `ChoiceGrid` is single-select, so it would make "food and general" unaskable, and the host chip's absence already carries the fact for free.
- **Collapse past notes**, mirroring the bookings screen. Rejected (§3): a note on a past event has not passed.
- **Put the mark on the title line, or give it a tap target.** Rejected (§6, §8): the title line reflows and the hard/soft tag already drops to a second line on a long title, which reintroduces the height problem; a 16px target against a 44px floor competes with opening the row.
- **Let the maybe tile's mark replace the ranking reason.** Rejected (§7) on meaning rather than pixels.
- **Gate anything behind Plan mode.** Rejected (§9) on ADR-0025's framework and on the precedent of ADR-0115 §6's withdrawal.
- **A host picker in the editor**, so a note could be attached from the notes side. Deferred (§5): a cross-entity search sub-surface, for a path that is natural from the host's side anyway.

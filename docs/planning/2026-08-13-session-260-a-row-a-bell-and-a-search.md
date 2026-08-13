---
date: 2026-08-13
session: 260
topic: The document type picker becomes one row, the reservation badge stops being a page, and the section gets a search
adrs:
  - 0052
mockups:
  - document-types-in-one-row-v1.html
---

# Session 260 — a row, a bell, and a search

Three owner reports against [#586](https://github.com/assafmanor/waypoint/pull/586), which had shipped
that morning (session 259). Two arrived together, the third mid-session.

> "First of all הזמנה and אחר use the same emoji - big no no"

> "Second, there used to be only one line of categories to select from, now there's 3. It looks ugly
> and is hard to use. See how the app handles this and what fits best for the documents, then suggest
> a fix"

> "Also add search like bookings and notes have (where category titles are also shown)"

Shipped as [ADR-0052](../decisions/0052-document-lifecycle-view-manage-and-feedback.md)'s session-260
amendment (§6/§7/§8) and [`mockups/document-types-in-one-row-v1.html`](../../mockups/document-types-in-one-row-v1.html).

## What the reports had in common, and it is the session's one lesson

Session 259 grew `DOCUMENT_TYPE` from four to eight and answered "there are more of them now" by
**scaling what was already there**: a 4-up card grid became `columns={3}`, and a badge set whose stated
invariant is "four unmistakable badges" gained a fifth paper glyph. Neither move was wrong-headed;
neither asked whether the shape survives the new count. Both defects are that question going unasked,
which is why the fix for both was to **draw it** rather than to argue about it.

## What reading the code changed, before anything was drawn

**The app had already answered the picker question, at a larger count.** `CategoryField` (ADR-0109 §11)
puts **nine** `EventCategory` options in one horizontally-scrollable pill row, and `ChoiceGrid`'s own
doc comment names the reason: _"too many options for a fixed grid on a narrow phone."_ The document
picker is that case and had reached for `columns={3}` instead. So the fix was the third host of a
shipped mechanism and **zero new CSS** — not a new shape.

**The badge collision was not new either.** `packages/shared/src/icons.ts` already offers `🧾` and `📄`
adjacently in its _services_ group, as two options for one idea. That is where the pair came from.

**The Hebrew labels make documents the easier case, not the harder one.** Measured off the mockup:
eight document pills scroll 713px against the nine event-category pills' 806px, because
`דרכון · ויזה · כרטיס` are shorter than `תחבורה · פעילות · אתרים`. If the row is affordable on the
shipped surface it is affordable here.

## What the render found that reading could not

- **"Ugly and hard to use" was arithmetic.** `.booking-sheet` caps at `80vh` with `overflow-y: auto`.
  The grid made the upload body **652px against a 488px cap**, so at 360×640 the sheet opened with
  **140px to scroll before `העלה`** — and the file tiles, the one field the form cannot be saved
  without, were below the fold. The pill row: **0px**, and the picker itself 202px → 38px.
- **The 44px touch floor is free here, so the objection to it is scope and not room.** At 44px the
  document row is 46px against the grid's 202px and still needs no scrolling. What stops it is that
  `.category-pills` is shared with `EventForm`, `NoteSheet` and `MapPlaceForm`, whose card height is
  arithmetic (ADR-0148 §1). Left as a control in the mockup and a line in the backlog.
- **A lone search button costs the same row as a full chip row** — 32px either way, because the row's
  height comes from the button. That killed "search only" as the cheap option before it was offered.

The first of those is the session's best argument for the format: the report _sounded_ like taste, and
one render turned it into a number nobody could disagree with.

## The forks put to the owner, and the answers

1. **The `reservation` glyph.** Recommended 🛎️ (unused in the repo, no silhouette twin, covers hotel ·
   table · RSVP), with 📅 · 📑 · 🔖 · today's 🧾 as toggles. **Answer: 🛎️.** 📅 was argued against rather
   than merely unpicked — `Icon.tsx` already retired it from two jobs.
2. **The search's shape**, because the brief's parenthetical read three ways and documents already state
   the category on screen as a group heading. Drawn as א׳ (chips replace the headings) · ב׳ (both) ·
   ג׳ (search only, headings move into the results). Recommended **א׳** on the numbers: 733px flat
   against 928px grouped for twelve documents, and the type stated once rather than twice.
   **Answer: ב׳ — keep the headings.**

**The call made the change smaller, which was not in the forecast.** Because the screen keeps
`.doc-group`, the search results reuse **the screen's own grouped renderer** instead of a shape of
their own — which deleted the one CSS rule the mockup had asked for (a `.gt` re-padded for life inside
a `.listcard`, which only א׳'s single flat list ever needed). The whole search ships zero new CSS. Worth
recording as evidence against the reflex to defend a recommendation: the owner's answer was cheaper to
build than the one that was measured to be cheaper on screen.

What the parenthetical _did_ settle on its own, and it was never the fork: the chip **density**. The two
shipped rows disagree — bookings renders worded pills, notes renders them `compact` (ADR-0122 §2) — and
"where category titles are also shown" is the bookings one.

## Two things the build had to get right, and both are old lessons

- **Nothing is filtered out of an array** (ADR-0120). `visibleDocumentGroups` keeps a group whose rows
  all fail the predicate, with `visible: 0`, so the caller can _collapse_ it — heading and card frame
  included, through `RevealRow`, which has been exported since ADR-0120 and until now was used only by
  its own test. `groups.filter((g) => g.docs.length > 0)` is the version that pops a heading out with no
  animation while the rows beside it collapse, and it is what the Map jumped for two releases.
- **Back peels the filter before it leaves** (ADR-0102), sharing one handler with the header's arrow
  (ADR-0103). That is why the filter's state had to live in `IndexDocumentsView` rather than in
  `DocumentsSection`: the screen owns the one `useBackLayer` and the back row, so it owns the state; the
  section keeps the chips, because it is the half that knows the counts.

## Housekeeping worth naming

- **The rebase went back and forth once, in public.** Asked to rebase onto main, the branch was moved
  there and #586's still-unmerged commit dropped, so the design PR showed only its own diff. Then the
  build began and the eight types were gone — the design doc was independent of #586, the build is not.
  Restored as a stack. The lesson is the ordering: check what the _next_ step needs before pruning a
  dependency, not just what the current diff contains.
- **`wrapNav` gained an opt-in `mode` flag** rather than a fourth open-coded provider stack. A
  `SearchOverlay` host needs `ModeProvider`; opt-in because `ModeProvider` itself calls `useTrip()`.
  `IndexNotesView.test.tsx` still has its local copy and moves onto the flag when next touched, exactly
  as the harness's own comment says.

## Verification

`pnpm typecheck` · `pnpm lint` · `pnpm build` green. New tests: 12 in `lib/documents.test.ts` for the
filter/query/reveal derivation (including that a filtered-out group survives with `visible: 0` and that
the stagger is continuous across groups), 9 in `DocumentsSection.test.tsx` for the chips and the search
(including that a filtered row stays **mounted** and that a query on the type label finds a document
whose title does not contain it), and one in `IndexDocumentsView.test.tsx` for back peeling the filter
before it closes the screen.

Rendered at 360×640 and 390×844 in both themes with no console errors; every measurement in this note is
read from the mockup's own DOM. **The running app was not driven** — Docker was down, so there is no
Postgres and no backend — so the visual claim rests on the mockup render and the unit suite, not on a
screenshot of the app.

Ten frontend tests fail on this branch and did before it. Eight are a local `.env` leak
(`VITE_API_BASE_URL` is set, so same-origin path assertions see an absolute URL — they pass with the
variable cleared); the remaining two are `Map.test.tsx` assertions about `.map-controls`/`in-flow`, in
files neither this change nor #586 touches.

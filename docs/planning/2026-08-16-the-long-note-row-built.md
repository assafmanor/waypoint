# 2026-08-16 — The long-note row, and the line breaks it swallowed

**Reports:** owner, over a screenshot of the shipped notes screen with a real Iceland trip in it.

1. _"I want to improve how the notes screen looks. It looks really bad with long notes."_
2. _"Note descriptions formatting (new lines, spaces etc.) don't show in the note preview."_
3. On being shown the fix: _"go with option א, and fix the host surface too"_ — and then, clarifying the second report: _"what I said about line breaks is with the note description, not the title (the wall of text), the line breaks were added to make it more readable, so they must be honored."_

**Shipped:** [`mockups/notes-long-note-row-v1.html`](../../mockups/notes-long-note-row-v1.html) (the design), [ADR-0153 §4](../decisions/0153-the-notes-surface-the-mark-and-no-mode-gate.md) and [ADR-0152 §6](../decisions/0152-a-note-is-one-entity-with-an-optional-host.md) amended in place, and the build.

---

## The finding: two reports, one defect

A note's body renders in exactly four places. Counting them is what collapsed the two reports into one:

| where                         | class              | clamp | `pre-wrap` |
| ----------------------------- | ------------------ | ----- | ---------- |
| body-only note, notes screen  | `.note-body-line`  | ✅    | ✅         |
| **titled note, notes screen** | `.wp-listrow-meta` | ❌    | ❌         |
| a host's note section         | `.note-item-b`     | n/a¹  | ✅         |
| Home's hero preview           | one line by design | –     | –          |

¹ deliberately unclamped — a line on that surface reads whole.

ADR-0153 §4 sent a **titled** note's body to the meta line, which is a shared `ListRow` class carrying neither property. One misplacement, both symptoms: no clamp → the wall (285px, 16 rendered lines at 360, with the author and elapsed time pushed off the end); no `white-space` → the authored line breaks collapsed to spaces.

**The row in the screenshot was closed.** It read as a bug in the expansion and was not one — that was its resting height.

## What the rule actually said

§4's justification was _"printing both is the same sentence twice"_. That forbids printing the body **twice**; it never required the **meta line**. The rule was sound and unbounded, and it was unbounded because every note in `notes-screen-v1.html`'s nine states had a short body — no drawn state could show what an unbounded meta line does. So this amends rather than retracts.

## The fix, and why it is one declaration

`.note-body-line` already clamps to two, already honours the composer's newlines (ADR-0152 §6b), already unclamps under `.wp-listrow.is-open`. `.wp-listrow-title` is already `flex-wrap: wrap`. So `flex: 1 0 100%` puts that same element one line down, and everything comes with it. Both shapes of note now read through one element.

A first draft added a `sub` slot to `ListRow` and was thrown away under root `CLAUDE.md` rule 8 — no other list wants a summary line, and a shared primitive should not grow a prop to avoid the class that already does the job.

Plus `.note-row`, which tops-aligns the badge and the `⋯`: `ListRow` centres them, right for the fixed two-line rows it was born on and wrong once a row can be four lines. A note's own class rather than a `list-row.css` change, because bookings, documents and members cannot grow and moving the shared default would shift their `⋯` to fix a screen they are not on.

The host surface (`NoteSection`) rendered `noteTitleText` = `title || body`, so a titled note's body appeared on **no read surface at all**. One span and one weight; `pre-wrap` and the no-clamp rule were already there. That surface is where a structured note is actually read — the row previews two lines, this reads all of them.

## Measured

From the mockup's own DOM, at 360 / 390, both themes:

|                                         |                                                                 |
| --------------------------------------- | --------------------------------------------------------------- |
| the long row, today → shipped           | **285px → 98.4px** (−65%) · 255 → 98.4 at 390                   |
| the six-row list                        | **679 → 493px** (−27% at 360, −24% at 390)                      |
| a body-only note                        | **0px** — the change does not reach a shape that was not broken |
| breaks kept, the screenshot's note      | **0 → 1 of 1**                                                  |
| breaks kept, a note typed as four lines | **2 → 3 of 3**                                                  |

Rejected beside it: clamping the meta **in place** (75px — keeps the words at provenance size, still swallows the breaks, and deletes the author and time outright, since the clamp applies to the whole meta line and they sit at its end); **one line for a titled note** (60px — densest, tells the reader nothing); and adding `pre-wrap` + a clamp to `.wp-listrow-meta` itself, the shortest-looking fix for both reports, which changes three other lists to repair a note and still leaves the body at 11.5px `--muted`.

## Left open, deliberately

Honouring the breaks makes the two-line preview more expensive: a first authored line that wraps consumes the whole clamp, so the screenshot's note previews as `⁦החלון המעשי הטוב הוא בדרך כלל: 22:00–02:00⁩` and nothing else. That is the author's own first line, so it is not wrong — but 2-vs-3 lines is now a real device call. Shipped at 2, which is what every body-only note on the same screen uses; a mixed clamp would read worse than either. The mockup carries it as a control.

## Four measurement traps, in one session

Worth writing down because each produced a confident wrong number that did not look wrong, and three of them were the same shape:

- **`Range.getClientRects()` counted as lines** → 32 against 61 for one sentence. Rects fragment per bidi run; a line of Hebrew carrying `Aurora forecast` yields three. Use **distinct rect tops**.
- **`height ÷ line-height` as the fallback** → `NaN`, because `.wp-listrow-meta` declares no line-height.
- **Counting lines to measure a swallowed break** → a four-line note reported "+0 lines lost", true and meaningless. What a break costs is **which words begin a line**, so ask it per break.
- **The same trap during verification**, and this one nearly rewrote a correct fix: a rect count said the shipped clamp was not applying, and `display` computed to `flow-root` rather than `-webkit-box`. Both are artefacts — a `-webkit-box` flex item is blockified in the computed value and keeps its line-clamp behaviour, and the element's **height was 36.4px, exactly two lines**. The box is the evidence, not the computed property.

The general form: **when a number surprises you, measure the box.**

## And a fifth, which is about the mockup format itself

Caught after the PR was open, by reading an e2e spec that measures `.wp-listrow-title`'s height.

The proposal's negative margin — there to cancel the title flex's `row-gap` under a title — was written as `.wp-listrow-title > .note-body-line`, which **also matches a body-only note**, where the words _are_ the title line and there is no sibling above them and so no gap to cancel. It was quietly taking 2px off every body-only row on the screen: **76.4 → 74.4px**, on the one note shape this change had no business touching.

**The mockup measured that cost as 0px, and its table was not lying.** Both of its frames — the "today" one and the "בהצעה" one — render body-only notes through the same element, and the file's single PROPOSED block applies to the whole page. So the regression was present in the baseline as well as in the proposal, and the delta between them was genuinely zero.

That is a property of the format, not of this file: **a before/after pair cannot see a regression common to both halves.** The `0px` row was even written as an assertion ("must be 0, actually 0") which made it read as a guard when it was measuring two contaminated numbers against each other. What catches it is measuring against the **shipped** stylesheet rather than against the other frame — which is what the verification harness does, and is why it exists.

Fixed by scoping the margin to the case it is for, with the adjacent-sibling combinator: `.wp-listrow-title > * + .note-body-line`. Body-only rows are back to 76.4px; a titled row keeps its 92.4px.

## Verification

- `mockups/notes-long-note-row-v1.html` rendered at 360/390 × light/dark, no console errors.
- A throwaway harness inlining the **shipped** stylesheets against the **shipped** class names, to check the cascade rather than the mockup's hand-written block: `align-items: flex-start` on both row and trigger, `white-space: pre-wrap`, clamp 2 with the body at 36.4px, `flex-basis: 100%`, and badge centre and kebab centre both at 31px. The selector is `.wp-listrow.note-row`, not a bare `.note-row` — the rule it overrides is also one class, so a tie would have been settled by whichever sheet the bundler emitted second.
- `pnpm --filter @waypoint/frontend exec vitest run` — 230 files, 3888 tests, all passing. `pnpm typecheck` and `pnpm build` green (the backend's first typecheck failure was a missing `prisma:generate`, not this change).

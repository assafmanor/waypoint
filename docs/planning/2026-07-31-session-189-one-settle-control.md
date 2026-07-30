# Session 189 — one settle control, and the drift was bigger than the line said (2026-07-31)

[ADR-0139](../decisions/0139-settling-an-event-from-the-map.md)'s Consequences, taken.
No new ADR: the decision was already written down and the backlog line already scoped it, so
this amends 0139 in place rather than adding a second document about the same call.

Session 188 shipped the **third** hand-rolled settle affordance and backlogged the extraction
with its scope stated: align the **vocabulary**, not the geometry, because a full-width prompt
on a card and a 32px cluster on a 40px row are not the same widget.

## The scope held; the inventory did not

The backlog line named two symptoms — the day-view skip buttons are text-only, and neither
day surface pairs `--ok`/`--miss`. Both were true. Counting properly on the way in found
**four**, and the two extra ones are the ones a reader would have argued about:

- The pair was worded `היינו` / **`דלג`** — a record beside an instruction. They are the two
  answers to `היינו שם?`, so they have to be the same kind of thing; skipping is not the
  absence of an outcome, it is the other one (ADR-0117 §1). Both are records now.
- The focus ring was **teal on the card, violet in the sheet** — two bespoke rules that were
  each half of an idiom the app already has (`App.css`'s `.app[data-mode='plan']` overrides).
  One rule now, and the Map's cluster, which had no focus ring at all, gains one.

The wording one has a receipt worth keeping: `he.ts` has carried a comment since session 188
saying the Map's two verbs "reuse the day view's own words (`actions.wasThere` /
`event.skipped`) so the surfaces cannot drift". It names `event.skipped` — and the day view
had never used it. **A comment asserting that two things agree is not evidence that they do**,
and this one was written by the session that made the third copy, i.e. by the person best
placed to check. It is true now.

## Measuring the move instead of trusting it

A CSS extraction is the change a specificity slip breaks silently, and the old rules were
already carrying two `!important`s put there to win exactly that kind of fight
(`.settle-yes` losing to `.settle-choose button`). So the old markup was rendered under the
old stylesheets and the new under the new, in the same box, and the boxes compared:

| density                | before                           | after                     |
| ---------------------- | -------------------------------- | ------------------------- |
| `compact` (Map row)    | 68×32, buttons 32×32             | **identical**             |
| settled tag + undo     | tag 40.2px, button 32×32         | **identical**             |
| `sheet` (Plan archive) | 39px tall                        | 40px                      |
| `prompt` (day card)    | 36.1px tall, buttons 65.8 + 46.6 | 38px, buttons 70.1 + 77.5 |

The two growths are the same fact: the skip button now has an icon to be as tall as. The
`prompt` strip's 35px of extra button width is the mark plus the longer word, and it does not
overflow down to a **280px** card — comfortably under the ~328px a 360px viewport gives it.
Both `!important`s are gone rather than carried across, which is what the measurement was
for.

## The thing I did not sweep in, and why the number is in the backlog

`design/mockups.md` tells you to re-run `inline-app-css.mjs` after changing any manifest
stylesheet, so I did — and it rewrote **16.4k lines across 15 files**, which is not what a
~200-line refactor should look like. The obvious reading is that I had broken something.

The check that settled it: stash the source changes, re-run against **unchanged** sources.
It still rewrote **~16.6k lines across 14 files**. So the drift predates this session
entirely, and the catalog's re-run rule has not been held for a while.

Only `map-settle-from-canvas-v2.html` is regenerated here, because the experiment also showed
which files were already clean — it was the only one — so its 52-line diff is provably this
session's own and reviewable as such. The rest is one backlog line with the measurement in it.

Two things that generalise:

- **Before believing a big generated diff is yours, re-run the generator against the
  unchanged tree.** It costs one stash and it is the difference between "I broke the
  mockups" and "the mockups were already stale".
- A rule that is restated in fifteen catalog entries and still not held is not suffering from
  insufficient restatement. The tool's own header says it is safe in a pre-commit hook.

## Two smaller notes

- The mockups turned out **not** to be at risk from deleting `.map-sbtn`/`.map-settle` from
  `map.css`: `map-settle-from-canvas-v2.html` draws that cluster with its own `mk-*` classes,
  not the app's. Worth knowing before the next extraction — "the mockup inlines the app css"
  does not imply "the mockup uses the app's class names".
- The test file asserts the **vocabulary** (both verbs carry a mark, both are worded as
  records, `compact` is icon-only but still named, a settle never bubbles to its host) rather
  than the geometry. A geometry test would have passed throughout the entire period the three
  copies were drifting, which is the point: what broke was never the sizes.

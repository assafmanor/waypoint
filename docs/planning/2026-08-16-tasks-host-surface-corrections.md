---
date: 2026-08-16
topic: Tasks — seven owner reports on a host's task surface, designed and built
---

# The host surface, corrected

**Where this came from.** Phase 4 merged (#617) and the owner opened it on a phone. Seven reports came back over the following hours, and they are not a list of small fixes: three of them are the same mistake seen from different surfaces, and two are defects phase 4 introduced.

**Design reference:** [`mockups/a-task-row-that-matches-its-neighbour-v1.html`](../../mockups/a-task-row-that-matches-its-neighbour-v1.html). **Decision record:** [ADR-0191](../decisions/0191-a-task-marks-its-host-and-lives-in-a-section-the-host-already-has.md) — §5 reversed in place, §6–§8 added. No new ADR: everything here either amends that one or repairs it.

---

## The reports, and what each turned out to be

| #   | report                                                                     | what it was                                                                        |
| --- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1   | _"events marked as done/skipped shouldnt show tasks"_                      | an undesigned question — nothing said what a host's settlement meant for its tasks |
| 2   | _"notes and tasks look totally different and have a different allignment"_ | **ADR-0191 §5's own stated cost**, rejected on sight                               |
| 3   | _"I'm not sure where tasks are added … perhaps we need a different path"_  | half a gap (`EventForm` had nothing), half a real question                         |
| 4   | _"tasks in the previews look out of place"_                                | a consequence of 2 and 3                                                           |
| 5   | _"linked tasks don't show their host"_                                     | infrastructure the notes screen already had and this one never picked up           |
| 6   | _"what's happening with place tasks/notes going over each other!"_         | **a defect phase 4 shipped**                                                       |
| 7   | _"the assignee got over the due"_                                          | **a latent defect the host chip triggered**                                        |

---

## The one that matters most: §5 was wrong and it was wrong on paper

ADR-0191 §5 wrote down that the two sections on a host surface would not share a row shape, called it "the decision rather than an accident", and shipped. The owner's first look was _"totally different"_.

**The reasoning was sound and the conclusion was wrong.** `.note-item` genuinely had no lead slot, because a note has no completion control. The mistake was accepting a second row shape instead of **giving `.note-item` a lead slot**.

What the cost actually was, measured in the running app rather than drawn:

|                         | before         | after                         |
| ----------------------- | -------------- | ----------------------------- |
| text edge, task vs note | **40px** apart | **0px**                       |
| task row                | 61px           | **35px** — the note row's own |
| note row                | 35px           | 35px — the notes pay nothing  |
| title                   | 700/13.5px     | 400/13px, same as a note      |

**The lesson worth keeping:** ADR-0191 §5 named its cost honestly and still got it wrong, because naming a cost is not the same as measuring it. The number that would have settled it — 40px of indent between two adjacent sections — was available the whole time and nobody took it.

**What is shared is the geometry, not a component.** Each section keeps its own body; a shared row component would have been mostly a passthrough, and the thing diverging was the CSS.

---

## Two defects phase 4 introduced

**The Map place card's sections painted over each other.** Every rule on that card is keyed by `grid-row`, and phase 4 gave the tasks section `.note-sec` for its geometry — so `> .note-sec` matched **both** and stacked two headers on one row and two lists on another. `.tsk-sec` existed for exactly this disambiguation and those rules never picked it up.

**Four unit specs caught the identical collision inside components and none of them could see this one.** That is the entry worth carrying forward: a positional stylesheet is not a DOM query, so `querySelector` specs give no coverage of it at all.

**And fixing it the obvious way created a second problem the owner spotted before the code did** — _"they take up a lot of space where a map should be visible … what happens when there's notes, events, and multiple tasks?"_ Measured: with tasks as a fifth **pinned** row the card read **411px against its own 420px cap**, on a place carrying one task, one note, one reference and neither a summary nor a document. Nine pixels of slack, and ADR-0182 §9 documents what is past it — the `1fr` track is already 0 and `שיבוץ ליום` goes under the fold.

So the flexible track became **one scroller holding both sections**. Verified with three tasks and two notes: card at its cap, region scrolling 160 of 260px, way-in block on screen. **Stated cost:** the notes header stops pinning. With two sections nothing can pin both.

**The assignee painted over the deadline.** `.tsk-who-mini` was an 18px circle with `margin-block: -7px` — a deliberate overhang so it would not stretch an 11.5px line, measured by ADR-0190 at 61px against 68.5px. That is sound **only while the meta is one line**, and `.wp-listrow-meta` is `display: block`: the moment it wraps, the circle on line two overhangs upward into line one. It is 15px now and fits its line box, so the collision cannot happen rather than being prevented.

---

## Where a decision was put back to the owner rather than taken

**`שיבוץ ליום` hidden on an already-linked place.** Implemented, then reverted before commit: **ten shipped specs failed**, and they encode ADR-0135 §1. The reason is structural rather than fixable by re-fixturing — the Map's list is _built from_ places already used by events and bookings, so "hide when linked" hides the verb almost always, and a place can legitimately be visited twice. Recorded on the backlog with the number instead of pushed through.

**The meta line's second row.** The owner proposed it after seeing all four candidates rendered, and it is better than the two I had: deadline on line one, host chip and assignee on line two. It costs 1px against the accidental wrap and gives the chip 89px instead of 73, so a host name reads whole where both `nowrap` repairs mangled something.

---

## One argument in the ADR was wrong, and the owner caught it

§7's first draft argued that a note has no life outside its host while a task has its own screen and tile. **Notes have an Index tile and a screen** (`IndexNotesView`). The asymmetry does not exist and the argument resting on it fell.

What survives is narrower and is all §7 now rests on: **a note _is_ its body**, so a free-text composer omits nothing from it, while a task's **deadline** is what puts it on the band — so a title-only composer systematically produces the weak kind, and notes have no equivalent weak kind. Corrected in the ADR, the mockup, the catalog and the backlog rather than quietly dropped.

---

## Also shipped, small

- **The task form's placeholder.** `להזמין את המסעדה` read as a task already typed. The notes form settled this rule on 2026-08-02 (_"a sample note reads as content on a blank form"_) and the task form shipped without following it; it is `משהו אחד שצריך לעשות` now, where `אחד` is the model's own bound.
- **The orphan `·`** an undated task's meta line opened with, because `.tsk-sep` was unconditional.
- **The tasks section header gained its glyph**, which was one of the four differences report 2 was made of.

## Verified

`pnpm typecheck`, `pnpm lint`, `pnpm build`, and **3898 tests** green. Six shipped specs needed updating; one of them caught a real bug of mine — `useSettledHosts()` landed below `Index.tsx`'s four early returns, which is a conditional hook, and seven specs failed on it.

Every number above was read off the running app at 360px, not off the mockup and not off the code.

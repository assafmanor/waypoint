# 2026-09-20 — The Index tile said nothing was open, beside its own count of 2

**Report:** two screenshots from the running trip. The tasks tile reads **`2`** and, on the line below it, **`אין משימות פתוחות`**. Opening the tile shows the two rows it is counting: `לינה` and `3 ימים ללא תוכנית` — both readiness checks.

**Backlog line closed** (opened 2026-08-16 while verifying tasks phase 2, pre-existing since phase 1). It named the undated-manual-task case; the field report is the same defect reached through the checks, which is the far commoner path — a trip nobody has prepared has five of them and no manual task at all.

## The derivation

`taskPreview.next` is `sortTasks(openManual.filter(dueAt))[0]` — **dated manual tasks only**, deliberately, because the line it feeds prints a day and a time. `open` has counted the live checks since the owner's 2026-08-16 amendment to ADR-0190 §1. So the two halves of one tile were answering two different questions, and `tile.empty` is the copy that fires when `next` is absent. A check carries no `dueAt` and never will, so on this trip `next` was structurally undefined.

## Why not the new string the backlog line assumed

That line predicted the fix as "a new string for _open, none dated_" and treated it as a copy decision. It is cheaper than that and better: the row to name already exists. `orderTaskRows` is what the tasks screen itself lists — urgent manual first, then the checks, then the rest — and `PlanLift` already took this same call for its run-up ("two surfaces, one order", ADR-0190 §2). So `taskPreview` gained **`lead`**, the title of that list's first row, and the tile prints it in the `הבאה:` shape it already uses. No new vocabulary, and the tile now names the row a person sees at the top the moment they tap it.

`next` still wins when it exists: a deadline that is about to bite is worth more on the landing than list order, and it is the only line here that prints a day and a time.

The clock glyph moved with it — it leads the line only when `next` does. Every other tile's leading icon names what its line is about (`link` for a booking, `lock` for documents), and a clock over a check with no deadline names something the row does not have.

## Checked, not assumed

`taskPreview`'s other two consumers read `open` and `overdue` only — `PlanHome`'s hero (lines 387/528) and `Home`'s prep hero (line 1636). `next` is the Index tile's alone, so widening the line changed one surface.

## Tests

`tasks.test.ts` gained four cases on `lead` (the check case, the undated-manual case, a flagged task outranking a check exactly as the screen orders it, and a settled check leading nothing). `Index.test.tsx` gained the reported state end to end: the landing's own fixture has nothing prepared, so it was already rendering `אין משימות פתוחות` beside a live count — the test fails on the pre-fix code with exactly the string from the screenshot.

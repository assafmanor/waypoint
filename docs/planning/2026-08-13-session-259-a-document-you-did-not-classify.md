# Session 259 — a document you did not classify

**Date:** 2026-08-13
**Output:** [ADR-0052](../decisions/0052-document-lifecycle-view-manage-and-feedback.md)'s 2026-08-13 amendment, and the build behind it — four new document types, a picker that opens on nothing, and one shared type grid.
**Baseline:** read on `ddb27c7` (`feat(booking): an edge can be a window…`, `origin/main`).

## 0. The report

> "Document creation should not auto select its category, as currently it defaults to passport while most documents aren't. Plus I think that we're still missing some basic document categories such as tickets (flight, train, rsvps, various activities) and probably other popular common types of documents."

Two halves of one defect. ADR-0052 §6 settled what four badges should look like and never asked whether **four** was the right number; `DocumentUploadSheet` then opened on `passport`, so the fastest path through the form — pick a file, press save — filed a boarding pass as a passport. The set was too small AND it guessed.

## 1. What changed

- `DOCUMENT_TYPE` grows to eight: `passport · visa · license · ticket · reservation · insurance · health · other`. Its **declaration order is the app's order** — `lib/documents.ts`'s `TYPE_ORDER` was a hand-kept second copy of it and is gone.
- `visa` gives up `🎫` (a ticket, obviously) for `🛂`, which §6 could not use while the passport was also a signage pictogram.
- The upload form opens with **no card selected**, and saves an unanswered upload as `other` rather than refusing. The manage sheet still opens on the document's current type — that is an answer, not a default.
- `ui/DocumentTypeGrid.tsx`: eight cards need `columns={3}`, and both sheets were carrying their own copy of the options list. One grid, two hosts.
- Additive migration, no backfill — the reasoning is ADR-0162's migration, one domain over: nothing stored distinguishes an existing `other` that is really a ticket.

The ADR amendment carries the per-type why (including the one deliberate omission, `receipt`).

## 2. Checked

`pnpm typecheck`, `pnpm lint` and `pnpm build` green. `pnpm test`: the documents, readiness and upload suites pass, including two new cases — the form opens with nothing checked and files an unanswered upload as `other`, and a chosen type reaches the queued write.

**Ten frontend tests fail on this branch and on `ddb27c7` alike** (Avatar, `Map.test`, `Map.embedded`, `PlaceResearch`, `PlaceKnowledge`, `App.authgate`, `Header` — all photo/avatar-URL shaped). Verified by stashing the branch and re-running: same failures, same count. Not this session's, and not fixed here.

## 3. The render, measured

The picker went from one row of four to three rows of three inside a sheet that also holds a name field, a file picker and a note composer, so it was rendered rather than reasoned about — a throwaway Playwright pass at **390×844** (ADR-0017's primary phone), through `e2e/boot.ts`, deleted after:

- 8 cards, **3 rows**, `aria-checked` on **none** of them — the report's actual ask, seen on screen.
- 113×62 per card, **no label clipped** (`scrollWidth <= clientWidth` on all eight). `בריאות` is the longest and still fits; the labels were kept to one word for exactly this.
- The grid costs **+140px** (62 → 202) and the sheet measures 675px of an 844px viewport. It scrolls, as it did before.

Two glyphs are worth a second pair of eyes on a real device rather than headless Chromium: `🪪` (Unicode 14) and `🛂` at ~17px badge size in the Index rows.

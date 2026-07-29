# Session 180 — the router, repaired (2026-07-29)

Docs only, one commit. [Session 178](2026-07-29-session-178-the-epic-reconciled.md) found
`docs/INDEX.md` had stopped carrying this epic in the half that costs a session; this fixes both
halves of it.

## 1. Nine ADRs the router never learned

0125, 0126, 0127, 0128, 0129, 0130, 0131, 0132 and 0134 appeared **nowhere** in
`INDEX.md` — all nine in `decisions/README.md`, none in the router — so the map's row ran
0007 → 0124 while the shipped surface is governed by 0129 (the camera), 0131 (search), 0132
(the ring and the chrome) and 0134 (the errand). `CLAUDE.md` tells every session to read the
router and then only the ADRs it names. Obeying that rule was, until today, how you failed to
learn that the errand exists.

All nine are now in `Platform, design & device targets`, in the row's own grammar (bold gist,
then what it decided, with **§ pointers** so a reader can jump rather than read the whole ADR).
They are deliberately **shorter** than their neighbours — see §4.

**0134 is also in `App shell & navigation`**, which is the one entry that is not just a
backfill. It is filed there because that is where its weight actually is: a build log and ten
addenda, much of it `0103` back-navigation work rather than map work. The errand is the app's first
flow that navigates while its overlays unmount, and a session touching `back` needs to find it
from the nav row, not from a map row it has no reason to open.

## 2. The two `[0132]` labels were a wrong label on the wrong file

Both entries pointing at `0133-the-user-is-a-surface-…` were labelled `[0132]` — in
`App shell & navigation` and in `Platform, design & device targets`. So the router displayed a
number for an ADR it did not link and linked an ADR it did not name, and the one map ADR the
table appeared to carry was neither. Both now read `[0133]`, and the real 0132 has its own
entry.

## 3. The planning table is retired, not backfilled

The backlog line framed this as a choice, and named the precedent: backfill thirty-six rows, or
point at the directory, "the same question ADR-0046 answered for the task board". Pointed at
the directory.

The reasoning is 0046's, unchanged: a hand-kept mirror of a directory is a second record, and a
second record rots — this one had been rotting since session 143, thirty-six notes ago, and
nothing depended on it. It also had nothing to add. Notes are named
`YYYY-MM-DD-session-NN-slug.md`, so date, number and subject are already in the filename and
the chronology is the sorted listing; the summaries duplicated titles that the notes state
better, and git history keeps the ones that said more.

The two cold-start files stay called out by name, because they are the exception the naming
scheme cannot express: they carry no session number and are source material rather than
sessions.

## 4. What this cost the file, and why the new entries are terse

`INDEX.md` was **317KB across 223 lines** — large enough that a reader with a 256KB limit
cannot open it at all, which is a strange property for the document every session is told to
read first. Prettier pads every cell in a table to its widest, so the planning table's 130
padded rows were 150KB and **one long router row costs the file ten times its own length**.

Removing the planning table and adding nine entries nets out at **235KB**. That is why the new
entries state what was decided and point at sections instead of re-arguing the ADR: on this
table, verbosity is multiplied by ten, and the router's job is to tell you which file to open.

The structural version of that observation is now a backlog line in place of the one that
shipped here: the platform row holds twenty-nine ADRs across domains that share nothing, so
"read only the ADRs for your domain" is not actually available to a reader of the map. Splitting
out a **Maps & places** row is the fix and is the owner's call — it moves ~25 entries, and doing
it as a side effect of the next map task is how a router gets a second wrong shape.

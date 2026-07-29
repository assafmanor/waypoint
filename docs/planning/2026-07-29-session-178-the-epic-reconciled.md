# Session 178 — the maps epic, reconciled against the code (2026-07-29)

> _"Read what we've accomplished, don't assume that everything that's still on the backlog is
> necessarily not done, update the backlog and suggest what we do now."_

**Paper only**, plus one stale code comment. No feature code, no ADRs. The job is to check the
backlog's open lines against what actually ships, correct the ones that have drifted, and say
what the next session should take.

## The headline: one phase closed itself, and the router stopped tracking the epic

**Phase 6a — the cost-gated one, the phase the plan has been sequencing around since session
135 — is closed, and no session ever "did" it.** Its surviving question was whether a Google
result can be shown on the map _before_ you commit, which under Autocomplete needed a Details
call per preview against ADR-0111's Pro-tier mask. [ADR-0132](../decisions/0132-search-reclaims-the-chrome-and-a-google-result-is-a-ring.md)
§7 answered it by not using a prediction at all: the Map tab's paid half switched SKU to **Text
Search**, which returns each result with its location, so N results cost one call and a result
is a **ring on the canvas before anything is picked**. The cost gate itself was then settled by
the owner rather than by an envelope (_"we'll live with the expenses"_). Phase 6 is now (b) and
(c) only.

Worth naming as a pattern rather than a one-off: this is the **second** time in this epic a
phase's blocker dissolved sideways. Session 145 recorded the first (#18 was parked behind 6a's
gate and was never gated by it). A plan that sequences on a blocker has to re-read the blocker
when the surface under it moves, or it keeps sequencing around a wall that is no longer there.

**And `docs/INDEX.md` has stopped carrying this epic in the half that matters.** ADRs 0125,
0126, 0127, 0128, 0129, 0130, 0131, 0132 and 0134 appear **nowhere** in the router's
decisions-by-domain table — all nine are in `decisions/README.md`, none in `INDEX.md` — so the
map row stops at 0124 while the shipped surface is governed by 0129 (the camera), 0131
(search), 0132 (the ring and the chrome) and 0134 (the errand). The two entries that do point
at 0133 are **labelled `[0132]`**. `CLAUDE.md`'s progressive-disclosure rule tells every
session to read the router and only the ADRs it names; a session that obeys it today will not
learn that the errand exists. That is a bigger cost than the planning-table gap the backlog
already tracked, and the line now says so.

## What I checked in the code, rather than assuming

| Backlog line                               | Claim                        | Verified                                                                                                                                                                                                   |
| ------------------------------------------ | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Map's own search in day-scoped grammar     | still open                   | **Open.** Under `searching`, `listRows` renders through the same `renderRow` with **no** `forceDay`, and `orderCtx`/`blockOf` still read `scopedDate`. A hit from another day still resolves no `placeDay` |
| Phase 6a                                   | open, cost-gated             | **Closed** — see above                                                                                                                                                                                     |
| Phase 13 §9 (retire `PlacePickerSheet`)    | last piece of Phase 13       | **Open.** `Map.tsx` still imports and mounts it for the coordless enrich; `PlacePicker` keeps it as the no-Map-tab fallback                                                                                |
| Phase 9 (one-finger zoom)                  | open                         | **Open.** `gestureHandling="greedy"` and nothing else; no pointer/long-press handling on the pane                                                                                                          |
| Phase 11 (booking phase labels)            | open                         | **Open.** `.pin-tag` still has exactly its two users, `עכשיו` and `היעד הבא`                                                                                                                               |
| Phase 10 §9 (long press)                   | blocked on 6b                | **Open and still blocked** — no gesture code, and the write path is still `createPlace({ name })`                                                                                                          |
| A place can't become an event or a booking | open                         | **Open.** `refEntriesFor` builds ways in to references that already exist; there is no create path                                                                                                         |
| Dot tier under the 44×44 floor             | open                         | **Open.** `MAP_PIN.DOT_SCALE` is still `0.4`                                                                                                                                                               |
| Latin address reorders in RTL              | open                         | **Open.** `BookingDetail`'s `.bk-fact-v bk-loc` still carries no `dir`                                                                                                                                     |
| The chrome + the ring line                 | "what is left is a decision" | **Stale.** The decision (the map extreme) was taken by the owner and built in session 166; what is left is the **coordless match**, which has neither ring nor row                                         |

### Addendum — the owner checked the first one, on the wrong surface, and that is worth keeping

The owner answered this note with a screenshot of a `TGI` search at the **map extreme**: the
place card reads `TGI Fridays · לפני 5 ימים · 14:00` — a place five days behind, correctly
naming its day while the strip is on today. Reasonable reading, wrong surface, and the code
says why: the **card** passes `forceDay: !inDayScope(cardUsage)`, so it has always named the day
of anything outside the scope. The **list** is the defect, and its two `renderList` call sites
pass nothing.

So it was reproduced rather than argued, against `Map.test.tsx`'s own fixtures (strip on
2026-07-20, `see` an event on the 21st, `idea` a genuinely dateless maybe):

```
query 'e', day-scoped → headers: ["מה שלפנינו", "ללא יום"]
                        shown:   lite (today, meta null)
                                 idea (no day)
                                 see  (TOMORROW — filed under ללא יום, meta null)
```

`meta: null` and the `ללא יום` header on a place that plainly has a day. That is the whole
defect in one assertion, and it is the test the fix should ship with.

**The lesson is the one this epic keeps re-teaching from the other direction:** this surface has
three renderers of the same row — the list, the place card, and the surfaced ghost — and two of
them already force the day. "Is it fixed" is not a question about the tab; it is a question
about which of the three you are looking at.

## Also corrected

- **A code comment that now states the opposite of what ships.** `Map.tsx`'s `googleHalf`
  explained that the paid half is rows "because an Autocomplete prediction carries no
  coordinates, so there is nothing to draw" — true when ADR-0131 wrote it, false since ADR-0132
  §7 made those results rings. It is the one comment on that surface a reader would take as the
  rule, so it is fixed here rather than left for the next session to trip over.
- **Phase 10's header** said §9 and §10 remain; §10 was superseded by Phase 13 (that line
  already said so from the other side).
- **The errand's history leak** (session 177's open finding) was in no backlog line. Added, with
  why it is a decision rather than a patch: ADR-0103's markers are push-only by design, and
  unwinding them re-opens the rejected `history.back()` reconciliation.
- **What the errand actually cost** is recorded on the Phase 13 line: sessions 166–177 are all
  follow-on, and only through 174 are ADR-0134's own. The rest became back-navigation work under
  ADR-0103 — the errand is the app's first flow that navigates while its overlays unmount, which
  is what exposed three defects that were never map defects.

## What is actually left, sorted by what it waits on

**Waits on nothing, decided, small:**

1. The Map's own search in day-scoped grammar — the last free, decided, standalone defect in the
   epic. It has been "take it whenever" since session 144 and has now been re-parked three times.
2. The `INDEX.md` router repair (the nine missing ADRs + the wrong `[0132]` label). Docs-only,
   and every later session is cheaper after it.
3. Phase 13 §9 — the Map's own `＋ מיקום` becomes the fourth errand target, and
   `PlacePickerSheet` retires. The mechanism (`usePlaceErrandReturn`) exists and has four hosts;
   this removes a mechanism rather than adding one.

**Needs a design session first:** Phase 11 (the pin's phase vocabulary, and the amber budget),
a place becoming an event or a booking (the epic's remaining product hole), Phase 9 (input
arbitration against the sheet's drag — five scars in this repo), Hero 2.0.

**Blocked or owner-owned:** Phase 6b (the coordinate-only `Place`, which unblocks the long
press), the device pass's numbers and look questions, the staging build vars, paid Routes.

## Recommendation

Take (1) and (3) as one build session — both are decided, both are on the same screen, neither
has design content — and (2) as its own docs commit. Then the fork is a **design** call for the
owner: Phase 11 or the place→entity path. Phase 11 is the smaller and better-scoped of the two;
place→entity is the bigger hole, and it is the one a traveller hits.

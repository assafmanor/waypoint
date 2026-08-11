# Session 253 — a Map add lands on the Maybe shelf (field report #40, workstream Q reopened)

**Date:** 2026-08-11
**Workstream:** `Q` — realtime open-screen correctness. Diagnosis first, then a fix at each cause found.
**Touches:** `frontend/src/state/trip-state.tsx`, `frontend/src/lib/shelf.ts`, `frontend/src/screens/{DayView,PlanDay}.tsx`, `frontend/src/state/trip-state.realtime.test.tsx`, `frontend/src/lib/shelf.test.ts`, ADR-0094 + ADR-0116 (both amended in place).
**No new ADR.** §6 says why, and what would have forced one.

## 0. The report

> Updates still do not always appear on screen. For example, a Place added from Map to the Maybe shelf did not appear in the Maybe shelf in Day-by-day.

Reopens #32, which [session 244](2026-08-11-session-244-a-peer-change-in-hand-thrown-away.md) diagnosed and `#566` fixed. Session 249 §7 named four candidate explanations and required that the item's presence in `maybeItems` be established **before** the render was inspected.

## 1. The answer, before the evidence

**There were two causes, not one, and they are independent.** The brief's framing — rule out grouping/cap, and if the item never reached `maybeItems` then it is the write path — turned out to be a disjunction where both branches were true, on different arms of the same report.

**Cause 1 — the sync half, and it is not the socket.** `memoryChannels` in `state/trip-state.tsx` had **no `ENTITY_TYPE.MAYBE_ITEM` entry.** A remote `maybeItem` change was mirrored into the Dexie cache by `CACHE_CHANNELS` and then dropped from memory by `memoryChannels[change.entityType]?.(change)`, whose `?.` reads as defensive and was in fact the whole defect. So an idea added on one device never reached the shelf on another — not on Day-by-day, not on the Map's `אולי` facet, not on Plan's shelf — until a route remount refetched the snapshot. Four surfaces, one stale store.

**Cause 2 — the shelf half, with sync healthy.** `SHELF_POOL_CAP = 5` and the pool is ranked by proximity to the day's stops. An undated idea added from the Map that is not among the five most useful for the day being viewed moves **only the tail count**. Measured below.

Neither is a reactivity failure in the sense session 249 was guarding against, and neither is repaired by navigation. The three things the brief said were visible in the code all held exactly as written: the optimistic dispatch is synchronous, `AppShell` remounts `DayView` on a tab switch, and the pool is capped at five.

## 2. What was established, in order, and how

A real stack, as in session 244: Postgres 16 (`pg_ctlcluster 16 main`), `DEV_AUTH=1`, seeded trip (`trip-japan-26`, Asia/Tokyo, 2026-08-10..19), backend on `:3000`, Vite on `:5173`, Chromium driving a real browser context at 390×844. Every "observed" below is off that stack.

**The seed is not enough to reproduce either cause, and that is the first finding.** `prisma/seed.mjs` gives the trip four maybe-items and **eight places with no `lat`/`lng` at all**. With no coordinates, `dayStops` is empty, every idea scores identically, and the tiebreak is recency — so a new idea leads the strip and the cap never bites. A trip that has actually been researched through the Map has coordinates on everything. The fixture was brought up to that: real Tokyo coordinates on the day's six stops, then six place-linked ideas 100m–600m from the day's Shinjuku stops, created through the app's own REST ops.

| #   | Question                                                                 | Answer                                                                                                                                                                  | How                                                                                 |
| --- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1   | With the shelf open, does a peer's `maybeItem` create reach the browser? | **Yes.** `{"type":"change","seq":"18","prevSeq":"17",…,"entityType":"maybeItem","action":"create"}`, delivered in order, gap test clean.                                | Raw WS frames logged off the real socket.                                           |
| 2   | Does it reach `maybeItems`?                                              | **No.** The strip's `+ N · במפה` tail states `shelf.pool.length - strip.length`, and it did not move: `עוד 5` before and after. The Map's `אולי` facet did not list it. | Two consecutive adds (one 10m from the day's stops, one 7km) against an open shelf. |
| 3   | Where is it dropped?                                                     | `memoryChannels` has entries for eight of the nine `ENTITY_TYPE` values. The missing one is `maybeItem`; the `?.` swallows it.                                          | Read on the tree, then confirmed by the fix's effect (#5).                          |
| 4   | Is the cache half also missing it?                                       | **No** — `CACHE_CHANNELS` is `Record<EntityType, …>` and has always carried `maybeItem`. Dexie was right and memory was wrong, which is why a reload "fixed" it.        | `lib/cache.ts:196-214`.                                                             |
| 5   | Does adding the channel fix it live?                                     | **Yes.** A peer add now paints with no remount, no route change, no refetch — `עוד 8` → `עוד 9`, tile at the head; its delete removes it live, `עוד 9` → `עוד 8`.       | Same two-context run, after the fix.                                                |
| 6   | With sync healthy, does a just-added idea appear?                        | **No, when it ranks out.** 14 undated ideas; an add 7km from the day's stops moved `עוד 8` → `עוד 9` and changed nothing else on the strip.                             | The reproduction in §4.                                                             |
| 7   | Do Map / Day-by-day / Plan hold their own stale copies?                  | **No.** All three read one `maybeItems` off `useTrip()`, and `Map.tsx:789`'s usage index is memoized on it. They went stale together, from one source.                  | Read; and confirmed by #5 repainting all of them from one channel.                  |

**Step 3 is the one that reframes the report.** `#566` repaired the frame handler and validated create/update/delete painting live for **events**. It could not have caught this: the frame was delivered correctly the whole time, and the entity that was being dropped was the only one #32's witness never exercised.

## 3. What the brief listed, and what each turned out to be

- **"The optimistic dispatch is synchronous."** True and verified. On a single device a local Map add is in `maybeItems` immediately. Cause 1 is therefore about a **second** device, which is the arm #32 was reported from.
- **"`AppShell` remounts `DayView`."** True. A tab round trip refetches nothing (session 244 step 6), so it heals nothing either — which is why cause 1 survived a tab switch and only a route change hid it.
- **"The pool is capped at five."** True, and it is cause 2. Reproduced, not inferred.
- **"Or the write failed and rolled back."** Not what happened in the field, but worth recording: it **did** happen in the first cut of the new component test, where the harness has no IndexedDB and `isOffline: () => true` sends every write to the outbox queue, so `enqueueOutbox` threw a Dexie `MissingAPIError`, `applyAddMaybe` caught it, dispatched `UNDO`, and the tile vanished — which on screen is identical to a render bug. Named here because it is exactly the misread this brief was written to prevent, and because the reducer trace (`ADD_MAYBE` then `UNDO`, one snapshot fetch) is what distinguished it in about a minute.

## 4. The reproduction of cause 2, exactly

Fourteen undated ideas on the trip, shelf healthy, Day-by-day open on the day with all the events. An idea added at Ueno — ~7km from that day's Shinjuku stops, which is what "researching somewhere for another day" looks like:

```
BEFORE: WS-witness 10מ׳ · NEAR-witness 10מ׳ · אומוידה 100מ׳ · גן שינג׳וקו 200מ׳ · בית קפה 300מ׳ · עוד 8 · במפה
AFTER : WS-witness 10מ׳ · NEAR-witness 10מ׳ · אומוידה 100מ׳ · גן שינג׳וקו 200מ׳ · בית קפה 300מ׳ · עוד 9 · במפה
```

The write landed, canonical state grew, four surfaces agree — and the only thing that moved on screen is a number in the tail affordance. Nothing here is wrong by ADR-0116 §5: the new idea genuinely is not one of the five most useful for that day. It is still indistinguishable, to the person who just made it, from the add having failed.

Mechanically: a dateless idea scores `0.5 + proximity·0.5`, proximity is `0` past 5km, and recency is only the tiebreak **within** a score. So any located idea within 5km of the day outranks a distant newcomer, and five of them fill the strip.

## 5. The fix

**Cause 1 — the registry, and the reason it could go missing.** `[ENTITY_TYPE.MAYBE_ITEM]` now dispatches `TRIP_ACTION.REMOTE_MAYBE_CHANGE`, whose reducer case runs the same `applyControlChangeToList` every other list channel uses (`maybeItems` lives in the reducer rather than a `useState` list, which is the only reason it needs an action of its own). No undo snapshot and no ripple reset: a peer's edit is not this device's action to undo.

**And `memoryChannels` is now total** — `Record<EntityType, …>` instead of `Partial<…>`, with the `?.` gone. ADR-0094 always described it as a `Record`; the code had drifted to the weaker type, and a `Partial` registry cannot report a hole it was declared to allow. Verified by deleting the new entry: `tsc` names `maybeItem` as missing. That is the actual repair — the entry is the symptom.

**Cause 2 — the pin** (owner's call, taken this session; ADR-0116 amended in place). The idea **this device added last** leads the pool strip whatever it scored; `SHELF_POOL_CAP` stays 5, so the pinned tile takes a slot and the fifth-ranked idea moves into the tail. Recency stops being the ranking's tiebreak in this one case and becomes a floor — because an idea created a second ago is not asking "am I useful today", it is asking whether it landed. The cap was **not** raised: a constant strip width is what §5 bought, and one pinned tile costs one ranked tile once rather than one per idea the trip accumulates.

The pin's input is `justAddedIdea`, canonical reducer state written by `ADD_MAYBE` — the add happens on the Map and the pin has to be true on the day you land on, which no screen's own `useState` can promise. Nothing expires it: it ends when the idea leaves the pool or the next add replaces it, and a pin whose idea is gone matches nothing.

**One extraction came with it.** The twelve-line rank/cap/tail block was duplicated **verbatim** in `DayView` and `PlanDay`, so adding a rule at either call site would have been the two shelves drifting again — the exact thing `shelfGroups` exists to prevent. It is now `lib/shelf.ts`'s `poolStrip` (ranked whole, pinned, capped, tail counted), called by both. Ranking the whole pool instead of stopping at the cap costs nothing: `suggestFor` already ranks everything and slices at the end.

## 6. Not done here, deliberately

**No ADR.** Both halves repair stated intent rather than revising it — ADR-0094 already wrote the memory registry as a total `Record`, and ADR-0116 §5 already left "does a capped strip read as 'something is missing'" as its one open question. Both are amended in place per the root `CLAUDE.md` rule. What **would** have forced one: raising or removing `SHELF_POOL_CAP`, which changes what the strip promises, or giving the pin a timer, which puts a clock in a pure derivation.

**No mockup.** The pinned tile renders as an ordinary tile with its own ranking reason and nothing marks it as pinned. Whether it wants a mark is a drawing question; it is on the backlog rather than guessed at.

**The Map's own add path could not be driven in this sandbox.** With no `VITE_GOOGLE_MAPS_BROWSER_KEY` and no `GOOGLE_MAPS_SERVER_KEY`, the Map renders its graceful-absence list-only path and has no search field, so the literal `＋ אולי` → form → `landPlace` → `verbs.addMaybe` sequence was never clicked here. What was driven instead: the same `verbs.addMaybe`, through Plan mode's shelf jot, on the real stack — `PIN2-witness` led the strip in Plan, and still led it after a mode switch **and** a tab switch to Trip-mode Day-by-day, with the cap holding at 5 and the tail counting the displaced idea. The one thing the Map add adds over that is a `placeId`, and that is covered in the unit tests, where the pinned idea is located and outranked. Saying so rather than implying a canvas was used (ADR-0121 §13).

**Two things stay open on the remote arm, and neither is closed by this.** Session 244 §6's `SyncGateway` **per-process socket map** remains a plausible second cause of the same user-visible symptom on a multi-instance deployment, and production is Railway. Nothing found here touches it either way — this defect reproduces on a **single** instance, where fan-out is not in question, so it neither confirms nor excludes that one. It does mean the client-side hole is now excluded as an explanation for anything the socket map is later blamed for. And the **two-device validation is still owed to the owner**: two browser contexts on one machine is not two phones (ADR-0017).

## 7. Tests

Six new cases in `state/trip-state.realtime.test.tsx` for cause 1 — the harness that fakes the browser `WebSocket` and runs the real `ws.ts`, with `DayView` **mounted before the frame arrives**, so "it is in the reducer" cannot pass for "it is on the screen": a peer's create paints with one snapshot fetch, an undated create (what a Map add makes) paints, a create paints on a day other than the one on screen, a rename repaints, a peer's **consume** drops the idea, and a delete removes it. All six fail with the channel removed.

Two more in the same file for cause 2, driving the app's own `verbs.addMaybe` through a probe inside the mounted tree with five better-ranked located ideas already filling the cap: the just-added idea is on the strip, and the strip is still exactly `SHELF_POOL_CAP` tiles with the displaced idea behind `+ 1 · במפה`.

Six in `lib/shelf.test.ts` for `poolStrip` itself: the pin reaches in from past a full cap, it spends a ranked slot rather than widening the strip (and it is the **fifth**-ranked idea that moves, not the first), the pinned tile keeps its own reason, an already-visible pin does not reorder anything else, a pin whose idea has left the pool is a no-op, and with no pin the cap and tail are exactly what they were.

One harness fix rides along: the realtime file's outbox mock now stubs `enqueueOutbox`. Without it, `isOffline: () => true` plus jsdom's absent IndexedDB rolls back every local verb (§3's fourth bullet).

14 tests added; 3496 frontend + 578 backend, all green. `pnpm typecheck` and `pnpm build` clean.

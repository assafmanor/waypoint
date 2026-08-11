# Session 244 — a peer's change reaches the app and is thrown away (field report #32, workstream Q)

**Date:** 2026-08-11
**Workstream:** `Q` — realtime open-screen correctness. Diagnosis first, then a fix at the shared cause.
**Touches:** `frontend/src/lib/ws.ts`, `frontend/src/state/trip-state.tsx`, `backend/src/sync/{change.service,sync.gateway}.ts`, `docs/architecture/sync-and-offline.md`.
**No ADR.** See §6 for why, and for what would have forced one.

## 0. The report

> Two devices have the same trip open. A change made on one is not seen live on the other; navigating to another screen and back makes it appear. Adding an Event is the confirmed example.

Owner's decision, already settled: realtime means **the currently open screen updates**. "It shows up after navigation" is not an acceptable outcome.

## 1. The answer, before the evidence

`Change.seq` is a **global** autoincrement (`schema.prisma`'s `seq BigInt @default(autoincrement())`), but `lib/ws.ts` tested for a gap with `seq > lastSeq + 1n` — arithmetic that is only meaningful if the sequence were **per-trip and contiguous**, which is what `sync-and-offline.md` said it was. As soon as a database holds a second trip that anyone writes to, an ordinary in-order frame for this trip arrives with a number that skips, and the client classified it as lost frames.

What it then did with that classification is the actual defect:

```ts
if (isGap) handlers.onResync();
else handlers.onChange(msg.change);
```

**The change it was holding in its hand was discarded** in favour of a full-snapshot refetch — and that refetch's failure branch is `() => {}` (a deliberate silent swallow, "the next change/hello retries"). It does not retry, because `lastSeq` was already advanced past the dropped frame: no later frame will ever be classified as a gap on its account, and `changes?sinceSeq=` will never be asked for it. The change is gone permanently, and the open screen stays stale until something else refetches the snapshot.

That last clause is the report's second sentence. §2's step 6 establishes that a tab round-trip refetches **nothing** — so "navigating away and back makes it appear" is only possible for a change that never reached state at all, and only a **route** change fixes it, because `App.tsx`'s `<RouteShell key={location.pathname}>` remounts `TripProvider`, which refetches.

## 2. What was ruled out, in order, and how

The instruction was to instrument rather than guess. Each step below was run, not reasoned about. Steps 1–5 are the diagnosis order in the workstream brief.

**A real server was stood up for this** — Postgres 16 on a socket, `DEV_AUTH=1`, seeded trip, backend on `:3000`, Vite on `:5173`, and Chromium driving real browser contexts. Every "confirmed" below means observed on that stack, not inferred from a mock.

| #   | Question                                                              | Answer                                                                                                                                                         | How                                                                                      |
| --- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1   | Does the Change reach `openTripStream`'s `onChange`?                  | **Yes.** The frame is delivered, and correctly.                                                                                                                | Raw frames logged off a real WS: `{"type":"change","seq":"1","change":{…,"after":{…}}}`. |
| 2   | Does it reach `applyRemoteChange` → the memory channel → the reducer? | **Yes**, on the non-gapped path.                                                                                                                               | Provider-level probe reading `useTrip().events`.                                         |
| 3   | What is in `change.after`, field by field?                            | `date`, `title`, `kind`, `startsAt`, `endsAt`, `source`, `sortOrder`, and `id` when the actor sent one. Missing: `createdAt`, `updatedAt`, `updatedBy`.        | Captured off the running server, not assumed.                                            |
| 4   | Does the reducer's `events` contain it, and with what?                | Yes: the synthesized row carries every field above plus `status`/`id`/`tripId`.                                                                                | Serialized the array out of a probe component.                                           |
| 5   | Does the consuming screen re-render, and does it draw the row?        | **It draws it.** Confirmed on the real stack for Home, Day-by-day and Plan Day, for create, update and delete.                                                 | Two browser contexts, one writing through the app's own form.                            |
| 6   | What does navigating away and back actually do?                       | A **tab** round-trip: 0 snapshot fetches, 0 new sockets — it remounts only the body (`AppShell`'s `bodyKey`). A **route** round-trip: a fresh `fetchSnapshot`. | Counted requests in the browser.                                                         |

## 3. The strongest lead was wrong, and the brief said to say so

The intake note's fourth hypothesis — that a remote CREATE is built from a partial `after` missing something a day surface needs to place a row — is code-backed and false. Step 3 settles it: `after` carries `date` **and** `startsAt`; nothing a timeline needs is absent. Step 5 settles it twice over: the row draws.

Step 6 kills it a third time and more cleanly than either. If the event were in state but unrenderable, a **tab** round-trip would not fix it — nothing refetches — and the report says navigation does fix it. So the symptom requires a change that never reached state. That reasoning also disposes of "the screen didn't re-render" and "a stale memo/selector", which have the same shape.

Payload shapes tested for completeness, all of which painted live: timed, untimed, start-with-no-end, multi-day ambient, with category and icon, with a client-supplied id, and `displayTimezone: null`. Also tested and found not to be it: `describeChange` throwing before `applyEntityChange` (it doesn't throw), `applyChangeToCache` throwing synchronously (it is async), an actor filter on the apply path (there is none), the socket failing to deliver (it delivers), and `toChangeDto` dropping `after` (it doesn't).

**The one thing that did survive from that lead** is recorded on the `after`-payload backlog line rather than fixed here: the memory path spreads `after` raw while the cache path runs `coerceClearedFields`, so a `displayTimezone: null` clear lands as a `null` in memory where the type says `string | undefined`. Nothing visibly broke; it is a different defect and belongs to that item.

## 4. Why it never reproduced until the socket itself was in the test

Every existing `trip-state.*` test stubs `openTripStream` and calls `onChange` by hand. **That is downstream of the bug.** The whole failure lives in the frame handler — in deciding whether to call `onChange` at all — so a harness that starts at `onChange` cannot see it, and four test files starting there is why this survived. The new `trip-state.realtime.test.tsx` fakes the browser's `WebSocket` instead and runs the real `ws.ts`.

It also did not reproduce on a **single-trip** database, because there the global sequence is accidentally contiguous. That is a warning about the sandbox, not a reassurance: production is multi-trip by construction.

## 5. The fix

Two halves, one cause, both at the boundary that broke.

**The server names the predecessor.** `ChangeService.mutate`/`mutateMany` read this trip's current max `seq` inside the transaction — after `lockTrip`, before the insert, so nothing can slip between — and broadcast it as `prevSeq`. One index-only read (`@@index([tripId, seq])`) under a lock already held. A receiving client cannot derive this for itself, which is exactly why it is sent. No schema change, no migration, no change to `Change` or to `changes?sinceSeq=`.

**The client stops inferring, and stops discarding.** `prevSeq === lastSeq` is the gap test (the old arithmetic survives only as a fallback for a frame without one). And a delivered change is now applied **whether or not** frames were missed — `onChange` fires for every frame, with `afterGap` telling `applyRemoteChange` to hold the `sinceSeq` cursor at the last contiguous change so a failed resync still replays what was skipped rather than resuming past it. `onResync` fires alongside, never instead.

Two cursor rules came with it, both of which the old arithmetic hid: a repeat frame (`seq <= lastSeq`) is ignored rather than re-read as a gap — the mount-time reconnect briefly runs two sockets and delivers each frame twice — and the ephemeral trip-deletion frame (`seq: '0'`, not persisted, no cursor) is delivered while touching neither `lastSeq` nor the gap test, the same rule `enrichment` follows.

Measured on the real stack, before and after: a peer create arriving with a skipped global seq used to cost a **full snapshot refetch** (and vanish entirely if that refetch failed); it now paints from the frame with **zero** refetches.

## 6. Not done here, deliberately

**No ADR.** The change repairs ADR-0019's stated intent rather than revising it — "gap-detection is what makes WS-receives/REST-writes safe" is the promise that was not being kept — and adds one field to a message shape `sync-and-offline.md` already documents, so that doc is amended in place per the root `CLAUDE.md` rule about adjustments to already-documented behaviour. What **would** have forced one: giving `Change` a per-trip sequence column. That is the other way to make the client's original arithmetic true, and it is a data-model decision with a migration and a backfill; `prevSeq` gets the same correctness for none of it.

**The in-process channel manager was not touched.** `SyncGateway` keeps its socket map per process, so a multi-instance deployment would fan out to one instance's sockets only. `sync-and-offline.md` already names this and its exit ("swap for Postgres `LISTEN/NOTIFY` or a bus only if we ever run multiple API instances"). It is a plausible second cause of the same symptom, it is **not** established, and nothing here assumes it either way.

**The two-device validation is owed to the owner** — see the PR body. Two browser contexts on one machine is not two phones, and ADR-0017 makes that a real step.

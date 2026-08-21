# 2026-08-21 — Notifications land on the source, and the catalogue closes

Three owner calls, and one of them exposed a bug that had been in every notification the epic ever sent.

## Every notification was landing on the app home

Reported as _"clicking on the notification should lead exactly to the source of the notification (and not the app's home)"_ — which reads like a refinement and was actually a total failure.

The URLs were `/trips/<id>/index/tasks` and `/trips/<id>/day/<date>`. The router has `login`, `trips`, `new`, `join/:token`, `trip/:id/settings`, `settings` and `*`. **Neither URL matches a route.** Both fell through to `*` → `RootSurface` → the home tab. Note also the plural/singular tell that nobody caught: the one real trip route is `trip/:id/settings`, singular.

They were plausible-looking paths for an app that has almost no paths. **The app is query-addressed** (ADR-0098): one surface, `?tab=` and `?day=` choosing what it shows, and ADR-0153 §8's way-in ids opening something on top of it. Writing a REST-shaped URL for it was a guess that typechecked, and no test could see it — `notify-copy.spec.ts` asserted the URL began with `/` and matched a string it had itself been written from.

**The lesson worth keeping: a URL is an integration, and a string that no route parses is not a test failure anywhere.** The spec now asserts `url.startsWith('/?')`, which is a claim about the app's addressing model rather than about a literal.

## `?trip=` — the param whose absence was a wrong answer, not a missing feature

Fixing the paths was the easy half. The active trip comes from `localStorage` and **nothing in a URL could ever change it**.

That was invisible for the app's whole life, because every way in was a tap from inside the app, where the active trip is by definition the one you are looking at. A notification is the first entry point that arrives from _outside_ — and a reminder about the Japan trip, tapped while Iceland is active, opened **Iceland**. Not a 404, not an error: the wrong trip's day, confidently.

Two properties it needed beyond "read the param":

- **It counts as a pick.** ADR-0033's landing rule redirects a _restored_ trip to whichever is live, which would hijack a notification about a trip that has not started — exactly the pre-trip case `task.due` and `readiness.nudge` exist for. Somebody tapping a notification about a trip has chosen that trip as explicitly as tapping it on `/trips`.
- **An empty `?trip=` means absent.** `URLSearchParams.get` returns `''` for a bare `?trip=`, which is not `null`, so a `??` chain let it win over the stored value and blank the active trip. A test caught it; the fix is `|| null`. Worth writing down because it is the second time in this epic that "absent" and "empty" being different has bitten (the first was `p256dh`'s length check).

## `?task=` — the fifth way-in id

`?booking=`, `?doc=`, `?event=`, `?idea=` existed; a task had none, because nothing outside the app had ever needed to name one. It follows the same one-shot discipline (`useArrivalParam`-style: read it, act, delete it), and its consumer is the Index, mirroring `initialBookingId` exactly.

One thing it needed that `?booking=` did not: **it waits for the task to arrive.** A notification tap is a cold start, so `tasks` is empty on the first render — an effect keyed on the id alone would spend itself against the empty list and open nothing. Keyed on `(id, tasks)` and latched in a ref, so it opens on the render the task appears and never re-opens after the sheet is closed. That case has its own test, and it fails if the latch is moved.

**And one row versus a set is a distinction, not a detail.** `task.due` and `task.assigned` open their task's sheet; `task.digest` and `readiness.nudge` open the list. A digest is about a morning's worth of deadlines — opening one arbitrary sheet over it would pick a row out of the set the send was deliberately about as a whole.

## Two rows leave the catalogue

**The flight check-in is dropped**, which closes the stored-vs-derived fork by removing the need for an answer. Phase C is complete as `readiness.nudge` alone. §C's reasoning for preferring a task over a `flight.checkin` send is still correct and still recorded — we do not store the airline's window — so if it ever returns, it returns as a task.

**Phase D is dropped.** `group.imminent` will not be built, `notifyGroup` is never added, and ADR-0198 §6's two switches are the final set rather than a way-station. The ADR already leaned this way for the right reason: it is the only row whose absence costs nobody an obligation, because you cannot be _late_ for somebody else's edit.

So the catalogue is closed at **seven**: `task.due`, `task.digest`, `task.assigned`, `event.hard.soon`, `span.edge.soon`, `trip.tomorrow`, `readiness.nudge`.

## The assigner's name leaves `task.assigned`

The body was `‹title› · עד ‹due› · ‹name›`; it is now the first two.

Worth recording rather than just doing, because ADR-0198 §2 defended this kind against ADR-0081's rejection of ambient awareness on the grounds that it is **addressed** — "someone put your name on something". The addressing now rests entirely on the title's `בשבילך`, and the test that used to assert the name asserts that instead, because that is the property whose loss would turn this into an ambient change ping.

It also deleted a whole `User` query per tick. And the name was never solid: `updatedBy` is the closest the schema holds — written in the same statement as `assignedAt`, so they agree at the moment of assignment and drift if a third party edits inside the six-hour window. Restoring it properly means an `assignedBy` column, which is a column for a courtesy, and that is why it went cheaply.

## Still owed

The **lock-screen device pass** on both platforms, unchanged since phase A: ADR-0198 §7 requires it and no sandbox can do it. It now has seven kinds' worth of strings to check, including two that end in a time and one that ends in a list.

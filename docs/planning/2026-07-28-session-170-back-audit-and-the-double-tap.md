# Session 170 — a back audit, and the double tap (2026-07-28)

Two owner reports. The first is small and shipped. The second — _"some backs (android swipe
gesture) aren't working as expected intuitively, it sometimes exits to the main screen,
return to booking isn't working, and more edge cases that I want you to identify"_ — is an
**audit**, and this note is the audit. One finding is fixed in this change; the rest are
recorded here with what I actually verified, because a list of maybes presented as bugs is
worse than no list.

**How these were found:** by reading `state/nav-state.tsx` against every errand call site,
not on a device. So the confidence column below is real — nothing here was reproduced on
Android, and #2 in particular may be design working as intended rather than a defect.

## Fixed: the return from `＋ מיקום` lands on the bare screen behind the booking

**Confidence: certain (traced end to end).** `useStartPlaceErrand` captures
`returnTo = pathname + search`, and `finishErrand`'s saved-booking path patched the booking
and navigated there **handing nothing over**. But a `BookingDetail` is a `Modal` — and
`IndexBookingsView` is view state inside `Index.tsx`, not a route (ADR-0098). Neither is
addressed by a URL. So the return re-rendered the screen with every sheet closed: the place
was correctly assigned to a booking you could no longer see. `ביטול` had it worse — the same
landing with nothing assigned.

**This is the same shape as the defect ADR-0134 §2 already fixed for forms**, and it was
missed for the one path that has no draft. A form's draft is not really about the typing —
it is about the fact that _the URL does not describe what was on screen_. A saved booking has
nothing typed and exactly the same problem.

Fixed through the channel that already exists rather than a route or a second mechanism: the
result is handed back on **both** exits, and a result carrying only a saved `target.id`
re-opens that booking's detail. All four `BookingDetail` hosts already ran
`usePlaceErrandReturn`, so this is one branch each and no new plumbing.

## Identified, not fixed

**1. Back from any non-Home tab goes to trip Home — including when you arrived from
somewhere else. Confidence: certain, but it is ADR-0090 §2 working as designed.** This is my
best candidate for _"it sometimes exits to the main screen"_. Open the Index → tap a place →
you are on the Map tab → back lands on **Home**, not the Index you came from, because
`resolveBack` is a pure function of _where you are_ and deliberately not of history. That
tradeoff is the whole point of ADR-0090 (history is unknowable after OAuth round-trips and
PWA cold launches), so changing it is an **ADR amendment and a design decision**, not a fix I
should make unilaterally. If this is the report, the question to answer is narrow: should a
tab entered _from another surface_ remember that surface, and if so, where is that stored so
it survives a reload?

**2. An errand now costs two backs. Confidence: certain (introduced session 168).** Arriving
on an errand auto-opens the query field, so two layers register: the errand, then the field.
Back #1 closes the field; back #2 cancels the errand. You never opened the field, so being
made to close it reads as a back that did nothing. A plausible rule: while an errand is live,
back cancels the **errand** regardless of the field, because the field is part of the errand
rather than a layer over it. Not applied — it changes a shipped interaction and the owner has
been correcting exactly this class of guess all evening.

**3. A spent history marker can eat one back. Confidence: high (documented tradeoff,
newly more likely).** ADR-0103's marker bookkeeping is push-only and accepts "at most one
no-op back after an overlay is closed off-back". Session 168's auto-opening field pushes a
marker **the user did not ask for**, so a flow that opens the field, closes it with `✕`, and
then presses back can now hit that no-op where before it took a deliberate overlay open. This
is the one I would investigate next with a device in hand.

**4. `exit-trip` pushes where every other action replaces. Confidence: medium.**
`runStructural` uses `navigate(EXIT_TRIP_TO)` without `replace`, so leaving a trip adds an
entry and a forward-back can re-enter it. It may well be intentional (leaving a trip is not a
lateral move); it is the only asymmetry in that switch, so it is worth a sentence in ADR-0090
either way.

**5. Idle-resume drains overlays by running their handlers. Confidence: medium.**
`closeAllOverlays` invokes every layer's handler, which for a live errand means
`cancelErrand` — a navigation — immediately before the resume's own navigation to Home
(ADR-0060). Two navigations in one tick, and the errand's `returnTo` loses. Harmless today
because Home wins, which is the intended destination; fragile if the order ever changes.

## The double tap

_"Double clocking on a map result should select it (same as selecting then clicking on
`בחירה`)."_ One `onDoubleClick` per row, no gesture machinery: `touch-action: manipulation`
is already app-wide (ADR-0062), so double-tap zoom is off and two taps dispatch a prompt
`dblclick`. The two single taps still fire first, which is exactly the sequence the report
describes — select, then choose.

**Errand-scoped, on both row kinds.** A trip row and a Google row are answers to the same
question while an errand is live, so both take it. Outside an errand the verb shelves a
`MaybeItem`, and a stray double tap that silently adds something is not a shortcut anyone
asked for.

---

## Session 173 follow-up — the harness exists, and two of the five findings are dead

The owner approved a back session; it started with the harness, which is the reusable half
(`state/nav-state.system-back.test.tsx`). **Before it found anything about back, it found two
ways this file could have lied:**

- **The interceptor snapshots `window.location`, not the router.** It runs inside a DOM
  event, outside React — so a `MemoryRouter` test leaves it reading `/` forever and every
  assertion passes for the wrong reason. The suite uses `BrowserRouter` over the real jsdom
  history.
- **`waitFor` nested inside `act` deadlocks the polling.** A press that CHANGES the location
  never settles, while one that stays put passes on the first check. That asymmetry would
  have made exactly the "it stayed on the map" assertions green and the "it left" ones
  impossible — the worst possible failure mode for this particular file. Found by
  instrumenting, not by reading.

The history shape is modelled explicitly for the same reason: the shell pushes one same-URL
**guard** entry and tab changes REPLACE, so a user on a tab sits on `[/, /?tab=<tab>]`. **The
entry behind the tab is trip Home** — which is why a back that rides one entry too far reads
as "it went home", and is the mechanism behind the owner's report.

### What the harness settled

**Finding #3 is dead.** The spent-marker drift I named — open, close by tap, reopen, back —
does **not** escape the tab. Nor does a plain open-then-back, nor two stacked layers peeled
one press at a time, nor a non-cancelable structural back. Eight cases, all correct.

So the generic layer mechanism is right, and the bug is **not** where the audit guessed. That
is worth as much as a fix: it removes the plausible-but-wrong explanation that a later
session would otherwise have "fixed".

### What is still open

**The report is not reproduced.** The next step is the obvious one and now cheap: drive the
**real Map screen** through this harness rather than a stand-in layer, which means giving
`Map.embedded.test.tsx` the fake navigation and a `BrowserRouter` (it currently uses
`MemoryRouter`, which per the first finding above cannot exercise the interceptor at all).
If the Map reproduces it and the stand-in does not, the difference is on the Map — the chrome
reclaim, the lifted `queryOpen`, or the errand layer — and that is a much smaller haystack
than "the back stack".

Findings #1 and #2 remain the owner's decisions; #4 and #5 remain unverified.

### Session 174 — the real Map screen does not reproduce it either

That next step is taken: `screens/Map.back.test.tsx` renders the **real `MapView`** over a
`BrowserRouter` and the same fake navigation, and presses back from four states — an empty
open field, a field with a live query, an open/✕/re-open cycle, and twice in a row. All four
behave: one press closes the field and stays on `?tab=map`, the next leaves the tab. So the
chrome reclaim and the lifted `queryOpen` are cleared too.

Its own file rather than a switch of `Map.embedded.test.tsx`: that suite carries 138
assertions on a `MemoryRouter`, and moving all of them to chase one bug is a much larger
change than the question deserves. The duplicated mock fixture is deliberate — the two files
ask different questions of the same screen.

**What that leaves.** The mechanism behind _"it sometimes exits to the main screen"_ is
understood (the entry behind any tab is trip Home, so a back that rides one entry too far
reads as "it went home"), and every jsdom path into it is now green. The remaining candidates
are the two the harness cannot see: a real Android gesture with its own commit timing, and
finding #1 — which is ADR-0090 §2 working as designed, and the owner's call. **The next probe
should be an e2e**, for the reason session 174's errand bug proved: the seam that hides these
is a screen unmounting across a navigation, which is exactly what jsdom fixtures mock away.

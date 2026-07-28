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

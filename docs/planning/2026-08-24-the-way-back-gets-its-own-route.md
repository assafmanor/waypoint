# The way back gets its own route — 2026-08-24

Session note for [ADR-0203](../decisions/0203-a-journey-has-one-date-and-its-arrival-is-a-clock.md) §6 (built at last) and the [ADR-0184](../decisions/0184-an-edge-can-be-a-window.md) §2 amendment. Design reference: [`mockups/the-way-back-is-its-own-route-v1.html`](../../mockups/the-way-back-is-its-own-route-v1.html).

## What came in

Three reports, from using the merged rail on a phone:

1. The `למחרת` divider is stuck to the top, which the owner liked — but it goes over the time and becomes hard to read. _"Maybe center, maybe make it not transparent. Idk, please compare with a mockup and decide on the best looking solution."_
2. A round trip with layovers _"isn't going to be the same stops exactly - it could be different stops and/or a different number of stops. Right now after you chose round-trip you can't change it per journey, and that's bad ux."_
3. A car hire's return shows two `מ־`: _"which doesn't make sense at all. What is it? Do we need a `מ־` at all? Not just an `עד`?"_

## The forks, and how they were settled

**(1) Opaque or centred?** Opaque, and centring was drawn before being rejected. The ground is the whole defect — a 90%-transparent wash on a band that does not move means the scrolling row is visible straight through it, so the numerals and the word share a baseline and neither wins. Centring moves the collision instead of ending it. It also changes what the label _is_: this is a caption for the rows below it, and every caption in this app sits at the reading edge. Centred it reads as an ornament, and it competes with the numerals aligned in the same band.

**(2) Why was §6 deferred twice, and what actually made it hard?** Both earlier deferrals named three layers — the draft, the errand field, `legBooking`. That list was right and beside the point. The real obstacle is that `legCount` was **one number for both journeys**, read by nine call sites, and the field's "a different _number_ of stops" is exactly what no amount of `reversed` could express: it was one array read backwards. `pointsFor(side)` and `legCountFor(side)` are the change; everything else followed.

**Should the return's endpoints diverge too?** No, and saying so explicitly is what kept this small. You fly home from where you landed, so what varies is the middle. An open-jaw trip is a different feature and is on the backlog under its own name.

**Pills or a text offer?** Pills — and drawing both is what decided it. The question sits directly under the direction control, which is also pills, so "one way or round trip?" and "same way or a different one?" read as a pair of the same kind of question. Pills also show the _state_, not just the available action. The finding that settled it came only from drawing the alternative: a text offer's revert has to say `חזרה לאותה דרך`, and `חזרה` is already the name of the section — one word for two things in adjacent lines.

**A confirm dialog on going back to a mirror?** Not needed, once the flag and the list are two fields. The typed route survives a change of mind, so there is nothing to lose and nothing to ask. That is why they are two fields.

**(3) Do we need `מ־` at all?** Yes — but not before that time. A start edge's own time is the floor; an end edge's own time is the deadline. Put the floor first either way and one sentence serves both edges, with only _which_ of the two is the stored value differing. The fix is the order, not a new word.

## What the render caught that reading did not

- **Place pickers drawn as blank white bars.** I wrote `.place-picker > .pp-name`, which is not the tree `PlacePicker` emits. Same for `ChoiceGrid`: its pills are `button.choice-pill` inside a `radiogroup`, not a hand-rolled `role="group"`. Both copied from the real components afterwards.
- **A literal `←` in the derived-ends line.** `Bidi_Mirrored`, so it flips inside `dir="rtl"` — the trap ADR-0118 and the skill both name. Replaced with `RouteLabel`, which owns the real `NavArrow` and a `<bdi>` per end.
- **The ceiling, which decided where the section lives.** The deepest form the feature can produce (`MAX_ROUTE_STOPS` both ways) is **646px against ADR-0155's 675px**. It fits with 29px spare, so the section stays on the route step per ADR-0192 §3 rather than becoming a step of its own — and the mirrored default is what buys that margin.

## What the specs caught that I did not

Two bugs, both mine, both found by tests rather than by review:

- **`backPoints` is a `const`, and hoisting `legCountFor` does not rescue it.** Every round trip threw `cannot access 'backPoints' before initialization`; eight specs went red at once. The route derivations now sit above their first reader, which reads less naturally than beside `legZones` and carries a note saying why.
- **Two intents on one callback.** "Give me my own route" and "I cleared the last stop" arrived as the same call, so emptying the return's list restored the stop just removed. Split in two. And `returnStopsDraft` had to become `list | null`, because `[]` is a real answer — diverged, and the way home is direct — that the first version could not tell from "never diverged".

## Verification

`frontend` 4395/4395, `pnpm typecheck` clean, `pnpm build` green, `pnpm lint` 0 errors. Seven new specs for §6, three for the window's words.

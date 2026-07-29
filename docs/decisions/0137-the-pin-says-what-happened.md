# 0137 — The pin says what happened there, and the ghost is the population that needed it

**Status:** Accepted (design + build)
**Date:** 2026-07-30
**Refines:** [0117](0117-map-place-outcome-states.md) (its three outcome states, and the "Phase 6 inherits it" its Consequences promised), [0121](0121-embedded-map-phase-6-design.md) §6 (the pin ladder gains no tier — this is a second axis on two existing ones), [0130](0130-a-maybe-is-not-a-past-place.md) §2/§3 (the `behind` tier is Trip-only; `ghost` and `shelf` are the two subordinate tiers, and only one of them can carry an outcome), [0028](0028-plan-violet-color-budget-dark-ready.md) (`--ok`/`--miss` are for statuses, which is what an outcome is)

Mockup: [`mockups/map-pin-outcome-v2.html`](../../mockups/map-pin-outcome-v2.html) (v1 is superseded and kept only for its §F, which is what this ADR's Alternatives point at)

## Context

[ADR-0117](0117-map-place-outcome-states.md) §1 named three states a place can be in once it is behind you — **היינו**, **דילגנו**, and **passed but unsettled** — and built all three into the list: a tag per row in the `--ok`/`--miss` status hues, under the deliberately neutral `מה שמאחורינו` header. Its Consequences then promised the other half:

> **Phase 6 inherits it**: the same outcome drives the rendered pin's treatment when the map lands, with no second derivation.

It never did. Phase 6 shipped the `behind` tier as one grey treatment for all three, and `map-pane.css` said so out loud rather than hiding it:

> A row's own `.place.skipped` is the narrower claim — a human said this did not happen — which the canvas does not draw, since **every behind-you pin looks the same whatever closed it**.

So the split had two halves making different claims about the same place: the row said _we skipped this_, the pin said only _the clock passed this_. Reported by the owner, whose reading also corrected the population:

> _"A ghost could be unmarked, skipped, or consumed. Regarding non ghost pins it's a different question, I think that they should retain their icons so it's easier to distinguish, but still have a way to differentiate between unmarked/skipped/consumed."_

Two clarifications that shape everything below:

- **`ghost` is not "a past place".** On this canvas a ghost is a place pencilled in for **another day**, drawn because it is physically in view: hollow, no fill, no glyph, no number (ADR-0130 §3). The grey filled pin is `behind`.
- **"Consumed" here means `EVENT_STATUS.DONE`** (היינו). `MaybeItem.consumed` is a different concept — an idea consumed into an event, after which the place is simply that event's pin.

## Decision

### 1. One fact, two homes, because the two tiers have different room

`DayUsage.outcome` already exists (ADR-0117 §5). Nothing new is stored, and nothing new is derived — `pinOutcome` in `lib/map-pins.ts` reads the same index the chips, the colour, the number and the row read.

| Tier            | Where the mark goes                    | Why there                                                                                               |
| --------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **`ghost`**     | the **centre**, as a stroke            | It is hollow, so its middle is empty: the mark costs it nothing and gets the largest area on the ladder |
| **`behind`**    | the **shoulder**, replacing the number | Its centre is the category glyph, which stays; the number is what gives way — see §2                    |
| everything else | nothing                                | None of them **can** have an outcome — see §4                                                           |

**The ghost is the tier this was worth building for.** A ghost is context, and the only question context raises is _do I still need to care about this?_ A hollow pin with a ✓ says we did that one, on another day. Unmarked, it says the plan is still live. That is the entire value of drawing another day's places at all, and it was the one thing they could not say.

### 2. A filled pin keeps its category glyph, and the number is what gives way

The glyph is how you tell one grey pin from another, and a day's worth of passed stops is exactly where that matters most. So the glyph stays and the **number** is what the mark replaces — the same shoulder badge, different content (owner's call):

> _"maybe when marked it should replace the number as it has become irrelevant anyway, and more importantly the look is much cleaner"_

Both halves hold. **The number is spent**: it is the index in the day's sequence, and once a human has settled a stop you are not going to it in any order — which is a narrower claim than the one `map-pane.css` had been making ("behind you KEEPS its number… #1 is still true after you have been there"). That sentence is about the **clock's** partition, and it stays true for the passed-but-unsettled pin, which is the commonest of the three states. What spends the number is a human, not the clock. **And it is cleaner**: two badges on a 34px teardrop is the pin's third and fourth floating object.

It is also less machinery, which is the tell that it was the right shape. One slot means no second geometry, no second corner to defend, and no extra line in either of the two places that already hide `.pin-n`'s siblings (the dot tier, the errand's context demotion).

The first pass put the mark on the **other** shoulder, beside the number — drawn in the mockup's §F, and rejected there.

### 3. Green and red, which is on-budget rather than an exception

✓ in `--ok`, ✕ in `--miss`. An outcome **is** a status, which is precisely what ADR-0028 reserves those two for, and it is what ADR-0117 §1's row tags already use — so the two halves of the split now agree on the colour as well as on the words. Amber stays on time, teal on location, and no new hue is spent.

Colour is **additive, never the carrier**: ✓ and ✕ differ in shape, and the pin's accessible name carries `היינו`/`דילגנו` in words. Three carriers, one fact.

**But not at full chroma on a filled pin, and that took a render to see.** The first build used `--ok`/`--miss` neat, which is what the tokens are for — and a mostly-settled day then put six saturated discs on the canvas, louder than the single amber next-stop cue. That breaks two rules that were already written down:

- **ADR-0130 §3's axis.** _"A passed stop keeps its solidity and loses its colour"_ — grey is what behind-you **means** on this canvas. A full-chroma badge makes the quiet tier the brightest thing on screen, which is the exact inversion that ADR exists to prevent.
- **ADR-0109 §6**, restated in `map.css`'s `.place.nextstop`: _"Amber = time, spent on exactly one row … never a second accent on every pin."_ A settled day put a second accent on nearly every pin.

So the filled badge steps its hue toward `--muted` (62%), by the same idea the numeral already steps `--ink` → `--muted` on this tier: still unmistakably green or red, and unmistakably behind you. The **ghost's stroke keeps the full hue** — a hairline is nowhere near a filled disc's visual weight, and a ghost is one pin's worth of ink rather than a badge. The 62% is a device-pass number, named here so nobody "cleans it up".

Worth stating plainly, because it is the same mistake in a new coat: the tokens were right and the **amount** was not. "This hue is sanctioned for this meaning" does not settle how much of it a subordinate tier can carry.

**One further reversal of a claim the first pass made confidently and wrongly** — that the canvas could not use the status hues at all, because the `behind` tier is defined by `saturate(.3)` and a mark inside it would arrive as one olive whichever colour it started as. That filter is on **`.pin-b`**, and neither of these marks is inside it: a ghost has no filter at all, and the shoulder badge is `.pin-b`'s sibling. **Moving the mark out of the body dissolved the constraint rather than working around it**, which is worth recording because the constraint was real right up until the placement changed.

### 4. Silence on every other tier is a consequence, not a rule

No tier below needs excluding, because none of them can have an outcome:

- an **`idea`** and a **`shelf`** maybe have no event to carry an `EVENT_STATUS` at all;
- an **`ambient`** night is mid-span, where nothing happens to settle;
- **`upcoming`** is unreachable rather than excluded: a place a human marked done is `behind`, since ADR-0117 §2 already made a human outrank the clock.

Two consequences fall out with no rule of their own:

- **Plan mode marks no filled pin.** `planning` withdraws `behind` entirely (ADR-0130 §2) — a day you are arranging has no past to report on. Its **ghosts still speak**, because a ghost is about another day whichever mode you are in.
- **The dot tier and the errand's context demotion drop the mark.** The ghost's costs nothing: it lives in `.pin-g`, which both already drop. The filled pin's needs one precise entry in the dot tier and nowhere else — `.pin-n` holding a _number_ is deliberately not degraded there (nothing that carries one ever is, since all-days numbers nothing at all), while `.pin-n` holding an _outcome_ can exist on an all-days behind pin, and a 5px disc whose whole content is a mark is a smudge.

### 5. Which day the mark reports on

The one place this could go quietly wrong, so it is stated:

- **A `behind` pin reports the day its tier read** — `placeDay` with the same context `placePinTier` resolved against. Never `placeMetaDay`, whose all-days walk to the next edge is right for a row's _wording_ and would let a pin be greyed by one day and marked from another.
- **A ghost has no day in the scope** — that is its definition — so it reports the day it is **live** on: `placeDay` with the scope dropped, i.e. the earliest day not behind you, else the last. The same resolution `isPlaceLeft` and the all-days rows already use (ADR-0124), so a chip, a row and a pin cannot disagree about one place.
- **A strictly-middle stay night reports nothing.** `spanDays` gives every day of a span the event's status, so a hotel marked done would otherwise stamp a ✓ on each of its nights — a claim nobody made about any one of them. Suppressed exactly as the row suppresses it.

## Consequences

- **The canvas and the list finally make the same claim about a place**, in the same words and the same colours, off one derivation.
- **A ghost stops being pure clutter.** It now answers the only question it raises, and the unmarked ones are the ones still live.
- **No schema change, no new tier, no new hue, no second derivation.** One optional field on `MapPin`, one pure function, two CSS rules.
- **An unsettled passed pin is now a visible open question with no answer available where it is asked.** The Map can read an outcome and still cannot write one — settling lives in the day view's settle strip (ADR-0043) and the event card. That gap is backlogged as its own design pass; it is the natural next step and deliberately not smuggled in here.
- **The badge's slot is now deterministic rather than accidental** — see the build log. Worth knowing beyond this ADR: `.pin-n`'s corner had been decided by its own `dir="auto"`, which only resolved the way it does because the content was always digits.
- **The status hues are on the canvas for the first time**, and reusing a documented idiom rather than inventing one: design-language.md names "checklist ✓/✗" as the canonical `--ok`/`--miss` case, and the day view already ships a green disc with a white ✓ (`.wp-event-check`, which that file calls out by name as "the day-view done ✓ — a green circle, a completion record"). This is that object at pin scale, toned into its tier.
- **Two things want the device pass** (the same pass ADR-0123's floor/cap and ADR-0130 §3's hatch are already waiting on), and the 62% mix above is a third: a green ✓ ghost over dark park-green tiles is the weakest pairing on the canvas, and the fallback if it does not hold is the coloured **disc** in the ghost's centre instead of a stroke — drawn in the mockup, and a one-line change. The `.pin-o` stroke weight is the other number worth re-checking at 34px.

## Alternatives considered

- **The mark REPLACES the category glyph on a filled pin** (this ADR's own first pass, `map-pin-outcome-v1.html`). The argument was that in front of a place you have finished with, _what happened_ outranks _what kind of place it is_. True of one pin, false of five grey ones side by side — which is the case that matters. Rejected by the owner: _"they should retain their icons so it's easier to distinguish."_
- **The mark as a SECOND badge, beside the number** (v2's own first pass). Rejected by the owner on both counts: the number has nothing left to say about a settled stop, and two badges on one teardrop is visibly busier. Drawn in the mockup's §F.
- **A silent ghost.** v1 argued a ghost must not carry an outcome because it would report on a day you are not looking at. That turns the ghost's one advantage into a defect: what you need to know about another day's plan is whether it still stands.
- **A strike-through of the glyph for skipped.** The app's own idiom for skipped in the bookings archive (`.bld.is-skip .bld-ttl`) — but there it strikes a **word**. A bar across an emoji at 13px is texture, not a statement, and it makes the pair asymmetric: a mark for one state, a treatment for the other.
- **Shape only, in the pin's ink** (v1's white, then dark ink). Both were answers to a contrast problem the shoulder disc does not have, and both gave up a signal the design language explicitly reserves for statuses. Kept in the mockup's §F because the white specimen is the clearest demonstration of why the disc has to be dark or coloured: white reads on `.pin-n` because that badge sits on `--ink`, while a pin's body is a pastel.
- **Four other skip symbols** — a slash, a bar, a hop-over arc, media chevrons, a circle-slash — bake-off in the mockup's §A at the 34px floor. ✕ won on legibility and on being the only one that pairs with ✓; the bar reads as _unmarked_, which is the state it has to be distinguished from, and the arc and the chevrons turn to mush inside a 12px disc. The known cost of ✕ is that the app also uses that shape for a **dismiss** control — accepted, because there it is a standalone chrome button and here it is a mark inside a coloured disc on a tappable pin that has no dismiss verb.

## Build log

- **`.pin-n`'s corner was an accident, and putting an icon in it exposed that.** The badge positions itself with `inset-inline-start` **and** carries `dir="auto"` — and `auto` over digit-only content resolves to LTR. A logical inset resolves against the element's **own** direction, so the badge has been sitting on the **left** in an RTL app for as long as its content stayed numeric. An SVG in the same slot inherits the page's RTL and flips to the other shoulder. Found twice over: first when the mark was a second badge (a logical `inset-inline-end` resolved to the _same_ shoulder and painted over the number), then again when it moved into this slot. `.pin-n` is now pinned with physical `left` — identical pixels, for a stated reason instead of a coincidence.
- **A ghost drew its outcome twice**, once in its centre and once on a shoulder it has no number for, because the two placements were independent JSX guards over one `outcome` field. Fixed by splitting it into two named slots (`centreMark` / `badgeMark`) derived once, so exclusivity is a fact of the markup rather than an invariant two conditions have to agree on.
- **The ambient guard cannot live on the tier.** Settling a stay settles every day of it (ADR-0117 §2 outranks the clock), so a done hotel's strictly-middle night resolves to `behind`, not `ambient` — the guard has to read the **day's** prominence. Caught by a test asserting the wrong tier, which is the useful kind of failure.
- **The first specimens flattered the design**, pairing green category hues with ✓ and reddish ones with ✕. The mockup's §C now draws the mismatch — a green ✓ inside the reddish food outline, a red ✕ inside the green leisure one — because that is the pairing that decides it. It holds: the outline is the category and the mark is a distinct object inside it.

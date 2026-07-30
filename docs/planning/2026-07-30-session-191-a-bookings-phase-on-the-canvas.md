# Session 191 — a booking's phase reads on the canvas (Phase 11, design + build)

**Date:** 2026-07-30
**Scope:** Phase 11 of the map panel's third pass (#22) — design session with a mockup, then the build.
**Outcome:** [ADR-0141](../decisions/0141-the-pin-says-which-transition-is-next.md), mockup [`map-pin-phase-v1.html`](../../mockups/map-pin-phase-v1.html), built the same session. The Phase-11 backlog line and the hotel-changing-day follow-up it absorbed are both pruned.

## What the task was, and what it actually turned out to be

The brief said this was a **vocabulary decision, not a build problem** — `.pin-tag` exists, ADR-0063 owns the words, `deriveNow`/`eventPhase` give pre/during, `MAP_PIN.TAG_RISE` reserves the room. That held, and the reading got narrower still once the code was open:

**One of the parts was already on this screen.** `Map.tsx`'s `dayMeta` calls `eventEdgeTransition(event, usageDay.edge)`, and its answer — `what` — is the **first** thing a place row's meta line says, ahead of the address and the category. So the list under the canvas already read `צ׳ק-אאוט` while the pin above it read `היעד הבא`.

That reframed the whole thing. This is not "put a phase on the pin"; it is the **wording half of ADR-0137**, which had closed exactly this split for the outcome mark one object over. Which meant the design's job was to decide what the tag does with the word, and the answer to "where does the word come from" was already written: `pinTransition` is a five-line function beside `pinOutcome` reading the same index.

`eventPhase` was in the brief's list of parts and is the one part the design did **not** need. Which end a day sits at (`DayUsage.edge`) already carries pre-vs-during, because a bracketed event's two ends are two different moments: `צ׳ק-אין` _is_ "you have not checked in", `צ׳ק-אאוט` _is_ "you are in and the exit is what's ahead". So there is no `לפני` prefix and no phase enum — §2 of the ADR, and the reason the vocabulary count stayed at zero new words.

## The three open questions, and which of them the mockup answered differently

### The slot — settled as designed, with a debt

One line, and the transition word wins it; `עכשיו`/`היעד הבא` stay the fallback for a place with no bracketed end. Two stacked tags was drawn and rejected (it doubles the axis §B measures and pushes amber past `TAG_RISE`'s room).

But replacing the word **costs** something, and that only showed once it was written down: `.map-pin.nowstop` differs from `.nextstop` by 4.4% of pin height in ring spread and 6% in alpha, and the **pulse** that really separates them is killed globally by `App.css`'s reduced-motion rule. The word was the carrier. So the tag gains a leading amber dot — and not as an invention: `.map-tag.now::before` already exists on the row, itself Home's board blip, and `map.css` already claims the dot is "one idiom, three surfaces" while the canvas's share of it was only the pulse. §D of the mockup draws the specimen **without** the dot next to the one with it, so the loss is visible rather than argued.

### The budget — settled cheaply, on an existing precedent

Amber stays the two live cues; every other phase tag is `plain` (`--muted` ink, `--line` border, same geometry). **The amber population does not grow at all** — two pins before, two after — so ADR-0028/0105's "an accent, not a ground" is untouched no matter how many neutral tags there are. ADR-0119 had already made this exact move one surface over: a day a place was only _pencilled_ into is stated in a neutral tag "because amber is time & commitment".

ADR-0137 §3 is the cautionary half, and it is the same lesson twice: _the tokens were right and the amount was not._

### The overlap — the mockup refuted the design that walked into it

This is the part worth reading the file for. Two of my own claims fell:

1. **"The vocabulary is the ration"** — `bracketed` is 2 of ADR-0063's 9 categories, so a day of nine stops has a handful of edges and the rest are ineligible. True of **one day**, false of a **trip**: in all-days every stay's two ends and every flight across nine days are on the canvas at once. Measured: 9 tag-to-tag collisions and one tag off the frame, at both 360 and 390. So the neutral tag is **day-scoped** — which turned out not to be a new display rule at all but the narrowing [ADR-0121](../decisions/0121-embedded-map-phase-6-design.md) §6 had already made for the **number** in session 146, for a reason that transfers exactly: all-days, nothing on the pin says which day the word belongs to, so two hotels from two days both read `צ׳ק-אין`. The density is the proof; the ambiguity is the argument.

2. **I had measured the wrong collision.** Counting tag↔tag intersections says nothing about a tag sitting on the **neighbouring pin's body** — which is worse, because it hides a pin, and which the render made obvious the moment I looked at it. Now its own column, split into total and _wrong-way_ (a lower-ranked tag over a higher-ranked pin, the only kind that is a defect). Day-scoped: 0 on the changing day and on ordinary days, **3** across a deliberately heavy day (five bracketed edges in one district). Flagged for the device pass rather than smuggled; the ladder's z-order is what orders it, the tag living inside the marker.

An amber pin is **exempt** from the day-scope gate, and that is not a courtesy — the ambiguity the gate prevents cannot arise on the one place that is happening now or next. Getting that wrong in the first build is what a test caught.

## Three measurement traps, recorded because two of them are reusable

- **A measurement taken during a CSS transition is a lie of the same class as a selector matching nothing.** `.map-pin` ships `transition: --pin-u var(--t-base)`, so §A's table at the 56px stop came back with the 34px stop's numbers — every read one size behind, and the ratios looked reassuringly size-invariant _for the wrong reason_. `map-place-becomes-v1.html` recorded this trap about the sheet; it applies to the pins too. Cut inside measured stages, as a labelled override.
- **A number that cannot move is not a measurement**, and a _derivation checked in one direction is an assertion._ §B1 derives the clearance threshold from two measured widths, then renders at threshold+2 (must clear) and threshold−6 (must clash) and reads both back. The first version rendered at _exactly_ the threshold, where two boxes abut and `a.left < b.right` on subpixel rects is a coin toss — it reported "still touching" for two of three pairs with nothing wrong with the derivation.
- **A scene I laid out is a scene that flatters me.** §B2's first pins were spread across the frame and returned **zero** collisions under every arm including "tag every booking". Redrawn as a genuine district, the same arm returns 4.

## What it corrected on the way past

`constants.ts`'s `SIDE_REACH` note reported the amber tag reaching **1.10×** the pin's height per side — measured on `התחנה הבאה`, copy the app does not show. The shipped `היעד הבא` is **0.88×**, and the widest new word `צ׳ק-אאוט` is **0.90×** (102%, i.e. the same width in practice). So the camera's horizontal inset does not move, and the exclusion the note documents now rests on a number the app actually renders. Restated in place rather than given its own entry.

## Two fixture facts worth not rediscovering

Both cost a red test before they were understood, and neither is a product bug:

- **A multi-day stay can never be the `nowStop`.** It is ambient, therefore off the counted schedule (ADR-0054), so `deriveNow` never returns it. Testing an amber pin _with_ a transition word needs a bracketed-**not**-ambient event — a same-day transport booking, which also gives each end its own pin and so makes `edge` mean something.
- **`16:00Z` on the active date is already the next day in the trip's zone**, so its day reads as behind and the pin greys. Times in this suite want to sit early enough in the UTC day to survive the +9 shift.

## Not done, on purpose

The owner's "next phase maybe small cute specific animations" stays an explicit deferral, and it now has an owner: session 189's motion brief. The dot added in §6 is deliberately not that work — it is a **resting** mark that exists so the canvas stops depending on motion, which is the opposite direction.

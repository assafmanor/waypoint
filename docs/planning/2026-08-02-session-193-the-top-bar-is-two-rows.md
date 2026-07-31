# Session 193 — the top bar is two rows

**Date:** 2026-08-02
**Scope:** Redesign the in-trip top bar. Design only — **nothing in `frontend/src` was touched.**
**Decision record:** [ADR-0149](../decisions/0149-the-top-bar-is-two-rows.md)
**Mockup:** [`mockups/top-bar-v1.html`](../../mockups/top-bar-v1.html)

## What was asked

From a screenshot of the real app: the top bar takes about a quarter of the screen. Compact it
without losing anything, keep it intuitive, and fix the parts that were not good to begin with —
naming two: nobody would guess that reaching all-trips means tapping the trip name, and some
transitions feel clanky and amateur.

## What the measurement said, before any design

The header stacks **five rows, one concern each**. At 390×844 with a 44px notch inset:
**250px at rest, 321px on a non-today day** — and 37–46% of the screen is chrome once the tab
bar is counted. The two "clanky" complaints were not animation problems: the day-scope ribbon
(42px) and the sync badges (~30px) are **in flow**, so they push the body every time they
appear, and the trip name swaps the entire screen.

## What was decided

Two rows — identity, then the day axis — at **160px in every state and 108px condensed**. The
full decision, with its costs, is ADR-0149. The four calls the owner made directly:

1. **Two rows + collapse on scroll**, not the more radical shape (below).
2. **The chip navigates straight to `/trips`** (⟨ישיר⟩), with the deck cue for discovery.
3. **Mode in the day row**, which is what makes it survive the collapse and work on the Map.
4. **Mode icons-only**, and **more avatars** in row 1 now that mode has left it.

## The four corrections this session went through, in order

Each was wrong in a way the next one fixed, and all four are worth keeping because the reasoning
generalises.

1. **"Make the trip name a menu."** Improves comprehension _after_ the tap; the reported problem
   is that nobody taps. **Discovery cannot be fixed by something you must tap to discover.**
2. **"Then put a back arrow at the leading edge."** Fixes discovery, but **asserts a hierarchy
   that is false** — ADR-0033's landing rule opens a live trip _directly_, so trip Home is the
   main screen and the action is **lateral**, not up. Owner's correction.
3. **"Mode belongs in row 1."** It does not: row 1 collapses, and the Map opens collapsed, so
   mode would be unreachable on a whole tab. Owner's correction, and it also bought the trip
   name 103px.
4. **"Two rows can't fit a max-length name."** True only while mode sat in row 1. With mode in
   the day row an 18-character name renders at **17px uncut** — where the _shipped_ header
   clips it. The objection that had been used to argue for the other shape was withdrawn.

## The instrument was wrong four times, and that is the transferable part

This mockup renders the shipped stylesheets and prints measurements off the live DOM. Four times
it printed a number that the frame beside it contradicted:

- **`--safe-top` is 0 in a desktop browser**, so neither header paid a notch and the faked status
  bar sat on row 1. Both frames now simulate a 44px inset.
- **The frame was 390px wide with a 374px viewport** (the bezel is padding), so every width was
  16px pessimistic — enough to truncate a name that fits on the device.
- **A transition in flight makes every width a lie.** The frame's own `width` animated, and later
  the mode label's `max-width` animated over `--t-base`; a next-frame read sampled both
  mid-flight. Re-measure after they settle.
- **`scrollWidth`/`clientWidth` are integers.** Text overflowing by 1.8px reports 94 against 93,
  so the table said "fits" over a frame drawing an ellipsis. Measure with a `Range` over the text.

The last one is not only the mockup's bug — **the shipped `useShrinkToFit` has the same test.**

## Two shipped defects found, neither introduced here

Both are on their own backlog line and should ship before the redesign:

- **`MAX_TRIP_NAME_LENGTH = 18` no longer buys what it was set to buy.** Its comment says it
  exists "to keep the header switcher pill to one line (app-shell.md §5)"; at 390 with four
  avatars and the gear, the shipped pill hits its 15px floor and clips anyway.
- **`useShrinkToFit`'s integer comparison** can stop the loop a step early (above).

## What was drawn and refused

**"The bar comes apart"** — the day strip returns to `DAY_SCOPED_TABS` only (a sticky first row
on the Day view, canvas furniture on the Map), mode leaves the chrome entirely, and the identity
line rides the body as a page title that scrolls away. Measured **Home 44 · Day 102 · Index 44 ·
Map 0**, and it is the only shape that renders a max-length name at 20px uncut. Refused for
changing the navigation model: day-jumping from Home becomes two taps, and chrome height differs
per tab. It stays drawn in the mockup under ⟨הסרגל מתפרק⟩ — if the two-row shape's 3-visible-day
strip proves too tight on a device, this is where to look next.

## The cost that was bought deliberately

The day strip narrows 358px → 182px, so the resting window drops from **7 visible days to 3**
(measured with the selected day centred — measuring at scroll 0 counts whatever sits beside the
trip's first month divider and reports a number nobody sees). This is the largest regression in
the design and it pays for the trip name, for mode surviving the collapse, and for the anchor
slot. **It is the first thing to check on a device.**

## Not done

- No code. `frontend/src` is untouched; the build order is in the backlog line.
- The mockup has not been opened on a phone. Every number in it is a desktop Chromium number at a
  simulated inset, and this repo has been wrong three-for-three on "the motion makes it visible"
  claims that were not device-checked.

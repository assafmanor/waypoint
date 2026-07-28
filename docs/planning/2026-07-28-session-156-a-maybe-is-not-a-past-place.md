# 2026-07-28 — Session 156: a maybe is not a past place

**Outcome:** [ADR-0130](../decisions/0130-a-maybe-is-not-a-past-place.md), built the same session. Three items came in one message; one was a question, two were changes, and a third defect fell out of designing the second.

## What was asked

1. **Explain** the dot's touch-target finding from session 155.
2. **Plan mode always shows full pins in day scope**, and **past places should not be faded in Plan mode**.
3. **Maybes should be represented differently from past events** — "I want to be able to visually distinguish between somewhere I've already been to and somewhere I'm considering", for maybe / maybe-today / past, in both modes.

Then, mid-build: **"a normal trip could have tens of maybes but only a handful of maybe-todays, so maybe-todays should be more prioritized."** That is what decided the shape of the third answer.

## Item 1 — answered in conversation, nothing to build

The finding stands as backlogged. A pin is a real button; a dot at `DOT_SCALE 0.4` is 14–22px depending on the canvas; ADR-0017's floor is 44×44. The two candidate fixes contradict each other's precedent — a transparent hit area is what ADR-0126 §3 explicitly refused for `באזור` ("the floor is met by geometry, never by a hit area painted smaller than it is"), and raising `DOT_SCALE` weakens the density mitigation the tier exists for. A map pin is arguably the one case where an oversized invisible target _is_ the convention, unlike a pill whose box reads as its affordance — but that is a distinction to draw with the thing on screen. **Unchanged, still open, still with the device pass.**

## Item 2, first half — already true, and worth saying so

The dot tier's day-scope rule (session 155) is mode-independent: in day scope only the out-of-scope pins degrade, so Plan mode's day scope already draws full numbered pins. Nothing to build. Stated in the ADR because it was asked as if it were open.

## Item 2, second half — the behind tier is Trip-mode only

Real change. `placePinTier` was given `nowMs` regardless of mode, so a passed stop desaturated in Plan mode too. ADR-0121 §10 had already drawn this line for the day connector — Plan-only "because in Trip mode you are living the day" — and it runs backwards just as well: a day you are arranging has no past.

**The thing that could have gone wrong quietly:** the obvious implementation is to stop passing the clock in Plan mode. That would also have changed which day multi-day stays are read as, because `placeDay` uses `nowMs` to resolve the day a place is **live** on in all-days scope (ADR-0124's own fix) — in the mode whose default scope _is_ all-days. So `planning` is an explicit flag that withdraws one verdict, and there is a test asserting it withdraws only that one.

## Item 3 — the distinction existed and did not work

The pin already had two declarations for these two populations. A maybe was `color-mix(hue 55%, card)`. A past stop is `saturate(0.3)` at `opacity 0.62`. **Two declarations on one axis**, which is why both read as washed out and the report was right.

`design-language.md` had the answer and the pin was the surface that dropped it: "**Soft** — dashed border, **diagonal-hatch background**, lighter type". `.place.soft` hatches; the badge under it hatches; the teardrop substituted a tint. So the hatch came back and the tint went, which puts the two on axes that cannot collide — **a maybe keeps its colour and loses its solidity; a past stop keeps its solidity and loses its colour.**

The generalisable line, worth more than the fix: _a distinction that exists in the CSS is not a distinction until it is on a different axis from its neighbour._

## The defect that fell out of designing it

In day scope, a shelf maybe with **no day at all** was drawn as a **ghost** — hollow, glyph-less, the treatment whose whole meaning is "this belongs to another day". ADR-0121 §6 said so explicitly, folding "another day" and "no day at all" into one population. That is wrong about the second one: **a place no day has claimed is not busy elsewhere, which is exactly what leaves it available today.** It was drawn as the opposite of what it is.

The owner's "tens versus a handful" then decided how the two maybes separate: size, z-order, and the dot tier (in day scope the aside pins are what degrade at wide zoom, so the tens become dots and the handful stay full pins). No third paint — it would need a fourth for the next case, and the `אולי` facet already exists for making the maybes the _subject_.

## The five call sites that only looked like "is a ghost"

Splitting the tier surfaced this: `!== PIN_TIER.ghost` appeared in five places — the amber-cue guard, the camera's fit, the day connector, the `באזור` area readout, and the tap that surfaces a row the sheet does not contain. **Every one of them means "the day scope did not choose this place"**, which is true of a dayless maybe exactly as it is of another day's ghost. Keying them on the reason (`isAsidePin`) is what kept the split from being five silent behaviour changes — the area readout would have started under-counting, and a dayless idea would have started pulling the camera.

Same shape one level down in the CSS: `.aside` is the shared **ratio**, the tier class is the **paint**. Because the ratio has a name, the dot tier names the pair in one selector where it listed `ghost` twice, and `.soft` lost five per-category overrides. **The diff is a net simplification of the pin CSS despite adding a tier.**

## Rendering it changed three things

The pins were put in front of a headless Chromium with the **real** `map-pane.css` + `tokens.css` (linked, not ported) at 3–5×, at the 34px floor, the 56px cap and dot size.

- **The first hatch — 82% card at a `0.12` stripe — read as a barber pole.** The maybe was visibly _louder_ than a committed stop, which inverts the ladder it sits in. A 4×3 dial sweep landed on **45% at `0.08`**.
- **At dot size the dashed edge is under a pixel** and read as a ragged rim rather than as provisional. It goes solid there, with the glyph and number, for their reason (ADR-0128's "demote what claims precision"). The hatch stays — it is what tells a maybe from a passed stop at 20px.
- **The 0.72 ratio separates the two maybes at both extremes**, which was §3's open question.

This is not a device pass and does not claim to be one; the cluster is untouched and gains two look questions. It is the narrower claim that **the geometry was checked against a renderer rather than against arithmetic**, and that doing so caught an inverted ladder before it shipped. Given that this epic has now had two decisions corrected by a real screen (sessions 143 and 153), a headless render is a cheap thing to do before writing the number down.

## Gates

`pnpm format` → `typecheck` → `lint --force` → `build` green; **1466 frontend tests pass**. The backend suite fails wholesale on `Can't reach database server at 127.0.0.1:5432` — no Postgres in this sandbox, and the diff is frontend-only.

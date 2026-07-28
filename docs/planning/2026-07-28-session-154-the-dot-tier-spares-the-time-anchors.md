# Session 154 — the dot tier applies to precision, not to priority

**Date:** 2026-07-28
**Kind:** small correction, from the owner questioning the tier built two sessions earlier.
**Output:** [ADR-0128](../decisions/0128-map-dot-tier-and-the-cards-camera-reserve.md) §1 amended. One CSS scope change, two tests, no new constants.

## The two questions, and why one of them was a defect

The owner asked two things about the `dot` tier:

1. should **today's** pins demote to dots like the rest?
2. **happening-now** and **upcoming** pins certainly should not — right?

The second is a defect in what shipped. ADR-0128 §1 had already written _"the amber ring and pulse stay: that cue is prominence, not text"_ — and then the CSS dropped `.pin-tag` (the `עכשיו` / `התחנה הבאה` label) and scaled the ring off `--pin-u`, so at `DOT_SCALE` 0.4 the ring was 40% of its size. The reasoning was pointing at the right answer and the implementation applied it too weakly. Worth noting how that happens: the ADR sentence was true about the _ring_ specifically, so it read as satisfied while the cue as a whole was being dismantled.

## The rule that settles both

**Demote what claims precision; keep what claims priority.**

- glyph, order number, tip → _which one_, _where exactly_ → claims a 30km view cannot support → dropped
- hue → _what kind_ → survives any zoom → kept (already was)
- the amber cue → _what matters right now_ → survives any zoom → **kept, undegraded**

So the time anchors are not degraded at all — full size, glyph, number, tag, ring, pulse. That is a rule and not an exception, for two reasons: it costs nothing in density terms (there is exactly one of each, and the crowding is the other N), and it turns the degradation into a **promotion by contrast** — a wide view becomes dots plus one or two real teardrops, which is the most direct answer to "where am I / where next".

## And today's pins do demote

This was the owner's genuine open question, and the argument against exempting them is practical rather than aesthetic: **it would make the tier a near no-op in day scope**, where almost every pin _is_ today's. The only thing left to shrink would be ghosts, already the bottom rung. And in the case the tier exists for — all-days on a multi-city trip — "today" is not even a tier, because all-days scope has no ghosts at all, so every pin would be exempt and the tier would do literally nothing.

## Shape of the change

`:not(.nowstop, .nextstop)` on the degradation, rather than an override that undoes it. One statement of what a dot is, no second rule racing the first. jsdom applies no CSS, so the tests assert the **mechanism** the rule is written in: that the exempting classes reach the markup, and that an exempt pin still renders the number and tag CSS decides whether to show.

## Still unseen

Whether a dot at `DOT_SCALE` 0.4 reads as a place rather than as dirt, and whether one full teardrop among dots reads as emphasis rather than as a rendering glitch, are both look questions. They join the device-pass cluster — which this session is one more argument for, since two of the last three map changes were corrections from someone actually looking at the thing.

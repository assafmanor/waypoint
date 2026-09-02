# 2026-09-02 — The marker points; it does not separate

**Task:** brainstorm and design how the day surfaces should show where we are in the day, after the
owner reported that the now-line reads as "this event has not started" when we are inside the event.
**Shipped from this session:** [`mockups/the-now-line-is-inside-something-v1.html`](../../mockups/the-now-line-is-inside-something-v1.html),
[ADR-0217](../decisions/0217-the-now-marker-points-it-does-not-separate.md) (Proposed), a catalog
entry, two backlog lines closed out, and one fix to our own tooling.

## The two forks put to the owner, and the answers

**Fork 1 — four ways to mark where we are inside a row.** The first pass drew all four: the shipped
hairline moved below the row, a ⁦4px⁩ gauge on the card's leading edge, the hairline laid across the
card (Google Calendar's literal answer), and a bead on the day's own thread. The recommendation was
the gauge, paired with moving the line.

**Answer:** _"I don't think that this indication is good. Let's think outside the box. We don't
**have** to keep a row saying what's now. We can do an arrow or idk, as long as it's clear that it
indicates to when we are in the day and is prominent enough so that people immediately and
intuitively understand."_

So the default changed rather than the option list growing (root `CLAUDE.md`: _a correction is not a
fork_). §3 is now a **playhead** and the four earlier drawings moved to §7 as the rejected pass, kept
because their reasons are measurements. The gauge's real contribution survived in a different form:
it was the only candidate that could mark two rows at once, and that job went to the **shipped**
`.wp-event.now` ring — ring = who, arrow = exactly where — which is a division of labour that costs
nothing at all.

**Fork 2 — how "longer events look longer".** Four answers drawn, and one refused by measurement
(§4א, true proportional height: a 30-minute card at ⁦24px⁩ against the face's own ~⁦70px⁩ floor). The
recommendation is §4ג, the proportion moved into the **gaps**, which are the one part of the day with
no content to protect. Not yet answered by the owner.

**Fork 3 — what the rule does where it crosses a row.** Three shapes, and the owner refused two of
them against a render before the third stood.

_"just make sure to you fix the issue where the playhead is going over the text… Other cases looked
great as is"_ — against a screenshot of a **gap**. The idea was never the problem: occlusion had
exactly one mechanism, a card's opaque background, and ADR-0210 §3/§4 took the box away from a leg
and a bracket on purpose. So a gap's `1:15 שע׳ פנויות` and a leg's two lines were struck through.

The first fix masked the rule to the two ⁦16px⁩ margins. _"It looks kind of weird when it's totally
cutoff like that. Maybe transparency or something, get creative."_ Right — on a ⁦40px⁩ leg carrying
two lines of text that is two stubs and no line.

The second was a translucent **band**: an ⁦18px⁩ amber wash at ⁦12%⁩ over everything with a ⁦2px⁩ core,
solid in the margins and ⁦22%⁩ across a row. It genuinely solves both complaints — continuous, and
light rather than ink. _"I actually preferred much better when it didn't go over the event rows,
like you originally did."_ So it is recorded in the ADR's Alternatives as the obvious next idea and
the answer to it, and the rule went back behind the rows.

**What was actually missing was one selector, and it was already shipped in the same row family.**
`.day-trv-ic .icon` carries `background: var(--screen)` and a ⁦4.5px⁩ halo because _"the glyph rides
ON the track, so the rule stops behind it instead of running through it."_ The leg's glyph had been
stopping the rule for free the whole time; only the words were left out. The gap's label and `+`,
and the leg's **inner** text runs, carry the same halo now — inner and not the block wrappers,
because `.day-trv-hd`/`.day-trv-meta` are column-width and a halo on those masks the rule across
the whole row, i.e. the stubs again by another route. The lesson is the one this repo keeps
re-learning: the fix for a boxless row was one row down in the same stylesheet, and three drawings
went by before anyone looked there.

## What reading the code changed

**The app had written this bug down, in the file that causes it.** `lib/now-line.ts`'s header says
the index-based marker is an approximation and names the exact fix (`inside`), the return type is an
object with one field so it can grow that, and `docs/backlog.md` carries the item twice dated
2026-08-02. The design work was the missing half, not the analysis.

**The screen already contradicted itself in two adjacent rows.** `EventCard` puts the shipped
`עכשיו` chip on the running card and the line above the same card says the event has not started.
That chip is also why the playhead needs no clock of its own.

**A marker between rows cannot answer this — and that is a fact about ADR-0041, not a taste call.**
An envelope holds the moment in two rows at 17:30; a cluster holds it in two peers. An index has one
value. This is the argument that made the redirect obviously right rather than merely an alternative.

**`--trv-track` is the badge's centre, and ADR-0212 §2 measured it there deliberately.** That killed
the bead outright: on an event card it sits on the tile, and layering only trades a collision for a
disappearance behind the card — which is exactly what `.day-thread > .wp-event` guarantees. Reading
the ADR rather than the stylesheet is what turned "needs a z-index" into "cannot work here".

**`dayBlocks` draws no row above the first entry.** `join` is computed only when `prevEnd && start`,
so the day's head hole has nothing to attach a marker to. That is what produced the one rule that
covers the three "nothing holds the moment" cases: attach to the **boundary** of the row you are next
to, as a zero-height wrapper.

## What rendering found — three defects in this file's own drafts, and one in our tooling

**`scripts/render.mjs` measured its first theme×width pass in the fallback typeface.** FIXED in the
skill, with the witness in the comment. `document.fonts.load()` resolves when a face is _fetched_,
not when it is applied, and `requestAnimationFrame` does not force the application for content below
the fold — so one `.wp-event-timemeta` came back ⁦105.8px⁩ wide in pass 1 and ⁦123.4px⁩ in pass 3, which
is the difference between a grid cell that wraps and one that does not. The same box was reported as
⁦72px⁩ and ⁦91px⁩ in one `measurements.md`, with no error and a full table either way. Playwright's own
screenshot _does_ wait for fonts, so a throwaway shot before the loop makes every pass equal. Note
the shape of the failure: the number that lied was the one saying the change cost nothing —
`references/pitfalls.md` warns about exactly that and about a face you did not list, and this was
both.

**A chip at a card's leading edge lands on the badge.** In RTL that edge is the ⁦40px⁩ badge's own
column, so the shipped `.nowline` order (chip, then rule) drew the clock over the glyph. It is why
the arrow lives in the day's margin, and it is invisible in source.

**An off-frame probe must reproduce the frame, not approximate it.** The wrap boundary for
`נותרו 1:10 שע׳` sits inside ⁦2px⁩ — the live card is ⁦326px⁩ and the probe was set to ⁦328px⁩ — so the
probe reported the wording as free. It renders inside a real `.phone`/`.fbody` now.

**And the nested arrow moved sideways.** `.nest-kids` indents by ⁦32px⁩, so a concert-inside-a-festival
got its arrow ⁦32px⁩ further in than the festival's: a marker whose column depends on how deeply the
day happens to be nested. `--now-bleed` is overridden per brace, which is `.day-trv-ic`'s "the day
has ONE leading edge" one column over.

**Three more, from the passes above.** A measurement row printed a hard-coded `2` for the rule's
thickness, hidden behind a `?? 2` fallback, because `querySelector` cannot return a pseudo-element —
a measurement table quietly supplying the number the prose wanted, which is the worst failure mode
that panel has, and it was in this file. The journey block was drawn with `ahead`/`done` tone
classes that do not exist (`DayJoinRow` takes `time | miss | on-way`), and worse, `on-way` was being
derived from the clock — which would have drawn the playhead as flipping the traveller's own switch
and spent the teal ADR-0210 §3 keeps for it. And a Plan-arm rewrite for the band put full-strength dashes
across the row, because a `repeating-linear-gradient` cannot carry a second axis of alpha — moot
once the band was refused, and worth writing down as the reason not to reach for that shape again.

## Backlog

`docs/backlog.md` lines 44 and 431 are the two halves of this item (the split between the two hosts,
and `inside` itself). Both now point at the ADR and the mockup rather than describing the work again.

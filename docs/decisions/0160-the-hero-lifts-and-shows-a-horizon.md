# 0160 — The hero **lifts**, and what it lifts is a **horizon**

**Status:** Accepted (owner sign-off 2026-08-03, across two mockups read in session). **Built 2026-08-03 — phases 1-4 — and AMENDED TWICE from a device the same day, so read both amendments at the end before §5, §7, §9 or §10.** Round one withdrew the rebuff, centred the landing and fixed a class collision that laid the horizon out in a row; round two built the motion (the measured two-pass FLIP, the swing, the landing beat) and records four things only a real browser could say — chiefly that the lifted hero was inheriting the app's one cinematic moment. **Phase 5 no longer exists**: it was the rebuff, retired by amendment §A before it was built. See the [build plan](../planning/2026-08-03-session-210-the-hero-lift-build-plan.md). **§H (2026-08-03) answers Plan mode:** its hero does **not** lift — its depth is the checklist directly beneath it — but a tap is answered by §9's rebuff, which comes back for the surface that actually has the condition §9 described. **§I (2026-08-03) closes the build:** `in-transit` lifts, and every phase of this ADR is now built. The one item deliberately NOT built is §10's "seat", which is a datum the app does not store — see §I.
**Date:** 2026-08-03
**Design reference:** [`mockups/hero-lift-v1.html`](../../mockups/hero-lift-v1.html) (the motion) + [`mockups/hero-horizon-v1.html`](../../mockups/hero-horizon-v1.html) (the content). Every measurement below is read from those files' live DOM, at 390×844 and 360×640, in both themes.

**Closes the [Hero 2.0 brief](../planning/2026-07-28-hero-2-0-design-brief.md)** (raised 2026-07-28, session 148) and all six of its sub-questions.
**Closes [0121](0121-embedded-map-phase-6-design.md)'s 2026-07-28 amendment §4**, which backed the map way-in off the board and said the hero's own redesign was "the shape it actually wants there". This is that shape, and the way-in lands in §3.
**Closes the [notes brief](../planning/2026-08-01-notes-design-brief.md) §C3**, which put no mark on the Board on purpose and handed the board's note-reach here.
**Extends** [0041](0041-parallel-overlapping-events.md) §6 (the `ועוד N` expander is retired; `group-split` gains depth per equal), [0059](0059-booking-presentation-on-home-and-index.md) §1/§2 (the in-transit hero gains a below-decks), [0139](0139-one-settle-control-three-hosts.md) (a fourth `SettleControl` density), [0140](0140-motion-foundations-overlays-arrive-taps-answer-routes-have-a-direction.md) (a third one-shot answer beat, and the lift's own entrance/exit), [0148](0148-the-place-form-has-the-room-it-needs.md) §1 (the bounded-card-with-one-scroller pattern, second consumer).
**Applies unchanged** [0011](0011-hard-soft-event-model.md) (the hero offers no time edit, so the guard is never reached), [0017](0017-mobile-first-phone-primary.md) (44×44, measured at both widths), [0018](0018-derived-state-not-stored.md)/[0027](0027-no-derived-persistence.md) (now/next and the lift's own trigger are derived), [0028](0028-plan-violet-color-budget-dark-ready.md) / root rule 4 (no new hue), [0090](0090-back-is-computed-from-nav-state.md) + [0103](0103-one-back-action.md) (it is a back layer), [0107](0107-per-place-timezones-and-multi-zone-time.md) (more times means more pills), [0045](0045-trip-home-real-data-only.md) (real data only), [0158](0158-dark-mode-ships-and-the-ink-a-surface-carries-is-a-token.md) §3 (`--on-dark` ramp) and §15 (an inverted surface is where a paper component breaks).

## Context

Map epic Phase 5's rule was "every event and booking has an easy way to its pin". Applied literally it put a teal ring and a pin marker on the board's now/next icons, and it read **too loud** — the board is the app's one dark, glowing, pulsing surface, rationed to one per screen. It was backed out (ADR-0121's amendment §4) and the owner's reaction named the real shape: **the hero should not grow controls, it should open.**

The brief called one question load-bearing: expansion or overlay? Both answers were wrong, and the owner's own description is the third thing neither word covers:

> _"the hero is expanding 'towards' the eyes of the user in an animation so that it pops out of the home screen. It doesn't render the hero twice like you described the overlay, instead the hero becomes the overlay 'lifting' from the screen."_

An **expansion** is a pane of Home, so it reflows the page under your thumb. An **overlay** as the brief drew it is a second surface rendering the same facts, which throws away the glance value the board exists for. What the owner described is neither: one object, one identity, gaining elevation.

## Decision

### 1. It is a **promotion**, not an expansion and not a second surface

The board **lifts**. One element, measured off its own collapsed box, that leaves Home's flow and comes back.

The mechanism already exists and is not a `Modal` invention: `.wp-dragghost` (`tokens.css:405`) is the shelf's drag clone — sized and positioned from JS off the source element's measured box, `position: fixed`, `--shadow` and a scale so it reads as picked up. Its own comment settles the fact the lift depends on: **no ancestor establishes a containing block for it.**

**The inline board holds its space with `visibility`, never `display`.** Home must not reflow under the thumb; that is the failure an expansion has by construction and the lift must not inherit it.

### 2. It is still a back layer, and that is not negotiable

It can be dismissed, so ADR-0103's amendments and ADR-0090 apply with no exemption: it registers through `Modal`/`useOverlay`, and the `✕`, the backdrop, Escape and the Android gesture run **one** function.

What this ADR rejects is the **sheet's grammar**, never the back contract. The alternative was live and wrong: `SnapSheet` is a pane that registers nothing (ADR-0121 §5), and on that model a system back would leave the tab with the hero still up.

### 3. What it lifts is a **horizon**, and only three things earn the interaction

`CLAUDE.md` says what the app is for: _"what now / what next / what do I need in the next 30 minutes."_ The collapsed board answers the first two. The lifted hero is the third, which gives a shape rather than a list: **the collapsed board shows two POINTS, the lifted hero shows a HORIZON with depth on each point** — `עכשיו → ועוד עכשיו → הבא בתור → אחר כך`.

Only three things pass the brief's own test ("worth an interaction, not a reflow of the same facts"), because the collapsed board already carries title, kind, until-time, code, countdown, zone shift and concurrency:

- **`איפה`** — the place, the way to its pin, and the `ניווט` hand-off. The board has **never** carried a place in any form. This is Phase 5's affordance, and the lift is what makes it affordable: it now lives in a state you asked for, not on the glance surface whose budget was already spent.
- **`פתק`** — the note the group wrote about this stop. Genuinely new content, handed here on purpose by ADR-0152/0153.
- **`הסדרה`** — whether it happened.

**Reads, hand-offs and settles. No time edits, and no ±30 nudge** (owner's call). That is why ADR-0011 is listed as applying _unchanged_ rather than extended: the hero never reaches the guard, because settling **records an outcome** rather than editing a commitment, and `SettleControl` already treats every event as settleable rather than only the passed ones. The ±30 stays on `EventCard`, one tab away.

### 4. `ועוד N עכשיו` is retired, and it is **forced** rather than tidy

The brief's sub-question 4 guessed the board's two expanding things "most likely become one". It is stronger: if the whole board is the tap target it is a `<button>`, and `.wp-board-also-toggle` is a `<button>` inside it.

**This is not a theoretical validity point — the parser destroys the board.** Drawn once in the horizon mockup, Chrome **closed `.wp-board` at the nested button** and reparented everything after it, so the divider, `הבא בתור` and the day rail landed on the page background in dark ink. A detached-tree probe in that file reports it as a number: **1 of 4 children left inside the board.**

So the count becomes a **readout** — same dot, same words, no chevron, no press target — because it must stay legible without a tap, and its rows move into the horizon. This was the board's **only** interactive child, so afterwards the collapsed board has none.

### 5. The character is **the swing**, and it decides that the hero covers the chrome

Three characters were drawn. **Chosen: ההטיה** — the box travels to the top of the screen while the hero straightens up toward the viewer from 9° back and 46px away.

Two of the three were **rewritten by the measurement**, and neither correction was reachable by reasoning:

- "Rise to just under the chrome" measured **4px**. The board is the first thing on Home, so there is nowhere to rise to that is not _over_ the chrome.
- "Approach as a scale-up" measured **×1.045**. The board is already near-full-width (358 → 374px), so a width-keyed FLIP has no scale in it to spend; the lift's entire visible budget is **height (×2.01) and elevation**. A literal "toward the eyes" therefore has to be a 3D swing, which is the one channel that reads as depth when width does not change.

**So the lifted hero covers the chrome** — 72px, the whole band ADR-0028 names as mode identity and ADR-0158 §12 has just given light mode its own version of. That is consistent with itself: the lifted state is modal and only one mode exists inside it, so an identity with nothing to distinguish it from is not needed there. It also buys the 72px that keeps most cases off a scroller (§8).

**All three animate the box, so text is crisp at both ends**; the swing makes it soft only while the angle is non-zero. `--ease-arrive` is licensed here (an entrance of a real object) and forbidden on the way back.

### 6. `--t-cinematic` is not available

ADR-0140's budget rule is one line and absolute: exactly one cinematic moment, the Plan→Trip switch. The app's signature surface lifting is precisely the thing that would ask for 600ms and it cannot have it. **`--t-base` (240ms) in, `--t-quick` (140ms) out.**

### 7. The return has a **landing**, and the exit is not the entrance reversed

`--ease-exit` accelerates _into_ its end, which is already the curve of something being set down, so the path is right; what was chosen is what happens at the moment of contact. **The drop plus one landing beat** on the board that comes back: `scaleY(0.975)` at 40%, `linear`, `--t-quick`, origin at the bottom edge. The object visibly touches down instead of the flight merely stopping.

Deliberately tiny. A squash big enough to read as a squash is a bounce, and a bounce is exactly what forbidding `--ease-arrive` on exits exists to prevent.

**This makes three one-shot answer beats, and they are one primitive.** `.is-nudging` (a form refuses, ADR-0150), `.is-rebuffing` (§9), `.is-landing` (here). All three: a class applied imperatively for one shot and removed at `animationend`, `linear` because the keyframe offsets **are** the timing, symmetric so no `--dir`, duration from a token. They differ only in axis and meaning, which is the part that should be per-case. ADR-0139 is the precedent for what happens otherwise: three copies of one control drifted on four axes before anyone counted them.

### 8. The hero is sized by its **content**, and it is bounded with one scroller

**Content-sized** (owner's call), not screen-sized. The surface is exactly as big as it has something to say, which also keeps it continuous with the small box it grew from. The cost is accepted and recorded: `בטיסה` claims **49%** of the screen, so a thin case leaves the backdrop nearly empty. The rejected alternative is worse — a screen-sized hero puts ~400px of empty dark board under a flight, and empty space on the app's one glowing surface reads as something that failed to load.

When the content does exceed the room, the hero becomes a **bounded card**: head pinned, foot pinned, **one** scroller in the middle. Not a new pattern — it is ADR-0148 §1's answer for the Map's place card, reached for the same reason.

**The fit is measured, because this is the number that could have made "lift" a euphemism for "second screen":**

| case                              | 390×844 (826px room) | 360×640 (622px room) |
| --------------------------------- | -------------------- | -------------------- |
| thin / typical / full             | fits                 | fits                 |
| heavy (3-line note, 3 concurrent) | fits                 | 72px over            |
| `group-split`, 2 equals           | fits                 | 92px over            |
| `group-split`, 3 equals           | 9px over             | 255px over           |
| `in-transit`                      | fits (49%)           | fits                 |

The common case is not a scroller. Note the row that reasoning would have missed: **a two-way group split scrolls on a small phone**, and two is that variant's commonest form.

### 9. A tap with nothing to open gets the **rebuff**, and the trigger is derived

A tap must be answered. The rebuff is a vertical lift of 7px that settles back — `linear` keyframes, `--t-base`, **no colour at all** (`--miss` is a refusal-of-error; this is a refusal-of-content).

**No text** (owner's call, revised in session from a one-shot line). A line that appears and disappears on the app's loudest surface reads as a scolding. Three things fall out of that and they make it the better answer rather than merely the smaller one: no frequency question survives into the build, no new string or translation exists, and the answer stays in the channel the question was asked in — you touched the surface, the surface moved. The argument against is recorded: a lift that returns reads as "nothing here" mainly to someone who has seen a real lift, so the **first** encounter is the un-teaching one. If that proves real on a device the answer is a one-time hint, not permanent copy.

**The trigger is derived, not a variant check.** The hero lifts when the expanded state carries something the collapsed one does not. A perfectly valid `now` board whose event has no note, no place, no code and nothing concurrent has the same nothing to open as a `free` board, and a `variant` test would have missed it.

### 10. Per-variant rules, and the two that are about meaning rather than room

- **`now`** — the full horizon.
- **`group-split`** — every equal carries the **same** depth, separated by a hairline rather than a card (a card inside the one loud surface reads as a second board). ADR-0041 §6 grants this variant its existence on there being **no primary**, so expanding one row would manufacture the primary it denies. That makes it the densest variant by construction.
- **`in-transit`** — gains the booking, the seat, the landing zone shift and **what is first on the ground**, which is the "next 30 minutes" question asked at altitude. It **drops the settle verbs**: not a density question but a nonsense one, since a flight you are sitting inside settles itself by landing. It also keeps ADR-0059 §2's rule that the transit progress replaces the day rail.
- **`free`** — **does not lift**, and the reason is not that it is empty: `GlanceCard` is already Home's "what could we do" surface two inches lower, so a hero lifting into the shelf would compete with a shipped one. It takes §9's rebuff.

### 11. `SettleControl` gains a **board** density, and only the ground changes

ADR-0139's rule holds exactly: a fourth host adds a **density**, and the words, marks and hues are not its to choose. What must change is the ground, and this is a defect the mockup found rather than a preference: `.wp-settle-btn` is `background: var(--card); color: var(--ink)` — built for paper. On the board that is a light paper chip in light mode and a chip that vanishes in dark. It is **ADR-0158 §15's "an inverted surface is the limit"** arriving on a new surface.

The fix invents nothing. The board already carries semantic hues as low-alpha fills with a brightened ink (`.wp-board-countdown`, `.code`, `.tlabel`), so the `board` density is that recipe with `--ok`/`--miss` in it. The focus ring stays the shipped teal.

### 12. `אחר כך` earns its line, on a stated condition

The third point costs **28px** (4.8% of the full horizon) and is kept: a two-slot board cannot carry it in any form, and on the ground "and after that?" is genuinely asked when the next thing is ten minutes away.

**The condition is recorded here so it is not rediscovered as a regression:** it is **one line** — no place, no note, no control, no way in. The moment someone asks to add a hand-off to it, that is the request to turn the hero into the Day tab, and the answer is the tab. A hero that grows a third slot has started competing with a screen that already has day navigation, gaps, hours and controls.

### 13. What this does not do

- No time edits, no ±30, no authoring of any kind.
- No note on the **next** event. Sometimes exactly what you want before leaving ("ask for a high room", "the gate code is 1408"), but it is the part that turns the typical case into the heavy one. Deliberately unbuilt and named so it cannot arrive quietly.
- No change to which booking moments reach the hero at all — ADR-0059 §1 still owns that.
- No lift for `free`.

## Consequences

- **The board becomes interactive for the first time**, and loses its only interactive child in the same change (§4). Its collapsed markup becomes a `<button>`, taking `--press-scale-lg` in one line.
- **`Board.tsx` stops being purely presentational in one narrow sense**: it gains an "is there anything to lift?" input. That stays **derived and passed in** — the component still takes all data via props and holds no trip state.
- **A third overlay grammar exists.** The app had sheets (arrive from an edge) and dialogs; now it has a promotion. The risk is a fourth surface copying the lift because it looks nice. It is scoped here to the one surface ADR-0028 names as the app's single loud element.
- **Every pixel number in both mockups is webfont-dependent** and was measured in a sandbox with no network, i.e. on a fallback font. Re-measure on a device with the real fonts before treating any of them as a build constant. The same caveat already sits on ADR-0152/0153.
- **The lifted hero must never write a landing box as a constant.** `frontend/CLAUDE.md` records three bugs from exactly that shortcut (ADR-0142's `--birth-card-top: 118px`, ADR-0143's `58px`, the trip handoff's target), and jsdom reports every rect as zero, so this class of bug is invisible to the unit suite by construction. The aim needs an e2e assertion against the settled box.

## Alternatives considered

- **An expansion (a pane of Home, no back registration).** Rejected: it reflows the page under the thumb, and `SnapSheet`'s register-nothing model would let a system back leave the tab with the hero open.
- **An overlay as the brief drew it** (a `Modal` rendering the same facts again). Rejected: it prints title/kind/time twice and abandons the glance value that is the board's whole purpose.
- **The lid (anchored, chrome preserved)** and **the rise (travelled, no swing)**. Both drawn and kept in `hero-lift-v1` as the record. The lid additionally needs a scroller at 360×640 where the risen hero does not, because it spends the chrome's 72px.
- **A scale-up "approach".** Refuted by measurement: ×1.045 of scale available.
- **`--t-cinematic` for the lift.** Refused on ADR-0140's budget rule, not on taste.
- **A screen-sized hero.** Rejected: ~400px of empty dark board under a flight reads as a load failure on the one glowing surface.
- **"Tips and tricks" in the hero.** Refused on two existing decisions rather than opinion: ADR-0045 makes Home real-data-only with no fixtures for unbuilt features, and ADR-0004 makes integrations pipes rather than screens. A tip the app actually holds **is a note**.
- **A third day slot / a list under `אחר כך`.** Rejected per §12 — that is the Day tab.
- **The rebuff saying `אין מה לפתוח כרגע` once.** Drawn, and rejected by the owner: text that flashes on the loudest surface reads as a rebuke.
- **A per-entity control on the collapsed board** (Phase 5's original). Already rejected in ADR-0121's amendment §4; this ADR is the alternative it asked for.

## Amendment (2026-08-03) — three corrections from the built hero on a real phone

Phases 1-3 shipped, the owner opened it on a device, and three of the decisions above were wrong. All three are recorded here rather than in a new ADR, because each one narrows or reverses a specific numbered section.

### A. §9's rebuff is WITHDRAWN, and §10's "`free` does not lift" with it

The report was _"it does lift but only when there's an event happening"_ — and the diagnosis is that `canLift` required a non-empty `now`. **A gap is most of a real day**, so the board sat there un-pressable through nearly all of it.

§9 and §10 both rested on a conflation this ADR made and did not notice: **"nothing is happening now" is not "nothing to show."** In a gap the horizon still holds `הבא בתור` with its place, its note and its booking reach, plus `אחר כך` — and that is arguably the moment the lift is worth the most, because "I am free now, what is next and where is it" is a question no other surface on Home answers. §10's argument was about the **shelf** (`GlanceCard` answers "what could we do instead"), which was never the same question.

So `canLift` asks only "does the lifted state add anything", of the whole horizon. A board that adds nothing is now the rare end-of-day case rather than the common one, and it stays **silent** — the owner's call, in the same round: no nudge for an empty tap. §7's third beat (`.is-landing`) is unaffected; `.is-rebuffing` is retired before it was built, and `BEAT.REBUFF` should come out of `lib/one-shot.ts` when nothing has claimed it.

### B. §5's top-anchored landing becomes CENTRED

> _"I was imagining the hero to lift to the center of the screen, not to the top."_

§5 argued for the top from the mockup's measurement — it was the only way to keep the anchored character off a scroller at 360×640. On a real phone that argument turns out to be answering the wrong question: **a top-anchored card reads as a panel that arrived from somewhere**, which is the sheet grammar §2 rejects, and centred is what reads as the object coming toward you.

The `lift` variant is `align-items: center`. It still covers the chrome whenever it is tall enough to, so §5's consequence holds for the cases that motivated it; a short hero now leaves the chrome visible above it, which is the honest reading of content-sizing (§8).

### C. A class-name collision, and the convention that would have prevented it

`HeroLift` marked its primary point with `className="hero-point lead"`. **`.lead` is already a global class** in `screens.css` — the Glance card's row, at `display: flex; align-items: baseline; justify-content: space-between` — so the lead point inherited it and laid its parts out in a **row**: the title, the note and the settle strip side by side in one band. Visible immediately on a device; invisible to every test, because each part rendered correctly and only their arrangement was wrong.

It is now `data-lead`, an attribute, which cannot collide with a class at all. The lesson is the one the codebase already had and this file broke: **every class this app adds is prefixed** (`wp-`, `hero-`, `map-`, `prep-`). An unprefixed modifier is a global, and `lead`/`big`/`row`/`main` are all already taken.

## Amendment (2026-08-03, second round) — the motion, and four things only a browser could say

Phase 4 built the FLIP. The report that triggered it was one sentence, on a device: _"now it became a simple overlay rendering the hero twice instead of lifting up"_ — with a screenshot of the collapsed board sitting behind the lifted card. That is the grammar §1 rejects, arrived at by building §1's own design, and the causes were mundane.

### D. Two boards on screen was the actual defect, and it was not a motion bug

Phase 3 shipped a hero that rendered correctly and a board that stayed exactly where it was. Nothing hid it. So there were two boards, and a fade between two copies of one object is an overlay by definition, whatever the ADR calls it.

**The collapsed board now hides while lifted** (`.wp-board.is-lifted`), with `visibility` and never `display`, for two reasons that are both load-bearing: the descent MEASURES that box on the way back down, and Home's layout must not collapse and re-expand around the hero opening. The e2e's first assertion is therefore a count, not a measurement — one visible `.wp-board` at any moment.

The second cause was that the entrance was still §5's placeholder fade. **It is gone rather than kept alongside the flight:** an object that travels _and_ fades is still two boards cross-dissolving. This variant now has no CSS entrance or exit at all, which is a deliberate asymmetry with every other overlay — the box it travels from belongs to a different element on the page underneath, and no stylesheet can know where that is.

### E. How the FLIP is written, and the one property that dictates it

`width`/`height` animate as **real layout**, `transform` carries the swing alone, and the card takes `position: fixed` only for the duration of the flight. That combination is forced rather than chosen:

- §5 promised text crisp at both ends, so the box animates and nothing scales. Verified in the e2e by asserting no `scale` appears and that the transform's matrix is a rotation relaxing to identity.
- **`height` does not interpolate to `auto`** (`290px → auto` reports 290, then 432, nothing between), and the hero is content-sized (§8), so its settled height _is_ `auto`. Hence the two-pass measure: mount at the settled box, measure what CSS resolved to, then animate px → px.
- CSS therefore stays the single owner of where the hero settles. JS only ever **reads** it — the alternative, declaring the settled box so JS has a target, puts the same geometry in two places and lets them drift.

The Web Animations API rather than a transition, following `useFlipRows`' precedent: it leaves no inline styles for React to diff against, and there is no "release the height back to `auto`" timer to get wrong — which is the ADR-0140 §5 shape this would otherwise have taken.

### F. The lifted hero was replaying the app's one cinematic moment

`.app[data-mode='trip'] .wp-board` matched the lifted hero too — it _is_ a `.wp-board`, which is the whole point of a promotion. So every open replayed the **Plan→Trip going-live climax**: 600ms of `--t-cinematic` from `brightness(0.55) saturate(0.55)`. That is why the lifted card read flat and dim beside the board it came from, and it is an ADR-0140 budget violation — the one cinematic moment in the app, re-spent on a state you can enter all day.

The same selector is also more specific than `.wp-board.is-landing`, so it silently won the `animation` property and **§7's landing beat never played at all**. The first fix was to exclude `.is-landing` from the power-on rule; measured, that is worse — dropping out of the rule and back in RESTARTS the power-on, so the board flashed dim and ramped up over 600ms after every close. The beat therefore fills a **second animation slot** the power-on rule leaves open, so `animation-name` in position 0 never changes and that animation keeps its own clock.

### G. What jsdom could not see, and what a probe could not either

The unit suite covers which boxes the code aims at; it cannot check whether those boxes are where the hero is, because jsdom answers zero for every rect. So there is now an **e2e spec** (`frontend/e2e/hero-lift.spec.ts`) asserting the flight leaves the board's measured box and lands on the hero's own settled one, both measured independently of the animation between them.

Two things about that spec are worth keeping, because both were wrong first:

1. **It compares the last IN-FLIGHT frame, not the last sampled frame.** Once the flight releases its borrowed `position`, the hero snaps to the CSS box whatever the animation was aiming at — so the first version passed happily with the landing box hardcoded to the wrong rect. Verified by hardcoding it.
2. **It does not read `effect.getKeyframes()`**, which is how ADR-0140's handoff spec reads its aim. Measured here, it reads back `left: 35.1875px, top: 422px` for keyframes passed `left: 9px, top: 273.5px` — the element's own resolved offsets, because this card's `left`/`top` are `auto` in CSS and only the animation supplies them.

And the real bug that only the app could show: **a flight leaves the hero `position: fixed`, and measuring an element in that state answers its STATIC position.** React double-invokes effects in dev, so the second run measured 422 instead of 273.5 and flew to the wrong place — while a standalone harness of the same components, rendered without StrictMode, measured perfectly. Any remount does the same thing. The entrance effect now restores what it borrowed on cleanup, which is what makes its own measurement correct the second time.

### H. Plan mode's hero does not lift, and the rebuff comes back to answer its tap

Asked directly — _"should we handle the plan mode hero?"_ — and the answer is **no lift**, on a structural reason rather than a taste one.

**The lift exists to close a distance.** Trip's board is a two-slot summary of something whose depth lives on another tab: `הבא בתור` has a place, a note and a booking, and none of that fits in two slots. Plan's `.prep` hero has no such distance. What it summarises — the readiness percent — is the **checklist rendered immediately beneath it, on the same screen**, one row per incomplete check, each with a CTA that does the thing (ADR-0061). A lifted Plan hero would show the checklist to someone already looking at the checklist, which is the animation-for-its-own-sake the brief's sub-question 1 forbids.

Two smaller costs, recorded so they are not rediscovered as blockers: `.prep` is the one always-violet surface (fixed light ink, ADR-0028) while the lift card is the `--on-dark` ramp, so a violet card lifting onto a scrim is either two loud things at once or a hero that stops being violet mid-flight; and `.prep` has no press affordance today, which is what keeps the grammar consistent rather than breaking it — nothing invites a tap that would not pay off.

**But a tap gets an answer** (owner's call, in the same round: _"For plan mode at least give it the nudge animation for now"_). A press that produces nothing at all reads as a dead surface rather than a calm one. So §9's **rebuff returns**, for the surface that actually has the condition §9 described: 7px up and back, `linear`, no colour, no text. `BEAT.REBUFF` is back in `lib/one-shot.ts`, which amendment §A said should happen only when something claimed it.

**Deliberately not `BEAT.NUDGE`.** That beat is a lateral shake meaning _something is wrong_ (ADR-0150), and a tap on the prep hero is not an error — it is a tap on something that was never a control. Same reasoning keeps it a `<div>`: announcing a control to a screen reader and then doing nothing when it is activated is ADR-0150 §8's rule seen from the other side, that an affordance must match what a press can achieve. No role, no tab stop; the beat is for the finger that already touched it.

**Revisit when** Plan's hero grows something it summarises but does not show inline — a per-traveller readiness breakdown, or a "what is blocking departure" that is not the checklist re-sorted. Then it has depth of its own and the lift earns itself.

One thing the browser said and jsdom could not, for the third time in this ADR: the beat's keyframes had to be verified **running**, not merely applied. They were, at `--t-base` and `linear` — but the spec that checks it first clicked the wrong element, because `PlanHome` is lazy-loaded and `HomeSkeleton` renders its own placeholder `.prep` with no handler on it. A test that waits for `.prep` rather than for the real hero reports a working beat as broken.

### I. `in-transit` lifts, and §10's content list turns out to be mostly already there

The last variant, and the surprise is how little it needed. §10 asked the transit hero for "the booking, the seat, the landing zone shift and what is first on the ground" — read as four new things to build. Three of them already existed:

- **The booking** is the `Reach` part, which belongs to any point with a `bookingId` (fixed in phase 3 when it was wrongly wired to `next` alone). A flight has one.
- **What is first on the ground** is `הבא בתור`. During transit the flight is `now`, so `deriveNow`'s next IS the first thing after landing — the horizon already answers the question §10 poses, and `אחר כך` gives the one after that. No new derivation.
- **The landing zone shift** rides in with the transit progress, which is where ADR-0107 already put it — beside the landing time, because that is where the two ends are read together.

**And "the seat" is a datum this app does not store.** `Booking.details` carries `room`, `wifi` and `notes`; nothing writes a seat, and no form offers one. What the app actually does is visible in its own fixtures, where `מושב ליד החלון בשתי הטיסות` is a **note on the flight booking** — and the lifted hero already reads booking-hosted notes (that is phase 2's documented divergence from `EventCard`'s mark). So the seat is either already served in the app's own idiom or it is a schema-plus-form change to decide separately. It is **not** built here, because inventing a seat field to fill a hero slot is exactly the fixture-for-an-unbuilt-feature ADR-0045 forbids.

So what this actually builds is three things: the gate opens, the settle verbs go, and the foot swaps.

**The settle verbs are dropped per POINT, not per variant** — derived by asking whether the point's event is the one you are sitting inside. §10's reason is about the flight ("a flight settles itself by landing"), not about the state, so a soft event running concurrently with a flight keeps its own verbs. A variant check would have taken them away from it.

**The foot is a slot, and phase 3's `rail` prop was lying.** Its comment said "the same node the collapsed board renders, passed in rather than rebuilt so the two cannot drift" — and `Home` hand-wrote a duplicate of `.wp-board-progress` beside it. So `DayRail` and `TransitProgress` are now exported from `Board.tsx` and both hosts render the same components; the prop is `foot`, because in transit it carries the flight's progress instead (ADR-0059 §2's rule reaching the lifted state) and calling that a rail would be the same kind of untruth.

That duplication is worth naming as a pattern rather than a slip: **a prop comment claiming two surfaces share a node is not enforcement.** Nothing failed while the copy existed, and nothing would have.

### J. The card is a transparent shell, so it must give back every paint property

Reported from a phone: a **square stroke boxing in the rounded hero**, 1px outside it on every side.

`.modal-card`'s base rule carries `border: 1px solid var(--line)`, and the `lift` variant reset `background`, `border-radius`, `box-shadow` and `padding` — but not `border`. So the border stayed at `border-radius: 0` and drew a rectangle around a 22px-rounded card.

The rule this makes explicit: **in this variant the card paints nothing at all** — the hero inside owns every visible edge (§1, one object gaining elevation, not a card containing one). So each paint property the base rule sets has to be handed back here, and a checklist beats an inventory of the ones somebody remembered. This one was missed because a border with no radius does not read as a border; it reads as somebody else's focus ring, which is what it was first diagnosed as.

Guarded by a computed-style assertion rather than a geometry one, because no geometry moved: the e2e asserts the card's border width, background, shadow and padding are all inert while the hero keeps a non-zero corner radius.

## Amendment (2026-08-05, session 215) — `in-transit` is a VARIANT, not a variant of nothing

Four reports off a real device mid-flight (FRA → TLV, 20:36, landing 22:15), designed in [`mockups/hero-in-transit-v1.html`](../../mockups/hero-in-transit-v1.html) and built the same session. Two of the four are one defect, and it is this ADR's: **§I built the transit hero as a gate, a removal and a foot swap, and never gave the variant a grammar.** So a flight in the air arrived in the lifted hero as an ordinary hard now-event — `קשיח` + `עד 22:15`, `עכשיו` with the amber blip — while the collapsed board it was lifted out of said `בטיסה` in teal, `כרגע · בדרך`, and a teal `נחיתה` chip. The owner's fourth report is that observation from the other side: _"the hero for in flight not expanded looks different and better in my opinion."_ It is, and §1 is why — a promotion that drops the words the collapsed state already had is not the same object one elevation up.

### K. §10's "the transit progress replaces the day rail" is true and was not enough

That clause says what the rail is instead of. It never said **where it goes**, and phase 4 answered "the foot", which put the flight's own progress one full `הבא בתור` block below the flight — **258px** under the route it describes, against **36px** when it sits inside the point (measured in the mockup, §2). Read top-down on a phone, a progress bar directly beneath `הבא בתור · איוש 07:00 · 10:24 שעות` is a progress bar toward `איוש`, which is exactly the second report.

**The rail now renders inside the point whose journey it draws, and in transit the foot is empty.** The reasoning §10 encodes is unchanged (the journey IS the day's current activity, so no day rail); what changes is that a fact belonging to one point stops being pinned to the card. The foot keeps its meaning — it carries what belongs to the whole card — which is why nothing replaced the rail there rather than the day rail coming back: two rails on one surface invites the comparison the first one lost.

### L. The variant's grammar is the collapsed board's own, and the mode owns the words

The lifted hero now prints the live badge in teal with the mode's word, the mode's slot label, the end chip and the arrival time — the same four things the collapsed board prints, in the same order, with the depth underneath. No new copy was written for the lift: the words are the ones the board already says.

Which surfaced a defect neither state was reported for. **`t.board.inTransitLive` was the literal `בטיסה` and `TransitProgress` hard-coded `Icon name="flight"`, while this state fires for ANY bracketed transport whose clock is between its ends** — so a train in motion announced itself as a flight and crossed its rail behind an aircraft. The owner's widening (_"this of course applies to other kinds of transit (train, bus) but not rental cars that are different"_) is now `CategoryTimeProfile.midSpan`, beside the `transitions` pair that already names the two ends per mode:

- **`journey`** — a leg you are carried along. It earns the rail, a travelling mark and a countdown to arrival. `transport` carries the generic word (`בדרך`); ✈️ refines only the live badge (`בטיסה`).
- **`held`** — a resource you are holding. **No rail and no travelling mark**, its end chip stays amber because a return is a deadline rather than somewhere you arrive, and it says since when it has been yours. 🚗 is the third thing a hire disagrees with its category about (ADR-0162 gave it the first two), and a same-day stay — the other span that reaches this state — is held as well.

The travelling mark is **the event's own glyph**, not a per-mode icon: the set has no `train` or `bus` to reach for, and the user may re-badge the event anyway. This is [ADR-0163](0163-a-hire-is-not-a-journey.md) §4's rule arriving one surface over — the verb and the unit belong to the span's own mode — and it lands on the collapsed board too, where a hire was worse.

### M. What the lift adds that neither state had: how long is left, and the clock in words

Report 3 asked for _"more transit info such as estimated time till arrival"_, and the honest inventory is short, because **there is no live feed and nothing here pretends there is** (rule 5: a hero that quietly needs the network is the one surface that lies on a plane). Everything below is derived from `startsAt`/`endsAt` and the two ends' zones. Gate, seat, baggage belt, delay and weather are **out, not deferred** — `bookingSchema` has no field for the first three and the last two need a network.

- **`נותרו X` on the rail's middle slot.** That slot was printing `עד 22:15` while `.tp-end.end` printed `22:15` on the same 10.5px line — the middle is the only place on the rail that can say something its two ends cannot. Free, and it improves the **collapsed** board, where most of a flight is actually read.
- **`· בעוד 1:39 שע׳` on the lifted meta row**, so the answer is also in 14px type where the eye lands. Phrased on ADR-0114's ladder pinned to hours (ADR-0084), so a 30h ferry reads `30 שעות`.
- **The clock jump as a sentence** — `מזיזים את השעון שעה קדימה` — plus the destination's clock right now, in the lift only; the amber `🕐 +1 ש׳` pill stays on the collapsed board. Owner's idea, and the reason it earns copy is that the pill never says which way to turn the hands. The direction is derived from the **sign** of the same `deltaMinutes` the pill renders (getting it backwards is worse than the pill), and a fractional zone falls back to the ladder's `2:30 שע׳` rather than growing a `וחצי` this app says nowhere else.

### N. `איפה` was pointing backwards, and no report mentioned it

The authority rule gives a transport booking its **origin** (`bookingPlaceId`), which is right on a day list and right before you board. Mid-flight it is the airport you have already left — so the lifted hero was offering `במפה` and `ניווט` to where you took off from. `heroHorizon` now takes the id of the span you are inside and resolves **that one point** to `toPlaceId`. Nothing else changes: a single-place booking answers both questions with the same place.

### O. The wrap that was not about the button, and a note about measuring

Report 1 (_"the navigate button was pushed to a new line"_) is a flex fact, not a spacing one. `.hero-row` is `flex-wrap: wrap`, and flex line-breaking uses each item's **hypothetical** size — the decision is made before `flex-shrink` runs, so `.hero-where-nm`'s `min-width: 0` and its `text-overflow: ellipsis` were **unreachable code** and the chips were what moved. Measured: the name wants **247px** and the two chips **153px** against **308px** (360px phone) or **338px** (390px) of row, so it is 70–100px short at every phone width — and it wraps differently at each, which is why one report read as two bugs. The booking reach was a separate `hero-part` on top of that, i.e. a third line by construction.

So the place name gets its own line (its ellipsis finally reachable) and **every way out of a point shares one action row**, where all three measure 247px against that same 308px. `flex-wrap` stays as the safety net for a translation nobody has measured, not as the layout.

Worth keeping for the next surface: **the first wrap detector was wrong in the same way the code was.** It grouped a row's children by rounded `top`, which counts a 15px name beside a 34px chip as two lines — it reported 3 lines where there were 2 and 2 where there was 1. Items on one flex line share a line **box**, not a top edge. Reasoning about a flex row is unreliable, including when the reasoning is the measurement, which is why the mockup's panel computes it from the live DOM and its wrong version is kept in the script.

### What is deliberately left open

`הבא בתור`'s countdown counts from the clock, so mid-flight it counts **through** the landing when the traveller's question is "how long after we land". That is a decision about what the board's countdown _means_ — possibly per variant — not a layout change to this hero, so it is a backlog line rather than an answer here.

### P. Being the same object includes the board's VARIANT classes

One more report from the device, after §K–§O shipped: mid-flight the lifted card's top-right glow was a **different shade** from the board it came out of — amber over teal, visible in the gap between them.

`.wp-board.transit::before` shifts that glow amber → teal (location), and the lifted hero was carrying `wp-board hero-lifted` without `transit`. So §1's thesis held for the words and broke for the paint.

The rule this makes explicit, next to §J's (the card paints nothing, the hero owns every edge): **the hero IS `.wp-board`, which only holds if it also takes the board's variant classes.** `transit` now rides the same gate as the live badge, so a mid-span state wears the costume on both elevations. Guarded in the e2e as a computed-style _equality_ between the two, rather than a colour literal — what must stay true is that the two elevations paint the same glow, not what that glow currently is.

### Q. §A's silence is reversed: an empty press on the Trip board is answered

Owner, from the shipped surface: _"in trip mode, when there's nothing to lift, clicking currently does nothing. I want the little nudge animation like in plan mode on the hero."_

That is a **change of mind about §A, recorded as one.** §9 designed the rebuff for this board; §A withdrew it on the reasoning that once the board lifts in a gap, an empty press is the rare end-of-day case and silence is right there. The reasoning was sound and the conclusion was wrong in use: rare is not the same as unremarkable, and a press that produces nothing at all reads as a dead surface — which is exactly the argument §H used to bring the beat back for Plan's prep hero. The same argument applies here; it was simply made about the other surface first.

**What it is not:** a control. The board stays a `<div>` with no role and no tab stop when there is nothing to lift — announcing a button and then doing nothing when it is activated is a promise it cannot keep (§H's own words). It also keeps the ordinary press step rather than `is-tappable`'s large one: nothing is being pressed _into_.

**One beat, one rule** (root rule 8). Plan's prep hero owned a private `prep-rebuff` copy in `screens.css`; with a second surface playing the identical motion, a copy in `board.css` would have been ADR-0139's shape exactly — one widget drifting on four axes while every test stayed green. So the beat is now a single rule in `styles/beats.css`, following the precedent `.is-nudging` already set: a beat is a surface-agnostic class. The one line that stays per-surface is the **plug-in**, and it earns itself — `.app[data-mode='trip'] .wp-board` already owns `animation` for the Plan→Trip power-on and outranks a single class, so the board fills its `--board-beat` slot with the same value rather than declaring an `animation` that would never win.

Guarded in an e2e (`frontend/e2e/rebuff-beat.spec.ts`) that asserts the resolved `animation-name` on **both** surfaces, because this is precisely what jsdom cannot see: the unit tests assert the class and stay green whether the keyframes exist, are misspelled, or are outranked. Those assertions add the class rather than clicking for it — the beat removes itself after `--t-base`, so a click-then-assert races a ~240ms window for a reason unrelated to what is being tested; what the click does is already covered deterministically in jsdom.

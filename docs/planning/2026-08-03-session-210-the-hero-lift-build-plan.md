# Hero 2.0 — the build plan

**Date:** 2026-08-03 (session 210, written after [ADR-0160](../decisions/0160-the-hero-lifts-and-shows-a-horizon.md) was accepted)
**Design:** ADR-0160 · mockups [`hero-lift-v1`](../../mockups/hero-lift-v1.html) + [`hero-horizon-v1`](../../mockups/hero-horizon-v1.html)
**Shape:** five phases, one PR each. Phase order is by dependency, not by visibility.

**Status (end of session 210):** phases 1-4 built and merged. **Phase 5 is deleted, not deferred** — it was the rebuff, and ADR-0160's amendment §A withdrew it on the owner's call before it was built. What phase 4 did not carry is `in-transit` liftability: §10 asks that variant for new CONTENT (the seat, the landing zone shift, what is first on the ground) plus the transit progress as the foot, and folding new content into the motion PR is exactly what splitting phases 3 and 4 was for. It is its own small phase.

## Read this first: three things the ADRs do not answer

These are the gaps the plan found, and each one changes a phase.

**1. The board has no "is there anything to lift?" input, and the derivation does not exist.** ADR-0160 §9 makes the rebuff trigger **derived** — the hero lifts when the expanded state carries something the collapsed one does not. Nothing computes that today. `deriveNow` returns `now`/`next`/`nowAll`/`nextAll` (ADR-0041 §6) and knows nothing about notes, places or the third point. So the predicate is **net-new derivation** over four inputs (`note?`, `place?`, `alsoNow.length`, `then?`), it belongs in `lib/` as a pure function next to `deriveNow`, and it must be unit-tested independently of the component — it is the one piece of this feature that can silently answer "nothing to lift" on a board that has plenty.

**2. The horizon needs the note resolved for the now/next event, and that reach does not exist on Home.** ADR-0152's `NOTE_HOST_FIELD` gives a note a typed nullable host FK, and ADR-0153's build found that **every note render needs its host resolved across five types** — net-new derivation the reuse audit did not account for. Home has never read notes at all. Phase 2 is where that lands, and it is bigger than it looks for exactly that reason.

**3. `Board.tsx` is presentational and must stay that way, but the horizon needs ~9 more props.** The component already models four variants before adding one more (the brief said so). The plan's answer is in Phase 3: the horizon's data arrives as **one `BoardHorizon` object** rather than nine sibling props, assembled by `Home.tsx`, so the dependency direction (§12) holds and the prop list stays readable. If that object starts growing behaviour, the split has gone wrong.

## Phase 1 — the collapsed board becomes a tap target, and loses its only child

**This is first because it is the forced part** (ADR-0160 §4) and because it is independently correct: it ships a board that presses and reveals nothing, which is a smaller diff than it sounds and unblocks every later phase.

- `.wp-board` becomes a `<button>` in the `now` / `group-split` / `free` variants, with `--press-scale: var(--press-scale-lg)` (one line — the default step is the control one).
- `ועוד N עכשיו` retires: `.wp-board-also-toggle` (`<button>`, chevron, `alsoOpen` state) → `.wp-board-also-read`, same dot, same `t.board.alsoNow(n)` copy, no chevron, no state. **`useState` leaves `Board.tsx` entirely.**
- The `alsoNow` rows stop rendering collapsed. They have no home until Phase 3, so this phase deliberately **loses a feature for one PR** — say so in the PR body rather than hiding it.
- `in-transit` does **not** become a button yet (Phase 4 owns it).

**Tests.** The board renders a `button` per variant and `free` renders one too; **no `button` descendant inside it** (this is the regression guard for §4 — assert `queryAllByRole('button')` inside the board is empty, because the parser failure is invisible to a snapshot); the readout shows the count and is not clickable; `onLift` fires on press.

**Watch for:** `.wp-board` has `overflow: hidden` and a `::before` glow. A `<button>` resets `font`, `text-align` and `border` — the CSS in §11 of the mockup already carries the four-line reset, copy it rather than rediscovering it.

## Phase 2 — the horizon's data, with no UI

Pure `lib/` + `Home.tsx` wiring, nothing rendered. Ships behind the Phase 1 board doing nothing new.

- `heroHorizon(...)` in `lib/` — assembles `{ now, alsoNow, next, then }` with per-point depth (`place`, `note`, `settleOutcome`), from trip state, the clock, and the note index.
- **The note reach**: resolve the note for an event / its linked booking. Reuse `HostNotes`' existing resolution rather than writing a second lookup — see gap 2. If a general resolver does not exist, extract one; do not add a Home-local copy.
- `canLift(horizon)` — gap 1's predicate. Pure, exhaustive over the four inputs.
- `then` is the **third** point: one line, from the same day's ordered events. No place, no note, no control (ADR-0160 §12's condition — encode it by giving the type no room for them, not by remembering).

**Tests.** `canLift` across all four inputs including the "valid `now`, empty horizon" case ADR-0160 §9 calls out; the note resolves for an event, for a booking-backed event, and is absent when there is none; `then` is absent at end of day; **the clock is pinned** (`setSimulatedNow`, reset in `afterEach`) and both day scopes are asserted.

## Phase 3 — the lifted hero, static

The whole horizon, rendering, with **no lift animation** — it opens instantly. Splitting the motion out is deliberate: it is what makes the content reviewable and the motion independently bisectable.

- `HeroLift` in `ui/domain/` — a `Modal`, so back/Escape/backdrop/`✕` reach one handler for free (never a hand-rolled portal; lint blocks it).
- The three regions: head pinned, **one** scroller, foot pinned (ADR-0148 §1's pattern — `.place` became a grid in that one variant for the same reason; check whether the same is needed here before reaching for flex).
- The parts: `איפה` (+ map way-in and `ניווט`), `פתק`, `הסדרה`, `ועוד עכשיו`, `הבא בתור` (+ the two hand-offs), `אחר כך`.
- `SettleControl` gains its **`board`** density (ADR-0160 §11) — a variant on the existing component, its own file's CSS, **no new words, marks or hues**.
- Content-sized with a max, so a thin hero is short (§8).

**Tests.** `SettleControl`'s new variant renders the same two verbs with the same words; each part is absent when its datum is; the scroller is the only scrolling region; the hero renders through `Modal` (needs `wrapNav` — do not open-code the provider stack); a tap on `הסדרה` calls the verb and does **not** dismiss the hero.

**Watch for:** ADR-0107. The hero shows more times than the collapsed board, so more `ZoneShiftPill`s. Count the sites — the mockup only drew the transit one and says so.

## Phase 4 — the motion

**One thing phase 3 surfaced that the ADR does not answer, and it decides how the FLIP is written.** ADR-0160 §5 says all three characters "animate the box, so text is crisp at both ends" — but the `lift` Modal variant positions its card with **flex plus a margin**, and a flex-positioned box cannot be animated from an arbitrary measured rect. Two ways out, and they are not equivalent:

- **(a) Make the lift card `position: fixed`** and drive `top`/`left`/`width`/`height` from CSS custom properties that JS writes off the measured box. Keeps §5's promise exactly — the box animates, nothing scales, text stays crisp — and `.wp-dragghost`'s comment already confirms `position: fixed` resolves against the viewport unwrapped in this shell. Cost: the card stops participating in the overlay's flex centring, so its settled box becomes this variant's own responsibility, and the two must not drift.
- **(b) A transform FLIP** — translate + scale from the measured delta to identity. Cheaper and compositor-friendly, and what most FLIP implementations do. Cost: it **scales the text**, which is the thing §5 says only the swing should do and only while its angle is non-zero. It would make the crispness claim false for the whole tween.

**Built as (a) with the two-pass measure, and four things the plan did not predict are recorded in ADR-0160's second amendment (§D-§G).** The short version: hiding the collapsed board mattered more than any of the motion (it was the actual reported defect); the placeholder fade had to be DELETED rather than kept alongside the flight; the lifted hero was matching `.app[data-mode='trip'] .wp-board` and replaying the Plan→Trip climax on every open, which also silently beat the landing beat's `animation`; and the flight's own `position: fixed` corrupts a second measurement, which React's StrictMode double-invoke turns from a latent bug into a certain one.

**Take (a) — but it needs a TWO-PASS measure, which the first write-up of this section missed.** The naive reading is "declare the settled box in the variant, animate from the measured start". That does not work, and it fails on the one channel that matters: **`height` does not interpolate to `auto`.** Measured in Chromium rather than assumed:

| from → to         | mid-flight height                                      |
| ----------------- | ------------------------------------------------------ |
| `290px` → `auto`  | **290px, then 432px** — a jump, no intermediate values |
| `290px` → `584px` | `420.7px` — interpolates                               |

The lifted hero is **content-sized** (§8, owner's call), so its settled height IS `auto` — and the height is where ADR-0160 §5 measured the entire visible budget (×2.01, against ×1.045 of width). An entrance that snaps the height is not the designed character; it is the placeholder with extra steps.

So the FLIP is First-Last-Invert-Play properly:

1. **First** — measure the collapsed board's rect on press (never a constant: three prior bugs, `frontend/CLAUDE.md`).
2. **Last** — mount the card at its settled box with `height: auto` and measure what that resolved to. This is the pass the first write-up skipped, and it has to happen after layout.
3. **Invert + Play** — write both boxes as px into custom properties and animate px → px.
4. **Release** — put `height` back to `auto` when the animation ends, or the card stops being content-sized the moment its content changes (a note arriving, a peer's edit). Time that release off `motionDurationMs`, which answers 0 under reduced motion, so the release is not a state that outlives an animation nobody played (ADR-0140 §5).

Step 4 is the part to be careful about: it is exactly the "state that only exists during an animation" shape ADR-0140 §5 exists for, and the beat primitive already learned the 0ms half of it the hard way (`lib/one-shot.ts`'s own comment).

**Still not (b).** Everything above is machinery; (b) would be less machinery and a broken promise — it scales the text, which §5 reserves for the swing and only while its angle is non-zero.

Two more things not to rediscover: the start box must be **committed before** the transition (a forced reflow between writing it and writing the target), and the layer must be **opened one frame before** the target box is written — otherwise the element becomes visible in the same frame its destination is set and the flight starts from wherever the browser got to. Both were found in `hero-lift-v1.html`.

- FLIP off the **measured** collapsed box. `frontend/CLAUDE.md` records three bugs from writing a landing position as a constant; this must measure and must be asserted in an **e2e against the settled box**, because jsdom reports every rect as zero and the unit suite cannot see this class of bug. (Built: `frontend/e2e/hero-lift.spec.ts`. Two traps in writing it are in ADR-0160 §G — compare the last IN-FLIGHT frame rather than the last sampled one, and do not read the aim out of `effect.getKeyframes()` the way the handoff spec does.)
- The swing: `perspective(900px) rotateX(9deg) translateZ(-46px)` → identity, on top of the box animation. `--ease-arrive` in, `--ease-exit` out, `--t-base` / `--t-quick`. **Not `--t-cinematic`** (ADR-0140's budget).
- The inline board holds its space with `visibility` (never `display`).
- **The layer paints nothing while closed** — the defect the mockup shipped and fixed. `visibility: hidden`, not `display: none`, because the hero must stay measurable while closed.
- Open the layer one frame **before** writing the target box.
- `.is-landing` on the returning board. **The shared beat primitive is already done** — `lib/one-shot.ts`'s `playBeat` + `BEAT`, extracted from `useFormErrors`' private `nudge` and shipped ahead of the rest of this phase because it is a refactor of live code and reviews better alone. Its test records the regression the extraction introduced and the shipped nudge's own test caught: removing the class inline at 0ms means it is never observable, and jsdom always reports 0. What phase 4 still owes is the **keyframes** for `.is-landing` (and phase 5 for `.is-rebuffing`), which live with the surface that owns them.
- Every duration from `motionDurationMs`, which answers **0** under reduced motion; the lifted state must be correct as a **static** state.
- `in-transit` becomes liftable (§10: no settle verbs, no day rail).

**Tests.** Unit: the beat class is applied and removed at `animationend`; reduced motion yields no animation and a correct static state. E2E: the aim lands on the settled box; back/Escape/backdrop each dismiss; the inline board is hidden during flight and visible after.

## Phase 5 — the rebuff — **DELETED**

Not deferred. ADR-0160's amendment §A withdrew it on the owner's call (_"No nudge when nothing to lift etc."_) in the same round that made a gap liftable: once the board lifts in a gap, an empty tap is the rare end-of-day case rather than the common one, and it stays silent. `BEAT.REBUFF` came back out of `lib/one-shot.ts` rather than being left as a name nobody claims.

## Phase 5 (was 6) — `in-transit` becomes liftable

The one part of §10 still unbuilt, and it is content rather than motion, which is why it is not in phase 4: the transit hero gains the booking, **the seat**, the landing zone shift and **what is first on the ground** — the "next 30 minutes" question asked at altitude. It drops the settle verbs (a flight you are sitting inside settles itself by landing) and keeps ADR-0059 §2's rule that the transit progress replaces the day rail, which means the hero's foot needs the progress node rather than the rail.

## What this plan does not build

Everything ADR-0160 §13 names, restated so a phase does not quietly absorb it: no time edits or authoring, **no note on the next event**, no third day slot under `אחר כך`, no lift for `free`, and no change to which booking moments reach the hero (ADR-0059 §1 still owns that).

## Two standing obligations

- **Re-measure on a device with the real fonts.** Every number in both mockups came from a sandbox with no network, so from a fallback font. Nothing measured there may become a build constant without being re-read — the same caveat already sitting on ADR-0152/0153.
- **`pnpm install` before `pnpm format`.** Without `node_modules` the format script silently falls through to an unpinned `prettier` on `PATH` and rewrites files CI then rejects.

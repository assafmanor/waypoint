# Motion & the first run — design brief (raised 2026-07-31, session 189)

**Status:** a brief, not a decision. This is the mapping pass: what motion the app has,
where it is missing, and which of the gaps are worth designing. Nothing here is
authoritative until it lands in an ADR. Mockups come next, build after that.

## What prompted it

The owner's ask, in their words: the app should _feel_ better — more micro-animation,
some screens should look better, "maybe even grander stuff when justified". Three
surfaces were named:

1. **Trip creation** — `+ טיול חדש` → the form → the trip exists. Should feel much grander.
2. **Joining from an invitation.**
3. **Screen/overlay transitions**, the Map's search named as the example.

And the framing that decides the design: (1) and (2) are a person's **first** interaction
with the app, and they should carry the feeling that a trip is about to happen. Not said in
copy — conveyed.

## The finding that reframes the whole ask

The app is not short of motion vocabulary. `tokens.css` carries a real ramp (four
durations, three easings, ADR-0028/design-language), and there is genuinely good motion
already shipped: the Plan⇄Trip switch, the board's power-on/glow/pulse, the shared
filter reveal + FLIP re-order (ADR-0120), the boot screen's three weights (ADR-0105), the
Map's camera ease (ADR-0129) and pin pulse, the skeleton shimmer, the zero-state's
fluttering flap cell.

**Every one of those lives inside a trip.** The first-run journey — login, zero state,
`/new`, the born screen, `/join/:token` — has, between them, exactly one animation: the
single fluttering flap cell on the zero state. The part of the product the owner is
reacting to is precisely the part that never got a motion pass, because motion arrived
with the trip surfaces and the shell was built first.

So this is not "sprinkle micro-animations on a finished app". It is: **finish the shell,
and fix two primitives whose absence is felt everywhere.**

## The through-line: the board is already the narrative

The temptation for "grander" is a celebration vocabulary — confetti, sparkles, a burst.
That would be a new metaphor bolted onto an app that already has one, and it would break
the restraint the design language is built on (one loud element; amber/teal/violet are
semantic, never decorative).

The app's signature concept is a **departure board**, and the first-run journey already
walks through its states without anyone having designed it that way:

| Surface        | The board, today                                      |
| -------------- | ----------------------------------------------------- |
| `/login`       | A teaser card — the board glimpsed from outside       |
| Zero state     | The board, rendered but **unpowered** (already built) |
| Trip created   | — nothing —                                           |
| Trip home      | The board, live, glowing, pulsing                     |
| `/join/:token` | A **boarding pass** for a board that is already lit   |

The gap in that table is the answer to "make creation grander". **Trip birth is the board
taking its first departure.** The zero state shows you a dark board and says, in effect,
nothing is scheduled. Creation should be the moment it lights up — the same off→on the
mode switch already performs (`wp-board-power`, `wp-board-glow`), played for the first
time. Split-flap cells settling into the new trip's first row is a beat the app already
has the CSS for (`flutter`, `.flaps`, `.cell`).

That is grand, it is on-brand, it needs no new metaphor, and it reuses shipped
vocabulary rather than adding a parallel one.

### It also resolves the cinematic-budget tension before it starts

design-language.md sets a hard budget: **exactly one `--t-cinematic` moment exists in the
product** — the Plan→Trip switch. A "grander" creation payoff looks like it wants to be the
second one, which would need that rule amended.

It does not have to be. The cinematic asset **is** the board's power-on, and trip birth is
that same asset firing on a different trigger. The budget is about not devaluing the
weight, and one asset played at the two moments a trip changes state (it is born; it goes
live) reads as a deliberate signature rather than a second indulgence. Everything else in
the journey stays on `--t-deliberate` and below.

A staged sequence of `--t-deliberate` beats also simply reads grander than one long tween.
Length is not weight; **sequence** is.

## Three systemic gaps (fix these first — the rest rides on them)

### G1. Overlays cross-fade instead of arriving, and never leave at all

`modal.css` animates `opacity` on `.modal-overlay` — the scrim and the card fade in
together, and the card never moves. A bottom sheet that fades in place has no direction
and no physics; it reads as a screenshot swap, not as something that came from the bottom
of the screen.

Worse, and this is the one to fix: **there is no exit animation anywhere.** `Modal.tsx`
unmounts its portal the moment `onClose` runs, so every sheet, dialog, confirm, picker and
the whole search overlay **snap** shut. Enter-slowly/exit-instantly is the single most
common reason an app feels unfinished, and it is currently app-wide.

The precedent for the fix is already in the repo: `.toast` stays mounted and animates
`opacity` + `translateY` in **both** directions off a `.show` class (`screens.css`). That is
exactly the shape `Modal` needs. One primitive change, and every overlay in the app
inherits it — sheets, dialogs, `ConfirmDialog`, `RowManageSheet`, `SearchOverlay`, the doc
viewer. Per ADR-0096's reuse rule this belongs in `Modal`, not at call sites.

Per variant, the arrival that matches the shape:

- **`sheet`** — rises from the bottom edge, scrim fades independently. Exit reverses.
- **`dialog`** — scales up slightly from ~0.96 with the scrim. It has no edge; it is
  summoned, not pushed.
- **`full`** — comes forward from the flow's forward edge (RTL-aware). It replaces a
  screen, so it should read as a screen arriving.

Note the constraint on the Map's search specifically: ADR-0132 §2 deliberately leaves the
**chrome reclaim** un-animated, because animating `display` on the header/nav relayouts the
split mid-flight — the exact thing ADR-0121 §5 shaped the sheet's stops to avoid. That
decision stands. The motion goes on the overlay's own arrival, never on the chrome
hiding, and the two must not be made to cross-fade against each other.

### G2. The shell has no route motion

`.body` has `animation: fade 0.32s` — a fade + 6px rise on in-trip tab content. Every
full-screen `.app` surface renders with **no entrance at all**: `/login`, the zero state,
`/new`, the born screen, `/join/:token`, `/trips`, both settings screens. They hard-cut.

Every transition in the two journeys the owner named is one of these hard cuts. Tapping
`טיול חדש` and getting an instant, motionless screen swap is most of why the journey
feels flat, before any per-element polish.

What it needs is a **direction-aware** shell transition: forward (deeper) and back
(returning) must not look the same, or the motion carries no information. This is
where the repo's RTL discipline bites. An arriving screen comes from the inline **end**
edge — the platform push, mirrored: LTR enters from the right, so RTL enters from the
**left**, and both are inline-end. And `translateX` is **physical** (there is no logical
transform), so the sign has to come from one direction variable on the shell rather than
a mirrored copy of every keyframe. This is the `dir="ltr"` / logical-property lesson in
`frontend/CLAUDE.md`, in transform form. Drawn and proven both ways in
`mockups/motion-primitives-v1.html`'s direction control.

The pair is also deliberately **asymmetric**: the arriving screen travels the full width,
the one you leave recedes ~22% and dims. A symmetric slide reads as a carousel; an
asymmetric one reads as depth, which is what "deeper into the app" has to mean.

It also has to compose with `resolveBack` (ADR-0090) rather than reading history, and with
the mode switch's `data-switching` window so the two never run simultaneously.

### G3. Taps have no press feedback

`tokens.css` kills the mobile tap-flash app-wide (`-webkit-tap-highlight-color:
transparent`), with the stated justification that "every tappable surface has its own
`:active`/hover/focus-visible feedback". Counted: there are ~16 `:active` rules in the
entire frontend. Most buttons have none — so on a phone, a tap that navigates or opens
a sheet gives **no acknowledgement at all** for the frame before the target appears.
That is the cheapest "feels dead" fix in the codebase, and it is a bigger win per line
than any of the set-piece work below.

Mobile-first (ADR-0017) makes this a correctness point, not a polish one: there is no
hover state to lean on.

## Journey 1 — Trip creation, beat by beat

Current: `AllTrips`/`ZeroState` → `navigate('/new')` → `CreateTrip` form → `submit()` →
`createdTrip` state swap → `Created` (`.born-*`, plan-violet chrome) → `navigate('/')`.

| #   | Beat                    | Today                                                            | Proposed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | ----------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1.1 | The tap on `טיול חדש`   | Hard cut to `/new`                                               | G3 press feedback + G2 forward arrival. The form comes from the forward edge; the tapped action is the last thing to leave.                                                                                                                                                                                                                                                                                                                                                                      |
| 1.2 | The form settles        | Everything present at once                                       | A short staggered entrance — lede, three fields, draft, CTA — one `--stagger-step` apart. Ends before a fast typist reaches the first field; the point is that the screen assembled, not that you waited.                                                                                                                                                                                                                                                                                        |
| 1.3 | The draft card fills in | Text swaps silently (`aria-hidden` decoration)                   | It is the only live preview of the thing being made, and it should behave like one: the flag settles when auto-suggest derives it, the meta line changes with a soft cross-fade rather than a snap. Stays in the **soft** grammar.                                                                                                                                                                                                                                                               |
| 1.4 | The CTA arms            | `disabled` → enabled, silently                                   | A real state change worth a beat — the button **arms** when `canCreate` flips. This is the app telling a first-timer they are done, which U-13's always-visible-CTA rule already cares about.                                                                                                                                                                                                                                                                                                    |
| 1.5 | **Creation**            | State swap: indigo shell chrome → plan-violet `.born-*`, instant | The set piece. The draft card is the **shared element**: it travels from its place in the form to the born card's position and turns from the soft grammar to solid — ADR-0011's dashed→solid carrying its real meaning, the trip stops being provisional. Then the chrome warms indigo→violet (the mode-switch machinery, `--t-deliberate`), then the board powers on with the trip's first row flapping into place (`--t-cinematic`, the existing asset), then the invite box and copy arrive. |
| 1.6 | The 🎉                  | A static emoji glyph                                             | Keep the emoji, drop the idea of a burst. The board lighting up **is** the celebration; a confetti layer on top would compete with it and spend the loud-element ration twice.                                                                                                                                                                                                                                                                                                                   |
| 1.7 | Copy the invite         | Toast only                                                       | Confirm **in place** as well — the clipboard glyph settles to a check. The toast tells you it happened; the box you tapped should acknowledge that you tapped it.                                                                                                                                                                                                                                                                                                                                |
| 1.8 | Into the trip           | `navigate('/')`, hard cut                                        | Hand off, don't cut: the born card is already the trip's identity, so it should still be the thing on screen when Home arrives.                                                                                                                                                                                                                                                                                                                                                                  |

**Open question for the mockup:** 1.5 as described is a multi-second sequence, and it is
on the path of someone who may just want to get on with planning. It needs to be
**skippable by interaction** — a tap anywhere lands it immediately rather than blocking.
Draw both and judge.

## Journey 2 — Joining from an invitation

Current: `/join/:token` → `fetchInvitePreview` → a boarding-pass ticket (perforation,
countdown, anonymous avatars) → one tap → in. Anonymous visitors detour through Google
and auto-complete the join on return.

The metaphor here is already the strongest thing in the app's visual writing, and it is
completely static. A boarding pass is an object; objects arrive, and they get stamped.

| #   | Beat               | Today                                               | Proposed                                                                                                                                                                                                                                                               |
| --- | ------------------ | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1 | Loading            | A bare `<p>` of status text                         | The ticket's own shape as the loading state (`Skeleton`, ADR-0078/0105) — you can see a pass is coming before you can read it. Replaces a paragraph with an object.                                                                                                    |
| 2.2 | The ticket arrives | Fully formed, instantly                             | It arrives and **settles**: the card in, the perforation notches punching, the countdown counting to its value, the avatars popping in staggered. The avatars are the "people are already on board" line — they should read as arriving people, not as a rendered row. |
| 2.3 | Anonymous detour   | Leaves for Google; returns and auto-joins invisibly | The weakest point in the flow — you come back and the app decides something without showing it. Return should visibly resume: the ticket you already saw, then the stamp.                                                                                              |
| 2.4 | **The join lands** | `navigate('/')`, hard cut                           | The counterpart to 1.5: the pass is **stamped/torn at the perforation**, then hands off to the trip. This is the join journey's payoff and it currently does not exist.                                                                                                |
| 2.5 | Invalid / expired  | A paragraph                                         | `ErrorState` from the feedback family (ADR-0078), and it should read as a **refused** ticket. An expired invite is a rejection; it should look like one, not like a loading message that never resolved.                                                               |

## Journey 3 — Overlays and screens (mostly falls out of G1/G2)

| #   | Case                                                   | Note                                                                                                                                                                                                                                |
| --- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1 | Map search overlay                                     | Inherits G1's `full` arrival. **Do not** animate the ADR-0132 chrome reclaim; the two must not cross-fade.                                                                                                                          |
| 3.2 | Every sheet / dialog / confirm                         | Inherits G1 for free. This is the volume win — the change is in one primitive.                                                                                                                                                      |
| 3.3 | `IconPicker`, `TimePicker`, `ZonePicker`               | Hand-rolled panels that bypass `Modal` (already noted in `frontend/CLAUDE.md` for their back-layer gap). They need the same enter/exit — and if they get it by folding onto `Modal`, that closes both gaps at once. Worth checking. |
| 3.4 | Tab switches inside a trip                             | Has the `.body` fade already. Candidate for a light refinement, not a rebuild — and cheap to make worse. Low priority.                                                                                                              |
| 3.5 | `AllTrips` → into a trip                               | Same shared-element idea as 1.8: the trip card you tapped is the trip you land in.                                                                                                                                                  |
| 3.6 | Doc viewer, `SyncReviewSheet`, legacy `.sheet-overlay` | Currently on their own `fade` rules outside the primitive. They should ride G1 as they fold on (ADR-0079's Wave 2), not grow private motion.                                                                                        |

## Journey 4 — Micro-beats, ranked by feel-per-line

1. **G3 press feedback** — the whole app, a handful of lines.
2. **Value changes that currently snap** — the join countdown, day counts, member counts, the Home glance figures. A number that changes should be seen to change.
3. **`SyncBadge` pending→synced** — an optimistic write resolving is a moment the user is trusting; the badge should resolve visibly.
4. **`ToggleChip` / `ChoiceGrid` selection** — currently instant; a settle would make the chip row feel physical.
5. **Offline badge / `StatusBanner` arrival** — appears abruptly for something the user should notice calmly.

## Explicitly out of scope (already owned elsewhere — do not design twice)

- **Hero 2.0** — "tapping the board expands it, with animation" is already its own brief
  (`planning/2026-07-28-hero-2-0-design-brief.md`) with an unresolved expansion-vs-overlay
  question. It is the biggest animation in the backlog and it is **not** part of this pass.
  If this pass ships G1, Hero 2.0 inherits a working overlay motion and its open question
  gets cheaper.
- **Map canvas "small cute specific animations"** — deferred on the backlog's Phase 11
  line, under the amber-budget and pin-overlap constraints. Leave it there.
- **Dark mode.** Everything proposed here rides tokens, so it stays theme-independent — the
  same rule the mode switch follows (temperature and energy, never luminance).

## Constraints any proposal here must satisfy

- **The ramp is the vocabulary.** Pick from `--t-*` / `--ease-*`; do not invent values.
  Two additions look justified and should be argued for explicitly in the ADR rather than
  slipped in: a **stagger step** (staggered entrances currently have no shared unit) and an
  **arrival easing with slight overshoot** — all three current easings are non-overshooting,
  and an object that _settles_ needs one. Anything beyond those two is scope creep.
- **`prefers-reduced-motion` collapses everything to instant.** App.css's global
  `animation/transition: none !important` already enforces it — but note the two known
  traps: a state that only exists _during_ an animation must still resolve (feedback.css's
  boot sweep documents this), and an exit animation must not become an overlay that never
  unmounts. G1 has to be correct under reduced motion by construction, not by a second rule.
- **Motion mirrors "one loud element".** One thing moves meaningfully per moment.
- **RTL is the base direction.** Forward/back is inline start/end, never left/right.
- **Nothing may compete with the back contract.** ADR-0090/0103: an exit animation must not
  delay or swallow a back, and a mid-animation back must still resolve to one action.
- **Test what is ours.** Motion is CSS, but the state machine that drives it (G1's exit
  state, G2's direction) is testable and should ship with tests; the look itself is a human
  pass, and saying so is the point.

## Recommended order

**G1 → G3 → G2 → Journey 1 → Journey 2 → Journey 4.**

G1 and G3 change how the _entire_ app feels for a small, contained diff, and G1 is a
primitive the set pieces then build on. G2 is the enabler for both journeys. The two set
pieces come last because they are the most expensive and the least reusable — and by then
they are assembling from parts that already move correctly.

## Next step

Mockups, one per cluster, before any build:

- `motion-primitives-v1.html` — G1/G2/G3 with a before/after toggle, since these are
  judged by comparison and nothing else in the catalog can show them.
- `motion-trip-birth-v1.html` — Journey 1's 1.5 sequence, replayable beat by beat, with the
  skippable variant drawn beside it.
- `motion-join-v1.html` — Journey 2's ticket arrival and stamp, including the refused state.

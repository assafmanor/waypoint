# CLAUDE.md — Frontend (React)

Supplements the root `CLAUDE.md` (read that first, plus the ADR(s) for your
domain via `docs/INDEX.md`'s router before an architectural change). This file
is about **which existing layer/mechanism to reach for** before writing a new
one.

## Component layering — check these three before writing a new component

- **`ui/primitives/`** — generic UI mechanics with no trip-domain shape:
  `Modal` (+ its `Sheet`/`ConfirmDialog`/`RowManageSheet` wrappers), `Field`,
  `FormActions`, `FormSteps`, `FilePicker`, `WhenField`/`TimeField`, `ValueToken`,
  `ChoiceGrid`, `SnapSheet`. **A value shown as text that opens a picker is
  `ValueToken`** (ADR-0177) — a date, a time, a duration inside a sentence. It owns
  the hairline chip, the tone (amber is the clock's alone), and the touch target as
  an `::after` overlay so meeting ADR-0017's 44px floor never grows the line. Do not
  style a value box at a host: five hosts painting one `DateField` five different
  ways is exactly what that ADR was written to end. **Every**
  overlay (sheet/dialog/picker/popover) renders through `Modal`, which
  registers into the back stack via `useOverlay` — never hand-roll a floating
  overlay (`createPortal` / `position:fixed`); it's lint-blocked
  (`eslint.config.mjs`'s `createPortal` guard) precisely because a bespoke
  overlay breaks the one-back-action invariant (ADR-0090). If a bespoke portal
  is truly unavoidable, call `useOverlay()` yourself and add the file to the
  lint allowlist — don't route around it silently. **The exception that proves
  the rule:** `SnapSheet` (the Map's list sheet, ADR-0121 §5) is a pane _of_ a
  screen, not a layer _over_ it — it renders inline, whatever is behind it stays
  interactive, and nothing dismisses it — so it deliberately registers nothing
  with the back stack and back leaves the tab at any height. A new sheet is an
  overlay unless it is genuinely inline like that; if it opens and closes, it is
  a `Modal`.
- **A full-bleed surface that owns its own layout** — `AppShell`'s
  `bodyClassName={BODY_FULLBLEED}` (`overflow: hidden; padding: 0`), not a
  screen-local hack to escape the scrolling body. The layout layer is where this
  belongs (ADR-0078); the Map tab's split is the first consumer, the screen then
  supplying its own edge padding and owning its one scroll region.
- **`ui/domain/`** — presentational, trip-domain-shaped components that take
  **all** data via props (no `state`/screen imports): `Board`, `EventCard`,
  `GlanceCard`, `DayStrip`, `MaybeCard`, `StatTile`, `ListRow`/
  `RowManageSheet`, `ChangeFeed`. Before adding "a row that shows an X with a
  ⋯ menu," check `ListRow`/`RowManageSheet` — it's the generic managed-list
  row + kebab-menu shape already reused across bookings, documents, and
  members; a fourth managed list extends it rather than growing a new
  bespoke row component. Same for "was this done or skipped?": that is
  `SettleControl`, whose `prompt`/`sheet`/`compact` densities serve the day
  card, Plan's archive chooser and the Map's reference row — a fourth host
  adds a density, and the words/marks/hues are not its to choose.
- **A list that filters, searches, scopes, or re-orders** — `lib/filter-reveal.ts`
  (`revealRows` + your predicate) through `ui/primitives/RevealList` (ADR-0120).
  Every control that changes the list is animated: rows leaving/arriving collapse
  and reveal (so a row is hidden in place, never dropped from the array — count
  `countVisible(rows)`, not `rows.length`), and rows that merely move slide there.
- **A selection inside a scroller** — `lib/useCenterSelected.ts`: the selected chip/pill/row
  centres itself in its strip. Deliberately **not** `scrollIntoView`, which centres in every
  scrollable ancestor and so drags the sheet a chip row sits in. Under **mandatory**
  scroll-snap the selected child also needs `scroll-snap-align: center`, or the browser
  re-snaps the centred offset back to a start-aligned boundary (`choice-grid.css`).
- **A horizontally scrolling strip whose edges should fade** — `lib/edge-fade.ts`'s
  `edgeFadeRef` plus the `edge-fade` class (`styles/edge-fade.css`), never a `mask-image`
  gradient in your own stylesheet. ADR-0100 §6 decided that fade and three strips then each
  wrote it out (the pills row, the maybe shelf, the Map's facet strip), so the CONDITION the
  copies all lacked — an edge with nothing behind it must not fade, which is what the owner
  reported — would have had to be added three times. A callback ref rather than a hook so a
  strip rendered inside a `.map()` can take it; it asks `scrollsOn`, so a box that clips
  instead of scrolling (the Map's nested pills group) declines by itself.
- **Motion timed from JS** — `lib/motion.ts` (`motionDurationMs`), never a literal and
  never a raw `readDurationMs`. It answers **0** both under reduced motion and when the
  token is unreadable, which is what keeps a state that only exists _during_ an
  animation from outliving the animation (ADR-0140 §5). Overlay enter/exit, per-variant
  arrival and the shell's route direction are all already in the primitives — a new
  sheet, a new tappable and a new shell screen inherit their motion by existing. What a
  new **large** surface must do is one line: `--press-scale: var(--press-scale-lg)`,
  because the default step is the control one.
- **A one-shot "that just happened" beat** — `lib/one-shot.ts`'s `BEAT` + `playBeat`, five
  members and counting (`NUDGE`, `LANDING`, `REBUFF`, `TICK`, `PINNED`), never a hand-rolled class
  toggle: it owns the remove-reflow-add that makes an animation replay, the token-derived
  duration, and removal by **timer** rather than `animationend` (which never fires when
  nothing animates, leaving the class on forever). Its keyframes live beside the surface
  that owns them. **And it returns the duration so a caller can sequence something after
  it** — `TaskTick` is the worked example (ADR-0195): completing a task makes its row
  leave, so the departure waits on the beat, and 0 under reduced motion means there is no
  gap to reason about. If you delay a caller that way, **flush the pending call on
  unmount** — otherwise a tap inside the beat becomes a press with no write.
- **A form or chooser with more than one step** — `ui/primitives/FormSteps`
  (ADR-0155). `useFormSteps` owns the step state, the back layer, the `הבא`/`שמירה`
  footer through `FormActions`, and the transition; `FormStepPanel` paints it. Two
  rules live inside it and are not the host's to re-decide: it **never animates
  height** (ADR-0152 §6's clip, and a step can hold a composer that grows), and it
  **commits once, on the last step** (the outbox is FIFO, so a per-step save queues a
  note before its host and fails only offline). A chooser passes no `errors` and no
  `validate`; a form passes its own `useFormErrors` and gets ADR-0150 scoped per step,
  with the save re-validating everything and jumping to the first step that refuses.
  `BookingSheet` is the worked example of the form shape: its steps are the form's own
  three subjects, and `STEP_FIELDS` there is exhaustive over its field union by
  `satisfies`, so a new refusal must say which step shows it or the build fails.
- **A form that can refuse a save** — `ui/primitives/useFormErrors` + the `data-invalid`
  attribute (ADR-0150), never a `useState<string | null>` and a caption of your own.
  The hook owns what happens _after_ the refusal (mark, one nudge, bring the first
  problem into view); the form still decides what is wrong and in what words. A field
  joins by spreading `errors.field(name)` onto its `Field` — or onto anything that
  forwards a `FieldMark`, which is how `WhenField` refuses per leg. Report **every**
  problem in one call: returning at the first one sends the user round the save loop
  again to be told the next. What no field owns — a failed save, or a rule two
  optional fields both cure (`NoteSheet`) — is a `field: null` problem rendered by
  `ui/primitives/FormError`, never a `<p className="field-error">` of your own; and
  since `dismissAt` retires a mark by the field that was typed in, a form whose only
  refusal has no field clears on input itself. And **a primary is `disabled` only when a press could not
  work** — offline, or a write in flight — never as a stand-in for a refusal it cannot
  explain (ADR-0150 §8); four buttons were doing the latter and three of them said
  nothing at all.
- **`ui/feedback/`** — the empty/loading/error/status shell family (ADR-0078):
  `EmptyState`, `ErrorState`, `LoadingState`+`Skeleton`, `StatusBanner`,
  `SyncBadge`. A screen needing "no data yet" / "failed to load" / "offline"
  reaches for these, never a bespoke `<div>` shell — this family replaced
  roughly six one-off copies of exactly that; don't add a seventh.

## State & sync — table-driven, not per-type branching

- Reducer action types are a named `TRIP_ACTION` const object + discriminated
  `Action` union (`state/trip-state.tsx`), never bare string literals at the
  `dispatch`/`case` sites (ADR-0095) — a typo in a bare action-type string is a
  silent no-op `default` case, not a compile error.
- "A change came in, apply it to local state/cache" is a **registry keyed by
  `ENTITY_TYPE`**, not an `if`/`else` chain: the memory channels in
  `state/trip-state.tsx` and the cache channels (`CACHE_CHANNELS`) in
  `lib/cache.ts` (ADR-0094). Adding a new offline-syncable entity type means
  adding one registry entry in each place it's mirrored (memory + Dexie
  cache), not a new branch in an existing `switch`.
- Offline write queuing follows the same shape: `lib/outbox.ts`'s
  `OUTBOX_VERB` (named constants, ADR-0095) + `lib/cache.ts`'s
  `outboxOpToCacheChanges`, which maps a queued op to the same `Change` shape
  the WS echo would produce, applied through the one `applyChangeToCache` —
  a new offline-capable write reuses that path rather than writing a parallel
  Dexie mutation.
- Per-enum-value lookups (an icon, a color, a label per `BookingType` /
  `DocumentType` / …) are one `Record<Enum, T> as const satisfies …` object
  (see `constants.ts`'s `BOOKING_TYPE_ICON`/`DOCUMENT_TYPE_ICON`), not a
  `switch` or a set of per-call-site ternaries — the compiler then flags a
  missing case when the enum grows.

## Where a new field goes in a form (ADR-0192)

**A form has five bands, and a new field joins the one that answers its question — never the
end of the form.** This rule exists because the absence of it was a reported defect: _"every
time we add a new field or section to the event form we just append them to the end, now it
looks very messy."_ Appending is not laziness, it is what happens when nothing says otherwise.

    1 · מה      what it is        category · icon + title
    2 · איפה    where             place, or the two route ends
    3 · מתי     when + commitment the when, its conflict warning, hard/soft
    4 · הזמנה   the booking       `יש הזמנה` and everything it opens
    5 · מצורף   attached content  documents → tasks → notes

`EventForm` renders exactly this and `BookingSheet`'s steps run the same sequence
(`type → what/where → when → more`), so the two authoring forms cannot teach different orders.
**`EventForm.test.tsx` asserts the sequence**, so a field that lands in the wrong band fails a
spec rather than being noticed in a screenshot six weeks later.

Two orderings inside it are load-bearing and are not preferences:

- **Where comes before when.** The place DERIVES the zone the times are read in
  (`EventForm.tsx`'s `tz`). Type `19:00`, then pick a place in Tokyo, and the same wall clock
  is stored as a different instant — so asking where first is what stops a form silently
  changing what was already typed.
- **Band 5's internal order is ADR-0174 §3's** — a document is a thing you need, a note is
  something about it, a task is a thing to do between them. The read surfaces use the same
  sequence, and the app must not teach one order for authoring and another for reading.

**If a field fits no band, that is a decision and wants an ADR** — not an append. And the
band's own end is still an end: within a band, put the field where it reads, not last.

## Constants & copy

No hardcoded UI copy or magic numbers/strings in logic (root `CLAUDE.md`'s "No
magic values", `conventions.md`). Hebrew strings live in `i18n/he.ts`; tunables
(durations, thresholds, sizes) live in `constants.ts`; domain enum values come
from `@waypoint/shared`. A literal appearing at more than one call site, or
carrying meaning beyond its immediate context, gets a name in one of those
three places — not copied inline a second time.

## Navigation & back

Covered in the root `CLAUDE.md` (`Modal`/`useOverlay` for every overlay;
`resolveBack` + explicit `{ replace: true }` navigation for every in-trip
transition, never `navigate(-1)` or reading history depth) — restated here
only because it's the sharpest example of "the mechanism already exists, use
it": a new structural back case is a rule added to `resolveBack`
(`state/nav-state.tsx`), not a one-off handler at the call site.

**If a surface can be dismissed at all, that dismissal is in the back stack**
(ADR-0103's two 2026-07-29 amendments; owner: _"system backs shouldn't do
anything different when there's a back button (or cancel, exit)"_ and _"when
there's an implicit way to go back (closing a modal by tapping outside it for
example) we should also treat system back as the same"_). A back / cancel /
close / exit control, a **backdrop or outside tap**, Escape, and the Android
gesture must all run the **same function** — bind them to one handler rather
than writing a second one beside it. What obliges back is that the surface can
be left, not that leaving it has a label.

`Modal` already does this for you — its backdrop, its Escape and its `useOverlay`
registration all end up at the same place — which covers every sheet, dialog,
picker and confirm.

**Escape reaches that place through the back stack, not through `onClose`**
(ADR-0103's 2026-08-01 amendment). The distinction only shows when a second layer
sits above a Modal's own: `onClose` is _that dialog's_ dismissal, so Escape used to
reach past the top layer and close the whole sheet where back peeled one step — and
in a form with an `IconPicker`/`TimePicker` panel open, that meant Escape discarded
what you had typed. `useEscapeAsBack` (called by `useOverlay`) runs the resolver
instead, so whichever listener fires, the stack decides what peels. **Do not add an
Escape handler to a new surface** — if it registers a layer, it already has one, and
a second owner is the bug.

Two shapes need a deliberate `useBackLayer` and are exactly where the app had
diverged:

- **A state a mounted screen enters and leaves** — the Map's disclosure row. The
  screen never unmounts, so it cannot express "there is something to peel" by
  existing; gate the layer on whatever renders the close control (`active`), not
  on a narrower condition. Gating it on the query while one `✕` served the query
  _and_ the filter is precisely how a back walked past a visible control.
- **A step INSIDE an overlay** — `ui/primitives/FormSteps` owns this now (ADR-0155),
  so a third stepped surface calls `useFormSteps` and writes no layer at all. The rule
  it encodes, and the reason the primitive is a **hook** rather than a component:
  register in whatever renders the `Modal`, i.e. its parent — child effects run first,
  so the Modal's close layer lands underneath and back peels the step first, and a
  component rendered _inside_ the sheet would register in the wrong order. Returns
  `{ remainsActive: true }` — a step back leaves the overlay open. Two surfaces
  hand-rolled this before it was one thing; do not write the third.
- **A hand-rolled panel with a backdrop or an outside-tap handler** —
  `IconPicker`, `TimeField`/`TimePicker`. These don't go through `Modal`, so
  nothing registered them and back fell through to the host form's layer,
  discarding what was typed. Gate the layer on the panel's own open state.

**Always gate on the open/selected state, never register unconditionally.** That
gate is what orders the stack correctly with no reasoning about component trees:
a layer joins when it becomes _active_, so a popover opened inside a form lands
above the form's layer, and whichever thing you opened last is what back peels
first.

Not this: a `✕` that clears a value or dismisses a notice (`FilePicker`'s remove,
`StatusBanner`'s dismiss, a picker's clear). Back navigates; it does not edit.
The test is whether the gesture dismisses something you are _in_, not whether it
removes something from the screen.

Consequence for tests: anything registering a layer needs `NavProvider` (plus a
router and the toast), so it can't be rendered bare. Use `wrapNav` from
`src/test/nav-harness.tsx` — don't open-code the provider stack again.

## Anti-patterns already found and fixed once (don't reintroduce)

- **A `//` comment leading a bare `null` ternary branch in JSX.** Prettier hoists those lines
  onto the `?` line and **reorders them on every run**, so `format` and `format:check` disagree
  and CI goes red on a file the pre-commit hook has just written — the hook writes the mangled
  form, `--check` then rejects it, and re-running `format` produces a _different_ mangling. It
  read as a formatting nit and was a comment-destroying one: the lines came back concatenated in
  reverse. Cost one red `ci` on ADR-0214's build. Put the reasoning where Prettier is stable —
  a `{/* … */}` JSX comment above the whole conditional, or a named `const` for the empty branch
  with its docblock (`Board.tsx`'s `nothing` is the worked example) — and never inside the branch.
- A hand-rolled floating overlay (`createPortal`/`position:fixed`) instead of
  `Modal` + `useOverlay` — silently breaks system-back/Escape for that one
  surface (ADR-0090); lint-blocked for a reason.
- **A hit layer stretched over a card to make the whole card tappable** (owner report,
  2026-08-24). The Plan day row opened its read from `.bld-main`, which is ONE cell of the
  row's grid (ADR-0178 §1) — so the padding, the badge's column and the width beside the when
  line answered nothing — and the obvious fix is the one that does not work. A tap is
  arbitrated against each candidate's **own layout box**, so a layer covering the card loses
  to the row element, whose box contains the point and which is a candidate itself the moment
  it carries pointer handlers (here, the drag's). Both layers were tried against
  `e2e/plan-row-tap.spec.ts`'s taps — a `::after`, then a real child span — and both read the
  same: `elementFromPoint` returned the layer at every point in the card while every tap
  outside the title still dispatched its click to `.bld`. jsdom can see none of it. **Expanding a target past
  its own edges is untouched** — the same run has the time chip's ±8px reaching the chip
  (ADR-0161 §7), because a few px out it is still the nearest candidate. What fails is
  covering the neighbours. So a whole-card tap is handled on the card element, with the
  controls on it recognised by what they are (`closest('button, [role="button"]')`) — and
  since a React portal bubbles to its REACT parent, such a handler must also ignore what its
  own sheets send it (`e.currentTarget.contains(e.target)`).
- A bespoke empty/loading/error `<div>` per screen instead of the
  `ui/feedback/` family (ADR-0078).
- A form-level "something is wrong" caption, or a per-form `.invalid` class, instead of
  `useFormErrors` (ADR-0150). There were three of these across six forms and none marked
  the field; the shipped complaint was that the refusal was _"nearly noticeable"_. Note
  the second half, which the caption version hid: a refusal that stops at the FIRST
  problem is a second save attempt for the second missing field.
- **A `:hover` rule that paints a STATE rather than a hint** (ADR-0195 §4). On a touch
  device `:hover` **latches** after a tap and clears only when something else is tapped, so
  every hover rule is also a stuck state — and this app is phone-primary (ADR-0017, "no
  hover-only affordances"). The tick's hover borrowed `--ok` for its ring and drew the ✓ at
  `opacity: 0.4`, so a tap left an **open** control wearing a ghost check inside a green
  circle: the owner's _"still leaves the checkbox selected"_, reported twice, and once
  investigated and closed as not-reproducing because the session read `aria-pressed` and the
  fill — both of which were correct the whole time. **A report about a control's appearance
  after an interaction is not answered by asserting its state.** Three rules follow. A hover
  hint may never spend a status colour or a state's own glyph. A hint that must exist goes
  inside `@media (hover: hover) and (pointer: fine)` so it cannot latch (~40 older rules are
  a backlogged sweep). And on a **stateful** control, prefer deleting the hover to overriding
  it: the tick's fix is a deletion, because the quieter replacement could not be measured as
  cheaply as it could be dropped — and it was mouse-only on a phone-primary app either way.
  If you do override, check the specificity: `.x:hover .icon` and
  `.x[aria-pressed='true'] .icon` are both (0,3,0), so the later rule wins on a hovered
  _pressed_ control and silently takes its mark away.
- A hand-picked `:active` transform, or a duration literal in a `setTimeout` that is
  waiting for an animation. Both existed in quantity: seven different press values
  across 16 rules, and a mode-switch timer whose token reader was private to
  `App.tsx`. Press steps are `--press-scale`/`--press-scale-lg`, waits are
  `motionDurationMs` (ADR-0140).
- **Splitting the `:root` block in `tokens.css`** to add a variant selector. Done once
  while building ADR-0140 and it put the fonts, spacing, type, radius, elevation and
  press tokens behind `[dir='ltr']` — silently unset across an RTL app, with no test
  able to see it. A variant block (`[dir='ltr']`, `[data-theme='dark']`) goes **after**
  the `:root` block, never inside it.
- A chip/search/scope control `.filter()`ing rows out of the array instead of the
  shared reveal (ADR-0120) — the Map jumped for two releases because the Index's
  motion was a one-off.
- **Reading a per-arrival fact live instead of latching it**, and its twin, **putting a
  keyframe `offset` under a non-monotone easing**. Both shipped in one afternoon and
  neither could fail a test (ADR-0140 §7's build log). The route transition's `data-nav`
  was read every render, so the trip back guard's **same-URL** push (ADR-0103, no state →
  reads as forward) restarted the animation on a screen that had already arrived — a
  same pathname means the same key and no remount, but the attribute changing value is
  enough. And `--ease-arrive` overshoots, so keyframe offsets are sampled against a
  front-loaded progress: an `offset: 0.6` fires in the first fifth. If a value describes
  the **arrival**, capture it at mount; if a channel needs its own clock, give it its own
  animation.
- **Arming a one-shot guard when the gesture completes rather than when the event it guards
  will fire.** The canvas's click swallow was armed at the long press's **drop** — with the
  finger still down — and expires in `DRAG_CLICK_SWALLOW_MS`, so the release's click arrived
  unguarded and dismissed the form that press had just opened (ADR-0148's amendment). Start
  the clock at the event before the one you are guarding, not at the decision. Its twin: the
  guard was a `stopPropagation` on a DOM event, and what actually reached us was a callback
  **Google dispatches** — this file's "one stream says nothing to another" is weaker than the
  truth, which is that it says nothing at all to a subscription. Guard at the seam too.
- **A landing position written as a constant instead of measured.** Three times now:
  ADR-0142's `--birth-card-top: 118px`, ADR-0143's `58px` stamp offset, and the trip
  handoff's target. Measure the destination element, and assert the aim against its
  settled box in an e2e spec — jsdom reports every rect as zero, so this whole class of
  bug is invisible to the unit suite by construction.
- **Transforming an element without counting the `position: fixed` descendants inside it.** A
  transform (and `will-change: transform`, and a filter) makes its element the **containing
  block** for every fixed descendant, so a layer that was pinned to the viewport silently
  becomes pinned to that box — and its rect is then wrong by however far the box sits from the
  viewport's origin, which changes as the transform animates. ADR-0116 §2d shipped this: the
  edge dwell translated `.day-page`, the drag ghost rendered inside it, and the clone walked
  117px down the screen and then 156px while the finger never moved (_"it no longer is under
  the finger"_, _"the ghost disappears sometimes"_). `useSwipePager`'s docblock had already
  written the trap down for the same ghost — which is what makes this a counting failure and not
  a knowledge one. Before adding a transform, `grep` what renders inside that element; a
  gesture-time fixed layer (`.wp-dragghost`, `.day-peeks`, `.doc-viewer-lift`) belongs OUTSIDE
  the transformed box, and `offsetParent === null` is the assertion, because a fixed box that
  reports an offset parent is not viewport-anchored whatever its rect says this frame.
- **A command channel that is not idempotent, when its caller is a stream.** The same ADR's
  second defect: the edge dwell re-issues `hold(step)` on every pointer move and every
  auto-scroll frame, and `hold` cleared the settle timer and rewrote the offset each time — so
  one pixel of jitter cancelled the page turn it had just started (`dx 382px` → `dx 48px`, no
  day change, a visible snap-back). Two rules for anything imperative that a gesture drives:
  **re-commanding the state you are already in is a no-op** — ask the DOM, not a second copy of
  the state, so an intervening reset correctly reads as "not held" — and **a committed
  animation is not interruptible by a repeat of the command that started it**, only by a
  command that means something different.
- **Sampling the CSS variable a transition is driving, and calling it the picture.** A custom
  property is the transition's **destination**: `--swipe-dx` reads `0px` the instant it is
  written, while the compositor is still carrying the element a page away from there. ADR-0116
  §2d cost **four rounds** to this — every probe reported the offset clean while the screen
  showed a whole page sliding backwards, because the offset _was_ clean and the paint was not.
  Sample `new DOMMatrixReadOnly(getComputedStyle(el).transform).m41`, and sample it beside the
  state it belongs to (which day the page draws, which attributes the host carries) — a position
  without its meaning is what let a reverse slide read as correct. Corollary for e2e: assert a
  **count of transitions** and the **painted values**, never the variable; and if a case is
  about what the eye sees, a `transitionrun` listener plus a 16ms sampler is the instrument, not
  `expect.poll` on a style property.
- **Reading a rect and calling it visibility.** An ancestor's `overflow: hidden` clips what
  paints and changes **no rect at all**, so a geometry harness reports every number healthy
  while the element is a sliver. It happened here twice in one evening: the Map card's own
  `overflow: hidden` cut `IconPicker`'s anchored panel to 50px, and the twelve-state pass
  measuring it said "fits" twelve times (ADR-0148's third amendment; ADR-0132 §4 is the same
  shape on iOS). Before using the word, walk the ancestor chain and intersect the rect with
  every box whose overflow is not `visible`. And note the companion rule: **a bounded card
  that clips cannot host an anchored panel** — the panel leaves its host's box by design.
- **Reusing a component onto a surface unlike the ones it grew up on, and inheriting its
  DEFAULTS with it.** Three reports in one evening on the Map's place card, and none was a
  defect in the card (ADR-0148's second amendment): `IconPicker`'s panel opens **below** its
  trigger, which is right in a form that scrolls under a header and off-screen in a card
  anchored to the canvas's bottom; the camera's arrival **zoomed**, which is right for a row
  whose pin you cannot see and wrong for a pixel you just pressed; `autoFocus` opens the
  keyboard, which is right in a form you navigated to and a flicker at the end of a gesture
  that ends with a finger lifting. The reuse was correct in all three — what needed asking was
  **what each default was answering**. When a shared component lands somewhere new, fix the
  assumption inside it (measured placement, intent in the value) rather than overriding it at
  the new host, or the next host inherits the same wrong default.
- Handing a `memo`ized component a **fresh object or function each render** on a
  screen that re-renders on the clock. `screens/Map.tsx` ticks every second, and
  `MapPane` holds a live MapLibre instance where a needless re-diff of every
  marker is the cheap failure and a re-instantiation loses the camera and canvas:
  so its array prop is memoized on a **content key** (the
  `RevealList` trick), its handlers are `useCallback(…, [])` over a latest-ref,
  and even `defaultCentre` is a `useMemo`. One inline `{ lat, lng }` in the JSX
  undoes all of it silently.
- Three divergent confirm-dialog implementations instead of one variant-driven
  `ConfirmDialog` (ADR-0079) — if you're about to write a second confirm
  prompt, its variant belongs on the existing one.
- The same shape one layer up, and it ran for three sessions before anyone
  counted: three hand-rolled settle affordances, which drifted on **four**
  axes before `SettleControl` collected them (ADR-0139's Consequences) — a
  ✓ with a mark beside a skip with none, `--ok` with no `--miss`, `היינו`
  (a record) beside `דלג` (an instruction), and two different focus rings.
  Note what all four are: they are the **vocabulary**, not the sizes, so
  every test on those surfaces stayed green the whole time. When you copy a
  small widget "because the geometry is different", the geometry is the part
  that was fine.
- Per-entity-type `if`/`else` in a change-apply or cache-mirror function
  instead of extending the `CACHE_CHANNELS`-style registry (ADR-0094).
- A bare string literal for a reducer action type / sync state / outbox verb /
  HTTP method (ADR-0095) — name it beside the type it feeds.
- Redefining an entity shape locally instead of importing it from
  `@waypoint/shared` — the package exists precisely so this can't drift.
- A screen assembling its own `ZoneContext` (or deriving its own crossings /
  ambient zone) instead of `dayZoneContext`/`liveZoneContext` over trip-state's
  `zoneEvidence` — shared resolver + per-screen input is not shared behaviour, and
  the two day surfaces diverged for a release (ADR-0107 session-102).
- **Changing a day-surface derivation in `DayView` only.** The generalisation of
  the line above, and it has now cost a release twice. `DayView` and `PlanDay`
  render the **same** components (`TransitionRow`, `UnplacedCommitment`,
  `GapStrip`, `EventCard`) off the **same** derivation, and differ only in
  **posture** — Plan has no inline settle pair, and its gap is a `שבץ` control
  where Trip's is a statement. ADR-0159 §1 allows a difference in posture and
  forbids one about a **fact**; ADR-0171 §10e is the repair for exactly this,
  where a check-in read as unplaced in Trip and interleaved by its floor in Plan.
  Touching `placeDayEntries`, `dayBlocks`, `mergeDayEntries` or anything either
  screen reads means checking **both**, in code and in the mockup.
- Turning a typed wall-clock into an instant with `trip.timezone` (or any zone the
  call site happened to have) instead of `authoringZone(…, zoneEvidence)` — the
  event then renders at a different time than it was typed at. A `WhenField`
  without a `zone`/`zones` prop is exactly that surface: the chip is opt-in per
  call site, so a form doesn't get it "for free" (ADR-0107 session-128).
- **The read-side twin of the line above:** rendering a stored instant with
  `trip.timezone` instead of the event's resolved zone
  (`eventDisplayZones(event, zoneEvidence)`), per **end** — a departure in its
  origin, an arrival in its destination. The primary zone is the fallback for an
  event nothing anchors, not a default to reach for. It cost a field report on
  `BookingDetail` and the Index row (ADR-0107 session-258), where the tell was
  that the wrong pair looked _right_: the duration beside them is instant-based,
  so it agrees with any zone and hides the error until you open two surfaces at
  once. A read one tap from a row must state the row's time.
- `navigate(-1)`, `history.back()/forward()/go()`, or any read of
  `history.length` for a back action — back is computed from nav state
  (ADR-0090), never traversed. **Lint-blocked since session 178**, because the
  app leaves entries behind it that are harmless only while nothing walks into
  them (an errand strands one per round trip): a traversal lands on one and drops
  the user on a screen they never asked for. Tests are exempt — two harnesses
  call `history.back()` to simulate the platform, which is the legitimate use.
- **`dir="ltr"` on anything but an `<input>`** (lint-blocked, ADR-0118). It sets
  the base direction of the whole element, so a token carrying a Hebrew unit
  lays out left-to-right and reads unit-first: `9 ק״מ` became `ק״מ 9`, `+3 ש׳`
  became `ש׳ 3+`. Use `dir="auto"` (or no `dir`), and make the **numeric run**
  the island via `ltrIsolate` / `measure` in `lib/bidi.ts` — a number-and-unit
  string is `measure(9, 'ק״מ')`, never a hand-built template. A signed number
  needs the isolate independently: in the RTL flow the `−` of `−3` drifts to the
  wrong side of the digits. Same care for `direction: ltr` in CSS, which lint
  can't see. **The guard reads the `'ltr'` literal anywhere under the attribute**
  — it used to key on the attribute's value and so walked past
  `dir={mono ? 'ltr' : undefined}`, which is how two copies of the same fact row
  kept forcing a direction through the whole sweep that was meant to end it.
- **Rendering stored content with NO `dir` at all** — the other half of the same
  ADR, and the absence is the bug. An address, a place name, a trip destination,
  a provider: the app did not write it, so its element carries `dir="auto"` or it
  inherits the page's RTL and a value opening with a numeral run comes apart
  (`2-14-5 Kabukicho, Shinjuku, Tokyo` → `Kabukicho, Shinjuku, Tokyo 2-14-5`).
  Two boundaries: the attribute goes on the element holding **the value and
  nothing else** (a box that also holds Hebrew links would lay those out LTR
  too), and **never on an `<input>`**, where `auto` sniffs the value and so
  left-anchors a Hebrew placeholder while the field is empty — a field inherits
  the page, a rendered text node sniffs.
- **Assuming a numeric run is safe because the row beside it is** — the two
  entries above interact, and the interaction is not intuitive. `dir="auto"`
  resolves from the first **strong** character and falls back to **`ltr`** when
  there is none, so a digits-only value (`17:00–21:00` in `.tr-time`) is fine
  under `auto` with no isolate at all. The same string inside an element that
  **also carries a Hebrew word and no `dir`** — `UnplacedCommitment`'s `.as`,
  which renders `${label} · ${when}` — leads with a strong RTL character and
  flips the range to `21:00–17:00`. Two rows that look identical in source
  disagree on screen, and adding `dir` to the container is the wrong repair:
  **`ltrIsolate` the numeric run** (`lib/bidi.ts`), because the container is
  exactly what differs between the safe case and the broken one. A design session
  asserted the opposite here and caught it only by rendering both.
- **Putting a WIDER value in a row without checking the sibling row shape.** The
  app answers "where does the time go" two opposite ways on purpose:
  `.transition-row` is flex with `.tr-time` at the trailing edge
  (`flex: 0 0 auto` · `nowrap`), while `.wp-event-face` is a grid whose areas
  are `'badge title' / 'badge when'` — the time **under** the title. That is a
  wash for a single time and expensive for anything wider: measured at 360, a
  `17:00–21:00` range at the trailing edge took **45px of 210** off `.tr-title`,
  the only element in that row that ellipsises. When a value grows, find the
  sibling shape that answers differently and measure the trade; ADR-0171 hit this
  at 8px and a range hits it at 45px, so it scales with the value.

## Testing

Vitest + React Testing Library. Component tests for the interaction verbs; a
new `ui/domain/` or `ui/primitives/` component ships with its own test file
alongside it (the existing `*.test.tsx` co-location is the pattern, not the
exception).

**Query by `t.*`, never by a copy literal** (session 258). If the component reads a string
from `i18n/he.ts`, the test that looks for it on screen reads the **same key** —
`getByText(t.docs.viewer.error)`, not `getByText('לא הצלחנו לפתוח את המסמך')`. A copy pass
across `he.ts` cost 11 unit failures and 5 e2e failures with no defect behind any of them,
which is a tax on improving the Hebrew and nothing else. Applies to **e2e specs too**
(`import { t } from '../src/i18n/he'`): the 5 e2e failures were one reworded button, and the
unit suite could not see them because `pnpm test` does not run Playwright.

Two things this rule is not:

- **Not for a label the test itself supplies.** `ListRow`, `ConfirmDialog`, `SearchField`,
  `TimeField`, `MaybeCard` and `ChoiceDisclosure` take their words as **props**, so their
  specs pass their own fixtures. Coupling those to an unrelated `t` key that happens to hold
  the same string is worse than a literal — the test then breaks when a screen it has nothing
  to do with is reworded. Same for seeded fixture data: `ev('קשיח', …)` is an event _title_.
- **Not satisfied by a substring regex.** `new RegExp('הזז')` kept passing after the button
  became `הזזה`, and `queryByText('הפוך למנהל')` kept passing after that verb was reworded —
  an **absence** assertion against a stale literal is vacuous, and it reports green forever.
  That is the failure mode worth fearing here, not the loud one.

**A WebGL surface cannot be seen in jsdom, but almost all of its contract can be tested.** The Map
tab is the worked example (ADR-0121 §13): every decision about what a pin looks
like lives in pure `lib/` functions tested without a renderer
(`map-pins.ts`, `map-camera.ts`, `place-refs.ts`, `snap-sheet.ts`,
`map-config.ts`); `MapCanvas.test.tsx` fakes the small imperative MapLibre surface,
`MapPane.test.tsx` asserts our DOM, and the shell's test (`Map.embedded.test.tsx`)
stubs the pane. A production-preview e2e run is mandatory for assets, chunks and worker URLs;
the real-archive render spec is the only automated proof that the ground paints.

**"It talks to a third-party object" is not the same as "it can't be tested",** and
reading it that way shipped a camera that opened on the whole world (ADR-0121's
session-134 build-log entry). `useMapCamera` touches a small `CameraMap` contract,
methods, so a ~60-line fake map covers it completely — see
`lib/useMapCamera.test.tsx`. Before declaring imperative glue untestable, count
the methods it actually calls; usually a fake is cheaper than the bug.

Three rules that exist because their absence hid real bugs for three review
rounds (the Map tab's ordering, ADR-0109 session-110) or ten releases (the env
leak, session 260):

- **Pin the clock.** A test whose fixtures carry fixed dates must set its own
  `now` via `setSimulatedNow` (`lib/useClock.ts`) — otherwise it silently reads
  the real system clock, so it means something different every day it runs and
  passes for the wrong reason. Reset it in `afterEach`.
- **Assert across both day scopes** on any day-scoped surface (the Day view and
  the **Map**, `DAY_SCOPED_TABS`). The Map's day-scoped and all-days paths are
  genuinely different renders: an ordering bug that only showed in all-days
  survived three sessions because every test for it was day-scoped.
- **The suite reads no environment it did not set** (`vite.config.ts`'s
  `test.env`, session 260). This is the clock rule with a different input, and it
  had been costing ten failures on any machine that had followed the quickstart
  while CI — which has no `frontend/.env` — stayed green, so nobody's local red
  was believed. Vite loads `.env` for the unit run too: `VITE_API_BASE_URL` made
  every same-origin assertion absolute (`Avatar.test.tsx` even had a comment
  _stating_ the value was empty under test, which nothing enforced). It is pinned
  empty in `test.env`. A spec that wants a different capability or archive URL
  **mocks `lib/map-config`** where the reader can see it (`Map.embedded.test.tsx`),
  rather than depending on a file outside the repo's control. Same reflex for anything else ambient: if the
  assertion depends on it, the suite states it.
  - Its companion, and the reason it went unnoticed for so long: **a file that
    fails to COLLECT reports as one red filename and hides every test in it.**
    `virtual:pwa-register/react` has no file behind it, so two specs whose graph
    reaches `lib/useAppUpdate.ts` ran **zero** assertions between them
    (`src/test/pwa-register-stub.ts` is the alias that fixed it). When you read a
    failure count, read the **file** count beside it — 3564 passing looked
    healthy while 23 tests were not running at all.

**Two traps in measuring a box in an e2e spec**, both of which cost a red CI on `main`
(day-swipe, 2026-08-22) and neither of which fails loudly:

- **A descendant selector on the day surface reaches the peek panes.** A peek holds a whole day
  surface, so `.day-page`, `.sec-title` and every row class exist three times over while a
  gesture is live — and `.day-peeks` renders BEFORE `.day-page`, so
  `` `${PAGE} .sec-title` ``.first() is TOMORROW's heading. `:not([data-preview])` does not save
  you: it excludes a pane's own inner host, not the panes nested inside the host you asked
  about. Use the child combinator (`> .day-page …`), which the same spec already used one
  assertion away. The failure mode is a spec measuring the wrong pane and staying green.
- **`locator.boundingBox()` returns `null` for a node a render detached mid-call**, and does not
  re-resolve the locator the way an action would — so a visible element reports as invisible and
  the only tell is that the next query succeeds (proven: `isConnected=false`,
  `getClientRects().length === 0`, correct box one tick later). It also inherits
  `use.actionTimeout`, which this config leaves at **0 = no timeout**, so a locator that never
  resolves hangs to the _test_ timeout and names no element. `e2e/measure.ts`'s `stableBox` is
  the answer to both; reach for it rather than a bare `boundingBox()` on any surface that
  re-renders.

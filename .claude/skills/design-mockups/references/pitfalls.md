# Things that only show up once it is rendered

Each of these was found the expensive way, in the file named. Read this after
your first render, with the screenshots open — most of them are invisible in
source and obvious on screen.

## Bidi and RTL

**A numeric range reverses itself.** `` `${start}–${end}` `` inside Hebrew prose
renders `18:00–15:00` for a 15:00–18:00 range. ADR-0118 requires `ltrIsolate`
around any numeric or Latin run; its lint guard reads `dir="ltr"` attributes and
cannot see a template string, so this ships. Found by rendering
`day-scheduling-grammar-v1.html` — in the *shipped* gap-fill header.

**…but NOT everywhere, and guessing which is which is how a mockup ships a
false claim.** `dir="auto"` picks direction from the first **strong** character
and falls back to **`ltr`** when there is none — so a digits-only run
(`17:00–21:00`) under `dir="auto"` is **safe**, and `.tr-time` was never at
risk. What breaks is an element with **no `dir` at all** whose content leads
with Hebrew: `UnplacedCommitment`'s `.as` renders `${label} · ${when}`, the
Hebrew word makes the element RTL, and the range inside it flips. The first
draft of `an-edge-can-be-a-window-v1.html` asserted the opposite, drew two trap
frames, and they rendered **identical** — which is what exposed it.

Two rules follow. **A bidi claim is a render result, never a deduction** — draw
both sides and look, because the wrong one is invisible in source and stated
confidently in prose. And the fix is always ADR-0118's: isolate the **numeric
run**, never set a direction on the container — the container is what differs
between the safe case and the broken one.

**A directional glyph flips.** `‹` `›` `→` are `Bidi_Mirrored`: inside
`dir="rtl"` they silently point the other way. Use the real `NavArrow`/`Icon`
SVGs (`index-findability-v1.html` confirmed this by rendering test).

**A `+N` overflow badge renders as `N+`.** Same class of defect, found in
`user-settings-v1.html` against shipped `App.tsx`.

## Painting order and stacking

**`inset` box-shadow paints below the element's children.** A photo therefore
covers a ring drawn as an inset shadow, and the element silently loses the thing
the ring was carrying. Needs an overlay pseudo-element instead
(`place-enrichment-v1.html`).

**A transformed ancestor rebases `getBoundingClientRect()`.** If you measure a
rect to place or fly something, an intermediate `transform` offsets it. Check
what is between the measured node and the viewport before trusting the number.

## Selectors that behave differently in a mockup

**`[hidden]` is not absence.** It sets `display: none`, and a shipped
`:has(> .x)` still matches. The app renders conditionally where a mockup keeps
the node mounted and toggles it — so a shipped rule can hide controls in every
state of your file. Undo it with a labelled mockup-only override, and never by
rewriting the shipped rule (`map-split-v2.html`).

**Real CSS over an invented tree is not the app.** Same class names, different
nesting, and specificity lands elsewhere. Reproduce the tree.

## Measuring

**Measure after the transition, not in the same tick.** A surface that animates
its height reports the *old* value if you read it immediately; re-measure on
`transitionend` (`map-split-v2.html`).

**A flex row is not a neutral place to measure a card.** `align-items: stretch`
makes every child the height of the tallest, so three variants report three
identical numbers. One strip per case (`day-scheduling-grammar-v1.html`).

**Measure the worst case.** Pair each variant with a title that already takes the
full line clamp; the long name is what actually breaks the layout.

## Theme

**A colour defined in TypeScript cannot join a CSS remap.** Anything computed in
JS stays light in dark mode. If your surface computes a colour, that is a design
finding, not a mockup detail (ADR-0158 §16 sub-section).

**An accent tuned on a neutral ground fails on a hued one**, and a selection can
be legible in both themes while being distinguishable in neither. Both are why
the toggle exists; check contrast in dark before you call a section done.

**A graphic mark with no contrast of its own** disappears in one theme. Amber on
the dark board measured 1.31:1 in one case — under any usable floor.

## Reuse (rule 8, and it fails silently at the drawing stage)

**A panel that behaves almost like a sheet is a second overlay system.** It
looks fine rendered — that is the problem. Check the drawing against
`frontend/CLAUDE.md`'s primitives *before* the ADR accepts it, because the build
will faithfully reproduce whatever the mockup drew. ADR-0078, 0079, 0094 and
0095 are all retractions of copies that got that far.

**A large hand-written CSS block is the tell.** Reusing a primitive costs a few
lines; redrawing one costs many. If your proposal block is long, name the
primitive you should have used and try again.

**"It already exists twice, half-built" is a finding, not an obstacle.** Two
bespoke time pickers in `PlanDay`/`ResolveSheet` became one primitive because a
mockup went looking; the section was then drawn with the existing geometry
rather than a new one.

## The environment

**Webfonts may not load in a sandboxed session**, and then every width in your
measurement table is a measurement of the wrong typeface — in the one part of
the file that claims to be real. `scripts/render.mjs` fetches them through curl
and says so explicitly when it cannot; do not quote numbers from a run that
reported no font.

**Remote images do not load either.** `place-enrichment-v1.html` had to use
synthetic images for exactly this reason, which left crop geometry honest and
content dishonest — and the ADR said so rather than pretending otherwise.

**`tokens.css` pins the document to the viewport, so a mockup must undo it.**
Since 2026-08-21 (ADR-0200 §1) the app declares `html, body { overflow: clip }` —
the app-shell scrolls inside `.body` and the root must never become a scroll
container. Every mockup inlines that sheet, and a mockup is a *document* of
sections rather than an app shell: `scrollHeight` collapses to the viewport,
`window.scrollTo` does nothing, and a full-page screenshot comes back with §1 and
then blank rectangles where §2–§5 are laid out but never painted. Nothing errors
and the measurement table still fills in, so it reads as a page that renders.
Undo it in the `mk-*` block, labelled:

```css
html,
body {
  height: auto;
  overflow: visible;
}
```

`note-full-screen-v1.html` is the file that found it; `a-day-turns-under-a-held-card-v1.html`
is the other one that inlines the rule.

**`document.fonts.ready` is not enough to trust a width.** An `@font-face` is
fetched lazily on first use, so at parse time there may be nothing pending and
`ready` resolves **immediately** — before a single glyph of Assistant exists.
A measurement table built in that tick reports fallback metrics, which is the
webfont trap above arriving through the clock instead of the network. Ask for the
faces explicitly, per weight, and re-measure:

```js
Promise.all(
  ['400 12px Assistant', '600 12px Assistant', '12px "Secular One"'].map((f) =>
    document.fonts.load(f),
  ),
).then(() => document.fonts.ready.then(measure));
```

`note-full-screen-v1.html` reported a truncation rule as costing **nothing**
(⁦38px⁩ against ⁦38px⁩) until it did this; the same two boxes are ⁦51px⁩ and ⁦37px⁩
once Assistant is applied, because the fallback face is narrow enough that the
name never overflowed. Note the shape of the failure: the number that lied was
the one saying **the change makes no difference**.

## Drift

**Re-run `inline-app-css.mjs` whenever a manifest sheet changes.** The catalog
has ~16.6k lines of measured drift across 14 files from this rule slipping, and
a stale mockup argues from CSS the app no longer has. Re-running is idempotent
and safe; the diff is the check.

**Do not retrofit an old mockup to a new rule.** Older files are dated records of
what was decided then. The both-themes rule, and any rule after it, binds a file
on **create or revise** — when someone is actually looking at it.

## Scope

**A mockup that only draws the happy path decides nothing.** The empty state, the
filtered-to-nothing state, the offline state and the seventeen-item state are
where the layout is actually decided.

**A verb goes on the object it changes, if that object is on screen; a menu is
what is left over.** Two unrelated verbs reaching for the same icon means neither
was placed, only filed — that collision is a reliable tell, and it shows up in a
render before it shows up in reasoning.

## Coverage — the things a file silently leaves out

**Trip AND Plan, every time.** `DayView` and `PlanDay` render the *same*
components off the *same* derivation (`placeDayEntries`, `TransitionRow`,
`UnplacedCommitment`, `GapStrip`) and differ only in **posture** — Plan has no
inline settle pair and its gap is a `שבץ` control. ADR-0159 §1 permits a
difference in posture and forbids one about a **fact**, and ADR-0171 §10e exists
*because* a build shipped a split in `DayView` only, so the two modes said
different things about one booking. Drawing Trip alone reproduces that bug at the
design stage, where it is cheapest and least visible.
`an-edge-can-be-a-window-v1.html` had to grow its §2c after the owner asked —
having already read §10e that session.

**When a value gets WIDER, the row shape is a decision, not an inheritance.** The
app answers "where does the time go" two opposite ways on purpose:
`.transition-row` is flex with `.tr-time` at the trailing edge
(`flex: 0 0 auto` · `nowrap`), `.wp-event-face` is a grid with
`'badge title' / 'badge when'` — the time **under** the title. It makes no
difference for a single time and a large one for anything wider: measured at 360,
a `17:00–21:00` range at the trailing edge took **45px of 210** off `.tr-title`,
the only element in that row that ellipsises. Whichever shape you copy from, find
the sibling that answers differently and **measure the trade** before choosing.
ADR-0171 found the same thing at 8px and this file found it at 45px, so the
question scales with the value.

**A claim about a derivation is worth counting the call sites for.** "A window
bounds no gap" was written into a mockup's prose before `day-joins.ts` was
opened. It happened to be true, named the wrong function, and did not know *why*
it held. Reading it properly took one grep, confirmed the rule holds **by
construction** (every consumer tests `=== 'exact'`), and turned up the one
consumer that does not follow the pattern and would have shipped a defect
(`glance.ts:457` tests `!== 'not-before'`). The count is usually the deliverable,
not the preamble.

**Inlining `tokens.css` stops the mockup itself from scrolling, and the symptom
looks like a page that fits.** ADR-0200 §1 put `html, body { overflow: clip }` in
`styles/tokens.css` — the app's document never scrolls, an inner `.body` does — and
every mockup that inlines that sheet applies the rule to its own page, which has no
inner scroller and is several viewports tall. **`clip` is not a scroll container**,
so the root's `scrollHeight` collapses to `clientHeight`: content below the fold is
*unreachable*, not hidden, and the obvious check ("is `scrollHeight >
clientHeight`?") answers **no** — identical to a short page. Caught only when a human
tried to scroll one. Three files, all inlined after 2026-08-21: measured at
**9713px of content against 700px reachable** on
`a-journey-has-one-date-v1.html`, and 6650 / 5084 on
`a-day-turns-under-a-held-card-v1/v2.html` — **the promoted build specs for
ADR-0116 §2d and ADR-0200, unreadable for a day.** The template now ends with an
`html, body { overflow: visible }` block; keep it **last**, and if you write a scroll
check, assert on the content's own height rather than the root's.

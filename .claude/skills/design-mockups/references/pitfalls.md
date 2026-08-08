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

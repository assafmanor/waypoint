# Anatomy of a mockup, top to bottom

Read this while filling in `assets/mockup-template.html`. Every region below
exists in the newer catalog files (`day-scheduling-grammar-v1.html`,
`hero-lift-v1.html`, `notes-on-a-host-v1.html`, `map-settle-from-canvas-v2.html`
are the ones worth reading as examples).

---

## 1. The header comment

The first thing anyone opening the file reads, including you in three weeks.
It is prose, not a changelog. What the good ones carry:

- **WHAT THIS IS** — the question this file answers, in the owner's own words
  where there is a report behind it. Quote the report; a paraphrase loses the
  thing that made it a design problem.
- **What reading the code changed.** Almost always the most valuable paragraph
  in the file, because it is the part nobody can reconstruct later. "The app
  already disagrees with itself, in one gesture" is a finding; "we will improve
  drag and drop" is not.
- **A section map** — `§3 → ADR §5` — when the file and its ADR are both
  numbered, since both get cited by number and they rarely align.
- **What is interactive**, so a reader knows what to touch.
- **Any shipped defect this file found by being rendered**, and where the fix
  lands.

## 2. `<html lang="he" dir="rtl" data-theme="light">`

RTL is the app's real direction, and half the bidi traps only exist there.
`data-theme` starts at `light` and the toggle rewrites it.

## 3. Fonts

Assistant (UI), Secular One (headings), JetBrains Mono (code/numerals) from
Google Fonts, with the two `preconnect` links. The app loads the same families;
a mockup in the system font is measuring the wrong text.

## 4. The `APP-CSS:` manifest and its generated block

```html
<!-- APP-CSS: styles/tokens.css, App.css, screens.css, ui/domain/event-card.css -->
<style data-app-css>
  /* GENERATED — do not hand-edit. */
</style>
```

Paths are relative to `frontend/src/`, listed in the app's own import order
(`main.tsx` → `App.tsx` → per-component) because later rules win at equal
specificity. `node mockups/tools/inline-app-css.mjs <file>` fills the block; the
tool skips a file with no manifest and errors on a manifest with no block.

List the sheets a surface actually composes from, including any sheet a
*before* side needs — drawing one half of a before/after from hand-copied values
decides the comparison by accident.

## 5. Your own CSS, fenced and labelled

One block, clearly marked as the proposal, written in the app's naming so it
reads as the diff for the stylesheet it will move into:

```html
<style>
  /* ════ PROPOSED — moves into `screens.css` when ADR-XXXX is built.
     Named `.bld-seam*` and not `.seam*`: `.seam-tag` already means the
     overlap tag on a cluster member. ════ */
</style>
```

**The size of this block is a design signal.** It is the honest measure of what
you are asking the app to grow. If it is long, check it against
`frontend/CLAUDE.md` before going further — a long delta usually means an
existing primitive (`Modal`, `ListRow`, `RevealList`, `SettleControl`,
`SnapSheet`, `FormSteps`) went unused and the file is drawing a second copy of
it. Reusing one should show up here as a handful of lines, and in the prose as a
sentence naming it.

Anything you have to fake (a map canvas, a photo the sandbox cannot fetch,
a connector the Maps API draws in the app) gets its own labelled fence saying
so. A reader must be able to tell app-truth from file-fiction at a glance.

Occasionally you must **undo** a shipped rule for mockup reasons — e.g. the app
renders a node conditionally where the mockup keeps it mounted and toggles
`[hidden]`, which a shipped `:has()` cannot tell apart. Write that as a labelled
mockup-only override, never by quietly writing the shipped rule differently.

## 6. `mk-*` chrome

The page around the frames: header, controls bar, section cards, tags,
measurement table. Hand-written, ships nothing, prefixed so it can never be
mistaken for app CSS.

It needs its **own** variables plus a `:root[data-theme='dark']` block **after**
the light one — never extra keys inside the app's `:root`. Without that, a dark
frame is judged sitting on a white page, which is a ground the app never has.

## 7. The document header

An `<h1>` and one or two paragraphs of Hebrew prose: the decision in a sentence,
and a line telling the reader the measurements at the foot are read from this
page's rendered DOM in the currently selected theme and width — because that
sentence is what makes the numbers worth trusting.

## 8. The controls bar

Sticky, always visible, `aria-pressed` on the active button in each group:

- **theme** — בהיר / כהה
- **screen** — 360×640 / 390×844 (add wider stops only if the surface is
  tablet-relevant, e.g. Plan mode)
- **state** — one group per demo state the surface has (empty / crowded /
  archived, Trip vs Plan chrome, …)
- **feel numbers** — opacity, lift, threshold: anything a screenshot cannot
  settle. Default to your recommendation and say in the ADR that a device pass
  owns the final value.

Every control that can change geometry calls `measure()` after it fires.

## 9. Sections

One `<section class="case">` per numbered question, each with a heading, a note
paragraph stating the problem in the owner's terms, and the frames.

Frames are **built from data**. Write one row renderer and one screen renderer,
then have each section state only what differs. A hand-written "after" beside a
hand-written "before" drifts within the same afternoon.

Draw the **crowded** case, not the clean one: an event card already carrying a
transition verb and a zone pill, a title already at its line clamp, a shelf tile
at its real 140×76. A design that survives three items and dies at seventeen has
not been tested.

## 10. The measurement panel

A table whose every cell comes from `getBoundingClientRect()` on this page's own
boxes, recomputed on every control change. Each row: what was measured, the
number, and **what it is measured against** — the 44px touch floor, the row it
shares space with, the budget a previous ADR bought.

Off-frame probes are legitimate for comparing copy variants: render the variants
into a hidden absolutely-positioned container and measure there. Mind the
container — measuring cards inside a flex row makes `align-items: stretch`
report the tallest for all of them (one strip per case).

## 11. The notes panel

`what was chosen · what was rejected and why`. Each rejection one line, naming
the reason a future reader could not reconstruct: a constraint, an ADR that
already settled the adjacent case, a number that made it unaffordable. This is
the part that stops the same idea coming back.

## 12. The script

In order: the renderers, the data per section, the controls wiring, `measure()`.
The theme/width wiring is small enough to read at a glance:

```js
const press = (btns, on) => btns.forEach((b) => b.setAttribute('aria-pressed', String(b === on)));

themeBtns.forEach((b) =>
  b.addEventListener('click', () => {
    document.documentElement.setAttribute('data-theme', b.dataset.theme);
    press(themeBtns, b);
    measure();
  }),
);
```

Width is a CSS variable (`--fw`) that the frame reads, so one property change
reflows every frame on the page.

# 0202 — A note gets a full screen, its way in is the foot it already has, and Markdown arrives as a subset that emits structure

**Status:** Proposed — design only, nothing here is built
**Date:** 2026-08-22
**Design exploration:** [`mockups/note-full-screen-v1.html`](../../mockups/note-full-screen-v1.html) — the four candidate ways in drawn on **both** surfaces a note opens on, the screen itself across three note shapes, the whole subset rendered at once, the four link refusals, and one note on three surfaces. Interactive: theme · width · candidate · note · Markdown on/off, plus the two numbers that are feel calls (prose size, heading steps). Every number in its table is read off that page's own DOM, and the two that are not say so.
**Builds on:** [0153](0153-the-notes-surface-the-mark-and-no-mode-gate.md) §4 (a note opens **where it is**, and its foot carries where it belongs plus one verb) · §5b (a note's url is a link) · §8 (four entrances to one destination; the menu holds verbs, the row holds content), [0152](0152-a-note-is-one-entity-with-an-optional-host.md) §6/§6b (the body lives in the host's own surface; the composer's newlines are **content**), [0189](0189-the-editor-uses-the-idiom-the-app-already-had-and-a-task-is-read-where-it-sits.md) (`RowOpenFoot` is shared with tasks), [0101](0101-index-search-mode-and-header-titles.md) (`Modal variant="full"` is the app's full-screen primitive), [0103](0103-back-navigation-typed-layer-model.md)/[0090](0090-back-is-computed-from-nav-state.md) (one back per surface, computed), [0118](0118-numbers-in-hebrew-bidi.md) (isolate the run, never the container), [0028](0028-plan-violet-color-budget-dark-ready.md) (the colour budget), [0017](0017-mobile-first-device-targets.md) (phone-first, the 44px floor)
**Amends:** nothing yet — §1 adds a control to `RowOpenFoot`'s line and §7 fixes a defect in `lib/external-url.ts`; both are amendments to make **when this is built**, not now.

## Context

Owner ask, quoted, and the fourth message is the one that decides three of the sections:

> "Design a note full screen view mockup, that should include a way to get to the full screen. That's because currently clicking on a note expands the note in place. We should design the behavior and look of it and a way into this."

> "We should add a markdown formatted so that you could copy paste markdown. This should probably not include the entirety of the markdown format (unless there are libraries that give that for 'free' without too much code, in which case why not"

> "Links should probably be detected either way and formatted as links"

> "We should also take embedded notes into consideration (notes for bookings, places, events...)"

**"Clicking on a note expands the note in place" is not a defect to correct.** It is ADR-0153 §4's 2026-08-02 amendment, and it was measured against the sheet it replaced: +37px for a short note and +89px for a long one, against 151/199px for a sheet that also covered the list you were reading. So this ADR does **not** take the expansion back. The full screen is a **third container above it**, and because the tap on a row already means "expand", the way in has to be earned rather than inherited.

**And there are two expanded notes in this app, not one.** `notes.css` says so in its own comment: the notes **screen** clamps its rows to two lines, so opening lifts the clamp _and_ adds the foot; a host's **section** never clamped, so opening adds the foot alone. The owner's fourth message is therefore not an extra case to remember — it is the case that kills three of the four candidate ways in, because a `.note-item` has no `.wp-listrow-right` to put a mark in and `NoteSection` renders no `⋯` at all.

## Decision

### 1. The way in is one more control in the foot the open note already has

`RowOpenFoot` (ADR-0189, shared with tasks) grows a third element: `⌜⌟ מסך מלא`, marked with `Icon name="frame"`.

Three reasons, in the order that decides it:

- **It is the only shape that exists identically on both surfaces.** The foot is what both the screen's row and the host's section already put under an open note, and it is the only half of either that can hold a tap target at all — the meta line lives inside the row's own `<button>` and buttons do not nest (ADR-0139 §3, and it is why `.wp-listrow-right` is a sibling).
- **The glyph is not a new one.** `Icon name="frame"` already means "this opens full screen" in this app, once: `FilePicker`'s preview card wears it as corner brackets, because "there is no hover to discover it with (ADR-0017)". Inventing a second mark for the same meaning is the parallel copy rule 8 exists to stop.
- **It costs one line of CSS and no pixels.** The control lands in a line that already exists: measured at both widths, the foot is the same height with it and without it. Its box is 27px, not 44px, and that is correct — `row-open.css` supplies the floor as a 44px `::after` overlay around an 11.5px line (the `.map-rename` recipe), so the control inherits ADR-0017 by joining the family rather than by being big.

**The three rejected candidates, and each dies on a fact rather than a preference:**

- **A mark at the row's trailing edge** (`.wp-listrow-right`, beside the link mark). Works on the screen; on a host's section there is nowhere to put it — `.note-item` is a two-cell grid (`--sec-lead` and content) with no trailing slot. The way in would be built twice, in two mechanisms.
- **An action in the `⋯` menu.** `NoteSection` renders no menu, and a place's row has never had a kebab (ADR-0153 §8's 2026-08-02 amendment) — so on a host there is no menu to add it to. And where there is one, ADR-0153 §8 already drew the line: the menu holds **verbs**, the row holds **content**, and "read this" is not a verb you go looking for in a menu. It survives _inside_ the full screen (§3), which is a different question.
- **Corner brackets on the body, in `FilePicker`'s own grammar.** The glyph is right and the placement is not, for a structural reason: the body **is** a `<button>` on both surfaces (`.wp-listrow-open`, `.note-item-b`), so brackets inside it are a button inside a button — ADR-0160 §4's finding, which the mockup reproduces rather than quotes. Drawn as a real nested button, the render reports the inner control **hoisted out of** `.wp-listrow-open` by the parser.

**Always present, never conditional on length.** A control that appears only once a note has grown is a control whose position cannot be learned, and there is nothing to buy with its absence — it costs 0px.

**One thing the render added, and it is not decoration.** With two controls the foot never wrapped, so nothing in `row-open.css` had ever decided what gives way first. With three it must: under a real host name (`מוזיאון האמנות המודרנית של טוקיו`) at 360px the line goes from 27px to 51px in a browser with Assistant loaded. The verbs are what must not move — they sit at the trailing edge because that is where a thumb finds them — so the **name** truncates: `min-width: 0` on `.row-open-lead` and an ellipsis on a new `.row-open-lead-n` span inside it. It can afford to: the full screen one tap away prints the host in its bar, and the row's own meta line printed it before it opened. **The wrap point is webfont-dependent** — the render harness reads 38px for both and a plain Chromium reads 51px against 37px — which is exactly the caution ADR-0153 §6c recorded about host-name widths, and the reason the fix ships rather than the measurement being argued.

### 2. The screen is `Modal variant="full"`, and it is the same primitive the search overlay uses

Not a route, not a sixth `idx-screen`. A note is opened from five hosts and from the notes screen; four of those are view state inside screens that are not the Index. `Modal variant="full"` portals to `document.body` and registers through `useOverlay`, so it opens from any of them without any host learning about it, and back / Escape / the Android gesture all land in one place (ADR-0090/0103). Its bar measures **56px**, identical to `.search-overlay-bar` — the comparison is in the table, so "same tokens, same height" is a reading rather than a claim.

**`MediaViewer` was the tempting reuse and is refused.** It is the app's only other full-screen surface and ADR-0167 §10.2 chose to extend it once already. But what it brings is _bytes_: an object URL, a decode, ADR-0062's sole pinch exception, and a graceful fall back to "open in a tab". A note has no bytes. Reusing it would mean switching every one of those off, which is the opposite of extending it.

### 3. What the screen carries, and the one thing the foot does not

Top to bottom: the bar (back · `פתק` · the host as a `.chrome-chip` · `⋯`), the note's own title when it has one, **author · when**, the prose, the url line, and a pinned foot with the host way in and one visible `עריכה`.

- **The bar says `פתק`, never the note's words.** ADR-0153 §4's rule for the row, one surface up — and it has been paid for once already: the sheet this replaces printed the host in its head _and_ in a fact below it, which stuttered on every untitled hosted note.
- **Author · when belongs here and is refused in the foot.** `RowOpenFoot` leaves them out because they are two lines above it; on a full screen there is no row above, so the same rule produces the opposite answer.
- **The note's title is `--text-h3` in the BODY face**, not `--font-head`. Secular One is the app's chrome voice — design-language.md marks h1/h2/h3 as Secular One because every one of them is a screen or a card _the app wrote_. A reader's own words in the display face read as a heading **of** the app.
- **The `⋯` is `RowActionList`**, i.e. `NoteManageSheet`'s existing verbs: `עריכה`, `מעבר למה שהפתק שייך אליו`, the destructive `מחיקה` in its own partition — plus `העתקה כ-Markdown`, which is the one new verb and the one this ADR is least sure of (§8). One visible edit, delete on the `⋯`: `BookingDetail`'s grammar (ADR-0053), unchanged.

### 4. Markdown is a subset, and it is a subset that emits structure rather than an HTML string

The parser is ~147 lines, **2,911 bytes minified and 1,437 gzipped**. In the app it returns React nodes; the mockup builds strings because a static page has no React, and it escapes.

In: `#`/`##` headings, `-`/`*`/`+` lists, `1.`/`1)` ordered lists (the `start` preserved), `**bold**`, `*italic*`/`_italic_`, `` `code` ``, `> quote`, `---`, `[text](url)`.
Out, and left as plain text: tables, images, fenced code blocks, footnotes, reference links, raw HTML.

Four rules inside it that are decisions rather than parser trivia:

- **A single newline stays a break.** The one deliberate divergence from CommonMark, and the reason a library is not a drop-in: ADR-0152 §6b's 2026-08-07 amendment made the composer's newlines **content**, and CommonMark joins a soft break into the same paragraph. A correct renderer would therefore _silently rewrite every note that already exists_.
- **A heading inside a note is a section, not a screen title.** The note's `title` field is the only h1 it can have, so the subset spends **one** step by default and `###`+ falls back to body size rather than opening a fourth ramp on a 360px phone. The two-step variant is a control in the mockup, not a decision here.
- **A code span is monospace only when it has no Hebrew in it.** design-language.md reserves JetBrains Mono for Latin/numeric runs because the face has **no Hebrew glyphs**. A wifi password is exactly what a code span in a travel note is for, and `` `סיסמה` `` is exactly what would have broken the rule — so the parser decides per span and the CSS carries both. The render reads the two families back: `JetBrains Mono` against `Assistant`.
- **`- [ ]` renders as a plain bullet.** This app has real tasks (ADR-0196); a checkbox that cannot be ticked invites a tap that does nothing, and the real thing is one section away.

**The library was measured, not dismissed.** `react-markdown` is **117,575 bytes minified / 36,023 gzipped** across **81 packages** (esbuild with react external, then `gzip -9`). The bytes are arguable — `maplibre-gl` sits in this bundle already. What is not arguable is that it does not do the same thing: it needs `remark-breaks` for the rule above, a `components` override so links reach `externalHref`, and — because its output is an HTML string — a sanitizer, on the app's one group-visible free-text field. Three additions to arrive where 1.4 KB arrives, and the subset's version has **no injection surface at all**, which is a property rather than a mitigation.

### 5. Link detection is unconditional, and it is the existing pair of functions

A url or an email inside a note's prose becomes a link whether or not Markdown is on ("either way"). The href is `externalHref`'s and the label is `prettyUrl`'s — the two functions written for exactly this field, the first owning the allowlist that refuses `javascript:`, the second owning what a reader should see. A Latin run inside Hebrew prose is isolated per ADR-0118; the label wraps rather than ellipsising, because inside a paragraph there is nothing to truncate against.

**Detection requires a scheme, a `www.`, or a path slash.** Without that third condition `passport.pdf` — a thing travel notes genuinely say — becomes `https://passport.pdf`. A bare host with no path that someone _means_ as a link is what the note's url field is for. Deliberately not detected, and each is drawn in the mockup: a filename, a time or a price (`17:00`, `12.50`), and a phone number — the last because a travel note is full of digit runs and a wrong `tel:` is worse than none.

### 6. One note, three surfaces, and the axes are two facts already in the code

Not a taxonomy — two questions the CSS already answers per surface:

| surface                | clamps?      | body is a `<button>`?    | so                                      |
| ---------------------- | ------------ | ------------------------ | --------------------------------------- |
| the notes screen's row | yes, 2 lines | yes (`.wp-listrow-open`) | **flat text**, markers peeled, no links |
| a host's section       | never        | yes (`.note-item-b`)     | **shaped**, dense; a url is words       |
| the full screen        | never        | no (a plain div)         | **shaped**; a url is a link             |

- **A clamped surface gets its markers peeled.** `## מסעדות` inside a two-line preview is noise, and the words under it are what the reader is scanning for. Measured: the row is **99.4px either way** — the clamp fixes the height, so peeling costs and saves nothing. The flattened text also shortens its urls through `prettyUrl`, which the render forced: the raw string put `Google:` on one line and `/www.tabelog.com/tokyo/A1303` on the next, which is the owner's own 2026-08-02 complaint arriving on a different surface.
- **A body that is a button cannot hold a link, so it does not pretend to.** ADR-0153 §8 already refused a second tap target inside a row's one open target ("at ~16px … a mistap, not an affordance"), which is why §5b put the note's url in the **foot**. A url found in prose gets the same answer: no `--cta`, no underline, nothing promising a tap that cannot happen. Which gives the full screen a second reason to exist beyond room — **it is the only surface where a note's links are live.**
- **And shaping a note on a host makes the section shorter, not longer**: 312.5px against 319.7px, because a real bullet saves the character and space that were wrapping a line and a heading saves the blank line that separated two blocks. Recorded because the opposite was assumed while drawing it.

### 7. A shipped defect this exposed, and the fix belongs in `external-url.ts`

`externalHref` allows `mailto:` and nothing ever supplies it, so a scheme-less address takes the `https://` branch and the `@` is parsed as HTTP **userinfo**:

```
externalHref('tokyo-stay@example.com')
  → 'https://tokyo-stay@example.com/'      host=example.com  user=tokyo-stay
```

The note's url field is free text, so this is reachable today with none of this ADR: a typed email becomes a link to the wrong place with the address handed over as credentials, and `prettyUrl` then labels it `example.com` — so the address the author typed is not even on screen. One line, in the one function, and both the field and §5 get it right.

### 8. What this ADR does not decide

- **`העתקה כ-Markdown`.** Drawn in the `⋯` because it costs one row in a sheet that exists, and flagged because "the verb was cheap" is not a reason to ship one. The ask reads primarily as _paste in_, which §4 answers; copy out is the reverse trip and nobody has asked for it.
- **Two numbers that a desktop screenshot cannot settle**, both controls in the mockup: the prose size (14.5 vs 15.5) and whether the subset spends one heading step or two.
- **A live preview in the editor** is refused rather than deferred: the form is a `Modal` on a phone, and ADR-0155 measures `BookingSheet` at ~1565px against ~675px of visible screen. Half a screen of preview there buys a guess and sells the text being written.
- **Nothing about the composer or the editor changes.** A plain textarea is already a Markdown editor for the purpose of pasting Markdown into it.

## Consequences

- **`Modal`, `RowOpenFoot`, `RowActionList`, `Icon` and `.chrome-*` all gain a consumer and nothing gains a variant.** The net-new CSS is the full screen's shell (five rules), the prose (one class at two densities), and two declarations for the truncating lead.
- **`lib/note-markdown.ts` is a new file and the app's first content renderer.** It is also the first place the app parses stored text into structure, which is why §4 insists the output is nodes: the safety is then structural rather than a dependency.
- **The prose renderer has three call sites from day one** (the row's flattener, the host section, the full screen), so §6's table is a prop rather than three behaviours.
- **`lib/external-url.ts` changes for a defect that predates this work** (§7), and its unit test gains the email case.
- **New `he.ts` copy** for the way in, the screen's bar, and the copy verb.
- **A backlog line and a catalog entry** land with the mockup; the two harness pitfalls the render exposed are written into `.claude/skills/design-mockups/references/pitfalls.md` rather than into this ADR, because they are about drawing and not about notes.

## Alternatives considered

- **Replace the in-place expansion with the full screen.** The literal reading of the ask, and it undoes a measured decision from three weeks ago: the expansion keeps the list you were reading, a full screen covers it. The right shape is a third container, not a substitution.
- **Show the way in only on a note that overflows.** Rejected in §1: a control whose position depends on the length of the text cannot be learned, and it costs nothing to keep.
- **Render Markdown only on the full screen.** Would leave a structured note on a booking reading as `## מסעדות` on the surface where a note is actually read (ADR-0152 §6's 2026-08-16 amendment made that surface show the body at all). §6 splits on clamping instead, which is a fact rather than a preference.
- **Patch the flattening into `.note-body-line` with CSS.** There is no CSS that removes a `##`. The peel is a text transform or it does not happen.
- **A tables-and-images subset.** A Markdown table is the one thing in the format that cannot be narrowed to 360px, and its raw text is more readable than a clipped table. A remote image is a cross-origin request from every group member's phone, and documents are their own entity with encryption and a lifecycle (ADR-0173).

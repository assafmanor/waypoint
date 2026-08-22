# 0202 — A note gets a full screen, its way in is the foot it already has, and Markdown arrives as a subset that emits structure

**Status:** Accepted — **built 2026-08-22**, same day, with five amendments the build forced (§3, §4, §5, §6, §7b) and seven more from two rounds of looking at it on a phone (§9, §10)
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

**Amended in the build (2026-08-22) — the screen has NO `⋯`, and no host chip either. Both are subtractions, and both come from applying a rule this ADR was already citing.**

- **No menu.** ADR-0053's grammar is _one visible edit, delete on the row's kebab_ — the row's, not the read surface's, which is why `BookingDetail` has no menu of its own. Writing the menu out made it obvious that two of its three items (`עריכה`, the host way in) are already on screen in the foot, which leaves a menu whose only unique item is the destructive one. That is a worse home for a delete than the row's kebab, not a better one.
- **No host chip in the bar.** The foot's lead already names the host _and_ is the way to it, and ADR-0153 §4's amendment settled this exact question one surface down: when a note opens, `.wp-listrow.is-open .note-host` **hides** the row's chip, because the foot below carries the same fact. A chip in the bar is that stutter again with a whole screen between the two copies. So the bar is back + `פתק`, which is `IndexBackRow`'s shape.
- **And the consequence, which is the interesting half:** with no chip, the foot is the only place the host appears at all — so the full screen names it _even when it cannot be reached_, and even when the surface behind it IS that host. That is the opposite call from the row's foot (§7b), and it comes from the same rule: say a fact once, on the surface that is missing it.

### 4. Markdown is a subset, and it is a subset that emits structure rather than an HTML string

The parser is ~147 lines, **2,911 bytes minified and 1,437 gzipped**. In the app it returns React nodes; the mockup builds strings because a static page has no React, and it escapes.

In: `#`/`##` headings, `-`/`*`/`+` lists, `1.`/`1)` ordered lists (the `start` preserved), `**bold**`, `*italic*`/`_italic_`, `` `code` ``, `> quote`, `---`, `[text](url)`.
Out, and left as plain text: tables, images, fenced code blocks, footnotes, reference links, raw HTML.

Four rules inside it that are decisions rather than parser trivia:

- **A single newline stays a break.** The one deliberate divergence from CommonMark, and the reason a library is not a drop-in: ADR-0152 §6b's 2026-08-07 amendment made the composer's newlines **content**, and CommonMark joins a soft break into the same paragraph. A correct renderer would therefore _silently rewrite every note that already exists_.
- **A heading inside a note is a section, not a screen title.** The note's `title` field is the only h1 it can have, so the subset spends **one** step by default and `###`+ falls back to body size rather than opening a fourth ramp on a 360px phone. The two-step variant is a control in the mockup, not a decision here.

  **Amended in the build: `#` and `##` are the SAME level.** The first implementation gave the step to `#` alone and folded `##` into body size, which inverts the point — `##` is the level people actually paste, so the common case came out flat and the rare one got the emphasis. `#`/`##` take the one step; `###` and deeper are bold at body size.

- **A code span is monospace only when it has no Hebrew in it.** design-language.md reserves JetBrains Mono for Latin/numeric runs because the face has **no Hebrew glyphs**. A wifi password is exactly what a code span in a travel note is for, and `` `סיסמה` `` is exactly what would have broken the rule — so the parser decides per span and the CSS carries both. The render reads the two families back: `JetBrains Mono` against `Assistant`.
- **`- [ ]` renders as a plain bullet.** This app has real tasks (ADR-0196); a checkbox that cannot be ticked invites a tap that does nothing, and the real thing is one section away.

**The library was measured, not dismissed.** `react-markdown` is **117,575 bytes minified / 36,023 gzipped** across **81 packages** (esbuild with react external, then `gzip -9`). The bytes are arguable — `maplibre-gl` sits in this bundle already. What is not arguable is that it does not do the same thing: it needs `remark-breaks` for the rule above, a `components` override so links reach `externalHref`, and — because its output is an HTML string — a sanitizer, on the app's one group-visible free-text field. Three additions to arrive where 1.4 KB arrives, and the subset's version has **no injection surface at all**, which is a property rather than a mitigation.

### 5. Link detection is unconditional, and it is the existing pair of functions

A url or an email inside a note's prose becomes a link whether or not Markdown is on ("either way"). The href is `externalHref`'s and the label is `prettyUrl`'s — the two functions written for exactly this field, the first owning the allowlist that refuses `javascript:`, the second owning what a reader should see. A Latin run inside Hebrew prose is isolated per ADR-0118; the label wraps rather than ellipsising, because inside a paragraph there is nothing to truncate against.

**The control's words are the app's own.** The mockup drew `מסך מלא`; the build ships **`תצוגה מלאה`**, because `FilePicker` already names this exact action `תצוגה מלאה: {name}` when it opens `MediaViewer`. One meaning with two nouns is how a vocabulary drifts (ADR-0138's recurring finding), and the ~22px it costs on an 11.5px line is what §1's truncation rule absorbs.

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

**Amended in the build — how a break is CARRIED changed, and it is an improvement rather than a detail.** The host section's newlines used to come from `white-space: pre-wrap` on `.note-item-b`; they now come from a `<br />` per authored line, because the parser already has the lines separate. Three consequences worth writing down:

- **A blank line and a single newline are finally different things.** `pre-wrap` rendered both as whitespace; the renderer makes the first a new `<p>` and the second a `<br />`.
- **The guarantee got stronger.** `notes.contract.test.ts` exists because jsdom has no CSS engine, so the newline rule could only be checked by reading the stylesheet as text. A `<br />` is in the DOM, so `HostNotes.test.tsx` asserts it directly. `.note-body-line`'s `pre-wrap` still matters and is still guarded — the notes screen's row renders a _flattened string_ whose newlines are real characters.
- **`.note-prose` declares `white-space: normal`.** `white-space` inherits, and one of the prose's two hosts declares `pre-wrap` for its own text node — inherited, that would preserve every run of spaces inside a pasted paragraph _on top of_ the breaks the renderer emits. Asserted in the contract test.

### 7. A shipped defect this exposed, and the fix belongs in `external-url.ts`

`externalHref` allows `mailto:` and nothing ever supplies it, so a scheme-less address takes the `https://` branch and the `@` is parsed as HTTP **userinfo**:

```
externalHref('tokyo-stay@example.com')
  → 'https://tokyo-stay@example.com/'      host=example.com  user=tokyo-stay
```

The note's url field is free text, so this is reachable today with none of this ADR: a typed email becomes a link to the wrong place with the address handed over as credentials, and `prettyUrl` then labels it `example.com` — so the address the author typed is not even on screen. One line, in the one function, and both the field and §5 get it right.

### 7b. A second shipped defect, found by adding the control: a hosted note was labelled "general" on its own host's surface

`NoteOpenFoot`'s lead read `host ? host.name : t.notes.open.general`, and `NoteSection` passes no host **because the surface IS the host**. So the two absences collapsed: "this note has no host" and "you are standing on its host" produced the same lead, and every hosted note on a booking, a document, an idea or a place had `פתק כללי` printed under it when opened.

Invisible to the tests for a structural reason worth noting: the lead was asserted on the notes **screen**, which does pass a host, so every assertion was about the case that worked.

The fix is a third state rather than a better string — `onHostSurface` makes the lead **absent**, which is `RowOpenFoot`'s own documented case ("a task has no lead at all … the foot has nothing left to say and says nothing rather than saying it twice"). The full screen answers the same question the other way (§3), because there the host appears nowhere else.

### 8. What this ADR does not decide

- **`העתקה כ-Markdown`.** Drawn in the `⋯` because it costs one row in a sheet that exists, and flagged because "the verb was cheap" is not a reason to ship one. The ask reads primarily as _paste in_, which §4 answers; copy out is the reverse trip and nobody has asked for it. **Not built** — and the menu it was drawn in is gone too (§3), so it now needs a home as well as a decision.
- **Two numbers that a desktop screenshot cannot settle**, both controls in the mockup: the prose size (14.5 vs 15.5) and whether the subset spends one heading step or two.
- **A live preview in the editor** is refused rather than deferred: the form is a `Modal` on a phone, and ADR-0155 measures `BookingSheet` at ~1565px against ~675px of visible screen. Half a screen of preview there buys a guess and sells the text being written.
- **Nothing about the composer or the editor changes.** A plain textarea is already a Markdown editor for the purpose of pasting Markdown into it.

### 9. Four reports from the first look at it on a phone (2026-08-22, after the merge)

**9a — `dir="auto"` laid a Hebrew note out left to right, and this is the worst kind of bug in this app.** The reported note opens `TL;DR — מה לעשות כדי להטיס DJI Mini 5 Pro כחוק באיסלנד`: 26 Hebrew letters against 14 Latin, and `auto` resolves from the **first strong character**, which is the `T`. So every Hebrew line in the note read from the wrong end. The tell in the screenshot is that the note's **title** was fine — it happened to start with a Hebrew word.

Three things worth recording, because each one is a trap and not a slip:

- **`dir="auto"` was the wrong tool, not a wrong value.** ADR-0118 and `frontend/CLAUDE.md` both say `auto` resolves from the first strong character; they say it about a **single value** — an address, a place name — where one field is one run and the first character is exactly the right signal. A block of mixed prose is the case that rule was never about, and nothing in the app had needed one before.
- **Omitting `dir` entirely would have been better than `auto`.** The notes screen's row carries no `dir` and has always read correctly, because it inherits the page's RTL. So the attribute I added to be careful is what broke it — the careful-looking version was worse than nothing.
- **The fix is a derivation, `lib/bidi.ts`'s `baseDirection`**: count the Hebrew letters against the Latin ones and let the larger side decide, ties to RTL (the app is Hebrew-first). Letters only — digits and punctuation are bidi-neutral, so counting them would let a price list decide a note's direction. `undefined` for a text with no letters at all, which renders no attribute and inherits the page, i.e. the row's behaviour.

**9b — the full screen read too small.** `--text-body` is 14.5px, sized for app chrome: a row, a fact, a meta line, where the job is fitting several facts on a phone line. A note on its own screen has the opposite job — one long text, nothing beside it, a reader reading rather than scanning. The ramp gains **`--text-reading: 16px`** (`tokens.css` + design-language.md), spent by `.note-full-body` alone; the row and the host section were never the complaint and are unchanged. A step in the ramp rather than a local number, so the next reading surface takes the same size instead of picking its own.

**9c — the way in was only reachable through the thing it exists to relieve.** The control lives in the open foot, so on a long note you tapped to expand, scrolled past the whole body, and only then reached it. §1's "it costs 0px" was true and beside the point: the cost was never pixels, it was **distance**.

**9d — a hold opens the full screen** (owner's suggestion, and it answers 9c). `lib/useHoldToOpen.ts`, on both row bodies, from a collapsed row or an open one.

- **It is a shortcut and not the way.** ADR-0157 §2 admitted a gesture-only menu on the Map pin and paid for it with a keyboard-reachable twin; here the twin already exists — the foot's `תצוגה מלאה` — so the hold adds a fast path without becoming the only one. It is not discoverable and is not asked to be.
- **Reuses the two hard parts rather than restating them**: `useSelectionGuard`, because `user-select: none` does not stop a long press from _asking_ the platform to select, and `armClickSwallow`, because a hold fires with the finger still down so the release's click would otherwise toggle the row as well. Both were already exported separately from `useHoldToDrag`, which is what made this a small addition instead of a refactor of a shipped gesture (rule 8 — generalising that hook is the right move if a third holdable thing appears, and it is not this change's to take).
- **Rejected: a fourth mark in the row's trailing slot.** It is discoverable, one tap, and it only helps the notes screen — a host's section renders a long note in full, so its foot is just as far down. The friction is on both surfaces and a screen-only control answers half of it, in a slot that already holds a link mark, a sync badge and the `⋯` at 360px.
- **Rejected: bounding the expansion and pinning the foot inside it** (the Map place card's grammar, ADR-0148 §1). It would fix the distance visibly and put a vertical scroller inside a vertically scrolling list, which is the touch problem that grammar has never had to have.

Two things the gesture's own tests found, both of which would have shipped silently:

- **`Math.abs(undefined - 10)` is `NaN`, and `NaN > slop` is `false`** — so a pointer event arriving without coordinates disables the scroll guard entirely and the hold fires mid-scroll. Coalesced to 0 at the one place both handlers read a position.
- **jsdom implements no `PointerEvent`.** A synthetic `pointermove` comes out as a plain `Event` with no coordinates at all, so the slop check cannot be exercised through `fireEvent` — a real `MouseEvent` named `pointermove` carries them and React routes it to `onPointerMove` all the same. The primary-pointer guard is written as "not explicitly secondary" for the same reason: `isPrimary === true` refuses every event in the unit suite while passing in a browser, which is the worst way round for a gesture to be wrong.

### 10. A second round on the phone, and one of the first round's fixes had never applied (2026-08-22)

**10a — the reading size was never reaching the screen, and this is the second time a change of mine typechecked, passed, and did nothing.** `.note-prose` declared `--np-base: var(--text-body)` **on itself**, and a custom property declared on an element shadows the inherited one — so `.note-full-body`'s `--np-base: var(--text-reading)` never arrived and §9b's fix was inert from the moment it shipped. The default belongs in the `var()` **fallback**, where a host that states nothing gets it and a host that states something wins.

Worth putting beside §9a, because the two are the same failure wearing different clothes: a careful-looking declaration that changes no pixel, invisible to typecheck and to every jsdom test. jsdom has no cascade — `getComputedStyle` there resolves no `var()` and no inheritance — so this class of bug **cannot** be caught by a render test in this suite. It is caught by reading the stylesheet as text, which is what `notes.contract.test.ts` exists for, and it now asserts all three halves: that `.note-prose` does not declare `--np-base`, that the default sits in the fallback, and that the full screen asks for reading size.

**10b — the leading was chrome leading, and equal gaps hid the structure.** Two separate faults reported as one ("see how clumped up this is"): line-height 1.65 is a row's leading rather than a document's, and every block sat the same distance from every other — so a section heading read as one more line and nothing grouped. Now `1.75` between lines, and the rule that does the actual work is asymmetric: **a heading pulls away from what precedes it (`--space-6`) and stays with what follows (`--space-2`)**, with a heading directly under another heading taking the tight gap because two headings in a row are one group. No new tokens, and the heading size now steps up from the prose's own base rather than the app's ramp — the base moves per host, so a fixed `--text-h3` would be a heading on one surface and body text on the other.

**10c — a note past a threshold does not expand at all; the tap opens the screen** (owner's proposal). The expansion's justification was measured on notes where lifting a two-line clamp adds a little — ADR-0153 §4's +37px and +89px. It was never measured on a note that is a **document**, and there expanding produces a screen-height wall inside a list row: you lose your place, every other row is pushed off, and the verbs end up at the bottom of it.

- **The cost, stated plainly:** one gesture now means two things, and the boundary between them is invisible. That is a real price and the reason §1 did not propose this. What buys it is that the failure it removes is worse and was reported, while the boundary case — a note just over the line opening a screen instead of expanding — is a surprise rather than a wall.
- **Estimated, not measured**, because measuring the rendered height would mean rendering the thing before deciding whether to. `noteReadsFullScreen` counts what the row WOULD show (the flattened text) and wraps it at `NOTE_ROW_CHARS_PER_LINE` (42, `.note-body-line` at the 360px design width) against `NOTE_INLINE_MAX_LINES` (8, the point where the expansion takes about half the visible list).
- **Counting characters was the first version and it is wrong in a way that matters:** twelve short lines is twelve lines tall and barely 150 characters, so a character threshold let exactly the wall this prevents through. It counts lines, and there is a test named for that case.
- **Both surfaces, so one gesture does not mean two different things on two of them.** On a host's section the note was already rendered in full — that surface has never clamped — so what the screen adds there is a place to read it that is not inside a card.
- **Both numbers want a device pass**: they decide which of two containers a tap opens, and nothing on screen says which side of the line a note is on.

**Left open by 10c, and not built:** whether a host's section should now CLAMP a long note, the way the notes screen's row does. It renders one in full today, which is the wall in a different room — and it is a bigger change than this one, since that surface's whole grammar is "the note is already whole here" (ADR-0153 §4).

## Consequences

- **`Modal`, `RowOpenFoot`, `RowActionList`, `Icon` and `.chrome-*` all gain a consumer and nothing gains a variant.** The net-new CSS is the full screen's shell (five rules), the prose (one class at two densities), and two declarations for the truncating lead.
- **`lib/note-markdown.ts` is a new file and the app's first content renderer.** It is also the first place the app parses stored text into structure, which is why §4 insists the output is nodes: the safety is then structural rather than a dependency.
- **The prose renderer has three call sites from day one** (the row's flattener, the host section, the full screen), so §6's table is a prop rather than three behaviours.
- **`lib/external-url.ts` changes for a defect that predates this work** (§7), and its unit test gains the email case.
- **New `he.ts` copy** for the way in, the screen's bar, and the copy verb.
- **A backlog line and a catalog entry** land with the mockup; the two harness pitfalls the render exposed are written into `.claude/skills/design-mockups/references/pitfalls.md` rather than into this ADR, because they are about drawing and not about notes.

**Built 2026-08-22 (same day).** `lib/note-markdown.ts` (+ spec), `ui/NoteProse.tsx` (+ spec), `ui/NoteFullScreen.tsx` (+ spec), `RowOpenFoot`'s `viewLabel`/`onView` and `row-open.css`'s truncation pair, `NoteOpenFoot`'s `onView`/`onHostSurface`, `NoteSection`'s `onOpenFull` plus its shaped body, both entrances wired (`IndexNotesView`, `HostNotes`), `lib/external-url.ts`'s `mailto:` fix, and `t.notes.open.full` / `t.notes.full.backAria`. **4,246 frontend tests green**, typecheck and build clean.

Three build notes that are decisions rather than mechanics:

- **The parser uses no lookbehind.** `(?<!\s)` is the natural way to write "no space before the closing marker" and it is unsupported below iOS Safari 16.4 — on a phone-first installed PWA that is a module which throws at import time on a real device. Every rule is written with `\S`-anchored groups instead.
- **Emphasis opens after a Hebrew prefix hyphen**, not only after whitespace. `ו-*נטוי*` is how Hebrew attaches a prefix, so the obvious "must follow a space" rule means emphasis silently never works in Hebrew prose — which the first two drafts each did, once per marker, and which no English fixture would have caught. The condition is "not straight after a word character", and the class has to exclude Hebrew letters too, or `שלום_עולם_` becomes emphasis.
- **`NoteFullScreen` reads `useMode` rather than taking it as a prop**, and the prop version was written first: passing it means `HostNotes` reads the mode, and `HostNotes` is rendered by all five hosts — which turned **169 tests in six unrelated specs** into "useMode must be used within ModeProvider". The read belongs where the tint is used, because this component mounts only when a note is opened.

## Alternatives considered

- **Replace the in-place expansion with the full screen.** The literal reading of the ask, and it undoes a measured decision from three weeks ago: the expansion keeps the list you were reading, a full screen covers it. The right shape is a third container, not a substitution.
- **Show the way in only on a note that overflows.** Rejected in §1: a control whose position depends on the length of the text cannot be learned, and it costs nothing to keep.
- **Render Markdown only on the full screen.** Would leave a structured note on a booking reading as `## מסעדות` on the surface where a note is actually read (ADR-0152 §6's 2026-08-16 amendment made that surface show the body at all). §6 splits on clamping instead, which is a fact rather than a preference.
- **Patch the flattening into `.note-body-line` with CSS.** There is no CSS that removes a `##`. The peel is a text transform or it does not happen.
- **A tables-and-images subset.** A Markdown table is the one thing in the format that cannot be narrowed to 360px, and its raw text is more readable than a clipped table. A remote image is a cross-origin request from every group member's phone, and documents are their own entity with encryption and a lifecycle (ADR-0173).

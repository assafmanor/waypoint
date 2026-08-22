# A note gets a full screen — design session (2026-08-22)

**Deliverable:** [`mockups/note-full-screen-v1.html`](../../mockups/note-full-screen-v1.html) → [ADR-0202](../decisions/0202-a-note-gets-a-full-screen-and-markdown-is-a-subset.md) (Proposed). Design only; nothing built.

## The ask, and the order it actually resolves in

Four messages from the owner:

1. a full-screen view for a note, **including a way to get to it**, "because currently clicking on a note expands the note in place";
2. Markdown, so pasted Markdown renders — "probably not the entirety of the format (unless there are libraries that give that for 'free'…)";
3. links detected "either way";
4. "we should also take embedded notes into consideration (notes for bookings, places, events...)".

The fourth arrived last and answers the first. Every candidate way in looked fine on the notes screen; only two of the four exist at all on a host's section, and that is the whole of §1.

## What reading the code changed, before anything was drawn

- **The expansion is not a defect.** ADR-0153 §4's 2026-08-02 amendment replaced a sheet with an in-place expansion and `note-preview-v2.html` measured it: +37px short, +89px long, against 151/199px for a sheet that also covered the list. So the answer is a **third container**, and the row's tap being spoken for is a constraint rather than a thing to fix.
- **There are two expanded notes, missing different things.** `notes.css` says it in its own comment: the screen's rows clamp to two lines (opening lifts the clamp _and_ adds the foot); a host's section never clamped (opening adds the foot alone).
- **The glyph already exists.** `Icon name="frame"` means "opens full screen" in `FilePicker`, chosen there because "there is no hover to discover it with".
- **A CommonMark-correct renderer would rewrite existing notes.** ADR-0152 §6b (2026-08-07) made the composer's newlines content; CommonMark joins a soft newline into its paragraph. This is the fact that decided §4, not the byte count.

## The forks, and what was decided

**The way in.** Four candidates, drawn on both surfaces. Three die on facts: `.note-item` is a two-cell grid with no trailing slot; `NoteSection` renders no `⋯` and a place row never had one; and the body **is** a `<button>` on both surfaces, so brackets inside it are ADR-0160 §4's nested button — drawn as a real one, and the render reports the inner control hoisted out. What survives is a third `.row-open-act` in `RowOpenFoot`, at 0px.

**Always present, not conditional on length.** A control whose position depends on how long the text is cannot be learned, and there is nothing to buy: it costs no pixels.

**The container.** `Modal variant="full"`, not a route and not a sixth `idx-screen` — a note opens from five hosts, four of which are view state in screens that are not the Index. `MediaViewer` was the tempting reuse and is refused in writing: what it brings is bytes.

**Markdown as a subset that emits structure.** ~147 lines / 1,437 bytes gzipped, returning React nodes. `react-markdown` was measured rather than dismissed — 117,575 / 36,023 bytes across 81 packages — and rejected because it needs `remark-breaks`, a link-renderer override and a sanitizer to arrive at the same place, and because its output is an HTML string on the app's one group-visible free-text field.

**Three surfaces, two axes, both already facts in the CSS**: _does it clamp_ (flat vs shaped) and _is the body a `<button>`_ (whether a url can be a link). The second one is the discovery — it gives the full screen a second reason to exist beyond room, since it is the only surface where a note's links are live.

## What the render corrected — four things, and two were this file's own numbers

1. **A shipped defect in `lib/external-url.ts`.** `mailto:` is in the allowlist and nothing ever supplies it, so a scheme-less address takes the `https://` branch and the `@` becomes HTTP userinfo: `externalHref('tokyo-stay@example.com')` → `https://tokyo-stay@example.com/`, host `example.com`, user `tokyo-stay` — and `prettyUrl` labels it `example.com`, so the typed address is not on screen at all. Reachable today: the url field is free text and its placeholder is `instagram.com/p/`. The fix is one line in the one function, so both the field and the new prose get it.
2. **The flattened preview needed `prettyUrl` too.** Raw, the row put `Google:` on one line and `/www.tabelog.com/tokyo/A1303` on the next — the owner's own 2026-08-02 complaint arriving on a different surface.
3. **The foot wraps under a real host name** once a third control joins it: 51px against 27px, in a browser with Assistant loaded. The verbs hold the trailing edge, so the name truncates (`min-width: 0` plus one span). **And the wrap point is webfont-dependent** — the render harness reads 38px for both — which is ADR-0153 §6c's recorded caution, so the file states both readings instead of quoting the convenient one.
4. **Shaping a note on a host makes the section shorter, not longer** (312.5 vs 319.7px): a real bullet saves the character and space that were wrapping a line, and a heading saves the blank line between blocks. The opposite was assumed while drawing it.

## Two things about the harness, not about notes

Both are in [`.claude/skills/design-mockups/references/pitfalls.md`](../../.claude/skills/design-mockups/references/pitfalls.md) rather than in the ADR:

- **`tokens.css` has declared `html, body { overflow: clip }` since 2026-08-21** (ADR-0200 §1). Every mockup inlines that sheet, and a mockup is a document of sections: the page collapses to one viewport, `window.scrollTo` does nothing, and a full-page screenshot comes back with §1 and then blank rectangles where §2–§5 are laid out and never painted. Nothing errors and the measurement table still fills in, which is why it took a screenshot to notice. `a-day-turns-under-a-held-card-v1.html` (also 2026-08-22) inlines the rule and carries no undo — left alone rather than retrofitted, and flagged in the backlog.
- **`document.fonts.ready` is not enough.** An `@font-face` is fetched lazily on first use, so at parse time there may be nothing pending and `ready` resolves immediately. That is what made this file's own table report the truncation fix as costing **nothing** — and note the shape of the lie: the number that was wrong was the one saying _the change makes no difference_.

## Left open, deliberately

- Whether `העתקה כ-Markdown` earns its row in the `⋯`. It costs one row in a sheet that exists, which is not a reason. The ask reads as _paste in_; copy out is the reverse trip and nobody asked for it.
- The prose size (14.5 vs 15.5) and one heading step or two — controls in the mockup, not decisions in the ADR, because neither settles on a desktop screenshot.
- A live preview in the editor is **refused** rather than deferred (ADR-0155 measures `BookingSheet` at ~1565px against ~675px of visible phone).

---

## Built the same day — what the code changed about the design

The mockup was promoted and built in the same session. Five things moved, and each one is an in-place amendment to [ADR-0202](../decisions/0202-a-note-gets-a-full-screen-and-markdown-is-a-subset.md) rather than drift left in a file nobody re-reads.

**Two subtractions from the drawn screen, both from rules the ADR was already citing.** Writing the `⋯` out made it obvious that two of its three items were already on screen in the foot, leaving a menu whose only unique item is the destructive one — a worse home for a delete than the row's kebab, which is where ADR-0053 puts it. And the bar's host chip is the stutter ADR-0153 §4 had already removed from the row (`.wp-listrow.is-open .note-host` hides the chip because the foot names the host), with a whole screen between the two copies instead of six pixels. The interesting consequence is the third state that falls out: with no chip, the foot is the only place the host appears, so the full screen names it **even when it cannot be reached** — the opposite of the row's foot, from the same rule.

**`#` and `##` are one level.** The first implementation gave the step to `#` and folded `##` into body size, which inverts the point: `##` is the level people paste, so the common case came out flat.

**The label is the app's own.** `תצוגה מלאה`, not the `מסך מלא` the mockup drew, because `FilePicker` already names this exact action that way. It costs ~22px more on an 11.5px line, which is precisely what §1's truncation rule exists to absorb.

**A break is now a `<br />` rather than `pre-wrap`.** The parser already has the lines separate, so the renderer emits them. Three things follow: a blank line and a single newline are finally different (a new `<p>` versus a `<br />`); the guarantee moves out of CSS text — which is the only reason `notes.contract.test.ts` exists — and into the DOM where a test can see it; and `.note-prose` has to declare `white-space: normal`, because `white-space` inherits and one of its two hosts declares `pre-wrap` for its own text node.

**And a second shipped defect, found by touching the component.** `NoteOpenFoot`'s lead collapsed two different absences into one: "this note has no host" and "you are standing on its host" both produced `פתק כללי`, so every hosted note on a booking, a document, an idea or a place was labelled a general note when opened. Invisible to the suite for a structural reason — the lead was only ever asserted on the notes screen, which does pass a host, so every assertion was about the case that worked.

## Three build findings worth carrying forward

- **No lookbehind in a regex that ships to a phone.** `(?<!\s)` is the natural way to write "no space before the closing marker" and is unsupported below iOS Safari 16.4 — a module that throws at import time on a real device, and one that no CI run here would catch.
- **Emphasis has to open after a Hebrew prefix hyphen.** `ו-*נטוי*` is how Hebrew attaches a prefix, so the obvious "must follow whitespace" rule means emphasis silently never works in Hebrew prose. **The first two drafts each got this wrong, once per marker**, and no English fixture would have shown it — which is why there is now a test named for it. The condition is "not straight after a word character", and the class must exclude Hebrew letters too or `שלום_עולם_` becomes emphasis.
- **Where a context is read is a testability decision.** `NoteFullScreen` takes the mode tint by reading `useMode`, and the prop version was written first: passing it meant `HostNotes` had to read it, and `HostNotes` is rendered by all five hosts — 169 tests in six unrelated specs turned into "useMode must be used within ModeProvider". The read belongs where the tint is used, because that component mounts only when a note is opened.

## Not built, deliberately

`העתקה כ-Markdown` — the one verb this session invented rather than the owner asking for it. The ask reads as _paste in_, which the parser answers; copy out is the reverse trip. It also lost the menu it was drawn in, so it now needs a home as well as a decision.

## Owed

A device pass. Nothing here has been seen on a phone (ADR-0017): whether the foot's three controls read as three under a thumb, whether `--text-body` is the right size for a long note, and whether the truncated host name reads as truncated rather than as a shorter name.

---

## After the merge — four reports from the first look at it on a phone

Same day, screenshot attached to the report. All four are in [ADR-0202 §9](../decisions/0202-a-note-gets-a-full-screen-and-markdown-is-a-subset.md).

**The one that matters: a Hebrew note read left to right.** `dir="auto"` on the prose container resolves from the first strong character, and the reported note opens `TL;DR` — so 26 Hebrew letters were laid out as if they were English because of one `T`. Three things about it are worth more than the fix:

- The rule I followed says exactly this, and says it about a **single value** (an address, a place name), where one field is one run and the first character is the right signal. A block of mixed prose is the case ADR-0118 was never about, and nothing in the app had needed one before.
- **Omitting `dir` would have been better than `auto`.** The notes screen's row carries none and has always read correctly, because it inherits the page's RTL. The attribute I added to be careful is what broke it.
- The tell was in the screenshot and not in the code: the **title** was fine. It happened to start with a Hebrew word.

The fix is `baseDirection` in `lib/bidi.ts` — count the letters, larger side wins, ties to RTL, `undefined` when there are no letters so the element inherits the page.

**Too small**: the ramp gains `--text-reading: 16px`, spent by the full screen alone. `--text-body` is sized for chrome — several facts on a phone line — and a document has the opposite job.

**The way in was only reachable through the thing it relieves**: tap to expand, scroll past the whole note, then the control. §1's "it costs 0px" was true and beside the point — the cost was never pixels, it was distance.

**A hold opens it**, which was the owner's suggestion and answers that directly. Two rejected alternatives are recorded in the ADR, and the more interesting one is the trailing mark: it is discoverable and one tap, and it only helps the notes screen, because a host's section renders a long note in full and its foot is just as far down.

### Two things the gesture's tests found that would have shipped silently

- **`Math.abs(undefined - 10)` is `NaN`, and `NaN > slop` is `false`.** A pointer event without coordinates therefore disables the scroll guard completely and the hold fires mid-scroll. There is nothing to see in the code — the comparison looks right.
- **jsdom implements no `PointerEvent`**, so a synthetic `pointermove` arrives as a plain `Event` with no coordinates and the slop check cannot be exercised through `fireEvent` at all. A real `MouseEvent` named `pointermove` carries them and React routes it the same way. The primary-pointer guard is written as "not explicitly secondary" for the same reason: `isPrimary === true` refuses every event in the suite while passing in a browser, which is the worst way round for a gesture to be wrong.

---

## A second round on the phone — and one of the first round's fixes had never applied

Three reports. Two of them are one root cause, and it is not the one I would have guessed.

**The reading size never reached the screen.** `.note-prose` declared `--np-base: var(--text-body)` on itself, and **a custom property declared on an element shadows the inherited one** — so `.note-full-body`'s `--np-base: var(--text-reading)` never arrived. The previous round's size fix was inert from the moment it shipped. The default belongs in the `var()` fallback, where a host that states nothing gets it and a host that states something wins.

**And the block spacing had been dead since the feature shipped.** This is the worse one. The gaps live on `.note-prose > * + *`, which is specificity **(0,1,0)**; the per-element resets (`.note-prose p { margin: 0 }`) are **(0,1,1)**, so they win _no matter the order_. Every block gap this file ever declared was overridden. The prose has had no spacing between blocks at all — which is exactly what "clumped up" was, and re-tuning the numbers (which is what I did first) would have changed nothing again.

### The pattern across three rounds, which is the thing worth keeping

Three of my fixes in a row typechecked, passed 4,200+ tests, and changed no pixel: `dir="auto"` (wrong tool), `--np-base` (shadowed), the block gaps (out-specified). None of them is a knowledge gap — each is a rule I could recite. What they share is that **CSS and bidi resolution are invisible to this test suite by construction**: jsdom has no cascade, resolves no `var()`, and computes no specificity, so a green suite says nothing about any of them.

So the guard has to be structural, and it now is. `notes.contract.test.ts` reads the stylesheet as text and asserts: `.note-prose` does not declare `--np-base`; the default is in the fallback; the full screen asks for reading size; the reset sits on `> *` at the rhythm's own weight; and **no `.note-prose <tag>` rule declares a margin at all**. That last one was verified by re-injecting the original offender and watching it fail by name — an absence assertion nobody has seen fail is worth very little.

The other half is cheaper and I should have done it two rounds ago: **render it and read the computed values back.** Dumping the reported note's real markup under the real stylesheet and asking the browser for `fontSize`, `lineHeight` and `marginBlockStart` found the dead gaps in one run, after the numbers had already been "fixed" once.

### The threshold (owner's proposal)

A note past a threshold no longer expands; the tap opens the screen. The expansion's justification was measured on notes where lifting a two-line clamp adds a little (ADR-0153 §4's +37/+89px) — never on a document, where it produces a screen-height wall inside a list row with the verbs at the bottom.

- **The cost, stated:** one gesture now means two things and the boundary is invisible. That is why §1 did not propose it. What buys it is that the failure it removes is worse and was reported.
- **Estimated, not measured** — measuring the rendered height would mean rendering the thing to decide whether to render it. `noteReadsFullScreen` counts what the row _would_ show and wraps it at 42 chars against 8 lines.
- **Counting characters was the first version and was wrong in a way that matters**: twelve short lines is twelve lines tall and barely 150 characters, so a character threshold let exactly the wall through. There is a test named for it.
- **Left open, not built:** whether a host's section should now clamp a long note. It renders one in full today — the wall in a different room — and changing that contradicts that surface's whole grammar ("the note is already whole here").

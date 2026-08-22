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

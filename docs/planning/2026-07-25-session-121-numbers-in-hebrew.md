# Session 121 — a number and its Hebrew unit

**Date:** 2026-07-25
**Branch:** `claude/hebrew-format-number-ordering-2sk5u3`
**ADR:** [0118](../decisions/0118-numbers-in-hebrew-bidi.md)

Two reads reported together: the Map's distance chip said `ק״מ 9`, and the zone-shift
pill put the hours unit in front of the number. Same defect, and the ask was to
generalize it away rather than patch the two.

## What was actually wrong

Neither string is built backwards — `t.map.near.km` produced `"9 ק״מ"` and
`formatZoneDelta` produced `"+3 ש׳"`. Both **elements** were wrapped in `dir="ltr"`,
which sets the base direction of the whole element: the numeral goes to the visual
left, the Hebrew unit to the visual right, and reading right-to-left you meet the unit
first. The rule it came from is real (a bare `HH:MM` in Hebrew prose does need
protecting, design-language.md) — it was applied to the token instead of to the run
inside it.

A second, independent trap sat in the same pill: the `−` of `−3` is a neutral
character, so in the RTL flow it lands on the wrong side of the digits. Removing the
forced LTR alone would have fixed the word order and broken the sign.

Both halves were verified in Chromium (jsdom does no bidi layout) by comparing box
positions: `dir="ltr"` puts the digit left of the unit, no-`dir` puts it right; and
without an isolate the minus sits right of the digits, with one it sits left.

## The generalization

- **`frontend/src/lib/bidi.ts`** — `ltrIsolate(run)` for a Latin/numeric run,
  `measure(value, unit)` as the one builder for a number-plus-unit token (value
  isolated, unit outside in the RTL flow), `withoutBidiControls` for assertions.
  Strings rather than a component, because the same copy also lands in
  `title`/`aria-label`.
- **`dir="ltr"` → `dir="auto"`** at all 75 JSX sites, and **lint-blocked** afterwards
  (`BIDI_SELECTORS`, beside the existing clock and arrow-glyph guards) on anything but
  `<input>`. `auto` is never worse — identical for Latin-led and
  strong-character-free content, different only where the content is Hebrew-led, which
  is the broken case — and it self-corrects for dynamic text.
- The two reported tokens carry **no `dir`**: they're Hebrew text, so they belong to
  the page's RTL flow with the island inside.

## Found along the way

Looking for the pattern instead of the symptom turned up two more live instances:
`TimePicker`'s duration read-out (`עד 21:30` inside `dir="ltr"`) and the Map's own
`distanceStale` branch, which hand-coded "force LTR unless the content happens to be
the Hebrew placeholder" — a call site deciding direction from content, which is what
`dir="auto"` is for. Both are gone.

`.wp-board-progress .ends span[dir='ltr']` (mono for the progress clocks) keyed off the
old attribute value and now keys off `span[dir]`.

## Not done

- **CSS `direction: ltr` is convention-only.** Lint can't see CSS and the toolchain has
  no stylelint; the three current uses are on Latin-only content (a date input, an IANA
  zone name) and are documented as such in the ADR and design-language.md.
- **The `${n} unit` strings in `i18n/he.ts` were left alone** where the number sits in
  Hebrew **prose** (`3 שינויים מחכים לסנכרון`) — that reads correctly in the RTL flow
  and an isolate buys it nothing. `measure` is for tokens: chips, pills, tags.

No backlog line: the work was reported, decided, and shipped in this session, and
nothing is left deferred behind it.

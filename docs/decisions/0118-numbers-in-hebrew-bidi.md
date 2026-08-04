# 0118 — A number and its Hebrew unit: the LTR island is the number, never the token

**Status:** Accepted (2026-07-25). **Amended 2026-08-04** — the decision below covers strings the app _builds_; the amendment at the end covers the values it merely _renders_ (an address, a place name, a destination), which need `dir="auto"` rather than the absence of a `dir`, and it records that the lint guard was widened to see a computed `'ltr'` — which found a second live instance the original sweep of 75 sites had walked past. Read it before touching a `dir` anywhere.
**Date:** 2026-07-25
**Relates:** [0028](0028-plan-violet-color-budget-dark-ready.md) (the design language this sharpens — its RTL + mono-typography rules are where `dir="ltr"` came from), [0109](0109-map-tab-design.md) (the distance chip this fixes), [0107](0107-per-place-timezones-and-multi-zone-time.md) (the zone-shift pill this fixes, session-90 amendment), [0096](0096-per-domain-claude-md-guides.md) (reuse-before-adding — one bidi mechanism, not a per-call-site fix), [0114](0114-elapsed-duration-ladder.md) (the sibling "one rule for a formatted quantity" ADR)

## Context

Reported by Assaf (2026-07-25), two surfaces, one defect: the Map's distance chip read **`ק״מ 9`** instead of `9 ק״מ`, and the zone-shift pill read the hours unit before the number instead of `+3 ש׳`. In both, the unit had ended up in front of the number.

Neither string is built backwards. `t.map.near.km` produced `"9 ק״מ"` and `formatZoneDelta` produced `"+3 ש׳"` — correct logical order. The defect was in **how the elements were rendered**: both were wrapped in `dir="ltr"`.

That came from a real rule, applied at the wrong scope. design-language.md says Latin/numeric runs (times, codes, flight numbers) are wrapped `dir="ltr"` inside the RTL flow — the mono face has no Hebrew glyphs, and a bare `HH:MM` in Hebrew prose needs protecting. But `dir="ltr"` sets the **base direction of the whole element**. Applied to a token that also carries a Hebrew word, it lays that token out left-to-right: the numeral goes to the visual left, the Hebrew unit to the visual right, and a Hebrew reader — reading right-to-left — meets the unit first. Verified in Chromium: with `dir="ltr"` the digit's box sits **left** of the unit's; without it, **right** (as it must).

Two more instances of the same mistake were already in the tree, found by looking for the pattern rather than the symptom: `TimePicker`'s duration read-out (`עד 21:30` inside `dir="ltr"`) and the Map's own `distanceStale` branch, which hand-coded "force LTR unless the content happens to be the Hebrew offline placeholder" — a call site deciding direction from content, which is exactly the job `dir="auto"` exists to do.

There is also a second, independent bidi trap in the same pill: the **signed** number. In an RTL flow the `−` of `−3` is a neutral character, so it resolves to the surrounding RTL and renders on the wrong side of the digits (`3−`). Confirmed in Chromium: without an isolate the minus sits **right** of the digits; with one, left. So simply removing `dir="ltr"` fixes the word order but would break the sign — both halves are needed.

Assaf's ask was explicit: fix the two, and generalize so it cannot happen again.

## Decision

**In Hebrew UI, an LTR island is the numeric run — never the numeric run together with its unit. Two mechanisms, one guard.**

- **`frontend/src/lib/bidi.ts` is the one place bidi mechanics live.**
  - **`ltrIsolate(run)`** wraps a Latin/numeric run in `U+2066 LRI … U+2069 PDI`: a signed number, an `H:MM`, a code. Isolate rather than embed — the run can't reorder its neighbours, they can't reorder it, and HTML's `dir="auto"` sniffing skips isolated content, so a Hebrew unit beside the island still decides the token's direction.
  - **`measure(value, unit)`** builds every "number + Hebrew unit" token: the value isolated, the unit outside the isolate, in the RTL flow. `measure(9, 'ק״מ')` → `9 ק״מ`; `measure('−3', 'ש׳')` → `−3 ש׳`.
  - **`withoutBidiControls(text)`** strips the invisible controls, for assertions and any comparison on plain characters.

  These are **strings, not a component**, deliberately: number-plus-unit copy also lands in `title` / `aria-label` attributes, where a nested `<span dir="…">` cannot go.

- **`dir="ltr"` is replaced by `dir="auto"` everywhere in JSX (75 sites), and banned by lint.** `dir="auto"` is never worse: with no strong character (`07:00`, `12%`, `★ 4.5`) and with a Latin-led one it resolves LTR exactly as before — it differs **only** where the content is Hebrew-led, which is precisely the broken case. It also self-corrects for dynamic content, which removed the Map's hand-rolled `distanceStale` direction branch outright.

- **The two reported tokens carry no `dir` at all.** A pill that is Hebrew text (`🕐 −3 ש׳`, `9 ק״מ`) belongs to the page's RTL flow; the island is inside it. This also keeps a unit-less variant consistent: `dir="auto"` would resolve `🕐 +5:30` (no strong character) LTR and flip the clock glyph to the other end of the pill.

- **`<input>` keeps `dir="ltr"` and is exempt from the rule.** A confirmation-code or wifi-password field's value is Latin by construction, and on `date`/`time` controls `dir` also drives the native control's own layout. Three CSS `direction: ltr` declarations stay for the same reason (a date input, an IANA zone name) — they are on Latin-only content, not on tokens.

- **The guard is a lint rule** (`BIDI_SELECTORS` in `eslint.config.mjs`, alongside the clock and arrow-glyph guards), failing CI on `dir="ltr"` on any non-`input` JSX element, and naming `ltrIsolate`/`measure` in its message. A static rule can't know whether dynamic children are Hebrew — so it bans the construct that makes content direction the element's business at all, rather than trying to detect the content.

## Consequences

- The two reported reads are fixed (`9 ק״מ`, `+3 ש׳`), plus the two unreported instances found with them (`TimePicker`'s `עד 21:30`, the Map's stale-distance branch).
- A new number-and-unit token is a one-liner that is right by construction: `measure(n, 'unit')` in `i18n/he.ts`, no `dir` at its call site. Getting it wrong the old way now fails lint with the fix in the message.
- Formatted tokens now contain invisible characters, so an exact-string assertion reads through `withoutBidiControls` — and the ordering itself is asserted explicitly (`lib/bidi.test.ts`, plus a case in `distance`/`time`/`Map`/`ZoneShiftPill`). jsdom does not lay bidi text out, so ordering is verified as **logical** order plus the absence of a forced direction; the visual claim was checked in Chromium by comparing the digit's and the unit's box positions.
- One CSS selector keyed off the old attribute value (`.wp-board-progress .ends span[dir='ltr']`, mono for the progress clocks) now keys off `span[dir]`.
- `design-language.md`'s RTL and mono paragraphs are sharpened from "wrap Latin strings in `dir="ltr"`" to the run-vs-token distinction, since the old wording is what licensed the defect.
- Not covered by lint: `direction: ltr` in CSS. The three current uses are on Latin-only content and documented as such; a new one on a token would reintroduce the bug silently. The convention is written down (design-language.md, `frontend/CLAUDE.md`) rather than enforced — there is no stylelint in the toolchain, and adding one for a single rule is not worth its own dependency.

## Amendment (2026-08-04) — stored content is the other half, and the guard could not see a ternary

Reported from a rendered mockup (2026-07-28, session 148) and fixed here: `2-14-5 Kabukicho, Shinjuku, Tokyo` rendered as `Kabukicho, Shinjuku, Tokyo 2-14-5` in a booking's location fact. The 75-site sweep above was a sweep of the wrong direction — it removed forced `dir="ltr"`, and this class of bug is the **absence** of a `dir`.

**The mechanism generalizes as it stands; what was missing is the second content class it applies to.** The decision above is about strings _the app builds_ (a number and its Hebrew unit). A value the app did **not** build — a place's address or name, a trip's destination, a provider, a room, Google's prediction text — has no direction we can know at the call site, so its element carries **`dir="auto"`**, which is the platform's answer to exactly that question. With no `dir` it inherits the RTL flow, and a value that opens with a numeral run comes apart: the space between the digits and the letters is a neutral between two runs the algorithm reads as opposite (an `EN` run acts as `R` toward its neighbours), so it takes the paragraph's own level and the two halves reorder around it. `dir="auto"` skips numbers when it sniffs, finds the `K`, and the address reads.

Two boundaries, both load-bearing and both already paid for once:

- **The `dir` goes on the element holding the value and nothing else.** `.bk-fact-v.bk-loc` holds the address _and_ the two Hebrew map links, so the attribute sits on the inner text span — a base direction on the box would lay the links out left-to-right, which is the same mistake as the original defect one level up.
- **Never on an `<input>`.** `auto` sniffs the _value_, so an empty field has no strong character and falls back to LTR, left-anchoring a Hebrew placeholder — found on a phone while building ADR-0147's place form and pinned in its test. A field inherits the page's RTL; a rendered text node sniffs.

**The lint guard was widened, and it immediately found a second live instance.** The original selector keyed on `value.value="ltr"`, so it matched only a literal attribute and read straight past a computed one — which is how `BookingDetail`'s `dir={mono ? 'ltr' : undefined}` survived the sweep of 75 sites. It now matches the `'ltr'` literal anywhere under a `dir` attribute, and CI failed on `TripSettings`'s `ReadRow`: the same fact-row shape, the same ternary, over a trip name and a destination. Both are now `dir="auto"`, which for a code, an IANA zone and a budget resolves LTR exactly as the forced version did.

Swept the same way: the Map row's name and meta (a numeral-led **name** — `7-Eleven Shinjuku` — is the identical defect), `PlaceResearch`'s result card, `DestinationPicker`'s predictions, `PlacePicker`'s trigger label, `RowManageSheet`'s `subject` (one caller passes a raw address), and `MapPlaceForm`'s hint. Not swept: the numeric run inside a stored address that is _itself_ mixed Hebrew and Latin (`רחוב 5 Main Street`), which would need per-run isolation of text we do not parse; `dir="auto"` leaves that case exactly as it was, and no such address has been seen.

## Alternatives considered

- **Just remove `dir="ltr"` from the two elements.** Rejected — it fixes the word order and breaks the sign (`−3` renders `3−` in the RTL flow), and it leaves the pattern in place at 75 other sites with nothing preventing the next one.
- **Isolate the whole token (`ltrIsolate('9 ק״מ')`) and keep `dir="ltr"`.** Rejected — an isolate sets a base direction for its content too, so this reproduces the bug: the token still lays out left-to-right, unit last, and now invisibly so.
- **Wrap the number in a nested `<span dir="ltr">` at each call site.** Rejected — it can't reach `title`/`aria-label` copy, it puts the same two-line dance at every call site (the copy-paste smell ADRs 0078/0079/0094/0095 exist to undo), and the tokens are produced as strings by `i18n/he.ts`/`lib` formatters where there is no element yet.
- **A `<Ltr>`/`<Numeric>` component as the only sanctioned way to set direction, with a dev-time Hebrew-content assertion.** Rejected as the primary mechanism — the direction sites are `<span>`, `<b>`, `<code>`, `<div>`, and `<input>`, so it needs a polymorphic `as` prop to cover them, and it still wouldn't reach attribute copy. `dir="auto"` gets the same self-correction from the platform with no component and no runtime check.
- **Route every existing `${n} unit` string in `i18n/he.ts` through `measure`.** Deferred — most of them are numbers inside Hebrew **prose** (`3 שינויים מחכים לסנכרון`), which reads correctly in the RTL flow and gains nothing from an isolate. `measure` is the builder for **tokens** (chips, pills, tags); a prose sentence stays a sentence.

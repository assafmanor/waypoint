# 0213 - A shared trip changes emphasis, and print is its own rendering

**Status:** Accepted - built (2026-08-30)
**Date:** 2026-08-29
**Relates:** [0011](0011-hard-soft-event-model.md), [0017](0017-mobile-first-device-targets.md), [0018](0018-timeline-data-model-shape.md), [0028](0028-plan-violet-color-budget-dark-ready.md), [0067](0067-revocable-code-invites-and-removal-blocks.md), [0097](0097-mockup-catalog-out-of-root-claude-md.md), [0107](0107-per-place-timezones-and-multi-zone-time.md), [0118](0118-numbers-in-hebrew-bidi.md), [0166](0166-place-enrichment-is-a-multi-source-pipe.md)

## Context

Itinerary sharing has two audiences and two media. A fellow traveler needs operational detail; someone planning a similar trip wants its shape. A live public page is read on a phone and can expand. A PDF is a fixed snapshot that must remain compact, legible, and printable.

The first public mockup removed facts at lower detail levels. The second added a route-led introduction and a sunrise/sun/sunset/moon row. The owner rejected that row because it labelled parts of a day without organizing the schedule, and challenged mandatory day titles because the app deliberately has no `Day` entity. The owner also intends to add LLM models and skills later, wants generated summaries to publish without an approval step, and requires that sensitive data never cross the model boundary.

## Decision

### 1. One projection vocabulary, three reading intents

The owner selects one of three projections. Web and PDF consume the same projection contract, but each medium renders it independently.

- **Summary is for inspiration.** It emphasizes trip identity, route order, destinations, generated-or-derived day narrative, and event titles grouped by part of day. It excludes exact times, addresses, travel legs, and operational/private fields.
- **Full schedule is for orientation.** It adds exact times, locations, addresses, travel legs, and map links. It excludes booking references, notes/tasks, traveler identity, files, and financial details.
- **Everything is for operation.** It starts from Full and adds only owner-enabled sensitive fields. Every sensitive field family is off by default.

The public page keeps a stable day spine across projections. Hierarchy changes; navigation and privacy do not.

#### The schedule owns parts of the day

Daypart marks are section headings over real events, not a decorative rail. Empty sections do not render. The grouping is derived from an event's displayed local start time, using the same display-zone resolution as the event itself:

- morning: 05:00-11:59;
- noon: 12:00-13:59;
- afternoon: 14:00-17:59;
- evening: 18:00-21:59;
- night: 22:00-04:59;
- flexible: no start time.

These boundaries are presentation-policy constants, not stored data. Summary shows event identity beneath the heading without exact facts. Full and Everything show the same grouping with their allowed details.

### 2. Narrative is optional, automatic enrichment

A day does not require an authored title. ADR-0018 deliberately dropped the `Day` table; sharing must remain complete with only events, places, and dates.

The server always builds a deterministic fallback:

- trip narrative: route labels and counts;
- day title: route endpoints or principal place;
- day summary: the first meaningful public event titles.

A future `ItineraryNarrativeGenerator` may replace only those narrative strings. Its output publishes automatically when it is current and valid; there is no owner-review state. Model output never decides which fields are shared, how events are grouped, or how web/PDF render.

#### Model boundary

The generator receives a separate `SummaryNarrativeInput`, never the Full or Everything projection. It is a server-built allowlist containing only:

- locale;
- public destination and route labels;
- day ordinal;
- event title, icon, and category already included in Summary;
- coarse daypart;
- public place display names already included in Summary.

It excludes trip/member/entity identifiers, emails, traveler names, exact dates and times, addresses and coordinates, notes, tasks, booking fields and confirmation codes, documents, costs, URLs, provider payloads, and every Everything toggle. Identifier-like, email, phone, and URL patterns are removed from allowed free text before dispatch.

An allowlist cannot prove that arbitrary prose is semantically non-sensitive. Therefore model generation runs only for an active shared link, and only text already selected for publication in Summary may cross an external model boundary. If the product later promises that no itinerary content at all leaves Travelive, that requires a local or self-hosted model rather than a broader prompt filter.

#### Generation lifecycle

- A skill is a named, versioned generator with a strict input schema and strict JSON output schema; sharing does not build a general-purpose agent runtime.
- Results are keyed by trip, locale, input hash, and skill version, with model/provider provenance and generation time.
- Output is rejected if it fails schema, length, locale, or no-URL rules.
- An input-hash mismatch makes the result ineligible immediately. Web and PDF use the deterministic fallback while background regeneration runs.
- Public reads and PDF rendering never invoke a model synchronously.
- Provider failure, timeout, refusal, or disabled AI leaves sharing fully functional through the fallback.

### 3. Visual identity has no new media dependency

The first release does not require a trip-cover upload, stock photography, generated imagery, or static map rendering. A compact route strip comes from actual ordered destinations. Event badges and daypart headings come from existing event content. This is truthful, available offline, and buildable from the projection already required for sharing.

Travelive identifies the source quietly at the top and offers a low-pressure product invitation only after the itinerary. The trip makes the first impression.

### 4. PDF is not a screenshot

PDF has a dedicated fixed-light A4 renderer. It shares data, daypart grouping, and projection rules with the public page, not the public page's component tree.

- Summary targets one page for the nine-day reference trip.
- Full targets two pages for that reference trip.
- Everything moves selected sensitive data into an appendix.
- Days are break-safe units; event rows do not split across pages.
- Daypart headings appear only above events that belong to them.
- Page footers contain generated-at time, page count, written URL, and QR.
- Color is restrained and semantic; structure remains legible in grayscale.

These are density targets, not truncation rules. Longer trips may use more pages rather than reducing text below the print typography floor.

### 5. The public URL uses the invite-link technique

The proposed public route is `/s/<code>`, where `code` is an 8-character case-sensitive base58 credential backed by a durable database row, following ADR-0067. The URL contains neither a trip ID nor a signed payload.

The v1 build has one reconfigurable public link per trip. Updating its projection changes that live link; rotating its code invalidates the old URL immediately. Multiple independently revocable audience links remain a future access-management feature rather than infrastructure hidden inside v1.

## Consequences

- Detail levels need explicit server-owned projection schemas; arbitrary client-side field hiding is insufficient.
- Daypart grouping is one shared pure derivation consumed by web and PDF.
- Sharing remains useful before any model integration and remains available during provider failure.
- A future LLM/skills subsystem gets a narrow versioned port rather than access to the trip snapshot.
- One link keeps the ordinary path short and the lifecycle legible; serving two audiences simultaneously requires the future multiple-link feature rather than weakening one link's projection contract.
- Generated narrative may change automatically on a live link, but only after schema validation and only for the exact current input hash.
- Free-text sensitivity cannot be solved by field names alone; external generation is limited to Summary-public text and requires explicit provider policy.
- PDF generation needs pagination tests and rendered-page inspection, not only unit tests.

## Amendment — what shipping it changed (2026-08-30)

Built as designed. Six things the build decided or corrected, recorded because a reader of
the design alone would get them wrong.

**The display zone has no place-zone rung.** The build plan resolved an event's display zone
as _event override → place zone → trip zone_. That is not this app's rule: ADR-0107 §4 is
_event override → the itinerary segment holding that instant → trip primary zone_, and a
place's zone reaches it through the crossings transport builds, never as a step of its own.
`eventZone` in `notifications/kinds/event-shape.ts` already implemented the real chain, so
the derivation moved to `common/event-zone.util.ts` and sharing consumes it. A shared page
or PDF printing an hour the app never showed is the bug ADR-0197 §5 calls the one that gets
a feature turned off permanently; two implementations that agree today are how you get there.

**`shared-itineraries` is a server route prefix.** Missing from the plan, and it breaks two
things: `openapi-contract.spec.ts`'s route-ownership test rejects any documented path outside
`SERVER_ROUTE_PREFIXES`, and in production the service worker's navigation denylist answers
the public API call with the cached app shell. Note the feature needs **two** different
prefixes for one flow — `/s/<code>` is an ordinary SPA route that must keep getting the
shell, while the JSON and PDF it then fetches must reach the backend.

**The deterministic narrative emits no prose.** §2 said the server builds a fallback of
"route labels and counts", which would have put Hebrew sentences in a server that owns no UI
copy (ADR-0009). What it actually emits is trip data joined by punctuation — `רייקיאוויק ←
ויק`, `נחיתה בקפלוויק · כניסה לדירה` — with no word of any language in it, and `dayCount`
/`eventCount` as fields. Each renderer composes the sentence around them in its own locale.
An empty string is a legitimate answer: a day with no places has nothing true to say about
itself, and the reader falls back to its date.

**The PDF owns one Hebrew file, and it is the only Hebrew in the backend.** The print
renderer runs server-side and cannot import the app's i18n, so `itinerary-pdf.copy.ts` is a
deliberate second locale consumer. The obvious guard — a test importing
`frontend/src/i18n/he.ts` — makes the backend's own `tsc` build reach across the workspace,
which it refuses (TS2835) and should. What keeps it honest is that all of it is in that one
file.

**The `unicode-range` split is load-bearing in print too.** Inlining the app's fonts without
it lets the Latin Assistant face win for every Hebrew codepoint, and every title silently
falls back to a system font. The page still _looked_ right in a container with Hebrew
coverage; the tell was a PDF whose Hebrew could not be extracted at all. This is why the
smoke check opens the artifact with `pdfjs` and asserts extractable Hebrew rather than
trusting the renderer's own report — a mocked browser can see none of it.

**Everything's fourth family is per-file, not a switch.** Booking secrets, notes/tasks and
traveller identity are switches; documents are chosen one at a time, because "share my
documents" is a promise nobody can check later. Financial data has no member at all — the
shape cannot express it, which is a stronger default than a switch left off. Traveller
identity publishes display names and there is no toggle anywhere that reveals an email: the
`select` cannot name one, rather than the mapper choosing not to read it.

### What was verified, and what was not

Verified: the full projection at all three levels against a leak fixture (an email, a
confirmation code, coordinates, a `googlePlaceId`, two private bodies) asserted on the
serialised output; the narrative boundary including provider failure, staleness and a
generator that never resolves; both API surfaces; the reader and the owner sheet; the PDF
rendered by a real Chromium — page counts, extractable Hebrew, the written URL.

**The container PDF smoke was not verified while building** — the session had no Docker, so
the Docker leg and its host-side verifier (`.github/workflows/ci.yml`,
`scripts/verify-pdf-smoke.mjs`) were written unexecuted. **CI closed it on the first run**
(2026-08-30, PR #749): the production image built, rendered the nine-day reference itinerary
through its system Chromium, and the host-side `pdfjs` verifier confirmed two pages,
extractable Latin and Hebrew, and the written URL. The runtime image can render.

## Amendment — four field reports, and what the repairs changed (2026-08-30)

Shipped, merged, and four things wrong in a day's use. All four are worth recording because
none of them was a knowledge gap: each had a test that passed while the defect was on screen.

**A sibling control needs a rule that lays it out.** The All Trips share action rendered on a
line of its own, because `.trip-share-wrap` was written into the JSX and never into the CSS —
so an unstyled block wrapper let a `width: 100%` card push its sibling to the next row. The
unit test that guarded the split asserted the button was not NESTED inside the card, which is
true of a control anywhere on the page. **jsdom reports every rect as zero, so a claim about
where something SITS cannot be a unit test** — `e2e/trip-share-entry.spec.ts` now measures the
action against the card's own band, at both phone widths and in both list shapes.

**A screen outside the shell inherits its refusal to scroll and none of its scroller.** The
public reader could not be scrolled at all. `html, body { overflow: clip }` is app-wide and
deliberate (every scroll belongs to `.body`, a sheet or a strip), and `/s/<code>` renders
outside `AppShell` — so `.sh-page` had to own a scroll container and did not. It is sized in
`dvh` rather than `%` for the reason `tokens.css` already gives: a percentage resolves against
the large viewport, which would have hidden the last ~125px behind the phone's toolbar with
nothing able to scroll to it.

**A page number is only true if the paginator is what counted.** The print renderer sliced
days into fixed groups of five, wrapped each in a `min-height: 297mm` box and printed that
arithmetic as `עמוד N מתוך M`. A dense twelve-day trip overflowed those boxes, so five
physical sheets were numbered to three, the `position: absolute` footer inside an overflowing
box printed **on top of** the schedule, and one document ended on a blank page. The repair is
to stop paginating: the days are one multi-column flow, Chromium breaks it on
`break-inside: avoid`, and the running footer is Chromium's `footerTemplate` reading
`.pageNumber`/`.totalPages`. Its cost is that the footer renders as a **separate document**
that inherits no stylesheet and no font from the page, so it carries its own inlined
`@font-face` — a footer saying `עמוד` in a container with no Hebrew coverage would print
boxes. Two columns are a `column-count`, never a grid: a grid container that outgrows the page
fragments by row, which is where the overlapping lines came from.

**An emoji is content, and the runtime image has none.** Every icon printed as a rectangle.
`icons.ts` says the glyph is content and `node:22-slim` + `fonts-liberation` has no emoji
coverage at all, so Chromium drew `.notdef` for each one — invisible on every developer
machine, because a desktop has an emoji font. Monochrome Noto Emoji is now vendored and
inlined like the other faces (`backend/assets/fonts/README.md` records why monochrome, why
vendored, and why not subsetted). The lesson generalises past emoji: **the smoke check must
run where the fonts are missing, and it must open the artifact.** It now asserts extractable
emoji beside extractable Hebrew, that each page's own footer names the sheet it is printed on,
that no page is blank, and that no text run is printed over another — against **two**
documents, the reference trip and a deliberately dense one, because only the dense one
fragments and the comfortable one was green through all of the above.

## Amendment — four field reports, and what the repairs changed (2026-08-30)

Shipped, merged, and four things wrong in a day's use. Worth recording because none was a
knowledge gap: each had a passing test while the defect was on screen.

**A sibling control needs a rule that lays it out.** The All Trips share action rendered on a
line of its own, because `.trip-share-wrap` was written into the JSX and never into the CSS —
so an unstyled block wrapper let a `width: 100%` card push its sibling to the next row. The
unit test guarding the split asserted the button was not NESTED inside the card, which is true
of a control anywhere on the page. **jsdom reports every rect as zero, so a claim about where
something SITS cannot be a unit test** — `e2e/trip-share-entry.spec.ts` now measures the action
against the card's own band, at both phone widths and in both list shapes.

**A screen outside the shell inherits its refusal to scroll and none of its scroller.** The
public reader could not be scrolled at all. `html, body { overflow: clip }` is app-wide and
deliberate — every scroll belongs to `.body`, a sheet or a strip — and `/s/<code>` renders
outside `AppShell`, so `.sh-page` had to own a scroll container and did not. Sized in `dvh`
rather than `%` for the reason `tokens.css` already gives: a percentage resolves against the
LARGE viewport, so the last ~125px would sit behind the phone's toolbar with nothing able to
scroll to it.

**A page number is only true if the paginator is what counted.** The print renderer sliced days
into fixed groups of five, wrapped each in a `min-height: 297mm` box and printed that
arithmetic as `עמוד N מתוך M`. A dense twelve-day trip overflowed those boxes, so five physical
sheets were numbered to three, the `position: absolute` footer inside an overflowing box
printed **on top of** the schedule, and one document ended on a blank page. The repair is to
stop paginating: the days are one multi-column flow, Chromium breaks it on `break-inside:
avoid`, and the running footer is Chromium's `footerTemplate` reading `.pageNumber` /
`.totalPages`. Two consequences worth knowing. The footer renders as a **separate document**
that inherits no stylesheet and no font from the page, so it carries its own inlined
`@font-face` — a footer saying `עמוד` in a container with no Hebrew coverage prints boxes. And
the page margins move to `page.pdf()`, because that footer lives in the bottom margin: the band
has to hold it and still leave air above it, which the first pass at 12/13/15mm did not.

Two columns are a `column-count`, never a grid — a grid container that outgrows the page
fragments by row, which is where the overlapping lines came from.

**An emoji is content, and the runtime image has none.** Every icon printed as a rectangle.
`icons.ts` says the glyph is content, and `node:22-slim` + `fonts-liberation` has no emoji
coverage at all, so Chromium drew `.notdef` for each — invisible on every developer machine,
because a desktop has an emoji font. Monochrome Noto Emoji is now vendored and inlined like the
other faces (`backend/assets/fonts/README.md` records why monochrome, why vendored, why not
subsetted).

**What the smoke check learned from all of it.** It must run where the fonts are missing, it
must open the artifact, and it must be given a document that actually fragments. It now asserts
extractable emoji beside extractable Hebrew, that each page's own footer names the sheet it is
printed on, that no page is blank, and that no text run is printed over another — against
**two** documents, the reference trip and a deliberately dense one, because only the dense one
fragments and the comfortable one stayed green through every defect above.

## Amendment — the share control asks who the link is for (2026-08-30)

Owner, the same day: _"The share button should be both for sharing the trip and inviting
(let's mockup this)."_ Drawn and measured in
[`mockups/sharing-and-inviting-are-one-control-v1.html`](../../mockups/sharing-and-inviting-are-one-control-v1.html).

**§1 · The problem is that two grants live in two places.** This ADR gave the trip a reader's
link — `/s/<code>`, no account, revocable, a projection — and put its control on the trip
header and every All Trips card. [ADR-0067](0067-revocable-code-invites-and-removal-blocks.md)
gave the trip a traveller's link — `/join/<code>`, a `Membership`, full live data, edit
rights — and it sits at the foot of Trip Settings, past the roster and the removed-members
list. "Send my sister the trip" and "add my sister to the trip" are one sentence in Hebrew
and two screens in the app, and the control labelled `שיתוף` is the one people press.

**§2 · One question above the sheet, and the body branches under it.** `למי זה הולך?` —
`מצטרפים לטיול` or `רק לצפייה`. Deliberately **not** a third button beside `לינק חי` and
`PDF`: those two are two **formats of one grant**, and a row of three teaches that all three
are interchangeable. The cost of that lesson is not symmetric — someone who meant to send a
peek instead adds a person to the trip, with edit rights, and nothing on screen said so.

No new mechanism. The sheet already reads _pick a level → read what it costs → press an
outcome_; the fork is the same sentence one clause earlier, so it is a second `ChoiceGrid`
over the `.choice-card` the levels already use. The mockup's whole proposed stylesheet is 36
lines, which is the argument.

Join is the **default**: it is the common audience for a live trip, and it is the one that
cannot be reached today without leaving the screen.

**§3 · The invite link is one component with two hosts.** The sheet and Trip Settings render
the same row rather than two copies of "the trip's link" — the duplication rule 8 exists to
prevent. It is drawn in the neutral `.share-link` idiom at the 44px floor, and specifically
**not** as today's `.invite-box`, which paints `--plan-tint` with a dashed violet border on a
Trip-mode screen and so spends the hue [ADR-0028](0028-plan-violet-color-budget-dark-ready.md) reserves for
Plan mode. Fixing that in place is what makes one component possible.

**Authorization is unchanged**, and that is the point: `POST /trips/:tripId/invite` is
already get-or-create for any member and `…/invite/rotate` is already admin-only (ADR-0067),
which matches this sheet's existing split exactly — sharing is what the group does, changing
what the world sees is the admin's. A peer sees the invite branch in full, with the rotate
row absent, exactly as they see the read-only branch without the level cards.

**§4 · What rendering it changed, since none of it was visible in the code.** The first draft
marked the two audience cards with emoji, which the design language forbids on a control
("emoji are content, icons are UI", and a glyph whose siblings draw icons is a control) — they
are `Icon`s now, and `eye` joined the set because nothing in it meant "look". More
consequentially, `.share-sheet` set a flat `gap: 12px`, so a question sat exactly as far from
the control answering it as from the next subject; that is the same as having no grouping at
all, and it is most of why the sheet read as a stack. It is now 16px between groups and 8px
inside one, and the redesigned sheet is **shorter** than today's (428px against 490px) despite
asking one more question. The mockup could not see any of that for three rounds, because
`form-actions.css` — which owns `.modal-form`, the flex container the gap lives on — was
missing from its `APP-CSS` manifest and every block rendered at a 0px gap. An incomplete
manifest is an argument from CSS the app does not have.

**Rejected.** _One link that lets the recipient choose_ — it hands the authorization decision
to the party that does not hold it, and inverts ADR-0067's "the code **is** the grant".
_Leaving the invite in settings behind a shortcut in the sheet_ — it keeps the long journey
and adds a sign to it. _Borrowing the hard/soft grammar for the two audiences_ — it fits the
meaning almost perfectly (one is a commitment, one is provisional) and was refused anyway:
that grammar belongs to events (ADR-0011), and spending it here would teach that dashed means
"read-only" rather than "movable".

## Amendment — six field reports on the shared page, and what they had in common (2026-08-30)

All six are about **a line the server composed**, and four of them are the same mistake in
different costumes: a composed line was treated as if it were a single value.

**A composed line cannot sniff its own direction.** `dir="auto"` resolves from the first
strong character, so `Haifoss ← Stutur crater` laid out LTR — putting the ORIGIN on the left
with the arrow pointing back at it — while the identical string with a Hebrew first stop laid
out RTL and read correctly. Two rows differing only in their data disagreed about which way
the trip went. The repair is the one `lib/bidi.ts` already applies to a number and its unit,
one level up: each **value** gets a first-strong isolate so it keeps its own script, the
punctuation stays in the surrounding flow, and both renderers pin that flow to the page's RTL
by **not** setting `dir="auto"` — which, being isolate-blind, would find no strong character
at all and fall back to LTR. `fallbackDaySummary`, the appendix rows and the route strip are
the same shape and got the same treatment. Verified by rendering all three script orders.

**A leg's endpoints live on its booking, and the day title could not see them.** `from`/`to`
are on `Booking`, not on `Event.place`, so a transport event contributed nothing to the day's
route: a flight day had no title at all and fell back to its date, and a driving day's route
began at whichever sight happened to have a pin (owner: _"Why doesn't it include the first and
last legs?"_). `journeyLookup` already knew to read the booking; the day derivation now knows
the same thing. A day whose ends match is named once rather than `X ← X`.

**A cap applied before the endpoints were taken.** `routeLabelsFrom` sliced to eight and
`fallbackTripTitle` then took the last element of the SLICE, so a twelve-day trip's title
ended at day eight — which is how `Kerið Crater ← אסבירג׳י` came to name two arbitrary
attractions. The route is now derived whole; the strip's cap is the projection's, applied only
to what it draws, and it keeps the last stop so the strip and the title cannot disagree.

**A mode is a discriminant, and it was a `z.string()` nobody read.** `journey.mode` was in the
contract and neither renderer rendered it, so a 121-minute walk and a 67-minute drive were the
same shape of line and nothing said which (owner: _"the live map doesn't show driving/walking
etc. properly"_). It is `z.enum(LEG_TRAVEL_MODES)` now, and both renderers key the app's own
activity word off it — the PDF's leg had been printing two bare numbers with no units at all.

**Hebrew must never sit inside a mono element**, and the `font` shorthand is how it got there.
`.pdf-subtitle` was `font: … 'JetBrains Mono', monospace`; the shorthand replaces the family
list, so Assistant was not behind it, JetBrains ships no Hebrew, and the container's only
monospace is Liberation Mono — `12 ימים · עודכן` printed as empty rectangles while the
headings two lines above were perfect. Mono is now scoped to the numeric run (`.pdf-num`), and
a spec asserts no `.pdf-num` ever receives a Hebrew codepoint.

**What the smoke check could not see, and now can.** `hebrew-text` passed throughout: it asks
whether SOME Hebrew is extractable, and the headings always were. A check that a subtitle's own
Hebrew survives is a different question from a check that the document has any.

## Amendment — a shared page that says what it means (2026-08-30, second pass)

Seven reports in one sitting, and mapping them was worth more than fixing each: **six of the
seven are one root cause.** The projection shipped every derived line as a **composed string**
— data joined by punctuation, with no word of any language in it — because that is what let
one server derivation feed a Hebrew page and a Hebrew PDF (§2). The cost only became visible
once real trips ran through it: a server holding no copy cannot say _"flying"_. It can only
join. So every derived line on every day of every trip had the same shape, made of whatever
the place rows happened to be called.

The repair is the move `journey.mode` already made one field over: **ship the discriminant.**
A day's headline is now `{ kind, …values }` and each renderer keys its own words off it. The
locale boundary is exactly where it was — the projection still holds no UI copy — and the page
can finally speak.

### The map

Every line a reader sees, what it said, and what it says now.

| #   | Line                 | Was                                                                                              | Now                                                                                             |
| --- | -------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| 1   | Masthead dates       | `2026-09-11 - 2026-09-22 · 12 ימים · עודכן …` on one wrapping line, in ISO the app shows nowhere | two lines: `11.09–22.09 · 12 ימים`, then a quieter stamp. The app's own `formatTripDates` shape |
| 2   | Masthead route block | the trip's title, **printed again** one centimetre below in the lede                             | the strip only, labelled `המסלול`                                                               |
| 3   | `אזורים` count       | `routeLabels.length` — the **capped** strip, so a long trip reported 8                           | `routeStopCount`, the whole route                                                               |
| 4   | Route strip          | opened and closed on airport names, because a day's transport endpoints are stops                | a day offers its first **non-transport** stop, falling back only if it has nothing else         |
| 5   | Day headline         | `נתב״ג ← נמל התעופה הבינלאומי קפלוויק`                                                           | `טסים לאיסלנד` · `טסים הביתה` · `טיסה ל<X>` · `<A> ← <B>` · `<A>` · the date                    |
| 6   | Day second line      | the first two event titles — on a flight day, the same two airport names again                   | `לינה ב<place>` where there is a bed; otherwise the titles the headline did **not** already say |
| 7   | Event row            | `15:00 · The Hill Hotel at Fludir`                                                               | `לינה · 15:00 · …` — the booking's own type, in the app's own eight words                       |
| 8   | A pre-dawn event     | filed on its own date and rendered **last**, under an evening 19 hours later                     | filed on the night before                                                                       |
| 9   | Public bar           | the letter `T`                                                                                   | the app's own mark                                                                              |
| 10  | Share sheet          | link and both send buttons below the sensitive toggles **and** the file list                     | audience → scope → **send** → refine                                                            |

### The three rules the map produced

**§A · A kind, never a sentence.** `SHARE_DAY_KIND` and `SHARE_DAY_SUMMARY_KIND` are
discriminated unions in `packages/shared`; `PDF_COPY.dayTitle` and `t.share.public.dayTitle`
are the two word tables. A generated narrative lands as `text`, which has no kind and needs
none. Values arrive **raw** and each renderer isolates them itself (ADR-0118) — asserted, so
nothing can arrive pre-wrapped and get isolated twice.

**§B · Name the trip, not the airport.** An outbound flight day says the trip's `destination`,
because `נמל התעופה הבינלאומי קפלוויק` is where the plane lands and `איסלנד` is where you are
going. A returning day carries **no place at all**: home is the absence of the trip. Both tests
are deliberately narrow — the first flight day must also be the trip's first day with anything
on it, and the last must be its last — so a domestic hop on day three cannot announce a country
nobody left.

**§C · The share's day starts at dawn, and the grouping owes the sections that.**
`shareDaypart` already said so: `night` is the fallthrough below hour 5. Grouping by calendar
date contradicted it, and because `night` renders last, a landing at 00:30 printed at the
bottom of its own card. This is share-only and contradicts nothing: the app's own day surfaces
sort by `startsAt`, so the same event already reads first there. It is grouping by **daypart**
that turns a pre-dawn hour into a trailing one, so it is grouping by daypart that owes the fix.
Nothing stored moves; `Event.date` stays what the traveller authored.

### What this cost the privacy argument: nothing

`SHARE_EVENT_SELECT` gains exactly one column, `booking.type` — the booking's **kind**, already
selected for zone crossings, and the discriminant §A and the captions key off. Everything
operational stays behind `SHARE_SECRET_BOOKING_SELECT` and the Everything appendix, and the
projection spec asserts a confirmation code still never appears.

And the masthead block the owner asked about (_"Are they leaks of something?"_) never was one:
both lines are place labels that already appear in the schedule below. It read as a leak because
it printed the same string twice with nothing naming either.

## Amendment — a live link is a setting, and a strip of initials is not a route (2026-08-30, third pass)

Field reports on the second pass. Three fixes and one deferral.

**§1 · A LEVEL IS A SETTING ON A LIVE LINK, NOT A DRAFT.** Two reports, one cause: _"No
indication that the live sharing detail level was changed when switching"_ and _"every time I
open the sharing menu it's on תקציר"_. `upsertTripShare` was reachable only through
`ensureShare`, and `ensureShare` only from the two send buttons — so moving the level control
wrote nothing, closing the sheet discarded it, and the next open re-seeded from the stored
config and looked like the control had never moved. A link that is already live is already
showing something to whoever holds it, so moving the control now moves the link: it saves on
change and the sheet confirms it by name. With **no** share yet it still mints nothing — the
first send creates it, and minting a link from a control somebody was only looking at would
be a grant nobody asked for.

**§2 · The journey mode is the app's derivation, not this projection's.** `journeyLookup`
took "the first mode that has an answer, in `TRAVEL_MODES` order", which opens with `walking`
— while `useDayTravel` caches every mode for every leg precisely so a mode question costs no
request. Every unoverridden leg therefore answered walking, and a 38km drive printed as a
walk. `legTravelMode` + `defaultLegTravelMode` are in `@waypoint/shared` exactly so the
board, the Map and a server-side projection cannot disagree (root rule 8); using them also
repairs an override lookup that built its own `from>to` key where overrides are stored
**canonicalised**, so a pair declared in the other direction was silently missed.

**§3 · The route strip leaves the phone, and stays on paper.** §3 above put a compact route
strip on both renderers. At 390px, `MAX_ROUTE_LABELS` of 8 plus connectors leaves ~30px a
label, so every stop ellipsised to an initial and the line read `נמל הת… — S. — S. — D.` —
the owner's _"no one can get any info from just the initials"_. It is deleted from the live
page and kept in the PDF, which lays the same eight labels across an A4 column and prints
them whole. The strip was always a width bet and only one of the two media can afford it.
The phone keeps the line that said the same thing in words: the trip's own route title.

**§4 · Both ends of a time, where there are two.** `startLabel` and `endLabel` were both in
the contract and both renderers printed only the first, so an eleven-hour flight and a
forty-minute drive were the same shape of line (_"flights must show when they start and when
they finish"_). The masthead's own line stopped wrapping at the same time: it is short and
fixed, so it says `nowrap` and the strip beside it yields instead.

**Deferred, deliberately: the journey as a unit.** _"Layovers must be represented … Flights
should be clumped together, not split by days"_, and _"maybe these sharings should have
sections for important stuff"_. This changes the day's **structure** rather than its words —
§1 made the daypart the spine, and a journey spanning two dayparts and a midnight has no home
in it — so on the owner's call it goes to a mockup rather than into this pass. The derivation
is already known and is written down in the backlog: `Event.bookingId` is `@unique`, so
nothing stored says two legs are one journey, but a leg continues the one before it exactly
when the previous leg's `toPlaceId` is its `fromPlaceId`. A half-built contract for it was
written and reverted rather than shipped ahead of the drawing.

## Amendment — a share tells the trip's story, not its database (2026-08-30, fourth pass)

The owner opened their own twelve-day Iceland trip at `הכל` and reported: _"the live sharing when all is shared is an abomination, looks disgusting, nothing is linked to the events!"_, then on the PDF _"the texts are meaningless and the alignment is so bad … Why נתב״ג to Frankfurt?? What does it have to do with anything? What's the teal random places on top? Bad event ordering when it comes to the flights and hotels … no layover detection and visualization"_. The frame they set for the fix is the section title: _"Sharing should tell a story, not present information in a misleading way like it does now."_

Two mockups were drawn against that trip and rendered before anything was built — [`a-shared-itinerary-tells-the-trip-v4.html`](../../mockups/a-shared-itinerary-tells-the-trip-v4.html) and [`a-shared-itinerary-is-printed-as-a-story-v3.html`](../../mockups/a-shared-itinerary-is-printed-as-a-story-v3.html) — and the catalog entries carry their measurements. What follows is what they promoted and what shipped.

### §1 · The appendix dissolves, and this reverses §4's third bullet

§4 said _"Everything moves selected sensitive data into an appendix."_ That was wrong, and the diagnosis is not a privacy one: **the flatness was a missing `join`, not a constraint.** `Note.eventId | bookingId | placeId | documentId` has been a closed union since the first migration, and `buildAppendix` queried `where: { tripId }` and dropped it — so seventy-nine notes printed as one undifferentiated list at the end of a page whose events they belonged to, which is exactly _"nothing is linked to the events"_.

So a note, a task, a confirmation code and a file now ride the row they are attached to, as one `SharedOp` union (`SHARE_OP_KIND` = `CODE | NOTE | TASK | FILE`) behind a per-row fold on the reader page. **The appendix survives, narrowed to what is attached to nothing** — a packing list is a real thing and it has no event. The booking block left it entirely: `Event.bookingId` is `@unique`, so every booking has a host by construction and its code prints under its own row.

**A privacy defect closed with it, and it deserves naming separately.** The share sheet's toggle says `רק תוכן שמחובר למסלול` and the query said `where: { tripId }`; the promise and the code disagreed, and the repair is the linkage filter the copy always described.

### §2 · A journey is one row, and the gap between its legs has a name

The third pass deferred this to a mockup (_"Layovers must be represented … Flights should be clumped together, not split by days"_). The mockup was drawn; this is the build. Nothing stored says two legs are one journey, and nothing needs to: a leg continues the one before it exactly when `previous.booking.toPlaceId === next.booking.fromPlaceId`, and the layover is the gap between the previous leg's `endsAt` and the next leg's `startsAt`. `SharedEvent.legs` (minimum two, each with its own code and endpoints) is the shape; a single-leg journey stays an ordinary row rather than a one-item list.

### §3 · Where you sleep frames the day

The stay was a row, sorted into the afternoon by its check-in hour — which on the outbound day put a hotel between the two legs of a flight (the _"bad event ordering"_) and printed `15:00–11:00`, a range that reads backwards because a stay crosses midnight. It moves into the day header as `לינה ב-X`, which is what it always was: the frame, not an item.

### §4 · A trip has a shape, and the day titles follow it

Owner, on the fixture: _"it says Reykjavik → Snæfellsnes but it is actually a circumnavigation (טיול מתגלגל maybe), where you switch locations every day … Then there's טיול כוכב where you stay at one place … we should differentiate between them and display the titles accordingly."_

`tripShapeOf` reads the sequence of stays, collapses consecutive repeats, and classifies: one base is a **star** trip, first base equal to last is a **loop**, otherwise a **line**; no stays at all is `UNKNOWN` and says nothing. The masthead states the shape and, where the shape implies several, the base count — suppressed at one, since `1 בסיס` on a star trip is the same sentence twice.

The shape then picks the day's title: **region → kind → (on a star trip) the day's own significant place → the route**. A day of four waterfalls in Suðurland is named for the region, not for two of its waterfalls; and on a star trip, where every day's route starts and ends at the same base, the route is the one derivation guaranteed to say nothing. `region` and `kind` come from two new enrichment fields (ADR-0166 §23, `P131` and `P31`) — both claims on an entity the identity pass already reads.

`fallbackTripTitle` now returns the trip's **name** first. Its first-place-to-last-place derivation over the whole schedule is why the masthead read `נתב״ג → Frankfurt`: on any trip you fly to, both ends of the schedule are transit airports. Both values were already in the projection.

### §5 · One photo a day, which reverses §3's "no new media dependency"

§3 refused imagery, and the refusal named its reasons: _"media, licensing, privacy, attribution, and availability work."_ Every one of those was answered in the eight weeks since, by a pipe built for a different purpose. ADR-0166 §7 holds **our own bytes at our own URL** under a free licence with a stored credit, cached by the service worker, refreshed out of band. So this is not "adds media"; it is spending something already paid for.

What is new is the **gate**, and it is stricter than any read surface's: `MATCH_METHOD_CONFIDENCE ≥ 0.9` **and** a non-empty credit. A wrong thumbnail in your own app is a shrug; a wrong photograph on a page you hand to somebody else is not recoverable. There is no default image and no placeholder — a day whose stops clear no gate simply has no photo, and both renderers have a no-photo layout rather than a hole.

**Which stop's photo** is a ranked choice, not the first pin: dwell minutes, plus a bonus for a booked or hard commitment, plus `log10(1 + userRatingsTotal) × 30`, plus a small bonus if anybody bothered to nickname or icon it. Sitelink count was considered and rejected — the provider filters sitelinks to `hewiki|enwiki` (Tokyo has hundreds), and `userRatingsTotal` gives the same tiebreak free. `rating` was rejected too: every scenic place is 4.5–4.8.

**On paper the same decision inverts twice.** A 116px band is nothing on a page you scroll and about a page and a half across twelve days at two-column density, so print gets a 34px square inside the header's existing 47px minimum. And the credit rides the `alt` rather than a caption, because the licence line for a whole document is the appendix's job and not every square's.

**The renderer aborts every request the page makes**, so the photo arrives as bytes: `dayPhotoDataUrls` reads each blob behind the same key-prefix check the public route makes and inlines it as a data URL, exactly as the QR and the fonts already do. This is not a policy the renderer may make an exception to — it is what makes a PDF of somebody's itinerary unable to phone anywhere.

### §6 · The row says what a thing IS before it says where

_"hotels and other derivable stuff texts should be enhanced … and that also includes bookings."_ A booking states its type, so `The Hill Hotel at Fludir` gets `לינה` in front of its hour and stops being a bare proper noun. An event no booking backs is captioned with nothing: a guess in that slot is worse than a gap.

Times follow the owner's call from the mockup round — **the start only, except for hard pins and bookings**, where both ends print. A flight's arrival is a fact you plan against; a soft stop's end is an estimate, and printing it as a range makes it look like one of the former.

A bookings block (`ההזמנות`) sits above the schedule on the reader page, each row jumping to its day. It is deliberately **not** on paper: whoever holds a printout has the whole document in hand, and the count already prints as a tile. The section was first drawn as `מה שקבוע` and renamed on the owner's call — _"makes no sense in Hebrew"_.

### §7 · The teal strip goes from paper too, one renderer behind

`.pdf-route-mini` was the capped `routeLabels` sample beside the QR — Dyrhólaey, Stokksnes, Svartifoss and an airport, on a ring road. It came off the reader page in the third pass and kept printing for a week: **the same defect one renderer behind**, which is the argument for one ADR section covering both renderers rather than two fixes. The tiles beside it changed with it — days, **nights** and bookings, all three derived from what is already there, replacing a pin count that read `12 אזורים` and told nobody anything.

### §8 · A shipped bidi defect both renderers wrote

`<strong dir="auto">` sets the element's **base direction**, and base direction drives `text-align: start` as well as bidi resolution. So a Latin place name landed **229px from the start edge of a 288px column** while its own Hebrew caption sat at 0 — most of what _"the alignment is so bad"_ meant on a trip where most stops are Latin. The fix is `autoIsolate` (FSI…PDI) from `lib/bidi.ts`, whose docblock covers a **composed line joining several values** and therefore left the case of a single value alone in a block uncovered — which is why it survived ADR-0118's sweep. Both renderers now measure 0px. The same shape is worth a repo-wide grep and that line stays in the backlog.

### §9 · Two field reports that were not about sharing's design

- **The link at `הכל` was invisible, and it was not a stale bundle.** The owner refused that explanation twice (_"no matter what you say I don't buy your explanation … I think that you're missing something"_) and was right. `.share-send` is a flex item with `overflow: hidden`, and CSS Flexbox §4.5 removes a flex item's automatic minimum size once its overflow is not `visible` — so in a scrolling flex column it shrank to zero. `flex: none` fixes it. **A DOM test could not see this**: the element was present, mounted, and had the right text.
- **A shared document downloaded with no extension.** A document's name here is its **title**, and a title has no extension — so the reader saved `כרטיס טיסה TLV`, which the phone has no type for. In the app this never showed, because the viewer fetches bytes and renders them against the `mimeType` it already holds; a download has only the name. `attachmentDisposition` now appends the extension for the served `Content-Type`, skipping it when the title already ends in one.

### What was verified

`pnpm typecheck`, `pnpm test` (all four packages) and `pnpm build` green. Both mockups rendered at both themes and 360/390px with no console errors and their measurements read off the live DOM. Both PDFs re-rendered to page images and inspected. The day photo was rendered into a real A4 page with the route abort in place: five squares, five loaded, **zero failed requests**, header height unchanged at 47px, and the no-photo header collapsing to `48px minmax(0,1fr)`.

Two build hazards are written here because they cost real time and neither could fail a test. **The new print CSS was appended above the original block** and lost silently at equal specificity — a flight's range printed over its own title while the smoke verifier's overprint check passed throughout; the block now sits last in the sheet and a spec asserts that ordering. And **`ltrIsolate` around a duration reorders it**: `14ש׳ 50דק׳` became `שׂ50דק׳ 14`, because the isolate must island the **number**, not the number-and-unit — that is what `measure()` is for.

## Amendment — the fourth pass, corrected in production (2026-08-30, fifth pass)

The fourth pass shipped and the owner read it on their own trip. Seven reports, and one of
them says that an amendment written above is **wrong about what it did**.

### §1 · The privacy fix did not land, and this ADR said it had

The fourth amendment's §1 claims the notes-linkage defect was "closed with it". It was not.
`loadOps` was written to filter by linkage and does — but `buildAppendix` was left in place
beside it, running its own `where: { tripId }` queries for notes, tasks and documents with no
join at all. So the toggle promising `רק תוכן שמחובר למסלול` went on publishing **every note
in the trip**, and every note that DID have a host printed **twice**: once on its row and once
in the appendix. That second copy is what the owner saw as _"the לקראת הטיול section is a
really badly formatted wall of text"_ — the block was not badly formatted so much as it was
the whole trip's notes.

**Two things are worth naming, because neither was bad luck.**

The first is that this is [ADR-0096](0096-domain-claude-md-files.md)'s exact anti-pattern —
two mechanisms answering one question — introduced by the change whose whole purpose was to
remove one. The rows' ops and the appendix were built from different queries and only one of
them knew about linkage.

The second is the test. `sharing-projection.service.spec.ts` asserted that the **unattached**
note appears in the appendix, and never that the **attached** one does not. A one-directional
assertion passes identically whether the filter exists or not, so the suite was green
throughout. The missing half is now written, and it is the half that had the value.

The repair deletes `buildAppendix`'s queries entirely: the appendix is `loadOps`'s
`unattached` — which was already being computed and thrown away — and `travelers`, which is
not an op and hangs off no row. `sharedAppendixSchema` therefore drops its three per-family
shapes for one `ops: SharedOp[]`, so a note in the appendix and a note on a row are the same
shape rendered by the same component on both renderers.

### §2 · English prose is not a value, and §8 over-corrected

The fourth pass's §8 replaced `dir="auto"` with `autoIsolate` wherever a foreign-script value
sat alone in its element. That is right for a **value** and wrong for a **paragraph**: an
isolate inherits its container's direction, so an English description sat in an RTL column and
came out right-aligned and ragged-left (owner: _"English lines are ltr and shouldn't be
treated differently"_).

The rule, stated properly this time:

> **A value that shares a line with other content is isolated and keeps the line's
> direction. A standalone block of prose carries `dir="auto"` and picks its own.**

A title is the first kind — it has to line up with the caption beneath it, which is what §8
measured at 229px of separation. A stop's description and a note's body are the second.
Verified by rendering: the English caption resolves `direction: ltr`, the Hebrew one `rtl`,
both at `text-align: start`.

### §3 · A description is capped at the source, and its two-line clamp never existed

_"Too long descriptions, if there's an option to shorten them or cap the length."_ Two
separate faults. The projection shipped the enrichment summary whole — five lines of Wikipedia
lede on an A4 column with twelve days to fit — and `.sh-cap`, which the code comment described
as clamped to two lines, **was never written into the stylesheet**, so the caption inherited
`.sh-place-line`'s `nowrap` and got exactly one.

So: `capCaption` cuts at a sentence boundary within 150 characters (a word boundary and an
ellipsis otherwise) in the projection, where both renderers get it — CSS cannot help paper,
which has no scroll — and `.sh-cap` now exists and clamps to the two lines it always claimed.

### §4 · A journey is chained over the trip, not inside a day

_"Sometimes journeys with layovers aren't recognized properly, for example when it crosses a
day."_ `withJourneys` walked one day's own event list, so a red-eye departing 22:40 and
landing 01:15 was two unrelated rows on two days — the shape of flight most likely to have a
layover was the one case the layover feature could not see. The chain condition never had
anything to do with the calendar; only the loop did. `chainJourneys` now runs once over every
scheduled event in trip order, and a journey belongs to the day it **departs** on, which is
the day a reader is packing for.

### §5 · The bookings block moves under the days and stops teleporting

_"the הזמנות is at the start of the live sharing, and clicking on a booking teleports you down
which is inconvenient. Does it have to be this way?"_ No. The fourth pass put it above the
days on the reasoning that a reader looks for flights first — but every row was an
`href="#day-N"`, so the one gesture the block invited threw the reader down a twelve-day
document with no way back.

It is a **reference**, not a lede: what is booked, and when. So it sits after the schedule it
refers to, and each row **states** its day (`יום 4`) rather than scrolling to it. That answers
the question the anchor was answering without moving anybody. Paper already worked this way
and needed no change: a printout's reader has the whole document in hand.

### §6 · The stay glyph had no gap, and `gap` was not the reason

`.sh-stay` said `display: inline-flex; gap: 5px`, and `.sh-day-copy span` — one point more
specific — says `display: block`. The element was never a flex container, so the gap did
nothing: measured 0px. Winning the specificity fight would have cost the line its ellipsis,
since `text-overflow` cannot clip an anonymous flex item, so the icon takes a margin instead.

**This is the third defect in this ADR's history caused by an equal-or-higher-specificity
rule landing on top of a new one**, after the print CSS block and the hover-vs-pressed rule
in `frontend/CLAUDE.md`. The lesson is not "check specificity"; it is that a declaration
which silently loses looks exactly like one that was never written, and only a computed-style
read tells them apart.

### What was verified

Rendered at 390px in the dark theme and measured off the live DOM: the stay gap is 5px (was
0), the English caption resolves `ltr` and the Hebrew `rtl`, the document link carries
`download` and still meets ADR-0017's 44px floor, the bookings block follows the days and
contains zero `#day-` anchors. The cross-day journey has a backend spec of its own.

**And what was not.** The owner also reported _"the links don't work"_ on the documents
section. The route itself is provably fine — fetched against production, a document id that
does not exist returns a clean 404 JSON and the PDF (same controller, same
`attachmentDisposition`) downloads through the apex→www redirect with a correct filename — and
the rendered anchor now carries the right href, a `download` attribute and a 44px target. What
could not be reproduced is the owner's actual symptom, because their share was back at `full`
by the time it was investigated and `full` carries no documents. Recorded as open rather than
claimed as fixed; the previous amendment's mistake was claiming exactly this kind of thing.

## Amendment — twelve reports, and the same failure three times (2026-08-30, sixth pass)

Twelve from the owner reading the fifth pass on their own trip and its PDF. Several are one
sentence each; three of them are the same defect in three materials, and that is the entry
worth reading.

### §1 · A note is prose the app already knows how to render

_"Markup should be formatted the same way as in the notes sheet, urls should be added as well
similarly."_ The shared page printed a note's body as a flat string, so `- item` stayed a
hyphen and a url stayed unclickable — while `NoteProse` + `lib/note-markdown.ts` had rendered
headings, lists, quotes, emphasis and linkified urls since ADR-0202. Reusing it costs nothing
and is the only way the two surfaces cannot drift about what a marker means (ADR-0096). It
also answers the direction question better than the fifth pass did: `baseDirection` reads the
whole body, so a Hebrew note opening with `TL;DR` is not laid out left-to-right by its first
three Latin characters.

Paper keeps the flat body, with its line breaks preserved (`white-space: pre-line`) and the
font fixed — the parser lives in `frontend/src/lib` and the backend cannot import it. Moving
it means moving `bidi.ts` too, which has ~40 consumers; that is a refactor to ask about, not
one to take silently (root rule 8), and it is a backlog line.

### §2 · Tasks are not a viewer's business

_"tasks should be taken out, they're irrelevant for viewers."_ A task is the group's own chore
list — who is buying the adapter — and a person reading a shared itinerary is not the person
doing it. `TASK` leaves `SHARE_OP_KIND` entirely rather than being filtered at a renderer: a
union member that can never occur is a case every switch still has to carry. The task query is
deleted too, which is the difference between not showing them and not loading them. The
`includeNotesAndTasks` column keeps its name (renaming it is a migration) and now governs
notes alone.

### §3 · A layover names the airport you are sitting in

The line read `המתנה בוינה ← קפלאוויק` — the leg you are about to fly, not the place you are
waiting. Both renderers composed it from `leg.title`, which is a route. `layoverPlace` joins
the leg (the previous leg's arrival, which is this leg's departure) and the copy takes that.
The unit fixture hid this by giving legs bare city names as titles, where composing from the
title happens to read correctly; the fixture now uses real route titles.

### §4 · A nine-hour wait is not a layover, and treating it as one emptied a day

_"the next flight is only at 11am to 3pm, so well after the previous day, yet it shows on the
prev day. The last day is then rendered empty."_

The fifth pass chained journeys trip-wide, which was right, and gave the chain no maximum,
which was not. A journey renders on the day its first leg departs; a 02:00 departure belongs
to the night before (`sharePreviousNight`). So a leg landing at 02:00 chained to one departing
at 11:00 dragged the entire return two days back and left the trip's last day blank.
`MAX_LAYOVER_MINUTES` is six hours: long enough to keep the 110-minute connection the cross-day
fix was built for, short enough that a wait you could spend in a city stays two rows on the two
days it occupies.

### §5 · A day is named for where its journey ENDS

_"the title is טיסה לפרנקפורט even though Frankfurt is the connecting flight."_ `flightTo` took
the day's last flight's arrival, which on a connection is the airport you change planes at —
a place nobody chose to visit. The chain already knows its own final leg, so the title asks it.
`returning` moved with it: a return that straddles midnight makes **both** days the way home,
where an index comparison made only one.

### §6 · Summary carries no booking ledger (owner's question)

_"Should summary mode show bookings? It seems excessive for a summary, no?"_ Correct, and it
contradicted §1's own levels: inspire / orient / operate. A ledger of dates and providers is
the middle two. It is not projected at Summary rather than not drawn — this file's rule is that
the level decides what is **sent**, which is what the spec named _"Summary shows no exact fact
the projection did not send"_ is for. It had been slipping past that spec because a date is a
fact nobody thought to check. The PDF's third tile counts events at Summary rather than leaving
a hole in a three-column grid.

### §7 · Travelers are the trip's identity, not a block at the foot

_"they should just appear on top if they're on the permission list - both live and pdf."_
`travelers` moves from `appendix` to `trip`, and both renderers print it under the trip's own
line. A block at the foot is where a fact nobody asked for goes.

### §8 · The type scale, and why this page gets its own

_"Fonts are too small in the details and very hard to read, also the notes, and overall too
small texts."_ The page was built out of `--text-micro` (10.5px) in fourteen rules. Those steps
are sized for a dense operational UI held by someone who already knows what every row means;
this is a **document**, read once by a stranger who is often standing up. Local `--sh-*`
variables one step up rather than a change to `tokens.css`: the app's density is not this
page's to re-decide.

### §9 · The same failure, three times, in three materials

This is the entry that matters.

- **A leg's time range wrapped to two lines** because `.sh-leg-row` sized its first column at a
  fixed `78px`, which fitted `14:30` and not `14:30–18:15`. Now `max-content` with `nowrap`, so
  a type scale that grows cannot break it again.
- **The PDF's note body printed as empty rectangles.** `.pdf-ops-line` set the `font` shorthand
  to JetBrains Mono, which ships **no Hebrew** — while the bold label beside it, which
  overrides back to Assistant, printed perfectly. That is ADR-0213's own recorded defect
  (`.pdf-subtitle`, the `font` shorthand replacing the family list) in a second element.
- **And the size fix silently did nothing**, because `.pdf-op span` — a leftover from the
  per-family appendix markup deleted in the fifth pass — is (0,1,1) and beat `.pdf-ops-line`
  at (0,1,0). It held the line at 7.8px however large this file said to set it.

Three surfaces, one shape: **a declaration that loses looks exactly like one that was never
written.** The fifth pass recorded this after the stay's `gap`, the caption's clamp and the
appendix's filter; it recurred within one pass. Reading the source that "has" the rule proves
nothing. Only a computed-style read does, which is how all three of these were found.

### §10 · A heading may not be the last thing on a page

A section title landed alone at the foot of page 4 with its content on page 5.
`break-after: avoid` on `.pdf-ops-title`, `.pdf-section-title` and `.pdf-part-head`.

### §11 · Paper prints no file

_"why are there documents there? They're unreachable on the pdf."_ A filename on paper is a
promise the medium cannot keep. The live page keeps them, where they download.

### §12 · The row §8 missed

_"the ltr English rows issue still exists."_ The **Summary** event row still wrote
`<strong dir="auto">`, so an English title left-aligned out of the column while its own icon
stayed at the RTL start edge. §8 repaired the detail rows and never touched this path. A title
beside an icon is a value: it is isolated and keeps the column's direction.

### What was verified

Measured off the live DOM at 390px dark: leg times on **one** line at 21px, the layover reading
`המתנה בוינה · 165 דקות`, travelers in the masthead, body text at 12.5px (was 10.5), and the
appendix note rendering 2 list items, 1 linkified url and 1 inline bold run. On the A4 render:
`.pdf-ops-line` computes `Assistant` at **8.6px** (was JetBrains at 7.8px), `pre-line` holds,
`break-after: avoid` applies to all three headings, and a `FILE` op prints nothing at all.

Two things the render caught that reading had not: the inline-bold rule above, and a CSS rule
of mine scoped as `.sh-op-note strong`, which was styling every `**bold**` run inside
`NoteProse` and breaking each onto its own line.

## Amendment — the report that took four rounds to reproduce (2026-08-31, seventh pass)

Eight reports on the sixth pass. One of them closes something that had been open since the
first.

### §1 · The document links always worked, and said nothing

_"When clicking on a document to download it, it simply downloads in the background, giving
no indication that it's downloading or that it was downloaded successfully."_

Three passes carried a backlog line reading "the owner's document-link symptom is unexplained,
and the route is not the cause". Every measurement said the route was fine — a clean 404 for an
unknown id, a correct filename through the apex redirect, a 44px target, a `download`
attribute — and every one of those measurements was right. **The bug was the absence of
feedback.** A bare `<a download>` hands the file to the browser and the page says nothing at
all; on a phone the download shelf is a notification you may not even see, so a tap that works
is indistinguishable from a tap that does nothing.

The lesson is worth more than the fix. Four rounds were spent proving a mechanism correct
while the report was about the _experience_ of using it, and the two never met because "does
not work" was read as a claim about the mechanism. **A report about what a control feels like
is not answered by proving the control functions** — the same shape as ADR-0195 §4's stuck
hover, where a complaint about appearance was twice closed by asserting state.

The row now fetches the bytes itself and reports the three states it can honestly know:
`מוריד…`, `ירד`, `לא הצליח`. That costs holding one file in memory — affordable for a
boarding pass — and it is the only way to say "finished", because a native download tells the
page nothing. The href and `download` attribute stay, so a long-press "save link" and a
no-JavaScript reader both still work.

### §2 · A journey that spans midnight makes one card, not one card and a blank one

The sixth pass capped a chain at six hours to stop a return swallowing the trip's last day.
The owner's actual layover is 05:50 → 11:10 — **five hours twenty**, under the cap — so it
folded anyway, and the last day still rendered empty.

Shaving the threshold again would only move the seam, because the return genuinely occupies
both dates: it leaves Iceland at 02:00 and lands in Tel Aviv at 15:25 the next afternoon.
`SharedDay.endDate` says so, and `absorbSpannedDays` folds a following day into the card **only
when that day is otherwise empty** — a day with its own morning keeps its own card. The header
then reads `21–22`, which is where the time actually went. The owner proposed this
(_"maybe for long journeys like these the days should be combined to one somehow"_) and it is
a better model than any threshold.

### §3 · Durations are words, and the app already had them

`260 דקות` for a layover. The app has had one duration ladder since ADR-0114
(`lib/duration.ts`'s `hoursPhrase`) and one zone pill since ADR-0107 (`ZoneShiftPill`); the
shared page was wording neither. It now spends both, and the projection ships
`durationMinutes` / `zoneShiftMinutes` as **numbers** so each renderer owns its words — the
same rule that keeps the day titles renderer-agnostic. Paper gets `pdfSpan` in
`itinerary-pdf.copy.ts`, which is the file that exists to hold the backend's only Hebrew.

A journey's facts are the JOURNEY's: spreading the head leg gave the row leg one's duration
and leg one's shift, which on a two-leg return understates most of a day.

### §4 · The note parser moves to `packages/shared`

_"In the pdf, markdown not formatted."_ The sixth pass backlogged this as needing `bidi.ts`
and its ~40 consumers to move; that turned out to be the right move and a cheap one.
`bidi.ts`, `external-url.ts` and `note-markdown.ts` are all pure — no DOM, no clock, and
`note-markdown`'s only Hebrew is a script RANGE in a regex rather than a word — so they belong
in shared, and re-export shims at the old paths left every existing import untouched. `NoteProse`
stays in the frontend, because painting is the frontend's half.

One thing had to be declared rather than imported: `packages/shared/tsconfig.json` sets
`lib: ["ES2022"]` and no `types`, which is what makes `document` and `process` fail to compile
inside a package whose whole contract is that it talks to neither. Reaching `URL` by adding
`DOM` or `@types/node` would buy one constructor and open that door for everything else, so
`platform-url.d.ts` declares exactly the members used and nothing more.

Paper renders the AST rather than the markers, with one divergence from the screen that is a
property of the medium: **a printed link cannot be tapped**, so it prints its destination —
except where the label already IS the address, which is what `prettyUrl` produces for a bare
url and which printed `flydrone.is https://flydrone.is/`, the same thing twice.

### §5 · The title printed twice, and the fourth pass caused it

`fallbackTripTitle` was changed to return `Trip.name` — which fixed a masthead naming two
transit airports and, unnoticed, made the deterministic narrative title identical to the `<h1>`
a centimetre above it. Both renderers now skip the lede line when it is the trip's own name; a
GENERATED narrative still has something of its own to say, so the line stays for that case.

### §6 · The font shorthand, a seventh time

`.pdf-ops-line` set `font: 400 8.6px 'Assistant', sans-serif` — and the body's `'Noto Emoji'`
went with it, so a note written with 🚁 printed an empty rectangle. This is the same shorthand
that ate the Hebrew face on `.pdf-subtitle` and again on this very rule one pass ago.

**The rule this file now follows: prefer `font-size` and `font-family` as separate properties.**
A shorthand that silently drops a family the reader needs is not worth the character count, and
a spec asserts both that `'Noto Emoji'` is in this stack and that the rule does not use the
shorthand at all.

### §7 · A Hebrew prefix binds to a Hebrew word

`12 ימים ב-איסלנד` should be `באיסלנד`. The comment that used to sit on that line argued for an
unconditional MAQAF and was half right: `ב-Iceland` IS the convention before a Latin word, and
`ב-איסלנד` is simply wrong before a Hebrew one. `bindPrefix` asks `baseDirection` and decides
per value; it lives in shared beside it, so the screen's copy and the printer's copy cannot
disagree about a grammar rule.

### §8 · A note is read, not glanced at

Reported twice. `--sh-micro` is this page's smallest step and right for a label beside a value;
a paragraph somebody wrote for the group to act on is body text and now gets the body step.

### §9 · The reader is a document, and stops inheriting the app's posture

_"The live share should not inherit some of the app's quirks: it should be able to refresh,
zoom in/out etc."_

ADR-0062 turned zoom off app-wide and `tokens.css` contains overscroll so the browser's
pull-to-refresh never fires — both to make the app feel native, and both right for the app.
`/s/<code>` is not the app: it is a page a stranger opens in a browser tab, often standing up,
sometimes without the reading glasses they need. **A document you cannot enlarge is a document
some people cannot read**, and a page that swallows a pull looks stuck when the network drops.

Three mechanisms had to agree, which is why this is one switch rather than three edits: the
viewport meta's `user-scalable=no` (Android honours it), `index.html`'s gesture blocker (iOS
ignores the meta, so pinch is suppressed in script), and `tokens.css`'s `overscroll-behavior`
and `touch-action`. `usePublicReaderChrome` sets `data-public-reader` on `<html>` while the
screen is mounted and swaps the meta; the script and the stylesheet key off that attribute.

Two details are load-bearing. The meta is **swapped and restored**, not removed — this screen
is a route inside the same SPA, so leaving it has to give the app back the exact string it
booted with, and an app left zoomable is the same bug in the other direction. And the CSS opt-out
is a variant block **after** `:root`, never a selector on it: putting one there is how this
repo once lost its whole token set to `[dir='ltr']` (`frontend/CLAUDE.md`).

The precedent already existed — `.doc-viewer` opts back into pinch for the image preview — so
this extends an escape hatch rather than inventing one.

### What was verified

Measured off the live DOM at 390px dark: **one** occurrence of the trip title (was two), a day
header reading `21–22`, `המתנה בפרנקפורט · 5:20 שע׳` (worded, and the prefix bound without a
hyphen), travel facts reading `13:05 שע׳ · +3 ש׳` on the journey and on each leg, note prose at
15px, and a download that goes `working` → `done` with `ירד` on the row. On the A4 render:
`.pdf-ops-line` computes `Assistant, "Noto Emoji", sans-serif` at 9.4px, the note prints as a
heading, a numbered list, a bold run, a rule and a quote rather than as its markers, and a bare
url appears exactly once. And a unit spec asserts the chrome switch both ways: mounted, the
attribute is set and the meta carries neither `user-scalable=no` nor `maximum-scale`;
unmounted, the app's original string is back verbatim.

## Amendment — a rule the repo had already written down (2026-08-31, eighth pass)

Six owner reports. Five are small; the second is a design correction, and the fourth is the
one worth reading — a defect class this repo had **documented, guarded and then shipped
anyway**, in ten places.

### §1 · A card covering two days names both weekdays

`21–22 שני` says the card is Monday when it is also Tuesday. Both renderers derived the
weekday from the first date only, having been taught the range for the NUMBER in the seventh
pass and not for the name beside it. Both ends now, one en dash, in both renderers. Two
Hebrew names need no isolate — which is the whole subject of §4.

### §2 · A journey is a frame with legs, not a peer row plus its legs

> _"Flights have a row for the entire journey (נתב״ג אל קפלאוויק) but also rows for each
> flight. Both pdf and live. This is confusing and should be changed."_

**The seventh pass caused this.** Giving a leg its own `durationMinutes` and
`zoneShiftMinutes` — right in isolation, since the app shows both on every event row — put
**four durations and three zone shifts on one flight**, measured on the reproduction:

|       | route                  | clock       | duration | zone |
| ----- | ---------------------- | ----------- | -------- | ---- |
| frame | `Keflavík ← נתב"ג`     | 23:40–11:55 | 11:15    | +3   |
| leg 1 | `Keflavík ← Frankfurt` | 23:40–02:30 | 2:50     | +2   |
| wait  | Frankfurt              |             | 5:20     |      |
| leg 2 | `Frankfurt ← נתב"ג`    | 08:50–11:55 | 3:05     | +1   |

So the totals belong to the **journey**, whose two ends are the pair a reader is actually
comparing, and a leg answers only when it leaves, when it lands, and which flight it is. The
wait keeps its minutes, being the one span neither end states. Measured after: two durations,
one zone shift. Both fields are **gone from `sharedLegSchema`**, not merely unrendered — the
contract should not carry a value no renderer may use, and typed access now fails to compile,
which is a stronger guarantee than a spec.

The frame's row survives rather than being replaced by a heading, because the ops, the
caption and the map link hang off it; dropping it would have cost the booking codes.

### §3 · The absorbed day stops at the day the journey lands on

Found while reproducing §1, not reported. The seventh pass's `absorbSpannedDays` swallowed
**every** consecutive empty day, so a journey landing on the 8th followed by an unplanned 9th
printed `07–09`: a three-day card for a two-day flight, telling the reader they are in the air
for a day nobody has planned yet. Bounded by the journey's own last arrival.

### §4 · `ltrIsolate` around a Hebrew phrase — ten sites, and the rule was already written

> _"The numbers and the Hebrew are reversed sometimes, it shows שע' 3:30 instead of 3:30 שע'.
> Please do a sweep and find and fix all of these."_

The screenshot's own card carried the answer: the layover line beside it read correctly. Both
lines hold `number + Hebrew unit`; only one of them was wrapped in `ltrIsolate`, which forces
its whole run left-to-right so the reader meets the unit first.

**What makes this the interesting one is that nothing here was unknown.** `bidi.ts`'s header
comment states the rule and names this exact output — _"forcing `dir="ltr"` over the whole
token lays it out left-to-right, so a Hebrew reader meets the unit before the number (`ק״מ 9`
for what should read `9 ק״מ`)"_ — the file exports `measure()` to do it correctly, ADR-0118
swept 75 sites for the attribute form, an ESLint guard blocks that form, and
`place-summary.ts`'s docblock had already recorded that the guard **cannot see the helper
form**. Every piece of knowledge was in the repo; ten call sites violated it anyway.

Seven forced Hebrew left-to-right:

- the reader's travel facts (`ltrIsolate(hoursPhrase(…))`) — the screenshot;
- the PDF's facts line **and** its layover (`ltr(pdfSpan(…))`), so paper had it twice;
- four task due-labels (`ltrIsolate(\`${due.day} ${due.time}\`)`) — and `dayLabel` returns
Hebrew in **every** branch (`היום`, `מחר`, `יום 5`), so every task with a due time was
  reversed, on four surfaces, in the app itself rather than in sharing.

Three used the wrong isolate for text the app did not write, where the rule is to **ask** the
run rather than force it: a markdown link label in `note-markdown.ts` and `NoteProse.tsx`
(`[לחץ כאן](…)` laid out from the wrong end — and `NoteProse` was already spending
`dir="auto"` on its anchor branch and `ltrIsolate` on its inert one, so one string rendered
two directions), and a Commons attribution in `place-summary.ts`, which is a person's name.

**The guard was extended rather than joined.** Two selectors — a Hebrew letter inside an
isolated template, and a call to any duration ladder (`hoursPhrase`, `pdfSpan`,
`approxDuration`, `approxTravelTime`) inside one — now sit beside the `dir="ltr"` selector
they belong with, composed into one `ISOLATE_SELECTORS` so the frontend and the other two
packages cannot drift. Scope widened to `backend/src` and `packages/shared/src`: `bidi.ts` and
the note parser moved into shared in the seventh pass and the print renderer spells its own
`ltr()`, which is precisely how `ltr(pdfSpan(…))` reached paper unseen. Verified by
reintroducing all three shipped shapes and watching each get flagged.

### §5 · The download shows how far it has got, and Chrome's overlay is not ours to summon

> _"The download indication is not enough. Why doesnt Google chrome pop up a download overlay
> like other places? And anyway it should have another animation for downloading."_

The suspicion was mine before it was measured: that intercepting the click and fetching the
bytes had displaced the browser's own download UI. **Measured, and false.** Driving a plain
navigation anchor and the fetch-then-blob path side by side in Chromium, each engages the
download manager identically — `download` fires with the right filename for both. What Chrome
then _draws_ is its own call, and a page cannot ask for the bubble.

So the row carries the progress instead, and because we already hold the response it can be
**real**: the body is read through a stream and the bar tracks bytes against `Content-Length`.
Where the server declares none it runs indeterminate, and deliberately in a different shape —
a block travelling the track, not a fill growing from the start edge — so "I don't know how
long" never reads as "I am 30% done". Neutral `--cta`, because amber is time and commitment
only (rule 4).

### §6 · The reader's own scroller was why refresh stayed broken

The seventh pass opted the public reader out of `overscroll-behavior` and `touch-action` and
called refresh fixed. It was not, and the reason is that `overscroll-behavior` only decides
what happens when a **scroll container** runs out of content: `.sh-page` is a `100dvh` inner
scroller and `html, body` are `overflow: clip`, so the viewport was never a scroll container
and there was no overscroll for the gesture to read.

The document scrolls now — `:root[data-public-reader]` restores `overflow: visible`, and the
page is `min-height` rather than a viewport of its own. The two halves are one fix and neither
works alone, which is also why the earlier round looked done. **The e2e test is the part that
should have caught it**: it drove `.sh-page`'s own `scrollTo` and passed, asserting that
something scrolled without ever asking _who_. It now asserts the document scrolls and that
`.sh-page` is not a scroll container at all.

### §7 · A definite-width block ignores its parent's `text-align`

> _"I feel like the qr and link aren't aligned correctly together."_

Measured in the real A4 rather than adjusted by eye: `.pdf-qr-block` is `text-align: center`,
but `.pdf-qr` is `display: block` with `width: 46px` — and a block-level box with a definite
width does not respond to `text-align` at all. So the code sat flush at the inline-start edge
(`55..101`) while the caption under it was a full-width block of centred text (`0..101`): two
alignments in one unit, centres 27px apart. `margin-inline: auto` makes the block's own
declaration mean something for both children; centres now agree within 1px.

### What was verified

- `pnpm typecheck`, `pnpm lint`, `pnpm build` clean; `pnpm test` 505 shared / 1222 backend /
  4990 frontend.
- Live DOM at 390px dark: `07–09 שני–רביעי`; one facts line on the frame and two legs with
  none; two durations on the whole flight card; `11:15 שע׳` with its first character right of
  its last, so the run reads number-first; `data-public-reader` set, root `overflow-y: visible`
  / `overscroll-behavior-y: auto` / `touch-action: auto`, document scrolls, `.sh-page` not a
  scroller.
- A4: QR centre 50 against caption centre 51; both weekdays; no facts line inside a journey
  block; `5:20 שע׳` reading number-first off character boxes.
- e2e 17/17 across `shared-itinerary`, `trip-share-entry` and `shell-does-not-scroll` — the
  last of these being the proof that the app's own locked posture is untouched by the token
  change.

## Amendment — drawn before built, and two rules the app had already written (2026-08-31, ninth pass)

Three owner reports, all put to a mockup first because two of them are design questions and
the third is a correction of the eighth pass. Two files:
[`a-journey-is-a-flight-plan-v1.html`](../../mockups/a-journey-is-a-flight-plan-v1.html) and
[`the-reader-hands-you-a-file-v1.html`](../../mockups/the-reader-hands-you-a-file-v1.html).

**Built 2026-08-31**, the same day it was drawn, after the owner approved both files. What
the build changed, added or corrected is recorded per section below and collected under
_What the build changed_ at the end — the drawings were right about the shapes and wrong or
silent about four things.

### §1 · A journey is a container, and the eighth amendment fixed the wrong axis

> _"The flights with connecting flights still show both the full journey and the separate
> flights in a confusing way, also doesn't show journey leg durations (flights)."_

The eighth amendment read "confusing" as **duplicated numbers** and removed the legs'
`durationMinutes` and `zoneShiftMinutes`. The numbers were never the complaint. Two facts from
the code say what is:

- the journey renders through `article.sh-event` — the **same element, class and type scale**
  as a museum visit — and `.sh-legs` then indents by `padding-inline-start: 30px`. So the whole
  claim "these two are inside that one" rests on 30px of white space in a 360px column;
- the frame's title is `routeTitle(first.booking.fromPlaceId, last.booking.toPlaceId)` — the
  legs' own endpoints concatenated. `נתב"ג ← קפלאוויק` over `נתב"ג ← וינה` and
  `וינה ← קפלאוויק` is the same two airports three times. **The repetition a reader trips over
  is the places, not the durations** — which is exactly why counting durations missed it.

So: `.sh-trek`, a real container (teal rail plus a 7% tint, the grammar `.sh-day` already uses
one level up; teal because a journey is about getting between places, rule 4), and a header
that drops the glyph column and `--sh-secondary` so it cannot be read as one of the flights
beneath it. Measured: the journey goes **209.9 → 221px, +11.1px** — clarity, not compaction,
and the same trade v4 made when its journey block came in 7px taller.

The frame's row survives rather than becoming a bare heading, because `ops`, `caption` and the
map link all hang off the parent event: deleting it deletes the flight's booking code.

### §2 · A leg says how long it flies; the zone shift stays on the journey

`durationMinutes` comes **back** to `sharedLegSchema`, per leg, at `--sh-micro`.
`zoneShiftMinutes` does not: the owner asked for flight durations, and three signed numbers
(`+2`, `+1`, `+3`) describe one clock change, while the shift a traveller acts on is
origin-to-destination. Duration phrases on the card therefore go **2 → 4**, and that increase
**is** the request — worth stating plainly, since the eighth amendment's whole argument was
that four was too many.

### §3 · Paper says the same thing, waits included

The owner's screenshot was of the PDF, where `.pdf-trek` **already** draws a bordered box
around the legs — and it still read wrong. That is the proof the container alone is not the
fix: the header above it is what has to stop looking like a complete flight. The mockup's own
§3 first shipped without the layover line and the owner caught it in review (_"The pdf should
also show the wait durations"_); both paper columns now run through one leg renderer, so they
cannot disagree about which facts a leg carries. The wait matters most on paper: a reader
holding a printout cannot tap anything to find out.

### §4 · The download shows motion, because the app banned the static word in April

> _"The download indication still bad … still the same bad looking מוריד etc instead of a
> spinner or something."_

`ui/Spinner.tsx`'s docblock: _"The one shared spinner (ADR-0052 §4). Used by the document
viewer, the list load, and the upload busy state — so every async surface has a motion cue,
**not a static word**."_ And ADR-0052 §4 names the composition: a busy control shows its label
**plus** a spinner, with a determinate bar "where the transport allows it".

The shipped row has the bar and the word and no spinner. It implements two thirds of a rule
written four months before it, and the missing third is the one the owner noticed. So the
spinner takes the file **glyph's** slot — `FormActions` puts it where the label was; a file row
has no label to give up, and using the glyph's slot means the row's geometry never moves.
`--ok`/`--miss` for the two finished states, `--cta` for working, because a file arriving is an
action and not a status.

Two corrections to what shipped, both from the same rule: reduced motion **slows** the
indeterminate sweep to 2.6s rather than stopping it (`.spinner` itself slows to 1.6s, and a
stopped indeterminate bar is indistinguishable from a stalled download), and the row declares
44px — **measured live at 42px, under ADR-0017's floor**, which the whole download argument had
been happening on top of without anyone noticing.

### §5 · `shareFileOrDownload` is the mechanism, and the reader used only its silent half

> _"it still doesn't pop up the Google chrome saving, though maybe that'll be fine as long as
> we have a good looking animation"_

`lib/system-share.ts`'s `shareFileOrDownload` tries `navigator.share({ files })` first and
falls back to an anchor click. `FileOp` contains **those fallback six lines verbatim** —
createObjectURL, anchor, download, click, revoke — and never tries the share branch. On Android
that branch opens the system share sheet, which is a visible, cancellable confirmation a page
cannot otherwise summon. Measured in the eighth pass: both paths engage Chrome's download
manager identically, so the missing UI was never suppression — **we asked for the quiet one.**

And the shared helper carries the bug the one-off already fixed: it revokes the object URL in a
`finally` on the same tick as `click()`, which `FileOp`'s docblock explains can be "a download
that never starts". Two implementations, each holding half the answer. The repair folds the
`requestAnimationFrame` into the shared helper and gives the row its share branch — not a third
copy. The copy follows the mechanism: `ShareOutcome` returns three values, and `נשלח` and
`ירד` are not the same event.

### §6 · The reader's PDF button is the owner sheet's control, one more host

`.share-outcome` is already the owner's "get the PDF" button — 48px, download icon, the same
words. The public page gains it rather than a third button. Placement is the one open question
and is deliberately left to a device pass: the masthead is always reachable and costs 36px of a
42px bar (with `ValueToken`'s `::after` reaching 44px, ADR-0177, the technique `.sh-ops`
already uses here), while the foot reads as "take this with you" and costs a twelve-day scroll.

And it carries §4's spinner, because the owner's existing PDF button swaps a word with no
spinner while `FormActions` two files over does it correctly — so the app currently holds both
the right pattern and the wrong one for one question.

### What the renders found, beyond the proposals

- **`.icon` is sized per context in this app**, and a new context inherits no size. Unsized,
  the journey header's flight glyph drew at its own 24px box and the header measured **131px**
  instead of 34.
- **`.sh-page` now carries `min-height: 100dvh`** (shipped this morning so the reader's document
  scrolls and pull-to-refresh can fire), so any mockup wearing that class for its type scale
  gets a screenful of empty ground under every frame.
- **A control in `.sh-public-bar` must take the `--on-dark-*` ramp** (ADR-0158 §3). Drawn with
  `--ink`/`--line`, the PDF button rendered navy on navy: invisible on the page, entirely
  reasonable in the CSS.
- **The live file row is 42px**, under ADR-0017's 44px floor.

Both files render in all four theme × width combinations with fonts loaded and no console
errors.

### What the build changed

The two mockups were right about every shape. Four things they did not settle, and one they
got wrong:

- **`SharedEvent.journeyTo` is a new contract field, and the mockup did not say so.** The
  header names the destination, and the destination was not in the projection: `title` is
  `routeTitle(from, to)` and parsing it back apart is not an option, since it carries bidi
  isolates. It is derived from the same place-label chain the day titles already use.
- **The frame's row does not survive — its ATTACHMENTS do.** The amendment above said the row
  survives "because `ops`, `caption` and the map link hang off it", and the mockup drew the
  container replacing it entirely. Both are half right: the row goes, and the attachments are
  hoisted into a fragment that either shape can host, so a journey renders as a container
  **with the flight's booking code inside it**. Building it revealed the mockup's `after()`
  had quietly dropped the ops fold; there is now a spec asserting `.sh-trek details.sh-ops`.
- **`FileOp` and the PDF button became one hook, not two ladders.** The mockup drew them as
  two controls, which is what they are on screen — but they ask one question (fetch a URL,
  report progress, hand the file over), so `useFileHandover` serves both. Writing the second
  as its own `useState` ladder is how they would have drifted on the states, the settle delay
  or which outcome says `נשלח`.
- **The PDF button ships in BOTH places, not one.** The mockup left placement as an open feel
  call with the masthead as its default. Measured live, the masthead pill is 30px on a 43px
  bar and the foot's `.share-outcome` is 48px — they cost different things and answer
  different readers, so both ship: the bar for the reader who came to fetch it, the foot for
  the one who read to the end. This is the same two-entry-point shape ADR-0213 already uses
  for the owner's share control, so it is not a new pattern.
- **`signedHours` was extracted** in the print renderer: the journey header became the second
  caller of the signed-clock formatting that was inline in `travelFactsLine`, and one spelling
  is what stops a flight's header and a single-leg row reporting the same crossing
  differently.

Two traps the build hit, both already written down in this repo and both hit anyway:

- **A backtick inside a CSS comment inside a template literal** terminates the literal. Ninth
  occurrence this session. The template now carries an assertion-by-inspection note; the real
  guard is that the comment says "micro scale" instead of naming the token in backticks.
- **`--pdf-sub` does not exist.** The print sheet's tokens are `--pdf-ink/muted/line/soft/
amber/teal`, and an undefined custom property makes the whole declaration inert — so the
  header would have printed with no background and looked _almost_ right. Caught by measuring
  `backgroundColor` on the rendered A4 (`rgb(243, 245, 248)`), which is the only way this
  class of miss ever surfaces. The catalog records the same shape for a mockup that styled
  against `--text-meta`.

### What was verified

- `pnpm typecheck`, `pnpm lint`, `pnpm build` clean; `pnpm test` 505 shared / 1222 backend /
  4991 frontend; sharing e2e 14/14.
- **Live at 360px dark:** the container exists with no `.sh-event` inside it; the header reads
  `טיסה לנתב"ג · שתי טיסות · 23:40–11:55 · 11:15 שע׳ +3 ש׳` at 56.7px against an event row's
  76px; the whole journey is 215.7px (the mockup predicted 221px); four spans on the card —
  `11:15`, `2:50`, `5:20`, `3:05` — and exactly **one** zone pill; the masthead button is 30px
  on a 43px bar and the foot's is 48px.
- **The download row measured against the shipped stylesheet:** 45.5px with `min-height: 44px`
  (it was 42px, under ADR-0017's floor), the app's own 15px spinner animating at its own 0.7s,
  a 3px bar, and the indeterminate sweep at 1.1s — slowing rather than stopping under reduced
  motion.
- **A4:** the container prints with its header background resolved, no peer row above it, leg
  spans `2:50` / `3:05`, the wait `המתנה ב-Frankfurt · 5:20 שע׳`, and the same four spans the
  screen shows.

## Alternatives considered

- **One page with fields progressively removed.** Rejected: less information is not automatically the right emphasis.
- **A decorative day-rhythm rail.** Rejected by the owner: labels that organize no events are meaningless.
- **Mandatory titles for every day.** Rejected: creates authoring work and a presentation entity the itinerary does not otherwise need.
- **AI-generated titles stored as ordinary day labels.** Rejected: hides provenance and makes a failed model look like missing trip data.
- **Model access to the selected Full/Everything projection.** Rejected: generation does not need operational or sensitive fields.
- **An approval queue for generated narrative.** Rejected by the owner: valid current output publishes automatically.
- **Synchronous generation when a public page or PDF opens.** Rejected: latency and provider failure would become sharing failures.
- **Automatic stock or generated imagery in v1.** Rejected: adds media, licensing, privacy, attribution, and availability work before it improves the schedule.
- **Print the public HTML.** Rejected: touch targets, shadows, accordions, and web spacing are wrong for paper.
- **Put sensitive fields inline with each event.** Rejected: harms schedule scanning and makes privacy state visually ambiguous.

## Evidence

- [`a-shared-itinerary-is-organized-by-the-day-v3.html`](../../mockups/a-shared-itinerary-is-organized-by-the-day-v3.html) renders both themes at 360/390px with fonts loaded and no console errors. Its non-empty daypart heading is 30px, Summary event row 38px, and day header 76px.
- [`a-shared-itinerary-is-printed-by-daypart-v2.html`](../../mockups/a-shared-itinerary-is-printed-by-daypart-v2.html) renders both review themes at 360/390px with no console errors. In the unscaled print DOM, the day header is 47px, daypart header 18px, and event row 31px.
- The generated Full PDF was rendered back to two page images and inspected with no clipping or overlap.

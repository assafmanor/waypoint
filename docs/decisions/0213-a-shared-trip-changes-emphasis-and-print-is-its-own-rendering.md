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

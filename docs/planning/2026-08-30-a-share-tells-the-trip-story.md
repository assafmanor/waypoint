# A share tells the trip's story (2026-08-30, session 258d)

The owner opened their own twelve-day Iceland trip at `הכל` and reported it in two
messages, the second with screenshots of the PDF:

> the live sharing when all is shared is an abomination, looks disgusting, nothing is
> linked to the events!

> The pdf and the live shares need total rehauls. It's ridiculous how bad everything looks,
> the texts are meaningless and the alignment is so bad … Why נתב״ג to Frankfurt?? What does
> it have to do with anything? What's the teal random places on top? Bad event ordering when
> it comes to the flights and hotels … no layover detection and visualization

Then the frame that shaped the whole session:

> Sharing should tell a story, not present information in a misleading way like it does now.
> Let's use my trip as an example and think together what could be changed to tell a
> coherent, accurate, friendly story.

The decisions are in [ADR-0213](../decisions/0213-a-shared-trip-changes-emphasis-and-print-is-its-own-rendering.md)'s
fourth 2026-08-30 amendment and [ADR-0166](../decisions/0166-place-enrichment-is-a-multi-source-pipe.md) §23.
This note is what the session did, the forks put to the owner, and the answers.

## The report I had twice explained away

The missing link at `הכל` had been diagnosed as a service worker serving a stale bundle. The
owner refused that twice:

> no matter what you say I don't buy your explanation because all other things did get
> updated and have done that for a long time on all deploys. I think that you're missing
> something.

They were right. Reproduced in a real browser at 360px: `.share-send` is a flex item with
`overflow: hidden`, and [CSS Flexbox §4.5](https://www.w3.org/TR/css-flexbox-1/#min-size-auto)
removes a flex item's automatic minimum size the moment its overflow is not `visible` — so in
a scrolling flex column it shrinks to zero. `flex: none`.

**Why the earlier sessions could not find it.** Every test was a DOM test, and the element
was present, mounted, and carrying the right text the whole time. jsdom computes no layout.
The lesson is the one root `CLAUDE.md` already carries about counting call sites, in a
different key: a report about what a screen _looks like_ is not answered by asserting what
the DOM _contains_.

## The forks, and the answers

**Named days — how?** The owner asked before agreeing: _"Named days, but how do you plan to
do that?"_ Answered with the derivation rather than a promise (region → kind → place →
route), and they then chose **scaffolding softened** over hard headings: a title that is a
guess must not look like a label somebody wrote.

**How much imagery?** _One photo per day_, and enrichment consulted at _every level_ (trip,
day, event) rather than only the day.

**"And how do you decide what's the most significant stop exactly?"** The question that
turned the photo choice from "the first pin" into a ranked one — dwell, commitment,
`userRatingsTotal`, and whether anybody bothered to name the place. Sitelink count and
`rating` were both proposed and both rejected in the same exchange, for reasons the ADR
records.

**Times.** _"With שעה בעצירה חופשית - התחלה בלבד"_ — a soft stop shows its start only; hard
pins and bookings show both ends.

**The section name.** _"Don't call the section מה שקבוע - makes no sense in Hebrew"_ → `ההזמנות`.

**The trip's shape**, which came after the first build round and reshaped the day titles:

> In your fixture it says Reykjavik → Snæfellsnes but it is actually a circumnavigation
> (טיול מתגלגל maybe), where you switch locations every day … Then there's טיול כוכב where
> you stay at one place … I think that we should differentiate between them and display the
> titles accordingly.

## What the mockups earned

Both were rendered before anything was built, and both found things reading the code had not.
The expensive one: **`dir="auto"` on a value block puts a Latin name against the wrong edge
of its column** — 229px of separation in a 288px column, on _both_ shipped renderers, and
most of what _"the alignment is so bad"_ meant. It is a base-direction fact, not a bidi one,
and `lib/bidi.ts`'s own docblock covers the composed-line case and left the single-value case
uncovered. Neither renderer's test suite could see it.

`mockups/tools/extract-pdf-css.mjs` came out of the same round: the A4 mockup pulls the
renderer's CSS **verbatim** from the template literal rather than hand-copying it, and
refuses a block containing an interpolation. The catalog's chronic failure is exactly that
drift.

## Three things that cost time and are worth writing down

**Equal specificity, and a verifier that could not see it.** The new print CSS was appended
_above_ the original block, so `.pdf-event` kept its old 38px against 52.9px of ink and a
flight's range printed over its own title — while the smoke render's `no-overprint` check
passed throughout. The block now sits last in the sheet and a spec asserts the ordering.

**An isolate must island the number, not the phrase.** `ltrIsolate` around `14ש׳ 50דק׳`
produced `שׂ50דק׳ 14`. `measure(value, unit)` exists for this and is the only correct tool.

**The renderer aborts every request the page makes.** Discovered by reading
`pdf-browser.service.ts` after adding an `<img src="/enrichment/images/…">` that would have
printed an empty box — the QR had already solved the same problem as a data URL, one field
away. Verified afterwards on a real A4 render: five photos, five loaded, zero failed requests.

## What I got wrong in the middle

I asserted that headless Chromium discards the whole `Content-Disposition` header for a
Hebrew `filename*`. Isolating it against a bare server showed it reports a `download` for
**any** non-ASCII `filename*` — the behaviour was my test rig, not the browser, and it was
retracted to the owner in the same turn. The actual defect was simpler and real: a document's
name here is its title, and a title has no extension.

## Left open

- The `dir="auto"`-on-a-value-block sweep beyond the two sharing renderers — a repo-wide
  grep, still a backlog line.
- Whether the owner's original document-link report is fully explained. The extension fix is
  certainly right; whether it is _their_ symptom was never confirmed.

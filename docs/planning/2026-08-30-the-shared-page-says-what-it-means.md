# The shared page says what it means (2026-08-30, session 258c)

Seven field reports on the shared itinerary in one sitting, after the second sharing PR
merged. The owner asked for the mapping before the building: _"Lets try to map all usecases
and how to make everything more friendly overall. Then build"_.

## What the mapping found, and it was worth doing

**Six of the seven reports are one root cause.** ADR-0213 §2 had the projection ship every
derived line as a **composed string** — trip data joined by punctuation, with no word of any
language in it — so that one server derivation could feed a Hebrew page and a Hebrew PDF. That
constraint is right and still holds. What nobody had noticed is its consequence: a server that
holds no copy cannot say _"flying"_. It can only join. So every day of every trip got the same
shape of line, built from whatever the place rows happened to be called — and place rows are
called things like `נמל התעופה הבינלאומי קפלוויק` and `Blikavöllur 3 235 235`.

Listing the surfaces side by side is what made that visible. Fixing them one at a time would
have produced seven local patches and left the cause in place.

The map itself is in [ADR-0213](../decisions/0213-a-shared-trip-changes-emphasis-and-print-is-its-own-rendering.md)'s
second 2026-08-30 amendment, as a table of all ten lines. It belongs there rather than here
because it is the decision, not the session.

## The forks, and the answers

**Where do the words live?** The projection could have started emitting Hebrew. Rejected: it
would put UI copy in `packages/shared` and the backend, and a second locale would then mean a
second derivation rather than a second word table. Instead the projection ships
`{ kind, …values }` and each renderer keys its own words off it — which is not a new pattern
here at all: `journey.mode` was tightened to an enum for exactly this reason one PR ago, and
its docblock already says _"a reader keys both a word and an icon off it, which is the
definition of a discriminant"_. The amendment is that sentence applied to five more fields.

**What does an outbound flight say?** `טסים ל<where the plane lands>` was the obvious build and
is wrong — it prints the airport's full name, which is the thing being complained about. It
says the trip's `destination`. The returning day carries no place at all, because home is not
somewhere the derivation knows.

**Does a pre-dawn event move days?** The owner: _"up until some late point it should still
count the night of the previous day"_. It does, and the cutoff was already written down —
`SHARE_DAYPART_START_HOUR.morning` is 5, so `shareDaypart` had been declaring that the day
starts at dawn since the feature shipped. Only the grouping disagreed. No new number.

**Is the masthead block a leak?** No, and saying so plainly mattered more than fixing it: every
label in it already appears in the schedule below. It read as a leak because the trip's title
was printed **twice** — once beside the QR and again in the lede a centimetre down — with
nothing naming either. One of them is now gone and the other is labelled.

## The bug the reports did not name

Reading the masthead to answer the leak question turned up `8 אזורים` on a trip with more
stops than that: the fact was reading `routeLabels.length`, which is the **capped** strip. A
count of what is drawn was standing in for a count of what exists. Now `routeStopCount`.

## Verification

The unit suites are the wrong instrument for most of this, and were run anyway (backend 1182,
frontend 5030, both green). What actually settled it:

- **The real PDF, rendered and read back.** `pdf-container-smoke` against the reference trip,
  through `verify-pdf-smoke.mjs` — pages, extractable Hebrew, emoji coverage, per-page footer
  numbering, no blank pages, no overprinting — then the page images inspected. The fixture was
  extended first so that **every kind has an example in it**: an outbound day, a returning day,
  a route day, a day that stayed put, a lodging second line, and a 01:40 event that exists only
  to exercise the night rollback. A kind with no example there is a kind nothing renders in CI.
- **The real page**, through the hermetic e2e mock at 390px.

Both were needed. The derivation is pure and unit-tested
(`itinerary-narrative.fallback.spec.ts`), but "does this read better" is not a property a unit
test has an opinion about.

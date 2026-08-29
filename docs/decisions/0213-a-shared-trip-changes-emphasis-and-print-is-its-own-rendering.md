# 0213 - A shared trip changes emphasis, and print is its own rendering

**Status:** Proposed - design approved for mockup; production build pending
**Date:** 2026-08-29
**Relates:** [0017](0017-mobile-first-device-targets.md), [0018](0018-timeline-data-model-shape.md), [0028](0028-plan-violet-color-budget-dark-ready.md), [0067](0067-revocable-code-invites-and-removal-blocks.md), [0097](0097-mockup-catalog-out-of-root-claude-md.md), [0107](0107-per-place-timezones-and-multi-zone-time.md), [0118](0118-numbers-in-hebrew-bidi.md), [0166](0166-place-enrichment-is-a-multi-source-pipe.md)

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

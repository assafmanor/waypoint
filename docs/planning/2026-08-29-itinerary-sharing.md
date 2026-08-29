# Itinerary sharing design session

**Date:** 2026-08-29
**Status:** final mockups ready for owner review; production build pending
**Decision record:** [ADR-0213](../decisions/0213-a-shared-trip-changes-emphasis-and-print-is-its-own-rendering.md)

The owner wants two outputs from one itinerary projection:

- a public, interactive HTML itinerary that stays live for anyone holding its link;
- a compact PDF snapshot that is comfortable to send and print.

Sharing is reachable both inside a trip and on every card in All Trips. One sheet chooses the detail level, then presents live link and PDF as peer outcomes. Full schedule is the safe default; only Everything reveals individually configurable sensitive fields, all off by default.

## Final decisions

### Detail levels change emphasis

- **Summary - inspiration:** route, generated-or-derived daily narrative, and event titles grouped under real parts of the day. No exact times, addresses, travel legs, or operational details.
- **Full schedule - orientation:** the same daypart structure with exact times, places, addresses, travel legs, and map links.
- **Everything - operation:** Full plus only explicitly enabled sensitive fields, grouped as operational material rather than decoration.

### Parts of the day organize the schedule

The v2 sunrise/sun/sunset/moon strip was rejected as meaningless because it did not own any content. The final design renders morning, noon, afternoon, evening, night, and flexible as section headings only when events belong to them. Grouping derives from the displayed local start time; nothing is stored on the event or a Day row.

### Daily narrative is model-ready but never required

There is no mandatory title field per day. The deterministic fallback uses route endpoints, principal places, counts, and public event titles. A future model/skill may provide a trip title, trip synopsis, day title, and day synopsis.

Generated narrative publishes automatically when valid and current; there is no approval queue. It is keyed by input hash and skill version. A mismatch, timeout, provider failure, invalid schema, or disabled AI immediately uses the deterministic fallback while regeneration may run in the background.

The public page and PDF never call a model. They consume a validated narrative result or fallback.

### The model sees a separate safe projection

`SummaryNarrativeInput` is independent of the share level. Everything switches cannot widen it. It may contain locale, route/destination labels, day ordinal, coarse daypart, and event/place text already visible in Summary. It never contains exact times or dates, addresses or coordinates, notes, tasks, bookings or confirmation codes, files, costs, travelers, IDs, emails, URLs, provider payloads, or any selected sensitive field.

Free text can itself contain sensitive meaning. External generation therefore runs only for an active share and only over text already chosen for Summary publication, after pattern redaction. A future requirement that no itinerary content leaves Travelive would require a local/self-hosted model.

### Visual warmth comes from itinerary structure

The first release does not invent a cover-upload feature, stock photography, generated imagery, or a static map pipeline. A compact route strip uses actual ordered destinations. Existing event badges and daypart headings make the page inviting while remaining truthful and inexpensive to build.

### PDF is a separate print rendering

PDF uses the selected projection and shared daypart derivation but does not print the public HTML. It is fixed-light A4 with compact day cards, break-safe days, generated timestamp, page count, written URL, and QR.

- Summary targets one page for the nine-day reference trip.
- Full targets two pages.
- Everything adds a labelled operational appendix.
- Daypart headings appear only above real events.
- The final Full sample measures 47px day headers, 18px daypart headers, and 31px event rows in the unscaled print DOM.

### Link shape follows the invite technique

The public route is proposed as `/s/<8-character-code>`, using the durable random base58 credential technique from ADR-0067. The URL contains neither trip ID nor signed payload. The v1 build plan chooses one reconfigurable link per trip; multiple independently revocable audience links remain a later access-management feature.

## Rejected alternatives

- One visual template with fields hidden.
- A decorative four-part daylight rail.
- Mandatory owner-written day titles.
- AI titles masquerading as ordinary stored day labels.
- Sending Full/Everything data to the narrative model.
- Reviewing every generated title before publication.
- Calling a model while serving HTML or creating PDF.
- New cover-photo, stock-image, generated-image, or static-map infrastructure in sharing v1.
- Printing the public page.
- Sensitive details beside every event.

## Mockups

- Owner flow: [`an-itinerary-is-shared-from-every-trip-v2.html`](../../mockups/an-itinerary-is-shared-from-every-trip-v2.html)
- First public reader: [`a-shared-itinerary-is-read-v1.html`](../../mockups/a-shared-itinerary-is-read-v1.html)
- Route/day-rhythm exploration: [`a-shared-itinerary-feels-like-an-invitation-v2.html`](../../mockups/a-shared-itinerary-feels-like-an-invitation-v2.html)
- Final public reader: [`a-shared-itinerary-is-organized-by-the-day-v3.html`](../../mockups/a-shared-itinerary-is-organized-by-the-day-v3.html)
- First print exploration: [`a-shared-itinerary-is-printed-v1.html`](../../mockups/a-shared-itinerary-is-printed-v1.html)
- Final print/PDF: [`a-shared-itinerary-is-printed-by-daypart-v2.html`](../../mockups/a-shared-itinerary-is-printed-by-daypart-v2.html)

## Still open

- Link lifecycle: rotation, revocation, expiry, owner departure, trip deletion, and offline behavior.
- Multiple independently revocable audience links and permission management beyond the v1 bearer link.
- Public indexing and cache headers; intended start remains bearer-link access with no discovery.
- Exact projection, authorization, and safe-narrative schemas.
- Provider policy for external versus local/self-hosted models.
- Whether a PDF generated from a stale cached public projection is allowed and how it is labelled.

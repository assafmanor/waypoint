# Session 225 — Workstream E research: airport search restriction, IATA source, city label

**Date:** 2026-08-08
**Paper only** — no feature code, no ADRs, no mockups, no schema changes. Records research findings from an external research pass against Workstream E (field reports #6, #7, #23; `planning/2026-08-07-session-216-field-reports-triage.md` and `planning/2026-08-08-session-224-incremental-field-reports-addendum.md` §3).

## 0. What this is

Two rounds of live-documentation/live-data research, run by a separate agent against the handoff in `backlog.md`'s "E — Flight place data" line, reconciled and recorded here per this repo's documentation conventions. **Not independently re-verified against Google's/Wikidata's live endpoints by this session** — recorded as reported, with the agent's own stated assumptions and gaps preserved rather than smoothed over. Two of Workstream E's three open questions (#6, #7) are now answered well enough to inform a build decision; the third (#23's city half) surfaced a genuine product decision rather than a research gap — more research will not resolve it.

## 1. #6 — can Google Places restrict search to airports? **Answered: yes, with a routing caveat**

Places API (New) supports airport-only type restriction on both endpoints it was checked against:

- **Text Search (New):** `includedType` + `strictTypeFiltering: true`. Airport searches are not among the documented exceptions to strict filtering. **Limitation: only one `includedType` per request**, and Google now distinguishes `airport` from `international_airport` as separate Table-A types (live type table, checked 2026-08-08) — the docs don't promise every `international_airport` also carries the generic `airport` type, and the agent had no API key to measure the overlap directly.
- **Autocomplete (New):** stronger fit. `includedPrimaryTypes` accepts up to five types, so `["airport", "international_airport"]` covers both in one request — Google's own documented pattern for primary-type restriction.

**What this means for the build session:** flight-leg place picking currently goes through the same generic Text Search path as the Map's own search (confirmed against code in session 224's ADD-01 trace) — not Autocomplete. This app already has a type-restricted Autocomplete precedent for destinations (`DESTINATION_PRIMARY_TYPES`, ADR-0113 §1, `backend/src/places/destinations.service.ts`). Switching flight-leg search to Autocomplete-with-`includedPrimaryTypes` is the cleaner fit per this research, but it's an **architecture choice** (a different endpoint, a different existing precedent to extend) not a one-line parameter add on the current Text Search path. The Text Search route works too, with the unverified overlap caveat above and the one-type cap.

## 2. #7 — real IATA codes, matching a Places pin to the right Wikidata entity

Prior open question was not just "does Wikidata have IATA codes" but "can a Places pin be matched to the _correct_ Wikidata airport entity without false positives" — the metropolitan-code hazard (e.g., a city entity carrying an IATA-like code for reasons unrelated to being an airport) made this non-trivial.

**Findings, tested against Ben Gurion (TLV), Vienna (VIE), Keflavík (KEF):**

- `P238` (Wikidata's IATA-code property) is correct for all three **once the right QID is found**.
- **Coordinate-proximity matching from a terminal pin is unreliable**: a passenger terminal building (OSM `aeroway=terminal`) sits 1.1–1.4 km from the airport entity's own `P625` coordinate in all three cases, so a 500m geosearch from a terminal pin **misses the airport entity entirely** — TLV and VIE surface a railway station instead; KEF returns nothing.
- **Name search is the reliable route**: `wbsearchentities` against a sufficiently complete airport name (Hebrew tested) finds the correct QID for all three, including via the colloquial Hebrew alias for Ben Gurion (`נתב"ג`). Shortened/partial names failed for VIE and KEF specifically — the exact string Google will actually supply is unverified (Google's live returned strings weren't available to test against).
- **The proposed guard — `P31` is `airport` (Q1248784) or a subclass of it, e.g. `international airport` (Q644371) — correctly blocks the one real hazard found**: London's city entity (`Q84`) carries `P238=LON` (a real metropolitan IATA code) but has no airport-class `P31`, so the guard rejects it. It also correctly rejects the railway-station and other decoy entities the coordinate route surfaced.
- One measurement gap acknowledged by the research itself: the exact name-similarity scoring function/threshold behind a "0.8 floor" wasn't specified, so whether an abbreviation or a shortened name would clear a real production threshold is unconfirmed — exact-label matches are unambiguous, near-matches are not.

**What this means for the build session:** the matching approach (name search over coordinate search, gated by the `P31` airport-class guard) is validated on this sample and should be the basis for design — via ADR-0166's existing enrichment pipe rather than a new mechanism (rule 8), since Wikidata is already a source in that pipe.

## 3. #23 — the "City" half of `City · IATA` (field report #23's label format). **Not resolved by research — a real decision point**

Tested two Wikidata properties as candidate sources, plus what Google's own response already carries:

- **`P131`** (administrative containment) **fails, and fails the same way `place-label.ts`'s own code comment already documents for Google's `locality`** (Ben Gurion's is "Lod," not Tel Aviv) — an independent confirmation of the same failure mode in a second data source. TLV → Central District (no city at all); VIE → Schwechat (the suburb the airport physically sits in, not Vienna); KEF → two separate municipalities, no single answer.
- **`P931`** ("place served by transport hub") is semantically the right property but **is multi-valued with no reliable single winner** on this very sample: Ben Gurion lists both Tel Aviv _and_ Jerusalem at equal (normal) rank — no automatic tie-break. Keflavík does carry a Wikidata "preferred rank" flag favoring Keflavík over Njarðvík, but that's not consistent across all three, so it can't be relied on as a general rule.
- **Google's own response** has no dedicated "city served" field either — `addressComponents`'s `locality`, `formattedAddress`, and Autocomplete's `structuredFormat.secondaryText` are the candidates, all explicitly documented by Google as unreliable/mutable/omittable, and `locality` is the exact field already known (from this app's own existing code comment) to give "Lod" instead of "Tel Aviv."

**No source tested gives a clean, single, passenger-facing city name automatically for all three reference airports.** This is not a research gap to close with more digging — the underlying data doesn't cleanly answer the question. It's a product decision between real trade-offs:

- Accept `P931` with some tie-break rule (first/preferred-rank result; geographic nearest; or simply "first returned") and live with occasional wrong or debatable picks (Ben Gurion → Tel Aviv vs. Jerusalem).
- Fall back to Google's `locality`/`secondaryText` despite the known Lod-not-Tel-Aviv failure, perhaps only when Wikidata has nothing.
- Reuse the **existing deferred backlog item** "Place nickname / short label" (Maps & Places epic, session 91: _"Google Places has no short-name field for a POI... let a user set a local nickname on a place to override the long official name"_) — a manual per-place override might be the actual right answer for exactly the cases automated derivation can't resolve cleanly, rather than chasing a fully automatic rule to 100%.

## 4. Updated routing

Research phase for #6 and #7 is sufficiently answered to move to a build decision. #23's city half needs an explicit owner call among the three options in §3 — not more research — before build scoping can finish. Recorded in `backlog.md`'s Workstream E line; full detail here rather than restated there.

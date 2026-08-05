# Place enrichment — build plan

**Frame:** [ADR-0166](../decisions/0166-place-enrichment-is-a-multi-source-pipe.md) (the pipe, §11–§13 amendments) + [ADR-0167](../decisions/0167-the-badge-is-the-thumbnails-frame.md) (the surface, §9–§11 amendments). Design reference [`mockups/place-enrichment-v2.html`](../../mockups/place-enrichment-v2.html). Nothing here is built yet.

**Read the amendments, not just the decisions.** Both ADRs were amended the same day they were written, and in each case the amendment reverses something the original said. ADR-0167 §11 supersedes §10; §9 supersedes §3 for a committed place. Building from §3 would build the wrong card.

**Ordering principle:** every phase ships something reviewable on its own, and no phase depends on a later one. Phases 1–3 are invisible; 4–6 are what a person sees.

---

## Phase 1 — the store, the registry, and two providers (backend, invisible)

- **`packages/shared`:** `ENRICHMENT_SOURCE` / `ENRICHMENT_FIELD` named constants, per-source `SourcePolicy` (license, `storable`, attribution, default TTL), `FIELD_SOURCE_PRECEDENCE` as declared data, and the zod schemas for `EnrichedValue` and the `fields` payload. **`lang` is required on any value carrying prose, and a text field holds localized _variants_** (ADR-0166 §11.6) — this is the one thing that is expensive to retrofit, so it lands in Phase 1 even though nothing translates yet.
- **Migration:** `PlaceEnrichment` — own `id`, unique alias columns `googlePlaceId` / `wikidataQid` / `osmRef`, `fields Json`, `attemptedAt`, timestamps. **No `tripId`, no FK to `Place`, and no change to `Place` at all.**
- **`backend/src/enrichment/`:** the module, the `EnrichmentProvider` interface, the registry, and the orchestrator that resolves **per field** in precedence order.
- **The match is refusable, and it has two refusal reasons** (ADR-0166 §5.5 + §11.2): below a confidence threshold, **and** when the candidate's type is broader than the saved place (a river for a riverside spot, a chain for a branch). It can refuse for `summary` while accepting for `image`. Match order is **exact `wikidata` tag → settled id → proximity + name similarity**, and the recorded confidence names which fired (§12.3).
- **Negative caching is in this phase, not later** (§6.4). Most places will never have a summary; without it every cold read re-attempts every provider forever.
- **The fetcher is host-allowlisted, timeboxed, and size-capped** (§7) — an image URL from a provider response is validated against the allowlist before it is fetched, never followed because a response supplied it.
- **Providers:** Wikidata (`P18`, `P625`, aliases) and Wikipedia (`he` → `en` summary, langlinks).
- **Out-of-band from the pick** (§6): `resolvePlace` is untouched and stays exactly as fast and as failable. Enrichment is scheduled after the fact and **does not go through `ChangeService`** — a global row has no `tripId`, no client authors it, and none of LWW/undo/ordering applies.
- Tests against recorded fixtures; providers are pure `(identity) → match → fields` and need no DB.

## Phase 2 — the image pipeline (backend, invisible)

- Commons `imageinfo` with `iiprop=url|size|mime|extmetadata` and `iiurlwidth`. **Fetch the bucket Commons already generated and store those bytes — there is no resize step and no image-processing dependency** (§12.1). `iiurlwidth` does not honour exact widths; ask for a nominal one and accept the bucket.
- Store through **`common/storage.ts`**, prove the bytes with **`common/image-sniff.ts`**, serve from a **`@Public` immutable content route**, read through **`blob-cache.ts`** — all four already do this for avatars (ADR-0133 §12). Second consumer, not new infra.
- **The sniffer decides the type, the filename never does** — a Commons `P18` came back as a PNG under a `.jpg` name in the spike (§12.5).
- **Per-file license + author stored with the value.** Nine distinct license strings appeared in 32 files, so store the **string**, not an enum.
- **A GFDL-only file is treated as no image** (§12.2) — fall through to the next candidate or to the no-image state.

## Phase 3 — delivery to the client (backend + frontend plumbing, invisible)

- The trip snapshot **joins** enrichment for the trip's places (a server-owned read model).
- One new `WS_MESSAGE_TYPE` member: enrichment landed for a place you hold.
- Frontend: one entry in `CACHE_CHANNELS` and one in the memory channels (`frontend/CLAUDE.md`'s registry rule — not a new branch in a `switch`).
- Offline reads work unchanged; images are same-origin and immutable, so the service worker caches them.

## Phase 4 — the badge becomes the frame (frontend, first visible change)

- Photo fills the badge's interior; **the category hue moves from fill to a 2px ring**.
- **Two traps, both measured, both of which shipped in the mockup first:**
  - The ring must be an **overlay `::after` above the image** — an `inset` box-shadow paints below the element's children, so the photo covers it and the badge silently loses its category (§8.1).
  - **The photo clips on an inner element; the badge itself must keep no `overflow`** — it hosts children that deliberately overhang (the order counter at `-6px`, the ring). Clipping the badge clips the counter into a white quarter-circle (§11.2). The shipped `.map-badge` has no `overflow` for exactly this reason.
- Fill order: **picked icon → photo → derived glyph** (§2).
- **Acceptance:** collapsed rows stay at 69–71px, and the order counter still overhangs.
- **This phase is where the device pass belongs** (see below).

**Built 2026-08-05** ([session note](2026-08-05-place-enrichment-phase-4-built.md)), with one correction to the acceptance above: **69–71px is the mockup's box, not the app's.** A real `.place` measures **64px** and two adjacent rows are **73px** apart — the box plus its 9px `margin-bottom`, which is the 73px ADR-0167 cites for the shipped row. `e2e/place-photo-frame.spec.ts` asserts the pitch and the two rows' equality instead of the mockup's band. Also corrected: the ring is a real element rather than an `::after`, because both of this badge's pseudo-elements are already the order counter and the hit-area expander; and the category fill needed clearing **in `map.css` too** — the component's own rule ties with `.map-badge.cat-food` on specificity and loses on import order. The device pass is still owed, and the session note lists exactly what it has to answer.

## Phase 5 — the collapsed card (frontend)

- **Hours ride the existing meta line as a tag** — `פתוח עד 17:00`. Measured 0px; the meta line is 17px either way (§9.2). Do **not** give hours their own row: it cost 19px when it fitted and 43px when the freshness tail wrapped.
- **A pinned two-line summary block under the identity**, `עוד ›` to expand. 64px (§9.3).
- **`באנגלית`** in the existing tag grammar for an English summary (§5); the prose takes `dir="auto"` and nothing else.
- **`עוד בגוגל`** in the foot beside `שיבוץ ליום`, via the existing `mapsSearchUrl` builder — widen its job, do not add a second builder (§6).
- **The credit line stays RTL-aligned and isolates its Latin run** — `dir="auto"` on a Latin string flips the whole element and orphans it to the opposite edge, which ADR-0118's lint guard cannot see (§8.2). This will recur on every enriched Latin string.
- A clamp that varies by state belongs on the **compound selector** — a sibling class loses the specificity fight and silently renders three lines (§9's closing note).

## Phase 6 — the expanded card is the research card (frontend)

- **Expansion is a mode change, not growth** (§11.1). Expanded shows what an un-added research place shows — hero, full summary, credit, hours — plus a way back. Notes, references and the schedule footer are **not** on screen at the same time, which is what stops the hero starving the notes scroller (measured 31px when it did).
- **One presentation, not two.** The research card and the expanded card are the same component in the same state; the collapsed card is a collapse of it.
- The hero opens the **full-screen zoomable preview** (ADR-0062 permits zoom exactly there).
- **Ask before touching `DocumentViewer`** (ADR-0096): it is document-shaped (`doc: DocumentSummary`). Generalizing it may be a small extraction or a real refactor — look, then ask, rather than widening it silently or adding a second viewer beside it.

## Amendment (2026-08-05) — the phase this plan forgot: **the trigger**

Phases 1–3 shipped and the pipe never ran, because **no phase here owned the thing that starts a pass.** Phase 1's line says _"Enrichment is scheduled after the fact"_ — present tense, so it reads as a property already true rather than as work. It was neither built nor deferred; it simply was not in the plan.

Now decided and built (owner's call, [ADR-0166 §14](../decisions/0166-place-enrichment-is-a-multi-source-pipe.md)): **two triggers riding existing requests** — a pick (`resolvePlace`) for immediacy, and a **snapshot read** for backfill, TTL refresh and recovery-after-a-redeploy, which is free because the Phase-3 join already reads the rows that answer "what is stale". No scheduler (ADR-0157 §6 already refused one for the orphan sweep, and this is the weaker case), surplus work dropped rather than queued, and enabled behind `ENRICHMENT_DISABLED`.

**The lesson worth carrying to the next plan:** a phase list that describes a mechanism in the present tense will not produce it. Phases 4–6 below are safe on this count — they are all visible surface, so an unbuilt one is obvious on screen.

## Blocked / deferred, in order

- **Hours (ADR-0166 Phase 2)** — still not costed for the stratum that justifies it. Restaurants were effectively unmeasured because the spike had no coordinate column and fell back to Wikidata `P625`, so unmatched places were never queried (§12.4). The measurement to take: **Overpass by coordinate for ordinary businesses, with no Wikidata step.** Then a hosting decision, since public Overpass instances disclaim production volume.
- **ETA (ADR-0166 Phase 3)** — Routes API, short-TTL keyed derivation, not this store. The only phase that spends money.
- **The app's other surfaces** — shelf ideas, event rows, the Index, the hero. A second pass once the badge's behaviour is real.
- **Tier-B fields**, matching a coordless Place-lite by name + coords, and an LLM summary provider — each recorded in ADR-0166, none scoped.

## The one thing no phase can start without

**A device pass with real Commons files.** Every mockup image is a CSS gradient at a real aspect ratio, so crop _geometry_ is honest and _content_ is not. **Whether a real photograph is legible at 40px is unanswered**, and it is the premise of Phase 4. Pull the 32 URLs from [`the spike dataset`](2026-08-04-enrichment-coverage-spike-data.csv) on a networked machine and look at them in the badge.

The empty card's 44px of chrome for one button is also measured but untuned — and it is the majority case, so it deserves the same look.

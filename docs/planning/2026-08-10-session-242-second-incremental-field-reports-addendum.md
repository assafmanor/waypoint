# Session 242 — eight more field reports reconciled (`#27`–`#34`)

**Date:** 2026-08-10
**Paper only** — no feature code, no ADRs, no mockups, no schema changes. This session's entire output is this note plus the corresponding edits in `backlog.md`.

## 0. What this is, and what it is not

The owner sent a second incremental handoff (`travelive-field-issues-incremental-handoff-2026-08-11.md`, not checked into the repo) after the 2026-08-07 triage (session 216, `#1`–`#21`) and the 2026-08-08 addendum (session 224, `#22`–`#26`). It carries eight reports. This session is **reconciliation, not re-triage**: each report was checked against the current tree, the current `backlog.md`, and the shipped work before anything was written.

**Baseline:** the handoff was written against `ec71713226a610f42e1ea1bc52c8c5a8b1b9d51a` (2026-08-10, `feat(plan): the Plan Home stat tiles count up (ADR-0143) (#559)`), and that was still current `origin/main` when the reconciliation was done — **HEAD had not moved**, so every code citation below was re-verified directly against the tree rather than assumed stale. All of them held; three are sharpened with evidence the handoff did not have (§2 #29, §2 #33, §2 #34).

**Main then advanced by one commit while this note was being written** and it was rebased onto it: `75cb8c4` (`docs(map): design session for sequential stop traversal — ADR-0182 (backlog J) (#560)`), which is session 240's design pass on field report **#25**. It is docs-only and changes nothing here — no report in `#27`–`#34` is about stop traversal, and none of the source cited above was touched. **One thing in it is worth carrying into workstream `M`,** and §2 #28 says so: that session's render found a **malformed selector in `screens/map.css`**, a selector list with a comment inside it, so the same stylesheet `M` will be reading has a known parse defect in it.

**Stable IDs:** the eight reports are `#27`–`#34`, continuing the sequence. Confirmed `#26` is the highest field-report ID in use before this session (`grep` over `backlog.md` and both prior triage notes). As session 216 already noted, these are unrelated to the Map panel epic's own internal `#1`–`#23` numbering in `backlog.md`.

## 1. Reconciliation table

| ID  | Field report                                                        | Current reconciliation                                                                                                                                                                | Classification / route                                                       | Workstream |
| --- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------- |
| #27 | Remove explanatory text unless it is genuinely useful               | New app-wide copy-**density** requirement. `backlog.md`'s Copy & voice section holds one item and it is Hebrew voice/gender consistency — a different axis, not a container for this. | Copy/UX audit, then a focused build sweep                                    | **L**      |
| #28 | Some devices show a blank Map canvas; restarting recovers it        | New. `MapPane.tsx` mounts `APIProvider` + `<Map>` with **no load-failure/error/retry branch** — verified. No existing item owns blank base-map recovery.                              | Diagnosis + instrumentation + real-device fix                                | **M**      |
| #29 | Famous places such as Kerið Crater receive no enrichment match      | Residual recall gap after ADR-0166 §15/§19/§20 (sessions 227–228). The Icelandic-letter hypothesis is **code-confirmed as a mechanism**, not as this place's cause.                   | Enrichment matching diagnosis/extension; amend ADR-0166 only if policy moves | **N**      |
| #34 | Address search sometimes fails                                      | Deterministic invalid Google request for wide map bounds — screenshot evidence plus a complete code trace, both ends verified.                                                        | Direct Places Text Search bug fix with geometry regression tests             | **O**      |
| #30 | A placed Event or Booking should auto-fill its title from the Place | Booking has a save-time fallback (#9, shipped); Event still requires a title. Visible latched autofill is unbuilt on both.                                                            | Derived-field behavior build, reusing `useDerivedField`                      | **P**      |
| #31 | A saved default icon is treated as manually selected                | **Directly confirmed** in `EventForm.tsx:212` — every stored glyph reopens as touched, and the comment above it says so on purpose.                                                   | Direct bug fix; pairs with #30 as derived-field provenance                   | **P**      |
| #32 | Changes from another device only appear after navigating away/back  | Contradicts the documented model. `TripProvider` has a complete live apply path — so diagnosis must find where reactivity is lost, not build a path.                                  | Realtime rendering/sync diagnosis, then bug fix                              | **Q**      |
| #33 | A newly uploaded document can spin indefinitely, uploader and peers | Residual/regression after #20's bounded document reads (session 222) and #22's bounded API reads (session 229) — not satisfied by either.                                             | Document pipeline diagnosis across the whole post-upload chain               | **R**      |

## 2. Per-report reconciliation

### #27 — Remove low-value explanatory text across the app

> Clean up explanatory text, unless it is really worth keeping.

**Owner decision (a requirement, not a recommendation):** explanatory copy goes **by default**. The pass is not blind deletion — keep copy that explains why an action failed and how to recover, warns about a destructive/irreversible/privacy-sensitive/offline/cross-device consequence, states a constraint the control cannot express, distinguishes two readings that would save different data, or is necessary accessibility text. Remove persistent copy that restates the heading, the label, the selected value, or the obvious next action. Error, empty, offline, permission and recovery messages are **not** removable merely for being explanatory, and essential semantics must not be hidden in a placeholder.

**Confirmed:** `backlog.md`'s **Copy & voice** section has exactly one open item (Hebrew voice/gender consistency, from session 42). That is a _voice_ decision; this is a _density_ one. Folding them would lose the one the owner just asked for.

**Route.** One coherent copy-density audit: inventory user-visible explanatory/helper copy across representative surfaces, classify each keep/remove/rewrite, then sweep. Auditing by CSS class or one screen will miss equivalents — the same job is done by `Field.hint`, form captions, empty states, inline paragraphs and `i18n/he.ts` strings, so the inventory is over the **copy**, not over a selector. No mockup unless removal exposes a layout or comprehension problem; no ADR unless the pass establishes a voice principle current documentation does not already own.

### #28 — Blank rendered Map canvas with pins still visible; restart recovers it

**Clarified:** on some devices the Map screen still shows the place list and the app's pins, but the Google-rendered base map is blank. Restart recovers it. This is **not** the whole tab failing — app UI and marker overlays survive while the terrain/tiles do not.

**Confirmed in the tree:** `frontend/src/ui/domain/MapPane.tsx:374-471` mounts `APIProvider` and `<Map>` directly, with no `onError`, no load-failure branch, and no retry anywhere around the provider or the canvas. The documented invariant is **one `google.maps.Map` per tab visit because each instantiation is billed** (ADR-0121 §4/§6) — and `frontend/CLAUDE.md` restates it as an anti-pattern with teeth: a fresh object or function handed to the memoized pane re-diffs every marker at best and re-instantiates the map at worst. Any recovery design must create a second instance only after a genuinely failed one, never on a rerender.

Pins surviving is useful evidence and proves nothing about the cause: tile/network, map-style/Map ID, WebGL context loss, SDK lifecycle, service-worker/update interaction and device GPU behavior all fit it.

**One lead arrived from elsewhere after this note was drafted** (`#560`, session 240): rendering the stop-traversal mockup found a **malformed selector in `screens/map.css`** — a selector list with a 17-line comment inside it, so it parses as something other than what it reads as. That is filed as its own defect and is _not_ being claimed as this report's cause. It matters here for one reason: `M`'s job includes separating a base-map render failure from **CSS occlusion**, and the stylesheet it will be reading is now known to contain a rule that does not mean what it says. Read that fix before diagnosing, so the same parse defect is not rediscovered as a map failure.

**Route.** Diagnosis first, through the existing device-pass instrument ([ADR-0146](../decisions/0146-the-device-pass-gets-an-instrument.md)) rather than a second diagnostics mechanism (rule 8). The session should capture SDK/provider status, map capabilities, console errors, WebGL/context-loss signals where available, online state, app build, browser/WebView version, device, and Map ID/style state; distinguish a base-map render failure from CSS occlusion, zero-size layout, missing tiles and full SDK load failure — noting `frontend/CLAUDE.md`'s own scar here, that **reading a rect is not reading visibility**, since an ancestor's `overflow: hidden` changes no rect at all; keep the place list as the graceful fallback; provide a bounded in-app retry so a restart is not the only escape; verify on an affected real device if one can be identified; and avoid remount loops and repeated billable construction. No mockup, no new ADR merely to diagnose and recover. If Google exposes no reliable failure signal and a heuristic watchdog is needed, that trade goes into ADR-0121, which owns the rendered map.

### #29 — Enrichment matching misses Kerið Crater and similar famous places

**Clarified:** the Google Place exists and is findable; **enrichment** fails to match it to an external identity, so no enriched information comes back. Witness: **Kerið Crater**. The owner suspects the stored name uses Icelandic spelling. This is the enrichment reading, **not** a failure to locate the place on Google Maps.

**Confirmed in the tree, and the hypothesis has a real mechanism behind it.** `backend/src/enrichment/match.ts:133-143` folds names with `NFD` + `\p{M}` removal, and its own comment says it is dropping combining marks. Icelandic `ð`/`þ` are not accented letters and **do not decompose** — checked directly in this session's runtime: `'Kerið'.normalize('NFD').replace(/\p{M}/gu,'')` returns `'Kerið'`, unchanged. So the fold that rescues `é → e` leaves `ð` alone, and `Kerið` never meets `Kerid`. The Wikidata name search is pinned to `language=he` (`wikidata.provider.spec.ts:182` asserts it, and asserts the absence of `uselang` — §15's fix), relying on Wikidata's own fallback for Latin names.

**This is a code-backed recall hypothesis, not proof that it is the phase that rejected this place.** Four routes exist now (name search, `geosearch`, and session 228's `wiki_search`), each with its own refusals, and the existing policy deliberately prefers **no** enrichment over a false match — the whole of §15/§16 is four instances of "an absence of discriminating evidence is not evidence."

**Route.** Refine the existing enrichment matching work; do not reopen the completed airport task or start a new enrichment architecture. The session should reproduce the real Kerið failure from the stored Place identity (exact saved name, coordinates, Google data), recording **which route returned no candidate and which scorer or refusal rejected any candidate**; add `Kerið` / `Kerid Crater` as a permanent regression fixture; test the wider non-decomposing-Latin class (`ð`, `þ`, and whatever else real data turns up) rather than aliasing one place; decide whether transliteration belongs in shared name normalization, provider query expansion, candidate scoring, or a combination, on measured false-positive risk; keep raw/local-script names and use transliterated variants as **additional** evidence, never destructive replacement; and re-run a representative multi-country fixture set so recall gains do not weaken refusal safety. **Clear the negative cache before re-testing** (30-day miss TTL; `delete from "PlaceEnrichment"` is safe — it holds no trip data). Amend ADR-0166 in place if matching policy or confidence evidence changes consequentially; a bounded normalization extension under the existing policy needs only a build note.

### #34 — Map Text Search sends an invalid viewport wider than 180 degrees

**Screenshot evidence, transcribed** (Railway production log; the image is not committed):

- logger: `[GooglePlacesClient]`
- upstream endpoint: `/v1/places:searchText`
- HTTP status: `400`
- Google status: `INVALID_ARGUMENT`
- message: `Invalid rectangle viewport. The rectangle viewport cannot be wider than 180.`

**Code trace, both ends verified:**

- `MapPane.tsx` calls `onViewChange(readMapBounds(event.map))` on Google Map idle.
- `frontend/src/lib/useMapCamera.ts:67-73` — `readMapBounds` forwards the raw northeast/southwest lat/lng as `{ north, south, east, west }`, with **no validity or span check** of any kind.
- Map Text Search reads the current bounds as an optional bias.
- `backend/src/places/google-places.client.ts:221-228` — `textSearch` turns **every** provided bias into `locationBias.rectangle` with `low`/`high` straight off those four numbers.

At a sufficiently wide or world view, or in an antimeridian-wrapping representation, that rectangle is invalid for Google — so a ranking hint turns a valid text query into a hard failure.

**Owner intent:** search must still run when the visible bounds cannot be represented as a valid Google rectangle. Viewport bias is optional ranking context, not a correctness requirement.

**Route.** Direct bug fix; no ADR, no mockup. Validate at the **Google-contract boundary** and **omit** an invalid or too-wide bias rather than clamping it into a misleading region. The frontend may additionally decline to send one, but the backend must not trust a client rectangle enough to make a known-invalid upstream request. Regression coverage: a normal narrow rectangle passes through unchanged; a viewport wider than 180° produces a valid request with no rectangle bias; antimeridian/wrapped east-west bounds never generate an invalid rectangle; invalid/non-finite/inverted coordinates are rejected or omitted deliberately; the search lifecycle leaves loading and renders results or no-results rather than the generic failure; and the flight `kind` restriction (`includedType: 'airport'` + `strictTypeFiltering`, `google-places.client.ts:218-220`) stays intact when bias is omitted.

**Separate from #28** and must not be merged with it: #34 is a server-side Text Search request failure with exact evidence; #28 is an intermittent blank client-side base map.

### #30 — A Place auto-fills an Event/Booking title until the title is manually edited

**Owner-decided semantics (requirements):** applies to **single-location Events and Bookings**. Selecting a Place fills the title with the Place name while the title is untouched; changing the Place updates it while untouched; once the user edits the title manually, later Place changes must not overwrite it. Transport journeys keep route-derived titles and are not pulled into this rule.

**Confirmed in the tree:**

- `BookingSheet.tsx:454-460` implements field report **#9**'s save-time fallback — `title.trim() || placeName || typeLabel` (with the hire and route exceptions ADR-0163 §3 owns), and `:482-484` records that the `titleRequired` refusal was deleted as unreachable. `:977` shows the derived value as the **placeholder** while the input itself stays empty. So a newly saved Booking's persisted and displayed outcome may already be right while the requested _authoring_ behavior is not.
- `EventForm.tsx:195` still holds the title in a plain `useState`, `:433` refuses on `!title.trim()`, and nothing derives it from `placeId`.
- `lib/useDerivedField` already exists and already serves seven value-plus-flag pairs, including booking times, icon and kind. It carries `value` / `set` / `redrive` / `reset` / `touched`, and `redrive` returns the value now in force — which is how one handler re-derives several fields without reading unflushed state.

**Route.** Direct product-behavior build, paired with #31 (§below) because both are one distinction: **effective derived value vs explicit user override**. Reuse/extend `useDerivedField` rather than inventing title-specific touched state in two forms (rule 8). Tests, for Event and non-route Booking: blank untouched title + Place selection → title becomes the Place name; untouched title + Place replacement → title follows; manual edit + Place replacement → the manual title survives; title editing and a Map errand round-trip preserve the touched/derived state; save/reopen does not erase the distinction if the behavior crosses persistence; a no-location Event still refuses save without a meaningful title, and the existing Booking fallback stays valid; transport route titles stay route-derived. **Do not add a second title derivation that can disagree with `finalTitle`** — the visible value and the saved value share one precedence rule.

### #31 — Saving a default icon falsely converts it into a manual choice

**Clarified:** a category supplies a default icon; after save and reopen that default counts as explicitly selected, so changing the category no longer updates the icon.

**Directly confirmed** in `frontend/src/ui/EventForm.tsx`:

- `:304` — a category change calls `icon.redrive(iconForCategory(next))`, correct while untouched.
- `:212` — initial touched state is `draft?.iconTouched ?? Boolean(event?.icon ?? maybeItem?.icon)`.
- `:206-209` — the comment states the current rule outright: _"Editing an event that already carries a glyph counts as chosen, so a later category change doesn't clobber it."_

Because the effective default is persisted, every saved Event carrying any icon reopens as touched, whether or not a human ever chose that glyph. The owner is refining that rule: **storage of an effective value is not evidence of manual selection.**

**Route.** Direct bug fix, preferably in the same derived-field session as #30. Cases: a new Event derives icon A from category A; save/reopen with no manual selection, then category B → icon B; a custom icon survives save/reopen and a later category change; a Map errand/draft round-trip preserves the distinction; scheduling a Maybe item does not silently convert a default into an override; reset-to-default hands control back to derivation, consistent with the existing Booking icon interaction.

**The provenance representation is the real decision, and it is not free.** Do not simply mark every reopened icon untouched — that overwrites genuinely custom saved icons. Inspect first whether icon/category equality plus the existing reset semantics can represent legacy rows safely; there is precedent for exactly this shape in the tree, `chosenIcon(icon)` in `constants.ts` (2026-08-01), which is deliberately **a value test, not a stored flag**, on the stated grounds that a flag would need every writer to maintain it and would be wrong for rows written before it existed. If a persisted explicitness bit really is necessary, that is a data-model decision to route as one, not to smuggle into a bug patch.

### #32 — Cross-device changes reach the app but do not repaint the open screen

**Clarified:** two devices with the same trip open; a change on one is not seen live on the other, and navigating away and back makes it appear. Adding an Event is the confirmed example.

**Confirmed in the tree — the live path exists and looks complete**, which is what makes this a diagnosis rather than a build. `frontend/src/state/trip-state.tsx` subscribes via `openTripStream` (`:1000`), routes Event changes through `REMOTE_EVENT_CHANGE` into the reducer (`:881`, `:384`), routes other entities through the `memoryChannels` registry (`:879-903`), mirrors remote changes to Dexie, and catches up after reconnect and on `visibilitychange` (`:986`, `:1005`, `:1055`).

Because navigation makes the Event appear, the plausible fault classes are a stale memo/selector/render dependency, a remount reading already-updated provider/cache state, a socket lifecycle issue that navigation corrects, or a partial CREATE payload a particular screen cannot render until a later refresh. **None is established.** Worth carrying into the diagnosis: `frontend/CLAUDE.md` records a memoization discipline on exactly this screen family (`Map.tsx` ticks every second; `MapPane`'s props are memoized on a content key and its handlers are `useCallback(…, [])` over a latest-ref) — a latest-ref pattern that goes stale is a shape this codebase already has.

**Route.** Diagnosis, then a fix **at the shared cause, not a navigation-triggered refresh**. The session should reproduce with two live clients and the receiving client staying on one screen; determine whether the Change reaches `openTripStream`, `applyRemoteChange`, the reducer/memory channel and Dexie _before_ inspecting the screen; mount a representative day/timeline surface, inject a remote Event CREATE, and assert it appears with no remount or route change; check whether Booking/Place/Note/Document metadata share the fault before declaring an Event-only fix; test reconnect and ordinary live delivery separately; and finish with a real two-device validation. **Do not solve this by polling on navigation** — realtime has one canonical path; repair the broken boundary.

### #33 — Newly uploaded documents can spin indefinitely on uploader and peer devices

**Clarified:** after an upload appears to complete, opening the document sometimes stays on a spinner — both on the uploading device and on another device receiving it.

**Reconciliation with shipped work.** Field report **#20** / workstream G2 (session 222) bounded all eight awaits in the document read path with `lib/deadline.ts`'s `withDeadline`, and landed failures in `ErrorState` with a retry. Field report **#22** (session 229) then bounded every API read through `apiFetch`, plus the Dexie snapshot read. So this report must **not** reopen "document reads have no timeout" as if nothing shipped. It is evidence that at least one post-upload path is still outside those bounds, fails to leave loading state, or races metadata against content availability. That both uploader and peer can fail argues against a purely local stale-cache cause, though cache invalidation stays a candidate.

**Confirmed in the tree, and it sharpens the lead:** `trip-state.tsx:894-901` evicts the client blob cache **only** for document `UPDATE` and `DELETE` changes — a `CREATE` evicts nothing, by design (there is nothing cached yet). So the new-upload path and the transition from metadata-available to content-available are precisely the arm no eviction rule covers, and deserve specific inspection rather than another generic cache rewrite.

**Route.** Document-pipeline reliability diagnosis, then a targeted fix. Instrument and distinguish: (1) upload request in flight vs response complete; (2) metadata created/broadcast and attachment visible; (3) blob committed and readable from backend storage; (4) service-worker/Cache API hit or miss; (5) content fetch headers/body; (6) decrypt/decode/object-URL creation; (7) viewer loading-state transition and retry. Validation: upload then immediately open on the uploader; upload while a peer has the trip open, then immediately open on the peer; a cached prior document vs a brand-new one; slow storage/content availability and explicit failure; **every** failure phase ending in the shared retryable error state rather than an indefinite spinner; and retry succeeding once content is available, with no app restart. Note the one bound G2 deliberately declined — **multipart uploads are not bounded** (their headers only arrive after the bytes go up, so "slow" and "dead" look identical and a wrong guess loses an upload); if the stuck phase is the upload itself, that trade is what has to be revisited, not assumed. Do not prescribe Redis, streaming or a new cache before identifying the phase, and preserve ADR-0055's immutable-content/cache policy unless evidence shows that is the faulty assumption.

## 3. Workstream grouping

Eight reports, **seven** lettered workstreams, continuing session 216's `A`–`H` and session 224's `I`/`J`/`K`. `N` and `O` are the two slices of one Maps/Places grouping — same domain, different root causes, so they ship separately rather than as one line.

| Workstream                                    | Reports  | Session type before build                     | Mockup?               | ADR obligation                                                               |
| --------------------------------------------- | -------- | --------------------------------------------- | --------------------- | ---------------------------------------------------------------------------- |
| **L — Copy density**                          | #27      | Copy/UX audit, then a build sweep             | Only if layout breaks | None expected                                                                |
| **M — Map canvas reliability**                | #28      | Diagnosis + instrumentation, then real device | No                    | ADR-0121 only if a heuristic watchdog is needed                              |
| **N — Enrichment recall (non-Latin folding)** | #29      | Reproduction/diagnosis, then a bounded fix    | No                    | Amend ADR-0166 only if matching policy changes                               |
| **O — Text Search viewport bias**             | #34      | Bug-fix                                       | No                    | None                                                                         |
| **P — Derived-field provenance in authoring** | #30, #31 | Build (one session, both reports)             | No                    | Only if #31 needs a persisted explicitness bit — then route it as data-model |
| **Q — Realtime open-screen correctness**      | #32      | Diagnosis first, then a fix at the boundary   | No                    | None unless the diagnosis forces an architecture change                      |
| **R — Post-upload document availability**     | #33      | Diagnosis first, then a targeted fix          | No                    | None unless ADR-0055's cache policy turns out to be the faulty assumption    |

P is one session because #30 and #31 are one mechanism: a derived value follows its source until a person overrides it, across draft, errand and save boundaries. Everything else here is independent — nothing above encodes a build-order dependency.

## 4. Settled vs. intentionally open

**Settled (owner decisions — build them, do not re-litigate):**

- Low-value explanatory copy goes; consequential, recovery and non-obvious copy stays (#27).
- A Place-derived title tracks the selected Place until manually edited (#30).
- A saved default icon stays derived; only a manual selection locks it (#31).
- An open screen must update live across devices (#32).
- A new document must become loadable on the uploader and on peers without a restart (#33).
- An invalid viewport bias must not make address search fail (#34).

**Open — technical questions for the routed sessions to answer with evidence, not missing owner decisions:**

- The root cause of the blank base map, and the affected device/browser matrix (#28).
- The exact failed phase for Kerið: candidate retrieval, transliteration/name score, coordinate route, type/granularity guard, or provider data (#29).
- Whether derived-vs-explicit provenance for title and icon can be inferred safely for legacy rows or needs persisted state (#31).
- The exact boundary where a remote Event goes stale: socket, apply path, provider state, selector/memo, or screen render (#32).
- The exact document phase that remains spinning after upload (#33).

## 5. Not done here, deliberately

No feature code, test, schema, CSS, ADR or mockup was created or changed. No completed work was reopened or duplicated: #29 is written as a residual after ADR-0166 §15/§19/§20 rather than as new enrichment scope; #30 is written against #9's shipped save-time fallback rather than in ignorance of it; #33 is written as a residual after #20's and #22's bounded reads. The eight reports became seven grouped backlog lines, not eight tickets. The confirmed one-line defects (#31's touched-state initializer, #34's unchecked rectangle) were **not** fixed while here.

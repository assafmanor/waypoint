# Session 224 — five incremental field reports reconciled against the current task system

**Date:** 2026-08-08
**Paper only** — no feature code, no ADRs, no mockups, no schema changes. This session's entire output is this note plus the corresponding edits in `backlog.md`.

## 0. What this is, and what it is not

The owner sent a five-item **addendum** (`travelive-field-issues-incremental-handoff-2026-08-08.md`, not checked into the repo) to the 2026-08-07 field-report triage (session 216, `planning/2026-08-07-session-216-field-reports-triage.md`). Since that triage, seven of its nine workstreams shipped: A, B, C, D, F, G1, G2 (PRs #516–#525) — see `backlog.md`'s "Field reports" section for the per-workstream build record. Only E (flight place data) and H (typography) remained open before this addendum.

This session is **reconciliation, not re-triage**: each of the five new reports (`ADD-01`–`ADD-05`) was checked against the current repo, the current `backlog.md`, and the shipped work before writing anything — per the addendum's own rule, "success is accurate reconciliation with the current product state, not maximizing the number of new tasks." Two of the five turned out to refine already-open or already-flagged work rather than start anything new; three are genuinely new residual scope.

**Stable IDs:** the addendum's `ADD-01`–`ADD-05` are mapped to the next available field-report IDs, **`#22`–`#26`**, continuing session 216's `#1`–`#21` sequence. Confirmed `#21` is the highest field-report ID in use before this session (`git grep`/read of the triage note and backlog) — these are unrelated to the Map panel epic's own internal `#1`–`#23` numbering, exactly as session 216 already noted.

## 1. Reconciliation table

| ADD    | New ID | Current status found                                                                                                                                                                                                   | Existing task                                                                                                                                                            | Delta introduced                                                                                                                                                   | Classification                                              | Routing                                                                                                            |
| ------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| ADD-01 | #22    | **Not fixed, not previously filed as its own item — but the exact defect shape was already named in the abstract by G2's own diagnosis.**                                                                              | Refines the "Every other API read has the same missing bound" line (added when G2 shipped, `backlog.md`)                                                                 | Concrete field evidence that the named gap manifests on the **snapshot boot path** specifically, with a reproduction condition (reception-less, not airplane mode) | F (diagnosis first)                                         | Diagnosis session — see §2 for the lead                                                                            |
| ADD-02 | #23    | **Not implemented.** Current shortening algorithm (`place-label.ts`) is exactly what the owner is rejecting.                                                                                                           | Refines **Workstream E** (still open, not yet started)                                                                                                                   | A concrete label-format decision — `City · IATA` — that E's existing line didn't specify                                                                           | E (owner decision folded into the still-open research task) | Same E session — research the data source, apply this format decision                                              |
| ADD-03 | #24    | **Not implemented; not satisfied by the shipped Notes workstream (C).** `ADR-0152`'s model is confirmed single-host per note row.                                                                                      | No existing task — genuinely new                                                                                                                                         | A cross-entity note-sharing product/data-model requirement, layered on top of (not a reopening of) C's shipped correctness fixes                                   | D (data-model decision, ADR expected)                       | New workstream: product + architecture session                                                                     |
| ADD-04 | #25    | **Not implemented.** No swipe/arrow stop-navigation exists on the Map's place card today.                                                                                                                              | No existing task — genuinely new, but built entirely on top of already-shipped semantics (Workstream A's errand-camera fix, Workstream F's one-connection-one-stop rule) | A new interaction feature that explicitly reuses F's already-decided consolidation rule rather than reopening it                                                   | C (open interaction decision, design session)               | New workstream: design (mockup) + build, real-device pass                                                          |
| ADD-05 | #26    | **Not implemented — and there's less to build on than ADD-03: `TripDocument` has no host FK at all today**, not even a single one (unlike Notes, which already had ADR-0152's single-host model before this addendum). | No existing task — genuinely new                                                                                                                                         | A cross-entity document-attachment capability plus the same contextual-sharing semantics as ADD-03                                                                 | D (data-model decision, ADR expected)                       | New workstream: product + architecture session, paired with ADD-03's design conversation but not its storage model |

## 2. ADD-01 — offline reopen hang, no reception (not airplane mode)

### Field report

> Offline does not work correctly... Reopening the app leads to never-ending loading instead of loading the offline data. This is not airplane mode; the device simply has no reception/connectivity.

### What's confirmed vs. hypothesis

**Owner hypothesis, explicitly not diagnosed:** that this is "related to the new domain" (the travelive.app move, PR #513/ADR-0169/ADR-0170). Per the addendum's own rule 8 ("do not document the domain change as root cause unless evidence establishes it"), this is **not asserted here**. What's worth knowing for the diagnosis session: that move deliberately kept the Dexie database name (`waypoint`) and `waypoint:*` storage keys unrenamed specifically so the offline cache wouldn't be wiped (ADR-0170) — but IndexedDB and the session cookie are both **origin-scoped**, and the migration commit's own reasoning ("every spelling of the host is a separate login," ADR-0020) shows the team already knows origin changes can silently orphan local state. Whether a user's installed PWA/bookmark still resolves to a pre-migration origin is a concrete, checkable first step for the diagnosis session — not a conclusion.

**What's confirmed by reading the current code**, and is the strongest lead independent of the domain question: `docs/architecture/sync-and-offline.md` "Read" section documents the intended design — a failed live fetch should fall back to the cached snapshot (`usingCachedSnapshot`, `frontend/src/state/trip-state.tsx:548`), explicitly because `navigator.onLine`'s `'offline'` event "some environments never fire even with no connectivity." But the fallback in `trip-state.tsx`'s boot effect (~line 585, `fetchSnapshot(tripId).then(resolve, reject)`) only runs on **rejection** — and `fetchSnapshot` (`frontend/src/lib/api.ts:374`) calls `apiFetch` with **no timeout, no `AbortSignal`, no deadline**. A device with a connected-but-dead radio (exactly the reported "no reception, not airplane mode" case — unlike airplane mode, where the OS has no interface at all and `fetch` fails immediately) can leave that `fetch` neither resolving nor rejecting, so neither branch of `.then()` ever fires and the boot skeleton spins forever.

This is structurally the **same bug class G2 just fixed for documents**, applied to a different code path — and G2's own build-log already named the general gap (`backlog.md`'s "Every other API read has the same missing bound," added 2026-08-07: _"a snapshot/search/enrichment read that goes quiet is the same indefinite wait on a different screen"_). That line is being refined with this field evidence rather than a new item created, per the addendum's rule 3.

### Not confirmed

Which exact phase hangs (DNS resolution vs. TCP connect vs. a response that never completes) is unknown without a device reproduction — the same caveat G2 carried for documents. The domain-migration angle is a lead to check, not a finding.

### Routing

Diagnosis session, reusing G2's own mechanism (`lib/deadline.ts`'s `withDeadline`) rather than inventing a second one (rule 8) — bound `fetchSnapshot` (and, per the existing backlog line, the other unbound reads: search, enrichment) and confirm the offline fallback actually fires once it can. Real-device reproduction with radios on but no signal, not airplane mode, is the validation condition per the field report.

## 3. ADD-02 — airport labels: city + IATA, not a stripped Google name

### Owner decision (confirmed, not a hypothesis)

The desired label format is explicit and concrete: `Tel Aviv · TLV`, `Vienna · VIE`, `Reykjavík · KEF`. This **rejects both** the raw Google name and the current stripping heuristic as end states.

### What's confirmed in code

`frontend/src/lib/place-label.ts` is exactly the "current algorithm that removes pieces such as 'airport of...'" the report describes — its own header comment explains the category-noise-stripping approach (`נמל התעופה` / `Airport` pattern removal) and explicitly says there is **no IATA field** to read from Google. Workstream E (still open — no PR shipped against it) already scoped researching a real IATA data source (#7) and airport-only search filtering (#6), but its `backlog.md` line did not specify the **display format** — this addendum supplies that decision.

### Routing

Refines Workstream E — no new workstream. The research half (does a clean data source exist, per ADR-0166's enrichment pipe or elsewhere) is unchanged; the requirements now explicitly include: once a city name + IATA code both exist, the label is the compound form, not `place-label.ts`'s stripping heuristic. Per the addendum, fallback behavior when one half is unavailable, and which surfaces get the compact vs. full form, stay open product/design questions for that session — not decided here.

## 4. ADD-03 — notes shared across a linked context (not per-entity, not globally)

### Owner decisions (confirmed)

1. A directly linked Booking + Event should be able to surface the same logical notes.
2. A Place may join that shared context **only when it has exactly one relevant Booking/Event context** — not globally, and not for a Place referenced by many things.
3. A Place reused by multiple contexts falls back to the safer behavior: its own notes stay separate; the Booking/Event pair may still share within itself.
4. If a Place starts unique (and so shares) and later becomes reused, its existing shared notes **stay with the original Booking/Event context** and must not leak into the new one.

**Explicitly not decided:** the storage/schema/link-table shape. "Shared" is a user-visible semantic, not an instruction to copy note rows.

### What's confirmed in code

Workstream C (shipped, PRs #518/#520) fixed real defects against the _existing_ single-host model — Enter/newline, existing notes rendering on booking edit, the NaN-duration bug. None of that touched the host model itself. `packages/shared/src/entities.ts`'s note schema (`NOTE_HOST_KEYS`, referenced from ADR-0152 §1-§2) is unambiguous: **at most one typed host FK per note row**, by design ("A note is one entity and what it is about is a field"). This addendum's request — one logical note visible from two or more linked entities, with conditional Place participation — is not expressible in that model without a change. C's completion does **not** satisfy this report; it isn't reopened, but this is not "the same bug" either.

### Routing

New workstream, not a Workstream C follow-up bug. Product + architecture session, ADR expected if the current single-host model can't express the conditional-sharing rule (it currently can't). That session must define the storage/relationship shape, the "single relevant context" test for Place participation, and the unique→reused transition rule (§4 above) without inventing a migration here.

## 5. ADD-04 — sequential place traversal on the full-map day view

### Owner decisions (confirmed)

- Scope: the full-map view, day selected.
- Swipe **and** explicit prev/next arrows on the selected place card.
- Navigation unit is a **logical map stop**, matching Workstream F's already-decided rule: consecutive same-Place items from one derived connection (e.g., a flight's landing + the next leg's departure from the same airport) consolidate into one stop; a later return to the same Place is a separate stop. This addendum does not reopen that rule — it explicitly reuses it.
- Untimed/flexible-time items appear **after** the timed portion, not dropped from traversal.
- Selection change pans the map.
- Navigation **wraps** at the ends.
- The consecutive-same-Place consolidation is the **confirmed minimum** — broader grouping is explicitly left open for a future design session, not assumed here.

### What's confirmed in code

No swipe or arrow stop-to-stop navigation exists on the Map's place card today (`Map.tsx` has `nextStopId` for the "next stop" tag, nothing for card-to-card traversal). Workstream A (shipped) fixed the errand search-camera and empty-state bugs — unrelated surface. Workstream F (shipped) is exactly the dependency this report leans on: `map-pins.ts`'s one-connection-one-stop numbering and `day-entries.ts`'s untimed/flexible-tail ordering are the primitives a stop-traversal control would read, not re-derive. This is a **new interaction feature** built on settled foundations, not a bug against either.

### Routing

New workstream. Design session with a mockup (swipe/arrow affordances, wrap feedback, conflicts with the canvas's existing pan/pinch gestures — per `frontend/CLAUDE.md`'s drag-arbitration scars, a fifth gesture on this canvas is not free), reusing F's stop/ordering primitives rather than a second itinerary-ordering algorithm (rule 8). Real-device validation required before considering this done, per the report's own owner-flagged mobile-ergonomics concern.

## 6. ADD-05 — documents attach to bookings/events, shared contextually like notes

### Owner decisions (confirmed)

Same contextual-sharing shape as ADD-03, applied to documents:

1. A directly linked Booking + Event may surface the same logical document attachment.
2. A Place may surface those documents only while it has exactly one relevant Booking/Event context.
3. A reused Place's contextual documents stay with their original context, never leaking into the new use.
4. **Explicitly rejected at this stage:** authoring a document attachment directly on a Place. A Place may display inherited documents; it may not originate one.

**Explicitly not decided:** whether Notes and Documents end up sharing one internal attachment/host abstraction. The addendum is direct that similar owner-facing semantics do not imply one storage model.

### What's confirmed in code

Bigger gap than ADD-03: `packages/shared/src/entities.ts`'s `tripDocumentSchema` has **no host FK of any kind** today — not even ADR-0152's single-host pattern. A `TripDocument` is trip-scoped only (`tripId`); there is currently no way to attach one to a Booking, Event, or Place at all. Workstreams G1 (pre-save preview) and G2 (read reliability), both shipped, touched the document **viewing/reading** path exclusively and are unrelated to this report's **relationship/hosting** concern — the addendum's own guidance not to reopen them because "this feature also concerns documents" is correct and is followed here: neither is touched.

### Routing

New workstream. Product + architecture session, ADR expected — this is a bigger schema change than ADD-03 since no host concept exists yet for documents. Worth designing the product semantics alongside ADD-03/#24 (the owner's own framing — "worth designing together at the product/relationship level"), but the storage decision (a shared generic host abstraction vs. two independent per-entity mechanisms) is this session's own call, not assumed here. Must also cover removal/unlink behavior, sync/offline persistence, and migration of existing documents (none of which have a host today, so this is additive, not a migration of existing data).

## 7. What remains intentionally undecided (carried forward from the addendum, not resolved here)

- ADD-01's root cause (including whether the domain migration is actually involved).
- ADD-02's exact data source and fallback policy for a missing city name or IATA code.
- ADD-03/ADD-05's exact storage/schema/link-table shape, and whether they share an internal mechanism.
- Migration strategy for existing Note/Document records under either new model.
- Removal/unlink semantics beyond the owner-stated non-leakage rule.
- ADD-04's exact visual/interaction design (arrow placement, swipe feel, wrap feedback).
- Whether F's one-connection-one-stop rule is the _only_ consolidation case ADD-04 needs, or whether broader grouping is wanted later.

## 8. Not done here, deliberately

No feature code, test, schema, ADR, or mockup was created or changed. No backlog item was duplicated: ADD-01 refines an existing line rather than adding a parallel one; ADD-02 refines Workstream E's still-open line; ADD-03, ADD-04, and ADD-05 are genuinely new residual scope, added once, each linked to the shipped work it builds on rather than restated as if that work were still open.

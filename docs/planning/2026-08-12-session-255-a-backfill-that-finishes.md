# Session 255 — a backfill that finishes (owner report: enrichment takes a long time)

**Date:** 2026-08-12
**Workstream:** `N`, follow-up. One defect, one measurement that refused the obvious fix, and one finding about **source coverage** that no matcher change can reach.
**Touches:** `backend/src/enrichment/enrichment.scheduler.ts` (+ spec), `docs/decisions/0166-place-enrichment-is-a-multi-source-pipe.md` (§14, amended in place), `docs/backlog.md`.
**ADR-0166 §14 amended in place** — "surplus work is dropped, never queued" was the clause that was wrong. **No mockup.**

## 1. Two reports, and only one of them was a defect

The owner cleared `PlaceEnrichment` (as §6.4 instructs before re-testing a match), reopened the app, and reported two things: enrichment **takes a long time**, and some places **still do not match** — naming `פסל החירות`, which is obviously on Wikidata.

**They are one defect and one non-defect, and the split matters:**

- **`פסל החירות` is the slowness.** Traced against live Wikidata: `wbsearchentities` returns `Q9202` first on an exact Hebrew label hit, `P625` is on the pin, `P18` and the `hewiki` article are both present, and the merged matcher resolves it at **0.900** on the name route. It renders as nothing because **its pass had not run**.
- **The Icelandic places in the same screenshot are not the slowness**, and §4 is about them.

## 2. The defect: a backfill that stopped after three

`scheduleMany` sliced the stale list to `MAX_PASSES_PER_READ = 3` and **discarded the rest**. §14 justified that with "the read trigger is idempotent and re-fires on the next snapshot" — which is true and incomplete: a snapshot read happens when somebody **opens the trip** (`trip-state.tsx` fetches on mount and on a resync gap; there is no polling and no clock). So the backfill advanced three places per app-open and then stopped.

With the cache cleared, every place in every trip is stale at once. A 40-place trip needed **fourteen app-opens**. Worse, `MAX_CONCURRENT_PASSES = 3` is process-wide and `start` _refuses_ at the ceiling, so a read arriving while three passes are in flight scheduled **zero**.

**The fix is one change: a pass's completion takes the next stale place.** The surplus is held rather than dropped, and `pump()` — called when a read queues work, and again from every pass's `finally` — keeps the slots busy until the backlog is empty.

## 3. The measurement that refused the obvious fix

The owner approved "tune the caps **and** chain". **The tuning half was dropped, on evidence.**

Raising `MAX_CONCURRENT_PASSES` is the reflex answer to "it is slow", and §22's recall probe is the first thing in this repo ever to have generated real Wikimedia traffic to check it against: **~2,000 requests from one client with a proper `User-Agent`, at roughly 1.3 requests per second, drawing occasional `429`s that a single retry cleared.** A pass is five to eight sequential requests, so three concurrent passes already sit at several requests a second — above what was measured as comfortable. Nothing supports a higher ceiling.

And nothing needs one. **The defect was never the rate; it was stopping.** Three slots kept busy drain a 40-place trip in about eighty seconds from a single app-open. So the cap stays at 3, the request rate is unchanged, and the amendment says so explicitly — otherwise the next person reads "we fixed the slowness" and assumes the number moved.

## 4. What the Icelandic places actually are, and it is not matching

Three of the five places on the owner's screenshot show a placeholder. Measured against every free source reachable from this sandbox:

| saved name        | Wikidata                                       | OSM (via Nominatim)           | Commons                                                             |
| ----------------- | ---------------------------------------------- | ----------------------------- | ------------------------------------------------------------------- |
| `Sigöldugljúfur`  | **none**                                       | waterfall @ 64.1601, −19.1166 | `Category:Sigöldugljúfur`, **no QID, no coordinate**                |
| `Stútur crater`   | **none** (only an unrelated scholarly article) | volcano @ 64.0131, −19.0407   | `Category:Stútur`, no QID, and its files are of **Frostastaðavatn** |
| `Bláhylur`        | **none**                                       | **none**                      | **none**                                                            |
| `Háifoss`         | `Q1244151`                                     | ✓                             | ✓ (QID + coordinate)                                                |
| `Landmannalaugar` | `Q950447`                                      | ✓                             | ✓                                                                   |

The two that enriched are exactly the two Wikidata holds. **This is source coverage, not recall** — no change to `match.ts` reaches any of them.

Three things follow, all worth keeping:

- **OSM would pay, and it is already Phase 2.** It has two of the three. That upgrades §5.4's plan from a plan to a measured one. The stronger argument is not coverage but the **`wikidata=Q…` tag**: Ljótipollur's OSM node carries `wikidata=Q653324`, and `MATCH_METHOD.WIKIDATA_TAG` is already reserved and unused — an _exact_ join that would reach places Wikidata has but that no name of ours can find. **Still blocked on hosting**, which is §5.4's own open question: public Overpass is not for production volume, and both `overpass-api.de` and the kumi mirror are unreachable from this sandbox (Nominatim is what these numbers came from, and its usage policy rules it out for production).
- **Commons-by-name was considered and is rejected, on a measured counter-example.** It is already allowlisted and already queried, and it has categories for two of the three — but `Category:Stútur`'s files are photographs of **Frostastaðavatn, a different lake**, and the category carries neither a QID nor a coordinate to check that against. Matching it by name attaches a confidently-wrong photograph, which is §Context 3's whole subject. **Commons stays a sink reached through a QID, never a source of identity.**
- **`Bláhylur` is not a source problem at all.** No free source carries that name — the lake is `Ljótipollur` everywhere, and OSM does not record `Bláhylur` as an `alt_name` (checked via `namedetails`). Only the QID-tag route above could ever reach it, and only from its coordinates. It is not a matcher gap and it should not be answered with an alias.

## 5. Build log

- Postgres 16 stood up again under the `postgres` user (it does not survive the sandbox restarting); backend suite **609 passed, 1 skipped** (the opt-in live probe).
- `pnpm format` after `pnpm install`, `pnpm typecheck` + `pnpm build` green.
- Six new scheduler specs: the drain-from-one-read case the owner reported, dedupe across two reads, the memory bound logging rather than truncating silently, and the kill switch abandoning a backlog mid-drain. The existing "drops the surplus" spec is kept and **renamed** — that contract is unchanged for the _pick_ trigger, which has no backlog to belong to.

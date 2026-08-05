# Place enrichment — Phase 2 built: the image pipeline

**Date:** 2026-08-05
**Scope:** Phase 2 of the [build plan](2026-08-05-place-enrichment-build-plan.md) — [ADR-0166](../decisions/0166-place-enrichment-is-a-multi-source-pipe.md) §7 as amended by §11.1 and §12.1–§12.2. Backend + one `@waypoint/shared` addition. **Still invisible: nothing renders an image, and nothing triggers a pass.**
**Follows:** [Phase 1](2026-08-05-place-enrichment-phase-1-built.md).
**Not this phase:** delivery to the client (3), the badge (4), the cards (5–6).

## What shipped

| Piece                                                             | Where                                      |
| ----------------------------------------------------------------- | ------------------------------------------ |
| Nominal width, byte cap, blob-key prefix, content path, GFDL rule | `packages/shared/src/enrichment.ts`        |
| `enrichment` route prefix (service-worker half too)               | `packages/shared/src/server-routes.ts`     |
| Subject-agnostic fetch → sniff → store                            | `enrichment/image-pipeline.ts`             |
| Commons `imageinfo`, per-file license + author                    | `enrichment/providers/commons.provider.ts` |
| GFDL-only refusal, per-**file** attribution requirement           | `enrichment/enrichment.policy.ts`          |
| Materialization step + replaced-blob cleanup                      | `enrichment/enrichment.service.ts`         |
| `@Public` immutable content route                                 | `enrichment/enrichment.controller.ts`      |

191 tests across the module and shared (up from 130). No new dependency of any kind.

## Second consumer, not new infrastructure

Every piece was already doing this job for avatars (ADR-0133 §12), so per ADR-0096 this is a
second consumer: `common/storage.ts` for the bytes, `common/image-sniff.ts` to prove them, and
`storage.ts`'s own read-through `blob-cache.ts` on the way back out — which means the cache tier
the plan asked for came free rather than being wired. The content route is the avatar route's
mirror, headers and all. **No new cache, no new byte sink, no second HTTP client, and — per
§12.1 — no image-processing dependency at all.**

## The three rules that shaped it

- **The image resolves through Wikidata `P18` and has its license read on Commons before
  anything is stored** (§11.1). This is the amendment that would otherwise have caused a
  licensing breach: the Wikipedia REST summary's own image returned a **non-free logo** for the
  Eiffel Tower and **a map** for Canal Saint-Martin.
- **No resize step.** We ask `iiurlwidth` for a nominal width and store whichever bucket
  MediaWiki hands back. The fixtures deliberately return **840** for a request of 800, so code
  that assumed the width was honoured would fail a test.
- **The sniffer decides the type; the filename never does** (§12.5). Katz's `P18` is a PNG under
  a `.jpg` name — the very first real fetch in the spike.

## Four decisions the build had to make, all small

**1. A provider still never stores anything.** §5.3 keeps providers pure, and Commons needs
bytes — so the resolution is that Commons returns a **pointer plus the facts about it**
(`ProviderValue.binary`) and the orchestrator materializes it. That keeps the Commons provider
unit-testable with no socket and no disk, and it is what makes the pipeline reusable: ADR-0166's
Consequences promise the link-preview backlog item this machinery, and that only holds while
`image-pipeline.ts` never learns what a place is. Its spec asserts that `store` takes one
argument.

**2. The GFDL refusal lives in the policy, not the provider.** The provider returns the file
with its GFDL license and `valueRefusal` refuses it. Two reasons: one place decides what may be
stored (the same place that enforces §2's Google invariant), and a refusal there makes the
resolver **fall through to the next candidate or to the no-image state**, which is exactly what
§12.2 asks for. A provider that silently returned nothing could not express _why_.

**3. Attribution is required per FILE, not per source.** Commons' source policy says credit is
required because 27 of 32 spike files demand it — but 5 genuinely do not (2× CC0, 3× public
domain), and `extmetadata` carries an `AttributionRequired` field saying which. So
`ProviderValue` gained `attributionRequired?`, overriding the source policy the same way
`license?` already did. Without it, every CC0 photograph would have been refused for lacking a
credit nobody is owed.

**4. We store the bucket's dimensions, not the original's.** §11.4 says "store the original
dimensions" — written while §7 still assumed we would resize ourselves. §12.1 replaced that with
"fetch the bucket Commons already generated", so the honest successor is the dimensions of the
bytes we actually hold. The aspect ratio §11.4 needs for a layout that survives a 0.54 portrait
is identical either way, and the stored numbers now describe the blob rather than a file we
never downloaded.

## One Phase 1 gap this closed

**Confidence was being laundered.** Phase 1 had Wikipedia report `confidence: 1` because a
sitelink is an identity join — true of that hop, and wrong overall: the _item_ may have been
matched by name and proximity at 0.7, and a summary hanging off it is only that trustworthy.
Phase 2 made it visible, because the same flaw would have produced a **confidence-1 photograph**
off a fuzzy match, which is precisely the "confidently wrong" failure §Context 3 exists to
prevent. So an identity provider now settles `identityConfidence`, and both downstream providers
cap their own confidence by it (`inheritedConfidence`).

## Two smaller things worth knowing

**The `@Public` route's access check is a key prefix.** `storage.ts` is one flat keyspace shared
with document ciphertext and avatars, so without `enr_` this route would serve a document's
encrypted bytes to anyone who asked. One string comparison, and a spec that stores a document-shaped
key and asserts a 404. Note the trust class is _easier_ here than for avatars, not harder: these
are published Commons files about public places, not a member's face — there is nothing to
protect but the rest of the bucket.

**A refresh deletes the blob it replaced.** After the row is written, never before: deleting
first would risk 404ing a live immutable URL if the write then failed. Best-effort, since a
leaked blob costs storage while a throw would fail a pass whose real work had already succeeded.

## Environment

**Egress to Wikimedia is still blocked**, so the Commons provider is tested against recorded
fixtures. Their license strings, artists and `AttributionRequired` values are the real ones from
[`…-licenses.json`](2026-08-04-enrichment-coverage-spike-licenses.json) — all nine distinct
license strings, including the GFDL-only file and the two that need no credit. The image bytes in
the specs are real JPEG/PNG signatures, because the sniffer is the thing under test.

**So no real image byte has ever been fetched by this code.** That is unchanged from Phase 1 and
it is the honest limit here: the fixtures encode what the spike observed, not what the pipeline
does against a live Commons. The first networked run is worth watching, and the `800 → 840`
bucket assumption is the specific thing to check.

## Still open

- **The device pass with real Commons files** — whether a photograph is legible at 40px. Phase
  4's premise, and now genuinely reachable: this phase produces the real bytes it needs.
- **`ENRICHMENT_IMAGE_NOMINAL_WIDTH_PX` is 800 and unmeasured.** The spike measured the 500
  bucket at 36–250 KB; 800 is chosen for ADR-0167 §3's 132px full-width hero and nothing has
  weighed it. The one number the device pass should revisit.
- **Hours (ADR-0166's own Phase 2)** — still uncosted for restaurants; `FIELD_SOURCE_PRECEDENCE`
  already names OSM, so it is a provider plus a registration once the Overpass-by-coordinate
  measurement exists.

# 0187 — Detail is live, and an extract is only for the plane

**Date:** 2026-08-14
**Status:** Accepted (design). Amends [ADR-0186](0186-the-map-is-ours-and-it-works-on-a-plane.md) §3 and §4 — specifically its 2026-08-13 amendment's _"So there is no range-proxy"_, which this reverses for the **online** path only. §5 (metering), §6 (retention) and §7 (the style) are untouched.

## Context

Two reports from the owner using the first working map to **research** a place, and they are one problem seen twice:

> _"The map pans correctly but the pins don't appear until the list row is selected."_

> _"The selected area is not filled with zoomed data until refreshing or like in a few minutes. This is going to be a headache for users because they'll want to immediately see the nearby places to where they're researching. And thinking of it, they'll want immediate zoom data for anywhere they look."_

The second is this ADR. (The first is not reproducible from the harness — booted a Bangkok trip, mocked `search-text` with two Chiang Mai results 580 km away, and both rings drew immediately and on screen before any row was selected. `MapPane` renders every entry of `results` with no gate on `selected`, and the Places proxy's field mask carries `places.location`. It stays open, and it is **not** assumed to share this cause.)

**The mechanic, which is worse than "the extract is stale".** `MapService.coordinatesFor` sweeps **every** `Place` row on the trip. Picking a search result persists a `Place` row immediately as the dedup cache ([ADR-0112](0112-place-in-trip-is-referenced-not-cached.md)) — deliberately **not** "in the trip", which requires being referenced by a saved entity. So merely _researching_ a place:

1. changes the coordinate set, so `mapRegionFor` yields a new `signature`, so `mapExtractKey` is a **new key that is not stored**;
2. fires ADR-0186 amendment 269e's rule — serve nothing, `503` + `Retry-After`, cut in the background — for **minutes**, on a two-cluster region;
3. silently grows the trip's archive to cover somewhere you looked at once and never saved;
4. throws away a perfectly good archive, which §6's eviction then has to collect.

**So the invalidation is triggered by an act that carries no commitment**, and the ground under the thing being researched is the z0–6 world layer until the cut lands — which ADR-0186's own amendment 269b already measured and called by its right name: not coarse, **empty**. A z6 tile overzoomed to z14 is one flat landmass.

**And the deeper fault is that the extract is doing two jobs.** It is the offline artefact _and_ the online detail. Those have opposite requirements: an offline artefact wants to be small, stable, and cut from things you have committed to; online detail wants to be everywhere you look, instantly, and to follow a camera that goes wherever curiosity does. Every symptom above is the two jobs pulling against each other.

## Decision

### 1. Online, detail is a live read of the upstream planet through our backend

A tile the trip's archive does not cover is not a gap to be filled by cutting a bigger archive. It is a read.

- **`GET /map/planet.pmtiles` is a byte-range passthrough** to the upstream Protomaps build, fronted by a server-side cache of hot ranges. Not a tile server: the `pmtiles` protocol already does the directory walking client-side, so this is a dumb proxy and the renderer, the style and the protocol are unchanged. Same seam, same code path — which is ADR-0186 §3's actual principle, and it is being kept rather than bent.
- **Pinned to a build id, which is in the URL** (`planet-20260813.pmtiles`). The upstream is a _daily_ build, so an unpinned proxy would change byte offsets underneath directory pages a client has already cached — a class of corruption that would present as garbage tiles with no error. A new build is a new URL, so it is also its own cache bust.

### 2. Offline, detail is the downloaded extract — and that is now its only job

One detail source at a time, chosen by connectivity, which is what keeps this from becoming the doubling problem (see Alternatives). Online: the live source. Offline: the world layer plus whatever extract was downloaded. The style is rebuilt on the flip through the same live-restyle seam dark mode already uses (ADR-0186 §7) — no second renderer, no second code path, and the camera survives it.

**§6 is unchanged and is now literally true.** "An extract is a cache, never data" was already the rule; until now the extract was also the online render path, which quietly made it load-bearing. It is not any more, and that is what makes the rest of this safe.

### 3. An extract is cut from COMMITTED places only

`coordinatesFor` sweeps `Place` rows; it must sweep **referenced** places — the same "in the trip" test ADR-0112 already defines and `usePlaceSearch`'s `alreadyInTrip` already uses on the client. Browsing then cannot invalidate an archive, which removes the 503-on-research path at its cause rather than rewording it.

This is a defect fix that stands on its own merits and does **not** depend on §1 landing. It is listed here because it is the same finding.

### 4. What this deletes

- **The 503 on the research path.** Adding a place in a second country still cuts a new extract, but that cut is now a background preparation for a flight rather than something a person is waiting on to see a map. ADR-0186 amendment 269j's open item (a) shrinks to what it always should have been: a state on the _download_, not on the render.
- **The world layer's online job.** It stays as the offline floor (§4's "nowhere is ever blank") and stops being what you get when you look somewhere new.

## Measured, not reasoned about

One screen of z14 Bangkok, read live from the 127.88 GiB planet build through the app's own origin, cold:

|                              |            |
| ---------------------------- | ---------- |
| Range requests               | **8**      |
| Bytes                        | **509 kB** |
| First paint (incl. app boot) | **3.9 s**  |

Two honesties about that number. It was proxied by Playwright rather than by our backend, so it carries **no** server-side cache — the deployed shape should be faster on a repeat and no slower on a cold read. And **the incremental cost of panning to a new city is unmeasured**: the probe's camera jump did not fire. Directory pages are cached client-side by the protocol, so the expectation is one leaf directory plus the tiles, but that is a claim this ADR does not get to make yet. It is Phase 3's first measurement.

## Consequences

- **Backend gains egress it did not have**, and a cache it did not have. `documents/blob-cache.ts`'s two-tier bounded-LRU is the template the backend's own `CLAUDE.md` names for exactly this; a second cache follows that shape rather than inventing one.
- **A live read is a network dependency for browsing**, which is fine (you are researching, you are online) and is precisely what the extract still covers when you are not. The failure mode is the one the app already handles: no tiles, the cue, the retry.
- **The range offsets a client requests describe where someone is looking.** Not a third-party leak — the proxy is ours — but it is a reason the route stays guarded rather than becoming `@Public()`, and it is a new entry in that standing question (ADR-0186 §6's owner call on `world.pmtiles`).
- **Attribution is unchanged.** Same OSM data, same ODbL line.
- **ADR-0186's §3 amendment is narrowed, not overturned.** Its argument against a range-proxy was against proxying _every tile forever as the primary mechanism_, on storage and latency grounds, when the alternative was mirroring 128 GB. That argument is still right about the offline artefact and about the trip's own city. It was never asked about ground nobody has committed to, which is what this covers.

## Alternatives considered

- **Extract where it covers, live only outside it.** Best latency in the place you actually are, and rejected on the doubling: two detail sources over the same ground draw every label and road twice, a few pixels apart, one overzoomed — the exact "blurry double" ADR-0186's own underlay comment exists to avoid. Avoiding it means adding and removing the live source as the camera crosses the extract's bbox, which is live style manipulation driven by geometry, and it is the fiddliest of the three for a benefit that a server-side cache mostly buys anyway.
- **Fix only the invalidation (§3), keep tiles as they are.** Cheapest, and it fixes the churn and most of the 503s. Rejected as the whole answer because it leaves the reported complaint standing: researching somewhere new still shows empty ground until you save something there. Kept as §3, because it is right either way.
- **Cut a small extract per searched place.** Rejected: it answers "immediate" with "minutes" again, and it makes browsing generate artefacts that retention then has to reason about. An extract should be a decision, not a side effect.
- **Raise the world layer to z0–8.** Measured in ADR-0186 §4 at **525.6 MB**, twelve times the bytes, and still not street detail. It was rejected there and nothing here changes that.

## Phasing

Slots into ADR-0186's Phase 3 rather than beside it, because it changes what Phase 3 downloads and why:

- **3a — the invalidation fix (§3).** Independent, small, shippable now.
- **3b — the live source (§1/§2).** The proxy, its cache, the third `mapTileUrls` entry, and the connectivity-driven restyle. Measure the pan cost first.
- **3c — download, retention, metering.** Unchanged from ADR-0186, and cleaner for landing after: an extract that is only ever the offline artefact is a much simpler thing to budget, evict and pin.
- **3d — session research cache.** Keep live-detail ranges for anywhere the person explores in a bounded memory LRU for the lifetime of the app session. It survives camera moves, theme changes and Map-tab remounts, but not an app/page restart. Persistent device storage stays journey-shaped: the world floor plus extracts around saved or referenced places.

## 2026-08-14 implementation amendment — 3a and 3b built

3a now cuts extracts from places referenced by saved events, bookings or maybe-items; a search-only dedup row cannot change the extract signature. 3b serves the configured planet build through the guarded, build-id URL `GET /map/planet-20260813.pmtiles`, accepts only closed byte ranges, validates the upstream `206` and exact `Content-Range`, coalesces identical cold reads, and caches hot ranges in a bounded memory LRU plus an optional local-FS tier. The same shared build constant names the default upstream archive and the client URL, so changing one without the other is a compile-time diff rather than silent offset drift.

The online style now always uses the live detail URL over the coarse world underlay. The extract URL remains available to the client as the 3c download artefact but is not an online render source. 3c owns the connectivity-driven live restyle once a local archive exists; until then this checkpoint deliberately has no false offline mode.

## 2026-08-14 roadmap amendment — 3c built, 3d accepted

3c now stores the world archive and journey-shaped extracts on the device under the retention and metering rules above. Researching arbitrary ground stays live online. Phase 3d adds a bounded, memory-only cache for the PMTiles ranges fetched during that research session, so revisiting or restyling explored ground is immediate without turning every pan into permanent device storage. It is sequenced before Phase 4's Google deletion pass.

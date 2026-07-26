# Session 132 — the Phase-6 map key, as a click-path

**Date:** 2026-07-26
**Type:** docs only (no code). Follows session 131 ([ADR-0121](../decisions/0121-embedded-map-phase-6-design.md)).

## What was asked

Phase 6's first step is the human Google Cloud gate: set up the Places/Maps API key for the embedded map. The ask was for the **exact** configuration steps, not a summary.

## What existed

ADR-0121's "remaining human gate" names four boxes and points at `engineering/prerequisites-checklist.md` for the click-path — but the checklist carried the four boxes as one-line summaries ("Google Maps Platform → Map management → create a Map ID"), which is a to-do list, not a click-path. Nothing was wrong in it; it just could not be followed without knowing the Console already.

## What changed

`docs/engineering/prerequisites-checklist.md` — the Phase-6 subsection becomes seven ordered steps with per-click boxes and Console URLs. The decisions folded in, rather than mechanical expansion:

1. **Order changed: the quota cap moves before the key.** A public browser key that exists before its SKU is capped is an uncapped public key, and the cap is what bounds forged-referrer abuse (ADR-0108 §6). The old list had the cap last.
2. **The daily ceiling is now a number with arithmetic behind it** — 300/day: ~3× the ~100/day real use of ADR-0121 §4, and 9,000/month if pinned every day, still inside the 10,000/month free tier. So the worst case a leak reaches is a bill of roughly zero.
3. **The referrer list gains staging and localhost.** The old line said "locked to the production origin", which is what single-origin (ADR-0020/0031) suggests — but single-origin means one origin _per environment_, and staging is its own domain (ADR-0104). Without a staging entry the map is blank on staging only, which reads as a code bug. `http://localhost:5173/*` lets local dev use the real style instead of `DEMO_MAP_ID`.
4. **Where the vars actually go was wrong-by-omission.** `frontend/vite.config.ts` sets no `envDir`, so Vite reads env files from `frontend/`, not the repo root — the root `.env` is the backend's and Vite never sees it. The step now says `frontend/.env.local`. Also: Railway needs them at **build** time (Vite inlines them), so a var added after a build does nothing until the next deploy.
5. **A verification step, and the error strings.** Because a missing/typo'd key degrades the tab to list-only rather than crashing (ADR-0121 §2), a wrong value fails _quietly_ — so the section now ends with what each failure looks like (`ApiNotActivatedMapError`, `RefererNotAllowedMapError`, markers silently absent = bad `mapId`, unstyled-but-working = the style association or its ~6h propagation).

## Notes

- The four boxes themselves are unchanged, so **no ADR needed** — this is the click-path ADR-0121 already delegated to the checklist. ADR-0121 stays the decision record; the checklist is the current-state doc.
- API facts were reconfirmed in session 131 (same day) and are not re-litigated here. The only new external facts checked this session were Console navigation and the `Map loads per day` quota metric name, which Google moves independently of pricing.
- **Nothing is ticked.** Every box is still `⏸️ 👤` — this session made the gate followable, it did not pass it. The backlog line stays until someone with Owner/Editor on the `waypoint` project runs it.

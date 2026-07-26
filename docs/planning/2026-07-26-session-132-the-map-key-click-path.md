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

## The gate was then passed, same session

Someone with Owner/Editor ran it: Maps JS API enabled, the Dynamic Maps daily quota capped and the budget alert confirmed against the new SKU, both Map IDs created, the browser key minted and restricted, and the three `VITE_` vars set locally + on Railway production. **The embedded-map build is unblocked.** The checklist and backlog record it; two non-blocking boxes stay open (style import, Railway staging vars).

## The map styles, and one question worth recording

The styles were the one thing the human step couldn't supply from a brief, so they are now authored as importable JSON in [`design/map-styles/`](../design/map-styles/README.md) — day + night, every colour taken from `tokens.css` rather than picked by eye, with a README carrying the token→map-element mapping so a palette change is a mechanical re-import.

Three deliberate calls in the styling: **all label icons off globally** (with Google's POI glyphs gone, our category teardrops are the only figures on the canvas — the strongest single move toward ADR-0106 §C's "loud pins"); **`poi` off except park _geometry_** (a flat grey city is disorienting, so parks keep a desaturated fill while their labels go with every other POI label); and **road labels off except highways** (street names are noise under a pin, but highway and rail ribbons are how you read a city at the extent-fitted zoom of ADR-0121 §7). Water is a cooler step off `--screen`, never a palette blue — that would be a colour flood competing with teal.

**Asked and answered: no per-mode (Trip/Plan) styles.** Three reasons, recorded so it is not re-proposed: `mapId` is construction-time, so swapping it on a mode toggle re-instantiates the map and bills a fresh Dynamic Maps load — exactly what ADR-0121 §4 forbids; `--plan` violet across the ground is the colour flood ADR-0106 §C bans, and would fight the category pins; and the map **already** differs by mode in the right layer, as figures — the Plan-only dashed connector (§10) and the Trip-only amber next-stop cue (§6). Day/night is different in kind, since `--screen` itself remaps under `data-theme="dark"`, which is why that one needs a second Map ID.

Neither JSON has been seen on a rendered map (§13's stated limit), so one adjustment round on device is expected — most likely water contrast and the park fill, the two values reasoned to rather than lifted. The README says to fix them in the files, not just the Console, or the next import reverts the fix.

**The first pair was written in the wrong schema, and that is worth recording.** They were authored as the legacy embedded styler array (`featureType` + `elementType` + `stylers`) — the format most Maps styling examples in the wild use. The Console rejected them: cloud-based maps styling (CBMS) is a **different, explicitly non-backward-compatible** schema — an object with `variant`/`backgroundColor`/`styles`, each rule selecting a single dotted **`id`** (`pointOfInterest.recreation.park`) and carrying `geometry`/`label` objects with named properties. Google publishes it at `developers.google.com/static/maps/cbms-json-schema.json`; that host is blocked by this environment's egress policy, so it came in as an upload.

Its sharp edges, now documented in the styles README: 6-digit hex only (opacity is a separate property, never an 8-digit colour); `strokeWidth` 0–8 in steps of 0.125; `visible` is a boolean **or** a per-zoom `z00`–`z22` object; and **allowed properties differ per feature id** — `political.border` takes `color` where every other stroke takes `strokeColor`, POI labels add `pinGlyphColor`/`pinOutlineColor`, and several ids accept `label` only or `geometry` only. A property legal on one id is a validation error on another, which is exactly the kind of mistake a careful reading still makes.

**So validity is now verified, not asserted:** both files pass `npx ajv-cli@5 validate --spec=draft7` against Google's schema, and the validator was negative-controlled (the old legacy array and a deliberately out-of-range `strokeWidth` both fail) so a passing result means something. The README carries the command; re-run it after any hand edit.

## A CI failure worth recording, because the cause was invisible

The first commit reformatted four unrelated files and CI went red on exactly those. The claim written into the PR — "main was already red" — was **wrong**, and wrong in a way that confirmed itself: this sandbox has no `node_modules`, so `pnpm format` resolved a **global prettier 3.8.1** off `PATH` instead of the lockfile's **3.9.5**, and the verification check ran with the same wrong binary. 3.8.1 and 3.9.5 disagree about breaking union types across lines, so 3.8.1 rewrote four files 3.9.5 was happy with.

The repo's own pre-commit hook (`.claude/settings.json`) has the same hole, and it is why the revert kept silently undoing itself — the hook reformatted the staged files back to 3.8.1 style and re-added them, so `git commit` saw nothing to commit. Its guard is `pnpm exec prettier --version >/dev/null || runner='pnpm dlx prettier@3.9.5'`, and **`pnpm exec` falls back to `PATH`** — so the probe succeeds with any global prettier and the pinned fallback never fires. Comparing the resolved version against the lockfile would close it. Left unfixed by choice (it is tooling, not this session's subject) and flagged on the PR; worked around here by installing 3.9.5 into the local gitignored `node_modules`.

**Lesson for any agent session in this repo:** verify formatting with `npx prettier@<lockfile version> --check .`, not `pnpm format`, unless `node_modules` is actually installed.

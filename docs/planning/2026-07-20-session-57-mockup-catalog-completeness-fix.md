# Session 57 — Mockup catalog completeness fix

**Date:** 2026-07-20
**Follows:** session 55 (moved the catalog to `docs/design/mockups.md`), asked
by the user to confirm no other anti-patterns were missed.

## What

Re-audited more rigorously than the session-54/55 passes: cross-checked every
ADR reference across `CLAUDE.md`, all three domain `CLAUDE.md` files, and
`docs/design/mockups.md` against each ADR's actual `Status` line (all
consistent — no more stale sign-off claims), then diffed the full `mockups/`
directory listing against what the catalog actually names.

Found two real gaps — mockups an **Accepted** ADR cites as its design record,
absent from the catalog entirely:

- `trip-mode-day-view-v1.html` — ADR-0043 (day-view now-line/phases/archive
  chrome, Accepted): "Design exploration and two review rounds are recorded
  in `mockups/trip-mode-day-view-v1.html`." The catalog's `trip-dashboard-v2.html`
  entry claimed to "remain the reference for the other tabs (map/day)" —
  stale now that day has its own dedicated, ADR-cited mockup.
- `logo-v1.html` — ADR-0087 (app logo, Accepted, dated today): "Mockup:
  `mockups/logo-v1.html` — four explored directions, the chosen one fitted
  into the landing + invite screens." Simply never made it into the catalog
  (the ADR is same-day).

Fixed: added both as entries, and narrowed the `trip-dashboard-v2.html` entry
to say it's now only the reference for **map** (the one tab without a
dedicated mockup).

## Judgment calls — left out

Twelve `mockups/*.html` files are cited nowhere in the catalog. Six are cited
by an ADR only as supporting evidence for a rejected/chosen interaction
**detail**, fully narrated in the ADR's own prose (`event-time-setter-v1`/`v4`
in ADR-0036, `parallel-events-v1` in ADR-0041, `event-item-icons-v1` in
ADR-0038) — footnotes, not a "go look at this file" reference, unlike every
catalogued entry which is a substantial whole-surface or whole-primitive
mockup. `mode-switch-transition-v1`/`nav-active-states-v1` are cited only by
old planning notes, same shape. `trip-icon-picker-v1.html` is cited by no ADR
at all — no basis to add it without opening the file to guess its purpose.
Consistent with the catalog's existing curation bar; not added.

## Scope

`docs/design/mockups.md` only (2 new entries + 1 corrected). No code, ADR, or
INDEX change — the file's existence and routing were already decided by
ADR-0097; this is a content-completeness fix within it.

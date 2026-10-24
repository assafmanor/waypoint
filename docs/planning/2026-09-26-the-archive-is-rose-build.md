# 2026-09-26 — The archive is rose: the build (Phase 3)

**Decision:** [ADR-0240](../decisions/0240-the-archive-is-rose.md) · **Design session:** [`2026-09-26-the-archive-is-rose.md`](2026-09-26-the-archive-is-rose.md) · **Epic:** [build plan](2026-09-25-a-finished-trip-is-a-memory-build-plan.md) Phase 3.

Built 3.1 to 3.5 in one PR: the session had a single branch, 3.2 to 3.5 all read 3.1's tokens, and several files (`screens.css`, `he.ts`) carry two of them. Phase 4 (the memory Home) and 6B, plus 3.5's cover, need Phase 2's recap derivation, which has not landed.

Checked on the running app at 360px in both themes, on the seed four days after the trip ended with rows settled by hand. The shell and header carry `data-phase="past"`. The band is `#EFD9E2`. The anchor reads `לפני · 4 ימים` at 31px inside its 54px box. There are no done circles and no dashed soft rows, and no day pill is dimmed. The skipped row renders.

## What the build changed from the drawing

- **The anchor's age uses the app's one elapsed ladder** (`formatDuration`, ADR-0114), not the ADR's own rungs. Weeks therefore start at 7 days rather than 14. A second ladder for one slot would have been the duplicate that rule 8 forbids.
- **The done chip was already styled twice.** Plan's `.tag-done` and Trip's `.wp-event-tag-done` were the same chip. Both rows now render `ui/domain/DoneChip`, which also owns the undo (moved out of `EventCard`). `--ok-deep` therefore fixes Trip's chip too. The class keeps Trip's name, because `e2e/done-chip-undo.spec.ts` finds it by that name.
- **The archive banner had one host and gained a second.** It is now `ui/domain/ArchiveBanner`, and its CSS moved out of `screens.css`.
- **A skipped row is kept, but not clustered.** `buildTimeTree` gained a `keepSkipped` option that only PlanDay's read-only archive passes. The other three consumers (map pins, the glance, DayView) are unchanged by construction. The first render put the kept row inside a violet `חופפים` overlap cluster with the done row beside it. A thing that did not happen overlapped nothing, so skipped rows now sit at the top level in start order, outside nesting and clustering.
- **Real overlaps on a finished trip lose their violet.** An overlap between two done rows is a fact, not a conflict to resolve, and violet is plan's alone. The cluster box and seam tags go neutral under the phase.
- **The phase reaches every `.mode-chrome` host:** the header, the note full-screen bar, the Index search bar, and the loading skeleton. Plan sets `--chrome-bg` on the header itself, so the phase has to be on each host as well as on `.app`.
- **Tile copy follows 0.4's shape:** `אין מסמכים` and `אין פתקים`, not the mockup's `לא צורפו` / `לא נכתבו`.

## The violet probe (owner: _"I still see plan mode color palette … please probe for all misses like that"_)

A finished trip still reads `data-mode='plan'` for its light-band layout, so every rule that paints violet under that attribute reaches it unless something says otherwise. 261 CSS references to plan's colours were too many to audit by reading. A probe walked the rendered app instead, in both themes. It covered every tab, several days, the read sheets, the settle chooser, the Index lists and search, the Map's selection and search, the share sheet, the roster, and trip settings. It flagged every painted colour between 290° and 325° CIELAB hue. It found:

- **The Home hero** (`.prep-past`) was plan's violet surface, with a violet `עיון בימי הטיול`. It now uses a rose surface pair (`--memory-surface`/`-2`, literals in both themes, darker in dark per ADR-0158 §4). The hero's white-alpha ink clears 5.49:1 at the brightest end. The memory Home (Phase 4) replaces this card.
- **The Map's selected scope chip and the Index's selected filter pill** read `--idx-accent`, which each screen sets to `--plan` in plan mode. Both select in rose under the phase, as the day strip does.
- **Two focus rings** a finished trip still reaches, the task tick and the settle button, now use rose. Keyboard focus is invisible to the probe, so these came from a static pass over every `--plan` focus rule.
- **Not colour, and worse: write paths on a finished trip.** The probe also listed visible edit and add controls. PlanDay's booking read offered `עריכה`, the Map's selected place offered `עריכת המקום` and `מחיקת המקום`, and `EventDetail` never took the `frozen` flag, so an event's read could add notes and tasks. ADR-0239 §4 makes settling the only write. Phase 0 withheld the add sources and missed these. All are now withheld, with a Map spec for rename and delete.

**Allowed, and left:** the lodging category pin (`--cat-lodging`) and the plum avatar (`--id-plum`) sit near violet by design. `design-language.md` separates the decorative ramps from the semantic hues by chroma, not hue angle (ADR-0133). Trip settings' rename and delete stay available (ADR-0039).

**Kept as a spec:** `e2e/finished-trip-palette.spec.ts` walks Home, a day with a done and a skipped row overlapping, the Map, the Index and its bookings list, in both themes, and fails on any violet. It was checked by reverting one fix: it failed naming exactly that chip.

## Seen and left

A walking leg on a finished trip still draws between the last done stop and a skipped row that follows it, because legs are derived from the stops and not from the settle state. It reads acceptably, since the next line is struck through, and it belongs to Phase 5's map-as-journey work rather than here.

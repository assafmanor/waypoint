# 0240 — The archive is rose: a finished trip's palette and posture

**Status:** Accepted 2026-09-26 (owner: _"Rose, as per your recommendation"_). **Nothing built.** The build is phased below, inside the epic's Phases 3, 4 and 6B. Mockup: [`mockups/past-trip-v1.html`](../../mockups/past-trip-v1.html). Session note: [`planning/2026-09-26-the-archive-is-rose.md`](../planning/2026-09-26-the-archive-is-rose.md). Epic plan: [`planning/2026-09-25-a-finished-trip-is-a-memory-build-plan.md`](../planning/2026-09-25-a-finished-trip-is-a-memory-build-plan.md) §1A.
**Date:** 2026-09-26

**Amends** [0028](0028-plan-violet-color-budget-dark-ready.md) (the semantic budget gains a fourth hue) · [`design-language.md`](../design/design-language.md) (palette, color coding, mode identity, dark remap) · root [`CLAUDE.md`](../../CLAUDE.md) rule 4 · [0044](0044-settling-a-finished-trip.md) (the archive row's done circle leaves, §5) · [0049](0049-index-tab-mode-and-lifecycle.md) §2 (its wash is not built; its banner is §6 here).
**Fills in** [0239](0239-a-finished-trip-is-a-memory-not-a-plan.md) §6, which fixed the constraints and left the values to this ADR.

## Context

The owner's brief for Phase 1A: _"We should maybe come up with a whole new color palette for past trips."_ ADR-0239 §6 ruled out Plan's violet (rule 4 gives it to plan mode alone) and ADR-0043's desaturated wash (a wash says "less", and this is the page people come back to). It fixed three constraints: both themes with contrast floors met; a hue that collides with none of amber, teal or violet; and inside it `--ok` still marks a settled record, teal a place, amber a clock.

Plotted in CIELAB hue, the app's semantic colours sit at `--miss` 32°, amber 70–76°, `--ok` 157°, teal 185°, the trip band 277°, `--me` 290° and `--plan` 303°. Three wide gaps are left: olive, cyan-blue and rose. The mockup drew one candidate from each of olive (moss) and rose, plus sepia, the obvious "old photograph" idea. Cyan-blue was dropped before drawing: 11 ΔE00 from `--me` and 9 from the trip band, so a finished trip would read as a live one.

## Decision

### §1 · The archive's hue is rose

| Candidate | Nearest existing meaning (ΔE00, light · dark) | Other failures                                    |
| --------- | --------------------------------------------- | ------------------------------------------------- |
| **Rose**  | `--miss` 20.1 · 19.5                          | none                                              |
| Moss      | `--ok` 14.6 · 14.7                            | the selected day's `--on-fill` is 3.91:1 in light |
| Sepia     | amber 22.9 · **13.3**                         | `--on-fill` on it is 4.19:1 in light              |

**The line is ΔE00 15, and it comes from the app itself.** The closest pair the app already ships is teal against `--ok` (11.6 · 12.9), which is exactly the pair ADR-0028 had to fence apart ("statuses never borrow teal"). A new hue must not sit closer than that to any existing meaning. Moss fails against `--ok`, which is the one colour a record most needs to stand out; sepia fails against amber in dark, where a clock would blur into the chrome.

### §2 · The tokens

A `--memory` family beside `--plan`, the same shape: a fill, its ink, a wash, and a chrome band. Plus `--ok-deep`, `--ok` as ink (the `--miss` / `--miss-deep` split of ADR-0158 §1), because §5 makes the `היינו` chip the only done mark and `--ok` at 10px on its own tint is 3.03:1.

| Token                | Light                     | Dark                        |
| -------------------- | ------------------------- | --------------------------- |
| `--memory`           | `#A9507F`                 | `#DC8AB5`                   |
| `--memory-deep`      | `#86395F`                 | `#EBA5C9`                   |
| `--memory-tint`      | `rgba(169, 80, 127, 0.1)` | `rgba(220, 138, 181, 0.14)` |
| `--chrome-bg-memory` | `#EFD9E2`                 | `#33202B`                   |
| `--ok-deep`          | `#2B7050`                 | `#6FD49F`                   |

Measured in the mockup (all four renders agree): `--memory-deep` on `--card` 7.64 · 7.60, on `--screen` 6.30 · 9.19, on its band 5.68 · 7.78; `--chrome-ink-dim` on the band 5.97 · 6.85; `--on-fill` on `--memory` 5.07 · 6.45; `--ok-deep` on the chip's tint 5.16 · 6.94. The band sits 8.9 · 15.0 ΔE00 from Plan's (ADR-0158 accepted 8.4 between trip and plan).

**The dark band is a literal, not `color-mix(--memory 12%, --card)`** as Plan's is. `--card` is a blue, and a little rose on a dark blue comes out at hue 292–305°, Plan's own angle, 3.6 ΔE00 from Plan's band. It is the same reason `tokens.css` already gives for trip's light band being a literal.

**Rule 4 now reads:** amber = time & commitment only; teal = location only; plan violet = plan mode only; **archive rose (`--memory`) = a finished trip only.** Rose is never a CTA, never a status and never decoration outside a finished trip.

### §3 · The chrome

- **One band through the existing contract** (ADR-0158 §5): `.app[data-phase='past']` and `.mode-chrome[data-phase='past']` set `--chrome-bg: var(--chrome-bg-memory)`. Both are needed: Plan sets `--chrome-bg` on the header itself (`.mode-chrome[data-mode='plan']`), so an `.app`-level value never reaches it. The mockup's first render caught this. The ink ramp is shared and clears on the new band.
- **The six accents Plan writes for itself** switch to rose: the trip pill's tint and edge, the swap chip, the gear and share glyphs (`--memory-deep`), your avatar's ring, the `+N` bubble, and the tab bar (`--nav-accent: --memory-deep`, `--nav-tint: --memory-tint`). Focus rings in the archive's own controls are `--memory`.
- **No texture.** The drafting grid is the drafting table's; a record is not being drafted. A finished trip is identified by two channels, the band's hue and the anchor's words, plus the cover on the Home.
- **The day strip:** the selected day is `--memory` on `--on-fill`. **No pill is dimmed:** `.wp-daypill.past` (opacity 0.45) exists for a live trip's days behind you, and after the trip every day is behind you, so it would wash the whole strip. Phase 0.2's rules stand (day 1 selected, no gap marker).
- **The anchor's words** (Phase 0.2 left it empty): `לפני` over the trip's age, in words, in the chrome's own ink: `4 ימים`, then weeks up to 8, months up to 11, then `שנה` / `שנתיים` / `N שנים`. It is not amber: an age is not a commitment, just as `יום N/M` never was. Measured at 31px inside the 54px anchor. Rejected: the year (static, says nothing the day after), `הסתיים` (the same word forever), the trip's dates (the cover already has them).

### §4 · The memory Home

Replaces `PlanHome`'s past branch (Phase 4). Top to bottom, from primitives that exist:

1. **The cover card** is a `DayHead`-shaped card. `PhotoBand` at a new `cover` density (168px) holds the trip's best day photo, with its place and credit on the scrim. It bleeds to the day strip the way a day head with a photo does (ADR-0219 §3). Below it: the trip's name (`--font-head` 24px), its dates, days and destination, and the group's faces (`Avatar` at 28px, overlapping) with their names. **No placeholder when there is no photo**, as in ADR-0219.
2. **The stragglers sit in the card's footer band** (`.wp-dayhead-foot`), where a day head keeps its one action: `○ 2 לא סומנו · חזרה למלון, גינזה` and `לסמן` (`.new-event-btn` as it is), which walks the list one row at a time on `SettleControl`'s `sheet` density. Absent when nothing is unresolved. A separate `IndexTile` card was drawn first and cost the figures their place on the first screen.
3. **במספרים:** 3 to 5 `StatTile`s, chosen by what the trip has (ADR-0239 §9: a figure counts rows marked `היינו`, an estimate reads `~`, a figure with no source is absent). Three sit in a row; four go 2×2; five go 3 + 2. A figure with unresolved rows says so on its second line (`מקומות` / `2 לא סומנו`). The seeded trip has three (`6` places, `~9,200` km flown, `+6` hours); a routed trip adds its ground distance. **At 360×640 the figures sit above the fold at a 168px cover** (the heading at 499px). 200 and 232 are the device pass's to try; 168 is the decision.
4. **הימים** as a contact sheet: two columns of day frames (`PhotoBand` at a `thumb` density, 84px), each with its weekday and date, its name (`fallbackDayTitle`) and up to four stop glyphs. A day with no photo shows its date numeral in `--memory-deep` on `--memory-tint` where the picture would be, so the frames line up. **Only days with records are shown**; the rest are one line, `ועוד 7 ימים בלי רשומות`, and the Days tab still opens every day. Each frame opens its day.
5. **ראשונים וטובים:** `ListRow`s without a manage menu. Times inside them are `--amber-deep` mono, because amber still marks a clock. A row that names a day, not a place, carries no teal pin.
6. **בפעם הבאה:** skipped rows (with `.tag-skip`) and ideas never used, as read-only `ListRow`s. "Take them to another trip" is Phase 7.

**The route strip is cities, wraps rather than truncates, and is absent on a one-city trip.** The reader's route strip was deleted from the phone for ellipsising eight stops to their initials (`SharedItinerary.tsx`), and the seeded Japan trip is Tokyo throughout. It is drawn in the mockup on the Iceland seed's places, for shape.

### §5 · The day list is a record, not a builder

On a finished trip, Plan's archive rows:

- **Soft rows lose the dashed border and the hatched badge.** Nothing moves after the trip, so the soft cue has nothing to say. A hard row still has its lock on the when line.
- **The done circle leaves the slot.** Each settled row carried the `היינו ✓` chip _and_ a 32px filled `--ok` circle with a ring. The chip is the mark and the undo, as it already is on Trip's day card (ADR-0230). The slot keeps only what is still a question (`○`) or an action (`↩` on a skipped row). This amends ADR-0044's 2026-09-15 note, which kept the circle because the slot held three states. It now holds two, and the third is the chip's. The title gains 42px at 360px (183 → 225).
- **`.tag-done` writes in `--ok-deep`** (§2).
- **A skipped row renders.** Today it never does: `PlanDay.tsx` keeps skipped rows when read-only, and `buildTimeTree` (`lib/time.ts:826`) then drops them before layout. This is a shipped defect against ADR-0044, fixed in Phase 3.

### §6 · The Index

- **No wash.** ADR-0049 §2's desaturated wash is not built.
- **The banner is Trip's past-day `.archive-banner`**, the same component at the Index: `הטיול הסתיים · לקריאה בלבד` with the archive glyph, on `--memory-tint` instead of `--paper`, and without `חזרה להיום`, since there is no today to go back to. Text on it measures 11.48 · 11.96.
- **The tiles say what was, not "not yet":** `טיסה · מלון · מסעדה`, `אין משימות פתוחות אחרי הטיול`, `לא צורפו מסמכים`, `לא נכתבו פתקים`. `עדיין` is a word for a future that will not come.

### §7 · /trips

- **The `.is-past` dimming goes.** The name reads `--ink` (15.65 · 12.39, against 5.57 · 5.65 muted). A memory is not a disabled row.
- **The flag slot takes the cover** the way a badge takes a photograph (ADR-0167 §1), at 0px of height. With no cover, the flag stays.
- **A lifetime line under the `הסתיים` heading:** trips, days away, countries (`destinationCountryCode`), counted over finished trips only.
- **The anniversary card** (ADR-0239 §8, in-app half): above everything on the day, a `PhotoBand` with `לפני שנה בדיוק · <a place marked היינו>` on the scrim, and the trip's name and dates under it. Its small line is `--memory-deep`, not amber: an anniversary is not a deadline. No place marked `היינו` means no card.

## Build phases

Each is its own PR, in the epic's numbering. Every PR ends green on `pnpm typecheck`, `pnpm test`, `pnpm build` and `pnpm format`, with a look at 360px in both themes on a finished trip (seed, then pin `waypoint:dev-now` past the end).

| Phase         | What                                                                                                                                                                                           | Needs          | Epic phase |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ---------- |
| **3.1**       | Tokens (§2) in `tokens.css`, both theme blocks; `design-language.md` marked built. No pixel changes.                                                                                           | nothing        | 3          |
| **3.2**       | The chrome (§3): `data-phase` on `.app`, the header and `DayStrip`; the band, the six accents, the tab bar, the un-dimmed strip; the anchor's words (`lib/time.ts` age ladder + `i18n/he.ts`). | 3.1, 0.1       | 3          |
| **3.3**       | The day list as a record (§5), including the `buildTimeTree` skipped-row fix with a regression test.                                                                                           | 3.1            | 3          |
| **3.4**       | The Index (§6): the banner and the tile copy.                                                                                                                                                  | 3.1            | 3          |
| **3.5**       | /trips (§7): no dimming; the cover in the flag slot once Phase 2 supplies the cover choice (ships without it until then).                                                                      | 3.1 (cover: 2) | 3          |
| **4.1–4.5**   | The memory Home (§4), in the epic's order: the cover card with the stragglers footer and "by the numbers", the contact sheet, firsts and bests, the stragglers sheet, next time.               | 3.1, 2         | 4          |
| **6B.1–6B.2** | The lifetime line and the anniversary card (§7).                                                                                                                                               | 3.1, 2         | 6B         |

3.2 to 3.5 can run in parallel once 3.1 lands. `e2e` measures what the mockup measured (the contrast pairs in §2, the figures above the fold at 360 in §4), so the next drift arrives as a number.

## Consequences

- Root `CLAUDE.md` rule 4, ADR-0028 and `design-language.md` carry the fourth hue from today. Nothing uses it until 3.1.
- The device pass owns two feel numbers: the cover's height (168 decided; 200 and 232 drawn) and whether rose reads as rose on real glass in dark. ADR-0125 is the precedent for a palette that measured fine and read as one hue on a device.
- `.new-event-btn` in the cover's footer inherits the 26px height ADR-0219 already records as a standing debt against the 44px floor, and the `○` settle slot is 32px. Neither is new; both are the device pass's.
- **Not decided here:** the map journey, replay, the coming-home beat, the trip book, the group-chat card and the anniversary push copy (Phase 1B).

## Alternatives considered

- **Moss.** Quiet and "pressed leaf", but 14.6 ΔE00 from `--ok`. A green-tinted chrome muddies the one colour the record depends on.
- **Sepia.** The obvious "old photograph". It sits on amber's angle (13.3 in dark) and between amber and `--miss`. Inside it a clock time reads as one more brown.
- **Cyan-blue ("cyanotype").** Rejected before drawing: 11 ΔE00 from `--me` and 9 from the trip band.
- **A paper-grain texture as the third channel.** One more layer whose only meaning is "old".
- **A smaller done circle instead of removing it.** Still two marks for one fact.
- **The /trips past card as a wide cover above its row.** 96px on every finished trip turns a navigation list into a gallery. The wide cover is kept for the anniversary, once a year.
- **Showing every day in the contact sheet.** On the seed that is seven empty frames out of ten, which is noise. The Days tab already opens every day.

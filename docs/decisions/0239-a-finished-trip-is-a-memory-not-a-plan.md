# 0239 — A finished trip is a memory, not a plan

**Status:** Accepted 2026-09-25, on the owner's answers to the investigation's six questions. **Nothing built.** The build is an epic: [`planning/2026-09-25-a-finished-trip-is-a-memory-build-plan.md`](../planning/2026-09-25-a-finished-trip-is-a-memory-build-plan.md). The investigation and spec it answers: [`planning/2026-09-25-what-a-finished-trip-is-for.md`](../planning/2026-09-25-what-a-finished-trip-is-for.md).
**Date:** 2026-09-25

**Amends** [0040](0040-trip-mode-access-window-and-past-trip-archive.md) (its _Deferred_ retrospective becomes this, and "reuse the past-day visual for the whole finished trip" gives way to a palette of its own) · [0049](0049-index-tab-mode-and-lifecycle.md) §2 (the archive state it decided is built here, notes included; its wash gives way to the same palette) · [0190](0190-a-readiness-check-is-a-task-row-and-the-checks-sit-inside-the-urgency-ladder.md) (§3: what a task is after the trip) · [0198](0198-we-notify-what-you-can-still-miss.md) (§3 and §8: two exceptions to "a past trip sends nothing").
**Applies unchanged** [0044](0044-settling-a-finished-trip.md) (settling stays editable, and it is the only write), [0045](0045-trip-home-real-data-only.md) (real data only, which §9 sharpens for a record), [0236](0236-the-trip-is-live-while-its-last-commitment-is.md) (when the trip ends).

## Context

The finished trip was specified as a calm archive in ADR-0040 and never given a posture of its own. The investigation found what that costs: the Plan-mode phase is derived once in `ModeProvider` and read only by the mode toggle, so every other surface still behaves as if the trip were live or being planned. Days and the Map open on the last day. The Map sorts newest-first and offers to navigate. The header marks empty days as gaps to fill. The Index hides every booking behind `הצג מהעבר` and lists pre-trip tasks as overdue. The share sheet mints an invite the join route then refuses. The Home is three tiles and a button, and its tiles read `0`.

The owner's ask was for the opposite: a page people go back to, to see and to remember.

## Decision

### §1 · The trip knows it ended, once

**One phase, read everywhere.** `useMode().phase` is the derivation, and every surface that behaves differently after the trip reads it, never a `tripPhase(...)` call of its own. The one exception is `defaultDay` in `TripProvider`, which sits above `ModeProvider` and derives the phase from the same `tripToday` it already reads. "Finished" means `phase === 'past'`, which ADR-0236 already moves to the end of the trip's last running commitment.

### §2 · Where a finished trip opens

**Days opens on the first day, and the Map on all days, in order** (owner: yes). `defaultDay` is `trip.startDate` after the trip. The Map's scope starts at `כל הימים`, and its list is one chronological block, day 1 first. The live list's two blocks ("coming up", then "behind you, newest first") put a finished trip in reverse.

### §3 · The live trip's help withdraws; the work that outlives the trip does not

Withdrawn on a finished trip: the location offer, `קרוב עכשיו`, the locate control and `ניווט`; the day strip's empty-day gap marker and the header's `יום N/M` progress readout; the readiness checks; the `--miss` red on a task that fell due before the trip ended.

**A task due after the trip is still a task** (owner: yes). It stays open, keeps its urgency, and **keeps notifying.** ADR-0198's third notifiable class is a deadline someone owes, and a VAT refund or an insurance claim is owed after the flight home. "A past trip sends nothing" therefore becomes "a past trip sends nothing but the task deadlines that fall after it, and §8".

### §4 · Frozen means frozen, and settling is the only write

**No add affordance anywhere on a finished trip**, notes included (owner: no to post-trip notes). This is ADR-0049 §2 as decided, now built. Settling (`היינו` / `דילגנו` / restore) is the one sanctioned write, as ADR-0044 decided.

### §5 · After the trip, a share is for reading

The share sheet opens on `רק לצפייה`. The join branch says the trip has ended rather than offering a link, and so does trip settings' invite section. **The server refuses to mint an invite for an ended trip**, answering with the `INVITE_EXPIRED` the join route already uses, so the two halves cannot disagree again.

### §6 · The archive has a palette of its own

**Owner: "a whole new color palette for past trips."** A finished trip does not wear Plan's violet. Root rule 4 gives violet to plan mode alone, and nothing is being planned. It does not wear ADR-0043's desaturated past-day wash either: a wash says "less", and this is the page people come back to.

The values are the design phase's, drawn in `mockups/past-trip-v1.html`, and they arrive with their own ADR amending ADR-0028, `design-language.md` and root `CLAUDE.md` rule 4. This ADR fixes only the constraints:

- Both themes, contrast floors met.
- A hue that collides with none of amber, teal or violet.
- The semantic hues keep their meanings inside it: `--ok` for a settled record, teal for a place, amber for a clock.

### §7 · The trip ends with a beat

**Coming home** (owner: yes). The first open after the trip ends plays a short tap-through of the trip's figures, then settles into the memory Home. It never plays again on that device for that trip, remembered per trip the way ADR-0221's first morning is. Under reduced motion it is skipped, not shortened.

### §8 · A year later, the trip comes back, once, by name

On the anniversary of the trip's first day, `/trips` shows it as its cover with `לפני שנה בדיוק · <a place we went>`. **It is also one push.** This is a deliberate exception to ADR-0198, which notifies only what you can still miss, and it is fenced accordingly:

- **One send per trip per year**, deduplicated by the `NotificationSend` ledger with the anniversary year in the fire key.
- **Only when there is something true to say.** The push names a place the record marked `היינו`. With nothing settled there is no send, and never a generic "remember your trip?".
- **Not time-critical.** It honours quiet hours and waits for a morning hour like every other non-critical kind.
- **Its own preference, `notifyMemories`, on by default.** Turning off tasks never silences it, and turning it off never silences a task.
- **Members at send time** (ADR-0197 §2.4). It opens the finished trip's Home through `?trip=`.

The owner asked for an opinion here, not a ruling. The opinion is yes, because once a year per trip is the smallest spend of attention the catalogue could make, and it is the only send that brings someone back to the app for joy rather than duty. Retracting it means deleting this section; nothing else in this ADR leans on it.

### §9 · A figure counts what happened

Every retrospective number follows three rules:

- **A figure counts rows marked `היינו`.** It says so when rows are still unresolved (`12 מקומות · 2 לא סומנו`). Counting the plan would report a trip that did not happen.
- **An estimate reads as one** (`~`). Distances come from the leg cache and great-circle arcs, never from a track (ADR-0006).
- **A figure with no source is absent, not zero** (ADR-0045).

The derivation is one pure function in `packages/shared`, so the app, the past-tense narrative, the trip book and the group-chat card cannot print different numbers for the same trip.

## Consequences

- **The build is an epic of eight phases, 0 to 7** (the plan note): bug fixes, design, the recap derivation, the archive posture, the memory Home, motion and the map, share and resurface, then new data behind their own ADRs.
- **One decision is owed before a cover photograph ships:** enrichment images carry a 180-day TTL, and a finished trip is reopened a year later. The recap phase decides what a memory shows when its picture has lapsed.
- **`product/modes.md`'s past-trip section is rewritten as each phase ships**, not before: it describes the current state.
- **Not decided here:** anything needing new stored data, such as favourites, our own photos, the weather we had, who did what, the cross-trip "next time" copy, or "go again". Each gets its own ADR when its phase starts.

## Alternatives considered

- **Fix the ten bugs and stop.** Rejected: the owner's ask was for a page worth returning to, and the bugs are only the floor.
- **Keep Plan's violet and restyle within it.** Rejected by the owner (§6).
- **Notes stay writable after the trip, as settling does.** Offered in the investigation and declined by the owner. The record is closed except for what happened.
- **The anniversary in-app only.** A defensible reading of ADR-0198, and the fallback if §8 is retracted. It was not chosen because an in-app card is only seen by someone already opening the app, which is exactly who does not need reminding.

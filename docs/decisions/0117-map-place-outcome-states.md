# 0117 — The Map says what happened at a place: היינו / דילגנו / passed-but-unsettled

**Status:** Accepted (design + build)
**Date:** 2026-07-25
**Refines:** [0109](0109-map-tab-design.md) (the row anatomy of §1 and the session-107/110 ahead-vs-behind partition: the block's copy and the row's tags), [0027](0027-soft-item-lifecycle-shelf-slip.md) (status is only ever written by a human tap; the clock only ever _derives_ — this ADR keeps both halves and stops conflating them), [0110](0110-maps-and-places-frontend-architecture.md) §2 (the place-usage derivation gains one fact), [0011](0011-hard-soft-event-model.md)/[0028](0028-plan-violet-color-budget-dark-ready.md) (an outcome is grammar + a status hue, not a new accent)

Mockup: [`mockups/shelf-day-aware-v1.html`](../../mockups/shelf-day-aware-v1.html) (second frame — the Map list's outcome states)

> **The deferred outcome filter is a Phase-6 ride-along candidate** (flagged by [ADR-0121](0121-embedded-map-phase-6-design.md)'s review pass): it is a chip over data this ADR already derives, and it is worth more on a rendered map than on a list — seeing the _remaining_ cluster is the point, where a list can only tell you a count. Not yet decided; see ADR-0121's open forks.

## Context

The Map's list already partitions into **ahead of you** and **behind you**, under a `כבר היינו` header (ADR-0109 session-107/110). That partition is computed **entirely from the clock** — `isDayUsagePast` compares `now` against a day's latest referencing instant, or the calendar date against today. Verified this session: neither `lib/place-usage.ts` nor `screens/Map.tsx` reads `event.status` at all; the string `EVENT_STATUS` does not appear in either file.

So the tab currently makes two false claims:

1. **A place you deliberately skipped reads as a place you visited.** Skip the 14:00 stop, and once 14:00 passes the row sinks under `כבר היינו` — "we were already here" — which is exactly what did not happen.
2. **A place you marked `היינו` early is still "ahead of you."** `DONE` is the strongest possible statement that something is handled, and the list ignores it until the clock agrees.

There is also no third state named anywhere, though it is the most common one: a day passed and nobody ever settled it (ADR-0027's "Unresolved (past day)" phase). Today all three look identical on the Map.

`EVENT_STATUS` is `planned | done | skipped` (ADR-0018) and is only ever written by a human tap (ADR-0027 §1). That is exactly the vocabulary the Map is missing — nothing new needs to be stored.

## Decision

### 1. Three states, derived from stored status plus the clock

| State                  | Derived from                                             | On the row                                     |
| ---------------------- | -------------------------------------------------------- | ---------------------------------------------- |
| **היינו** (been there) | any referencing event on that day is `done`              | an `ok`-toned tag                              |
| **דילגנו** (skipped)   | references are settled and **none** is `done`            | a `miss`-toned tag                             |
| **passed, unsettled**  | the clock has passed it, every reference still `planned` | no tag — the position in the list is the claim |

`done` beats `skipped` when a place carries both on the same day: you were there.

**Why this is still ADR-0027-compliant:** status remains human-written only, and nothing auto-settles. This reads a stored fact that a human already asserted — the opposite of the auto-write ADR-0018/0027 rejected. The clock keeps deriving _position_; status now supplies _outcome_. Two questions, two sources, no conflation.

### 2. A settled place is behind you, whatever the clock says

`isDayUsagePast` gains one clause: a day whose references are **all settled** (`done` or `skipped`) is behind you even if its instant hasn't arrived. A human marking something handled outranks the clock — and it fixes the "marked done at 11:00 for a 20:00 dinner, still listed as ahead" case.

The converse is unchanged: a passed-but-unsettled day is still behind you on the clock alone, because it is genuinely behind you — it is just unsettled about what happened.

### 3. The block header stops claiming a visit

`כבר היינו` becomes **`מה שמאחורינו`**. The block holds three different outcomes (§1) and only one of them is a visit, so the old copy was making a per-block claim the rows contradict — the same class of error the session-106 amendment fixed when the shipped denied-banner copy promised an itinerary sort the list didn't honour. The per-row tags now carry the specific claim; the header only says where the boundary is.

The ahead block gains a header too (**`מה שלפנינו`**), but **only when a behind block exists** — on an all-ahead list, which is most of a trip, it would be a row of chrome labelling the only thing on screen. Naming one side of a visible split and not the other is what made the old header carry more meaning than it had.

### 4. A skipped-only place reads as quiet, not as a live commitment

A place whose references on the shown day are **all skipped** renders in the desaturated treatment the ambient row already uses. It is still listed (you might restore it, and it may hold a booking), but it stops competing visually with places that are actually happening.

**Deliberately unchanged:** the `pin.commitment` weights and the category-colour tiebreak (ADR-0109 §4). A skipped event still contributes its category to the union and still counts toward `isScheduled`. Re-weighting the pin by outcome would change which hue a multi-category place shows — a colour rule, decided in ADR-0109 §3/§4, and not something this ADR should quietly rewrite.

### 5. Where the derivation lives

`DayUsage` gains `outcome?: 'done' | 'skipped'` and `settled?: boolean`, computed in `lib/place-usage.ts` from the referencing events' `status`. This keeps the one-derivation rule of ADR-0110 §2 (the filter chips, the pin, the order and now the outcome all read the same index) and it keeps the derivation **clock-free** — `outcome` is a stored fact, not a time comparison; the clock stays in `isDayUsagePast`, where it already was, with `settled` passed in as evidence.

The screen does not resolve status per row from `eventById`: it already receives the pointer (`eventId`, session 108) for _wording_, but an outcome is a property of **all** of a day's references, not of the one that happened to win `at` — resolving it at the call site would be right by accident on single-reference places and wrong on the rest.

## Consequences

- **The tab stops lying about two things** — a skipped place no longer claims a visit, and a place marked done is ordered as handled.
- **A third state gets a name.** "Passed and nobody said what happened" is now visibly distinct from both, which quietly advertises the settle strip (ADR-0043) that resolves it.
- **No schema change, no new stored state** — three states out of two existing fields (`EVENT_STATUS`, the clock) and one new derived field on an existing index.
- **`--ok` / `--miss` do the work**, which is exactly what ADR-0028 reserves them for (statuses), so amber stays on time and teal on location; the Map's colour budget is untouched.
- **Phase 6 inherits it**: the same outcome drives the rendered pin's treatment when the map lands, with no second derivation.
- **Deferred:** an outcome **filter** facet ("what's left to do", "where we've been"). The chips are `type · maybes` today and a third facet is a real design question about a crowded row — the outcome is on every row now, which is the cheaper half.

## Alternatives considered

- **A stored `visited` flag on `Place`, toggled from the Map row.** Rejected: a second source of truth beside `EVENT_STATUS.DONE` (which the day view, the settle strip, the glance and the board all already read), needing a schema change, a sync path, and a rule for what happens when the two disagree. The information already exists; the Map just wasn't reading it.
- **Two states only (visited / not).** Rejected: it fixes the skipped-reads-as-visited bug but flattens "we skipped it" into "nothing recorded", losing the distinction that tells you whether a place is still worth restoring.
- **Leave the clock in charge and just rename the block.** Rejected: renaming alone would keep ordering a place marked done as ahead of you, and would keep the tab silent about outcomes it already knows.
- **Auto-settle passed events** (write `done` when their time elapses) so the Map has an outcome for everything. Rejected — this is precisely the auto-write ADR-0027 §1 and ADR-0018 refused: false records, `Change` traffic per event, stale on an offline phone.
- **Re-weight the pin so a skipped place drops to `idea`.** Rejected (§4): it would change the category-colour tiebreak ADR-0109 §4 settled, for a signal the row now states in words.

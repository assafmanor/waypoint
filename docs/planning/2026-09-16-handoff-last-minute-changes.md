# 2026-09-16 — Handoff: last-minute schedule changes, on the ground

**Outcome (2026-09-16, the same day):** [ADR-0231](../decisions/0231-the-day-is-changed-where-you-stand.md) (Proposed) · [`mockups/the-day-is-changed-where-you-stand-v1.html`](../../mockups/the-day-is-changed-where-you-stand-v1.html) · [session note](2026-09-16-last-minute-changes-on-the-ground.md). Hypotheses 1–4 and 7 below are answered there; 5 and 6 are out of scope by decision.

**For:** the next session, which the owner framed as a **product → design → build** pass. **From:** the session that shipped [ADR-0228 §6](../decisions/0228-the-quick-actions-are-one-list-and-a-commitment-can-be-settled.md) (a cancelled booking leaves the day and keeps its code). This file is orientation, not a decision — nothing in it is authoritative until it lands in an ADR (root `CLAUDE.md`, "Durable vs. scratch").

## The brief, in the owner's words

> I want to do a product, design, then building session on handling last minute schedule changes — how we make this as easy as possible for users to do these kinds of things, thinking what's inconvenient and is holding people back, what's taking too many steps etc. The journey should be as easy as possible, and adding things, canceling, moving things around etc. should be seamless.

The report that prompted it: a ⁦15:00⁩ boat tour cancelled by the operator at ⁦13:51⁩, and the `⋯` sheet on it offering only `עריכה` · `מחיקה`. The state (`skipped`) existed and served hard events; the verb had been decided (ADR-0228 §5c) and never built; and the parking lot that should have held the card refused a commitment. Three small gaps, one lived experience: _"the app doesn't have a way to say that."_ Treat that as the shape to look for — not missing mechanisms, but decided things that never met on one surface.

## What exists today (verified this session, 2026-09-16)

The on-the-ground verbs on a Trip-mode day row, by phase (`ui/domain/event-actions.ts` is the one ordered spec; `EventCard.tsx`'s `menuActions` is the `⋯` sheet):

| the row is…           | quick-action band (today only)            | `⋯` sheet                                                                           | elsewhere on the card                               |
| --------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------- |
| upcoming, today       | `− 30 דק׳ +` · `בדרך` · `ניווט`           | `סיימנו` · `דילוג` (§6, new) · `החלף` · `העבר למדף` (soft only) · `עריכה` · `מחיקה` | badge → `מפה`                                       |
| upcoming, another day | _(no band)_                               | same as above                                                                       | —                                                   |
| now                   | `סיימנו` · `דילוג` · `+ 30 דק׳` · `ניווט` | `החלף` · `העבר למדף` (soft) · `עריכה` · `מחיקה`                                     | —                                                   |
| passed, unmarked      | _(no band)_                               | `עריכה` · `מחיקה`                                                                   | the settle strip asks in words (`היינו` / `דילגנו`) |
| done / skipped        | _(no band)_                               | `עריכה` · `מחיקה`                                                                   | the `היינו ✓` chip is the undo (ADR-0230)           |

Adding, today: the `+` on a free-time gap (`GapStrip` → `gapTarget` → the slot-fill sheet, ranked ideas from the shelf), the shelf at the foot of the day (tap an idea → its sheet → `שיבוץ ליום`), Plan mode's builder for anything with a time you want to name. Moving: the ±30 stepper (hard rows pass the confirm gate, ADR-0011 / ADR-0228 §4); Plan mode's drag (ADR-0161 — a move names a position, an event owns its length; ADR-0199 — a hard row's press-and-hold). Skipped events park on the shelf as a `דילגתם` card; a tap restores in place, and in Plan mode a drag into a gap restores **and** moves in one patch.

## Where the friction probably is (hypotheses to test, not findings)

Each of these is a guess from reading the code and the last month of ADRs. The session should **count the steps on the running app** (DEV_AUTH recipe in `docs/engineering/prerequisites-checklist.md`) before believing any of them.

1. **The `⋯` sheet is a list of verbs, not a place to think.** It is `RowManageSheet`, six items on a soft upcoming row now. ADR-0138 §3 gave it a subject line; it has no sense of _consequence_ (what happens to the afternoon if this goes). Cancelling the boat tour should probably show what the freed ⁦3h⁩ does to the day, not just remove the row.
2. **A cancellation and a skip are one word.** ADR-0228 §6b left `דילוג` / `דילגתם` in place and flagged the parked booking's label for the device pass. The product question underneath: when a _commitment_ is off, the user usually has a follow-up (refund, rebook, tell the group). Is that a task? A note? Nothing?
3. **"Move it to later today" is two systems.** ±30 is the only in-place move in Trip mode; anything larger is `עריכה` → the full `EventForm`, or a mode switch to Plan and a drag. ADR-0161's slot model and ADR-0116's day-aware shelf might already give a "move to the next free slot" verb for nearly free — check `nextSlot` / `freeWholeDay` in `lib/gaps.ts` and the slot-fill sheet before designing anything new.
4. **Adding on the ground is gap-first.** The `+` lives on a gap, so it is invisible when the day is dense (no gap wide enough — `FREE_TIME_MIN_MINUTES`), which is exactly when a plan changes. ADR-0043 §2 already argued for a quick-add scoped to "soft, today, next open slot" — check what shipped of it.
5. **The hero / board is where you are when the change hits, and it has no verbs for this.** `HeroLift` (ADR-0160) settles a transition and shows the horizon; it does not add, move or cancel. Whether it should is a product call, but the first place a "the tour's off" message reaches you is not the day list.
6. **A change made by one member reaches the others as a feed row nobody sees.** The change feed is unmounted from Home pending its own spec (backlog, owner 2026-09-10). Last-minute changes are the case where the group most needs to know. Out of scope unless the owner pulls it in — but say so explicitly.
7. **Ripple is the mechanism this whole topic leans on**, and it has no ADR of its own — ADR-0011 names it (soft events included, hard excluded) and `DayView.tsx`'s header names "the ripple bar"; `grep -rn ripple frontend/src` before designing: what moves when a soft event stretches, what a hard anchor pins, what "the afternoon is free now" recomputes. Concurrent edits by two members are [ADR-0012](../decisions/0012-conflict-lww-undo.md) (last-write-wins + undo).

## Ready-made things to reuse (rule 8)

- `verbs.*` in `state/verbs.ts` is the write vocabulary (optimistic + outbox + undo toast). A new gesture should end in an existing verb or a one-line addition beside it, not a new REST path.
- `resolveShelfDrop` (`lib/shelf-drop.ts`) is a unit-tested **decision table** for "what does a release mean"; the same shape would suit a "what does this change do to the day" table.
- `SettleControl` (words/marks/hues of the pair), `EventActions` (the ordered band), `RowManageSheet`/`ListRow` (the `⋯`), `ConfirmDialog` tone `hard` (the commitment gate), `FormSteps` (any chooser with more than one step), `ValueToken` (a time that opens a picker in a sentence).
- The mockup discipline: `.claude/skills/design-mockups/SKILL.md` and `docs/design/mockups.md`. Anything drawn is a `mockups/*.html` that renders the real CSS at 360/430, both themes, RTL, with measurements. Rule 9: vendored skills do not outrank the design language.

## ADRs to read first (only these — progressive disclosure)

[0011](../decisions/0011-hard-soft-event-model.md) hard/soft · [0012](../decisions/0012-conflict-lww-undo.md) conflicts, LWW, undo · [0027](../decisions/0027-soft-item-lifecycle-shelf-slip.md) lifecycle + parking lot · [0043](../decisions/0043-day-view-now-line-phases-and-archive-chrome.md) phases and the settle strip · [0116](../decisions/0116-day-aware-shelf-and-idea-target-day.md) day-aware shelf · [0161](../decisions/0161-a-move-names-a-position-and-an-event-owns-its-length.md) moves · [0199](../decisions/0199-a-hard-event-answers-the-hold.md) hard row gesture · [0228](../decisions/0228-the-quick-actions-are-one-list-and-a-commitment-can-be-settled.md) quick actions, incl. §6 · [0229](../decisions/0229-the-row-opens-what-you-do-and-the-read-is-one-tap-further.md) the row opens what you do · [0230](../decisions/0230-one-done-mark-and-it-is-the-undo.md) the undo. Then `docs/backlog.md`'s ADR-0228 section (four open lines, one of them — _"`skipped` still reads as `upcoming` on the day card"_ — is adjacent to this work).

## How the owner likes this run

Three phases, in order, each closing before the next opens: **product** (name the journeys, count today's steps, decide what "seamless" means per journey — write it as an ADR in `Proposed`), **design** (mockups, measured, both themes; the ADR gains its forks and the owner picks), **build** (the ADR flips to Accepted and built; tests pin the rules; a dated session note; a PR). A correction is not a fork — when the owner says something is wrong, change the default. Count call sites before claiming what a change does not affect.

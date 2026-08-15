# Tasks (משימות) — design brief: what is settled, what the design session owes

**Date:** 2026-08-15
**Status:** PM session complete; **design session complete for §A, §B and §D** (2026-08-15, session 271 — [ADR-0188](../decisions/0188-a-tasks-tick-is-a-sibling-and-the-leading-element-says-who-owns-the-outcome.md), [`mockups/tasks-row-and-refusals-v1.html`](../../mockups/tasks-row-and-refusals-v1.html)). §1–§14 are settled with owner sign-off in-session, **with one amendment to §2** recorded in place below. **§C, §E and §F remain open** and are a stated hand-off rather than an unscheduled question.
**Precedent this brief mirrors:** [`2026-08-01-notes-design-brief.md`](2026-08-01-notes-design-brief.md), which fed [ADR-0152](../decisions/0152-a-note-is-one-entity-with-an-optional-host.md) / [ADR-0153](../decisions/0153-the-notes-surface-the-mark-and-no-mode-gate.md).

## Why this brief exists

The owner asked for a full specification of a tasks feature: general tasks, tasks attached to other entities, due dates and times, optional assignment to people, done/dismissed, priorities. The structural half turned out to be largely pre-decided — **Notes is a shipped sibling of this feature** and ADR-0152/0153 already litigated the entity shape, the host model, the Index tile, the mark on a host row, the inline composer and the mode question. What is genuinely new is that **a task is time-bearing and a note is not**, which is precisely why ADR-0153 §10 could defer Home and the Hero and this cannot.

This brief records what was settled in the PM session so the design session starts from decisions rather than re-deriving them.

---

# Part 1 — Settled

## 1. The boundary, in one sentence

**A task is an obligation with a deadline and optionally a doer. An event is a slot the group occupies.**

"Dinner 19:00" is an event. "Book the dinner by Thursday" is a task. An event answers _where will we be_; a task answers _what has to be true by when_. Every decision below falls out of this line — it is why a task takes no hard/soft axis, draws nothing on the day rail, and never enters the ripple.

Three existing things overlap with "a task" and the line against each is stated so it is not re-argued:

| existing                             | overlap                                   | the line                                                          |
| ------------------------------------ | ----------------------------------------- | ----------------------------------------------------------------- |
| **soft event** (ADR-0027, Done/Skip) | both are "a thing to do"                  | an event occupies a slot; a task has a deadline                   |
| **readiness check** (ADR-0061)       | a literal "what's missing" list with CTAs | provenance only — see §3; they converge on one surface            |
| **note** (ADR-0152)                  | authored, hosted, group memory            | a note is a fact; a task is an obligation with a doer and a clock |

## 2. One noun: משימה. Manual and automatic tasks are the same word

An earlier draft of this session proposed two nouns — משימה for an authored row, בדיקה for a derived check — borrowing ADR-0152 §3's rule that _"a card is not a פתק"_.

**That borrow was withdrawn, and the reason it does not transfer is worth recording.** ADR-0152 split the vocabulary because of **volume**: Wikipedia and an LLM write endlessly and would drown the group's own notes at machine volume, so the boundary had to be legible in the noun. Readiness checks are **five, closed and finite**. There is no firehose, so there is no crowding, so nothing justifies a second noun.

To the user, both kinds are tasks. Provenance is a quiet mark on the row, never a different word and never a separate section.

**Amended 2026-08-15 (session 271, [ADR-0188](../decisions/0188-a-tasks-tick-is-a-sibling-and-the-leading-element-says-who-owns-the-outcome.md) §4) — "look the same" holds everywhere EXCEPT the one element that is a verb, and the collision is with this brief's own §4.** §A puts a **button** at the row's leading edge; §4 gives an automatic task's done-ness to the derivation. Both cannot be true at once: identical rows means a control that cannot be pressed sitting in the most prominent position on the row, which is not a behaviour but the definition of reading as a bug — and rendered side by side it is three inert circles out of five. So a manual task leads with the tick and an automatic one leads with **the derivation's own badge** (PlanHome's existing `CHECK_ICON`), with done-ness trailing as the `.chk-ok` that screen already renders. Everything else this section says survives: one noun, one list, one sort, one row shape, no separate section, no second word — and the two kinds measure 7px apart in title column and 215-vs-195px in title width, i.e. the same noun at the same scale. The provenance "mark" is therefore the leading element itself rather than an extra glyph beside the words.

## 3. An automatic task is DERIVED, never stored

The owner's requirement is that automatic tasks _"update automatically when making progress"_. Only one implementation makes that sentence true by construction:

- **Materialized as rows at trip creation** — something must then go update them, they go stale offline, they emit sync traffic, and a booked hotel leaves a "book a hotel" row sitting there until a trigger fires. This is the alternative [ADR-0061](../decisions/0061-plan-home-readiness-rework.md) already rejected ("a computed state auto-written needs a trigger, emits sync traffic, and goes stale offline").
- **Derived at read time** — nothing to update, nothing to go stale. `computeReadiness` (`lib/readiness.ts`) already works exactly this way.

**So `computeReadiness` is untouched.** Its five checks (lodging night-coverage, itinerary empty-days, flights round-trip, group, passports) keep returning derived results; what changes is that they render in the task row's shape on the tasks surface, and Plan Home's "what's missing" becomes one list.

## 4. `derivedKey` — one nullable column carries the human overlay, and there is no second table

A **dismissal is a human decision** and cannot be derived: it must survive a reload and reach the other four people. So:

```
Task { ..., derivedKey? }     // 'lodging' | 'flights' | 'itinerary' | 'group' | 'documents'
```

- A check nobody has touched has **no row at all** and renders as a pure derivation.
- The moment someone **dismisses, assigns or flags** it, a `Task` row is written carrying `derivedKey`. Same entity, same sync channel, same appliers, same offline story — nothing net-new.
- **`status` is the derivation's answer, unless the row says `dismissed`.** Human dismissal wins; done-ness stays derived and therefore cannot go stale. One predicate, one test.

The bonus this buys, and it is the point rather than a side effect: **automatic tasks become assignable.** _"Someone has to book the hotel — Dana, that's you"_ is delegation rather than a nag, and it is the same column that gives dismissal.

## 5. The entity

```
Task {
  id, tripId,
  title,                           // required — a task with no title is nothing
  body?,
  dueAt?, dueHasTime,              // null = no deadline; an undated task is legitimate
  assigneeUserId?,                 // null = the group's
  assignedToAll,                   // §6
  completedBy: String[],           // §6 — only meaningful when assignedToAll
  important,                       // §7
  status,                          // open | done | dismissed
  settledAt?, settledBy?,
  derivedKey?,                     // §4
  eventId? bookingId? placeId? maybeItemId? documentId?,   // at most one, onDelete: Cascade
  createdBy, createdAt, updatedAt, updatedBy
}
```

Deliberate absences, each with its reason:

- **No `category`.** Notes needed one for its chip filter. A task's real facets are assignee, due-ness, important and status. The row's leading element is its **completion control**, not a category glyph, so there is no icon slot to fill and no `EventCategory` chain to inherit.
- **No hard/soft.** ADR-0011's axis answers whether a commitment can be moved or skipped. A task is neither — it is already the flexible thing.
- **No priority enum.** See §7.

**One thing deliberately unverified rather than asserted:** whether [ADR-0083](../decisions/0083-whenfield-datetime-standard.md)'s `WhenField` standard can represent a date-only value, which `dueAt`/`dueHasTime` needs. Checked at plan time, not guessed at here.

## 6. Assignment is THREE states, and arbitrary multi-select is refused

The owner raised two multi-assignee cases and correctly identified that they have different semantics:

1. _"pack your luggage"_ assigned to everyone — each person completes it **for themselves**.
2. _"book that restaurant"_ assigned to two so that **either** does it, and one completion closes it for both.

**Case 2 is already modelled and needs nothing.** It is an **unassigned** task: "one of us will sort it out" is exactly what a group task means, and it already behaves as described — anyone can do it, whoever does ticks it, it is done for everyone. Naming two candidates adds no capability; it narrows who feels responsible, which at five people a sentence in the title does better than a data model. Whoever picks it up assigns it to themselves and it becomes delegated.

So the unanswerable question — _does one completion close it for all?_ — is created entirely by **arbitrary** multi-select, not by multiple assignees as such. Remove arbitrary multi-select and it cannot arise:

| assignee       | means                    | completion                            |
| -------------- | ------------------------ | ------------------------------------- |
| **nobody**     | the group's — one of us  | one tick, closes it                   |
| **one person** | delegated                | one tick, closes it                   |
| **everyone**   | each of us, individually | **per-person** — each ticks their own |

There is no way to express "either of these two specific people", and that is the decision rather than a gap.

**Cost of the `everyone` case: one scalar array, no join table** — `completedBy: String[]` on `Task`. No new entity, no new sync channel, no new applier. **The ceiling, named rather than discovered:** `completedBy` is LWW like everything else (ADR-0012), so two people ticking in the same second can lose one tick. The failure mode is "tick it again", it is visible, and at this group size it is rare. It gets a `ponytail:` comment, not a design.

**Deferred and named so it cannot arrive quietly: a `claim` verb** — an unassigned task someone taps to take. That is the honest upgrade if "who is actually doing this" turns out to matter, and it is a better feature than a second assignment mode because it captures the decision at the moment it is made.

## 7. Priority is one flag, and the reason is the colour budget

**`important: boolean`.** Not a three-tier enum.

The constraint is real and not a taste: the palette has nothing left to spend. Amber is time and commitment, teal is location, plan violet is plan mode, `--miss`/`--ok` are status (rule 4, ADR-0028). A three-tier scale would have to be carried by shape and weight alone, and it would permanently owe an answer to "does priority or the due date sort first".

A flag is what actually drives the prominence rule the owner asked for ("at least prioritized ones"), needs no colour, and upgrades to a scale later as a column rather than a redesign.

**What legitimately does take colour:** `--miss` for **overdue**, because that is a status and not a priority, and amber for the due time itself, because that is time and commitment. Rule 4 holds without an exception.

## 8. A task never draws on the day timeline or the glance rail

Owner's call, and it preserves §1's line where it matters most: the rail is where the group physically **is**. A due task surfaces on Home and on its host's row instead.

This also leaves ADR-0077's amber anchor budget untouched. (The rejected alternative was cheap — ADR-0077's neutral "structure" band below the rail already has a stem for a single instant, so it would have cost no new vocabulary. It was refused on meaning, not on cost.)

## 9. Mode does not gate anything. It changes emphasis only

Applying [ADR-0025](../decisions/0025-trip-mode-edit-capability-tiers.md)'s framework rather than inventing one, and following [ADR-0153](../decisions/0153-the-notes-surface-the-mark-and-no-mode-gate.md) §9 which settled the identical question for notes:

- **Reading** — ungated, every mode, offline-complete (rule 5).
- **Writing, editing, assigning, completing, dismissing — Tier 1/2, ungated.** A task is _most_ valuable on the ground: "we need to confirm the 6am pickup" gets written while standing at the desk.
- **Deleting — Tier 2, ungated**, inline confirm. It destroys a sentence, not a plan; ADR-0011's gate does not reach it.
- **Tier 3 — nothing in v1.**

**Do not re-introduce a Plan-mode gate.** It was tried once on search (ADR-0115 §6) and the owner withdrew it; ADR-0153 §9 declined to repeat it. What differs by mode is which surface leads — Plan Home is a prep dashboard, Trip Home is a departure board — and that is chrome (ADR-0049).

## 10. A due time's timezone is DERIVED, exactly like an event's

Owner's instruction, and the mechanism already exists. [ADR-0107](../decisions/0107-per-place-timezones-and-multi-zone-time.md)'s `currentZone(nowMs, crossings, primaryZone)` resolves the zone of the segment you are in, and the trip's `zoneCrossings` are derived once in `trip-state` so no surface recomputes them.

**A due instant resolves through the same function with `dueAt` in place of `now`.** Nothing new is derived, nothing is stored per task, and a deadline is automatically consistent with how the calendar day rolls for that traveller (ADR-0107 §4). This is load-bearing for §11 and not only for display: a notification is the case where getting it wrong costs the feature.

## 11. Prominence: the Index tile is not enough, and the room has to be found rather than assumed

Owner's call — an unread note costs nothing, a missed task costs the thing it was guarding. Three placements, all additive, none of them new chrome:

- **The Index landing gains a fourth tile** — ADR-0098 measured that landing at five and it currently carries three (bookings, documents, notes). No new tab (non-negotiable rule 2).
- **A band on both Homes** — Trip mode: due today and overdue. Plan mode: the converged "what's missing" list of §3.
- **The lifted hero's horizon** — a task hosted by the now/next event, alongside `איפה` / `פתק` / `הסדרה`.

**The hero placement amends ADR-0160 in place.** Its §3 admits exactly three affordances and its §13 says _"no note on the **next** event … deliberately unbuilt and named so it cannot arrive quietly"_. A fourth arriving is a decision that must be written into that ADR, not slipped past it.

**Nothing goes on the collapsed board.** A per-entity control there was built and backed out once already (ADR-0121 amendment §4), and ADR-0160 exists as the alternative it asked for.

## 12. Push notifications are their own epic, and tasks is its first consumer

Owner asked why not build one. There is no architectural objection — it is a PWA (ADR-0007) — but four costs, and the fourth is specific to this app:

1. **Backend:** a VAPID keypair through the fail-fast config (ADR-0071), a `PushSubscription` table keyed per user **per device**, and the `web-push` library.
2. **A scheduler.** A task due at 18:00 needs something awake at 18:00. That is a job queue — and the backlog already reserves one: _"Redis stays reserved for its earmarked BullMQ role until then."_ This **activates a reserved decision rather than opening a new one**, which is the cheapest kind of new infrastructure this repo can take.
3. **iOS delivers Web Push only to an INSTALLED PWA** (16.4+, added to home screen). For a travel app that is a real coverage hole and it belongs in the spec rather than in a field report.
4. **The multi-zone question is §10's.** A notification firing at 03:00 local is the single bug that gets notifications disabled permanently, and this app has travellers crossing zones mid-trip by design.

**It is not really a tasks feature.** The same pipe carries "your flight is in 2 hours" and "Dana changed tomorrow's plan", so it is costed and phased as its own epic that tasks happens to consume first. Until it exists, **a due task surfaces only when someone opens the app**, and no copy anywhere may imply otherwise.

## 13. The surfaces — what appears where, and in what order

Product decisions. **How each looks is the design session's** (§A–§F).

**The Index tile's preview line is the next thing due**, with an overdue count when there is one. Bookings previews a "next", documents its type groups, notes its newest; a task collection's one line worth a glance is what is due soonest. A raw open-count barely moves and answers nothing.

**The screen is FLAT, ordered by urgency, with no grouping.** ADR-0153 §2 settled the identical question for notes and its argument transfers whole: grouping by host rebuilds, worse, what every host row already does. Order is `overdue → due today → due later → undated`, and **`important` lifts within its band, never across it** — an important task due next week must not outrank an overdue one.

**One facet axis, because `ChoiceGrid` is single-select.** Recommended: `הכל · שלי · הושלמו` — ownership and lifecycle on one axis, with `important` carried by the sort rather than by a chip. The design session confirms or replaces it; what it may not do is make two axes, which is the constraint ADR-0153 §2 already hit.

**Completed and dismissed collapse** behind the count-in-label toggle (ADR-0061, generalized by ADR-0098). **This is deliberately the opposite of ADR-0153 §3's "no past-collapse", and the inversion is the feature's definition:** a done task _is_ finished, where a note on a past event is not.

**Trip Home gets a band, not a list** — due today and overdue only, **absent entirely when nothing is due** (ADR-0045's real-data-only rule: no empty shell).

**Plan Home gets the converged list** of §3. ADR-0061 §1's CTA-does-the-thing rule carries over unchanged for the automatic ones.

**The hero slot is a READ, not a completion.** A task joins `איפה` / `פתק` / `הסדרה` as a fourth read. Completion is deliberately kept off it: the hero is a horizon, and settling a task there competes with `הסדרה`, which already means "did this happen". (Owner was offered the tickable version and declined it.)

## 14. Phasing — prominence lands early, hosts land last

Ordered so that **phases 1–3 are a shippable product** and the expensive part is last.

| phase                    | ships                                                                                                                        | why it sits here                                                                                                                                                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1 — the spine**        | entity + sync + Index tile + screen + create/edit + due + assignee (nobody / one person) + `important` + done/dismiss/delete | A shared trip to-do list, useful standalone. **The migration includes the host FKs and `derivedKey` even though nothing reads them yet** — a nullable column is free, a second migration on a live synced entity is not.            |
| **2 — automatic tasks**  | `computeReadiness`'s five checks render as task rows; `derivedKey` wired; Plan Home converges                                | Small: the derivation and Plan Home's renderer both already exist. This is where §B's two refusals must be answered.                                                                                                                |
| **3 — Trip Home band**   | due today / overdue on the departure board                                                                                   | Prominence on the ground, and it depends on nothing but phase 1.                                                                                                                                                                    |
| **4 — hosts**            | the five FKs wired: marks on host rows, inline composers, the way-in                                                         | **The underestimated one.** The notes brief flagged "five hosts × (create, read)" as the part that would be underestimated and was right; the shape here is identical. Also where the reuse audit's applier generalization happens. |
| **5 — the hero slot**    | a hosted task in the lifted horizon + the ADR-0160 amendment                                                                 | Depends on 4 — a task reaches the hero **through** its host.                                                                                                                                                                        |
| **6 — `everyone` tasks** | `assignedToAll` + `completedBy`                                                                                              | Cheap to build; wants §C drawn first.                                                                                                                                                                                               |
| **— push**               | its own epic                                                                                                                 | Not a tasks phase. Tasks is its first consumer. See the backlog.                                                                                                                                                                    |

**Hosts sit at 4 rather than 2 deliberately.** Attaching a task to a booking is the conceptually interesting part, but most real tasks ("book the restaurant", "get cash", "pack") carry no host at all, and it is the phase with five surfaces in it.

---

# Part 2 — Open for the design session

**§A, §B and §D are CLOSED** by [ADR-0188](../decisions/0188-a-tasks-tick-is-a-sibling-and-the-leading-element-says-who-owns-the-outcome.md) and [`mockups/tasks-row-and-refusals-v1.html`](../../mockups/tasks-row-and-refusals-v1.html) (2026-08-15, session 271). They are left below as written, because the ADR answers them by number and a reader needs the question. **§C, §E and §F are still open.**

**One correction to §A's own premise, since it is quoted:** a task row is **not** "the first managed list row in the app with an interactive element that is not the `⋯`". `PlaceBadge` already is one — `ListRow` has shipped an `onShowOnMap` prop since ADR-0121 §8 — and the app solved it as a `role="button"` span **inside** the trigger (`PlaceBadge.tsx:112`), which is a third option §A does not list. The sibling conclusion survives; ADR-0160 §4's parser finding binds a real nested `<button>` only, and what actually rules out the span is ARIA plus having to swallow the row's tap on every press.

## A. The row, and the one constraint that is not negotiable

A task row's leading element is its **completion control**, which makes it the first managed list row in the app with an interactive element that is not the `⋯`.

**The hard constraint, already paid for once:** ADR-0160 §4 documented that Chrome **destroys the DOM** at a nested `<button>` — drawn once in the horizon mockup, it closed `.wp-board` at the nested button and reparented everything after it. `ListRow`'s whole tap area is a button. So the completion control **must be a sibling of the row's trigger**, exactly as the kebab already is. Which edge it sits on, and how it reads at 44px against ADR-0017's floor, is the design session's.

## B. The two refusals on an automatic task, on a row that otherwise looks ordinary

§2 says both kinds are the same noun and look the same. Four behaviours differ:

|                         | manual          | automatic                             |
| ----------------------- | --------------- | ------------------------------------- |
| edit title / due        | yes             | **no** — the derivation owns both     |
| assign · flag · dismiss | yes             | yes (via §4's `derivedKey`)           |
| how it closes           | someone says so | the data closes it                    |
| delete                  | yes             | **no** — it is derived, it comes back |

Two of those are **refusals on a row that looks like every other row**. This is the sharpest risk in the feature and the thing a mockup settles and prose cannot. It is the design session's first job.

## C. An `everyone` task, partially complete

What does "3 of 5 packed" look like on a row, in a list, and to the person who has not packed? The per-person state must be legible to _you_ first and to the organiser second, without a second identity system per row (the reason ADR-0153 §4 dropped the author's avatar).

## D. The Home band, twice

Trip mode (due today / overdue, on a departure board) and Plan mode (the converged what's-missing list) are the same data with different jobs. Plan Home already has the checklist, the CTA-does-the-thing rule and the completed-collapse (ADR-0061); Trip Home has the glance rail and quick-access (ADR-0045/0050). Neither should grow a bespoke list.

## E. The hero horizon slot

What a task looks like beside `איפה` / `פתק` / `הסדרה`, and whether it is a read, a completion, or both. §11 requires this to land as an amendment to ADR-0160 §3 and §13.

## F. The mark on a host row

Notes' mark is a clipboard glyph plus a count past 1, neutral `--muted`, and explicitly **not a tap target** (ADR-0153 §6/§8). A task mark sits on the same lines, which are already measured as full (ADR-0152 §6c and its 2026-08-09 retirement). Whether a task and a note can both mark the same row, and what that costs, is measured rather than argued.

---

# Reuse audit (root `CLAUDE.md` rule 8) — before anything is written

- **A third host-cascade applier is the moment to generalize, not to copy.** `dropNotesForHostChange` and `clearPlaceRefsForChange` already sit side by side doing one job — a DB cascade writes no `Change` rows, so the client owes a local derivation off the parent's delete (ADR-0152 §2, extended by ADR-0157 §3). Tasks makes it three. Rule 8 says generalize the existing one-off rather than add a second copy beside it; this is that second copy arriving, and it belongs in the plan explicitly.
- **`lib/note-host-target.ts`** — the pure "which surface IS an event / booking / document / idea / place" table wiring five destinations (ADR-0153 §8's fifth entrance). Tasks reuses it by generalizing the name, never by copying the table.
- **`ListRow` + `RowManageSheet`** — the managed-list-row shape already serving bookings, documents, members and notes. §A is the only extension.
- **`IndexTile`** — a fourth call site, not a component.
- **`RevealList` / `lib/filter-reveal.ts`** (ADR-0120) on every control that changes the list; a bare `.filter()` is the one-off that made the Map jump for two releases.
- **`EmptyState`** (ADR-0078), **`Modal`** (ADR-0079), **`useFormErrors` + `data-invalid`** (ADR-0150) for the editor's refusals.
- **The deadline wording already exists.** ADR-0171 gave the app `not-after` = a deadline, rendered `עד 18:00`, and ADR-0085 gives relative-day phrasing. A task reuses the **wording**, not the resolver — `edgeMeaning` is an event-category derivation a task never enters.
- **Sync** — one `ENTITY_TYPE.TASK`, one `tasks: Task[]` in `tripSnapshotSchema`, one memory channel, one `CACHE_CHANNELS` entry, outbox verbs through the existing `outboxOpToCacheChanges` path (ADR-0094/0042/0058). No new sync mechanism.
- **Net-new:** the `Task` model and its module, the completion control, the Home band, the hero slot. Nothing else.

---

# Not design questions — settled above, do not spend session time on them

The entity shape (§5), one noun (§2), derived-not-stored automatics (§3), `derivedKey` (§4), three assignment states with no arbitrary multi-select (§6), a single `important` flag (§7), nothing on the day rail (§8), no mode gate (§9), a derived due-time zone (§10), no tab (§11), the flat urgency-ordered screen and the read-only hero slot (§13), and the phase order (§14).

# Suggested shape of the design session

Read this brief, the `design-mockups` skill, and ADR-0153 with its two mockups (`notes-screen-v1.html`, `notes-on-a-host-v1.html`) — that pair is the closest existing thing to what this session must produce, and it is the reason most of Part 1 did not need designing. **Do not preload the ADRs cited above**; Part 1 already carries what they decided.

Answer §A and §B first. They are load-bearing on every other surface: §A decides the row, and every list in §13 is made of rows; §B decides whether §2's one-noun rule survives contact with a rendered screen, which is the single riskiest claim in this brief.

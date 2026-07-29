# Session 183 — the code rule was never a map decision (2026-07-30)

Paper only, one extraction: **[ADR-0136](../decisions/0136-an-event-can-also-be-booked.md)**,
carved out of [ADR-0135](../decisions/0135-a-place-becomes-an-event-or-a-booking.md) §2/§4/§4a/§6.
No new design — the same rule, filed where a reader can find it.

> _"I mean independently from the maps, events in general."_

## What was wrong, and it was not the design

Sessions 181–182 designed the whole thing inside a **Maps & Places** phase, because that is where
it surfaced: the map needed a place to become something, and "event or booking?" was the question
in the way. Everything about the rule was already general — it lands on `EventForm`, which the day
view and the Plan builder host too; it reads the **form's** category; it writes a `Booking`. There
is no map in it.

But it was **filed** as a map decision, and that is not cosmetic:

- `CLAUDE.md` sends every session to the router first and tells it to read only the ADRs named for
  its domain. Under the map row, a session touching event authoring would never open it.
- That is the exact failure [session 180](2026-07-29-session-180-the-router-repaired.md) spent a
  whole session repairing — for the map's own ADRs, yesterday. Filing this one the same way
  would have re-created the defect while the repair was still near the top of the git log.

So 0136's router row is **Data model & events**, and 0135 keeps the map's half.

## What moved, and what stayed

| Stayed in 0135 (the map)                         | Moved to 0136 (events)                               |
| ------------------------------------------------ | ---------------------------------------------------- |
| §1 the block's one action (`.map-addmaybe` pill) | §1 the code decides the entity                       |
| §3 why this is not the errand run backwards      | §2 the type derives from the form's category         |
| §5 what happens to the originating idea          | §3 conversion of an existing event                   |
| §7 absent while a place errand is live           | §4 hard/soft derived at create, preserved on convert |
| §8 what the **block** costs, measured            | §5 what the **form** costs, measured (+78px/host)    |

**The section numbering keeps its holes.** 0135 now runs 1, 2, 3, 5, 6, 7, 8, 9 — §4 and §4a are
gone and §2/§6 are pointers. Renumbering to close the gap would rot every by-section citation in
`decisions/README.md`, the router and the mockup catalog, to save a reader one moment of surprise.
Worth stating in the ADR itself, which it now is.

**The mockup is shared and its name is older than the split.** `map-place-becomes-v1.html` draws
four surfaces and only one of them — the way-in block — is 0135's; the form and outcome frames are
0136's. Renaming a merged file to fix a name is churn against git history, `.prettierignore` and two
PR descriptions, so the catalog entry carries the mapping instead. That is the cheaper honest answer,
and it is the kind of thing a catalog is _for_.

## The consequence that actually matters

**They build independently, and the backlog now says so in two lines.**

- The **event** half needs nothing from the map. It is one collapsed line on a form three screens
  host, plus a shared constant and a conversion made of two shipped verbs.
- The **map** half can ship against today's `EventForm` and simply produce events until the other
  lands.

That was true before this session and unsayable, because one backlog line described both and it
lived under the maps epic. A sequencing constraint that exists only in the filing is the most
expensive kind, and this epic has already recorded two of them dissolving sideways
([session 178](2026-07-29-session-178-the-epic-reconciled.md) on Phase 6a, and session 145 before
it).

## Not done here

The build, still — now two of them. Neither ADR has a line of code behind it.

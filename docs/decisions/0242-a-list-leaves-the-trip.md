# ADR-0242: A list leaves the trip

**Status:** Proposed 2026-09-29, for the owner's review; nothing built. Mockup: [`mockups/a-list-leaves-the-trip-v1.html`](../../mockups/a-list-leaves-the-trip-v1.html). Session note: [`planning/2026-09-29-a-list-leaves-the-trip.md`](../planning/2026-09-29-a-list-leaves-the-trip.md). Epic plan: [`planning/2026-09-25-a-finished-trip-is-a-memory-build-plan.md`](../planning/2026-09-25-a-finished-trip-is-a-memory-build-plan.md), item 6A.4.

**Fills in** spec 3e of [`planning/2026-09-25-what-a-finished-trip-is-for.md`](../planning/2026-09-25-what-a-finished-trip-is-for.md) and the last of [0241](0241-a-finished-trip-plays-back-and-leaves-the-app.md)'s outputs. **Amends** [0213](0213-a-shared-trip-changes-emphasis-and-print-is-its-own-rendering.md) §1 (a list row carries place facts that Summary withholds) and its tenth amendment §3 (the policy hash takes a scope). **Applies unchanged** [0240](0240-the-archive-is-rose.md) §4 (the kind chips open the search), [0120](0120-filter-reveal-is-shared-infrastructure.md) (the search's rows), and the share sheet's rule that a peer sends only links that already exist.

## Context

The spec asks for "'Our Tokyo food list' to a friend going next month: a Summary share scoped to a category. The share policy's level and hash are the mechanism; the scope is new." The owner made three calls (2026-09-29): design first; the entry is the memory Home's kind filter; the list holds what the group did.

Reading the code changed three of the spec's assumptions:

- **The kind filter is a screen now.** ADR-0240 §4 reduced the Home's `לפי סוג` to counts, and each count opens `RecordSearch` on its kind. So the list already exists, on screen, and the send goes there. Nothing new is drawn on the Home.
- **Summary cannot carry the list.** At Summary a `SharedEvent` is title, icon, category and daypart (`sharing-projection.service.ts` returns before the place). A restaurant would travel with no name for where it is and no map link. ADR-0213 withholds those at Summary because a live trip's places say where the group is. That reason does not apply to places a stranger is meant to visit, on a trip that is over.
- **The hash can take a scope and leave every existing link alone.** The canonical string is `level|b|n|t|docs`. A scoped policy appends `|<category>`, so an unscoped one hashes byte for byte as it does today. There is no backfill, and the SQL twin in `20260831120000_share_per_policy_adr0213` does not change.

## Decision

### §1 · The send sits at the foot of the filtered search

`RecordSearch` gains one control under its list: `שליחת רשימת <kind>`. It is `.share-outcome`, the share sheet's verb button, not a new one. **It shows only when the screen shows exactly what would be sent**: one kind is picked and the query is empty. With a query typed, the screen is shorter than the list. On `הכל` there is no list, only the trip, and the trip is sent from the share sheet.

The rule for peers is the share sheet's: an admin always sees the control, and a peer sees it only when a link for that kind already exists.

Measured at 360×640 with the Japan seed's nine food rows, the control sits 136px below the fold. The drawing accepts that: the owner reads the list before sending it.

### §2 · The list has its own small sheet

Pressing the control opens a `Sheet`, titled `רשימת <kind>` and built from the share sheet's parts:

- `.share-scope-note` says what travels and what does not: `N מקומות שהיינו בהם` · `השם, המקום ולינק למפה. בלי שעות, בלי הזמנות, בלי פתקים ובלי שמות.`
- `TripLinkRow` appears once a link exists.
- One primary `.share-outcome`: `יצירת לינק ושליחה`, or `שליחת הרשימה` once a link exists.
- For an admin, `הפסקת השיתוף`.

There are no levels and no switches, because the scope is the whole policy. The sheet measures 191px.

The share sheet counts a list link among the trip's links, and `להפסיק את כל N` stops it too. The per-level logic (`peerLevels`, `atLevel`) filters list links out, so a list never reads as the trip's Summary link.

### §3 · The policy: Summary with a kind

- `upsertTripShareSchema` gains an optional `scope: { category }`. The refinement accepts it only at Summary, which is also the only level where the sensitive switches and files are already impossible.
- `TripShare` gains a nullable `scopeCategory` column (a Prisma migration).
- `sharePolicyHash` appends `|<category>` only when the policy is scoped (see Context).
- `TripShareConfig` echoes the scope back, so the sheet can tell a list link apart.

A trip holds one link per kind, which follows from one link per policy.

### §4 · The projection and the page

A scoped code gets a different public response, discriminated on `status`: `{ status: 'list', trip, category, groups }`. The `trip` part carries the name, destination, icon and dates. Each group is `{ region?, rows: SharedEvent[] }`.

**The rows.** They are the record's rows (`recapHappened`) of that category, in the order they were visited. A skipped row is not a recommendation. Each row carries the place's name, its one-line caption and its map link. It carries no `time`, no `startLabel`, no address line, no ops, no journey and no booking type. It is `EventRow`'s detailed branch with no clock.

**The groups** are the stop place's enrichment region (`region`, else `servedCity`), the same read `tripRecap` uses for its route. With one region there is a single unheaded group, because the masthead already names the city. Rows whose region is unknown form a last, unheaded group.

**The page** is the reader's existing page, `/s/:code`. It keeps the same bar and hero. The kicker reads `רשימה · <kind> · <where>`. Instead of the days there is one `.sh-days` block headed `מה <verb>`, with a `.sh-list-head` over each group.

There is no PDF: the `/pdf` and `/book` routes answer 404 for a scoped code, because a list is a link. The link preview reuses the live cover; its title and description name the list.

The narrative generator is not called for a list.

### §5 · Found by rendering: the reader's date line is set in mono

`.sh-dates` is `--font-mono`, and it prints `t.share.public.counts`, a Hebrew sentence. So every reader page borrows a fallback face for that sentence. This is the trip book's squares (#899) on the web. The build sets the line in the body font and puts only the date run in mono (`.sh-dates-num`), for the trip page and the list page alike.

## Consequences

- **The scope is a kind and nothing else.** Free text in a policy is a link nobody can describe in one line of the sheet's link list.
- **Summary means two things now.** It is a trip's Summary, which withholds places, or a list, which carries them. The list is the only way to get place facts at Summary, and the sheet's scope note says so in words.
- **A live trip gets no list.** The entry lives only on the memory Home's search, and the server projects only the record. If a list from a trip still running is ever wanted, what Summary withholds on a live trip comes back into question.

## Rejected

- **A scope choice inside the share sheet, beside the level.** The sheet already asks for an audience, a level, four switches and files. A list is something you look at before sending it, and the place you look at it is the search.
- **Summary as it is.** It drops the name for where a place is and the map link, which is everything a friend needs from a food list.
- **Including what we skipped, as "next time".** A recommendation is a place we went to. Places we missed are a different list.
- **Grouping by day.** `ב׳ 22.09 · בוקר` over a ramen shop tells a friend nothing. The visit order is kept inside each city.
- **Scoping by the search query.** See the first consequence.

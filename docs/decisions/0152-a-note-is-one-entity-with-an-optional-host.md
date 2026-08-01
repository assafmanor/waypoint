# 0152 — A note is one entity with an optional host, and an external tip is a card until someone keeps it

**Status:** Accepted (owner sign-off 2026-08-01; the strategy contract of §8 is **reserved, not built**)
**Date:** 2026-08-01
**Session note:** [`planning/2026-08-01-session-204-notes-become-one-entity.md`](../planning/2026-08-01-session-204-notes-become-one-entity.md)

**Refines:** [0047](0047-booking-event-linkage-and-notes.md) §5 — which put a booking's notes inside the `Booking.details` JSON blob "no schema migration" — and §6, which moved WiFi off `TripNote` and thereby left that table reader-less, so session 25 retired it entirely. A note comes back as an entity here, and **not for the reason the old one died**: `TripNote` existed to hold WiFi, and WiFi is a field with one reader. **Discharges** [0098](0098-index-landing-and-dedicated-screens.md)'s deferred third content type and the `מחקר` naming debt it explicitly owed to whoever proposed this tile.
**Builds on:** [0151](0151-a-suggestion-has-a-source-and-a-reason.md) (§6's never-persist-until-picked, §5's absent-offline, §7's armed-by-intent, and the registry idiom — §8 below amends its cost axis), [0094](0094-one-pluggable-change-applier-registry.md) (the applier registry a new syncable entity registers into rather than branching), [0095](0095-named-constants-for-string-discriminants.md), [0058](0058-documents-in-the-trip-snapshot.md) (the worked example of a list joining `TripSnapshot` as a first-class reactive entity), [0042](0042-shared-state-is-offline-syncable.md), [0023](0023-zod-first-entities-and-openapi.md)
**Relates:** [0038](0038-icons-and-canonical-category.md) (the canonical `EventCategory` this reuses instead of drawing a taxonomy), [0132](0132-search-reclaims-the-chrome-and-a-google-result-is-a-ring.md) / [0121](0121-embedded-map-phase-6-design.md) §6 (the subordinate "not in the trip yet" tier §3 spends), [0138](0138-the-row-menu-is-one-surface-and-icons-are-ui.md), [0149](0149-the-top-bar-is-two-rows.md) (the density budget §6 respects), [0004](0004-integrations-are-pipes.md), [0065](0065-app-scope-many-trips-small-groups.md)

## Context

Notes exist in exactly one place in the shipped app, and it is not a place: `Booking.details.notes`, a key inside a `Json?` blob (ADR-0047 §5), untyped in `@waypoint/shared` — `entities.ts:211` types the whole field as `z.record(z.string(), z.unknown())`. An `Event`, a `MaybeItem`, a `Place` and a `Document` cannot carry a note at all. There is nowhere to write down a general thing the group knows.

Four facts verified against the tree this session rather than recalled:

- **The Hebrew word is already spent.** `i18n/he.ts:485` and `:494` label the booking form's field `הערות`.
- **ADR-0098 already reserved the seat and left the debt.** Its landing was stress-tested at five tiles specifically against "notes, research, media", and `mockups/index-findability-split-v1.html:913` draws a disabled `הערות` tile subtitled `הערות חופשיות לקבוצה`. Its Consequences make the `מחקר` collision — that word already names the Map's shipped place search — the responsibility of whoever proposes the tile. That is this ADR.
- **`TripNote` is not a precedent to restore.** It held WiFi; ADR-0047 §6 moved WiFi onto the hotel booking; session 25 retired the table rather than narrowing it, because nothing read it.
- **The suggestion contract shipped the day before this** (ADR-0151): `{ source, ref, score, reason }`, a registry, a `LOCAL`/`REMOTE` placement split, and §6's rule that an external candidate owns no row until a human picks it. The owner's ask — notes as the foundation for Wikipedia/Google/AI tips — lands directly on it.

The owner's framing was one integrated model rather than five fields: entity notes and general notes in one place, comfortable to add and to read, and a foundation for automatic ones.

## Decision

### 1. A note is one row, and what it is about is a field

One `Note` entity in `schema.prisma` + `@waypoint/shared` (zod-first, ADR-0023):

```
Note { id, tripId, title?, body?, url?, category?, <host FK>?, source, createdBy, createdAt, updatedAt, updatedBy }
```

A note with no host is a **general** note — a tip, a link, something true about the trip. A note with a host is that event's / booking's / place's / idea's / document's note. **Same row, same list, same editor, same sync channel, same offline story.**

The alternative everyone reaches for first — a `notes` text column on each of the five entities — is rejected in §"Alternatives", but the short version belongs here because it is the whole reason this ADR exists: five columns produce five editors and **no unified view**, which is precisely the thing being asked for, and they leave a machine-generated tip nowhere to be a first-class thing later.

### 2. The host is a typed nullable FK, and a host's death is a change the clients must hear

Five nullable FKs (`eventId`, `bookingId`, `placeId`, `maybeItemId`, `documentId`), **at most one set**, each `onDelete: Cascade`. This is the shape `Booking` already uses for its three place references (`placeId`/`fromPlaceId`/`toPlaceId`), so it is the repo's existing idiom for a small closed union, and it buys referential integrity and orphan cleanup from the database rather than from five service methods.

**The non-obvious cost, stated because it is silent and it will bite.** A database cascade deletes rows **without writing `Change` rows**, so a peer holding the trip in memory or in Dexie never hears that a deleted event's notes are gone, and keeps rendering them until the next snapshot. The cascade is therefore the _storage_ guarantee, not the _sync_ one. The sync half is one rule registered in the ADR-0094 appliers — **a `delete` change for a host drops the notes whose host is that id** — registered in both places a change is mirrored (the memory channels in `state/trip-state.tsx` and `CACHE_CHANNELS` in `lib/cache.ts`). One rule, two registrations, no new mechanism, and no per-entity branch.

The accepted cost of typed FKs is a migration when a sixth entity becomes note-bearing. That is the right trade: the union is small, closed, and changes about once a year, while an untyped `targetType`/`targetId` pair moves orphan cleanup into application logic in five delete paths and lets offline replay resurrect a note whose host is gone.

### 3. Two tiers on one surface, and the boundary is who wrote it

- **A kept פתק is a `Note` row.** A member wrote it, or a member **kept** a card. It syncs, it is editable, it is the group's memory, and it is offline-complete.
- **A card is produced at read time by a strategy and is never persisted.** It renders in the subordinate tier the app already owns twice — a Google result is a ring (ADR-0132), the embedded map's ghost pins (ADR-0121 §6) — so this spends the existing grammar rather than drawing a third. A tap **keeps** it: the card becomes a `Note` whose `source` records where it came from.

This is ADR-0151 §6 applied one surface over, and it is the load-bearing rule of this ADR. The moment Wikipedia and an LLM can write rows, the group's own notes drown at machine volume — the exact crowding ADR-0116 and ADR-0151 just spent two sessions undoing on the shelf, and a notes list crowds **faster** than the shelf, because every entity in the trip can contribute to it and the machine never gets bored.

The chosen vocabulary reinforces the boundary rather than fighting it: a card is not a פתק. It becomes one when a human keeps it.

### 4. The word is `פתקים`, and `מחקר` stays where it is

The tile, the screen and the entity read `פתקים` / `פתק` (owner's call over the incumbent `הערות`): it reads as the group's own scribbles rather than a records field, which is what this surface actually is. The booking form's existing `הערות` copy (`i18n/he.ts:485`, `:494`) is renamed with it — one word in one place, and leaving it would put two names on one concept the same week it was unified.

`מחקר` is **not** used here, and ADR-0098's naming debt is discharged by not incurring it: that word keeps naming the Map's place search, and nothing on this surface competes for it.

### 5. No new taxonomy — the category is `EventCategory`, and a link is a field

`Note.category` is the canonical `EventCategory` (ADR-0038): `transport | food | lodging | sightseeing | nature | activity | shopping | services | other`, optional. It already carries an icon per value and it is already the category on `Event` and `MaybeItem`, so the notes screen inherits ADR-0098 §2's filter-chip row with matching glyphs and no new lookup table.

**Custom user-defined categories are rejected for v1, and the reason is a cost rather than a taste.** The app has no open taxonomy anywhere — `EventCategory`, `BookingType` and `DocumentType` are closed enums with per-value `Record` lookups (`frontend/CLAUDE.md`'s constants rule) whose whole value is that the compiler flags a missing case when the enum grows. The first open one costs: no icon, no exhaustiveness, a merge problem the LWW model has no answer for (two members type `אוכל` and `אכל` on different phones and the trip has two categories that mean one thing), and no i18n story. If it still feels necessary after the surface has been lived with, it gets its own ADR, because what is being added is a taxonomy and not a field.

**"Social media" is not a category — it is a link.** `Note.url` covers a pasted Instagram/TikTok/blog reference with no enum at all, and a URL-only note renders as a link card. It is also the honest hook for later enrichment (resolving a link's title and thumbnail is a remote strategy, §8), which a category never could have been.

### 6. The Index gets a third tile; a row gets a mark, not a body

**On the Index**: a third `IndexTile` on ADR-0098's landing, pushing a dedicated screen exactly as bookings and documents do (the same `useOverlay` sub-view shape, §5 of that ADR, with zero changes to `resolveBack`). No new tab — non-negotiable rule 2, and ADR-0098 measured the landing at five tiles precisely so this would be a tile.

The screen inherits ADR-0098 §2's apparatus **from day one rather than when it crowds**, because a notes list crowds faster than a bookings list: the category chip row, the search control (ADR-0102's multi-field matching over title/body/url), and the shared reveal (ADR-0120) on every control that changes the list. General notes and hosted notes are one list with the host shown on the row; the grouping and default order are a design-session question for the mockup, not a decision this ADR should invent from a fixture.

**On every host surface: a note is a mark on the row, not content in it.** The row shows a small count/glyph; the body lives in the detail surface and the row menu (ADR-0138 — the row menu is one surface). ADR-0149 spent a whole session getting the in-trip header from 250px to 160px and ADR-0151's own amendment refused eight pixels of tile height for a repeated sentence; a note body in a timeline row spends all of it back. The on-the-ground payoff — standing outside the restaurant, tapping the event, reading _"ask for the roof table, the entrance is round the back"_ — is a detail-surface job and loses nothing by being one.

### 7. A booking's notes migrate; its WiFi does not

`Booking.details.notes` becomes `Note` rows hosted by the booking, in a one-time migration. `Booking.details.wifi` **stays exactly where ADR-0047 §6 put it**: it is a field with one specific reader (Home's quick-access, via `frontend/src/lib/home-quick.ts`), not a note, and moving it would re-open the sync question that ADR ruled on.

Migrating rather than reading both is the same call ADR-0047 made against a WiFi fallback: two places one note can live is a drift problem, and this ADR's entire premise is one place.

### 8. The strategy contract is a sibling of ADR-0151's, and it needs the cost axis that ADR conflated

**Reserved here, built by whatever ships the first strategy — no strategy is registered by this ADR.**

**What transfers unchanged** from ADR-0151: the registry idiom, the `LOCAL`/`REMOTE` placement split, §5 (offline, a remote source is **absent** — not empty, not stale, not spinning), §6 (never persists until picked, which is §3 above), §7 (armed by intent), and the one that matters most on this surface — **a reason is not optional, and it is structured rather than rendered** (`packages/shared` holds no UI copy). `מתוך ויקיפדיה`, `הצעת AI` and `נכתב על ידי דנה` are different claims, and an AI tip in a travel app with no visible source is the worst available version of this feature.

**What does not transfer, and why this is a sibling registry rather than a fourth `ref` tag.** A `Suggestion.ref` **points at** a thing; a note card **carries content**. A suggestion answers _"what should I do next"_; a note answers _"what should I know about this"_. Interleaving them in one ranked list is meaningless, so `NOTE_STRATEGIES` is its own registry with its own payload, sharing ADR-0151's `SUGGESTION_PLACEMENT`, its structured-reason discipline and its rank-interleave rule. What gets shared is the **contract and the rules**; a common runner is worth extracting only if it stays small enough to be obviously one thing — if it turns into a substantial generic refactor, stop and ask (root `CLAUDE.md` rule 8).

**The amendment ADR-0151 needs, which this surface is what surfaced it.** Its §2 defines `REMOTE` as _"needs a key and bills for it"_, conflating **needs the network** with **costs money**. Wikipedia is remote, free and unauthenticated — a real third case, and not a hypothetical one, since it is the cheapest first external source this ADR exists to enable. The conflation matters because §7's armed-by-intent rule is calibrated to **money**: keyed off placement, a free Wikipedia blurb would have to sit behind a deliberate tap for no reason at all, on a surface whose whole value is that the tip is already there when you look.

So: a strategy declares **two** properties, `placement` (`LOCAL` | `REMOTE` — where it runs, and therefore whether it is absent offline) and **`cost` (`FREE` | `BILLED`)**, and **§7's arming rule re-keys to `cost`**. One field on a registry entry. ADR-0151 is amended in place at §2 with a pointer here.

### 9. What this build does NOT do, stated so the scope is not read up

The entity, its sync channels, authoring and reading on all five hosts, the Index tile and screen, and the booking-notes migration. **Zero strategies are registered**, no external source is called, no endpoint is built, nothing bills, and `Note.source` only ever reads "a member wrote it". §8 is the seam — the same posture ADR-0151 took toward its own §4 endpoint, and for the same reason: retrofitting a two-tier surface and a never-persist rule under a shipped notes list is the more expensive half.

Also deferred, recorded rather than half-built: **private notes** (`Document.ownerUserId?` is the precedent and the pattern is cheap, but every read path and the offline cache gain a visibility filter and every note gains a scope control — group-only keeps v1's sync story the same as everything else's); custom categories (§5); note-to-note or note-to-many hosting; and rich text.

## Reuse audit (ADR-0096 / root `CLAUDE.md` rule 8)

Before writing anything new:

- **The list rows** — `ListRow` + `RowManageSheet` (`ui/domain`), the generic managed-list-row + kebab shape already serving bookings, documents and members. A fourth managed list extends it; it does not grow a fifth bespoke row.
- **The tile** — `ui/domain/IndexTile`, built by ADR-0098 and explicitly sized for this: a third call site is a third `<IndexTile>`, not a component.
- **The filter chips** — `ChoiceGrid`'s scrollable pill variant, already extended for the bookings screen by ADR-0098 §"Reuse audit". A second consumer is the point of having extended it.
- **The search** — the existing search control + `lib/search-terms.ts` multi-field matching (ADR-0102), with `url` and `body` added to the fields it already spans.
- **List motion** — `lib/filter-reveal.ts`'s `revealRows` through `ui/primitives/RevealList` (ADR-0120). A chip or query that `.filter()`s the array is the one-off that made the Map jump for two releases.
- **The editor** — a `Modal`-based sheet (never a hand-rolled portal; lint-blocked) with `useFormErrors` + `data-invalid` for its refusals (ADR-0150). A note with neither body nor url is the one refusal it owes, and it marks the field.
- **Empty states** — `ui/feedback`'s `EmptyState` for both "no notes yet" and "nothing matches this filter". A bespoke `<div>` here is the seventh copy of what ADR-0078 collected.
- **Sync** — one `ENTITY_TYPE.NOTE` constant, one `notes: Note[]` in `tripSnapshotSchema`, one memory channel, one `CACHE_CHANNELS` entry, outbox verbs through the existing `outboxOpToCacheChanges` path (ADR-0094/0042/0058). No new sync mechanism, and §2's host-delete rule rides the same registry.
- **Net-new**: the `Note` model/schema and its module. Nothing else.

## Consequences

- **One schema migration** (the `Note` table + its five FKs and indexes) plus a one-time data migration of `Booking.details.notes`. `details.wifi` is untouched, so `home-quick.ts` does not change.
- **`Booking.details` loses its only typed-by-convention key** and goes back to being what it is — a blob for provider-shaped extras — which is a small honesty win for a field ADR-0047 chose specifically to avoid a migration.
- **The Index landing goes to three tiles**, on a shape measured at five (ADR-0098). Nothing about its navigation changes.
- **ADR-0098's `מחקר` debt is discharged** without spending the word.
- **ADR-0151 §2 gains a `cost` axis** and §7's arming rule re-keys to it — amended in place, with the first free-remote strategy as the consumer that will prove it.
- **The first external source is a registration plus one handler**, against a contract already fixed — which is the flexibility asked for, bought without pre-building a pipe that has no consumer (ADR-0065).
- **New `he.ts` copy** for the tile, the screen, the editor and the host-surface affordances, and the booking form's `הערות` renamed. No em dashes, per convention.
- **Design owes a mockup** before the build: the notes screen's grouping and default order, the host-surface mark, and the card tier's exact subordinate treatment (§3 names the grammar to spend, not the pixels).

## Alternatives considered

- **A `notes` text column on each of the five entities.** Cheapest possible change and genuinely fixes "an event cannot carry a note". Rejected: it produces five editors and no unified view — the actual request — and it leaves general notes homeless and machine-generated tips with nowhere to be a row. It also cannot be migrated into this model later without touching all five.
- **`targetType` + `targetId` strings** keyed off the existing `ENTITY_TYPE` constant. Attractive: a sixth attachable entity needs no migration. Rejected (§2): it moves orphan cleanup out of the database and into five delete paths, and offline replay can resurrect a note whose host is gone. The union is small and closed; a migration a year is cheaper than integrity in application code.
- **A fourth `ref` tag on ADR-0151's `Suggestion`** carrying the note's body, so one registry serves both. Rejected (§8): a `ref` points at a thing and a note carries content, and ranking "go here next" against "here is a fact about this place" in one list is meaningless. The shared thing is the contract's grammar, not its payload.
- **Persisting external tips as `Note` rows with a `source` flag.** Rejected (§3): it is ADR-0151 §6's rejected shortcut with a bigger firehose behind it, and it puts rows in the trip that no human chose.
- **Custom user-defined categories**, as raised. Rejected for v1 (§5) on cost — the app's first open taxonomy, with no icon, no exhaustiveness, no merge rule under LWW and no i18n. Deferred, not refused: it is a taxonomy decision and it should get to be one.
- **`הערות` over `פתקים`.** The incumbent word, already in the booking form and already in ADR-0098's placeholder tile, so it would have cost no rename. Overruled by the owner in favour of the warmer word — and it turned out to carry §3's tier boundary for free, since a machine card is not a פתק until someone keeps it.
- **A fourth tab for notes/knowledge.** Rejected on non-negotiable rule 2 (integrations are pipes, not screens) and because ADR-0098 built the landing to absorb exactly this.
- **Private notes in v1** (`ownerUserId?`, mirroring `Document`). Deferred (§9): the precedent is real and the field is cheap, but the visibility filter reaches every read path and the offline cache, and every note-writing surface gains a scope control. Group-only keeps v1 identical to how everything else in the trip behaves.

# Session 204 — Notes become one entity, and an external tip becomes a card

**Date:** 2026-08-01
**Kind:** Design consultation → decision. **Docs only** — nothing was built.
**Outcome:** [ADR-0152](../decisions/0152-a-note-is-one-entity-with-an-optional-host.md), an in-place amendment to [ADR-0151](../decisions/0151-a-suggestion-has-a-source-and-a-reason.md) §2, and one backlog line.

## What was raised

The owner, in one message: notes are thin — only `Booking` has them, and `Event`/`MaybeItem`/`Document`/`Place` have none. The Index should get a notes view alongside bookings and documents. And the model should be **integrated** — the other entities' notes and general notes (tips, social media, custom categories) in one place — as the foundation for automatic notes later (Wikipedia, Google, AI tips). Plus: does it fit the suggestions strategy model?

## What the tree actually said (verified, not recalled)

- **Notes live in one place and it is not a place.** `Booking.details.notes` — a key inside a `Json?` blob (ADR-0047 §5), untyped in `@waypoint/shared`: `entities.ts:211` types the whole field `z.record(z.string(), z.unknown())`.
- **The Hebrew word was already spent** on that field: `i18n/he.ts:485`, `:494` → `הערות`.
- **ADR-0098 had already reserved the seat and left the debt.** Its landing was stress-tested at five tiles specifically against "notes, research, media", and `mockups/index-findability-split-v1.html:913` draws a disabled `הערות` tile subtitled `הערות חופשיות לקבוצה`. Its Consequences make the `מחקר` collision — that word already names the Map's shipped place search — the responsibility of whoever proposes the tile.
- **`TripNote` existed and was deliberately killed.** ADR-0047 §6 moved WiFi onto the hotel booking, which left the table reader-less; session 25 retired it entirely rather than narrowing it. So this is not a restore: the old one existed to hold WiFi, and WiFi is a field with one reader.
- **ADR-0151 shipped the day before** with a contract that lands directly on the owner's last question.

## The four calls, and what the owner decided

Presented as forks rather than assumptions. Three went to the recommendation, one did not.

| Fork                          | Recommended                                 | **Decided**            |
| ----------------------------- | ------------------------------------------- | ---------------------- |
| How a note points at its host | Typed nullable FKs                          | **Typed nullable FKs** |
| The word                      | `הערות` (the incumbent)                     | **`פתקים`**            |
| Private notes                 | Group-only in v1                            | **Group-only in v1**   |
| First build's scope           | Foundation, strategy seam defined not built | **Foundation only**    |

**The one overrule is the interesting one.** `הערות` was recommended purely on incumbency — it is already the booking form's label and already the mockup's placeholder. The owner took `פתקים`, and it turned out to carry ADR-0152 §3's tier boundary for free: **a card is not a פתק until someone keeps it.** The vocabulary now does work the recommended word would not have done. Cost of the overrule is one rename in `he.ts`.

## What the design landed on

Full argument in the ADR; the three load-bearing moves:

1. **One row, and what it is about is a field.** No host = general note; a host = that entity's note. Five `notes` columns would have produced five editors and **no unified view** — the actual request — and left machine tips nowhere to be first-class.
2. **Two tiers, and the boundary is who wrote it.** A kept `פתק` is a row; an external tip is a **card that owns no row until a human keeps it**, rendered in the subordinate tier the app already owns twice (ADR-0132's ring, ADR-0121 §6's ghost pins). This is ADR-0151 §6 one surface over, and it is the rule the whole design hangs on: a notes list crowds **faster** than the shelf, because every entity can feed it and the machine never gets bored.
3. **A note is a mark on a row, not a body in it.** ADR-0149 spent a session taking the header from 250px to 160px and ADR-0151's own amendment refused eight pixels for a repeated sentence. The body lives in the detail surface and the row menu (ADR-0138).

## Two things the consultation produced that the question did not ask for

- **ADR-0151 §2 conflates two axes.** `REMOTE` is defined as "needs a key and bills for it", which merges _needs the network_ with _costs money_. **Wikipedia is remote, free and unauthenticated** — and it is not a hypothetical, it is the cheapest first external source this whole line of work exists to enable. §7's armed-by-intent rule is calibrated to money, so keyed off placement a free blurb sits behind a deliberate tap for nothing. Fixed by amending 0151 §2 in place: a strategy declares `placement` **and** `cost` (`FREE` | `BILLED`), and §7 re-keys to `cost`. One field on a registry entry.
- **"Social media" is not a category, it is a link.** A `url` field covers the pasted Instagram/TikTok/blog reference with no enum at all — and it is the honest hook for later enrichment (resolving a link's title and thumbnail is a remote strategy), which a category could never have been. This is half of why custom categories were deferrable without losing the use case behind them.

## What was deliberately NOT decided

- **Custom user-defined categories.** Deferred, not refused — it is the app's first open taxonomy (no icon, no exhaustiveness, no LWW merge rule for `אוכל` vs `אכל`, no i18n), so it is a taxonomy decision and should get to be one. `EventCategory` (ADR-0038) is the category for now and hands the screen ADR-0098 §2's chip row with matching glyphs for free.
- **Private notes.** `Document.ownerUserId?` is a real precedent and the field is cheap, but the visibility filter reaches every read path and the offline cache, and every note-writing surface gains a scope control.
- **The notes screen's grouping, default order, host-surface mark, and the card tier's pixels.** Named as a mockup's job. The ADR names the grammar to spend, not the geometry — inventing that from a fixture is how ADR-0151's tile got measured twice.

## Next

The build is one branch: the `Note` model + shared schema, the sync channels (snapshot / memory / `CACHE_CHANNELS` / outbox), authoring and reading on all five hosts, the Index tile + screen, and the `Booking.details.notes` migration. **A mockup comes first** for the screen and the host-surface mark. No strategy is registered and nothing bills — ADR-0152 §9 states the scope so it is not read up.

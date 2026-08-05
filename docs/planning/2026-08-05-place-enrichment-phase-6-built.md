# Place enrichment Phase 6 — the expanded card is the research card

**Date:** 2026-08-05
**Scope:** [ADR-0167](../decisions/0167-the-badge-is-the-thumbnails-frame.md) §11.1 (expanding is a mode change), §10.2 (the full picture is the app's own preview), §4/§8.2 (the credit). Frontend only.
**Follows:** [Phase 4](2026-08-05-place-enrichment-phase-4-built.md), [Phase 5](2026-08-05-place-enrichment-phase-5-built.md).
**Aligned to:** [`mockups/place-enrichment-v2.html`](../../mockups/place-enrichment-v2.html) — the expanded column.
**Owner's call:** generalize `MediaViewer` rather than build a second viewer (the one thing the build plan said to ask about first).

## What shipped

| Piece                                                | Where                                       |
| ---------------------------------------------------- | ------------------------------------------- |
| The viewer, no longer document-shaped                | `ui/MediaViewer.tsx` (was `DocumentViewer`) |
| One failable-image answer for the badge and the hero | `lib/useFailableImage.ts`                   |
| The credit, RTL with its Latin run isolated          | `lib/place-summary.ts` (`placeCredit`)      |
| The mode change, the hero, the way back              | `screens/Map.tsx` (`PlaceRow`)              |
| Its own grid, and the clamp released                 | `screens/map.css`                           |
| The expansion's back layer                           | `screens/Map.tsx`                           |

## The three amendments this had to be read through, not around

**§11 supersedes §10, and it changes what gets built.** §10 made expansion reveal a bigger picture _inside_ the card and made the **credit line** the entry point to the full-screen preview. §11.1 replaced that with a mode change and says so explicitly: _"What is retired is §10's credit-line entry point."_ So the hero is the way to the picture, and `⤢ תמונה מלאה` is **not** built. The mockup agrees in a way worth recording: its `.creditrow` and `.full` rules exist in the stylesheet and **no markup uses them** — dead CSS from the superseded design. Building from §10 would have produced a control the design had already withdrawn.

**§9.4 keeps the hero off the committed card.** The badge already carries the photograph at zero cost, so 130px of picture belongs to the state where you have asked to look at the place _as a subject_ — never to the collapsed row.

**§11.1's "one presentation, not two"** is why this is `PlaceRow` in a second state rather than a new component: the collapsed card is a collapse of it.

## What the mode change actually is

Expanding **swaps blocks, it does not add them**: the hero and the whole summary come on; the notes, the references and the schedule footer come off. That is what dissolved §10.2's measured problem instead of working around it — a 116px hero revealed _inside_ the collapsed card left the notes scroller **31px**, which only bites if expansion is growth.

Two consequences worth naming:

- **The expanded card is a different grid.** `:has(.note-sec)` stops matching when the notes are not rendered, so the blocks would be unplaced. It gets its own `:has(.map-hero)` shape, with the **summary** as the `minmax(0, 1fr)` track — the one thing that can grow without bound here, exactly as the note list is in the collapsed state.
- **The expansion is in the back stack.** `frontend/CLAUDE.md` names this exact shape: a state a mounted screen enters and leaves needs a deliberate `useBackLayer` gated on that state. The screen never unmounts, so it cannot express "there is something to peel" by existing — and there is: a visible `‹ חזרה לפרטי המקום`. The stack peels **expansion → selection → tab**, which is asserted, because gating the layer on the state is what produces that order.

## Rule 8, applied twice

**The failable image.** `PlaceBadge` owned "an immutable URL that 404s degrades to the no-image state" as a one-off, and the hero needs exactly it. Rule 8 asks for the existing one-off to be **generalized rather than copied**, so it became `useFailableImage` and the badge now reads from it. The subtlety it protects is invisible until an image is refreshed: a _replacement_ gets a fresh chance instead of inheriting the last URL's failure.

**The viewer.** Of its 381 lines, four touched the document shape. `MediaViewer` takes `{ title, mimeType, source, caption? }`; `DocumentViewer` is a thin adapter over it, so `DocumentsSection` and the `?doc=` deep link are byte-identical — the same idiom `mapsPredictionUrl` uses over the private search builder. Everything ADR-0167 §10.2 wanted is inherited rather than re-earned: the portal, the one close that back / Escape / the gesture / the backdrop all run through, the focus trap, the arrival, and ADR-0062's sole zoom exception.

One addition beyond the extraction: an optional **`caption`**, which the place card fills with the credit. A CC BY-SA photograph shown full screen is its most prominent display.

## The attribution gap Phase 5 left is closed

§4 lets the 40px badge carry no credit because _"the badge leads to the card, one tap away, where the credit is"_ — and until now that card did not exist. It does: photographer `·` license, under the picture, with the **license string verbatim** (nine distinct strings across 32 files) and **absent attribution treated as normal** (5 of 32 files owe none).

The line stays RTL and isolates its own Latin run via `ltrIsolate`, which is §8.2's prescription and the half of ADR-0118 its lint guard cannot see: `dir="auto"` on a Latin credit turns the _whole element_ left-to-right, which reads correctly and then aligns to the opposite edge from every other line on the card. The e2e asserts its start edge against the summary block's, so a recurrence fails.

## Where the tests are

- `ui/MediaViewer.test.tsx` (+4) — the url source needs no fetch, the caption renders and is absent without one, and Escape still closes; the document path's 21 unchanged.
- `screens/Map.embedded.test.tsx` (+7) — the way in only where there is a room to open (including an image with no summary, whose hero would otherwise be unreachable), the swap in both directions, the credit's isolate, the viewer opening from the hero, and the expansion not surviving a change of selection.
- `screens/Map.back.test.tsx` (+2) — one press collapses and stays on the tab; the peel order.
- `e2e/place-know.spec.ts` (+4) — the hero at the mockup's 130px filling its box, the clamp released, the itinerary blocks gone, the credit on the card's own edge, the way back, and the full picture with its caption.

## Still open

- **The device pass, now with more to look at**: whether a 130px hero and a two-line summary read as one card, whether the credit is legible at 11px `--faint` over the card in both themes, and Phase 4's original question — a real photograph at 40px.
- **Hours** remain blocked upstream (no OSM provider), so §9.2's `פתוח עד 17:00` tag and §7's "as of" are still unbuilt. The expanded card has the room the ADR promised them.
- **The deciding surface** — a place not yet in the trip — still cannot be enriched, so the research card exists today only for a place you already hold. That is the recorded-not-built pre-save item, and it is what would make this card what §9.1 designed it for.

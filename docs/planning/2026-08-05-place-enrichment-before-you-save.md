# Enrichment reaches the place you have not saved

**Date:** 2026-08-05
**Scope:** [ADR-0166 §17](../decisions/0166-place-enrichment-is-a-multi-source-pipe.md) (the third trigger + the lookup route), [ADR-0167 §15](../decisions/0167-the-badge-is-the-thumbnails-frame.md) (the deciding card, §9.1's last unbuilt piece). Shared + backend + frontend.
**Follows:** [Phase 6](2026-08-05-place-enrichment-phase-6-built.md), which built the card this fills.
**Aligned to:** [`mockups/place-enrichment-v2.html`](../../mockups/place-enrichment-v2.html) — the deciding column (`2 · A place you are still deciding on`).
**Owner's asks:** _"I want that places will be enriched even before getting saved, so that we'll be able to see images and read summary even before saving."_ → _"Do enriching before saving. Does it need a mockup?"_ → the trigger, chosen from three: **on tap only**.

## No mockup was needed, and that is worth one line

The card is drawn: `place-enrichment-v2.html`'s second column is a badge, an identity line, a hero, a credit, a summary, an hours line and a foot, measured at 361px. ADR-0167 §9.1 designed it and §11.1 made it the same component as the expanded card. The gap was never the surface — it was that enrichment could not reach a place with no `placeId`.

## What shipped

| Piece                                                     | Where                                                          |
| --------------------------------------------------------- | -------------------------------------------------------------- |
| The lookup contract                                       | `packages/shared/src/enrichment.ts` (`enrichmentLookupSchema`) |
| A pass somebody is waiting for                            | `backend/.../enrichment.scheduler.ts` (`enrichNow`)            |
| The membership-scoped, rate-limited route                 | `backend/.../enrichment-lookup.controller.ts`                  |
| The three blocks, once, for both rows                     | `frontend/src/ui/domain/PlaceKnowledge.tsx`                    |
| The trigger, and the session's answers                    | `frontend/src/lib/useCandidateEnrichment.ts`                   |
| The deciding density's clamp, and §14's inert grid, fixed | `frontend/src/screens/map.css`                                 |

## The one structural fact that shaped all of it

**Everything else this pipe delivers is pushed.** The snapshot join and the WS nudge are both keyed by `placeId`, and a Google result has neither a `placeId` nor a row anywhere. So the answer has to travel back down a request the client makes — which makes this the first enrichment read a client **addresses** rather than receives, and that is why the route needed membership scoping and a rate limit of its own rather than inheriting somebody else's.

Two shapes were considered for delivery and the WS one was rejected on surface area: broadcasting to the asking trip would need the message to carry a `googlePlaceId`, an interest registry (which trip asked about which candidate), a second client-side map keyed differently from `enrichments`, and a decision about caching it — **and it would still need this route** for a place we already hold enrichment for. A bounded wait needs none of that, and the wait is the honest thing anyway: the request exists _for_ the enrichment.

## Where §6's guarantee actually bites

§6 says no request ever waits on a third party, and the trigger phase wrote a scheduler whose only door is synchronous, `void` and unthrowable so that a pick could not be slowed or failed by Wikimedia. That guarantee is about requests that exist for **something else**. `enrichNow` is the one door that returns a value, and the reasoning is written where the code is: bounded at 5s, answering with whatever the store holds when the wait lapses, and never losing the pass — it finishes into the store, so the next tap is instant and so is the place once it is added.

One deliberate asymmetry: a pass with a person waiting may take a slot above the background cap (6 vs 3). A tap is somebody looking at a blank card; a backfill is nobody.

## Rule 8, and the copy that was about to happen

`ResultRow` and `PlaceRow` are different components, so the hero, the credit and the summary were about to exist twice — with two clamps, two credits and two failable images to keep in step. ADR-0167 §11.1's _"one presentation, not two"_ is the rule and rule 8 is the instruction: they became `PlaceKnowledge`, three densities of one block, and `PlaceRow` now renders the same call it did inline.

It returns a **fragment**, which is the part worth remembering: each block is a child of the row's own layout — a wrapping flex line in the list, a grid row in the bounded card — so a wrapper element would take their place in it. The mockup's own stylesheet says the same thing in a comment about the same bug: _"the span belongs to the host, not the text."_

The dividend was immediate: the deciding card needed **no CSS of its own** beyond one clamp, because `flex-basis: 100%` on the three blocks was already how they take a full-width line on a trip row.

## Three lines, not two, and not expandable

The mockup's `.summary` is `-webkit-line-clamp: 3` and its `.clamp2` variant is the committed card's — so the deciding card's clamp is a number that was already chosen. It stays clamped rather than expandable because this card has nothing to swap off: no notes, no references, no schedule footer to trade for the room, which is the whole of §9.1's inversion. The third line is the floor, and the way to the rest is the row's existing Google exit.

Both clamps are written on compound selectors (`.map-sum.is-open .map-sum-t`, `.map-sum.is-decide .map-sum-t`), which is ADR-0167 §9's closing warning obeyed for the second and third time.

## What the mockup draws that was deliberately not built

Its deciding column puts `ניווט` in the trailing slot and `＋ אולי` in a footer beside `עוד בגוגל`. [ADR-0134](../decisions/0134-the-map-is-where-a-forms-place-comes-from.md) §5 settled this row's two controls **after** that mockup was drawn — an icon-only Google exit beside one labelled verb, with stacking measured and rejected (106px vs 68px per row, halving the results you can see). Re-opening that is a different decision with its own measurement; this change is the enrichment blocks.

Hours are absent for the reason they are absent everywhere: no OSM provider yet (ADR-0166 §12).

## A latent defect of Phase 6's, found by building beside it

Phase 6 gave the expanded card a `:has(.map-hero)` grid with the summary as its flexible track. But `display: grid` and the card's height bound were only ever selected by the **collapsed** card's `:has(.note-sec)` — and the mode change stops rendering the notes. So both of that state's rules were inert declarations on a flex row, and the one state whose summary has no clamp was also the one state with no bound. Fixed by extending the two selectors, not by new arithmetic. It could not have been caught by the Phase 6 e2e, which measures the **list row** — the bounded card exists only on a rendered canvas, and the hermetic run has no Maps key.

The deciding card is excluded from all of it on purpose: a fixed 130px hero, one credit line and a three-line clamp have no track that needs to be the flexible one.

## Where the tests are

- `enrichment.scheduler.spec.ts` (+7) — the answer is the read model, a waiter joins a pass already running, a waiter gets a slot the background cap refuses, the wait lapsing serves what we hold, the kill switch still serves what we hold, and a failed pass answers `{}` rather than throwing into the request.
- `enrichment-lookup.controller.spec.ts` (4) — the identity is passed through unembellished, and **both guards are asserted** rather than assumed: they are the whole access story for a global store a client can address by key.
- `ui/domain/PlaceKnowledge.test.tsx` (9) — what each density draws, the fragment's children in order, the marker beside the prose, and the picture degrading to no credit when the bytes are gone.
- `Map.embedded.test.tsx` (+8) — which tap asks and with what, one ask per place however many taps, nothing for a result the trip owns, nothing offline, an empty answer remembered as an answer, and the viewer opening from the candidate's own hero.
- `PlaceResearch.test.tsx` (+2), `lib/api.test.ts` (+3).
- `e2e/place-decide.spec.ts` (8, both widths) — the mockup's 130px hero, the three-line clamp _proved_ (a real extract does not fit), the blocks' full-width lines with no reflow above them, the credit on the row's own edge, the controls staying on the identity line, one ask per tap, and the majority case rendering as the row it always was. First spec here to drive Google's half of the search, which is hermetic: the relay is a `page.route` stub like every other call.

## Still open

- **The device pass** now has a third card to look at, and one new question: whether a 130px hero inside a **result row** in a scrolling list reads as one card or as a picture between two rows.
- **The trust boundary is accepted, not closed** (§17.4). A member could ask us to enrich a `googlePlaceId` under the wrong name, and the store is global. Bounded by invite-only membership, a one-place blast radius, and cheap repair — but if the app ever opens up, this is the line to revisit first.
- **A candidate's answer is session-scoped.** Nothing goes to Dexie, because a candidate is not trip data and the search that produced it needs the network anyway. If a future surface wants to show a result you looked at yesterday, that is a cache decision, not this one.

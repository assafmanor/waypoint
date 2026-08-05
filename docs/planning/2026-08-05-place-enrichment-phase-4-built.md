# Place enrichment Phase 4 — the badge becomes the frame

**Date:** 2026-08-05
**Scope:** [ADR-0167](../decisions/0167-the-badge-is-the-thumbnails-frame.md) §1/§2 — a fetched photograph fills the Map row's badge and the category hue moves from fill to a ring. Frontend only, and **the first visible change** of the whole feature.
**Follows:** [Phase 1](2026-08-05-place-enrichment-phase-1-built.md), [Phase 2](2026-08-05-place-enrichment-phase-2-built.md), [Phase 3](2026-08-05-place-enrichment-phase-3-built.md), [the trigger](2026-08-05-place-enrichment-trigger-built.md).
**Plan:** [`2026-08-05-place-enrichment-build-plan.md`](2026-08-05-place-enrichment-build-plan.md) Phase 4.
**Aligned to:** [`mockups/place-enrichment-v2.html`](../../mockups/place-enrichment-v2.html) — **v2 only; v1 is stale** (owner, this session), and v1's `overflow: hidden` on the badge is the defect §11.2 caught.

## What shipped

| Piece                                               | Where                               |
| --------------------------------------------------- | ----------------------------------- |
| Which photo fills a badge, if any (§2's fill order) | `frontend/src/lib/place-photo.ts`   |
| The badge frames it: clip, ring, load failure       | `ui/domain/PlaceBadge.tsx` + `.css` |
| The host's hue as a ring, and the soft line redrawn | `screens/map.css`                   |
| The row passes the photo through                    | `screens/Map.tsx` (`PlaceRow`)      |
| A server path made loadable                         | `lib/api-asset.ts`                  |
| The geometry, measured in a real browser            | `e2e/place-photo-frame.spec.ts`     |

## The two traps the ADR named, and how they are avoided

Both were measured in the mockup before any of this was written, which is why they cost nothing
here — but the implementation of each is worth reading once.

**§11.2, the clip.** The photo clips on an inner element and the badge keeps `overflow: visible`,
because the badge hosts children that deliberately overhang it: the order counter at its corner
and the hit-area `::after`. In flow at `100%×100%` rather than absolutely positioned, as v2 draws
it — the badge is a `place-items: center` grid, so a block child fills the cell.

**§8.1, the ring.** An `inset` box-shadow paints above the background and _below_ the element's
children, so a hue on the badge is covered by the photo. The ring is therefore an overlay above
the image and outside the clip. v2 draws it as `.badge.photo::after`; **here it is a real
element**, because on this badge both pseudo-elements are already spoken for — `::before` is the
order counter (`map.css`) and `::after` is `.wp-placebadge`'s hit-area expander.

## Three things this session found by measuring rather than reading

**The category fill was NOT cleared under the photo.** `place-badge.css` said
`[data-photo].map-badge { background: none }`, which ties with `.map-badge.cat-food` on
specificity — one class plus one class — and `map.css` loads later, so the tint stayed. Invisible
under an opaque image and wrong the moment a thumbnail carries alpha. The clearing rule now also
lives in `map.css` beside the five fills it overrides, and the component's own comment says a host
that declares its fill this way owes the same line.

**The acceptance number is the row's PITCH, not its box.** The plan says _"collapsed rows stay at
69–71px"_ and ADR-0167 calls `.place` a 73px row. A real `.place` measures **64px**, and two
adjacent rows are **73px** apart — the box plus its 9px `margin-bottom`. So the ADR's 73px is the
shipped surface and the 69–71px is the **mockup's own box**, whose CSS is hand-written and not the
app's; `docs/design/mockups.md` says to re-check exactly this, and re-checking is what found it.
The spec asserts the pitch (73px, unchanged) and the two rows' equality, not the mockup's band.

**The Map list's badges are inert, and only the place CARD's is the way to the pin.** `renderRow`
supplies `onFrame` on the card only (ADR-0129 §1 — you are already looking at the map), so the
first draft of an e2e assertion about the marker and the handler was asserting something the
surface never had. That half is a unit test instead.

## Where the tests are, and why each is where it is

**`lib/place-photo.test.ts`** — the fill order as a pure function. `undefined` covers three
different situations that must render identically: a human picked an icon, nobody has looked, and
we looked and found nothing.

**`ui/domain/PlaceBadge.test.tsx`** — the markup and the degradations: the glyph and the photo are
alternatives rather than stacked, the ring is the badge's own child, a load failure falls back to
the glyph, and a **replacement** photo gets a fresh chance rather than inheriting the last URL's
404 (an enrichment refresh mints a new immutable URL, and the old one is gone for good).

**`screens/Map.embedded.test.tsx`** — the screen's decision: which rows get a photo at all, and
that a picked icon keeps its row.

**`e2e/place-photo-frame.spec.ts`** — everything that is a box. jsdom loads no CSS and reports
every rect as zero, so the whole class of claim this phase makes is invisible to the unit suite by
construction. It asserts the pitch, the badge's 40×40, no title reflow, `object-fit: cover`
against a non-square source, the counter's box unchanged, the badge's `overflow: visible`, the
clip's `hidden`, the hue in the ring's shadow rather than in the fill, and the soft line redrawn —
in both day scopes.

The photo there is **real PNG bytes**, built in the spec from `node:zlib` and three CRC'd chunks
rather than mocked away, and no assertion runs until the image reports itself decoded. A refused
content type or an undecodable body leaves a broken image whose box measures perfectly — exactly
the failure a geometry harness cannot see.

## Still open

- **The device pass, which this phase was gated on and does not replace.** The specific questions
  a real device has to answer, none of which a measurement can: **is a photograph legible at
  40px at all**; does `object-fit: cover`'s centre crop produce sky on buildings (the avatar
  precedent's square crop does not transfer as a judgement, and at 40px there is no room for a
  smarter one); does the white hairline hold the ring against a bright sky in **both** themes;
  and does a list of mixed photos and glyphs read as one list or as two.
- **The soft-line stacking is my call, made without seeing it.** `.place.soft .map-badge`'s inset
  line is covered by the photo, so it is redrawn in the ring's shadow at `3.5px` — outside the
  2px hue ring. Hard/soft is non-negotiable (root rule 1), so leaving it to the badge's `opacity`
  alone was not an option, but whether a hue ring and a soft line at that spacing read as two
  rings or as mud is a device question.
- **A coordless Place-lite gets a dashed badge and could still get a photo**, which would sit
  inside the dash. Nothing refuses it and nothing was changed for it — no place without
  coordinates is enriched today anyway (the scheduler skips them), so this is a note for whoever
  builds §10's name-only match.

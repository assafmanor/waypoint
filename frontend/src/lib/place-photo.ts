// **Which photo, if any, fills a place's badge** (ADR-0167 §1/§2).
//
// One rule, and it is the trip's-opinion-wins boundary applied to a 40px square:
//
// > **A picked icon beats a fetched photo.**
//
// ADR-0147 stores `Place.icon` only when a **human picked it**, and ADR-0166's founding line
// is that the trip's opinion is never overwritten by the world's facts. A photo silently
// replacing a glyph someone chose would be that rule broken on the most visible pixel in the
// row — and broken *automatically*, by a background fetch, on a surface the person did not
// touch. The photo is still one tap away on the card.
//
// Lives here rather than inside `PlaceBadge` because the badge cannot tell a picked glyph from
// a derived one — it receives rendered children. The distinction is the *place's*, so the
// question is answered where the place is known.
import type { DeliveredEnrichmentFields, DeliveredImageValue, Place } from '@waypoint/shared';

/**
 * The image that should fill this badge, or `undefined` for the glyph.
 *
 * `undefined` covers three different situations that all render identically, which is the
 * point (ADR-0167 §1: rows without an image are unchanged): a human picked an icon, nobody
 * has looked this place up, or we looked and there was nothing.
 */
export function badgePhoto(
  place: Pick<Place, 'icon'>,
  enrichment?: DeliveredEnrichmentFields,
): DeliveredImageValue | undefined {
  if (place.icon) return undefined;
  return enrichment?.image;
}

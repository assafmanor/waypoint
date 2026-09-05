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
import {
  eventStopPlaceId,
  type Booking,
  type DeliveredEnrichmentFields,
  type DeliveredImageValue,
  type Place,
  type TripEnrichments,
  type TripEvent,
} from '@waypoint/shared';
import { chosenIcon } from '../constants';

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

/**
 * **The image that should fill a DAY ROW's badge**, or `undefined` for the glyph (ADR-0219 §1).
 *
 * The same rule as `badgePhoto`, asked one level higher: an icon a human picked **on the
 * event** is the trip's opinion exactly as one picked on the place, so it beats a fetched
 * photo too. ADR-0167 §2 could only test `place.icon` because its host was the Map, where
 * a pin has no event behind it; a day row has both, and answering only half the question
 * would let a background fetch overwrite a glyph someone chose on the event.
 *
 * `chosenIcon` rather than `event.icon` because a stored `📌` is what the form leaves behind
 * when nobody picked anything (`constants.ts`) — treating that as a pick is the defect that
 * function exists to undo, and it would suppress the photo on most rows.
 *
 * It resolves the place itself rather than taking one: both day surfaces hold `bookings`,
 * `places` and `enrichments` and would otherwise write the same lookups.
 *
 * **Through `eventStopPlaceId`, and the first cut read `event.placeId` alone.** That column is
 * authoritative only for an event no booking backs (ADR-0048 clears it on save), so every
 * hotel, restaurant and ticket on the trip wore its category glyph while the same place on the
 * Map wore its photograph — the owner's _"places don't have their image as the icon (like on
 * the map)"_, reported against a booked zip line. What the first cut was right about is kept by
 * the same call: a LEG answers with neither end, so a flight's badge is still a flight's and
 * never its origin airport's picture.
 */
export function rowPhoto(
  event: Pick<TripEvent, 'icon' | 'placeId' | 'bookingId'>,
  bookings: Booking[],
  places: Place[],
  enrichments: TripEnrichments,
): DeliveredImageValue | undefined {
  if (chosenIcon(event.icon)) return undefined;
  const placeId = eventStopPlaceId(
    event,
    event.bookingId ? bookings.find((b) => b.id === event.bookingId) : undefined,
  );
  if (!placeId) return undefined;
  const place = places.find((p) => p.id === placeId);
  return place && badgePhoto(place, enrichments[place.id]);
}

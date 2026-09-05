// **Which stop a day is a picture of, in the app** (ADR-0219 §3).
//
// Thin on purpose: the gate (`confidence ≥ 0.9` and a credit we can print) and the rank (dwell,
// then booked-or-hard, then log-scaled rating count, then a human mark) are
// `@waypoint/shared`'s `dayPhoto`, moved there in phase 2 so the reader and both day surfaces
// picture a day identically. What is answered here is only what a browser needs on top: the
// asset path resolved through `apiAssetUrl`, and the trip's own place labels.
//
// A day whose stops clear no gate has no shot and no placeholder — the frame stands alone, as
// the reader's does. That absence is the design: nine days with photos and three without reads
// as honest; three days showing the wrong mountain destroys trust in the other nine.
import {
  dayPhoto,
  type DeliveredImageValue,
  type DayPhotoPlace,
  type Place,
  type TripEnrichments,
  type TripEvent,
} from '@waypoint/shared';
import { apiAssetUrl } from './api-asset';
import { placeLabelOf, type PlaceLabels } from './place-label';

export interface DayShot {
  url: string;
  of: string;
  credit: string;
  /** The delivered value behind the picture, for the viewer the shot opens: it carries the
   *  mime type and the picture's own dimensions, so the frame is this picture's box from the
   *  first frame — nothing to letterbox and nothing to settle (ADR-0167 §10.2). Found by URL
   *  rather than returned by `dayPhoto`, which answers with the reader's contract shape. */
  image: DeliveredImageValue;
}

export function dayShot(
  dayEvents: TripEvent[],
  places: Place[],
  placeLabels: PlaceLabels,
  enrichments: TripEnrichments,
): DayShot | undefined {
  const byId = new Map<string, DayPhotoPlace & { name: string }>(
    places.map((place) => [
      place.id,
      {
        id: place.id,
        name: place.name,
        nickname: place.nickname,
        icon: place.icon,
        userRatingsTotal: place.userRatingsTotal,
      },
    ]),
  );
  const photo = dayPhoto(
    dayEvents.map((event) => ({
      placeId: event.placeId,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      // A booking behind the row is the "somebody committed to this" half of the rank; the
      // other half is `kind`, and both are read off the event the app already holds.
      bookingId: event.bookingId,
      kind: event.kind,
      title: event.title,
    })),
    byId,
    enrichments,
    (place) => placeLabelOf(placeLabels, place.id, byId.get(place.id)?.name),
  );
  if (!photo) return undefined;
  const image = Object.values(enrichments).find((fields) => fields.image?.url === photo.url)?.image;
  return image && { ...photo, url: apiAssetUrl(photo.url), image };
}

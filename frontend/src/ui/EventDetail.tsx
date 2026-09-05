// **An event's READ surface** (ADR-0174 §4) — `BookingDetail`'s peer, and literally so: both
// render `DetailSheet`, the shell extracted for exactly this. What is left here is the part
// that genuinely differs, which is the facts.
//
// **Why an event needed one at all.** A booking has had a read since ADR-0053. An event had
// none: in Trip mode the day card expands and that expansion IS the read, but in **Plan
// mode** the row's tap opened `EventForm` — so the only way to read an event was to open its
// editor and scroll past a category grid, a title field, an icon picker, a when field and a
// place picker, on a form ADR-0155 measures at ~1565px against ~675px of visible phone. And
// on a **read-only archived trip** the row was a `<div>` rather than a `<button>`, so a
// finished trip's events could not be opened at all — the mode whose whole job is being a
// browsable archive (ADR-0040) was the one where nothing opened.
//
// **A BOOKED event never reaches this file.** A linked booking and event are ONE context
// (ADR-0172 §1), so a booked event's read already exists and is `BookingDetail`; the Plan row
// routes there instead. That is what made §4 half-built rather than new, and it is why this
// surface carries no confirmation code, no provider and no round-trip fact — an event that
// has those has a booking, and the booking's own sheet says them better.
import type { DeliveredImageValue, TripEvent } from '@waypoint/shared';
import { EVENT_KIND, placeCredit } from '@waypoint/shared';
import { useState } from 'react';
import { useTrip } from '../state/trip-state';
import { useShowPlaceOnMap } from '../state/map-scope-state';
import {
  eventMapPlace,
  eventPlaceId,
  eventShowOnMap,
  eventZones,
  mapsDirectionsUrl,
  placeName,
} from '../lib/places';
import type { ZoneContext } from '../lib/places';
import { formatDayDate, formatDayTime, formatTime } from '../lib/time';
import { apiAssetUrl } from '../lib/api-asset';
import { placeSummary } from '../lib/place-summary';
import { DetailSheet } from './DetailSheet';
import { KNOWLEDGE_DENSITY, PlaceKnowledge } from './domain/PlaceKnowledge';
import { MediaViewer } from './MediaViewer';
import { Fact, LocationFact } from './BookingDetail';
import { EventTitle } from './EventTitle';
import { t } from '../i18n/he';

export function EventDetail({
  event,
  zoneCtx,
  onClose,
  onEdit,
}: {
  event: TripEvent;
  /** The day's zone resolution (ADR-0107) — each end renders in its OWN zone, exactly as the
   *  row above it does, so the read cannot state a different time than the row it opened. */
  zoneCtx?: ZoneContext;
  onClose: () => void;
  /** Absent on a read-only archive — see `DetailSheet`. */
  onEdit?: () => void;
}) {
  const { trip, bookings, places, enrichments } = useTrip();
  const showPlaceOnMap = useShowPlaceOnMap();
  const zones = zoneCtx ? eventZones(event, zoneCtx) : undefined;
  const startZone = zones?.startZone ?? trip.timezone;
  const endZone = zones?.endZone ?? trip.timezone;

  // The place through the authority rule, resolved once — `eventMapPlace` answers with the
  // `Place` itself, so the address, the directions URL and the map hand-off all read the
  // same row rather than three lookups that could disagree.
  const place = eventMapPlace(event, bookings, places);

  /**
   * **What the world knows about this event's place** (ADR-0219 §6) — the picture, three clamped
   * lines and `עוד בגוגל`, one tap from the day's row.
   *
   * **Resolved through `eventPlaceId` rather than through `place` above**, which is the same
   * authority rule minus the coordinate gate: `eventMapPlace` answers `undefined` for a coordless
   * Place-lite (ADR-0147) because there is nowhere on the map to send you — and a place we know
   * nothing about *where* is still a place we may know a great deal about *what*. Gating the
   * knowledge on coordinates would hide a summary for a reason that has nothing to do with it.
   *
   * **No picked-icon rule here.** ADR-0167 §2 is about the 40px badge, where a photo would
   * overwrite a human's choice; this is the surface that choice leaves the photograph one tap
   * away on, so the read shows it regardless.
   */
  const knowledgePlaceId = eventPlaceId(
    event,
    event.bookingId ? bookings.find((b) => b.id === event.bookingId) : undefined,
  );
  const enrichment = knowledgePlaceId ? enrichments[knowledgePlaceId] : undefined;
  /** The full picture, one level below the read — the same viewer the Map's hero opens
   *  (ADR-0167 §10), owned here because the viewer is a portal. */
  const [fullPicture, setFullPicture] = useState<DeliveredImageValue | null>(null);

  // The sheet closes BEFORE the tab changes underneath it — otherwise the Map arrives behind
  // a sheet still on the back stack (ADR-0090). `BookingDetail` does the same.
  const show =
    showPlaceOnMap &&
    ((id: string) => {
      onClose();
      showPlaceOnMap(id);
    });

  return (
    <>
      <DetailSheet
        ariaLabel={event.title}
        badge={event.icon}
        // The stored title may BE a route, so it goes out through the same component the row
        // uses rather than as raw text.
        title={<EventTitle event={event} bookings={bookings} places={places} />}
        subtitle={event.kind === EVENT_KIND.HARD ? t.event.hard : t.event.soft}
        hard={event.kind === EVENT_KIND.HARD}
        host={{ kind: 'event', id: event.id, name: event.title }}
        onEdit={onEdit}
        onClose={onClose}
        knowledge={
          /* **The read gets the place's knowledge** (ADR-0219 §6). `PlaceKnowledge` answers both
           absences itself — a place with an image and no summary shows the picture and the
           link, and one with neither renders nothing at all, which is the majority case
           (ADR-0166 §11.3). `DECIDING` is the density with no way to expand, which is right
           here: this sheet has nothing to expand INTO. */
          <span className="wp-read-know">
            <PlaceKnowledge
              density={KNOWLEDGE_DENSITY.DECIDING}
              image={enrichment?.image}
              summary={placeSummary(enrichment)}
              onFullPicture={() => enrichment?.image && setFullPicture(enrichment.image)}
            />
          </span>
        }
        facts={
          <>
            {/* A single-place host ALWAYS states its location, including when it has none —
              the same rule `BookingDetail` follows, and for the reason recorded there: a
              row gated on having something to show meant no surface anywhere said a thing
              was placeless, which cost a false bug report. */}
            <LocationFact
              text={place?.address ?? place?.name}
              dirUrl={mapsDirectionsUrl(place)}
              onShowOnMap={eventShowOnMap(event, bookings, places, show)}
            />
            <Fact
              k={t.index.detail.timing}
              v={
                event.startsAt
                  ? // The end goes THROUGH `formatDayTime` rather than onto its result: the
                    // dash between two hand-concatenated clocks is what rendered the window
                    // backwards here (`19:30–18:30`).
                    formatDayTime(
                      event.startsAt,
                      startZone,
                      event.endsAt && formatTime(event.endsAt, endZone),
                    )
                  : formatDayDate(event.date)
              }
            />
          </>
        }
      />
      {/* **Full screen is the photograph's most prominent display**, so it carries the credit as
          its caption (ADR-0167 §4/§10). The same viewer `Map.tsx` opens from the same hero. */}
      {fullPicture && (
        <MediaViewer
          title={placeName(places, knowledgePlaceId) ?? event.title}
          mimeType={fullPicture.mimeType}
          source={{ kind: 'url', url: apiAssetUrl(fullPicture.url) }}
          caption={placeCredit(fullPicture)}
          /* The delivered image carries its own dimensions, so the viewer's frame is this
             picture's box from the first frame — nothing to letterbox and nothing to settle. */
          intrinsic={fullPicture}
          onClose={() => setFullPicture(null)}
        />
      )}
    </>
  );
}

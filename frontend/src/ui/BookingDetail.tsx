// Booking detail view (ADR-0053) — tapping a booking opens this read-only sheet
// of facts with a single visible "✏️ עריכה" button. The read-only view is the
// guard for a hard commitment (ADR-0011); editing is a deliberate tap. Edit
// opens the merged BookingSheet. Delete lives on the row's "⋯" (BookingManageSheet),
// not here — the detail carries edit only (ADR-0053 revision, 2026-07-17).
import { useState } from 'react';
import { BOOKING_TYPE, type Booking, type BookingType } from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
import { Sheet } from './Sheet';
import { RouteLabel } from './RouteLabel';
import {
  bookingMapPlace,
  bookingPlaceId,
  bookingShowOnMap,
  mapsDirectionsUrl,
  placeName,
} from '../lib/places';
import { AddLocationButton } from './primitives/PlacePicker';
import { useShowPlaceOnMap, useStartPlaceErrand } from '../state/map-scope-state';
import { routeTitle } from '../lib/route-title';
import { formatTime } from '../lib/time';
import { bookingDurationUnit, formatBookingDuration, timingLabels } from '../lib/booking-timing';
import { badgeClassForBookingType } from '../lib/transitions';
import { BOOKING_TYPE_ICON, CODE_PREFIX } from '../constants';
import { t } from '../i18n/he';

interface Wifi {
  network?: string;
  password?: string;
}

const isTransport = (ty: BookingType) => ty === BOOKING_TYPE.FLIGHT || ty === BOOKING_TYPE.TRAIN;

// Displayed text is always the Hebrew UI locale, independent of the device
// locale (which drives native date inputs, not app-rendered text).
export function dayTime(iso: string, timeZone: string): string {
  const day = new Intl.DateTimeFormat('he-IL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone,
  }).format(new Date(iso));
  return `${day} · ${formatTime(iso, timeZone)}`;
}

export function BookingDetail({
  booking,
  onClose,
  onEdit,
}: {
  booking: Booking;
  onClose: () => void;
  onEdit: (booking: Booking) => void;
}) {
  const { trip, events, places, indexVerbs } = useTrip();
  const showPlaceOnMap = useShowPlaceOnMap();
  const linkedEvent = events.find((e) => e.bookingId === booking.id);

  const tz = trip.timezone;
  const icon = linkedEvent?.icon ?? BOOKING_TYPE_ICON[booking.type];
  // Shared booking grammar (ADR-0059 §3): badge tinted by category.
  const badgeTint = badgeClassForBookingType(booking.type);
  const wifi = booking.details?.wifi as Wifi | undefined;
  const room = booking.details?.room as string | undefined;
  const notes = booking.details?.notes as string | undefined;
  const from = placeName(places, booking.fromPlaceId);
  const to = placeName(places, booking.toPlaceId);
  const startsAt = linkedEvent?.startsAt;
  const endsAt = linkedEvent?.endsAt;
  const labels = timingLabels(booking.type);
  // Duration read-out, phrased per the booking type (hours / nights / days) — the
  // same shared formatter the Index row uses (ADR-0063 extension), keyed on the
  // type not the icon-overridable event category.
  const duration = linkedEvent
    ? formatBookingDuration(linkedEvent, tz, bookingDurationUnit(booking.type))
    : null;

  // Location detail (ADR-0109 amendment): the booking's resolved place (transport
  // → origin, else the single place) shown as a fact like the rest, with navigate
  // (directions) + מפה (view) links. Links are absent for a coordless Place-lite.
  const navPlace = places.find((p) => p.id === bookingPlaceId(booking));
  const dirUrl = mapsDirectionsUrl(navPlace);
  // `מפה` shows the place on OUR map now (ADR-0121 §8) — the Map tab, focused on it
  // — rather than deep-linking to Google's place view, which existed only because
  // there was no map of ours to focus. `ניווט` stays the Google action.
  const mapPlace = bookingMapPlace(booking, places);
  const locationText = navPlace?.address ?? navPlace?.name;
  // A single-place booking ALWAYS states its location, including when it has none.
  // This row used to be gated on having something to show and so it simply did not
  // render, which meant no surface anywhere said a booking was placeless — it cost
  // a false bug report (a two-night hotel "missing from the map" was a hotel with no
  // place). Transport keeps the old gate: its places are the route endpoints, which
  // `routeRequired` already refuses to save without.
  const showLocation = isTransport(booking.type) ? !!locationText : true;
  // `＋ מיקום` is the same affordance the Map row gives a coordless Place-lite, on
  // the surface where you notice the absence — so the fix is one tap from here
  // (ADR-0110 §1's enrich flow, reused rather than reinvented).
  // ＋ מיקום IS AN ERRAND TO THE MAP NOW (ADR-0134 §1), not a picker sheet over this one.
  // A place is disambiguated BY PLACE — two cafés with the same name in the same district
  // are one list row apart and a kilometre apart on the canvas — and the map's own search
  // answers both corpora, filtering the trip's places from the first character, free and
  // offline. This booking already exists, so there is no draft to carry: the Map patches it
  // directly and the return is purely navigational (§2's cheap path).
  //
  // `null` outside the trip shell, where there is no Map tab to route to — the affordance
  // is then simply absent, which is the same "absent, not broken" rule `onShowOnMap`
  // follows two lines below.
  const startErrand = useStartPlaceErrand();
  // The banner names the target the way the rest of the app names it (ADR-0121 §8's
  // vocabulary): the booking's own title, or the route for a transport leg.
  const errandLabel = isTransport(booking.type)
    ? routeTitle(from ?? '-', to ?? '-')
    : booking.title;

  const isRoute = isTransport(booking.type) && !!(from || to);
  // Accessible name only — the visible heading is the RouteLabel below, whose arrow
  // is an SVG. A screen reader gets the textual separator, with the FULL names: the
  // detail is the record (ADR-0059 §3 session-95 amendment).
  const heading = isRoute ? routeTitle(from ?? '-', to ?? '-') : booking.title;

  const edit = () => {
    onEdit(booking);
  };

  // The detail is a Modal sheet, so it closes BEFORE the tab changes underneath it
  // — otherwise the Map arrives behind a sheet still on the back stack (ADR-0090).
  const show =
    showPlaceOnMap &&
    ((placeId: string) => {
      onClose();
      showPlaceOnMap(placeId);
    });

  return (
    <Sheet ariaLabel={heading} onClose={onClose}>
      <div className="bk-detail">
        <div className="bk-actions">
          <button type="button" className="bk-edit" onClick={edit}>
            <span aria-hidden="true">✏️</span> {t.index.detail.edit}
          </button>
        </div>

        <div className="bk-head">
          <div className={'bk-badge' + (badgeTint ? ` ${badgeTint}` : '')}>{icon}</div>
          <div className="bk-headtext">
            <div className="bk-title">{isRoute ? <RouteLabel from={from} to={to} /> : heading}</div>
            <div className="bk-type">{t.index.bookingType[booking.type]}</div>
          </div>
        </div>

        {linkedEvent?.kind === 'hard' && (
          <div className="bs-hard-note">🔒 {t.index.detail.hardNote}</div>
        )}
        <div className="bk-facts">
          {showLocation && (
            <LocationFact
              text={locationText}
              dirUrl={dirUrl}
              onShowOnMap={bookingShowOnMap(booking, places, show)}
              // Offered whenever there is no place to focus: none at all, or a
              // coordless Place-lite the picker can enrich in place.
              onAddLocation={
                mapPlace || !startErrand
                  ? undefined
                  : () =>
                      startErrand({
                        target: { kind: 'booking', id: booking.id, field: 'placeId' },
                        label: errandLabel,
                      })
              }
            />
          )}
          {!linkedEvent ? (
            <Fact k={t.index.detail.timing} v={t.index.detail.unscheduled} />
          ) : endsAt ? (
            <>
              <Fact k={labels.start} v={startsAt ? dayTime(startsAt, tz) : '-'} />
              <Fact k={labels.end} v={dayTime(endsAt, tz)} />
            </>
          ) : (
            <Fact
              k={startsAt ? labels.start : t.index.detail.timing}
              v={startsAt ? dayTime(startsAt, tz) : linkedEvent.date}
            />
          )}
          {duration && <Fact k={t.index.detail.duration} v={duration} />}
          {booking.confirmationCode && (
            <Fact k={t.index.detail.code} v={`${CODE_PREFIX}${booking.confirmationCode}`} mono />
          )}
          {booking.provider && <Fact k={t.index.detail.provider} v={booking.provider} />}
          {room && <Fact k={t.index.detail.room} v={room} />}
          {(wifi?.network || wifi?.password) && (
            <Fact
              k={t.index.detail.wifi}
              v={[wifi.network, wifi.password].filter(Boolean).join(' · ')}
              mono
            />
          )}
          {notes && <Fact k={t.index.detail.notes} v={notes} />}
        </div>
      </div>
    </Sheet>
  );
}

// The location fact: the place name/address as the value, plus the two teal
// location links (navigate = directions, מפה = view). A link renders only when its
// URL exists — a coordless Place-lite shows the text with no links.
//
// With no place at all the value says so in words rather than the row disappearing,
// and `＋ מיקום` is the way out. Both no-place states therefore read the same way:
// the fact is present, it states what it knows, and it offers the fix.
function LocationFact({
  text,
  dirUrl,
  onShowOnMap,
  onAddLocation,
}: {
  /** The place's address or name; absent when the booking has no place. */
  text?: string;
  dirUrl: string | null;
  /** Show it on our map — absent when the place has no coordinates to focus. */
  onShowOnMap?: () => void;
  /** Pick a place for this booking — present exactly when `מפה` is not. */
  onAddLocation?: () => void;
}) {
  return (
    <div className="bk-fact">
      <span className="bk-fact-k">{t.index.detail.location}</span>
      <span className="bk-fact-v bk-loc">
        <span className={text ? undefined : 'bk-loc-none'}>
          {text ?? t.index.detail.noLocation}
        </span>
        {(dirUrl || onShowOnMap || onAddLocation) && (
          <span className="bk-loc-links">
            {dirUrl && (
              <a className="bk-loc-link" href={dirUrl} target="_blank" rel="noopener noreferrer">
                {t.actions.navigate}
              </a>
            )}
            {/* A button, not a link: the destination is a tab and a selection now,
                not a URL (ADR-0121 §8). */}
            {onShowOnMap && (
              <button type="button" className="bk-loc-link" onClick={onShowOnMap}>
                {t.actions.showOnMap}
              </button>
            )}
            {onAddLocation && <AddLocationButton onClick={onAddLocation} />}
          </span>
        )}
      </span>
    </div>
  );
}

function Fact({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="bk-fact">
      <span className="bk-fact-k">{k}</span>
      <span className={'bk-fact-v' + (mono ? ' mono' : '')} dir={mono ? 'ltr' : undefined}>
        {v}
      </span>
    </div>
  );
}

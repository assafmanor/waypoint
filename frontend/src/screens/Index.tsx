// Index tab — a landing with two peer tiles (ADR-0098): bookings and documents
// (ADR-0047/0049) each push their own dedicated full screen instead of sharing
// one long page. The sub-screens are LOCAL VIEW STATE here, not routes — Index
// already renders inside the one TripProvider the trip Shell mounts, and a
// route would remount it for no reason (ADR-0098 §5). Back-to-landing is each
// sub-view's own `useOverlay` registration, not this component's concern.
// Content is identical in Plan/Trip mode (ADR-0049) — mode only tints chrome.
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTrip } from '../state/trip-state';
import { useClock } from '../lib/useClock';
import { splitBookings, scheduleLabel } from '../lib/index-bookings';
import { groupDocuments } from '../lib/documents';
import { BookingTitle } from '../ui/BookingTitle';
import { IndexBookingsView } from '../ui/IndexBookingsView';
import { IndexDocumentsView } from '../ui/IndexDocumentsView';
import { IndexTile } from '../ui/domain';
import { Icon } from '../ui/Icon';
import { ICONS } from '../constants';
import { t } from '../i18n/he';

type IndexView = 'landing' | 'bookings' | 'documents';

export function Index() {
  const { trip, bookings, places, events, documents } = useTrip();
  const now = useClock();
  const [view, setView] = useState<IndexView>('landing');
  // Set alongside `view` by the ?booking= deep-link below, and handed to a
  // freshly-mounted IndexBookingsView so it opens that booking's detail. A
  // manual tile tap clears it first, so re-entering the bookings screen later
  // doesn't reopen a stale detail from an earlier deep link.
  const [pendingBookingId, setPendingBookingId] = useState<string | undefined>();

  // Home's quick-access deep-links (ADR-0050): ?booking=<id> opens the bookings
  // screen with that booking's detail on top; ?focus=docs opens the documents
  // screen directly (there's no longer a section on this page to scroll to).
  // The params are cleared after so back/reload don't re-trigger.
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const id = params.get('booking');
    const focus = params.get('focus');
    if (!id && !focus) return;
    if (id) {
      setPendingBookingId(id);
      setView('bookings');
    }
    if (focus === 'docs') {
      setView('documents');
    }
    const next = new URLSearchParams(params);
    next.delete('booking');
    next.delete('focus');
    setParams(next, { replace: true });
  }, [params, setParams]);

  const openBookings = () => {
    setPendingBookingId(undefined);
    setView('bookings');
  };
  const backToLanding = () => setView('landing');

  if (view === 'bookings') {
    return (
      <div className="index">
        <IndexBookingsView onClose={backToLanding} initialBookingId={pendingBookingId} />
      </div>
    );
  }
  if (view === 'documents') {
    return (
      <div className="index">
        <IndexDocumentsView onClose={backToLanding} />
      </div>
    );
  }

  const { upcoming, past } = splitBookings(bookings, events, trip.timezone, now.getTime());
  const next = upcoming[0];
  const bookingsSubtitle = next ? (
    <>
      🔗 {t.index.tile.nextPrefix} <BookingTitle booking={next.booking} places={places} />
      {next.event && <> · {scheduleLabel(next.event, next.booking, trip, now)}</>}
      {past.length > 0 && <> · {t.index.tile.pastCount(past.length)}</>}
    </>
  ) : (
    t.index.tile.emptyBookings
  );

  const docGroups = groupDocuments(documents);
  const documentsSubtitle =
    docGroups.length > 0 ? (
      <>🔒 {docGroups.map((g) => t.docs.group[g.type]).join(' · ')}</>
    ) : (
      t.index.tile.emptyDocuments
    );

  return (
    <div className="index">
      {/* Offline status is a page-level fact — shown once, on the landing. */}
      <div className="index-status">
        <span className="badge-offline">
          <Icon name="download" /> {t.index.offlineBadge}
        </span>
      </div>

      <IndexTile
        icon={ICONS.ticket}
        title={t.index.bookingsTitle}
        count={bookings.length}
        subtitle={bookingsSubtitle}
        onOpen={openBookings}
      />
      <IndexTile
        icon={ICONS.documents}
        title={t.docs.title}
        count={documents.length}
        subtitle={documentsSubtitle}
        onOpen={() => setView('documents')}
      />
    </div>
  );
}

// Index tab — a landing with four peer tiles (ADR-0098/0152, tasks brief §11): bookings,
// tasks, documents and notes
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
import { noteTitleText, sortNotes } from '../lib/notes';
import { taskDue, taskPreview, type TaskClock } from '../lib/tasks';
import { useAutomaticTasks } from '../lib/useAutomaticTasks';
import { BookingTitle } from '../ui/BookingTitle';
import { IndexBookingsView } from '../ui/IndexBookingsView';
import { IndexDocumentsView } from '../ui/IndexDocumentsView';
import { IndexNotesView } from '../ui/IndexNotesView';
import { IndexTasksView } from '../ui/IndexTasksView';
import { IndexTile } from '../ui/domain';
import { Icon } from '../ui/Icon';
import { BOOKING_PARAM, DOCUMENT_PARAM, FOCUS_PARAM, INDEX_FOCUS } from '../state/nav-state';
import { t } from '../i18n/he';

type IndexView = 'landing' | 'bookings' | 'documents' | 'notes' | 'tasks';

export function Index() {
  const { trip, bookings, places, events, documents, notes, tasks, users, zoneCrossings } =
    useTrip();
  const now = useClock();
  const { automatic } = useAutomaticTasks();
  const [view, setView] = useState<IndexView>('landing');
  // Set alongside `view` by the ?booking= deep-link below, and handed to a
  // freshly-mounted IndexBookingsView so it opens that booking's detail. A
  // manual tile tap clears it first, so re-entering the bookings screen later
  // doesn't reopen a stale detail from an earlier deep link.
  const [pendingBookingId, setPendingBookingId] = useState<string | undefined>();
  /** The same shape one kind over: `?doc=<id>` opens the documents screen with that document
   *  open, which is where a note about it sends you (ADR-0153 §8's way-in amendment). */
  const [pendingDocumentId, setPendingDocumentId] = useState<string | undefined>();

  // Home's quick-access deep-links (ADR-0050): ?booking=<id> opens the bookings
  // screen with that booking's detail on top; ?focus=docs opens the documents
  // screen directly (there's no longer a section on this page to scroll to).
  // The params are cleared after so back/reload don't re-trigger.
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const id = params.get(BOOKING_PARAM);
    const docId = params.get(DOCUMENT_PARAM);
    const focus = params.get(FOCUS_PARAM);
    if (!id && !docId && !focus) return;
    if (id) {
      setPendingBookingId(id);
      setView('bookings');
    }
    if (docId) {
      setPendingDocumentId(docId);
      setView('documents');
    }
    if (focus === INDEX_FOCUS.DOCS) {
      setView('documents');
    }
    // The Trip Home band's rows and its overflow row both land here (ADR-0188 §6) — the
    // band is a band, so the list it is a window onto is where a task actually lives.
    if (focus === INDEX_FOCUS.TASKS) {
      setView('tasks');
    }
    // …and MOUNTING the bookings screen is itself a destination (session 172): a booking
    // errand returns here so the screen can take the pending answer and re-open its form.
    // No id — the answer says which booking, and what was typed.
    if (focus === INDEX_FOCUS.BOOKINGS) {
      setPendingBookingId(undefined);
      setView('bookings');
    }
    const next = new URLSearchParams(params);
    next.delete(BOOKING_PARAM);
    next.delete(DOCUMENT_PARAM);
    next.delete(FOCUS_PARAM);
    setParams(next, { replace: true });
  }, [params, setParams]);

  const openBookings = () => {
    setPendingBookingId(undefined);
    setView('bookings');
  };
  const openDocuments = () => {
    setPendingDocumentId(undefined);
    setView('documents');
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
        <IndexDocumentsView onClose={backToLanding} initialDocumentId={pendingDocumentId} />
      </div>
    );
  }
  if (view === 'notes') {
    return (
      <div className="index">
        <IndexNotesView onClose={backToLanding} />
      </div>
    );
  }
  if (view === 'tasks') {
    // The passport check's verb lands on this screen's own sibling rather than on Home
    // (ADR-0190 §3), so the Index hands the way in.
    return (
      <div className="index">
        <IndexTasksView onClose={backToLanding} onOpenDocuments={openDocuments} />
      </div>
    );
  }

  const { upcoming, past } = splitBookings(bookings, events, trip.timezone, now.getTime());
  const next = upcoming[0];
  const bookingsSubtitle = next ? (
    <>
      <Icon name="link" /> {t.index.tile.nextPrefix}{' '}
      <BookingTitle booking={next.booking} places={places} />
      {next.event && <> · {scheduleLabel(next.event, next.booking, trip, now)}</>}
      {past.length > 0 && <> · {t.index.tile.pastCount(past.length)}</>}
    </>
  ) : (
    t.index.tile.emptyBookings
  );

  const docGroups = groupDocuments(documents);
  const documentsSubtitle =
    docGroups.length > 0 ? (
      <>
        <Icon name="lock" /> {docGroups.map((g) => t.docs.group[g.type]).join(' · ')}
      </>
    ) : (
      t.index.tile.emptyDocuments
    );

  // A note collection has no "next" and no type groups, but it has a NEWEST — and that is
  // the only line on this tile that changes and is worth a glance (ADR-0153 §1). The author
  // is part of it because the real question is "what did someone just write that I have not
  // read". Rejected: a count split (a number that barely moves) and the categories present
  // (which duplicates the chip row one screen inside).
  const latestNote = sortNotes(notes)[0];
  const latestAuthor = latestNote
    ? (users.find((u) => u.id === latestNote.createdBy)?.displayName ?? '')
    : '';
  const notesSubtitle = latestNote
    ? t.notes.tile.latest(latestAuthor, noteTitleText(latestNote))
    : t.notes.tile.empty;

  // **The next thing due, with an overdue count when there is one** (brief §13). A task
  // collection has no "newest" worth a glance the way notes do and no type groups the way
  // documents do — what it has is a deadline that is about to bite, which is also the only
  // line here that moves on its own. Rejected: a raw open-count, which barely changes.
  const clock: TaskClock = {
    nowMs: now.getTime(),
    crossings: zoneCrossings,
    primaryZone: trip.timezone,
  };
  // The readiness checks count toward the tile (owner, 2026-08-16, amending ADR-0190 §1):
  // a trip nobody has prepared has five things to do, and the tile is what says so.
  const preview = taskPreview(tasks, automatic, clock);
  const nextDue = preview.next ? taskDue(preview.next, clock) : undefined;
  const tasksSubtitle = preview.next ? (
    <>
      <Icon name="clock" />{' '}
      {t.tasks.tile.next(
        nextDue?.time
          ? `${preview.next.title} · ${nextDue.day} ${nextDue.time}`
          : preview.next.title,
      )}
      {preview.overdue > 0 && <> · {t.tasks.tile.overdue(preview.overdue)}</>}
    </>
  ) : (
    t.tasks.tile.empty
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
        icon={<Icon name="ticket" />}
        title={t.index.bookingsTitle}
        count={bookings.length}
        subtitle={bookingsSubtitle}
        onOpen={openBookings}
      />
      {/* Second, and the order below it is one rule: AFTER the spine, tiles run by whether
          they can be LATE (owner, 2026-08-15). A task expires and a missed one costs the
          thing it was guarding (brief §11); a document does not change; a note never expires
          at all. Bookings keeps the lead it has held since ADR-0047/0049 — it is the trip's
          spine and the most-consulted tile on the ground, and a task's prominence is already
          paid for by the Home bands (phases 2–3) rather than owed by this landing. */}
      <IndexTile
        icon={<Icon name="check" />}
        title={t.tasks.title}
        count={preview.open}
        subtitle={tasksSubtitle}
        onOpen={() => setView('tasks')}
      />
      <IndexTile
        icon={<Icon name="documents" />}
        title={t.docs.title}
        count={documents.length}
        subtitle={documentsSubtitle}
        onOpen={openDocuments}
      />
      {/* The tile ADR-0098 measured its landing at five for, discharging the deferred
          content type and its `מחקר` naming debt — by not spending the word. */}
      <IndexTile
        icon={<Icon name="clipboard" />}
        title={t.notes.title}
        count={notes.length}
        subtitle={notesSubtitle}
        onOpen={() => setView('notes')}
      />
    </div>
  );
}

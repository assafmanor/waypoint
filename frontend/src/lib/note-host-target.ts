// **Where a note's host lives** (ADR-0153 §8's way-in amendment). One table, five kinds, and
// it is a pure function so the destination is testable without a router.
//
// The owner's report was that a note names its host and goes nowhere. Answering it needed a
// fact the app had never had to state: **which surface IS an event / a booking / a document /
// an idea / a place**, given that none of the five is a route. Four of them are view state
// inside a screen, reachable only by mounting that screen and handing it an id.
//
// That mechanism is not new — `Index.tsx` has held `pendingBookingId` since ADR-0050's quick
// access, taking `?booking=<id>` and handing it to a freshly mounted subview. What is new here
// is that the same shape now serves five kinds from ONE place, rather than each caller
// remembering which param its destination reads.
//
// **A place is the exception, and deliberately so:** the Map is a real tab with a focus
// channel of its own (`useShowPlaceOnMap`), so it takes that rather than a param — which is
// why this function answers `null` for a place and the hook above it routes that case.
import {
  BOOKING_PARAM,
  DAY_PARAM,
  DOCUMENT_PARAM,
  EVENT_PARAM,
  IDEA_PARAM,
  TAB_PARAM,
} from '../state/nav-state';
import type { NoteHostRef } from './notes';

/** A day-scoped destination needs `?day=`, except when it is already today — the same rule
 *  `daySelectTarget` follows, so a URL never carries a day it did not need to. */
const dayQuery = (date: string | undefined, today: string): string =>
  date && date !== today ? `&${DAY_PARAM}=${date}` : '';

/**
 * The path that opens this host, or `null` when there is nowhere to send anyone:
 *
 * - a **place**, whose way in is the Map's focus channel rather than a URL (the caller
 *   handles it);
 * - an **idea with no day** ("someday"), which lives in the pool rather than on a day — the
 *   shelf can be reached, but not the one tile, so the affordance is absent rather than
 *   approximate;
 * - a host that is not in the trip any more, which the caller will not have resolved anyway.
 *
 * `null` is not a failure case: it is the "absent, not broken" rule this app runs for every
 * affordance with nowhere to go, and the way in simply does not render.
 */
export function noteHostTarget(host: NoteHostRef, today: string): string | null {
  switch (host.kind) {
    // The Index's two subviews, each already able to open one row on arrival.
    case 'booking':
      return `/?${TAB_PARAM}=index&${BOOKING_PARAM}=${host.id}`;
    case 'document':
      return `/?${TAB_PARAM}=index&${DOCUMENT_PARAM}=${host.id}`;
    // The two day-scoped hosts: the day comes first, because you cannot open a card without
    // being on its day, and the id opens the one card once the day is on screen.
    case 'event':
      return `/?${TAB_PARAM}=days${dayQuery(host.date, today)}&${EVENT_PARAM}=${host.id}`;
    case 'maybeItem':
      return host.date
        ? `/?${TAB_PARAM}=days${dayQuery(host.date, today)}&${IDEA_PARAM}=${host.id}`
        : null;
    case 'place':
      return null;
  }
}

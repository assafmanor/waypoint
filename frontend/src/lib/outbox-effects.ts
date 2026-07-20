// Offline optimistic sync — one path for derived entities (ADR-0093).
//
// Some writes make the server materialize MORE than their own row: saving a
// timed booking also creates/updates a linked itinerary event (ADR-0047 §1).
// Online, the client learns of that derived entity from the WS echo and applies
// it through the generic change-appliers (`applyChangeToCache` + the in-memory
// `applyEntityChange`). Offline there is no echo, so the write verb emits the
// SAME `Change` the server would and runs it through the SAME appliers — no
// bespoke per-entity offline handler, no parallel reducer action or cache helper.
//
// This module is the ONE place a write's derived entities are declared. Adding a
// future derived entity (a booking's document, say) means one more entry here,
// applied through the appliers everything else already uses.
import type { Booking, BookingEventSeed, Change } from '@waypoint/shared';
import { bookingEventFields } from '@waypoint/shared';
import { eventFromBookingSeed } from './booking-edit';

/** The linked itinerary event change a booking write implies (ADR-0093), as
 *  a `Change` for the generic appliers (`applyChangeToCache` + the in-memory
 *  `applyEntityChange`). On `create` the event is materialized in full (matching
 *  the server's `eventDataFromBooking`); on `update` only the schedule fields the
 *  seed carries are sent (matching `eventUpdateFromSeed`), so merging preserves an
 *  existing event's status + sortOrder. The seed id is the id the server upserts
 *  under, so this reconciles in place on flush.
 *
 *  Only `entityType`/`entityId`/`action`/`after` are read by the appliers; the
 *  seq/actor/createdAt are optimistic-local placeholders (this change never enters
 *  the seq cursor or the change-feed — those stay in the WS path). */
export function bookingLinkedEventChange(
  booking: Pick<Booking, 'id' | 'tripId' | 'title' | 'type'>,
  seed: BookingEventSeed & { id: string },
  ctx: { actorUserId: string; nowIso: string },
  mode: 'create' | 'update',
): Change {
  const after =
    mode === 'create'
      ? eventFromBookingSeed(booking, seed, { updatedBy: ctx.actorUserId, nowIso: ctx.nowIso })
      : // Partial: no status/sortOrder/source, so a merge keeps the existing
        // event's completion state (the server's update touches neither).
        { id: seed.id, tripId: booking.tripId, ...bookingEventFields(booking, seed) };
  return {
    id: seed.id,
    seq: '',
    tripId: booking.tripId,
    actorUserId: ctx.actorUserId,
    entityType: 'event',
    entityId: seed.id,
    action: mode,
    after,
    createdAt: ctx.nowIso,
  };
}

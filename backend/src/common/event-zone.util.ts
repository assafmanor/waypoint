import { currentZone, type ZoneCrossing } from '@waypoint/shared';

/**
 * **The zone an event's time means**, and the reason it is in `common/` rather than beside
 * its first caller.
 *
 * ADR-0107 §4 resolves it in one order and only one: the event's own pinned override, else
 * the itinerary segment holding that instant (`currentZone` over the trip's zone
 * crossings), else the trip's primary zone. There is deliberately **no place-zone step** —
 * a place's cached zone reaches this through the crossings that transport builds, not as a
 * rung of its own.
 *
 * It was `notifications/kinds/event-shape.ts`'s, which was right while a notification was
 * the only thing outside the screens asking. ADR-0213's shared itinerary is the second:
 * the public page and the PDF print a wall clock, and a shared trip that prints an hour the
 * app never showed is the same bug ADR-0197 §5 called the one that gets a feature turned off
 * — one derivation away from being impossible, two copies away from being inevitable.
 */
export interface ZonedEvent {
  startsAt: Date | null;
  date: Date;
  displayTimezone: string | null;
}

export interface TripZoneContext {
  crossings: ZoneCrossing[];
  primaryZone: string;
}

export function eventDisplayZone(event: ZonedEvent, zones: TripZoneContext, atMs?: number): string {
  if (event.displayTimezone) return event.displayTimezone;
  const instant = atMs ?? event.startsAt?.getTime() ?? event.date.getTime();
  return currentZone(instant, zones.crossings, zones.primaryZone);
}

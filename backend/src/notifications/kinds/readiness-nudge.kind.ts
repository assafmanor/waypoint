// `readiness.nudge` — 10:00 local at T-14 / T-7 / T-2, naming what is still missing
// (ADR-0198 §2's phase C).
//
// ── THE ONE KIND THAT IS NOT ABOUT A ROW ──────────────────────────────────────────────────
//
// Every other kind starts from a thing somebody wrote: a deadline, an event, an assignment.
// This one is about an ABSENCE — no lodging, no passport, no plan for day 4 — so there is no
// candidate table to scan and the query has to start from `Trip`. That is affordable for the
// same reason `trip.tomorrow`'s is: a trip has exactly one start date, so "starts in 14, 7 or
// 2 days" is a tiny indexed set, and the expensive per-trip work happens only for the handful
// that came back.
//
// ── WHY IT READS THE SAME DERIVATION THE SCREEN DOES ──────────────────────────────────────
//
// `computeReadiness` moved into `packages/shared` for this kind (ADR-0197 §5's rule applied to
// a fact rather than to a clock). A nudge that disagreed with the tasks screen about whether
// lodging is covered would be worse than no nudge at all — the person opens the app, sees a
// satisfied check, and stops trusting the channel. One derivation, two readers.
//
// ── AND WHY IT IS notifyTasks RATHER THAN A THIRD SWITCH ──────────────────────────────────
//
// ADR-0190 decided that a readiness check IS a task row. So the switch that governs task
// notifications governs these too, and §6's two switches stay two. The alternative was a
// third column for a kind the user already has a control for.
import {
  computeReadiness,
  currentZone,
  NOTIFICATION_KIND,
  todayInTz,
  type CheckId,
  type DestinationRef,
} from '@waypoint/shared';
import { hourInZone, hourStartInZone } from '../send-policy';
import {
  DEDUP,
  NOTIFY_PREF,
  type DueInput,
  type DueSend,
  type NotificationKind,
} from '../notification-kind';
import { readinessNudgePayload } from '../notify-copy';
import { tripAudience } from './trip-audience';

/** The local hour. Mid-morning: late enough not to be the first thing on a phone, early
 *  enough that the day it names can still be acted on. */
export const NUDGE_HOUR = 10;

/** **Three milestones, not a countdown** (ADR-0198 §2). Two weeks to plan, one week to book,
 *  two days to pack — each far enough from the next that the same open check does not speak
 *  twice in a row. A daily version of this is a nag with a calendar. */
export const MILESTONES = [14, 7, 2] as const;

/** Four hours. The nudge is about a day, not a moment, so a tick missed at 10:00 is still
 *  worth sending at 13:00 — but not after the working day it was aimed at. */
const STALE_AFTER_MS = 4 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

export const readinessNudgeKind: NotificationKind = {
  id: NOTIFICATION_KIND.READINESS_NUDGE,
  timeCritical: false,
  staleAfterMs: STALE_AFTER_MS,
  dedup: DEDUP.BY_INSTANT,
  pref: NOTIFY_PREF.TASKS,

  async due({ prisma, nowMs, zonesFor }: DueInput): Promise<DueSend[]> {
    // Widest milestone plus a day either side: which calendar day it *is* depends on a zone
    // not yet resolved, so the SQL is generous and the day check below is exact.
    const trips = await prisma.trip.findMany({
      where: {
        startDate: {
          gte: new Date(nowMs + (Math.min(...MILESTONES) - 1) * DAY_MS),
          lte: new Date(nowMs + (Math.max(...MILESTONES) + 1) * DAY_MS),
        },
      },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        timezone: true,
        destination: true,
        destinationGooglePlaceId: true,
        destinationCountryCode: true,
      },
    });
    if (trips.length === 0) return [];

    const audience = await tripAudience(
      prisma,
      trips.map((trip) => ({ tripId: trip.id })),
      nowMs,
    );

    const sends: DueSend[] = [];
    for (const trip of trips) {
      if (!audience.isLive(trip.id)) continue;
      const zones = await zonesFor(trip.id);
      // Home, not the destination: nobody is at the destination two weeks before the trip
      // (ADR-0197 §5's pre-trip paragraph).
      const zone = currentZone(nowMs, zones.crossings, zones.primaryZone);
      if (hourInZone(nowMs, zone) !== NUDGE_HOUR) continue;

      const daysOut = milestoneFor(trip.startDate, zone, nowMs);
      if (daysOut === null) continue;

      const missing = await openChecks(prisma, trip, audience.members(trip.id));
      // **Nothing open means nothing to say.** Not "you're all set" — a send whose content is
      // congratulation is the app talking about itself.
      if (missing.length === 0) continue;

      const payload = readinessNudgePayload({ tripId: trip.id, daysOut, missing });
      for (const userId of audience.members(trip.id)) {
        sends.push({
          userId,
          tripId: trip.id,
          kind: NOTIFICATION_KIND.READINESS_NUDGE,
          // **The milestone, not the trip.** Three sends over a run-up, and keying on the
          // trip alone would let T-14's row suppress T-7's if their `fireKey` minutes ever
          // collided (they do not today, and the subject is the honest discriminator).
          subjectId: `${trip.id}:t-${daysOut}`,
          // 10:00 itself, so all sixty minutes of the hour are one claim (ADR-0197 §5).
          aimedAtMs: hourStartInZone(nowMs, zone),
          payload,
        });
      }
    }
    return sends;
  },
};

/**
 * Which milestone today is, read in the trip's own zone — or `null` for any other day.
 *
 * `startDate` is a `@db.Date`, so it is midnight UTC of the first day and must be compared as
 * a **day key** rather than as an instant.
 */
function milestoneFor(startDate: Date, zone: string, nowMs: number): number | null {
  const startKey = startDate.toISOString().slice(0, 10);
  for (const days of MILESTONES) {
    if (todayInTz(zone, new Date(nowMs + days * DAY_MS)) === startKey) return days;
  }
  return null;
}

/** The trip's still-open checks, through the shared derivation the tasks screen reads. */
async function openChecks(
  prisma: DueInput['prisma'],
  trip: {
    id: string;
    startDate: Date;
    endDate: Date;
    timezone: string;
    destination: string;
    destinationGooglePlaceId: string | null;
    destinationCountryCode: string | null;
  },
  memberIds: readonly string[],
): Promise<CheckId[]> {
  const [events, bookings, places, documents] = await Promise.all([
    prisma.event.findMany({ where: { tripId: trip.id } }),
    prisma.booking.findMany({ where: { tripId: trip.id } }),
    prisma.place.findMany({ where: { tripId: trip.id } }),
    prisma.document.findMany({ where: { tripId: trip.id }, select: { id: true, type: true } }),
  ]);

  const destination: DestinationRef = {
    name: trip.destination,
    googlePlaceId: trip.destinationGooglePlaceId ?? undefined,
    timezone: trip.timezone,
    countryCode: trip.destinationCountryCode ?? undefined,
  };

  // The shared function reads a handful of fields off each row and Prisma's shapes are
  // structurally compatible for all of them — the same conversion `loadZones` makes.
  const readiness = computeReadiness({
    startDate: trip.startDate.toISOString().slice(0, 10),
    endDate: trip.endDate.toISOString().slice(0, 10),
    destination,
    events: events as never,
    bookings: bookings as never,
    places: places as never,
    documents: documents as never,
    travelerIds: [...memberIds],
  });
  return readiness.checks.filter((check) => !check.done).map((check) => check.id);
}

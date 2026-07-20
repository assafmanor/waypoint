// Group change-feed buffer (ADR-0081, review U-09). Peer edits mutate the UI
// silently via the WS `change` stream (trip-state's applyRemoteChange); this
// module NARRATES those same changes into a bounded, attributed recent-changes
// list — it never re-applies them (the reducer/reactive lists already own that).
//
// Pure + presentational-agnostic: `describeChange` turns a `Change` into one
// attributed line (actor resolved off the roster, F-05's real author), and the
// ring-buffer helpers keep the list bounded + de-duped. The buffer itself lives
// as local state in trip-state's TripReady, so it resets on trip switch (the
// component remounts) and stays in-memory + offline-safe (no changes arrive
// offline → the feed stays quiet). The `ChangeFeed` component reads it.
import { CHANGE_ACTION, ENTITY_TYPE, type Change, type User } from '@waypoint/shared';
import { formatTime } from '../lib/time';
import { t } from '../i18n/he';

/** The last N shared mutations we keep. Bounded so a long-running session can't
 *  grow the buffer without limit (ADR-0081 "bounded memory"). */
export const CHANGE_FEED_LIMIT = 20;

/** One narrated line. `lead` is the sentence with the subject inlined but WITHOUT
 *  the trailing clock time; `time` (a moved-to `HH:MM`) renders as a separate
 *  `dir="ltr"` island so the number stays LTR inside the RTL line. */
export interface ChangeEntry {
  id: string; // change.id — dedup + dismiss key
  seq: string; // ordering / diagnostics
  actorUserId: string;
  actorName: string;
  lead: string;
  time?: string;
  at: number; // Date.parse(createdAt), for relative time
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/** The entity's human name for the line: its own title/name, else a generic
 *  noun. A membership resolves the affected member off the roster. */
function subjectOf(change: Change, users: User[]): string {
  const after = change.after ?? {};
  const before = change.before ?? {};
  const pick = (key: string) => str(after[key]) ?? str(before[key]);
  switch (change.entityType) {
    case 'event':
      return pick('title') ?? t.changeFeed.nouns.event;
    case 'booking':
      return pick('title') ?? t.changeFeed.nouns.booking;
    case 'place':
      return pick('name') ?? t.changeFeed.nouns.place;
    case 'document':
      return pick('filename') ?? pick('name') ?? t.changeFeed.nouns.document;
    case 'membership': {
      const uid = str(after.userId) ?? str(before.userId);
      const member = uid ? users.find((u) => u.id === uid) : undefined;
      return member?.displayName ?? t.changeFeed.nouns.member;
    }
    case 'trip':
      return pick('name') ?? t.changeFeed.nouns.trip;
    default:
      return t.changeFeed.nouns.item;
  }
}

/** Narrate one `Change` into an attributed line, or `null` when it shouldn't be
 *  narrated: our OWN edits (already optimistic on our screen — ADR-0081 filters
 *  them so the feed never echoes your own work back at you). Attribution is the
 *  change's real `actorUserId` resolved off the roster (F-05); an unknown actor
 *  falls back to a neutral "מישהו". Pure — no clock/DOM, so it's unit-testable. */
export function describeChange(
  change: Change,
  users: User[],
  meId: string | undefined,
  tz: string,
): ChangeEntry | null {
  if (meId && change.actorUserId === meId) return null;

  const cf = t.changeFeed;
  const actor = users.find((u) => u.id === change.actorUserId);
  const actorName = actor?.displayName ?? cf.someone;
  const subject = subjectOf(change, users);
  const startsAt = str((change.after ?? {}).startsAt);

  let lead: string;
  let time: string | undefined;
  if (change.entityType === ENTITY_TYPE.MEMBERSHIP && change.action === CHANGE_ACTION.CREATE) {
    lead = cf.joined; // "X joined the trip" — subject == actor, so omit it
  } else if (change.action === CHANGE_ACTION.DELETE) {
    lead = cf.removed(subject);
  } else if (change.action === 'create') {
    lead = cf.added(subject);
  } else if ((change.action === 'move' || change.action === 'update') && startsAt) {
    lead = cf.movedTo(subject); // "moved X to …" — the PRD 4.2 case
    time = formatTime(startsAt, tz);
  } else if (change.action === 'move') {
    lead = cf.moved(subject);
  } else {
    lead = cf.updated(subject);
  }

  return {
    id: change.id,
    seq: change.seq,
    actorUserId: change.actorUserId,
    actorName,
    lead,
    time,
    at: Date.parse(change.createdAt) || 0,
  };
}

/** Prepend newest-first, dedup by id (a WS frame + a catch-up replay can carry
 *  the same change on reconnect), and clamp to the ring limit. */
export function appendChangeEntry(
  list: ChangeEntry[],
  entry: ChangeEntry,
  limit = CHANGE_FEED_LIMIT,
): ChangeEntry[] {
  if (list.some((e) => e.id === entry.id)) return list;
  return [entry, ...list].slice(0, limit);
}

export function dismissChangeEntry(list: ChangeEntry[], id: string): ChangeEntry[] {
  return list.filter((e) => e.id !== id);
}

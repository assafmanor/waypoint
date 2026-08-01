// Notes (ADR-0152 / ADR-0153). Pure derivations over the note list — no React, no Dexie,
// no clock — so both halves of the sync path and every render surface read one answer.
import { CHANGE_ACTION, NOTE_HOST_FIELD, type EntityType, type Note } from '@waypoint/shared';

/** The `Change` fields these derivations read — the same subset `EntityChange` names in
 *  `lib/cache.ts`, so a live WS echo and an offline optimistic write both fit. */
type HostChange = { entityType: EntityType; entityId: string; action: string };

/** Is this note hosted by that entity? */
export function isHostedBy(note: Note, entityType: EntityType, entityId: string): boolean {
  const field = NOTE_HOST_FIELD[entityType as keyof typeof NOTE_HOST_FIELD];
  return field ? note[field] === entityId : false;
}

/**
 * **The sync half of the host cascade** (ADR-0152 §2), and the reason it exists is that the
 * storage half is silent: the five host FKs are `onDelete: Cascade`, so Postgres removes a
 * deleted host's notes **without writing `Change` rows**. A peer holding the trip in memory
 * or in Dexie would therefore never hear about them and would keep rendering notes whose
 * host is gone, until the next full snapshot.
 *
 * So a host's `delete` change drops the notes it hosted. One rule, registered in both places
 * a change is mirrored — the memory channels in `state/trip-state.tsx` and `CACHE_CHANNELS`
 * in `lib/cache.ts` — rather than a branch per host type: the entity type → FK lookup is
 * `NOTE_HOST_FIELD`, so a sixth note-bearing entity adds a line there and nothing here.
 *
 * Returns the SAME array reference when nothing was dropped, so the common case (every
 * change that is not a host delete) cannot cause a re-render.
 */
export function dropNotesForHostChange(notes: Note[], change: HostChange): Note[] {
  if (change.action !== CHANGE_ACTION.DELETE) return notes;
  if (!(change.entityType in NOTE_HOST_FIELD)) return notes;
  const kept = notes.filter((note) => !isHostedBy(note, change.entityType, change.entityId));
  return kept.length === notes.length ? notes : kept;
}

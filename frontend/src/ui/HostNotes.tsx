// **A host's notes, section and editor together** (ADR-0152 §6 / ADR-0153 §8): the body
// lives on the surface the host already has, and the `＋ פתק` control beside it opens the
// same editor every other entrance reaches.
//
// One connected component rather than the pair wired per host. `BookingDetail` did it inline
// first, which was right for one host; documents and ideas would have been the second and
// third copy of the same eight lines — the shape ADR-0094/0096 exist to stop. What each host
// still owns is WHERE this goes (a detail sheet, a manage sheet, a place card), which is the
// part that genuinely differs.
//
// The host is passed as a fact, never picked (ADR-0153 §5). Which FK the note is written to
// comes from `NOTE_HOST_FIELD` through `noteHostInput`, so a sixth hostable entity adds a
// line in `@waypoint/shared` and nothing here.
import { useMemo, useState } from 'react';
import type { Note } from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
import { useClock } from '../lib/useClock';
import { noteHostInput, notesForHost, type NoteHostRef } from '../lib/notes';
import { NoteSection } from './NoteSection';
import { NoteSheet } from './NoteSheet';

export function HostNotes({
  host,
  canAdd = true,
}: {
  host: NoteHostRef;
  /** Off where the surface already carries a way to write one: the host's own FORM has a
   *  composer that rides its save (ADR-0152 §6b), so a `＋ פתק` beside it would be a second
   *  add path — and the one that opens another sheet, which that section is there to avoid. */
  canAdd?: boolean;
}) {
  const { notes, users, noteVerbs } = useTrip();
  const now = useClock();
  const [editing, setEditing] = useState<Note | 'create' | null>(null);
  const hostNotes = useMemo(
    () => notesForHost(notes, host.kind, host.id),
    [notes, host.kind, host.id],
  );

  return (
    <>
      <NoteSection
        notes={hostNotes}
        users={users}
        now={now}
        onAdd={canAdd ? () => setEditing('create') : undefined}
        onEdit={setEditing}
      />
      {editing && (
        <NoteSheet
          note={editing === 'create' ? undefined : editing}
          host={host}
          onSave={(draft) => {
            const note = editing === 'create' ? null : editing;
            setEditing(null);
            if (note) void noteVerbs.updateNote(note.id, draft);
            else void noteVerbs.createNote({ ...draft, ...noteHostInput(host.kind, host.id) });
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

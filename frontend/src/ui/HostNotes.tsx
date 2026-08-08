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
import {
  noteHostInput,
  notesForContext,
  notesForHost,
  type NoteHostKind,
  type NoteHostRef,
} from '../lib/notes';
import { resolveHostContext, type HostContext } from '../lib/host-context';
import { NoteSection } from './NoteSection';
import { NoteSheet } from './NoteSheet';

/** **How many notes this one host carries**, from trip state — for the surfaces that ask
 *  about a single host rather than a listful: the delete confirms, which owe the reader the
 *  count the cascade is about to take (ADR-0152 §2). A list screen keeps
 *  `noteCountsByHost`, which answers the same question for a whole screen in one pass.
 *
 *  Here beside `HostNotes` because this module is what "a host's notes" means, and a second
 *  place deriving it is how three confirms end up disagreeing with the mark on the row. */
export function useHostNoteCount(kind: NoteHostKind, id: string | undefined): number {
  const { notes } = useTrip();
  return useMemo(() => (id ? notesForHost(notes, kind, id).length : 0), [notes, kind, id]);
}

/** **This host's context**, resolved from trip-state's one index (ADR-0172 §1). Every
 *  surface that shows or writes a note goes through here, so what a row's mark counts and
 *  what the section under it lists cannot disagree — which they did until this shipped. */
export function useHostContext(kind: NoteHostKind, id: string): HostContext {
  const { hostContexts } = useTrip();
  return useMemo(() => resolveHostContext(hostContexts, { kind, id }), [hostContexts, kind, id]);
}

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
  // Read the whole context, write to its anchor (ADR-0172 §1/§2). On a place those differ:
  // it shows its single context's notes and a new one lands on that context's booking, which
  // is what keeps the note with the original context if the place is ever reused (§4).
  const context = useHostContext(host.kind, host.id);
  const hostNotes = useMemo(() => notesForContext(notes, context), [notes, context]);

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
            else
              void noteVerbs.createNote({
                ...draft,
                ...noteHostInput(context.anchor.kind, context.anchor.id),
              });
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

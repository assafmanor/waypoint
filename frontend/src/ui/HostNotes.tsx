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
import { useMemo, useState, type ReactNode } from 'react';
import { ENTITY_TYPE, type Note } from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
import { useClock } from '../lib/useClock';
import {
  isHostedBy,
  noteHostInput,
  notesForContext,
  notesForHost,
  type NoteHostKind,
  type NoteHostRef,
} from '../lib/notes';
import { resolveHostContext, type HostContext } from '../lib/host-context';
import { NoteSection } from './NoteSection';
import { NoteSheet } from './NoteSheet';
import { NoteFullScreen } from './NoteFullScreen';

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

/** **A host as the index knows it**, not as a call site happened to spell it.
 *
 *  Five surfaces hand-built a `NoteHostRef` literal and three left `category` off — so the
 *  editor could not state an inherited category even where the row beside it was already
 *  showing one, because the row resolved through trip-state's index and the sheet took the
 *  literal. Two derivations of one fact, which is the shape rule 8 exists for. The literal
 *  now supplies only the identity; everything derived comes from `noteHosts`.
 *
 *  Falls back to what the caller passed when the index misses — a stale offline cache, or a
 *  peer's delete mid-render. On a LIST that case reads as a general note (`noteHost`'s own
 *  documented degradation); on a host's own surface the host is the thing you are looking at,
 *  so keeping its name beats blanking it. */
function useResolvedHost(host: NoteHostRef): NoteHostRef {
  const { noteHosts } = useTrip();
  return noteHosts.get(`${host.kind}:${host.id}`) ?? host;
}

/** The name of the host a surface's rows are ANCHORED to, when that is not the surface
 *  itself. `undefined` on every host that authors its own — which is every host but a place
 *  with exactly one relevant context (ADR-0172 §3).
 *
 *  Exported for `HostDocuments`, which asks the identical question about the other content
 *  type: a place displays a context's documents and can never originate one, so it says
 *  whose they are. A second copy of this hook is how the two sections start naming the same
 *  anchor differently. */
export function useAnchorName(
  context: HostContext,
  host: Pick<NoteHostRef, 'kind' | 'id'>,
): string | undefined {
  const { bookings, events } = useTrip();
  const { anchor } = context;
  return useMemo(() => {
    if (anchor.kind === host.kind && anchor.id === host.id) return undefined;
    if (anchor.kind === ENTITY_TYPE.BOOKING) return bookings.find((b) => b.id === anchor.id)?.title;
    if (anchor.kind === ENTITY_TYPE.EVENT) return events.find((e) => e.id === anchor.id)?.title;
    return undefined;
  }, [anchor, host.kind, host.id, bookings, events]);
}

export function HostNotes({
  host,
  canAdd = true,
  onAdd,
  compose,
  composeActive,
  composeHint,
}: {
  /** **`id` is absent on a CREATE**, where the host does not exist yet — the section then has
   *  no rows to show and is purely the composer's home. Exactly `HostTasks`' and
   *  `DocumentAttachField`'s shape, so the three content sections on a form take their host
   *  the same way rather than each inventing a way to say "not saved yet" (ADR-0192 §2). */
  host: Omit<NoteHostRef, 'id'> & { id?: string };
  /** Whether the header carries a way in at all. */
  canAdd?: boolean;
  /** **What `＋ פתק` does, when it is not `NoteSheet`.** A host FORM passes the composer's
   *  `openNew` here, so the control reveals the inline box below instead of opening a second
   *  form over a form (ADR-0192 §2's 2026-08-16 reversal — owner: _"clicking the + פתק should
   *  open a new inline task, not the entire form"_). Absent on a read surface, which has no
   *  inline box and whose way in IS the editor. */
  onAdd?: () => void;
  /** The form's composer, rendered as this section's last row (ADR-0192 §2). */
  compose?: ReactNode;
  /** Whether that box is open or holding unsaved notes — decides the empty line. */
  composeActive?: boolean;
  composeHint?: string;
}) {
  const { notes, users, noteVerbs } = useTrip();
  const now = useClock();
  const [editing, setEditing] = useState<Note | 'create' | null>(null);
  // **The full screen, opened from a host** (ADR-0202 §1/§2). Here rather than in
  // `NoteSection` because the screen needs the RESOLVED host and the trip's users, and this is
  // the connected half that already holds both — the section stays presentational.
  const [reading, setReading] = useState<Note | null>(null);
  const hostId = host.id;
  // The host as the index knows it — so the editor can state the category this note inherits.
  const resolved = useResolvedHost({ ...host, id: hostId ?? '' });
  // Read the whole context, write to its anchor (ADR-0172 §1/§2). On a place those differ:
  // it shows its single context's notes and a new one lands on that context's booking, which
  // is what keeps the note with the original context if the place is ever reused (§4).
  const context = useHostContext(host.kind, hostId ?? '');
  // No host, no rows: an unsaved event has nothing to have been said about it yet, and the
  // context lookup for an empty id would answer with whatever a blank key happens to hit.
  const hostNotes = useMemo(
    () => (hostId ? notesForContext(notes, context) : []),
    [notes, context, hostId],
  );
  // **A place says where an inherited note came from** (ADR-0172 §9's amendment). Only a
  // place can be showing rows it does not host — §3's inheritance is one-way — so the whole
  // question is "is this note hosted by the surface I am on", and everywhere else the answer
  // is always yes and nothing is marked.
  const anchorName = useAnchorName(context, { kind: host.kind, id: hostId ?? '' });
  const inheritedFrom = useMemo(
    () =>
      anchorName
        ? (note: Note) => (isHostedBy(note, host.kind, hostId ?? '') ? undefined : anchorName)
        : undefined,
    [anchorName, host.kind, hostId],
  );

  return (
    <>
      <NoteSection
        notes={hostNotes}
        users={users}
        now={now}
        inheritedFrom={inheritedFrom}
        onAdd={canAdd ? (onAdd ?? (() => setEditing('create'))) : undefined}
        onEdit={setEditing}
        onOpenFull={setReading}
        compose={compose}
        composeActive={composeActive}
        composeHint={composeHint}
      />
      {/* No `onGoToHost`: you are standing on the host. The screen still NAMES it, because
          with no chip in its bar the foot is the only place the host appears at all — the
          opposite call from the row's foot one level down, and for the same reason (say a
          fact once, on the surface that is missing it). */}
      {reading && (
        <NoteFullScreen
          note={reading}
          host={hostId ? resolved : undefined}
          users={users}
          now={now}
          onEdit={() => {
            const note = reading;
            setReading(null);
            setEditing(note);
          }}
          onClose={() => setReading(null)}
        />
      )}

      {/* Unreachable without a host: a form supplies its own `onAdd`, so nothing here opens
          `create`, and a row can only be edited if a row was rendered — which needs an id.
          Guarded anyway so the type is honest rather than asserted. */}
      {editing && hostId && (
        <NoteSheet
          note={editing === 'create' ? undefined : editing}
          host={resolved}
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

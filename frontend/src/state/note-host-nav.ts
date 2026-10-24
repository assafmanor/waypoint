// **"Take me to what this note is about"** — one call, five kinds (ADR-0153 §8's way-in
// amendment).
//
// **And its second caller is not a note** (2026-08-20): the Map's place card lists what happens
// at a place, and an event entry there wants exactly this — the day, plus the id that opens and
// lands the one card (ADR-0121 §8's amendment). The name stays because the dispatch it owns is
// the note ADR's; what it answers is "where does this entity live", which was never note-shaped.
//
// Composed here for the same reason `useShowPlaceOnMap` is: it is a surface telling another
// tab something, and every one of those already lives beside the scope it talks to. What this
// adds is the dispatch — a note's host is one of five entity types with five different
// surfaces, and no call site should have to know which.
//
// **Both halves in one object, on purpose.** A caret is drawn only where a tap would land
// somewhere, so "can I go" and "go" have to agree; returning them separately is how they
// drift. `canReach` is false in three cases, all of them "absent, not broken" rather than a
// dead control:
//
//   • a general note — there is no host to go to;
//   • a **someday idea**, which lives in the pool rather than on a day, so the shelf can be
//     reached but not the one tile;
//   • a **place with no Map scope** — outside the trip shell there is no tab to route to,
//     which is the same `null` `useShowPlaceOnMap` already answers with. Note that this is
//     per-KIND: a booking's destination is a URL and does not care whether the Map exists,
//     and gating the whole hook on the place channel (the first draft) silently took the way
//     in off every kind wherever the Map's provider was absent.
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { noteHostTarget } from '../lib/note-host-target';
import type { NoteHostRef } from '../lib/notes';
import { useShowPlaceOnMap } from './map-scope-state';

export interface NoteHostWayIn {
  /** Is there anywhere to send someone? Decides whether the caret renders at all. */
  canReach: (host: NoteHostRef | undefined) => boolean;
  /** Go. A no-op for a host `canReach` refuses, so a stale render cannot navigate to nothing. */
  goTo: (host: NoteHostRef) => void;
}

export function useNoteHostWayIn(today: string): NoteHostWayIn {
  const navigate = useNavigate();
  const showPlaceOnMap = useShowPlaceOnMap();
  return useMemo(
    () => ({
      canReach: (host) =>
        !!host && (host.kind === 'place' ? !!showPlaceOnMap : noteHostTarget(host, today) !== null),
      goTo: (host) => {
        // A place is the one kind whose surface is a live tab rather than a screen taking an
        // id, so it goes through the Map's own focus channel — which also frames the pin.
        if (host.kind === 'place') return void showPlaceOnMap?.(host.id);
        const to = noteHostTarget(host, today);
        // `replace`, like every in-trip transition (ADR-0090): back is computed from nav
        // state, and a way-in that stacked history would leave an entry pointing at a note
        // that is no longer open.
        if (to) navigate(to, { replace: true });
      },
    }),
    [navigate, showPlaceOnMap, today],
  );
}

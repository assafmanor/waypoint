// **The notes as a journal** — the memory Home's section of what we wrote (ADR-0240 §4, epic 4.6).
//
// The same notes the Index lists by recency, read in day order under the day each one is about,
// through the Index's own row: a tap reads a note where it sits, a long one opens on its own
// screen, and its host is one tap away. Read-only, as everything on a finished trip is but the
// settle (ADR-0239 §4), so there is no manage menu and no edit.
import type { Note } from '@waypoint/shared';
import type { JournalDay } from '../lib/memory-home';
import { noteGlyph, noteHost } from '../lib/notes';
import { liveToday } from '../lib/places';
import { useClock } from '../lib/useClock';
import { useNoteHostWayIn } from '../state/note-host-nav';
import { useTrip } from '../state/trip-state';
import { NoteRow, useNoteReader } from './NoteRow';

export function NoteJournal({ days }: { days: readonly JournalDay[] }) {
  const { users, noteHosts: hosts, zoneEvidence } = useTrip();
  const now = useClock();
  const wayIn = useNoteHostWayIn(liveToday(now.getTime(), zoneEvidence));
  const reader = useNoteReader({ hosts, users, now, wayIn });

  const row = (note: Note) => (
    <NoteRow
      key={note.id}
      note={note}
      host={noteHost(note, hosts)}
      glyph={noteGlyph(note, hosts)}
      now={now}
      wayIn={wayIn}
      {...reader.rowProps(note)}
    />
  );

  return (
    <>
      {days.map((day) => (
        <section key={day.date} className="mem-journal-day">
          <h3 className="mem-journal-head">{day.heading}</h3>
          <div className="checklist listcard">{day.notes.map(row)}</div>
        </section>
      ))}
      {reader.fullScreen}
    </>
  );
}

// **The notes as a journal** — the memory Home's section of what we wrote (ADR-0240 §4, epic 4.6).
//
// The same notes the Index lists by recency, read in day order under the day each one is about,
// through the Index's own row: a tap reads a note where it sits, a long one opens on its own
// screen, and its host is one tap away. Read-only, as everything on a finished trip is but the
// settle (ADR-0239 §4), so there is no manage menu and no edit.
//
// Given a `cap`, it leads with that many notes (`journalLead`) and the rest wait by day behind
// Plan Home's continuation row (owner, 2026-09-27: fourteen notes were two screens).
import { useState } from 'react';
import type { Note } from '@waypoint/shared';
import { t } from '../i18n/he';
import { journalLead, type JournalDay } from '../lib/memory-home';
import { noteGlyph, noteHost } from '../lib/notes';
import { liveToday } from '../lib/places';
import { useClock } from '../lib/useClock';
import { useNoteHostWayIn } from '../state/note-host-nav';
import { useTrip } from '../state/trip-state';
import { Icon } from './Icon';
import { NoteRow, useNoteReader } from './NoteRow';
import { Collapsible } from './primitives/Collapsible';

export function NoteJournal({ days, cap }: { days: readonly JournalDay[]; cap?: number }) {
  const { users, noteHosts: hosts, zoneEvidence } = useTrip();
  const now = useClock();
  const wayIn = useNoteHostWayIn(liveToday(now.getTime(), zoneEvidence));
  const reader = useNoteReader({ hosts, users, now, wayIn });
  const [showRest, setShowRest] = useState(false);

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

  const byDay = (list: readonly JournalDay[]) =>
    list.map((day) => (
      <section key={day.date} className="mem-journal-day">
        <h3 className="mem-journal-head">{day.heading}</h3>
        <div className="checklist listcard">{day.notes.map(row)}</div>
      </section>
    ));

  const total = days.reduce((sum, day) => sum + day.notes.length, 0);
  if (cap === undefined || total <= cap) {
    return (
      <>
        {byDay(days)}
        {reader.fullScreen}
      </>
    );
  }

  const { lead, rest } = journalLead(days, cap);
  const copy = t.planHome.past.journal;
  return (
    <>
      <div className="checklist listcard">
        {lead.flatMap((day) => day.notes).map(row)}
        <button
          type="button"
          className="tsk-more chk-more-row"
          aria-expanded={showRest}
          onClick={() => setShowRest((open) => !open)}
        >
          {showRest ? copy.hide : copy.more(total - cap)}
          <Icon name="caret" />
        </button>
      </div>
      <Collapsible expanded={showRest} className="mem-journal-rest">
        {byDay(rest)}
      </Collapsible>
      {reader.fullScreen}
    </>
  );
}

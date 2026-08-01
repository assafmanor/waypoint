// @vitest-environment jsdom
//
// `HostNotes` is the pair every host surface reuses (ADR-0152 §6): the section plus the
// editor it opens. What is only true HERE — and would otherwise be re-proved per host, or
// silently wrong on one of them — is which FK a note is written to. That mapping goes
// through `NOTE_HOST_FIELD`, so this file drives all five kinds rather than the two phase 5
// happens to wire: the place case is phase 6's, and the point is that it needs no code.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Note } from '@waypoint/shared';
import { wrapNav } from '../test/nav-harness';
import { setSimulatedNow } from '../lib/useClock';
import type { NoteHostKind } from '../lib/notes';

const NOW = '2026-07-20T09:00:00Z';

const note = (partial: Partial<Note> & Pick<Note, 'id'>): Note =>
  ({
    tripId: 't1',
    source: 'member',
    createdBy: 'u1',
    createdAt: NOW,
    updatedAt: NOW,
    updatedBy: 'u1',
    ...partial,
  }) as Note;

let tripNotes: Note[] = [];
const createNote = vi.fn(() => Promise.resolve(undefined));
const updateNote = vi.fn(() => Promise.resolve());

vi.mock('../state/trip-state', () => ({
  useTrip: () => ({
    notes: tripNotes,
    users: [
      { id: 'u1', displayName: 'דנה' },
      { id: 'u2', displayName: 'מיכל' },
    ],
    noteVerbs: { createNote, updateNote, deleteNote: async () => {} },
  }),
}));

import { HostNotes } from './HostNotes';
import { t } from '../i18n/he';

const open = (kind: NoteHostKind, id: string) =>
  render(wrapNav(<HostNotes host={{ kind, id, name: 'המארח' }} />));

describe('HostNotes', () => {
  beforeEach(() => {
    setSimulatedNow(Date.parse(NOW));
    tripNotes = [];
    createNote.mockClear();
    updateNote.mockClear();
  });
  afterEach(() => {
    cleanup();
    setSimulatedNow(null);
  });

  it('shows the empty line when the host carries none', () => {
    open('booking', 'b1');
    expect(screen.getByText(t.notes.section.empty)).toBeTruthy();
  });

  it('shows only THIS host’s notes, newest first, with author and when', () => {
    tripNotes = [
      note({ id: 'n1', body: 'ותיק', bookingId: 'b1', createdAt: '2026-07-18T09:00:00Z' }),
      note({ id: 'n2', body: 'טרי', bookingId: 'b1', createdBy: 'u2' }),
      note({ id: 'n3', body: 'של מארח אחר', bookingId: 'b2' }),
      note({ id: 'n4', body: 'כללי' }),
    ];
    open('booking', 'b1');
    const bodies = [...document.querySelectorAll('.note-item-b')].map((n) => n.textContent);
    expect(bodies).toEqual(['טרי', 'ותיק']);
    expect(document.querySelector('.note-item-m')?.textContent).toContain('מיכל');
  });

  // The one thing that cannot be re-derived from the section's markup: a note written here
  // must land on its host's own FK. A single wrong entry in that table would attach every
  // note on that surface to nothing, and it would read as "the note vanished".
  it.each([
    ['booking', 'bookingId'],
    ['document', 'documentId'],
    ['maybeItem', 'maybeItemId'],
    ['event', 'eventId'],
    ['place', 'placeId'],
  ] as const)('writes a new note to %s’s own field (%s)', (kind, field) => {
    open(kind, 'host-1');
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.notes.section.add) }));
    fireEvent.change(screen.getByLabelText(t.notes.sheet.bodyLabel), {
      target: { value: 'הכניסה מאחור' },
    });
    fireEvent.click(screen.getByRole('button', { name: t.notes.sheet.save }));
    expect(createNote).toHaveBeenCalledWith({
      body: 'הכניסה מאחור',
      title: undefined,
      url: undefined,
      category: undefined,
      [field]: 'host-1',
    });
  });

  // A hosted note carries no category of its own (§5's amendment) — so the editor opened
  // from a host offers no picker, and the host is stated instead.
  it('states the host and asks for no category', () => {
    render(wrapNav(<HostNotes host={{ kind: 'document', id: 'd1', name: 'דרכון של דנה' }} />));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.notes.section.add) }));
    expect(screen.getByText('דרכון של דנה')).toBeTruthy();
    expect(screen.queryByText(t.notes.sheet.categoryLabel)).toBeNull();
  });

  it('opens an existing note into the same editor and updates it', () => {
    tripNotes = [note({ id: 'n1', body: 'קוד הכספת 4417', documentId: 'd1' })];
    open('document', 'd1');
    fireEvent.click(screen.getByRole('button', { name: 'קוד הכספת 4417' }));
    fireEvent.change(screen.getByLabelText(t.notes.sheet.bodyLabel), {
      target: { value: 'קוד הכספת 4418' },
    });
    fireEvent.click(screen.getByRole('button', { name: t.notes.sheet.save }));
    expect(updateNote).toHaveBeenCalledWith('n1', {
      body: 'קוד הכספת 4418',
      title: undefined,
      url: undefined,
      category: undefined,
    });
    expect(createNote).not.toHaveBeenCalled();
  });
});

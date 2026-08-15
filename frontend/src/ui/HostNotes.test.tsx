// @vitest-environment jsdom
//
// `HostNotes` is the pair every host surface reuses (ADR-0152 §6): the section plus the
// editor it opens. What is only true HERE — and would otherwise be re-proved per host, or
// silently wrong on one of them — is which FK a note is written to. That mapping goes
// through `NOTE_HOST_FIELD`, so this file drives all five kinds rather than the two phase 5
// happens to wire: the place case is phase 6's, and the point is that it needs no code.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { BOOKING_TYPE, type Booking, type Note, type TripEvent } from '@waypoint/shared';
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
// `useAnchorName` needs the anchor's title, and the index needs the pairing — both come from
// the same two lists the app reads, so a test case states the world once.
let tripEvents: TripEvent[] = [];
let tripBookings: Booking[] = [];
const createNote = vi.fn(() => Promise.resolve(undefined));
const updateNote = vi.fn(() => Promise.resolve());

vi.mock('../state/trip-state', () => ({
  useTrip: () => ({
    // The one context index every note surface resolves through (ADR-0172 §1);
    // built from this file's own fixtures so pairing is real rather than stubbed.
    hostContexts: buildHostContextIndex(tripEvents, tripBookings),
    // The EDITOR states the category a hosted note inherits, and it reads it from here — the
    // defect this index replaced was five call sites hand-writing a `NoteHostRef`, three of
    // them without a category. Built from this file's fixtures so the inheritance is real.
    noteHosts: buildNoteHosts({
      events: tripEvents,
      bookings: tripBookings,
      places: [],
      maybeItems: [],
      documents: [],
    }),
    events: tripEvents,
    bookings: tripBookings,
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
import { buildHostContextIndex } from '../lib/host-context';
import { buildNoteHosts } from '../lib/notes';

const open = (kind: NoteHostKind, id: string) =>
  render(wrapNav(<HostNotes host={{ kind, id, name: 'המארח' }} />));

/** The editor's category chooser, however the sheet is showing it. */
const categoryPills = () => screen.getByRole('radiogroup', { name: t.notes.sheet.categoryLabel });

const precedes = (a: Element, b: Element) =>
  a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING;

describe('HostNotes', () => {
  beforeEach(() => {
    setSimulatedNow(Date.parse(NOW));
    tripNotes = [];
    tripEvents = [];
    tripBookings = [];
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

  // Enter writes a newline now (ADR-0152 §6b's 2026-08-07 amendment), so a body can hold
  // one — and it must survive to the DOM verbatim. The owner's report was that it "doesn't
  // show up at all after saving": nothing strips it, the render collapsed it, which is the
  // CSS contract asserted below.
  it('renders a multi-line body with its newlines intact', () => {
    tripNotes = [note({ id: 'n1', body: 'קומה 3\n\nהכניסה מאחור', bookingId: 'b1' })];
    open('booking', 'b1');
    expect(document.querySelector('.note-item-b')?.textContent).toBe('קומה 3\n\nהכניסה מאחור');
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

  // A hosted note carries no category OF ITS OWN (§5's amendment), and the editor says so
  // instead of hiding the question: the leading pill arrives selected, so what is in force is
  // stated and nothing is asked. A document lends no category at all, so the honest statement
  // is `ללא` rather than an invented inheritance — and it is the way back to no category,
  // which is what the picker being absent altogether used to make unreachable.
  it('states the host, and states a category rather than asking for one', () => {
    render(wrapNav(<HostNotes host={{ kind: 'document', id: 'd1', name: 'דרכון של דנה' }} />));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.notes.section.add) }));
    expect(screen.getByText('דרכון של דנה')).toBeTruthy();
    const leading = within(categoryPills()).getAllByRole('radio')[0];
    expect(within(leading).getByText(t.eventForm.categoryNone)).toBeTruthy();
    expect(leading.getAttribute('aria-checked')).toBe('true');
  });

  // **The category a hosted note INHERITS is stated, with where it came from** — the half that
  // was impossible before, because the sheet took a hand-written `NoteHostRef` from the call
  // site and three of the five omitted `category` (the row, meanwhile, resolved it correctly).
  it('states the category a booking-hosted note inherits, and names the source', () => {
    tripBookings = [{ id: 'host-1', title: 'Granbell', type: BOOKING_TYPE.HOTEL }] as never;
    render(wrapNav(<HostNotes host={{ kind: 'booking', id: 'host-1', name: 'Granbell' }} />));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.notes.section.add) }));
    const leading = within(categoryPills()).getAllByRole('radio')[0];
    // A hotel lends `lodging` through `categoryForBookingType` (ADR-0038), never a copy — so
    // the pill in force is the one that says where the value came from, and `לינה`'s own pill
    // stays unchosen beside it.
    expect(within(leading).getByText(t.notes.sheet.categoryFrom.booking)).toBeTruthy();
    expect(within(leading).getByText('🏨')).toBeTruthy();
    expect(leading.getAttribute('aria-checked')).toBe('true');
    expect(
      screen
        .getByRole('radio', { name: t.iconPicker.categories.lodging })
        .getAttribute('aria-checked'),
    ).toBe('false');
  });

  // **A create asks nothing and hides nothing** (owner, 2026-08-13; ADR-0183 §4's amendment).
  // The collapse was built for re-filing what is already saved, and on a brand-new note it is
  // a tap to open plus a tap to close paid for no earlier answer — so the create gets the plain
  // open field every other form's category is, above the boxes like `EventForm`'s.
  it('leads a create with the category, open, like every other form', () => {
    render(wrapNav(<HostNotes host={{ kind: 'document', id: 'd1', name: 'דרכון של דנה' }} />));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.notes.section.add) }));

    const pills = categoryPills();
    // Nothing to tap open, and nothing held out of reach by `inert`.
    expect(screen.queryByRole('button', { name: t.notes.sheet.categoryLabel })).toBeNull();
    expect(pills.closest('[inert]')).toBeNull();
    expect(precedes(pills, screen.getByLabelText(t.notes.sheet.bodyLabel))).toBeTruthy();
  });

  // An EDIT keeps the statement-as-control (ADR-0183 §1) — there is a saved answer to state,
  // and changing it is the rare pass through the form — but it moves to the top too, so the
  // two modes differ in one thing only: whether the row is collapsed.
  it('leads an edit with the category too, and there it is the statement', () => {
    tripNotes = [note({ id: 'n1', body: 'קוד הכספת 4417', documentId: 'd1' })];
    open('document', 'd1');
    fireEvent.click(screen.getByRole('button', { name: 'קוד הכספת 4417' }));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.notes.open.edit) }));

    const row = screen.getByRole('button', { name: t.notes.sheet.categoryLabel });
    expect(row.getAttribute('aria-expanded')).toBe('false');
    expect(precedes(row, screen.getByLabelText(t.notes.sheet.bodyLabel))).toBeTruthy();
  });

  // A line HERE never clamped, so the words are already whole and opening one adds none —
  // which is why the tap opens the foot and nothing else (ADR-0153 §4's amendment, round
  // two). It must not land in the editor: nobody should reach for a sentence and get a form.
  it('opens a note to its foot, not into the editor', () => {
    tripNotes = [note({ id: 'n1', body: 'קוד הכספת 4417', documentId: 'd1' })];
    open('document', 'd1');
    fireEvent.click(screen.getByRole('button', { name: 'קוד הכספת 4417' }));
    expect(document.querySelector('.row-open-foot')).toBeTruthy();
    expect(screen.queryByLabelText(t.notes.sheet.bodyLabel)).toBeNull();
  });

  // …and no way in, because this surface IS the host. A caret pointing at the sheet you are
  // standing on is the kind of control that makes a reader doubt where they are.
  it('offers no way in to the host it is already on', () => {
    tripNotes = [note({ id: 'n1', body: 'קוד הכספת 4417', documentId: 'd1' })];
    open('document', 'd1');
    fireEvent.click(screen.getByRole('button', { name: 'קוד הכספת 4417' }));
    expect(document.querySelector('button.row-open-lead')).toBeNull();
  });

  // The row here prints title-or-body, so a note carrying both a body and a link showed
  // nothing of the link at all — the foot is where it becomes visible AND openable.
  it('opens the note’s url from the foot, on a host that never printed it', () => {
    tripNotes = [
      note({ id: 'n1', body: 'התפריט מתעדכן', url: 'tabelog.com/tokyo/A1303', documentId: 'd1' }),
    ];
    open('document', 'd1');
    expect(screen.queryByRole('link')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'התפריט מתעדכן' }));
    const link = screen.getByRole('link', { name: t.notes.open.openLink });
    expect(link.getAttribute('href')).toBe('https://tabelog.com/tokyo/A1303');
  });

  it('opens an existing note into the same editor and updates it', () => {
    tripNotes = [note({ id: 'n1', body: 'קוד הכספת 4417', documentId: 'd1' })];
    open('document', 'd1');
    fireEvent.click(screen.getByRole('button', { name: 'קוד הכספת 4417' }));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.notes.open.edit) }));
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

// ADR-0172 §9's amendment, measured into the design in `notes-and-documents-in-context-v1`
// §2 at 2px per note: a place is the one surface that shows rows it does not host, so it is
// the one surface that says where they came from.
describe('an inherited note says where it came from', () => {
  // Its own lifecycle: the hooks above are scoped to the `HostNotes` describe, so without
  // these the previous case's DOM survives and the second assertion reads its node.
  beforeEach(() => {
    setSimulatedNow(Date.parse(NOW));
    tripNotes = [];
    tripEvents = [];
    tripBookings = [];
  });
  afterEach(() => cleanup());

  it('marks a place’s inherited notes with the anchor’s name, and leaves its own plain', () => {
    tripEvents = [];
    tripBookings = [{ id: 'bk-1', title: 'מלון סאקורה', placeId: 'p1' } as Booking];
    tripNotes = [
      note({ id: 'n-inherited', bookingId: 'bk-1', body: 'הכניסה מהחצר' }),
      note({ id: 'n-own', placeId: 'p1', body: 'שייך למקום' }),
    ];
    render(wrapNav(<HostNotes host={{ kind: 'place', id: 'p1', name: 'מלון סאקורה' }} />));

    const own = screen.getByText('שייך למקום').closest('.note-item');
    const inherited = screen.getByText('הכניסה מהחצר').closest('.note-item');
    expect(inherited?.querySelector('.note-from')?.textContent).toBe('מלון סאקורה');
    expect(own?.querySelector('.note-from')).toBeNull();
  });

  it('marks nothing on a booking, whose context it authors all of', () => {
    tripEvents = [{ id: 'ev-1', bookingId: 'bk-1' } as TripEvent];
    tripBookings = [{ id: 'bk-1', title: 'מלון סאקורה' } as Booking];
    tripNotes = [note({ id: 'n1', bookingId: 'bk-1', body: 'לבקש חדר גבוה' })];
    render(wrapNav(<HostNotes host={{ kind: 'booking', id: 'bk-1', name: 'מלון סאקורה' }} />));
    expect(document.querySelector('.note-from')).toBeNull();
  });
});

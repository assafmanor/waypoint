// @vitest-environment jsdom
// The notes screen (ADR-0153): the row's states, the flat order, the chip filter over the
// RESOLVED category, search across title/body/url, and the editor's one refusal.
import { afterEach, describe, it, expect, vi } from 'vitest';
import { type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  BOOKING_SOURCE,
  BOOKING_TYPE,
  EVENT_KIND,
  EVENT_SOURCE,
  EVENT_STATUS,
  type Booking,
  type Note,
  type TripEvent,
} from '@waypoint/shared';

// jsdom has no layout engine, so the refusal's bring-into-view has nothing to call.
Element.prototype.scrollIntoView = vi.fn();

const note = (id: string, over: Partial<Note> = {}): Note => ({
  id,
  tripId: 't1',
  source: 'member',
  createdBy: 'u1',
  createdAt: '2026-07-19T09:00:00Z',
  updatedAt: '2026-07-19T09:00:00Z',
  updatedBy: 'u1',
  ...over,
});

const dinner: TripEvent = {
  id: 'e1',
  tripId: 't1',
  date: '2026-07-20',
  title: 'ארוחת ערב במסעדת מון',
  category: 'food',
  kind: EVENT_KIND.SOFT,
  status: EVENT_STATUS.PLANNED,
  sortOrder: 0,
  source: EVENT_SOURCE.MANUAL,
  createdAt: '2026-07-19T00:00:00Z',
  updatedAt: '2026-07-19T00:00:00Z',
  updatedBy: 'u1',
};
const hotel: Booking = {
  id: 'b1',
  tripId: 't1',
  type: BOOKING_TYPE.HOTEL,
  title: 'מלון שינג׳וקו גרנבל',
  source: BOOKING_SOURCE.MANUAL,
  createdAt: '2026-07-19T00:00:00Z',
  updatedAt: '2026-07-19T00:00:00Z',
  updatedBy: 'u1',
};

// Nine states in one fixture, newest last so the flat order has something to prove.
const bodyOnly = note('n-body', {
  body: 'הכניסה מאחור, ליד חנות הפרחים',
  createdAt: '2026-07-19T09:09:00Z',
});
const titleOnly = note('n-title', {
  title: 'מזומן בלבד',
  category: 'food',
  createdAt: '2026-07-19T09:08:00Z',
});
const titleAndBody = note('n-both', {
  title: 'הצ׳ק-אין רק מ-15:00',
  body: 'אפשר להשאיר מזוודות בלובי',
  bookingId: 'b1',
  createdAt: '2026-07-19T09:07:00Z',
});
const urlOnly = note('n-url', {
  url: 'tabelog.com/tokyo/A1303',
  category: 'food',
  createdAt: '2026-07-19T09:06:00Z',
});
const noCategory = note('n-plain', { body: 'להביא מזומן קטן', createdAt: '2026-07-19T09:05:00Z' });
const hostedNoCategory = note('n-hosted', {
  body: 'לבקש את השולחן בגג',
  eventId: 'e1',
  createdAt: '2026-07-19T09:04:00Z',
});
const orphaned = note('n-orphan', {
  body: 'המארח שלו כבר לא בזיכרון',
  eventId: 'e-gone',
  createdAt: '2026-07-19T09:03:00Z',
});
const withLink = note('n-link', {
  title: 'המדריך ששלחו',
  url: 'example.com/guide',
  category: 'sightseeing',
  createdAt: '2026-07-19T09:02:00Z',
});

let tripNotes: Note[] = [
  bodyOnly,
  titleOnly,
  titleAndBody,
  urlOnly,
  noCategory,
  hostedNoCategory,
  orphaned,
  withLink,
];
const created: unknown[] = [];
const updated: unknown[] = [];
const deleted: string[] = [];

vi.mock('../state/trip-state', () => ({
  useTrip: () => ({
    zoneCrossings: [],
    // Tasks ride the same snapshot since phase 1; the mark and the sections read them.
    tasks: [],
    taskVerbs: {
      createTask: async () => undefined,
      updateTask: async () => {},
      deleteTask: async () => {},
    },
    trip: { id: 't1', name: 'טוקיו', timezone: 'Asia/Tokyo' },
    notes: tripNotes,
    events: [dinner],
    bookings: [hotel],
    places: [],
    maybeItems: [],
    documents: [],
    // The screen resolves every row's host through trip-state's one index (ADR-0152 §5's
    // amendment), so a real one built from this file's own fixtures — a stub Map would make
    // every hosted note read as general and prove nothing.
    noteHosts: buildNoteHosts({
      events: [dinner],
      bookings: [hotel],
      places: [],
      maybeItems: [],
      documents: [],
    }),
    users: [{ id: 'u1', displayName: 'דנה' }],
    noteVerbs: {
      createNote: async (input: unknown) => void created.push(input),
      updateNote: async (id: string, input: unknown) => void updated.push({ id, input }),
      deleteNote: async (id: string) => void deleted.push(id),
    },
  }),
}));
vi.mock('../lib/useClock', () => ({ useClock: () => new Date('2026-07-19T09:10:00Z') }));
vi.mock('../lib/outbox', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/outbox')>();
  return {
    ...actual,
    useSyncStatus: () => ({ state: 'synced' }) as const,
    usePendingUploads: () => [],
  };
});

import { ToastProvider } from './Toast';
import { NavProvider } from '../state/nav-state';
import { ModeProvider } from '../state/mode-state';
import { IndexNotesView } from './IndexNotesView';
import { t } from '../i18n/he';
import { buildNoteHosts } from '../lib/notes';

function wrap(node: ReactNode) {
  return (
    <MemoryRouter>
      <ToastProvider>
        <NavProvider>
          <ModeProvider>{node}</ModeProvider>
        </NavProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

const show = (onClose = () => {}) => render(wrap(<IndexNotesView onClose={onClose} />));
const rows = () => [...document.querySelectorAll('.wp-listrow')];
const visibleRows = () =>
  [...document.querySelectorAll('.wp-reveal:not(.hidden) .wp-listrow')] as HTMLElement[];

describe('IndexNotesView (ADR-0153)', () => {
  afterEach(() => {
    cleanup();
    tripNotes = [
      bodyOnly,
      titleOnly,
      titleAndBody,
      urlOnly,
      noCategory,
      hostedNoCategory,
      orphaned,
      withLink,
    ];
    created.length = 0;
    updated.length = 0;
    deleted.length = 0;
  });

  describe('the row', () => {
    it('shows a body-only note’s words as its title line, clamped to two', () => {
      show();
      const row = screen.getByText(bodyOnly.body!);
      expect(row.classList.contains('note-body-line')).toBe(true);
    });

    // Printing both is the same sentence twice — ADR-0151's tile amendment paid for this.
    it('shows a titled note’s TITLE and demotes its body to the meta line', () => {
      show();
      const row = rows().find((r) => within(r as HTMLElement).queryByText(titleAndBody.title!));
      expect(row).toBeTruthy();
      const meta = row!.querySelector('.wp-listrow-meta');
      expect(meta?.textContent).toContain(titleAndBody.body!);
      // …and the body is not ALSO the title line.
      expect(row!.querySelector('.note-body-line')).toBeNull();
    });

    it('renders a url-only note’s line as an LTR island, never via dir="ltr"', () => {
      show();
      const line = document.querySelector('.note-url-line');
      expect(line?.textContent).toContain(urlOnly.url!);
      // ADR-0118: `dir="ltr"` on a non-input lays the whole row out left-to-right.
      expect(line?.getAttribute('dir')).toBeNull();
      // The isolate characters from `lib/bidi.ts` are what do the work instead.
      expect(line?.textContent).toMatch(/⁦.*⁩/);
    });

    it('marks a note that has a url AND words, but not a url-only one', () => {
      show();
      const linked = rows().find((r) => within(r as HTMLElement).queryByText(withLink.title!));
      expect(linked!.querySelector('.note-link-mark')).toBeTruthy();
      const urlRow = rows().find((r) => r.querySelector('.note-url-line'));
      expect(urlRow!.querySelector('.note-link-mark')).toBeNull();
    });

    it('gives a hosted note its host’s chip, and a general note none', () => {
      show();
      const hosted = rows().find((r) => within(r as HTMLElement).queryByText(titleAndBody.title!));
      expect(hosted!.querySelector('.note-host-n')?.textContent).toBe(hotel.title);
      const general = rows().find((r) => within(r as HTMLElement).queryByText(titleOnly.title!));
      expect(general!.querySelector('.note-host')).toBeNull();
    });

    // The truthful degradation: a stale cache or a mid-render delete leaves a host id with
    // nothing behind it, and an empty chip would be worse than no chip.
    it('renders a note whose host is missing as general rather than an empty chip', () => {
      show();
      const row = rows().find((r) => within(r as HTMLElement).queryByText(orphaned.body!));
      expect(row).toBeTruthy();
      expect(row!.querySelector('.note-host')).toBeNull();
    });

    it('shows the author and a relative time', () => {
      show();
      const row = rows().find((r) => within(r as HTMLElement).queryByText(titleOnly.title!));
      expect(row!.querySelector('.wp-listrow-meta')?.textContent).toContain('דנה');
    });
  });

  describe('order and grouping', () => {
    it('is flat — no group headers at all', () => {
      show();
      expect(document.querySelectorAll('.note-group-h')).toHaveLength(0);
    });

    it('is newest first', () => {
      show();
      const first = visibleRows()[0];
      expect(within(first).queryByText(bodyOnly.body!)).toBeTruthy();
    });
  });

  describe('the chip filter', () => {
    it('files a hosted note under its HOST’s category, not under "other"', () => {
      show();
      // The event is `food`, and the note carries no category of its own.
      const foodChip = screen.getByRole('radio', { name: t.iconPicker.categories.food });
      fireEvent.click(foodChip);
      const shown = visibleRows().map((r) => r.textContent ?? '');
      expect(shown.some((text) => text.includes(hostedNoCategory.body!))).toBe(true);
    });

    it('keeps a note with no category reachable under "other"', () => {
      show();
      fireEvent.click(screen.getByRole('radio', { name: t.iconPicker.categories.other }));
      const shown = visibleRows().map((r) => r.textContent ?? '');
      expect(shown.some((text) => text.includes(noCategory.body!))).toBe(true);
    });

    // ADR-0120: a filtered-out row is hidden IN PLACE, never dropped from the array.
    it('hides non-matching rows rather than removing them', () => {
      show();
      const before = rows().length;
      fireEvent.click(screen.getByRole('radio', { name: t.iconPicker.categories.food }));
      expect(rows()).toHaveLength(before);
      expect(visibleRows().length).toBeLessThan(before);
    });

    it('offers no chip for a category no note resolves to', () => {
      show();
      expect(screen.queryByRole('radio', { name: t.iconPicker.categories.nature })).toBeNull();
    });
  });

  describe('search', () => {
    const openSearch = () => fireEvent.click(screen.getByLabelText(t.notes.search.button));

    it('matches on the BODY, not only the title', () => {
      show();
      openSearch();
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'מזוודות' } });
      const shown = visibleRows().map((r) => r.textContent ?? '');
      expect(shown.some((text) => text.includes(titleAndBody.title!))).toBe(true);
    });

    it('matches on the URL — which is why a link-only note is findable at all', () => {
      show();
      openSearch();
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'tabelog' } });
      expect(visibleRows().some((r) => r.querySelector('.note-url-line'))).toBe(true);
    });

    it('matches on the host’s name, so "what did we say about the hotel" works', () => {
      show();
      openSearch();
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'גרנבל' } });
      const shown = visibleRows().map((r) => r.textContent ?? '');
      expect(shown.some((text) => text.includes(titleAndBody.title!))).toBe(true);
    });
  });

  // ADR-0153 §4's 2026-08-02 amendment, round two. The tap used to raise a SHEET, which is
  // `BookingDetail`'s grammar — right for an object with facts and verbs, wrong for a
  // sentence. It opens where it is now: the row's two-line clamp lifts and one foot line
  // appears under it, with the list still on screen behind nothing at all.
  describe('a row opens where it is', () => {
    const tap = (note: Note) =>
      fireEvent.click(screen.getByRole('button', { name: note.title ?? note.body ?? '' }));
    const openRow = () => document.querySelector('.wp-listrow.is-open');
    const foot = () => document.querySelector('.row-open-foot');

    it('marks the row open and puts the foot under it — no sheet, no scrim', () => {
      show();
      tap(bodyOnly);
      expect(openRow()).toBeTruthy();
      expect(foot()).toBeTruthy();
      // The list is still the list: nothing was raised over it.
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.querySelectorAll('.wp-listrow').length).toBeGreaterThan(1);
    });

    it('opens one at a time, and a second tap closes it', () => {
      show();
      tap(bodyOnly);
      tap(titleAndBody);
      expect(document.querySelectorAll('.row-open-foot')).toHaveLength(1);
      tap(titleAndBody);
      expect(foot()).toBeNull();
    });

    it('says a general note is general rather than leaving the line blank', () => {
      show();
      tap(bodyOnly);
      expect(foot()?.textContent).toContain(t.notes.open.general);
    });

    // The host was already named on the row and inert. In the foot it is the way in — and
    // the row's own chip hides while it is open, or the host is named twice.
    it('turns the host’s name into the way in, and stops naming it twice', () => {
      show();
      tap(titleAndBody);
      const link = screen.getByRole('button', { name: t.notes.open.toHost(hotel.title) });
      expect(link.textContent).toContain(hotel.title);
      expect(link.closest('.row-open-foot')).toBeTruthy();
    });

    // A general note has no host, so there is nothing to go to — the words stay, the
    // control does not appear at all.
    it('offers no way in for a general note', () => {
      show();
      tap(bodyOnly);
      expect(foot()?.querySelector('button.row-open-lead')).toBeNull();
      expect(foot()?.querySelector('.row-open-lead.plain')).toBeTruthy();
    });

    // A note's link was readable everywhere and openable nowhere. It opens from the foot,
    // and a scheme-less url (the field's own placeholder is one) must not be read as an
    // in-app path.
    it('makes the url a real link, and gives a bare host a scheme', () => {
      show();
      tap(withLink);
      const link = screen.getByRole('link', { name: t.notes.open.openLink });
      expect(link.getAttribute('href')).toBe(`https://${withLink.url}`);
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toContain('noopener');
      expect(link.textContent).toContain(withLink.url!);
    });

    // A url-only note's row IS the url, so the foot must not print it a second time — the
    // only thing that line is missing is the verb (owner, 2026-08-02).
    it('says the verb instead of the url when the row already is the url', () => {
      show();
      // A url-only note's accessible name is its own pretty url, not a title it has not got.
      fireEvent.click(screen.getByRole('button', { name: 'tabelog.com/tokyo/A1303' }));
      const link = screen.getByRole('link', { name: t.notes.open.openLink });
      expect(link.textContent).toContain(t.notes.open.openLink);
      expect(link.textContent).not.toContain(urlOnly.url!);
    });

    it('offers no link on a note that has none', () => {
      show();
      tap(bodyOnly);
      expect(screen.queryByRole('link', { name: t.notes.open.openLink })).toBeNull();
    });

    it('offers edit, and leaves delete on the ⋯ where a destructive verb belongs', () => {
      show();
      tap(titleAndBody);
      expect(screen.queryByText(t.notes.manage.delete)).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: new RegExp(t.notes.open.edit) }));
      const body = screen.getByLabelText(t.notes.sheet.bodyLabel) as HTMLTextAreaElement;
      expect(body.value).toBe(titleAndBody.body);
    });
  });

  describe('the editor', () => {
    const openCreate = () => fireEvent.click(screen.getByText(t.notes.add));

    // Every field here is optional on its own, so the refusal marks NONE of them: a red
    // body calls it mandatory when a link alone would do, and a red url contradicts its own
    // `לא חובה` label. It is the form's, and it reads in the form's slot.
    it('refuses a note with neither body nor url without marking any field', () => {
      show();
      openCreate();
      fireEvent.click(screen.getByText(t.notes.sheet.save));

      expect(document.querySelectorAll('[data-invalid]')).toHaveLength(0);
      expect(screen.getByRole('alert').textContent).toBe(t.notes.sheet.needsBodyOrUrl);
      expect(created).toHaveLength(0);
    });

    it('retires the refusal as soon as either cure is typed', () => {
      show();
      openCreate();
      fireEvent.click(screen.getByText(t.notes.sheet.save));
      // `input`, not `change`: the dismissal rides the event a keystroke actually fires.
      fireEvent.input(screen.getByPlaceholderText(t.notes.sheet.urlPlaceholder), {
        target: { value: 'example.com/x' },
      });
      expect(screen.queryByRole('alert')).toBeNull();
    });

    // ADR-0150 §8: a primary is disabled only when a press could not work, never as a
    // stand-in for a refusal it cannot explain.
    it('does not disable the primary in place of refusing', () => {
      show();
      openCreate();
      expect(screen.getByText(t.notes.sheet.save).closest('button')?.disabled).toBe(false);
    });

    it('saves a body-only note, and a note written here is general', () => {
      show();
      openCreate();
      fireEvent.change(screen.getByLabelText(t.notes.sheet.bodyLabel), {
        target: { value: 'אין פחי אשפה ברחוב' },
      });
      fireEvent.click(screen.getByText(t.notes.sheet.save));

      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({ body: 'אין פחי אשפה ברחוב' });
      // No host picker in v1 — attachment is established from the host's side.
      expect(created[0]).not.toHaveProperty('eventId');
    });

    it('a url alone is enough — the refusal is about having NEITHER', () => {
      show();
      openCreate();
      fireEvent.change(screen.getByLabelText(t.notes.sheet.urlLabel), {
        target: { value: 'instagram.com/p/x' },
      });
      fireEvent.click(screen.getByText(t.notes.sheet.save));
      expect(created).toHaveLength(1);
    });
  });

  describe('the empty states', () => {
    it('teaches what belongs here when there are no notes at all, and offers the action', () => {
      tripNotes = [];
      show();
      expect(screen.getByText(t.notes.empty.title)).toBeTruthy();
      expect(screen.getByText(t.notes.empty.action)).toBeTruthy();
    });

    it('offers NO action when a filter matches nothing — the chip is already on screen', () => {
      tripNotes = [note('n1', { body: 'רק אחד', category: 'food' })];
      show();
      fireEvent.click(screen.getByRole('radio', { name: t.iconPicker.categories.food }));
      fireEvent.change(
        (() => {
          fireEvent.click(screen.getByLabelText(t.notes.search.button));
          return screen.getByRole('textbox');
        })(),
        { target: { value: 'לא קיים' } },
      );
      expect(screen.getByText(t.notes.search.noResults)).toBeTruthy();
    });
  });
});

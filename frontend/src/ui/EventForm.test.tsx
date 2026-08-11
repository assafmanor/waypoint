// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { wrapNav } from '../test/nav-harness';

// jsdom has no scrollIntoView; the form's focus-reveal and the zone picker both
// call it (mirrors ZonePicker.test.tsx).
Element.prototype.scrollIntoView = vi.fn();

// EventForm folds into the Modal primitive (U-01). The state hooks are mocked so
// the test exercises the overlay/focus behavior, not the trip data plane.
// Mutable so the multi-zone tests can add places/crossings without a second mock.
const tripState = {
  // The one context index every note surface resolves through (ADR-0172 §1). Empty here:
  // this form only ever hosts an UNLINKED event, whose context is itself.
  hostContexts: buildHostContextIndex([], []),
  trip: {
    id: 't1',
    timezone: 'Asia/Tokyo',
    startDate: '2026-07-19',
    endDate: '2026-07-25',
    updatedBy: 'u1',
  },
  activeDate: '2026-07-20',
  events: [] as unknown[],
  // The one zone evidence trip-state memoizes — every zone question resolves
  // against it, so a test adds a crossing here rather than to a per-screen copy.
  zoneEvidence: {
    events: [] as unknown[],
    bookings: [] as unknown[],
    places: [] as unknown[],
    crossings: [] as unknown[],
    primaryZone: 'Asia/Tokyo',
  },
  // The place field (PlacePicker) reads the snapshot + the place verbs.
  places: [] as unknown[],
  // An already-linked event's statement reads its booking from here (ADR-0136 §3).
  bookings: [] as unknown[],
  indexVerbs: { createPlace: vi.fn(), resolvePlace: vi.fn() },
  // Notes written on the way (ADR-0152 §6b): the form queues them BEHIND their host.
  noteVerbs: { createNote: vi.fn(() => Promise.resolve(undefined)) },
  // …and read on the way back: editing an existing event renders `HostNotes`, which reads
  // the trip's notes and members straight from here.
  notes: [] as unknown[],
  users: [] as unknown[],
  // Documents attached on the way (ADR-0173 §5): the slot reads the trip's documents and
  // links, and the form queues its staged links BEHIND their host like the notes above.
  documents: [] as unknown[],
  documentAttachments: [] as unknown[],
  attachmentVerbs: { attachDocument: vi.fn(() => Promise.resolve(undefined)) },
};
vi.mock('../state/trip-state', () => ({ useTrip: () => tripState }));
// The attach slot reads the outbox for queued uploads (ADR-0173 §5 / ADR-0056); there is no
// IndexedDB here, and a queued upload is not what these tests are about.
vi.mock('../lib/outbox', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/outbox')>();
  return { ...actual, usePendingUploads: () => [] };
});

vi.mock('../state/auth-state', () => ({ useAuth: () => ({ me: { user: { id: 'u1' } } }) }));
// **These three RESOLVE, and the mock has to say so.** They return their host now (a
// promise of it) precisely so a caller can queue notes behind it — a mock returning
// `undefined` would let the form's note write die silently while every assertion here
// still passed, which is the shape of test that hides a feature rather than pinning it.
type AnyFields = Record<string, unknown>;
const verbs = {
  create: vi.fn((_event: AnyFields) => Promise.resolve()),
  update: vi.fn((_event: AnyFields, _patch: AnyFields) => undefined),
  schedule: vi.fn((_m: AnyFields, fields: AnyFields) =>
    Promise.resolve({ id: 'ev-scheduled', ...fields }),
  ),
  book: vi.fn((_input: AnyFields, _opts?: AnyFields) => Promise.resolve({ id: 'bk-new' })),
};
vi.mock('../state/verbs', () => ({ useVerbs: () => verbs }));
// The place field sends an errand to the Map (ADR-0134 §1); the form supplies the draft, so
// this is where the hand-over blob is asserted.
const startErrand = vi.fn();
vi.mock('../state/map-scope-state', () => ({ useStartPlaceErrand: () => startErrand }));

// Two real places, for the route-shape assertions below (ADR-0154 §1).
const PLACE_A = { id: 'p-tlv', tripId: 't1', name: 'נתב״ג', timezone: 'Asia/Jerusalem' };
const PLACE_B = { id: 'p-nrt', tripId: 't1', name: 'נריטה', timezone: 'Asia/Tokyo' };

import { EventForm } from './EventForm';
import { setSimulatedNow } from '../lib/useClock';
import { iconForCategory } from '@waypoint/shared';
import { t } from '../i18n/he';
import { buildHostContextIndex } from '../lib/host-context';

// PIN THE CLOCK (frontend/CLAUDE.md). Every fixture here carries a fixed date — the trip's
// range, `activeDate`, the events — so a test reading the real system clock means something
// different each day it runs and eventually passes for the wrong reason. Inside the trip's
// 2026-07-19..25 window, on `activeDate`.
const NOW = Date.parse('2026-07-20T09:00:00+09:00');

describe('EventForm (folded into Modal, U-01)', () => {
  beforeEach(() => {
    setSimulatedNow(NOW);
    // Per test, not per file: `mock.calls[0]` otherwise reads whatever an earlier test in
    // this describe happened to save, which is how four assertions here first "passed".
    for (const fn of Object.values(verbs)) fn.mockClear();
    // Same reason as the line above, and it bit once already: this mock is shared through
    // `tripState`, so without a reset a later test reads the previous one's calls.
    tripState.noteVerbs.createNote.mockReset();
    tripState.noteVerbs.createNote.mockResolvedValue(undefined);
    tripState.notes = [];
    startErrand.mockClear();
  });
  afterEach(() => {
    setSimulatedNow(null);
    cleanup();
  });

  it('renders as a body-portalled dialog and moves focus into the card', () => {
    render(wrapNav(<EventForm onClose={() => {}} />));
    const dialog = screen.getByRole('dialog');
    expect(dialog.closest('.modal-overlay')?.parentElement).toBe(document.body);
    expect(document.activeElement).toBe(dialog);
  });

  it('closes on Escape when the form is untouched (overlay/back path)', () => {
    const onClose = vi.fn();
    render(wrapNav(<EventForm onClose={onClose} />));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on backdrop click when untouched', () => {
    const onClose = vi.fn();
    render(wrapNav(<EventForm onClose={onClose} />));
    fireEvent.click(document.querySelector('.modal-overlay')!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('restores focus to the opener on unmount', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const { unmount } = render(wrapNav(<EventForm onClose={() => {}} />));
    expect(document.activeElement).not.toBe(opener);
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('guards a dirty close: Escape prompts a discard confirm instead of closing', () => {
    const onClose = vi.fn();
    render(wrapNav(<EventForm onClose={onClose} />));
    fireEvent.change(screen.getByPlaceholderText(t.eventForm.titlePlaceholder), {
      target: { value: 'ארוחת ערב' },
    });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    // The discard confirm appears; confirming it runs the close.
    expect(screen.getByText(t.common.discardTitle)).toBeTruthy();
    fireEvent.click(screen.getByText(t.common.discardConfirm));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ── AN UNTOUCHED EDIT IS NOT DIRTY (owner, 2026-08-03) ─────────────────────
  // The regression that made this a report: ADR-0136 §2's session-187 amendment gave the
  // booked row `Boolean(event)` as its touched flag so the category cannot re-guess a saved
  // fact — and `dirty` was still reading that flag as "the human turned the row on". So
  // every edit of every event was dirty before a key was pressed, and leaving one cost a
  // confirm. Worst in Plan mode, where a tap on a row IS this form.
  describe('opening an existing event and leaving it alone', () => {
    const saved = (extra: Record<string, unknown> = {}) => ({
      id: 'ev-7',
      tripId: 't1',
      date: '2026-07-20',
      title: 'ארוחת ערב',
      kind: 'soft',
      icon: '🍜',
      category: 'food',
      placeId: 'p-tlv',
      status: 'planned',
      sortOrder: 1,
      source: 'manual',
      createdAt: '',
      updatedAt: '',
      updatedBy: 'u1',
      ...extra,
    });

    // Both exits, because they are the two the report named: the ✕/backdrop/system-back
    // path and the explicit `ביטול`.
    it('closes on Escape with no discard confirm', () => {
      const onClose = vi.fn();
      render(wrapNav(<EventForm event={saved() as never} onClose={onClose} />));
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByText(t.common.discardTitle)).toBeNull();
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes on ביטול with no discard confirm', () => {
      const onClose = vi.fn();
      render(wrapNav(<EventForm event={saved() as never} onClose={onClose} />));
      fireEvent.click(screen.getByRole('button', { name: t.common.cancel }));
      expect(screen.queryByText(t.common.discardTitle)).toBeNull();
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    // The linked case runs the OTHER branch — `showBooked` is false, so there is no row at
    // all and the flag was doubly meaningless there.
    it('closes an already-linked event with no discard confirm', () => {
      tripState.bookings = [{ id: 'bk-1', title: 'רמן נאגי', type: 'restaurant' }];
      const onClose = vi.fn();
      render(
        wrapNav(<EventForm event={saved({ bookingId: 'bk-1' }) as never} onClose={onClose} />),
      );
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByText(t.common.discardTitle)).toBeNull();
      expect(onClose).toHaveBeenCalledTimes(1);
      tripState.bookings = [];
    });

    // …and the guard still guards. ADR-0136 §2.a's third symptom: turning the row on is
    // §3's one-way conversion on the next save, so it is exactly the edit that must warn.
    it('still prompts once the booked row is turned on', () => {
      const onClose = vi.fn();
      render(wrapNav(<EventForm event={saved() as never} onClose={onClose} />));
      fireEvent.click(screen.getByRole('button', { name: new RegExp(t.eventForm.bookedLabel) }));
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.getByText(t.common.discardTitle)).toBeTruthy();
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  // ADR-0107 §6 — the zone chip: the resolved zone is stated and correctable, and
  // a correction is a manual override on the event, never a cache of the derived
  // value (§7 / ADR-0110 §94-99).
  describe('the zone chip', () => {
    const TLV = 'Asia/Jerusalem';
    const flight = {
      id: 'ev-f',
      bookingId: 'bk',
      date: '2026-07-20',
      startsAt: '2026-07-20T20:00:00Z',
    };

    afterEach(() => {
      tripState.events = [];
      tripState.places = [];
      tripState.zoneEvidence.events = [];
      tripState.zoneEvidence.bookings = [];
      tripState.zoneEvidence.places = [];
      tripState.zoneEvidence.crossings = [];
      verbs.create.mockClear();
      verbs.update.mockClear();
    });

    const pickZone = (query: string, name: RegExp) => {
      fireEvent.click(document.querySelector<HTMLElement>('.zchip-btn')!);
      fireEvent.change(screen.getByPlaceholderText(t.zonePicker.searchPlaceholder), {
        target: { value: query },
      });
      fireEvent.click(screen.getByRole('button', { name }));
    };

    it('states the trip primary zone when nothing else anchors the event', () => {
      render(wrapNav(<EventForm onClose={() => {}} />));
      expect(document.querySelector('.zchip-zone')!.textContent).toContain('Tokyo');
      expect(document.querySelector('.zchip-btn.pinned')).toBeNull();
    });

    it('states the ITINERARY SEGMENT zone for a time before the outbound crossing', () => {
      // The outbound flight departs 20:00Z on the 20th, so a 15:00-local event that
      // day sits in the origin segment — Jerusalem, not the destination.
      tripState.zoneEvidence.crossings = [
        { at: Date.parse(flight.startsAt), fromZone: TLV, toZone: 'Asia/Tokyo' },
      ];
      render(
        wrapNav(<EventForm defaults={{ date: '2026-07-20', start: '15:00' }} onClose={() => {}} />),
      );
      expect(document.querySelector('.zchip-zone')!.textContent).toContain('Jerusalem');
    });

    it('a pick pins the zone, and saving sends it as the override', () => {
      render(wrapNav(<EventForm onClose={() => {}} />));
      fireEvent.change(screen.getByPlaceholderText(t.eventForm.titlePlaceholder), {
        target: { value: 'קפה' },
      });
      pickZone('jerusalem', /Jerusalem/);
      expect(document.querySelector('.zchip-btn.pinned')).toBeTruthy();
      fireEvent.click(screen.getByText(t.eventForm.save));
      expect(verbs.create).toHaveBeenCalledWith(expect.objectContaining({ displayTimezone: TLV }));
    });

    it('interprets the typed time in the PICKED zone (the form and the view agree)', () => {
      render(
        wrapNav(<EventForm defaults={{ date: '2026-07-20', start: '09:00' }} onClose={() => {}} />),
      );
      fireEvent.change(screen.getByPlaceholderText(t.eventForm.titlePlaceholder), {
        target: { value: 'קפה' },
      });
      pickZone('jerusalem', /Jerusalem/);
      fireEvent.click(screen.getByText(t.eventForm.save));
      // 09:00 kept as the wall-clock and re-interpreted in Jerusalem (+3) — NOT
      // re-rendered as another time in Tokyo (§8: you meant the time *there*).
      expect(verbs.create).toHaveBeenCalledWith(
        expect.objectContaining({ startsAt: '2026-07-20T06:00:00.000Z' }),
      );
    });

    it('reads an existing override back, and the reset clears it with null', () => {
      const event = {
        ...flight,
        bookingId: undefined,
        title: 'קפה',
        kind: 'soft',
        status: 'planned',
        source: 'manual',
        sortOrder: 1,
        tripId: 't1',
        startsAt: '2026-07-20T06:00:00.000Z',
        displayTimezone: TLV,
        createdAt: '',
        updatedAt: '',
        updatedBy: 'u1',
      };
      render(wrapNav(<EventForm event={event as never} onClose={() => {}} />));
      // Pinned to Jerusalem, and the stored instant reads back as its 09:00 there.
      expect(document.querySelector('.zchip-btn.pinned')).toBeTruthy();
      expect(document.querySelector('.zchip-zone')!.textContent).toContain('Jerusalem');
      expect(document.querySelector('.modal-overlay')!.textContent).toContain('09:00');

      fireEvent.click(screen.getByRole('button', { name: t.eventForm.zoneReset }));
      fireEvent.click(screen.getByText(t.eventForm.save));
      expect(verbs.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ displayTimezone: null }),
      );
    });

    it('leaves the override untouched when the chip is never used', () => {
      render(wrapNav(<EventForm onClose={() => {}} />));
      fireEvent.change(screen.getByPlaceholderText(t.eventForm.titlePlaceholder), {
        target: { value: 'קפה' },
      });
      fireEvent.click(screen.getByText(t.eventForm.save));
      // Not null and not the derived zone — an untouched form must not freeze
      // today's derivation onto the event.
      expect(verbs.create.mock.calls[0][0].displayTimezone).toBeUndefined();
    });
  });

  // ── `יש הזמנה`: an event can also be booked (ADR-0136) ─────────────────────
  // Each test below is the reproduction of one specific way this can go wrong.
  describe('the booked row (ADR-0136)', () => {
    const bookedChip = () =>
      screen.getByRole('button', { name: new RegExp(t.eventForm.bookedLabel) });
    const typeGroup = () => screen.queryByRole('radiogroup', { name: t.eventForm.bookedTypeLabel });
    const named = (title: string) =>
      fireEvent.change(screen.getByPlaceholderText(t.eventForm.titlePlaceholder), {
        target: { value: title },
      });
    const save = () => fireEvent.click(screen.getByText(t.eventForm.save));
    /** The event seed inside the booked payload — `AnyFields` makes its values `unknown`,
     *  so the nested read needs one narrowing rather than a cast per assertion. */
    const bookedEventSeed = () => verbs.book.mock.calls[0][0].event as AnyFields;
    const pickCategory = (category: keyof typeof t.iconPicker.categories) =>
      fireEvent.click(
        within(screen.getByRole('radiogroup', { name: t.eventForm.categoryLabel })).getByRole(
          'radio',
          { name: t.iconPicker.categories[category] },
        ),
      );

    it('is off by default and reveals nothing, so someone who books nothing pays no field', () => {
      render(wrapNav(<EventForm onClose={() => {}} />));
      expect(bookedChip().getAttribute('aria-pressed')).toBe('false');
      expect(document.querySelector('.wp-collapsible.on')).toBeNull();
      expect(typeGroup()).toBeNull();
    });

    // FAILS if the save always creates an event: the booked branch must write the BOOKING,
    // with its event seed, and produce the linked pair server-side.
    it('saves a booking with its event seed instead of a bare event', () => {
      render(wrapNav(<EventForm onClose={() => {}} />));
      named('רמן נאגי');
      fireEvent.click(bookedChip());
      save();

      expect(verbs.create).not.toHaveBeenCalled();
      expect(verbs.book).toHaveBeenCalledTimes(1);
      const [input, opts] = verbs.book.mock.calls[0];
      expect(input).toMatchObject({ title: 'רמן נאגי', event: { date: '2026-07-20' } });
      expect(opts).toMatchObject({ event: null });
    });

    it('sends the code only when one was typed, because the code creates nothing', () => {
      render(wrapNav(<EventForm onClose={() => {}} />));
      named('רמן נאגי');
      fireEvent.click(bookedChip());
      save();
      expect(verbs.book.mock.calls[0][0].confirmationCode).toBeUndefined();

      cleanup();
      verbs.book.mockClear();
      render(wrapNav(<EventForm onClose={() => {}} />));
      named('רמן נאגי');
      fireEvent.click(bookedChip());
      fireEvent.change(screen.getByPlaceholderText(t.eventForm.bookedCodePlaceholder), {
        target: { value: 'RN-4820' },
      });
      save();
      expect(verbs.book.mock.calls[0][0].confirmationCode).toBe('RN-4820');
    });

    // FAILS if `bookedTouched` is ignored: the category's default must move the row only
    // until a human has said something, and then never again.
    describe('the category default', () => {
      it('opens the row ON for lodging, and OFF for the rest — transport included', () => {
        render(wrapNav(<EventForm onClose={() => {}} />));
        pickCategory('lodging');
        expect(bookedChip().getAttribute('aria-pressed')).toBe('true');
        pickCategory('food');
        expect(bookedChip().getAttribute('aria-pressed')).toBe('false');
        // `transport` used to be the second `true`, and ADR-0156 is why it no longer is: the
        // category covers the bus, the ferry and the drive as well as the flight, so the
        // unbooked journey is the common case and the reservation is the tap.
        pickCategory('transport');
        expect(bookedChip().getAttribute('aria-pressed')).toBe('false');
        // `Collapsible` keeps its children mounted for the motion, so shut is the class,
        // never the absence of the pills.
        expect(document.querySelector('.wp-collapsible.on')).toBeNull();
      });

      it('stops moving once a human has touched the row, in both directions', () => {
        render(wrapNav(<EventForm onClose={() => {}} />));
        // A human says "no, this hotel is not booked".
        pickCategory('lodging');
        fireEvent.click(bookedChip());
        expect(bookedChip().getAttribute('aria-pressed')).toBe('false');
        // Coming back to the one category that still defaults ON must NOT put it back on.
        pickCategory('food');
        pickCategory('lodging');
        expect(bookedChip().getAttribute('aria-pressed')).toBe('false');

        cleanup();
        render(wrapNav(<EventForm onClose={() => {}} />));
        // …and the other way, which the flipped default makes the commoner one: "yes, this
        // bus IS booked" has to survive a category change too.
        pickCategory('transport');
        fireEvent.click(bookedChip());
        pickCategory('food');
        expect(bookedChip().getAttribute('aria-pressed')).toBe('true');
      });
    });

    // ADR-0136 §2 + the session-185 amendment: `EventCategory` has one `transport` while
    // `BookingType` has flight, train and other, so this is the one category that asks.
    describe('the transport type, the one question the category cannot answer', () => {
      it('is asked only for transport, and only with the row on', () => {
        render(wrapNav(<EventForm onClose={() => {}} />));
        pickCategory('food');
        expect(typeGroup()).toBeNull();

        // The category alone no longer opens it (session 187), so the mode question waits
        // for the reservation to be stated rather than arriving with it.
        pickCategory('transport');
        expect(document.querySelector('.wp-collapsible.on')).toBeNull();

        fireEvent.click(bookedChip());
        expect(typeGroup()).toBeTruthy();
        expect(document.querySelector('.wp-collapsible.on')).toBeTruthy();

        fireEvent.click(bookedChip()); // …and off again
        expect(bookedChip().getAttribute('aria-pressed')).toBe('false');
        expect(document.querySelector('.wp-collapsible.on')).toBeNull();
      });

      it('defaults to flight and writes the picked type instead', () => {
        render(wrapNav(<EventForm onClose={() => {}} />));
        named('שינקנסן לקיוטו');
        pickCategory('transport');
        fireEvent.click(bookedChip());
        const group = typeGroup()!;
        expect(
          within(group)
            .getByRole('radio', { name: t.index.bookingType.flight })
            .getAttribute('aria-checked'),
        ).toBe('true');

        fireEvent.click(within(group).getByRole('radio', { name: t.index.bookingType.train }));
        save();
        expect(verbs.book.mock.calls[0][0].type).toBe('train');
      });

      // **The gap ADR-0162 closes**, asserted as the user hit it: a hire was reachable only
      // by knowing that `נסיעה` covered it, which nobody did. The pill is the fix, so the
      // test names all four modes rather than only the new one.
      it('offers a car hire as its own pill, and writes `car`', () => {
        render(wrapNav(<EventForm onClose={() => {}} />));
        named('רכב לשבוע בהוקאידו');
        pickCategory('transport');
        fireEvent.click(bookedChip());
        const group = typeGroup()!;
        expect(
          within(group)
            .getAllByRole('radio')
            .map((r) => r.textContent),
        ).toEqual([
          expect.stringContaining(t.index.bookingType.flight),
          expect.stringContaining(t.index.bookingType.train),
          expect.stringContaining(t.index.bookingType.transit),
          expect.stringContaining(t.index.bookingType.car),
        ]);

        fireEvent.click(within(group).getByRole('radio', { name: t.index.bookingType.car }));
        save();
        expect(verbs.book.mock.calls[0][0].type).toBe('car');
      });

      // The glyph follows the TYPE, not just the category (ADR-0162). It matters beyond the
      // badge: an event's icon carries its time vocabulary through `ICON_TIME_PROFILE`, so
      // while every transport booking arrived as ✈️ the day rail read `המראה` over a hire.
      it('badges the linked event with the picked mode, not the category default', () => {
        render(wrapNav(<EventForm onClose={() => {}} />));
        named('רכב לשבוע');
        pickCategory('transport');
        fireEvent.click(bookedChip());
        // The category's own default is the plane — that part is unchanged.
        const group = typeGroup()!;
        fireEvent.click(within(group).getByRole('radio', { name: t.index.bookingType.car }));
        save();
        expect(bookedEventSeed().icon).toBe('🚗');
      });

      it('does the same for the two modes that were also arriving as ✈️', () => {
        for (const [label, glyph] of [
          [t.index.bookingType.train, '🚄'],
          [t.index.bookingType.transit, '🚌'],
        ] as const) {
          verbs.book.mockClear();
          const { unmount } = render(wrapNav(<EventForm onClose={() => {}} />));
          named('נסיעה');
          pickCategory('transport');
          fireEvent.click(bookedChip());
          fireEvent.click(within(typeGroup()!).getByRole('radio', { name: label }));
          save();
          expect(bookedEventSeed().icon).toBe(glyph);
          unmount();
        }
      });

      it('states the derived type in words, and the statement follows the pick', () => {
        render(wrapNav(<EventForm onClose={() => {}} />));
        pickCategory('transport');
        fireEvent.click(bookedChip());
        const derived = () => document.querySelector('.ef-derived')!.textContent!;
        expect(derived()).toContain(t.eventForm.bookedDerived(t.index.bookingType.flight));

        fireEvent.click(
          within(typeGroup()!).getByRole('radio', { name: t.index.bookingType.transit }),
        );
        expect(derived()).toContain(t.eventForm.bookedDerived(t.index.bookingType.transit));
      });

      it('forgets an explicit type when the category changes, since that is a new question', () => {
        render(wrapNav(<EventForm onClose={() => {}} />));
        named('שינקנסן');
        pickCategory('transport');
        fireEvent.click(bookedChip());
        fireEvent.click(
          within(typeGroup()!).getByRole('radio', { name: t.index.bookingType.train }),
        );
        // The row itself is touched now, so it stays on across both changes — what must not
        // survive them is the explicit TYPE.
        pickCategory('food');
        pickCategory('transport');
        expect(
          within(typeGroup()!)
            .getByRole('radio', { name: t.index.bookingType.flight })
            .getAttribute('aria-checked'),
        ).toBe('true');
      });

      // `other` is not a span type, so `defaultKindForBookingType` makes it soft while flight and
      // train are hard. Deliberately not special-cased: commitment has one source (§4).
      // This used to end `…including other → soft`, because the third pill wrote `other`
      // and `other` is not a span type. ADR-0156 made it `transit`, so **all three
      // transport modes are hard** — a booked bus is as much a commitment as a booked
      // train. ADR-0136 §4's axis is unchanged and is now shown where it still varies:
      // across categories, not within the transport pills.
      it('keeps every transport mode hard, and lets a soft category soften it', () => {
        render(wrapNav(<EventForm onClose={() => {}} />));
        pickCategory('transport');
        const on = () => document.querySelector('.kind-toggle button.on')!.textContent!.trim();
        // The quick journey nobody booked is SOFT — free to move, and in the ripple. This is
        // the flipped default's own consequence, and it needs no special case: `deriveKind`
        // reads the row, and the row is off.
        expect(on()).toBe(t.eventForm.kindSoft);

        fireEvent.click(bookedChip());
        expect(on()).toBe(t.eventForm.kindHard);

        for (const type of [
          t.index.bookingType.train,
          t.index.bookingType.transit,
          // The fourth mode (ADR-0162) is a span type too, so it is hard for the same
          // reason and with no special case: you have committed to the dates.
          t.index.bookingType.car,
        ]) {
          fireEvent.click(within(typeGroup()!).getByRole('radio', { name: type }));
          expect(on()).toBe(t.eventForm.kindHard);
        }

        // A restaurant booking is soft — booked-ness and commitment are different axes.
        pickCategory('food');
        fireEvent.click(screen.getByRole('button', { name: new RegExp(t.eventForm.bookedLabel) }));
        expect(on()).toBe(t.eventForm.kindSoft);
      });
    });

    // ADR-0136 §4 — the load-bearing one. Re-deriving the kind on a conversion would
    // silently HARDEN a soft event the instant the row went on, which ADR-0011 forbids.
    describe('converting an existing event', () => {
      const soft = {
        id: 'ev-1',
        tripId: 't1',
        date: '2026-07-20',
        title: 'מקדש בקיוטו',
        kind: 'soft',
        category: 'sightseeing',
        placeId: 'pl-1',
        status: 'planned',
        sortOrder: 1,
        source: 'manual',
        createdAt: '',
        updatedAt: '',
        updatedBy: 'u1',
      };

      // FAILS if the kind is re-derived from `defaultKindForBookingType`: an `activity` booking is
      // HARD, so this soft sightseeing event would silently harden on a toggle.
      it('PRESERVES the kind rather than re-deriving it', () => {
        render(wrapNav(<EventForm event={soft as never} onClose={() => {}} />));
        expect(document.querySelector('.kind-toggle button.on')!.textContent).toBe(
          t.eventForm.kindSoft,
        );
        fireEvent.click(bookedChip());
        // Still soft, even though the derived `activity` booking's own default is hard.
        expect(document.querySelector('.kind-toggle button.on')!.textContent).toBe(
          t.eventForm.kindSoft,
        );
        save();
        expect(verbs.book).toHaveBeenCalledTimes(1);
      });

      // FAILS if the conversion sends an `event` seed — that would create a SECOND event
      // beside the one being converted.
      it('sends no event seed, and hands the event to the verb for its bookingId patch', () => {
        render(wrapNav(<EventForm event={soft as never} onClose={() => {}} />));
        fireEvent.click(bookedChip());
        save();
        const [input, opts] = verbs.book.mock.calls[0];
        expect(input.event).toBeUndefined();
        expect(opts?.event).toMatchObject({ id: 'ev-1' });
        expect(verbs.update).not.toHaveBeenCalled();
      });

      it('says the place and category will move, which a create does not', () => {
        render(wrapNav(<EventForm event={soft as never} onClose={() => {}} />));
        fireEvent.click(bookedChip());
        expect(document.querySelector('.ef-derived')!.textContent).toContain(
          t.eventForm.bookedDerivedConvert(t.index.bookingType.activity),
        );
      });
    });

    // ── A SAVED EVENT IS AN ANSWER (§2's session-187 amendment) ───────────────
    // The row's initial value read the category and never the event, so `bookingId == null`
    // — a fact the user stated by saving — was re-guessed on every edit. `kind` and `icon`
    // had refused to do exactly that since ADR-0136 §4; this field was the one that didn't.
    describe('reopening an event that was saved unbooked', () => {
      const unbooked = (category: string) => ({
        id: 'ev-9',
        tripId: 't1',
        date: '2026-07-20',
        title: 'נסיעה להאקונה',
        kind: 'soft',
        category,
        placeId: 'pl-1',
        status: 'planned',
        sortOrder: 1,
        source: 'manual',
        createdAt: '',
        updatedAt: '',
        updatedBy: 'u1',
      });

      // FAILS if the row seeds from the category on an existing event. Both categories,
      // because this is about the EVENT being saved, not about which default it would have
      // had — flipping `transport` alone would leave the hotel case broken.
      it.each(['transport', 'lodging'])('leaves the row off for a saved %s event', (category) => {
        render(wrapNav(<EventForm event={unbooked(category) as never} onClose={() => {}} />));
        expect(bookedChip().getAttribute('aria-pressed')).toBe('false');
      });

      // THE WORST SYMPTOM, and the one nobody reported: `dirty` does not count an untouched
      // row, so nothing warned — and then the next save of ANY field took the booked branch,
      // performing §3's ONE-WAY conversion and moving the place onto a new booking.
      it('saves an ordinary edit as an event, never as a booking', () => {
        render(wrapNav(<EventForm event={unbooked('transport') as never} onClose={() => {}} />));
        named('נסיעה להאקונה, מעודכן');
        save();
        expect(verbs.book).not.toHaveBeenCalled();
        expect(verbs.update).toHaveBeenCalledTimes(1);
      });

      // …and the visible one: the location it was saved with must still read as a location,
      // not as one end of a journey with an empty slot beside it.
      it('keeps the single place field rather than swapping in a route', () => {
        render(wrapNav(<EventForm event={unbooked('transport') as never} onClose={() => {}} />));
        expect(screen.queryByRole('button', { name: t.index.form.originLabel })).toBeNull();
        expect(screen.getByRole('button', { name: t.placePicker.open })).toBeTruthy();
      });

      // The `Boolean(event)` half of the fix: an existing event counts as TOUCHED, so
      // re-categorising one mid-edit must not re-arm the row either.
      it('does not re-arm the row when the category changes mid-edit', () => {
        render(wrapNav(<EventForm event={unbooked('transport') as never} onClose={() => {}} />));
        pickCategory('lodging');
        expect(bookedChip().getAttribute('aria-pressed')).toBe('false');
      });
    });

    // §3: on an already-linked event there is no control at all — a statement with a way in,
    // which is also what makes the path one-way without needing a rule for it.
    it('gives an already-linked event a statement instead of a toggle', () => {
      tripState.bookings = [
        { id: 'bk-1', title: 'רמן נאגי', type: 'restaurant', confirmationCode: 'RN-4820' },
      ];
      const linked = {
        id: 'ev-2',
        tripId: 't1',
        date: '2026-07-20',
        title: 'ארוחת ערב',
        kind: 'soft',
        bookingId: 'bk-1',
        status: 'planned',
        sortOrder: 1,
        source: 'manual',
        createdAt: '',
        updatedAt: '',
        updatedBy: 'u1',
      };
      const onOpenBooking = vi.fn();
      render(
        wrapNav(
          <EventForm event={linked as never} onOpenBooking={onOpenBooking} onClose={() => {}} />,
        ),
      );

      // No way to un-book from here: un-converting is a booking DELETE and belongs to the
      // booking's own surface with the confirm it already has.
      expect(
        screen.queryByRole('button', { name: new RegExp(t.eventForm.bookedLabel) }),
      ).toBeNull();
      const statement = document.querySelector('.ef-linked') as HTMLButtonElement;
      expect(statement.textContent).toContain('רמן נאגי');
      expect(statement.textContent).toContain('RN-4820');
      fireEvent.click(statement);
      expect(onOpenBooking).toHaveBeenCalledWith(expect.objectContaining({ id: 'bk-1' }));
      tripState.bookings = [];
    });

    // ── ADR-0154 §1 · THE 400, PINNED ────────────────────────────────────────────
    // This is the reproduction that found the bug, kept as the regression: the row used to
    // send `placeId` whatever the type was, and `bookings.service.ts`'s `assertPlaceShape`
    // rejects that pair for a route-shaped type. It asserts the PAYLOAD rather than a
    // rendered string, because the payload is what the server refused.
    describe('the place shape it sends (ADR-0154 §1)', () => {
      const bookedPayload = () => verbs.book.mock.calls[0]?.[0];

      // THE EXACT REPRODUCTION. Before the fix this produced
      // `{ type: 'flight', title: '…', placeId: 'p-nrt' }` and the server threw
      // `Transport bookings use fromPlaceId/toPlaceId, not placeId` — so a transport event
      // that HAD a place could not be booked at all.
      it('converts an existing transport event with a place without sending placeId', () => {
        tripState.places = [PLACE_A, PLACE_B];
        const existing = {
          id: 'e-1',
          tripId: 't1',
          title: 'טיסה לטוקיו',
          date: '2026-07-20',
          kind: 'soft',
          status: 'planned',
          category: 'transport',
          placeId: 'p-nrt',
          source: 'manual',
          updatedBy: 'u1',
        };
        tripState.events = [existing];
        render(wrapNav(<EventForm event={existing as never} onClose={() => {}} />));
        // The row no longer arrives on for an existing event (session 187), so a conversion
        // is a human tapping it — which is what this reproduction was always about.
        fireEvent.click(bookedChip());
        save();

        const payload = bookedPayload();
        expect(payload).toMatchObject({ type: 'flight' });
        // The exact shape `assertPlaceShape` allows: `placeId` absent, route keys present.
        expect('placeId' in payload).toBe(false);
        // §3's origin seed — the event's one place cannot say which end it is, so it lands
        // in the origin where one tap on the swap can move it.
        expect(payload.fromPlaceId).toBe('p-nrt');
        tripState.places = [];
        tripState.events = [];
      });

      it('sends a route and no placeId for a fresh flight too', () => {
        render(wrapNav(<EventForm onClose={() => {}} />));
        named('טיסה לטוקיו');
        pickCategory('transport');
        fireEvent.click(bookedChip()); // …which defaults the type to flight
        save();

        const payload = bookedPayload();
        expect(payload).toMatchObject({ type: 'flight' });
        expect('placeId' in payload).toBe(false);
      });

      // The other half of the same invariant, so a future change cannot fix one by
      // breaking the other: a single-place type must never carry route keys.
      it('sends a single placeId and NO route for a restaurant', () => {
        render(wrapNav(<EventForm onClose={() => {}} />));
        named('ארוחת ערב');
        pickCategory('food');
        fireEvent.click(screen.getByRole('button', { name: new RegExp(t.eventForm.bookedLabel) }));
        save();

        const payload = bookedPayload();
        expect(payload).toMatchObject({ type: 'restaurant' });
        expect('fromPlaceId' in payload).toBe(false);
        expect('toPlaceId' in payload).toBe(false);
        expect(payload).toHaveProperty('placeId');
      });

      // **The gap is closed** (ADR-0156). This test used to assert the opposite and say so:
      // the `🚌` pill wrote `other`, `other` is not route-shaped, and a bus therefore saved
      // with a single `placeId` and could never be given a route. It writes `transit` now,
      // which carries a route like the other two transport modes.
      it('sends a route and no placeId for a bus, like any other transport', () => {
        render(wrapNav(<EventForm onClose={() => {}} />));
        named('אוטובוס לנמל');
        pickCategory('transport');
        fireEvent.click(bookedChip());
        fireEvent.click(
          within(typeGroup()!).getByRole('radio', { name: t.index.bookingType.transit }),
        );
        save();

        const payload = bookedPayload();
        expect(payload).toMatchObject({ type: 'transit' });
        expect('placeId' in payload).toBe(false);
        expect('fromPlaceId' in payload).toBe(true);
      });

      // A picked route is an edit: closing with one unsaved must hit the discard guard,
      // like every other field. It did not, because `dirty` listed nine fields by hand.
      it('counts a picked route as an unsaved change', () => {
        const onClose = vi.fn();
        render(wrapNav(<EventForm onClose={onClose} />));
        pickCategory('transport');
        fireEvent.click(bookedChip());
        fireEvent.click(screen.getByRole('button', { name: t.index.form.originLabel }));
        // The errand hands the draft over; re-opening with it is how the pick comes back.
        cleanup();
        const draft = startErrand.mock.calls[0]?.[0]?.draft;
        render(wrapNav(<EventForm draft={{ ...draft, fromPlaceId: 'p-tlv' }} onClose={onClose} />));
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).not.toHaveBeenCalled();
        expect(screen.getByText(t.common.discardTitle)).toBeTruthy();
      });

      // ADR-0107: a departure is typed in the ORIGIN's zone, the rule `bookingSheetDraft`
      // already follows. Asserting the INSTANT rather than a chip, because a wrong zone
      // here does not look wrong — it stores a different moment than the one typed.
      it('encodes the times in the origin zone, not the trip primary', () => {
        tripState.places = [PLACE_A, PLACE_B];
        tripState.zoneEvidence = { ...tripState.zoneEvidence, places: [PLACE_A, PLACE_B] };
        // Via the draft, so the date/time/origin are set without driving three widgets.
        render(
          wrapNav(
            <EventForm
              draft={
                {
                  title: 'טיסה לטוקיו',
                  date: '2026-07-20',
                  start: '22:15',
                  end: '',
                  kind: 'hard',
                  kindTouched: false,
                  icon: '✈️',
                  iconTouched: false,
                  booked: true,
                  bookedTouched: true,
                  code: '',
                  bookingType: 'flight',
                  category: 'transport',
                  fromPlaceId: 'p-tlv',
                  override: null,
                } as never
              }
              onClose={() => {}}
            />,
          ),
        );
        save();

        // 22:15 in Asia/Jerusalem (+03) is 19:15Z. Read in the trip's own Asia/Tokyo (+09)
        // — which is what `placeId` would have resolved to with no place picked — it would
        // be 13:15Z, so this fails loudly if the origin stops driving the zone.
        const seed = verbs.book.mock.calls[0]?.[0]?.event as { startsAt?: string } | undefined;
        expect(seed?.startsAt).toBe('2026-07-20T19:15:00.000Z');
        tripState.places = [];
      });

      // An unbooked transport event is still a plain event with one place — the route
      // field belongs to the BOOKING, so it must not appear when nothing is booked.
      it('shows the single place field, not the route field, when nothing is booked', () => {
        render(wrapNav(<EventForm onClose={() => {}} />));
        pickCategory('transport'); // …which now leaves the row off by itself
        expect(screen.queryByRole('button', { name: t.index.form.originLabel })).toBeNull();
        expect(screen.getByRole('button', { name: t.placePicker.open })).toBeTruthy();
      });
    });

    // ADR-0134 §2: the draft is the errand's hand-over blob, and a field missed there is
    // silently lost on a place errand — which for these fields means the save quietly does
    // something different on the way back.
    it('carries every booked field in the errand draft', () => {
      render(wrapNav(<EventForm onClose={() => {}} />));
      named('רמן נאגי');
      pickCategory('transport');
      fireEvent.click(bookedChip());
      fireEvent.click(within(typeGroup()!).getByRole('radio', { name: t.index.bookingType.train }));
      fireEvent.change(screen.getByPlaceholderText(t.eventForm.bookedCodePlaceholder), {
        target: { value: 'RN-4820' },
      });
      // A booked TRAIN is route-shaped (ADR-0154 §2), so the place field is the route
      // field and the errand is per end — which is exactly why `target.field` exists.
      fireEvent.click(screen.getByRole('button', { name: t.index.form.originLabel }));

      expect(startErrand).toHaveBeenCalledWith(
        expect.objectContaining({
          target: expect.objectContaining({ kind: 'event', field: 'fromPlaceId' }),
          draft: expect.objectContaining({
            booked: true,
            bookedTouched: true,
            code: 'RN-4820',
            bookingType: 'train',
            kindTouched: false,
          }),
        }),
      );
    });
  });

  // ADR-0150. The refusal used to be a caption above the save button — below the
  // fold, in a scroll container the user was not looking at, naming a field it did
  // not point to. It now lands ON the field.
  describe('refusing a save', () => {
    const save = () => fireEvent.click(screen.getByText(t.common.save));
    const fieldOf = (el: Element | null) => el?.closest('.field');

    it('marks the title field itself, not just a caption at the foot of the form', () => {
      render(wrapNav(<EventForm onClose={() => {}} />));
      save();
      const title = screen.getByPlaceholderText(t.eventForm.titlePlaceholder);
      expect(fieldOf(title)?.hasAttribute('data-invalid')).toBe(true);
      expect(fieldOf(title)?.querySelector('.field-error')?.textContent).toBe(
        t.eventForm.titleRequired,
      );
      expect(verbs.create).not.toHaveBeenCalled();
    });

    it('marks the day when it falls outside the trip, at the day', () => {
      render(wrapNav(<EventForm onClose={() => {}} />));
      fireEvent.change(screen.getByPlaceholderText(t.eventForm.titlePlaceholder), {
        target: { value: 'ארוחת ערב' },
      });
      const date = document.querySelector('.vt-date input')!;
      fireEvent.change(date, { target: { value: '2026-08-30' } });
      save();
      expect(fieldOf(date)?.hasAttribute('data-invalid')).toBe(true);
      expect(fieldOf(date)?.querySelector('.field-error')?.textContent).toBe(
        t.eventForm.dateOutOfRange,
      );
    });

    it('retires the mark when the field it named is typed in', () => {
      render(wrapNav(<EventForm onClose={() => {}} />));
      save();
      const title = screen.getByPlaceholderText(t.eventForm.titlePlaceholder);
      fireEvent.input(title, { target: { value: 'ארוחת ערב' } });
      expect(fieldOf(title)?.hasAttribute('data-invalid')).toBe(false);
    });
  });

  // ── A derived value follows its source until a person overrides it (field reports #30/#31)
  //
  // Both halves are one distinction — **effective derived value vs explicit user override** —
  // and both are answered by a VALUE TEST rather than a stored flag (`chosenIcon`'s precedent).
  // So the tests that matter most are the reopen ones: what the app persists is the effective
  // value, and reading that back as a human's choice is exactly the defect.
  describe('derived title + icon (field reports #30/#31)', () => {
    const titleBox = () =>
      screen.getByPlaceholderText(t.eventForm.titlePlaceholder) as HTMLInputElement;
    const iconChip = () => screen.getByRole('button', { name: t.iconPicker.open });
    const type = (value: string) => fireEvent.change(titleBox(), { target: { value } });
    const pickCategory = (category: keyof typeof t.iconPicker.categories) =>
      fireEvent.click(
        within(screen.getByRole('radiogroup', { name: t.eventForm.categoryLabel })).getByRole(
          'radio',
          { name: t.iconPicker.categories[category] },
        ),
      );
    /** The place errand's round trip, as the app performs it: the form hands its draft over,
     *  unmounts, and re-opens from that draft with the chosen place assigned into it — which
     *  is the ONLY way a place is picked (`PlacePicker` launches; the Map answers). */
    const errandBack = (placeId: string, onClose = () => {}) => {
      fireEvent.click(screen.getByRole('button', { name: t.placePicker.open }));
      const draft = startErrand.mock.calls.at(-1)?.[0]?.draft;
      cleanup();
      render(wrapNav(<EventForm draft={{ ...draft, placeId }} onClose={onClose} />));
    };

    const saved = (fields: Record<string, unknown>) =>
      ({
        id: 'ev-1',
        tripId: 't1',
        date: '2026-07-20',
        kind: 'soft',
        status: 'planned',
        sortOrder: 0,
        source: 'manual',
        createdAt: '2026-07-19T00:00:00.000Z',
        updatedAt: '2026-07-19T00:00:00.000Z',
        updatedBy: 'u1',
        ...fields,
      }) as unknown as Parameters<typeof EventForm>[0]['event'];

    beforeEach(() => {
      tripState.places = [PLACE_A, PLACE_B];
    });
    afterEach(() => {
      tripState.places = [];
    });

    it('fills a blank untouched title from the place that comes back', () => {
      render(wrapNav(<EventForm onClose={() => {}} />));
      expect(titleBox().value).toBe('');
      errandBack(PLACE_B.id);
      expect(titleBox().value).toBe(PLACE_B.name);
    });

    it('follows a REPLACEMENT place while the title is still derived', () => {
      render(
        wrapNav(
          <EventForm
            event={saved({ title: PLACE_A.name, placeId: PLACE_A.id })}
            onClose={() => {}}
          />,
        ),
      );
      expect(titleBox().value).toBe(PLACE_A.name);
      errandBack(PLACE_B.id);
      expect(titleBox().value).toBe(PLACE_B.name);
    });

    // The whole point of the latch: a name a person typed is theirs, and no later place
    // change may take it back.
    it('keeps a manually typed title through a place change', () => {
      render(wrapNav(<EventForm onClose={() => {}} />));
      type('ארוחת ערב');
      errandBack(PLACE_B.id);
      expect(titleBox().value).toBe('ארוחת ערב');
    });

    // ADR-0134 §2's failure mode, for this field: a flag left off the blob comes back
    // reset, so the errand itself would hand the user's title back to the derivation.
    it('carries the title latch across the errand, in both states', () => {
      render(wrapNav(<EventForm onClose={() => {}} />));
      fireEvent.click(screen.getByRole('button', { name: t.placePicker.open }));
      expect(startErrand.mock.calls.at(-1)?.[0]?.draft).toMatchObject({ titleTouched: false });

      type('ארוחת ערב');
      fireEvent.click(screen.getByRole('button', { name: t.placePicker.open }));
      expect(startErrand.mock.calls.at(-1)?.[0]?.draft).toMatchObject({
        title: 'ארוחת ערב',
        titleTouched: true,
      });
    });

    // Save then reopen, in BOTH directions — the direction that used to be wrong for the
    // icon, and the one that must not break while fixing it.
    it('reopens a place-named event as still derived, and a typed one as chosen', () => {
      render(
        wrapNav(
          <EventForm
            event={saved({ title: PLACE_A.name, placeId: PLACE_A.id })}
            onClose={() => {}}
          />,
        ),
      );
      errandBack(PLACE_B.id);
      expect(titleBox().value).toBe(PLACE_B.name);

      cleanup();
      render(
        wrapNav(
          <EventForm
            event={saved({ title: 'ארוחת ערב', placeId: PLACE_A.id })}
            onClose={() => {}}
          />,
        ),
      );
      errandBack(PLACE_B.id);
      expect(titleBox().value).toBe('ארוחת ערב');
    });

    // An untouched open must never read as dirty — the discard guard would fire on a form
    // nobody typed in, which in Plan mode is a dialog for backing out of a row.
    it('does not count a derived title as an unsaved change on open', () => {
      const onClose = vi.fn();
      render(
        wrapNav(
          <EventForm
            event={saved({ title: PLACE_A.name, placeId: PLACE_A.id })}
            onClose={onClose}
          />,
        ),
      );
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalled();
      expect(screen.queryByText(t.common.discardTitle)).toBeNull();
    });

    // `BookingSheet` deleted its own `titleRequired` once field report #9 gave it a type
    // label to fall back on. An event has no such last resort, so this refusal stays.
    it('still refuses a save on an event with no place and no name', () => {
      render(wrapNav(<EventForm onClose={() => {}} />));
      fireEvent.click(screen.getByText(t.common.save));
      expect(verbs.create).not.toHaveBeenCalled();
      expect(titleBox().closest('.field')?.hasAttribute('data-invalid')).toBe(true);
    });

    it('saves the derived name as the title, with no typing at all', () => {
      render(wrapNav(<EventForm onClose={() => {}} />));
      errandBack(PLACE_B.id);
      fireEvent.click(screen.getByText(t.common.save));
      expect(verbs.create).toHaveBeenCalledWith(expect.objectContaining({ title: PLACE_B.name }));
    });

    // ── #31: the icon ────────────────────────────────────────────────────────────────
    // Storing the effective glyph is not evidence anyone picked it. This is the exact
    // reproduction: before the value test, EVERY saved event carrying any icon reopened as
    // chosen, so the category stopped moving it from the second edit on.
    it('keeps following the category after a save + reopen with no manual pick', () => {
      render(
        wrapNav(
          <EventForm
            event={saved({ title: 'ארוחה', icon: iconForCategory('food'), category: 'food' })}
            onClose={() => {}}
          />,
        ),
      );
      expect(iconChip().textContent).toBe(iconForCategory('food'));
      pickCategory('sightseeing');
      expect(iconChip().textContent).toBe(iconForCategory('sightseeing'));
    });

    it('leaves a genuinely picked glyph alone through a save + reopen + category change', () => {
      render(
        wrapNav(
          <EventForm
            event={saved({ title: 'ארוחה', icon: '🚀', category: 'food' })}
            onClose={() => {}}
          />,
        ),
      );
      pickCategory('sightseeing');
      expect(iconChip().textContent).toBe('🚀');
    });

    // The placeholder glyphs are what `chosenIcon` discards, and the shelf's `💡` is one:
    // scheduling an idea must not arrive already claiming a human chose that pin.
    it('does not convert a maybe item’s placeholder glyph into an override', () => {
      const idea = { id: 'm1', tripId: 't1', title: 'רעיון', icon: '💡' };
      render(wrapNav(<EventForm maybeItem={idea as never} onClose={() => {}} />));
      pickCategory('nature');
      expect(iconChip().textContent).toBe(iconForCategory('nature'));
    });

    it('carries the icon latch across the errand once a glyph is actually picked', () => {
      render(
        wrapNav(
          <EventForm
            event={saved({ title: 'ארוחה', icon: '🚀', category: 'food' })}
            onClose={() => {}}
          />,
        ),
      );
      fireEvent.click(screen.getByRole('button', { name: t.placePicker.open }));
      expect(startErrand.mock.calls.at(-1)?.[0]?.draft).toMatchObject({
        icon: '🚀',
        iconTouched: true,
      });
    });
  });

  // ADR-0109 §11: category is an explicit ChoiceGrid, not derived from the icon.
  it('offers an explicit category selector for a manual event and marks the pick', () => {
    render(wrapNav(<EventForm onClose={() => {}} />));
    const group = screen.getByRole('radiogroup', { name: t.eventForm.categoryLabel });
    const food = within(group).getByRole('radio', { name: t.iconPicker.categories.food });
    expect(food.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(food);
    expect(food.getAttribute('aria-checked')).toBe('true');
  });
  // ── Notes written on the way (ADR-0152 §6b) ───────────────────────────────────────────
  //
  // The ordering claim is the one that matters and the one a unit test can actually hold:
  // the note is written only AFTER its host's write resolves. Offline the outbox is FIFO, so
  // a note that overtook its host would flush first and the server would refuse a host it
  // cannot see — the same defect the document upload had to be built around.
  describe('the composer', () => {
    const composer = () => document.querySelector('.note-compose-in') as HTMLTextAreaElement;
    const save = () => fireEvent.click(screen.getByText(t.common.save));
    const nameIt = (title = 'ארוחת ערב') =>
      fireEvent.input(screen.getByPlaceholderText(t.eventForm.titlePlaceholder), {
        target: { value: title },
      });

    it('writes nothing when the box was never touched', async () => {
      render(wrapNav(<EventForm onClose={() => {}} />));
      nameIt();
      save();
      await waitFor(() => expect(verbs.create).toHaveBeenCalled());
      expect(tripState.noteVerbs.createNote).not.toHaveBeenCalled();
    });

    it('takes what is still in the box at save, hosted by the new event', async () => {
      render(wrapNav(<EventForm onClose={() => {}} />));
      nameIt();
      fireEvent.change(composer(), { target: { value: 'להזמין מקום ליד החלון' } });
      save();

      await waitFor(() => expect(tripState.noteVerbs.createNote).toHaveBeenCalledTimes(1));
      // The SAME id the event was created with — the client mints it, so the FK is valid
      // whether the write went out or was queued.
      const id = verbs.create.mock.calls[0][0].id;
      expect(tripState.noteVerbs.createNote).toHaveBeenCalledWith({
        body: 'להזמין מקום ליד החלון',
        eventId: id,
      });
    });

    it('waits for the host: the event resolves BEFORE the note is written', async () => {
      const order: string[] = [];
      let release!: () => void;
      verbs.create.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            order.push('event');
            release = () => resolve();
          }),
      );
      tripState.noteVerbs.createNote.mockImplementation(() => {
        order.push('note');
        return Promise.resolve(undefined);
      });

      render(wrapNav(<EventForm onClose={() => {}} />));
      nameIt();
      fireEvent.change(composer(), { target: { value: 'פתק' } });
      save();

      await waitFor(() => expect(order).toEqual(['event']));
      expect(tripState.noteVerbs.createNote).not.toHaveBeenCalled();
      release();
      await waitFor(() => expect(order).toEqual(['event', 'note']));
    });

    // The event this path creates is materialized by the SERVER from a seed (ADR-0093), so
    // there is no client event id — the booking's is the one that exists, and it is where
    // the same note would have been written from `BookingSheet`.
    it('hosts the notes on the BOOKING when יש הזמנה is on', async () => {
      render(wrapNav(<EventForm onClose={() => {}} />));
      nameIt('לינה בשינג׳וקו');
      fireEvent.click(screen.getByRole('button', { name: new RegExp(t.eventForm.bookedLabel) }));
      fireEvent.change(composer(), { target: { value: 'קוד הכספת 4417' } });
      save();

      await waitFor(() => expect(tripState.noteVerbs.createNote).toHaveBeenCalledTimes(1));
      expect(tripState.noteVerbs.createNote).toHaveBeenCalledWith({
        body: 'קוד הכספת 4417',
        bookingId: 'bk-new',
      });
    });

    // ADR-0152 §6b's last paragraph, missed when this form was first wired: on edit the
    // existing notes read ABOVE the same one box. It matters most in **Plan mode**, where
    // this form is the only way into an event at all — until now a whole mode could neither
    // read an event's notes nor write one, which is how the owner found it.
    const existing = {
      id: 'ev-1',
      tripId: 't1',
      date: '2026-07-20',
      title: 'ארוחת ערב',
      kind: 'soft',
      status: 'planned',
      sortOrder: 0,
      source: 'manual',
      createdAt: '2026-07-19T00:00:00.000Z',
      updatedAt: '2026-07-19T00:00:00.000Z',
      updatedBy: 'u1',
    } as unknown as Parameters<typeof EventForm>[0]['event'];

    it('lists the existing notes above the box when editing, with one way to add', () => {
      tripState.notes = [
        {
          id: 'n1',
          tripId: 't1',
          eventId: 'ev-1',
          body: 'הכניסה מאחור',
          source: 'member',
          createdBy: 'u1',
          createdAt: '2026-07-19T00:00:00.000Z',
          updatedAt: '2026-07-19T00:00:00.000Z',
          updatedBy: 'u1',
        },
      ];
      render(wrapNav(<EventForm event={existing} onClose={() => {}} />));

      const section = document.querySelector('.note-sec') as HTMLElement;
      expect(section.textContent).toContain('הכניסה מאחור');
      // ONE way to add, and it is the box — the section's `＋ פתק` would open a second
      // sheet over a form that is already asking for a save.
      expect(section.querySelector('.add')).toBeNull();
      const box = document.querySelector('.note-compose-in') as HTMLElement;
      expect(section.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('writes a note typed while editing onto the event being edited', async () => {
      render(wrapNav(<EventForm event={existing} onClose={() => {}} />));
      fireEvent.change(composer(), { target: { value: 'לבקש את שולחן הגג' } });
      fireEvent.click(screen.getByText(t.common.save));

      await waitFor(() => expect(tripState.noteVerbs.createNote).toHaveBeenCalledTimes(1));
      expect(tripState.noteVerbs.createNote).toHaveBeenCalledWith({
        body: 'לבקש את שולחן הגג',
        eventId: 'ev-1',
      });
    });
  });
});

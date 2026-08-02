// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { wrapNav } from '../test/nav-harness';
import { BOOKING_SOURCE, BOOKING_TYPE, type Booking, type Place } from '@waypoint/shared';

Element.prototype.scrollIntoView = vi.fn();

const places: Place[] = [
  {
    id: 'pl-tlv',
    tripId: 't1',
    name: 'תל אביב',
    lat: 32,
    lng: 34.8,
    timezone: 'Asia/Jerusalem',
    createdAt: '',
    updatedAt: '',
    updatedBy: 'u',
  },
  {
    id: 'pl-nrt',
    tripId: 't1',
    name: 'טוקיו',
    lat: 35.7,
    lng: 139.7,
    timezone: 'Asia/Tokyo',
    createdAt: '',
    updatedAt: '',
    updatedBy: 'u',
  },
  // A coordless Place-lite: minted offline or when Google matched nothing, so it
  // has NO timezone — the case the zone override exists for (ADR-0107 §6).
  { id: 'pl-lite', tripId: 't1', name: 'קפלאוויק', createdAt: '', updatedAt: '', updatedBy: 'u' },
];

const indexVerbs = {
  createBooking: vi.fn(),
  updateBooking: vi.fn(),
  createPlace: vi.fn(),
  resolvePlace: vi.fn(),
};

// Typed args, so the assertions below can read what the form actually sent rather than
// asserting against a `never`.
const noteVerbs = {
  createNote: vi.fn(async (_input: { body: string; bookingId?: string }) => {}),
  updateNote: vi.fn(async (_id: string, _input: unknown) => {}),
  deleteNote: vi.fn(async (_id: string) => {}),
};
// The whole trip's bookings — what the derived round-trip pair reads (ADR-0154 §5).
let tripBookings: Booking[] = [];

const trip = {
  id: 't1',
  name: 'טיול',
  timezone: 'Asia/Tokyo',
  startDate: '2026-07-19',
  endDate: '2026-07-30',
};

vi.mock('../state/trip-state', () => ({
  useTrip: () => ({
    trip,
    events: [],
    bookings: tripBookings,
    maybeItems: [],
    places,
    indexVerbs,
    notes: [],
    users: [],
    noteVerbs,
  }),
}));

import { BookingSheet } from './BookingSheet';
import { bookingSheetDraft, type BookingSheetDraft } from '../lib/booking-draft';
import { routeTitle } from '../lib/route-title';
import { zonedIso } from '../lib/time';
import { t } from '../i18n/he';

const flight: Booking = {
  id: 'bk',
  tripId: 't1',
  type: BOOKING_TYPE.FLIGHT,
  title: 'תל אביב → טוקיו',
  fromPlaceId: 'pl-tlv',
  toPlaceId: 'pl-nrt',
  source: BOOKING_SOURCE.MANUAL,
  createdAt: '',
  updatedAt: '',
  updatedBy: 'u',
};

describe('BookingSheet — transport route as picked places (ADR-0113 follow-up)', () => {
  afterEach(() => cleanup());

  it('a transport booking shows its endpoints as place pickers + a route preview', () => {
    render(wrapNav(<BookingSheet booking={flight} onClose={() => {}} />));
    // Both endpoint names render (the title-row RouteLabel preview + each picker
    // trigger), and there's no longer a free-text route input.
    expect(screen.getAllByText('תל אביב').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('טוקיו').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(t.index.form.routeLabel)).toBeTruthy();
    // The origin/destination pickers are labelled place pickers, not text inputs.
    expect(screen.getByRole('button', { name: t.index.form.originLabel })).toBeTruthy();
    expect(screen.getByRole('button', { name: t.index.form.destLabel })).toBeTruthy();
  });

  it('a fresh transport booking shows the route-preview ghost until endpoints are picked', () => {
    render(
      wrapNav(
        <BookingSheet booking={null} seed={{ type: BOOKING_TYPE.FLIGHT }} onClose={() => {}} />,
      ),
    );
    expect(screen.getByText(t.index.form.routePreviewGhost)).toBeTruthy();
  });

  it('shows a zone note so each leg reads in its own zone (ADR-0107 form authoring)', () => {
    // The sheet renders through a Modal portal, so query the document, not the
    // render container.
    render(wrapNav(<BookingSheet booking={flight} onClose={() => {}} />));
    // The flight crosses zones (Jerusalem → Tokyo, Tokyo 6h ahead): the note says
    // each end is local time + the destination is ahead — no English city names.
    const note = document.querySelector('.bs-zone-note');
    expect(note).not.toBeNull();
    expect(note!.textContent).toContain('זמן מקומי בכל עיר');
    expect(note!.textContent).toContain('קדימה'); // destination (Tokyo) ahead
    expect(note!.textContent).not.toContain('Tokyo');
    expect(note!.textContent).not.toContain('Jerusalem');
  });
});

describe('BookingSheet — per-end zone overrides (ADR-0107 §6 session-99 amendment)', () => {
  afterEach(() => {
    cleanup();
    indexVerbs.updateBooking.mockClear();
  });

  /** A flight between a real place and a coordless Place-lite: the destination's
   *  zone is unknowable, which is exactly when the chip becomes editable. */
  const halfKnown: Booking = { ...flight, toPlaceId: 'pl-lite' };

  const chips = () => Array.from(document.querySelectorAll('.zchip'));

  it('states each leg zone, and only the unknowable end is correctable', () => {
    render(wrapNav(<BookingSheet booking={halfKnown} onClose={() => {}} />));
    const [start, end] = chips();
    // Origin: a real place answers the zone → a statement, no control (§3 — the
    // honest edit is the place itself).
    expect(start.querySelector('.zchip-btn')).toBeNull();
    expect(start.querySelector('.zchip-zone')!.textContent).toContain('Jerusalem');
    // Destination: coordless, so nothing derives it → editable.
    expect(end.querySelector('.zchip-btn')).not.toBeNull();
  });

  it('both legs are correctable when neither endpoint resolves a zone', () => {
    render(
      wrapNav(
        <BookingSheet
          booking={{ ...flight, fromPlaceId: 'pl-lite', toPlaceId: 'pl-lite' }}
          onClose={() => {}}
        />,
      ),
    );
    expect(chips().every((c) => c.querySelector('.zchip-btn'))).toBe(true);
  });

  it('pins ONE end only — a crossing needs two overrides, not one for both', () => {
    render(wrapNav(<BookingSheet booking={halfKnown} onClose={() => {}} />));
    fireEvent.click(chips()[1].querySelector<HTMLElement>('.zchip-btn')!);
    fireEvent.change(screen.getByPlaceholderText(t.zonePicker.searchPlaceholder), {
      target: { value: 'reykjavik' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Reykjavik/ }));
    fireEvent.click(screen.getByText(t.common.save));

    const patch = indexVerbs.updateBooking.mock.calls[0][1];
    expect(patch.endDisplayTimezone).toBe('Atlantic/Reykjavik');
    // The origin still derives from its place, so nothing is written for it.
    expect('startDisplayTimezone' in patch).toBe(false);
  });

  it('reads a stored override back as pinned, and the reset clears it with null', () => {
    render(
      wrapNav(
        <BookingSheet
          booking={{ ...halfKnown, endDisplayTimezone: 'Atlantic/Reykjavik' }}
          onClose={() => {}}
        />,
      ),
    );
    const end = chips()[1];
    expect(end.querySelector('.zchip-btn.pinned')).not.toBeNull();
    expect(end.querySelector('.zchip-zone')!.textContent).toContain('Reykjavik');

    fireEvent.click(end.querySelector<HTMLElement>('.zchip-reset')!);
    fireEvent.click(screen.getByText(t.common.save));
    expect(indexVerbs.updateBooking.mock.calls[0][1].endDisplayTimezone).toBeNull();
  });

  it('a single-place booking has one chip, and saving clears the unused end', () => {
    render(
      wrapNav(
        <BookingSheet
          booking={{
            ...flight,
            type: BOOKING_TYPE.RESTAURANT,
            fromPlaceId: undefined,
            toPlaceId: undefined,
            placeId: 'pl-lite',
          }}
          onClose={() => {}}
        />,
      ),
    );
    expect(chips()).toHaveLength(1);
    fireEvent.click(chips()[0].querySelector<HTMLElement>('.zchip-btn')!);
    fireEvent.change(screen.getByPlaceholderText(t.zonePicker.searchPlaceholder), {
      target: { value: 'reykjavik' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Reykjavik/ }));
    fireEvent.click(screen.getByText(t.common.save));

    const patch = indexVerbs.updateBooking.mock.calls[0][1];
    // One zone drives both ends for a single-place booking, so `start` carries it
    // and nothing is written for the unused end.
    expect(patch.startDisplayTimezone).toBe('Atlantic/Reykjavik');
    expect('endDisplayTimezone' in patch).toBe(false);
  });

  it('an untouched form sends no zone keys at all', () => {
    render(wrapNav(<BookingSheet booking={halfKnown} onClose={() => {}} />));
    fireEvent.click(screen.getByText(t.common.save));
    const patch = indexVerbs.updateBooking.mock.calls[0][1];
    expect('startDisplayTimezone' in patch).toBe(false);
    expect('endDisplayTimezone' in patch).toBe(false);
  });
});

// ADR-0150. A booking's refusal is at the field it is about — and a span refuses
// per LEG, for the same reason it carries a zone per leg: marking both ends when
// one is fine is the refusal naming something that isn't wrong.
describe('BookingSheet — refusing a save', () => {
  afterEach(() => {
    cleanup();
    indexVerbs.createBooking.mockClear();
  });

  const fieldOf = (el: Element | null) => el?.closest('.field');

  it('marks the identity row when a booking has no name, and saves nothing', () => {
    render(
      wrapNav(
        <BookingSheet booking={null} seed={{ type: BOOKING_TYPE.HOTEL }} onClose={() => {}} />,
      ),
    );
    fireEvent.click(screen.getByText(t.common.save));
    const title = screen.getByPlaceholderText(t.index.sheet.titlePlaceholder);
    expect(fieldOf(title)?.hasAttribute('data-invalid')).toBe(true);
    expect(fieldOf(title)?.querySelector('.field-error')?.textContent).toBe(
      t.index.form.titleRequired,
    );
    expect(indexVerbs.createBooking).not.toHaveBeenCalled();
  });

  it('marks the route field when a transport has no endpoints', () => {
    render(
      wrapNav(
        <BookingSheet booking={null} seed={{ type: BOOKING_TYPE.FLIGHT }} onClose={() => {}} />,
      ),
    );
    fireEvent.click(screen.getByText(t.common.save));
    const route = screen.getByRole('button', { name: t.index.form.originLabel });
    expect(fieldOf(route)?.hasAttribute('data-invalid')).toBe(true);
    expect(fieldOf(route)?.querySelector('.field-error')?.textContent).toBe(
      t.index.form.routeRequired,
    );
  });

  it('marks only the leg that falls outside the trip', () => {
    render(wrapNav(<BookingSheet booking={flight} onClose={() => {}} />));
    const [depDate, arrDate] = [...document.querySelectorAll<HTMLInputElement>('.wf-date-val')];
    fireEvent.change(depDate, { target: { value: '2026-07-20' } });
    fireEvent.change(arrDate, { target: { value: '2026-08-30' } });
    fireEvent.click(screen.getByText(t.common.save));
    expect(fieldOf(depDate)?.hasAttribute('data-invalid')).toBe(false);
    expect(fieldOf(arrDate)?.hasAttribute('data-invalid')).toBe(true);
    expect(fieldOf(arrDate)?.querySelector('.field-error')?.textContent).toBe(
      t.index.form.dateOutOfRange,
    );
  });
});

// The note is written ON THE WAY (ADR-0152 §6b): the booking form carries a composer, and
// the booking's own save commits both. This is the first host to get it, and the shape
// every other host will copy.
describe('BookingSheet — notes written on the way', () => {
  afterEach(() => {
    cleanup();
    indexVerbs.createBooking.mockClear();
    noteVerbs.createNote.mockClear();
  });

  const openHotel = () =>
    render(
      wrapNav(
        <BookingSheet booking={null} seed={{ type: BOOKING_TYPE.HOTEL }} onClose={() => {}} />,
      ),
    );
  const nameIt = () =>
    fireEvent.change(screen.getByPlaceholderText(t.index.sheet.titlePlaceholder), {
      target: { value: 'מלון שינג׳וקו גרנבל' },
    });
  // By class, not by placeholder: the placeholder deliberately changes to `פתק נוסף` once
  // a note is committed, so a placeholder lookup would find nothing on the second one.
  const composer = () => document.querySelector('.note-compose-in') as HTMLTextAreaElement;
  const save = () => fireEvent.click(screen.getByText(t.common.save));

  it('writes no note when the composer was never touched', async () => {
    indexVerbs.createBooking.mockResolvedValue({ id: 'b-new' });
    openHotel();
    nameIt();
    save();
    await waitFor(() => expect(indexVerbs.createBooking).toHaveBeenCalled());
    expect(noteVerbs.createNote).not.toHaveBeenCalled();
  });

  // The common case, and the whole point of §6b: no extra press.
  it('takes what is still in the box at save, with no ＋ pressed', async () => {
    indexVerbs.createBooking.mockResolvedValue({ id: 'b-new' });
    openHotel();
    nameIt();
    fireEvent.change(composer(), { target: { value: 'קוד הכספת 4417' } });
    save();

    await waitFor(() => expect(noteVerbs.createNote).toHaveBeenCalledTimes(1));
    expect(noteVerbs.createNote).toHaveBeenCalledWith({
      body: 'קוד הכספת 4417',
      bookingId: 'b-new',
    });
  });

  it('writes several, in the order they were typed, all hosted by the booking', async () => {
    indexVerbs.createBooking.mockResolvedValue({ id: 'b-new' });
    openHotel();
    nameIt();
    fireEvent.change(composer(), { target: { value: 'הראשון' } });
    fireEvent.click(screen.getByLabelText(t.notes.composer.add));
    fireEvent.change(composer(), { target: { value: 'השני' } });
    save();

    await waitFor(() => expect(noteVerbs.createNote).toHaveBeenCalledTimes(2));
    expect(noteVerbs.createNote.mock.calls.map((c) => c[0].body)).toEqual(['הראשון', 'השני']);
  });

  // A hosted note is written with NO category: it resolves from the host at render
  // (ADR-0152 §5's amendment), so the form must not send one.
  it('sends no category and no title — both are spared from the user', async () => {
    indexVerbs.createBooking.mockResolvedValue({ id: 'b-new' });
    openHotel();
    nameIt();
    fireEvent.change(composer(), { target: { value: 'משהו' } });
    save();

    await waitFor(() => expect(noteVerbs.createNote).toHaveBeenCalled());
    const input = noteVerbs.createNote.mock.calls[0][0];
    expect(input).not.toHaveProperty('category');
    expect(input).not.toHaveProperty('title');
  });

  // The refusal runs first: a form that will not save must not leave notes behind.
  it('writes nothing at all when the booking itself is refused', async () => {
    openHotel();
    fireEvent.change(composer(), { target: { value: 'לא אמור להישמר' } });
    save();
    expect(indexVerbs.createBooking).not.toHaveBeenCalled();
    expect(noteVerbs.createNote).not.toHaveBeenCalled();
  });
});

// **The round trip** (ADR-0154 §4/§6): one control on the route field, a second span, one
// save that writes two bookings. The sheet is opened through `draft` rather than by picking
// places — a `PlacePicker` tap is an ERRAND to the Map (ADR-0134 §1), so the errand-return
// path is also the only way a unit test can start from a routed form. That is the same
// entry point a real user comes back through, not a shortcut around one.
describe('BookingSheet — a round trip is one save and two bookings', () => {
  afterEach(() => {
    cleanup();
    indexVerbs.createBooking.mockReset();
    noteVerbs.createNote.mockClear();
  });

  const routed = (over: Partial<BookingSheetDraft> = {}): BookingSheetDraft => ({
    ...bookingSheetDraft({
      booking: null,
      seed: { type: BOOKING_TYPE.FLIGHT },
      trip,
      events: [],
      places,
    }),
    fromPlaceId: 'pl-tlv',
    toPlaceId: 'pl-nrt',
    ...over,
  });
  const open = (over?: Partial<BookingSheetDraft>) =>
    render(wrapNav(<BookingSheet booking={null} draft={routed(over)} onClose={() => {}} />));
  const goRoundTrip = () => fireEvent.click(screen.getByText(t.index.form.roundTrip));
  const legs = () => [...document.querySelectorAll<HTMLElement>('.wf-leg')];
  const setDate = (leg: HTMLElement, value: string) =>
    fireEvent.change(leg.querySelector('.wf-date-val') as HTMLInputElement, { target: { value } });
  // Through the panel's exact <input type="time">, which is the picker's own precise
  // path — the 15-minute list can't express every instant these assertions need.
  const setTime = (leg: HTMLElement, value: string) => {
    fireEvent.click(leg.querySelector('button.tp-field') as HTMLElement);
    fireEvent.change(leg.querySelector('.tp-time-input') as HTMLInputElement, {
      target: { value },
    });
  };
  const save = () => fireEvent.click(screen.getByText(t.common.save));

  it('offers the direction control on a transport create, and defaults to one way', () => {
    open();
    expect(screen.getByText(t.index.form.oneWay)).toBeTruthy();
    expect(screen.getByText(t.index.form.roundTrip)).toBeTruthy();
    // Default OFF: no return block, and no leg headings on the single journey either.
    expect(document.querySelector('.bs-leg-return')).toBeNull();
    expect(document.querySelectorAll('.bs-leg-head').length).toBe(0);
    expect(legs().length).toBe(2);
  });

  it('does not offer it on a type that has no route to mirror', () => {
    render(
      wrapNav(
        <BookingSheet booking={null} seed={{ type: BOOKING_TYPE.HOTEL }} onClose={() => {}} />,
      ),
    );
    expect(screen.queryByText(t.index.form.roundTrip)).toBeNull();
  });

  it('does not offer it when editing an existing leg', () => {
    render(wrapNav(<BookingSheet booking={flight} onClose={() => {}} />));
    expect(screen.queryByText(t.index.form.roundTrip)).toBeNull();
  });

  it('adds the second span and BOTH leg headings on the tap', () => {
    open();
    goRoundTrip();
    expect(document.querySelector('.bs-leg-return')).toBeTruthy();
    expect(legs().length).toBe(4);
    const heads = [...document.querySelectorAll('.bs-leg-head span')].map((e) => e.textContent);
    expect(heads).toContain(t.index.form.legOut);
    expect(heads).toContain(t.index.form.legBack);
  });

  it('writes two bookings with mirrored routes and titles, in one change group', async () => {
    indexVerbs.createBooking.mockResolvedValue({ id: 'b-out' });
    open();
    goRoundTrip();
    const [out1, out2, back1, back2] = legs();
    setDate(out1, '2026-07-19');
    setTime(out1, '09:00');
    setDate(out2, '2026-07-20');
    setTime(out2, '05:00');
    setDate(back1, '2026-07-28');
    setTime(back1, '11:00');
    setDate(back2, '2026-07-28');
    setTime(back2, '18:00');
    save();

    await waitFor(() => expect(indexVerbs.createBooking).toHaveBeenCalledTimes(2));
    const [outbound] = indexVerbs.createBooking.mock.calls[0];
    const [back] = indexVerbs.createBooking.mock.calls[1];
    expect(outbound).toMatchObject({ fromPlaceId: 'pl-tlv', toPlaceId: 'pl-nrt' });
    expect(back).toMatchObject({ fromPlaceId: 'pl-nrt', toPlaceId: 'pl-tlv' });
    // Nobody types either name — `routeTitle` derives both, so the return reads backwards.
    expect(back.title).toBe(routeTitle('טוקיו', 'תל אביב'));
    expect(back.type).toBe(BOOKING_TYPE.FLIGHT);
  });

  it('reads the return in the SWAPPED zones — it flies the route backwards', async () => {
    indexVerbs.createBooking.mockResolvedValue({ id: 'b-out' });
    open();
    goRoundTrip();
    const [out1, out2, back1, back2] = legs();
    setDate(out1, '2026-07-19');
    setTime(out1, '09:00');
    setDate(out2, '2026-07-20');
    setTime(out2, '05:00');
    setDate(back1, '2026-07-28');
    setTime(back1, '11:00');
    setDate(back2, '2026-07-28');
    setTime(back2, '18:00');
    save();

    await waitFor(() => expect(indexVerbs.createBooking).toHaveBeenCalledTimes(2));
    const back = indexVerbs.createBooking.mock.calls[1][0];
    // Departs Tokyo (the outbound's DESTINATION) and lands in Tel Aviv.
    expect(back.event.startsAt).toBe(zonedIso('2026-07-28', '11:00', 'Asia/Tokyo'));
    expect(back.event.endsAt).toBe(zonedIso('2026-07-28', '18:00', 'Asia/Jerusalem'));
  });

  it('refuses a return that leaves before the outbound has landed, on that field', async () => {
    open();
    goRoundTrip();
    const [out1, out2, back1, back2] = legs();
    setDate(out1, '2026-07-19');
    setTime(out1, '09:00');
    setDate(out2, '2026-07-20');
    setTime(out2, '05:00');
    // Same day as the arrival, but two hours before it — a real instant comparison,
    // which a date-only check would wave through.
    setDate(back1, '2026-07-20');
    setTime(back1, '03:00');
    setDate(back2, '2026-07-20');
    setTime(back2, '10:00');
    save();

    // Each span leg wears its own `Field`, which is what carries the mark (ADR-0150).
    const marked = (leg: HTMLElement) => leg.closest('.field');
    expect(marked(back1)?.hasAttribute('data-invalid')).toBe(true);
    expect(marked(back1)?.querySelector('.field-error')?.textContent).toBe(
      t.index.form.returnBeforeArrival,
    );
    // The three fields that are fine are not marked, and nothing was written.
    expect(marked(out1)?.hasAttribute('data-invalid')).toBe(false);
    expect(marked(out2)?.hasAttribute('data-invalid')).toBe(false);
    expect(marked(back2)?.hasAttribute('data-invalid')).toBe(false);
    expect(indexVerbs.createBooking).not.toHaveBeenCalled();
  });

  // ADR-0154 §6. Both legs have client-generated ids, so `hostId` would otherwise be
  // whichever `createBooking` ran LAST — the return, by statement order.
  it('hangs a note written on the way on the OUTBOUND', async () => {
    indexVerbs.createBooking
      .mockResolvedValueOnce({ id: 'b-out' })
      .mockResolvedValueOnce({ id: 'b-back' });
    open();
    goRoundTrip();
    const [out1, out2, back1, back2] = legs();
    setDate(out1, '2026-07-19');
    setTime(out1, '09:00');
    setDate(out2, '2026-07-20');
    setTime(out2, '05:00');
    setDate(back1, '2026-07-28');
    setTime(back1, '11:00');
    setDate(back2, '2026-07-28');
    setTime(back2, '18:00');
    fireEvent.change(document.querySelector('.note-compose-in') as HTMLTextAreaElement, {
      target: { value: 'מושב ליד החלון בשתי הטיסות' },
    });
    save();

    await waitFor(() => expect(noteVerbs.createNote).toHaveBeenCalledTimes(1));
    expect(noteVerbs.createNote).toHaveBeenCalledWith({
      body: 'מושב ליד החלון בשתי הטיסות',
      bookingId: 'b-out',
    });
  });
});

// The pair's second surface (ADR-0154 §5): the delete prompt says the other leg
// survives. A STATEMENT — the dialog must not grow a fourth verb (ADR-0138 §2).
describe('BookingSheet — deleting one leg of a derived pair', () => {
  const backLeg: Booking = {
    ...flight,
    id: 'bk-back',
    title: 'טוקיו → תל אביב',
    fromPlaceId: 'pl-nrt',
    toPlaceId: 'pl-tlv',
  };
  afterEach(() => {
    cleanup();
    tripBookings = [];
  });

  const openDelete = () => {
    render(wrapNav(<BookingSheet booking={flight} onClose={() => {}} />));
    fireEvent.click(screen.getByText(t.index.sheet.delete));
  };

  it('names the surviving leg, and adds no button to say so', () => {
    tripBookings = [flight, backLeg];
    openDelete();
    // Neither leg is scheduled here, so the subject reads as the outbound and the
    // partner as the return.
    expect(screen.getByText(t.index.del.pairNote('back'))).toBeTruthy();
    // Still the plain confirm's two: מחק and בטל. No third choice appeared.
    expect(screen.queryByText(t.index.del.both)).toBeNull();
    expect(screen.queryByText(t.index.del.unlink)).toBeNull();
    expect(screen.getByText(t.index.del.confirmDelete)).toBeTruthy();
  });

  it('says nothing about a pair when there is none', () => {
    tripBookings = [flight];
    openDelete();
    expect(screen.queryByText(t.index.del.pairNote('back'))).toBeNull();
    expect(screen.queryByText(t.index.del.pairNote('out'))).toBeNull();
  });
});

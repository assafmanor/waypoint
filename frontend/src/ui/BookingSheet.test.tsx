// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { wrapNav } from '../test/nav-harness';
import {
  BOOKING_SOURCE,
  BOOKING_TYPE,
  type Booking,
  type Note,
  type Place,
} from '@waypoint/shared';

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
  {
    id: 'pl-dxb',
    tripId: 't1',
    name: 'דובאי',
    lat: 25.2,
    lng: 55.4,
    timezone: 'Asia/Dubai',
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
// The whole trip's notes — what `HostNotes` reads to list a booking's existing ones on
// edit (ADR-0152 §6b). Mutable for the same reason `tripBookings` is: the mock object is
// rebuilt per `useTrip()` call, so a test can seed this and re-render.
let tripNotes: Note[] = [];

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
    notes: tripNotes,
    users: [],
    noteVerbs,
  }),
}));

import { BookingSheet } from './BookingSheet';
import { bookingSheetDraft, type BookingSheetDraft } from '../lib/booking-draft';
import { routeTitle } from '../lib/route-title';
import { zonedIso } from '../lib/time';
import { setSimulatedNow } from '../lib/useClock';
import { t } from '../i18n/he';

// **The sheet is stepped now** (ADR-0155 §5): `שמירה` lives on the LAST step, and the
// primary is `הבא` until then. These are the whole diff to this file — every assertion
// below is the one it always made, taken on the step that owns the field.
const next = () => fireEvent.click(screen.getByText(t.common.steps.next));
/** Walk to the last step. Each `הבא` runs that step's gate, so a form this refuses does
 *  not arrive — which is the point, and what the refusal tests below assert. */
const toLastStep = () => {
  next();
  next();
};
const save = () => fireEvent.click(screen.getByText(t.common.save));
const saveFrom = (step: 'what' | 'when' | 'more') => {
  if (step === 'what') toLastStep();
  else if (step === 'when') next();
  save();
};

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
    // The schedule and its zone chips are the SECOND step now (ADR-0155 §5).
    // The sheet renders through a Modal portal, so query the document, not the
    // render container.
    render(wrapNav(<BookingSheet booking={flight} onClose={() => {}} />));
    next();
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

  // The chips ride the schedule, which is the `when` step (ADR-0155 §5) — so every test
  // here steps once before it can see them.
  const chips = () => Array.from(document.querySelectorAll('.zchip'));
  const openWhen = (booking: Booking) => {
    render(wrapNav(<BookingSheet booking={booking} onClose={() => {}} />));
    next();
  };

  it('states each leg zone, and only the unknowable end is correctable', () => {
    openWhen(halfKnown);
    const [start, end] = chips();
    // Origin: a real place answers the zone → a statement, no control (§3 — the
    // honest edit is the place itself).
    expect(start.querySelector('.zchip-btn')).toBeNull();
    expect(start.querySelector('.zchip-zone')!.textContent).toContain('Jerusalem');
    // Destination: coordless, so nothing derives it → editable.
    expect(end.querySelector('.zchip-btn')).not.toBeNull();
  });

  it('both legs are correctable when neither endpoint resolves a zone', () => {
    openWhen({ ...flight, fromPlaceId: 'pl-lite', toPlaceId: 'pl-lite' });
    expect(chips().every((c) => c.querySelector('.zchip-btn'))).toBe(true);
  });

  it('pins ONE end only — a crossing needs two overrides, not one for both', () => {
    openWhen(halfKnown);
    fireEvent.click(chips()[1].querySelector<HTMLElement>('.zchip-btn')!);
    fireEvent.change(screen.getByPlaceholderText(t.zonePicker.searchPlaceholder), {
      target: { value: 'reykjavik' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Reykjavik/ }));
    saveFrom('when');

    const patch = indexVerbs.updateBooking.mock.calls[0][1];
    expect(patch.endDisplayTimezone).toBe('Atlantic/Reykjavik');
    // The origin still derives from its place, so nothing is written for it.
    expect('startDisplayTimezone' in patch).toBe(false);
  });

  it('reads a stored override back as pinned, and the reset clears it with null', () => {
    openWhen({ ...halfKnown, endDisplayTimezone: 'Atlantic/Reykjavik' });
    const end = chips()[1];
    expect(end.querySelector('.zchip-btn.pinned')).not.toBeNull();
    expect(end.querySelector('.zchip-zone')!.textContent).toContain('Reykjavik');

    fireEvent.click(end.querySelector<HTMLElement>('.zchip-reset')!);
    saveFrom('when');
    expect(indexVerbs.updateBooking.mock.calls[0][1].endDisplayTimezone).toBeNull();
  });

  it('a single-place booking has one chip, and saving clears the unused end', () => {
    openWhen({
      ...flight,
      type: BOOKING_TYPE.RESTAURANT,
      fromPlaceId: undefined,
      toPlaceId: undefined,
      placeId: 'pl-lite',
    });
    expect(chips()).toHaveLength(1);
    fireEvent.click(chips()[0].querySelector<HTMLElement>('.zchip-btn')!);
    fireEvent.change(screen.getByPlaceholderText(t.zonePicker.searchPlaceholder), {
      target: { value: 'reykjavik' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Reykjavik/ }));
    saveFrom('when');

    const patch = indexVerbs.updateBooking.mock.calls[0][1];
    // One zone drives both ends for a single-place booking, so `start` carries it
    // and nothing is written for the unused end.
    expect(patch.startDisplayTimezone).toBe('Atlantic/Reykjavik');
    expect('endDisplayTimezone' in patch).toBe(false);
  });

  it('an untouched form sends no zone keys at all', () => {
    openWhen(halfKnown);
    saveFrom('when');
    const patch = indexVerbs.updateBooking.mock.calls[0][1];
    expect('startDisplayTimezone' in patch).toBe(false);
    expect('endDisplayTimezone' in patch).toBe(false);
  });
});

// ADR-0150. A booking's refusal is at the field it is about — and a span refuses
// per LEG, for the same reason it carries a zone per leg: marking both ends when
// one is fine is the refusal naming something that isn't wrong.
// The refusal lands at the STEP GATE now (ADR-0155 §3), which is earlier than the save
// and is the point: you are told at the step that owns the field, before paging past it.
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
    next();
    const title = screen.getByPlaceholderText(t.index.sheet.titlePlaceholder);
    expect(fieldOf(title)?.hasAttribute('data-invalid')).toBe(true);
    expect(fieldOf(title)?.querySelector('.field-error')?.textContent).toBe(
      t.index.form.titleRequired,
    );
    // Refused, so it did not advance — and nothing was written.
    expect(screen.getByText(t.common.steps.next)).toBeTruthy();
    expect(indexVerbs.createBooking).not.toHaveBeenCalled();
  });

  it('marks the route field when a transport has no endpoints', () => {
    render(
      wrapNav(
        <BookingSheet booking={null} seed={{ type: BOOKING_TYPE.FLIGHT }} onClose={() => {}} />,
      ),
    );
    next();
    const route = screen.getByRole('button', { name: t.index.form.originLabel });
    expect(fieldOf(route)?.hasAttribute('data-invalid')).toBe(true);
    expect(fieldOf(route)?.querySelector('.field-error')?.textContent).toBe(
      t.index.form.routeRequired,
    );
  });

  it('marks only the leg that falls outside the trip', () => {
    render(wrapNav(<BookingSheet booking={flight} onClose={() => {}} />));
    next();
    const [depDate, arrDate] = [...document.querySelectorAll<HTMLInputElement>('.wf-date-val')];
    fireEvent.change(depDate, { target: { value: '2026-07-20' } });
    fireEvent.change(arrDate, { target: { value: '2026-08-30' } });
    next();
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
  // The composer rides the last step, with the fields shared across the whole form
  // (ADR-0155 §4) — so every test here names the booking, walks to the end, and writes.
  const composer = () => document.querySelector('.note-compose-in') as HTMLTextAreaElement;

  it('writes no note when the composer was never touched', async () => {
    indexVerbs.createBooking.mockResolvedValue({ id: 'b-new' });
    openHotel();
    nameIt();
    toLastStep();
    save();
    await waitFor(() => expect(indexVerbs.createBooking).toHaveBeenCalled());
    expect(noteVerbs.createNote).not.toHaveBeenCalled();
  });

  // The common case, and the whole point of §6b: no extra press.
  it('takes what is still in the box at save, with no ＋ pressed', async () => {
    indexVerbs.createBooking.mockResolvedValue({ id: 'b-new' });
    openHotel();
    nameIt();
    toLastStep();
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
    toLastStep();
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
    toLastStep();
    fireEvent.change(composer(), { target: { value: 'משהו' } });
    save();

    await waitFor(() => expect(noteVerbs.createNote).toHaveBeenCalled());
    const input = noteVerbs.createNote.mock.calls[0][0];
    expect(input).not.toHaveProperty('category');
    expect(input).not.toHaveProperty('title');
  });

  // The refusal runs first: a form that will not save must not leave notes behind.
  // The refusal runs first — and it now runs at the FIRST step's gate, so an unnamed
  // booking never reaches the composer at all, let alone the save.
  it('writes nothing at all when the booking itself is refused', () => {
    openHotel();
    next();
    expect(composer()).toBeNull();
    expect(screen.queryByText(t.common.save)).toBeNull();
    expect(indexVerbs.createBooking).not.toHaveBeenCalled();
    expect(noteVerbs.createNote).not.toHaveBeenCalled();
  });

  // ADR-0152 §6b's last paragraph, missed here exactly as it was missed on `EventForm`:
  // on EDIT the existing notes read ABOVE the same one box. Until this, a booking's notes
  // were reachable from the sheet only as a number on its delete confirm.
  describe('and read back on edit', () => {
    const hotel: Booking = {
      id: 'bk-h',
      tripId: 't1',
      type: BOOKING_TYPE.HOTEL,
      title: 'מלון שינג׳וקו גרנבל',
      source: BOOKING_SOURCE.MANUAL,
      createdAt: '',
      updatedAt: '',
      updatedBy: 'u',
    };
    const hostedNote = (id: string, body: string, host: Partial<Note>): Note =>
      ({
        id,
        tripId: 't1',
        body,
        source: 'member',
        createdBy: 'u',
        createdAt: '2026-07-19T00:00:00.000Z',
        updatedAt: '2026-07-19T00:00:00.000Z',
        updatedBy: 'u',
        ...host,
      }) as Note;

    afterEach(() => {
      tripNotes = [];
      indexVerbs.updateBooking.mockReset();
      setSimulatedNow(null);
    });

    const editHotel = () => {
      setSimulatedNow(Date.parse('2026-07-20T09:00:00+09:00'));
      render(wrapNav(<BookingSheet booking={hotel} onClose={() => {}} />));
      toLastStep();
    };

    it('lists the booking’s existing notes above the box, with one way to add', () => {
      tripNotes = [hostedNote('n1', 'קוד הכספת 4417', { bookingId: 'bk-h' })];
      editHotel();

      const section = document.querySelector('.note-sec') as HTMLElement;
      expect(section).not.toBeNull();
      expect(section.textContent).toContain('קוד הכספת 4417');
      // ONE way to add, and it is the box below — the section's own `＋ פתק` would open a
      // second sheet over a form already asking for a save.
      expect(section.querySelector('.add')).toBeNull();
      expect(
        section.compareDocumentPosition(composer()) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('shows only THIS booking’s notes, not another host’s', () => {
      tripNotes = [
        hostedNote('n1', 'קוד הכספת 4417', { bookingId: 'bk-h' }),
        hostedNote('n2', 'של הזמנה אחרת', { bookingId: 'bk-other' }),
        hostedNote('n3', 'של האירוע', { eventId: 'ev-1' }),
        hostedNote('n4', 'פתק כללי', {}),
      ];
      editHotel();

      const section = document.querySelector('.note-sec') as HTMLElement;
      expect(section.textContent).toContain('קוד הכספת 4417');
      for (const other of ['של הזמנה אחרת', 'של האירוע', 'פתק כללי'])
        expect(section.textContent).not.toContain(other);
    });

    // The edge case ADR-0152 §6b resolves and `hero-horizon.ts` restates: the linked event
    // is materialized SERVER-side from a seed (ADR-0093) and has no client id to hang a
    // note on, so every path that writes from this form writes `bookingId`. The section
    // therefore reads the booking — asking the event would find nothing on exactly the
    // bookings most likely to carry a note.
    it('reads the BOOKING as the host, and keeps writing new notes there', async () => {
      tripNotes = [hostedNote('n1', 'קוד הכספת 4417', { bookingId: 'bk-h' })];
      indexVerbs.updateBooking.mockResolvedValue({ id: 'bk-h' });
      editHotel();

      fireEvent.change(composer(), { target: { value: 'לבקש קומה גבוהה' } });
      save();

      await waitFor(() => expect(noteVerbs.createNote).toHaveBeenCalledTimes(1));
      expect(noteVerbs.createNote).toHaveBeenCalledWith({
        body: 'לבקש קומה גבוהה',
        bookingId: 'bk-h',
      });
      // The one already on the row is an entity read through `HostNotes` — it is not
      // loaded into the composer, so a save does not write it a second time.
      expect(noteVerbs.createNote).not.toHaveBeenCalledWith(
        expect.objectContaining({ body: 'קוד הכספת 4417' }),
      );
    });

    // A create has no host yet, so there is nothing to list — and the heading would
    // otherwise read `פתקים` twice, once empty.
    it('shows no section at all on a create', () => {
      tripNotes = [hostedNote('n1', 'קוד הכספת 4417', { bookingId: 'bk-h' })];
      openHotel();
      nameIt();
      toLastStep();
      expect(document.querySelector('.note-sec')).toBeNull();
      expect(composer()).toBeTruthy();
    });
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
  /** The span legs ON THE CURRENT STEP. There are two of them either way now: the outbound
   *  span is step `when`, the return span is step `more` (ADR-0155 §5). */
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
  /** Fill the outbound span on step `when`, then advance to `more`. */
  const fillOut = (d1: string, t1: string, d2: string, t2: string) => {
    const [a, b] = legs();
    setDate(a, d1);
    setTime(a, t1);
    setDate(b, d2);
    setTime(b, t2);
  };

  it('offers the direction control on a transport create, and defaults to one way', () => {
    open();
    expect(screen.getByText(t.index.form.oneWay)).toBeTruthy();
    expect(screen.getByText(t.index.form.roundTrip)).toBeTruthy();
    // Default OFF: one schedule step, no leg heading, and the last step is details only
    // — a one-way single-leg form is byte-for-byte the one that shipped.
    next();
    expect(legs().length).toBe(2);
    expect(document.querySelectorAll('.bs-leg-head').length).toBe(0);
    next();
    expect(screen.getByText(t.common.save)).toBeTruthy();
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

  // **The two legs are two STEPS now** (ADR-0155 §5), so the headings are never adjacent.
  // ADR-0154 §4's "in pairs or not at all" still holds — what it forbids is an unlabelled
  // block beside a labelled one, and each step now has exactly one. Each heading also
  // carries its own `RouteLabel`, which is the part the step name cannot say: which way
  // this leg goes.
  it('names the outbound on its step and the return on the next, one heading each', () => {
    open();
    goRoundTrip();
    next();
    let heads = [...document.querySelectorAll('.bs-leg-head > span:first-child')].map(
      (e) => e.textContent,
    );
    expect(heads).toEqual([t.index.form.legOut]);
    expect(legs().length).toBe(2);

    next();
    heads = [...document.querySelectorAll('.bs-leg-head > span:first-child')].map(
      (e) => e.textContent,
    );
    expect(heads).toEqual([t.index.form.legBack]);
    expect(legs().length).toBe(2);
  });

  // **A leg is a step** (ADR-0159), so the return has one of its own and the shared
  // fields keep the last. Four steps for a round trip, and one more for every stop.
  it('names the two steps for the journey they ask about', () => {
    open();
    goRoundTrip();
    const label = () => document.querySelector('.form-steps-label')!.textContent;
    expect(label()).toBe(t.index.form.stepWhat);
    next();
    expect(label()).toBe(t.index.form.stepWhenOut);
    next();
    expect(label()).toBe(t.index.form.legBack);
    next();
    expect(label()).toBe(t.index.form.stepDetails);
  });

  it('writes two bookings with mirrored routes and titles, in one change group', async () => {
    indexVerbs.createBooking.mockResolvedValue({ id: 'b-out' });
    open();
    goRoundTrip();
    next();
    fillOut('2026-07-19', '09:00', '2026-07-20', '05:00');
    next();
    fillOut('2026-07-28', '11:00', '2026-07-28', '18:00');
    next();
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
    next();
    fillOut('2026-07-19', '09:00', '2026-07-20', '05:00');
    next();
    fillOut('2026-07-28', '11:00', '2026-07-28', '18:00');
    next();
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
    next();
    fillOut('2026-07-19', '09:00', '2026-07-20', '05:00');
    next();
    // Same day as the arrival, but two hours before it — a real instant comparison,
    // which a date-only check would wave through. **The one cross-step rule** (ADR-0155
    // §5): it needs the outbound's arrival from the PREVIOUS step, and it is marked here
    // because this is the field that is wrong.
    fillOut('2026-07-20', '03:00', '2026-07-20', '10:00');
    next();

    // Each span leg wears its own `Field`, which is what carries the mark (ADR-0150).
    const [back1, back2] = legs();
    const marked = (leg: HTMLElement) => leg.closest('.field');
    expect(marked(back1)?.hasAttribute('data-invalid')).toBe(true);
    expect(marked(back1)?.querySelector('.field-error')?.textContent).toBe(
      t.index.form.returnBeforeArrival,
    );
    // The leg beside it is fine and is not marked, and nothing was written.
    expect(marked(back2)?.hasAttribute('data-invalid')).toBe(false);
    expect(indexVerbs.createBooking).not.toHaveBeenCalled();
    // Still on the return's step — a refused step does not advance.
    expect(document.querySelector('.form-steps-label')?.textContent).toBe(t.index.form.legBack);
  });

  // ADR-0154 §6. Both legs have client-generated ids, so `hostId` would otherwise be
  // whichever `createBooking` ran LAST — the return, by statement order.
  it('hangs a note written on the way on the OUTBOUND', async () => {
    indexVerbs.createBooking
      .mockResolvedValueOnce({ id: 'b-out' })
      .mockResolvedValueOnce({ id: 'b-back' });
    open();
    goRoundTrip();
    next();
    fillOut('2026-07-19', '09:00', '2026-07-20', '05:00');
    next();
    fillOut('2026-07-28', '11:00', '2026-07-28', '18:00');
    next();
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

  // Delete sits beside the decision to commit, i.e. on the last step (ADR-0155 §5's
  // build log) — never under a control that is only navigating.
  const openDelete = () => {
    render(wrapNav(<BookingSheet booking={flight} onClose={() => {}} />));
    toLastStep();
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

// **The form is stepped** (ADR-0155 §5, revised by the owner 2026-08-02). What is pinned
// here is the stepping as a contract, not just as the setting the tests above walk through:
// where the fields live, that the save is a single commit on the last step, and that a
// refusal is reachable rather than stranded on a page you are not looking at.
describe('BookingSheet — three steps', () => {
  afterEach(() => {
    cleanup();
    indexVerbs.createBooking.mockReset();
    indexVerbs.updateBooking.mockClear();
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
  const stepLabel = () => document.querySelector('.form-steps-label')?.textContent;

  it('asks what and where, then when, then the rest', () => {
    openHotel();
    // Step one: identity and place. Not the schedule, and not the code.
    expect(stepLabel()).toBe(t.index.form.stepWhat);
    expect(screen.getByPlaceholderText(t.index.sheet.titlePlaceholder)).toBeTruthy();
    expect(screen.getByText(t.index.sheet.locationLabel)).toBeTruthy();
    expect(screen.queryByText(t.index.sheet.codeLabel)).toBeNull();
    expect(document.querySelector('.wf')).toBeNull();

    nameIt();
    next();
    expect(stepLabel()).toBe(t.index.form.stepWhen);
    expect(document.querySelector('.wf')).toBeTruthy();
    expect(screen.queryByText(t.index.sheet.codeLabel)).toBeNull();

    next();
    expect(stepLabel()).toBe(t.index.form.stepDetails);
    expect(screen.getByText(t.index.sheet.codeLabel)).toBeTruthy();
    expect(screen.getByText(t.index.sheet.roomLabel)).toBeTruthy();
    expect(document.querySelector('.note-compose-in')).toBeTruthy();
    expect(document.querySelector('.wf')).toBeNull();
  });

  it('commits once, on the last step (ADR-0155 §4)', async () => {
    indexVerbs.createBooking.mockResolvedValue({ id: 'b-new' });
    openHotel();
    nameIt();
    next();
    expect(indexVerbs.createBooking).not.toHaveBeenCalled();
    next();
    expect(indexVerbs.createBooking).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText(t.common.save));
    await waitFor(() => expect(indexVerbs.createBooking).toHaveBeenCalledTimes(1));
  });

  it('offers delete only where the decision to commit is', () => {
    render(wrapNav(<BookingSheet booking={flight} onClose={() => {}} />));
    expect(screen.queryByText(t.index.sheet.delete)).toBeNull();
    next();
    expect(screen.queryByText(t.index.sheet.delete)).toBeNull();
    next();
    expect(screen.getByText(t.index.sheet.delete)).toBeTruthy();
  });

  // **The gate catches it before the save has to.** Worth being exact about what this
  // does and does not show: in THIS form the per-step gates cover every rule, so the
  // save's walk-back to an earlier step (ADR-0155 §3) is currently unreachable from the
  // UI — you cannot break a step-two field from step three, because it is not rendered.
  // That path is real and is defence in depth; it is tested directly on the primitive
  // (`FormSteps.test.tsx`), which is where it belongs. What this pins is the half a user
  // meets: a schedule pushed out of the trip is refused AT the schedule step.
  it('refuses at the step that owns the field, before it can be paged past', () => {
    render(wrapNav(<BookingSheet booking={flight} onClose={() => {}} />));
    next();
    // Push the outbound's departure outside the trip, then page past it.
    const [dep] = [...document.querySelectorAll<HTMLInputElement>('.wf-date-val')];
    fireEvent.change(dep, { target: { value: '2026-07-20' } });
    next();
    expect(screen.getByText(t.index.sheet.codeLabel)).toBeTruthy();

    // Now break it from the step that cannot show it, and save.
    fireEvent.click(screen.getByText(t.common.steps.back));
    fireEvent.change(document.querySelector('.wf-date-val') as HTMLInputElement, {
      target: { value: '2026-08-30' },
    });
    next();
    // Refused at the gate rather than paged past — which is the earlier half of §3.
    expect(stepLabel()).toBe(t.index.form.stepWhen);
    const marked = document.querySelector('.field[data-invalid]');
    expect(marked?.querySelector('.field-error')?.textContent).toBe(t.index.form.dateOutOfRange);
    expect(indexVerbs.updateBooking).not.toHaveBeenCalled();
  });

  it('keeps `שבץ במסלול` a shortcut — it opens ON the schedule step', async () => {
    render(wrapNav(<BookingSheet booking={flight} focus="when" onClose={() => {}} />));
    await waitFor(() => expect(stepLabel()).toBe(t.index.form.stepWhen));
    expect(document.querySelector('.wf')).toBeTruthy();
  });
});

// **A journey with a stop** (ADR-0159) — the sequence half of the same axis the round
// trip populated. Same entry point as the pair's tests and for the same reason: a
// `PlacePicker` tap is an errand to the Map, so the errand-return `draft` is how a
// routed form is opened in a unit test.
describe('BookingSheet — a stop makes one save a chain of bookings', () => {
  afterEach(() => {
    cleanup();
    indexVerbs.createBooking.mockReset();
    noteVerbs.createNote.mockClear();
  });

  const withStop = (over: Partial<BookingSheetDraft> = {}): BookingSheetDraft => ({
    ...bookingSheetDraft({
      booking: null,
      seed: { type: BOOKING_TYPE.FLIGHT },
      trip,
      events: [],
      places,
    }),
    fromPlaceId: 'pl-nrt',
    toPlaceId: 'pl-tlv',
    stopPlaceIds: ['pl-dxb'],
    ...over,
  });
  const open = (over?: Partial<BookingSheetDraft>) =>
    render(wrapNav(<BookingSheet booking={null} draft={withStop(over)} onClose={() => {}} />));
  const legs = () => [...document.querySelectorAll<HTMLElement>('.wf-leg')];
  const setDate = (leg: HTMLElement, value: string) =>
    fireEvent.change(leg.querySelector('.wf-date-val') as HTMLInputElement, { target: { value } });
  const setTime = (leg: HTMLElement, value: string) => {
    fireEvent.click(leg.querySelector('button.tp-field') as HTMLElement);
    fireEvent.change(leg.querySelector('.tp-time-input') as HTMLInputElement, {
      target: { value },
    });
  };
  const fillLeg = (d1: string, t1: string, d2: string, t2: string) => {
    const [a, b] = legs();
    setDate(a, d1);
    setTime(a, t1);
    setDate(b, d2);
    setTime(b, t2);
  };
  const label = () => document.querySelector('.form-steps-label')!.textContent;

  it('gives every leg a step of its own, named for it', () => {
    open();
    expect(label()).toBe(t.index.form.stepWhat);
    next();
    expect(label()).toBe(t.index.form.stepLeg(1));
    expect(document.querySelector('.bs-leg-head > span:first-child')?.textContent).toBe(
      t.index.form.legNumber(1),
    );
    next();
    expect(label()).toBe(t.index.form.stepLeg(2));
    next();
    expect(label()).toBe(t.index.form.stepDetails);
  });

  it('writes a booking per leg, chained through the stop, in one change group', async () => {
    indexVerbs.createBooking.mockResolvedValue({ id: 'b-leg1' });
    open();
    next();
    fillLeg('2026-07-19', '00:30', '2026-07-19', '06:10');
    next();
    fillLeg('2026-07-19', '08:50', '2026-07-19', '11:35');
    next();
    save();

    await waitFor(() => expect(indexVerbs.createBooking).toHaveBeenCalledTimes(2));
    const [first] = indexVerbs.createBooking.mock.calls[0];
    const [second] = indexVerbs.createBooking.mock.calls[1];
    // The chain itself: leg 1 arrives where leg 2 departs, which is what makes the two
    // one journey when they are read back (`connectionMinutes`).
    expect(first).toMatchObject({ fromPlaceId: 'pl-nrt', toPlaceId: 'pl-dxb' });
    expect(second).toMatchObject({ fromPlaceId: 'pl-dxb', toPlaceId: 'pl-tlv' });
    // Nobody types either name — each leg's title is derived from its own two ends.
    expect(first.title).toBe(routeTitle('טוקיו', 'דובאי'));
    expect(second.title).toBe(routeTitle('דובאי', 'תל אביב'));
  });

  it('reads each leg in ITS OWN two zones, the stop included', async () => {
    indexVerbs.createBooking.mockResolvedValue({ id: 'b-leg1' });
    open();
    next();
    fillLeg('2026-07-19', '00:30', '2026-07-19', '06:10');
    next();
    fillLeg('2026-07-19', '08:50', '2026-07-19', '11:35');
    next();
    save();

    await waitFor(() => expect(indexVerbs.createBooking).toHaveBeenCalledTimes(2));
    const [first] = indexVerbs.createBooking.mock.calls[0];
    const [second] = indexVerbs.createBooking.mock.calls[1];
    // Departs Tokyo, lands in Dubai — then departs Dubai and lands in Tel Aviv. The
    // interior stop's own zone is read from its place, with no chip needed for it.
    expect(first.event.startsAt).toBe(zonedIso('2026-07-19', '00:30', 'Asia/Tokyo'));
    expect(first.event.endsAt).toBe(zonedIso('2026-07-19', '06:10', 'Asia/Dubai'));
    expect(second.event.startsAt).toBe(zonedIso('2026-07-19', '08:50', 'Asia/Dubai'));
    expect(second.event.endsAt).toBe(zonedIso('2026-07-19', '11:35', 'Asia/Jerusalem'));
  });

  it('refuses a leg that leaves before the one before it landed, on that field', async () => {
    open();
    next();
    fillLeg('2026-07-19', '00:30', '2026-07-19', '06:10');
    next();
    // 05:40 Dubai time is before the 06:10 arrival — a real instant comparison across
    // two zones, which a date-only check would wave through.
    fillLeg('2026-07-19', '05:40', '2026-07-19', '08:25');
    next();

    const [start, end] = legs();
    const marked = (leg: HTMLElement) => leg.closest('.field');
    expect(marked(start)?.hasAttribute('data-invalid')).toBe(true);
    expect(marked(start)?.querySelector('.field-error')?.textContent).toBe(
      t.index.form.legBeforeArrival('דובאי'),
    );
    expect(marked(end)?.hasAttribute('data-invalid')).toBe(false);
    expect(indexVerbs.createBooking).not.toHaveBeenCalled();
    // A refused step does not advance.
    expect(label()).toBe(t.index.form.stepLeg(2));
  });

  it('refuses a stop with no place, at the route', () => {
    open({ stopPlaceIds: [undefined] });
    next();
    expect(document.querySelector('.field[data-invalid] .field-error')?.textContent).toBe(
      t.index.form.stopRequired,
    );
    expect(label()).toBe(t.index.form.stepWhat);
  });

  // ADR-0154 §6 generalised: the note hangs on the leg that happens FIRST, not on
  // whichever `createBooking` ran last.
  it('hangs a note written on the way on the first leg', async () => {
    indexVerbs.createBooking
      .mockResolvedValueOnce({ id: 'b-leg1' })
      .mockResolvedValueOnce({ id: 'b-leg2' });
    open();
    next();
    fillLeg('2026-07-19', '00:30', '2026-07-19', '06:10');
    next();
    fillLeg('2026-07-19', '08:50', '2026-07-19', '11:35');
    next();
    fireEvent.change(document.querySelector('.note-compose-in') as HTMLTextAreaElement, {
      target: { value: 'הכבודה עוברת ישירות' },
    });
    save();

    await waitFor(() => expect(noteVerbs.createNote).toHaveBeenCalledTimes(1));
    expect(noteVerbs.createNote).toHaveBeenCalledWith({
      body: 'הכבודה עוברת ישירות',
      bookingId: 'b-leg1',
    });
  });

  it('is offered on a create only, and only where the type can be broken by one', () => {
    open();
    expect(screen.getByText(t.index.form.addStop)).toBeTruthy();
    cleanup();
    render(
      wrapNav(
        <BookingSheet booking={null} seed={{ type: BOOKING_TYPE.HOTEL }} onClose={() => {}} />,
      ),
    );
    expect(screen.queryByText(t.index.form.addStop)).toBeNull();
    cleanup();
    render(wrapNav(<BookingSheet booking={flight} onClose={() => {}} />));
    expect(screen.queryByText(t.index.form.addStop)).toBeNull();
  });
});

// ── A HIRE IS NOT A JOURNEY (ADR-0163) ────────────────────────────────────────
// Three of the four reports against ADR-0162's build land here: the form's question, the
// company field, and the title that was printing a route.
describe('BookingSheet — a car hire', () => {
  // Mocks are module-level and shared with every describe above, so a save assertion
  // reading `mock.calls[0]` would otherwise read whichever test ran before it.
  afterEach(() => {
    cleanup();
    indexVerbs.createBooking.mockClear();
    indexVerbs.updateBooking.mockClear();
  });

  const hire: Booking = {
    id: 'bk-car',
    tripId: 't1',
    type: BOOKING_TYPE.CAR,
    title: 'טוקיו',
    fromPlaceId: 'pl-nrt',
    toPlaceId: 'pl-nrt',
    provider: 'Hertz',
    source: BOOKING_SOURCE.MANUAL,
    createdAt: '',
    updatedAt: '',
    updatedBy: 'u',
  };
  const openFresh = () =>
    render(
      wrapNav(<BookingSheet booking={null} seed={{ type: BOOKING_TYPE.CAR }} onClose={() => {}} />),
    );

  it('asks איסוף/החזרה, not מוצא/יעד, and offers no direction swap', () => {
    render(wrapNav(<BookingSheet booking={hire} onClose={() => {}} />));
    expect(screen.getByText(t.index.form.hireEndsLabel)).toBeTruthy();
    expect(screen.getByRole('button', { name: t.index.form.pickupPlaceLabel })).toBeTruthy();
    expect(screen.queryByText(t.index.form.routeLabel)).toBeNull();
    expect(screen.queryByRole('button', { name: t.index.form.originLabel })).toBeNull();
    expect(screen.queryByRole('button', { name: new RegExp(t.index.form.swapRoute) })).toBeNull();
    // Nor the round trip / stops controls — a hire has neither (ADR-0162's profile).
    expect(screen.queryByText(t.index.form.roundTrip)).toBeNull();
    expect(screen.queryByText(t.index.form.addStop)).toBeNull();
  });

  it('opens on "same counter" for a hire whose two ends match', () => {
    render(wrapNav(<BookingSheet booking={hire} onClose={() => {}} />));
    expect(
      screen.getByRole('radio', { name: t.index.form.returnSame }).getAttribute('aria-checked'),
    ).toBe('true');
    expect(screen.queryByRole('button', { name: t.index.form.dropoffPlaceLabel })).toBeNull();
  });

  // **The company field** (§2). It exists on `Booking` and `BookingDetail` has always
  // rendered it; no form ever wrote it.
  it('collects the rental company, under a label that names it', () => {
    render(wrapNav(<BookingSheet booking={hire} onClose={() => {}} />));
    toLastStep();
    const input = screen.getByLabelText(t.index.sheet.providerLabel.car) as HTMLInputElement;
    expect(input.value).toBe('Hertz');
    expect(t.index.sheet.providerLabel.car).not.toBe(t.index.sheet.providerLabel.flight);
  });

  it('sends the company on save', async () => {
    render(wrapNav(<BookingSheet booking={hire} onClose={() => {}} />));
    toLastStep();
    fireEvent.change(screen.getByLabelText(t.index.sheet.providerLabel.car), {
      target: { value: 'Europcar' },
    });
    save();
    await waitFor(() => expect(indexVerbs.updateBooking).toHaveBeenCalled());
    const [, patch] = indexVerbs.updateBooking.mock.calls[0] as [unknown, { provider: string }];
    expect(patch.provider).toBe('Europcar');
  });

  // **The title** (§3). A journey is named by its route; a hire is named by its company,
  // which is what stops `נריטה ← נריטה` reaching every title-only surface.
  it('titles itself by the company, not by its two counters', async () => {
    openFresh();
    // Pick the same counter for both ends, the case that produced the doubled name.
    fireEvent.click(screen.getByRole('radio', { name: t.index.form.returnSame }));
    toLastStep();
    fireEvent.change(screen.getByLabelText(t.index.sheet.providerLabel.car), {
      target: { value: 'Hertz' },
    });
    save();
    await waitFor(() => expect(indexVerbs.createBooking).toHaveBeenCalled());
    const [input] = indexVerbs.createBooking.mock.calls[0] as [{ title: string }];
    expect(input.title).toBe('Hertz');
    expect(input.title).not.toContain('טוקיו');
  });

  it('falls back to the type label when no company was entered', async () => {
    openFresh();
    toLastStep();
    save();
    await waitFor(() => expect(indexVerbs.createBooking).toHaveBeenCalled());
    const [input] = indexVerbs.createBooking.mock.calls[0] as [{ title: string }];
    expect(input.title).toBe(t.index.bookingType.car);
  });

  // **The `נריטה ← -` the owner saw.** The hire field writes the two ends equal while the
  // answer is "same counter", but only when it is touched — so a place arriving from a MAP
  // ERRAND, or a pre-0163 row opened and saved untouched, left the return null and every
  // route-drawing surface filled it with `RouteLabel`'s dash. Normalised on read now.
  it('saves the return equal to the pick-up when it was never set', async () => {
    const halfFilled: Booking = { ...hire, toPlaceId: undefined };
    render(wrapNav(<BookingSheet booking={halfFilled} onClose={() => {}} />));
    toLastStep();
    save();
    await waitFor(() => expect(indexVerbs.updateBooking).toHaveBeenCalled());
    const [, patch] = indexVerbs.updateBooking.mock.calls[0] as [
      unknown,
      { fromPlaceId?: string; toPlaceId?: string },
    ];
    expect(patch.fromPlaceId).toBe('pl-nrt');
    expect(patch.toPlaceId).toBe('pl-nrt');
  });

  // …and a one-way hire's real return is not overwritten by the same normalisation.
  it("leaves a one-way hire's own return place alone", async () => {
    const oneWay: Booking = { ...hire, fromPlaceId: 'pl-nrt', toPlaceId: 'pl-tlv' };
    render(wrapNav(<BookingSheet booking={oneWay} onClose={() => {}} />));
    toLastStep();
    save();
    await waitFor(() => expect(indexVerbs.updateBooking).toHaveBeenCalled());
    const [, patch] = indexVerbs.updateBooking.mock.calls[0] as [unknown, { toPlaceId?: string }];
    expect(patch.toPlaceId).toBe('pl-tlv');
  });

  // The rule is per type, so the three travelling modes must be untouched by it.
  it('leaves a flight titled by its route', async () => {
    render(wrapNav(<BookingSheet booking={flight} onClose={() => {}} />));
    toLastStep();
    save();
    await waitFor(() => expect(indexVerbs.updateBooking).toHaveBeenCalled());
    const [, patch] = indexVerbs.updateBooking.mock.calls[0] as [unknown, { title: string }];
    expect(patch.title).toContain('תל אביב');
    expect(patch.title).toContain('טוקיו');
  });
});

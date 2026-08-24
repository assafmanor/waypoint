// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { wrapNav } from '../test/nav-harness';
import {
  BOOKING_SOURCE,
  BOOKING_TYPE,
  type Booking,
  type BookingType,
  type Note,
  type Place,
} from '@waypoint/shared';

Element.prototype.scrollIntoView = vi.fn();

// The one thing this sheet says to the Map (ADR-0134 §1): "find me a place for this field".
// Mocked so the errand can be read — outside a `MapScopeProvider` the real hook answers `null`
// and the tap is a no-op, which is correct for every other test in this file and untestable
// for the one below. `BookingSheet` imports nothing else from this module.
const startErrand = vi.fn();
vi.mock('../state/map-scope-state', () => ({ useStartPlaceErrand: () => startErrand }));

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
const attachmentVerbs = {
  attachDocument: vi.fn(async (_input: { documentId: string; bookingId?: string }) => undefined),
  detachDocument: vi.fn(async (_id: string) => {}),
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
    zoneCrossings: [],
    // Tasks ride the same snapshot since phase 1; the mark and the sections read them.
    tasks: [],
    taskVerbs: {
      createTask: async () => undefined,
      updateTask: async () => {},
      deleteTask: async () => {},
      tickTask: async () => {},
    },
    // The one context index every note surface resolves through (ADR-0172 §1);
    // built from this file's own fixtures so pairing is real rather than stubbed.
    hostContexts: buildHostContextIndex([], tripBookings),
    // Note hosts resolve through trip-state's one index; this file asserts nothing about an
    // inherited name or category, so the index-miss fallback carries the host it is handed.
    noteHosts: new Map(),
    trip,
    events: [],
    bookings: tripBookings,
    maybeItems: [],
    places,
    indexVerbs,
    notes: tripNotes,
    users: [],
    noteVerbs,
    // Documents attached on the way (ADR-0173 §5), same arrangement as the notes above.
    documents: [],
    documentAttachments: [],
    attachmentVerbs,
  }),
}));

// The attach slot reads the outbox for queued uploads (ADR-0173 §5 / ADR-0056); there is no
// IndexedDB here, and a queued upload is not what these tests are about.
vi.mock('../lib/outbox', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/outbox')>();
  return { ...actual, usePendingUploads: () => [] };
});

import { BookingSheet } from './BookingSheet';
import { bookingSheetDraft, type BookingSheetDraft } from '../lib/booking-draft';
import { routeTitle } from '../lib/route-title';
import { zonedIso } from '../lib/time';
import { timingLabels } from '../lib/booking-timing';
import { setSimulatedNow } from '../lib/useClock';
import { t } from '../i18n/he';
import { buildHostContextIndex } from '../lib/host-context';

/** **The notes box is revealed by `＋ פתק`** (ADR-0192 §2's 2026-08-16 reversal), so a test
 *  that types a note presses it first — the same gesture a person makes. Module scope because
 *  the leg and round-trip blocks below write notes too, and a helper per describe is how two
 *  of them end up pressing different things. */
const openNoteBox = () => {
  const section = document.querySelector('.note-sec:not(.tsk-sec)') as HTMLElement;
  fireEvent.click(section.querySelector('.add') as HTMLElement);
};
const composer = () => {
  if (!document.querySelector('.note-compose-in')) openNoteBox();
  return document.querySelector('.note-compose-in') as HTMLTextAreaElement;
};

// **The sheet is stepped now** (ADR-0155 §5): `שמירה` lives on the LAST step, and the
// primary is `הבא` until then. These are the whole diff to this file — every assertion
// below is the one it always made, taken on the step that owns the field.
const press = (label: string) => fireEvent.click(screen.getByText(label));
/** Is the type chooser the step on screen? Read off the step read-out's own label, which
 *  is the only thing that names a step from outside the component. */
const onTypeStep = () => screen.queryByText(t.index.form.stepType) != null;
/** One step forward, **walking through the create-only type step transparently** (field
 *  report #2). That step is a chooser with nothing to refuse and a type always selected,
 *  so a test that means "advance from `מה ואיפה`" should not have to know it exists — and
 *  an EDIT never has it at all, so the two paths would otherwise need different counts.
 *  The step's own behaviour is driven directly by its tests below. */
const next = () => {
  if (onTypeStep()) press(t.common.steps.next);
  press(t.common.steps.next);
};
/** Walk to the last step. Each `הבא` runs that step's gate, so a form this refuses does
 *  not arrive — which is the point, and what the refusal tests below assert. */
const toLastStep = () => {
  next();
  next();
};
/** Render a CREATE form, then step past the type chooser (field report #2). Every
 *  assertion in this file is about a field the chooser does not own, so the tests take the
 *  step that owns theirs — the chooser's own behaviour has its own describe below. */
const pastTypeStep = () => {
  if (onTypeStep()) press(t.common.steps.next);
};
/* ── Driving the JOURNEY RAIL (ADR-0203 §1/§3/§7/§9) ─────────────────────────────────
   A journey is no longer two captioned legs with a date each. It is ONE calendar date and a
   clock per moment, all on one step — so the specs below fill it through the rail's own
   controls rather than through `.wf-leg`, which a hire and a hotel still use and which these
   helpers deliberately do not touch. */

/** The rail's nodes, in journey order. Segments carry the leg durations and are skipped. */
const railNodes = () => [...document.querySelectorAll<HTMLElement>('.jf-row:not(.jf-seg)')];

/** The journey's ONE date. There is exactly one such input in the rail, which is the whole
 *  design: a return flight would need a second and there is none to mistake it for. */
const setJourneyDate = (value: string) =>
  fireEvent.change(document.querySelector('.jf .vt-date input') as HTMLInputElement, {
    target: { value },
  });

/** Open node `i` if it is summarised, so its real controls are on screen (§9). */
const openRailNode = (i: number) => {
  const summary = railNodes()[i]?.querySelector<HTMLElement>('.jf-sum-tok');
  if (summary) fireEvent.click(summary);
};

/** Set one moment's clock. `which` picks between an interior node's two — its arrival is the
 *  first `TimeField` in the node, its departure the second. Through the panel's exact
 *  `<input type="time">`, the same precise path the span helpers use. */
const setNodeTime = (i: number, which: 'arrive' | 'depart', value: string) => {
  openRailNode(i);
  const node = railNodes()[i];
  const tokens = [...node.querySelectorAll<HTMLElement>('button.vt-time')];
  // Node 0 only departs and the last only arrives, so each has one token; an interior node
  // has both, arrival first.
  const token = tokens.length === 1 ? tokens[0] : which === 'arrive' ? tokens[0] : tokens[1];
  fireEvent.click(token);
  fireEvent.change(node.querySelector('.tp-time-input') as HTMLInputElement, {
    target: { value },
  });
};

/** Fill a whole journey: its date, then every moment in rail order. `times` is
 *  `[depart0, arrive1, depart1, arrive2, …]` — exactly the order the rail lays them out. */
const fillJourney = (date: string, times: string[]) => {
  setJourneyDate(date);
  let m = 0;
  const nodes = railNodes().length;
  for (let i = 0; i < nodes; i++) {
    if (i > 0) setNodeTime(i, 'arrive', times[m++]);
    else setNodeTime(0, 'depart', times[m++]);
    if (i > 0 && i < nodes - 1) setNodeTime(i, 'depart', times[m++]);
  }
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
    pastTypeStep();
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

  // **A missing name is no longer a refusal** (field report #9). It was one until the
  // owner's report: every non-route type required a typed title, although the linked place
  // already said what the booking was. The refusal is gone rather than relaxed — with a
  // fallback in place `finalTitle` cannot come out empty, so a check for it would be
  // unreachable code, which is the shape ADR-0150 logged as a defect elsewhere.
  it('does not refuse a booking with no name — it derives one and advances', () => {
    render(
      wrapNav(
        <BookingSheet booking={null} seed={{ type: BOOKING_TYPE.HOTEL }} onClose={() => {}} />,
      ),
    );
    pastTypeStep();
    const title = screen.getByPlaceholderText(t.index.sheet.titlePlaceholder);
    expect(fieldOf(title)?.hasAttribute('data-invalid')).toBe(false);
    press(t.common.steps.next);
    // It advanced: the identity step had nothing to refuse.
    expect(screen.queryByPlaceholderText(t.index.sheet.titlePlaceholder)).toBeNull();
  });

  it('marks the route field when a transport has no endpoints', () => {
    render(
      wrapNav(
        <BookingSheet booking={null} seed={{ type: BOOKING_TYPE.FLIGHT }} onClose={() => {}} />,
      ),
    );
    pastTypeStep();
    // The direction is its own unanswered question now (field report #8); answer it so
    // the only thing left to refuse is the one this test is about.
    fireEvent.click(screen.getByText(t.index.form.oneWay));
    press(t.common.steps.next);
    const route = screen.getByRole('button', { name: t.index.form.originLabel });
    expect(fieldOf(route)?.hasAttribute('data-invalid')).toBe(true);
    expect(fieldOf(route)?.querySelector('.field-error')?.textContent).toBe(
      t.index.form.routeRequired,
    );
  });

  /** **The two dates this spec used to set are one date now** (ADR-0203 §2), so the case it
   *  was written for has to be built the way it can now arise: a journey whose date is INSIDE
   *  the trip but whose arrival rolls past the end of it. Tel Aviv 20:00 on the trip's last day
   *  lands in Tokyo at 14:00 — which, on instants, cannot be that same day — so the arrival is
   *  the 31st and the trip ended on the 30th. The date is right and the arrival is not, and
   *  that is precisely what the refusal has to say. */
  it('marks only the moment that falls outside the trip', () => {
    render(wrapNav(<BookingSheet booking={flight} onClose={() => {}} />));
    next();
    fillJourney('2026-07-30', ['20:00', '14:00']);
    next();
    const [departure, arrival] = railNodes();
    expect(fieldOf(departure.querySelector('.vt-date'))?.hasAttribute('data-invalid')).toBe(false);
    const marked = fieldOf(arrival.querySelector('button.vt-time'));
    expect(marked?.hasAttribute('data-invalid')).toBe(true);
    expect(marked?.querySelector('.field-error')?.textContent).toBe(t.index.form.dateOutOfRange);
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

  const openHotel = () => {
    render(
      wrapNav(
        <BookingSheet booking={null} seed={{ type: BOOKING_TYPE.HOTEL }} onClose={() => {}} />,
      ),
    );
    pastTypeStep();
  };
  const nameIt = () =>
    fireEvent.change(screen.getByPlaceholderText(t.index.sheet.titlePlaceholder), {
      target: { value: 'מלון שינג׳וקו גרנבל' },
    });
  // By class, not by placeholder: the placeholder deliberately changes to `פתק נוסף` once
  // a note is committed, so a placeholder lookup would find nothing on the second one.
  // The composer rides the last step, with the fields shared across the whole form
  // (ADR-0155 §4) — so every test here names the booking, walks to the end, and writes.

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
    // **`＋ פתק` starts the next one** (ADR-0192 §2's reversal): the box has no `＋` of its own
    // on a host form, so the header's control both reveals the first box and commits it to
    // open a second. This used to press a button inside the box.
    openNoteBox();
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
    // The whole notes SECTION is on the last step, so a refused form never reaches it — the
    // section is absent, not merely closed, which is why this asks for it rather than the box.
    expect(document.querySelector('.note-sec:not(.tsk-sec)')).toBeNull();
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

      const section = document.querySelector('.note-sec:not(.tsk-sec)') as HTMLElement;
      expect(section).not.toBeNull();
      expect(section.textContent).toContain('קוד הכספת 4417');
      // **ONE way to add, and it is the header's `＋ פתק`** (ADR-0192 §2's reversal) — which
      // reveals the box below rather than opening a second sheet over a form already asking
      // for a save.
      expect(document.querySelector('.note-compose-in')).toBeNull();
      expect(section.querySelector('.add')).not.toBeNull();
      expect(section.contains(composer())).toBe(true);
    });

    it('shows only THIS booking’s notes, not another host’s', () => {
      tripNotes = [
        hostedNote('n1', 'קוד הכספת 4417', { bookingId: 'bk-h' }),
        hostedNote('n2', 'של הזמנה אחרת', { bookingId: 'bk-other' }),
        hostedNote('n3', 'של האירוע', { eventId: 'ev-1' }),
        hostedNote('n4', 'פתק כללי', {}),
      ];
      editHotel();

      const section = document.querySelector('.note-sec:not(.tsk-sec)') as HTMLElement;
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

    // **ONE section on a create too** (ADR-0192 §2). This used to assert the opposite — no
    // section at all — because the composer sat in a `Field` of its own and rendering the
    // section beside it would have headed `פתקים` twice. The composer is a ROW of the section
    // now, so there is one heading, and the create differs from the edit only in having no
    // rows above the box. What must not come back is the empty-state line: with a composer
    // present, `אין פתקים על זה` states the obvious directly above the invitation.
    it('shows one notes section on a create — the composer, and no rows', () => {
      tripNotes = [hostedNote('n1', 'קוד הכספת 4417', { bookingId: 'bk-h' })];
      openHotel();
      nameIt();
      toLastStep();
      const section = document.querySelector('.note-sec:not(.tsk-sec)');
      expect(section).toBeTruthy();
      expect(composer()).toBeTruthy();
      // Another booking's note is not this create's.
      expect(section!.querySelectorAll('.note-item')).toHaveLength(0);
      expect(section!.textContent).not.toContain(t.notes.section.empty);
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
    // A fresh draft leaves the direction UNANSWERED (field report #8) and an unanswered
    // one refuses, so every test that is about something else says one-way explicitly.
    // The direction's own tests below override it back.
    roundTrip: false,
    ...over,
  });
  const open = (over?: Partial<BookingSheetDraft>) => {
    render(wrapNav(<BookingSheet booking={null} draft={routed(over)} onClose={() => {}} />));
    pastTypeStep();
  };
  const goRoundTrip = () => fireEvent.click(screen.getByText(t.index.form.roundTrip));
  // The per-leg `legs`/`setDate`/`setTime` helpers are gone with the blocks they drove: a
  // journey's schedule is the module-level rail helpers above, and a `.wf-leg` on a flight's
  // `מתי` step no longer exists to address (ADR-0203 §1).
  /** Fill one side of the journey on its own step (ADR-0203 §7).
   *
   *  **The arrival's DATE is gone and that is the design** (§2): a journey carries one
   *  calendar date and the arrival is a clock whose day is derived. The parameter is kept so
   *  every call site below reads unchanged, and ignored — if a spec needs the arrival on
   *  another day it says so with a clock that cannot follow the departure, which is exactly
   *  what a reader would have to understand anyway. */
  const fillOut = (d1: string, t1: string, _d2: string, t2: string) => fillJourney(d1, [t1, t2]);

  it('offers the direction control on a transport create, with NEITHER preselected', () => {
    open({ roundTrip: undefined });
    const pills = [t.index.form.oneWay, t.index.form.roundTrip].map((label) =>
      screen.getByText(label).closest('button'),
    );
    expect(pills.every(Boolean)).toBe(true);
    // **Nothing is chosen for you** (field report #8). The control used to open with
    // `כיוון אחד` selected, which is the app assuming a one-way — the exact thing it
    // exists to stop doing.
    expect(pills.map((b) => b?.getAttribute('aria-checked'))).toEqual(['false', 'false']);
  });

  it('refuses to advance until a direction is chosen, then behaves as it always did', () => {
    open({ roundTrip: undefined });
    press(t.common.steps.next);
    expect(document.querySelector('.field-error')?.textContent).toBe(
      t.index.form.directionRequired,
    );
    // Still on the identity step: a refused step does not move (ADR-0155).
    expect(screen.getByRole('radiogroup', { name: t.index.form.directionLabel })).toBeTruthy();

    fireEvent.click(screen.getByText(t.index.form.oneWay));
    press(t.common.steps.next);
    // One-way is one schedule step with a two-node rail and no journey heading — headings
    // arrive in pairs or not at all (ADR-0154 §4), and one journey needs no name.
    expect(railNodes().length).toBe(2);
    expect(document.querySelectorAll('.jf-head').length).toBe(0);
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

  // **The two journeys are two STEPS** (ADR-0155 §5, ADR-0203 §7), so the headings are never
  // adjacent. ADR-0154 §4's "in pairs or not at all" still holds — what it forbids is an
  // unlabelled block beside a labelled one, and each step now has exactly one. The heading is
  // the RAIL's own (`.jf-head`) rather than the span block's, and it still carries a
  // `RouteLabel`, which is the part the step name cannot say: which way this journey goes.
  it('names the outbound on its step and the return on the next, one heading each', () => {
    open();
    goRoundTrip();
    next();
    const heads = () =>
      [...document.querySelectorAll('.jf-head > span:first-child')].map((e) => e.textContent);
    expect(heads()).toEqual([t.index.form.legOut]);
    expect(railNodes().length).toBe(2);

    next();
    expect(heads()).toEqual([t.index.form.legBack]);
    expect(railNodes().length).toBe(2);
  });

  // **A leg is a step** (ADR-0159), so the return has one of its own and the shared
  // fields keep the last. Four steps for a round trip, and one more for every stop.
  /** **The way home is offered the trip's LAST day, not its first** — reported from the
   *  field. Every side but this one already read `pointsFor(side)`; the suggestion read the
   *  outbound's endpoints on both, so `tripEdgeFor` saw a journey towards the destination
   *  twice and offered `תחילת הטיול` for the flight home. */
  it('offers the trip start for the way there and the trip end for the way back', () => {
    open();
    goRoundTrip();
    next();
    expect(document.querySelector('.jf-offer button')!.textContent).toContain(
      t.journey.suggest.tripStart,
    );
    next();
    expect(document.querySelector('.jf-offer button')!.textContent).toContain(
      t.journey.suggest.tripEnd,
    );
  });

  /** **The way home is offered the trip's LAST day, not its first** — reported from the
   *  field. Every other side-dependent read already went through the outbound-or-reversed
   *  points; the suggestion read `routePoints` directly on both sides, so `tripEdgeFor` saw a
   *  journey towards the destination twice and offered `תחילת הטיול` for the flight home.
   *  Five call sites spelled that conditional out inline before this one forgot it, which is
   *  why the fix names it once (`pointsFor`). */
  it('offers the trip start for the way there and the trip end for the way back', () => {
    open();
    goRoundTrip();
    next();
    const offer = () => document.querySelector('.jf-offer button')!.textContent;
    expect(offer()).toContain(t.journey.suggest.tripStart);
    next();
    expect(offer()).toContain(t.journey.suggest.tripEnd);
  });

  /* ── The way home is its own route (ADR-0203 §6) ────────────────────────────────────
     Reported from the field: "when doing a round trip with layovers, theres a good chance
     that it isn't going to be the same stops exactly - it could be different stops and/or a
     different number of stops. Right now after you chose round-trip you can't change it per
     journey, and that's bad ux." */

  /** The way-back section's two pills, and which is on. */
  const backPills = () =>
    [...document.querySelectorAll('.rf-back .choice-pill')].map((b) => ({
      label: b.textContent,
      on: b.getAttribute('aria-checked') === 'true',
    }));
  const pressPill = (label: string) =>
    fireEvent.click(
      [...document.querySelectorAll('.rf-back .choice-pill')].find((b) =>
        b.textContent?.includes(label),
      )!,
    );
  const backStopRows = () => document.querySelectorAll('.rf-back .place-picker-stop');

  it('offers nothing about the way back until a round trip is chosen', () => {
    open();
    expect(document.querySelector('.rf-back')).toBeNull();
    goRoundTrip();
    expect(document.querySelector('.rf-back')).not.toBeNull();
    // And it opens as a MIRROR: a statement, no second list. Most round trips do come home
    // the same way, so the common case costs one line.
    expect(backPills().find((p) => p.on)!.label).toContain(t.index.form.returnSameWay);
    expect(backStopRows().length).toBe(0);
    expect(document.querySelector('.rf-back-same')!.textContent).toBe(t.index.form.returnMirrors);
  });

  /** **Seeded from the outbound reversed, so `דרך אחרת` opens on a route to EDIT** — §6's own
   *  wording, and the difference between offering a change and demanding re-entry. */
  it('seeds a diverging return from the outbound reversed', () => {
    open({ stopPlaceIds: ['pl-dxb'] });
    goRoundTrip();
    pressPill(t.index.form.returnOtherWay);
    expect(backStopRows().length).toBe(1);
    expect(backStopRows()[0].textContent).toContain('דובאי');
  });

  /** The reported case: a DIFFERENT NUMBER of stops, which `reversed` could never express —
   *  it was one array read backwards, and `legCount` was one number for both journeys. */
  /** **The one spec in this file that needs its own budget.** It drives six time pickers
   *  through a full save, and since §10 each panel renders the whole rotated 96-slot list plus
   *  its day divider — then §9's threshold moved, so at one stop nothing collapses any more and
   *  every control stays live between picks. Measured at ~4.5s against the 5s default: not
   *  stuck, just the most expensive path in the suite. Raised deliberately rather than thinned,
   *  because what makes it slow (a real save over two journeys of different depth) is exactly
   *  what it exists to prove. */
  it(
    'lets the two journeys have a different number of stops, and writes a leg for each',
    { timeout: 15_000 },
    async () => {
      indexVerbs.createBooking.mockResolvedValue({ id: 'b' });
      open({ stopPlaceIds: ['pl-dxb'] });
      goRoundTrip();
      pressPill(t.index.form.returnOtherWay);
      // Drop the seeded stop: the way home is direct, while the way out has one.
      fireEvent.click(backStopRows()[0].querySelector('.pp-clear')!);
      expect(backStopRows().length).toBe(0);

      next();
      fillJourney('2026-07-19', ['00:30', '06:10', '08:50', '11:35']);
      next();
      // The return is ONE leg now, so its rail has two nodes rather than three.
      expect(railNodes().length).toBe(2);
      fillJourney('2026-07-22', ['09:00', '15:00']);
      next();
      save();

      // Two legs out (one stop) plus one leg back = three bookings, from one save.
      await waitFor(() => expect(indexVerbs.createBooking).toHaveBeenCalledTimes(3));
      const routes = indexVerbs.createBooking.mock.calls.map(([b]) => [b.fromPlaceId, b.toPlaceId]);
      expect(routes).toEqual([
        ['pl-tlv', 'pl-dxb'],
        ['pl-dxb', 'pl-nrt'],
        // One leg home, over the two ends only — the way back is direct.
        ['pl-nrt', 'pl-tlv'],
      ]);
    },
  );

  /** **The flag and the list are separate**, which is what makes the pill non-destructive and
   *  is why no confirm dialog has to ask. */
  it('remembers a diverged return when you go back to the same way and return to it', () => {
    open({ stopPlaceIds: ['pl-dxb'] });
    goRoundTrip();
    pressPill(t.index.form.returnOtherWay);
    fireEvent.click(backStopRows()[0].querySelector('.pp-clear')!);
    expect(backStopRows().length).toBe(0);

    pressPill(t.index.form.returnSameWay);
    expect(backStopRows().length).toBe(0);
    expect(document.querySelector('.rf-back-same')).not.toBeNull();

    // Back again: the emptied list is restored, NOT re-seeded from the outbound.
    pressPill(t.index.form.returnOtherWay);
    expect(backStopRows().length).toBe(0);
  });

  it('refuses a return stop with no place, at the route, in its own words', () => {
    open();
    goRoundTrip();
    pressPill(t.index.form.returnOtherWay);
    fireEvent.click(screen.getAllByText(t.index.form.addStop)[1]);
    press(t.common.steps.next);
    expect(screen.getByText(t.index.form.returnStopRequired)).toBeTruthy();
    // Still on the route step: the refusal is at the field it names.
    expect(document.querySelector('.form-steps-label')!.textContent).toBe(t.index.form.stepWhat);
  });

  /** **The ends stay mirrored**, and the section says so rather than offering an edit that
   *  would write to the outbound. Scope decision, not an omission: an open-jaw trip is a
   *  different feature. */
  it('states the return’s two ends and offers no picker for them', () => {
    open();
    goRoundTrip();
    pressPill(t.index.form.returnOtherWay);
    const ends = document.querySelector('.rf-back-ends')!;
    // The outbound's two ends, SWAPPED: this fixture flies תל אביב → טוקיו.
    expect(ends.textContent).toBe('טוקיותל אביב');
    expect(ends.querySelector('.place-picker')).toBeNull();
    // The arrow is the real `NavArrow` SVG, never a Bidi_Mirrored character (ADR-0118).
    expect(ends.querySelector('svg.nav-arrow')).not.toBeNull();
  });

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

    // **The return's DEPARTURE is its date and its clock in one `Field`** (ADR-0203 §2), which
    // is what carries the mark (ADR-0150) — and it is the right box, because either control
    // in it fixes the refusal.
    const [departure, arrival] = railNodes();
    const marked = (node: HTMLElement) => node.querySelector('.field');
    expect(marked(departure)?.hasAttribute('data-invalid')).toBe(true);
    expect(marked(departure)?.querySelector('.field-error')?.textContent).toBe(
      t.index.form.returnBeforeArrival,
    );
    // The arrival is fine and is not marked, and nothing was written.
    expect(marked(arrival)?.hasAttribute('data-invalid')).toBe(false);
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
    fireEvent.change(composer(), {
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

  const openHotel = () => {
    render(
      wrapNav(
        <BookingSheet booking={null} seed={{ type: BOOKING_TYPE.HOTEL }} onClose={() => {}} />,
      ),
    );
    pastTypeStep();
  };
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
    expect(composer()).toBeTruthy();
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
    // Push the journey's date outside the trip, then page past it.
    setJourneyDate('2026-07-20');
    next();
    expect(screen.getByText(t.index.sheet.codeLabel)).toBeTruthy();

    // Now break it from the step that cannot show it, and save.
    fireEvent.click(screen.getByText(t.common.steps.back));
    setJourneyDate('2026-08-30');
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
    // A flight's schedule is the rail, not the span block (ADR-0203 §1) — the shortcut has to
    // land on whichever one the type actually gets.
    expect(document.querySelector('.jf')).toBeTruthy();
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
    // Answered, for the same reason `routed` above answers it: a stop is not a direction.
    roundTrip: false,
    ...over,
  });
  const open = (over?: Partial<BookingSheetDraft>) => {
    render(wrapNav(<BookingSheet booking={null} draft={withStop(over)} onClose={() => {}} />));
    pastTypeStep();
  };
  /** Fill the WHOLE journey on its one step (ADR-0203 §7): its date, then every moment in
   *  rail order. The per-leg `fillLeg` this replaces cannot exist any more — there is no
   *  per-leg step to fill on, and no second date to fill it with. */
  const fillChain = (date: string, times: string[]) => fillJourney(date, times);
  /** The moment words for a flight, from the table the component reads — never retyped, so a
   *  copy change cannot make this spec pass for the wrong reason. */
  const labelsFor = timingLabels(BOOKING_TYPE.FLIGHT);
  const label = () => document.querySelector('.form-steps-label')!.textContent;

  /** **This spec asserted the opposite until ADR-0203 §7, which reverses ADR-0159 §5.** That
   *  section chose a step per leg out of the 492px a span schedule cost; a rail leg is two
   *  lines, so the whole journey fits one step — and that is what lets the layover's wait be
   *  stated while you type it, which two steps can never do because the legs are never on
   *  screen together. */
  it('gives the whole journey ONE step, and every leg a node on its rail', () => {
    open();
    expect(label()).toBe(t.index.form.stepWhat);
    next();
    expect(label()).toBe(t.index.form.stepWhen);
    // Three points, two legs, one step.
    expect(railNodes().length).toBe(3);
    /** **A segment row states a leg's cost, so it exists once there IS one** — reported as
     *  spacing ("the line spacing seems off… for the layover"), and it was a blank band
     *  reserved for a measurement that could not be taken yet. Empty: no rows. Filled: one
     *  per leg. The rail stays unbroken either way — every row paints its own full-height
     *  line, so dropping the one between two nodes just makes them adjacent. */
    expect(document.querySelectorAll('.jf-seg').length).toBe(0);
    fillChain('2026-07-19', ['00:30', '06:10', '08:50', '11:35']);
    expect(document.querySelectorAll('.jf-seg').length).toBe(2);
    next();
    expect(label()).toBe(t.index.form.stepDetails);
  });

  /** **A refusal on a node the rail has SUMMARISED is still delivered** — the defect a
   *  layover made reachable, reported from the field. Every moment filled puts the open node
   *  at the last one (§9), so the leg whose arrival rolls past the trip's end is behind a
   *  summary; the form declined to advance and said nothing at all, which is the single
   *  failure `useFormErrors` exists to prevent.
   *
   *  **Two stops, not one** — the threshold moved (§9, 2026-08-24): a one-stop journey fits
   *  the fold, so it no longer summarises and could no longer stage this. The defect is
   *  unchanged; the shape that reaches it is one stop deeper. */
  it('delivers a refusal that lands on a summarised node, and opens it', () => {
    open({ stopPlaceIds: ['pl-dxb', 'pl-tlv'] });
    next();
    fillChain('2026-07-30', ['20:00', '02:00', '03:00', '05:00', '06:00', '07:00']);
    expect(document.querySelectorAll('.jf-sum-tok').length).toBeGreaterThan(0);

    next();
    // It refuses — the journey's date is the trip's last day, so the arrival rolls past it.
    expect(label()).toBe(t.index.form.stepWhen);
    // ...and it SAYS so, in the box that owns the field, which the refusal itself reopened.
    expect(screen.queryByText(t.index.form.dateOutOfRange)).not.toBeNull();
    const marked = document.querySelector('.jf [data-invalid]');
    expect(marked).not.toBeNull();
    // The node it names is open now: its controls are back, not a summary pill.
    expect(marked!.closest('.jf-row')!.querySelector('.jf-sum-tok')).toBeNull();
  });

  /** **A stop's two clocks name themselves** — reported from the field: "you are asked to
   *  pick the time of arrival and of departure to the next destination, but the form doesn't
   *  explain what each time is". Two identical `הוספת שעה` triggers, stacked, with nothing
   *  between them. The plan had `ConnectionBand` doing this, and it measures the WAIT, so it
   *  renders only once both clocks exist — absent for exactly as long as the pair is
   *  ambiguous. */
  it('names both of a layover’s moments, before either is filled', () => {
    open();
    next();
    const stop = railNodes()[1];
    const captions = [...stop.querySelectorAll('.jf-moment-lbl')].map((e) => e.textContent);
    expect(captions).toEqual([labelsFor.end, labelsFor.start]);
    // And the heading no longer names one of the two, which is what made the other read as
    // the unlabelled line.
    expect(stop.querySelector('.jf-node-lbl')!.textContent).not.toContain(labelsFor.end);
    // An endpoint keeps its heading: it has one clock and the heading is already its caption.
    expect(railNodes()[0].querySelector('.jf-moment-lbl')).toBeNull();
    expect(railNodes()[0].querySelector('.jf-node-lbl')!.textContent).toContain(labelsFor.start);
  });

  /** **A clock offers forward from the moment before it** (ADR-0203 §10), through the rail —
   *  the list opened at 00:00 whatever the departure was. The rotation itself is specced on
   *  the primitive; this is the wiring: the anchor arrives, and so does the day turn. */
  it('opens a later moment’s list just after the moment before it', () => {
    open();
    next();
    setJourneyDate('2026-07-19');
    setNodeTime(0, 'depart', '20:30');
    // Open the stop's ARRIVAL panel without setting it, and read what it offers.
    openRailNode(1);
    const stop = railNodes()[1];
    fireEvent.click(stop.querySelectorAll('button.vt-time')[0]);
    const offered = [...stop.querySelectorAll('.tp-list button')].map((e) => e.textContent);
    expect(offered[0]).toBe('20:45');
    expect(offered[offered.length - 1]).toBe('20:30');
    // The day turns inside the list, so the derived day is visible while choosing.
    expect(stop.querySelector('.tp-list-turn')).not.toBeNull();
  });

  it('writes a booking per leg, chained through the stop, in one change group', async () => {
    indexVerbs.createBooking.mockResolvedValue({ id: 'b-leg1' });
    open();
    next();
    fillChain('2026-07-19', ['00:30', '06:10', '08:50', '11:35']);
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
    fillChain('2026-07-19', ['00:30', '06:10', '08:50', '11:35']);
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

  /** **The refusal this spec was named for no longer exists, and that is ADR-0203 §2.**
   *
   *  `legBeforeArrival` could fire because two absolute dates let you enter a departure
   *  before the previous arrival. A journey now carries ONE date and every later moment
   *  resolves to the nearest FORWARD instant, so a stop leaving at 05:40 after landing at
   *  06:10 is not an error to refuse — it is tomorrow, and the leg's own duration states what
   *  that costs. Prevented rather than refused, which is ADR-0150 §8's own rule and the one
   *  `TimeField`'s `minTime` already follows.
   *
   *  `returnBeforeArrival` survives untouched, because a return carries an absolute date of
   *  its own and so genuinely can leave before the outbound lands — the spec for it is in the
   *  round-trip describe above. */
  it('rolls a stop’s departure to the next day rather than refusing it', async () => {
    indexVerbs.createBooking.mockResolvedValue({ id: 'b-leg1' });
    open();
    next();
    fillChain('2026-07-19', ['00:30', '06:10', '05:40', '08:25']);

    // No refusal anywhere on the step, and the step advances.
    expect(document.querySelector('.field[data-invalid]')).toBeNull();
    next();
    expect(label()).toBe(t.index.form.stepDetails);
    save();

    await waitFor(() => expect(indexVerbs.createBooking).toHaveBeenCalledTimes(2));
    const [, second] = indexVerbs.createBooking.mock.calls.map(([b]) => b);
    // The rolled day, in the stop's OWN zone — a real instant, not a date-only guess.
    expect(second.event.startsAt).toBe(zonedIso('2026-07-20', '05:40', 'Asia/Dubai'));
    expect(second.event.endsAt).toBe(zonedIso('2026-07-20', '08:25', 'Asia/Jerusalem'));
  });

  /** **§9, wired**: nobody picks a node, so the form derives which one is open — the first
   *  whose moments are still empty — and the ones BEHIND it collapse to the line they read as.
   *  That is what keeps a deep journey inside a fold instead of the 708px §7 measured, and it
   *  is why the ADR's compaction claim is about filling rather than about arriving.
   *
   *  **At two stops, which is where compaction starts earning its keep** (§9's threshold,
   *  corrected 2026-08-24). The spec used one stop until a field report pointed out that a
   *  one-stop form never overflowed, so collapsing it was all cost. */
  it('walks the rail as you fill it, summarising only what is behind you', () => {
    open({ stopPlaceIds: ['pl-dxb', 'pl-tlv'] });
    next();
    const summarised = () => railNodes().map((node) => node.querySelector('.jf-sum-tok') != null);
    // On arrival nothing is filled, so nothing is compacted: an empty node has no line to
    // read as, and a blank pill where a clock should be is worse than the height.
    expect(summarised()).toEqual([false, false, false, false]);

    setJourneyDate('2026-07-19');
    setNodeTime(0, 'depart', '00:30');
    // The departure is answered, so the rail moves on and the node behind it summarises.
    expect(summarised()).toEqual([true, false, false, false]);

    setNodeTime(1, 'arrive', '06:10');
    setNodeTime(1, 'depart', '08:50');
    expect(summarised()).toEqual([true, true, false, false]);

    // A summarised node is still a control (§9): tapping its line reopens it, and the rail
    // does not lose the journey's one date by collapsing the node that holds it.
    openRailNode(0);
    expect(summarised()).toEqual([false, true, false, false]);
    expect((document.querySelector('.jf .vt-date input') as HTMLInputElement).value).toBe(
      '2026-07-19',
    );
  });

  /** **The threshold itself, pinned** — reported from the field: "the lines collapsing under
   *  your fingers could be a little confusing and so maybe do it only when the form is very
   *  long". §9's own fold table already said so: 0–1 stops are inside the fold on both a
   *  390×844 and a 360×640 phone, and the cases compaction was written for are two stops
   *  (718.5px all-open against 675px) and three (894px). The code shipped the threshold one
   *  stop too low, so a journey that never overflowed paid for the fix anyway.
   *
   *  Both arms in one spec on purpose: the number is only meaningful as the line between them,
   *  and a spec that asserted just the quiet side would pass with compaction deleted. */
  it('never summarises at one stop, and still does at two', () => {
    const anySummarised = () => document.querySelectorAll('.jf-sum-tok').length > 0;

    open({ stopPlaceIds: ['pl-dxb'] });
    next();
    expect(railNodes().length).toBe(3);
    fillChain('2026-07-19', ['00:30', '06:10', '08:50', '11:35']);
    // Everything filled, and every node still open: the form fits, so there is nothing to buy.
    expect(anySummarised()).toBe(false);
    cleanup();

    open({ stopPlaceIds: ['pl-dxb', 'pl-tlv'] });
    next();
    expect(railNodes().length).toBe(4);
    fillChain('2026-07-19', ['00:30', '06:10', '08:50', '11:35', '13:00', '15:20']);
    expect(anySummarised()).toBe(true);
  });

  /** **A tap does not survive the rail shrinking under it.** `openNode[side]` is the node you
   *  PICKED, and it used to be read before the threshold — so tapping a summary at two stops
   *  and then removing a stop brought the pick back to a rail that no longer summarises, and a
   *  pick left pointing past the end matched no node and collapsed every one of them. Found by
   *  re-reading the diff, not by a report. */
  it('drops a node pick when the rail falls back below the threshold', () => {
    open({ stopPlaceIds: ['pl-dxb', 'pl-tlv'] });
    next();
    fillChain('2026-07-19', ['00:30', '06:10', '08:50', '11:35', '13:00', '15:20']);
    // Pick the LAST node explicitly, which is the pick that would dangle once one goes.
    fireEvent.click([...document.querySelectorAll('.jf-sum-tok')].slice(-1)[0]);

    // Back to the route, drop a stop, and return: three nodes, and nothing compacted.
    press(t.common.steps.back);
    fireEvent.click(document.querySelectorAll('.place-picker-stop .pp-clear')[1]);
    next();
    expect(railNodes().length).toBe(3);
    expect(document.querySelectorAll('.jf-sum-tok').length).toBe(0);
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
    fillChain('2026-07-19', ['00:30', '06:10', '08:50', '11:35']);
    next();
    fireEvent.change(composer(), {
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
  const openFresh = () => {
    render(
      wrapNav(<BookingSheet booking={null} seed={{ type: BOOKING_TYPE.CAR }} onClose={() => {}} />),
    );
    pastTypeStep();
  };

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

// **The type is asked first, then collapses** (field report #2), **a name is derived
// rather than demanded** (#9), and **the schedule opens on an offer** (#11). Three
// reports, one authoring pass — kept together because they are what a create form now
// feels like end to end, and separating them would test three halves of one flow.
describe('BookingSheet — the type step, the derived name and the offered schedule', () => {
  afterEach(() => {
    cleanup();
    indexVerbs.createBooking.mockReset();
  });

  const stepLabel = () => document.querySelector('.form-steps-label')?.textContent;
  const openCreate = (type: BookingType) =>
    render(wrapNav(<BookingSheet booking={null} seed={{ type }} onClose={() => {}} />));
  const typeRow = () => document.querySelector('.bs-type-row');

  it('opens ON the type grid, with nothing else competing for the step', () => {
    openCreate(BOOKING_TYPE.HOTEL);
    expect(stepLabel()).toBe(t.index.form.stepType);
    expect(screen.getByRole('radiogroup', { name: t.index.form.kindLabel })).toBeTruthy();
    // The identity row is not on this step — the grid is the whole question.
    expect(screen.queryByPlaceholderText(t.index.sheet.titlePlaceholder)).toBeNull();
    // And no collapsed row either: the answer is the grid itself here.
    expect(typeRow()).toBeNull();
  });

  it('collapses to the picked type on every later step, and goes back on שינוי', () => {
    openCreate(BOOKING_TYPE.HOTEL);
    press(t.common.steps.next);
    expect(within(typeRow() as HTMLElement).getByText(t.index.bookingType.hotel)).toBeTruthy();
    // The grid is gone; only the one card that was chosen remains.
    expect(screen.queryByRole('radiogroup', { name: t.index.form.kindLabel })).toBeNull();

    fireEvent.click(screen.getByText(t.common.change));
    expect(stepLabel()).toBe(t.index.form.stepType);
    fireEvent.click(screen.getByText(t.index.bookingType.restaurant));
    press(t.common.steps.next);
    expect(within(typeRow() as HTMLElement).getByText(t.index.bookingType.restaurant)).toBeTruthy();
  });

  // A create form OPENS on the type step, and an errand re-mounts the sheet — so without
  // the return landing on `מה ואיפה`, picking a place would drop you one step behind the
  // field you left, re-asking a question you already answered (ADR-0134 §2's channel).
  it('comes back from a place errand at the identity step, not the type step', () => {
    render(
      wrapNav(
        <BookingSheet
          booking={null}
          draft={bookingSheetDraft({
            booking: null,
            seed: { type: BOOKING_TYPE.HOTEL },
            trip,
            events: [],
            places,
          })}
          onClose={() => {}}
        />,
      ),
    );
    expect(stepLabel()).toBe(t.index.form.stepWhat);
    expect(screen.getByPlaceholderText(t.index.sheet.titlePlaceholder)).toBeTruthy();
  });

  // An edit still gains NO step — a step is paid on every pass through the form and changing
  // a type is a rare edit (owner, 2026-08-12) — but the row it collapses into is a control
  // now, and the grid arrives in place.
  it('adds no step to an EDIT, and reveals the type grid in place instead', () => {
    render(wrapNav(<BookingSheet booking={flight} onClose={() => {}} />));
    // Straight to the identity step: a saved booking's type is still not a question.
    expect(stepLabel()).toBe(t.index.form.stepWhat);
    const row = screen.getByRole('button', { name: t.index.form.stepType });
    expect(within(row).getByText(t.index.bookingType.flight)).toBeTruthy();
    expect(row.getAttribute('aria-expanded')).toBe('false');
    // Closed, the grid is MOUNTED but unreachable — `Collapsible` never unmounts (so the
    // reveal has something to animate against), and `max-height: 0` hides a thing from the eye
    // only, so without `inert` a screen reader would read out eight radios that are not on
    // screen and a keyboard would tab into them.
    const grid = () => screen.getByRole('radiogroup', { name: t.index.form.kindLabel });
    expect(grid().closest('[inert]')).toBeTruthy();

    fireEvent.click(row);
    expect(row.getAttribute('aria-expanded')).toBe('true');
    expect(grid().closest('[inert]')).toBeNull();
    // And no step was added on the way.
    expect(stepLabel()).toBe(t.index.form.stepWhat);
  });

  // **The type has to reach the wire**, and for one release it did not: this payload never
  // carried `type` — honestly, since the type was not editable — and the omission survived
  // making it editable. Every other edited field saved and the type silently did not, which
  // reads as "the category did not change", a booking's category being its type (ADR-0038).
  const typeRowControl = () => screen.getByRole('button', { name: t.index.form.stepType });
  /** Open the collapsed row, pick a type, and accept the confirm if one is raised. Flight is
   *  route-shaped, so a switch away from it strands a route and therefore always asks. */
  const switchTypeTo = (label: string) => {
    fireEvent.click(typeRowControl());
    fireEvent.click(screen.getByText(label));
    const confirm = screen.queryByText(t.index.form.switchConfirm);
    if (confirm) fireEvent.click(confirm);
  };

  it('sends the new type on save, so the category actually moves', async () => {
    render(wrapNav(<BookingSheet booking={flight} onClose={() => {}} />));
    switchTypeTo(t.index.bookingType.activity);
    await save();
    expect(indexVerbs.updateBooking).toHaveBeenCalled();
    expect(indexVerbs.updateBooking.mock.calls[0][1]).toMatchObject({
      type: BOOKING_TYPE.ACTIVITY,
    });
  });

  // Reported on the shipped build: the grid stayed open after a pick, hiding the very statement
  // the pick had just rewritten.
  it('collapses the type grid once a type is chosen', () => {
    render(wrapNav(<BookingSheet booking={flight} onClose={() => {}} />));
    fireEvent.click(typeRowControl());
    expect(typeRowControl().getAttribute('aria-expanded')).toBe('true');
    switchTypeTo(t.index.bookingType.activity);
    expect(typeRowControl().getAttribute('aria-expanded')).toBe('false');
  });

  // **A lossy switch asks at the TAP**, because the tap is what takes the route off the form —
  // by the save those boxes are long gone. And a refused confirm changes nothing AND leaves the
  // grid up, which is what makes `ביטול` clean here and useless at save time.
  it('asks before a switch that strands something, and a refusal changes nothing', () => {
    render(wrapNav(<BookingSheet booking={flight} onClose={() => {}} />));
    fireEvent.click(typeRowControl());
    fireEvent.click(screen.getByText(t.index.bookingType.activity));
    expect(screen.getByText(t.index.form.switchBody)).toBeTruthy();

    const dialog = screen.getByRole('dialog', {
      name: t.index.form.switchTitle(t.index.bookingType.activity),
    });
    fireEvent.click(within(dialog).getByText(t.common.cancel));
    expect(within(typeRowControl()).getByText(t.index.bookingType.flight)).toBeTruthy();
    expect(typeRowControl().getAttribute('aria-expanded')).toBe('true');
  });

  // A switch that strands nothing is silent and instant — which is why browsing the grid on a
  // near-empty create form never raises this at all.
  it('does not ask for a switch that strands nothing', () => {
    render(wrapNav(<BookingSheet booking={flight} onClose={() => {}} />));
    fireEvent.click(typeRowControl());
    fireEvent.click(screen.getByText(t.index.bookingType.train));
    expect(screen.queryByText(t.index.form.switchBody)).toBeNull();
    expect(within(typeRowControl()).getByText(t.index.bookingType.train)).toBeTruthy();
  });

  // **An edit can be finished from any step** (owner, 2026-08-12) — paging through the rest of
  // the form just to commit is the cost this removes. Safe because `submit` re-validates every
  // step and lands on the first refusal (ADR-0155 §2), so it is still one commit.
  it('offers שמירה beside הבא on an edit, and not on a create', () => {
    const { unmount } = render(wrapNav(<BookingSheet booking={flight} onClose={() => {}} />));
    expect(screen.getByRole('button', { name: t.common.steps.next })).toBeTruthy();
    expect(screen.getByRole('button', { name: t.common.save })).toBeTruthy();
    unmount();

    openCreate(BOOKING_TYPE.HOTEL);
    press(t.common.steps.next);
    // A create's steps are questions the type shaped; finishing early would only be refused.
    expect(screen.queryByRole('button', { name: t.common.save })).toBeNull();
  });

  // **A booking is named by its place when nobody names it** (field report #9). The name
  // is DERIVED, not merely optional — it is what gets stored, so every surface that
  // receives only a title reads the place rather than a blank.
  it('saves a nameless hotel under its linked place, having refused nothing', () => {
    openCreate(BOOKING_TYPE.HOTEL);
    pastTypeStep();
    // The placeholder already says what it will be called, once a place is picked.
    expect(screen.getByPlaceholderText(t.index.sheet.titlePlaceholder)).toBeTruthy();
    toLastStep();
    save();
    expect(indexVerbs.createBooking).toHaveBeenCalledWith(
      expect.objectContaining({ title: t.index.bookingType.hotel }),
    );
  });

  it('lets a typed name win over the derived one', () => {
    openCreate(BOOKING_TYPE.HOTEL);
    pastTypeStep();
    fireEvent.change(screen.getByPlaceholderText(t.index.sheet.titlePlaceholder), {
      target: { value: 'הבקתה' },
    });
    toLastStep();
    save();
    expect(indexVerbs.createBooking).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'הבקתה' }),
    );
  });

  // **The schedule opens on an offer** (field report #11), and the offer is the type's.
  it('fills a hotel span from its check-in/check-out convention when the day is set', () => {
    openCreate(BOOKING_TYPE.HOTEL);
    pastTypeStep();
    press(t.common.steps.next);
    const [checkIn, checkOut] = [...document.querySelectorAll<HTMLElement>('.wf-leg')];
    fireEvent.change(checkIn.querySelector('.vt-date input') as HTMLInputElement, {
      target: { value: '2026-07-26' },
    });
    expect((checkIn.querySelector('.vt-date input') as HTMLInputElement).value).toBe('2026-07-26');
    expect(within(checkIn).getByText('15:00')).toBeTruthy();
    // The stay cannot be zero nights, so the check-out opens on the following day.
    expect((checkOut.querySelector('.vt-date input') as HTMLInputElement).value).toBe('2026-07-27');
    expect(within(checkOut).getByText('10:00')).toBeTruthy();
  });

  /** **The arrival's date is gone, so the offer is that there is nothing to offer** (ADR-0203
   *  §2). This spec pinned the mirror: setting the departure's day copied it onto the arrival's,
   *  which is the second identical date+time block the reported misread was made of. What
   *  survives is the half that still exists and still matters — **no clock is ever invented** —
   *  plus the fact that replaced the mirror: a journey has exactly ONE date, before the day is
   *  set and after. */
  it('gives a flight one date and never invents a clock', () => {
    // Routed through the errand-return `draft`, because a flight with no endpoints is
    // refused at the identity step and never reaches its schedule.
    render(
      wrapNav(
        <BookingSheet
          booking={null}
          draft={{
            ...bookingSheetDraft({
              booking: null,
              seed: { type: BOOKING_TYPE.FLIGHT },
              trip,
              events: [],
              places,
            }),
            fromPlaceId: 'pl-tlv',
            toPlaceId: 'pl-nrt',
            roundTrip: false,
          }}
          onClose={() => {}}
        />,
      ),
    );
    pastTypeStep();
    press(t.common.steps.next);
    const dates = () => document.querySelectorAll('.jf .vt-date input');
    expect(dates().length).toBe(1);
    setJourneyDate('2026-07-26');
    // Still one. A return flight would need a second and there is none to mistake it for.
    expect(dates().length).toBe(1);
    expect((dates()[0] as HTMLInputElement).value).toBe('2026-07-26');
    // No time was invented at either end — a departure is the commitment itself.
    const [depart, arrive] = railNodes();
    expect(within(depart).getByText(t.whenField.addTime)).toBeTruthy();
    expect(within(arrive).getByText(t.whenField.addTime)).toBeTruthy();
  });
});

/* ── WHAT WOULD ANSWER THIS ERRAND (field report #6) ───────────────────────────────────────
   A flight leg wants an AIRPORT, so the tab's search is restricted to one. The sheet is the
   only thing that knows the question; the Map owns the search (ADR-0134 §1). */
describe('BookingSheet — a route leg asks the Map for the kind it boards at', () => {
  afterEach(() => {
    cleanup();
    startErrand.mockReset();
  });

  /** The route field's own way in — `＋ מיקום` on the origin, whichever booking type. */
  const tapOrigin = () => {
    const triggers = document.querySelectorAll<HTMLElement>('.pp-addbtn, .pp-trigger');
    fireEvent.click(triggers[0]);
  };

  const openCreate = (type: BookingType) => {
    render(
      wrapNav(
        <BookingSheet
          booking={null}
          draft={bookingSheetDraft({ booking: null, seed: { type }, trip, events: [], places })}
          onClose={() => {}}
        />,
      ),
    );
    pastTypeStep();
  };

  it('names the airport kind on a flight’s origin', () => {
    openCreate(BOOKING_TYPE.FLIGHT);
    tapOrigin();
    expect(startErrand).toHaveBeenCalledWith(expect.objectContaining({ kind: 'airport' }));
  });

  /** **This spec used to assert the opposite, and that is the point of ADR-0203 §8.** It
   *  pinned "names NO kind on a train's origin" — the gap `findPlace`'s own comment named
   *  ("a train's stop is a station this restriction has no type for yet"), which left a
   *  train, a bus and a ferry searching the whole corpus. The kind now comes off
   *  `BOOKING_TYPE_PROFILE`, so the type is not asked at this call site at all. */
  it('names the station kind on a train’s origin, and the wider one on a bus', () => {
    openCreate(BOOKING_TYPE.TRAIN);
    tapOrigin();
    expect(startErrand).toHaveBeenCalledWith(expect.objectContaining({ kind: 'train_station' }));
    startErrand.mockReset();
    cleanup();
    openCreate(BOOKING_TYPE.TRANSIT);
    tapOrigin();
    expect(startErrand).toHaveBeenCalledWith(expect.objectContaining({ kind: 'transit_station' }));
  });

  /** A hire's two ends are rental COUNTERS, so it restricts nothing — the one route-shaped
   *  type with no search kind, and the reason the profile axis keys on being CARRIED
   *  (`inMotion`) rather than on carrying a route. */
  it('names no kind on a hire’s counters, though a hire carries a route', () => {
    openCreate(BOOKING_TYPE.CAR);
    tapOrigin();
    expect(startErrand).toHaveBeenCalledTimes(1);
    expect(startErrand.mock.calls[0][0].kind).toBeUndefined();
  });

  // A hotel's single place is the hotel. The restriction is about the ROUTE fields only, even
  // on a flight — which no other type could have shown, since only a flight has both.
  it('names no kind on a single-place field', () => {
    render(
      wrapNav(
        <BookingSheet
          booking={null}
          draft={bookingSheetDraft({
            booking: null,
            seed: { type: BOOKING_TYPE.HOTEL },
            trip,
            events: [],
            places,
          })}
          onClose={() => {}}
        />,
      ),
    );
    pastTypeStep();
    tapOrigin();
    expect(startErrand.mock.calls[0][0]).not.toHaveProperty('kind');
  });
});
// ── A derived value follows its source until a person overrides it (field reports #30/#31)
//
// Field report #9 gave this sheet the right SAVED name and left the authoring behaviour
// behind: the derived title showed as a ghost placeholder while the input stayed empty. The
// visible value and `finalTitle` are one precedence rule now — which is why every case here
// asserts the box AND what the save sends, so the two can never drift apart again.
describe('BookingSheet — the name follows the place, the glyph follows the type', () => {
  // By class, not by placeholder: the placeholder IS the derived name once a place is
  // linked (field report #9), so querying by it would stop finding the box exactly where
  // these tests need to read it.
  const titleBox = () => document.querySelector('.bs-title') as HTMLInputElement;
  const iconChip = () => screen.getByRole('button', { name: t.iconPicker.open });
  /** The errand round trip, as the app performs it (`PlacePicker` launches, the Map answers,
   *  `assignErrandPlace` writes the id into the opaque draft and the sheet re-mounts). */
  const errandBack = (placeId: string) => {
    fireEvent.click(screen.getByRole('button', { name: t.placePicker.open }));
    const draft = startErrand.mock.calls.at(-1)?.[0]?.draft as BookingSheetDraft;
    cleanup();
    render(
      wrapNav(<BookingSheet booking={null} draft={{ ...draft, placeId }} onClose={() => {}} />),
    );
  };
  const hotel = (fields: Partial<Booking>): Booking => ({
    id: 'bk-h',
    tripId: 't1',
    type: BOOKING_TYPE.HOTEL,
    title: '',
    source: BOOKING_SOURCE.MANUAL,
    createdAt: '',
    updatedAt: '',
    updatedBy: 'u1',
    ...fields,
  });

  afterEach(cleanup);

  it('fills a blank untouched name from the place that comes back', () => {
    render(
      wrapNav(
        <BookingSheet booking={null} seed={{ type: BOOKING_TYPE.HOTEL }} onClose={() => {}} />,
      ),
    );
    pastTypeStep();
    expect(titleBox().value).toBe('');
    errandBack('pl-nrt');
    expect(titleBox().value).toBe('טוקיו');
    toLastStep();
    save();
    expect(indexVerbs.createBooking).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'טוקיו' }),
    );
  });

  it('follows a REPLACEMENT place while the name is still derived', () => {
    render(
      wrapNav(
        <BookingSheet booking={hotel({ title: 'טוקיו', placeId: 'pl-nrt' })} onClose={() => {}} />,
      ),
    );
    expect(titleBox().value).toBe('טוקיו');
    errandBack('pl-dxb');
    expect(titleBox().value).toBe('דובאי');
  });

  it('keeps a typed name through a place change, and saves it', () => {
    render(
      wrapNav(
        <BookingSheet booking={null} seed={{ type: BOOKING_TYPE.HOTEL }} onClose={() => {}} />,
      ),
    );
    pastTypeStep();
    fireEvent.change(titleBox(), { target: { value: 'הבקתה' } });
    errandBack('pl-nrt');
    expect(titleBox().value).toBe('הבקתה');
    toLastStep();
    save();
    expect(indexVerbs.createBooking).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'הבקתה' }),
    );
  });

  it('carries the name latch across the errand', () => {
    render(
      wrapNav(
        <BookingSheet booking={null} seed={{ type: BOOKING_TYPE.HOTEL }} onClose={() => {}} />,
      ),
    );
    pastTypeStep();
    fireEvent.click(screen.getByRole('button', { name: t.placePicker.open }));
    expect(startErrand.mock.calls.at(-1)?.[0]?.draft).toMatchObject({ titleTouched: false });
    fireEvent.change(titleBox(), { target: { value: 'הבקתה' } });
    fireEvent.click(screen.getByRole('button', { name: t.placePicker.open }));
    expect(startErrand.mock.calls.at(-1)?.[0]?.draft).toMatchObject({
      title: 'הבקתה',
      titleTouched: true,
    });
  });

  // The type label is the other half of #9's chain, and it is just as derived as a place
  // name — so a booking saved nameless must still pick up a place added later.
  it('reopens a type-labelled booking as still derived', () => {
    render(
      wrapNav(
        <BookingSheet booking={hotel({ title: t.index.bookingType.hotel })} onClose={() => {}} />,
      ),
    );
    expect(titleBox().value).toBe(t.index.bookingType.hotel);
    errandBack('pl-nrt');
    expect(titleBox().value).toBe('טוקיו');
  });

  // Clearing the box is an explicit act, so the SAVE still falls back exactly as it did
  // before — the branch field report #9 built and this change must not have moved.
  it('falls back to the type label when the name is cleared', () => {
    render(
      wrapNav(
        <BookingSheet booking={hotel({ title: 'טוקיו', placeId: 'pl-nrt' })} onClose={() => {}} />,
      ),
    );
    fireEvent.change(titleBox(), { target: { value: '' } });
    toLastStep();
    save();
    // The place is still linked, so the chain's first rung answers — as it always has.
    expect(indexVerbs.updateBooking).toHaveBeenCalledWith(
      'bk-h',
      expect.objectContaining({ title: 'טוקיו' }),
    );
  });

  // ── PARITY, ASSERTED RATHER THAN CHANGED (field report #37) ─────────────────────────
  // `EventForm` adopted this sheet's precedence and both now resolve it through the one
  // `effectiveTitle`. These two pin the behaviour that was already here, so the sharing
  // cannot quietly move it.
  it('shows the linked place as the placeholder — the name the save will write', () => {
    render(
      wrapNav(
        <BookingSheet booking={null} seed={{ type: BOOKING_TYPE.HOTEL }} onClose={() => {}} />,
      ),
    );
    pastTypeStep();
    expect(titleBox().placeholder).toBe(t.index.sheet.titlePlaceholder);
    errandBack('pl-nrt');
    expect(titleBox().placeholder).toBe('טוקיו');
  });

  it('treats a whitespace-only name as blank and saves the place instead', () => {
    render(
      wrapNav(
        <BookingSheet booking={hotel({ title: 'טוקיו', placeId: 'pl-nrt' })} onClose={() => {}} />,
      ),
    );
    fireEvent.change(titleBox(), { target: { value: '   ' } });
    toLastStep();
    save();
    expect(indexVerbs.updateBooking).toHaveBeenCalledWith(
      'bk-h',
      expect.objectContaining({ title: 'טוקיו' }),
    );
  });

  // A journey is named by its route (ADR-0059 §3) and a hire by its company (ADR-0163 §3):
  // neither reads the title box, and neither is pulled into the place rule.
  it('leaves a flight route-derived', () => {
    render(wrapNav(<BookingSheet booking={flight} onClose={() => {}} />));
    expect(screen.queryByPlaceholderText(t.index.sheet.titlePlaceholder)).toBeNull();
    toLastStep();
    save();
    expect(indexVerbs.updateBooking).toHaveBeenCalledWith(
      'bk',
      expect.objectContaining({ title: routeTitle('תל אביב', 'טוקיו') }),
    );
  });

  // ── #31, the sheet's own half ────────────────────────────────────────────────────────
  // `iconTouched` was a flat `false` here, so a genuinely custom saved glyph reopened
  // claiming nobody had picked it — and the ✨ revert, whose whole job is to hand the
  // glyph back to the derivation, never appeared on a booking that had one to revert.
  it('offers the revert for a saved custom glyph, and not for the type’s own', () => {
    render(wrapNav(<BookingSheet booking={hotel({ title: 'הבקתה' })} onClose={() => {}} />));
    expect(iconChip().textContent).toBe('🏨');
    expect(screen.queryByText(t.index.form.reset)).toBeNull();
  });

  it('keeps a picked glyph and reverts it back to the type on ✨', () => {
    render(
      wrapNav(
        <BookingSheet booking={null} seed={{ type: BOOKING_TYPE.HOTEL }} onClose={() => {}} />,
      ),
    );
    pastTypeStep();
    fireEvent.click(iconChip());
    const other = [...document.querySelectorAll<HTMLElement>('.icon-cell')].find(
      (cell) => cell.textContent !== '🏨',
    )!;
    const glyph = other.textContent;
    fireEvent.click(other);
    expect(iconChip().textContent).toBe(glyph);
    // The ✨ hands it back to the derivation, which is the type's own glyph again.
    fireEvent.click(screen.getByText(t.index.form.reset));
    expect(iconChip().textContent).toBe('🏨');
  });
});

// **THE WINDOW IS OFF BY DEFAULT, AND THAT IS THE WHOLE BRIEF** (ADR-0184 §2; owner:
// _"I don't want the default to have both the check-in start and check-in end time. I want
// a separate click or something to enable this feature."_). So the assertions here are
// mostly about ABSENCE — what the form does not show, and to whom it does not show it.
describe('BookingSheet — the opt-in check-in window', () => {
  afterEach(() => cleanup());

  const openWhenStep = (type: BookingType) => {
    render(wrapNav(<BookingSheet booking={null} seed={{ type }} onClose={() => {}} />));
    pastTypeStep();
    next();
  };

  it('offers ONE dashed token per held edge, and nothing is filled in', () => {
    openWhenStep(BOOKING_TYPE.HOTEL);
    // Check-in and check-out each carry the offer, and both are empty — **and they carry
    // DIFFERENT words** (2026-08-13). A check-in's own time is the window's floor, so its
    // second bound is a ceiling and reads `עד`; a check-out's own time IS the deadline and
    // its second bound is the earliest you may leave, so it reads `מ־`. Labelling both `עד`
    // invited a check-out of `06:00` plus `עד 11:00`, which stored an 11:00 that
    // `windowBoundIso` rolled back a day into a 19-hour window.
    expect(screen.getAllByText(t.whenField.addWindow)).toHaveLength(1);
    expect(screen.getAllByText(t.whenField.addWindowFrom)).toHaveLength(1);
    // The prose words only appear once a window exists, so an untouched form has none.
    expect(screen.queryByText(t.whenField.rangeTo)).toBeNull();
    expect(screen.queryByText(t.whenField.rangeFrom)).toBeNull();
  });

  it('does not offer it on a flight, whose ends are instants', () => {
    openWhenStep(BOOKING_TYPE.FLIGHT);
    expect(screen.queryByText(t.whenField.addWindow)).toBeNull();
  });

  it('offers it on a car hire too — the gate is the profile, not the type', () => {
    openWhenStep(BOOKING_TYPE.CAR);
    expect(screen.getAllByText(t.whenField.addWindow).length).toBeGreaterThan(0);
  });

  it('does not offer it on a booking with no span to widen', () => {
    openWhenStep(BOOKING_TYPE.RESTAURANT);
    expect(screen.queryByText(t.whenField.addWindow)).toBeNull();
  });
});

// @vitest-environment jsdom
//
// **This file exists because session 186 migrated `CreateTrip`'s two auto-suggest fields onto
// `useDerivedField` and found the screen had NO tests at all** — and no e2e spec reaches it
// either, so a regression in the name/flag auto-suggest would have shipped silently.
//
// Scope is deliberately the two derived fields, not the whole screen: they are what changed.
// The destination picker is stubbed to a plain button so the test drives `handleDestination`
// (which is what re-runs the suggestion) without the search sheet's machinery in the way.
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { wrapNav } from '../test/nav-harness';

Element.prototype.scrollIntoView = vi.fn();

vi.mock('../lib/outbox', () => ({ useIsOffline: () => false }));
vi.mock('../state/active-trip-id', () => ({ useActiveTripId: () => ({ setTripId: vi.fn() }) }));
vi.mock('../lib/api', () => ({ createTrip: vi.fn(), createInvite: vi.fn() }));

// One button per fixture, so a test picks a destination in one click. `JP` is a recognised
// destination (it has a flag to suggest); `Narnia` is a "use as typed" pick with none.
vi.mock('../ui/DestinationPicker', () => ({
  DestinationPicker: ({ onPick }: { onPick: (d: unknown) => void }) => (
    <>
      <button data-testid="pick-japan" onClick={() => onPick({ name: 'יפן', country: 'JP' })} />
      <button data-testid="pick-narnia" onClick={() => onPick({ name: 'נარניה' })} />
    </>
  ),
}));

import { CreateTrip } from './CreateTrip';
import { setSimulatedNow } from '../lib/useClock';
import { createInvite, createTrip } from '../lib/api';
import { suggestTripName } from '../lib/trip-name';
import { MAX_TRIP_NAME_LENGTH, suggestFlagFromDestination, type Trip } from '@waypoint/shared';
import { DEFAULT_TRIP_ICON, TRIP_BIRTH } from '../constants';
import { t } from '../i18n/he';

// PIN THE CLOCK (frontend/CLAUDE.md): `suggestTripName` falls back to the CURRENT YEAR while
// the start date is empty, so an unpinned test asserts a different name every January.
const NOW = Date.parse('2026-07-20T09:00:00Z');

/** The trip the stubbed POST returns — the birth sequence renders from it. Only the
 *  fields the sequence reads are given; the rest of `Trip` never reaches the DOM. */
const TRIP = {
  id: 't1',
  name: 'יפן · ספטמבר',
  destination: 'יפן',
  startDate: '2026-09-12',
  endDate: '2026-09-23',
  timezone: 'Asia/Tokyo',
  icon: '🇯🇵',
} as Trip;

describe('CreateTrip — the auto-suggested name and flag (ADR-0032/ADR-0038)', () => {
  beforeEach(() => setSimulatedNow(NOW));
  afterEach(() => {
    setSimulatedNow(null);
    cleanup();
  });

  const nameInput = () => screen.getByPlaceholderText(t.shell.newTrip.namePlaceholder);
  const icon = () => document.querySelector('.title-row .wp-iconpicker-btn, .title-row button');

  it('suggests the name and the flag from a picked destination', () => {
    render(wrapNav(<CreateTrip />));
    expect((nameInput() as HTMLInputElement).value).toBe('');

    fireEvent.click(screen.getByTestId('pick-japan'));

    expect((nameInput() as HTMLInputElement).value).toBe(suggestTripName('יפן', ''));
    expect(icon()?.textContent).toContain(suggestFlagFromDestination('יפן'));
  });

  // THE GUARD, and the reason the flag exists at all (ADR-0038: auto-fill, overridable). Fails
  // if `redrive` stops honouring `touched` — which is exactly what the session-186 migration
  // could have broken silently, since nothing else covered this screen.
  it('stops suggesting the name once the user has typed one', () => {
    render(wrapNav(<CreateTrip />));
    fireEvent.change(nameInput(), { target: { value: 'הטיול שלי' } });

    fireEvent.click(screen.getByTestId('pick-japan'));

    expect((nameInput() as HTMLInputElement).value).toBe('הטיול שלי');
    // …and the flag, untouched, still follows the destination. The two are independent.
    expect(icon()?.textContent).toContain(suggestFlagFromDestination('יפן'));
  });

  it('re-suggests on a second destination while the name is untouched', () => {
    render(wrapNav(<CreateTrip />));
    fireEvent.click(screen.getByTestId('pick-japan'));
    expect((nameInput() as HTMLInputElement).value).toBe(suggestTripName('יפן', ''));

    fireEvent.click(screen.getByTestId('pick-narnia'));
    expect((nameInput() as HTMLInputElement).value).toBe(suggestTripName('נარניה', ''));
  });

  // An unrecognised destination has no flag, so the glyph falls back rather than going blank.
  it('falls back to the default glyph for a destination with no flag', () => {
    render(wrapNav(<CreateTrip />));
    fireEvent.click(screen.getByTestId('pick-narnia'));
    expect(icon()?.textContent).toContain(DEFAULT_TRIP_ICON);
  });

  it('caps a typed name at the schema limit rather than letting it grow', () => {
    render(wrapNav(<CreateTrip />));
    fireEvent.change(nameInput(), { target: { value: 'א'.repeat(200) } });
    expect((nameInput() as HTMLInputElement).value.length).toBe(MAX_TRIP_NAME_LENGTH);
  });
});

// ── Trip birth (ADR-0141) ────────────────────────────────────────────────────
// The CHOREOGRAPHY is what can be logically wrong: which beat has landed, whether a
// skip lands all of them, and whether reduced motion still reaches the same outcome.
// How it LOOKS is CSS and a human pass; these assert the state machine driving it.
describe('CreateTrip — the birth sequence (ADR-0141)', () => {
  beforeEach(() => setSimulatedNow(NOW));
  afterEach(() => {
    setSimulatedNow(null);
    vi.useRealTimers();
    vi.unstubAllGlobals();
    cleanup();
  });

  const root = () => document.querySelector<HTMLElement>('.birth')!;
  const beats = () => ({
    birth: root().dataset.birth,
    chrome: root().dataset.chrome,
    board: root().dataset.board,
    content: root().dataset.content,
  });

  /** Fill the form and create, resolving the POST. Returns once the trip exists. */
  async function create() {
    render(wrapNav(<CreateTrip />));
    fireEvent.click(screen.getByTestId('pick-japan'));
    const [start, end] = document.querySelectorAll('input[type="date"]');
    fireEvent.change(start, { target: { value: '2026-09-12' } });
    fireEvent.change(end, { target: { value: '2026-09-23' } });
    vi.mocked(createTrip).mockResolvedValue(TRIP);
    vi.mocked(createInvite).mockResolvedValue({ inviteUrl: '/join/7Kq2mB' });
    await act(async () => {
      fireEvent.click(screen.getByText(t.shell.newTrip.createButton));
    });
  }

  it('arms the CTA only once the form is complete (U-13 given a beat)', () => {
    render(wrapNav(<CreateTrip />));
    const cta = () => screen.getByText(t.shell.newTrip.createButton);
    expect(cta().hasAttribute('data-armed')).toBe(false);

    fireEvent.click(screen.getByTestId('pick-japan'));
    // A destination alone is not a complete form — dates are still missing.
    expect(cta().hasAttribute('data-armed')).toBe(false);

    const [start, end] = document.querySelectorAll('input[type="date"]');
    fireEvent.change(start, { target: { value: '2026-09-12' } });
    fireEvent.change(end, { target: { value: '2026-09-23' } });
    expect(cta().hasAttribute('data-armed')).toBe(true);
  });

  it('does not arm on a date range that is invalid', () => {
    render(wrapNav(<CreateTrip />));
    fireEvent.click(screen.getByTestId('pick-japan'));
    const [start, end] = document.querySelectorAll('input[type="date"]');
    fireEvent.change(start, { target: { value: '2026-09-23' } });
    fireEvent.change(end, { target: { value: '2026-09-12' } });
    expect(screen.getByText(t.shell.newTrip.createButton).hasAttribute('data-armed')).toBe(false);
  });

  it('plays the beats in order, each waiting for its own offset', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await create();

    // Beat 0: the card travels and commits the moment the trip exists — it is the
    // subject of the moment, so nothing precedes it.
    expect(beats()).toEqual({
      birth: 'born',
      chrome: undefined,
      board: undefined,
      content: undefined,
    });

    await act(async () => void vi.advanceTimersByTime(TRIP_BIRTH.CHROME_MS));
    expect(beats().chrome).toBe('warm');
    expect(beats().board).toBeUndefined();

    await act(async () => void vi.advanceTimersByTime(TRIP_BIRTH.BOARD_MS - TRIP_BIRTH.CHROME_MS));
    expect(beats().board).toBe('on');
    expect(beats().content).toBeUndefined();

    await act(async () => void vi.advanceTimersByTime(TRIP_BIRTH.CONTENT_MS - TRIP_BIRTH.BOARD_MS));
    expect(beats().content).toBe('in');
  });

  // Skippability is part of the design, not a setting: a celebration you cannot
  // interrupt is a modal dialog wearing a costume.
  it('lands every beat at once when the sequence is tapped', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await create();
    const skip = document.querySelector<HTMLElement>('.birth-skip')!;
    expect(skip).toBeTruthy();

    await act(async () => void fireEvent.click(skip));
    expect(beats()).toEqual({ birth: 'born', chrome: 'warm', board: 'on', content: 'in' });
  });

  // …and the skip must not outlive the sequence, or it sits over the invite box
  // swallowing the tap that copies the link.
  it('unmounts the skip layer once the sequence has settled', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await create();
    await act(async () => void vi.advanceTimersByTime(TRIP_BIRTH.TOTAL_MS));
    expect(document.querySelector('.birth-skip')).toBeNull();
  });

  // A user who asked for less motion did not ask for a different OUTCOME (ADR-0140 §5).
  it('lands the end state immediately under prefers-reduced-motion', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q.includes('prefers-reduced-motion'),
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    await create();
    expect(beats()).toEqual({ birth: 'born', chrome: 'warm', board: 'on', content: 'in' });
    expect(document.querySelector('.birth-skip')).toBeNull();
  });

  // The board's first departure is honest content: the trip itself, not a decorative
  // string being spelled out by the flaps.
  it('flaps the trip’s own departure onto the board', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await create();
    await act(async () => void vi.advanceTimersByTime(TRIP_BIRTH.TOTAL_MS));
    const flaps = [...document.querySelectorAll('.birth-flap')].map((f) => f.textContent);
    expect(flaps).toEqual(['09.12', TRIP.name, t.shell.created.boardDays(12)]);
  });

  it('confirms a copied invite in place, not only in the toast', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn() } });
    await create();
    await act(async () => void vi.advanceTimersByTime(TRIP_BIRTH.TOTAL_MS));

    const box = document.querySelector<HTMLElement>('.invite-box')!;
    expect(box.hasAttribute('data-copied')).toBe(false);
    await act(async () => void fireEvent.click(box));
    expect(box.hasAttribute('data-copied')).toBe(true);
  });

  // One card for the whole sequence — not a draft card cross-fading into a born card.
  // Two would mean the thing you were looking at is not the thing you ended up with.
  it('renders exactly one card, and both slots that measure its flight', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await create();
    await act(async () => void vi.advanceTimersByTime(TRIP_BIRTH.TOTAL_MS));
    expect(document.querySelectorAll('.birth-card')).toHaveLength(1);
    expect(document.querySelector('[data-slot="form"]')).toBeTruthy();
    expect(document.querySelector('[data-slot="born"]')).toBeTruthy();
  });
});

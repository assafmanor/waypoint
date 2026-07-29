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
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
import { suggestTripName } from '../lib/trip-name';
import { MAX_TRIP_NAME_LENGTH, suggestFlagFromDestination } from '@waypoint/shared';
import { DEFAULT_TRIP_ICON } from '../constants';
import { t } from '../i18n/he';

// PIN THE CLOCK (frontend/CLAUDE.md): `suggestTripName` falls back to the CURRENT YEAR while
// the start date is empty, so an unpinned test asserts a different name every January.
const NOW = Date.parse('2026-07-20T09:00:00Z');

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

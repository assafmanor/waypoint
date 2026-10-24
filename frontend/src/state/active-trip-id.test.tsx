// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { ACTIVE_TRIP_STORAGE_KEY } from '../constants';
import { ActiveTripIdProvider, useActiveTripId } from './active-trip-id';

/** Reads the context out so a test can assert on it. */
function Probe() {
  const { tripId, pickedThisSession } = useActiveTripId();
  return <span data-testid="probe">{`${tripId ?? 'none'}|${pickedThisSession}`}</span>;
}

function readContext() {
  const { getByTestId } = render(
    <ActiveTripIdProvider>
      <Probe />
    </ActiveTripIdProvider>,
  );
  return getByTestId('probe').textContent;
}

/** The provider sits above the router, so it reads `window.location` rather than a hook. */
function at(search: string) {
  window.history.replaceState(null, '', `/${search}`);
}

describe('ActiveTripIdProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    at('');
  });
  afterEach(() => {
    // Not automatic in this suite's config, and without it every render accumulates in the
    // document — which shows up as "found multiple elements" rather than as a wrong value.
    cleanup();
    localStorage.clear();
    at('');
  });

  it('restores the stored trip when the URL names none', () => {
    localStorage.setItem(ACTIVE_TRIP_STORAGE_KEY, 'trip-stored');
    // Not a pick: a restored value defers to ADR-0033's live-trip landing rule.
    expect(readContext()).toBe('trip-stored|false');
  });

  it('lets `?trip=` OVERRIDE the stored trip', () => {
    // The bug this closes: a notification about Japan, tapped while Iceland was active,
    // opened Iceland — because this value had only ever come from localStorage.
    localStorage.setItem(ACTIVE_TRIP_STORAGE_KEY, 'trip-iceland');
    at('?trip=trip-japan');
    expect(readContext()).toBe('trip-japan|true');
  });

  it('counts a URL trip as a PICK, so the landing rule cannot redirect it', () => {
    // A notification about a trip that has not started yet must still open that trip.
    at('?trip=trip-future');
    expect(readContext()).toBe('trip-future|true');
  });

  it('persists the URL trip, so the next cold launch reopens it', () => {
    at('?trip=trip-japan');
    readContext();
    expect(localStorage.getItem(ACTIVE_TRIP_STORAGE_KEY)).toBe('trip-japan');
  });

  it('leaves the stored trip alone when the URL names none', () => {
    localStorage.setItem(ACTIVE_TRIP_STORAGE_KEY, 'trip-stored');
    readContext();
    expect(localStorage.getItem(ACTIVE_TRIP_STORAGE_KEY)).toBe('trip-stored');
  });

  it('ignores an empty `?trip=` rather than blanking the active trip', () => {
    localStorage.setItem(ACTIVE_TRIP_STORAGE_KEY, 'trip-stored');
    at('?trip=');
    expect(readContext()).toBe('trip-stored|false');
  });
});

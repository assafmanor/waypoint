// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { DestinationResult } from '@waypoint/shared';
import type { UseDestinationSearch } from '../lib/useDestinationSearch';

Element.prototype.scrollIntoView = vi.fn();

// A controllable stub of the search core so the component test doesn't deal with
// the debounce timer or the network — tests mutate `hook` before rendering.
let hook: UseDestinationSearch;
vi.mock('../lib/useDestinationSearch', () => ({ useDestinationSearch: () => hook }));

import { ToastProvider } from './Toast';
import { NavProvider } from '../state/nav-state';
import { DestinationPicker } from './DestinationPicker';
import { t } from '../i18n/he';

const RESULT: DestinationResult = {
  googlePlaceId: 'g-jp',
  name: 'Japan',
  countryCode: 'JP',
  lat: 36,
  lng: 138,
  timezone: 'Asia/Tokyo',
};

function wrap(node: ReactNode) {
  return (
    <MemoryRouter>
      <ToastProvider>
        <NavProvider>{node}</NavProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('DestinationPicker (ADR-0113 slice 3)', () => {
  beforeEach(() => {
    hook = {
      query: '',
      setQuery: vi.fn(),
      predictions: [],
      loading: false,
      rateLimited: false,
      failed: false,
      resolve: vi.fn(async () => RESULT),
      reset: vi.fn(),
    };
  });
  afterEach(() => cleanup());

  it('shows the destination as the trigger label, placeholder when empty', () => {
    const { rerender } = render(wrap(<DestinationPicker value="" onPick={() => {}} />));
    expect(screen.getByText(t.shell.newTrip.destPlaceholder)).toBeTruthy();
    rerender(wrap(<DestinationPicker value="Japan" onPick={() => {}} />));
    expect(screen.getByText('Japan')).toBeTruthy();
  });

  it('resolves a picked prediction and reports its structured fields + derived zone', async () => {
    hook.predictions = [{ googlePlaceId: 'g-jp', primaryText: 'Japan', secondaryText: 'Country' }];
    const onPick = vi.fn();
    render(wrap(<DestinationPicker value="" onPick={onPick} />));
    fireEvent.click(screen.getByRole('button', { name: t.shell.newTrip.destLabel }));
    fireEvent.click(screen.getByRole('button', { name: /Japan/ }));
    await vi.waitFor(() => expect(onPick).toHaveBeenCalled());
    expect(hook.resolve).toHaveBeenCalled();
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Japan', countryCode: 'JP', timezone: 'Asia/Tokyo' }),
    );
  });

  it('the "use as typed" fallback reports just the name (no structured fields)', () => {
    hook.query = 'Narnia';
    const onPick = vi.fn();
    render(wrap(<DestinationPicker value="" onPick={onPick} />));
    fireEvent.click(screen.getByRole('button', { name: t.shell.newTrip.destLabel }));
    fireEvent.click(screen.getByRole('button', { name: t.shell.newTrip.destUseTyped('Narnia') }));
    expect(onPick).toHaveBeenCalledWith({ name: 'Narnia' });
  });
});

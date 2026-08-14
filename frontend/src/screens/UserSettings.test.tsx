// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Me } from '@waypoint/shared';

const patchMe = vi.fn();
const logout = vi.fn();
const navigate = vi.fn();
const goBack = vi.fn();
const listMapArchives = vi.fn();
const clearAllMapArchives = vi.fn();
const removeMapArchive = vi.fn();
const removeTripMapArchives = vi.fn();
const readCachedTripList = vi.fn();
let me: Me | null;

vi.mock('../state/auth-state', () => ({ useAuth: () => ({ me, logout, patchMe }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('../state/nav-state', () => ({
  useAppBack: () => goBack,
  // `CurrencyPicker` renders through `Modal`, which registers a back layer.
  useOverlay: () => {},
  SETTINGS_PICTURE_PATH: '/settings/picture',
}));
vi.mock('../lib/map-archive-cache', () => ({
  listMapArchives,
  clearAllMapArchives,
  removeMapArchive,
  removeTripMapArchives,
}));
vi.mock('../lib/cache', () => ({ readCachedTripList }));

const { default: UserSettings } = await import('./UserSettings');
const { t } = await import('../i18n/he');

const makeMe = (over: Partial<Me['user']> = {}): Me => ({
  user: {
    id: 'u-me',
    email: 'assaf@example.com',
    displayName: 'אסף',
    avatarHue: 'denim',
    avatarChoice: 'initials',
    googleAvatarUrl: null,
    uploadedAvatarUrl: null,
    preferredCurrency: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    ...over,
  },
  memberships: [],
});

beforeEach(() => {
  listMapArchives.mockResolvedValue([]);
  clearAllMapArchives.mockResolvedValue(undefined);
  removeMapArchive.mockResolvedValue(undefined);
  removeTripMapArchives.mockResolvedValue(undefined);
  readCachedTripList.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('UserSettings offline map storage', () => {
  it('shows the retained byte total and lets the device owner clear it', async () => {
    me = makeMe();
    listMapArchives.mockResolvedValue([
      { key: '/map/world.pmtiles', kind: 'world', sizeBytes: 40 * 1024 * 1024 },
      {
        key: '/trips/t-rome/map/extract.pmtiles',
        kind: 'extract',
        tripId: 't-rome',
        sizeBytes: 4 * 1024 * 1024,
      },
    ]);
    readCachedTripList.mockResolvedValue([{ id: 't-rome', name: 'רומא' }]);
    render(<UserSettings />);

    expect(await screen.findByText('44.0MB')).toBeTruthy();
    expect(screen.getByText(t.shell.account.mapStorageWorld)).toBeTruthy();
    expect(screen.getByText('רומא')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', {
        name: t.shell.account.mapStorageDeleteTrip('רומא'),
      }),
    );
    await waitFor(() => expect(removeTripMapArchives).toHaveBeenCalledWith('t-rome'));
    expect(screen.queryByText('רומא')).toBeNull();
    expect(screen.getAllByText('40.0MB')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: t.shell.account.mapStorageClear }));
    await waitFor(() => expect(clearAllMapArchives).toHaveBeenCalledTimes(1));
    expect(screen.getByText('0B')).toBeTruthy();
  });
});

describe('UserSettings', () => {
  it('states the identity and account facts, and nothing invented', () => {
    me = makeMe();
    render(<UserSettings />);
    expect(screen.getByDisplayValue('אסף')).toBeTruthy();
    expect(screen.getByText('assaf@example.com')).toBeTruthy();
    expect(screen.getByText('מחובר עם Google')).toBeTruthy();
    expect(screen.getByText('התנתקות')).toBeTruthy();
  });

  it('saves a renamed display name on blur', async () => {
    me = makeMe();
    patchMe.mockResolvedValue(undefined);
    render(<UserSettings />);
    const input = screen.getByDisplayValue('אסף');
    fireEvent.change(input, { target: { value: 'אסף מנור' } });
    fireEvent.blur(input);
    await waitFor(() => expect(patchMe).toHaveBeenCalledWith({ displayName: 'אסף מנור' }));
  });

  it('does not write when the name is unchanged', () => {
    me = makeMe();
    render(<UserSettings />);
    fireEvent.blur(screen.getByDisplayValue('אסף'));
    expect(patchMe).not.toHaveBeenCalled();
  });

  it('treats an emptied field as a revert, not a rename to nothing', () => {
    me = makeMe();
    render(<UserSettings />);
    const input = screen.getByDisplayValue('אסף');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.blur(input);
    expect(patchMe).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('אסף')).toBeTruthy();
  });

  it('surfaces a failed save and puts the old name back', async () => {
    me = makeMe();
    patchMe.mockRejectedValue(new Error('offline'));
    render(<UserSettings />);
    const input = screen.getByDisplayValue('אסף');
    fireEvent.change(input, { target: { value: 'דנה' } });
    fireEvent.blur(input);
    await waitFor(() => expect(screen.getByText(/לא נשמר/)).toBeTruthy());
    expect(screen.getByDisplayValue('אסף')).toBeTruthy();
  });

  it('opens the picture page from the avatar itself, not only the button', () => {
    me = makeMe();
    render(<UserSettings />);
    // Two ways in, both the same destination — the circle is the affordance
    // (ADR-0133 §6) and the labelled button is the discoverable version of it.
    const ways = screen.getAllByRole('button', { name: 'שינוי תמונה' });
    expect(ways.length).toBe(2);
    fireEvent.click(ways[0]);
    expect(navigate).toHaveBeenCalledWith('/settings/picture');
  });

  it('renders nothing before an identity is known, rather than an empty shell', () => {
    me = null;
    const { container } = render(<UserSettings />);
    expect(container.firstChild).toBeNull();
  });
});

// The home currency (ADR-0180 §2). It amends ADR-0133 §7 by that section's own
// condition — the rejection there was of a switch with no reader, and this slice
// gives it two. The row's presence is the decision; its HINT is the trap, since
// its neighbour in the same section promises DEVICE persistence and this is
// account state.
describe('UserSettings — the home currency', () => {
  it('shows the stored preference with its full label', () => {
    me = makeMe({ preferredCurrency: 'JPY' });
    render(<UserSettings />);
    const trigger = screen.getByText(t.shell.account.currencyLabel).parentElement;
    expect(trigger?.textContent).toContain('JPY');
    expect(trigger?.textContent).toContain('¥');
  });

  // The server never guesses on the user's behalf — it knows only their email.
  it('falls back to the device region when the account has never chosen one', () => {
    me = makeMe({ preferredCurrency: null });
    render(<UserSettings />);
    // The harness runs in a he-IL-ish locale, so this resolves; what is pinned
    // is that SOMETHING sensible shows rather than the unset dash.
    const row = screen.getByText(t.shell.account.currencyLabel).parentElement;
    expect(row?.textContent).not.toBe(t.shell.account.currencyLabel);
  });

  it('carries its OWN hint, which says account where the theme says device', () => {
    me = makeMe();
    render(<UserSettings />);
    const currencyHint = screen.getByText(t.shell.account.currencyHint);
    const themeHint = screen.getByText(t.shell.account.themeHint);
    expect(currencyHint).toBeTruthy();
    expect(themeHint).toBeTruthy();
    // Two hints, two cards — not two rows sharing one.
    expect(currencyHint).not.toBe(themeHint);
  });

  it('patches the account when a currency is picked', async () => {
    me = makeMe({ preferredCurrency: 'JPY' });
    render(<UserSettings />);
    fireEvent.click(
      screen.getByText(t.shell.account.currencyLabel).parentElement!.querySelector('button')!,
    );
    fireEvent.change(screen.getByPlaceholderText(t.currencyPicker.searchPlaceholder), {
      target: { value: 'ils' },
    });
    fireEvent.click(screen.getByRole('button', { name: /ILS/ }));
    await waitFor(() => expect(patchMe).toHaveBeenCalledWith({ preferredCurrency: 'ILS' }));
  });

  it('writes nothing when the picked currency is the one already stored', async () => {
    me = makeMe({ preferredCurrency: 'ILS' });
    render(<UserSettings />);
    fireEvent.click(
      screen.getByText(t.shell.account.currencyLabel).parentElement!.querySelector('button')!,
    );
    // The current value appears twice by design — once in the suggested group and
    // once in the full list — so take the first rather than asserting uniqueness.
    fireEvent.click(screen.getAllByRole('button', { name: /ILS/ })[0]);
    await waitFor(() => expect(patchMe).not.toHaveBeenCalled());
  });
});

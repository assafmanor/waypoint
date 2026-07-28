// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Me } from '@waypoint/shared';

const patchMe = vi.fn();
const logout = vi.fn();
const navigate = vi.fn();
const goBack = vi.fn();
let me: Me | null;

vi.mock('../state/auth-state', () => ({ useAuth: () => ({ me, logout, patchMe }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('../state/nav-state', () => ({
  useAppBack: () => goBack,
  SETTINGS_PICTURE_PATH: '/settings/picture',
}));

const { default: UserSettings } = await import('./UserSettings');

const makeMe = (over: Partial<Me['user']> = {}): Me => ({
  user: {
    id: 'u-me',
    email: 'assaf@example.com',
    displayName: 'אסף',
    avatarHue: 'denim',
    avatarChoice: 'initials',
    googleAvatarUrl: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    ...over,
  },
  memberships: [],
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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

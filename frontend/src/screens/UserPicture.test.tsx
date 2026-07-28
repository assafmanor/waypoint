// @vitest-environment jsdom
//
// The property under test is ADR-0133 §6's whole point: the ramp is REVEALED only
// when the colour is what actually gets drawn. A photo in use ⇒ no ramp.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Me } from '@waypoint/shared';

const patchMe = vi.fn();
const goBack = vi.fn();
let me: Me | null;

vi.mock('../state/auth-state', () => ({ useAuth: () => ({ me, patchMe }) }));
vi.mock('../state/nav-state', () => ({ useAppBack: () => goBack }));

const { default: UserPicture } = await import('./UserPicture');

const makeMe = (over: Partial<Me['user']> = {}): Me => ({
  user: {
    id: 'u-me',
    email: 'a@example.com',
    displayName: 'אסף',
    avatarHue: 'denim',
    avatarChoice: 'initials',
    googleAvatarUrl: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    ...over,
  },
  memberships: [],
});

const swatches = () => document.querySelectorAll('.pk-sw');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('UserPicture — a photo is in use', () => {
  const withPhoto = () => makeMe({ avatarChoice: 'google', googleAvatarUrl: 'https://x/p.jpg' });

  it('shows no colour ramp, because the hue would render nothing', () => {
    me = withPhoto();
    render(<UserPicture />);
    expect(swatches().length).toBe(0);
  });

  it('offers removal, and removal is a choice rather than a deletion', async () => {
    me = withPhoto();
    patchMe.mockResolvedValue(undefined);
    render(<UserPicture />);
    fireEvent.click(screen.getByText('הסרת התמונה'));
    // `initials` — it never clears `googleAvatarUrl`, which is what keeps the way
    // back real.
    await waitFor(() => expect(patchMe).toHaveBeenCalledWith({ avatarChoice: 'initials' }));
  });

  it('says removal does not delete anything at Google', () => {
    me = withPhoto();
    render(<UserPicture />);
    expect(screen.getByText(/לא מחיקה אצל גוגל/)).toBeTruthy();
  });
});

describe('UserPicture — no photo in use', () => {
  it('reveals the whole ramp and marks the current hue', () => {
    me = makeMe({ avatarHue: 'moss' });
    render(<UserPicture />);
    expect(swatches().length).toBe(5);
    const pressed = document.querySelectorAll('.pk-sw[aria-pressed="true"]');
    expect(pressed.length).toBe(1);
    expect(pressed[0].getAttribute('aria-label')).toBe('טחב');
  });

  it('picks a hue without touching the source', async () => {
    me = makeMe();
    patchMe.mockResolvedValue(undefined);
    render(<UserPicture />);
    fireEvent.click(screen.getByRole('button', { name: 'ורד' }));
    await waitFor(() => expect(patchMe).toHaveBeenCalledWith({ avatarHue: 'rose' }));
  });

  it('offers the way back only when a Google photo actually exists', () => {
    me = makeMe({ googleAvatarUrl: 'https://x/p.jpg' });
    render(<UserPicture />);
    expect(screen.getByText('שימוש בתמונה מגוגל')).toBeTruthy();
  });

  it('offers no way back when there is no photo to come back to, and says why', () => {
    me = makeMe({ googleAvatarUrl: null });
    render(<UserPicture />);
    expect(screen.queryByText('שימוש בתמונה מגוגל')).toBeNull();
    expect(screen.getByText(/אין תמונה בחשבון גוגל/)).toBeTruthy();
  });

  it('treats `google` with no URL as no photo — a revoked photo still shows the ramp', () => {
    // The fallback rule (§4): the chosen source having nothing to show must never
    // strand the page in a state with neither a picture nor a way to change it.
    me = makeMe({ avatarChoice: 'google', googleAvatarUrl: null });
    render(<UserPicture />);
    expect(swatches().length).toBe(5);
  });

  it('surfaces a failed save', async () => {
    me = makeMe();
    patchMe.mockRejectedValue(new Error('offline'));
    render(<UserPicture />);
    fireEvent.click(screen.getByRole('button', { name: 'שזיף' }));
    await waitFor(() => expect(screen.getByText(/לא נשמר/)).toBeTruthy());
  });

  it('ships no upload control at all — absent, not disabled', () => {
    // ADR-0133 §6: a control that picks a file nothing can persist is worse than no
    // control, and a greyed one invites a tap and explains nothing. Phase 4 adds it.
    me = makeMe();
    render(<UserPicture />);
    expect(screen.queryByText(/העלאת תמונה/)).toBeNull();
    expect(document.querySelectorAll('.file-picker-tiles').length).toBe(0);
  });
});

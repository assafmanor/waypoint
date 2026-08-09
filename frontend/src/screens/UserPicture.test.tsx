// @vitest-environment jsdom
//
// The property under test is ADR-0133 §6's whole point: the ramp is REVEALED only
// when the colour is what actually gets drawn. A photo in use ⇒ no ramp.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Me } from '@waypoint/shared';

const patchMe = vi.fn();
const setAvatar = vi.fn();
const removeAvatar = vi.fn();
const goBack = vi.fn();
const toAvatarBlob = vi.fn();
let me: Me | null;

vi.mock('../state/auth-state', () => ({
  useAuth: () => ({ me, patchMe, setAvatar, removeAvatar }),
}));
vi.mock('../state/nav-state', () => ({ useAppBack: () => goBack }));
// The canvas half cannot run in jsdom (no `createImageBitmap`, no 2D context), so the
// screen is tested against the normalizer's CONTRACT and `squareCrop` carries the
// decision's own tests. Stubbing it here is what keeps that split honest.
vi.mock('../lib/avatar-image', () => ({ toAvatarBlob }));

const { default: UserPicture } = await import('./UserPicture');

const makeMe = (over: Partial<Me['user']> = {}): Me => ({
  user: {
    id: 'u-me',
    email: 'a@example.com',
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

const swatches = () => document.querySelectorAll('.pk-sw');
const fileInput = () => document.querySelector<HTMLInputElement>('input[type=file]')!;
const pick = (name = 'face.jpg', type = 'image/jpeg') =>
  fireEvent.change(fileInput(), { target: { files: [new File(['x'], name, { type })] } });

// Coarse pointer by default, so the camera path is present unless a test says otherwise.
function setPointer(coarse: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: coarse && query === '(pointer: coarse)',
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  setPointer(true);
  toAvatarBlob.mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }));
  setAvatar.mockResolvedValue(undefined);
  removeAvatar.mockResolvedValue(undefined);
});

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

  it('offers upload beside the ramp — both, because neither excludes the other', () => {
    me = makeMe();
    render(<UserPicture />);
    expect(screen.getByText('העלאת תמונה')).toBeTruthy();
    expect(swatches().length).toBe(5);
  });
});

describe('UserPicture — upload', () => {
  it('normalizes the pick and uploads the result, never the original file', async () => {
    // The byte ceiling is only reachable if the raw camera file is sent, so "the blob
    // that goes up came from `toAvatarBlob`" is the property worth pinning.
    me = makeMe();
    render(<UserPicture />);
    pick();
    await waitFor(() => expect(setAvatar).toHaveBeenCalledTimes(1));
    expect(toAvatarBlob).toHaveBeenCalledTimes(1);
    expect(setAvatar.mock.calls[0][0]).toBeInstanceOf(Blob);
  });

  it('never draws the document picker’s dashed tiles — the face is the target', () => {
    // ADR-0133 §6, the correction the owner made in the design session: FilePicker is
    // the right mechanism and the wrong presentation here.
    me = makeMe();
    render(<UserPicture />);
    expect(document.querySelectorAll('.file-picker-tiles').length).toBe(0);
    expect(document.querySelectorAll('.pk-badge').length).toBe(1);
  });

  it('opens the FRONT camera — this is a self-portrait, not a document', () => {
    me = makeMe();
    render(<UserPicture />);
    const camera = [...document.querySelectorAll('input[type=file]')][1];
    expect(camera.getAttribute('capture')).toBe('user');
  });

  it('drops the camera control entirely on a desktop', () => {
    setPointer(false);
    me = makeMe();
    render(<UserPicture />);
    expect(screen.queryByText('צילום תמונה')).toBeNull();
    expect(document.querySelectorAll('input[type=file]').length).toBe(1);
  });

  it('says "replace" rather than "upload" once a photo is in use', () => {
    me = makeMe({ avatarChoice: 'upload', uploadedAvatarUrl: '/users/u-me/avatar/k-1' });
    render(<UserPicture />);
    expect(screen.getByText('החלפת תמונה')).toBeTruthy();
    expect(screen.queryByText('העלאת תמונה')).toBeNull();
  });

  it('an uploaded photo hides the ramp, exactly like a Google one', () => {
    me = makeMe({ avatarChoice: 'upload', uploadedAvatarUrl: '/users/u-me/avatar/k-1' });
    render(<UserPicture />);
    expect(swatches().length).toBe(0);
  });

  it('DELETES an upload rather than merely switching away from it', async () => {
    // The removal semantics differ by source (§6): our bytes are ours to delete, where
    // Google's photo is only ever "don't use it".
    me = makeMe({ avatarChoice: 'upload', uploadedAvatarUrl: '/users/u-me/avatar/k-1' });
    render(<UserPicture />);
    fireEvent.click(screen.getByText('הסרת התמונה'));
    await waitFor(() => expect(removeAvatar).toHaveBeenCalledTimes(1));
    expect(patchMe).not.toHaveBeenCalled();
  });

  it('does not claim the initials are shown while an uploaded photo is on screen', () => {
    // Found by rendering, not by a test: with an upload in use and no Google photo, the
    // hint printed "and so the initials are shown" directly under a visible face.
    me = makeMe({ avatarChoice: 'upload', uploadedAvatarUrl: '/users/u-me/avatar/k-1' });
    render(<UserPicture />);
    expect(screen.queryByText(/מוצגות האותיות הראשונות/)).toBeNull();
    // The crop/resize note stays — it describes what the upload control does.
    expect(screen.getByText(/נחתכת לריבוע/)).toBeTruthy();
  });

  it('still explains the initials when they ARE what is drawn', () => {
    me = makeMe({ googleAvatarUrl: null });
    render(<UserPicture />);
    expect(screen.getByText(/מוצגות האותיות הראשונות/)).toBeTruthy();
  });

  it('treats `upload` with no stored blob as no photo, so the page cannot strand', () => {
    me = makeMe({ avatarChoice: 'upload', uploadedAvatarUrl: null });
    render(<UserPicture />);
    expect(swatches().length).toBe(5);
  });

  it('reports a file that is not a picture, without uploading it', async () => {
    me = makeMe();
    toAvatarBlob.mockRejectedValue(new Error('avatar: encode failed'));
    render(<UserPicture />);
    pick('notes.txt', 'text/plain');
    await waitFor(() => expect(screen.getByText(/אינו תמונה/)).toBeTruthy());
    expect(setAvatar).not.toHaveBeenCalled();
  });

  it('reports a failed upload distinctly from a bad file', async () => {
    me = makeMe();
    setAvatar.mockRejectedValue(new Error('offline'));
    render(<UserPicture />);
    pick();
    await waitFor(() => expect(screen.getByText(/העלאת התמונה נכשלה/)).toBeTruthy());
  });

  it('disables the triggers while a pick is in flight', async () => {
    me = makeMe();
    let release: (() => void) | undefined;
    setAvatar.mockImplementation(() => new Promise<void>((r) => (release = () => r())));
    render(<UserPicture />);
    pick();
    await waitFor(() =>
      expect(document.querySelector<HTMLButtonElement>('.pk-badge')!.disabled).toBe(true),
    );
    release!();
    await waitFor(() =>
      expect(document.querySelector<HTMLButtonElement>('.pk-badge')!.disabled).toBe(false),
    );
  });
});

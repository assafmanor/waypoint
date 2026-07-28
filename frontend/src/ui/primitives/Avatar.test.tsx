// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Avatar, avatarPictureUrl, initialOf, type AvatarPerson } from './Avatar';

afterEach(cleanup);

const person = (over: Partial<AvatarPerson> = {}): AvatarPerson => ({
  displayName: 'אסף',
  avatarHue: 'denim',
  avatarChoice: 'initials',
  googleAvatarUrl: null,
  ...over,
});

describe('avatarPictureUrl', () => {
  it('renders the Google photo when that is the chosen source', () => {
    expect(
      avatarPictureUrl(person({ avatarChoice: 'google', googleAvatarUrl: 'https://x/p.jpg' })),
    ).toBe('https://x/p.jpg');
  });

  it('falls back to initials when the chosen source has nothing to show', () => {
    // A revoked Google photo. The rule is that no state produces a broken image.
    expect(avatarPictureUrl(person({ avatarChoice: 'google', googleAvatarUrl: null }))).toBeNull();
  });

  it('ignores a Google photo the user chose not to use', () => {
    // `initials` is a real choice, not an absence — the URL is kept so "use my
    // Google photo" has somewhere to come back from, but it must not render.
    expect(
      avatarPictureUrl(person({ avatarChoice: 'initials', googleAvatarUrl: 'https://x/p.jpg' })),
    ).toBeNull();
  });

  it('renders an uploaded avatar from the server-built path', () => {
    expect(
      avatarPictureUrl(
        person({ avatarChoice: 'upload', uploadedAvatarUrl: '/users/u-1/avatar/k-9' }),
      ),
      // API_BASE_URL is empty under test (same-origin), so the path passes through —
      // the point is that it is PREFIXED rather than parsed as an absolute URL.
    ).toBe('/users/u-1/avatar/k-9');
  });

  it('degrades `upload` with no stored blob to initials', () => {
    // The row says "upload" but the blob is gone, or the DTO predates one. Still no
    // broken image (ADR-0133 §4).
    expect(avatarPictureUrl(person({ avatarChoice: 'upload' }))).toBeNull();
    expect(
      avatarPictureUrl(person({ avatarChoice: 'upload', uploadedAvatarUrl: null })),
    ).toBeNull();
  });

  it('ignores an upload the user has switched away from', () => {
    expect(
      avatarPictureUrl(
        person({ avatarChoice: 'google', googleAvatarUrl: null, uploadedAvatarUrl: '/u/a/k' }),
      ),
    ).toBeNull();
  });
});

describe('initialOf', () => {
  it('takes the first letter', () => {
    expect(initialOf('אסף')).toBe('א');
  });

  it('trims, so a padded name does not render a blank circle', () => {
    expect(initialOf('  דנה')).toBe('ד');
  });
});

describe('Avatar', () => {
  it('paints the hue as a token, never a hex, so the dark remap reaches it', () => {
    const { container } = render(<Avatar person={person({ avatarHue: 'moss' })} />);
    const el = container.querySelector('.wp-av') as HTMLElement;
    expect(el.style.background).toContain('--id-moss');
  });

  it('is decorative by default — the name is always beside it in text', () => {
    const { container } = render(<Avatar person={person()} />);
    expect(container.querySelector('.wp-av')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('renders a real button with an accessible name when interactive', () => {
    render(<Avatar person={person()} onClick={() => {}} label="החשבון שלי" />);
    expect(screen.getByRole('button', { name: 'החשבון שלי' })).toBeTruthy();
  });

  it('renders the photo with no referrer, so a render does not leak the page to Google', () => {
    const { container } = render(
      <Avatar person={person({ avatarChoice: 'google', googleAvatarUrl: 'https://x/p.jpg' })} />,
    );
    const img = container.querySelector('img') as HTMLImageElement;
    expect(img.getAttribute('referrerpolicy')).toBe('no-referrer');
  });

  it('applies no geometry class at size="inherit", so chrome keeps owning its own', () => {
    const { container } = render(<Avatar person={person()} size="inherit" className="av" />);
    const el = container.querySelector('.wp-av') as HTMLElement;
    expect(el.className).toContain('av');
    expect(el.className).not.toMatch(/wp-av-(sm|md|lg)/);
  });
});

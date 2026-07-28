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

  it('degrades `upload` to initials until Phase 4 gives it a source', () => {
    expect(avatarPictureUrl(person({ avatarChoice: 'upload' }))).toBeNull();
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

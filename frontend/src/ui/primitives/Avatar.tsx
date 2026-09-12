// The one renderer for a person (ADR-0133 §3). Before this, eight call sites drew
// the same circle by hand — App.tsx ×3, TripSettings ×3, AllTrips, ZeroState — each
// computing its own background and slicing its own initial, which is how the amber
// column default went unnoticed for so long and how two fixture colours drifted onto
// the Map's pin hues.
//
// It owns ALL of: which source to render, the initials fallback, the ink-on-hue
// pairing, and the ring the account avatar wears. No call site does any of that
// again — a call site picks a size and passes a person.
import { useState } from 'react';
import type { AvatarChoice, IdentityHue, User } from '@waypoint/shared';
import { AVATAR_INITIAL_LENGTH } from '../../constants';
import { apiAssetUrl } from '../../lib/api-asset';
import './avatar.css';

/** Named sizes rather than a number, so the set stays small and every surface reads
 *  from the same ladder. `inherit` applies no geometry at all: the in-trip chrome's
 *  circle is 31px with an indigo border and a negative overlap margin, and those are
 *  **chrome** rules (`.av` in App.css), not identity ones — so the header keeps
 *  owning them and takes only the source resolution from here. */
export type AvatarSize = 'sm' | 'md' | 'lg' | 'inherit';

/** The subset of a `User` an avatar actually needs. Taking a shape rather than the
 *  whole entity lets the roster's display info and a `Me` both feed it, and keeps
 *  the primitive out of the trip-state graph (it stays presentational). */
export type AvatarPerson = Pick<User, 'displayName' | 'avatarHue'> & {
  /** Optional so a payload that carries no picture can still render a person —
   *  a removed member (`RemovedMember`, ADR-0067) is name + hue only, and initials
   *  is the honest render for them rather than a borrowed photo. */
  avatarChoice?: AvatarChoice;
  googleAvatarUrl?: string | null;
  /** Server-built path to OUR copy of the Google photo, or null when there is none
   *  (ADR-0133 §13). Relative to the API origin, so it is prefixed here. */
  googleAvatarCopyUrl?: string | null;
  /** Server-built path to an uploaded avatar's bytes, or null when there is no
   *  upload (ADR-0133 §12). Relative to the API origin, so it is prefixed here. */
  uploadedAvatarUrl?: string | null;
};

/** Which source to actually render. Honours the stored choice, then falls back to
 *  initials whenever the chosen source has nothing to show — a revoked Google
 *  photo and an upload that is gone both land here, and neither may produce a
 *  broken image (ADR-0133 §4; a load that FAILS is the component's half of the
 *  same rule).
 *
 *  **Our copy of the Google photo wins over the hotlink** (§13): same-origin and
 *  immutable, so it is in the browser's cache on a plane where `lh3.googleusercontent`
 *  is unreachable. The hotlink stays as the fallback for the window before a person's
 *  next sign-in has made a copy — online it renders exactly as it always did.
 *
 *  Exported because it is the interesting decision and deserves its own test. */
export function avatarPictureUrl(person: AvatarPerson): string | null {
  if (person.avatarChoice === 'google') {
    if (person.googleAvatarCopyUrl) return apiAssetUrl(person.googleAvatarCopyUrl);
    return person.googleAvatarUrl ?? null;
  }
  if (person.avatarChoice === 'upload') {
    return person.uploadedAvatarUrl ? apiAssetUrl(person.uploadedAvatarUrl) : null;
  }
  return null;
}

export function initialOf(displayName: string): string {
  return displayName.trim().slice(0, AVATAR_INITIAL_LENGTH);
}

export function Avatar({
  person,
  size = 'md',
  ring = false,
  className = '',
  onClick,
  label,
}: {
  person: AvatarPerson;
  size?: AvatarSize;
  /** The "this is you" outer ring (app-shell.md §6). */
  ring?: boolean;
  /** Extra classes for a surface supplying its own geometry (see `AvatarSize`). */
  className?: string;
  /** Present ⇒ renders a real `<button>`. The account avatar needs one today and
   *  Phase 3's member cluster needs one next, so the primitive owns the element
   *  choice rather than leaving callers to nest a circle inside a circle. */
  onClick?: () => void;
  /** Accessible name, required when interactive — the circle itself is decorative. */
  label?: string;
}) {
  const url = avatarPictureUrl(person);
  // **The load is the other half of §4's rule, and it was the missing half** (owner report,
  // 2026-09-12, with a screenshot of a plane). A resolved URL is not a picture: a Google
  // photo revoked between snapshots, an upload the server has retired, and — the reported
  // case — ANY photo on a phone with no network all resolve fine and then fail to decode,
  // and the browser's answer to that is the broken-image glyph. "Never render a broken
  // image" has to be enforced where the failure actually happens, so a failed load falls
  // back to the same initials a missing URL does.
  //
  // Keyed by URL rather than a bare flag: a person whose photo changes (or a recycled row
  // in a list) must get a fresh attempt, not inherit the last one's failure.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const src = url && url !== failedUrl ? url : null;
  const hue: IdentityHue = person.avatarHue;
  const cls = ['wp-av', size !== 'inherit' && `wp-av-${size}`, ring && 'wp-av-ring', className]
    .filter(Boolean)
    .join(' ');
  // The hue is a token NAME, never a hex, so the dark remap reaches it.
  const style = { background: `var(--id-${hue})` };
  const inner = src ? (
    // `no-referrer` so rendering a Google-hosted photo does not leak the page it is
    // rendered on back to Google on every load.
    <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailedUrl(src)} />
  ) : (
    initialOf(person.displayName)
  );

  if (onClick) {
    return (
      <button type="button" className={cls} style={style} onClick={onClick} aria-label={label}>
        {inner}
      </button>
    );
  }
  return (
    // Decorative: every call site pairs this with the person's name in text, so
    // announcing it again would just double-read the row.
    <span className={cls} style={style} aria-hidden="true">
      {inner}
    </span>
  );
}

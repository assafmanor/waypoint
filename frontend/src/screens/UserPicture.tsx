// The picture page — ADR-0133 §6. TWO STATES, not three peer sources:
//
//   a photo is in use  → the photo, the camera badge, and "remove the photo".
//                        NO colour ramp, because the hue would render nothing.
//   no photo in use    → the initials on the current hue, THE RAMP, and the way
//                        back to the Google photo when there is one.
//
// So the ramp is *revealed* exactly when the colour is what gets drawn, and
// "I don't want a photo" is its own act before the hue becomes a choice. The first
// draft listed Google/upload/ramp side by side and made one tap do two things.
//
// Upload + camera are designed (the badge, over `FilePicker`'s inputs) but ship in
// Phase 4, because there is nowhere to put the bytes yet: a control that picks a
// file nothing can persist is worse than no control, and it is ABSENT rather than
// greyed — a disabled button invites a tap and explains nothing (the near-me rule,
// ADR-0109 §6).
import { useState } from 'react';
import { IDENTITY_HUES, type IdentityHue } from '@waypoint/shared';
import { t } from '../i18n/he';
import { useAuth } from '../state/auth-state';
import { useAppBack } from '../state/nav-state';
import { Avatar } from '../ui/primitives/Avatar';
import { NavArrow } from '../ui/NavArrow';
import { StatusBanner } from '../ui/feedback/StatusBanner';

export default function UserPicture() {
  const { me, patchMe } = useAuth();
  const goBack = useAppBack();
  const [failed, setFailed] = useState(false);

  if (!me) return null;
  const user = me.user;
  const usingPhoto = user.avatarChoice === 'google' && !!user.googleAvatarUrl;

  const apply = async (patch: Parameters<typeof patchMe>[0]) => {
    setFailed(false);
    try {
      await patchMe(patch);
    } catch {
      setFailed(true);
    }
  };

  return (
    <div className="app">
      <header className="new-head">
        <div className="new-head-row">
          <button className="back" onClick={goBack} aria-label={t.shell.account.back}>
            <NavArrow variant="back" />
          </button>
          <div className="new-title">{t.shell.account.picture.title}</div>
        </div>
      </header>

      <main className="set-body">
        {failed && <StatusBanner tone="warn">{t.shell.account.saveFailed}</StatusBanner>}

        <div className="set-card">
          <div className="id-hero">
            <Avatar person={user} size="lg" />
            <div className="id-hero-cap">
              {usingPhoto
                ? t.shell.account.picture.fromGoogle
                : `${t.shell.account.picture.initials} · ${t.shell.account.picture.hueName[user.avatarHue]}`}
            </div>
          </div>

          {/* One primary action and one subordinate link, STACKED. Two pills in a row
              read as a segmented toggle — i.e. as a source choice, which is the
              confusion this page exists to remove (ADR-0133 §6). */}
          {usingPhoto ? (
            <div className="pk-actions">
              <button
                className="pk-link danger"
                onClick={() => apply({ avatarChoice: 'initials' })}
              >
                {t.shell.account.picture.remove}
              </button>
            </div>
          ) : (
            <>
              <div className="pk-hue-label">{t.shell.account.picture.hueLabel}</div>
              <div className="pk-swatches">
                {IDENTITY_HUES.map((hue: IdentityHue) => (
                  <button
                    key={hue}
                    className="pk-sw"
                    style={{ background: `var(--id-${hue})` }}
                    aria-pressed={hue === user.avatarHue}
                    aria-label={t.shell.account.picture.hueName[hue]}
                    onClick={() => apply({ avatarHue: hue })}
                  >
                    {user.displayName.trim().slice(0, 1)}
                  </button>
                ))}
              </div>
              {user.googleAvatarUrl && (
                <div className="pk-actions">
                  <button className="pk-link" onClick={() => apply({ avatarChoice: 'google' })}>
                    {t.shell.account.picture.useGoogle}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <div className="set-hint-block">
          {/* The removal note is about Google's copy, so it is relevant whenever a
              Google photo exists — in use or merely available to come back to. */}
          {user.googleAvatarUrl
            ? t.shell.account.picture.removeHint
            : t.shell.account.picture.noPhotoHint}
        </div>
      </main>
    </div>
  );
}

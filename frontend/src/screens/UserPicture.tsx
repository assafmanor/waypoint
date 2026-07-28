// The picture page — ADR-0133 §6. TWO STATES, not three peer sources:
//
//   a photo is in use  → the photo, the camera badge, replace, and "remove the photo".
//                        NO colour ramp, because the hue would render nothing.
//   no photo in use    → the initials on the current hue, the camera badge, upload,
//                        THE RAMP, and the way back to the Google photo when there is one.
//
// So the ramp is *revealed* exactly when the colour is what gets drawn, and
// "I don't want a photo" is its own act before the hue becomes a choice. The first
// draft listed Google/upload/ramp side by side and made one tap do two things.
//
// The trigger is a BADGE ON THE FACE, not a drop-zone beside it: the thing being
// changed is already on screen, large and round, so it is its own target — which is why
// this page takes `FilePicker`'s mechanism (`usePickFile`) and not its two dashed tiles.
// The pill below repeats the badge deliberately: the badge is the convention, the pill
// is the label for anyone who doesn't read conventions.
import { useState } from 'react';
import { IDENTITY_HUES, type IdentityHue } from '@waypoint/shared';
import { t } from '../i18n/he';
import { toAvatarBlob } from '../lib/avatar-image';
import { useAuth } from '../state/auth-state';
import { useAppBack } from '../state/nav-state';
import { Avatar } from '../ui/primitives/Avatar';
import { usePickFile } from '../ui/primitives/usePickFile';
import { Icon } from '../ui/Icon';
import { NavArrow } from '../ui/NavArrow';
import { StatusBanner } from '../ui/feedback/StatusBanner';

export default function UserPicture() {
  const { me, patchMe, setAvatar, removeAvatar } = useAuth();
  const goBack = useAppBack();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Resize + crop happen here, before the bytes leave the phone, which is what keeps
  // the server's byte ceiling out of the user's way (ADR-0133 §12). A file that won't
  // decode is a message, not an upload nobody could have satisfied.
  //
  // The two failures get two messages, told apart by WHERE they happened rather than by
  // sniffing an error string — "the file isn't a picture" and "the upload didn't land"
  // are different problems with different next steps, and a text file threw a
  // `DOMException` from `createImageBitmap` that no message prefix would have caught.
  const pickAndUpload = async (file: File) => {
    setError(null);
    setBusy(true);
    let blob: Blob;
    try {
      blob = await toAvatarBlob(file);
    } catch {
      setError(t.shell.account.picture.notAnImage);
      setBusy(false);
      return;
    }
    try {
      await setAvatar(blob);
    } catch {
      setError(t.shell.account.picture.uploadFailed);
    } finally {
      setBusy(false);
    }
  };

  const { openUpload, openCamera, inputs } = usePickFile({
    accept: 'image/*',
    // The FRONT camera: this is a self-portrait, where a document is photographed with
    // the rear one. Same mechanism, opposite lens.
    capture: 'user',
    onPick: pickAndUpload,
    disabled: busy,
  });

  if (!me) return null;
  const user = me.user;
  // `upload` and `google` are one state here — what differs is where the bytes come
  // from, and this page is about the picture you have, not its provenance.
  const usingUpload = user.avatarChoice === 'upload' && !!user.uploadedAvatarUrl;
  const usingGoogle = user.avatarChoice === 'google' && !!user.googleAvatarUrl;
  const usingPhoto = usingUpload || usingGoogle;

  const apply = async (patch: Parameters<typeof patchMe>[0]) => {
    setError(null);
    try {
      await patchMe(patch);
    } catch {
      setError(t.shell.account.saveFailed);
    }
  };

  /** Removing an upload deletes bytes and lets the server choose the fallback;
   *  removing the Google photo only means "don't use it" (§6). One control, because
   *  from here they are the same intent. */
  const remove = async () => {
    setError(null);
    setBusy(true);
    try {
      if (usingUpload) await removeAvatar();
      else await apply({ avatarChoice: 'initials' });
    } catch {
      setError(t.shell.account.saveFailed);
    } finally {
      setBusy(false);
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
        {error && <StatusBanner tone="warn">{error}</StatusBanner>}

        <div className="set-card">
          <div className="id-hero">
            <div className="pk-hero-wrap">
              <Avatar person={user} size="lg" />
              {/* The badge is the affordance on the object itself. Mirrored to the RTL
                  side by `.pk-badge`'s inset-inline rule, not a hardcoded `left`. */}
              <button
                className="pk-badge"
                onClick={openUpload}
                disabled={busy}
                aria-label={t.shell.account.picture.badgeLabel}
              >
                <Icon name="camera" />
              </button>
            </div>
            <div className="id-hero-cap">
              {usingUpload
                ? t.shell.account.picture.uploaded
                : usingGoogle
                  ? t.shell.account.picture.fromGoogle
                  : `${t.shell.account.picture.initials} · ${t.shell.account.picture.hueName[user.avatarHue]}`}
            </div>
          </div>

          {/* One primary action and its subordinate links, STACKED. Two pills in a row
              read as a segmented toggle — i.e. as a source choice, which is the
              confusion this page exists to remove (ADR-0133 §6). */}
          <div className="pk-actions">
            <button className="pk-primary" onClick={openUpload} disabled={busy}>
              {busy
                ? t.shell.account.picture.uploading
                : usingPhoto
                  ? t.shell.account.picture.replace
                  : t.shell.account.picture.upload}
            </button>
            {/* Absent, not disabled, where there is no camera — the same rule the
                document tiles follow (ADR-0086 §2). */}
            {openCamera && (
              <button className="pk-link" onClick={openCamera} disabled={busy}>
                {t.shell.account.picture.takePhoto}
              </button>
            )}
            {usingPhoto && (
              <button className="pk-link danger" onClick={remove} disabled={busy}>
                {t.shell.account.picture.remove}
              </button>
            )}
          </div>

          {!usingPhoto && (
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
          {t.shell.account.picture.uploadHint}
          {' '}
          {/* Three cases, not two — a distinction found by rendering the upload state.
              With an upload in use and no Google photo, the old two-way branch printed
              "and so the initials are shown" directly under a visible photo. The Google
              note is about Google's copy, so it applies whenever one exists (in use or
              merely available to come back to); the no-photo note applies only when
              initials are what actually gets drawn. */}
          {user.googleAvatarUrl
            ? t.shell.account.picture.removeHint
            : usingPhoto
              ? null
              : t.shell.account.picture.noPhotoHint}
        </div>

        {inputs}
      </main>
    </div>
  );
}

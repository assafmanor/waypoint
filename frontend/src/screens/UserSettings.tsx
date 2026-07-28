// Your own settings — ADR-0133 §1/§7. A full shell route, replacing the account
// sheet: a surface hosting a name field and a picture picker is the shape ADR-0090
// warns about, and the sheet's three facts (email, the Google line, sign out) sit
// fine on a page. Reached by tapping your avatar from all three shells.
//
// It holds identity + account facts and nothing invented. Every other candidate was
// rejected with a reason in ADR-0133 §7 — a theme toggle, a language picker, units,
// a user home zone, a calendar-sync toggle, account deletion — because each is
// either fiction today or belongs to a surface that already owns it.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MAX_DISPLAY_NAME_LENGTH } from '@waypoint/shared';
import { t } from '../i18n/he';
import { useAuth } from '../state/auth-state';
import { SETTINGS_PICTURE_PATH, useAppBack } from '../state/nav-state';
import { Avatar } from '../ui/primitives/Avatar';
import { NavArrow } from '../ui/NavArrow';
import { StatusBanner } from '../ui/feedback/StatusBanner';

export default function UserSettings() {
  const { me, logout, patchMe } = useAuth();
  const goBack = useAppBack();
  const navigate = useNavigate();
  const [draftName, setDraftName] = useState(me?.user.displayName ?? '');
  const [failed, setFailed] = useState(false);

  if (!me) return null;

  const trimmed = draftName.trim();
  const dirty = trimmed.length > 0 && trimmed !== me.user.displayName;

  /** Saved on blur rather than behind a button: one field, and a name is an LWW
   *  patch (ADR-0012), so an explicit save step would be ceremony. An empty field
   *  is not a rename — it reverts rather than writing a nameless user. */
  const commitName = async () => {
    if (!dirty) {
      setDraftName(me.user.displayName);
      return;
    }
    setFailed(false);
    try {
      await patchMe({ displayName: trimmed });
    } catch {
      setFailed(true);
      setDraftName(me.user.displayName);
    }
  };

  return (
    <div className="app">
      <header className="new-head">
        <div className="new-head-row">
          <button className="back" onClick={goBack} aria-label={t.shell.account.back}>
            <NavArrow variant="back" />
          </button>
          <div className="new-title">{t.shell.account.title}</div>
        </div>
      </header>

      <main className="set-body">
        {failed && <StatusBanner tone="warn">{t.shell.account.saveFailed}</StatusBanner>}

        <div className="set-sec-title">{t.shell.account.identity}</div>
        <div className="set-card">
          <div className="id-hero">
            {/* The avatar IS the way to change it (ADR-0133 §6) — the badge lives on
                the picture page's hero; here the whole circle is the affordance. */}
            <Avatar
              person={me.user}
              size="lg"
              onClick={() => navigate(SETTINGS_PICTURE_PATH)}
              label={t.shell.account.picture.change}
            />
            <button className="id-change" onClick={() => navigate(SETTINGS_PICTURE_PATH)}>
              {t.shell.account.picture.change}
            </button>
          </div>
          <div className="id-row">
            <span className="lab">{t.shell.account.nameLabel}</span>
            <input
              className="id-input"
              value={draftName}
              maxLength={MAX_DISPLAY_NAME_LENGTH}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitName}
            />
          </div>
        </div>
        <div className="set-hint-block">{t.shell.account.sharedHint}</div>

        <div className="set-sec-title">{t.shell.account.accountSection}</div>
        <div className="set-card">
          <div className="id-row">
            <span className="lab">{t.shell.account.emailLabel}</span>
            {/* `dir="auto"` — a Latin run inside RTL copy is an island (ADR-0118). */}
            <span className="val dim" dir="auto">
              {me.user.email}
            </span>
          </div>
          <div className="id-google">
            <span className="dot" />
            {t.shell.account.provider}
          </div>
        </div>
        <div className="set-hint-block">{t.shell.account.emailHint}</div>

        {/* Signing out is routine, so it is NOT the danger grammar — that is reserved
            for the irreversible (leaving a trip, deleting it). */}
        <button className="acct-signout" onClick={logout}>
          {t.shell.account.signOut}
        </button>
      </main>
    </div>
  );
}

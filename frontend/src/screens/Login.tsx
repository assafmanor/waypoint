// /login — the auth gate (ADR-0024, ADR-0013: Google-only). Design:
// mockups/screens-v1.html #s-landing — dark departure-board chrome, a
// static demo teaser card (not real data — no trip exists pre-login), and
// a three-item feature strip. Shares the CTA button styling with /join
// (.join-cta-btn/.gd/.join-note) rather than duplicating it.
import { APP_NAME } from '../constants';
import { useAuth } from '../state/auth-state';
import { useIsOffline } from '../lib/outbox';
import { t } from '../i18n/he';
import { Icon } from '../ui/Icon';
import { AppMark } from '../ui/AppMark';

export function Login() {
  const { login } = useAuth();
  const offline = useIsOffline();

  return (
    <div className="app land">
      <div className="land-top">
        <div className="land-logo">{APP_NAME}</div>
        <AppMark className="land-icon" />
      </div>

      <div className="land-hero">
        <h1>
          {t.shell.login.heroLine1}
          <br />
          {t.shell.login.heroLine2Prefix}{' '}
          <span className="hero-em">{t.shell.login.heroLine2Em}</span>.
        </h1>
        <p>{t.shell.login.tagline}</p>
      </div>

      <div className="teaser" aria-hidden="true">
        <div className="row">
          <span className="lbl">{t.shell.login.teaserLabel}</span>
          <span className="clk" dir="auto">
            {t.shell.login.teaserTime}
          </span>
        </div>
        <div className="ttl">{t.shell.login.teaserTitle}</div>
        <div className="mt">{t.shell.login.teaserMeta}</div>
        <div className="cd">
          <b dir="auto">{t.shell.login.teaserCountdown}</b>
          <i>{t.shell.login.teaserCountdownUnit}</i>
        </div>
      </div>

      <div className="land-feats">
        <div className="feat">
          <div className="fi">
            <Icon name="ticket" />
          </div>
          <div className="ft">{t.shell.login.featBookings}</div>
        </div>
        <div className="feat">
          <div className="fi">
            <Icon name="map" />
          </div>
          <div className="ft">{t.shell.login.featMap}</div>
        </div>
        <div className="feat">
          <div className="fi">
            <Icon name="members" />
          </div>
          <div className="ft">{t.shell.login.featSync}</div>
        </div>
      </div>

      <div className="land-cta">
        <button className="join-cta-btn" onClick={login} disabled={offline}>
          <span className="gd" /> {t.shell.login.continueWithGoogle}
        </button>
        <p className="join-note">
          {offline ? (
            t.shell.login.offline
          ) : (
            <>
              {t.shell.login.note}
              <br />
              {t.shell.login.noteExtra}
            </>
          )}
        </p>
      </div>
    </div>
  );
}

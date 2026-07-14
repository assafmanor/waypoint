// /login — the auth gate (ADR-0024, ADR-0013: Google-only). Design:
// mockups/screens-v1.html #s-landing — dark departure-board chrome, a
// static demo teaser card (not real data — no trip exists pre-login), and
// a three-item feature strip. Shares the CTA button styling with /join
// (.join-cta-btn/.gd/.join-note) rather than duplicating it.
import { useAuth } from '../state/auth-state';
import { useIsOffline } from '../lib/outbox';
import { t } from '../i18n/he';

export function Login() {
  const { login } = useAuth();
  const offline = useIsOffline();

  return (
    <div className="app land">
      <div className="land-top">
        <div className="land-logo">Waypoint</div>
        {/* inlined (not <img>) so the vector stays crisp at this size —
            Chrome rasterizes small <img src="*.svg"> and it comes out
            aliased/pixelated. */}
        <svg className="land-icon" viewBox="0 0 512 512" aria-hidden="true">
          <circle cx="256" cy="256" r="256" fill="#E9A63C" />
          <rect x="88" y="140" width="248" height="52" rx="26" fill="#152137" />
          <circle cx="398" cy="166" r="26" fill="#152137" />
          <rect x="152" y="248" width="272" height="48" rx="24" fill="#152137" opacity={0.55} />
          <rect x="216" y="330" width="208" height="48" rx="24" fill="#152137" opacity={0.3} />
        </svg>
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
          <span className="clk" dir="ltr">
            {t.shell.login.teaserTime}
          </span>
        </div>
        <div className="ttl">{t.shell.login.teaserTitle}</div>
        <div className="mt">{t.shell.login.teaserMeta}</div>
        <div className="cd">
          <b dir="ltr">{t.shell.login.teaserCountdown}</b>
          <i>{t.shell.login.teaserCountdownUnit}</i>
        </div>
      </div>

      <div className="land-feats">
        <div className="feat">
          <div className="fi">🎫</div>
          <div className="ft">{t.shell.login.featBookings}</div>
        </div>
        <div className="feat">
          <div className="fi">🗺️</div>
          <div className="ft">{t.shell.login.featMap}</div>
        </div>
        <div className="feat">
          <div className="fi">👥</div>
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

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
        {/* The Waypoint mark: a map marker (teal = place) with a glowing amber
            core (amber = the live "now"), on a board disc so it reads on the dark
            chrome. Mirrors public/icon-mark-bright.svg. Inlined (not <img>) so the
            vector stays crisp at this size — Chrome rasterizes small
            <img src="*.svg"> and it comes out aliased/pixelated. */}
        <svg className="land-icon" viewBox="0 0 512 512" aria-hidden="true">
          <defs>
            <linearGradient id="lg-teal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#37B3A3" />
              <stop offset="1" stopColor="#1F7D73" />
            </linearGradient>
            <linearGradient id="lg-amber" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#F2B65A" />
              <stop offset="1" stopColor="#E09A2F" />
            </linearGradient>
            <linearGradient id="lg-board" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#182642" />
              <stop offset="1" stopColor="#0E1729" />
            </linearGradient>
          </defs>
          <circle cx="256" cy="256" r="256" fill="url(#lg-board)" />
          <g transform="translate(256 268) scale(0.66) translate(-256 -260)">
            <path
              d="M256 44 C150 44 66 126 66 230 C66 348 206 436 256 476 C306 436 446 348 446 230 C446 126 362 44 256 44 Z"
              fill="url(#lg-teal)"
            />
            <circle
              cx="256"
              cy="216"
              r="96"
              fill="none"
              stroke="#F2B65A"
              strokeWidth="9"
              opacity={0.42}
            />
            <circle cx="256" cy="216" r="60" fill="url(#lg-amber)" />
          </g>
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

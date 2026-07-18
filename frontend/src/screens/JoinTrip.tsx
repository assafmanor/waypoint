// /join/:token — invite preview + confirm (app-shell.md §4, ADR-0024).
// Design: mockups/screens-v1.html #s-linkjoin — dark departure-board chrome
// with an amber anticipation glow and a boarding-pass "ticket" preview card
// (perforation, countdown-to-departure, playful anonymous avatars). The
// public preview API returns only { tripName, destination, dates, memberCount }
// (no member names), so the avatars are generic 🙂 placeholders, not real
// people — matching the mockup's intent.
//
// One tap to join, no settings step (Assaf, 2026-07-14): calendarSyncEnabled
// stays the Prisma default (off); it's configurable later in trip settings
// (T-044), not asked for here.
//
// The preview renders first regardless of auth state, no eager redirect
// (AuthGate in App.tsx carries an explicit exception for this route). For an
// anonymous visitor the CTA reads "Continue with Google": tapping it saves
// this path as the deep-link intent and starts OAuth; AuthGate resumes here
// afterwards, CTA now reading "Join" — still one explicit tap, not automatic.
//
// An authed visitor already in this trip is redirected straight in (ADR-0067):
// GET /invites/:code now returns tripId, so we can match it against memberships
// instead of showing the "you're invited" ticket to an existing member.
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { InvitePreview } from '@waypoint/shared';
import { useAuth } from '../state/auth-state';
import { useActiveTripId } from '../state/active-trip-id';
import { useIsOffline } from '../lib/outbox';
import { getNow } from '../lib/useClock';
import {
  ApiError,
  fetchInvitePreview,
  isInviteExpiredError,
  isRemovedFromTripError,
  joinTrip,
} from '../lib/api';
import { consumeJoinIntent, saveIntent, saveJoinIntent } from '../lib/intent';
import { dayCount } from '../lib/hebrew';
import { DEFAULT_TRIP_ICON, DOT_SEPARATOR, MS_PER_DAY } from '../constants';
import { t } from '../i18n/he';

type LoadState =
  | { status: 'loading' }
  | { status: 'invalid' }
  | { status: 'expired' }
  | { status: 'offline' }
  | { status: 'ready'; preview: InvitePreview };

// Playful placeholder avatar colors (mockup #s-linkjoin) — the public preview
// has no real members, so these are anonymous stand-ins.
const AVATAR_COLORS = ['#5ec5b6', '#e88c8c', '#9c8ce8', '#8cb6e8'];
const MAX_AVATARS = 4;

const ddmm = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

export function JoinTrip() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const { status: authStatus, me, login } = useAuth();
  const { setTripId } = useActiveTripId();
  const offline = useIsOffline();

  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState(false);
  const [joinBlocked, setJoinBlocked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchInvitePreview(token).then(
      (preview) => {
        if (!cancelled) setLoad({ status: 'ready', preview });
      },
      (err) => {
        if (cancelled) return;
        const status = isInviteExpiredError(err)
          ? 'expired'
          : err instanceof ApiError
            ? 'invalid'
            : 'offline';
        setLoad({ status });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Already a member? Skip the ticket and go straight into the trip (ADR-0067).
  useEffect(() => {
    if (load.status !== 'ready' || authStatus !== 'authed' || !me) return;
    if (me.memberships.some((m) => m.tripId === load.preview.tripId)) {
      setTripId(load.preview.tripId);
      navigate('/', { replace: true });
    }
  }, [load, authStatus, me, setTripId, navigate]);

  const doJoin = useCallback(async () => {
    setJoining(true);
    setJoinError(false);
    setJoinBlocked(false);
    try {
      const membership = await joinTrip(token);
      setTripId(membership.tripId);
      navigate('/');
    } catch (err) {
      if (isRemovedFromTripError(err)) setJoinBlocked(true);
      else setJoinError(true);
    } finally {
      setJoining(false);
    }
  }, [token, setTripId, navigate]);

  // Auto-complete the join when we return here authed *and* the pending-join
  // flag is set — i.e. the user reached login by tapping "Continue with Google"
  // on this preview, so the confirm already happened (ADR-0024). A fresh authed
  // visit (no flag) still shows the Join button. Gated on preview-ready so a
  // join failure falls back to the normal preview + retry state.
  useEffect(() => {
    if (load.status !== 'ready' || authStatus !== 'authed') return;
    if (consumeJoinIntent() === token) void doJoin();
  }, [load.status, authStatus, token, doJoin]);

  const onCta = () => {
    if (authStatus !== 'authed') {
      saveJoinIntent(token);
      saveIntent(`/join/${token}`);
      login();
      return;
    }
    void doJoin();
  };

  return (
    <div className="app join-land">
      <div className="join-top">
        <div className="join-logo">Waypoint</div>
        {/* inlined (not <img>) so the vector stays crisp at this size —
            Chrome rasterizes small <img src="*.svg"> and it comes out
            aliased/pixelated (same reasoning as Login.tsx's .land-icon). */}
        <svg className="join-icon" viewBox="0 0 512 512" aria-hidden="true">
          <circle cx="256" cy="256" r="256" fill="#E9A63C" />
          <rect x="88" y="140" width="248" height="52" rx="26" fill="#152137" />
          <circle cx="398" cy="166" r="26" fill="#152137" />
          <rect x="152" y="248" width="272" height="48" rx="24" fill="#152137" opacity={0.55} />
          <rect x="216" y="330" width="208" height="48" rx="24" fill="#152137" opacity={0.3} />
        </svg>
      </div>

      {load.status === 'loading' && <p className="join-status">{t.shell.join.loading}</p>}
      {load.status === 'invalid' && <p className="join-status">{t.shell.join.invalid}</p>}
      {load.status === 'expired' && <p className="join-status">{t.shell.join.expired}</p>}
      {load.status === 'offline' && <p className="join-status">{t.shell.join.offline}</p>}

      {load.status === 'ready' && <Ready preview={load.preview} />}

      {load.status === 'ready' && (
        <div className="join-cta">
          <button className="join-cta-btn" onClick={onCta} disabled={offline || joining}>
            {authStatus === 'authed' ? (
              t.shell.join.joinButton
            ) : (
              <>
                <span className="gd" /> {t.shell.login.continueWithGoogle}
              </>
            )}
          </button>
          {/* Only the anon (Google sign-in) and offline cases carry a note —
              an authed one-tap join needs no explaining. */}
          {(offline || authStatus !== 'authed') && (
            <p className="join-note">{offline ? t.shell.login.offline : t.shell.join.note}</p>
          )}
          {joinError && <p className="join-error">{t.shell.join.joinError}</p>}
          {joinBlocked && <p className="join-error">{t.shell.join.joinBlocked}</p>}
        </div>
      )}
    </div>
  );
}

function Ready({ preview }: { preview: InvitePreview }) {
  const daysUntilStart = Math.ceil(
    (Date.parse(`${preview.startDate}T00:00:00Z`) - getNow()) / MS_PER_DAY,
  );
  const tripDays =
    Math.round((Date.parse(preview.endDate) - Date.parse(preview.startDate)) / MS_PER_DAY) + 1;
  const avatarCount = Math.min(preview.memberCount, MAX_AVATARS);
  const startCount = dayCount(daysUntilStart);
  const lengthCount = dayCount(tripDays);

  return (
    <>
      <div className="join-hero">
        <h1>
          {t.shell.join.heroTitle} <span className="hero-em">🎉</span>
        </h1>
        <p>{t.shell.join.heroBody}</p>
      </div>

      <div className="join-ticket-wrap">
        <div className="join-ticket">
          <div className="ticket-top">
            <div className="ticket-head">
              <span className="ticket-badge">✈️ {t.shell.join.ticketBadge}</span>
              {daysUntilStart > 0 && (
                <span className="ticket-countdown">
                  {t.shell.join.countdownPrefix}{' '}
                  {startCount.value && (
                    <>
                      <span className="num" dir="ltr">
                        {startCount.value}
                      </span>{' '}
                    </>
                  )}
                  {startCount.unit}
                </span>
              )}
            </div>
            <div className="ticket-name">
              <span className="ticket-emoji">{preview.icon ?? DEFAULT_TRIP_ICON}</span>{' '}
              {preview.tripName}
            </div>
            <div className="ticket-meta">
              {preview.destination}
              <span className="dot">{DOT_SEPARATOR}</span>
              {/* Latin/numeric runs stay mono + dir=ltr; Hebrew never sits in
                  mono (design-language.md §Typography). */}
              <span className="num" dir="ltr">
                {ddmm(preview.startDate)} – {ddmm(preview.endDate)}
              </span>
              {tripDays > 0 && (
                <>
                  <span className="dot">{DOT_SEPARATOR}</span>
                  {lengthCount.value && (
                    <>
                      <span className="num" dir="ltr">
                        {lengthCount.value}
                      </span>{' '}
                    </>
                  )}
                  {lengthCount.unit}
                </>
              )}
            </div>
          </div>

          <div className="ticket-perf">
            <span className="notch start" />
            <span className="notch end" />
          </div>

          <div className="ticket-bottom">
            <div className="ticket-avatars" aria-hidden="true">
              {Array.from({ length: avatarCount }, (_, i) => (
                <span
                  key={i}
                  className="ticket-av"
                  style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}
                >
                  🙂
                </span>
              ))}
            </div>
            <div className="ticket-people">
              <div className="ticket-members">{t.shell.join.members(preview.memberCount)} 👋</div>
              <div className="ticket-sub">{t.shell.join.membersSub}</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

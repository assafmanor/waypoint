// /join/:token — invite preview + confirm (app-shell.md §4, ADR-0024).
// Design: mockups/screens-v1.html #s-linkjoin — dark departure-board chrome
// with an amber anticipation glow and a boarding-pass "ticket" preview card
// (perforation, countdown-to-departure, playful anonymous avatars). The
// public preview API returns only { tripName, destination, dates, memberCount }
// (no member names), so the avatars are generic `GLYPH.anonAvatar` placeholders, not real
// people — matching the mockup's intent.
//
// One tap to join, no settings step (Assaf, 2026-07-14): calendarSyncEnabled
// stays the Prisma default (off); it's configurable later in trip settings
// (T-044), not asked for here.
//
// The preview renders first regardless of auth state, no eager redirect
// (AuthGate in App.tsx carries an explicit exception for this route). For an
// anonymous visitor the CTA reads "Continue with Google": tapping it saves this path as
// the deep-link intent and starts OAuth; AuthGate resumes here afterwards, CTA now
// reading "Join".
//
// **THE RETURN DOES NOT AUTO-JOIN** (owner's device pass, 2026-07-31 — ADR-0143 §8).
// It used to: a `joinJoinIntent` flag set before leaving was consumed on the way back and
// fired the join for you, on the reading that tapping "Continue with Google" WAS the
// confirmation (ADR-0024). On a device that reads as "I logged in and was silently put
// into a trip" — the invitation, which is the whole point of this screen, flashes past
// unread. So the return lands on the pass with the CTA now saying "Join", and the tap
// that joins is a tap you make while looking at what you are joining. The
// `saveJoinIntent`/`consumeJoinIntent` pair went with it rather than being left dead.
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
import { prefersReducedMotion } from '../lib/motion';
import { useCountUp } from '../lib/useCountUp';
import {
  ApiError,
  fetchInvitePreview,
  isInviteExpiredError,
  isRemovedFromTripError,
  joinTrip,
} from '../lib/api';
import { saveIntent } from '../lib/intent';
import { dayCount } from '../lib/hebrew';
import { countdownParts, formatTripDates } from '../lib/time';
import {
  APP_NAME,
  DEFAULT_TRIP_ICON,
  DOT_SEPARATOR,
  GLYPH,
  JOIN_PASS,
  MS_PER_DAY,
} from '../constants';
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
  // The beat between deciding and arriving (ADR-0143): the pass is STAMPED, then it
  // TEARS at the perforation it has always had, then it hands off to the trip. Before
  // this, `joinTrip` resolving went straight to `navigate('/')` — the moment you were
  // admitted was the one frame the screen did not show.
  const [outcome, setOutcome] = useState<'stamped' | 'torn' | null>(null);

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
      // The stamp lands on the SERVER'S success and never optimistically: a stamp
      // that has to be un-stamped when the join fails is worse than no stamp, so the
      // spinner covers the request and this only runs on a real membership.
      setOutcome('stamped');
    } catch (err) {
      if (isRemovedFromTripError(err)) setJoinBlocked(true);
      else setJoinError(true);
    } finally {
      setJoining(false);
    }
  }, [token, setTripId, navigate]);

  // Stamp → tear → hand off. Reduced motion lands the handoff immediately rather than
  // skipping the outcome: the join still happened, it just is not performed
  // (ADR-0140 §5). The navigation is the LAST beat, so nothing races it.
  //
  // ONE timer per phase, chained — deliberately not both timers armed together from the
  // `stamped` phase. That version stranded the user on a torn pass forever: advancing to
  // `torn` re-runs this effect, and its cleanup cancelled the pending navigation before
  // it could fire. A phase now only ever cancels its OWN pending step.
  useEffect(() => {
    if (!outcome) return;
    if (prefersReducedMotion()) {
      navigate('/');
      return;
    }
    const stamped = outcome === 'stamped';
    const id = setTimeout(
      () => (stamped ? setOutcome('torn') : navigate('/')),
      stamped ? JOIN_PASS.STAMP_MS : JOIN_PASS.TEAR_MS,
    );
    return () => clearTimeout(id);
  }, [outcome, navigate]);

  const onCta = () => {
    if (authStatus !== 'authed') {
      // Only the deep-link intent, so `AuthGate` brings us back to THIS pass. There is
      // deliberately no "and then join" flag — see the header note.
      saveIntent(`/join/${token}`);
      login();
      return;
    }
    void doJoin();
  };

  // A BLOCKED join is indistinguishable from a dead link, on purpose (ADR-0143 §5,
  // corrected by the owner 2026-07-31). Naming the block would tell someone who is no
  // longer a member that the group made a decision about them — a roster fact they have
  // no standing to learn — and "this link no longer works, ask for a new one" is both
  // true and equally actionable either way. So `joinBlocked` renders the same refused
  // pass with the same words as an invalid code, and the server stays the only place that
  // knows which it was.
  const refused = load.status === 'invalid' || load.status === 'expired' || joinBlocked;

  return (
    <div
      className="app join-land"
      data-pass={load.status === 'ready' ? 'ready' : undefined}
      data-outcome={outcome ?? undefined}
      data-refused={refused ? '' : undefined}
    >
      <div className="join-top">
        <div className="join-logo">{APP_NAME}</div>
        {/* The Travelive mark (see Login.tsx's .land-icon for the rationale) —
            marker + amber "now" core on a board disc, mirroring
            public/icon-mark-bright.svg. Inlined so it stays crisp at this size. */}
        <svg className="join-icon" viewBox="0 0 512 512" aria-hidden="true">
          <defs>
            <linearGradient id="jg-teal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#37B3A3" />
              <stop offset="1" stopColor="#1F7D73" />
            </linearGradient>
            <linearGradient id="jg-amber" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#F2B65A" />
              <stop offset="1" stopColor="#E09A2F" />
            </linearGradient>
            <linearGradient id="jg-board" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#182642" />
              <stop offset="1" stopColor="#0E1729" />
            </linearGradient>
          </defs>
          <circle cx="256" cy="256" r="256" fill="url(#jg-board)" />
          <circle
            cx="256"
            cy="256"
            r="246"
            fill="none"
            stroke="#3FB3A3"
            strokeWidth="18"
            opacity={0.9}
          />
          <g transform="translate(256 268) scale(0.66) translate(-256 -260)">
            <path
              d="M256 44 C150 44 66 126 66 230 C66 348 206 436 256 476 C306 436 446 348 446 230 C446 126 362 44 256 44 Z"
              fill="url(#jg-teal)"
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
            <circle cx="256" cy="216" r="60" fill="url(#jg-amber)" />
          </g>
        </svg>
      </div>

      {load.status === 'loading' && <PassSkeleton />}
      {refused && (
        <RefusedPass
          reason={
            // `expired` is the one refusal that may say more: a finished trip is a fact
            // about the TRIP, not about the person asking. A block borrows the neutral
            // invalid-code wording precisely so it cannot be told apart from one.
            load.status === 'expired' ? t.shell.join.expired : t.shell.join.invalid
          }
        />
      )}
      {load.status === 'offline' && <p className="join-status">{t.shell.join.offline}</p>}

      {/* `!refused` matters for the BLOCKED case: the server only says so on the join
          attempt, so `load.status` is still `ready` and the invitation pass would render
          underneath the refusal. */}
      {load.status === 'ready' && !refused && <Ready preview={load.preview} outcome={outcome} />}

      {/* No CTA once the pass is stamped: the outcome is playing, and a tappable
          "join" over a pass that has already been accepted is a second join. */}
      {load.status === 'ready' && !outcome && !refused && (
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
        </div>
      )}
    </div>
  );
}

function Ready({ preview, outcome }: { preview: InvitePreview; outcome: string | null }) {
  const daysUntilStart = Math.ceil(
    (Date.parse(`${preview.startDate}T00:00:00Z`) - getNow()) / MS_PER_DAY,
  );
  const tripDays =
    Math.round((Date.parse(preview.endDate) - Date.parse(preview.startDate)) / MS_PER_DAY) + 1;
  const avatarCount = Math.min(preview.memberCount, MAX_AVATARS);
  // The countdown counts UP to its value (ADR-0143): the number of days until you fly
  // is the most emotive fact on this screen, and it arrived as static text.
  // `countdownParts` may return a rounded month count far out, so the count-up runs on
  // the days and the parts are derived from what it currently reads — the units stay
  // correct at every step rather than being spliced onto a moving number.
  const countedDays = useCountUp(daysUntilStart, daysUntilStart > 0);
  const startCount = countdownParts(countedDays);
  const lengthCount = dayCount(tripDays);

  return (
    <>
      <div className="join-hero">
        <h1>
          {t.shell.join.heroTitle} <span className="hero-em">{GLYPH.celebrate}</span>
        </h1>
      </div>

      <div className="join-ticket-wrap">
        <div className="join-ticket">
          {/* Deliberately NOT over the trip's name: a stamp lands on the blank part of
              a pass, and here that is doubly required — you must still be able to read
              what you just joined. `--ok`, not teal: teal means LOCATION (ADR-0028's
              budget), and being admitted is a status. */}
          {outcome && <span className="ticket-stamp">{t.shell.join.stamp}</span>}
          <div className="ticket-top">
            <div className="ticket-head">
              <span className="ticket-badge">
                {GLYPH.boardingPass} {t.shell.join.ticketBadge}
              </span>
              {daysUntilStart > 0 && (
                <span className="ticket-countdown">
                  {startCount.prefix && <>{startCount.prefix} </>}
                  {startCount.value && (
                    <>
                      <span className="num" dir="auto">
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
              {/* Latin/numeric runs stay mono + dir=auto; Hebrew never sits in
                  mono (design-language.md §Typography). */}
              <span className="num" dir="auto">
                {formatTripDates(preview.startDate, preview.endDate)}
              </span>
              {tripDays > 0 && (
                <>
                  <span className="dot">{DOT_SEPARATOR}</span>
                  {lengthCount.value && (
                    <>
                      <span className="num" dir="auto">
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
                  style={
                    {
                      background: AVATAR_COLORS[i % AVATAR_COLORS.length],
                      // Per-avatar stagger index — they land one after another, so the
                      // row reads as people arriving (ADR-0143).
                      '--i': i,
                    } as React.CSSProperties
                  }
                >
                  {GLYPH.anonAvatar}
                </span>
              ))}
            </div>
            <div className="ticket-people">
              <div className="ticket-members">
                {t.shell.join.members(preview.memberCount)} {GLYPH.wave}
              </div>
              <div className="ticket-sub">{t.shell.join.membersSub}</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/** Loading is the pass's own SHAPE (ADR-0143), not a paragraph.
 *
 *  A sentence on a dark screen reads as "something is happening somewhere"; the pass's
 *  outline reads as "a pass is coming". Same reasoning as ADR-0105's content-shaped
 *  skeletons — this is the one surface where the shape IS the message. */
function PassSkeleton() {
  return (
    <>
      <div className="join-hero join-hero-skel" aria-hidden="true">
        <h1>
          <span className="join-skel join-skel-title" />
        </h1>
        <span className="join-skel join-skel-sub" />
      </div>
      <div className="join-ticket-wrap" aria-hidden="true">
        <div className="join-ticket join-ticket-skel">
          <div className="ticket-top">
            <span className="join-skel join-skel-badge" />
            <span className="join-skel join-skel-name" />
            <span className="join-skel join-skel-meta" />
          </div>
          <div className="ticket-perf">
            <span className="notch start" />
            <span className="notch end" />
          </div>
          <div className="ticket-bottom">
            <span className="join-skel join-skel-av" />
            <span className="join-skel join-skel-av" />
            <span className="join-skel join-skel-av" />
          </div>
        </div>
      </div>
      {/* The status text stays for anyone who cannot see the shape. */}
      <p className="join-status join-status-sr">{t.shell.join.loading}</p>
    </>
  );
}

/** An expired or revoked invite is a REJECTION (ADR-0067), and it should look like one.
 *
 *  It was a paragraph — and a paragraph on a loading screen reads as a loading state
 *  that never resolved, not as a decision. The pass is drawn, struck through and
 *  stamped, the anticipation glow drops out, and the next action is named.
 *
 *  The trip is deliberately NOT shown: the public preview call failed, so there is
 *  nothing to draw. (The mockup drew the trip struck through, which assumed a preview
 *  the API does not return for a dead code — the one thing the build had to correct.)
 *  What the stamp still buys is the distinction the paragraph could not make: the
 *  invitation was real and the LINK is what died, so the next step is "ask for a new
 *  one" rather than "check the address". */
function RefusedPass({ reason }: { reason: string }) {
  return (
    <div className="join-ticket-wrap join-refused">
      <div className="join-ticket">
        <span className="ticket-stamp is-refused">{t.shell.join.stampRefused}</span>
        <div className="ticket-top">
          <span className="ticket-badge">
            {GLYPH.boardingPass} {t.shell.join.ticketBadge}
          </span>
          <div className="ticket-name refused-name">{t.shell.join.refusedTitle}</div>
        </div>
        <div className="ticket-perf">
          <span className="notch start" />
          <span className="notch end" />
        </div>
        <div className="ticket-bottom">
          <p className="join-refused-text">{reason}</p>
        </div>
      </div>
    </div>
  );
}

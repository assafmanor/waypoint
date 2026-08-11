import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import type { Trip } from '@waypoint/shared';
import { TripProvider, useTrip } from './state/trip-state';
import { ModeProvider, useMode } from './state/mode-state';
import { MapScopeProvider, useMapScope, useSelectDay } from './state/map-scope-state';
import { DragProvider, useDragState } from './state/drag-state';
import { AuthProvider, useAuth } from './state/auth-state';
import { ActiveTripIdProvider, useActiveTripId } from './state/active-trip-id';
import {
  NavProvider,
  SETTINGS_FROM,
  settingsPath,
  shouldResetToHomeOnResume,
  tabShowsSelectedDay,
  useCloseAllOverlays,
  navDirectionFrom,
  type NavDir,
  useMarkInsideTrip,
  useTripBackGuard,
  useTripTab,
} from './state/nav-state';
import {
  flushAllOutbox,
  isOffline,
  useIsOffline,
  useOutboxCount,
  usePendingChangeCount,
  useSyncFailures,
} from './lib/outbox';
import { loadTripList } from './lib/cache';
import { resolveLanding } from './lib/active-trip';
import { consumeIntent, hasIntent, saveIntent } from './lib/intent';
import { ToastProvider } from './ui/Toast';
import { ConfirmProvider } from './ui/ConfirmDialog';
import {
  AppShell,
  BODY_FULLBLEED,
  CHROME_CONDENSED,
  CHROME_RECLAIMED,
  TripHandoffLayer,
} from './ui/layout';
import { useTripHandoffTarget } from './lib/trip-handoff';
import { mapPaneAvailable } from './lib/map-config';
import { BootScreen, HomeSkeleton, LoadingState } from './ui/feedback';
import { SyncReviewSheet } from './ui/SyncReviewSheet';
import { AppUpdateNotice } from './ui/AppUpdateNotice';
import { Icon } from './ui/Icon';
import { NavArrow } from './ui/NavArrow';
import { DayStrip } from './ui/domain/DayStrip';
import { NavDebugHud } from './ui/NavDebugHud';
import { Home } from './screens/Home';
import { Login } from './screens/Login';
import { ZeroState } from './screens/ZeroState';
// Code-split the non-first-paint surfaces (F-07): the boot path (auth, RootSurface,
// Trip-mode Home) stays eager; the Plan surfaces, the Index (which pulls in the
// document viewer + zoom math), and the full-page shell routes load on demand so
// they stay out of the initial bundle — the exact win for weak connectivity abroad.
const PlanHome = lazy(() => import('./screens/PlanHome').then((m) => ({ default: m.PlanHome })));
const PlanDay = lazy(() => import('./screens/PlanDay').then((m) => ({ default: m.PlanDay })));
const DayView = lazy(() => import('./screens/DayView').then((m) => ({ default: m.DayView })));
const Index = lazy(() => import('./screens/Index').then((m) => ({ default: m.Index })));
const MapView = lazy(() => import('./screens/Map').then((m) => ({ default: m.MapView })));
const AllTrips = lazy(() => import('./screens/AllTrips').then((m) => ({ default: m.AllTrips })));
const CreateTrip = lazy(() =>
  import('./screens/CreateTrip').then((m) => ({ default: m.CreateTrip })),
);
const JoinTrip = lazy(() => import('./screens/JoinTrip').then((m) => ({ default: m.JoinTrip })));
const TripSettings = lazy(() =>
  import('./screens/TripSettings').then((m) => ({ default: m.TripSettings })),
);
import { DevTimeTravel } from './dev/DevTimeTravel';
import { getNow, useClock } from './lib/useClock';
import { useShrinkToFit } from './lib/useShrinkToFit';
import {
  DEFAULT_TRIP_ICON,
  MS_PER_DAY,
  OUTBOX_RETRY_MS,
  PEOPLE_STACK_CAP,
  TABS,
  TRIP_NAME_FIT,
  type TabId,
} from './constants';
import { type Mode } from './lib/mode';
import { monthLabelFor, tripDates, weekdayLetter } from './lib/time';
import { liveToday } from './lib/places';
import { t } from './i18n/he';
import './App.css';
import './screens.css';
// Global rather than owned by `useFormErrors` (ADR-0150): `data-invalid` is an
// attribute contract, and the screens that set it live (the two date ranges) are
// lazy chunks that never touch the hook — its stylesheet has to be here for them.
import './ui/primitives/form-errors.css';
// The rebuff beat, shared by Plan's prep hero and the Trip board (ADR-0160 §Q) — global
// for the same reason: two surfaces play it and neither owns it.
import './styles/beats.css';
import { Avatar } from './ui/primitives/Avatar';
import { RosterSheet } from './ui/RosterSheet';
import { ltrIsolate } from './lib/bidi';
import { readDurationMs } from './lib/motion';
import { memberCluster } from './lib/member-cluster';
import { useNarrowScreen } from './lib/useMediaQuery';
const UserSettings = lazy(() => import('./screens/UserSettings'));
const UserPicture = lazy(() => import('./screens/UserPicture'));

// Small tail added past the transition's own duration before disarming the
// mode-switch class, so we never clear it a frame early (which would snap the
// chrome to its final colors mid-animation).
const SWITCH_TAIL_MS = 80;

// Map is designed later (T-002); it falls back here with a mode-emphasis
// subtitle (T-019). Home/Day-by-day/Index are built for both modes.
function Placeholder({ tab, mode }: { tab: TabId; mode: Mode }) {
  return (
    <div className="placeholder">
      <h1>{t.tabs[tab]}</h1>
      <p className="placeholder-emphasis">{t.modeEmphasis[tab][mode]}</p>
      <p>{t.placeholder.comingSoon}</p>
    </div>
  );
}

// Segmented Plan/Trip toggle (design-language.md's Plan-mode components,
// from mockups/plan-mode-v1.html) — two explicit states, not an auto/manual
// cycle: tapping a side just picks it. The override is session-only
// (state/mode-state.tsx) — always auto-derived by default, tapping a side
// just peeks at the other for now; a fresh load is always back to auto, no
// reset control needed.
//
// ADR-0040: Trip mode is a live-window-only state, so the toggle only exists
// while the trip is live. Before it starts and after it ends Plan is the only
// reachable mode — there's nothing to switch, and the departure board stays
// scarce (ADR-0033). The countdown-to-departure lives on Plan Home's prep
// dashboard (T-055), not here.
//
// **It rides the DAY row, and it is icons-only** (ADR-0149 §3). The position is
// not about space: row 1 lifts out when the chrome condenses, and the Map opens
// condensed, so a toggle in row 1 would be unreachable on a whole tab. Icons-only
// is about weight rather than width — measured, it buys no extra day pill — and
// mode identity still rides three channels (chrome hue, drafting grid, the fill's
// position in the pill) where design-language requires two. The words stay as each
// button's accessible name.
function ModeToggle() {
  const { mode, phase, setOverride } = useMode();
  if (phase !== 'live') return null;
  return (
    <div className="hdr-mode" role="group" aria-label={t.mode.group}>
      <button
        className={mode === 'plan' ? 'on' : ''}
        onClick={() => setOverride('plan')}
        aria-label={t.mode.plan}
        aria-pressed={mode === 'plan'}
      >
        <span className="p">
          <Icon name="edit" />
        </span>
      </button>
      <button
        className={mode === 'trip' ? 'on' : ''}
        onClick={() => setOverride('trip')}
        aria-label={t.mode.trip}
        aria-pressed={mode === 'trip'}
      >
        <span className="p">
          <Icon name="navigate" />
        </span>
      </button>
    </div>
  );
}

// **The in-trip top bar, in two rows** (ADR-0149). It stacked five — a centred mode
// bar, an identity row, a status region, the day strip and a day-scope ribbon — at
// 250px resting and 321px off today, which is a third of the viewport before the
// body starts. Now: row 1 answers "where am I and who is here", row 2 "which day",
// at 160px in every state.
//
// Two of the things that read as clanky were layout, not animation: the ribbon
// (42px) and the sync badges (~30px) were IN FLOW, so they pushed the body every
// time they appeared. Neither does now — the ribbon became a fixed-width anchor
// slot with two cross-faded states, and offline/pending became a badge positioned
// on the trip glyph. Nothing in this header changes height.
//
// Exported for `Header.test.tsx` only — the trip shell is its one caller.
export function Header({
  onSelectDay,
  onOpenSwitcher,
  onOpenPeople,
  onOpenSettings,
  allDays,
  otherTripCount = 0,
}: {
  onSelectDay: (date: string) => void;
  onOpenSwitcher: () => void;
  onOpenPeople: () => void;
  onOpenSettings: () => void;
  /** The Map's all-days scope is on (ADR-0110 §4) — screen-local state the shell
   *  hands down, since the app tracks exactly one active date. Whether the strip
   *  then singles out a day is this header's own call (see `unscoped` below). */
  allDays?: boolean;
  /** How many OTHER trips this account has. Drives the deck cue and the `swap`
   *  mark — absent at one trip, which is the common case: no deck, no swap,
   *  nothing in the chrome suggesting anywhere else to be (ADR-0149 §2, the same
   *  "no source, no control" rule as ADR-0045 / ADR-0109 §6). The chip itself
   *  still navigates, so app-shell.md §5's single-trip path to `/trips` survives. */
  otherTripCount?: number;
}) {
  const { trip, users, zoneEvidence, activeDate, usingCachedSnapshot, events } = useTrip();
  const { me } = useAuth();
  const { mode } = useMode();
  // **Which surface is asking** decides whether the strip singles out a day at all
  // (field report #39). The remembered day is the `?day=` param wherever you are
  // (ADR-0035 §4 — one copy, nothing to sync), but it is only shown as selected on a
  // surface that is actually showing that day: the two day-scoped tabs and Home. On
  // the Index — trip-wide cards, counts and readiness — and on the Map at all-days,
  // no pill is the selected one, while the day itself is untouched and comes back
  // with you. The pills stay tappable everywhere; `onSelectDay` decides where a tap
  // lands.
  const { tab } = useTripTab();
  const unscoped = !tabShowsSelectedDay(tab) || (tab === 'map' && !!allDays);
  // A drag in flight anywhere makes the strip's day pills spring-loaded, so a card or
  // a row can be carried to another day (ADR-0116 session-119).
  const { dragging, overDate } = useDragState();
  const now = useClock();
  // Plan mode surfaces empty days on the strip (dashed + red number), the
  // day-selector cue from mockups/plan-mode-v1.html — a gap to go fill. DayStrip
  // reads this per-day as `hasEvents`.
  const datesWithEvents = new Set(events.map((e) => e.date));
  // The chip is the container, not a wrapper around it: its width comes from
  // `flex: 1 1 0` against its siblings, never from its own content, so observing it
  // can't feed back into the font-size it is being resized for. That is also what
  // makes the negotiation the hook's comment describes actually happen — a member
  // joining widens the stack, which narrows the chip, which re-fits the name.
  const { targetRef: tripNameRef, containerRef: tripChipRef } = useShrinkToFit<
    HTMLSpanElement,
    HTMLButtonElement
  >(trip.name, TRIP_NAME_FIT);
  // The receiving end of the trip handoff (ADR-0140 §7): when this shell was reached by
  // picking the trip out of the all-trips list, its glyph is already in the air, and the
  // chip's own copy stays hidden until it lands. The chip is smaller than the pill it
  // replaced, which changes nothing here — the landing rect is MEASURED off this element
  // (`claimTripHandoff`), never written down.
  const handoff = useTripHandoffTarget(trip.id);
  // One stack, led by your own ring: the member cluster and the account avatar were
  // two adjacent near-identical circles doing different things (ADR-0149 §4). It
  // draws `stackCap` circles including you, so the co-members it can show is one
  // fewer — and one fewer again on a narrow phone, where the row is tightest.
  const stackCap = useNarrowScreen() ? PEOPLE_STACK_CAP.NARROW : PEOPLE_STACK_CAP.WIDE;
  const { visible: visibleMembers, overflow: overflowMembers } = memberCluster(
    users,
    me?.user.id,
    stackCap - 1,
  );
  // `navigator.onLine` (T-013) misses cases like a hard reload where the boot
  // fetch itself fails but the browser's online flag never flips (some
  // environments' 'offline' event is unreliable) — usingCachedSnapshot (T-058)
  // is a direct signal from that fetch actually failing, so OR the two.
  const offline = useIsOffline() || usingCachedSnapshot;
  // Pending change *groups*, so one user action (a booking + the places backing
  // its route) reads as one change, not three (ADR-0092). The flush loop below
  // keeps the true op total via useOutboxCount.
  const pendingCount = usePendingChangeCount();
  const syncFailures = useSyncFailures();
  const [syncReviewOpen, setSyncReviewOpen] = useState(false);
  const dates = tripDates(trip.startDate, trip.endDate);
  const total = dates.length;
  const dayNumber =
    Math.round((Date.parse(activeDate) - Date.parse(trip.startDate)) / MS_PER_DAY) + 1;
  let prevDate: string | undefined;
  const days = dates.map((date) => {
    const monthLabel = monthLabelFor(date, prevDate);
    prevDate = date;
    return {
      date,
      dayOfMonth: date.slice(8),
      letter: weekdayLetter(date),
      monthLabel: monthLabel ?? undefined,
      hasEvents: datesWithEvents.has(date),
    };
  });
  // Trip mode anchors amber to TODAY (the live day), not to the selection
  // (ADR-0043 / ADR-0028): selecting a past day is a neutral highlight, a future
  // day violet (plan-ahead), and today keeps its amber dot wherever you browse —
  // so "where's now?" is always answerable from the chrome. Plan mode has no
  // "now", so it keeps its own violet-selection + empty-day grammar unchanged.
  // The pill-state logic itself now lives in the DayStrip domain component.
  // "Today" rolls at the midnight of the day you're in (ADR-0107 §4 + the
  // session-102 amendment) — the same answer in BOTH modes. What time it is is a
  // fact about the trip and the clock, not about which surface you're looking at:
  // switching to Plan mode to do some building must not change "now".
  const today = liveToday(now.getTime(), zoneEvidence);
  // The anchor slot's two states (ADR-0149 §5, replacing ADR-0029/0043's ribbon):
  // on today it reads the trip's progress, off it becomes the way back. Only in
  // Trip mode — Plan mode has no "now" to return to.
  const offToday = mode === 'trip' && activeDate !== today;
  // Offline and pending resolve by themselves, so they stay a passive mark on the
  // glyph (an exception indicator, silent when synced — ADR-0092). `failed` is the
  // one sync state a person can act on and ADR-0080 requires a path to the
  // dead-letter sheet that never clears, so it gets a real control instead: the
  // chip navigates away, which means the badge cannot be that path.
  const passiveSync = offline ? 'offline' : pendingCount > 0 ? 'pending' : null;
  return (
    <header className="header mode-chrome" data-mode={mode}>
      <div className="hdr-top">
        <button
          ref={tripChipRef}
          className="hdr-trip"
          onClick={onOpenSwitcher}
          aria-label={t.shell.switcher.title}
        >
          <span className="trip-glyph">
            <span
              ref={handoff.ref}
              className={'trip-icon' + (handoff.landing ? ' is-handoff' : '')}
              aria-hidden="true"
            >
              {trip.icon ?? DEFAULT_TRIP_ICON}
            </span>
            {passiveSync && (
              <span className="hdr-sync-badge" data-state={passiveSync} aria-hidden="true">
                <Icon name={passiveSync === 'offline' ? 'offline' : 'sync'} />
              </span>
            )}
          </span>
          <span ref={tripNameRef} className="trip-name">
            {trip.name}
          </span>
          {/* The switch mark: "there are others like this one", and the action is
              LATERAL — where a back arrow would say this screen sits underneath
              something, which ADR-0033's landing rule contradicts (a live trip opens
              directly). Visible without a tap, which is the whole point: discovery
              cannot be fixed by something you must tap to discover. Absent at one
              trip (ADR-0045 / ADR-0109 §6: no source, no control).
              It carries this alone since the deck cue was withdrawn — see §2's
              2026-08-03 amendment. */}
          {otherTripCount > 0 && (
            <span className="hdr-swap" aria-hidden="true">
              <Icon name="swap" />
            </span>
          )}
        </button>
        {/* ADR-0080's persistent affordance, in its new position: a `--miss` control
            that appears only when a write was rejected, and never clears on a timer
            or a tap-to-dismiss. `--miss` because it is a status asking for action —
            the one thing in this bar allowed a semantic hue of its own. */}
        {syncFailures.length > 0 && (
          <button
            type="button"
            className="hdr-syncfail"
            onClick={() => setSyncReviewOpen(true)}
            aria-label={t.sync.summary(syncFailures.length)}
          >
            <Icon name="warn" />
          </button>
        )}
        <button className="gear-btn" onClick={onOpenSettings} aria-label={t.shell.stub.settings}>
          <Icon name="settings" />
        </button>
        <button
          className="hdr-people"
          onClick={onOpenPeople}
          aria-label={t.settings.rosterOpen(users.length)}
        >
          <span className="avatars">
            {overflowMembers.length > 0 && (
              /* `ltrIsolate` so the sign stays in front of the digits — bare
                 `+{n}` rendered as `n+` in the RTL chrome (ADR-0118 / §10). */
              <span className="av more">{ltrIsolate(`+${overflowMembers.length}`)}</span>
            )}
            {visibleMembers.map((u) => (
              <Avatar key={u.id} person={u} size="inherit" className="av" />
            ))}
            {me && <Avatar person={me.user} size="inherit" className="av is-me" />}
          </span>
        </button>
      </div>
      {/* Connectivity / sync status stays a polite live region with exactly the
          strings it had (F-10) — what moved is what gets PAINTED, not what gets
          announced. It is visually hidden because the paint is now the badge on the
          glyph and the `--miss` control above, neither of which can be in flow: in
          flow is what made these push the body every time the network dropped. */}
      <div role="status" aria-live="polite" className="visually-hidden">
        {offline && <div>{t.header.offlineNow}</div>}
        {pendingCount > 0 && <div>{t.header.pendingSync(pendingCount)}</div>}
        {syncFailures.length > 0 && <div>{t.sync.summary(syncFailures.length)}</div>}
      </div>
      {syncReviewOpen && <SyncReviewSheet onClose={() => setSyncReviewOpen(false)} />}
      <div className="hdr-days">
        {/* Identity follows the condense into the day row (ADR-0149 §7): the glyph
            and its badge slide in from the leading edge, so what the chrome says
            about WHERE YOU ARE never disappears — an exception indicator that goes
            quiet when the header collapses is worse than none, because quiet
            already means "everything saved". Hidden with `visibility`, not just a
            zero width, so a control nobody can see is also out of the tab order. */}
        <button
          className="hdr-minitrip"
          onClick={onOpenSwitcher}
          aria-label={t.shell.switcher.title}
        >
          <span className="trip-glyph">
            <span aria-hidden="true">{trip.icon ?? DEFAULT_TRIP_ICON}</span>
            {passiveSync && (
              <span className="hdr-sync-badge" data-state={passiveSync} aria-hidden="true">
                <Icon name={passiveSync === 'offline' ? 'offline' : 'sync'} />
              </span>
            )}
          </span>
        </button>
        {/* The anchor slot — ONE fixed-width box with two states cross-faded in
            place, where a 42px ribbon used to appear and disappear underneath the
            strip. Both states are rendered so the box never resizes; only the
            leaving one is inert. Off today it is a control, on today it is not,
            which is why the tag switches with it rather than a disabled button. */}
        {offToday ? (
          <button
            className="hdr-anchor is-back"
            onClick={() => onSelectDay(today)}
            aria-label={t.header.backToToday}
          >
            <span className="anchor-progress" aria-hidden="true" data-off>
              <span className="cap">{t.header.dayCap}</span>
              <span className="num">{ltrIsolate(t.header.dayProgress(dayNumber, total))}</span>
            </span>
            <span className="anchor-back">
              <NavArrow variant="back" />
              {t.header.todayShort}
            </span>
          </button>
        ) : (
          /* Not a control on today, and not labelled as one: `יום` over `3/10` is
             what it says, and that reads correctly on its own. */
          <div className="hdr-anchor">
            <span className="anchor-progress">
              <span className="cap">{t.header.dayCap}</span>
              <span className="num">{ltrIsolate(t.header.dayProgress(dayNumber, total))}</span>
            </span>
            <span className="anchor-back" aria-hidden="true" data-off>
              <NavArrow variant="back" />
              {t.header.todayShort}
            </span>
          </div>
        )}
        <div className="hdr-strip-wrap">
          <DayStrip
            days={days}
            selected={activeDate}
            today={today}
            mode={mode}
            onSelect={onSelectDay}
            unscoped={unscoped}
            dragging={dragging}
            overDate={overDate}
          />
        </div>
        <ModeToggle />
      </div>
    </header>
  );
}

// Tabs re-emphasize by mode (ADR-0016), not duplicate screens. Home and
// Day-by-day are built for both modes now (Trip = departure board / follow +
// adjust; Plan = prep dashboard / itinerary builder); Index is mode-agnostic
// (ADR-0049). Map is unbuilt (T-002), so it falls back to Placeholder.
function Screen({ tab, onNavigate }: { tab: TabId; onNavigate: (tab: TabId) => void }) {
  const { mode } = useMode();
  if (tab === 'home')
    return mode === 'trip' ? (
      <Home onNavigate={onNavigate} />
    ) : (
      <PlanHome onNavigate={onNavigate} />
    );
  if (tab === 'days') return mode === 'trip' ? <DayView /> : <PlanDay />;
  // Index content is mode-agnostic (ADR-0049 — mode tints chrome only).
  if (tab === 'index') return <Index />;
  if (tab === 'map') return <MapView />;
  return <Placeholder tab={tab} mode={mode} />;
}

// data-mode on the shell root lets CSS follow the mode identity rule
// (design-language mode identity: plan mode never uses amber) without every
// component reading mode state. Needs its own component because App renders
// ModeProvider itself and so can't call useMode.
function Shell({ otherTripCount }: { otherTripCount: number }) {
  // Tab lives in the URL (?tab=), Home-anchored, so back peels it (ADR-0035).
  const { tab, goToTab } = useTripTab();
  const { allDays, chromeReclaimed: mapWantsChrome } = useMapScope();
  // The shell reads the drag only to hold the chrome still for its duration; the
  // strip reads it again for its own drop targets.
  const { dragging } = useDragState();
  const [rosterOpen, setRosterOpen] = useState(false);
  // The roster's own data. The header already renders the cluster from `users`; the
  // sheet needs the memberships too, for each person's role and joined date.
  const { members, users } = useTrip();
  const { me } = useAuth();
  useMarkInsideTrip();
  // Give Android's OS back an in-app entry to traverse into (ADR-0090) so a cold
  // launch straight into the trip can't let a system-back slip out of the app.
  useTripBackGuard();
  const { mode } = useMode();
  const { trip, tripDeleted, usingCachedSnapshot } = useTrip();
  const navigate = useNavigate();
  const closeAllOverlays = useCloseAllOverlays();
  // Same two signals the tabs themselves read (T-013/T-058): `navigator.onLine`
  // misses a failed boot fetch, so OR it with the cached-snapshot flag.
  const offlineNow = useIsOffline() || usingCachedSnapshot;
  // A remote admin deleting the trip while we're inside it (ADR-0039): leave to
  // the all-trips list rather than sitting on a trip that no longer exists.
  useEffect(() => {
    if (tripDeleted) navigate('/trips', { replace: true });
  }, [tripDeleted, navigate]);
  // Selecting a day shows it in the day view. `setActiveDate` is the single
  // choke point (state/trip-state): it writes the one source of truth (`?day=`)
  // and lands on the `days` tab in one navigation, so Home — reached without a
  // `?day=` — always derives to today with no reset effect (ADR-0035 §4).
  // `useSelectDay` wraps it so the tap also states the INTENT the date alone can't
  // carry — a day was chosen, so the Map leaves `כל הימים` even when that day is
  // already the active one (ADR-0110 §4).
  const onSelectDay = useSelectDay();

  // Reopen-after-idle (ADR-0060): when the app returns to the foreground after a
  // long idle stretch (≥ RESET_TO_HOME_AFTER_HIDDEN_MS) in Trip mode, reset to a
  // clean Home — close any open sheet and go to the Home base. Home carries no
  // `?day=`, so landing there is already today (no separate day-snap needed).
  // Distinct from trip-state's ~30s data-resync (that refreshes data; this resets
  // the view); both listen independently. Refs keep the listener bound once.
  const modeRef = useRef(mode);
  modeRef.current = mode;
  useEffect(() => {
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = getNow();
        return;
      }
      const awayMs = hiddenAt === 0 ? 0 : getNow() - hiddenAt;
      hiddenAt = 0;
      if (!shouldResetToHomeOnResume(awayMs, modeRef.current)) return;
      closeAllOverlays();
      navigate('/', { replace: true });
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [navigate, closeAllOverlays]);
  // Mode-switch transition (design-language: Motion). data-switching arms the
  // chrome transition, direction-scoped: Plan→Trip (going live) is the cinematic
  // beat, Trip→Plan (stand-down) the quieter return. It MUST land in the same
  // commit as the new data-mode — arming it a paint later (e.g. from a useEffect)
  // lets the browser repaint the new colors before the transition exists, so the
  // animation is intermittently skipped. So derive it during render (set-state-in-
  // render) rather than post-paint. Not armed on first mount; reduced-motion still
  // flips instantly (the CSS is inert under it).
  const [prevMode, setPrevMode] = useState(mode);
  const [switching, setSwitching] = useState<'to-trip' | 'to-plan' | null>(null);
  if (mode !== prevMode) {
    setPrevMode(mode);
    setSwitching(mode === 'trip' ? 'to-trip' : 'to-plan');
  }
  // Disarm once the animation has settled. The duration is read from the CSS
  // token (not hardcoded) so JS and CSS can't drift — changing --t-cinematic in
  // tokens.css can't leave this clearing the class mid-animation (which would
  // snap the chrome). Keyed on `switching` so a new switch (or a quick
  // back-and-forth) restarts the timer instead of stacking.
  useEffect(() => {
    if (!switching) return;
    const token = switching === 'to-trip' ? '--t-cinematic' : '--t-deliberate';
    const id = setTimeout(() => setSwitching(null), readDurationMs(token) + SWITCH_TAIL_MS);
    return () => clearTimeout(id);
  }, [switching]);
  // The frame composes AppShell (ui/layout): header + scrollable body + bottom
  // nav under one persistent chrome, so a body-only state (skeleton/error) can
  // render without unmounting header or nav (U-10). Mode/switching pass through
  // to `data-mode`/`data-switching`, so every existing `.app[...]` CSS selector
  // still applies; `bodyKey={tab}` keeps the per-tab remount + fade.
  // The rendered Map tab owns its own layout instead of scrolling inside the body
  // (ADR-0121 §5): its split needs a fixed-height flex column, and the body's tail
  // padding would push the sheet under the nav. Only when a map is actually there —
  // offline (or without the build config) the tab is the ordinary scrolling list it
  // has always been, so it keeps the ordinary body.
  const fullBleed = tab === 'map' && mapPaneAvailable({ offline: offlineNow });
  // THE CHROME RECLAIM (ADR-0132 §2). While a surface on the Map tab wants the room, the
  // header and the tab bar come off screen: on a layout viewport that RESIZES for the
  // keyboard (Android) the split is the only flexible region, so it absorbs the whole loss —
  // 43px of canvas at 390×844, and at 360×640 a pane too short to lay out Google's
  // attribution at all (ADR-0106 §B). Gated on the tab for the same reason `fullBleed` is:
  // the state lives above the shell so the header can read it, and only this tab spends it.
  //
  // **Two surfaces want it and there is still one condition here**, because the Map derives
  // it from both of its own states and pushes one boolean (ADR-0148). A `queryOpen ||
  // formOpen` at this line would be the second parallel copy of that composition, in the one
  // place that must not know which surface is asking.
  const chromeReclaimed = tab === 'map' && mapWantsChrome;
  // …and THE CONDENSE AS A RESTING STATE (ADR-0149 §7), which is the same shape one
  // step down: the rendered Map opens with row 1 already lifted out. Derived from
  // `fullBleed` rather than from the tab, because that is the actual reason — a body
  // that owns its own layout never scrolls, so the scroll trigger cannot reach the
  // one surface whose scarce axis is height. The list-only Map (offline, or with no
  // build config) is an ordinary scrolling body and condenses the ordinary way.
  const chromeCondensed = fullBleed;

  return (
    <AppShell
      mode={mode}
      switching={switching ?? undefined}
      bodyKey={tab}
      bodyClassName={fullBleed ? BODY_FULLBLEED : undefined}
      chrome={chromeReclaimed ? CHROME_RECLAIMED : chromeCondensed ? CHROME_CONDENSED : undefined}
      // A drag auto-scrolls the body at the edge bands (ADR-0116), and a header
      // collapsing mid-gesture would move every row, day pill and drop target 52px
      // out from under the finger. So the chrome holds where the drag found it.
      holdChrome={dragging}
      header={
        <Header
          onSelectDay={onSelectDay}
          onOpenSwitcher={() => navigate('/trips')}
          onOpenPeople={() => setRosterOpen(true)}
          onOpenSettings={() => navigate(`/trip/${trip.id}/settings`)}
          allDays={allDays}
          otherTripCount={otherTripCount}
        />
      }
      overlay={
        rosterOpen && (
          <RosterSheet
            members={members}
            users={users}
            myUserId={me?.user.id}
            onOpenAccount={() => {
              setRosterOpen(false);
              navigate(settingsPath(SETTINGS_FROM.HOME));
            }}
            onClose={() => setRosterOpen(false)}
          />
        )
      }
      nav={
        <nav className="nav">
          {TABS.map((tabDef) => (
            <button
              key={tabDef.id}
              className={tabDef.id === tab ? 'on' : ''}
              onClick={() => goToTab(tabDef.id)}
              aria-current={tabDef.id === tab}
            >
              <span className="ic" aria-hidden="true">
                <Icon name={tabDef.icon} />
              </span>
              {t.tabs[tabDef.id]}
            </button>
          ))}
        </nav>
      }
    >
      {/* Own Suspense boundary, not the outer AppRoutes one (ADR-0105): the
          header/nav slots above are already mounted, so a lazy tab's chunk
          fetch (Plan Home / Day-by-day / Index) stays chrome-preserving —
          BootScreen's full-bleed board would otherwise cover them regardless
          of nesting (it's sized to the viewport, not its container). Home tab
          shape-matches with HomeSkeleton like the snapshot loader; the other
          tabs fall back to the generic cue. */}
      <Suspense
        fallback={
          tab === 'home' ? (
            <LoadingState skeleton={<HomeSkeleton mode={mode} />} />
          ) : (
            <LoadingState />
          )
        }
      >
        <Screen tab={tab} onNavigate={goToTab} />
      </Suspense>
    </AppShell>
  );
}

// The two shell surfaces whose avatar opens your settings. Each is its own tiny
// component only because `useNavigate` is a hook — they replace the account-sheet
// wrappers that used to hold sheet state (ADR-0133 §1).
function ZeroStateRoute() {
  const navigate = useNavigate();
  return <ZeroState onOpenAccount={() => navigate(settingsPath(SETTINGS_FROM.HOME))} />;
}

function AllTripsRoute() {
  const navigate = useNavigate();
  return <AllTrips onOpenAccount={() => navigate(settingsPath(SETTINGS_FROM.TRIPS))} />;
}

// Settings is a full-page route outside the mode Shell (ADR-0039: mode-neutral),
// but it still needs the trip context for its trip/roster state + settings verbs.
function TripSettingsRoute() {
  const { id } = useParams();
  if (!id) return <Navigate to="/" replace />;
  return (
    <TripProvider tripId={id}>
      {/* Own Suspense boundary: TripSettings is lazy-loaded, and this route is
          reached from inside a trip — the outer AppRoutes Suspense's BootScreen
          fallback would otherwise flash the full-screen boot surface over an
          ordinary in-app navigation. */}
      <Suspense fallback={<LoadingState />}>
        <TripSettings />
      </Suspense>
    </TripProvider>
  );
}

function RootSurface() {
  const [trips, setTrips] = useState<Trip[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    // Offline-aware (sync-and-offline.md "Read"): falls back to the cached trip
    // list when the fetch fails, so a cold reopen with no network resolves the
    // active trip instead of collapsing to ZeroState.
    loadTripList().then(({ trips: list }) => {
      if (!cancelled) setTrips(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const { tripId: storedTripId, pickedThisSession } = useActiveTripId();
  const now = useClock();

  if (trips === null) return <BootScreen />;
  if (trips.length === 0) return <ZeroStateRoute />;

  const landing = resolveLanding(trips, storedTripId, pickedThisSession, now);
  if ('redirect' in landing) return <Navigate to={landing.redirect} replace />;

  // Already-resolved trip dates (ADR-0105): lets the snapshot skeleton pick
  // its mode shape immediately instead of guessing while the boot fetch runs.
  const knownTrip = trips.find((tr) => tr.id === landing.tripId) ?? null;

  return (
    <TripProvider tripId={landing.tripId} knownTrip={knownTrip}>
      <ModeProvider>
        <MapScopeProvider>
          <DragProvider>
            {/* The deck cue's source (ADR-0149 §2). It comes from the list this
                surface already loaded — offline-aware, and one fetch rather than a
                second one inside the header. */}
            <Shell otherTripCount={trips.length - 1} />
          </DragProvider>
        </MapScopeProvider>
      </ModeProvider>
    </TripProvider>
  );
}

// Layout route (ADR-0024): one shared guard via <Outlet/> instead of
// per-route wrapping. Intent is resumed here, not right after login, since
// OAuth's redirect always lands on "/", never the saved deep link.
//
// /join/:token is exempt from the anon-redirect (T-042, app-shell.md §4):
// its preview is a public endpoint and must render before any auth check —
// the screen's own "Continue with Google" CTA is what saves the intent and
// starts sign-in, not this eager gate.
export function AuthGate() {
  const { status } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isJoinRoute = location.pathname.startsWith('/join/');
  // Whether a saved deep-link intent is still waiting to be resolved. Kept in
  // React state (not a bare hasIntent() read at render time) so that *consuming*
  // an intent always triggers a re-render that lifts this gate — even when the
  // intent equals the current path and the effect therefore neither navigates
  // nor changes any other state (the logout-from-"/" → login-back-to-"/" case).
  // A non-reactive sessionStorage read here left the app frozen on the boot
  // screen after logout+login until the tab was closed.
  const [intentPending, setIntentPending] = useState(hasIntent);

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'anon') {
      if (location.pathname !== '/login' && !isJoinRoute) {
        saveIntent(location.pathname);
        setIntentPending(true);
        navigate('/login', { replace: true });
      }
      return;
    }
    const intent = consumeIntent();
    if (intent && intent !== location.pathname) {
      navigate(intent, { replace: true });
    } else if (location.pathname === '/login') {
      navigate('/', { replace: true });
    }
    setIntentPending(false);
  }, [status, location.pathname, navigate, isJoinRoute]);

  if (status === 'loading') return <BootScreen />;
  if (status === 'anon') {
    return location.pathname === '/login' || isJoinRoute ? <Outlet /> : <BootScreen />;
  }
  // A pending deep-link intent (e.g. mid-join after OAuth's redirect to "/")
  // must not let RootSurface mount even for one render — its fetchTrips()
  // would see zero memberships (the join hasn't run yet) and flash ZeroState
  // before the effect above navigates to the real intent path.
  if (location.pathname === '/login' || intentPending) return <BootScreen />;
  return <Outlet />;
}

function AppRoutes() {
  // The shell's route transition (ADR-0140). Every full-screen `.app` surface —
  // /login, the zero state, /new, the born screen, /join, /trips, both settings
  // screens — used to hard-cut, because `.body`'s fade only covers in-trip TAB
  // content. Tapping `טיול חדש` into an instant motionless swap was most of why the
  // first run read as flat.
  //
  // Keyed on `pathname`, deliberately not on the whole location: a query-only change
  // is an in-trip tab switch, which already has `.body`'s fade and must not get a
  // second animation on top of it. So the same key that replays the animation is
  // also what scopes it to shell navigation — no route list to keep in sync.
  const location = useLocation();
  // Suspense boundary for the lazily-loaded route screens (F-07). The fallback is
  // the same boot screen the gate already uses, so a chunk fetch reads as booting.
  return (
    <Suspense fallback={<BootScreen />}>
      <RouteShell key={location.pathname} arrivedAs={navDirectionFrom(location.state)}>
        <Routes>
          <Route element={<AuthGate />}>
            <Route path="login" element={<Login />} />
            <Route path="trips" element={<AllTripsRoute />} />
            <Route path="new" element={<CreateTrip />} />
            <Route path="join/:token" element={<JoinTrip />} />
            <Route path="trip/:id/settings" element={<TripSettingsRoute />} />
            {/* Your own settings + its picture page (ADR-0133). User-scoped, so
              deliberately NOT nested under a trip — the thing they edit is you, and
              they must be reachable with no trip at all. */}
            <Route path="settings" element={<UserSettings />} />
            <Route path="settings/picture" element={<UserPicture />} />
            <Route path="*" element={<RootSurface />} />
          </Route>
        </Routes>
      </RouteShell>
    </Suspense>
  );
}

/** The keyed wrapper the route transition plays on, and the reason it LATCHES its
 *  direction (session 192).
 *
 *  How you arrived is a fact about the arrival, so it is captured once, at mount. Read
 *  live it is a fact about the most recent `navigate` — and the trip's back guard pushes
 *  a **same-URL** entry a beat after you enter a trip (ADR-0103), with no state and
 *  therefore reading as forward. Same pathname means the same key, so nothing remounts;
 *  but `data-nav` flipping is enough to start a *second* animation, and the shell slid
 *  28px into a screen that had already arrived.
 *
 *  Invisible while every arrival was `forward` (the attribute never changed value), and
 *  immediate once the handoff gave arrivals a second manner — which is why it surfaced
 *  now and not when the transition shipped. */
function RouteShell({ arrivedAs, children }: { arrivedAs: NavDir; children: ReactNode }) {
  const [dir] = useState(arrivedAs);
  return (
    <div className="route-shell" data-nav={dir}>
      {children}
    </div>
  );
}

// Device-wide outbox flush (ADR-0042): a write queued offline must sync the
// moment connectivity returns — even from the all-trips list or zero-state,
// where no trip's realtime effect is mounted to flush its queue. Flushes every
// trip's queue on `online`, on window `focus`, and once on mount (to drain a
// queue left over from a prior offline session). Only while authed — a flush
// needs the session. The mounted trip still runs its own reconnect (flush +
// catch-up + resubscribe); flushOutbox coalesces so the two never double-POST.
function OutboxAutoFlush() {
  const { status } = useAuth();
  const pending = useOutboxCount();
  useEffect(() => {
    if (status !== 'authed') return;
    const flush = () => void flushAllOutbox();
    if (!isOffline()) flush();
    // `focus` covers the case `online` misses: a write queued on a transient
    // network blip while navigator.onLine never flipped fires no `online` event,
    // so nothing would otherwise re-drive the flush.
    window.addEventListener('online', flush);
    window.addEventListener('focus', flush);
    return () => {
      window.removeEventListener('online', flush);
      window.removeEventListener('focus', flush);
    };
  }, [status]);

  // Safety net: while anything is queued, retry on a gentle interval until it
  // drains, so the "N changes waiting" summary can never wedge on forever when no
  // connectivity transition arrives to trigger a flush. Gated on pending > 0 so
  // it's inert on the happy path.
  useEffect(() => {
    if (status !== 'authed' || pending === 0) return;
    const id = window.setInterval(() => {
      if (!isOffline()) void flushAllOutbox();
    }, OUTBOX_RETRY_MS);
    return () => window.clearInterval(id);
  }, [status, pending]);

  return null;
}

export function App() {
  return (
    <AuthProvider>
      <ActiveTripIdProvider>
        <ToastProvider>
          <NavProvider>
            <ConfirmProvider>
              <OutboxAutoFlush />
              <AppRoutes />
              {/* Also outside AppRoutes, and for the same shape of reason: a service
                  worker swapping the build under an open tab is not a fact about the
                  screen you happen to be on (ADR-0181). AppShell frames only the
                  in-trip surfaces, so the notice mounts at the root instead. */}
              <AppUpdateNotice />
              {/* Outside AppRoutes on purpose: the glyph a trip pick puts in the air has
                  to outlive both the list it came from and the boot screen that follows
                  it (ADR-0140 §7). */}
              <TripHandoffLayer />
              {import.meta.env.DEV && <DevTimeTravel />}
              {/* Nav-debug HUD, gated behind VITE_NAV_DEBUG (inert in production). */}
              <NavDebugHud />
            </ConfirmProvider>
          </NavProvider>
        </ToastProvider>
      </ActiveTripIdProvider>
    </AuthProvider>
  );
}

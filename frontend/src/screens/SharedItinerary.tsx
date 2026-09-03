import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import {
  NARRATIVE_SEPARATOR,
  ROUTE_ARROW,
  SHARE_DAY_KIND,
  SHARE_DAY_SUMMARY_KIND,
  SHARE_DETAIL_LEVEL,
  SHARE_OP_KIND,
  shareTimeLabel,
  shareToday,
  TIME_MEANING,
  type ShareOpKind,
  type SharedDay,
  type SharedDaySummary,
  type SharedDayTitle,
  type SharedEvent,
  type SharedOp,
  type SharedTime,
  type SharedItinerary as SharedItineraryProjection,
} from '@waypoint/shared';
import {
  BOOKING_TYPE_MARK,
  DOWNLOAD_SETTLE_MS,
  GLYPH,
  SHARE_LOAD_RETRY_MS,
  SHARE_RELOAD_COOLDOWN_MS,
} from '../constants';
import { Icon, type IconName } from '../ui/Icon';
import { NoteProse } from '../ui/NoteProse';
import { Spinner } from '../ui/Spinner';
import { ZoneShiftPill } from '../ui/ZoneShiftPill';
import { t } from '../i18n/he';
import { autoIsolate, ltrIsolate } from '../lib/bidi';
import { agoLabel, hoursPhrase } from '../lib/duration';
import { landAtTop } from '../lib/land-at-top';
import { shareNowLine } from '../lib/share-now-line';
import { NowMarker } from '../ui/domain/NowMarker';
import { useClock } from '../lib/useClock';
import { usePublicReaderChrome } from '../lib/public-reader-chrome';
import { DAY_PHASE, dayPhase, formatTripDates, tripDayNumber, type DayPhase } from '../lib/time';
import brandMark from '/icon-mark-bright.svg';
import { RELOAD_GUARD_KEY, reloadOnce } from '../lib/guarded-reload';
import { takeParkedBuild } from '../lib/useAppUpdate';
import {
  fetchSharedItinerary,
  SHARE_LOAD_FAILURE,
  shareLoadFailure,
  sharedDocumentUrl,
  sharedItineraryPdfUrl,
  type ShareLoadFailure,
} from '../lib/share-itinerary';
import { shareFileOrDownload } from '../lib/system-share';
import './shared-itinerary.css';

const WEEKDAY = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'] as const;

/** `YYYY-MM-DD` split without a `Date`, so a browser in any zone reads the same day the
 *  server named — parsing it as a date would shift the label across the date line. */
function dayParts(date: string): { day: string; weekday: string } {
  const [year, month, day] = date.split('-').map(Number);
  return {
    day: String(day).padStart(2, '0'),
    weekday: WEEKDAY[new Date(Date.UTC(year, month - 1, day)).getUTCDay()],
  };
}

/**
 * **The derived headline, said in words** (ADR-0213's 2026-08-30 amendment).
 *
 * The projection ships `{ kind, …values }` rather than a composed line, so the words are
 * this renderer's and the PDF's own — one derivation, two locales' worth of copy. Values are
 * isolated one at a time here (`autoIsolate`), which leaves the sentence around them in the
 * page's RTL flow; the element must therefore NOT carry `dir="auto"`, which skips isolates
 * when it sniffs and would fall back to LTR on a fully isolated line.
 *
 * Empty for `NONE`: a day with nothing in it has no true title, and the caller falls back to
 * its date rather than inventing one.
 */
function dayTitleText(title: SharedDayTitle): string {
  switch (title.kind) {
    case SHARE_DAY_KIND.FLIGHT_OUT:
      return t.share.public.dayTitle.flightOut(autoIsolate(title.to));
    case SHARE_DAY_KIND.FLIGHT_HOME:
      return t.share.public.dayTitle.flightHome;
    case SHARE_DAY_KIND.FLIGHT:
      return t.share.public.dayTitle.flight(autoIsolate(title.to));
    case SHARE_DAY_KIND.ROUTE:
      return `${autoIsolate(title.from)}${ROUTE_ARROW}${autoIsolate(title.to)}`;
    case SHARE_DAY_KIND.PLACE:
      return autoIsolate(title.at);
    case SHARE_DAY_KIND.REGION:
      return autoIsolate(title.at);
    case SHARE_DAY_KIND.KIND:
      return t.share.public.dayTitle.kind(autoIsolate(title.of));
    case SHARE_DAY_KIND.TEXT:
      return title.text;
    case SHARE_DAY_KIND.NONE:
      // A day with no places has no true title, and the server sends none rather than
      // inventing one — the caller falls back to the date.
      return '';
    default:
      // **Exhaustive, and it has to be.** A `default: return ''` swallowed a new kind
      // silently — the two added on 2026-08-30 would have rendered as nothing at all, on a
      // typecheck that passed. `never` makes the next one a compile error here.
      return assertNever(title);
  }
}

/** The compiler's proof that a union was handled. Throwing is unreachable by construction;
 *  it exists so the type error is the one that fires. */
function assertNever(value: never): string {
  void value;
  return '';
}

function daySummaryText(summary: SharedDaySummary): string {
  switch (summary.kind) {
    case SHARE_DAY_SUMMARY_KIND.STAY:
      return t.share.public.daySummary.stay(autoIsolate(summary.place));
    case SHARE_DAY_SUMMARY_KIND.EVENTS:
      return summary.titles.map(autoIsolate).join(NARRATIVE_SEPARATOR);
    case SHARE_DAY_SUMMARY_KIND.TEXT:
      return summary.text;
    default:
      return '';
  }
}

/**
 * **Where the trip is, as the masthead's opening words** (ADR-0213's eleventh amendment §4).
 *
 * Three phases off one comparison — `dayPhase` over the trip's own window, so this and the
 * mark on the day cards can never disagree. The number is isolated (ADR-0118): a digit inside
 * a Hebrew phrase reads backwards without it.
 *
 * `tripDayNumber` rather than an ordinal off the days array: a trip whose first day carries
 * nothing still has a day one, and the phrase counts calendar days of the trip, not cards.
 */
function tripPhaseText(trip: SharedItineraryProjection['trip'], today: string): string {
  const phase = dayPhase(trip.startDate, today, trip.endDate);
  if (phase === DAY_PHASE.PAST) return t.share.public.phase.ended;
  if (phase === DAY_PHASE.FUTURE) {
    const days = tripDayNumber(trip.startDate, today) - 1;
    return t.share.public.phase.soon(days);
  }
  return t.share.public.phase.live(tripDayNumber(today, trip.startDate), trip.dayCount);
}

/**
 * **Three outcomes, because a failed read has three meanings** (ADR-0213's seventeenth
 * amendment). `unavailable` is the terminal one and it is now reserved for the server's own
 * 404: `failed` is "nobody answered, and we have stopped asking", which is what a deploy, a
 * tunnel or the per-IP cap actually produces — and it offers the tap that cures it.
 */
type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; projection: SharedItineraryProjection; stale: boolean }
  | { kind: 'unavailable' }
  | { kind: 'failed' };

/**
 * **The page a stranger sees**, and the only screen in the app written for somebody with no
 * account (ADR-0213).
 *
 * Two decisions from the mockup carry all the way through here. The day is the spine — a
 * card per day, one open at a time, with dayparts as section headings *inside* it and no
 * heading at all where nothing belongs. And the level is never a client concern: this
 * renders whatever the projection carries, so a field that is absent at Summary is absent
 * because the server never sent it, not because a branch here chose to hide it.
 *
 * Nothing it loads is persisted. There is no Dexie write and no cache entry (the response
 * is `no-store`), so a revoked link cannot be read back off a device — which is what makes
 * revocation mean what it says. An already-open page keeps working from React memory when
 * the connection drops; a reload needs the network.
 */
export function SharedItinerary() {
  const { code = '' } = useParams();
  const { hash } = useLocation();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  /**
   * **Which card the reader has opened, as an ORDINAL — and `undefined` means they have not
   * touched it yet** (ADR-0213's eleventh amendment §1).
   *
   * Three states, and an index could express none of them. `undefined` defers to the clock;
   * `null` is a card the reader closed, which outside the trip is also where the page starts,
   * since **no day is a default** — falling back to the first card is the same arbitrary
   * index-pick this replaced, with a rationale bolted on. And an ordinal rather than a
   * position means a refetch that adds or drops a day leaves the reader's own card open
   * instead of silently opening its neighbour.
   */
  const [openDay, setOpenDay] = useState<number | null | undefined>(undefined);
  /** The clock, so the day mark, the now-line and the freshness line stay true while the tab
   *  is open — this page is read for hours by somebody following along. */
  const now = useClock();
  // A document in a browser tab, not the app: it zooms and it pulls to refresh.
  usePublicReaderChrome();

  /**
   * One attempt, which REPORTS what went wrong rather than deciding what to draw. A failed
   * refresh is settled here and nowhere else; a failed FIRST load belongs to the ladder
   * below, because what to do about it depends on which of three things happened.
   */
  const load = useCallback(async (): Promise<ShareLoadFailure | null> => {
    try {
      const projection = await fetchSharedItinerary(code);
      setState({ kind: 'ready', projection, stale: false });
      return null;
    } catch (error) {
      const failure = shareLoadFailure(error);
      setState((previous) =>
        // A failed REFRESH keeps what is on screen and says so. A page that blanks itself
        // because a tunnel ate one request is worse than one that admits it is a minute old.
        previous.kind === 'ready'
          ? { ...previous, stale: true }
          : failure === SHARE_LOAD_FAILURE.GONE
            ? { kind: 'unavailable' }
            : previous,
      );
      return failure;
    }
  }, [code]);

  /** A reader's tap on `נסו שוב`, and the only thing that restarts the ladder. */
  const [asked, setAsked] = useState(0);
  const askAgain = useCallback(() => {
    setState({ kind: 'loading' });
    setAsked((count) => count + 1);
  }, []);

  /**
   * **THE FIRST READ IS RE-ASKED** (ADR-0213's seventeenth amendment).
   *
   * This is the one request in the app whose failure nobody can work around: the reader has
   * no account, no app to reopen and no idea what a rollout is. So the page used to answer
   * every failure with `יכול להיות שהלינק בוטל` — including the eight seconds a deploy takes
   * to swap containers, which is how a live link came to look revoked.
   *
   * Three failures, three cures, and only the first is terminal:
   *
   * - `GONE` — the server's own 404, already drawn by `load`. Asking again is a spin.
   * - `UNREADABLE` — the link is live and this DOCUMENT is older than the projection it
   *   fetched (`share-itinerary.ts`). The same answer parses the same way every time, so the
   *   cure is a newer document: the build already parked by the service worker if there is
   *   one (`takeParkedBuild` reloads through `useAppUpdate`'s own `controllerchange` path),
   *   else one reload, once, on `guarded-reload.ts`'s cooldown.
   * - `TRANSIENT` — nobody answered, or not yet. Re-asked up the ladder, then said plainly.
   */
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const giveUp = () =>
      setState((previous) => (previous.kind === 'ready' ? previous : { kind: 'failed' }));

    const ask = async (round: number) => {
      const failure = await load();
      if (cancelled || failure === null || failure === SHARE_LOAD_FAILURE.GONE) return;
      if (failure === SHARE_LOAD_FAILURE.UNREADABLE) {
        if (await takeParkedBuild()) return;
        if (cancelled) return;
        if (!reloadOnce(RELOAD_GUARD_KEY.share, SHARE_RELOAD_COOLDOWN_MS)) giveUp();
        return;
      }
      if (round >= SHARE_LOAD_RETRY_MS.length) {
        giveUp();
        return;
      }
      timer = setTimeout(() => void ask(round + 1), SHARE_LOAD_RETRY_MS[round]);
    };

    void ask(0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [load, asked]);

  /**
   * **`עודכן עכשיו` was true for about a minute** (eleventh amendment §4). The projection was
   * fetched once and the label was stamped at load, so a relative who leaves the tab open
   * saw a three-hour-old itinerary asserting it was current — the exact opposite of what a
   * live link is for. Refetching when the tab comes back is the cheap half of the fix (the
   * label going elapsed is the other): it costs one request per return to a page whose public
   * route allows twenty a minute, and it is the moment a reader is about to read again.
   *
   * Deliberately not a poll. A tab in the background is not being read, and a tab in the
   * foreground has `pull-to-refresh` (ninth amendment §6) for a reader who wants it now.
   */
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, [load]);

  const ready = state.kind === 'ready' ? state.projection : undefined;
  /**
   * **Today, in the trip's own zone** — never the reader's (§6). A relative in Tel Aviv
   * following a group in Iceland wants the day the group is having, which is the same rule
   * that makes every time on this page the travellers' wall clock rather than the viewer's.
   *
   * `shareToday` rather than `todayInTz`, and opening the real page at 01:48 Tokyo time is
   * what found the difference: this projection files a pre-dawn hour on the night of the day
   * BEFORE (`sharePreviousNight`), so at 01:48 the calendar had rolled over while the share's
   * day had not — the page marked tomorrow as "now" and drew its now-line at the bottom of a
   * day nothing had happened in yet. One boundary for the grouping and for the question.
   */
  const today = ready ? shareToday(now, ready.trip.timezone) : '';
  /** The card the clock is on, or `null` before the trip and after it. */
  const todayOrdinal = ready
    ? (ready.days.find((day) => dayPhase(day.date, today, day.endDate) === DAY_PHASE.TODAY)
        ?.ordinal ?? null)
    : null;
  /**
   * **A `#day-N` in the URL wins.** The anchors have been rendered on every card since the
   * page was built and nothing has linked to them since the seventh amendment stopped the
   * bookings block teleporting — but somebody handed `/s/<code>#day-9` asked for day nine,
   * and the browser's own hash scroll cannot serve them: the card does not exist until the
   * fetch lands. The open card is deliberately NOT written back into the URL; it is a
   * disclosure state, not navigation, and it would pollute a document's back history.
   */
  const hashOrdinal = Number(/^#day-(\d+)$/.exec(hash)?.[1]) || null;
  const landOn = hashOrdinal ?? todayOrdinal;
  /**
   * **Land on now** — `DayView`'s contract, at day altitude (§1):
   *
   * > _"scroll the now-line into view once per day-open (today only), a passed event or two
   * > left peeking above. Keyed on the viewed day — never on the clock tick — so it doesn't
   * > fight a manual scroll. Instant under reduced-motion."_
   *
   * `landAtTop` is that, and it is the reason this is four lines rather than a scroll of its
   * own: it aims `block: 'start'` with the row's own `scroll-margin-block-start` as the peek,
   * goes instant under `prefersReducedMotion`, ends the moment a finger touches the page, and
   * — the part that matters most here — keeps re-aiming while the surface settles. This page
   * settles late twice over: the card does not exist until the fetch resolves, and every day
   * photo is `loading="lazy"` with no intrinsic size, so the extent above the target grows as
   * images arrive. A one-shot `scrollIntoView` would land short of wherever it had got to.
   *
   * Keyed on the CODE, not on `landOn`: the day mark re-derives every tick and rolls over at
   * midnight, and re-landing under a reader who has scrolled away is what "never on the clock
   * tick" forbids.
   */
  const landedFor = useRef<string | null>(null);
  useEffect(() => {
    if (landOn === null || landedFor.current === code) return;
    landedFor.current = code;
    return landAtTop(() => document.getElementById(`day-${landOn}`));
  }, [code, landOn]);

  if (state.kind === 'loading') return <div className="sh-boot">{t.share.public.loading}</div>;
  if (state.kind === 'unavailable') return <Unavailable />;
  if (state.kind === 'failed') return <LoadFailed onRetry={askAgain} />;

  const { projection, stale } = state;
  const summary = projection.detailLevel === SHARE_DETAIL_LEVEL.SUMMARY;
  /** The clock the now-line prints, through the same formatter that built every label on the
   *  page (`shareTimeLabel`, §5) — so the comparison in `shareNowLine` is inside the one
   *  derivation the projection's pre-formatting exists to protect, not beside it. */
  const nowLabel = shareTimeLabel(now, projection.trip.timezone);
  /** Summary carries no times at all, so there is nothing for a clock to sit between. */
  const wantsNowLine = !summary;
  const open = openDay === undefined ? landOn : openDay;
  // The trip's own name, so a reader who saves three itineraries can tell them apart in a
  // downloads folder. Both hosts of `TakePdf` pass the same one.
  const pdfName = `${projection.trip.name}.pdf`;

  return (
    <div className="sh-page">
      <div className="sh-public-bar">
        <span className="sh-brand">
          {/* The app's own mark, not its initial (owner, 2026-08-30). `public/` rather than
              an inline SVG: the same file the favicon and the PWA icon are cut from, so the
              page a stranger lands on cannot drift from the icon in their tab. */}
          <img className="sh-brand-mark" src={brandMark} alt="" width={20} height={20} />
          {t.share.public.brand}
        </span>
        <span className="sh-bar-end">
          <span className={`sh-freshness${stale ? ' stale' : ''}`}>
            <span className="sh-live-dot" aria-hidden="true" />
            {/* **Elapsed, not a claim.** `עודכן עכשיו` was stamped at load and never
                revisited (§4); it is now the app's one elapsed ladder (ADR-0114, through
                `agoLabel`) over the projection's own `generatedAt`, re-read on every clock
                tick — so a tab left open says how old what it shows really is. */}
            {stale
              ? t.share.public.stale
              : t.share.public.updated(agoLabel(projection.generatedAt, now.getTime()))}
          </span>
          {/* **The reader's own copy, where it is always reachable** (ninth amendment §6).
              The masthead is theme-fixed `--indigo`, so this control takes the `--on-dark-*`
              ramp (ADR-0158 §3) — drawn with `--ink` in the mockup it rendered navy on navy.
              Short label here and the full sentence at the foot: the bar has 42px and a
              status line to share it with. */}
          <TakePdf code={code} className="sh-bar-take" short filename={pdfName} />
        </span>
      </div>

      <header className="sh-hero">
        {/* **How the trip moves**, beside where it goes (owner, 2026-08-30). Two trips with
            the same destination and length read completely differently depending on it, and
            the page said nothing — worse, it printed a ROUTE for both, which on a star trip
            describes the commute. The base count is only added where the shape implies
            several; on a star trip `1 בסיס` is the same sentence twice. */}
        <div className="sh-kicker">
          {/* **Where the trip is, in the line that used to assert it was live** (§4).
              `מסלול חי` was a constant, printed identically on a trip that ended six months
              ago; it is the one fact on this line that changes, so it is the one part of it
              that is not dim. */}
          <strong>{tripPhaseText(projection.trip, today)}</strong>
          {NARRATIVE_SEPARATOR}
          {[
            t.share.public.tripShape[projection.trip.shape],
            projection.trip.baseCount > 1
              ? t.share.public.bases(projection.trip.baseCount)
              : undefined,
          ]
            .filter(Boolean)
            .join(NARRATIVE_SEPARATOR)}
          {' · '}
          <span>{autoIsolate(projection.trip.destination)}</span>
        </div>
        <h1 className="sh-title">
          {projection.trip.icon ? (
            <span className="sh-title-mark" aria-hidden="true">
              {projection.trip.icon}
            </span>
          ) : null}
          <span>{projection.trip.name}</span>
        </h1>
        {/* The app's own trip-range shape (`lib/time.ts`), not two raw ISO dates — the
            All Trips card has read `27.08–02.09` since long before this page existed. */}
        <div className="sh-dates">
          {ltrIsolate(formatTripDates(projection.trip.startDate, projection.trip.endDate))}
          {' · '}
          {t.share.public.counts(projection.trip.dayCount, projection.trip.eventCount)}
        </div>
        {/* **Who is going, in the first lines you read** (owner, 2026-08-30: _"the travelers
            shouldn't have a section, they should just appear on top if they're on the
            permission list"_). It was a block at the foot, which is where a fact nobody asked
            for goes; whose trip this is belongs with what the trip is. */}
        {projection.trip.travelers?.length ? (
          <div className="sh-travelers">
            {projection.trip.travelers.map(autoIsolate).join(NARRATIVE_SEPARATOR)}
          </div>
        ) : null}
        {/* **THE ROUTE STRIP IS GONE FROM THE PHONE** (owner, 2026-08-30: _"The amber line is
            meaningless, no one can get any info from just the initials. I say drop it or
            change it entirely."_).

            It was `routeLabels` laid out as a connected strip, and the arithmetic was never
            going to work: `MAX_ROUTE_LABELS` is 8, and eight labels plus their connectors
            inside 390px leaves about 30px each — so every stop ellipsised to an initial and
            the line read `נמל הת… — S. — S. — D. — G.`. A row of first letters is not a
            summary of a route, it is a row of first letters.

            **Deleted here and kept on paper**, which is not an inconsistency: the PDF lays
            the same eight labels across an A4 column and prints them whole. The strip was
            always a width bet, and only one of the two media can afford it (ADR-0213 §3).
            What the phone keeps instead is the line that already said the same thing in
            words — the trip's own route title, one element down. */}
      </header>

      {stale ? <div className="sh-stale">{t.share.public.staleBody}</div> : null}

      {summary ? (
        <div className="sh-story">
          {/* **No `dir="auto"` on a COMPOSED line** — the server already isolated every
              value inside it (`itinerary-narrative.fallback.ts`), and `auto` ignores
              isolated content when it sniffs, so it would find no strong character and fall
              back to LTR. Inheriting the page's RTL is what makes the route arrow mean the
              same thing whether the stops are Hebrew or Latin. */}
          {/* Skipped when it is the trip's own name, which the masthead already carries —
              `fallbackTripTitle` returns `Trip.name` now, so the deterministic case would
              print the headline twice (owner, 2026-08-31). */}
          {projection.narrative.title === projection.trip.name ? null : (
            <strong>{projection.narrative.title}</strong>
          )}
          <p>
            {/* The generated line when there is one; otherwise the counts sentence, which
                the server deliberately does not compose — it ships the numbers. */}
            {projection.narrative.summary ||
              t.share.public.counts(projection.trip.dayCount, projection.trip.eventCount)}
          </p>
        </div>
      ) : null}

      <main className="sh-days">
        <div className="sh-days-head">
          <h2>{summary ? t.share.public.days : t.share.public.schedule}</h2>
          <span>{t.share.public.daysHint}</span>
        </div>
        {projection.days.map((day) => {
          const phase = dayPhase(day.date, today, day.endDate);
          const isNow = phase === DAY_PHASE.TODAY;
          return (
            <DayCard
              key={day.date}
              day={day}
              phase={phase}
              open={open === day.ordinal}
              onToggle={() => setOpenDay(open === day.ordinal ? null : day.ordinal)}
              code={code}
              // The marker only exists where there is a "now" to mark and times for it to sit
              // between — today's card, at Full and above (§5).
              nowLabel={isNow && wantsNowLine ? nowLabel : undefined}
            />
          );
        })}
      </main>

      {/* **Under the days, and it no longer jumps.** It opened the page and every row was an
          anchor, so the one gesture the block invited threw the reader down the document
          (owner, 2026-08-30: _"the הזמנות is at the start … clicking on a booking teleports
          you down which is inconvenient"_). It is a reference — what is booked, and when —
          and a reference belongs after the thing it refers to, stating its day rather than
          scrolling to it. */}
      {projection.commitments.length > 0 ? (
        <Commitments commitments={projection.commitments} code={code} />
      ) : null}

      {projection.appendix ? <Appendix appendix={projection.appendix} code={code} /> : null}

      {/* **And once in full, where a reader who finished has just finished** (§6). Two hosts
          for one action, the same shape ADR-0213 already uses for the owner's share entry:
          the bar is for the reader who came to fetch it, this is for the reader who read to
          the end and now wants to keep it. `.share-outcome` is the owner sheet's own control,
          so this is a second host and not a third button. */}
      <div className="sh-take">
        <TakePdf code={code} className="share-outcome" filename={pdfName} />
      </div>

      <footer className="sh-footer">
        <strong>{t.share.public.inviteTitle}</strong>
        <span>{t.share.public.inviteBody}</span>
        <a href="/">{t.share.public.inviteCta}</a>
      </footer>
    </div>
  );
}

function DayCard({
  day,
  phase,
  open,
  onToggle,
  code,
  nowLabel,
}: {
  day: SharedDay;
  phase: DayPhase;
  open: boolean;
  onToggle: () => void;
  code: string;
  /** The trip's wall clock, present only on the card the trip is on and only where the level
   *  carries times. Absent is the answer for every other card. */
  nowLabel?: string;
}) {
  const { day: dayNumber, weekday: firstWeekday } = dayParts(day.date);
  // A card that swallowed the day a journey flew through says so, rather than showing one
  // date for two (`SharedDay.endDate`) — and that goes for the WEEKDAY as well as the
  // number. `21–22 שני` names a Monday for a card that is also Tuesday (owner,
  // 2026-08-31). Two Hebrew names need no isolate; the digits beside them still do.
  const endParts = day.endDate ? dayParts(day.endDate) : undefined;
  const dayNumbers = endParts ? `${dayNumber}–${endParts.day}` : dayNumber;
  const weekday = endParts ? `${firstWeekday}–${endParts.weekday}` : firstWeekday;
  const isNow = phase === DAY_PHASE.TODAY;
  // Where the marker sits, or nothing — `shareNowLine` refuses a day that crosses a zone and
  // a day with no timed row, and those refusals are its answer rather than a gap (§5).
  const marker = nowLabel ? shareNowLine(day, nowLabel) : null;
  // **The boundary form is what is left when no row holds the moment** (ADR-0217 §4). With an
  // `inside` the mark is nailed to that row instead, and drawing both would be one fact twice.
  const boundary = marker?.inside ? null : marker;
  return (
    <section
      className={`sh-day${open ? ' open' : ''}${isNow ? ' is-now' : ''}${
        phase === DAY_PHASE.PAST ? ' is-past' : ''
      }`}
      id={`day-${day.ordinal}`}
    >
      {/* **A real photo of a real stop, credited** (ADR-0213's 2026-08-30 amendment). Not
          stock and not generated: a Commons file already in the store, already licensed,
          already rendered elsewhere in the app — which is why §3's refusal of "a new media
          dependency" does not reach it. `loading="lazy"` because twelve of these below the
          fold is twelve requests nobody asked for. */}
      {day.photo ? (
        <figure className="sh-shot">
          <img src={day.photo.url} alt={day.photo.of} loading="lazy" decoding="async" />
          <figcaption>
            <strong>{autoIsolate(day.photo.of)}</strong>
            <span>{autoIsolate(day.photo.credit)}</span>
          </figcaption>
        </figure>
      ) : null}
      <button className="sh-day-head" onClick={onToggle} aria-expanded={open} type="button">
        <span className="sh-day-date">
          <strong>{ltrIsolate(dayNumbers)}</strong>
          <span>{weekday}</span>
          {/* **The mark on the exception, in the column the hue is already in** (§2/§3).
              Nothing marks a past day (it is treated, not badged) and nothing marks a future
              one — the future is the page's default, and a chip every card carries repeats
              the date beside it. This is also what makes the landing legible: a reader who
              lands mid-document never sees the masthead. */}
          {isNow ? <i className="sh-now-mark">{t.common.now}</i> : null}
        </span>
        <span className="sh-day-copy">
          {/* A day with no places has no true title, and the server sends none rather than
              inventing one — the date is then the name. */}
          {/* Composed server-side with its values already isolated — see the story line
              above for why this must not sniff. */}
          <strong>{dayTitleText(day.title) || `${weekday} ${ltrIsolate(dayNumbers)}`}</strong>
          {/* **Where you sleep frames the day** (ADR-0213's 2026-08-30 amendment). It used
              to be a row in the afternoon, sorted there by its check-in hour — which on the
              outbound day put it between the two legs of the flight, and printed
              `15:00–11:00` because a stay's span crosses midnight. */}
          {day.stay ? (
            <span className="sh-stay">
              <Icon name="hotel" />
              {t.share.public.stay(autoIsolate(day.stay))}
            </span>
          ) : (
            <span>{daySummaryText(day.summary)}</span>
          )}
          <StayWhen day={day} />
        </span>
        <span className="sh-caret">
          <Icon name="caret" />
        </span>
      </button>
      {open ? (
        <div className="sh-day-body">
          {day.sections.map((section) => (
            <section className="sh-part" key={section.daypart}>
              <header className="sh-part-head">
                <span className="sh-part-mark" aria-hidden="true">
                  {GLYPH.daypart[section.daypart]}
                </span>
                <span>{t.share.dayparts[section.daypart]}</span>
              </header>
              {/* **UNDER the heading, among the rows** — which a render decided (§5's
                  finding). Above the section it landed above `אחר הצהריים` at 14:05, putting
                  a daypart that had already begun on the future side of now. A heading names
                  a span of the day; the marker belongs between the rows it is between. */}
              {boundary?.daypart === section.daypart && boundary.index === 0 && nowLabel ? (
                <NowMarker label={nowLabel} />
              ) : null}
              {section.events.map((event, index) => {
                // **NAILED TO THE ROW THAT HOLDS THE MOMENT** (ADR-0217 §1). The wrapper is
                // safe on this sheet and that was checked rather than assumed: ADR-0217's
                // build log §5 is a transparent wrapper breaking four child combinators it
                // landed inside, and `shared-itinerary.css` has exactly one over anything the
                // mark can wrap — `.sh-event-main > strong` — which is INSIDE the article.
                const held =
                  marker?.inside?.daypart === section.daypart && marker.inside.index === index;
                const row = <EventRow event={event} code={code} now={held} />;
                return (
                  <Fragment key={`${event.title}-${index}`}>
                    {held && nowLabel ? (
                      <NowMarker label={nowLabel} thruFrac={marker.inside!.thruFrac}>
                        {row}
                      </NowMarker>
                    ) : (
                      row
                    )}
                    {boundary?.daypart === section.daypart &&
                    boundary.index === index + 1 &&
                    nowLabel ? (
                      <NowMarker label={nowLabel} />
                    ) : null}
                  </Fragment>
                );
              })}
            </section>
          ))}
        </div>
      ) : null}
    </section>
  );
}

/**
 * **A CLOCK THAT SAYS WHAT IT IS** (ADR-0213's 2026-08-31 amendment §1; owner: _"whenever
 * there's a time range, we should display it. That also includes flexible times like
 * starting from.. Or until..."_).
 *
 * The four arms are `edgeMeaning`'s (ADR-0184), resolved server-side so this page and the A4
 * renderer cannot answer differently — which they already did: paper gated the second end on
 * `event.hard` and this page never did, so a soft two-hour hike printed `10:00–12:00` here
 * and `10:00` there.
 *
 * `מ-` and `עד` are the app's own words for a floor and a deadline (`t.day.fromTime` /
 * `untilTime`); `share.public` keeps its own copy because a stranger never sees the app's
 * dictionary, and the wording is identical because two words for one meaning is how two
 * surfaces begin to disagree.
 *
 * One isolate around the whole run on a range — `09:20–14:05` reads left-to-right whole, and
 * isolating each end would let the RTL flow put the arrival first — and around the CLOCK
 * only where a Hebrew word leads, so the isolate islands the number rather than the phrase.
 */
/**
 * **THE STAY'S TWO MOMENTS, AND WHY THEY GET THEIR OWN LINE** (ADR-0213's 2026-08-31
 * amendment §2).
 *
 * A check-in window is the commonest flexible time this app holds and sharing showed it
 * nowhere: the fourth amendment moved the stay out of the schedule into `day.stay`, a name
 * with no clock, so there was no row for a rule about rows to reach.
 *
 * **The check-out names no place** (owner, 2026-08-31: _"the day titles has gotten a little
 * messy: too many line breaks, questionable ordering of the details"_). It used to, and the
 * card then read future → past → future — tonight's hotel, then the one you left this
 * morning, then tonight's hour — with the past one painted amber, which is a PLACE inside the
 * clock's colour (ADR-0028 rule 4). The place is the card immediately above, and the reader
 * page's accordion collapses day BODIES and never headers, so it is always on screen.
 *
 * **Not appended to the stay's own line, and that is a measurement rather than a taste.**
 * `.sh-day-copy > span` is `nowrap` with an ellipsis, and in RTL the cut falls at the logical
 * end — exactly where a trailing clock sits. A real hotel name measures ⁦275px⁩ of ink in a
 * ⁦206px⁩ box at 360, so the check-in vanished with nothing on screen saying it had been
 * there, which is the worst shape a failure can take. Its own line also holds BOTH moments,
 * which one line cannot: on a transfer day you leave one place and sleep at another.
 *
 * **A MOMENT PER LINE, and the separator is gone** (owner, 2026-09-01, with a photograph:
 * _"it currently reads `Check out <time> · check out` / `<time>` … I think that it should read
 * `Check out <time>` / `Check in <time>`"_). Joined by a `·` the pair is one run that wraps
 * wherever it runs out of box, and at 360 that fell between `צ׳ק-אין` and its own clock — a
 * noun on one line and the time it belongs to on the next, which is worse than either moment
 * being cut. Two blocks wrap at the one place a reader can predict, and the height is
 * identical: this line was already two lines on a transfer day.
 *
 * Each moment is bounded (a noun plus at most a range), so the blocks keep the header's
 * `nowrap`; only the CONTAINER stopped needing permission to wrap, because nothing wraps
 * inside it any more. Measured: ⁦17px⁩ for one moment, ⁦34px⁩ for two, and the header goes
 * ⁦76px⁩ → ⁦95px⁩ either way — the second moment is free, absorbed by the height the date
 * column already takes.
 */
function StayWhen({ day }: { day: SharedDay }) {
  if (!day.checkIn && !day.checkOut) return null;
  return (
    <span className="sh-stay-when">
      {day.checkOut ? (
        <span className="sh-moment">
          {t.share.public.checkOut} <SharedTimeText time={day.checkOut} />
        </span>
      ) : null}
      {day.checkIn ? (
        <span className="sh-moment">
          {t.share.public.checkIn} <SharedTimeText time={day.checkIn} />
        </span>
      ) : null}
    </span>
  );
}

function SharedTimeText({ time }: { time: SharedTime }) {
  // **THE WORD IS NOT MONO, AND THE CLOCK IS** (owner, 2026-08-31, with a photograph of the
  // PDF printing `00:00-\u25a1`). `.sh-time` is `font-family: var(--font-mono)` — JetBrains,
  // which ships no Hebrew by design, since it carries times, codes and money and never prose.
  // A browser papers over that with a per-glyph fallback to whatever Hebrew face the device
  // has; the A4 renderer, whose container holds exactly the faces it inlines, had nothing to
  // fall back to and drew `.notdef` boxes. One defect, and only one of the two media could
  // ever show it — so it is fixed on both rather than only where it was seen.
  //
  // The word is asked for by calling the copy with an EMPTY clock, which is the whole of it:
  // these two entries are a prefix plus a value, and `מ-` binds to its number while `עד`
  // takes a space. Composing here rather than splitting a formatted string keeps that
  // language knowledge in `i18n` where it belongs.
  if (time.meaning === TIME_MEANING.NOT_BEFORE || time.meaning === TIME_MEANING.NOT_AFTER) {
    const say =
      time.meaning === TIME_MEANING.NOT_BEFORE ? t.share.public.timeFrom : t.share.public.timeUntil;
    return (
      <span className="sh-said">
        {say('')}
        <span className="sh-time">{ltrIsolate(time.label)}</span>
      </span>
    );
  }
  const text = ltrIsolate(
    time.endLabel && time.endLabel !== time.label
      ? t.share.public.timeRange(time.label, time.endLabel)
      : time.label,
  );
  return <span className="sh-time">{text}</span>;
}

function EventRow({
  event,
  code,
  now,
}: {
  event: SharedEvent;
  code: string;
  /** This row holds the moment, so it says so (ADR-0217 §1's premise, made true on this
   *  surface — see `shared-itinerary.css` at `.sh-event-now`). */
  now?: boolean;
}) {
  // Summary carries no time, place, address, map link or journey at all, so the compact row
  // is not a different rendering of the same data — it is all the data there is.
  const detailed = event.startLabel !== undefined || event.placeName !== undefined;
  if (!detailed) {
    return (
      <div className="sh-summary-row">
        <span className="sh-mark" aria-hidden="true">
          {event.icon ?? '•'}
        </span>
        <strong>{autoIsolate(event.title)}</strong>
      </div>
    );
  }
  // **The row's own attachments, hoisted so both shapes can host them.** A journey renders
  // as a container (`Trek`) rather than as an event row, and these have to travel with it:
  // the ops fold is where a flight's booking code lives, and leaving it behind the article
  // would have made the container cost the reader their confirmation number.
  const attachments = (
    <>
      {/* **A stop's one-line description, at every level** (owner, 2026-08-30). Clamped to
          two lines: a caption is two lines, and four is a paragraph.
          **Prose sets its own base direction; a value inside a line does not.** `dir="auto"`
          resolves from the first strong character, so English reads left and Hebrew right —
          the same attribute ADR-0213 §8 took OFF the titles, and the difference is what each
          element is: a title lines up with its caption, a description is a paragraph. */}
      {event.caption ? (
        <span className="sh-place-line sh-cap" dir="auto">
          {event.caption}
        </span>
      ) : null}
      {event.mapUrl ? (
        <a className="sh-map-link" href={event.mapUrl} target="_blank" rel="noreferrer noopener">
          <Icon name="map" />
          {t.share.public.map}
        </a>
      ) : null}
      {event.ops?.length ? <Ops ops={event.ops} code={code} /> : null}
    </>
  );

  // A chained journey is a container, not a row (ninth amendment §1).
  if (event.legs?.length) return <Trek event={event}>{attachments}</Trek>;

  return (
    <>
      {event.journey ? (
        <div className="sh-journey">
          {/* The mode is a control-shaped fact, so it gets the app's own icon beside its
              own word — `Icon`'s names ARE the mode keys, which is how `DayJoinRow`
              already draws it. */}
          <Icon name={event.journey.mode} />
          {t.share.public.journey(
            t.travelMode[event.journey.mode],
            event.journey.minutes,
            event.journey.km,
          )}
        </div>
      ) : null}
      <article className={`sh-event${event.hard ? ' hard' : ''}`}>
        <span className="sh-event-glyph" aria-hidden="true">
          {event.icon ?? '•'}
        </span>
        <span className="sh-event-main">
          {/* **`autoIsolate`, NEVER `dir="auto"` on a value block** (found by rendering
              `a-shared-itinerary-is-printed-as-a-story-v3.html` §6). `auto` sets the
              element's BASE DIRECTION, and base direction drives `text-align: start` as
              well as bidi resolution — so a Latin place name lands against the opposite
              edge of the column from its own caption. Measured 212px of separation here
              and 229px on paper, in a 288px column, and on an Iceland trip most stops are
              Latin. FSI resolves direction for the RUN and leaves the block RTL, so the
              alignment is inherited. `lib/bidi.ts`'s docblock covers a composed line
              joining several values, which is why one value alone in a block slipped
              ADR-0118's sweep. */}
          <strong>
            {autoIsolate(event.title)}
            {now ? <span className="sh-event-now">{t.common.now}</span> : null}
          </strong>
          <span className="sh-place-line">
            {/* **The row says what it IS before it says where** (owner, 2026-08-30: _"hotels
                and other derivable stuff texts should be enhanced … and that also includes
                bookings"_). A booking states its type, so a hotel's own name gets `לינה` in
                front of its hour. An event no booking backs is captioned with nothing — a
                guess in this slot is worse than a gap. The words are the app's own
                (`t.index.bookingType`), never a second set for this page. */}
            {event.bookingType ? (
              <>
                <b className="sh-kind">{t.index.bookingType[event.bookingType]}</b>
                {' · '}
              </>
            ) : null}
            {/* **The clock, and what it MEANS** (ADR-0213's 2026-08-31 amendment §1). It
                used to print a range whenever there were two ends, which is right for a
                flight and wrong for a floor: a car hire's `endsAt` is five days later, so
                `10:00–18:00` described a week as an afternoon. `event.time` carries the
                answer `edgeMeaning` gives, and this only spells it. */}
            {event.time ? <SharedTimeText time={event.time} /> : null}
            <TravelFacts event={event} />
            {event.placeName ? (
              <>
                {event.startLabel ? ' · ' : null}
                <span>{autoIsolate(event.placeName)}</span>
              </>
            ) : null}
            {event.address ? (
              <>
                {' · '}
                <span>{autoIsolate(event.address)}</span>
              </>
            ) : null}
          </span>
          {attachments}
        </span>
      </article>
    </>
  );
}

/**
 * **A journey is a container, and the legs are visibly on it** (ADR-0213 ninth amendment §1,
 * drawn in `mockups/a-journey-is-a-flight-plan-v1.html`).
 *
 * The reported defect, twice: a connecting flight read as three flights. The cause was not
 * duplicated numbers — the eighth amendment tried that and removed the legs' own duration,
 * which the owner immediately asked back. It was that the frame was an `article.sh-event`,
 * the SAME element and type scale as a museum visit, with `.sh-legs` claiming containment
 * through 30px of indent in a 360px column. Two facts made it worse: the frame's title is
 * `routeTitle(first.from, last.to)`, so the legs' own endpoints appeared a third time.
 *
 * So the header names only the DESTINATION (`journeyTo`) with the totals beside it, at
 * caption scale and without the glyph column, and the legs sit on a real surface. The frame's
 * own material — the caption, the map link, the ops fold — rides INSIDE the container, which
 * is why this wraps `children` rather than replacing the row: dropping the row would drop
 * the flight's booking code with it.
 */
function Trek({ event, children }: { event: SharedEvent; children: React.ReactNode }) {
  const legs = event.legs ?? [];
  return (
    <div className="sh-trek">
      <div className="sh-trek-head">
        <strong>
          <Icon name="flight" />
          {event.journeyTo ? t.share.public.journeyTo(event.journeyTo) : autoIsolate(event.title)}
        </strong>
        <span className="sh-trek-sum">
          {t.share.public.journeyLegs(legs.length)}
          {' · '}
          {/* **The projection's clock, not a span this line works out for itself**
              (2026-09-01). It used to compose `startLabel`–`endLabel` here, which was right —
              and right by a route that bypassed the contract, so when the projection's `time`
              went stale on journey rows only paper showed it. `event.time` is the single
              authority on what a row's clock says (ADR-0213's twelfth amendment §1) and this
              reads it through the one component that spells it. */}
          {event.time ? <SharedTimeText time={event.time} /> : null}
          {event.durationMinutes ? ` · ${hoursPhrase(event.durationMinutes)}` : ''}
        </span>
        {/* The shift stays on the JOURNEY: origin to final destination is the pair a
            traveller acts on, and a signed number per leg describes one clock change three
            times (§2). */}
        {event.zoneShiftMinutes ? <ZoneShiftPill minutes={event.zoneShiftMinutes} /> : null}
      </div>
      <div className="sh-legs">
        {legs.map((leg, index) => (
          <div className="sh-leg" key={`${leg.title}-${index}`}>
            {/* The airport you SIT IN, not the leg you are about to fly. This read
                `המתנה בוינה ← קפלאוויק` because it composed the line from `leg.title`. */}
            {leg.layoverMinutes && leg.layoverPlace ? (
              <span className="sh-layover">
                <Icon name="clock" />
                {t.share.public.layover(leg.layoverPlace, hoursPhrase(leg.layoverMinutes))}
              </span>
            ) : null}
            <span className="sh-leg-row">
              <span className="sh-time">
                {ltrIsolate(
                  leg.endLabel && leg.endLabel !== leg.startLabel
                    ? t.share.public.timeRange(leg.startLabel ?? '', leg.endLabel)
                    : (leg.startLabel ?? ''),
                )}
              </span>
              <span>
                <strong>{autoIsolate(leg.title)}</strong>
                {leg.code ? <span className="sh-kind">{ltrIsolate(leg.code)}</span> : null}
                {/* **Its own flight time** (§2, and the fact the eighth amendment removed).
                    Micro scale, so it annotates the row it is on rather than competing with
                    the header's total. */}
                {leg.durationMinutes ? (
                  <span className="sh-leg-span">{hoursPhrase(leg.durationMinutes)}</span>
                ) : null}
              </span>
            </span>
          </div>
        ))}
      </div>
      {children}
    </div>
  );
}

function Appendix({
  appendix,
  code,
}: {
  appendix: NonNullable<SharedItineraryProjection['appendix']>;
  code: string;
}) {
  return (
    <section className="sh-appendix">
      <h2>{t.share.public.appendix.title}</h2>
      {/* **The same rows the schedule uses, for the material that has no row.** This block
          used to hold three per-family lists built by a second, unfiltered set of queries —
          which published every note in the trip under a toggle promising otherwise, and
          printed every attached note twice. The projection now hands over exactly the ops
          with no host, and they render as ops (ADR-0096). */}
      {/* Travelers left this block for the masthead: who is going is the trip's identity. */}
      {appendix.ops?.length ? <OpList ops={appendix.ops} code={code} /> : null}
    </section>
  );
}

/**
 * **The operational material, under the row it belongs to and folded** (ADR-0213's
 * 2026-08-30 amendment, reversing §4's appendix).
 *
 * Closed by default, and that is the whole reason a fold rather than a printed line: a
 * reader wants the schedule and an operator wants the code, and the two are the same person
 * at different moments. The print renderer inverts this — paper has no setting, and whoever
 * is holding the printout is by that act the operator.
 */
/**
 * **A download that shows how far it has got** (owner, 2026-08-31, twice).
 *
 * Round one was the answer to a report that survived three rounds as _"the document links
 * don't work"_ and never reproduced: they DID work. A bare `<a download>` hands the file to
 * the browser and the page says nothing at all, so on a phone a tap looks exactly like a tap
 * that did nothing. The measured route was fine every time; the missing thing was feedback.
 *
 * Round two: a word was not enough, and the owner asked why Chrome shows no download overlay
 * of its own. **Measured, and the page is not the reason** — driving both a navigation anchor
 * and this fetch-then-blob path in Chromium, each engages the browser's download manager
 * identically (`download` fires with the right filename for both). What Chrome then DRAWS —
 * a bubble on desktop, a notification on Android that competes with everything else in the
 * shade — is the browser's call and not something a page can summon. So the honest move is to
 * make the row itself carry the progress rather than to keep chasing the browser's chrome.
 *
 * And because we already hold the response, the progress can be REAL: the body is read
 * through a stream and the bar tracks bytes against `Content-Length`. Where the server sends
 * no length the bar runs indeterminate — an animation that claims a fraction it cannot know
 * is worse than one that admits it doesn't. `rel="noopener"` and the same href remain, so a
 * long-press "save link" still works and a browser with JS disabled still downloads.
 *
 * **Round three (ninth amendment §4–§5), and both halves were already in the repo.**
 *
 *   1. `ui/Spinner.tsx`'s own docblock: _"the ONE shared spinner (ADR-0052 §4) … so every
 *      async surface has a motion cue, NOT A STATIC WORD"_ — and §4 names the composition,
 *      label PLUS spinner, with a bar where the transport allows one. This row had the bar
 *      and the word and no spinner: two thirds of a rule written four months earlier. The
 *      spinner takes the GLYPH's slot, so the row's geometry never moves.
 *   2. `lib/system-share.ts`'s `shareFileOrDownload` tries `navigator.share({ files })`
 *      first and falls back to an anchor click. This row contained those fallback six lines
 *      VERBATIM and never tried the share branch — the branch that, on Android, opens the
 *      system sheet and so is the visible confirmation the owner asked for twice. It calls
 *      the helper now, and the helper gained this row's `requestAnimationFrame` revoke,
 *      which it was missing. Two copies, half an answer each (rule 8).
 */
type DownloadState = 'idle' | 'working' | 'done' | 'shared' | 'failed';

/**
 * **The response body as a blob, reporting progress on the way** — `Content-Length` over
 * bytes read. Falls back to `response.blob()` where the platform gives us no reader (and
 * therefore no progress), which keeps the download working rather than trading it for a bar.
 */
async function readWithProgress(
  response: Response,
  onRatio: (ratio: number | undefined) => void,
): Promise<Blob> {
  const declared = Number(response.headers.get('content-length'));
  const total = Number.isFinite(declared) && declared > 0 ? declared : undefined;
  const reader = response.body?.getReader();
  if (!reader) return response.blob();

  const chunks: BlobPart[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value as BlobPart);
    loaded += value.byteLength;
    // A ratio only where a length was declared; a chunked response reports none and the bar
    // stays indeterminate rather than inventing a denominator.
    if (total) onRatio(Math.min(1, loaded / total));
  }
  return new Blob(chunks, { type: response.headers.get('content-type') ?? undefined });
}

/**
 * **One hand-over, two hosts** — a document row and the reader's own PDF button ask the same
 * question (fetch a URL, say how far it has got, give the file to the platform), so they are
 * one hook rather than two copies of a `useState` ladder (rule 8 / ADR-0096). The PDF button
 * arrived second and is exactly why this is a hook: writing it as a second ladder is how the
 * two would have drifted on the states, the settle delay, or which outcome says `נשלח`.
 */
function useFileHandover(): {
  state: DownloadState;
  ratio: number | undefined;
  run: (href: string, filename: string) => Promise<void>;
} {
  const [state, setState] = useState<DownloadState>('idle');
  /** `undefined` while a length is unknown, which the bar renders as indeterminate. */
  const [ratio, setRatio] = useState<number | undefined>(undefined);
  const settle = useRef<ReturnType<typeof setTimeout>>(undefined);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      clearTimeout(settle.current);
    };
  }, []);

  const run = useCallback(async (href: string, filename: string) => {
    setState('working');
    setRatio(undefined);
    let next: DownloadState = 'failed';
    try {
      const response = await fetch(href);
      if (!response.ok) throw new Error(String(response.status));
      const blob = await readWithProgress(response, (value) => {
        if (live.current) setRatio(value);
      });
      // **The app's own hand-over, not a second copy of its fallback.** This is what puts
      // Android's system sheet back in front of the reader; the anchor path is still there,
      // inside the helper, for every platform that cannot share a file.
      const outcome = await shareFileOrDownload(new File([blob], filename, { type: blob.type }));
      // A dismissed share sheet is a deliberate act, so the row says nothing about it and
      // goes quiet — a page that comments on a cancel is nagging.
      next = outcome === 'cancelled' ? 'idle' : outcome === 'shared' ? 'shared' : 'done';
    } catch {
      next = 'failed';
    }
    if (!live.current) return;
    setState(next);
    settle.current = setTimeout(() => live.current && setState('idle'), DOWNLOAD_SETTLE_MS);
  }, []);

  return { state, ratio, run };
}

/** The word for a settled hand-over, or none while it is idle. */
const handoverWord = (state: DownloadState): string | undefined =>
  state === 'working'
    ? t.share.public.file.working
    : state === 'done'
      ? t.share.public.file.done
      : state === 'shared'
        ? t.share.public.file.shared
        : state === 'failed'
          ? t.share.public.file.failed
          : undefined;

/** The determinate/indeterminate bar. Only ever rendered while bytes are moving, so a row
 *  that is downloading is the same height as a row that is not. */
function HandoverBar({ ratio }: { ratio: number | undefined }) {
  return (
    <span
      className="sh-dl-bar"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      // No `aria-valuenow` at all is how ARIA spells indeterminate, so a screen reader
      // hears the same thing the eye sees.
      aria-valuenow={ratio === undefined ? undefined : Math.round(ratio * 100)}
      data-indeterminate={ratio === undefined ? '' : undefined}
    >
      <span style={ratio === undefined ? undefined : { inlineSize: `${ratio * 100}%` }} />
    </span>
  );
}

function FileOp({ href, title }: { href: string; title: string }) {
  const { state, ratio, run } = useFileHandover();
  const working = state === 'working';
  const word = handoverWord(state);

  return (
    <a
      className="sh-op-file"
      href={href}
      download={title}
      rel="noopener"
      onClick={(event) => {
        // Let the browser do it natively where we cannot improve on it (a modifier click is
        // a deliberate "open in a new tab"), and never start a second fetch over a live one.
        if (event.metaKey || event.ctrlKey || event.shiftKey || working) return;
        event.preventDefault();
        void run(href, title);
      }}
      data-state={state}
      aria-busy={working}
    >
      {/* **The motion cue lives in the glyph's slot** (ADR-0052 §4). One box either way. */}
      <span className="sh-op-mark">
        {working ? (
          <Spinner className="ink" label={t.share.public.file.working} />
        ) : (
          <Icon name={state === 'failed' ? 'close' : state === 'idle' ? 'download' : 'check'} />
        )}
      </span>
      <span className="sh-op-file-copy">
        <span className="sh-op-file-name">{autoIsolate(title)}</span>
        {word ? <span className="sh-dl-state">{word}</span> : null}
        {working ? <HandoverBar ratio={ratio} /> : null}
      </span>
    </a>
  );
}

/**
 * **The reader's own copy** (owner, 2026-08-31: _"the live sharing page should have a button
 * to export to pdf"_; ADR-0213 ninth amendment §6).
 *
 * `.share-outcome` is the OWNER sheet's PDF control, so this is that control at a second
 * host rather than a third button — and it carries §4's spinner, which the owner's own copy
 * still does not (it swaps a word, while `FormActions` two files over renders
 * `busy ? <Spinner /> : label`). The masthead placement is the mockup's recommendation and
 * the one thing here a device pass may overturn; the foot alternative is one class away.
 */
function TakePdf({
  code,
  className,
  short = false,
  filename,
}: {
  code: string;
  className?: string;
  /** The masthead's 42px cannot hold the sentence, so it takes the two-letter label. */
  short?: boolean;
  filename: string;
}) {
  const { state, ratio, run } = useFileHandover();
  const working = state === 'working';
  const label = short
    ? t.share.public.takePdfShort
    : state === 'failed'
      ? t.share.public.takePdfFailed
      : working
        ? t.share.public.takePdfWorking
        : t.share.public.takePdf;
  return (
    <button
      type="button"
      className={className}
      onClick={() => void run(sharedItineraryPdfUrl(code), filename)}
      disabled={working}
      aria-busy={working}
      title={short ? t.share.public.takePdf : undefined}
    >
      {working ? (
        <Spinner className="ink" label={t.share.public.takePdfWorking} />
      ) : (
        <Icon name={state === 'failed' ? 'close' : 'download'} />
      )}
      {label}
      {working && !short ? <HandoverBar ratio={ratio} /> : null}
    </button>
  );
}

/**
 * **How long it took and what the clock did** (owner, 2026-08-31: _"Flights and stuff like
 * that should also show duration and timezone changes, like in the app"_).
 *
 * Both facts already exist in the app: `hoursPhrase` is the one duration ladder (ADR-0114)
 * and `ZoneShiftPill` is the one zone pill (ADR-0107 session-90). This reaches for them
 * rather than wording either again — the projection ships minutes and this spends the app's
 * own vocabulary on them, so a shared flight and an app flight cannot read differently.
 */
function TravelFacts({
  event,
}: {
  event: Pick<SharedEvent, 'durationMinutes' | 'zoneShiftMinutes'>;
}) {
  if (!event.durationMinutes && !event.zoneShiftMinutes) return null;
  return (
    <span className="sh-travel-facts">
      {event.durationMinutes ? <span>{hoursPhrase(event.durationMinutes)}</span> : null}
      {event.zoneShiftMinutes ? <ZoneShiftPill minutes={event.zoneShiftMinutes} /> : null}
    </span>
  );
}

function Ops({ ops, code }: { ops: NonNullable<SharedEvent['ops']>; code: string }) {
  return (
    <details className="sh-ops">
      {/* 44px of target without 44px of line — the summary keeps its own 28px box and the
          hit area is an `::after` overlay, exactly as `ValueToken` does it (ADR-0177). A
          `min-height` here would add 16px to every row that carries a detail. */}
      <summary>
        <Icon name="caret" />
        {t.share.public.ops.more(ops.length)}
      </summary>
      <OpList ops={ops} code={code} />
    </details>
  );
}

/**
 * **One op, one row** — and the reason this is its own component rather than a loop inside
 * `Ops` is that the appendix renders the very same union without a fold: what is attached to
 * nothing has nothing to fold under. Two call sites, one row shape (ADR-0096).
 */
function OpList({ ops, code }: { ops: readonly SharedOp[]; code: string }) {
  return (
    <span className="sh-ops-body">
      {ops.map((op, index) => (
        <span className="sh-op" key={`${op.kind}-${index}`}>
          <Icon name={OP_ICON[op.kind]} />
          {op.kind === SHARE_OP_KIND.CODE ? (
            <>
              <code>{ltrIsolate(op.code)}</code>
              {op.provider ? <span>{autoIsolate(op.provider)}</span> : null}
            </>
          ) : null}
          {/* **The app's own note renderer** (owner, 2026-08-30: _"Markup should be formatted
              the same way as in the notes sheet, urls should be added as well similarly"_).
              `NoteProse` is the paint half of `lib/note-markdown.ts` — headings, lists,
              quotes, emphasis and linkified urls — and it already solves the direction
              question better than `dir="auto"` did: `baseDirection` reads the whole body, so
              a Hebrew note opening with `TL;DR` is not laid out left-to-right by its first
              three Latin characters (ADR-0202 §4/§6). `dense` because this is a row's
              detail, not the note's own screen. Reusing it is also the only way the shared
              page and the app cannot drift about what a marker means (ADR-0096). */}
          {op.kind === SHARE_OP_KIND.NOTE ? (
            <span className="sh-op-note">
              {op.title ? <strong dir="auto">{op.title}</strong> : null}
              {op.body ? <NoteProse body={op.body} dense /> : null}
            </span>
          ) : null}
          {op.kind === SHARE_OP_KIND.FILE ? (
            <FileOp href={sharedDocumentUrl(code, op.handle)} title={op.title} />
          ) : null}
        </span>
      ))}
    </span>
  );
}

/** One glyph per op kind, as a `Record` over the closed union — so a sixth kind is a
 *  compile error here rather than a missing icon in production (`frontend/CLAUDE.md`'s
 *  constants convention). */
const OP_ICON = {
  [SHARE_OP_KIND.CODE]: 'clipboard',
  [SHARE_OP_KIND.NOTE]: 'edit',
  [SHARE_OP_KIND.FILE]: 'documents',
} as const satisfies Record<ShareOpKind, IconName>;

/**
 * **The trip's fixed points, above the schedule** (owner, 2026-08-30: _"Maybe these
 * sharings should have sections for important stuff, like flights, reservations etc."_).
 *
 * Not a tab (ADR-0004) and not a second spine — a list of five or six lines above the days,
 * each jumping to its own. It is what a reader looks for first and what they screenshot.
 */
function Commitments({
  commitments,
  code,
}: {
  commitments: SharedItineraryProjection['commitments'];
  code: string;
}) {
  return (
    <section className="sh-fixed">
      <h2>{t.share.public.commitments.title}</h2>
      {commitments.map((row, index) => (
        <div className="sh-fixed-row" key={`${row.title}-${index}`}>
          <Icon name={BOOKING_TYPE_MARK[row.bookingType]} />
          <span>
            <b>{autoIsolate(row.title)}</b>
            {row.detail ? <i>{autoIsolate(row.detail)}</i> : null}
            {row.ops?.length ? <Ops ops={row.ops} code={code} /> : null}
          </span>
          <span className="sh-fixed-when">
            {ltrIsolate(commitmentWhen(row))}
            <i>{t.share.public.commitments.day(row.dayOrdinal)}</i>
          </span>
        </div>
      ))}
    </section>
  );
}

/** `11.09`, or `11–21.09` for a stay that spans nights. Day-and-month only: the year is on
 *  the masthead and a reader checking a flight date does not need it twice. */
function commitmentWhen(row: SharedItineraryProjection['commitments'][number]): string {
  const short = (date: string) => date.slice(8, 10) + '.' + date.slice(5, 7);
  if (!row.endDate || row.endDate === row.date) return short(row.date);
  return `${row.date.slice(8, 10)}–${short(row.endDate)}`;
}

/** The one terminal card, and it is now reserved for the one failure it describes: the
 *  server said this code is not live. */
const Unavailable = () => (
  <div className="sh-unavailable">
    <div>
      <div className="sh-unavailable-mark" aria-hidden="true">
        <Icon name="link" />
      </div>
      <h2>{t.share.public.unavailableTitle}</h2>
      <p>{t.share.public.unavailableBody}</p>
    </div>
  </div>
);

/** **Nobody answered, and we stopped asking.** The same card shape, and the two differences
 *  are the whole point of it: it does not say the link was revoked (nothing here knows that,
 *  and a 404 would have drawn the card above), and it carries the tap that cures it. */
const LoadFailed = ({ onRetry }: { onRetry: () => void }) => (
  <div className="sh-unavailable">
    <div>
      <div className="sh-unavailable-mark" aria-hidden="true">
        {/* The circular arrow, which is this page's only use of it: `reset` is the app's
            retry mark (`Icon.tsx`), not a second glyph minted for one card. */}
        <Icon name="reset" />
      </div>
      <h2>{t.share.public.failedTitle}</h2>
      <p>{t.share.public.failedBody}</p>
      <button type="button" className="sh-retry" onClick={onRetry}>
        {t.share.public.failedAction}
      </button>
    </div>
  </div>
);

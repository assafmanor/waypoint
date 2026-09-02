// Board (design-language: the departure-board hero) — the app's signature
// surface and its "one loud element": the only dark, glowing, pulsing surface.
// Extracted faithfully from screens/Home.tsx's inline board (~249), preserving
// every state: now (hard/soft), in-transit (a flight in the air — teal "where
// you are"), group-split (concurrent soft events as equals), and free/empty,
// plus the next-row + day-progress rail (hidden in transit, when the flight IS
// the current activity) and the quiet "ועוד N עכשיו" concurrency readout.
//
// Presentational only (dependency direction, §12): all data + title nodes come
// via props; no trip-state, no derivations. Domain UI may use the shared
// copy/label helpers (not state) — it does for the fixed board copy + transition
// labels. The board is rationed to one per screen (design-language).
//
// HERO 2.0, PHASE 1 (ADR-0160 §4). The board is becoming a tap target, and that
// forced a change with nothing to do with taste: a tappable board is a
// `<button>`, and the `ועוד N עכשיו` expander was a `<button>` INSIDE it. Chrome
// does not merely call that invalid — it closes the outer element at the nested
// one and reparents everything after it, so the divider, the next row and the day
// rail land outside the board (measured in `mockups/hero-horizon-v1.html`: 1 of 4
// children left inside). So the expander is gone, replaced by a READOUT — the
// count must stay legible without a tap — and its rows move to the lifted hero in
// phase 3. This was the board's only interactive child, so it now has none.
import type { CSSProperties, ReactNode } from 'react';
import { Icon } from '../Icon';
import { TitleLabel } from '../TitleLabel';
import { ZoneShiftPill } from '../ZoneShiftPill';
import { transitionLabel } from '../../lib/transitions';
import { gapIsLocative, gapWords, type GapRead } from '../../lib/gap-character';
import { trackBlockClass, trackBlockStyle } from '../../lib/day-track';
import type { TomorrowRibbon } from '../../lib/tomorrow';
import '../../styles/day-track.css';
import { t } from '../../i18n/he';
import './board.css';

export type BoardVariant = 'now' | 'in-transit' | 'group-split' | 'free';

/** Signed time-shift in minutes (`EventZones.deltaMinutes`) for a slot whose
 *  times don't read in the zone you're standing in — the board renders it as the
 *  shared amber pill (ADR-0107). Undefined → no pill, which is every slot on a
 *  single-zone trip. Times themselves arrive pre-formatted in their own zone. */
type ZoneShift = number | undefined;

/** A concurrent/also-now row (a group-split equal, or an item under "ועוד N"). */
export interface BoardRow {
  key: string;
  icon?: ReactNode;
  /** Title node (screen passes <EventTitle/>). */
  title: ReactNode;
  /** End time (pre-formatted, in this row's own end zone) → "עד HH:MM". */
  until?: string;
  hard?: boolean;
  shift?: ZoneShift;
}

/** **What the now-slot says when nothing is running** (ADR-0211).
 *
 *  The board no longer decides this: `זמן חופשי` was its final `else`, which is how it came to
 *  print a claim on a bus, in bed and on a day nobody planned. The screen derives the character
 *  and the board draws it, exactly as it already does for every other slot.
 *
 *  Absent → the board is not in a gap at all (`now`, `in-transit`, `group-split` all supply
 *  their own words), so nothing here fires. */
export interface BoardGap {
  read: GapRead;
  /** The stay's resolved display name, for `at-the-stay`. */
  stayName?: string;
  /** Pre-formatted `HH:MM` the gap runs to, for `open` — the fact the `free` branch never said
   *  while `GlanceCard` said it two inches lower (ADR-0211 §5). Times arrive formatted; the
   *  board reads no zone. */
  until?: string;
}

/** **WHAT THE NIGHT BOARD SAYS INSTEAD OF `סוף היום`** (ADR-0214).
 *
 *  Present → the day's plan is finished and tomorrow is the board's subject, which changes
 *  three things at once: the slot holding tomorrow takes **rank 1** (the amber label,
 *  `--text-h2`, `--on-dark-strong`), the day's-closure words are not drawn at all, and the day
 *  rail's slot carries tomorrow's shape instead of a progress bar with nothing left to measure.
 *
 *  The board decides none of that: the SCREEN decides there is a tomorrow worth drawing and
 *  hands it over, exactly as it already hands over the gap's character. Absent → every state
 *  renders as it shipped. */
export interface BoardTomorrow {
  /** `מחר` — resolved by the screen through `dayLabel`, never a literal here, so a board that
   *  ever points two days out says `מחרתיים` rather than lying by one day. */
  label: string;
  /** `tomorrowRibbon`'s answer: the blocks, and the marks that survived thinning. */
  ribbon: TomorrowRibbon;
  /** Where tomorrow ends up, and **only when it is not where you already are** — the screen
   *  applies ADR-0209's rule ("a stay is named once") before this arrives, because the same
   *  bed is already on the stay strip one surface up. */
  sleeps?: string;
}

export interface BoardTransit {
  /** Transition label key (departure/arrival/…) resolved via transitionLabel. */
  labelKey: string;
  /** The live badge and the slot label, **resolved per mode** by the screen from
   *  `eventMidSpanWords` (`בטיסה`/`בדרך`, `כרגע · בדרך`). They were `t.board`
   *  literals here, which is how a train in motion read as a flight: this state fires
   *  for any bracketed transport between its ends, not only for aviation. */
  liveWord: string;
  label: string;
  /** The travelling mark on the rail — **the event's own glyph**, not a mark this
   *  component picks. It was a hard-coded `Icon name="flight"`, so a train crossed its
   *  rail behind a plane; and there is no `train`/`bus` icon to reach for, which is the
   *  second reason the answer is the glyph the user can already change. */
  mark?: ReactNode;
  /** Emphasize the label (an arrival is imminent). */
  arriving?: boolean;
  /** Landing time (pre-formatted) — in the **destination's** zone (ADR-0107 §3). */
  endTime?: string;
  /** `מחר` / `מחרתיים` beside that time, and **only when the landing is not today**
   *  (ADR-0160 §M). The duration is the fact you act on and it is already on this row; the
   *  day is a disambiguator for the one case where the time alone misleads — a red-eye
   *  landing at 06:00 reads as this morning, and the zone jump breaks the arithmetic you
   *  would use to check. Absent on every same-day journey, which is nearly all of them. */
  endDay?: string;
  code?: string;
  /** Flight progress 0..1 (drives the fill + plane). */
  progress: number;
  /** Departure time (pre-formatted) — in the **origin's** zone. */
  startTime?: string;
  fromPlace?: string;
  toPlace?: string;
  /** How long is left, pre-phrased on the shared ladder (`1:39 שע׳`) → the rail's
   *  middle slot reads `נותרו 1:39 שע׳`.
   *
   *  That slot used to print `עד HH:MM` — the arrival time the **end** label prints two
   *  inches away, on the same 10.5px line. The middle is the only place on the rail that
   *  can say something its two ends cannot, so it says what is left. */
  remaining?: string;
  /** Destination clock minus origin clock — the pill beside the landing time, so
   *  the two ends can't misread as a 3h45 flight when they're 6h45 apart. */
  shift?: ZoneShift;
  /** **A journey, or a resource you are holding** (`midSpan.kind`, session 215).
   *
   *  `journey` is a leg you are being carried along and earns the rail. `held` is a car
   *  hire mid-hire (or a same-day stay): it reaches this same state — only a MULTI-day
   *  span is ambient — but nothing about it is a distance travelled, and its end is a
   *  deadline rather than an arrival. So a held span draws no rail and no travelling
   *  mark, and says since when it has been ours instead. Read the owner's rule
   *  literally: *"this applies to other kinds of transit (train, bus) but not rental
   *  cars that are different"*.
   *
   *  Absent → `journey`, so the flight path is unchanged by this field existing. */
  kind?: 'journey' | 'held';
  /** A held span's start (pre-formatted) → `אצלנו מ־11:40`. */
  heldSince?: string;
}

export interface BoardNext {
  /** Title node; absent → "end of day". */
  title?: ReactNode;
  icon?: ReactNode;
  /** Transition label key (המראה / צ׳ק-אין …) if the next is bracketed. */
  labelKey?: string;
  /** Instant (pre-formatted) — in the zone that instant happens in. */
  time?: string;
  /** **Which day that instant falls on, when it is not today** (ADR-0211 §6) — `מחר`,
   *  `מחרתיים`, `עוד 3 ימים`, from `relativeDayLabel`.
   *
   *  `deriveNow` has no date filter (`lib/time.ts:312`), so this slot has ALWAYS crossed
   *  midnight: at ⁦22:40⁩ it is already showing tomorrow's ⁦07:00⁩ flight, and `07:00` alone
   *  reads as this morning. That is the ambiguity ADR-0160 §M named for the in-transit
   *  landing — _"a red-eye landing at 06:00 reads as this morning"_ — and solved with
   *  `BoardTransit.endDay`. The same fact, the same words, the sibling meta row that never
   *  got them.
   *
   *  **It rides WITH the time it qualifies**, never on the countdown — §M's own rule, for
   *  §M's own reason: what is ambiguous is `07:00`, not `בעוד 8 שעות`. */
  day?: string;
  hard?: boolean;
  code?: string;
  /** That zone vs where you are now → the pill beside the time. */
  shift?: ZoneShift;
  /** **This edge's window shut and nobody answered** (ADR-0184 §6). The transition word
   *  wears `--miss` instead of amber — the app's existing failure hue, spent on the first
   *  lodging edge that can actually fail. No new word and no new row shape. */
  missed?: boolean;
}

/** **The tile under `הבא בתור`** — one number, and the words that say what it is a number OF.
 *
 *  Named here and imported by `HeroLift`, which renders the same tile one elevation up: the two
 *  copies of this markup predate the lift, and a field added to one and not the other is exactly
 *  how the collapsed board and the hero start saying different things about one leave-by.
 *
 *  `unitBelow` is a **second unit line**, and only the passed-leave arm uses it (ADR-0208 §1).
 *  Three parts will not fit on one line inside the tile's own ⁦48px⁩ — measured — and the row has
 *  the height to spare, so the sentence wraps rather than the number losing a word. */
export interface BoardCountdown {
  value?: string;
  unit: string;
  unitBelow?: string;
  missed?: boolean;
}

export interface BoardProps {
  variant: BoardVariant;
  /** Current time (pre-formatted) — the board clock. */
  clock: string;

  // NOW slot (variant 'now' / 'in-transit').
  nowIcon?: ReactNode;
  nowTitle?: ReactNode;
  /** Drives the hard-lock vs soft now-label (variant 'now'). */
  nowKind?: 'hard' | 'soft';
  /** "until" end time for a now event (pre-formatted, in its own end zone). */
  nowUntil?: string;
  /** The now event's shift → the pill beside `nowUntil`. */
  nowShift?: ZoneShift;
  conflict?: { title: string; atLabel: string };

  // in-transit hero.
  transit?: BoardTransit;

  // group-split equals + the also-now expander items.
  splitRows?: BoardRow[];
  alsoNow?: BoardRow[];

  // NEXT slot + progress (hidden in transit).
  next?: BoardNext | null;
  /** **The board's ONE countdown, and it changes what it counts to** (ADR-0206 §Z1). The `unit`
   *  slot has said what the minutes are left OF since ADR-0184 §6's `לסגירה`; a live leave-by is
   *  the same fact pointed one step earlier, so it is a third arm on that ternary and not a
   *  second element — `עוד 45 · דקות` is not merely less useful once you should be leaving, it
   *  is wrong, and drawing both would state a contradiction the reader has to resolve.
   *
   *  `missed` paints the tile in the board's own `--miss` recipe (§D7) for a leave-by that has
   *  gone by. **It is a swap, not a second live mark** (§D6): `.now-here` is still the app's
   *  only one, and re-pointing a countdown is not another. */
  countdown?: BoardCountdown | null;
  /** **What the now-slot says when nothing is running** (ADR-0211). Absent on every
   *  variant that supplies its own words. */
  gap?: BoardGap | null;
  /** **Tomorrow, when the day's plan is finished** (ADR-0214) — see {@link BoardTomorrow}.
   *  Present → the board re-ranks its slots around it and its foot carries the shape instead
   *  of the day rail. */
  tomorrow?: BoardTomorrow | null;
  /** Day progress 0..100. */
  progress?: number;
  windowStartHour?: string;
  windowEndHour?: string;
  /** **Whether the day rail still describes the frame you are in** (`gapDrawsDayRail`).
   *
   *  Generalised from the `in-transit` gate that was already here for exactly this reason
   *  (ADR-0059 §2: the flight IS the day's current activity). The night is the same case from
   *  the other end — `dayProgress` clamps, so at ⁦02:40⁩ the rail drew a knob at ⁦0%⁩ labelled
   *  `עכשיו`, telling somebody in bed they were standing at ⁦07:00⁩. One boolean, two callers,
   *  rather than a second bespoke condition beside the first. */
  showRail?: boolean;

  /** Press the whole board to lift it (ADR-0160 §1). Present → the board renders
   *  as a `<button>` and takes the large press step; absent → a plain `<div>`, as
   *  it shipped. The CALLER decides which variants are liftable and whether there
   *  is anything to lift — the board stays presentational and asks neither.
   *
   *  Hands back the element that was pressed, because the lift is a FLIP off this
   *  board's box and a landing position may never be a constant (`frontend/CLAUDE.md`
   *  records three bugs from writing one). Reporting what was pressed is still
   *  presentational: the board measures nothing and decides nothing. */
  onLift?: (board: HTMLElement) => void;

  /** **The press when there is nothing to lift** (ADR-0160 §9, restored for this surface
   *  by the owner: _"when there's nothing to lift, clicking currently does nothing. I want
   *  the little nudge animation like in plan mode"_). Mutually exclusive with `onLift` by
   *  construction — the caller has already asked whether the horizon adds anything.
   *
   *  It deliberately does **not** make the board a `<button>`, and that is Plan mode's own
   *  reasoning (§H): a surface that opens nothing must not announce a control it cannot
   *  honour, so there is no role and no tab stop, and the beat is for the finger that
   *  already touched it. The board also keeps the plain press step rather than the large
   *  one — nothing is being pressed INTO.
   *
   *  Hands back the pressed element for the same reason `onLift` does: the beat plays on
   *  this box, and the board neither owns motion nor decides what a press means. */
  onRebuff?: (board: HTMLElement) => void;

  /** The hero is currently lifted out of this board (ADR-0160 §1). Hides it without
   *  giving up its box — it is the same object one elevation up, and two of them on
   *  screen is the overlay grammar the promotion exists to avoid. */
  lifted?: boolean;
}

/**
 * **The day rail**, and the transit progress that replaces it (ADR-0059 §2, ADR-0160 §10).
 *
 * Both are exported because the LIFTED hero pins one of them as its foot, and phase 3
 * shipped the day rail as a hand-written copy in `Home.tsx` — beside a `rail` prop whose
 * own comment claimed it was "the same node the collapsed board renders, passed in rather
 * than rebuilt so the two cannot drift". It was rebuilt. Rule 8's answer is to generalize
 * the one-off rather than add a second one beside it, so the copy is gone and there is one
 * of each.
 */
/**
 * **The now-slot in a gap**, rendered once and read at both elevations (ADR-0211 §2).
 *
 * Exported for `HeroLift`, which draws the same two lines one elevation up — the same reason
 * `DayRail` and `BoardCountdown` are exported from here. ADR-0160 §S had to repair this exact
 * drift once already, when `free` was `Board`'s `else` and an empty array in the hero, so the
 * words vanished on the way up; a second copy of these lines is how that comes back.
 *
 * The markup is the board's own `.wp-board-now-label` / `.wp-board-now-title` / `.wp-board-now-meta`
 * trio, unchanged. What is new is that the `meta` line now fires in a gap at all: the `free`
 * branch never rendered one, so the board left a slot empty for a fact `GlanceCard` was carrying
 * two inches lower (§5).
 */
export function BoardGapSlot({ gap }: { gap: BoardGap }) {
  const { label, title } = gapWords(gap.read, gap.stayName);
  const loc = gapIsLocative(gap.read.kind);
  return (
    <>
      <div className={loc ? 'wp-board-now-label loc' : 'wp-board-now-label'}>{label}</div>
      <div className="wp-board-now-title" dir="auto">
        {title}
      </div>
      {gap.until && (
        <div className="wp-board-now-meta">
          {t.board.until} <span dir="auto">{gap.until}</span>
        </div>
      )}
    </>
  );
}

/**
 * **TOMORROW'S SHAPE, IN THE DAY RAIL'S OWN SLOT** (ADR-0214).
 *
 * It IS `.wp-board-progress` — the same ⁦3px⁩ track in the same place, which is the whole
 * argument for it: on a finished day the rail is measuring a day that is over (`dayProgress`
 * clamps, so it draws a knob at ~⁦98%⁩ under the word `עכשיו`), and what the traveller wants
 * from that band at ⁦22:40⁩ is the shape of the morning. Measured: on a day the bed does not
 * move the strip is ⁦23px⁩, which is the rail's own height to the pixel.
 *
 * **It carries no caption, no day number and no count**, and that is what keeps it minimal:
 * the rank-1 label above it already says `מחר` and the meta row already says when tomorrow
 * starts, so a header here would print the subject twice. What it does carry is the one thing
 * no other slot can say — where tomorrow ends up — and only when the bed actually moves.
 *
 * **Nothing in here is pressable.** The board is a `<button>`, and ADR-0160 §4 is the record
 * of what a nested one does to it: Chrome closes the board at the inner button and reparents
 * everything after it (⁦1 of 4⁩ children left inside, measured). So this is a readout, exactly
 * as `ועוד N עכשיו` became one, and the way through to the day lives in the lifted hero.
 */
export function TomorrowStrip({ tomorrow }: { tomorrow: BoardTomorrow }) {
  const { ribbon, sleeps } = tomorrow;
  return (
    // `.wp-board-progress` for the slot's own spacing, `.wp-track` for the geometry, and
    // `.wp-board-tmr` for the two things only the BOARD supplies: the `--track-*` inks and the
    // sleeps line. A glance rail reusing this sets its own inks and skips the middle class.
    <div className="wp-board-progress wp-track wp-board-tmr">
      {ribbon.marks.length > 0 && (
        <div className="wp-track-marks" aria-hidden="true">
          {ribbon.marks.map((mark) => (
            <span
              key={mark.key}
              className="wp-track-mark"
              style={{ '--s': `${mark.frac * 100}%` } as CSSProperties}
            >
              {mark.icon}
            </span>
          ))}
        </div>
      )}
      {ribbon.blocks.length === 0 ? (
        <div className="wp-track-empty" aria-hidden="true" />
      ) : (
        <div className="track" aria-hidden="true">
          {ribbon.blocks.map((block) => (
            <div
              key={block.key}
              className={trackBlockClass(block)}
              style={trackBlockStyle(block) as CSSProperties}
            />
          ))}
        </div>
      )}
      {sleeps && (
        <div className="wp-board-tmr-sleep">
          <Icon name="hotel" />
          <span dir="auto">{t.board.tomorrowSleeps(sleeps)}</span>
        </div>
      )}
    </div>
  );
}

export function DayRail({
  progress,
  startHour,
  endHour,
}: {
  /** Day progress, 0..100. */
  progress: number;
  startHour?: string;
  endHour?: string;
}) {
  return (
    <div className="wp-board-progress" aria-hidden="true">
      <div className="track">
        <div className="fill" style={{ width: `${progress}%` }} />
        <div className="knob" style={{ insetInlineStart: `${progress}%` }} />
      </div>
      <div className="ends">
        <span dir="auto">{startHour}</span>
        <span>{t.common.now}</span>
        <span dir="auto">{endHour}</span>
      </div>
    </div>
  );
}

/** The flight in the air: a track, a plane at the progress point, and the two ends with
 *  their own times. Absent unless both ends are known — a progress bar between one time and
 *  nothing is a bar that cannot say where it is. */
export function TransitProgress({ transit }: { transit: BoardTransit }) {
  // A held span is not a distance travelled, so there is nothing to draw a position on.
  if (transit.kind === 'held') return null;
  if (!transit.startTime || !transit.endTime) return null;
  return (
    <div className="wp-board-transit-prog">
      <div className="tp-track">
        <div className="tp-fill" style={{ width: `${transit.progress * 100}%` }} />
        <div className="tp-plane" style={{ insetInlineStart: `${transit.progress * 100}%` }}>
          {transit.mark}
        </div>
      </div>
      <div className="tp-ends">
        <span className="tp-end">
          <span className="mono" dir="auto">
            {transit.startTime}
          </span>
          {transit.fromPlace && <span className="pl">{transit.fromPlace}</span>}
        </span>
        {transit.remaining && (
          <span className="tp-left">
            {t.board.remaining}{' '}
            <span className="mono" dir="auto">
              {transit.remaining}
            </span>
          </span>
        )}
        <span className="tp-end end">
          {transit.toPlace && <span className="pl">{transit.toPlace}</span>}
          <span className="mono" dir="auto">
            {transit.endTime}
          </span>
          {/* The two ends are in their own zones now (ADR-0107), so the shift has to sit
              where they're read together — otherwise a 07:15 → 11:00 flight reads as 3h45
              instead of 6h45. */}
          {transit.shift != null && <ZoneShiftPill minutes={transit.shift} className="on-dark" />}
        </span>
      </div>
    </div>
  );
}

function AlsoRow({ row }: { row: BoardRow }) {
  return (
    <div className="wp-board-also-row">
      {row.icon && <span className="ic">{row.icon}</span>}
      <span className="nm">{row.title}</span>
      {row.hard && (
        <span className="mini-lock" aria-hidden="true">
          <Icon name="lock" />
        </span>
      )}
      {row.until && (
        <span className="tm">
          {t.board.until} <span dir="auto">{row.until}</span>
        </span>
      )}
      {row.shift != null && <ZoneShiftPill minutes={row.shift} className="on-dark" />}
    </div>
  );
}

export function Board(props: BoardProps) {
  const {
    variant,
    clock,
    nowIcon,
    nowTitle,
    nowKind,
    nowUntil,
    nowShift,
    conflict,
    transit,
    splitRows,
    alsoNow,
    next,
    countdown,
    gap,
    tomorrow,
    progress = 0,
    windowStartHour,
    windowEndHour,
    // The rail is drawn unless the caller says the day is not the frame you are in. Defaulting
    // to `true` keeps every existing caller (and every test) rendering exactly what it did.
    showRail = true,
    onLift,
    onRebuff,
    lifted,
  } = props;
  const inTransit = variant === 'in-transit';
  /** **A branch that draws nothing, named** — and the name is not decoration.
   *
   *  Two slots go silent once tomorrow is the subject: the day's-closure words, and the day
   *  rail. One reason serves both, ADR-0211 §4's "absence beats a pinned lie" — a board whose
   *  whole subject is tomorrow has said the day is over by not talking about it, and a progress
   *  bar for a day that is over measures nothing. `סוף היום` in the largest type and brightest
   *  ink on the app's loudest surface is a statement about what is NOT happening, and rank 1 is
   *  needed by the one thing on the card anybody can act on.
   *
   *  It is a named `const` rather than a `null` with a comment above it because **Prettier
   *  mangles a `//` comment that leads a bare `null` ternary branch, and does it
   *  non-idempotently**: it hoists the lines onto the `?` line and reorders them on every run,
   *  so `format` and `format:check` disagree and CI goes red on a file the pre-commit hook has
   *  just written. Cost one red `ci` on this PR; recorded in `frontend/CLAUDE.md`. */
  const nothing = null;
  /** **Whether tomorrow is the board's subject** (ADR-0214 §2): it is, when the screen handed
   *  over a tomorrow that actually has blocks. Then the slot holding tomorrow takes rank 1, the
   *  day's-closure words are not drawn, and the foot carries the shape. A tomorrow with NO
   *  blocks is a different state — the words move to the now-slot and the far point keeps rank
   *  2 with its countdown — so this is not simply `!!tomorrow`. */
  const tomorrowRanked = !!tomorrow && tomorrow.ribbon.blocks.length > 0;
  /** The gap that speaks in teal — only `on-the-way` (`gapIsLocative`). */
  const gapLoc = !!gap && gapIsLocative(gap.read.kind);

  const body = (
    <>
      <div className="wp-board-top">
        {/* **A journey somebody asserted wears the same costume as one the plan brackets**
            (ADR-0211 §3). `in-transit` already swaps this badge to the mode's own teal word;
            `בדרך` is the same fact from a person rather than from a bracket, so it takes the
            same swap rather than printing amber `עכשיו` over a teal label two lines down —
            which is the contradiction, one register over, that this ADR is about. */}
        <div className={'wp-board-live' + (inTransit || gapLoc ? ' loc' : '')}>
          <span className="blip" />
          {inTransit && transit
            ? transit.liveWord
            : gapLoc
              ? gapWords(gap!.read, gap!.stayName).title
              : t.common.now}
        </div>
        <div className="wp-board-clock" dir="auto">
          {clock}
        </div>
      </div>

      {inTransit && transit ? (
        <>
          <div className="wp-board-now-label loc">{transit.label}</div>
          <div className="wp-board-now-title">
            {nowIcon && <span className="wp-board-ic">{nowIcon}</span>}
            {nowTitle}
          </div>
          <div className="wp-board-now-meta">
            {/* A journey's end is where you arrive (teal, "where you are"); a held span's
                end is a deadline you have to meet, which is amber like every other
                commitment (root rule 4). */}
            <span
              className={
                (transit.kind === 'held' ? 'tlabel' : 'tlabel loc') +
                (transit.arriving ? ' emph' : '')
              }
            >
              {transitionLabel(transit.labelKey)}
            </span>
            {transit.endTime && <span dir="auto">{transit.endTime}</span>}
            {/* The day rides WITH the time it qualifies, never on the countdown: what is
                ambiguous is `06:00`, not `בעוד 13 שעות`. */}
            {transit.endDay && <span>{transit.endDay}</span>}
            {/* Only a HELD span says it here: a journey's rail carries `נותרו X` two lines
                down, and printing both is the duplication this session removed from the
                rail in the first place. */}
            {transit.kind === 'held' && transit.remaining && (
              <span dir="auto">{t.board.inPhrase(transit.remaining)}</span>
            )}
            {transit.code && (
              <span className="code" dir="auto">
                {transit.code}
              </span>
            )}
          </div>
          {transit.kind === 'held' ? (
            transit.heldSince && (
              <div className="wp-board-held">
                <span dir="auto">{t.board.heldSince(transit.heldSince)}</span>
              </div>
            )
          ) : (
            <TransitProgress transit={transit} />
          )}
        </>
      ) : variant === 'group-split' ? (
        <div className="wp-board-now-split">
          <div className="wp-board-now-label">{t.board.concurrentNow}</div>
          <div className="wp-board-also-list">
            {splitRows?.map((r) => (
              <AlsoRow key={r.key} row={r} />
            ))}
          </div>
        </div>
      ) : variant === 'now' ? (
        <>
          <div className="wp-board-now-label">
            {nowKind === 'hard' ? (
              <>
                <Icon name="lock" /> {t.event.hard}
              </>
            ) : (
              t.event.soft
            )}
          </div>
          <div className="wp-board-now-title">
            {nowIcon && <span className="wp-board-ic">{nowIcon}</span>}
            {nowTitle}
          </div>
          {nowUntil && (
            <div className="wp-board-now-meta">
              {t.board.until} <span dir="auto">{nowUntil}</span>
              {nowShift != null && <ZoneShiftPill minutes={nowShift} className="on-dark" />}
            </div>
          )}
          {conflict && (
            <div className="wp-board-now-conflict">
              <Icon name="warn" /> {t.event.conflictWarn.before}
              <TitleLabel title={conflict.title} /> {t.event.conflictWarn.after(conflict.atLabel)}
            </div>
          )}
          {/* The concurrency READOUT (ADR-0160 §4) — the count, not a control.
              Same dot and same words as the expander it replaces; what is gone is
              the chevron, the press target and the open state. The rows live in
              the lifted hero from phase 3. */}
          {alsoNow && alsoNow.length > 0 && (
            <div className="wp-board-also-read">
              <span className="dot" aria-hidden="true" />
              {t.board.alsoNow(alsoNow.length)}
            </div>
          )}
        </>
      ) : tomorrowRanked ? (
        nothing
      ) : tomorrow ? (
        // Tomorrow exists and nobody has filled it in. Then tomorrow IS the now-slot's
        // subject — no swap needed, since the point at rank 2 is a day or more out — and the
        // words are `emptyDay`'s own, with the day word coming from the screen.
        <>
          <div className="wp-board-now-label">{tomorrow.label}</div>
          <div className="wp-board-now-title" dir="auto">
            {t.board.gap.emptyDay.title}
          </div>
        </>
      ) : (
        gap && <BoardGapSlot gap={gap} />
      )}

      {/* An unplanned tomorrow draws its dashed strip directly under those words, above the
          divider: the shape belongs to the subject it describes, not to the point below it. */}
      {tomorrow && !tomorrowRanked && <TomorrowStrip tomorrow={tomorrow} />}

      {/* In transit the progress bar replaces the next-row + day rail (the flight
          IS the current activity). */}
      {!inTransit && (
        <>
          {/* No divider when the next row is the board's FIRST slot — there is nothing above
              it to divide from, and the label takes the now-label's own top margin instead. */}
          {!tomorrowRanked && <div className="wp-board-divider" />}
          <div className="wp-board-next-row">
            <div>
              <div
                className="wp-board-next-label"
                {...(tomorrowRanked ? { 'data-rank': '1' } : {})}
              >
                {tomorrowRanked ? tomorrow!.label : t.board.nextLabel}
              </div>
              <div
                className="wp-board-next-title"
                {...(tomorrowRanked ? { 'data-rank': '1' } : {})}
              >
                {next?.icon && <span className="wp-board-ic">{next.icon}</span>}
                {next?.title ?? t.board.endOfDay}
              </div>
              {next && (
                <div className="wp-board-next-meta">
                  {next.labelKey && (
                    <span className={next.missed ? 'tlabel missed' : 'tlabel'}>
                      {transitionLabel(next.labelKey)}
                    </span>
                  )}
                  {next.time && <span dir="auto">{next.time}</span>}
                  {/* WITH the time, never on the countdown (ADR-0160 §M / ADR-0211 §6): what
                      is ambiguous is `07:00`, not `בעוד 8 שעות`.

                      **And it comes OFF at rank 1** (ADR-0214 §3), which is the one removal
                      here that depends on another: the label above now says `מחר` itself, so
                      keeping this prints one word twice ⁦20px⁩ apart — the same duplication
                      ADR-0211's build log removed when it refused `לילה` in the badge AND the
                      label. Where the label still reads `הבא בתור`, the day token stays. */}
                  {next.day && !tomorrowRanked && <span>{next.day}</span>}
                  {next.shift != null && <ZoneShiftPill minutes={next.shift} className="on-dark" />}
                  {/* **The lock and the code come off at rank 1 too**, and neither is a
                      preference. The code is a measured duplication: the `הכרטיס הבא` quick
                      tile carries the same string ⁦240px⁩ lower on the same screen, which is
                      the surface ADR-0050 built for it. And a commitment you cannot act on for
                      eight hours decides nothing at ⁦22:40⁩ — the lock is on the point in the
                      lifted hero, one press away. */}
                  {next.hard && !tomorrowRanked && (
                    <span className="lockmini">
                      <Icon name="lock" /> {t.event.hard}
                    </span>
                  )}
                  {next.code && !tomorrowRanked && (
                    <span className="code" dir="auto">
                      {next.code}
                    </span>
                  )}
                </div>
              )}
            </div>
            {countdown && (
              <div className={'wp-board-countdown' + (countdown.missed ? ' missed' : '')}>
                {countdown.value && (
                  <div className="t" dir="auto">
                    {countdown.value}
                  </div>
                )}
                <div className="u">{countdown.unit}</div>
                {countdown.unitBelow && <div className="u">{countdown.unitBelow}</div>}
              </div>
            )}
          </div>

          {/* **The rail's slot, re-spent.** On a finished day `dayProgress` clamps, so the
              rail draws a knob at ~⁦98%⁩ under the word `עכשיו` — a band with nothing left to
              measure — and the strip is the same ⁦3px⁩ track in the same place saying what the
              morning looks like instead. Measured: ⁦23px⁩ against the rail's ⁦23px⁩ on a day the
              bed does not move.

              **An unplanned tomorrow drops the rail as well**, and the running app is what
              asked: its dashed strip sits above the divider, so keeping the rail below drew
              BOTH a tomorrow with nothing on it and a progress bar pinned at ~⁦98%⁩ — two bands
              for two things neither of which has anything left to measure. The board's
              `:last-child` padding rule, added by ADR-0211 §4 for exactly this shape, is what
              keeps the card's bottom edge right without one. */}
          {tomorrowRanked ? (
            <TomorrowStrip tomorrow={tomorrow!} />
          ) : tomorrow ? (
            nothing
          ) : (
            showRail && (
              <DayRail progress={progress} startHour={windowStartHour} endHour={windowEndHour} />
            )
          )}
        </>
      )}
    </>
  );

  const cls = 'wp-board' + (inTransit ? ' transit' : '') + (lifted ? ' is-lifted' : '');

  // A `<button>` only when there is somewhere to go. `is-tappable` carries the
  // element reset and the large press step (ADR-0140 §2: a full-width card at the
  // control step reads as collapsing), and it is one class rather than a bespoke
  // transform.
  //
  // With nothing to lift the board still ANSWERS a press (§9 as restored) — but as a
  // `<div>`, not a control: the same shape Plan's prep hero has had since §H, for the
  // same reason. A press that produces nothing at all reads as a dead surface; a
  // control that does nothing when activated is a promise not kept.
  if (onLift) {
    return (
      <button
        type="button"
        className={cls + ' is-tappable'}
        onClick={(e) => onLift(e.currentTarget)}
      >
        {body}
      </button>
    );
  }
  return (
    <div className={cls} onClick={onRebuff && ((e) => onRebuff(e.currentTarget))}>
      {body}
    </div>
  );
}

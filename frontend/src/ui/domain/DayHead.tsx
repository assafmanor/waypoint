// **The head of a day, on all three surfaces that have one** (ADR-0219 §2/§3).
//
// This is the reader's day card head, lifted. `.sh-day-head` / `.sh-day-date` / `.sh-day-copy`
// / `.sh-shot` were one-offs in `screens/shared-itinerary.css`, and the owner pointed at that
// design for the app's own day surfaces — so root rule 8 says generalise the one that nearly
// does the job rather than twin it. The reader consumes this component and looks exactly as it
// did; `DayView` and `PlanDay` render it too (phase 4), which is what makes the three surfaces
// name and picture a day identically.
//
// Presentational, `ui/domain/`: every value arrives as a prop, already composed and already
// isolated by the caller. This file decides the SHAPE — three bands in one frame — and nothing
// about what a day is called (`@waypoint/shared`'s `fallbackDayTitle`) or which stop it is a
// picture of (`dayPhoto`).
//
// Two things differ between its hosts and neither is a fact about the day, so both are props:
//
//  - **The reader's head is a band inside `.sh-day`'s card and toggles the body; the app's head
//    IS the card and is a region.** `card` carries the chrome and the app's shorter floor — the
//    reader's `min-height: 76px` was sized for a name plus two lines in the copy column, and in
//    the app the facts live below the grid, so the floor there is the date tile's own.
//  - **The copy column's LINES are the reader's** (its stay and the stay's clocks); the app's
//    facts are a footer band under the grid, full width and allowed to wrap. Round 2 drew them
//    as copy-column lines and the render clipped two of them at 360px — that column is sized
//    for a name.
import { Fragment, type ReactNode } from 'react';
import { autoIsolate, ltrIsolate } from '../../lib/bidi';
import { t } from '../../i18n/he';
import './day-head.css';

export interface DayHeadShot {
  /** Ready to render — the caller has already been through `apiAssetUrl` where it needs to. */
  url: string;
  /** The stop this is a picture OF, **raw**. An unlabelled photo of a waterfall on a day with
   *  four of them says nothing. Isolated for the caption here and passed to `alt` unisolated,
   *  which is the split the reader already drew: bidi controls in alt text are read aloud. */
  of: string;
  /** `attribution · license`, composed by `@waypoint/shared`'s `placeCredit` — raw, isolated
   *  for the caption here. Structural, not decoration: 27 of the 32 Commons files ADR-0166
   *  §12.2 surveyed require it. */
  credit: string;
  /** Open the full picture (ADR-0167 §10's viewer), which the screen owns. Absent → the shot is
   *  inert, which is the reader's answer: it has no app to open into. */
  onOpen?: () => void;
  /** **The app's shot is the first thing on the page, so it is fetched eagerly** (ADR-0219 §3).
   *  The reader's is one of twelve below the fold and stays lazy. */
  eager?: boolean;
}

export function DayHead({
  dayNumbers,
  weekday,
  isNow = false,
  title,
  lines,
  facts,
  shot,
  trailing,
  action,
  card = false,
  as = 'div',
  expanded,
  onToggle,
}: {
  /** `13`, or `13–14` on a card that swallowed the day a journey flew through. Isolated here,
   *  since it is a bare numeric run and this is the only place it is drawn. */
  dayNumbers: string;
  /** `ראשון`, or `שני–שלישי` for the same reason. Two Hebrew names need no isolate. */
  weekday: string;
  /** **Amber marks the day the trip is ON** (ADR-0213's eleventh amendment §2) — a span of
   *  time, which is the one thing amber is for. In BOTH modes: Plan's ban is on the pulse, not
   *  on marking today (ADR-0219 §2). */
  isNow?: boolean;
  /** The day's name, already composed — `dayTitleText(fallbackDayTitle(facts))`, or the trip's
   *  destination when the day has no places to name it by. */
  title: string;
  /** **The reader's copy-column lines**, under the title: its stay and the stay's two moments.
   *  Rendered as direct children of `.wp-dayhead-copy`, which is what its rules describe. */
  lines?: ReactNode[];
  /** **The app's facts**, in a footer band under the grid: the day's distance total, then Plan's
   *  fit verdict or its past-day note. At most two, full card width, allowed to wrap, never
   *  ellipsised. */
  facts?: ReactNode[];
  /** The day's photograph, when a stop cleared `dayPhoto`'s gate. Absent → the frame stands
   *  alone, with no placeholder band (ADR-0219 §3). */
  shot?: DayHeadShot;
  /** The trailing cell — the reader's caret. Absent → the `auto` track is 0px. */
  trailing?: ReactNode;
  /** The day's one action, at the end of the footer band: the app's `+ אירוע חדש`. Absent on a
   *  read-only day, and then there is no footer row at all. */
  action?: ReactNode;
  /** **Is this head its own card?** The app's is (its own frame, its own floor, its own footer);
   *  the reader's is a band inside `.sh-day`, which is already the card. */
  card?: boolean;
  /** The reader's head toggles the day's body, so it is a button; the app's is a region. */
  as?: 'button' | 'div';
  expanded?: boolean;
  onToggle?: () => void;
}) {
  const cls = `wp-dayhead${card ? ' is-card' : ''}${isNow ? ' is-now' : ''}`;
  const head = (
    <>
      <span className="wp-dayhead-date">
        <strong>{ltrIsolate(dayNumbers)}</strong>
        <span>{weekday}</span>
        {/* **The word, in the column the hue is already in.** Not in the copy column, whose
            lines ellipsise — a chip there eats the day's own title at 360px. `--amber-deep`
            for ink, never `--amber`, which as text on paper is 1.31:1 and is a fill. */}
        {isNow ? <i className="wp-dayhead-now">{t.common.now}</i> : null}
      </span>
      <span className="wp-dayhead-copy">
        {/* Composed by the caller with its values already isolated, so this must not sniff. */}
        <strong>{title}</strong>
        {lines?.map((line, index) => (
          <Fragment key={index}>{line}</Fragment>
        ))}
      </span>
      {trailing ? <span className="wp-dayhead-caret">{trailing}</span> : null}
    </>
  );
  return (
    <div className={cls}>
      {shot ? <Shot shot={shot} /> : null}
      {as === 'button' ? (
        <button
          type="button"
          className="wp-dayhead-head"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          {head}
        </button>
      ) : (
        <div className="wp-dayhead-head">{head}</div>
      )}
      {/* **The day's action is a footer ROW, not a cell** (ADR-0219 §2). Round 1 drew an
          icon-only `+` in the trailing cell and the owner asked what it was; round 2 drew the
          labelled button in that cell and the render ellipsised the day's own name at 360px.
          A head's width belongs to its title. Absent entirely on a read-only day. */}
      {facts?.length || action ? (
        <div className="wp-dayhead-foot">
          {facts?.length ? (
            <div className="wp-dayhead-facts">
              {facts.map((fact, index) => (
                <Fragment key={index}>{fact}</Fragment>
              ))}
            </div>
          ) : null}
          {action}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The shot, and the one structural decision in it: **the button holds the image, the caption
 * sits over it.** A `<figcaption>` inside a `<button>` is invalid HTML (a button's content
 * model is phrasing content), and the caption is not the tap target anyway — so the figure
 * stays a figure, the picture is the control, and the caption is a non-interactive overlay the
 * tap passes straight through (`pointer-events: none`, `day-head.css`).
 */
function Shot({ shot }: { shot: DayHeadShot }) {
  const img = (
    <img src={shot.url} alt={shot.of} loading={shot.eager ? 'eager' : 'lazy'} decoding="async" />
  );
  return (
    <figure className="wp-dayhead-shot">
      {shot.onOpen ? (
        <button type="button" aria-label={t.map.know.fullPicture} onClick={shot.onOpen}>
          {img}
        </button>
      ) : (
        img
      )}
      {/* **On the photograph, under a scrim** (ADR-0167 §4's second half, ADR-0219 §6): the
          picture is a band with nothing beneath it, so a line under it would cost ~16px on a
          head already 194px tall, and the scrim is black over the picture in both themes. */}
      <figcaption>
        <strong>{autoIsolate(shot.of)}</strong>
        <span>{autoIsolate(shot.credit)}</span>
      </figcaption>
    </figure>
  );
}

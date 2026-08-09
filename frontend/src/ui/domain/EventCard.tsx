// EventCard (design-language: VerbRow) — the day-timeline event card, extracted
// faithfully from screens/DayView.tsx's inline `EventItem` (~489). It preserves
// the ADR-0011 hard/soft triple-coding EXACTLY: hard = solid card + amber
// `🔒 קשיח` tag + amber `now` ring + mono confirmation code + an edit-guard
// warning; soft = dashed + diagonal-hatch + lighter type + the free verbs. The
// phase (upcoming/now/passed/done) is derived by the screen (from the clock,
// never stored, ADR-0043) and passed in, so the card stays presentational.
//
// A passed-but-unmarked soft event settles inline ("we did this / skip"); a done
// event's ✓ doubles as one-tap undo; the ±nudge adapts to phase; Tier-2 edits
// (swap/edit/delete) sit behind the `⋯` sheet (ADR-0025). Verbs arrive as
// callbacks — no `verbs` hook, no trip-state.
//
// Domain UI may use the shared copy/icon/time helpers (not state); it does.
import { useState, type ReactNode } from 'react';
import { clockRange, formatTime, crossesMidnightZoned } from '../../lib/time';
import type { EventZones } from '../../lib/places';
import { ZoneShiftPill } from '../ZoneShiftPill';
import { CONTROL_ICON, DELAY_STEP_MINUTES, DOT_SEPARATOR } from '../../constants';
import { Icon } from '../Icon';
import { TitleLabel } from '../TitleLabel';
import { RowManageSheet, type RowAction } from './ListRow';
import { PlaceBadge } from './PlaceBadge';
import { SettleControl } from './SettleControl';
import { NoteMark } from './NoteMark';
import { DocumentMark } from './DocumentMark';
import { t } from '../../i18n/he';
import './event-card.css';

export type EventKind = 'hard' | 'soft';
export type EventPhaseName = 'upcoming' | 'now' | 'passed' | 'done';

export interface EventCardProps {
  /** Event icon (emoji content). */
  icon: ReactNode;
  /** Title node — screen passes <EventTitle/> or a string. */
  title: ReactNode;
  /** The plain stored title, for the Tier-2 menu header — rendered there through
   *  `TitleLabel`, so a stored route reads as a route rather than raw text. */
  titleText: string;
  /** Full confirmation code incl. prefix (shown in meta + hard-edit warning). */
  code?: string;
  kind: EventKind;
  phase: EventPhaseName;
  /** Per-entity sync marker node (U-04, ADR-0080/0091). The screen passes
   *  `<EntitySyncBadge id=… />`, which is silent when synced and shows a
   *  pending/failed cloud otherwise — so a settled day stays uncluttered. Renders
   *  on the meta line (below the title) so it can never reflow the title. */
  sync?: ReactNode;
  /** Fades the card to read as provisional while a write is in transit
   *  (ADR-0092): the screen passes `useUnsynced(id)`. Pending only — a failed
   *  card stays full-opacity so its `cloud-bang` keeps drawing attention. */
  unsynced?: boolean;
  /** A read-only past day (ADR-0029): create/edit/move locked; settle stays. */
  readOnly?: boolean;
  isOpen: boolean;
  onToggle: () => void;
  startsAt?: string;
  endsAt?: string;
  /** Base/ambient timezone — the fallback when `zones` is absent, and the zone
   *  the conflict-flag time reads in. */
  tz: string;
  /** Per-event display zones + the time-shift to surface (ADR-0107 multi-zone).
   *  Absent → the event renders wholly in `tz` with no shift pill (single-zone
   *  trips, and surfaces not yet zone-wired). Present → start/end render in their
   *  own zones and, when `deltaMinutes` is set, an amber `🕐 +6 ש׳` shift pill
   *  shows how far the clock jumps (destination vs origin for a crossing, else
   *  vs the day's ambient zone). */
  zones?: EventZones;
  /** Elapsed-duration label to show under the time (ADR-0107/0084). The screen
   *  passes it for transport + zone-shifted rows, where the raw start–end can
   *  misread the real span; absent otherwise. */
  duration?: string;
  /** The first hard conflict, if any (drives the amber conflict flag). */
  conflict?: { title: string; startsAt: string };
  /** "כולל N" contents count on an envelope event that nests others. */
  nestedCount?: number;
  /** **How many notes this event carries** (ADR-0152 §6c). There is no `meta` prop to pass
   *  a node through — the meta line is assembled inside this component from two string
   *  props — so the mark needs its own. A count only past 1: a `1` beside a glyph that
   *  already means "a note" is a digit that says nothing. */
  notes?: number;
  /** **How many DOCUMENTS this event carries** (ADR-0174 §1) — its own and its booking's,
   *  since a linked pair is one context. Same rule as `notes`: a count only past 1, and the
   *  mark is a read-only indicator whose reach is this card's own expansion. */
  documents?: number;
  /** **Where an event's attached documents are READ** (ADR-0174 §3) — the connected
   *  `<HostDocuments>`, rendered inside the card this row expands, ABOVE the notes.
   *
   *  A node rather than the component, for `notesSlot`'s reason: this file is `ui/domain/`.
   *  Above the notes because a document is a thing you need and a note is something about
   *  it, and because the app must not teach one order on the form and another on the read. */
  documentsSlot?: ReactNode;
  /** **Where an event's notes are READ and WRITTEN** (ADR-0152 §6's 2026-08-02 amendment) —
   *  the connected `<HostNotes>`, rendered inside the card this row EXPANDS, under its verbs.
   *
   *  A node rather than the component, because this file is `ui/domain/`: presentational,
   *  all data via props, no `state` imports. The screen supplies it already connected.
   *
   *  **It was in the `⋯` sheet for one release and that was wrong** (owner: notes "don't
   *  belong" in a menu). A row menu is a list of VERBS (ADR-0138 §1); notes are content, and
   *  content read from inside a menu is content nobody finds. What put it there was
   *  `.wp-event-actions`'s fixed `max-height: 220px`, which clips three notes — so the cap
   *  moved instead (`event-card.css`), which is the change that actually had to happen. */
  notesSlot?: ReactNode;
  // Verbs (callbacks; presence + phase gate which buttons show, faithfully).
  // `onNavigate` (directions) and `onShowOnMap` (view the place) are the two
  // location actions — each present only when the event has a mappable place
  // (coordinates); absent → that button is dropped, since there's nowhere to go.
  onNavigate?: () => void;
  onShowOnMap?: () => void;
  onDone?: () => void;
  onSkip?: () => void;
  onDelay?: () => void;
  onEarlier?: () => void;
  onOnWay?: () => void;
  onRestore?: () => void;
  /** `החלף` — open the slot's own chooser: pick a replacement, this event goes to the shelf,
   *  the replacement takes its exact start and length (ADR-0161 §6). Soft events only, and
   *  absent where the day-scope gate forbids a write (a past day, ADR-0029). */
  onReplace?: () => void;
  /** "Back to the shelf" — the event becomes a shelf idea, keeping its title,
   *  place, category and date (ADR-0116 §4). Soft events only; absent where the
   *  day-scope gate forbids it (a past day, ADR-0029). */
  onPark?: () => void;
  onEdit?: () => void;
  onRemove?: () => void;
}

/* **THE ROW'S META LINE CARRIES NO TEXT AT ALL** (owner, 2026-08-09: _"events and bookings
   should only show the glyphs in their row, no names or ids"_), which retires ADR-0152 §6c's
   `eventMetaParts` outright rather than narrowing it.

   §6c existed to decide **what gives way when the line is full** — it dropped the place name
   on a row carrying both a confirmation code and a mark, because the line is exactly full at
   390px and a two-character stub is noise rather than information. That is a problem about
   TEXT on this line, and there is none left: the place name and the confirmation code both
   come off and the line keeps the sync badge and the marks.

   **What made the call rather than taste:** a real confirmation code is not `הזמנה MN-4471`,
   it is `הזמנה #MEGAZIP-T141215488`. Reported from a device, where it overflowed the row and
   stranded the separator beside a place name squeezed to zero width — §6c's own "a stub is
   noise" failure, arriving through the one part of the line §6c had protected as
   un-shrinkable.

   **Neither fact is lost, which is what makes it affordable.** The place is the badge, which
   is also the way to its pin; the code is one tap away in the card this row opens, where the
   hard-edit warning already prints it, and on `BookingDetail`. The row says what this is,
   when it is, and **that there is something here** — which is exactly what a glyph says. */

export function EventCard(props: EventCardProps) {
  const {
    icon,
    title,
    titleText,
    code,
    kind,
    phase,
    sync,
    unsynced,
    readOnly = false,
    isOpen,
    onToggle,
    startsAt,
    endsAt,
    tz,
    zones,
    duration,
    conflict,
    nestedCount,
    notes,
    documents,
    documentsSlot,
    notesSlot,
    onNavigate,
    onShowOnMap,
    onDone,
    onSkip,
    onDelay,
    onEarlier,
    onOnWay,
    onRestore,
    onReplace,
    onPark,
    onEdit,
    onRemove,
  } = props;

  const isHard = kind === 'hard';
  const isDone = phase === 'done';
  const isNow = phase === 'now';
  const isPassed = phase === 'passed';
  // A passed-but-unmarked soft event settles inline (the honest "still on?"
  // moment, ADR-0027/0043); hard events aren't settled this way.
  const showSettle = !isHard && isPassed;

  const [menuOpen, setMenuOpen] = useState(false);
  const runAction = (fn?: () => void) => {
    setMenuOpen(false);
    fn?.();
  };

  // **THE KIND CHIP IS GONE; THE STATUS CHIP STAYS** (ADR-0178 §4). The hard mark moved
  // to the when line, where ADR-0011's commitment points, and soft is already the card's
  // dashed border. What is left in this slot is the settle/phase RECORD (ADR-0043/0044),
  // which no border says.
  //
  // The build kept ONE thing §4 did not mention, and it is the reason the plain-soft arm
  // does not simply return null: `softNow` is not the kind, it is `עכשיו` — the fact this
  // whole tab is read for. So an upcoming soft row loses its chip exactly as Plan's does,
  // and a soft row happening NOW keeps one.
  //
  // The when line is where the lock lives now, so a card with no time at all would lose
  // the mark entirely — an unplaced commitment is exactly that row. It keeps the chip.
  const hasWhenSlot = !!startsAt;
  const tag = isDone ? (
    <span className="wp-event-tag-done">
      <Icon name="check" /> {t.event.didThis}
    </span>
  ) : isHard ? (
    hasWhenSlot ? null : (
      <span className="wp-event-tag-hard">
        <Icon name="lock" /> {t.event.hard}
      </span>
    )
  ) : isPassed ? (
    <span className="wp-event-tag-phase">{t.event.notMarked}</span>
  ) : isNow ? (
    <span className="wp-event-tag-soft">{t.event.softNow}</span>
  ) : null;

  const cls = [
    'wp-event',
    kind === 'soft' ? 'soft' : '',
    isNow ? 'now' : '',
    isDone ? 'done' : '',
    isPassed && !isDone ? 'passed' : '',
    unsynced ? 'unsynced' : '',
    isOpen && !showSettle ? 'open' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const titleBlock = (
    <span className="wp-event-main">
      <span className="wp-event-t">
        {/* Clamp the title to keep a long route name (e.g. two full airport
            names) from blowing up the card; the tag stays a sibling, so it's
            never clipped, flowing to the next line when the title is long. */}
        <span className="wp-event-title-txt">{title}</span>
        {tag}
        {nestedCount !== undefined && (
          <span className="wp-event-nest-note">{t.day.contains(nestedCount)}</span>
        )}
      </span>
      {/* ONE `nowrap` line, and its text is ELEMENTS rather than a joined string
          (ADR-0152 §6c). Both are load-bearing: `flex-wrap: wrap` wraps BEFORE it
          shrinks, so a shrinkable span alone measured identically to no fix at all —
          only `nowrap` returns the row to its height. And flex cannot protect part of
          a text node, so the code has to be its own item or the ellipsis eats the
          confirmation code, which is the fact the row is opened for. */}
      {/* GLYPHS ONLY (ADR-0174 §8) — no place name, no confirmation code.
          **It still renders unconditionally**, and that is not an oversight: `sync` is an
          opaque node the screen passes (`<EntitySyncBadge/>`, which is silent when synced),
          so this component cannot tell whether it will draw anything. Gating the line on
          "is there a glyph" therefore took the PENDING badge off with it — caught in e2e,
          where the line was still there on an unmarked row and the assertion that it had
          gone was the thing that was wrong. Empty, it is a flex box with no children: 0px
          plus its 3px top margin. */}
      <span className="wp-event-m">
        {sync}
        <NoteMark count={notes} />
        <DocumentMark count={documents} />
      </span>
      {conflict && (
        <span className="wp-event-conflict-flag">
          <Icon name="warn" /> {t.event.conflictWarn.before}
          <TitleLabel title={conflict.title} />{' '}
          {t.event.conflictWarn.after(formatTime(conflict.startsAt, tz))}
        </span>
      )}
    </span>
  );

  const startZone = zones?.startZone ?? tz;
  const endZone = zones?.endZone ?? tz;
  const timeBlock = startsAt && (
    <span className="wp-event-time">
      {isHard && (
        <span className="wp-event-timelock" aria-label={t.event.hard} title={t.event.hard}>
          <Icon name="lock" />
        </span>
      )}
      <span dir="auto">
        {formatTime(startsAt, startZone)}
        {endsAt && `–${formatTime(endsAt, endZone)}`}
        {endsAt && crossesMidnightZoned(startsAt, endsAt, startZone, endZone) && (
          <sup className="wp-event-xmid" title={t.event.nextDay}>
            +1
          </sup>
        )}
      </span>
      {(duration || zones?.deltaMinutes != null) && (
        <span className="wp-event-timemeta">
          {duration && <span className="wp-event-dur">{duration}</span>}
          {zones?.deltaMinutes != null && <ZoneShiftPill minutes={zones.deltaMinutes} />}
        </span>
      )}
    </span>
  );

  // Settle variant: a calm, non-expanding card + the inline settle strip.
  if (showSettle) {
    return (
      <div className={cls}>
        <div className="wp-event-face static">
          <PlaceBadge className="wp-event-badge" onShowOnMap={onShowOnMap}>
            {icon}
          </PlaceBadge>
          {titleBlock}
          {timeBlock}
        </div>
        <SettleControl variant="prompt" onDone={() => onDone?.()} onSkip={() => onSkip?.()} />
      </div>
    );
  }

  const menuActions: RowAction[] = [];
  // **`החלף` needs a slot to be taken on** (ADR-0161 §6), and an untimed row has none —
  // §10 says so outright: an untimed event holds no position of its own. Offering it anyway
  // asked the shelf to be ranked against a slot with no clock, and the day view went blank on
  // an `Invalid time value` (reported 2026-08-04). The rule is the same shape as the two
  // beside it, and as `onNavigate`'s "no location, no button".
  if (!isDone && !isHard && startsAt && onReplace) {
    menuActions.push({
      label: t.actions.swap,
      icon: CONTROL_ICON.swap,
      onSelect: () => runAction(onReplace),
    });
  }
  if (!isDone && !isHard && onPark) {
    menuActions.push({
      label: t.actions.toShelf,
      icon: CONTROL_ICON.toShelf,
      onSelect: () => runAction(onPark),
    });
  }
  if (onEdit) {
    menuActions.push({
      label: t.actions.edit,
      icon: CONTROL_ICON.edit,
      onSelect: () => runAction(onEdit),
    });
  }
  if (onRemove) {
    menuActions.push({
      label: t.actions.delete,
      icon: CONTROL_ICON.trash,
      danger: true,
      onSelect: () => runAction(onRemove),
    });
  }

  // The menu's subject line (ADR-0138 §3): kind, then the slot it holds. Both are
  // what decide whether the verb you are about to pick is even possible — a hard
  // event cannot be parked or swapped — so they belong above the list, not only
  // on the card behind the scrim. The time is a numeric run inside RTL copy and
  // takes its own isolate (ADR-0118).
  const menuSubject = [
    isHard ? t.event.hard : t.event.soft,
    startsAt && clockRange(formatTime(startsAt, startZone), endsAt && formatTime(endsAt, endZone)),
  ]
    .filter(Boolean)
    .join(` ${DOT_SEPARATOR} `);

  // `ניווט` stays in the action row: it is a live, on-the-ground verb, so it belongs
  // with the verbs, and it renders only when the event has a mappable place
  // (ADR-0109 amendment). `מפה` left this row for the badge (`PlaceBadge`), so it is
  // reachable without expanding the card.
  const navAct = onNavigate && (
    <button type="button" className="wp-event-act go" onClick={onNavigate}>
      {t.actions.navigate}
    </button>
  );

  return (
    <div className={cls}>
      <button type="button" className="wp-event-face" onClick={onToggle} aria-expanded={isOpen}>
        <PlaceBadge className="wp-event-badge" onShowOnMap={onShowOnMap}>
          {icon}
        </PlaceBadge>
        {titleBlock}
        {/* The done ✓ doubles as one-tap undo (ADR-0043): a role=button inside
            the face that stops propagation so it restores without toggling. */}
        {isDone && onRestore && (
          <span
            className="wp-event-check btn"
            role="button"
            tabIndex={0}
            aria-label={t.actions.undoDone}
            title={t.actions.undoDone}
            onClick={(e) => {
              e.stopPropagation();
              onRestore();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onRestore();
              }
            }}
          >
            <span className="mark" aria-hidden="true">
              <Icon name="check" />
            </span>
            <span className="undo" aria-hidden="true">
              <Icon name="undo" />
            </span>
          </span>
        )}
        {timeBlock}
        <span className="wp-event-chev" aria-hidden="true">
          <Icon name="caret" dir="down" />
        </span>
      </button>
      <div className="wp-event-actions">
        {/* One wrapper, and it is load-bearing: a collapsing grid track can only shrink a
            child that is allowed to, so this carries `min-height: 0` and the overflow the
            old `max-height` rule owned. */}
        <div className="wp-event-actions-in">
          <div className="wp-event-act-row">
            {isDone ? (
              <>
                <button type="button" className="wp-event-act" onClick={onRestore}>
                  {t.actions.restore}
                </button>
                {navAct}
              </>
            ) : isHard ? (
              <>
                {navAct}
                {!readOnly && (
                  <>
                    <button type="button" className="wp-event-act" onClick={onOnWay}>
                      {t.actions.onWay}
                    </button>
                    <button type="button" className="wp-event-act" onClick={onDelay}>
                      {t.actions.delayBy(DELAY_STEP_MINUTES)}
                    </button>
                  </>
                )}
              </>
            ) : (
              <>
                <button type="button" className="wp-event-act" onClick={onDone}>
                  {t.actions.done}
                </button>
                <button type="button" className="wp-event-act" onClick={onSkip}>
                  {t.actions.skip}
                </button>
                {/* The nudge adapts to phase (ADR-0043): both ways upcoming; +30
                  only for a now event (can't pull it into the past). */}
                <div className="wp-event-act stepper">
                  {!isNow && (
                    <button
                      type="button"
                      className="step"
                      onClick={onEarlier}
                      aria-label={t.actions.earlierBy(DELAY_STEP_MINUTES)}
                    >
                      −
                    </button>
                  )}
                  <span className="step-label">{t.actions.stepMinutes(DELAY_STEP_MINUTES)}</span>
                  <button
                    type="button"
                    className="step"
                    onClick={onDelay}
                    aria-label={t.actions.delayBy(DELAY_STEP_MINUTES)}
                  >
                    +
                  </button>
                </div>
                {navAct}
              </>
            )}
            {!readOnly && menuActions.length > 0 && (
              <span className="wp-event-act-row-end">
                <button
                  type="button"
                  className="wp-event-act icon-only more"
                  onClick={() => setMenuOpen(true)}
                  aria-label={t.actions.more}
                >
                  <Icon name="more" />
                </button>
              </span>
            )}
          </div>
          {isHard && (
            <div className="wp-event-hard-warn">
              <Icon name="warn" /> {t.event.hardWarn} {code && <span dir="auto">{code}</span>}
            </div>
          )}
          {/* The body, under the verbs: what the group knows about this event, where the row
              that carries the mark opens. Mounted only while the card is open, because the
              strip is in the DOM at every height — a day of twelve events would otherwise
              hold twelve connected note sections nobody is looking at. */}
          {/* Documents above notes, the same order the form and every other read surface
              use (ADR-0174 §3). Mounted only while open, for `notesSlot`'s own reason: the
              strip is in the DOM at every height, so a day of twelve events would otherwise
              hold twelve connected sections nobody is looking at. */}
          {isOpen && documentsSlot}
          {isOpen && notesSlot}
        </div>
      </div>
      {menuOpen && (
        <RowManageSheet
          // The menu header is a visible title: a flight names its route there the
          // same way the card does, not as the raw stored string.
          title={<TitleLabel title={titleText} />}
          subject={menuSubject}
          actions={menuActions}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </div>
  );
}

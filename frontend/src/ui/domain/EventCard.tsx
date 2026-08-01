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
import { formatTime, crossesMidnightZoned } from '../../lib/time';
import type { EventZones } from '../../lib/places';
import { ZoneShiftPill } from '../ZoneShiftPill';
import { CONTROL_ICON, DELAY_STEP_MINUTES, DOT_SEPARATOR } from '../../constants';
import { ltrIsolate } from '../../lib/bidi';
import { Icon } from '../Icon';
import { TitleLabel } from '../TitleLabel';
import { RowManageSheet, type RowAction } from './ListRow';
import { PlaceBadge } from './PlaceBadge';
import { SettleControl } from './SettleControl';
import { NoteMark } from './NoteMark';
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
  placeName?: string;
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
  onSwap?: () => void;
  /** "Back to the shelf" — the event becomes a shelf idea, keeping its title,
   *  place, category and date (ADR-0116 §4). Soft events only; absent where the
   *  day-scope gate forbids it (a past day, ADR-0029). */
  onPark?: () => void;
  onEdit?: () => void;
  onRemove?: () => void;
}

/**
 * **What the day row's meta line says, as a rule rather than a CSS accident** (ADR-0152
 * §6c). Exported and pure precisely so it can be tested: the alternative — letting the
 * ellipsis decide — is behaviour that only appears at one screen width.
 *
 * The line is exactly full at 390px on a coded row, so a mark asks for width that does not
 * exist. **A row carrying both a confirmation code and a note mark drops its place name
 * entirely** rather than degrading it to a two-character stub: `ש..` is noise, not
 * information, and the district is one tap away in the expanded card. Deterministic and
 * testable; a stub is neither.
 *
 * Rejected, with their costs: keep the stub (permanent noise); move the mark to the title
 * line (the hard/soft tag already flows to a second line on a long title, so it
 * reintroduces the height problem); drop the code instead (it is the glanceable fact the
 * row exists for).
 */
export function eventMetaParts({
  placeName,
  code,
  notes,
}: {
  placeName?: string;
  code?: string;
  notes?: number;
}): { placeName?: string; separator: boolean; code?: string } {
  const hasMark = notes !== undefined && notes > 0;
  const showPlace = placeName && !(code && hasMark);
  return {
    placeName: showPlace ? placeName : undefined,
    // The separator is its own item so it leaves with the place name rather than
    // stranding a leading `·` on a code-only row.
    separator: !!showPlace && !!code,
    code,
  };
}

export function EventCard(props: EventCardProps) {
  const {
    icon,
    title,
    titleText,
    placeName,
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
    onNavigate,
    onShowOnMap,
    onDone,
    onSkip,
    onDelay,
    onEarlier,
    onOnWay,
    onRestore,
    onSwap,
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

  const codeText = code ? `${t.event.bookingLabel} ${code}` : undefined;
  const metaParts = eventMetaParts({ placeName, code: codeText, notes });

  const tag = isDone ? (
    <span className="wp-event-tag-done">
      <Icon name="check" /> {t.event.didThis}
    </span>
  ) : isHard ? (
    <span className="wp-event-tag-hard">
      <Icon name="lock" /> {t.event.hard}
    </span>
  ) : isPassed ? (
    <span className="wp-event-tag-phase">{t.event.notMarked}</span>
  ) : (
    <span className="wp-event-tag-soft">{isNow ? t.event.softNow : t.event.soft}</span>
  );

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
      <span className="wp-event-m">
        {sync}
        {metaParts.placeName && <span className="wp-event-m-txt">{metaParts.placeName}</span>}
        {metaParts.separator && <span className="wp-event-m-sep">·</span>}
        {metaParts.code && <span className="wp-event-m-code">{metaParts.code}</span>}
        <NoteMark count={notes} />
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
  if (!isDone && !isHard && onSwap) {
    menuActions.push({
      label: t.actions.swap,
      icon: CONTROL_ICON.swap,
      onSelect: () => runAction(onSwap),
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
    startsAt &&
      ltrIsolate(
        formatTime(startsAt, startZone) + (endsAt ? `–${formatTime(endsAt, endZone)}` : ''),
      ),
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

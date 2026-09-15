// The day card's quick-action row — one renderer for the one order (ADR-0228).
//
// `event-actions.ts` decides WHICH verbs a row carries and in what sequence; this file
// decides what each one looks like, once. A button's tone, its label, its touch target
// and the `⋯` end slot are therefore per-VERB rather than per-kind, which is the half of
// the drift the spec alone does not stop: three arms could still have drawn the same verb
// three ways.
//
// Presentational, like the card that hosts it: callbacks in, no trip state.
import { CONTROL_ICON, DELAY_STEP_MINUTES } from '../../constants';
import { Icon } from '../Icon';
import { RowManageSheet, type RowAction } from './ListRow';
import { TitleLabel } from '../TitleLabel';
import { t } from '../../i18n/he';
import { EVENT_ACTION, eventQuickActions, type EventActionContext } from './event-actions';
import type { EventKind, EventPhaseName } from './event-phase';
import './event-actions.css';

export interface EventActionHandlers {
  onDone?: () => void;
  onSkip?: () => void;
  onRestore?: () => void;
  onDelay?: () => void;
  onEarlier?: () => void;
  onOnWay?: () => void;
  onNavigate?: () => void;
}

export interface EventActionsProps extends EventActionHandlers {
  kind: EventKind;
  phase: EventPhaseName;
  readOnly: boolean;
  /** The passed card's prompt strip is already asking — see `EventActionContext`. */
  settleAsked: boolean;
  /** Tier-2 edits, in the `⋯` sheet (ADR-0025/0138). Empty → no menu button. */
  menuActions: RowAction[];
  /** The sheet's header, as the card writes it (a flight reads as its route). */
  menuTitle: string;
  /** The sheet's subject line (ADR-0138 §3). */
  menuSubject: string;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
}

export function EventActions(props: EventActionsProps) {
  const { kind, phase, readOnly, settleAsked, menuActions, menuOpen, onMenuOpenChange } = props;

  const ctx: EventActionContext = {
    kind,
    phase,
    readOnly,
    settleAsked,
    available: {
      // The settle slot needs BOTH halves: one answer without the other is not a pair,
      // and `SettleControl` makes the same demand of its own hosts.
      [EVENT_ACTION.SETTLE]: !!props.onDone && !!props.onSkip,
      [EVENT_ACTION.RESTORE]: !!props.onRestore,
      [EVENT_ACTION.NUDGE]: !!props.onDelay,
      [EVENT_ACTION.ON_WAY]: !!props.onOnWay,
      [EVENT_ACTION.NAVIGATE]: !!props.onNavigate,
    },
  };

  const showMenu = !readOnly && menuActions.length > 0;

  return (
    <>
      <div className="wp-event-act-row">
        <div className="wp-event-act-verbs">
          {eventQuickActions(ctx).map((id) => (
            <Act key={id} id={id} {...props} />
          ))}
        </div>
        {showMenu && (
          <span className="wp-event-act-row-end">
            <button
              type="button"
              className="wp-event-act icon-only more"
              onClick={() => onMenuOpenChange(true)}
              aria-label={t.actions.more}
            >
              <Icon name={CONTROL_ICON.more} />
            </button>
          </span>
        )}
      </div>
      {menuOpen && (
        <RowManageSheet
          title={<TitleLabel title={props.menuTitle} />}
          subject={props.menuSubject}
          actions={menuActions}
          onClose={() => onMenuOpenChange(false)}
        />
      )}
    </>
  );
}

/** One verb, drawn the one way. Everything kind-shaped is upstream in the spec, so this
 *  switch only ever answers "what does THIS verb look like". */
function Act({
  id,
  phase,
  onDone,
  onSkip,
  onRestore,
  onDelay,
  onEarlier,
  onOnWay,
  onNavigate,
}: { id: string; phase: EventPhaseName } & EventActionHandlers) {
  switch (id) {
    case EVENT_ACTION.SETTLE:
      return (
        <>
          <button type="button" className="wp-event-act" onClick={onDone}>
            {t.actions.done}
          </button>
          <button type="button" className="wp-event-act" onClick={onSkip}>
            {t.actions.skip}
          </button>
        </>
      );
    case EVENT_ACTION.RESTORE:
      return (
        <button type="button" className="wp-event-act" onClick={onRestore}>
          {t.actions.restore}
        </button>
      );
    case EVENT_ACTION.NUDGE:
      // The nudge adapts to phase, not to kind (ADR-0043 §3): both ways on an upcoming
      // row, `+` only on a now row — pulling it earlier would land in the past, which
      // `applyDelay` refuses anyway. `−` also needs a handler to fire.
      return (
        <div className="wp-event-act stepper">
          {phase !== 'now' && onEarlier && (
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
      );
    case EVENT_ACTION.ON_WAY:
      return (
        <button type="button" className="wp-event-act" onClick={onOnWay}>
          {t.actions.onWay}
        </button>
      );
    case EVENT_ACTION.NAVIGATE:
      return (
        <button type="button" className="wp-event-act go" onClick={onNavigate}>
          {t.actions.navigate}
        </button>
      );
    default:
      return null;
  }
}

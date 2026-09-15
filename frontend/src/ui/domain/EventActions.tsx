// The day card's quick-action band — one renderer for the one order (ADR-0228).
//
// `event-actions.ts` decides WHICH verbs a row carries and in what sequence; this file
// decides what each one looks like, once. A button's tone, its label and its touch target
// are therefore per-VERB rather than per-kind, which is the half of the drift the spec alone
// does not stop: three arms could still have drawn the same verb three ways.
//
// **It renders nothing when there is nothing to offer**, which is the amendment's shape:
// a row on another day has no quick action, and an empty band would be a strip of padding
// under every card on a future day. The `⋯` is not in here to keep it company — Tier-2
// editing lives on the card face now, in one fixed place on every row.
//
// Presentational, like the card that hosts it: callbacks in, no trip state.
import { DELAY_STEP_MINUTES } from '../../constants';
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
  /** Whether this row's day is today — see `EventActionContext`. */
  today: boolean;
  readOnly: boolean;
  /** The passed card's prompt strip is already asking — see `EventActionContext`. */
  settleAsked: boolean;
}

export function EventActions(props: EventActionsProps) {
  const { kind, phase, today, readOnly, settleAsked } = props;

  const ctx: EventActionContext = {
    kind,
    phase,
    today,
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

  const actions = eventQuickActions(ctx);
  if (actions.length === 0) return null;

  return (
    <div className="wp-event-act-row">
      {actions.map((id) => (
        <Act key={id} id={id} {...props} />
      ))}
    </div>
  );
}

/** One verb, drawn the one way. Everything kind- or proximity-shaped is upstream in the
 *  spec, so this switch only ever answers "what does THIS verb look like". */
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

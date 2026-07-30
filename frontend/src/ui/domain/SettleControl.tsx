// ONE settle control, three hosts — the extraction ADR-0139's Consequences called
// for (CLAUDE.md rule 8). Settling was hand-rolled in `EventCard`'s strip,
// `PlanDay`'s archive chooser and the Map's reference cluster; ADRs 0078/0079/0094
// /0095 all exist only to undo that shape of pile-up, and the third copy is what
// forces this one.
//
// WHAT IS SHARED IS THE VOCABULARY, NOT THE GEOMETRY. A full-width prompt on a
// card with room and a 32px cluster on a 40px row are not the same widget, so the
// `variant` names the host's density and the host keeps its own placement. What
// stops being per-host is everything that carries meaning: which verbs exist, the
// words they use, the mark each one wears, the hues they pair on, and what a
// settled event looks like.
//
// The write path is untouched — `verbs.done`/`skip`/`restore` already go through
// `applySetStatus`, the outbox and an undo toast. This is a renderer.
import type { MouseEvent } from 'react';
import { EVENT_STATUS } from '@waypoint/shared';
import { Icon } from '../Icon';
import { t } from '../../i18n/he';
import './settle-control.css';

/** What a human said about an event. Absent = nobody has answered yet — ADR-0117 §1's
 *  third state, and the commonest one. Tied to `EVENT_STATUS` so the two cannot drift. */
export type SettleOutcome = typeof EVENT_STATUS.DONE | typeof EVENT_STATUS.SKIPPED;

/** The host's density. Not three controls — three sizes of one.
 *  - `prompt`  — the Trip-mode card's inline strip, which asks in words (ADR-0043).
 *  - `sheet`   — Plan mode's archive chooser, two equal answers in a bottom sheet (ADR-0044).
 *  - `compact` — the Map's reference row, icon-only beside a label that needs the width
 *                (ADR-0139 §3); there the ASKING is the row's amber wash, not words. */
export type SettleVariant = 'prompt' | 'sheet' | 'compact';

export function SettleControl({
  variant,
  outcome,
  onDone,
  onSkip,
  onUndo,
}: {
  variant: SettleVariant;
  /** Present → the pair is replaced by the record plus the one verb left. */
  outcome?: SettleOutcome;
  onDone: () => void;
  onSkip: () => void;
  /** Back to `planned` — the shipped `verbs.restore`. Required wherever `outcome` is passed. */
  onUndo?: () => void;
}) {
  // Settling records an outcome; it is never also a navigation. The Map's reference row
  // nests inside two tap targets (the row opens the day, the row around it selects the
  // place) and the other two hosts have nothing above to trigger — so this is one rule
  // here rather than a prop the third caller has to remember to pass.
  const tap = (fn?: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    fn?.();
  };
  const compact = variant === 'compact';
  const cls = `wp-settle ${variant}`;

  // ALREADY ANSWERED. Every event is settleable rather than only the passed ones, which is
  // what makes this branch reachable at all: gating the controls on "passed and unanswered"
  // would delete the undo the instant it was earned (ADR-0139 §2).
  if (outcome) {
    const done = outcome === EVENT_STATUS.DONE;
    return (
      <span className={cls}>
        <span className={'wp-settle-tag ' + (done ? 'ok' : 'miss')}>
          <Icon name={done ? 'check' : 'skip'} /> {done ? t.event.didThis : t.event.skipped}
        </span>
        <button
          type="button"
          className="wp-settle-btn undo"
          title={t.actions.undoSettle}
          aria-label={t.actions.undoSettle}
          onClick={tap(onUndo)}
        >
          <Icon name="undo" />
        </button>
      </span>
    );
  }

  return (
    <span className={cls}>
      {variant === 'prompt' && <span className="wp-settle-ask">{t.day.settleAsk}</span>}
      <SettleVerb
        kind="done"
        label={t.actions.wasThere}
        icon="check"
        compact={compact}
        onClick={tap(onDone)}
      />
      <SettleVerb
        kind="skip"
        label={t.event.skipped}
        icon="skip"
        compact={compact}
        onClick={tap(onSkip)}
      />
    </span>
  );
}

/** The two verbs differ only in their kind, word and mark — writing them once is what keeps
 *  them a symmetric pair rather than a ✓ with a hue and a ✕ without one. */
function SettleVerb({
  kind,
  label,
  icon,
  compact,
  onClick,
}: {
  kind: 'done' | 'skip';
  label: string;
  icon: 'check' | 'skip';
  compact: boolean;
  onClick: (e: MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      className={`wp-settle-btn ${kind}`}
      // Icon-only needs the name spelled out; a labelled button already has one.
      title={compact ? label : undefined}
      aria-label={compact ? label : undefined}
      onClick={onClick}
    >
      <Icon name={icon} />
      {!compact && <span className="wp-settle-word">{label}</span>}
    </button>
  );
}

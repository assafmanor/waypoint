// ONE ordered quick-action spec for every day-timeline event, hard and soft alike
// (ADR-0228). The row used to be three hand-written JSX arms — `isDone ? … : isHard ? …
// : …` — each with its own button list in its own order, which is how `ניווט` came to
// LEAD a booking and TRAIL a soft stop, how a hard row got a one-way `דחה 30 דק׳` where
// a soft row got the ±stepper, and how a booking ended up with no way to be marked done
// at all. Nothing decided any of that; three separate lists drifted.
//
// So the ORDER lives here, once, and a kind is no longer a branch: an action is admitted
// by its own `when`, and a specialised verb is one entry with a narrower `when` rather
// than a second list beside this one. Two rows in the same state therefore cannot differ
// in which verbs they carry or where those verbs sit — there is nowhere left for them to
// disagree.
//
// Pure and presentational: no trip state, no callbacks, no React. The card asks what to
// draw and draws it (`EventActions`), which is what makes the order testable on its own.
import type { EventKind, EventPhaseName } from './event-phase';

/** The row's verbs, as ids. `more` is not one of them: the `⋯` is Tier-2 editing
 *  (ADR-0025) in its own end slot, not a quick action. */
export const EVENT_ACTION = {
  /** The settle pair — `סיימנו` / `דילוג`, the record every event can carry. */
  SETTLE: 'settle',
  /** Its replacement once an outcome exists: back to `planned`. */
  RESTORE: 'restore',
  /** The ±`DELAY_STEP_MINUTES` nudge. One control; a hard event's confirm gate is
   *  inside the verb (`applyGuardedDelay`), never a different button. */
  NUDGE: 'nudge',
  /** `בדרך` — a device mark that you are heading there (ADR-0206 §Z5). */
  ON_WAY: 'onWay',
  /** `ניווט` — directions, and the row's one teal affordance. */
  NAVIGATE: 'navigate',
} as const;

export type EventActionId = (typeof EVENT_ACTION)[keyof typeof EVENT_ACTION];

/** Everything the order is allowed to read. `kind` is in here and is deliberately unused
 *  by every shipped entry: the base is identical for hard and soft, and this is the lever
 *  a genuinely kind-specific verb would take — declared so that adding one is a `when`,
 *  not a fourth branch in the card. */
export interface EventActionContext {
  kind: EventKind;
  phase: EventPhaseName;
  /** A past day (ADR-0029): create/edit/move locked, settle and navigate stay. */
  readOnly: boolean;
  /** **The settle question is already being asked, louder, above this row** — the passed
   *  card's prompt strip (ADR-0043 §2). Not a second rule about settling: the same verbs
   *  in the same state, deduped to the one place that asks in words. */
  settleAsked: boolean;
  /** Which verbs the host actually wired. No handler, no button — the rule `onNavigate`
   *  has always followed ("no location, no `ניווט`"), applied to all of them. */
  available: Partial<Record<EventActionId, boolean>>;
}

/** THE ORDER. The record first, then the moves, then the way there — reading left to
 *  right in RTL: what happened, when it happens, how you get there. */
const SPEC: { id: EventActionId; when: (ctx: EventActionContext) => boolean }[] = [
  { id: EVENT_ACTION.SETTLE, when: (c) => c.phase !== 'done' && !c.settleAsked },
  { id: EVENT_ACTION.RESTORE, when: (c) => c.phase === 'done' },
  // Retiming is a structural edit: locked on a past day (ADR-0029), and pointless once
  // the row is behind you or answered (ADR-0043 §3 — "neither once passed"). That rule
  // was written for the soft row and never reached the hard one, which offered `דחה`
  // on an event that had already happened.
  {
    id: EVENT_ACTION.NUDGE,
    when: (c) => !c.readOnly && (c.phase === 'upcoming' || c.phase === 'now'),
  },
  // Heading there is a claim about what is ahead of you, so it is scoped by PHASE and
  // not by kind — the reason it is base rather than the hard-row extra it shipped as.
  {
    id: EVENT_ACTION.ON_WAY,
    when: (c) => !c.readOnly && (c.phase === 'upcoming' || c.phase === 'now'),
  },
  // Directions stay live on a past day: looking up where you were is a read.
  { id: EVENT_ACTION.NAVIGATE, when: () => true },
];

/** The verbs this row offers, in the one order. */
export function eventQuickActions(ctx: EventActionContext): EventActionId[] {
  return SPEC.filter((a) => ctx.available[a.id] && a.when(ctx)).map((a) => a.id);
}

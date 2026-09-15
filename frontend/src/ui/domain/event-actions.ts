// ONE ordered quick-action spec for every day-timeline event, hard and soft alike
// (ADR-0228, narrowed by its 2026-09-15 amendment). The row used to be three hand-written
// JSX arms, each with its own button list in its own order, which is how `ניווט` came to
// LEAD a booking and TRAIL a soft stop and how a booking ended up with no way to be marked
// done. The ORDER lives here now, once, and a kind is not a branch: an action is admitted
// by its own `when`, and a specialised verb is one entry with a narrower `when` rather than
// a second list. Two rows in the same state cannot differ in which verbs they carry or
// where those verbs sit.
//
// **WHAT A ROW OFFERS IS SCOPED BY HOW NEAR IT IS, NOT BY ITS PHASE ALONE.** The first
// build gated each verb on `EventPhaseName`, which is derived per event from the clock — so
// every row on a FUTURE day reads `upcoming`, exactly like "later today", and a waterfall
// two days out was offering `סיימנו`, `בדרך` and a ±30 nudge. Reported off the deployed
// build. A quick action answers "what do I do about this **now**"; a row you will not reach
// for two days has no now. So the context carries `today` and the on-the-ground verbs ask
// for it — see `when`s below.
//
// Pure and presentational: no trip state, no callbacks, no React. The card asks what to
// draw and draws it (`EventActions`), which is what makes the order testable on its own.
import type { EventKind, EventPhaseName } from './event-phase';

/** The row's verbs, as ids. The `⋯` is not one of them: Tier-2 editing (ADR-0025) lives on
 *  the card FACE now, so this band holds verbs or nothing. */
export const EVENT_ACTION = {
  /** The settle pair — `סיימנו` / `דילוג`, the record of what happened. */
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

/** Everything the order is allowed to read. `kind` is in here and is deliberately unused by
 *  every shipped entry: the base is identical for hard and soft, and this is the lever a
 *  genuinely kind-specific verb would take — declared so that adding one is a `when`, not a
 *  fourth branch in the card. */
export interface EventActionContext {
  kind: EventKind;
  phase: EventPhaseName;
  /** **Whether this row's DAY is today.** The axis `phase` cannot supply: a future day's
   *  rows and this afternoon's are both `upcoming`, and only one of them is on the ground. */
  today: boolean;
  /** A past day (ADR-0029): create/edit/move locked, the settle strip stays. */
  readOnly: boolean;
  /** **The settle question is already being asked, louder, above this row** — the passed
   *  card's prompt strip (ADR-0043 §2). Not a second rule about settling: the same verbs in
   *  the same state, deduped to the one place that asks in words. */
  settleAsked: boolean;
  /** Which verbs the host actually wired. No handler, no button — the rule `onNavigate` has
   *  always followed ("no location, no `ניווט`"), applied to all of them. */
  available: Partial<Record<EventActionId, boolean>>;
}

/** On the ground: today, and not already behind you. */
const live = (c: EventActionContext) => c.today && !c.readOnly;

/** THE ORDER. What happened, when it happens, how you get there — reading right to left
 *  in RTL. One list, so no two rows can disagree about where a verb sits. */
const SPEC: { id: EventActionId; when: (ctx: EventActionContext) => boolean }[] = [
  // **A record, so it wants the thing to have happened** — which is ADR-0043 §2's own call
  // ("demoted, not removed… its natural home is behind the line"), quietly contradicted by
  // the shipped soft row that LED with `סיימנו` on an upcoming event. Behind the line the
  // strip asks in words; inside the event the pair is the point; ahead of it there is
  // nothing to record yet, and `⋯` still carries both verbs for the rare early mark
  // (ADR-0117 §2's "a human outranks the clock" is about tonight's dinner, not Thursday's).
  // `live` here too, although `eventPhase` can only ever call a row `now` on today: the
  // spec states its own rule rather than leaning on an invariant held in another file.
  { id: EVENT_ACTION.SETTLE, when: (c) => live(c) && c.phase === 'now' && !c.settleAsked },
  { id: EVENT_ACTION.RESTORE, when: (c) => c.phase === 'done' },
  // Retiming is a live correction to today's plan. On a past day it is locked (ADR-0029);
  // on a FUTURE day it is Plan mode's job, and `⋯` → `עריכה` is one tap.
  { id: EVENT_ACTION.NUDGE, when: (c) => live(c) && (c.phase === 'upcoming' || c.phase === 'now') },
  // Heading there is a claim about what is AHEAD of you: not once you are inside it, and
  // not on a day you are not living yet. Scoped by phase and proximity, never by kind —
  // the reason it is base rather than the hard-row extra it shipped as.
  { id: EVENT_ACTION.ON_WAY, when: (c) => live(c) && c.phase === 'upcoming' },
  // Directions stay while the row is still ahead of you or around you — being inside an
  // event's window is not the same as having arrived — and go once it is behind you, where
  // the strip is asking a different question. `מפה` on the badge answers "where is this" on
  // every row and every day, without expanding the card, so nothing is stranded.
  {
    id: EVENT_ACTION.NAVIGATE,
    when: (c) => live(c) && (c.phase === 'upcoming' || c.phase === 'now'),
  },
];

/** The verbs this row offers, in the one order. Empty is an ordinary answer — a row on
 *  another day has no quick action, and the band does not render. */
export function eventQuickActions(ctx: EventActionContext): EventActionId[] {
  return SPEC.filter((a) => ctx.available[a.id] && a.when(ctx)).map((a) => a.id);
}

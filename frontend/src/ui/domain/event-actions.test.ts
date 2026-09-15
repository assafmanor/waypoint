import { describe, it, expect } from 'vitest';
import {
  EVENT_ACTION,
  eventQuickActions,
  type EventActionContext,
  type EventActionId,
} from './event-actions';
import type { EventKind, EventPhaseName } from './event-phase';

const ALL: EventActionContext['available'] = {
  [EVENT_ACTION.SETTLE]: true,
  [EVENT_ACTION.RESTORE]: true,
  [EVENT_ACTION.NUDGE]: true,
  [EVENT_ACTION.ON_WAY]: true,
  [EVENT_ACTION.NAVIGATE]: true,
};

const ctx = (over: Partial<EventActionContext> = {}): EventActionContext => ({
  kind: 'soft',
  phase: 'upcoming',
  readOnly: false,
  settleAsked: false,
  available: ALL,
  ...over,
});

const PHASES: EventPhaseName[] = ['upcoming', 'now', 'passed', 'done'];
const KINDS: EventKind[] = ['soft', 'hard'];

describe('the day card quick-action spec (ADR-0228)', () => {
  // THE POINT OF THE MODULE. The defect was never one missing button — it was three
  // hand-written arms that could differ without anyone deciding they should, and this is
  // the assertion that closes that door: in every state the two kinds agree, exactly.
  it('a hard row and a soft row in the same state carry the same verbs, in the same order', () => {
    for (const phase of PHASES) {
      for (const readOnly of [false, true]) {
        for (const settleAsked of [false, true]) {
          const [soft, hard] = KINDS.map((kind) =>
            eventQuickActions(ctx({ kind, phase, readOnly, settleAsked })),
          );
          expect({ phase, readOnly, settleAsked, verbs: hard }).toEqual({
            phase,
            readOnly,
            settleAsked,
            verbs: soft,
          });
        }
      }
    }
  });

  it('an upcoming row: settle, the nudge, the way there', () => {
    expect(eventQuickActions(ctx())).toEqual([
      EVENT_ACTION.SETTLE,
      EVENT_ACTION.NUDGE,
      EVENT_ACTION.ON_WAY,
      EVENT_ACTION.NAVIGATE,
    ]);
  });

  it('a done row trades the settle pair for the one verb left', () => {
    const verbs = eventQuickActions(ctx({ phase: 'done' }));
    expect(verbs).toContain(EVENT_ACTION.RESTORE);
    expect(verbs).not.toContain(EVENT_ACTION.SETTLE);
    // Nothing left to retime or to be on the way to.
    expect(verbs).not.toContain(EVENT_ACTION.NUDGE);
    expect(verbs).not.toContain(EVENT_ACTION.ON_WAY);
  });

  it('a passed row keeps no nudge — retiming history is not a verb (ADR-0043 §3)', () => {
    expect(eventQuickActions(ctx({ phase: 'passed' }))).toEqual([
      EVENT_ACTION.SETTLE,
      EVENT_ACTION.NAVIGATE,
    ]);
  });

  it('the prompt strip takes the settle slot rather than asking twice', () => {
    expect(eventQuickActions(ctx({ phase: 'passed', settleAsked: true }))).toEqual([
      EVENT_ACTION.NAVIGATE,
    ]);
  });

  // ADR-0029: a past day locks the moves and keeps the record + the read.
  it('a read-only day keeps settle and navigate, and drops everything structural', () => {
    expect(eventQuickActions(ctx({ readOnly: true }))).toEqual([
      EVENT_ACTION.SETTLE,
      EVENT_ACTION.NAVIGATE,
    ]);
  });

  it('a verb with no handler is simply absent — "no location, no ניווט"', () => {
    const verbs = eventQuickActions(ctx({ available: { [EVENT_ACTION.SETTLE]: true } }));
    expect(verbs).toEqual([EVENT_ACTION.SETTLE]);
  });

  it('never offers the settle pair and its undo at once', () => {
    for (const phase of PHASES) {
      const verbs: EventActionId[] = eventQuickActions(ctx({ phase }));
      expect(verbs.includes(EVENT_ACTION.SETTLE) && verbs.includes(EVENT_ACTION.RESTORE)).toBe(
        false,
      );
    }
  });
});

import { describe, it, expect } from 'vitest';
import { EVENT_ACTION, eventQuickActions, type EventActionContext } from './event-actions';
import type { EventKind, EventPhaseName } from './event-phase';

const ALL: EventActionContext['available'] = {
  [EVENT_ACTION.SETTLE]: true,
  [EVENT_ACTION.NUDGE]: true,
  [EVENT_ACTION.ON_WAY]: true,
  [EVENT_ACTION.NAVIGATE]: true,
};

const ctx = (over: Partial<EventActionContext> = {}): EventActionContext => ({
  kind: 'soft',
  phase: 'upcoming',
  today: true,
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
      for (const today of [true, false]) {
        for (const readOnly of [false, true]) {
          for (const settleAsked of [false, true]) {
            const state = { phase, today, readOnly, settleAsked };
            const [soft, hard] = KINDS.map((kind) => eventQuickActions(ctx({ ...state, kind })));
            expect({ ...state, verbs: hard }).toEqual({ ...state, verbs: soft });
          }
        }
      }
    }
  });

  describe('today, where the row is on the ground', () => {
    it('ahead of you: the moves and the way there — no record of a thing that has not happened', () => {
      expect(eventQuickActions(ctx({ phase: 'upcoming' }))).toEqual([
        EVENT_ACTION.NUDGE,
        EVENT_ACTION.ON_WAY,
        EVENT_ACTION.NAVIGATE,
      ]);
    });

    it('inside it: the record leads, and `בדרך` goes — you are not on your way to it', () => {
      expect(eventQuickActions(ctx({ phase: 'now' }))).toEqual([
        EVENT_ACTION.SETTLE,
        EVENT_ACTION.NUDGE,
        EVENT_ACTION.NAVIGATE,
      ]);
    });

    it('passed: nothing, because the prompt strip above is already asking in words', () => {
      expect(eventQuickActions(ctx({ phase: 'passed', settleAsked: true }))).toEqual([]);
    });

    // ADR-0230 §1: undo is the `היינו ✓` chip now, so a settled row's band holds nothing
    // and does not render. Was `[RESTORE]` for one release, and that entry was also the only
    // one `live()` never gated — the band is verbs about TODAY, exactly.
    it('done: nothing — the record on the row is itself the way back', () => {
      expect(eventQuickActions(ctx({ phase: 'done' }))).toEqual([]);
    });
  });

  // The amendment's whole subject: `eventPhase` calls a waterfall two days out `upcoming`,
  // exactly like this afternoon's stop, and the first build gave it `סיימנו`, `בדרך` and a
  // ±30 nudge on that basis. A quick action answers "what now"; that row has no now.
  describe('another day, where there is no now to act in', () => {
    it('offers nothing on a future day, at every phase', () => {
      for (const phase of PHASES) {
        expect({ phase, verbs: eventQuickActions(ctx({ today: false, phase })) }).toEqual({
          phase,
          verbs: [],
        });
      }
    });

    it('keeps nothing live on a past day either — the strip carries the retrospective job', () => {
      expect(eventQuickActions(ctx({ today: false, readOnly: true, phase: 'passed' }))).toEqual([]);
    });

    // A settled row can still always be un-settled, including on a past day (ADR-0043 §2's
    // 2026-07-16 revision: "check but never uncheck" is a mistake with no correction) — the
    // chip is what does it now, and it renders wherever the done state does, so the band
    // being empty here takes nothing away. `EventCard.test.tsx` holds that assertion.
    it('carries no verb at all on a past day, settled or not', () => {
      expect(eventQuickActions(ctx({ today: false, readOnly: true, phase: 'done' }))).toEqual([]);
    });
  });

  it('a verb with no handler is simply absent — "no location, no ניווט"', () => {
    expect(eventQuickActions(ctx({ available: { [EVENT_ACTION.NUDGE]: true } }))).toEqual([
      EVENT_ACTION.NUDGE,
    ]);
  });

  // The band is one line at 360px, which is the amendment's real cap; the count is how it
  // is kept. Asserted here so a fifth verb has to face the measurement rather than wrap.
  it('never offers more than three verbs in any state', () => {
    for (const phase of PHASES) {
      for (const today of [true, false]) {
        for (const readOnly of [false, true]) {
          for (const settleAsked of [false, true]) {
            const verbs = eventQuickActions(ctx({ phase, today, readOnly, settleAsked }));
            expect({ phase, today, readOnly, settleAsked, n: verbs.length }).toEqual({
              phase,
              today,
              readOnly,
              settleAsked,
              n: Math.min(verbs.length, 3),
            });
          }
        }
      }
    }
  });
});

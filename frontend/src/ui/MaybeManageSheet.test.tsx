// @vitest-environment jsdom
//
// The surface an idea never had (ADR-0116's 2026-08-01 amendment). Two claims matter here
// and neither is about markup: `שיבוץ ליום` is the FIRST action, so the verb the tile used
// to perform is one press away and named; and `הסרה` appears only where the host allows it,
// so a sheet reachable in Trip mode cannot delete an idea that Trip mode's tile could not.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { MaybeItem, Note } from '@waypoint/shared';
import { wrapNav } from '../test/nav-harness';
import { setSimulatedNow } from '../lib/useClock';

const NOW = '2026-07-20T09:00:00Z';

const idea: MaybeItem = {
  id: 'm1',
  tripId: 't1',
  title: 'מקדש מייג׳י',
  consumed: false,
  createdBy: 'u2',
  createdAt: NOW,
  updatedAt: NOW,
  updatedBy: 'u2',
} as MaybeItem;

let tripNotes: Note[] = [];
const createNote = vi.fn(() => Promise.resolve(undefined));

vi.mock('../state/trip-state', () => ({
  useTrip: () => ({
    trip: { id: 't1', timezone: 'Asia/Jerusalem', startDate: '2026-08-15', endDate: '2026-08-20' },
    zoneCrossings: [],
    // Tasks ride the same snapshot since phase 1; the mark and the sections read them.
    tasks: [],
    taskVerbs: {
      createTask: async () => undefined,
      updateTask: async () => {},
      deleteTask: async () => {},
    },
    notes: tripNotes,
    noteHosts: new Map(),
    users: [
      { id: 'u1', displayName: 'דנה' },
      { id: 'u2', displayName: 'מיכל' },
    ],
    noteVerbs: { createNote, updateNote: async () => {}, deleteNote: async () => {} },
  }),
}));

import { MaybeManageSheet } from './MaybeManageSheet';
import { t } from '../i18n/he';

const open = (props: Partial<Parameters<typeof MaybeManageSheet>[0]> = {}) => {
  const onSchedule = props.onSchedule ?? vi.fn();
  render(
    wrapNav(<MaybeManageSheet item={idea} onSchedule={onSchedule} onClose={() => {}} {...props} />),
  );
  return onSchedule;
};

const actionLabels = () =>
  [...document.querySelectorAll('.wp-row-action')].map((n) => n.textContent);

describe('MaybeManageSheet', () => {
  beforeEach(() => {
    setSimulatedNow(Date.parse(NOW));
    tripNotes = [];
    createNote.mockClear();
  });
  afterEach(() => {
    cleanup();
    setSimulatedNow(null);
  });

  it('names the idea and who added it', () => {
    open();
    expect(screen.getByText(idea.title)).toBeTruthy();
    expect(screen.getByText(t.day.idea.subject('מיכל'))).toBeTruthy();
  });

  it('leads with שיבוץ ליום, which is what the tile’s tap used to do', () => {
    const onSchedule = open();
    expect(actionLabels()[0]).toContain(t.day.idea.schedule);
    fireEvent.click(screen.getByRole('button', { name: t.day.idea.schedule }));
    expect(onSchedule).toHaveBeenCalledTimes(1);
  });

  it('offers הסרה only where the host does, in the danger partition', () => {
    open();
    expect(screen.queryByText(t.day.idea.remove)).toBeNull();
    cleanup();

    const onRemove = vi.fn();
    open({ onRemove });
    const danger = document.querySelector('.wp-row-actions-danger .wp-row-action');
    expect(danger?.textContent).toContain(t.day.idea.remove);
    fireEvent.click(danger as HTMLElement);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  // The mockup drew `עריכה` and the app has no idea-edit surface to open. Pinned so a later
  // reader does not "restore" a verb that was left out on purpose.
  it('offers no עריכה, because there is no idea-edit surface to open', () => {
    open({ onRemove: vi.fn() });
    expect(actionLabels()).toEqual([t.day.idea.schedule, t.day.idea.remove]);
  });

  it('carries the note section ABOVE the verbs, and writes to the idea', () => {
    open();
    const section = document.querySelector('.note-sec') as HTMLElement;
    const actions = document.querySelector('.wp-row-actions') as HTMLElement;
    expect(
      section.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.notes.section.add) }));
    fireEvent.change(screen.getByLabelText(t.notes.sheet.bodyLabel), {
      target: { value: 'לקחת נעליים שקל לחלוץ' },
    });
    fireEvent.click(screen.getByRole('button', { name: t.notes.sheet.save }));
    expect(createNote).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'לקחת נעליים שקל לחלוץ', maybeItemId: 'm1' }),
    );
  });

  // **Agreeing with a `fits-a-day` proposal** (ADR-0151's 2026-08-04 amendment). The row exists
  // only where there is a proposal, and it is a TICK — `שיבוץ ליום` keeps the calendar, because
  // this is not a second kind of scheduling.
  describe('the mark-for-a-day row', () => {
    it('is absent when the idea carries no proposal', () => {
      open();
      expect(actionLabels()).toEqual([t.day.idea.schedule]);
    });

    it('sits after שיבוץ ליום, named for the day, and fires once', () => {
      const onSelect = vi.fn();
      open({ markForDay: { label: 'סמנו למחר', onSelect } });
      expect(actionLabels()).toEqual([t.day.idea.schedule, 'סמנו למחר']);
      fireEvent.click(screen.getByRole('button', { name: 'סמנו למחר' }));
      expect(onSelect).toHaveBeenCalledTimes(1);
    });

    // Two rows reaching for one glyph is how ADR-0161 §7's collision happened; the tick says
    // "agree" and the calendar says "schedule", and they must not swap.
    it('wears the tick, leaving the calendar to שיבוץ ליום', () => {
      open({ markForDay: { label: 'סמנו למחר', onSelect: vi.fn() } });
      const rows = [...document.querySelectorAll('.wp-row-action')];
      const glyph = (n: Element) =>
        n.querySelector('svg')?.querySelector('path')?.getAttribute('d');
      expect(glyph(rows[0])).not.toBe(glyph(rows[1]));
    });

    it('still comes before הסרה, which stays last and destructive', () => {
      open({ markForDay: { label: 'סמנו למחר', onSelect: vi.fn() }, onRemove: vi.fn() });
      expect(actionLabels()).toEqual([t.day.idea.schedule, 'סמנו למחר', t.day.idea.remove]);
    });
  });
});

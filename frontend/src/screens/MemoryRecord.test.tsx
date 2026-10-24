// @vitest-environment jsdom
//
// **The record, by kind** (owner, 2026-09-27): the Home's kind chips open the search on their
// kind, and the search's own chips can widen it back to every row.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EVENT_KIND, EVENT_SOURCE, EVENT_STATUS, type EventCategory } from '@waypoint/shared';
import type { RecordRow } from '../lib/memory-home';

vi.mock('../state/mode-state', () => ({ useMode: () => ({ mode: 'plan' }) }));
// The list's send (ADR-0242 §1) asks who is looking and which links the trip has.
const session = vi.hoisted(() => ({
  role: 'admin' as 'admin' | 'peer',
  links: [] as unknown[],
}));
vi.mock('../state/trip-state', () => ({
  useTrip: () => ({
    trip: { id: 't1', name: 'Iceland' },
    members: [{ userId: 'u1', role: session.role }],
  }),
}));
vi.mock('../state/auth-state', () => ({ useAuth: () => ({ me: { user: { id: 'u1' } } }) }));
vi.mock('../lib/api', () => ({ fetchTripShares: async () => session.links }));

import { wrapNav } from '../test/nav-harness';
import { t } from '../i18n/he';
import { RecordKinds, RecordSearch } from './MemoryRecord';

const row = (id: string, category: EventCategory): RecordRow => ({
  event: {
    id,
    tripId: 't1',
    date: '2026-05-02',
    title: id,
    kind: EVENT_KIND.SOFT,
    status: EVENT_STATUS.DONE,
    sortOrder: 0,
    source: EVENT_SOURCE.MANUAL,
    createdAt: '',
    updatedAt: '',
    updatedBy: 'u1',
  },
  icon: '📌',
  category,
  subject: 'ש׳ 02.05',
  outcome: 'done',
});
const rows = [row('Skógafoss', 'nature'), row('Gullfoss', 'nature'), row('Dill', 'food')];
const actions = { onOpenDay: () => {}, toMap: () => undefined };
const shown = (container: HTMLElement) =>
  [...container.querySelectorAll('.wp-reveal:not(.hidden) .wp-listrow-title')].map(
    // Titles are bidi-isolated (`autoIsolate`); the marks are not the name.
    (el) => el.textContent?.replace(/[\u2066-\u2069]/g, ''),
  );

describe('the record by kind', () => {
  afterEach(() => cleanup());

  it('on the Home, the kinds are counts that pick, with no list under them', () => {
    const onPick = vi.fn();
    const { container } = render(<RecordKinds rows={rows} onPick={onPick} />);
    expect(container.querySelector('.wp-listrow')).toBeNull();
    expect(container.querySelector('.choice-pill.on')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: /אוכל/ }));
    expect(onPick).toHaveBeenCalledWith('food');
  });

  it('the search opens on the kind it was given, and its all chip widens it', () => {
    // The search is a `Modal`, so it renders into the body rather than the test's container.
    render(
      wrapNav(
        <RecordSearch
          rows={rows}
          tripName="Iceland"
          kind="nature"
          onClose={() => {}}
          {...actions}
        />,
      ),
    );
    expect(shown(document.body)).toEqual(['Skógafoss', 'Gullfoss']);
    fireEvent.click(screen.getByRole('radio', { name: t.planHome.past.record.kindsAll }));
    expect(shown(document.body)).toEqual(['Skógafoss', 'Gullfoss', 'Dill']);
  });

  describe('sending a list (ADR-0242 §1)', () => {
    const open = async (kind?: EventCategory, list = rows) => {
      render(
        wrapNav(
          <RecordSearch
            rows={list}
            tripName="Iceland"
            kind={kind}
            onClose={() => {}}
            {...actions}
          />,
        ),
      );
      // Let the links read settle.
      await act(async () => {});
    };
    const send = () =>
      screen.queryByRole('button', { name: t.share.list.send(t.share.list.name.nature) });
    afterEach(() => {
      session.role = 'admin';
      session.links = [];
    });

    // Amended 2026-10-04 (`a-list-leaves-the-trip-v2.html`): the send moved from the list's foot,
    // 136px below the fold, to the bar, where a query no longer hides it.
    it('offers the send in the bar under one kind, with or without a query, and not on all', async () => {
      await open('nature');
      expect(send()?.closest('.search-overlay-bar')).not.toBeNull();
      fireEvent.change(screen.getByPlaceholderText(t.planHome.past.record.search.placeholder), {
        target: { value: 'Sk' },
      });
      expect(send()).not.toBeNull();
      cleanup();
      await open();
      expect(document.querySelector('.search-overlay-action')).toBeNull();
    });

    it('offers nothing where nothing of that kind happened', async () => {
      await open('nature', [
        { ...row('Glymur', 'nature'), outcome: 'skipped' },
        row('Dill', 'food'),
      ]);
      expect(send()).toBeNull();
    });

    it("gives a traveller who is not an admin the send only once the kind's link exists", async () => {
      session.role = 'peer';
      await open('nature');
      expect(send()).toBeNull();
      cleanup();
      session.links = [
        {
          code: 'Ab3dEf7h',
          shareUrl: '/s/Ab3dEf7h',
          detailLevel: 'summary',
          sensitive: { bookingSecrets: false, notesAndTasks: false, travelerIdentity: false },
          documentIds: [],
          scope: { category: 'nature' },
          updatedAt: '2026-09-29T00:00:00.000Z',
        },
      ];
      await open('nature');
      expect(send()).not.toBeNull();
    });
  });
});

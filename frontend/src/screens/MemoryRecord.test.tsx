// @vitest-environment jsdom
//
// **The record, by kind** (owner, 2026-09-27): the Home's kind chips open the search on their
// kind, and the search's own chips can widen it back to every row.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EVENT_KIND, EVENT_SOURCE, EVENT_STATUS, type EventCategory } from '@waypoint/shared';
import type { RecordRow } from '../lib/memory-home';

vi.mock('../state/mode-state', () => ({ useMode: () => ({ mode: 'plan' }) }));

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
});

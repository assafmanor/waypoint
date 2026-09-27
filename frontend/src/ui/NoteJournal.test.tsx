// @vitest-environment jsdom
//
// **The journal** (ADR-0240 §4, epic 4.6): the Index's note row, read under each day's heading,
// with nothing that writes. Tapping reads the note in place, as the Index does.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  EVENT_KIND,
  EVENT_SOURCE,
  EVENT_STATUS,
  type Note,
  type TripEvent,
} from '@waypoint/shared';
import { buildNoteHosts } from '../lib/notes';

const stop: TripEvent = {
  id: 'e1',
  tripId: 't1',
  date: '2026-05-02',
  title: 'Golden Gai',
  category: 'food',
  kind: EVENT_KIND.SOFT,
  status: EVENT_STATUS.DONE,
  sortOrder: 0,
  source: EVENT_SOURCE.MANUAL,
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-05-01T00:00:00Z',
  updatedBy: 'u1',
};
const note = (id: string, over: Partial<Note>): Note => ({
  id,
  tripId: 't1',
  source: 'member',
  createdBy: 'u1',
  createdAt: '2026-05-02T09:00:00Z',
  updatedAt: '2026-05-02T09:00:00Z',
  updatedBy: 'u1',
  ...over,
});

vi.mock('../state/trip-state', () => ({
  useTrip: () => ({
    users: [{ id: 'u1', displayName: 'Dana' }],
    noteHosts: buildNoteHosts({
      events: [stop],
      bookings: [],
      places: [],
      maybeItems: [],
      documents: [],
    }),
    zoneEvidence: {
      events: [stop],
      bookings: [],
      places: [],
      crossings: [],
      primaryZone: 'Asia/Tokyo',
    },
  }),
}));
vi.mock('../lib/useClock', () => ({ useClock: () => new Date('2026-05-07T03:00:00Z') }));
vi.mock('../lib/outbox', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/outbox')>()),
  useSyncStatus: () => ({ state: 'synced' }) as const,
  usePendingUploads: () => [],
}));

import { wrapNav } from '../test/nav-harness';
import { NoteJournal } from './NoteJournal';
import { t } from '../i18n/he';

describe('NoteJournal', () => {
  afterEach(() => cleanup());

  it('reads each day under its heading, with its host and nothing to manage', () => {
    const { container } = render(
      wrapNav(
        <NoteJournal
          days={[
            {
              date: '2026-05-02',
              heading: 'ש׳ 02.05 · Shinjuku',
              notes: [note('n1', { title: 'Jazz bar', body: 'Six seats', eventId: 'e1' })],
            },
          ]}
        />,
      ),
    );
    expect(screen.getByRole('heading', { name: 'ש׳ 02.05 · Shinjuku' })).toBeTruthy();
    expect(container.querySelector('.note-host')?.textContent).toContain('Golden Gai');
    expect(container.querySelector('.wp-listrow-kebab')).toBeNull();

    fireEvent.click(container.querySelector('.wp-listrow-open')!);
    expect(container.querySelector('.note-row.is-open')).toBeTruthy();
    // Read-only: the open foot offers no edit.
    expect(screen.queryByText(t.notes.open.edit)).toBeNull();
  });
});

// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { HOUSEKEEPING_CHANGE, type Change, type User } from '@waypoint/shared';
import { ChangeFeed } from './ChangeFeed';
import {
  appendChangeEntry,
  describeChange,
  dismissChangeEntry,
  type ChangeEntry,
} from '../../state/change-feed';

const NOAM: User = {
  id: 'u-noam',
  email: 'noam@example.com',
  displayName: 'נועם',
  avatarHue: 'moss',
  avatarChoice: 'initials',
  googleAvatarUrl: null,
  uploadedAvatarUrl: null,
  preferredCurrency: null,
  createdAt: '2026-07-01T00:00:00.000Z',
};
const ME: User = {
  id: 'u-me',
  email: 'me@example.com',
  displayName: 'אני',
  avatarHue: 'denim',
  avatarChoice: 'initials',
  googleAvatarUrl: null,
  uploadedAvatarUrl: null,
  preferredCurrency: null,
  createdAt: '2026-07-01T00:00:00.000Z',
};
const USERS = [NOAM, ME];
const NOW = Date.parse('2026-07-19T11:05:00.000Z');

function change(over: Partial<Change>): Change {
  return {
    id: 'c1',
    seq: '10',
    tripId: 't1',
    actorUserId: NOAM.id,
    entityType: 'event',
    entityId: 'e1',
    action: 'move',
    after: { title: 'ראמן', startsAt: '2026-07-19T11:00:00.000Z' },
    createdAt: '2026-07-19T11:00:00.000Z',
    ...over,
  };
}

// Notes narrate on create and delete, and deliberately NOT on edit (owner, session 206):
// the buffer is a bounded ring and a note is the one entity a group re-words.
describe('describeChange — notes', () => {
  const noteChange = (over: Partial<Change>) =>
    change({ entityType: 'note', entityId: 'n1', action: 'create', after: {}, ...over });

  it('names a note by its own words rather than "an item"', () => {
    const entry = describeChange(
      noteChange({ after: { body: 'הכניסה מאחור' } }),
      USERS,
      ME.id,
      'Asia/Tokyo',
    );
    expect(entry!.lead).toContain('הכניסה מאחור');
  });

  it('prefers a titled note’s title, exactly as its row does', () => {
    const entry = describeChange(
      noteChange({ after: { title: 'מזומן בלבד', body: 'ארוך יותר' } }),
      USERS,
      ME.id,
      'Asia/Tokyo',
    );
    expect(entry!.lead).toContain('מזומן בלבד');
    expect(entry!.lead).not.toContain('ארוך יותר');
  });

  it('falls back to the url for a url-only note', () => {
    const entry = describeChange(
      noteChange({ after: { url: 'instagram.com/p/x' } }),
      USERS,
      ME.id,
      'Asia/Tokyo',
    );
    expect(entry!.lead).toContain('instagram.com/p/x');
  });

  it('narrates a peer’s delete', () => {
    const entry = describeChange(
      noteChange({ action: 'delete', before: { body: 'נמחק' } }),
      USERS,
      ME.id,
      'Asia/Tokyo',
    );
    expect(entry).not.toBeNull();
  });

  it('stays silent on a note EDIT', () => {
    const entry = describeChange(
      noteChange({ action: 'update', after: { body: 'תוקן' } }),
      USERS,
      ME.id,
      'Asia/Tokyo',
    );
    expect(entry).toBeNull();
  });

  it('still narrates an edit to any OTHER entity', () => {
    const entry = describeChange(
      change({ entityType: 'booking', action: 'update', after: { title: 'מלון' } }),
      USERS,
      ME.id,
      'Asia/Tokyo',
    );
    expect(entry).not.toBeNull();
  });
});

// The server's own housekeeping is a real change — the caches need it — and not anybody's
// edit (ADR-0157 §6). Narrating a swept place would report "נועם removed <place>" against
// whoever happened to pick a place that minute, for a row that had no list entry and no pin.
describe('describeChange — the orphan sweep', () => {
  const sweptPlace = (over: Partial<Change> = {}) =>
    change({
      entityType: 'place',
      entityId: 'pl-1',
      action: 'delete',
      before: { id: 'pl-1', name: 'שינג׳וקו' },
      after: HOUSEKEEPING_CHANGE,
      ...over,
    });

  it('does not narrate a swept place', () => {
    expect(describeChange(sweptPlace(), USERS, ME.id, 'Asia/Tokyo')).toBeNull();
  });

  // The distinction the mark exists for: a person deleting a place IS news, and it is the
  // same entity, action and actor — only the mark differs.
  it('still narrates a peer deleting a place themselves', () => {
    const entry = describeChange(sweptPlace({ after: undefined }), USERS, ME.id, 'Asia/Tokyo');
    expect(entry).not.toBeNull();
    expect(entry!.lead).toContain('שינג׳וקו');
  });
});

describe('describeChange (buffer)', () => {
  it('narrates a peer move with the right actor, subject and a moved-to time', () => {
    const entry = describeChange(change({}), USERS, ME.id, 'Asia/Tokyo');
    expect(entry).not.toBeNull();
    expect(entry!.actorName).toBe('נועם');
    expect(entry!.lead).toContain('ראמן');
    expect(entry!.time).toBe('20:00'); // Tokyo (+9) of 11:00Z
  });

  it('filters out my own changes (does not narrate my edits back to me)', () => {
    expect(describeChange(change({ actorUserId: ME.id }), USERS, ME.id, 'Asia/Tokyo')).toBeNull();
  });

  it('falls back to a neutral actor when the roster does not know them', () => {
    const entry = describeChange(change({ actorUserId: 'ghost' }), USERS, ME.id, 'Asia/Tokyo');
    expect(entry!.actorName).toBe('מישהו');
  });

  it('rings + dedups the buffer, newest first', () => {
    const a = describeChange(change({ id: 'a', seq: '1' }), USERS, ME.id, 'Asia/Tokyo')!;
    const b = describeChange(change({ id: 'b', seq: '2' }), USERS, ME.id, 'Asia/Tokyo')!;
    let list: ChangeEntry[] = [];
    list = appendChangeEntry(list, a);
    list = appendChangeEntry(list, b);
    list = appendChangeEntry(list, a); // duplicate id — ignored
    expect(list.map((e) => e.id)).toEqual(['b', 'a']);
  });
});

describe('ChangeFeed', () => {
  afterEach(() => cleanup());

  const entryFrom = (c: Change) => describeChange(c, USERS, ME.id, 'Asia/Tokyo')!;

  it('renders nothing when empty (auto-collapses)', () => {
    const { container } = render(
      <ChangeFeed entries={[]} now={NOW} onDismiss={() => {}} onDismissAll={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows an attributed line with the moved-to time in an LTR island', () => {
    render(
      <ChangeFeed
        entries={[entryFrom(change({}))]}
        now={NOW}
        onDismiss={() => {}}
        onDismissAll={() => {}}
      />,
    );
    expect(screen.getByText('נועם')).toBeTruthy();
    expect(screen.getByText(/הזיז את ראמן/)).toBeTruthy();
    const time = document.querySelector('.cf-time');
    expect(time?.textContent).toBe('20:00');
    expect(time?.getAttribute('dir')).toBe('auto');
    // Polite live region so a peer change is announced calmly, not loudly.
    expect(document.querySelector('.cf-list')?.getAttribute('aria-live')).toBe('polite');
  });

  it('dismiss removes a single entry via its labelled button', () => {
    const onDismiss = vi.fn();
    render(
      <ChangeFeed
        entries={[entryFrom(change({}))]}
        now={NOW}
        onDismiss={onDismiss}
        onDismissAll={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'הסתר עדכון' }));
    expect(onDismiss).toHaveBeenCalledWith('c1');
    // And the pure helper actually drops it.
    expect(dismissChangeEntry([entryFrom(change({}))], 'c1')).toEqual([]);
  });

  it('clear-all is a labelled button', () => {
    const onDismissAll = vi.fn();
    render(
      <ChangeFeed
        entries={[entryFrom(change({}))]}
        now={NOW}
        onDismiss={() => {}}
        onDismissAll={onDismissAll}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'נקה את כל העדכונים' }));
    expect(onDismissAll).toHaveBeenCalled();
  });
});

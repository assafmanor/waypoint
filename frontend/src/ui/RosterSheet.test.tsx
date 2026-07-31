// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Membership, User } from '@waypoint/shared';
import { RosterSheet } from './RosterSheet';

vi.mock('../state/nav-state', () => ({ useOverlay: () => {} }));

const user = (id: string, name: string, over: Partial<User> = {}): User => ({
  id,
  email: `${id}@example.com`,
  displayName: name,
  avatarHue: 'denim',
  avatarChoice: 'initials',
  googleAvatarUrl: null,
  uploadedAvatarUrl: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  ...over,
});

const member = (userId: string, role: Membership['role'], joinedAt: string): Membership => ({
  id: `m-${userId}`,
  tripId: 't1',
  userId,
  role,
  calendarSyncEnabled: false,
  joinedAt,
});

const USERS = [
  user('u-me', 'אסף'),
  user('u-dana', 'דנה'),
  user('u-noam', 'נועם'),
  user('u-maor', 'מאור'),
  user('u-ron', 'רון'),
];
const MEMBERS = [
  member('u-me', 'admin', '2026-03-12T00:00:00.000Z'),
  member('u-dana', 'admin', '2026-03-14T00:00:00.000Z'),
  member('u-noam', 'peer', '2026-03-14T00:00:00.000Z'),
  member('u-maor', 'peer', '2026-03-21T00:00:00.000Z'),
  member('u-ron', 'peer', '2026-04-02T00:00:00.000Z'),
];

const renderRoster = (over: Partial<Parameters<typeof RosterSheet>[0]> = {}) =>
  render(
    <RosterSheet members={MEMBERS} users={USERS} myUserId="u-me" onClose={() => {}} {...over} />,
  );

afterEach(cleanup);

describe('RosterSheet', () => {
  it('lists EVERY member — the cap is a rendering detail, not a truncation', () => {
    // The defect: a cap of two left an inert `+N` hiding most of a ~5-person group,
    // reachable only through trip settings (ADR-0133 §9).
    renderRoster();
    for (const name of ['אסף', 'דנה', 'נועם', 'מאור', 'רון']) {
      expect(screen.getByText(name)).toBeTruthy();
    }
    expect(document.querySelectorAll('.set-member-tap').length).toBe(5);
  });

  it('marks which one is you', () => {
    renderRoster();
    expect(screen.getByText(/אתה/)).toBeTruthy();
  });

  it('states each role', () => {
    renderRoster();
    expect(screen.getAllByText('מנהל').length).toBe(2);
    expect(screen.getAllByText('משתתף').length).toBe(3);
  });

  it('does NOT put the joined date on the row — that is the member surface', () => {
    // "A little too much" on a row whose job is naming who is present.
    renderRoster();
    expect(screen.queryByText(/12\.03/)).toBeNull();
  });

  it('opens the member surface on a row tap, with the joined date there', () => {
    renderRoster();
    fireEvent.click(screen.getByText('נועם').closest('button')!);
    expect(screen.getByText('תפקיד')).toBeTruthy();
    expect(screen.getByText('הצטרף')).toBeTruthy();
    // The app's one numeric date format — zero-padded, like the trip-date ranges.
    expect(screen.getByText('14.03')).toBeTruthy();
  });

  it('offers no admin verbs — management stays where its confirm + block list live', () => {
    renderRoster();
    fireEvent.click(screen.getByText('נועם').closest('button')!);
    expect(screen.queryByText('הפוך למנהל')).toBeNull();
    expect(screen.queryByText('הסר מהטיול')).toBeNull();
  });

  it('never shows a co-member their email', () => {
    // Joining is by link, so co-members may never have exchanged addresses.
    renderRoster();
    fireEvent.click(screen.getByText('דנה').closest('button')!);
    expect(screen.queryByText(/@example\.com/)).toBeNull();
  });

  // The merged people stack (ADR-0149 §4): the header's cluster and your own ringed
  // avatar became one control, so this is the sheet it opens — you at the top, then
  // the group — and your row carries the account entry point that avatar gave up.
  describe('as the header stack’s people sheet', () => {
    it('puts you first, however the memberships arrive', () => {
      renderRoster({ myUserId: 'u-ron' });
      expect(document.querySelectorAll('.set-member-tap')[0].textContent).toContain('רון');
    });

    it('sends your own row to your account instead of the member surface', () => {
      const onOpenAccount = vi.fn();
      renderRoster({ onOpenAccount });
      fireEvent.click(screen.getByText('אסף').closest('button')!);
      expect(onOpenAccount).toHaveBeenCalled();
      expect(screen.queryByText('תפקיד')).toBeNull();
    });

    it('leaves everyone else opening the member surface exactly as before', () => {
      const onOpenAccount = vi.fn();
      renderRoster({ onOpenAccount });
      fireEvent.click(screen.getByText('נועם').closest('button')!);
      expect(onOpenAccount).not.toHaveBeenCalled();
      expect(screen.getByText('תפקיד')).toBeTruthy();
    });
  });

  it('skips a membership with no matching user rather than drawing a blank person', () => {
    renderRoster({ users: USERS.filter((u) => u.id !== 'u-ron') });
    expect(screen.queryByText('רון')).toBeNull();
    expect(document.querySelectorAll('.set-member-tap').length).toBe(4);
  });
});

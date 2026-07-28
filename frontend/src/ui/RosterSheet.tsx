// The roster — ADR-0133 §9. The trip's members, reachable in one tap from the header
// cluster, which was a `<div>` carrying a `title` before this: a hover affordance, so
// on a phone-primary app it was unreachable (root rule 6 / ADR-0017), and with
// `MEMBER_AVATAR_CAP = 2` the inert `+N` hid most of a ~5-person group.
//
// It lists EVERY member — no cap. That is what makes the cap a rendering detail again
// rather than a truncation, so the overflow problem is deleted rather than redesigned.
//
// Read-only by construction: it passes no admin verbs to `MemberSheet`, so promote and
// remove stay in trip settings, which owns the confirm prompt and the "Removed" list a
// kick has to refresh. Invites live there too.
import { useState } from 'react';
import type { Membership, User } from '@waypoint/shared';
import { t } from '../i18n/he';
import { Sheet } from './Sheet';
import { MemberRow } from './domain/MemberRow';
import { MemberSheet } from './domain/MemberSheet';

export function RosterSheet({
  members,
  users,
  myUserId,
  onClose,
}: {
  members: Membership[];
  users: User[];
  myUserId?: string;
  onClose: () => void;
}) {
  const [openFor, setOpenFor] = useState<Membership | null>(null);
  const userFor = (userId: string) => users.find((u) => u.id === userId);

  // A membership with no matching user row can't be rendered as a person, so it is
  // skipped rather than shown as a blank circle.
  const rows = members.flatMap((m) => {
    const user = userFor(m.userId);
    return user ? [{ m, user }] : [];
  });
  const openUser = openFor ? userFor(openFor.userId) : undefined;

  return (
    <>
      <Sheet ariaLabel={t.settings.roster} onClose={onClose}>
        <div className="roster-title">
          {t.settings.roster}
          <span className="roster-count">{t.settings.memberCount(rows.length)}</span>
        </div>
        <div className="roster-list">
          {rows.map(({ m, user }) => (
            <MemberRow
              key={m.id}
              person={user}
              role={m.role}
              isMe={m.userId === myUserId}
              onOpen={() => setOpenFor(m)}
            />
          ))}
        </div>
        <div className="roster-foot">{t.settings.rosterFoot}</div>
      </Sheet>

      {openFor && openUser && (
        <MemberSheet
          member={openFor}
          person={openUser}
          isMe={openFor.userId === myUserId}
          onClose={() => setOpenFor(null)}
        />
      )}
    </>
  );
}

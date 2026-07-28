// One member, as a row — ADR-0133 §9. Shared by the roster (the header cluster's
// sheet) and trip settings' party list, so the two lists cannot drift into looking
// like different things: it renders the shipped `.set-member` grammar rather than a
// second copy of it.
//
// The row answers "who is on this trip" and nothing more — avatar, name, role, and a
// `you` marker. The joined date deliberately lives on the member surface instead: it
// is too much for a row whose job is naming who is here.
import type { MembershipRole } from '@waypoint/shared';
import { DOT_SEPARATOR } from '../../constants';
import { t } from '../../i18n/he';
import { Avatar, type AvatarPerson } from '../primitives/Avatar';
import { NavArrow } from '../NavArrow';

export function memberRoleLabel(role: MembershipRole): string {
  return role === 'admin' ? t.settings.roleAdmin : t.settings.rolePeer;
}

export function MemberRow({
  person,
  role,
  isMe = false,
  onOpen,
  children,
}: {
  person: AvatarPerson;
  role: MembershipRole;
  isMe?: boolean;
  /** Present ⇒ the row is a control that opens the member. The roster passes it; the
   *  settings list keeps its own kebab instead, so it does not. */
  onOpen?: () => void;
  /** Trailing slot — the settings list's kebab lives here rather than in this
   *  component, which has no business knowing about admin actions. */
  children?: React.ReactNode;
}) {
  const body = (
    <>
      <Avatar person={person} size="inherit" className="av" />
      <div className="mn">
        {person.displayName}
        {isMe && (
          <span className="mr">
            {' '}
            {DOT_SEPARATOR} {t.settings.you}
          </span>
        )}
      </div>
      <span className={`role ${role === 'admin' ? 'owner' : 'mem'}`}>{memberRoleLabel(role)}</span>
    </>
  );

  if (onOpen) {
    return (
      <button className="set-member set-member-tap" onClick={onOpen}>
        {body}
        <NavArrow variant="forward" className="member-chev" />
      </button>
    );
  }
  return (
    <div className="set-member">
      {body}
      {children}
    </div>
  );
}

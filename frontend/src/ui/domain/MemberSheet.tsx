// The ONE member surface — ADR-0133 §9. Moved out of `screens/TripSettings.tsx` and
// generalized rather than copied: trip settings already had this sheet (a `.ms-who`
// identity header plus promote/remove), and the roster needed the same thing, so
// there is one component with two entry points instead of two near-identical sheets
// (rule 8).
//
// It answers "who is this": the avatar large, the name, the role, and the joined
// date — which came OFF the row to live here, because a row's job is naming who is
// present. Email is deliberately absent: joining is by link (ADR-0030/0067), so
// co-members may never have exchanged addresses and nothing in a trip needs one.
//
// The admin verbs are HOST-PROVIDED. Passing them is what gates them, and only trip
// settings does today — it owns the confirm prompt and the "Removed" list that a kick
// has to refresh. The gate itself has always been server-side (ADR-0039), so this is
// about which host has the surrounding wiring, not about who is allowed.
import type { Membership } from '@waypoint/shared';
import { CONTROL_ICON, DOT_SEPARATOR } from '../../constants';
import { t } from '../../i18n/he';
import { Sheet } from '../Sheet';
import { RowActionList, type RowAction } from './ListRow';
import { Avatar, type AvatarPerson } from '../primitives/Avatar';
import { formatDayMonth } from '../../lib/time';
import { memberRoleLabel } from './MemberRow';

export function MemberSheet({
  member,
  person,
  isMe = false,
  onClose,
  onPromote,
  onRemove,
}: {
  member: Membership;
  person: AvatarPerson;
  isMe?: boolean;
  onClose: () => void;
  onPromote?: () => void;
  onRemove?: () => void;
}) {
  const name = person.displayName;
  // Never on yourself: you cannot promote yourself, and leaving is its own control in
  // trip settings rather than a "remove" aimed at your own row.
  const canPromote = !!onPromote && !isMe && member.role !== 'admin';
  const canRemove = !!onRemove && !isMe;

  return (
    <Sheet ariaLabel={t.settings.memberActions(name)} onClose={onClose}>
      <div className="ms-who">
        <Avatar person={person} size="lg" />
        <div className="ms-name">
          {name}
          {isMe && (
            <span className="mr">
              {' '}
              {DOT_SEPARATOR} {t.settings.you}
            </span>
          )}
        </div>
      </div>

      <div className="ms-facts">
        <div className="ms-fact">
          <span className="k">{t.settings.member.roleLabel}</span>
          <span className="v">{memberRoleLabel(member.role)}</span>
        </div>
        <div className="ms-fact">
          <span className="k">{t.settings.member.joinedLabel}</span>
          {/* A date is a Latin/numeric run inside RTL copy — an island (ADR-0118). */}
          <span className="v mono" dir="auto">
            {formatDayMonth(member.joinedAt)}
          </span>
        </div>
      </div>

      {/* The verbs render through the SHARED action list (ADR-0138 §1), not the
          `.ms-act` pair this sheet used to own — that was the fifth
          implementation of one row shape. The identity header above stays: it is
          this sheet's genuine content, and it is also where the "name your
          subject" rule the redesign applies everywhere else came from. */}
      {(canPromote || canRemove) && (
        <RowActionList
          actions={[
            ...(canPromote
              ? [
                  {
                    label: t.settings.promote,
                    icon: CONTROL_ICON.promote,
                    onSelect: onPromote,
                  } as RowAction,
                ]
              : []),
            ...(canRemove
              ? [
                  {
                    label: t.settings.removeMember,
                    icon: CONTROL_ICON.removeMember,
                    danger: true,
                    onSelect: onRemove,
                  } as RowAction,
                ]
              : []),
          ]}
        />
      )}
      <button className="ms-cancel" onClick={onClose}>
        {t.settings.closeMember}
      </button>
    </Sheet>
  );
}

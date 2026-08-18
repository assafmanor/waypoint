// **Who can owe a task, as `ChoiceGrid` options** (ADR-0189 §2, generalised by ADR-0196 §11).
//
// This was `TaskSheet`'s private `assigneeOptions` closure, and a sub-task's composer is its
// second host — so it moves here rather than being written a second time, which is root rule
// 8's "generalise the existing one-off" taken at the moment the one-off stops being one. What
// would have drifted is not cosmetic: the unassigned option's WORD (`לא משויך`, chosen over
// `של כולנו` because a presumed default must describe a state rather than claim one, ADR-0189)
// and its person-shaped-absence rendering are decisions, and two copies would eventually hold
// two answers.
//
// A hook rather than a constant because the roster is trip state, and a `.tsx` rather than a
// `.ts` because the options carry rendered leads — `Avatar` is the one renderer for a person
// (ADR-0133 §3), so nothing here draws a circle.
import { useMemo } from 'react';
import type { User } from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
import { Avatar } from './primitives/Avatar';
import type { Choice } from './primitives/ChoiceGrid';
import { Icon } from './Icon';
import { t } from '../i18n/he';

/** The value the "nobody" option carries. `ChoiceGrid` is single-select over strings, so the
 *  absence needs a value of its own rather than `undefined` — and a named constant rather
 *  than a bare `''` at two call sites, which is exactly the typo an enum member prevents. */
export const NOBODY = '__nobody__';

/** `assigneeUserId` as the wire wants it: `undefined` for the group's, an id for delegated. */
export const assigneeFromChoice = (value: string): string | undefined =>
  value === NOBODY ? undefined : value;

/** And back, for a form opening on an existing row. */
export const choiceFromAssignee = (assigneeUserId: string | undefined): string =>
  assigneeUserId ?? NOBODY;

export function useAssigneeOptions(): Choice<string>[] {
  const { members, users } = useTrip();
  return useMemo(
    () => [
      {
        value: NOBODY,
        icon: '',
        // A person-shaped ABSENCE, not a differently-shaped chip beside the people: the same
        // circle with the group glyph, dashed while unchosen. A different shape would say
        // "this is a different kind of answer" about the same question's default one.
        lead: (
          <span className="tsk-who-any">
            <Icon name="members" />
          </span>
        ),
        label: t.tasks.sheet.nobody,
      },
      ...members
        .map((m) => users.find((u: User) => u.id === m.userId))
        .filter((u): u is User => u !== undefined)
        .map((u) => ({
          value: u.id,
          icon: '',
          lead: <Avatar person={u} size="sm" />,
          label: u.displayName,
        })),
    ],
    [members, users],
  );
}

// What the header's member cluster shows — the three rules that used to be three
// inline expressions in `App.tsx`, which is where a real bug came from: with no
// co-members the cluster rendered nothing but its BUTTON still rendered, leaving an
// invisible ~8×44 tap target that opened a roster listing only you.
//
// Pure, so the rules are testable without mounting the trip shell (the pattern
// ADR-0121 §13 set for the Map: the decision lives in `lib/`, the component just
// renders it).
import { MEMBER_AVATAR_CAP } from '../constants';

export interface MemberCluster<T> {
  /** Everyone but you. The account avatar beside the cluster already shows you, so
   *  the cluster is "them" (app-shell.md §6). */
  others: T[];
  /** The faces actually drawn, capped. */
  visible: T[];
  /** The rest, which the `+N` bubble counts — and which the roster then lists in
   *  full, so the cap is a rendering detail rather than a truncation (ADR-0133 §9). */
  overflow: T[];
  /** Whether to render the control AT ALL. False on a solo trip: no source, no
   *  control — the same rule as every other derived affordance in this app
   *  (ADR-0045's quick tiles, ADR-0109 §6's near-me chip). A control that draws
   *  nothing is worse than no control, because you can still hit it. */
  show: boolean;
}

/** Generic over the person, with only the identity it actually compares constrained —
 *  so it stays usable for any person-shaped row AND the caller keeps the full shape it
 *  passed in (the header feeds `visible` straight to `Avatar`). */
export function memberCluster<T extends { id: string }>(
  users: T[],
  myUserId?: string,
): MemberCluster<T> {
  const others = users.filter((u) => u.id !== myUserId);
  return {
    others,
    visible: others.slice(0, MEMBER_AVATAR_CAP),
    overflow: others.slice(MEMBER_AVATAR_CAP),
    show: others.length > 0,
  };
}

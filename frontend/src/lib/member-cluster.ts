// What the header's people stack shows — the three rules that used to be three
// inline expressions in `App.tsx`, which is where a real bug came from: with no
// co-members the cluster rendered nothing but its BUTTON still rendered, leaving an
// invisible ~8×44 tap target that opened a roster listing only you.
//
// **The cap is a box count, and the caller owns it** (ADR-0149 §4). The stack now
// leads with your own ring — the account avatar merged into it — and the row it
// sits in is narrower on a small phone, so how many circles fit is a fact about
// the layout, not about this rule. What stays here is the shape: past the cap the
// LAST slot becomes the `+N` bubble rather than a further face, so the box never
// grows and the count stays honest.
//
// Pure, so the rules are testable without mounting the trip shell (the pattern
// ADR-0121 §13 set for the Map: the decision lives in `lib/`, the component just
// renders it).

export interface MemberCluster<T> {
  /** Everyone but you. You lead the stack yourself, so the cluster is "them". */
  others: T[];
  /** The faces actually drawn, capped. */
  visible: T[];
  /** The rest, which the `+N` bubble counts — and which the roster then lists in
   *  full, so the cap is a rendering detail rather than a truncation (ADR-0133 §9). */
  overflow: T[];
  /** Whether there is a GROUP at all. Not the gate on the control any more: the
   *  stack always draws, because you are in it and it is also the way to your own
   *  account. It stayed because "is anyone else here" is still a question the
   *  chrome asks — and because the rule it encodes ("no source, no control",
   *  ADR-0045 / ADR-0109 §6) is why the cluster ever drew an invisible tap target. */
  show: boolean;
}

/** Generic over the person, with only the identity it actually compares constrained —
 *  so it stays usable for any person-shaped row AND the caller keeps the full shape it
 *  passed in (the header feeds `visible` straight to `Avatar`).
 *
 *  `cap` is how many CO-MEMBER faces may be drawn; exceed it and one of those slots
 *  goes to the bubble instead. */
export function memberCluster<T extends { id: string }>(
  users: T[],
  myUserId: string | undefined,
  cap: number,
): MemberCluster<T> {
  const others = users.filter((u) => u.id !== myUserId);
  const drawn = others.length <= cap ? others.length : Math.max(cap - 1, 0);
  return {
    others,
    visible: others.slice(0, drawn),
    overflow: others.slice(drawn),
    show: others.length > 0,
  };
}

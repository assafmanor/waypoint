import { describe, expect, it } from 'vitest';
import { PEOPLE_STACK_CAP } from '../constants';
import { memberCluster } from './member-cluster';

const people = (...ids: string[]) => ids.map((id) => ({ id }));
// The header draws `PEOPLE_STACK_CAP` circles INCLUDING you, so the co-member cap
// it passes is one fewer (ADR-0149 §4).
const WIDE = PEOPLE_STACK_CAP.WIDE - 1;
const NARROW = PEOPLE_STACK_CAP.NARROW - 1;

describe('memberCluster', () => {
  it('reports no group when you are the only member', () => {
    // The reported bug this rule came from: the cluster drew nothing but its button
    // still rendered, so on a solo trip you could tap "nothing" in the chrome and land
    // in a roster that listed only you. The stack always draws now — you are in it —
    // but the question "is anyone else here" still has to be answerable.
    const c = memberCluster(people('u-me'), 'u-me', WIDE);
    expect(c.show).toBe(false);
    expect(c.others).toEqual([]);
    expect(c.visible).toEqual([]);
    expect(c.overflow).toEqual([]);
  });

  it('reports no group for an empty user list either — a snapshot that has not loaded', () => {
    expect(memberCluster([], 'u-me', WIDE).show).toBe(false);
  });

  it('shows as soon as there is one other person', () => {
    const c = memberCluster(people('u-me', 'u-dana'), 'u-me', WIDE);
    expect(c.show).toBe(true);
    expect(c.visible.map((p) => p.id)).toEqual(['u-dana']);
    expect(c.overflow).toEqual([]);
  });

  it('excludes you from the faces — you lead the stack yourself', () => {
    const c = memberCluster(people('u-dana', 'u-me', 'u-noam'), 'u-me', WIDE);
    expect(c.others.map((p) => p.id)).toEqual(['u-dana', 'u-noam']);
  });

  it('draws exactly the cap when the co-members fit it', () => {
    const c = memberCluster(people('u-me', 'a', 'b', 'c'), 'u-me', WIDE);
    expect(c.visible.map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(c.overflow).toEqual([]);
  });

  it('gives the LAST slot to the bubble past the cap, so the box never grows', () => {
    const c = memberCluster(people('u-me', 'a', 'b', 'c', 'd'), 'u-me', WIDE);
    expect(c.visible.map((p) => p.id)).toEqual(['a', 'b']);
    // Two faces plus one bubble is still three boxes — the same width as three faces.
    expect(c.visible.length + 1).toBe(WIDE);
    // …and the count stays honest: everyone drawn or counted, nobody dropped.
    expect(c.visible.length + c.overflow.length).toBe(4);
  });

  it('takes a smaller cap on a narrow phone, and re-counts rather than hiding a face', () => {
    const c = memberCluster(people('u-me', 'a', 'b', 'c', 'd'), 'u-me', NARROW);
    expect(c.visible.map((p) => p.id)).toEqual(['a']);
    expect(c.overflow.length).toBe(3);
  });

  it('counts everyone as "other" when the viewer is unknown', () => {
    // Signed out, or the snapshot arriving before `me` — better to show the group
    // than to hide it, and nobody is wrongly excluded.
    const c = memberCluster(people('a', 'b'), undefined, WIDE);
    expect(c.show).toBe(true);
    expect(c.others.length).toBe(2);
  });
});

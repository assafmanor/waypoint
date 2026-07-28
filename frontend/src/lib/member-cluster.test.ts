import { describe, expect, it } from 'vitest';
import { MEMBER_AVATAR_CAP } from '../constants';
import { memberCluster } from './member-cluster';

const people = (...ids: string[]) => ids.map((id) => ({ id }));

describe('memberCluster', () => {
  it('is HIDDEN when you are the only member', () => {
    // The reported bug: the cluster drew nothing but its button still rendered, so on
    // a solo trip you could tap "nothing" in the chrome and land in a roster that
    // listed only you. No source, no control.
    const c = memberCluster(people('u-me'), 'u-me');
    expect(c.show).toBe(false);
    expect(c.others).toEqual([]);
    expect(c.visible).toEqual([]);
    expect(c.overflow).toEqual([]);
  });

  it('is hidden for an empty user list too — a snapshot that has not loaded yet', () => {
    expect(memberCluster([], 'u-me').show).toBe(false);
  });

  it('shows as soon as there is one other person', () => {
    const c = memberCluster(people('u-me', 'u-dana'), 'u-me');
    expect(c.show).toBe(true);
    expect(c.visible.map((p) => p.id)).toEqual(['u-dana']);
    expect(c.overflow).toEqual([]);
  });

  it('excludes you from the faces — the account avatar already shows you', () => {
    const c = memberCluster(people('u-dana', 'u-me', 'u-noam'), 'u-me');
    expect(c.others.map((p) => p.id)).toEqual(['u-dana', 'u-noam']);
  });

  it('caps the faces and counts the rest', () => {
    const c = memberCluster(people('u-me', 'a', 'b', 'c', 'd'), 'u-me');
    expect(c.visible.length).toBe(MEMBER_AVATAR_CAP);
    expect(c.visible.length + c.overflow.length).toBe(4);
  });

  it('counts everyone as "other" when the viewer is unknown', () => {
    // Signed out, or the snapshot arriving before `me` — better to show the group
    // than to hide it, and nobody is wrongly excluded.
    const c = memberCluster(people('a', 'b'));
    expect(c.show).toBe(true);
    expect(c.others.length).toBe(2);
  });
});

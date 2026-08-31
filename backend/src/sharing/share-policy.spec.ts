import { describe, expect, it } from 'vitest';
import { SHARE_DETAIL_LEVEL } from '@waypoint/shared';
import { normalizeSharePolicy, sharePolicyHash } from './share-policy';

const everything = (over: Partial<Parameters<typeof sharePolicyHash>[0]> = {}) => ({
  detailLevel: SHARE_DETAIL_LEVEL.EVERYTHING,
  sensitive: { bookingSecrets: true, notesAndTasks: false, travelerIdentity: true },
  documentIds: ['doc-a', 'doc-b'],
  ...over,
});

describe('sharePolicyHash', () => {
  /**
   * **These two digests are Postgres's**, produced by the same expression the backfill in
   * `20260831120000_share_per_policy_adr0213` runs:
   *
   *   select encode(sha256(convert_to('everything|1|0|1|doc-a,doc-b', 'UTF8')), 'hex');
   *
   * They are the whole reason the canonical format may be written twice. A link minted
   * before the amendment must be FOUND by a repeat of its own policy rather than
   * duplicated beside it, and that only holds while SQL and TypeScript compose the same
   * string. Change the format in one and this fails, which is the point.
   */
  it('agrees with the migration backfill, digest for digest', () => {
    expect(sharePolicyHash(everything())).toBe(
      '41f2850700c26082697d9b1bed4d6e7feaa947f6a010e5f56f75199ca7a78cad',
    );
    expect(
      sharePolicyHash({
        detailLevel: SHARE_DETAIL_LEVEL.SUMMARY,
        sensitive: { bookingSecrets: false, notesAndTasks: false, travelerIdentity: false },
        documentIds: [],
      }),
    ).toBe('a34c7dc002c18b3d7d6ec1543a64ad9cbe5533249fd4be1b015fd4cb1dcaa6eb');
  });

  it('is stable across file order and duplicates', () => {
    expect(sharePolicyHash(everything({ documentIds: ['doc-b', 'doc-a', 'doc-a'] }))).toBe(
      sharePolicyHash(everything()),
    );
  });

  it('separates policies that reveal different things', () => {
    const base = sharePolicyHash(everything());
    expect(
      sharePolicyHash(
        everything({
          sensitive: { bookingSecrets: true, notesAndTasks: true, travelerIdentity: true },
        }),
      ),
    ).not.toBe(base);
    expect(sharePolicyHash(everything({ documentIds: ['doc-a'] }))).not.toBe(base);
    expect(sharePolicyHash(everything({ detailLevel: SHARE_DETAIL_LEVEL.FULL }))).not.toBe(base);
  });

  /** Below Everything the extras are impossible, so they must not create a second link
   *  that reveals precisely the same thing. */
  it('folds sensitive fields and files away below everything', () => {
    const clean = {
      detailLevel: SHARE_DETAIL_LEVEL.FULL,
      sensitive: { bookingSecrets: false, notesAndTasks: false, travelerIdentity: false },
      documentIds: [],
    };
    expect(
      sharePolicyHash({
        detailLevel: SHARE_DETAIL_LEVEL.FULL,
        sensitive: { bookingSecrets: true, notesAndTasks: true, travelerIdentity: true },
        documentIds: ['doc-a'],
      }),
    ).toBe(sharePolicyHash(clean));
    expect(normalizeSharePolicy(clean)).toEqual(clean);
  });
});

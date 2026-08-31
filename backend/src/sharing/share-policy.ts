import { createHash } from 'node:crypto';
import {
  NO_SENSITIVE_FIELDS,
  SHARE_DETAIL_LEVEL,
  type ShareSensitiveFields,
  type UpsertTripShareInput,
} from '@waypoint/shared';

/** A share's policy, normalized — what the link actually reveals, and nothing else. */
export interface SharePolicyInput {
  detailLevel: UpsertTripShareInput['detailLevel'];
  sensitive: ShareSensitiveFields;
  documentIds: string[];
}

/**
 * **Normalize before hashing, or the same policy hashes two ways.**
 *
 * Below Everything the sensitive families and the file list are not merely ignored, they
 * are *impossible* — `upsertTripShareSchema` refuses them at both edges. Folding that here
 * too means a client that sends `summary` with a stray `bookingSecrets: true` (or the same
 * policy with its files in a different order, or listed twice) lands on the row it should,
 * instead of minting a second link that reveals exactly the same thing.
 */
export function normalizeSharePolicy(input: SharePolicyInput): SharePolicyInput {
  const everything = input.detailLevel === SHARE_DETAIL_LEVEL.EVERYTHING;
  return {
    detailLevel: input.detailLevel,
    sensitive: everything ? input.sensitive : NO_SENSITIVE_FIELDS,
    documentIds: everything ? [...new Set(input.documentIds)].sort() : [],
  };
}

/**
 * **The identity of a share link** (ADR-0213's tenth amendment §3).
 *
 * A trip holds one link per policy, so this is what `@@unique([tripId, policyHash])` keys
 * on — and what keeps `PUT /trips/:id/share` idempotent, which the share sheet's absence
 * of a Save button depends on: the same policy twice is the same hash, the same row, the
 * same code.
 *
 * **The canonical string is duplicated, once, in SQL** — the backfill in
 * `20260831120000_share_per_policy_adr0213` composes exactly this and hashes it with
 * Postgres's core `sha256()`, so every link that existed before the amendment resolves to
 * the row a repeat of its own policy will find. `share-policy.spec.ts` pins the two
 * together against a literal digest; change the format here and that test fails rather
 * than the duplication drifting silently.
 */
export function sharePolicyHash(input: SharePolicyInput): string {
  const policy = normalizeSharePolicy(input);
  const canonical = [
    policy.detailLevel,
    policy.sensitive.bookingSecrets ? '1' : '0',
    policy.sensitive.notesAndTasks ? '1' : '0',
    policy.sensitive.travelerIdentity ? '1' : '0',
    policy.documentIds.join(','),
  ].join('|');
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

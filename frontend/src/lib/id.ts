// Client-generated ids, in one place (F-14). Two kinds of caller, one problem:
// entity ids (ADR-0018 — every create carries one, which is what makes an outbox
// replay idempotent instead of a second row) and opaque correlation ids (a change
// group, ADR-0092; a Places session token).

const UUID_BYTES = 16;
const UUID_VERSION_BYTE = 6;
const UUID_VARIANT_BYTE = 8;

/** A fresh v4 UUID.
 *
 *  `crypto.randomUUID` is **secure-context-only** by spec, so it is absent on a
 *  plain-HTTP LAN host — exactly how this app gets opened on a real phone — and 16
 *  call sites were generating ids straight off it. `crypto.getRandomValues` carries
 *  no such restriction, so the fallback assembles the same v4 shape from its bytes
 *  rather than reaching for `Math.random`: these ids are the sync pipeline's
 *  idempotency keys, so weak entropy here is a collision, not a style nit. The
 *  result is lowercase hex and satisfies `entityIdSchema` either way. */
export function generateId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();

  const bytes = crypto.getRandomValues(new Uint8Array(UUID_BYTES));
  bytes[UUID_VERSION_BYTE] = (bytes[UUID_VERSION_BYTE] & 0x0f) | 0x40; // version 4
  bytes[UUID_VARIANT_BYTE] = (bytes[UUID_VARIANT_BYTE] & 0x3f) | 0x80; // variant 10x

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  // 8-4-4-4-12.
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

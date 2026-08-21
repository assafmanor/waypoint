import { describe, expect, it } from 'vitest';
import { NOTIFICATION_KIND } from '@waypoint/shared';
import { deliveryFor, NOTIFICATION_KINDS } from './notification-registry';

describe('deliveryFor — the kind’s policy, spoken to the push service', () => {
  it('gives a timeCritical kind HIGH urgency, and nothing else', () => {
    // RFC 8030 §5.3's `high` row is "incoming call or time-sensitive alert" and is the one
    // delivered to a device on low battery — which is what `timeCritical` already means, so
    // this is a rename rather than a second judgement.
    for (const kind of NOTIFICATION_KINDS) {
      expect(deliveryFor(kind.id).urgency).toBe(kind.timeCritical ? 'high' : 'normal');
    }
  });

  it('caps the TTL at the kind’s own staleness, never the library’s four weeks', () => {
    // The reported bug: `web-push` defaults to a 2,419,200-second TTL, so a device that was
    // asleep at the aimed-at minute received the send whenever it next reconnected. A send
    // the sweep would refuse to re-derive is not one a push service should deliver for us.
    const FOUR_WEEKS = 2_419_200;
    for (const kind of NOTIFICATION_KINDS) {
      const { ttlSeconds } = deliveryFor(kind.id);
      expect(ttlSeconds).toBe(Math.ceil(kind.staleAfterMs / 1000));
      expect(ttlSeconds).toBeLessThan(FOUR_WEEKS);
    }
  });

  it('never returns a TTL of zero, which would mean "deliver now or never"', () => {
    for (const kind of NOTIFICATION_KINDS) {
      expect(deliveryFor(kind.id).ttlSeconds).toBeGreaterThan(0);
    }
  });

  it('rounds the TTL UP, so it cannot expire inside the staleness window', () => {
    // A TTL a second short could drop a send the sweep would still have considered current.
    const spanEdge = NOTIFICATION_KINDS.find((k) => k.id === NOTIFICATION_KIND.SPAN_EDGE_SOON);
    expect(deliveryFor(spanEdge!.id).ttlSeconds).toBe(Math.ceil(spanEdge!.staleAfterMs / 1000));
  });

  it('gives an UNKNOWN kind the conservative pair rather than a default four weeks', () => {
    // The dev-only `test` send is not in the catalogue. It must not inherit the library's
    // month-long default just for being unnamed.
    const delivery = deliveryFor(NOTIFICATION_KIND.TEST);
    expect(delivery.urgency).toBe('normal');
    expect(delivery.ttlSeconds).toBe(15 * 60);
  });

  it('registers every catalogue kind exactly once', () => {
    const ids = NOTIFICATION_KINDS.map((k) => k.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

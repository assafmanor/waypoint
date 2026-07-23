import { Injectable } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerOptions } from '@nestjs/throttler';
import type { Principal } from '../auth/principal';

export const MINUTE_TTL_MS = 60_000;
export const DAY_TTL_MS = 24 * 60 * 60 * 1000;

/** The two rate-limit windows the paid proxy routes carry (ADR-0108 §5): a
 *  per-minute burst cap and a per-day drip cap, each keyed per member·trip. */
export const PLACES_THROTTLER = {
  MINUTE: 'places-minute',
  DAY: 'places-day',
} as const;

type RequestWithPrincipal = {
  ip?: string;
  user?: Principal;
  params?: Record<string, string>;
};

/**
 * Rate-limits the paid Places proxy routes per member·trip (ADR-0108 §5) — reusing
 * `@nestjs/throttler` (the existing mechanism, backend-review B-10) with only the
 * tracker changed. `MembershipGuard` stops non-members; this stops a member (or a
 * hijacked member session) scripting the proxy to run up the server-key bill.
 *
 * It enforces its own two windows (minute + day) instead of the global per-IP
 * `default` throttler, so the outer per-IP guard (`app.module.ts`) still applies
 * on top as the backstop — the per-member·trip cap is additive, not a replacement.
 * The per-route limits come from `@Throttle`; the ttls are fixed here.
 */
@Injectable()
export class PlacesThrottlerGuard extends ThrottlerGuard {
  async onModuleInit(): Promise<void> {
    await super.onModuleInit();
    // Replace the inherited `default` (per-IP) throttler with our two per-member·trip
    // windows. The limits are placeholders — every guarded route overrides them via
    // @Throttle; only the ttls (and the window names) matter here.
    const windows: ThrottlerOptions[] = [
      { name: PLACES_THROTTLER.MINUTE, ttl: MINUTE_TTL_MS, limit: 0 },
      { name: PLACES_THROTTLER.DAY, ttl: DAY_TTL_MS, limit: 0 },
    ];
    this.throttlers = windows;
  }

  /** Key the limit on the actor + the trip in the route, not the IP — so shared
   *  devices / NAT don't collide and the cap is genuinely per member per trip
   *  (ADR-0108 §5). Falls back to IP if either is somehow absent. */
  protected async getTracker(req: RequestWithPrincipal): Promise<string> {
    const userId = req.user?.userId;
    const tripId = req.params?.tripId;
    if (userId && tripId) return `${userId}:${tripId}`;
    return req.ip ?? 'unknown';
  }
}

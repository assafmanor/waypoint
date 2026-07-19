import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isDevAuthEnabled } from '../common/env';
import type { Principal } from './principal';
import { IS_PUBLIC_KEY } from './public.decorator';
import { verifyAccessToken } from './token.util';

type RequestWithUser = {
  headers: Record<string, string | string[] | undefined>;
  user?: Principal;
};

// Matches backend/prisma/seed.mjs's ME user — dev-only convenience, gated by
// DEV_AUTH so it's never live in prod (see qa scripts under backend/_internal).
export const DEV_PRINCIPAL: Principal = { userId: 'u-assaf', email: 'assaf@example.com' };

/** Global guard (app.module.ts): every route needs a Bearer access JWT unless
 *  marked `@Public()` (ADR-0020). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<RequestWithUser>();

    // A real Bearer token always wins over the dev stub — DEV_AUTH is only a
    // fallback for requests that don't present one at all.
    const auth = req.headers.authorization;
    const header = Array.isArray(auth) ? auth[0] : auth;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;

    if (!token) {
      if (isDevAuthEnabled()) {
        req.user = DEV_PRINCIPAL;
        return true;
      }
      throw new UnauthorizedException('Missing access token');
    }

    const payload = verifyAccessToken(token);
    if (!payload) throw new UnauthorizedException('Invalid or expired access token');

    req.user = { userId: payload.sub, email: payload.email };
    return true;
  }
}

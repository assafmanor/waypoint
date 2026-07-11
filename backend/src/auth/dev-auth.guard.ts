import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Principal } from './principal';

type RequestWithUser = { params: Record<string, string>; user?: Principal };

// Matches backend/prisma/seed.mjs's ME user — swapped for real Google sessions in T-007.
const DEV_PRINCIPAL: Principal = { userId: 'u-assaf', email: 'assaf@example.com' };

/** T-033 walking-skeleton stub. Only injects a principal when DEV_AUTH=1; never on in prod. */
@Injectable()
export class DevAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (process.env.DEV_AUTH !== '1') {
      throw new UnauthorizedException(
        'No authentication configured (set DEV_AUTH=1 for local dev)',
      );
    }
    const req = context.switchToHttp().getRequest<RequestWithUser>();
    req.user = DEV_PRINCIPAL;
    return true;
  }
}

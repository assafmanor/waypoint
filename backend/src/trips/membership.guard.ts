import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Principal } from '../auth/principal';

type RequestWithUser = { params: Record<string, string>; user?: Principal };

/** 404s (not 403) on non-membership, to avoid leaking trip existence (api-contract.md). */
@Injectable()
export class MembershipGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithUser>();
    if (!req.user) {
      throw new UnauthorizedException('No principal on request');
    }
    const tripId = req.params.tripId;
    const membership = await this.prisma.membership.findUnique({
      where: { tripId_userId: { tripId, userId: req.user.userId } },
    });
    if (!membership) {
      throw new NotFoundException('Trip not found');
    }
    return true;
  }
}

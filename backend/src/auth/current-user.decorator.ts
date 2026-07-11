import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { Principal } from './principal';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Principal => {
    const req = ctx.switchToHttp().getRequest<{ user?: Principal }>();
    if (!req.user) {
      throw new UnauthorizedException('No principal on request');
    }
    return req.user;
  },
);

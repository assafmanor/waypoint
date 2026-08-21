// The subscription routes (ADR-0197 §2), plus the dev-only proof that the pipe works.
//
// **No `MembershipGuard` and no `:tripId`.** A subscription belongs to a person and a
// device, not to a trip — one device is reached about every trip the person is in — so
// these sit beside `/me` in the control plane (ADR-0022). `JwtAuthGuard` is global, so
// every route here already requires an access token and `@CurrentUser()` is the only
// authorization this needs: nothing accepts a `userId` from the caller.
import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  createPushSubscriptionSchema,
  deletePushSubscriptionSchema,
  ERROR_CODE,
} from '@waypoint/shared';
import { createZodDto } from 'nestjs-zod';
import { CurrentUser } from '../auth/current-user.decorator';
import type { Principal } from '../auth/principal';
import { isDevAuthEnabled } from '../common/env';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { NotificationsService } from './notifications.service';

class CreatePushSubscriptionDto extends createZodDto(createPushSubscriptionSchema) {}
class DeletePushSubscriptionDto extends createZodDto(deletePushSubscriptionSchema) {}

/** Tighter than the app-wide `default` policy (ADR-0075). A client subscribes once per
 *  install and unsubscribes once per sign-out, so a real user never approaches this — and
 *  the route writes a row keyed on a value the caller supplies, which is the shape worth
 *  bounding. Deliberately not as tight as auth's: a re-subscribe storm is possible and
 *  harmless (the upsert is idempotent), so this bounds abuse rather than retries. */
const SUBSCRIPTION_LIMIT = { default: { limit: 30, ttl: 60_000 } };

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(ThrottlerGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post('subscription')
  @HttpCode(204)
  @Throttle(SUBSCRIPTION_LIMIT)
  @ApiNoContentResponse()
  async subscribe(
    @CurrentUser() user: Principal,
    @Body(new ZodValidationPipe(createPushSubscriptionSchema)) body: CreatePushSubscriptionDto,
  ): Promise<void> {
    await this.notifications.subscribe(user.userId, body);
  }

  /** A `DELETE` with a body, which is unusual and is the right shape here: the endpoint is
   *  a bearer capability and a URL, so putting it in a path segment would percent-encode a
   *  credential into every access log. */
  @Delete('subscription')
  @HttpCode(204)
  @Throttle(SUBSCRIPTION_LIMIT)
  @ApiNoContentResponse()
  async unsubscribe(
    @CurrentUser() user: Principal,
    @Body(new ZodValidationPipe(deletePushSubscriptionSchema)) body: DeletePushSubscriptionDto,
  ): Promise<void> {
    await this.notifications.unsubscribe(user.userId, body.endpoint);
  }

  /**
   * Send a test notification to every device the caller has registered.
   *
   * **Dev-only, and gated on the same predicate as the auth bypass** — which is the point:
   * `isDevAuthEnabled()` is already false in production *and* refuses to be true there
   * (`validateConfig` will not let the process start with `DEV_AUTH=1` and
   * `NODE_ENV=production`), so this route inherits a gate that is defended at boot rather
   * than inventing a second flag of its own.
   *
   * A route rather than a client button, deliberately: push only exists in a **production
   * build** (the service worker is not registered under `pnpm dev`), where
   * `import.meta.env.DEV` is false — so a `DEV`-gated button could never test the thing it
   * exists to test. A curl works against any build, including a real phone on staging.
   */
  @Post('test')
  @Throttle(SUBSCRIPTION_LIMIT)
  @ApiOkResponse()
  async test(@CurrentUser() user: Principal): Promise<{ attempted: number; sent: number }> {
    if (!isDevAuthEnabled()) throw new ForbiddenException(ERROR_CODE.FORBIDDEN);
    return this.notifications.sendTest(user.userId);
  }
}

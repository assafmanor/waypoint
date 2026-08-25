// **One route, batch-shaped, carrying a set of modes** (ADR-0205 §6, amended by §Y2).
//
// Three shapes were available and two of them are forbidden by name. A **per-leg** endpoint turns
// one ~1 s matrix call into five and makes §3's pre-filter a client concern, which it must not be.
// A **per-mode** endpoint puts a round-trip behind every press of the mode control, which
// ADR-0206 §Z2 forbids: a switch has to be instant, and it can only be instant if the answer for
// the mode being switched to is already in hand. So: a day's ordered stops × every mode the caller
// wants, in one request, one request per day.
//
// **Trip-scoped for `MembershipGuard`**, like every other controller here. The `tripId` is not
// decoration: the gate needs the trip's own clusters (ADR-0186 §4) to answer what may be walked,
// and the guard is what stops a session asking about a trip it is not in.
import { Body, Controller, HttpCode, Param, Post, Res, UseGuards } from '@nestjs/common';
import { ApiAcceptedResponse, ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { routeBatchRequestSchema, routeBatchSchema, type RouteBatch } from '@waypoint/shared';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { MembershipGuard } from '../trips/membership.guard';
import { RoutingService } from './routing.service';

class RouteBatchRequestDto extends createZodDto(routeBatchRequestSchema) {}
class RouteBatchDto extends createZodDto(routeBatchSchema) {}

@ApiTags('routing')
@ApiBearerAuth()
@Controller('trips/:tripId/routes')
@UseGuards(MembershipGuard)
export class RoutingController {
  constructor(private readonly routing: RoutingService) {}

  /**
   * A `POST` because the question does not fit a URL — a day's coordinates and its modes are a
   * document — and because asking has the side effect of starting a warm. Nothing is created that
   * the caller can address, so the success code is 200 rather than 201.
   *
   * **`202` when anything is still pending, with `Retry-After`** — ADR-0187's flow exactly, which
   * `map-archive-cache.ts` already knows how to read. The body is the same either way and is
   * always usable: whatever is answered now is in `estimates`, and a client that ignores the
   * status still renders a correct day with fewer numbers in it.
   */
  @Post()
  // Nest answers a POST with `201` by default, which would be wrong twice over: nothing was
  // created, and a client distinguishing "complete" from "still warming" would be reading a
  // status this route never means. `202` is set on the response below when it applies.
  @HttpCode(200)
  @ApiOkResponse({ type: RouteBatchDto })
  @ApiAcceptedResponse({ type: RouteBatchDto })
  @ZodSerializerDto(RouteBatchDto)
  async batch(
    @Param('tripId') tripId: string,
    @Body(new ZodValidationPipe(routeBatchRequestSchema)) body: RouteBatchRequestDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RouteBatch> {
    const batch = await this.routing.batch(tripId, body);
    if (batch.retryAfterSeconds !== undefined) {
      res.status(202);
      res.setHeader('Retry-After', String(batch.retryAfterSeconds));
    }
    return batch;
  }
}

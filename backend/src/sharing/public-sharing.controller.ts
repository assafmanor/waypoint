import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { sharedItinerarySchema, type SharedItinerary } from '@waypoint/shared';
import type { Response } from 'express';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { Public } from '../auth/public.decorator';
import { attachmentDisposition } from '../common/attachment-disposition';
import { applyPublicShareHeaders } from './public-response-headers';
import { SharingService } from './sharing.service';

class SharedItineraryDto extends createZodDto(sharedItinerarySchema) {}

/**
 * **The anonymous side**, and the only unauthenticated read path into a trip's content.
 *
 * Three things hold it in place. The code IS the credential, so the per-IP cap is what
 * stands between an 8-character keyspace and someone enumerating it — the same 20/min the
 * invite preview carries, and for the identical reason (B-10). Every response gets the
 * no-store / no-referrer / noindex set, because a bearer link that a cache, a `Referer`
 * header or a crawler can copy is not really revocable. And a missing, revoked or rotated
 * code produces one indistinguishable 404, so the route cannot be used to ask whether a
 * given trip exists.
 */
@ApiTags('sharing')
@Controller('shared-itineraries')
@Public()
@Throttle({ default: { limit: 20, ttl: 60_000 } })
export class PublicSharingController {
  constructor(private readonly sharing: SharingService) {}

  @Get(':code')
  @ApiOkResponse({ type: SharedItineraryDto })
  @ZodSerializerDto(SharedItineraryDto)
  async read(
    @Param('code') code: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SharedItinerary> {
    applyPublicShareHeaders(res);
    return this.sharing.byCode(code);
  }

  /**
   * The paper. Its own, tighter cap: a PDF render is a browser tab and several seconds of
   * CPU, where the JSON read is one query — so 5/min per IP rather than 20, and the render
   * queue itself answers 503 with a `Retry-After` when it is saturated.
   */
  @Get(':code/pdf')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async pdf(@Param('code') code: string, @Res() res: Response): Promise<void> {
    const { buffer, filename } = await this.sharing.pdf(code);
    applyPublicShareHeaders(res);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', attachmentDisposition(filename));
    res.send(buffer);
  }

  @Get(':code/documents/:documentId')
  async document(
    @Param('code') code: string,
    @Param('documentId') documentId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, mimeType, title } = await this.sharing.publicDocument(code, documentId);
    applyPublicShareHeaders(res);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', attachmentDisposition(title, mimeType));
    res.send(buffer);
  }
}

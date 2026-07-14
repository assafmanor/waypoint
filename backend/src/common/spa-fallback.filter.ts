import { join } from 'node:path';
import { ArgumentsHost, Catch, ExceptionFilter, NotFoundException } from '@nestjs/common';
import type { Request, Response } from 'express';

// Where the production image puts the built PWA; never exists in dev (ADR-0020).
export const STATIC_ROOT = join(__dirname, '..', '..', 'public');
const SPA_INDEX = join(STATIC_ROOT, 'index.html');
const HTML_MIME = 'text/html';

/** Deep-links client routes: browser navigations the router 404'd get the PWA.
 *  Paths a controller handles never reach here, so no API-prefix list to maintain. */
@Catch(NotFoundException)
export class SpaFallbackFilter implements ExceptionFilter {
  catch(exception: NotFoundException, host: ArgumentsHost): void {
    const req = host.switchToHttp().getRequest<Request>();
    const res = host.switchToHttp().getResponse<Response>();
    if (req.method === 'GET' && req.headers.accept?.includes(HTML_MIME)) {
      res.sendFile(SPA_INDEX);
      return;
    }
    res.status(exception.getStatus()).json(exception.getResponse());
  }
}

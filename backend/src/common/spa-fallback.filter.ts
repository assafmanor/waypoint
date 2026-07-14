import { join } from 'node:path';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';

// Where the production image puts the built PWA; never exists in dev (ADR-0020).
export const STATIC_ROOT = join(__dirname, '..', '..', 'public');
const SPA_INDEX = join(STATIC_ROOT, 'index.html');
const HTML_MIME = 'text/html';

/** Deep-links client routes to the PWA. A browser document navigation (GET +
 *  `Accept: text/html`) gets index.html whether the router 404'd (an unknown
 *  client route) or the auth guard 401'd. The 401 case is a client route that
 *  collides with a guarded API route (e.g. `/trips`): a hard refresh there
 *  sends a document GET carrying the session cookie but no in-memory bearer,
 *  so the guard rejects it and we'd otherwise paint raw 401 JSON over the app.
 *  Programmatic fetch/XHR (`Accept: * / *` or `application/json`) still gets
 *  the real status + JSON body, so lib/api.ts's silent-refresh retry is
 *  unaffected. Paths a controller handles never reach here, so no API-prefix
 *  list to maintain. */
@Catch(NotFoundException, UnauthorizedException)
export class SpaFallbackFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const req = host.switchToHttp().getRequest<Request>();
    const res = host.switchToHttp().getResponse<Response>();
    if (req.method === 'GET' && req.headers.accept?.includes(HTML_MIME)) {
      res.sendFile(SPA_INDEX);
      return;
    }
    res.status(exception.getStatus()).json(exception.getResponse());
  }
}

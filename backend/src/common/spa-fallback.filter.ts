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

/** Serves the PWA for browser document navigations (GET + Accept: text/html)
 *  that 404 (unknown client route) or 401 (client route shadowing a guarded
 *  API route, e.g. /trips — a hard refresh sends the cookie but no in-memory
 *  bearer). Programmatic fetch/XHR still gets the real status + JSON. */
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

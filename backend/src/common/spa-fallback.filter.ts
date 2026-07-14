import { join } from 'node:path';
import { ArgumentsHost, Catch, ExceptionFilter, NotFoundException } from '@nestjs/common';
import type { Request, Response } from 'express';

// ADR-0020 single-origin: the production image places the built PWA next to
// the compiled backend (deployment.md). The directory never exists in dev,
// where Vite serves the frontend on :5173.
export const STATIC_ROOT = join(__dirname, '..', '..', 'public');
const SPA_INDEX = join(STATIC_ROOT, 'index.html');
const HTML_MIME = 'text/html';

/**
 * Serves the PWA for browser navigations the router 404'd, so client-side
 * routes deep-link — without a hand-maintained list of API prefixes: a path a
 * controller handles never reaches this filter, so API routes (present and
 * future) are excluded by construction. Non-navigation requests (no
 * `text/html` in Accept) keep the JSON 404 shape.
 */
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

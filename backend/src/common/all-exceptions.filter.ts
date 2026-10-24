import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { ERROR_CODE } from '@waypoint/shared';
import { isBearerLinkPath, PUBLIC_SHARE_HEADERS } from '../sharing/public-response-headers';
import { homeMeta } from '../spa/share-meta';
// Re-exported for the callers that imported them from here before ADR-0220 moved them to a
// module that does not pull in Prisma. `spa/spa-paths.ts` is the owner.
export { SPA_INDEX, STATIC_ROOT } from '../spa/spa-paths';
import type { SpaShellService } from '../spa/spa-shell.service';
import { REVALIDATE } from './static-cache';

const HTML_MIME = 'text/html';

/**
 * **The statuses a document navigation gets the app shell for instead of JSON.**
 *
 * 404 and 401 are the original pair: an unknown path is an app route, and a guard's 401 on a
 * navigation means "sign in", which is a screen.
 *
 * **429 joined them from a live run of ADR-0220, and it is a regression that change
 * introduced.** `/join/<code>` now carries a 20/min per-IP cap (it reaches the database to
 * name a trip), and before it had none — so a group of friends behind one NAT opening the
 * same invite could be served the raw error envelope where they used to get the join screen.
 * Answering with the shell costs one string replace and no query: the guard has already
 * rejected the request, so the work the cap protects is not done either way, and the app can
 * show its own "could not load the link" state instead of the browser showing our JSON.
 */
const SHELL_STATUSES = new Set<number>([
  HttpStatus.NOT_FOUND,
  HttpStatus.UNAUTHORIZED,
  HttpStatus.TOO_MANY_REQUESTS,
]);

/** The documented error contract (api-contract.md §14). */
export interface ErrorEnvelope {
  error: { code: string; message: string; details?: unknown };
}

const STATUS_CODES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: ERROR_CODE.BAD_REQUEST,
  [HttpStatus.UNAUTHORIZED]: ERROR_CODE.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: ERROR_CODE.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ERROR_CODE.NOT_FOUND,
  [HttpStatus.CONFLICT]: ERROR_CODE.CONFLICT,
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: ERROR_CODE.UNSUPPORTED_MEDIA_TYPE,
  [HttpStatus.PAYLOAD_TOO_LARGE]: ERROR_CODE.PAYLOAD_TOO_LARGE,
  [HttpStatus.TOO_MANY_REQUESTS]: ERROR_CODE.RATE_LIMITED,
};

/**
 * The single global exception filter (backend-review B-05): every error leaves
 * the API in the documented `{ error: { code, message, details? } }` envelope —
 * guard 401/404s, `NotFoundException`s, mapped Prisma errors, and unexpected 500s
 * all share one shape so the client can branch on `code` (auth vs access vs
 * validation vs conflict vs retryable) and the offline outbox can tell a
 * permanent 4xx (drop) from a retryable 5xx (keep).
 *
 * It also folds in the SPA fallback (previously `SpaFallbackFilter`): a browser
 * document navigation (GET + Accept: text/html) that 404/401s loads the PWA
 * shell instead of JSON. Only active when a built SPA index path is injected
 * (production) — dev/test get JSON for everything.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  /** `shell` is absent in dev and test, where there is no built PWA (ADR-0020) and every
   *  route answers JSON. When present, every HTML fallback renders through it — one place
   *  knows how the shell is built, so `/trips` and `/day/…` carry the app's own preview tags
   *  rather than a tag-less document (ADR-0220). */
  constructor(private readonly shell?: SpaShellService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const { status, body } = toEnvelope(exception);

    const isHtmlNav = req.method === 'GET' && (req.headers.accept?.includes(HTML_MIME) ?? false);
    if (this.shell && isHtmlNav && SHELL_STATUSES.has(status)) {
      // The shell is never cached past a revalidation (static-cache.ts): it names
      // the current build's hashed chunks, and a deploy deletes the previous ones.
      //
      // A bearer-link navigation is the exception. The CODE IS IN THE URL BEING REQUESTED,
      // so this response must refuse indexing and referrer leakage, or a crawler that
      // follows one pasted link puts a private trip in a search index (ADR-0213 §5). Every
      // other app route keeps its ordinary revalidation policy.
      //
      // **This path no longer answers `/s/<code>` or `/join/<code>` in practice** —
      // `SpaShellController` owns those three URLs since ADR-0220 and gives them their own
      // preview. The bearer-link branch stays because the routes it protects are matched
      // here by PATH, not by controller: a code with a trailing segment, a HEAD, or any
      // future path shaped like one still lands in the fallback, and losing the headers on
      // the way would be silent.
      const html = this.shell.render(homeMeta(), this.shell.origin(req.headers));
      if (html) {
        res.status(HttpStatus.OK).type(HTML_MIME);
        res.set(
          isBearerLinkPath(req.path) ? PUBLIC_SHARE_HEADERS : { 'Cache-Control': REVALIDATE },
        );
        res.send(html);
        return;
      }
    }

    // Log server-side faults (never their body — an envelope message is generic,
    // but the underlying exception can carry data) so a 500 is diagnosable.
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(`${req.method} ${req.url} -> ${status}`, exception as Error);
    }

    res.status(status).json(body);
  }
}

function toEnvelope(exception: unknown): { status: number; body: ErrorEnvelope } {
  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    return prismaEnvelope(exception);
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const response = exception.getResponse();
    // A pipe/service that already threw the documented envelope passes through
    // unchanged (e.g. ZodValidationPipe's VALIDATION_ERROR, the 415 allow-list).
    if (isEnvelope(response)) return { status, body: response };

    const message =
      typeof response === 'string' ? response : (extractMessage(response) ?? exception.message);
    return { status, body: { error: { code: codeFor(status), message } } };
  }

  // Anything else is an unexpected fault: never leak its message to the client.
  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    body: { error: { code: ERROR_CODE.INTERNAL_ERROR, message: 'Internal server error' } },
  };
}

/** Map the Prisma error codes the app can actually surface to stable statuses,
 *  with generic messages that never leak column/constraint names. */
function prismaEnvelope(err: Prisma.PrismaClientKnownRequestError): {
  status: number;
  body: ErrorEnvelope;
} {
  switch (err.code) {
    case 'P2002':
      return {
        status: HttpStatus.CONFLICT,
        body: envelope(ERROR_CODE.CONFLICT, 'Resource already exists'),
      };
    case 'P2025':
      return {
        status: HttpStatus.NOT_FOUND,
        body: envelope(ERROR_CODE.NOT_FOUND, 'Resource not found'),
      };
    case 'P2003':
      return {
        status: HttpStatus.CONFLICT,
        body: envelope(ERROR_CODE.CONSTRAINT_VIOLATION, 'Referenced resource is missing or in use'),
      };
    default:
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        body: envelope(ERROR_CODE.INTERNAL_ERROR, 'Internal server error'),
      };
  }
}

const envelope = (code: string, message: string): ErrorEnvelope => ({ error: { code, message } });

function codeFor(status: number): string {
  return STATUS_CODES[status] ?? (status >= 500 ? ERROR_CODE.INTERNAL_ERROR : ERROR_CODE.ERROR);
}

function isEnvelope(value: unknown): value is ErrorEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as { error: unknown }).error === 'object' &&
    (value as { error: { code?: unknown } }).error !== null &&
    typeof (value as { error: { code?: unknown } }).error.code === 'string'
  );
}

function extractMessage(response: unknown): string | undefined {
  if (typeof response !== 'object' || response === null) return undefined;
  const message = (response as { message?: unknown }).message;
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) return message.join('; ');
  return undefined;
}

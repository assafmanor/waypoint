import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Logger,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  accessTokenResponseSchema,
  ERROR_CODE,
  MAX_AVATAR_SIZE_BYTES,
  meSchema,
  updateMeSchema,
  type AccessTokenResponse,
  type Me,
  type UpdateMeInput,
} from '@waypoint/shared';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { DEFAULT_FRONTEND_URL, FRONTEND_URL as FRONTEND_URL_ENV } from '../common/env';
import { sniffImageMimeType } from '../common/image-sniff';
import { AuthService } from './auth.service';
import { parseCookieHeader } from './cookies.util';
import { CurrentUser } from './current-user.decorator';
import type { Principal } from './principal';
import { Public } from './public.decorator';

class MeDto extends createZodDto(meSchema) {}
class UpdateMeDto extends createZodDto(updateMeSchema) {}
class AccessTokenDto extends createZodDto(accessTokenResponseSchema) {}

// Neither typed against 'express' (not an installed devDependency here) — these
// structural types cover the handful of methods this controller actually calls.
interface CookieRequest {
  headers: { cookie?: string };
}
interface CookieResponse {
  cookie(name: string, value: string, options: Record<string, unknown>): void;
  clearCookie(name: string, options?: Record<string, unknown>): void;
  redirect(url: string): void;
}
interface AvatarResponse {
  setHeader(name: string, value: string): void;
  send(body: Buffer): void;
}

/** A year. The URL carries the blob's own id, so it can never serve different bytes —
 *  the only reason not to cache it forever is that "forever" isn't a real value. */
const AVATAR_CACHE_TTL_SECONDS = 60 * 60 * 24 * 365;

const OAUTH_COOKIE = 'wp_oauth';
const REFRESH_COOKIE = 'wp_refresh';
const OAUTH_COOKIE_TTL_MS = 10 * 60 * 1000;
const REFRESH_COOKIE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const frontendUrl = () => process.env[FRONTEND_URL_ENV] ?? DEFAULT_FRONTEND_URL;

function baseCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
  };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly auth: AuthService) {}

  @Get('google')
  @Public()
  beginGoogleAuth(@Res() res: CookieResponse): void {
    const { url, state, codeVerifier } = this.auth.beginGoogleAuth();
    this.setOAuthCookie(res, state, codeVerifier);
    res.redirect(url);
  }

  @Get('google/callback')
  @Public()
  async googleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Req() req: CookieRequest,
    @Res() res: CookieResponse,
  ): Promise<void> {
    const cookies = parseCookieHeader(req.headers.cookie);
    const transaction = cookies[OAUTH_COOKIE]
      ? (JSON.parse(cookies[OAUTH_COOKIE]) as { state: string; codeVerifier: string })
      : undefined;
    if (error || !code || !state || !transaction || transaction.state !== state) {
      // User cancelled consent (error=access_denied) or the callback is otherwise
      // unusable (expired/replayed) — send them home instead of a raw 401 JSON body.
      res.clearCookie(OAUTH_COOKIE, { path: '/auth' });
      res.redirect(frontendUrl());
      return;
    }

    // **A callback can arrive twice for one code, and the second one is not an error.**
    // An installed PWA captures in-scope navigations on Android, so Google's redirect to
    // /auth/google/callback is handled by the browser AND handed to the app window. The
    // WebAPK shares the browser's cookie jar, so both pass the state check above and both
    // redeem the same code — which is single-use, so the loser of that race gets Google's
    // `invalid_grant`. It used to escape as a 500, and since the app window is what the
    // person is looking at, a login that had *succeeded* rendered as a crash.
    //
    // The winner has already set the refresh cookie on this host, in that same shared jar,
    // so the loser has nothing left to do: send it home, exactly like every other unusable
    // callback above, and it lands signed in. The reason is logged in full — a code Google
    // refuses for some other reason must still be diagnosable, and looks identical here.
    let result: Awaited<ReturnType<AuthService['handleGoogleCallback']>>;
    try {
      result = await this.auth.handleGoogleCallback(code, transaction.codeVerifier);
    } catch (err) {
      this.logger.warn(`Google callback could not be completed: ${(err as Error).message}`);
      res.clearCookie(OAUTH_COOKIE, { path: '/auth' });
      res.redirect(frontendUrl());
      return;
    }
    if (!result) {
      // Google didn't hand back a refresh token and we don't have one stored yet
      // (auth-and-google.md) — retry immediately, forcing the consent screen.
      const retry = this.auth.beginGoogleAuth(true);
      this.setOAuthCookie(res, retry.state, retry.codeVerifier);
      res.redirect(retry.url);
      return;
    }

    res.clearCookie(OAUTH_COOKIE, { path: '/auth' });
    res.cookie(REFRESH_COOKIE, result.refreshToken, {
      ...baseCookieOptions(),
      path: '/',
      maxAge: REFRESH_COOKIE_TTL_MS,
    });
    res.redirect(frontendUrl());
  }

  @Post('refresh')
  @Public()
  // Tight per-IP cap (B-10): a public, cheap-to-hit endpoint. Well above a real
  // client's rotation cadence (a 15-min access token), tight enough to blunt abuse.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(200)
  @ApiOkResponse({ type: AccessTokenDto })
  @ZodSerializerDto(AccessTokenDto)
  async refresh(
    @Req() req: CookieRequest,
    @Res({ passthrough: true }) res: CookieResponse,
  ): Promise<AccessTokenResponse> {
    const refreshToken = parseCookieHeader(req.headers.cookie)[REFRESH_COOKIE];
    if (!refreshToken) throw new UnauthorizedException('No session cookie');

    const result = await this.auth.refresh(refreshToken);
    res.cookie(REFRESH_COOKIE, result.refreshToken, {
      ...baseCookieOptions(),
      path: '/',
      maxAge: REFRESH_COOKIE_TTL_MS,
    });
    return { accessToken: result.accessToken };
  }

  @Post('logout')
  @Public()
  @HttpCode(204)
  async logout(
    @Req() req: CookieRequest,
    @Res({ passthrough: true }) res: CookieResponse,
  ): Promise<void> {
    const refreshToken = parseCookieHeader(req.headers.cookie)[REFRESH_COOKIE];
    if (refreshToken) await this.auth.logout(refreshToken);
    res.clearCookie(REFRESH_COOKIE, { path: '/' });
  }

  private setOAuthCookie(res: CookieResponse, state: string, codeVerifier: string): void {
    res.cookie(OAUTH_COOKIE, JSON.stringify({ state, codeVerifier }), {
      ...baseCookieOptions(),
      path: '/auth',
      maxAge: OAUTH_COOKIE_TTL_MS,
    });
  }
}

// `GET /me` (api-contract.md) — not under /auth; needs a real Bearer access
// token (no @Public here), unlike the four routes above.
@ApiTags('auth')
@ApiBearerAuth()
@Controller()
export class MeController {
  constructor(private readonly auth: AuthService) {}

  @Get('me')
  @ApiOkResponse({ type: MeDto })
  @ZodSerializerDto(MeDto)
  me(@CurrentUser() user: Principal): Promise<Me> {
    return this.auth.getMe(user.userId);
  }

  /** Edit your own identity — display name, picture source, identity hue.
   *  Authorization is implicit and total: the patch only ever reaches the
   *  principal's own row, so there is nothing to gate (ADR-0133 §11). */
  @Patch('me')
  @ApiOkResponse({ type: MeDto })
  @ZodSerializerDto(MeDto)
  updateMe(
    @CurrentUser() user: Principal,
    @Body(new ZodValidationPipe(updateMeSchema)) body: UpdateMeDto,
  ): Promise<Me> {
    return this.auth.updateMe(user.userId, body as UpdateMeInput);
  }

  /** Upload (or replace) your avatar — ADR-0133 §12. Multipart, one `file` part, and
   *  the interceptor's `fileSize` limit is the real byte ceiling: it aborts the stream
   *  rather than letting the service buffer an oversized body first. */
  @Post('me/avatar')
  @ApiConsumes('multipart/form-data')
  @ApiOkResponse({ type: MeDto })
  @ZodSerializerDto(MeDto)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_AVATAR_SIZE_BYTES } }))
  setAvatar(
    @CurrentUser() user: Principal,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<Me> {
    if (!file) {
      throw new BadRequestException({
        error: { code: ERROR_CODE.VALIDATION_ERROR, message: 'file is required' },
      });
    }
    return this.auth.setAvatar(user.userId, file.buffer);
  }

  @Delete('me/avatar')
  @ApiOkResponse({ type: MeDto })
  @ZodSerializerDto(MeDto)
  removeAvatar(@CurrentUser() user: Principal): Promise<Me> {
    return this.auth.removeAvatar(user.userId);
  }
}

/** An uploaded avatar's bytes — the route `avatarContentPath` names (ADR-0133 §12).
 *
 *  **`@Public` on purpose, and this is the trust-class call Phase 4 owed.** An `<img>`
 *  cannot send a bearer token, so an authenticated route would force every avatar
 *  through a fetch-to-object-URL dance in a presentational primitive — for a
 *  decoration that is, by design, shown to co-members. The key is an opaque
 *  `randomUUID` handed out only in a `User` DTO, so the URL is an unguessable
 *  capability; that is *exactly* the trust class of the `googleAvatarUrl` this app
 *  already hotlinks, which Google itself serves unauthenticated to anyone holding it.
 *  Guarding ours harder than the Google photo it substitutes for would be theatre.
 *
 *  Documents are the opposite class and stay that way: trip-scoped, encrypted at rest,
 *  auth-guarded, and never inline. Nothing here is encrypted at rest — see the ADR for
 *  why encrypting a picture we publish to the group buys nothing and costs the hard
 *  caching an `<img>` wants. */
@ApiTags('auth')
@Controller()
export class AvatarController {
  constructor(private readonly auth: AuthService) {}

  @Get('users/:userId/avatar/:key')
  @Public()
  async getAvatar(
    @Param('userId') userId: string,
    @Param('key') key: string,
    @Res() res: AvatarResponse,
  ): Promise<void> {
    const buffer = await this.auth.getAvatarContent(userId, key);
    // A retired key, a user with no upload, or bytes that have gone missing: all the
    // same 404, and all of them must degrade to initials rather than a broken image.
    if (!buffer) throw new NotFoundException('Avatar not found');

    const mimeType = sniffImageMimeType(buffer);
    if (!mimeType) throw new NotFoundException('Avatar not found');

    // The type is re-derived from the bytes, never echoed from what was uploaded, and
    // `nosniff` pins the browser to it — together that is what makes serving this
    // INLINE safe where a document never is (backend-review B-03's reasoning, applied
    // to the opposite disposition). The CSP is belt-and-braces for a direct navigation
    // to this URL: nothing this response can reference is allowed to load.
    res.setHeader('Content-Type', mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Content-Disposition', 'inline');
    // Immutable is honest here, not optimistic: the key IS the blob's id, so these
    // bytes can never change at this URL — a replace mints a new key and a new URL.
    res.setHeader('Cache-Control', `public, max-age=${AVATAR_CACHE_TTL_SECONDS}, immutable`);
    res.send(buffer);
  }
}

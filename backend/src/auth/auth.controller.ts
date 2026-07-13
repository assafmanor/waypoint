import {
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  accessTokenResponseSchema,
  meSchema,
  type AccessTokenResponse,
  type Me,
} from '@waypoint/shared';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { FRONTEND_URL as FRONTEND_URL_ENV } from '../common/env';
import { AuthService } from './auth.service';
import { parseCookieHeader } from './cookies.util';
import { CurrentUser } from './current-user.decorator';
import type { Principal } from './principal';
import { Public } from './public.decorator';

class MeDto extends createZodDto(meSchema) {}
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

const OAUTH_COOKIE = 'wp_oauth';
const REFRESH_COOKIE = 'wp_refresh';
const OAUTH_COOKIE_TTL_MS = 10 * 60 * 1000;
const REFRESH_COOKIE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const frontendUrl = () => process.env[FRONTEND_URL_ENV] ?? 'http://localhost:5173';

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
    @Req() req: CookieRequest,
    @Res() res: CookieResponse,
  ): Promise<void> {
    const cookies = parseCookieHeader(req.headers.cookie);
    const transaction = cookies[OAUTH_COOKIE]
      ? (JSON.parse(cookies[OAUTH_COOKIE]) as { state: string; codeVerifier: string })
      : undefined;
    if (!code || !state || !transaction || transaction.state !== state) {
      throw new UnauthorizedException('Invalid OAuth callback (state mismatch)');
    }

    const result = await this.auth.handleGoogleCallback(code, transaction.codeVerifier);
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
@Controller()
export class MeController {
  constructor(private readonly auth: AuthService) {}

  @Get('me')
  @ApiOkResponse({ type: MeDto })
  @ZodSerializerDto(MeDto)
  me(@CurrentUser() user: Principal): Promise<Me> {
    return this.auth.getMe(user.userId);
  }
}

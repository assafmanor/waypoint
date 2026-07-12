import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { Me } from '@waypoint/shared';
import { decryptAtRest, encryptAtRest } from '../common/crypto.util';
import { PrismaService } from '../prisma/prisma.service';
import { toMembershipDto } from '../trips/trips.mapper';
import {
  buildGoogleAuthUrl,
  exchangeGoogleCode,
  fetchGoogleUserinfo,
  generateOAuthState,
  generatePkceVerifier,
  pkceChallengeFromVerifier,
  revokeGoogleToken,
} from './google-oauth.client';
import { generateRefreshToken, hashRefreshToken, signAccessToken } from './token.util';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TOKEN_ENCRYPTION_ENV = 'TOKEN_ENCRYPTION_KEY';

function tokenEncryptionKey(): string {
  const key = process.env.TOKEN_ENCRYPTION_ENV;
  if (!key) throw new Error(`${TOKEN_ENCRYPTION_ENV} not configured`);
  return key;
}

export interface OAuthTransaction {
  url: string;
  state: string;
  codeVerifier: string;
}

export interface CallbackResult {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  beginGoogleAuth(forceConsent = false): OAuthTransaction {
    const state = generateOAuthState();
    const codeVerifier = generatePkceVerifier();
    const url = buildGoogleAuthUrl({
      state,
      codeChallenge: pkceChallengeFromVerifier(codeVerifier),
      forceConsent,
    });
    return { url, state, codeVerifier };
  }

  /**
   * Exchanges the Google auth code, upserts User/AuthIdentity, and issues a
   * Waypoint session. Returns `null` when Google didn't hand back a refresh
   * token and we don't have one stored yet — the controller should restart
   * the flow with `forceConsent`.
   */
  async handleGoogleCallback(code: string, codeVerifier: string): Promise<CallbackResult | null> {
    const tokens = await exchangeGoogleCode(code, codeVerifier);
    const info = await fetchGoogleUserinfo(tokens.access_token);

    const existingIdentity = await this.prisma.authIdentity.findUnique({
      where: { provider_providerAccountId: { provider: 'google', providerAccountId: info.sub } },
    });
    if (!tokens.refresh_token && !existingIdentity?.refreshTokenEnc) return null;

    const scopes = tokens.scope.split(' ').filter(Boolean);
    const refreshTokenEnc = tokens.refresh_token
      ? encryptAtRest(tokens.refresh_token, tokenEncryptionKey(), TOKEN_ENCRYPTION_ENV)
      : null;

    const user = await this.prisma.user.upsert({
      where: { email: info.email },
      create: { email: info.email, displayName: info.name ?? info.email },
      update: {},
    });

    await this.prisma.authIdentity.upsert({
      where: { provider_providerAccountId: { provider: 'google', providerAccountId: info.sub } },
      create: {
        userId: user.id,
        provider: 'google',
        providerAccountId: info.sub,
        refreshTokenEnc,
        scopes,
      },
      update: { userId: user.id, scopes, ...(refreshTokenEnc && { refreshTokenEnc }) },
    });

    return this.issueSession(user.id, user.email);
  }

  async refresh(refreshTokenRaw: string): Promise<CallbackResult> {
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: hashRefreshToken(refreshTokenRaw) },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired session');
    }
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: session.userId } });

    // Rotate in place: replacing the hash invalidates the presented token immediately.
    const newRefreshToken = generateRefreshToken();
    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: hashRefreshToken(newRefreshToken),
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });

    return {
      accessToken: signAccessToken({ sub: user.id, email: user.email }),
      refreshToken: newRefreshToken,
    };
  }

  /** Idempotent: presenting an already-invalid/unknown token is not an error. */
  async logout(refreshTokenRaw: string): Promise<void> {
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: hashRefreshToken(refreshTokenRaw) },
    });
    if (!session) return;

    await this.prisma.session.delete({ where: { id: session.id } });

    const identity = await this.prisma.authIdentity.findFirst({
      where: { userId: session.userId, provider: 'google' },
    });
    if (identity?.refreshTokenEnc) {
      const rawGoogleToken = decryptAtRest(
        identity.refreshTokenEnc,
        tokenEncryptionKey(),
        TOKEN_ENCRYPTION_ENV,
      );
      await revokeGoogleToken(rawGoogleToken);
      await this.prisma.authIdentity.update({
        where: { id: identity.id },
        data: { refreshTokenEnc: null },
      });
    }
  }

  async getMe(userId: string): Promise<Me> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const memberships = await this.prisma.membership.findMany({ where: { userId } });
    return {
      user: { ...user, createdAt: user.createdAt.toISOString() },
      memberships: memberships.map(toMembershipDto),
    };
  }

  private async issueSession(userId: string, email: string): Promise<CallbackResult> {
    const refreshToken = generateRefreshToken();
    await this.prisma.session.create({
      data: {
        userId,
        refreshTokenHash: hashRefreshToken(refreshToken),
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });
    return { accessToken: signAccessToken({ sub: userId, email }), refreshToken };
  }
}

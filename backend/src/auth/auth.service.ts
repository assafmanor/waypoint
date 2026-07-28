import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { Me, UpdateMeInput } from '@waypoint/shared';
import { decryptAtRest, encryptAtRest } from '../common/crypto.util';
import { requireEnv, TOKEN_ENCRYPTION_KEY } from '../common/env';
import { PrismaService } from '../prisma/prisma.service';
import { toMembershipDto, toUserDto } from '../trips/trips.mapper';
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

    // Reject an unverified Google email (B-12): account-linking keys on `email`, so
    // an attacker who could sign in with an unverified address matching a real
    // user's email would otherwise link into their account. Standard hardening.
    if (!info.email_verified) {
      throw new UnauthorizedException('Google account email is not verified');
    }

    const existingIdentity = await this.prisma.authIdentity.findUnique({
      where: { provider_providerAccountId: { provider: 'google', providerAccountId: info.sub } },
    });
    if (!tokens.refresh_token && !existingIdentity?.refreshTokenEnc) return null;

    const scopes = tokens.scope.split(' ').filter(Boolean);
    const refreshTokenEnc = tokens.refresh_token
      ? encryptAtRest(tokens.refresh_token, requireEnv(TOKEN_ENCRYPTION_KEY), TOKEN_ENCRYPTION_KEY)
      : null;

    // Provision User + AuthIdentity atomically (B-12): the identity upsert failing
    // after the user upsert used to leave a user with no linked identity.
    const user = await this.prisma.$transaction(async (tx) => {
      // `googleAvatarUrl` is a fact from the provider, so it is refreshed on EVERY
      // sign-in, not just at create. `avatarChoice` is only defaulted at create —
      // a returning user who chose initials must not be flipped back to the photo
      // (ADR-0133 §4/§6).
      const user = await tx.user.upsert({
        where: { email: info.email },
        create: {
          email: info.email,
          displayName: info.name ?? info.email,
          googleAvatarUrl: info.picture ?? null,
          avatarChoice: info.picture ? 'google' : 'initials',
        },
        update: { googleAvatarUrl: info.picture ?? null },
      });
      await tx.authIdentity.upsert({
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
      return user;
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
        requireEnv(TOKEN_ENCRYPTION_KEY),
        TOKEN_ENCRYPTION_KEY,
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
      // Through `toUserDto`, not a local spread: it is what resolves the identity
      // hue, and a second user-shaping path here would silently skip that.
      user: toUserDto(user),
      memberships: memberships.map(toMembershipDto),
    };
  }

  /** The only write path onto your own `User` (ADR-0133 §11 Phase 1). A partial,
   *  LWW patch. `avatarHue: null` is meaningful — it clears the pick and hands the
   *  hue back to the derivation, the same way ADR-0107's zone chip clears an
   *  override. Deliberately NOT routed through `ChangeService`: a `Change` is
   *  per-trip while a user spans many, so broadcasting a rename would fan out one
   *  change per trip they belong to — refused for v1 and stated in ADR-0133 §8, so
   *  co-members see a new name at their next snapshot.
   */
  async updateMe(userId: string, patch: UpdateMeInput): Promise<Me> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(patch.displayName !== undefined && { displayName: patch.displayName }),
        ...(patch.avatarChoice !== undefined && { avatarChoice: patch.avatarChoice }),
        ...(patch.avatarHue !== undefined && { avatarHue: patch.avatarHue }),
      },
    });
    return this.getMe(userId);
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

import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { decryptAtRest } from '../common/crypto.util';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import * as googleClient from './google-oauth.client';
import { verifyAccessToken } from './token.util';

vi.mock('./google-oauth.client', async () => {
  const actual = await vi.importActual<typeof googleClient>('./google-oauth.client');
  return {
    ...actual,
    exchangeGoogleCode: vi.fn(),
    fetchGoogleUserinfo: vi.fn(),
    revokeGoogleToken: vi.fn(),
  };
});

const GOOGLE_TOKENS = {
  access_token: 'g-access-token',
  refresh_token: 'g-refresh-token',
  id_token: 'g-id-token',
  expires_in: 3600,
  scope: 'openid email profile',
};

function fakeUserinfo(sub: string, email: string) {
  return { sub, email, email_verified: true, name: 'Test User' };
}

describe('AuthService', () => {
  const prisma = new PrismaService();
  const service = new AuthService(prisma);
  const createdUserIds: string[] = [];

  beforeEach(() => {
    vi.mocked(googleClient.exchangeGoogleCode).mockResolvedValue(GOOGLE_TOKENS);
    vi.mocked(googleClient.revokeGoogleToken).mockResolvedValue(undefined);
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds.splice(0) } } });
  });

  it('upserts User + AuthIdentity and issues a session on first sign-in', async () => {
    const sub = `sub-${randomUUID()}`;
    const email = `${randomUUID()}@example.com`;
    vi.mocked(googleClient.fetchGoogleUserinfo).mockResolvedValue(fakeUserinfo(sub, email));

    const result = await service.handleGoogleCallback('code', 'verifier');
    expect(result).not.toBeNull();

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    createdUserIds.push(user.id);

    const identity = await prisma.authIdentity.findUniqueOrThrow({
      where: { provider_providerAccountId: { provider: 'google', providerAccountId: sub } },
    });
    expect(identity.scopes).toEqual(['openid', 'email', 'profile']);
    const tokenKey = process.env.TOKEN_ENCRYPTION_KEY!;
    expect(decryptAtRest(identity.refreshTokenEnc!, tokenKey, 'TOKEN_ENCRYPTION_KEY')).toBe(
      'g-refresh-token',
    );

    const payload = verifyAccessToken(result!.accessToken);
    expect(payload).toEqual({ sub: user.id, email });

    const sessions = await prisma.session.findMany({ where: { userId: user.id } });
    expect(sessions).toHaveLength(1);
  });

  it('returns null (needs consent retry) when Google omits a refresh token and none is stored', async () => {
    const sub = `sub-${randomUUID()}`;
    const email = `${randomUUID()}@example.com`;
    vi.mocked(googleClient.fetchGoogleUserinfo).mockResolvedValue(fakeUserinfo(sub, email));
    vi.mocked(googleClient.exchangeGoogleCode).mockResolvedValue({
      ...GOOGLE_TOKENS,
      refresh_token: undefined,
    });

    const result = await service.handleGoogleCallback('code', 'verifier');
    expect(result).toBeNull();

    const user = await prisma.user.findUnique({ where: { email } });
    if (user) createdUserIds.push(user.id);
  });

  it('rotates the refresh token on use and invalidates the old one', async () => {
    const sub = `sub-${randomUUID()}`;
    const email = `${randomUUID()}@example.com`;
    vi.mocked(googleClient.fetchGoogleUserinfo).mockResolvedValue(fakeUserinfo(sub, email));
    const first = await service.handleGoogleCallback('code', 'verifier');
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    createdUserIds.push(user.id);

    const rotated = await service.refresh(first!.refreshToken);
    expect(rotated.refreshToken).not.toEqual(first!.refreshToken);
    expect(verifyAccessToken(rotated.accessToken)?.sub).toBe(user.id);

    await expect(service.refresh(first!.refreshToken)).rejects.toThrow(UnauthorizedException);
  });

  it('logout deletes the session and clears + revokes the Google refresh token', async () => {
    const sub = `sub-${randomUUID()}`;
    const email = `${randomUUID()}@example.com`;
    vi.mocked(googleClient.fetchGoogleUserinfo).mockResolvedValue(fakeUserinfo(sub, email));
    const result = await service.handleGoogleCallback('code', 'verifier');
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    createdUserIds.push(user.id);

    await service.logout(result!.refreshToken);

    expect(googleClient.revokeGoogleToken).toHaveBeenCalledWith('g-refresh-token');
    const sessions = await prisma.session.findMany({ where: { userId: user.id } });
    expect(sessions).toHaveLength(0);
    const identity = await prisma.authIdentity.findUniqueOrThrow({
      where: { provider_providerAccountId: { provider: 'google', providerAccountId: sub } },
    });
    expect(identity.refreshTokenEnc).toBeNull();
  });

  it('logout is idempotent for an unknown/already-invalidated refresh token', async () => {
    await expect(service.logout('not-a-real-token')).resolves.toBeUndefined();
  });

  it('getMe returns the user and their memberships', async () => {
    const sub = `sub-${randomUUID()}`;
    const email = `${randomUUID()}@example.com`;
    vi.mocked(googleClient.fetchGoogleUserinfo).mockResolvedValue(fakeUserinfo(sub, email));
    await service.handleGoogleCallback('code', 'verifier');
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    createdUserIds.push(user.id);

    const me = await service.getMe(user.id);
    expect(me.user.id).toBe(user.id);
    expect(me.memberships).toEqual([]);
  });
});

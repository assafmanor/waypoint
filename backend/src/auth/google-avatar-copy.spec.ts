import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DOC_LOCAL_STORAGE_DIR } from '../common/env';
import { getObject } from '../common/storage';
import { EnrichmentImagePipeline } from '../enrichment/image-pipeline';
import {
  DisallowedHostError,
  EnrichmentFetcher,
  isAllowedEnrichmentUrl,
} from '../enrichment/outbound-fetch';
import { PrismaService } from '../prisma/prisma.service';
import { toUserDto } from '../trips/trips.mapper';
import { AuthService } from './auth.service';
import * as googleClient from './google-oauth.client';

// **Our own copy of the Google photo** (ADR-0133 §13). The behaviour under test is a
// refresh POLICY and a failure posture, not a network call: the fetcher is stubbed, and what
// the specs assert is which sign-ins fetch, which blob the row points at afterwards, and that
// none of it can fail a login.
vi.mock('../map/planet', () => ({
  livePlanetBuild: () => '20260821',
  archiveVintage: () => 'v7',
}));

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

/** A real PNG signature plus filler — `sniffImageMimeType` reads the magic bytes, and the
 *  pipeline refuses anything it cannot name (which one spec below relies on). */
const png = (): Buffer =>
  Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);

describe('the Google photo is copied into our own storage (ADR-0133 §13)', () => {
  const prisma = new PrismaService();
  const fetch = vi.fn();
  const fetcher = { fetch } as unknown as EnrichmentFetcher;
  const service = new AuthService(prisma, new EnrichmentImagePipeline(fetcher));
  const userIds: string[] = [];
  let storageDir: string | undefined;

  const respond = (body = png()) =>
    fetch.mockResolvedValue({ url: 'x', status: 200, contentType: 'image/png', body });

  /** One sign-in, for the same person each time unless `email` says otherwise. */
  const signIn = async (email: string, picture: string | null) => {
    vi.mocked(googleClient.fetchGoogleUserinfo).mockResolvedValue({
      sub: `sub-${email}`,
      email,
      email_verified: true,
      name: 'Test User',
      ...(picture ? { picture } : {}),
    } as Awaited<ReturnType<typeof googleClient.fetchGoogleUserinfo>>);
    await service.handleGoogleCallback('code', 'verifier');
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    if (!userIds.includes(user.id)) userIds.push(user.id);
    return user;
  };

  beforeEach(() => {
    vi.mocked(googleClient.exchangeGoogleCode).mockResolvedValue(GOOGLE_TOKENS);
    fetch.mockReset();
    // Isolate the byte sink per run so a leftover blob cannot make a later assertion pass.
    storageDir = process.env[DOC_LOCAL_STORAGE_DIR];
    process.env[DOC_LOCAL_STORAGE_DIR] = `/tmp/wp-google-avatar-${randomUUID()}`;
  });

  afterEach(async () => {
    if (storageDir === undefined) delete process.env[DOC_LOCAL_STORAGE_DIR];
    else process.env[DOC_LOCAL_STORAGE_DIR] = storageDir;
    vi.clearAllMocks();
    await prisma.user.deleteMany({ where: { id: { in: userIds.splice(0) } } });
  });

  it('stores the bytes at first sign-in and serves them from our own path', async () => {
    respond();
    const user = await signIn(`${randomUUID()}@example.com`, 'https://lh3.googleusercontent.com/a');

    expect(user.googleAvatarKey).toBeTruthy();
    // The hotlink is KEPT beside the copy: it is still the answer to "does this person have a
    // Google photo", which is what "use my Google photo" comes back from.
    expect(user.googleAvatarUrl).toBe('https://lh3.googleusercontent.com/a');
    expect(toUserDto(user).googleAvatarCopyUrl).toBe(
      `/users/${user.id}/avatar/${user.googleAvatarKey}`,
    );
    // …and the route behind that path answers with the bytes, not a 404.
    expect(await service.getAvatarContent(user.id, user.googleAvatarKey!)).toEqual(png());
    // An unprefixed key, because `/users/:userId/avatar/:key` already says whose blob it is.
    expect(await getObject(user.googleAvatarKey!)).toEqual(png());
  });

  it('does not refetch on a sign-in that brings the same photo back', async () => {
    respond();
    const email = `${randomUUID()}@example.com`;
    const first = await signIn(email, 'https://lh3.googleusercontent.com/a');
    const second = await signIn(email, 'https://lh3.googleusercontent.com/a');

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(second.googleAvatarKey).toBe(first.googleAvatarKey);
  });

  // The refresh policy: Google mints a new `picture` when the person changes their photo, so
  // the URL changing IS the signal, and it needs no TTL and no extra request to read.
  it('refetches when the photo changes, and retires the bytes it replaces', async () => {
    respond();
    const email = `${randomUUID()}@example.com`;
    const first = await signIn(email, 'https://lh3.googleusercontent.com/a');
    const second = await signIn(email, 'https://lh3.googleusercontent.com/b');

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(second.googleAvatarKey).not.toBe(first.googleAvatarKey);
    // The old key is gone from storage AND stops resolving — a replaced face must not keep
    // being served at the URL somebody still holds.
    await expect(getObject(first.googleAvatarKey!)).rejects.toBeTruthy();
    expect(await service.getAvatarContent(second.id, first.googleAvatarKey!)).toBeNull();
  });

  // Removing it at Google removes it here. Anything else turns our copy into a face the
  // person cannot delete.
  it('retires the copy when the photo is gone at Google', async () => {
    respond();
    const email = `${randomUUID()}@example.com`;
    const first = await signIn(email, 'https://lh3.googleusercontent.com/a');
    const after = await signIn(email, null);

    expect(after.googleAvatarKey).toBeNull();
    expect(after.googleAvatarUrl).toBeNull();
    await expect(getObject(first.googleAvatarKey!)).rejects.toBeTruthy();
  });

  // **Never fatal.** An avatar is a decoration; failing a login over one would be the worse
  // bug by far. Both refusals the pipeline can produce are covered: a dead fetch, and bytes
  // that are not an image.
  it.each([
    ['a fetch that fails', () => fetch.mockRejectedValue(new Error('upstream down'))],
    ['a refused host', () => fetch.mockRejectedValue(new DisallowedHostError('https://evil/x'))],
    ['bytes that are not an image', () => respond(Buffer.from('<svg/>'))],
  ])('lets the sign-in through on %s, leaving the hotlink to render', async (_label, arrange) => {
    arrange();
    const user = await signIn(`${randomUUID()}@example.com`, 'https://lh3.googleusercontent.com/a');

    expect(user.googleAvatarKey).toBeNull();
    expect(user.googleAvatarUrl).toBe('https://lh3.googleusercontent.com/a');
    expect(user.avatarChoice).toBe('google');
  });

  // The allowlist is code (`outbound-fetch.ts`), and a suffix rule is the one shape that can
  // go wrong quietly — Google shards the photo host across `lh3`…`lh6`, and a substring match
  // would admit a lookalike domain.
  it('allows Google’s photo hosts by label boundary, and nothing that merely ends like one', () => {
    expect(isAllowedEnrichmentUrl('https://lh3.googleusercontent.com/a=s96-c')).toBe(true);
    expect(isAllowedEnrichmentUrl('https://lh6.googleusercontent.com/a')).toBe(true);
    expect(isAllowedEnrichmentUrl('https://evilgoogleusercontent.com/a')).toBe(false);
    expect(isAllowedEnrichmentUrl('https://googleusercontent.com.attacker.test/a')).toBe(false);
    expect(isAllowedEnrichmentUrl('http://lh3.googleusercontent.com/a')).toBe(false);
  });
});

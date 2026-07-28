import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { UnsupportedMediaTypeException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DOC_LOCAL_STORAGE_DIR } from '../common/env';
import { resetBlobCacheForTests } from '../common/blob-cache';
import { getObject } from '../common/storage';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

/** A minimal but genuinely-signatured JPEG body — the sniffer reads the first bytes,
 *  so this is what "a real image" means to the code under test. */
const jpeg = (marker = 0xe0): Buffer =>
  Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, marker]), Buffer.alloc(64, 7)]);
const png = (): Buffer =>
  Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);

describe('AuthService — avatars (ADR-0133 §12)', () => {
  const prisma = new PrismaService();
  const service = new AuthService(prisma);
  const userIds: string[] = [];
  let storageDir: string | undefined;

  const makeUser = async (googleAvatarUrl: string | null = null) => {
    const user = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.com`,
        displayName: 'אסף',
        googleAvatarUrl,
        avatarChoice: googleAvatarUrl ? 'google' : 'initials',
      },
    });
    userIds.push(user.id);
    return user;
  };

  beforeEach(() => {
    // Isolate the byte sink per run so a leftover blob can't make a later assertion pass.
    storageDir = process.env[DOC_LOCAL_STORAGE_DIR];
    process.env[DOC_LOCAL_STORAGE_DIR] = `/tmp/wp-avatar-spec-${randomUUID()}`;
  });

  afterEach(async () => {
    if (storageDir === undefined) delete process.env[DOC_LOCAL_STORAGE_DIR];
    else process.env[DOC_LOCAL_STORAGE_DIR] = storageDir;
    await prisma.user.deleteMany({ where: { id: { in: userIds.splice(0) } } });
  });

  it('stores the bytes, switches the choice to `upload`, and exposes a URL', async () => {
    const user = await makeUser();
    const me = await service.setAvatar(user.id, jpeg());

    expect(me.user.avatarChoice).toBe('upload');
    expect(me.user.uploadedAvatarUrl).toMatch(new RegExp(`^/users/${user.id}/avatar/`));

    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await getObject(row.uploadedAvatarKey!)).toEqual(jpeg());
  });

  it('accepts a PNG too', async () => {
    const user = await makeUser();
    await expect(service.setAvatar(user.id, png())).resolves.toBeTruthy();
  });

  it('REJECTS bytes that are not an image, and stores nothing', async () => {
    const user = await makeUser();
    const notAnImage = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
    await expect(service.setAvatar(user.id, notAnImage)).rejects.toBeInstanceOf(
      UnsupportedMediaTypeException,
    );
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.uploadedAvatarKey).toBeNull();
  });

  it('mints a NEW key on replace and retires the old blob', async () => {
    // The key is what makes the content URL immutable, so a replace must not reuse it —
    // otherwise a year-long `immutable` cache header would serve the old face forever.
    const user = await makeUser();
    await service.setAvatar(user.id, jpeg(0xe0));
    const first = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } }))
      .uploadedAvatarKey!;

    await service.setAvatar(user.id, jpeg(0xe1));
    const second = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } }))
      .uploadedAvatarKey!;

    expect(second).not.toBe(first);
    expect(await service.getAvatarContent(user.id, second)).toEqual(jpeg(0xe1));
    await expect(getObject(first)).rejects.toBeTruthy();
  });

  it('serves the bytes for the current key', async () => {
    const user = await makeUser();
    const me = await service.setAvatar(user.id, jpeg());
    const key = me.user.uploadedAvatarUrl!.split('/').pop()!;
    expect(await service.getAvatarContent(user.id, key)).toEqual(jpeg());
  });

  it('serves NOTHING for a key that is not this user’s current one', async () => {
    // A retired key going dead is what makes "remove the photo" actually stop serving
    // the photo — the reason the key is matched rather than merely looked up.
    const user = await makeUser();
    await service.setAvatar(user.id, jpeg());
    expect(await service.getAvatarContent(user.id, randomUUID())).toBeNull();
  });

  it('serves nothing for a user with no upload, and nothing for an unknown user', async () => {
    const user = await makeUser();
    expect(await service.getAvatarContent(user.id, randomUUID())).toBeNull();
    expect(await service.getAvatarContent(randomUUID(), randomUUID())).toBeNull();
  });

  it('serves nothing — rather than throwing — when the row points at missing bytes', async () => {
    const user = await makeUser();
    await service.setAvatar(user.id, jpeg());
    const key = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } }))
      .uploadedAvatarKey!;
    // "The bytes are gone" means gone from every tier: `putObject` warms the blob cache
    // (ADR-0055), so clearing it is part of modelling a FRESH PROCESS after a redeploy
    // rather than this one. Without the reset the cache correctly still serves the
    // blob — which is worth knowing, and is why this assertion needs the reset to mean
    // what it claims.
    resetBlobCacheForTests();
    process.env[DOC_LOCAL_STORAGE_DIR] = `/tmp/wp-avatar-spec-empty-${randomUUID()}`;
    expect(await service.getAvatarContent(user.id, key)).toBeNull();
  });

  it('removing an upload deletes the bytes and falls back to the GOOGLE photo', async () => {
    const user = await makeUser('https://lh3.example/p.jpg');
    await service.setAvatar(user.id, jpeg());
    const key = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } }))
      .uploadedAvatarKey!;

    const me = await service.removeAvatar(user.id);
    expect(me.user.avatarChoice).toBe('google');
    expect(me.user.uploadedAvatarUrl).toBeNull();
    // Kept, not cleared — the Google photo stays a real way back (§6).
    expect(me.user.googleAvatarUrl).toBe('https://lh3.example/p.jpg');
    await expect(getObject(key)).rejects.toBeTruthy();
  });

  it('removing an upload falls back to INITIALS when there is no Google photo', async () => {
    const user = await makeUser(null);
    await service.setAvatar(user.id, jpeg());
    const me = await service.removeAvatar(user.id);
    expect(me.user.avatarChoice).toBe('initials');
    expect(me.user.uploadedAvatarUrl).toBeNull();
  });

  it('removing when there is no upload is a no-op that still lands somewhere sane', async () => {
    const user = await makeUser(null);
    const me = await service.removeAvatar(user.id);
    expect(me.user.avatarChoice).toBe('initials');
  });

  it('leaves no URL on the wire once the upload is gone, even mid-session', async () => {
    const user = await makeUser();
    await service.setAvatar(user.id, jpeg());
    await service.removeAvatar(user.id);
    const me = await service.getMe(user.id);
    expect(me.user.uploadedAvatarUrl).toBeNull();
  });
});

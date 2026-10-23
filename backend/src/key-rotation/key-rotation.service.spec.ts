import 'reflect-metadata';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetBlobCacheForTests } from '../common/blob-cache';
import { type AtRestKeys, decryptAtRest, encryptAtRest } from '../common/crypto.util';
import { DOC_LOCAL_STORAGE_DIR } from '../common/env';
import { getObject, putObject } from '../common/storage';
import type { PrismaService } from '../prisma/prisma.service';
import { KeyRotationService } from './key-rotation.service';

const OLD = Buffer.alloc(32, 1).toString('base64');
const NEW = Buffer.alloc(32, 2).toString('base64');
const OTHER = Buffer.alloc(32, 3).toString('base64');
const KEYS: AtRestKeys = { name: 'K_NEXT', current: NEW, previous: OLD };

function fakePrisma(tokens: { id: string; refreshTokenEnc: string }[], fileRefs: string[]) {
  const update = vi.fn(async () => undefined);
  const prisma = {
    authIdentity: { findMany: vi.fn(async () => tokens), update },
    document: { findMany: vi.fn(async () => fileRefs.map((fileRef) => ({ fileRef }))) },
  } as unknown as PrismaService;
  return { prisma, update };
}

describe('KeyRotationService', () => {
  let dir: string;

  beforeEach(async () => {
    resetBlobCacheForTests();
    dir = await mkdtemp(join(tmpdir(), 'key-rotation-'));
    vi.stubEnv(DOC_LOCAL_STORAGE_DIR, dir);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(dir, { recursive: true, force: true });
  });

  it('re-encrypts only the Google tokens still on the previous key', async () => {
    const { prisma, update } = fakePrisma(
      [
        { id: 'stale', refreshTokenEnc: encryptAtRest('g-old', OLD, 'K') },
        { id: 'current', refreshTokenEnc: encryptAtRest('g-new', NEW, 'K') },
        { id: 'foreign', refreshTokenEnc: encryptAtRest('g-x', OTHER, 'K') },
      ],
      [],
    );

    const tally = await new KeyRotationService(prisma).reencryptGoogleTokens(KEYS);

    expect(tally).toEqual({ reencrypted: 1, alreadyCurrent: 1, unreadable: 1 });
    expect(update).toHaveBeenCalledTimes(1);
    const [{ where, data }] = update.mock.calls[0] as unknown as [
      { where: { id: string }; data: { refreshTokenEnc: string } },
    ];
    expect(where.id).toBe('stale');
    expect(decryptAtRest(data.refreshTokenEnc, NEW, 'K')).toBe('g-old');
  });

  it('rewrites a stale document blob in place, readable with the new key alone', async () => {
    const file = Buffer.from('passport scan').toString('base64');
    await putObject('doc-1', Buffer.from(encryptAtRest(file, OLD, 'K'), 'base64'));
    const { prisma } = fakePrisma([], ['doc-1', 'missing-blob']);

    const tally = await new KeyRotationService(prisma).reencryptDocuments(KEYS);

    expect(tally).toEqual({ reencrypted: 1, alreadyCurrent: 0, unreadable: 0 });
    resetBlobCacheForTests();
    const stored = await getObject('doc-1');
    expect(decryptAtRest(stored.toString('base64'), NEW, 'K')).toBe(file);
  });

  it('does nothing when no rotation is in flight', async () => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', NEW);
    vi.stubEnv('DOC_ENCRYPTION_KEY', NEW);
    const { prisma } = fakePrisma([], []);

    await new KeyRotationService(prisma).run();

    expect(prisma.authIdentity.findMany).not.toHaveBeenCalled();
    expect(prisma.document.findMany).not.toHaveBeenCalled();
  });
});

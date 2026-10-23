// **Moving at-rest data onto a new key** (the `_NEXT` rotation in `common/crypto.util.ts`).
//
// Runs once per boot, and only while a `_NEXT` var holds a key different from its plain one.
// Reads already work on either key meanwhile, so it runs off the boot path and a large bucket
// never holds up `listen()`. Its log line is the signal a rotation is safe to finish: copy the
// `_NEXT` value into the plain var. It never deletes anything — a payload neither key opens is
// counted and left alone, because the likeliest cause is a mistyped key, not a worthless row.
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import {
  type AtRestKeys,
  decryptAtRestReportingKey,
  documentKeys,
  encryptAtRest,
  googleTokenKeys,
} from '../common/crypto.util';
import { getObject, putObject } from '../common/storage';
import { PrismaService } from '../prisma/prisma.service';

export interface RotationTally {
  reencrypted: number;
  alreadyCurrent: number;
  unreadable: number;
}

function emptyTally(): RotationTally {
  return { reencrypted: 0, alreadyCurrent: 0, unreadable: 0 };
}

@Injectable()
export class KeyRotationService implements OnApplicationBootstrap {
  private readonly log = new Logger(KeyRotationService.name);

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap(): void {
    void this.run();
  }

  async run(): Promise<void> {
    await this.rotate(googleTokenKeys, (keys) => this.reencryptGoogleTokens(keys));
    await this.rotate(documentKeys, (keys) => this.reencryptDocuments(keys));
  }

  private async rotate(
    resolveKeys: () => AtRestKeys,
    job: (keys: AtRestKeys) => Promise<RotationTally>,
  ): Promise<void> {
    let keys: AtRestKeys;
    try {
      keys = resolveKeys();
    } catch {
      return; // the key itself is unset — a dev box; validate-config owns production
    }
    if (!keys.previous) return;
    try {
      const tally = await job(keys);
      const verdict =
        tally.unreadable === 0
          ? `done: safe to copy ${keys.name} into the plain var`
          : 'NOT done: some payloads open with neither key; check both values before finishing';
      this.log.log(
        `${keys.name} rotation ${verdict} (re-encrypted ${tally.reencrypted}, ` +
          `already current ${tally.alreadyCurrent}, unreadable ${tally.unreadable})`,
      );
    } catch (error) {
      this.log.error(`${keys.name} rotation failed; the next boot retries`, error as Error);
    }
  }

  async reencryptGoogleTokens(keys: AtRestKeys): Promise<RotationTally> {
    const tally = emptyTally();
    const rows = await this.prisma.authIdentity.findMany({
      where: { refreshTokenEnc: { not: null } },
      select: { id: true, refreshTokenEnc: true },
    });
    for (const row of rows) {
      const opened = this.open(row.refreshTokenEnc!, keys);
      if (!opened) tally.unreadable++;
      else if (!opened.stale) tally.alreadyCurrent++;
      else {
        await this.prisma.authIdentity.update({
          where: { id: row.id },
          data: { refreshTokenEnc: encryptAtRest(opened.plaintext, keys.current, keys.name) },
        });
        tally.reencrypted++;
      }
    }
    return tally;
  }

  async reencryptDocuments(keys: AtRestKeys): Promise<RotationTally> {
    const tally = emptyTally();
    const rows = await this.prisma.document.findMany({ select: { fileRef: true } });
    for (const { fileRef } of rows) {
      let stored: Buffer;
      try {
        stored = await getObject(fileRef);
      } catch {
        continue; // a blob already missing is getContent's 404, not a rotation problem
      }
      const opened = this.open(stored.toString('base64'), keys);
      if (!opened) tally.unreadable++;
      else if (!opened.stale) tally.alreadyCurrent++;
      else {
        // Same key, new bytes. `putObject` writes through both cache tiers, so no tier keeps
        // serving the old ciphertext under this fileRef.
        const encrypted = encryptAtRest(opened.plaintext, keys.current, keys.name);
        await putObject(fileRef, Buffer.from(encrypted, 'base64'));
        tally.reencrypted++;
      }
    }
    return tally;
  }

  private open(payload: string, keys: AtRestKeys): { plaintext: string; stale: boolean } | null {
    try {
      return decryptAtRestReportingKey(payload, keys.current, keys.name, keys.previous);
    } catch {
      return null;
    }
  }
}

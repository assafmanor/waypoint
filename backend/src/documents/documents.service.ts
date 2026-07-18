import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException, UnsupportedMediaTypeException } from '@nestjs/common';
import { Prisma, type Document as PrismaDocument } from '@prisma/client';
import {
  isAllowedDocumentMimeType,
  type CreateDocumentInput,
  type DocumentSummary,
  type TripDocument,
  type UpdateDocumentInput,
} from '@waypoint/shared';
import { decryptAtRest, encryptAtRest } from '../common/crypto.util';
import { DOC_ENCRYPTION_KEY, requireEnv } from '../common/env';
import { PrismaService } from '../prisma/prisma.service';
import { ChangeService } from '../sync/change.service';
import { deleteObject, getObject, putObject } from './storage';

const toDocumentSummaryDto = (d: PrismaDocument): DocumentSummary => ({
  id: d.id,
  tripId: d.tripId,
  type: d.type,
  title: d.title,
  mimeType: d.mimeType,
  sizeBytes: d.sizeBytes,
  ownerUserId: d.ownerUserId ?? undefined,
  createdAt: d.createdAt.toISOString(),
  updatedAt: d.updatedAt.toISOString(),
  updatedBy: d.updatedBy,
});

const toDocumentDto = (d: PrismaDocument): TripDocument => ({
  ...toDocumentSummaryDto(d),
  fileRef: d.fileRef,
});

export interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

/** Reject any upload outside the document allow-list before it is encrypted or
 *  stored (backend-review B-03), so an executable "document" (HTML/SVG/XHTML)
 *  never reaches storage and no orphan blob is written for a rejected type. */
function assertAllowedMime(mimeType: string): void {
  if (!isAllowedDocumentMimeType(mimeType)) {
    throw new UnsupportedMediaTypeException({
      error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: `Unsupported file type: ${mimeType}` },
    });
  }
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly changes: ChangeService,
  ) {}

  async list(tripId: string): Promise<DocumentSummary[]> {
    const documents = await this.prisma.document.findMany({
      where: { tripId },
      orderBy: { createdAt: 'asc' },
    });
    return documents.map(toDocumentSummaryDto);
  }

  async create(
    tripId: string,
    actorUserId: string,
    input: CreateDocumentInput,
    file: UploadedFile,
  ): Promise<TripDocument> {
    assertAllowedMime(file.mimetype);
    const id = input.id ?? randomUUID();

    // Idempotent re-POST (ADR-0018/0056): an offline-outbox flush can retry an
    // upload whose first attempt already landed. If this client id already exists,
    // return it as already-applied *before* encrypting + storing bytes — so a retry
    // never orphans a second blob that no row references.
    const existing = await this.prisma.document.findFirst({ where: { id, tripId } });
    if (existing) return toDocumentDto(existing);

    const fileRef = randomUUID();
    const encrypted = encryptAtRest(
      file.buffer.toString('base64'),
      requireEnv(DOC_ENCRYPTION_KEY),
      DOC_ENCRYPTION_KEY,
    );
    await putObject(fileRef, Buffer.from(encrypted, 'base64'));

    try {
      const { entity } = await this.changes.mutate({
        tripId,
        actorUserId,
        entityType: 'document',
        entityId: id,
        action: 'create',
        after: { ...input, mimeType: file.mimetype, sizeBytes: file.size },
        apply: (tx) =>
          tx.document.create({
            data: {
              id,
              tripId,
              type: input.type,
              title: input.title,
              fileRef,
              mimeType: file.mimetype,
              sizeBytes: file.size,
              ownerUserId: input.ownerUserId,
              updatedBy: actorUserId,
            },
          }),
      });
      return toDocumentDto(entity);
    } catch (err) {
      // Lost a concurrent race on the same client id (the pre-check missed a
      // near-simultaneous first POST): the row exists now, so the blob we just
      // stored is an orphan. Drop it and return the winning row (ADR-0056).
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        await deleteObject(fileRef).catch(() => undefined);
        return toDocumentDto(await this.requireDocument(tripId, id));
      }
      throw err;
    }
  }

  /** Rename / change type, and optionally replace the file (ADR-0052). A new file
   *  is encrypted to a fresh blob and swapped in; the old blob is deleted only
   *  after the row commits, so a mid-flight failure orphans a blob rather than
   *  losing the document (same posture as create). */
  async update(
    tripId: string,
    actorUserId: string,
    documentId: string,
    input: UpdateDocumentInput,
    file: UploadedFile | undefined,
  ): Promise<TripDocument> {
    const existing = await this.requireDocument(tripId, documentId);

    let fileFields: { fileRef: string; mimeType: string; sizeBytes: number } | undefined;
    if (file) {
      assertAllowedMime(file.mimetype);
      const fileRef = randomUUID();
      const encrypted = encryptAtRest(
        file.buffer.toString('base64'),
        requireEnv(DOC_ENCRYPTION_KEY),
        DOC_ENCRYPTION_KEY,
      );
      await putObject(fileRef, Buffer.from(encrypted, 'base64'));
      fileFields = { fileRef, mimeType: file.mimetype, sizeBytes: file.size };
    }

    const { entity } = await this.changes.mutate({
      tripId,
      actorUserId,
      entityType: 'document',
      entityId: documentId,
      action: 'update',
      before: toDocumentSummaryDto(existing),
      after: {
        ...input,
        ...(fileFields ? { mimeType: fileFields.mimeType, sizeBytes: fileFields.sizeBytes } : {}),
      },
      apply: (tx) =>
        tx.document.update({
          where: { id: documentId },
          data: {
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(input.type !== undefined ? { type: input.type } : {}),
            ...(fileFields ?? {}),
            updatedBy: actorUserId,
          },
        }),
    });

    if (fileFields) await deleteObject(existing.fileRef).catch(() => undefined);
    return toDocumentDto(entity);
  }

  /** Delete the row and its encrypted blob (ADR-0015/0034 — no orphaned ciphertext). */
  async remove(tripId: string, actorUserId: string, documentId: string): Promise<void> {
    const existing = await this.requireDocument(tripId, documentId);
    await this.changes.mutate({
      tripId,
      actorUserId,
      entityType: 'document',
      entityId: documentId,
      action: 'delete',
      before: toDocumentSummaryDto(existing),
      apply: (tx) => tx.document.delete({ where: { id: documentId } }),
    });
    await deleteObject(existing.fileRef).catch(() => undefined);
  }

  async getContent(
    tripId: string,
    documentId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; title: string }> {
    const document = await this.requireDocument(tripId, documentId);
    // The row exists but its blob may not (storage misconfigured, or a blob lost to
    // an ephemeral filesystem on redeploy — the failure mode ADR-0031's S3 choice
    // guards against). Surface a clean 404 rather than leaking a raw ENOENT 500.
    let stored: Buffer;
    try {
      stored = await getObject(document.fileRef);
    } catch {
      throw new NotFoundException('Document content unavailable');
    }
    const decrypted = decryptAtRest(
      stored.toString('base64'),
      requireEnv(DOC_ENCRYPTION_KEY),
      DOC_ENCRYPTION_KEY,
    );
    return {
      buffer: Buffer.from(decrypted, 'base64'),
      mimeType: document.mimeType,
      title: document.title,
    };
  }

  private async requireDocument(tripId: string, documentId: string): Promise<PrismaDocument> {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, tripId },
    });
    if (!document) throw new NotFoundException('Document not found');
    return document;
  }
}

import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { Document as PrismaDocument } from '@prisma/client';
import type { CreateDocumentInput, DocumentSummary, TripDocument } from '@waypoint/shared';
import { decryptAtRest, encryptAtRest } from '../common/crypto.util';
import { DOC_ENCRYPTION_KEY, requireEnv } from '../common/env';
import { PrismaService } from '../prisma/prisma.service';
import { ChangeService } from '../sync/change.service';
import { getObject, putObject } from './storage';

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
    const id = input.id ?? randomUUID();
    const fileRef = randomUUID();
    const encrypted = encryptAtRest(
      file.buffer.toString('base64'),
      requireEnv(DOC_ENCRYPTION_KEY),
      DOC_ENCRYPTION_KEY,
    );
    await putObject(fileRef, Buffer.from(encrypted, 'base64'));

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
  }

  async getContent(
    tripId: string,
    documentId: string,
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    const document = await this.requireDocument(tripId, documentId);
    const stored = await getObject(document.fileRef);
    const decrypted = decryptAtRest(
      stored.toString('base64'),
      requireEnv(DOC_ENCRYPTION_KEY),
      DOC_ENCRYPTION_KEY,
    );
    return { buffer: Buffer.from(decrypted, 'base64'), mimeType: document.mimeType };
  }

  private async requireDocument(tripId: string, documentId: string): Promise<PrismaDocument> {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, tripId },
    });
    if (!document) throw new NotFoundException('Document not found');
    return document;
  }
}

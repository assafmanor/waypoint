import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type DocumentAttachment as PrismaDocumentAttachment } from '@prisma/client';
import {
  ENTITY_TYPE,
  type CreateDocumentAttachmentInput,
  type DocumentAttachment,
} from '@waypoint/shared';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { assertEntityRefsInTrip } from '../common/trip-scope.util';
import { ChangeService } from '../sync/change.service';
import { toDocumentAttachmentDto } from '../trips/trips.mapper';

/** **Document attachments** (ADR-0173): the link between a document the trip already holds
 *  and the booking or event it belongs to. Two verbs only — a link has no content, so it is
 *  created and it is removed, and there is no `update` to write.
 *
 *  Every mutation goes through `ChangeService.mutate` (ADR-0019), so a peer hears about a
 *  link the same way it hears about everything else.
 *
 *  **What this service deliberately does NOT do: clean up after a deleted host.** The host
 *  FKs are `onDelete: Cascade` on the link row, so Postgres already removes them; the
 *  clients are told by `dropAttachmentsForHostChange` in the ADR-0094 appliers instead —
 *  the cascade is the storage guarantee, the applier rule is the sync one (§7). The same
 *  goes for a deleted DOCUMENT, whose own change carries the news.
 *
 *  **And it never widens visibility** (§6). A `Document` may be owned, and attaching it must
 *  not turn a private document into a group one — so this writes a pointer and nothing else,
 *  and the reader resolves an attachment through the document list it already has. An
 *  attachment whose document a reader cannot see resolves to nothing. */
@Injectable()
export class DocumentAttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly changes: ChangeService,
  ) {}

  async create(
    tripId: string,
    actorUserId: string,
    input: CreateDocumentAttachmentInput,
  ): Promise<DocumentAttachment> {
    // Both ends are client-supplied ids, so both are scoped before either is written — a
    // foreign one would be a link across trips (B-06's class of bug).
    await assertEntityRefsInTrip(this.prisma, tripId, input);
    const id = input.id ?? randomUUID();
    try {
      const { entity } = await this.changes.mutate({
        tripId,
        actorUserId,
        entityType: ENTITY_TYPE.DOCUMENT_ATTACHMENT,
        entityId: id,
        action: 'create',
        after: input,
        apply: (tx) =>
          tx.documentAttachment.create({
            data: {
              id,
              tripId,
              documentId: input.documentId,
              eventId: input.eventId,
              bookingId: input.bookingId,
              createdBy: actorUserId,
            },
          }),
      });
      return toDocumentAttachmentDto(entity);
    } catch (err) {
      // **Two distinct duplicates land here, and both mean "already attached".** The
      // client-generated id makes an outbox retry idempotent (as everywhere else), and the
      // `(documentId, host)` uniques make a double-tap idempotent too — the second press
      // carries a fresh id but describes the same link. Either way the answer is the row
      // that already exists, not a 409 the user would have to understand.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return toDocumentAttachmentDto(await this.requireExisting(tripId, id, input));
      }
      throw err;
    }
  }

  /** Detach — which removes the LINK and never the file (§1). This is the one destructive
   *  path in the app whose confirm needs no consequence line, because there is no
   *  consequence beyond the link itself. */
  async remove(tripId: string, attachmentId: string, actorUserId: string): Promise<void> {
    const before = await this.requireAttachment(tripId, attachmentId);
    await this.changes.mutate({
      tripId,
      actorUserId,
      entityType: ENTITY_TYPE.DOCUMENT_ATTACHMENT,
      entityId: attachmentId,
      action: 'delete',
      before: toDocumentAttachmentDto(before),
      apply: (tx) => tx.documentAttachment.delete({ where: { id: attachmentId } }),
    });
  }

  /** The row a duplicate-key hit was describing: this id, or — when the collision was the
   *  `(documentId, host)` unique rather than the primary key — the link that already says
   *  the same thing. */
  private async requireExisting(
    tripId: string,
    id: string,
    input: CreateDocumentAttachmentInput,
  ): Promise<PrismaDocumentAttachment> {
    const existing = await this.prisma.documentAttachment.findFirst({
      where: {
        tripId,
        OR: [
          { id },
          {
            documentId: input.documentId,
            eventId: input.eventId ?? null,
            bookingId: input.bookingId ?? null,
          },
        ],
      },
    });
    if (!existing) throw new NotFoundException('Attachment not found');
    return existing;
  }

  private async requireAttachment(
    tripId: string,
    attachmentId: string,
  ): Promise<PrismaDocumentAttachment> {
    const attachment = await this.prisma.documentAttachment.findFirst({
      where: { id: attachmentId, tripId },
    });
    if (!attachment) throw new NotFoundException('Attachment not found');
    return attachment;
  }
}

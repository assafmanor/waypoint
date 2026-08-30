import { Injectable, NotFoundException } from '@nestjs/common';
import {
  NO_SENSITIVE_FIELDS,
  SHARE_DETAIL_LEVEL,
  type TripShareConfig,
  type UpsertTripShareInput,
} from '@waypoint/shared';
import { generatePublicCode } from '../common/public-code.util';
import { assertTripAdmin } from '../common/trip-scope.util';
import { DocumentsService } from '../documents/documents.service';
import { PrismaService } from '../prisma/prisma.service';
import { SharingProjectionService } from './sharing-projection.service';

const SHARE_CONFIG_SELECT = {
  code: true,
  detailLevel: true,
  includeBookingSecrets: true,
  includeNotesAndTasks: true,
  includeTravelerIdentity: true,
  updatedAt: true,
  documents: { select: { documentId: true } },
} as const;

type ShareConfigRow = {
  code: string;
  detailLevel: TripShareConfig['detailLevel'];
  includeBookingSecrets: boolean;
  includeNotesAndTasks: boolean;
  includeTravelerIdentity: boolean;
  updatedAt: Date;
  documents: { documentId: string }[];
};

const toConfig = (row: ShareConfigRow): TripShareConfig => ({
  code: row.code,
  // Root-relative, exactly as the invite API does it: the backend serves the app and the
  // API on one host and has no business hardcoding which name that host answers to
  // (ADR-0169), so the origin is the client's to supply.
  shareUrl: `/s/${row.code}`,
  detailLevel: row.detailLevel,
  sensitive: {
    bookingSecrets: row.includeBookingSecrets,
    notesAndTasks: row.includeNotesAndTasks,
    travelerIdentity: row.includeTravelerIdentity,
  },
  documentIds: row.documents.map((document) => document.documentId),
  updatedAt: row.updatedAt.toISOString(),
});

/**
 * **Who may do what to the one link**, and the asymmetry is deliberate (ADR-0213).
 *
 * Every current member may READ the configuration, share the link, and ask for the PDF:
 * sharing an itinerary is what the group does, and routing that through one person is how a
 * feature gets used once. Only an admin may CREATE, RECONFIGURE, ROTATE or REVOKE it,
 * because each of those changes what the world can see — and rotation in particular
 * silently breaks a URL other people already hold.
 */
@Injectable()
export class SharingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projection: SharingProjectionService,
    private readonly documents: DocumentsService,
  ) {}

  /** The trip's current share, or 404. A read never creates one: opening the sheet to look
   *  must not publish a trip. */
  async get(tripId: string): Promise<TripShareConfig> {
    const row = await this.prisma.tripShare.findFirst({
      where: { tripId, revokedAt: null },
      select: SHARE_CONFIG_SELECT,
    });
    if (!row) throw new NotFoundException('This trip is not shared');
    return toConfig(row);
  }

  /**
   * Create or reconfigure the one link, idempotently.
   *
   * The same input twice returns the same code — which is what lets the sheet's first Live
   * Link / PDF press perform this without a separate Save step, and what stops a
   * double-tap from minting a second URL. Only an explicit rotate changes the code.
   */
  async upsert(
    tripId: string,
    actorUserId: string,
    input: UpsertTripShareInput,
  ): Promise<TripShareConfig> {
    await assertTripAdmin(this.prisma, tripId, actorUserId);
    await this.assertDocumentsInTrip(tripId, input.documentIds);

    const sensitive =
      input.detailLevel === SHARE_DETAIL_LEVEL.EVERYTHING ? input.sensitive : NO_SENSITIVE_FIELDS;
    const documentIds =
      input.detailLevel === SHARE_DETAIL_LEVEL.EVERYTHING ? input.documentIds : [];
    const existing = await this.prisma.tripShare.findUnique({
      where: { tripId },
      select: { id: true, revokedAt: true },
    });
    // A revoked share is re-shared with a FRESH code. Reviving the old one would silently
    // reopen a URL somebody has already pasted somewhere, which is the opposite of what
    // "stop sharing" said.
    const code = !existing || existing.revokedAt ? generatePublicCode() : undefined;

    const row = await this.prisma.$transaction(async (tx) => {
      const share = await tx.tripShare.upsert({
        where: { tripId },
        create: {
          tripId,
          code: code ?? generatePublicCode(),
          createdBy: actorUserId,
          detailLevel: input.detailLevel,
          includeBookingSecrets: sensitive.bookingSecrets,
          includeNotesAndTasks: sensitive.notesAndTasks,
          includeTravelerIdentity: sensitive.travelerIdentity,
        },
        update: {
          ...(code ? { code, revokedAt: null } : {}),
          detailLevel: input.detailLevel,
          includeBookingSecrets: sensitive.bookingSecrets,
          includeNotesAndTasks: sensitive.notesAndTasks,
          includeTravelerIdentity: sensitive.travelerIdentity,
        },
        select: { id: true },
      });
      // Replace rather than merge: the switches the owner just saw ARE the selection, and a
      // file that left the list must stop being downloadable in the same write.
      await tx.tripShareDocument.deleteMany({ where: { shareId: share.id } });
      if (documentIds.length > 0) {
        await tx.tripShareDocument.createMany({
          data: documentIds.map((documentId) => ({ shareId: share.id, documentId })),
        });
      }
      return tx.tripShare.findUniqueOrThrow({
        where: { id: share.id },
        select: SHARE_CONFIG_SELECT,
      });
    });
    return toConfig(row);
  }

  /** New code, same policy. The old URL stops resolving immediately. */
  async rotate(tripId: string, actorUserId: string): Promise<TripShareConfig> {
    await assertTripAdmin(this.prisma, tripId, actorUserId);
    const existing = await this.prisma.tripShare.findFirst({
      where: { tripId, revokedAt: null },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('This trip is not shared');
    const row = await this.prisma.tripShare.update({
      where: { id: existing.id },
      data: { code: generatePublicCode() },
      select: SHARE_CONFIG_SELECT,
    });
    return toConfig(row);
  }

  /** Stop sharing. The row survives, so the owner's configuration is still there when they
   *  come back; only its code stops resolving. */
  async revoke(tripId: string, actorUserId: string): Promise<void> {
    await assertTripAdmin(this.prisma, tripId, actorUserId);
    await this.prisma.tripShare.updateMany({
      where: { tripId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * A selected file, fetched by an anonymous bearer.
   *
   * The single query is the authorization: a `TripShareDocument` row for THIS active share
   * and THIS document is the only thing that makes the file readable. `DocumentsService`'s
   * existing `getContent` then does the decryption, because a second copy of the at-rest
   * crypto path is not a thing this feature should own.
   */
  async publicDocument(
    code: string,
    documentId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; title: string }> {
    const selected = await this.prisma.tripShareDocument.findFirst({
      where: { documentId, share: { code, revokedAt: null } },
      select: { share: { select: { tripId: true } } },
    });
    if (!selected) throw new NotFoundException('Document unavailable');
    return this.documents.getContent(selected.share.tripId, documentId);
  }

  /** The public projection behind a code (see `SharingProjectionService` for the rules). */
  byCode(code: string) {
    return this.projection.byCode(code);
  }

  private async assertDocumentsInTrip(tripId: string, documentIds: string[]): Promise<void> {
    if (documentIds.length === 0) return;
    const found = await this.prisma.document.count({
      where: { tripId, id: { in: [...new Set(documentIds)] } },
    });
    // A foreign document id here would publish another trip's file under this trip's link —
    // the same class of cross-trip reference `trip-scope.util.ts` exists to refuse.
    if (found !== new Set(documentIds).size) {
      throw new NotFoundException('Unknown document for this trip');
    }
  }
}

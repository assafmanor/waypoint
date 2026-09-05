import { Injectable, NotFoundException } from '@nestjs/common';
import { type TripShareConfig, type UpsertTripShareInput } from '@waypoint/shared';
import { FRONTEND_URL } from '../common/env';
import { generatePublicCode } from '../common/public-code.util';
import { assertTripAdmin } from '../common/trip-scope.util';
import { DocumentsService } from '../documents/documents.service';
import { PrismaService } from '../prisma/prisma.service';
// Type-only, so nothing at runtime crosses back: `spa/` imports this module's Hebrew copy,
// and the shape a preview says is `spa/`'s to define.
import type { TripPreviewFacts } from '../spa/share-meta';
import { toDateOnly } from '../trips/trips.mapper';
import { PdfBrowserService } from './pdf-browser.service';
import { normalizeSharePolicy, sharePolicyHash } from './share-policy';
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
 * **Who may do what to a trip's links**, and the asymmetry is deliberate (ADR-0213).
 *
 * Every current member may READ the configuration, share a link, and ask for the PDF:
 * sharing an itinerary is what the group does, and routing that through one person is how a
 * feature gets used once. Only an admin may CREATE, ROTATE or REVOKE, because each of those
 * changes what the world can see — and rotation in particular silently breaks a URL other
 * people already hold.
 *
 * **A trip has one link per POLICY** (the tenth amendment). Summary and Full therefore have
 * at most one each — there is nothing in them to tune — while Everything has as many as the
 * owner has configured. Nothing here edits a live link's policy: changing a policy changes
 * its hash, which is by definition a different link.
 */
@Injectable()
export class SharingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projection: SharingProjectionService,
    private readonly documents: DocumentsService,
    private readonly pdfBrowser: PdfBrowserService,
  ) {}

  /**
   * The trip's live links, in the sheet's own order: by level, then oldest first.
   *
   * An empty array rather than a 404 — "this trip is not shared" is now the ordinary
   * zero-length case of a list, not an exceptional state, and a reader opening the sheet
   * must not have to distinguish them.
   */
  async list(tripId: string): Promise<TripShareConfig[]> {
    const rows = await this.prisma.tripShare.findMany({
      where: { tripId, revokedAt: null },
      orderBy: [{ detailLevel: 'asc' }, { createdAt: 'asc' }],
      select: SHARE_CONFIG_SELECT,
    });
    return rows.map(toConfig);
  }

  /**
   * Get-or-create the link for exactly this policy.
   *
   * The same input twice returns the same code — which is what lets the sheet's first Live
   * Link / PDF press perform this without a separate Save step, and what stops a double-tap
   * from minting a second URL. Only an explicit rotate changes a code.
   *
   * **A revoked policy is re-shared by reusing its row with a FRESH code.** The row is
   * reused because `@@unique([tripId, policyHash])` spans revoked rows too; the code is
   * fresh because reviving the old one would silently reopen a URL somebody has already
   * pasted somewhere, which is the opposite of what "stop sharing" said.
   */
  async upsert(
    tripId: string,
    actorUserId: string,
    input: UpsertTripShareInput,
  ): Promise<TripShareConfig> {
    await assertTripAdmin(this.prisma, tripId, actorUserId);
    await this.assertDocumentsInTrip(tripId, input.documentIds);

    const policy = normalizeSharePolicy(input);
    const policyHash = sharePolicyHash(input);

    const row = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.tripShare.findUnique({
        where: { tripId_policyHash: { tripId, policyHash } },
        select: { id: true, revokedAt: true },
      });

      if (existing && !existing.revokedAt) {
        return tx.tripShare.findUniqueOrThrow({
          where: { id: existing.id },
          select: SHARE_CONFIG_SELECT,
        });
      }

      const data = {
        detailLevel: policy.detailLevel,
        includeBookingSecrets: policy.sensitive.bookingSecrets,
        includeNotesAndTasks: policy.sensitive.notesAndTasks,
        includeTravelerIdentity: policy.sensitive.travelerIdentity,
        code: generatePublicCode(),
      };
      const share = existing
        ? await tx.tripShare.update({
            where: { id: existing.id },
            data: { ...data, revokedAt: null },
            select: { id: true },
          })
        : await tx.tripShare.create({
            data: { ...data, tripId, policyHash, createdBy: actorUserId },
            select: { id: true },
          });

      // Replace rather than merge: the files are part of the policy that keyed this row, so
      // a re-share of a revoked policy must land on exactly the selection it names.
      await tx.tripShareDocument.deleteMany({ where: { shareId: share.id } });
      if (policy.documentIds.length > 0) {
        await tx.tripShareDocument.createMany({
          data: policy.documentIds.map((documentId) => ({ shareId: share.id, documentId })),
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
  async rotate(tripId: string, code: string, actorUserId: string): Promise<TripShareConfig> {
    await assertTripAdmin(this.prisma, tripId, actorUserId);
    // Scoped by `tripId` as well as `code`, so an admin of one trip cannot rotate another
    // trip's link by pasting its code (`trip-scope.util.ts`'s rule, applied to a credential).
    const existing = await this.requireLink(tripId, code);
    const row = await this.prisma.tripShare.update({
      where: { id: existing.id },
      data: { code: generatePublicCode() },
      select: SHARE_CONFIG_SELECT,
    });
    return toConfig(row);
  }

  /** Stop one link. Its row survives, so the policy is still there to re-share. */
  async revoke(tripId: string, code: string, actorUserId: string): Promise<void> {
    await assertTripAdmin(this.prisma, tripId, actorUserId);
    const existing = await this.requireLink(tripId, code);
    await this.prisma.tripShare.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Stop every link on the trip, in one write.
   *
   * This is the route that existed before the tenth amendment, keeping exactly the meaning
   * it always had — "stop sharing this trip". With several links live it is also the only
   * honest answer to someone who wants the sharing to stop *now*, which is why the sheet
   * surfaces it separately rather than asking them to visit three rows.
   */
  async revokeAll(tripId: string, actorUserId: string): Promise<void> {
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

  /**
   * **The four facts a link preview says, and deliberately not the projection** (ADR-0220 §6).
   *
   * `byCode` above resolves the whole itinerary and runs the narrative generator on the way.
   * A preview needs the trip's name, destination and dates — and a crawler must not be able
   * to make us generate prose, which is the reason this is a separate method rather than a
   * projection the caller reads two fields off. `ItineraryNarrativeService` is deterministic
   * today (ADR-0213 §2 binds the port to the disabled generator), so this is guarding the
   * day it is not: the port exists precisely so a model can be swapped in behind it, and an
   * unauthenticated page that triggers one is an invoice with no session attached.
   *
   * A missing, revoked or rotated code is the same `NotFoundException` every public read
   * gives, so the shell cannot be used to ask whether a code exists.
   */
  async previewByCode(code: string): Promise<TripPreviewFacts> {
    const share = await this.projection.requireActiveShare(code);
    const [trip, travellers] = await this.prisma.$transaction([
      this.prisma.trip.findUniqueOrThrow({
        where: { id: share.tripId },
        select: { name: true, destination: true, startDate: true, endDate: true, icon: true },
      }),
      this.prisma.membership.count({ where: { tripId: share.tripId } }),
    ]);
    return {
      name: trip.name,
      destination: trip.destination,
      startDate: toDateOnly(trip.startDate),
      endDate: toDateOnly(trip.endDate),
      travellers,
      icon: trip.icon ?? undefined,
    };
  }

  /**
   * The PDF of exactly what the live link shows.
   *
   * It renders from the same projection the page consumes, resolved fresh — a snapshot of
   * the itinerary *now*, not of a cached response. There is deliberately no stored PDF: a
   * file that outlives a revocation is the thing the whole `no-store` posture exists to
   * prevent, and regenerating costs one render.
   */
  async pdf(code: string): Promise<{ buffer: Buffer; filename: string }> {
    const share = await this.projection.requireActiveShare(code);
    const projection = await this.projection.project(share);
    return {
      buffer: await this.pdfBrowser.render(projection, publicShareUrl(projection.shareUrl)),
      filename: `${projection.trip.name}.pdf`,
    };
  }

  private async requireLink(tripId: string, code: string): Promise<{ id: string }> {
    const existing = await this.prisma.tripShare.findFirst({
      where: { tripId, code, revokedAt: null },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('This link is not shared');
    return existing;
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

/**
 * The link as the PDF prints it: host and path, no scheme.
 *
 * The projection carries a root-relative path because the client owns the origin
 * (`lib/invite-link.ts`) — but a printed page has no client, so the server has to name the
 * host once. `PUBLIC_APP_HOST`, else the canonical host the deploy already knows about.
 */
function publicShareUrl(sharePath: string): string {
  const host = (process.env[FRONTEND_URL] ?? 'https://travelive.app').replace(/\/+$/, '');
  return `${host.replace(/^https?:\/\//, '').replace(/^www\./i, '')}${sharePath}`;
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Note as PrismaNote } from '@prisma/client';
import {
  ENTITY_TYPE,
  NOTE_SOURCE,
  type CreateNoteInput,
  type Note,
  type UpdateNoteInput,
} from '@waypoint/shared';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { assertNoteHostInTrip } from '../common/trip-scope.util';
import { ChangeService } from '../sync/change.service';
import { toNoteDto } from '../trips/trips.mapper';

/** Notes (ADR-0152). Every mutation goes through `ChangeService.mutate` — entity write and
 *  `Change` insert in one transaction, broadcast after commit (ADR-0019) — so a peer hears
 *  about a note the same way it hears about everything else.
 *
 *  **What this service deliberately does NOT do: clean up after a deleted host.** The five
 *  host FKs are `onDelete: Cascade`, so Postgres already removes the rows; emitting a
 *  `Change` per cascaded note here would mean loading them before every host delete, in
 *  five services. The clients are told by one rule in the ADR-0094 appliers keyed off
 *  `NOTE_HOST_FIELD` instead — the cascade is the storage guarantee, the applier rule is
 *  the sync one (ADR-0152 §2). */
@Injectable()
export class NotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly changes: ChangeService,
  ) {}

  async create(tripId: string, actorUserId: string, input: CreateNoteInput): Promise<Note> {
    // The host is a client-supplied id, so it is scoped before it is written — a foreign
    // one would be a note whose host its readers can never see (B-06's class of bug).
    await assertNoteHostInTrip(this.prisma, tripId, input);
    const id = input.id ?? randomUUID();
    try {
      const { entity } = await this.changes.mutate({
        tripId,
        actorUserId,
        entityType: ENTITY_TYPE.NOTE,
        entityId: id,
        action: 'create',
        after: input,
        apply: (tx) =>
          tx.note.create({
            data: {
              id,
              tripId,
              title: input.title,
              body: input.body,
              url: input.url,
              // Absent on a hosted note by design: resolved from the host at render, never
              // copied at write time (ADR-0152 §5's amendment).
              category: input.category,
              eventId: input.eventId,
              bookingId: input.bookingId,
              placeId: input.placeId,
              maybeItemId: input.maybeItemId,
              documentId: input.documentId,
              source: NOTE_SOURCE.MEMBER,
              createdBy: actorUserId,
              updatedBy: actorUserId,
            },
          }),
      });
      return toNoteDto(entity);
    } catch (err) {
      // The client-generated id makes an offline-outbox retry idempotent (as in
      // events/maybe-items): a duplicate id is "already applied", not an error. It matters
      // more here than elsewhere — a host save can queue several notes at once, so a
      // half-flushed queue is a normal state to re-enter.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return toNoteDto(await this.requireNote(tripId, id));
      }
      throw err;
    }
  }

  /** Edit a note's own words. The host is not editable (ADR-0153 §5 — attachment is
   *  established from the host's side and there is no picker to re-establish it with), and
   *  the patch is a whole-content submit, so an absent field clears rather than preserves. */
  async update(
    tripId: string,
    noteId: string,
    input: UpdateNoteInput,
    actorUserId: string,
  ): Promise<Note> {
    const before = await this.requireNote(tripId, noteId);
    // A conversion may be moving this note to a new host (ADR-0152 §5's 2026-08-01
    // amendment), and a foreign one would be a note its readers can never see — the same
    // check `create` runs, for the same reason.
    await assertNoteHostInTrip(this.prisma, tripId, input);
    const { entity } = await this.changes.mutate({
      tripId,
      actorUserId,
      entityType: ENTITY_TYPE.NOTE,
      entityId: noteId,
      action: 'update',
      before: toNoteDto(before),
      after: input,
      apply: (tx) =>
        tx.note.update({
          where: { id: noteId },
          data: {
            title: input.title ?? null,
            body: input.body ?? null,
            url: input.url ?? null,
            category: input.category ?? null,
            // **`undefined` here means UNTOUCHED, and that is the whole contract** — Prisma
            // omits an undefined field from the UPDATE, so an ordinary edit (which sends no
            // host at all) cannot lose the note's host, while a conversion sends the new one
            // and `null` for the old. The content fields above deliberately read the other
            // way (absent = cleared); the asymmetry is stated on the schema.
            eventId: input.eventId,
            bookingId: input.bookingId,
            placeId: input.placeId,
            maybeItemId: input.maybeItemId,
            documentId: input.documentId,
            updatedBy: actorUserId,
          },
        }),
    });
    return toNoteDto(entity);
  }

  /** Deleting a note destroys a sentence, not a plan — Tier 2 by ADR-0025's blast-radius
   *  framework but ungated, behind an inline confirm rather than a Plan-mode escape
   *  (ADR-0153 §9). ADR-0011's hard-commitment guard does not reach it. */
  async remove(tripId: string, noteId: string, actorUserId: string): Promise<void> {
    const before = await this.requireNote(tripId, noteId);
    await this.changes.mutate({
      tripId,
      actorUserId,
      entityType: ENTITY_TYPE.NOTE,
      entityId: noteId,
      action: 'delete',
      before: toNoteDto(before),
      apply: (tx) => tx.note.delete({ where: { id: noteId } }),
    });
  }

  private async requireNote(tripId: string, noteId: string): Promise<PrismaNote> {
    const note = await this.prisma.note.findFirst({ where: { id: noteId, tripId } });
    if (!note) throw new NotFoundException('Note not found');
    return note;
  }
}

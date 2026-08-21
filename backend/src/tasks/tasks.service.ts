import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Task as PrismaTask } from '@prisma/client';
import {
  ENTITY_TYPE,
  TASK_STATUS,
  TASK_SUBTASK_CAP,
  subtaskPatchRefuses,
  type CreateTaskInput,
  type Task,
  type UpdateTaskInput,
} from '@waypoint/shared';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { assertEntityRefsInTrip, assertMemberInTrip } from '../common/trip-scope.util';
import { ChangeService } from '../sync/change.service';
import { toTaskDto } from '../trips/trips.mapper';

/** Tasks (tasks brief, ADR-0188). `NotesService`'s shape, because this is that feature's
 *  sibling: every mutation goes through `ChangeService.mutate` — entity write and `Change`
 *  insert in one transaction, broadcast after commit (ADR-0019).
 *
 *  **The same deliberate omission notes make: no cleanup after a deleted host.** The five
 *  host FKs are `onDelete: Cascade`, so Postgres removes the rows and the clients are told
 *  by one applier rule keyed off `TASK_HOST_FIELD` instead (ADR-0152 §2, ADR-0157 §3).
 *  Nothing hosts a task until phase 4; the columns and the discipline ship together. */
@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly changes: ChangeService,
  ) {}

  async create(tripId: string, actorUserId: string, input: CreateTaskInput): Promise<Task> {
    await assertEntityRefsInTrip(this.prisma, tripId, input);
    await assertMemberInTrip(this.prisma, tripId, input.assigneeUserId);
    await this.assertParent(tripId, input.parentTaskId);
    const id = input.id ?? randomUUID();
    try {
      // `mutate<PrismaTask>` explicitly: with two unannotated closures the compiler has
      // nothing to infer `T` from and both land on `unknown` — the trap `ChangePayload`'s
      // own comment records.
      const { entity } = await this.changes.mutate<PrismaTask>({
        tripId,
        actorUserId,
        entityType: ENTITY_TYPE.TASK,
        entityId: id,
        action: 'create',
        // **The ROW, not the input** (owner, 2026-08-19: a peer's fresh sub-task arrived
        // ticked). A peer merges `after` over whatever it already holds, and on a create it
        // holds nothing — so an `after` that is the INPUT delivers a row missing every field
        // the server defaults. For a task that includes `status`, and `isSettled` read the
        // absence as settled: the step rendered struck through with a green ✓, counted as done
        // in its parent's fraction, and vanished from `שלי`, until a reload replaced it with
        // the real row. `mutate` already takes a function of the applied entity for exactly
        // this; `bookings.service` already sends a DTO the same way.
        after: (entity) => toTaskDto(entity),
        apply: (tx) =>
          tx.task.create({
            data: {
              id,
              tripId,
              title: input.title,
              body: input.body,
              dueAt: input.dueAt ? new Date(input.dueAt) : null,
              dueHasTime: input.dueHasTime ?? false,
              displayTimezone: input.displayTimezone,
              assigneeUserId: input.assigneeUserId,
              ...assignmentStamp(null, input.assigneeUserId, actorUserId),
              important: input.important ?? false,
              derivedKey: input.derivedKey,
              parentTaskId: input.parentTaskId,
              // Set only when the create IS the settling act — dismissing a readiness check
              // that had no row until this press (brief §4). `open` for every manual task.
              status: input.status ?? TASK_STATUS.OPEN,
              settledAt: input.status && input.status !== TASK_STATUS.OPEN ? new Date() : null,
              settledBy: input.status && input.status !== TASK_STATUS.OPEN ? actorUserId : null,
              eventId: input.eventId,
              bookingId: input.bookingId,
              placeId: input.placeId,
              maybeItemId: input.maybeItemId,
              documentId: input.documentId,
              createdBy: actorUserId,
              updatedBy: actorUserId,
            },
          }),
      });
      return toTaskDto(entity);
    } catch (err) {
      // A client-generated id makes an offline-outbox retry idempotent (notes, events,
      // maybe-items): a duplicate id is "already applied", not an error.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return toTaskDto(await this.requireTask(tripId, id));
      }
      throw err;
    }
  }

  /** Edit a task, settle it, or both. **The patch is sparse throughout, and clearing a
   *  field is an explicit `null`** — which is where it parts company with `updateNoteSchema`
   *  and the reason is that a task has two edit surfaces where a note has one. The tick and
   *  the `⋯` sheet settle a task without opening its editor, so they send `status` and
   *  nothing else; under the note's "absent means cleared" rule one tick would erase the
   *  task's own words and its deadline. */
  async update(
    tripId: string,
    taskId: string,
    input: UpdateTaskInput,
    actorUserId: string,
  ): Promise<Task> {
    const before = await this.requireTask(tripId, taskId);
    // **A step is its title, its assignee and its status** (ADR-0196 §8). The schema cannot
    // enforce this: a sparse patch does not say whether its target is a step, so only here,
    // where the row is loaded, can a deadline or a host arriving on one be refused.
    if (before.parentTaskId && subtaskPatchRefuses(input)) {
      throw new BadRequestException('A sub-task carries only a title and an assignee');
    }
    await assertEntityRefsInTrip(this.prisma, tripId, input);
    await assertMemberInTrip(this.prisma, tripId, input.assigneeUserId);
    const { entity } = await this.changes.mutate({
      tripId,
      actorUserId,
      entityType: ENTITY_TYPE.TASK,
      entityId: taskId,
      action: 'update',
      before: toTaskDto(before),
      after: input,
      apply: (tx) =>
        tx.task.update({
          where: { id: taskId },
          data: {
            // **Every field here is untouched when absent** — Prisma omits an `undefined`
            // from the UPDATE — so a settle that sends only `status` cannot reach the
            // task's words, its deadline or its host. The editor sends an explicit `null`
            // for what it cleared, which is what makes "no deadline any more" expressible
            // without making "I only ticked it" destructive.
            title: input.title,
            body: input.body,
            ...(input.dueAt !== undefined && {
              dueAt: input.dueAt ? new Date(input.dueAt) : null,
            }),
            dueHasTime: input.dueHasTime,
            // `null` un-pins back to derived, which is why the schema types it `nullish`
            // and why this is a plain assignment: `undefined` leaves it alone, `null`
            // clears it. Same shape `dueAt` above needs for the same reason.
            displayTimezone: input.displayTimezone,
            assigneeUserId: input.assigneeUserId,
            ...assignmentStamp(before.assigneeUserId, input.assigneeUserId, actorUserId),
            important: input.important,
            ...settlement(input.status, actorUserId),
            eventId: input.eventId,
            bookingId: input.bookingId,
            placeId: input.placeId,
            maybeItemId: input.maybeItemId,
            documentId: input.documentId,
            updatedBy: actorUserId,
          },
        }),
    });
    return toTaskDto(entity);
  }

  /** Deleting a task destroys a sentence, not a plan — Tier 2 by ADR-0025's blast-radius
   *  framework but ungated, behind an inline confirm (brief §9). ADR-0011's hard-commitment
   *  guard does not reach it. */
  async remove(tripId: string, taskId: string, actorUserId: string): Promise<void> {
    const before = await this.requireTask(tripId, taskId);
    await this.changes.mutate({
      tripId,
      actorUserId,
      entityType: ENTITY_TYPE.TASK,
      entityId: taskId,
      action: 'delete',
      before: toTaskDto(before),
      apply: (tx) => tx.task.delete({ where: { id: taskId } }),
    });
  }

  /** **The three things a parent must be** (ADR-0196 §1), answered in one query because they
   *  are one row's worth of facts: it is in this trip, it is not itself a step (the depth
   *  cap), and it is not already full.
   *
   *  Not folded into `assertEntityRefsInTrip`, and the reason is that it asks a different
   *  question: that util answers "does this ref exist in the trip", which is one of the three
   *  here. Putting the other two behind it would make a generic guard carry a rule about one
   *  entity's shape — and it would still need this query, so the sharing would buy nothing.
   *
   *  **The cap is enforced server-side or it is not enforced.** A client-only limit is one an
   *  offline outbox replays past, and a checklist that grew to 40 while a phone was in a
   *  tunnel is not a state any surface is drawn for. */
  private async assertParent(tripId: string, parentTaskId: string | undefined): Promise<void> {
    if (!parentTaskId) return;
    const parent = await this.prisma.task.findFirst({
      where: { id: parentTaskId, tripId },
      select: { id: true, parentTaskId: true, _count: { select: { subtasks: true } } },
    });
    if (!parent) throw new BadRequestException(`Unknown task for this trip: ${parentTaskId}`);
    if (parent.parentTaskId) throw new BadRequestException('A sub-task cannot have sub-tasks');
    if (parent._count.subtasks >= TASK_SUBTASK_CAP) {
      throw new BadRequestException(`A task holds at most ${TASK_SUBTASK_CAP} sub-tasks`);
    }
  }

  private async requireTask(tripId: string, taskId: string): Promise<PrismaTask> {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, tripId } });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }
}

/** Who settled a task and when, derived from the status the caller sent rather than
 *  trusted from it — a client that posted its own `settledAt` could date a completion
 *  before the trip. Reopening clears both, so a task that comes back is open with no
 *  residue of the tick that closed it. */
/**
 * **When `assignedAt` moves, and when it must not** (ADR-0198 §2, `task.assigned`).
 *
 * The column exists because being assigned is a TRANSITION, and ADR-0197 §3's sweep derives
 * everything from state — no combination of `updatedAt` and `assigneeUserId` can tell "you
 * were just assigned this" from "somebody fixed a typo in the title". So the fact is
 * recorded here, where the actor is known, and the send stays derived.
 *
 * Three answers, and the middle one is the load-bearing one:
 *
 * - **The assignee did not change** → `{}`, so an edit to anything else cannot re-announce
 *   an assignment somebody already heard about.
 * - **Self-assigned, or un-assigned** → `null`. This is ADR-0198's "when the actor is not
 *   the assignee" rule applied *here*, where the actor is actually known, rather than left
 *   for the sweep to infer from `updatedBy` — which would be a guess that goes wrong the
 *   moment a third person edits the row inside the window. Un-assigning also RETRACTS a
 *   send that has not gone out yet, which is the honest behaviour.
 * - **Somebody else was put on it** → now.
 */
export function assignmentStamp(
  before: string | null,
  patch: string | null | undefined,
  actorUserId: string,
): { assignedAt?: Date | null } {
  if (patch === undefined || patch === before) return {};
  if (patch === null || patch === actorUserId) return { assignedAt: null };
  return { assignedAt: new Date() };
}

function settlement(
  status: UpdateTaskInput['status'],
  actorUserId: string,
): Pick<Prisma.TaskUncheckedUpdateInput, 'status' | 'settledAt' | 'settledBy'> {
  if (status === undefined) return {};
  if (status === TASK_STATUS.OPEN) return { status, settledAt: null, settledBy: null };
  return { status, settledAt: new Date(), settledBy: actorUserId };
}

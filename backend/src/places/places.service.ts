import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Place as PrismaPlace } from '@prisma/client';
import {
  ENTITY_TYPE,
  type CreatePlaceInput,
  type Place,
  type UpdatePlaceInput,
} from '@waypoint/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ChangeService } from '../sync/change.service';
import { toPlaceDto } from '../trips/trips.mapper';

@Injectable()
export class PlacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly changes: ChangeService,
  ) {}

  async list(tripId: string): Promise<Place[]> {
    const places = await this.prisma.place.findMany({
      where: { tripId },
      orderBy: { createdAt: 'asc' },
    });
    return places.map(toPlaceDto);
  }

  async create(tripId: string, actorUserId: string, input: CreatePlaceInput): Promise<Place> {
    const id = input.id ?? randomUUID();
    try {
      const { entity } = await this.changes.mutate({
        tripId,
        actorUserId,
        entityType: ENTITY_TYPE.PLACE,
        entityId: id,
        action: 'create',
        after: input,
        apply: (tx) =>
          tx.place.create({
            data: {
              id,
              tripId,
              name: input.name,
              googlePlaceId: input.googlePlaceId,
              address: input.address,
              lat: input.lat,
              lng: input.lng,
              updatedBy: actorUserId,
            },
          }),
      });
      return toPlaceDto(entity);
    } catch (err) {
      // Client-generated id (ADR-0018): an offline-outbox retry re-POSTs the same id;
      // treat the unique-constraint hit as "already applied" (sync-and-offline.md).
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return toPlaceDto(await this.requirePlace(tripId, id));
      }
      throw err;
    }
  }

  async update(
    tripId: string,
    placeId: string,
    actorUserId: string,
    input: UpdatePlaceInput,
  ): Promise<Place> {
    const before = await this.requirePlace(tripId, placeId);
    const { entity } = await this.changes.mutate({
      tripId,
      actorUserId,
      entityType: ENTITY_TYPE.PLACE,
      entityId: placeId,
      action: 'update',
      before: toPlaceDto(before),
      after: input,
      apply: (tx) =>
        tx.place.update({
          where: { id: placeId },
          data: {
            ...(input.name !== undefined && { name: input.name }),
            ...(input.googlePlaceId !== undefined && { googlePlaceId: input.googlePlaceId }),
            ...(input.address !== undefined && { address: input.address }),
            ...(input.lat !== undefined && { lat: input.lat }),
            ...(input.lng !== undefined && { lng: input.lng }),
            updatedBy: actorUserId,
          },
        }),
    });
    return toPlaceDto(entity);
  }

  private async requirePlace(tripId: string, placeId: string): Promise<PrismaPlace> {
    const place = await this.prisma.place.findFirst({ where: { id: placeId, tripId } });
    if (!place) throw new NotFoundException('Place not found');
    return place;
  }
}

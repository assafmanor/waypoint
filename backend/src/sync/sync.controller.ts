import { BadRequestException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { changeSchema, type Change } from '@waypoint/shared';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { PrismaService } from '../prisma/prisma.service';
import { MembershipGuard } from '../trips/membership.guard';
import { toChangeDto } from './change.mapper';

class ChangeDto extends createZodDto(changeSchema) {}

@ApiTags('sync')
@Controller('trips/:tripId/changes')
@UseGuards(MembershipGuard)
export class SyncController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOkResponse({ type: [ChangeDto] })
  @ZodSerializerDto([ChangeDto])
  async list(
    @Param('tripId') tripId: string,
    @Query('sinceSeq') sinceSeqParam = '0',
  ): Promise<Change[]> {
    if (!/^\d+$/.test(sinceSeqParam)) {
      throw new BadRequestException('sinceSeq must be a non-negative integer');
    }
    const rows = await this.prisma.change.findMany({
      where: { tripId, seq: { gt: BigInt(sinceSeqParam) } },
      orderBy: { seq: 'asc' },
    });
    return rows.map(toChangeDto);
  }
}

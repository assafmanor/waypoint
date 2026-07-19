import { BadRequestException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { changeSchema, CHANGES_PAGE_LIMIT, type Change } from '@waypoint/shared';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { PrismaService } from '../prisma/prisma.service';
import { MembershipGuard } from '../trips/membership.guard';
import { toChangeDto } from './change.mapper';

class ChangeDto extends createZodDto(changeSchema) {}

@ApiTags('sync')
@ApiBearerAuth()
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
    // Bounded page (B-09): a very old / reset cursor won't stream the whole log in
    // one response. The client keeps fetching with the last seq until a short page
    // signals it has caught up (CHANGES_PAGE_LIMIT is shared so both ends agree).
    const rows = await this.prisma.change.findMany({
      where: { tripId, seq: { gt: BigInt(sinceSeqParam) } },
      orderBy: { seq: 'asc' },
      take: CHANGES_PAGE_LIMIT,
    });
    return rows.map(toChangeDto);
  }
}

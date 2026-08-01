import { Body, Controller, Delete, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { createNoteSchema, noteSchema, updateNoteSchema, type Note } from '@waypoint/shared';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { CurrentUser } from '../auth/current-user.decorator';
import type { Principal } from '../auth/principal';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { MembershipGuard } from '../trips/membership.guard';
import { NotesService } from './notes.service';

// ADR-0023: OpenAPI DTOs generated from the @waypoint/shared zod schemas.
class NoteDto extends createZodDto(noteSchema) {}
class CreateNoteDto extends createZodDto(createNoteSchema) {}
class UpdateNoteDto extends createZodDto(updateNoteSchema) {}

@ApiTags('notes')
@ApiBearerAuth()
@Controller('trips/:tripId/notes')
@UseGuards(MembershipGuard)
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Post()
  @ApiCreatedResponse({ type: NoteDto })
  @ZodSerializerDto(NoteDto)
  create(
    @CurrentUser() user: Principal,
    @Param('tripId') tripId: string,
    @Body(new ZodValidationPipe(createNoteSchema)) body: CreateNoteDto,
  ): Promise<Note> {
    return this.notes.create(tripId, user.userId, body);
  }

  @Patch(':noteId')
  @ApiOkResponse({ type: NoteDto })
  @ZodSerializerDto(NoteDto)
  update(
    @CurrentUser() user: Principal,
    @Param('tripId') tripId: string,
    @Param('noteId') noteId: string,
    @Body(new ZodValidationPipe(updateNoteSchema)) body: UpdateNoteDto,
  ): Promise<Note> {
    return this.notes.update(tripId, noteId, body, user.userId);
  }

  @Delete(':noteId')
  @HttpCode(204)
  @ApiNoContentResponse()
  remove(
    @CurrentUser() user: Principal,
    @Param('tripId') tripId: string,
    @Param('noteId') noteId: string,
  ): Promise<void> {
    return this.notes.remove(tripId, noteId, user.userId);
  }
}

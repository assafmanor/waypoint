import { Body, Controller, Delete, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiNoContentResponse, ApiTags } from '@nestjs/swagger';
import {
  createDocumentAttachmentSchema,
  documentAttachmentSchema,
  type DocumentAttachment,
} from '@waypoint/shared';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { CurrentUser } from '../auth/current-user.decorator';
import type { Principal } from '../auth/principal';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { MembershipGuard } from '../trips/membership.guard';
import { DocumentAttachmentsService } from './document-attachments.service';

// ADR-0023: OpenAPI DTOs generated from the @waypoint/shared zod schemas.
class DocumentAttachmentDto extends createZodDto(documentAttachmentSchema) {}
class CreateDocumentAttachmentDto extends createZodDto(createDocumentAttachmentSchema) {}

/** Attach and detach — no `PATCH`, deliberately: a link carries nothing to edit, and moving
 *  a document from one host to another is a detach and an attach (ADR-0173 §1). */
@ApiTags('document-attachments')
@ApiBearerAuth()
@Controller('trips/:tripId/document-attachments')
@UseGuards(MembershipGuard)
export class DocumentAttachmentsController {
  constructor(private readonly attachments: DocumentAttachmentsService) {}

  @Post()
  @ApiCreatedResponse({ type: DocumentAttachmentDto })
  @ZodSerializerDto(DocumentAttachmentDto)
  create(
    @CurrentUser() user: Principal,
    @Param('tripId') tripId: string,
    @Body(new ZodValidationPipe(createDocumentAttachmentSchema)) body: CreateDocumentAttachmentDto,
  ): Promise<DocumentAttachment> {
    return this.attachments.create(tripId, user.userId, body);
  }

  @Delete(':attachmentId')
  @HttpCode(204)
  @ApiNoContentResponse()
  remove(
    @CurrentUser() user: Principal,
    @Param('tripId') tripId: string,
    @Param('attachmentId') attachmentId: string,
  ): Promise<void> {
    return this.attachments.remove(tripId, attachmentId, user.userId);
  }
}

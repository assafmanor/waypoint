import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  createDocumentSchema,
  documentSummarySchema,
  MAX_DOCUMENT_SIZE_BYTES,
  tripDocumentSchema,
  updateDocumentSchema,
  type DocumentSummary,
  type TripDocument,
} from '@waypoint/shared';
import type { Response } from 'express';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { CurrentUser } from '../auth/current-user.decorator';
import type { Principal } from '../auth/principal';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { MembershipGuard } from '../trips/membership.guard';
import { DocumentsService } from './documents.service';

// ADR-0023: OpenAPI DTOs generated from the @waypoint/shared zod schemas.
class CreateDocumentDto extends createZodDto(createDocumentSchema) {}
class UpdateDocumentDto extends createZodDto(updateDocumentSchema) {}
class DocumentSummaryDto extends createZodDto(documentSummarySchema) {}
class DocumentDto extends createZodDto(tripDocumentSchema) {}

@ApiTags('documents')
@ApiBearerAuth()
@Controller('trips/:tripId/documents')
@UseGuards(MembershipGuard)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  @ApiOkResponse({ type: [DocumentSummaryDto] })
  @ZodSerializerDto([DocumentSummaryDto])
  list(@Param('tripId') tripId: string): Promise<DocumentSummary[]> {
    return this.documents.list(tripId);
  }

  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiCreatedResponse({ type: DocumentDto })
  @ZodSerializerDto(DocumentDto)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_DOCUMENT_SIZE_BYTES } }))
  create(
    @CurrentUser() user: Principal,
    @Param('tripId') tripId: string,
    @Body(new ZodValidationPipe(createDocumentSchema)) body: CreateDocumentDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<TripDocument> {
    if (!file) {
      throw new BadRequestException({
        error: { code: 'VALIDATION_ERROR', message: 'file is required' },
      });
    }
    return this.documents.create(tripId, user.userId, body, file);
  }

  @Patch(':documentId')
  @ApiConsumes('multipart/form-data')
  @ApiOkResponse({ type: DocumentDto })
  @ZodSerializerDto(DocumentDto)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_DOCUMENT_SIZE_BYTES } }))
  update(
    @CurrentUser() user: Principal,
    @Param('tripId') tripId: string,
    @Param('documentId') documentId: string,
    @Body(new ZodValidationPipe(updateDocumentSchema)) body: UpdateDocumentDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<TripDocument> {
    return this.documents.update(tripId, user.userId, documentId, body, file);
  }

  @Delete(':documentId')
  @HttpCode(204)
  @ApiNoContentResponse()
  async remove(
    @CurrentUser() user: Principal,
    @Param('tripId') tripId: string,
    @Param('documentId') documentId: string,
  ): Promise<void> {
    await this.documents.remove(tripId, user.userId, documentId);
  }

  @Get(':documentId/content')
  async getContent(
    @Param('tripId') tripId: string,
    @Param('documentId') documentId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, mimeType, title } = await this.documents.getContent(tripId, documentId);
    // Always download, never inline-render: a document is caller-uploaded bytes with
    // a caller-declared type, so serving it inline is a same-origin script-execution
    // path (backend-review B-03). `nosniff` stops the browser from re-interpreting
    // the bytes as a more dangerous type than declared.
    res.setHeader('Content-Type', mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', attachmentDisposition(title));
    res.send(buffer);
  }
}

/** RFC 6266/5987 `attachment` disposition. Titles are Hebrew (non-ASCII), so the
 *  Unicode name rides `filename*` (percent-encoded, header-injection-safe by
 *  construction) with an ASCII `filename` fallback. */
function attachmentDisposition(title: string): string {
  const asciiFallback =
    title
      .replace(/[^\x20-\x7e]/g, '_')
      .replace(/["\\]/g, '_')
      .trim() || 'document';
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(title)}`;
}

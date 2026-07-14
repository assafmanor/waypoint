import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
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
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  createDocumentSchema,
  documentSummarySchema,
  MAX_DOCUMENT_SIZE_BYTES,
  tripDocumentSchema,
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

  @Get(':documentId/content')
  async getContent(
    @Param('tripId') tripId: string,
    @Param('documentId') documentId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, mimeType } = await this.documents.getContent(tripId, documentId);
    res.setHeader('Content-Type', mimeType);
    res.send(buffer);
  }
}

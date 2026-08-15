import { Body, Controller, Delete, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { createTaskSchema, taskSchema, updateTaskSchema, type Task } from '@waypoint/shared';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { CurrentUser } from '../auth/current-user.decorator';
import type { Principal } from '../auth/principal';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { MembershipGuard } from '../trips/membership.guard';
import { TasksService } from './tasks.service';

// ADR-0023: OpenAPI DTOs generated from the @waypoint/shared zod schemas.
class TaskDto extends createZodDto(taskSchema) {}
class CreateTaskDto extends createZodDto(createTaskSchema) {}
class UpdateTaskDto extends createZodDto(updateTaskSchema) {}

@ApiTags('tasks')
@ApiBearerAuth()
@Controller('trips/:tripId/tasks')
@UseGuards(MembershipGuard)
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Post()
  @ApiCreatedResponse({ type: TaskDto })
  @ZodSerializerDto(TaskDto)
  create(
    @CurrentUser() user: Principal,
    @Param('tripId') tripId: string,
    @Body(new ZodValidationPipe(createTaskSchema)) body: CreateTaskDto,
  ): Promise<Task> {
    return this.tasks.create(tripId, user.userId, body);
  }

  @Patch(':taskId')
  @ApiOkResponse({ type: TaskDto })
  @ZodSerializerDto(TaskDto)
  update(
    @CurrentUser() user: Principal,
    @Param('tripId') tripId: string,
    @Param('taskId') taskId: string,
    @Body(new ZodValidationPipe(updateTaskSchema)) body: UpdateTaskDto,
  ): Promise<Task> {
    return this.tasks.update(tripId, taskId, body, user.userId);
  }

  @Delete(':taskId')
  @HttpCode(204)
  @ApiNoContentResponse()
  remove(
    @CurrentUser() user: Principal,
    @Param('tripId') tripId: string,
    @Param('taskId') taskId: string,
  ): Promise<void> {
    return this.tasks.remove(tripId, taskId, user.userId);
  }
}

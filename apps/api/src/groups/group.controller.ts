import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  CurrentUser,
  type JwtUser,
} from '../auth/decorators/current-user.decorator.js';
import {
  CreateFinanceGroupDto,
  FinanceGroupDto,
  FinanceGroupSummaryDto,
  UpdateFinanceGroupDto,
} from './dto/group.dto.js';
import { GroupService } from './group.service.js';

@ApiTags('groups')
@ApiCookieAuth()
@ApiUnauthorizedResponse()
@ApiBadRequestResponse()
@Controller('groups')
export class GroupController {
  constructor(private readonly groupService: GroupService) {}

  @Get()
  @ApiOkResponse({ type: [FinanceGroupSummaryDto] })
  list(@CurrentUser() user: JwtUser): Promise<FinanceGroupSummaryDto[]> {
    return this.groupService.list(user.id);
  }

  @Post()
  @ApiCreatedResponse({ type: FinanceGroupDto })
  create(
    @CurrentUser() user: JwtUser,
    @Body() body: CreateFinanceGroupDto,
  ): Promise<FinanceGroupDto> {
    return this.groupService.create(user.id, body);
  }

  @Get(':id')
  @ApiOkResponse({ type: FinanceGroupDto })
  @ApiNotFoundResponse({ description: 'Not an active member of the group' })
  get(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<FinanceGroupDto> {
    return this.groupService.get(user.id, id);
  }

  @Patch(':id')
  @ApiOkResponse({ type: FinanceGroupDto })
  @ApiNotFoundResponse()
  @ApiForbiddenResponse({ description: 'Only the owner' })
  update(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateFinanceGroupDto,
  ): Promise<FinanceGroupDto> {
    return this.groupService.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  @ApiForbiddenResponse({ description: 'Only the owner' })
  remove(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    return this.groupService.remove(user.id, id);
  }

  @Post(':id/leave')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({
    description: 'Access ends; the last member out deletes the group',
  })
  @ApiNotFoundResponse()
  leave(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    return this.groupService.leave(user.id, id);
  }

  @Delete(':id/members/:memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  @ApiForbiddenResponse({ description: 'Only the owner' })
  removeMember(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('memberId', ParseIntPipe) memberId: number,
  ): Promise<void> {
    return this.groupService.removeMember(user.id, id, memberId);
  }
}

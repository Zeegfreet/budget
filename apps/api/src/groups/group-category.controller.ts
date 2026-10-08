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
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
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
  CreateGroupCategoryDto,
  GroupCategoryDto,
  UpdateGroupCategoryDto,
} from './dto/group-category.dto.js';
import { GroupCategoryService } from './group-category.service.js';

@ApiTags('groups')
@ApiCookieAuth()
@ApiUnauthorizedResponse()
@ApiBadRequestResponse()
@ApiNotFoundResponse()
@Controller('groups/:groupId/categories')
export class GroupCategoryController {
  constructor(private readonly groupCategoryService: GroupCategoryService) {}

  @Get()
  @ApiOkResponse({ type: [GroupCategoryDto] })
  list(
    @CurrentUser() user: JwtUser,
    @Param('groupId', ParseIntPipe) groupId: number,
  ): Promise<GroupCategoryDto[]> {
    return this.groupCategoryService.list(user.id, groupId);
  }

  @Post()
  @ApiCreatedResponse({ type: GroupCategoryDto })
  @ApiConflictResponse({ description: 'Name already used in this kind' })
  create(
    @CurrentUser() user: JwtUser,
    @Param('groupId', ParseIntPipe) groupId: number,
    @Body() body: CreateGroupCategoryDto,
  ): Promise<GroupCategoryDto> {
    return this.groupCategoryService.create(user.id, groupId, body);
  }

  @Patch(':id')
  @ApiOkResponse({ type: GroupCategoryDto })
  @ApiConflictResponse({ description: 'Name already used in this kind' })
  update(
    @CurrentUser() user: JwtUser,
    @Param('groupId', ParseIntPipe) groupId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateGroupCategoryDto,
  ): Promise<GroupCategoryDto> {
    return this.groupCategoryService.update(user.id, groupId, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  remove(
    @CurrentUser() user: JwtUser,
    @Param('groupId', ParseIntPipe) groupId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    return this.groupCategoryService.remove(user.id, groupId, id);
  }
}

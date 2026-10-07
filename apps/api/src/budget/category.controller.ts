import {
  Body,
  Controller,
  Delete,
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
import { CategoryService } from './category.service.js';
import { CategoryDto, CategoryGroupDto } from './dto/budget-responses.dto.js';
import {
  CreateCategoryDto,
  CreateGroupDto,
  UpdateCategoryDto,
  UpdateGroupDto,
} from './dto/category.dto.js';

@ApiTags('budget')
@ApiCookieAuth()
@ApiUnauthorizedResponse()
@ApiBadRequestResponse()
@Controller('budget')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Post('groups')
  @ApiCreatedResponse({ type: CategoryGroupDto })
  @ApiConflictResponse({ description: 'Name already used in this kind' })
  createGroup(
    @CurrentUser() user: JwtUser,
    @Body() body: CreateGroupDto,
  ): Promise<CategoryGroupDto> {
    return this.categoryService.createGroup(user.id, body);
  }

  @Patch('groups/:id')
  @ApiOkResponse({ type: CategoryGroupDto })
  @ApiNotFoundResponse()
  @ApiConflictResponse()
  updateGroup(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateGroupDto,
  ): Promise<CategoryGroupDto> {
    return this.categoryService.updateGroup(user.id, id, body);
  }

  @Delete('groups/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Deletes its categories and values' })
  @ApiNotFoundResponse()
  deleteGroup(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    return this.categoryService.deleteGroup(user.id, id);
  }

  @Post('groups/:id/categories')
  @ApiCreatedResponse({ type: CategoryDto })
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'Name already used in this type' })
  createCategory(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) groupId: number,
    @Body() body: CreateCategoryDto,
  ): Promise<CategoryDto> {
    return this.categoryService.createCategory(user.id, groupId, body);
  }

  @Patch('categories/:id')
  @ApiOkResponse({ type: CategoryDto })
  @ApiNotFoundResponse()
  @ApiConflictResponse()
  updateCategory(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateCategoryDto,
  ): Promise<CategoryDto> {
    return this.categoryService.updateCategory(user.id, id, body);
  }

  @Delete('categories/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Deletes its values' })
  @ApiNotFoundResponse()
  deleteCategory(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    return this.categoryService.deleteCategory(user.id, id);
  }
}

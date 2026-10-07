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
  CreateSplitMethodDto,
  SplitMethodDto,
  UpdateSplitMethodDto,
} from './dto/split-method.dto.js';
import { SplitMethodService } from './split-method.service.js';

@ApiTags('groups')
@ApiCookieAuth()
@ApiUnauthorizedResponse()
@ApiBadRequestResponse()
@ApiNotFoundResponse()
@Controller('groups/:groupId/split-methods')
export class SplitMethodController {
  constructor(private readonly splitMethodService: SplitMethodService) {}

  @Get()
  @ApiOkResponse({ type: [SplitMethodDto] })
  list(
    @CurrentUser() user: JwtUser,
    @Param('groupId', ParseIntPipe) groupId: number,
  ): Promise<SplitMethodDto[]> {
    return this.splitMethodService.list(user.id, groupId);
  }

  @Post()
  @ApiCreatedResponse({ type: SplitMethodDto })
  @ApiConflictResponse({ description: 'Name already used in the group' })
  create(
    @CurrentUser() user: JwtUser,
    @Param('groupId', ParseIntPipe) groupId: number,
    @Body() body: CreateSplitMethodDto,
  ): Promise<SplitMethodDto> {
    return this.splitMethodService.create(user.id, groupId, body);
  }

  @Patch(':id')
  @ApiOkResponse({ type: SplitMethodDto })
  @ApiConflictResponse({ description: 'Name already used in the group' })
  update(
    @CurrentUser() user: JwtUser,
    @Param('groupId', ParseIntPipe) groupId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateSplitMethodDto,
  ): Promise<SplitMethodDto> {
    return this.splitMethodService.update(user.id, groupId, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  remove(
    @CurrentUser() user: JwtUser,
    @Param('groupId', ParseIntPipe) groupId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    return this.splitMethodService.remove(user.id, groupId, id);
  }
}

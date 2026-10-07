import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  CurrentUser,
  type JwtUser,
} from '../auth/decorators/current-user.decorator.js';
import { GroupStatementDto } from './dto/group-statement.dto.js';
import { SummaryQueryDto } from './dto/summary-query.dto.js';
import { GroupStatementService } from './group-statement.service.js';

@ApiTags('budget')
@ApiCookieAuth()
@ApiUnauthorizedResponse()
@Controller('budget/group-statements')
export class GroupStatementController {
  constructor(private readonly service: GroupStatementService) {}

  @Get()
  @ApiOkResponse({
    type: [GroupStatementDto],
    description: 'The user’s groups in the month, from their side',
  })
  @ApiBadRequestResponse()
  list(
    @CurrentUser() user: JwtUser,
    @Query() { month }: SummaryQueryDto,
  ): Promise<GroupStatementDto[]> {
    return this.service.list(user.id, month);
  }
}

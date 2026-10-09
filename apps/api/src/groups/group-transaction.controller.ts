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
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
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
  RecurrenceScopeQueryDto,
  SeriesEndDto,
} from '../budget/dto/transaction.dto.js';
import {
  CreateGroupTransactionDto,
  GroupBalanceDto,
  GroupTransactionDto,
  PaymentDto,
  SetSettlementDto,
  UpdateGroupTransactionDto,
} from './dto/group-transaction.dto.js';
import { GroupMonthQueryDto } from './dto/group.dto.js';
import { GroupTransactionService } from './group-transaction.service.js';

@ApiTags('groups')
@ApiCookieAuth()
@ApiUnauthorizedResponse()
@ApiBadRequestResponse()
@ApiNotFoundResponse()
@Controller('groups/:groupId')
export class GroupTransactionController {
  constructor(private readonly service: GroupTransactionService) {}

  @Get('transactions')
  @ApiOkResponse({ type: [GroupTransactionDto] })
  list(
    @CurrentUser() user: JwtUser,
    @Param('groupId', ParseIntPipe) groupId: number,
    @Query() { month }: GroupMonthQueryDto,
  ): Promise<GroupTransactionDto[]> {
    return this.service.list(user.id, groupId, month);
  }

  @Post('transactions')
  @ApiCreatedResponse({
    type: [GroupTransactionDto],
    description: 'One transaction per month of the recurrence',
  })
  create(
    @CurrentUser() user: JwtUser,
    @Param('groupId', ParseIntPipe) groupId: number,
    @Body() body: CreateGroupTransactionDto,
  ): Promise<GroupTransactionDto[]> {
    return this.service.create(user.id, groupId, body);
  }

  @Patch('transactions/:id')
  @ApiOkResponse({ type: GroupTransactionDto })
  @ApiConflictResponse({
    description:
      'New amount or rule for an item whose shares are confirmed as paid back',
  })
  update(
    @CurrentUser() user: JwtUser,
    @Param('groupId', ParseIntPipe) groupId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateGroupTransactionDto,
  ): Promise<GroupTransactionDto> {
    return this.service.update(user.id, groupId, id, body);
  }

  @Delete('transactions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  remove(
    @CurrentUser() user: JwtUser,
    @Param('groupId', ParseIntPipe) groupId: number,
    @Param('id', ParseIntPipe) id: number,
    @Query() { scope }: RecurrenceScopeQueryDto,
  ): Promise<void> {
    return this.service.remove(user.id, groupId, id, scope);
  }

  @Put('transactions/:id/series')
  @ApiOkResponse({
    type: [GroupTransactionDto],
    description: 'Every occurrence of the series after the change',
  })
  @ApiConflictResponse({
    description: 'A paid occurrence falls after the new end',
  })
  setSeriesEnd(
    @CurrentUser() user: JwtUser,
    @Param('groupId', ParseIntPipe) groupId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SeriesEndDto,
  ): Promise<GroupTransactionDto[]> {
    return this.service.setSeriesEnd(user.id, groupId, id, body);
  }

  @Put('transactions/:id/payment')
  @ApiOkResponse({ type: GroupTransactionDto })
  @ApiConflictResponse({
    description: 'Another payer while shares are confirmed as paid back',
  })
  pay(
    @CurrentUser() user: JwtUser,
    @Param('groupId', ParseIntPipe) groupId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() { memberId }: PaymentDto,
  ): Promise<GroupTransactionDto> {
    return this.service.setPayment(user.id, groupId, id, memberId);
  }

  @Delete('transactions/:id/payment')
  @ApiOkResponse({ type: GroupTransactionDto, description: 'Back to pending' })
  @ApiConflictResponse({ description: 'Shares are confirmed as paid back' })
  unpay(
    @CurrentUser() user: JwtUser,
    @Param('groupId', ParseIntPipe) groupId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<GroupTransactionDto> {
    return this.service.setPayment(user.id, groupId, id, null);
  }

  @Get('balance')
  @ApiOkResponse({ type: GroupBalanceDto })
  balance(
    @CurrentUser() user: JwtUser,
    @Param('groupId', ParseIntPipe) groupId: number,
    @Query() { month }: GroupMonthQueryDto,
  ): Promise<GroupBalanceDto> {
    return this.service.balance(user.id, groupId, month);
  }

  @Post('settlements')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({
    description: 'The shares are confirmed as paid back (or open again)',
  })
  @ApiForbiddenResponse({
    description:
      'Only who receives the money confirms: the payer of an expense, the share member of an income',
  })
  setSettlement(
    @CurrentUser() user: JwtUser,
    @Param('groupId', ParseIntPipe) groupId: number,
    @Body() body: SetSettlementDto,
  ): Promise<void> {
    return this.service.setSettlement(user.id, groupId, body);
  }
}

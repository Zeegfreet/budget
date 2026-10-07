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
import { RecurrenceScopeQueryDto } from '../budget/dto/transaction.dto.js';
import {
  CreateGroupTransactionDto,
  GroupBalanceDto,
  GroupTransactionDto,
  PaymentDto,
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

  @Put('transactions/:id/payment')
  @ApiOkResponse({ type: GroupTransactionDto })
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
}

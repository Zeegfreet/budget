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
  CreateTransactionDto,
  RealizationDto,
  RecurrenceScopeQueryDto,
  SeriesEndDto,
  TransactionDto,
  TransactionMonthQueryDto,
  UpdateTransactionDto,
} from './dto/transaction.dto.js';
import { TransactionService } from './transaction.service.js';

@ApiTags('budget')
@ApiCookieAuth()
@ApiUnauthorizedResponse()
@ApiBadRequestResponse()
@Controller('budget/transactions')
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  @Get()
  @ApiOkResponse({ type: [TransactionDto] })
  list(
    @CurrentUser() user: JwtUser,
    @Query() { month }: TransactionMonthQueryDto,
  ): Promise<TransactionDto[]> {
    return this.transactionService.list(user.id, month);
  }

  @Post()
  @ApiCreatedResponse({
    type: [TransactionDto],
    description: 'One transaction per month of the recurrence',
  })
  @ApiNotFoundResponse({ description: 'The category is not the user’s' })
  create(
    @CurrentUser() user: JwtUser,
    @Body() body: CreateTransactionDto,
  ): Promise<TransactionDto[]> {
    return this.transactionService.create(user.id, body);
  }

  @Patch(':id')
  @ApiOkResponse({ type: TransactionDto })
  @ApiNotFoundResponse()
  update(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateTransactionDto,
  ): Promise<TransactionDto> {
    return this.transactionService.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  remove(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Query() { scope }: RecurrenceScopeQueryDto,
  ): Promise<void> {
    return this.transactionService.remove(user.id, id, scope);
  }

  @Put(':id/series')
  @ApiOkResponse({
    type: [TransactionDto],
    description: 'Every occurrence of the series after the change',
  })
  @ApiNotFoundResponse()
  @ApiConflictResponse({
    description: 'A realized occurrence falls after the new end',
  })
  setSeriesEnd(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() { untilMonth }: SeriesEndDto,
  ): Promise<TransactionDto[]> {
    return this.transactionService.setSeriesEnd(user.id, id, untilMonth);
  }

  @Put(':id/realization')
  @ApiOkResponse({ type: TransactionDto })
  @ApiNotFoundResponse()
  realize(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() { amountCents }: RealizationDto,
  ): Promise<TransactionDto> {
    return this.transactionService.setRealized(user.id, id, amountCents);
  }

  @Delete(':id/realization')
  @ApiOkResponse({ type: TransactionDto, description: 'Back to pending' })
  @ApiNotFoundResponse()
  unrealize(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<TransactionDto> {
    return this.transactionService.setRealized(user.id, id, null);
  }
}

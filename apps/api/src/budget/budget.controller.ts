import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
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
import { BudgetService } from './budget.service.js';
import {
  BudgetLineDto,
  BudgetSummaryDto,
  CategoryGroupDto,
  MonthlyEntryDto,
} from './dto/budget-responses.dto.js';
import { InitialBalanceDto } from './dto/initial-balance.dto.js';
import { MonthRangeQueryDto } from './dto/month-range-query.dto.js';
import { SaveLinesDto } from './dto/save-lines.dto.js';
import { SummaryQueryDto } from './dto/summary-query.dto.js';

@ApiTags('budget')
@ApiCookieAuth()
@ApiUnauthorizedResponse()
@Controller('budget')
export class BudgetController {
  constructor(private readonly budgetService: BudgetService) {}

  @Get('categories')
  @ApiOkResponse({ type: [CategoryGroupDto] })
  categories(@CurrentUser() user: JwtUser): Promise<CategoryGroupDto[]> {
    return this.budgetService.categories(user.id);
  }

  @Get('entries')
  @ApiOkResponse({ type: [MonthlyEntryDto] })
  @ApiBadRequestResponse()
  entries(
    @CurrentUser() user: JwtUser,
    @Query() { from, to }: MonthRangeQueryDto,
  ): Promise<MonthlyEntryDto[]> {
    return this.budgetService.entries(user.id, from, to);
  }

  @Get('lines')
  @ApiOkResponse({ type: [BudgetLineDto] })
  @ApiBadRequestResponse()
  lines(
    @CurrentUser() user: JwtUser,
    @Query() { from, to }: MonthRangeQueryDto,
  ): Promise<BudgetLineDto[]> {
    return this.budgetService.lines(user.id, from, to);
  }

  @Put('lines')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiBadRequestResponse()
  @ApiNotFoundResponse({ description: 'A launch is not the user’s' })
  @ApiConflictResponse({
    description: 'The row has several transactions in the month',
  })
  saveLines(
    @CurrentUser() user: JwtUser,
    @Body() { cells }: SaveLinesDto,
  ): Promise<void> {
    return this.budgetService.saveLines(user.id, cells);
  }

  @Get('summary')
  @ApiOkResponse({ type: BudgetSummaryDto })
  @ApiBadRequestResponse()
  summary(
    @CurrentUser() user: JwtUser,
    @Query() { month }: SummaryQueryDto,
  ): Promise<BudgetSummaryDto> {
    return this.budgetService.summary(user.id, month);
  }

  @Put('initial-balance')
  @ApiOkResponse({ type: InitialBalanceDto })
  @ApiBadRequestResponse()
  setInitialBalance(
    @CurrentUser() user: JwtUser,
    @Body() { amountCents }: InitialBalanceDto,
  ): Promise<InitialBalanceDto> {
    return this.budgetService.setInitialBalance(user.id, amountCents);
  }
}
